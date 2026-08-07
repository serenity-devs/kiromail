import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { env } from "./config";
import { sql } from "./db";
import { getDataQueue } from "./queue";
import { validateListValues, type ListFieldDefinition } from "./list-fields";

export type ImportConfig={
  list_id:string;
  mapping?:Record<string,string>;
  delimiter?:","|";"|"\t";
  initial_status?:"active"|"pending";
  existing_policy?:"preserve"|"fill_empty"|"overwrite";
  update_unsubscribed?:boolean;
  source?:string;
  consent_text?:string;
  legal_basis?:string;
};

export type BulkContactsConfig={
  contact_ids:string[];
  action:"subscribe"|"unsubscribe"|"archive"|"block";
  list_id?:string;
  reactivate?:boolean;
  reason?:string;
};

type Job={id:string;type:"contacts_import"|"contacts_export"|"contacts_bulk";status:string;input:Record<string,unknown>;storage_key:string|null;cancel_requested:boolean};
const jobRoot=path.resolve(env.uploadDir,"jobs");

function safeJobPath(key:string){if(path.basename(key)!==key)throw new Error("Ruta de trabajo no válida");return path.join(jobRoot,key);}
function normalizeHeader(value:string){return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_");}
function delimiterFor(text:string,requested?:string){if(requested)return requested;const line=text.split(/\r?\n/,1)[0]??"";const candidates=[",",";","\t"] as const;return candidates.map(value=>({value,count:line.split(value).length})).sort((a,b)=>b.count-a.count)[0].value;}
function csvCell(value:unknown){const text=value===null||value===undefined?"":typeof value==="object"?JSON.stringify(value):String(value);return /[",\r\n;]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
function csvLine(values:unknown[]){return values.map(csvCell).join(",");}
function requestHash(buffer:Buffer,input:unknown){return createHash("sha256").update(buffer).update(JSON.stringify(input)).digest("hex");}

export async function storeJobUpload(buffer:Buffer,extension="csv"){
  await mkdir(jobRoot,{recursive:true});const key=`${randomUUID()}.${extension.replace(/[^a-z0-9]/gi,"").toLowerCase()||"dat"}`;await writeFile(safeJobPath(key),buffer);return key;
}

export function previewCsv(buffer:Buffer,delimiter?:string){
  if(buffer.length>5_000_000)throw new Error("La previsualización admite hasta 5 MB");const text=buffer.toString("utf8").replace(/^\uFEFF/,"");if(text.includes("\uFFFD"))throw new Error("El archivo no parece UTF-8 válido");const selected=delimiterFor(text,delimiter);
  const rows=parse(text,{columns:(headers:string[])=>headers.map(normalizeHeader),delimiter:selected,bom:true,skip_empty_lines:true,trim:true,to_line:21,relax_column_count:true}) as Record<string,string>[];
  const headers=rows.length?Object.keys(rows[0]):(parse(text,{to_line:1,delimiter:selected,bom:true})[0]??[]).map(normalizeHeader);
  const aliases:Record<string,string>={correo:"email",correo_electronico:"email",nombre:"first_name",apellidos:"last_name",telefono:"phone",ciudad:"city",pais:"country"};
  const suggested_mapping=Object.fromEntries(headers.map((header:string)=>[header,aliases[header]??(["email","first_name","last_name","phone","city","country","language","timezone"].includes(header)?header:"")]).filter(([,target])=>target));
  return{encoding:"utf-8",delimiter:selected,headers,rows,suggested_mapping};
}

export async function createImportJob(buffer:Buffer,filename:string,config:ImportConfig,idempotencyKey:string,principalId:string){
  if(!idempotencyKey.trim())throw new Error("Falta Idempotency-Key");if(buffer.length>50_000_000)throw new Error("El CSV supera 50 MB");
  const hash=requestHash(buffer,config);const scope=`import:${principalId}`;const[existing]=await sql<{id:string;request_hash:string}[]>`SELECT id,request_hash FROM background_jobs WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;
  if(existing){if(existing.request_hash!==hash)throw new Error("Idempotency-Key ya se usó con otro archivo o configuración");return{id:existing.id,duplicate:true};}
  const[list]=await sql<{id:string}[]>`SELECT id FROM lists WHERE id=${config.list_id} AND status='active'`;if(!list)throw new Error("La lista de destino no existe");
  const storageKey=await storeJobUpload(buffer,"csv");const stored=JSON.parse(JSON.stringify(config)) as never;let job;
  try{[job]=await sql<{id:string}[]>`INSERT INTO background_jobs(type,status,input,storage_key,original_filename,idempotency_scope,idempotency_key,request_hash)VALUES('contacts_import','pending',${sql.json(stored)},${storageKey},${filename.slice(0,240)},${scope},${idempotencyKey},${hash})RETURNING id`;}catch(error){if((error as{code?:string}).code!=="23505")throw error;const[concurrent]=await sql<{id:string;request_hash:string}[]>`SELECT id,request_hash FROM background_jobs WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;if(!concurrent||concurrent.request_hash!==hash)throw new Error("Idempotency-Key ya se usó con otro archivo o configuración");return{id:concurrent.id,duplicate:true};}
  await getDataQueue().add("contacts_import",{jobId:job.id},{jobId:`data-${job.id}`});return{id:job.id,duplicate:false};
}

export async function createExportJob(config:{list_id:string;status?:string;columns?:string[]},idempotencyKey:string,principalId:string){
  if(!idempotencyKey.trim())throw new Error("Falta Idempotency-Key");const hash=requestHash(Buffer.alloc(0),config);const scope=`export:${principalId}`;const[existing]=await sql<{id:string;request_hash:string}[]>`SELECT id,request_hash FROM background_jobs WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;
  if(existing){if(existing.request_hash!==hash)throw new Error("Idempotency-Key ya se usó con otra exportación");return{id:existing.id,duplicate:true};}
  const[list]=await sql<{id:string}[]>`SELECT id FROM lists WHERE id=${config.list_id}`;if(!list)throw new Error("La lista no existe");const stored=JSON.parse(JSON.stringify(config)) as never;
  const[job]=await sql<{id:string}[]>`INSERT INTO background_jobs(type,status,input,idempotency_scope,idempotency_key,request_hash)VALUES('contacts_export','pending',${sql.json(stored)},${scope},${idempotencyKey},${hash})RETURNING id`;
  await getDataQueue().add("contacts_export",{jobId:job.id},{jobId:`data-${job.id}`});return{id:job.id,duplicate:false};
}

export async function createBulkJob(config:BulkContactsConfig,idempotencyKey:string,principalId:string){
  if(!idempotencyKey.trim())throw new Error("Falta Idempotency-Key");
  const ids=[...new Set(config.contact_ids)];if(!ids.length)throw new Error("Selecciona al menos un contacto");if(ids.length>10_000)throw new Error("La operación admite hasta 10.000 contactos");
  if(config.action!=="block"){
    if(!config.list_id)throw new Error("Selecciona una lista");
    const[list]=await sql<{id:string}[]>`SELECT id FROM lists WHERE id=${config.list_id} AND status='active'`;if(!list)throw new Error("La lista no existe");
  }
  const normalized={...config,contact_ids:ids,reason:config.reason??"Operación masiva"};const hash=requestHash(Buffer.alloc(0),normalized);const scope=`bulk:${principalId}`;
  const[existing]=await sql<{id:string;request_hash:string}[]>`SELECT id,request_hash FROM background_jobs WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;
  if(existing){if(existing.request_hash!==hash)throw new Error("Idempotency-Key ya se usó con otra operación");return{id:existing.id,duplicate:true};}
  const stored=JSON.parse(JSON.stringify(normalized)) as never;let job;
  try{[job]=await sql<{id:string}[]>`INSERT INTO background_jobs(type,status,input,idempotency_scope,idempotency_key,request_hash,total_rows)VALUES('contacts_bulk','pending',${sql.json(stored)},${scope},${idempotencyKey},${hash},${ids.length})RETURNING id`;}catch(error){if((error as{code?:string}).code!=="23505")throw error;const[concurrent]=await sql<{id:string;request_hash:string}[]>`SELECT id,request_hash FROM background_jobs WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;if(!concurrent||concurrent.request_hash!==hash)throw new Error("Idempotency-Key ya se usó con otra operación");return{id:concurrent.id,duplicate:true};}
  await getDataQueue().add("contacts_bulk",{jobId:job.id},{jobId:`data-${job.id}`});return{id:job.id,duplicate:false};
}

function typedField(raw:string,definition:ListFieldDefinition){
  if(raw==="")return null;if(definition.type==="integer")return Number.parseInt(raw,10);if(definition.type==="decimal")return Number.parseFloat(raw);if(definition.type==="boolean")return ["1","true","si","sí","yes"].includes(raw.toLowerCase());if(definition.type==="multiselect")return raw.split(/[|;]/).map(item=>item.trim()).filter(Boolean);return raw;
}

async function reject(jobId:string,rowNumber:number,email:string,reason:string,row:Record<string,string>){const stored=JSON.parse(JSON.stringify(row)) as never;await sql`INSERT INTO import_rejections(job_id,row_number,email,reason,row_data)VALUES(${jobId},${rowNumber},${email},${reason},${sql.json(stored)})`;}

async function runImport(job:Job){
  const config=job.input as ImportConfig;const buffer=await readFile(safeJobPath(job.storage_key!));const text=buffer.toString("utf8").replace(/^\uFEFF/,"");if(text.includes("\uFFFD"))throw new Error("El archivo no es UTF-8 válido");const delimiter=delimiterFor(text,config.delimiter);
  const records=parse(text,{columns:(headers:string[])=>headers.map(normalizeHeader),delimiter,bom:true,skip_empty_lines:true,trim:true,relax_column_count:false}) as Record<string,string>[];if(records.length>500_000)throw new Error("El archivo supera 500.000 filas");
  const fields=await sql<ListFieldDefinition[]>`SELECT id,key,label,type,required,options,validation FROM list_fields WHERE list_id=${config.list_id} AND status='active'`;const fieldMap=new Map(fields.map(field=>[field.key,field]));const mapping:Record<string,string>=config.mapping??previewCsv(buffer,delimiter).suggested_mapping as Record<string,string>;
  if(!Object.values(mapping).includes("email"))throw new Error("El mapeo debe incluir email");await sql`UPDATE background_jobs SET status='running',started_at=now(),total_rows=${records.length},progress=0 WHERE id=${job.id}`;
  let created=0,updated=0,subscribed=0,blocked=0,skipped=0,failed=0;const seen=new Set<string>();
  for(let index=0;index<records.length;index++){
    if(index%25===0){const[current]=await sql<{cancel_requested:boolean}[]>`SELECT cancel_requested FROM background_jobs WHERE id=${job.id}`;if(current.cancel_requested){await sql`UPDATE background_jobs SET status='cancelled',processed_rows=${index},progress=${records.length?Math.floor(index/records.length*100):0},completed_at=now() WHERE id=${job.id}`;return;}}
    const row=records[index];const projected:Record<string,string>={};for(const[source,target]of Object.entries(mapping))if(target)projected[target]=row[normalizeHeader(source)]??"";const email=(projected.email??"").trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(email)){failed++;await reject(job.id,index+2,email,"Email no válido",row);continue;}if(seen.has(email)){skipped++;await reject(job.id,index+2,email,"Duplicado dentro del archivo",row);continue;}seen.add(email);
    const listValues:Record<string,unknown>={};for(const[target,raw]of Object.entries(projected))if(target.startsWith("field:")){const key=target.slice(6);const definition=fieldMap.get(key);if(definition)listValues[key]=typedField(raw,definition);}const validation=await validateListValues(config.list_id,listValues,(config.initial_status??"active")==="active");if(!validation.valid){failed++;await reject(job.id,index+2,email,validation.errors.map(item=>`${item.field}: ${item.message}`).join("; "),row);continue;}
    try{const outcome=await sql.begin(async tx=>{const[protectedEmail]=await tx<{reason:string}[]>`SELECT reason FROM suppressions WHERE lower(email)=lower(${email}) AND scope='all' AND status='active' AND reason IN('privacy','merged') LIMIT 1`;if(protectedEmail)throw new Error("Correo protegido por una solicitud de privacidad");let[contact]=await tx<{id:string;first_name:string;last_name:string;phone:string;custom_fields:Record<string,unknown>}[]>`SELECT id,first_name,last_name,phone,custom_fields FROM contacts WHERE lower(email)=${email} AND merged_into_contact_id IS NULL AND anonymized_at IS NULL FOR UPDATE`;const contactCreated=!contact;const incoming={first_name:projected.first_name??"",last_name:projected.last_name??"",phone:projected.phone??"",city:projected.city??"",country:projected.country??""};if(!contact)[contact]=await tx`INSERT INTO contacts(email,first_name,last_name,phone,status,source,custom_fields,language,timezone)VALUES(${email},${incoming.first_name},${incoming.last_name},${incoming.phone},'active',${config.source??'csv'},${tx.json({city:incoming.city,country:incoming.country})},${projected.language||'es'},${projected.timezone||''})RETURNING id,first_name,last_name,phone,custom_fields`;else if(config.existing_policy!=="preserve"){const overwrite=config.existing_policy==="overwrite";await tx`UPDATE contacts SET first_name=${overwrite?incoming.first_name:incoming.first_name||contact.first_name},last_name=${overwrite?incoming.last_name:incoming.last_name||contact.last_name},phone=${overwrite?incoming.phone:incoming.phone||contact.phone},custom_fields=custom_fields||${tx.json({...(incoming.city?{city:incoming.city}:{}),...(incoming.country?{country:incoming.country}:{})})},updated_at=now() WHERE id=${contact.id}`;}
      const[existingSub]=await tx<{id:string;status:string}[]>`SELECT id,status FROM subscriptions WHERE contact_id=${contact.id} AND list_id=${config.list_id} FOR UPDATE`;let subscriptionId=existingSub?.id;let subscriptionCreated=false;if(!existingSub){const[subscription]=await tx<{id:string}[]>`INSERT INTO subscriptions(contact_id,list_id,status,source,custom_values,subscribed_at,confirmed_at,consent_text)VALUES(${contact.id},${config.list_id},${config.initial_status??'active'},${config.source??'csv'},${tx.json(listValues as never)},now(),${(config.initial_status??'active')==='active'?new Date():null},${config.consent_text??'Importación administrativa'})RETURNING id`;subscriptionId=subscription.id;subscriptionCreated=true;await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,legal_basis,detail)VALUES(${contact.id},${subscription.id},${config.list_id},${(config.initial_status??'active')==='active'?'subscribed':'consent_updated'},${config.source??'csv'},${config.consent_text??'Importación administrativa'},${config.legal_basis??'consent'},${tx.json({job_id:job.id,row:index+2,pending:(config.initial_status??'active')==='pending'})})`;}else if(config.update_unsubscribed!==false||!['unsubscribed','archived'].includes(existingSub.status))await tx`UPDATE subscriptions SET custom_values=CASE WHEN ${config.existing_policy==='overwrite'} THEN ${tx.json(listValues as never)} ELSE custom_values||${tx.json(listValues as never)} END,updated_at=now() WHERE id=${existingSub.id}`;
      await tx`INSERT INTO background_job_changes(job_id,row_number,contact_id,subscription_id,contact_created,subscription_created)VALUES(${job.id},${index+2},${contact.id},${subscriptionId??null},${contactCreated},${subscriptionCreated})`;return{contactCreated,subscriptionCreated,blocked:Boolean(existingSub&&['unsubscribed','archived'].includes(existingSub.status))};});if(outcome.contactCreated)created++;else updated++;if(outcome.subscriptionCreated)subscribed++;if(outcome.blocked)blocked++;}catch(error){failed++;const message=error instanceof Error?error.message:"Error de fila";const privacyProtected=message.includes("solicitud de privacidad");await reject(job.id,index+2,privacyProtected?"":email,message,privacyProtected?{}:row);}
    if(index%25===0||index===records.length-1)await sql`UPDATE background_jobs SET processed_rows=${index+1},progress=${records.length?Math.floor((index+1)/records.length*100):100} WHERE id=${job.id}`;
  }
  const rejected=await sql<{row_number:number;email:string;reason:string;row_data:Record<string,string>}[]>`SELECT row_number,email,reason,row_data FROM import_rejections WHERE job_id=${job.id} ORDER BY row_number`;let errorsKey:string|null=null;if(rejected.length){errorsKey=`${job.id}-errors.csv`;await mkdir(jobRoot,{recursive:true});await writeFile(safeJobPath(errorsKey),"\uFEFF"+[csvLine(["row","email","reason","data"]),...rejected.map(item=>csvLine([item.row_number,item.email,item.reason,item.row_data]))].join("\r\n"));}
  const result={created,updated,new_subscriptions:subscribed,blocked,skipped,failed,total:records.length};await sql`UPDATE background_jobs SET status='completed',progress=100,processed_rows=${records.length},result=${sql.json(result)},errors_storage_key=${errorsKey},completed_at=now() WHERE id=${job.id}`;await sql`INSERT INTO audit_log(action,entity_type,entity_id,detail)VALUES('import','background_job',${job.id},${sql.json(result)})`;
}

async function runExport(job:Job){
  const config=job.input as{list_id:string;status?:string;columns?:string[]};await sql`UPDATE background_jobs SET status='running',started_at=now(),progress=5 WHERE id=${job.id}`;const rows=await sql<{email:string;first_name:string;last_name:string;phone:string;language:string;timezone:string;contact_fields:Record<string,unknown>;status:string;source:string;custom_values:Record<string,unknown>;subscribed_at:Date|null;confirmed_at:Date|null;unsubscribed_at:Date|null}[]>`
    SELECT c.email,c.first_name,c.last_name,c.phone,c.language,c.timezone,c.custom_fields AS contact_fields,s.status,s.source,s.custom_values,s.subscribed_at,s.confirmed_at,s.unsubscribed_at FROM subscriptions s JOIN contacts c ON c.id=s.contact_id WHERE s.list_id=${config.list_id} AND (${config.status??null}::text IS NULL OR s.status=${config.status??null}) ORDER BY c.email
  `;const fieldKeys=[...new Set(rows.flatMap(row=>Object.keys(row.custom_values??{})))].sort();const available=["email","first_name","last_name","phone","city","country","language","timezone","subscription_status","source","subscribed_at","confirmed_at","unsubscribed_at",...fieldKeys.map(key=>`field:${key}`)];const columns=config.columns?.filter(column=>available.includes(column))??available;const values=(row:typeof rows[number],column:string)=>{if(column.startsWith("field:"))return row.custom_values?.[column.slice(6)];if(column==="city"||column==="country")return row.contact_fields?.[column];if(column==="subscription_status")return row.status;return row[column as keyof typeof row];};const content="\uFEFF"+[csvLine(columns),...rows.map(row=>csvLine(columns.map(column=>values(row,column))))].join("\r\n");const key=`${job.id}-export.csv`;await mkdir(jobRoot,{recursive:true});await writeFile(safeJobPath(key),content);const result={rows:rows.length,columns};await sql`UPDATE background_jobs SET status='completed',progress=100,total_rows=${rows.length},processed_rows=${rows.length},result=${sql.json(result)},result_storage_key=${key},completed_at=now() WHERE id=${job.id}`;await sql`INSERT INTO audit_log(action,entity_type,entity_id,detail)VALUES('export','background_job',${job.id},${sql.json({list_id:config.list_id,rows:rows.length,columns})})`;
}

async function runBulk(job:Job){
  const config=job.input as BulkContactsConfig;const ids=[...new Set(config.contact_ids)];
  await sql`UPDATE background_jobs SET status='running',started_at=now(),total_rows=${ids.length},progress=0 WHERE id=${job.id}`;
  let changed=0,skipped=0,failed=0,createdSubscriptions=0,reactivated=0;
  let defaults:Record<string,unknown>={};let defaultsValid=true;
  if(config.action==="subscribe"&&config.list_id){
    const fields=await sql<{key:string;default_value:unknown;required:boolean}[]>`SELECT key,default_value,required FROM list_fields WHERE list_id=${config.list_id} AND status='active'`;
    defaults=Object.fromEntries(fields.filter(field=>field.default_value!==null).map(field=>[field.key,field.default_value]));
    defaultsValid=(await validateListValues(config.list_id,defaults,true)).valid;
  }
  for(let index=0;index<ids.length;index++){
    if(index%25===0){const[current]=await sql<{cancel_requested:boolean}[]>`SELECT cancel_requested FROM background_jobs WHERE id=${job.id}`;if(current.cancel_requested){await sql`UPDATE background_jobs SET status='cancelled',processed_rows=${index},progress=${ids.length?Math.floor(index/ids.length*100):0},result=${sql.json({changed,skipped,failed,created_subscriptions:createdSubscriptions,reactivated})},completed_at=now() WHERE id=${job.id}`;return;}}
    const contactId=ids[index];
    try{
      const outcome=await sql.begin(async tx=>{
        const[contact]=await tx<{id:string;email:string;status:string}[]>`SELECT id,email,status FROM contacts WHERE id=${contactId} AND merged_into_contact_id IS NULL AND anonymized_at IS NULL FOR UPDATE`;if(!contact)return"skipped";
        if(config.action==="block"){
          await tx`UPDATE contacts SET status='blocked',updated_at=now() WHERE id=${contact.id}`;
          await tx`INSERT INTO suppressions(email,reason,source,scope,detail)VALUES(${contact.email},'manual','bulk','all',${tx.json({reason:config.reason??"Operación masiva",job_id:job.id})})ON CONFLICT(lower(email),scope)DO UPDATE SET reason='manual',source='bulk',detail=EXCLUDED.detail,status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now()`;
          return"changed";
        }
        const[subscription]=await tx<{id:string;status:string;custom_values:Record<string,unknown>}[]>`SELECT id,status,custom_values FROM subscriptions WHERE contact_id=${contact.id} AND list_id=${config.list_id!} FOR UPDATE`;
        if(config.action==="unsubscribe"){
          if(!subscription||!['active','pending'].includes(subscription.status))return"skipped";
          await tx`UPDATE subscriptions SET status='unsubscribed',unsubscribed_at=COALESCE(unsubscribed_at,now()),updated_at=now() WHERE id=${subscription.id}`;
          await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,detail)VALUES(${contact.id},${subscription.id},${config.list_id!},'unsubscribed','bulk',${config.reason??"Operación masiva"},${tx.json({job_id:job.id})})`;return"changed";
        }
        if(config.action==="archive"){
          if(!subscription||subscription.status==='archived')return"skipped";
          await tx`UPDATE subscriptions SET status='archived',updated_at=now() WHERE id=${subscription.id}`;
          await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,detail)VALUES(${contact.id},${subscription.id},${config.list_id!},'archived','bulk',${config.reason??"Operación masiva"},${tx.json({job_id:job.id})})`;return"changed";
        }
        if(!subscription){
          if(!defaultsValid)return"skipped";const storedDefaults=JSON.parse(JSON.stringify(defaults)) as never;
          const[created]=await tx<{id:string}[]>`INSERT INTO subscriptions(contact_id,list_id,status,source,custom_values,subscribed_at,confirmed_at,consent_text)VALUES(${contact.id},${config.list_id!},'active','bulk',${tx.json(storedDefaults)},now(),now(),${config.reason??"Operación masiva"})RETURNING id`;
          await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,detail)VALUES(${contact.id},${created.id},${config.list_id!},'subscribed','bulk',${config.reason??"Operación masiva"},${tx.json({job_id:job.id})})`;return"created";
        }
        if(subscription.status==='active')return"skipped";
        if(['unsubscribed','archived'].includes(subscription.status)&&!config.reactivate)return"skipped";
        const values={...defaults,...(subscription.custom_values??{})};const validation=await validateListValues(config.list_id!,values,true);if(!validation.valid)return"skipped";const stored=JSON.parse(JSON.stringify(values)) as never;
        await tx`UPDATE subscriptions SET status='active',custom_values=${tx.json(stored)},reactivated_at=CASE WHEN status IN('unsubscribed','archived') THEN now() ELSE reactivated_at END,subscribed_at=now(),confirmed_at=COALESCE(confirmed_at,now()),unsubscribed_at=NULL,source='bulk',updated_at=now() WHERE id=${subscription.id}`;
        await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,detail)VALUES(${contact.id},${subscription.id},${config.list_id!},${['unsubscribed','archived'].includes(subscription.status)?'resubscribed':'subscribed'},'bulk',${config.reason??"Operación masiva"},${tx.json({job_id:job.id,explicit_reactivation:Boolean(config.reactivate)})})`;return['unsubscribed','archived'].includes(subscription.status)?"reactivated":"changed";
      });
      if(outcome==="created"){changed++;createdSubscriptions++;}else if(outcome==="reactivated"){changed++;reactivated++;}else if(outcome==="changed")changed++;else skipped++;
    }catch(error){console.error(`Bulk contact ${contactId} failed`,error);failed++;}
    if(index%25===0||index===ids.length-1)await sql`UPDATE background_jobs SET processed_rows=${index+1},progress=${ids.length?Math.floor((index+1)/ids.length*100):100} WHERE id=${job.id}`;
  }
  const result={changed,skipped,failed,created_subscriptions:createdSubscriptions,reactivated,total:ids.length};await sql`UPDATE background_jobs SET status='completed',progress=100,processed_rows=${ids.length},result=${sql.json(result)},completed_at=now() WHERE id=${job.id}`;await sql`INSERT INTO audit_log(action,entity_type,entity_id,detail)VALUES('bulk_contacts','background_job',${job.id},${sql.json({...result,action:config.action,list_id:config.list_id??null})})`;
}

export async function processDataJob(jobId:string){const[job]=await sql<Job[]>`SELECT id,type,status,input,storage_key,cancel_requested FROM background_jobs WHERE id=${jobId}`;if(!job||job.status!=="pending")return{skipped:true};if(job.cancel_requested){await sql`UPDATE background_jobs SET status='cancelled',completed_at=now() WHERE id=${job.id}`;return{cancelled:true};}try{if(job.type==="contacts_import")await runImport(job);else if(job.type==="contacts_export")await runExport(job);else if(job.type==="contacts_bulk")await runBulk(job);else throw new Error("Tipo de trabajo no soportado");return{completed:true};}catch(error){await sql`UPDATE background_jobs SET status='failed',error=${error instanceof Error?error.message.slice(0,2000):'Error desconocido'},completed_at=now() WHERE id=${job.id}`;throw error;}}

export async function recoverDataJobs(){const jobs=await sql<{id:string}[]>`SELECT id FROM background_jobs WHERE type IN('contacts_import','contacts_export','contacts_bulk') AND status='pending' ORDER BY created_at LIMIT 1000`;await getDataQueue().addBulk(jobs.map(job=>({name:"data",data:{jobId:job.id},opts:{jobId:`data-${job.id}`}})));}

export async function rollbackImport(jobId:string){
  const[job]=await sql<{status:string;type:string;rollback_at:Date|null}[]>`SELECT status,type,rollback_at FROM background_jobs WHERE id=${jobId}`;if(!job||job.type!=="contacts_import"||job.status!=="completed"||job.rollback_at)throw new Error("La importación no se puede revertir");
  const changes=await sql<{subscription_id:string;contact_id:string}[]>`SELECT subscription_id,contact_id FROM background_job_changes WHERE job_id=${jobId} AND subscription_created AND subscription_id IS NOT NULL`;
  await sql.begin(async tx=>{for(const change of changes){const[archived]=await tx<{list_id:string}[]>`UPDATE subscriptions SET status='archived',updated_at=now() WHERE id=${change.subscription_id} AND status IN('active','pending') RETURNING list_id`;if(archived)await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,detail)VALUES(${change.contact_id},${change.subscription_id},${archived.list_id},'archived','import_rollback','Reversión controlada de importación',${tx.json({job_id:jobId})})`;}await tx`UPDATE background_jobs SET rollback_at=now() WHERE id=${jobId}`;await tx`INSERT INTO audit_log(action,entity_type,entity_id,detail)VALUES('rollback','background_job',${jobId},${tx.json({archived_subscriptions:changes.length})})`;});return{rolled_back:true,archived_subscriptions:changes.length};
}

export async function readJobFile(key:string){return readFile(safeJobPath(key));}

export async function pruneJobFiles(days:number){
  const jobs=await sql<{id:string;storage_key:string|null;errors_storage_key:string|null;result_storage_key:string|null}[]>`SELECT id,storage_key,errors_storage_key,result_storage_key FROM background_jobs WHERE created_at<now()-(${days}*interval '1 day') AND (storage_key IS NOT NULL OR errors_storage_key IS NOT NULL OR result_storage_key IS NOT NULL) ORDER BY created_at LIMIT 500`;
  let filesDeleted=0;
  for(const job of jobs){
    for(const key of new Set([job.storage_key,job.errors_storage_key,job.result_storage_key].filter((value):value is string=>Boolean(value)))){
      await rm(safeJobPath(key),{force:true});filesDeleted++;
    }
    await sql`UPDATE background_jobs SET storage_key=NULL,errors_storage_key=NULL,result_storage_key=NULL WHERE id=${job.id}`;
  }
  return{jobs:jobs.length,files_deleted:filesDeleted};
}

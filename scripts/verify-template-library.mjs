import { createHash,randomBytes,randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error("DATABASE_URL es obligatoria");
const baseUrl=(process.env.VERIFY_BASE_URL??"http://localhost:3000").replace(/\/$/,"");const sql=postgres(databaseUrl,{max:1});
const runId=randomUUID(),marker=runId.replaceAll("-","").slice(0,12),token=`sm_live_templates_${marker}_${randomBytes(32).toString("base64url")}`,secretHash=createHash("sha256").update(token).digest("hex");
let apiKeyId="",templateId="",copyId="",unsafeVersionId="",completed=false;
function assert(condition,message){if(!condition)throw new Error(message);}
async function request(path,options={}){const response=await fetch(`${baseUrl}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers??{})}});const text=await response.text();let body;try{body=text?JSON.parse(text):null;}catch{body=text;}return{response,body};}
async function api(path,options={}){const result=await request(path,options);if(!result.response.ok)throw new Error(`${options.method??"GET"} ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);return result.body;}
function json(method,body){return{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)};}
async function mutate(path,method,body){const current=await request(path);assert(current.response.ok&&current.response.headers.get("etag"),`No se obtuvo ETag para ${path}`);return api(path,{method,headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),"If-Match":current.response.headers.get("etag")},...(body===undefined?{}:{body:JSON.stringify(body)})});}

try{
  const[key]=await sql`INSERT INTO api_keys(name,prefix,secret_hash,scopes)VALUES('Plantillas E2E',${`templates_${marker}`},${secretHash},${["templates:read","templates:write"]})RETURNING id`;apiKeyId=key.id;
  const blocks=[{id:"title-e2e",type:"heading",content:"Novedades {{first_name}}",size:38,align:"left"},{id:"body-e2e",type:"text",content:"Contenido compatible",size:16,align:"left"},{id:"cta-e2e",type:"button",content:"Abrir",url:"https://example.com",align:"left"}];
  const theme={outer_bg:"#f3f0e9",content_bg:"#ffffff",text_color:"#263536",primary_color:"#183e3f",font_family:"Arial",width:620};
  const html='<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:620px){.shell{width:100%!important}}</style></head><body><table role="presentation" class="shell" width="620"><tr><td><h1>Novedades {{first_name}}</h1><p>Contenido compatible</p><a href="https://example.com">Abrir</a></td></tr></table></body></html>';
  const created=await api("/api/v1/templates",json("POST",{key:`template_e2e_${marker}`,name:`Plantilla E2E ${marker}`,channel:"marketing",format:"visual",folder:"E2E / Compatibilidad",subject:"Novedades {{first_name}}",preview_text:"Resumen E2E",html,text:"Novedades. Contenido compatible.",visual_document:{schema_version:2,blocks,theme},variables_schema:{first_name:{type:"string",default:"amiga"}},publish:true}));templateId=created.id;
  assert(created.status==="published"&&created.diagnostics.compatibility_profile==="gmail-apple-outlook-baseline-v1","La plantilla válida no se publicó con perfil de compatibilidad");

  const copy=await api(`/api/v1/templates/${templateId}/duplicate`,json("POST",{}));copyId=copy.id;
  assert(copy.status==="draft"&&copy.duplicated_from_id===templateId,"La copia no nació como borrador con procedencia");
  const copyDetail=await api(`/api/v1/templates/${copyId}`);const copyVersion=copyDetail.versions[0];
  assert(copyVersion.visual_document.schema_version===2&&copyVersion.visual_document.theme.primary_color===theme.primary_color&&copyVersion.visual_document.blocks.length===3,"La copia perdió documento, tema o bloques");

  await mutate(`/api/v1/templates/${templateId}`,"DELETE");
  const archived=(await api(`/api/v1/templates?include_archived=true&status=archived&q=${marker}`)).data;
  assert(archived.some(item=>item.id===templateId),"La biblioteca no encuentra la plantilla archivada");
  const restored=await mutate(`/api/v1/templates/${templateId}`,"PATCH",{status:"published",folder:"E2E / Restauradas"});
  assert(restored.status==="published"&&restored.archived_at==null&&restored.folder==="E2E / Restauradas","La restauración o movimiento de carpeta falló");

  const unsafe=await api(`/api/v1/templates/${copyId}/versions`,json("POST",{subject:"Versión insegura",preview_text:"",html:"<h1>Prueba</h1><script>alert(1)</script>",text:"Prueba",source_format:"html",variables_schema:{},change_note:"Debe bloquear publicación"}));unsafeVersionId=unsafe.id;
  assert(unsafe.diagnostics.valid===false&&unsafe.diagnostics.errors.some(item=>item.code==="unsafe_html"),"El diagnóstico no detectó HTML inseguro");
  const publishUnsafe=await request(`/api/v1/templates/${copyId}/versions/${unsafeVersionId}/publish`,{method:"POST"});
  assert(publishUnsafe.response.status===422&&publishUnsafe.body.error?.code==="template_invalid","Se pudo publicar HTML inseguro");
  const[duplicateAudit,restoreAudit]=await Promise.all([sql`SELECT count(*)::int AS count FROM audit_log WHERE entity_id=${copyId} AND action='duplicate'`.then(rows=>rows[0]),sql`SELECT count(*)::int AS count FROM audit_log WHERE entity_id=${templateId} AND action='restore'`.then(rows=>rows[0])]);
  assert(duplicateAudit.count===1&&restoreAudit.count>=1,"Duplicación o restauración no quedaron auditadas");
  completed=true;console.log(JSON.stringify({ok:true,run_id:runId,template_id:templateId,duplicate_template_id:copyId,unsafe_version_id:unsafeVersionId,invariants:{structured_copy:true,brand_theme_preserved:true,copy_is_draft:true,archive_search:true,restore_and_move:true,unsafe_publish_blocked:true,compatibility_profile:true,audited:true}},null,2));
}finally{
  if(templateId||copyId)await sql`UPDATE templates SET status='archived',archived_at=COALESCE(archived_at,now()),updated_at=now() WHERE id=ANY(${[templateId,copyId].filter(Boolean)}::uuid[])`.catch(()=>{});
  if(apiKeyId)await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${apiKeyId}`.catch(()=>{});
  if(!completed)console.error(JSON.stringify({level:"error",event:"template_library_e2e_failed",template_id:templateId,copy_id:copyId}));
  await sql.end();
}

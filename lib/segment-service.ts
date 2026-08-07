import { z } from "zod";
import { sql } from "./db";
import { buildSegmentFilter,countSegmentRules,explainSegment,type SegmentGroup,type SegmentNode,type SegmentRule,type SegmentValue } from "./segments";

export const segmentInputSchema=z.object({
  name:z.string().trim().min(1).max(200),description:z.string().max(1000).default(""),list_id:z.string().uuid(),definition:z.unknown(),
});

const fields=new Set(["status","email","first_name","last_name","phone","country","city","language","timezone","source","created_at","last_activity_at","subscription_status","subscription_source","subscribed_at","confirmed_at","unsubscribed_at","list_field","campaign_activity","list","tag"]);
const operators=new Set(["is","is_not","contains","not_contains","starts_with","greater_than","greater_or_equal","less_than","less_or_equal","between","before","after","is_empty","not_empty","contains_any","contains_all","received","not_received","opened","not_opened","clicked","not_clicked"]);

function valueOf(value:unknown):SegmentValue|undefined{
  if(value===undefined)return undefined;if(value===null||typeof value==="string"||typeof value==="number"||typeof value==="boolean")return value;
  if(Array.isArray(value)&&value.every(item=>typeof item==="string"||typeof item==="number"))return value as string[]|number[];
  throw new Error("El valor de una regla no es válido");
}

function parseNode(value:unknown,depth=0):SegmentNode{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("La definición del segmento no es válida");const source=value as Record<string,unknown>;
  if(source.kind==="group"){
    if(depth>=3)throw new Error("Los grupos admiten un máximo de tres niveles");if(!["all","any"].includes(String(source.match)))throw new Error("La lógica del grupo no es válida");if(!Array.isArray(source.children)||!source.children.length)throw new Error("Cada grupo necesita al menos una condición");if(source.children.length>20)throw new Error("Un grupo admite hasta veinte elementos");return{kind:"group",match:source.match as"all"|"any",children:source.children.map(child=>parseNode(child,depth+1))};
  }
  const field=String(source.field??"");const operator=String(source.operator??"");if(!fields.has(field))throw new Error(`Campo de segmento no válido: ${field}`);if(!operators.has(operator))throw new Error(`Operador no válido: ${operator}`);const withinDays=source.within_days===undefined?undefined:Number(source.within_days);if(withinDays!==undefined&&(field!=="campaign_activity"||!Number.isInteger(withinDays)||withinDays<1||withinDays>3650))throw new Error("La ventana de interacción debe estar entre 1 y 3650 días");const rule:SegmentRule={kind:"rule",field,operator,value:valueOf(source.value),value_to:source.value_to==null?undefined:String(source.value_to),list_id:typeof source.list_id==="string"?source.list_id:undefined,field_key:typeof source.field_key==="string"?source.field_key:undefined,field_type:typeof source.field_type==="string"?source.field_type:undefined,within_days:withinDays};if(!["is_empty","not_empty"].includes(operator)&&(rule.value===undefined||rule.value===""))throw new Error("Completa el valor de todas las reglas");return rule;
}

function walk(node:SegmentNode,visit:(rule:SegmentRule)=>void){if(node.kind==="group")node.children.forEach(child=>walk(child,visit));else visit(node);}
export function flattenSegmentRules(definition:SegmentGroup){const result:SegmentRule[]=[];walk(definition,rule=>result.push(rule));return result;}

export async function validateSegmentDefinition(listId:string,raw:unknown){
  const definition=parseNode(raw) as SegmentGroup;if(definition.kind!=="group")throw new Error("La raíz debe ser un grupo");if(countSegmentRules(definition)>40)throw new Error("El segmento admite hasta cuarenta reglas");
  const[list]=await sql<{id:string}[]>`SELECT id FROM lists WHERE id=${listId} AND status='active'`;if(!list)throw new Error("La lista no existe");
  const listFields=await sql<{key:string;type:string;status:string}[]>`SELECT key,type,status FROM list_fields WHERE list_id=${listId}`;const fieldMap=new Map(listFields.map(field=>[field.key,field]));const campaignIds:string[]=[];
  walk(definition,rule=>{
    if(["subscription_status","subscription_source","subscribed_at","confirmed_at","unsubscribed_at","list_field"].includes(rule.field))rule.list_id=listId;
    if(rule.field==="list_field"){const field=fieldMap.get(rule.field_key??"");if(!field)throw new Error(`El campo ${rule.field_key??""} no existe en esta lista`);if(field.status!=="active")throw new Error(`El campo ${field.key} está archivado`);rule.field_type=field.type;}
    if(rule.field==="campaign_activity")campaignIds.push(String(rule.value??""));
  });
  if(campaignIds.length){const rows=await sql<{id:string}[]>`SELECT id FROM campaigns WHERE id=ANY(${campaignIds}::uuid[]) AND list_id=${listId}`;if(rows.length!==new Set(campaignIds).size)throw new Error("Alguna campaña de la regla no pertenece a la lista");}
  return definition;
}

export async function previewSegment(listId:string,definition:SegmentGroup){
  const filter=buildSegmentFilter(definition,"all",2);const parameters=[listId,...filter.values];
  const[count]=await sql.unsafe<{count:number}[]>(`SELECT count(*)::int AS count FROM contacts c WHERE c.status='active' AND EXISTS(SELECT 1 FROM subscriptions base WHERE base.contact_id=c.id AND base.list_id::text=$1 AND base.status='active') AND NOT EXISTS(SELECT 1 FROM suppressions x WHERE lower(x.email)=lower(c.email) AND x.scope IN('marketing','all') AND x.status='active') AND ${filter.where}`,parameters);
  const examples=await sql.unsafe<{id:string;email:string;first_name:string;last_name:string}[]>(`SELECT c.id,c.email,c.first_name,c.last_name FROM contacts c WHERE c.status='active' AND EXISTS(SELECT 1 FROM subscriptions base WHERE base.contact_id=c.id AND base.list_id::text=$1 AND base.status='active') AND NOT EXISTS(SELECT 1 FROM suppressions x WHERE lower(x.email)=lower(c.email) AND x.scope IN('marketing','all') AND x.status='active') AND ${filter.where} ORDER BY c.created_at DESC LIMIT 10`,parameters);
  return{count:count.count,examples,explanation:explainSegment(definition)};
}

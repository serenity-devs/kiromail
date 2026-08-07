export type SegmentValue=string|number|boolean|string[]|number[]|null;
export type SegmentParameter=string|number|boolean|string[]|number[]|null;
export type SegmentRule={
  kind?:"rule";
  field:string;
  operator:string;
  value?:SegmentValue;
  value_to?:string|number|null;
  list_id?:string;
  field_key?:string;
  field_type?:string;
  within_days?:number;
};
export type SegmentGroup={kind:"group";match:"all"|"any";children:SegmentNode[]};
export type SegmentNode=SegmentRule|SegmentGroup;

function isGroup(node:SegmentNode):node is SegmentGroup{return node.kind==="group";}

export function normalizeSegmentDefinition(definition:SegmentGroup|SegmentRule[],matchType:"all"|"any"="all"):SegmentGroup{
  if(Array.isArray(definition))return{kind:"group",match:matchType,children:definition.map(rule=>({kind:"rule",...rule}))};
  return definition;
}

export function countSegmentRules(node:SegmentNode):number{return isGroup(node)?node.children.reduce((total,child)=>total+countSegmentRules(child),0):1;}

export function buildSegmentFilter(definition:SegmentGroup|SegmentRule[],matchType:"all"|"any"="all",offset=1){
  const values:SegmentParameter[]=[];const bind=(value:SegmentParameter)=>{values.push(value);return`$${offset+values.length-1}`;};
  const textClause=(expression:string,rule:SegmentRule)=>{
    if(rule.operator==="is_empty")return`COALESCE(${expression},'')=''`;if(rule.operator==="not_empty")return`COALESCE(${expression},'')<>''`;
    const parameter=bind(rule.value??"");
    if(rule.operator==="is")return`lower(COALESCE(${expression},''))=lower(${parameter}::text)`;
    if(rule.operator==="is_not")return`lower(COALESCE(${expression},''))<>lower(${parameter}::text)`;
    if(rule.operator==="contains")return`COALESCE(${expression},'') ILIKE '%'||${parameter}::text||'%'`;
    if(rule.operator==="not_contains")return`COALESCE(${expression},'') NOT ILIKE '%'||${parameter}::text||'%'`;
    if(rule.operator==="starts_with")return`COALESCE(${expression},'') ILIKE ${parameter}::text||'%'`;
    throw new Error(`Operador ${rule.operator} no válido para texto`);
  };
  const comparableClause=(expression:string,cast:"numeric"|"timestamptz",rule:SegmentRule)=>{
    if(rule.operator==="is_empty")return`${expression} IS NULL OR ${expression}=''`;if(rule.operator==="not_empty")return`${expression} IS NOT NULL AND ${expression}<>''`;
    const first=bind(rule.value??"");const operators:Record<string,string>={is:"=",is_not:"<>",greater_than:">",greater_or_equal:">=",less_than:"<",less_or_equal:"<=",before:"<",after:">"};
    if(rule.operator==="between"){const second=bind(rule.value_to??"");return`NULLIF(${expression},'')::${cast} BETWEEN ${first}::${cast} AND ${second}::${cast}`;}
    const operator=operators[rule.operator];if(!operator)throw new Error(`Operador ${rule.operator} no válido para ${cast}`);return`NULLIF(${expression},'')::${cast} ${operator} ${first}::${cast}`;
  };
  const compileRule=(rule:SegmentRule):string=>{
    const globalText:Record<string,string>={status:"c.status",email:"c.email",first_name:"c.first_name",last_name:"c.last_name",phone:"c.phone",country:"c.custom_fields->>'country'",city:"c.custom_fields->>'city'",language:"c.language",timezone:"c.timezone",source:"c.source"};
    if(globalText[rule.field])return textClause(globalText[rule.field],rule);
    if(["created_at","last_activity_at"].includes(rule.field))return comparableClause(`c.${rule.field}::text`,"timestamptz",rule);
    if(rule.field==="list"||rule.field==="tag"){
      const parameter=bind(rule.value??"");const exists=rule.field==="list"?`EXISTS (SELECT 1 FROM subscriptions s WHERE s.contact_id=c.id AND s.status='active' AND s.list_id::text=${parameter}::text)`:`EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id=c.id AND ct.tag_id::text=${parameter}::text)`;return rule.operator==="is_not"?`NOT (${exists})`:exists;
    }
    if(["subscription_status","subscription_source","subscribed_at","confirmed_at","unsubscribed_at"].includes(rule.field)){
      const listParameter=bind(rule.list_id??"");const column=rule.field.replace("subscription_","");const expression=`sr.${column}::text`;const condition=["subscribed_at","confirmed_at","unsubscribed_at"].includes(rule.field)?comparableClause(expression,"timestamptz",rule):textClause(expression,rule);return`EXISTS (SELECT 1 FROM subscriptions sr WHERE sr.contact_id=c.id AND sr.list_id::text=${listParameter}::text AND ${condition})`;
    }
    if(rule.field==="list_field"){
      const listParameter=bind(rule.list_id??"");const keyParameter=bind(rule.field_key??"");const type=rule.field_type??"text";
      if(type==="multiselect"){
        if(rule.operator==="is_empty")return`EXISTS (SELECT 1 FROM subscriptions sr WHERE sr.contact_id=c.id AND sr.list_id::text=${listParameter}::text AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(sr.custom_values->${keyParameter}::text)='array' THEN sr.custom_values->${keyParameter}::text ELSE '[]'::jsonb END),0)=0)`;
        if(rule.operator==="not_empty")return`EXISTS (SELECT 1 FROM subscriptions sr WHERE sr.contact_id=c.id AND sr.list_id::text=${listParameter}::text AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(sr.custom_values->${keyParameter}::text)='array' THEN sr.custom_values->${keyParameter}::text ELSE '[]'::jsonb END),0)>0)`;
        const parameter=bind(Array.isArray(rule.value)?rule.value.map(String):[String(rule.value??"")]);const predicate=rule.operator==="contains_all"?`COALESCE(sr.custom_values->${keyParameter}::text,'[]'::jsonb) @> to_jsonb(${parameter}::text[])`:`jsonb_exists_any(COALESCE(sr.custom_values->${keyParameter}::text,'[]'::jsonb),${parameter}::text[])`;return`EXISTS (SELECT 1 FROM subscriptions sr WHERE sr.contact_id=c.id AND sr.list_id::text=${listParameter}::text AND ${predicate})`;
      }
      const expression=`sr.custom_values->>${keyParameter}::text`;const condition=["integer","decimal"].includes(type)?comparableClause(expression,"numeric",rule):["date","datetime"].includes(type)?comparableClause(expression,"timestamptz",rule):type==="boolean"?`${expression}::boolean=${bind(Boolean(rule.value))}::boolean`:textClause(expression,rule);return`EXISTS (SELECT 1 FROM subscriptions sr WHERE sr.contact_id=c.id AND sr.list_id::text=${listParameter}::text AND ${condition})`;
    }
    if(rule.field==="campaign_activity"){
      const campaignParameter=bind(rule.value??"");const positive=rule.operator.replace(/^not_/,"");const activityColumn=positive==="opened"?"cr.opened_at":positive==="clicked"?"cr.clicked_at":"COALESCE(cr.sent_at,cr.created_at)";const condition=positive==="opened"?"cr.opened_at IS NOT NULL":positive==="clicked"?"cr.clicked_at IS NOT NULL":"TRUE";const window=rule.within_days?` AND ${activityColumn}>=now()-(${bind(rule.within_days)}::int*interval '1 day')`:"";const exists=`EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.contact_id=c.id AND cr.campaign_id::text=${campaignParameter}::text AND ${condition}${window})`;return rule.operator.startsWith("not_")?`NOT (${exists})`:exists;
    }
    throw new Error(`Campo de segmento no soportado: ${rule.field}`);
  };
  const compile=(node:SegmentNode):string=>{if(!isGroup(node))return compileRule(node);const children=node.children.map(compile).filter(Boolean);return children.length?`(${children.join(node.match==="any"?" OR ":" AND ")})`:"TRUE";};
  return{where:compile(normalizeSegmentDefinition(definition,matchType)),values};
}

export function explainSegment(node:SegmentNode):string{
  if(isGroup(node)){const parts=node.children.map(explainSegment);return`${node.match==="all"?"Todas":"Cualquiera"}: ${parts.join(node.match==="all"?" Y ":" O ")}`;}
  const field=node.field==="list_field"?(node.field_key??"campo de lista"):node.field;const value=Array.isArray(node.value)?node.value.join(", "):String(node.value??"");const window=node.field==="campaign_activity"&&node.within_days?` en los últimos ${node.within_days} días`:"";return`${field} ${node.operator}${value?` ${value}`:""}${window}`;
}

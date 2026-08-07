import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { personalize } from "./email";
import { getEmailQueue } from "./queue";

export type ExperimentActor={id:string;kind:"session"|"api_key"|"system"};
export type CampaignVariant={id:string;experiment_id:string;campaign_id:string;position:number;name:string;weight:number;is_control:boolean;subject:string;preview_text:string;from_name:string;from_email:string;reply_to:string;content_source:"template"|"direct";template_id:string|null;template_version_id:string|null;html_content:string;text_content:string};
export type CampaignExperiment={id:string;campaign_id:string;status:string;sample_percentage:number;winner_metric:"opens"|"clicks"|"manual";wait_minutes:number;minimum_sample_size:number;test_dimensions:string[];actual_sample_size:number|null;remainder_size:number|null;winner_variant_id:string|null;evaluation_at:Date|null;variants:CampaignVariant[]};

export async function getCampaignExperimentSetup(campaignId:string){
  const[experiment]=await sql<Omit<CampaignExperiment,"variants">[]>`SELECT * FROM campaign_experiments WHERE campaign_id=${campaignId}`;
  if(!experiment)return null;const variants=await sql<CampaignVariant[]>`SELECT * FROM campaign_variants WHERE experiment_id=${experiment.id} ORDER BY position`;
  return{...experiment,variants};
}

export function buildExperimentAssignments(experiment:CampaignExperiment,total:number){
  if(experiment.variants.length<2)throw new Error("La prueba A/B necesita al menos dos variantes");
  const desired=Math.round(total*experiment.sample_percentage/100);const sampleSize=total<=experiment.variants.length?total:Math.min(total-1,Math.max(experiment.variants.length,desired));
  const totalWeight=experiment.variants.reduce((sum,item)=>sum+item.weight,0);const assignments:Array<{variant:CampaignVariant|null;phase:"sample"|"remainder"}>=[];
  for(let index=0;index<total;index+=1){if(index>=sampleSize){assignments.push({variant:null,phase:"remainder"});continue;}const slot=(index*totalWeight/sampleSize)%totalWeight;let cumulative=0;let selected=experiment.variants.at(-1)!;for(const variant of experiment.variants){cumulative+=variant.weight;if(slot<cumulative){selected=variant;break;}}assignments.push({variant:selected,phase:"sample"});}
  return{sampleSize,remainderSize:Math.max(0,total-sampleSize),assignments};
}

async function recordTransition(campaignId:string,action:string,actor:ExperimentActor,detail:Record<string,unknown>={}){
  const[state]=await sql<{status:string}[]>`SELECT status FROM campaigns WHERE id=${campaignId}`;
  await sql`INSERT INTO campaign_transitions(campaign_id,from_status,to_status,action,user_id,api_key_id,detail)VALUES(${campaignId},${state?.status??null},${state?.status??"sending"},${action},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},${sql.json(JSON.parse(JSON.stringify(detail)) as never)})`;
}

export async function markExperimentSampling(campaignId:string,sampleSize:number,remainderSize:number,actor:ExperimentActor){
  const[row]=await sql<{id:string}[]>`UPDATE campaign_experiments SET status='sampling',actual_sample_size=${sampleSize},remainder_size=${remainderSize},sample_started_at=now(),sample_completed_at=NULL,evaluation_at=NULL,winner_variant_id=NULL,winner_source=NULL,winner_selected_at=NULL,completed_at=NULL,updated_at=now() WHERE campaign_id=${campaignId} AND status='configured' RETURNING id`;
  if(row)await recordTransition(campaignId,"experiment_sample_started",actor,{sample_size:sampleSize,remainder_size:remainderSize});
}

export async function advanceCampaignExperiment(campaignId:string){
  const[waiting]=await sql<{wait_minutes:number;evaluation_at:Date}[]>`UPDATE campaign_experiments e SET status='waiting',sample_completed_at=COALESCE(sample_completed_at,now()),evaluation_at=COALESCE(evaluation_at,now()+make_interval(mins=>wait_minutes)),updated_at=now()
    WHERE campaign_id=${campaignId} AND status='sampling' AND NOT EXISTS(
      SELECT 1 FROM campaign_recipients cr WHERE cr.campaign_id=e.campaign_id AND cr.experiment_phase='sample' AND cr.status IN('pending','queued','processing')
    ) RETURNING wait_minutes,evaluation_at`;
  if(waiting)await recordTransition(campaignId,"experiment_waiting",{id:"worker",kind:"system"},{evaluation_at:waiting.evaluation_at,wait_minutes:waiting.wait_minutes});
  await sql`UPDATE campaign_experiments e SET status='completed',completed_at=COALESCE(e.completed_at,now()),updated_at=now() FROM campaigns c WHERE e.campaign_id=c.id AND e.campaign_id=${campaignId} AND e.status='winner_selected' AND c.status='completed'`;
}

type VariantScore=CampaignVariant&{sample_recipients:number;sample_delivered:number;sample_opened:number;sample_clicked:number;total_recipients:number;total_delivered:number;total_opened:number;total_clicked:number};
async function variantScores(experimentId:string){return sql<VariantScore[]>`SELECT v.*,
  count(cr.id) FILTER(WHERE cr.experiment_phase='sample')::int AS sample_recipients,
  count(cr.id) FILTER(WHERE cr.experiment_phase='sample' AND (cr.delivered_at IS NOT NULL OR cr.status='delivered'))::int AS sample_delivered,
  count(cr.id) FILTER(WHERE cr.experiment_phase='sample' AND (EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened') AND NOT e.is_automated) OR (cr.open_count>0 AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened')))))::int AS sample_opened,
  count(cr.id) FILTER(WHERE cr.experiment_phase='sample' AND (EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked') AND NOT e.is_automated) OR (cr.click_count>0 AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked')))))::int AS sample_clicked,
  count(cr.id)::int AS total_recipients,count(cr.id) FILTER(WHERE cr.delivered_at IS NOT NULL OR cr.status='delivered')::int AS total_delivered,
  count(cr.id) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened') AND NOT e.is_automated) OR (cr.open_count>0 AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened'))))::int AS total_opened,
  count(cr.id) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked') AND NOT e.is_automated) OR (cr.click_count>0 AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked'))))::int AS total_clicked
  FROM campaign_variants v LEFT JOIN campaign_recipients cr ON cr.variant_id=v.id WHERE v.experiment_id=${experimentId} GROUP BY v.id ORDER BY v.position`;}

export async function selectCampaignExperimentWinner(campaignId:string,options:{variantId?:string;actor:ExperimentActor;forceEvaluation?:boolean}){
  const[experiment]=await sql<(Omit<CampaignExperiment,"variants">&{campaign_status:string})[]>`SELECT e.*,c.status AS campaign_status FROM campaign_experiments e JOIN campaigns c ON c.id=e.campaign_id WHERE e.campaign_id=${campaignId}`;
  if(!experiment||experiment.status!=="waiting")throw new Error("La muestra todavía no está lista para elegir ganador");
  if(!options.variantId&&!options.forceEvaluation&&experiment.winner_metric==="manual")throw new Error("Selecciona manualmente una variante ganadora");
  const scores=await variantScores(experiment.id);let winner:VariantScore|undefined;
  if(options.variantId)winner=scores.find(item=>item.id===options.variantId);
  else{const metric=experiment.winner_metric==="clicks"?"sample_clicked":"sample_opened";winner=[...scores].sort((left,right)=>right[metric]-left[metric]||right.sample_delivered-left.sample_delivered||left.position-right.position)[0];}
  if(!winner)throw new Error("La variante ganadora no pertenece a esta campaña");
  const queuedIds:string[]=[];let campaignStatus=experiment.campaign_status;
  await sql.begin(async tx=>{
    const[claimed]=await tx<{id:string}[]>`UPDATE campaign_experiments SET status='winner_selected',winner_variant_id=${winner!.id},winner_source=${options.variantId?"manual":experiment.winner_metric},winner_selected_at=now(),updated_at=now() WHERE id=${experiment.id} AND status='waiting' RETURNING id`;
    if(!claimed)throw new Error("Otra operación ya eligió el ganador");
    const held=await tx<{id:string;contact_id:string;subscription_id:string;email:string;personalization:Record<string,string>}[]>`SELECT id,contact_id,subscription_id,email,personalization FROM campaign_recipients WHERE campaign_id=${campaignId} AND status='held' ORDER BY created_at,id FOR UPDATE`;
    const[campaign]=await tx<{track_opens:boolean|null;track_clicks:boolean|null;status:string}[]>`SELECT track_opens,track_clicks,status FROM campaigns WHERE id=${campaignId}`;campaignStatus=campaign.status;
    for(const recipient of held){const[message]=await tx<{id:string}[]>`INSERT INTO outbound_messages(kind,campaign_id,campaign_recipient_id,contact_id,subscription_id,template_version_id,to_email,to_name,from_email,from_name,reply_to,subject,status,variables,metadata,track_opens,track_clicks,idempotency_scope,idempotency_key,queued_at)
      VALUES('campaign',${campaignId},${recipient.id},${recipient.contact_id},${recipient.subscription_id},${winner!.template_version_id},${recipient.email},${recipient.personalization.full_name??""},${winner!.from_email},${winner!.from_name},${winner!.reply_to},${personalize(winner!.subject,recipient.personalization)},'queued',${tx.json(recipient.personalization)},${tx.json({variant_id:winner!.id,experiment_phase:"remainder"})},${campaign.track_opens??true},${campaign.track_clicks??true},${`campaign:${campaignId}`},${recipient.contact_id},now())
      ON CONFLICT(idempotency_scope,idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET updated_at=now() RETURNING id`;
      await tx`UPDATE campaign_recipients SET status='queued',variant_id=${winner!.id},outbound_message_id=${message.id},queued_at=now(),updated_at=now() WHERE id=${recipient.id}`;queuedIds.push(recipient.id);}
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('experiment_winner','campaign',${campaignId},${options.actor.kind==="session"?options.actor.id:null},${options.actor.kind==="api_key"?options.actor.id:null},${tx.json({variant_id:winner!.id,metric:options.variantId?"manual":experiment.winner_metric,remainder:held.length})})`;
  });
  await recordTransition(campaignId,"experiment_winner_selected",options.actor,{variant_id:winner.id,variant_name:winner.name,source:options.variantId?"manual":experiment.winner_metric,remainder:queuedIds.length});
  if(campaignStatus==="sending"&&queuedIds.length){const runId=randomUUID();await getEmailQueue().addBulk(queuedIds.map(id=>({name:"send",data:{recipientId:id},opts:{jobId:`email-${id}-winner-${runId}`}})));}
  return{campaign_id:campaignId,status:"winner_selected",winner_variant_id:winner.id,winner_name:winner.name,winner_source:options.variantId?"manual":experiment.winner_metric,queued:queuedIds.length};
}

export async function evaluateDueCampaignExperiments(){
  const due=await sql<{campaign_id:string}[]>`SELECT campaign_id FROM campaign_experiments WHERE status='waiting' AND winner_metric<>'manual' AND evaluation_at<=now() ORDER BY evaluation_at LIMIT 20`;
  for(const item of due){try{await selectCampaignExperimentWinner(item.campaign_id,{actor:{id:"worker",kind:"system"},forceEvaluation:true});}catch(error){console.error("Could not evaluate campaign experiment",item.campaign_id,error);}}
}

export async function recoverCampaignExperiments(){
  const rows=await sql<{campaign_id:string}[]>`SELECT campaign_id FROM campaign_experiments WHERE status IN('sampling','winner_selected') ORDER BY updated_at LIMIT 1000`;
  for(const row of rows)await advanceCampaignExperiment(row.campaign_id);
}

export async function getCampaignExperimentReport(campaignId:string){
  const setup=await getCampaignExperimentSetup(campaignId);if(!setup)return null;const scores=await variantScores(setup.id);const warnings:string[]=[];
  if(setup.actual_sample_size!==null&&setup.actual_sample_size<setup.minimum_sample_size)warnings.push(`La muestra real (${setup.actual_sample_size}) está por debajo del mínimo recomendado (${setup.minimum_sample_size}).`);
  if(setup.status==="waiting"&&setup.winner_metric!=="manual"){const metric=setup.winner_metric==="clicks"?"sample_clicked":"sample_opened";const ranked=[...scores].sort((a,b)=>b[metric]-a[metric]);if(ranked.length>1&&ranked[0][metric]===ranked[1][metric])warnings.push("Las variantes están empatadas; si continúa el empate ganará la variante de control.");}
  return{...setup,variants:scores.map(item=>({...item,sample_open_rate:item.sample_delivered?item.sample_opened/item.sample_delivered:0,sample_click_rate:item.sample_delivered?item.sample_clicked/item.sample_delivered:0,total_open_rate:item.total_delivered?item.total_opened/item.total_delivered:0,total_click_rate:item.total_delivered?item.total_clicked/item.total_delivered:0})),warnings};
}

import { sql } from "./db";
import { getCampaignExperimentReport } from "./campaign-experiments";
import { aggregateSignalDimension,classifyEmailClientSignal } from "./report-client-signals";

export type ReportRange = { from: Date; to: Date; listId?: string | null;breakdownField?:string|null };

export class ReportingError extends Error{
  constructor(message:string,public status=422,public code="invalid_report_request"){super(message);}
}

function ratio(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function previousRange(range:{from:Date;to:Date}){const duration=range.to.getTime()-range.from.getTime();return{from:new Date(range.from.getTime()-duration),to:new Date(range.from),...( "listId" in range?{listId:(range as ReportRange).listId}:{} )};}
function change(current:number,previous:number){return{delta:current-previous,relative_change:previous===0?null:(current-previous)/Math.abs(previous)};}

type CampaignReportRow={
  id:string;name:string;subject:string;status:string;list_id:string|null;list_name:string|null;started_at:Date|null;completed_at:Date|null;created_at:Date;
  total_recipients:number;sent_count:number;delivered_count:number;open_count:number;click_count:number;bounce_count:number;complaint_count:number;unsubscribe_count:number;
  unique_opens:number;unique_clicks:number;delayed_count:number;failed_count:number;
};

async function campaignReportRows(range:ReportRange){return sql<CampaignReportRow[]>`
  SELECT c.id,c.name,c.subject,c.status,c.list_id,l.name AS list_name,c.started_at,c.completed_at,c.created_at,
    c.total_recipients,c.sent_count,c.delivered_count,c.open_count,c.click_count,c.bounce_count,c.complaint_count,c.unsubscribe_count,
    count(cr.id) FILTER (WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened') AND NOT e.is_automated) OR (cr.opened_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened'))))::int AS unique_opens,
    count(cr.id) FILTER (WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked') AND NOT e.is_automated) OR (cr.clicked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked'))))::int AS unique_clicks,
    count(cr.id) FILTER (WHERE EXISTS (SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type='delivery_delayed'))::int AS delayed_count,
    count(cr.id) FILTER (WHERE cr.status='failed')::int AS failed_count
  FROM campaigns c LEFT JOIN lists l ON l.id=c.list_id LEFT JOIN campaign_recipients cr ON cr.campaign_id=c.id
  WHERE c.archived_at IS NULL AND (c.started_at IS NOT NULL OR c.total_recipients>0) AND COALESCE(c.started_at,c.created_at)>=${range.from} AND COALESCE(c.started_at,c.created_at)<${range.to}
    AND (${range.listId ?? null}::uuid IS NULL OR c.list_id=${range.listId ?? null}::uuid)
  GROUP BY c.id,l.name ORDER BY COALESCE(c.started_at,c.created_at) DESC
`;}

function normalizeCampaignRows(campaigns:CampaignReportRow[]){return campaigns.map(item=>({...item,delivery_rate:ratio(item.delivered_count,item.sent_count),open_rate:ratio(item.unique_opens,item.delivered_count),click_rate:ratio(item.unique_clicks,item.delivered_count),click_to_open_rate:ratio(item.unique_clicks,item.unique_opens)}));}
function summarizeCampaignRows(rows:ReturnType<typeof normalizeCampaignRows>){const summary=rows.reduce((acc,item)=>({campaigns:acc.campaigns+1,recipients:acc.recipients+item.total_recipients,sent:acc.sent+item.sent_count,delivered:acc.delivered+item.delivered_count,unique_opens:acc.unique_opens+item.unique_opens,total_opens:acc.total_opens+item.open_count,unique_clicks:acc.unique_clicks+item.unique_clicks,total_clicks:acc.total_clicks+item.click_count,bounced:acc.bounced+item.bounce_count,complained:acc.complained+item.complaint_count,unsubscribed:acc.unsubscribed+item.unsubscribe_count,delayed:acc.delayed+item.delayed_count,failed:acc.failed+item.failed_count}),{campaigns:0,recipients:0,sent:0,delivered:0,unique_opens:0,total_opens:0,unique_clicks:0,total_clicks:0,bounced:0,complained:0,unsubscribed:0,delayed:0,failed:0});return{...summary,delivery_rate:ratio(summary.delivered,summary.sent),open_rate:ratio(summary.unique_opens,summary.delivered),click_rate:ratio(summary.unique_clicks,summary.delivered),click_to_open_rate:ratio(summary.unique_clicks,summary.unique_opens)};}

async function campaignClientSignals(range:ReportRange){const rows=await sql<{user_agent:string}[]>`
  SELECT DISTINCT ON (COALESCE(e.recipient_id::text,e.message_id::text)) e.payload->>'user_agent' AS user_agent
  FROM email_events e JOIN outbound_messages m ON m.id=e.message_id JOIN campaigns c ON c.id=m.campaign_id
  WHERE m.kind='campaign' AND m.created_at>=${range.from} AND m.created_at<${range.to}
    AND (${range.listId??null}::uuid IS NULL OR c.list_id=${range.listId??null}::uuid)
    AND e.type IN('open','opened') AND NOT e.is_automated AND COALESCE(e.payload->>'user_agent','')<>''
  ORDER BY COALESCE(e.recipient_id::text,e.message_id::text),e.occurred_at LIMIT 100000
`;const classified=rows.map(item=>classifyEmailClientSignal(item.user_agent));return{clients:aggregateSignalDimension(classified.map(item=>item.client)),devices:aggregateSignalDimension(classified.map(item=>item.device)),note:"Solo se agrega una apertura no automatizada por mensaje. Los grupos pequeños y las firmas ambiguas permanecen ocultos."};}

export async function getCampaignsReport(range: ReportRange) {
  const rows=normalizeCampaignRows(await campaignReportRows(range));
  const summary=summarizeCampaignRows(rows);
  const priorRange=previousRange(range);
  const previous=summarizeCampaignRows(normalizeCampaignRows(await campaignReportRows(priorRange)));
  const daily = await sql`
    SELECT date_trunc('day',COALESCE(c.started_at,c.created_at))::date AS date,
      count(DISTINCT c.id)::int AS campaigns,sum(c.delivered_count)::int AS delivered,
      sum(c.open_count)::int AS total_opens,sum(c.click_count)::int AS total_clicks,
      sum(c.bounce_count)::int AS bounced,sum(c.unsubscribe_count)::int AS unsubscribed
    FROM campaigns c WHERE c.archived_at IS NULL AND (c.started_at IS NOT NULL OR c.total_recipients>0) AND COALESCE(c.started_at,c.created_at)>=${range.from} AND COALESCE(c.started_at,c.created_at)<${range.to}
      AND (${range.listId ?? null}::uuid IS NULL OR c.list_id=${range.listId ?? null}::uuid)
    GROUP BY 1 ORDER BY 1
  `;
  let dimensions:{key:string;label:string;type:string}[]=[];
  if(range.listId)dimensions=await sql<{key:string;label:string;type:string}[]>`
    SELECT key,label,type FROM list_fields WHERE list_id=${range.listId} AND status='active' AND type IN('select','multiselect','boolean') ORDER BY position,label
  `;
  if(range.breakdownField&&!range.listId)throw new ReportingError("Selecciona una lista antes de desglosar por un campo",422,"breakdown_requires_list");
  const field=range.breakdownField?dimensions.find(item=>item.key===range.breakdownField):null;
  if(range.breakdownField&&!field)throw new ReportingError("El campo no existe, está archivado o no es categórico",422,"invalid_breakdown_field");
  type FieldGroup={value:string;recipients:number;sent:number;delivered:number;unique_opens:number;unique_clicks:number};
  let rawFieldGroups:FieldGroup[]=[];
  if(field&&range.listId)rawFieldGroups=await sql<FieldGroup[]>`
      SELECT COALESCE(NULLIF(cr.personalization->>${field.key},''),'Sin valor') AS value,count(*)::int AS recipients,
        count(*) FILTER(WHERE cr.sent_at IS NOT NULL)::int AS sent,count(*) FILTER(WHERE cr.delivered_at IS NOT NULL)::int AS delivered,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened') AND NOT e.is_automated))::int AS unique_opens,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked') AND NOT e.is_automated))::int AS unique_clicks
      FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id
      WHERE c.list_id=${range.listId} AND COALESCE(c.started_at,c.created_at)>=${range.from} AND COALESCE(c.started_at,c.created_at)<${range.to}
      GROUP BY 1 ORDER BY recipients DESC,1
    `;
  const minimumGroupSize=5;
  const fieldGroups=rawFieldGroups.filter(item=>Number(item.recipients)>=minimumGroupSize).map(item=>({...item,open_rate:ratio(item.unique_opens,item.delivered),click_rate:ratio(item.unique_clicks,item.delivered)}));
  const rawSegments=await sql<{id:string;name:string;campaigns:number;recipients:number;delivered:number;unique_opens:number;unique_clicks:number}[]>`
    SELECT s.id,s.name,count(DISTINCT c.id)::int AS campaigns,count(cr.id)::int AS recipients,
      count(cr.id) FILTER(WHERE cr.delivered_at IS NOT NULL)::int AS delivered,
      count(cr.id) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened') AND NOT e.is_automated))::int AS unique_opens,
      count(cr.id) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked') AND NOT e.is_automated))::int AS unique_clicks
    FROM campaigns c JOIN segments s ON c.target_type='segment' AND c.target_id=s.id JOIN campaign_recipients cr ON cr.campaign_id=c.id
    WHERE c.archived_at IS NULL AND COALESCE(c.started_at,c.created_at)>=${range.from} AND COALESCE(c.started_at,c.created_at)<${range.to}
      AND (${range.listId??null}::uuid IS NULL OR c.list_id=${range.listId??null}::uuid)
    GROUP BY s.id,s.name ORDER BY recipients DESC,s.name
  `;
  const segmentGroups=rawSegments.filter(item=>Number(item.recipients)>=minimumGroupSize).map(item=>({...item,open_rate:ratio(item.unique_opens,item.delivered),click_rate:ratio(item.unique_clicks,item.delivered)}));
  return {
    range,
    summary,
    comparison:{previous_range:priorRange,previous,changes:{delivered:change(summary.delivered,previous.delivered),open_rate:change(summary.open_rate,previous.open_rate),click_rate:change(summary.click_rate,previous.click_rate),unsubscribe_rate:change(ratio(summary.unsubscribed,summary.delivered),ratio(previous.unsubscribed,previous.delivered))}},
    benchmarks:{median_open_rate:median(rows.map(item=>item.open_rate)),median_click_rate:median(rows.map(item=>item.click_rate)),median_click_to_open_rate:median(rows.map(item=>item.click_to_open_rate))},
    daily,
    campaigns:rows,
    dimensions,
    field_breakdown:field?{field,minimum_group_size:minimumGroupSize,suppressed_recipients:rawFieldGroups.filter(item=>Number(item.recipients)<minimumGroupSize).reduce((sum,item)=>sum+Number(item.recipients),0),groups:fieldGroups}:null,
    segment_breakdown:{minimum_group_size:minimumGroupSize,suppressed_segments:rawSegments.length-segmentGroups.length,groups:segmentGroups},
    client_signals:await campaignClientSignals(range),
  };
}

export async function getTransactionalReport(range: Omit<ReportRange,"listId">) {
  const [summary] = await sql<{
    total:number;processed:number;sent:number;delivered:number;delayed:number;failed:number;bounced:number;complained:number;opened:number;clicked:number;automated_opens:number;automated_clicks:number;avg_processing_ms:number|null;p95_processing_ms:number|null;avg_delivery_ms:number|null;p95_delivery_ms:number|null;
  }[]>`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE processed_at IS NOT NULL)::int AS processed,
      count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
      count(*) FILTER (WHERE delivered_at IS NOT NULL)::int AS delivered,
      count(*) FILTER (WHERE status='delayed')::int AS delayed,
      count(*) FILTER (WHERE status='failed')::int AS failed,
      count(*) FILTER (WHERE status='bounced')::int AS bounced,
      count(*) FILTER (WHERE status='complained')::int AS complained,
      count(*) FILTER (WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=outbound_messages.id AND e.type IN('open','opened') AND NOT e.is_automated) OR (first_opened_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=outbound_messages.id AND e.type IN('open','opened'))))::int AS opened,
      count(*) FILTER (WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=outbound_messages.id AND e.type IN('click','clicked') AND NOT e.is_automated) OR (first_clicked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=outbound_messages.id AND e.type IN('click','clicked'))))::int AS clicked,
      (SELECT count(*)::int FROM email_events e JOIN outbound_messages tracked ON tracked.id=e.message_id WHERE tracked.kind='transactional' AND tracked.created_at>=${range.from} AND tracked.created_at<${range.to} AND e.type IN('open','opened') AND e.is_automated) AS automated_opens,
      (SELECT count(*)::int FROM email_events e JOIN outbound_messages tracked ON tracked.id=e.message_id WHERE tracked.kind='transactional' AND tracked.created_at>=${range.from} AND tracked.created_at<${range.to} AND e.type IN('click','clicked') AND e.is_automated) AS automated_clicks,
      avg(EXTRACT(epoch FROM (processed_at-accepted_at))*1000) FILTER (WHERE processed_at IS NOT NULL)::float AS avg_processing_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM (processed_at-accepted_at))*1000) FILTER (WHERE processed_at IS NOT NULL)::float AS p95_processing_ms,
      avg(EXTRACT(epoch FROM (delivered_at-accepted_at))*1000) FILTER (WHERE delivered_at IS NOT NULL)::float AS avg_delivery_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM (delivered_at-accepted_at))*1000) FILTER (WHERE delivered_at IS NOT NULL)::float AS p95_delivery_ms
    FROM outbound_messages WHERE kind='transactional' AND created_at>=${range.from} AND created_at<${range.to}
  `;
  const priorRange=previousRange(range);
  const[previousBase]=await sql<{total:number;sent:number;delivered:number;failed:number}[]>`
    SELECT count(*)::int AS total,count(*) FILTER(WHERE sent_at IS NOT NULL)::int AS sent,
      count(*) FILTER(WHERE delivered_at IS NOT NULL)::int AS delivered,count(*) FILTER(WHERE status='failed')::int AS failed
    FROM outbound_messages WHERE kind='transactional' AND created_at>=${priorRange.from} AND created_at<${priorRange.to}
  `;
  const current={...summary,delivery_rate:ratio(summary.delivered,summary.sent),failure_rate:ratio(summary.failed,summary.total)};
  const previous={...previousBase,delivery_rate:ratio(previousBase.delivered,previousBase.sent),failure_rate:ratio(previousBase.failed,previousBase.total)};
  const daily=await sql`
    SELECT date_trunc('day',m.created_at)::date AS date,count(*)::int AS total,
      count(*) FILTER(WHERE m.delivered_at IS NOT NULL)::int AS delivered,count(*) FILTER(WHERE m.status='failed')::int AS failed,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=m.id AND e.type IN('open','opened') AND NOT e.is_automated) OR (m.first_opened_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=m.id AND e.type IN('open','opened'))))::int AS opened,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=m.id AND e.type IN('click','clicked') AND NOT e.is_automated) OR (m.first_clicked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.message_id=m.id AND e.type IN('click','clicked'))))::int AS clicked
    FROM outbound_messages m WHERE m.kind='transactional' AND m.created_at>=${range.from} AND m.created_at<${range.to} GROUP BY 1 ORDER BY 1
  `;
  const statuses=await sql`SELECT status,count(*)::int AS count FROM outbound_messages WHERE kind='transactional' AND created_at>=${range.from} AND created_at<${range.to} GROUP BY status ORDER BY count DESC`;
  const templates=await sql`
    SELECT COALESCE(t.name,'HTML directo') AS name,count(*)::int AS total,
      count(*) FILTER(WHERE m.delivered_at IS NOT NULL)::int AS delivered,count(*) FILTER(WHERE m.status='failed')::int AS failed,
      avg(EXTRACT(epoch FROM (m.delivered_at-m.accepted_at))*1000) FILTER(WHERE m.delivered_at IS NOT NULL)::float AS avg_delivery_ms
    FROM outbound_messages m LEFT JOIN template_versions v ON v.id=m.template_version_id LEFT JOIN templates t ON t.id=v.template_id
    WHERE m.kind='transactional' AND m.created_at>=${range.from} AND m.created_at<${range.to} GROUP BY COALESCE(t.name,'HTML directo') ORDER BY total DESC LIMIT 20
  `;
  return {range,summary:current,comparison:{previous_range:priorRange,previous,changes:{total:change(current.total,previous.total),delivered:change(current.delivered,previous.delivered),delivery_rate:change(current.delivery_rate,previous.delivery_rate),failure_rate:change(current.failure_rate,previous.failure_rate)}},daily,statuses,templates};
}

export async function getAudienceReport(range: ReportRange) {
  const lists=await sql`
    SELECT l.id,l.name,
      count(s.id) FILTER(WHERE s.status='active')::int AS active,
      count(s.id) FILTER(WHERE s.status='pending')::int AS pending,
      count(s.id) FILTER(WHERE s.status='unsubscribed')::int AS unsubscribed,
      count(s.id) FILTER(WHERE s.status='archived')::int AS archived,
      count(s.id)::int AS total
    FROM lists l LEFT JOIN subscriptions s ON s.list_id=l.id WHERE l.status='active' AND (${range.listId ?? null}::uuid IS NULL OR l.id=${range.listId ?? null}::uuid)
    GROUP BY l.id ORDER BY l.name
  `;
  const daily=await sql`
    SELECT date_trunc('day',occurred_at)::date AS date,
      count(*) FILTER(WHERE action IN('subscribed','confirmed','resubscribed'))::int AS additions,
      count(*) FILTER(WHERE action='unsubscribed')::int AS removals
    FROM consent_events WHERE occurred_at>=${range.from} AND occurred_at<${range.to}
      AND (${range.listId ?? null}::uuid IS NULL OR list_id=${range.listId ?? null}::uuid)
    GROUP BY 1 ORDER BY 1
  `;
  const priorRange=previousRange(range);
  const[previousMovement]=await sql<{additions:number;removals:number}[]>`
    SELECT count(*) FILTER(WHERE action IN('subscribed','confirmed','resubscribed'))::int AS additions,
      count(*) FILTER(WHERE action='unsubscribed')::int AS removals
    FROM consent_events WHERE occurred_at>=${priorRange.from} AND occurred_at<${priorRange.to}
      AND (${range.listId??null}::uuid IS NULL OR list_id=${range.listId??null}::uuid)
  `;
  const sources=await sql`
    SELECT source,count(*)::int AS count FROM consent_events WHERE occurred_at>=${range.from} AND occurred_at<${range.to}
      AND action IN('subscribed','confirmed','resubscribed') AND (${range.listId ?? null}::uuid IS NULL OR list_id=${range.listId ?? null}::uuid)
    GROUP BY source ORDER BY count DESC LIMIT 20
  `;
  const totals=daily.reduce((acc,row)=>({additions:acc.additions+Number(row.additions),removals:acc.removals+Number(row.removals)}),{additions:0,removals:0});
  const suppression=await sql`SELECT status,reason,count(*)::int AS count FROM suppressions GROUP BY status,reason ORDER BY status,reason`;
  const summary={additions:totals.additions,removals:totals.removals,net:totals.additions-totals.removals,active:lists.reduce((sum,row)=>sum+Number(row.active),0),pending:lists.reduce((sum,row)=>sum+Number(row.pending),0),unsubscribed:lists.reduce((sum,row)=>sum+Number(row.unsubscribed),0)};
  const previous={...previousMovement,net:Number(previousMovement.additions)-Number(previousMovement.removals)};
  return {range,summary,comparison:{previous_range:priorRange,previous,changes:{additions:change(summary.additions,previous.additions),removals:change(summary.removals,previous.removals),net:change(summary.net,previous.net)}},daily,sources,lists,suppressions:suppression};
}

export async function getCampaignReport(campaignId:string,options:{status?:string|null;query?:string|null;page:number;limit:number}) {
  const [campaign]=await sql`
    SELECT c.*,l.name AS list_name,s.name AS segment_name FROM campaigns c LEFT JOIN lists l ON l.id=c.list_id LEFT JOIN segments s ON s.id=c.target_id
    WHERE c.id=${campaignId} AND c.archived_at IS NULL
  `;
  if(!campaign)return null;
  const [summary]=await sql<{
    total:number;sent:number;delivered:number;delayed:number;rejected:number;failed:number;unique_opens:number;total_opens:number;unique_clicks:number;total_clicks:number;bounced:number;complained:number;unsubscribed:number;automated_opens:number;automated_clicks:number;avg_delivery_ms:number|null;
  }[]>`
    SELECT count(*)::int AS total,count(*) FILTER(WHERE cr.sent_at IS NOT NULL)::int AS sent,
      count(*) FILTER(WHERE cr.delivered_at IS NOT NULL)::int AS delivered,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type='delivery_delayed'))::int AS delayed,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type='rejected'))::int AS rejected,
      count(*) FILTER(WHERE cr.status='failed')::int AS failed,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened') AND NOT e.is_automated) OR (cr.opened_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('open','opened'))))::int AS unique_opens,COALESCE(sum(cr.open_count),0)::int AS total_opens,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked') AND NOT e.is_automated) OR (cr.clicked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_events e WHERE e.recipient_id=cr.id AND e.type IN('click','clicked'))))::int AS unique_clicks,COALESCE(sum(cr.click_count),0)::int AS total_clicks,
      count(*) FILTER(WHERE cr.status='bounced')::int AS bounced,count(*) FILTER(WHERE cr.status='complained')::int AS complained,
      count(*) FILTER(WHERE cr.status='unsubscribed')::int AS unsubscribed,
      (SELECT count(*)::int FROM email_events e WHERE e.campaign_id=${campaignId} AND e.type IN('open','opened') AND e.is_automated) AS automated_opens,
      (SELECT count(*)::int FROM email_events e WHERE e.campaign_id=${campaignId} AND e.type IN('click','clicked') AND e.is_automated) AS automated_clicks,
      avg(EXTRACT(epoch FROM (cr.delivered_at-cr.sent_at))*1000) FILTER(WHERE cr.delivered_at IS NOT NULL AND cr.sent_at IS NOT NULL)::float AS avg_delivery_ms
    FROM campaign_recipients cr WHERE cr.campaign_id=${campaignId}
  `;
  const normalized={...summary,delivery_rate:ratio(summary.delivered,summary.sent),open_rate:ratio(summary.unique_opens,summary.delivered),click_rate:ratio(summary.unique_clicks,summary.delivered),click_to_open_rate:ratio(summary.unique_clicks,summary.unique_opens),bounce_rate:ratio(summary.bounced,summary.sent),complaint_rate:ratio(summary.complained,summary.delivered),unsubscribe_rate:ratio(summary.unsubscribed,summary.delivered)};
  const durationMs=Math.max(0,new Date(campaign.completed_at??new Date()).getTime()-new Date(campaign.started_at??campaign.created_at).getTime());
  const granularity=durationMs<=6*60*60*1000?"minute":durationMs<=7*24*60*60*1000?"hour":"day";
  const timeline=await sql`
    SELECT date_trunc(${granularity},occurred_at) AS bucket,
      count(*) FILTER(WHERE type IN('sent','send_succeeded'))::int AS sent,
      count(*) FILTER(WHERE type IN('delivery','delivered'))::int AS delivered,
      count(*) FILTER(WHERE type IN('open','opened') AND NOT is_automated)::int AS opens,
      count(DISTINCT recipient_id) FILTER(WHERE type IN('open','opened') AND NOT is_automated)::int AS unique_opens,
      count(*) FILTER(WHERE type IN('click','clicked') AND NOT is_automated)::int AS clicks,
      count(DISTINCT recipient_id) FILTER(WHERE type IN('click','clicked') AND NOT is_automated)::int AS unique_clicks,
      count(*) FILTER(WHERE type='bounced')::int AS bounced,count(*) FILTER(WHERE type='complained')::int AS complained,
      count(*) FILTER(WHERE type='unsubscribe')::int AS unsubscribed
    FROM email_events WHERE campaign_id=${campaignId} GROUP BY 1
    HAVING count(*) FILTER(WHERE type IN('sent','send_succeeded','delivery','delivered','bounced','complained','unsubscribe'))>0 OR count(*) FILTER(WHERE type IN('open','opened','click','clicked') AND NOT is_automated)>0
    ORDER BY 1
  `;
  const links=await sql`
    WITH urls AS (
      SELECT DISTINCT tl.original_url AS url FROM tracked_links tl JOIN outbound_messages m ON m.id=tl.message_id WHERE m.campaign_id=${campaignId}
      UNION SELECT DISTINCT link_url FROM email_events WHERE campaign_id=${campaignId} AND link_url IS NOT NULL
    )
    SELECT urls.url,
      CASE WHEN urls.url ILIKE '%unsubscribe%' THEN 'unsubscribe' WHEN urls.url ILIKE '%preference%' THEN 'preferences' ELSE 'content' END AS category,
      count(e.id) FILTER(WHERE e.type IN('click','clicked'))::int AS total_clicks,
      count(DISTINCT e.recipient_id) FILTER(WHERE e.type IN('click','clicked') AND NOT e.is_automated)::int AS unique_clicks,
      count(e.id) FILTER(WHERE e.type IN('click','clicked') AND e.is_automated)::int AS automated_clicks
    FROM urls LEFT JOIN email_events e ON e.campaign_id=${campaignId} AND e.link_url=urls.url GROUP BY urls.url ORDER BY unique_clicks DESC,total_clicks DESC,urls.url
  `;
  const statuses=await sql`SELECT status,count(*)::int AS count FROM campaign_recipients WHERE campaign_id=${campaignId} GROUP BY status ORDER BY count DESC`;
  const failures=await sql`SELECT COALESCE(NULLIF(failure_reason,''),'Sin detalle') AS reason,count(*)::int AS count FROM campaign_recipients WHERE campaign_id=${campaignId} AND (status='failed' OR failure_reason IS NOT NULL) GROUP BY 1 ORDER BY count DESC LIMIT 20`;
  const sources=await sql`SELECT COALESCE(NULLIF(s.source,''),'desconocido') AS source,count(*)::int AS count FROM campaign_recipients cr LEFT JOIN subscriptions s ON s.id=cr.subscription_id WHERE cr.campaign_id=${campaignId} GROUP BY 1 ORDER BY count DESC`;
  const recipientCount=(await sql<{count:number}[]>`SELECT count(*)::int AS count FROM campaign_recipients WHERE campaign_id=${campaignId} AND (${options.status??null}::text IS NULL OR status=${options.status??null}) AND (${options.query??null}::text IS NULL OR email ILIKE ${options.query?`%${options.query}%`:null})`)[0].count;
  const recipients=await sql`
    SELECT cr.id,cr.email,cr.status,cr.sent_at,cr.delivered_at,cr.opened_at,cr.clicked_at,cr.open_count,cr.click_count,cr.failure_reason,cr.experiment_phase,v.name AS variant_name,
      om.ses_message_id,om.failure_code FROM campaign_recipients cr LEFT JOIN campaign_variants v ON v.id=cr.variant_id LEFT JOIN outbound_messages om ON om.id=cr.outbound_message_id
    WHERE cr.campaign_id=${campaignId} AND (${options.status??null}::text IS NULL OR cr.status=${options.status??null}) AND (${options.query??null}::text IS NULL OR cr.email ILIKE ${options.query?`%${options.query}%`:null})
    ORDER BY cr.created_at,cr.id LIMIT ${options.limit} OFFSET ${(options.page-1)*options.limit}
  `;
  const [preview]=await sql<{id:string}[]>`SELECT id FROM campaign_recipients WHERE campaign_id=${campaignId} AND outbound_message_id IS NOT NULL ORDER BY created_at LIMIT 1`;
  return {campaign,summary:normalized,granularity,timeline,links,statuses,failures,audience_sources:sources,experiment:await getCampaignExperimentReport(campaignId),recipients,pagination:{page:options.page,limit:options.limit,total:recipientCount,pages:Math.max(1,Math.ceil(recipientCount/options.limit))},content_preview_url:preview?`/api/v1/campaigns/${campaignId}/recipients/${preview.id}/content?part=html`:null,privacy:{open_note:"Las aperturas pueden incluir precarga de imágenes y mecanismos de privacidad; se muestran como señal, no como lectura garantizada.",automated_events_excluded:true}};
}

export function csv(rows:(string|number|null|undefined)[][]) {
  return "\ufeff"+rows.map(row=>row.map(cell=>`"${String(cell??"").replaceAll('"','""')}"`).join(",")).join("\r\n");
}

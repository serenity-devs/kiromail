import { sql } from "./db";
import { buildSegmentFilter, type SegmentGroup, type SegmentRule } from "./segments";

export async function getBootstrapData() {
  const [overview] = await sql<{
    contacts: number; subscribed: number; campaigns: number; delivered: number; opened: number; clicked: number; bounced: number;
  }[]>`
    SELECT
      (SELECT count(*)::int FROM contacts WHERE merged_into_contact_id IS NULL AND anonymized_at IS NULL) AS contacts,
      (SELECT count(DISTINCT s.contact_id)::int FROM subscriptions s
        JOIN contacts c ON c.id = s.contact_id
        WHERE s.status = 'active' AND c.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM suppressions x WHERE lower(x.email)=lower(c.email) AND x.scope IN ('marketing','all') AND x.status='active')) AS subscribed,
      (SELECT count(*)::int FROM campaigns) AS campaigns,
      COALESCE((SELECT sum(delivered_count)::int FROM campaigns), 0) AS delivered,
      COALESCE((SELECT sum(open_count)::int FROM campaigns), 0) AS opened,
      COALESCE((SELECT sum(click_count)::int FROM campaigns), 0) AS clicked,
      COALESCE((SELECT sum(bounce_count)::int FROM campaigns), 0) AS bounced
  `;

  const contacts = await sql`
    SELECT c.*,
      COALESCE((SELECT json_agg(json_build_object(
          'id', l.id, 'name', l.name, 'color', l.color,
          'subscription_id', s.id, 'status', s.status, 'subscribed_at', s.subscribed_at,
          'unsubscribed_at', s.unsubscribed_at, 'custom_values', s.custom_values
        ) ORDER BY l.name)
        FROM subscriptions s JOIN lists l ON l.id = s.list_id WHERE s.contact_id = c.id), '[]') AS lists,
      COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
        FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.id), '[]') AS tags
    FROM contacts c WHERE c.merged_into_contact_id IS NULL AND c.anonymized_at IS NULL ORDER BY c.created_at DESC LIMIT 500
  `;
  const lists = await sql`
    SELECT l.*, count(s.contact_id) FILTER (WHERE s.status='active')::int AS contact_count,
      count(s.contact_id)::int AS total_subscription_count,
      (SELECT count(*)::int FROM list_fields f WHERE f.list_id=l.id AND f.status='active') AS field_count
    FROM lists l LEFT JOIN subscriptions s ON s.list_id = l.id
    WHERE l.status='active'
    GROUP BY l.id ORDER BY l.created_at ASC
  `;
  const tags = await sql`
    SELECT t.*, count(ct.contact_id)::int AS contact_count
    FROM tags t LEFT JOIN contact_tags ct ON ct.tag_id = t.id
    GROUP BY t.id ORDER BY t.name ASC
  `;
  const segmentRows = await sql<{ id: string; name: string; description: string; list_id:string|null; match_type: "all" | "any"; rules: SegmentRule[]; definition:SegmentGroup; status:string; created_at: Date; updated_at: Date }[]>`
    SELECT * FROM segments WHERE status='active' ORDER BY created_at ASC
  `;
  const segments = await Promise.all(segmentRows.map(async (segment) => {
    const definition=segment.definition?.children?.length?segment.definition:segment.rules;const filter = buildSegmentFilter(definition, segment.match_type,segment.list_id?2:1);
    const [count] = await sql.unsafe<{ count: number }[]>(`
      SELECT count(*)::int AS count FROM contacts c
      WHERE c.status = 'active'
        ${segment.list_id?"AND EXISTS(SELECT 1 FROM subscriptions base WHERE base.contact_id=c.id AND base.list_id::text=$1::text AND base.status='active')":""}
        AND NOT EXISTS (SELECT 1 FROM suppressions x WHERE lower(x.email)=lower(c.email) AND x.scope IN ('marketing','all') AND x.status='active')
        AND ${filter.where}
    `, segment.list_id?[segment.list_id,...filter.values]:filter.values);
    await sql.begin(async tx=>{await tx`UPDATE segments SET last_count=${count.count},last_count_at=now() WHERE id=${segment.id}`;await tx`INSERT INTO segment_count_history(segment_id,captured_on,contact_count)VALUES(${segment.id},CURRENT_DATE,${count.count})ON CONFLICT(segment_id,captured_on)DO UPDATE SET contact_count=EXCLUDED.contact_count,created_at=now()`;});
    return { ...segment, definition, contact_count: count.count };
  }));
  const templates = await sql`
    SELECT t.*, v.version_number AS published_version_number
    FROM templates t LEFT JOIN template_versions v ON v.id=t.published_version_id
    WHERE t.status <> 'archived' ORDER BY t.updated_at DESC
  `;
  const campaigns = await sql`
    SELECT c.*, t.name AS template_name, cv.version_number AS template_version_number,
      (SELECT json_build_object('id',e.id,'status',e.status,'winner_metric',e.winner_metric,'sample_percentage',e.sample_percentage,'winner_variant_id',e.winner_variant_id,'actual_sample_size',e.actual_sample_size,'remainder_size',e.remainder_size) FROM campaign_experiments e WHERE e.campaign_id=c.id) AS experiment,
      (SELECT json_build_object('action',ac.action,'comment',ac.comment,'campaign_version',ac.campaign_version,'created_at',ac.created_at,
        'actor_name',COALESCE(u.name,k.name,'Sistema')) FROM campaign_approval_comments ac
        LEFT JOIN users u ON u.id=ac.user_id LEFT JOIN api_keys k ON k.id=ac.api_key_id
        WHERE ac.campaign_id=c.id ORDER BY ac.created_at DESC,ac.id DESC LIMIT 1) AS latest_approval_comment,
      CASE
        WHEN c.target_type = 'non_openers' THEN 'No abiertos · ' || COALESCE((SELECT name FROM campaigns source WHERE source.id = c.target_id),'campaña original')
        WHEN c.target_type = 'tag' THEN (SELECT name FROM tags WHERE id = c.target_id)
        WHEN c.target_type = 'segment' THEN (SELECT name FROM segments WHERE id = c.target_id)
        WHEN c.list_id IS NOT NULL THEN (SELECT name FROM lists WHERE id = c.list_id)
        ELSE 'Todos los suscritos'
      END AS target_name
    FROM campaigns c
    LEFT JOIN templates t ON t.id = c.template_id
    LEFT JOIN template_versions cv ON cv.id = c.template_version_id
    ORDER BY c.created_at DESC LIMIT 100
  `;
  const [settings] = await sql`SELECT * FROM settings WHERE id = 1`;
  const activity = await sql`
    SELECT action, entity_type, entity_id, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT 8
  `;

  const transactional = await sql`
    SELECT id, to_email, to_name, subject, status, template_version_id, metadata,
      ses_message_id, mime_byte_size, accepted_at, processed_at, sent_at, delivered_at,
      first_opened_at, first_clicked_at, failure_reason, created_at
    FROM outbound_messages WHERE kind='transactional' ORDER BY created_at DESC LIMIT 100
  `;
  const [transactionalOverview] = await sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status IN ('sent','delivered'))::int AS sent,
      count(*) FILTER (WHERE status='delivered')::int AS delivered,
      count(*) FILTER (WHERE status='failed')::int AS failed
    FROM outbound_messages WHERE kind='transactional'
  `;

  return { overview, contacts, lists, tags, segments, templates, campaigns, transactional, transactionalOverview, settings, activity };
}

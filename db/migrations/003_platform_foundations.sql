-- Serenity Mail 1.1 foundations. This migration is deliberately additive where
-- practical and preserves legacy columns until all compatibility code is gone.

ALTER TABLE contact_lists RENAME TO subscriptions;
ALTER TABLE subscriptions ADD COLUMN id uuid DEFAULT gen_random_uuid();
ALTER TABLE subscriptions ALTER COLUMN id SET NOT NULL;
ALTER TABLE subscriptions DROP CONSTRAINT contact_lists_pkey;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_contact_list_unique UNIQUE (contact_id, list_id);
ALTER TABLE subscriptions ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('pending', 'active', 'unsubscribed', 'archived'));
ALTER TABLE subscriptions ADD COLUMN source text NOT NULL DEFAULT 'migrated';
ALTER TABLE subscriptions ADD COLUMN custom_values jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE subscriptions ADD COLUMN subscribed_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN confirmed_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN unsubscribed_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN reactivated_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN consent_text text NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN consent_ip inet;
ALTER TABLE subscriptions ADD COLUMN consent_user_agent text NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE subscriptions s
SET source = COALESCE(NULLIF(c.source, ''), 'migrated'), subscribed_at = s.created_at
FROM contacts c WHERE c.id = s.contact_id;
UPDATE subscriptions s
SET status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
FROM contacts c WHERE c.id = s.contact_id AND c.status = 'unsubscribed';
CREATE INDEX subscriptions_list_status_idx ON subscriptions (list_id, status, created_at DESC);
CREATE INDEX subscriptions_contact_status_idx ON subscriptions (contact_id, status);

ALTER TABLE lists ADD COLUMN key text;
UPDATE lists SET key = 'list_' || replace(id::text, '-', '') WHERE key IS NULL;
ALTER TABLE lists ALTER COLUMN key SET NOT NULL;
CREATE UNIQUE INDEX lists_key_unique ON lists (key);
ALTER TABLE lists ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE lists ADD CONSTRAINT lists_status_check CHECK (status IN ('active', 'archived'));
ALTER TABLE lists ADD COLUMN default_from_name text NOT NULL DEFAULT '';
ALTER TABLE lists ADD COLUMN default_from_email text NOT NULL DEFAULT '';
ALTER TABLE lists ADD COLUMN default_reply_to text NOT NULL DEFAULT '';
ALTER TABLE lists ADD COLUMN language text NOT NULL DEFAULT 'es';
ALTER TABLE lists ADD COLUMN legal_footer text NOT NULL DEFAULT '';
ALTER TABLE lists ADD COLUMN archived_at timestamptz;
ALTER TABLE lists ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE list_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('text', 'textarea', 'integer', 'decimal', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'email', 'url')),
  help_text text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT false,
  default_value jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'preference_center')),
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (list_id, key)
);
CREATE INDEX list_fields_list_position_idx ON list_fields (list_id, status, position);

CREATE TABLE consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('subscribed', 'confirmed', 'unsubscribed', 'resubscribed', 'consent_updated', 'archived')),
  source text NOT NULL,
  consent_text text NOT NULL DEFAULT '',
  legal_basis text NOT NULL DEFAULT '',
  ip inet,
  user_agent text NOT NULL DEFAULT '',
  actor_user_id uuid,
  api_key_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_events_contact_time_idx ON consent_events (contact_id, occurred_at DESC);
CREATE INDEX consent_events_subscription_time_idx ON consent_events (subscription_id, occurred_at DESC);
INSERT INTO consent_events (contact_id, subscription_id, list_id, action, source, consent_text, occurred_at)
SELECT contact_id, id, list_id,
  CASE WHEN status = 'unsubscribed' THEN 'unsubscribed' ELSE 'subscribed' END,
  source, consent_text, COALESCE(subscribed_at, created_at)
FROM subscriptions;

ALTER TABLE contacts DROP CONSTRAINT contacts_status_check;
ALTER TABLE suppressions ADD COLUMN scope text NOT NULL DEFAULT 'all';
ALTER TABLE suppressions ADD CONSTRAINT suppressions_scope_check CHECK (scope IN ('marketing', 'transactional', 'all'));
ALTER TABLE suppressions ADD COLUMN detail jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE suppressions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE suppressions SET scope = CASE WHEN reason = 'unsubscribe' THEN 'marketing' ELSE 'all' END;
DROP INDEX suppressions_email_lower_unique;
CREATE UNIQUE INDEX suppressions_email_scope_unique ON suppressions (lower(email), scope);
INSERT INTO suppressions (email, reason, source, scope, detail)
SELECT email, 'unsubscribe', 'legacy_global_status', 'marketing', '{"migrated":true}'::jsonb
FROM contacts WHERE status = 'unsubscribed'
ON CONFLICT DO NOTHING;
UPDATE contacts SET status = 'active' WHERE status IN ('subscribed', 'unsubscribed');
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check CHECK (status IN ('active', 'bounced', 'complained', 'blocked'));
ALTER TABLE contacts ADD COLUMN language text NOT NULL DEFAULT 'es';
ALTER TABLE contacts ADD COLUMN timezone text NOT NULL DEFAULT '';

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'analyst')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'disabled')),
  mfa_secret_encrypted text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip inet,
  user_agent text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX user_sessions_user_active_idx ON user_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE consent_events ADD CONSTRAINT consent_events_actor_user_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE segments ADD COLUMN list_id uuid REFERENCES lists(id) ON DELETE SET NULL;
ALTER TABLE segments ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE segments ADD CONSTRAINT segments_status_check CHECK (status IN ('active', 'archived'));
ALTER TABLE segments ADD COLUMN archived_at timestamptz;

ALTER TABLE templates ADD COLUMN key text;
UPDATE templates SET key = 'template_' || replace(id::text, '-', '') WHERE key IS NULL;
ALTER TABLE templates ALTER COLUMN key SET NOT NULL;
CREATE UNIQUE INDEX templates_key_unique ON templates (key);
ALTER TABLE templates ADD COLUMN channel text NOT NULL DEFAULT 'marketing';
ALTER TABLE templates ADD CONSTRAINT templates_channel_check CHECK (channel IN ('marketing', 'transactional'));
ALTER TABLE templates ADD COLUMN format text NOT NULL DEFAULT 'html';
ALTER TABLE templates ADD CONSTRAINT templates_format_check CHECK (format IN ('html', 'visual'));
ALTER TABLE templates ADD COLUMN status text NOT NULL DEFAULT 'published';
ALTER TABLE templates ADD CONSTRAINT templates_status_check CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE templates ADD COLUMN folder text NOT NULL DEFAULT '';
ALTER TABLE templates ADD COLUMN list_id uuid REFERENCES lists(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN variables_schema jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE templates ADD COLUMN archived_at timestamptz;

CREATE TABLE template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  source_format text NOT NULL DEFAULT 'html' CHECK (source_format IN ('html', 'visual')),
  subject text NOT NULL DEFAULT '',
  preview_text text NOT NULL DEFAULT '',
  html_content text NOT NULL,
  text_content text NOT NULL DEFAULT '',
  visual_document jsonb,
  variables_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (template_id, version_number)
);
CREATE INDEX template_versions_template_status_idx ON template_versions (template_id, status, version_number DESC);
INSERT INTO template_versions (template_id, version_number, status, source_format, subject, preview_text, html_content, text_content, variables_schema, created_at, published_at)
SELECT id, 1, 'published', format, subject, preview_text, html_content, text_content, variables_schema, created_at, updated_at
FROM templates;
ALTER TABLE templates ADD COLUMN published_version_id uuid REFERENCES template_versions(id) ON DELETE SET NULL;
UPDATE templates t SET published_version_id = v.id
FROM template_versions v WHERE v.template_id = t.id AND v.version_number = 1;

ALTER TABLE campaigns DROP CONSTRAINT campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft', 'pending_approval', 'scheduled', 'preparing', 'queued', 'sending', 'paused', 'completed', 'cancelled', 'failed'));
ALTER TABLE campaigns ADD COLUMN list_id uuid REFERENCES lists(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN template_version_id uuid REFERENCES template_versions(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN content_source text NOT NULL DEFAULT 'template';
ALTER TABLE campaigns ADD CONSTRAINT campaigns_content_source_check CHECK (content_source IN ('template', 'direct'));
ALTER TABLE campaigns ADD COLUMN html_content text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN text_content text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN exclusion_segment_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN track_opens boolean;
ALTER TABLE campaigns ADD COLUMN track_clicks boolean;
ALTER TABLE campaigns ADD COLUMN approved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN approved_at timestamptz;
UPDATE campaigns SET list_id = target_id WHERE target_type = 'list';
UPDATE campaigns c SET list_id = (SELECT id FROM lists ORDER BY created_at LIMIT 1) WHERE list_id IS NULL;
UPDATE campaigns c SET template_version_id = t.published_version_id,
  html_content = t.html_content, text_content = t.text_content
FROM templates t WHERE t.id = c.template_id;

CREATE TABLE content_blobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 text NOT NULL,
  storage_backend text NOT NULL CHECK (storage_backend IN ('filesystem', 's3')),
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  encoding text NOT NULL DEFAULT 'gzip' CHECK (encoding IN ('identity', 'gzip')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (sha256, mime_type, encoding)
);
CREATE INDEX content_blobs_expiry_idx ON content_blobs (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('campaign', 'transactional')),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_recipient_id uuid UNIQUE REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  template_version_id uuid REFERENCES template_versions(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  to_name text NOT NULL DEFAULT '',
  from_email text NOT NULL,
  from_name text NOT NULL DEFAULT '',
  reply_to text NOT NULL DEFAULT '',
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'queued', 'processing', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'cancelled')),
  html_blob_id uuid REFERENCES content_blobs(id) ON DELETE SET NULL,
  text_blob_id uuid REFERENCES content_blobs(id) ON DELETE SET NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  track_opens boolean NOT NULL DEFAULT false,
  track_clicks boolean NOT NULL DEFAULT false,
  idempotency_scope text,
  idempotency_key text,
  request_hash text,
  ses_message_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  failure_code text,
  failure_reason text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  processed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  first_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'campaign' AND campaign_id IS NOT NULL) OR kind = 'transactional')
);
CREATE UNIQUE INDEX outbound_messages_idempotency_unique ON outbound_messages (idempotency_scope, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX outbound_messages_status_queue_idx ON outbound_messages (kind, status, created_at);
CREATE INDEX outbound_messages_to_time_idx ON outbound_messages (lower(to_email), created_at DESC);
CREATE INDEX outbound_messages_ses_idx ON outbound_messages (ses_message_id) WHERE ses_message_id IS NOT NULL;
CREATE INDEX outbound_messages_template_idx ON outbound_messages (template_version_id, created_at DESC);
CREATE INDEX outbound_messages_metadata_gin_idx ON outbound_messages USING gin (metadata);

ALTER TABLE campaign_recipients ADD COLUMN subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL;
ALTER TABLE campaign_recipients ADD COLUMN outbound_message_id uuid REFERENCES outbound_messages(id) ON DELETE SET NULL;
INSERT INTO outbound_messages (
  kind, campaign_id, campaign_recipient_id, contact_id, template_version_id,
  to_email, to_name, from_email, from_name, reply_to, subject, status, variables,
  ses_message_id, accepted_at, queued_at, sent_at, delivered_at, first_opened_at, first_clicked_at, created_at
)
SELECT 'campaign', cr.campaign_id, cr.id, cr.contact_id, c.template_version_id,
  cr.email, COALESCE(cr.personalization->>'full_name', ''), c.from_email, c.from_name, c.reply_to, c.subject,
  CASE cr.status
    WHEN 'pending' THEN 'accepted' WHEN 'queued' THEN 'queued' WHEN 'sent' THEN 'sent'
    WHEN 'delivered' THEN 'delivered' WHEN 'bounced' THEN 'bounced' WHEN 'complained' THEN 'complained'
    WHEN 'failed' THEN 'failed' ELSE 'cancelled' END,
  cr.personalization, cr.ses_message_id, cr.created_at, cr.queued_at, cr.sent_at, cr.delivered_at,
  cr.opened_at, cr.clicked_at, cr.created_at
FROM campaign_recipients cr JOIN campaigns c ON c.id = cr.campaign_id;
UPDATE campaign_recipients cr SET outbound_message_id = om.id
FROM outbound_messages om WHERE om.campaign_recipient_id = cr.id;
CREATE UNIQUE INDEX campaign_recipients_outbound_message_unique ON campaign_recipients (outbound_message_id) WHERE outbound_message_id IS NOT NULL;

CREATE TABLE message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
  blob_id uuid NOT NULL REFERENCES content_blobs(id) ON DELETE RESTRICT,
  filename text NOT NULL,
  content_type text NOT NULL,
  disposition text NOT NULL DEFAULT 'attachment' CHECK (disposition IN ('attachment', 'inline')),
  content_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tracked_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
  original_url text NOT NULL,
  normalized_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, position)
);

ALTER TABLE email_events ADD COLUMN message_id uuid REFERENCES outbound_messages(id) ON DELETE CASCADE;
ALTER TABLE email_events ADD COLUMN source text NOT NULL DEFAULT 'local';
ALTER TABLE email_events ADD COLUMN received_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE email_events ADD COLUMN is_automated boolean NOT NULL DEFAULT false;
UPDATE email_events e SET message_id = om.id
FROM outbound_messages om WHERE om.campaign_recipient_id = e.recipient_id;
CREATE INDEX email_events_message_time_idx ON email_events (message_id, occurred_at DESC);
CREATE INDEX email_events_type_time_idx ON email_events (type, occurred_at DESC);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL UNIQUE,
  secret_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE consent_events ADD CONSTRAINT consent_events_api_key_fk FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;

CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  secret_encrypted text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failure_count integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id uuid REFERENCES email_events(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  response_status integer,
  response_body text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_pending_idx ON webhook_deliveries (status, next_attempt_at);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  width integer,
  height integer,
  folder text NOT NULL DEFAULT '',
  alt_text text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  href text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE settings ADD COLUMN timezone text NOT NULL DEFAULT 'Europe/Madrid';
ALTER TABLE settings ADD COLUMN locale text NOT NULL DEFAULT 'es-ES';
ALTER TABLE settings ADD COLUMN ses_marketing_configuration_set text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN ses_transactional_configuration_set text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN campaign_sending_rate integer NOT NULL DEFAULT 10;
ALTER TABLE settings ADD COLUMN transactional_reserved_rate integer NOT NULL DEFAULT 2;
ALTER TABLE settings ADD COLUMN transactional_track_opens boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN transactional_track_clicks boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN content_storage text NOT NULL DEFAULT 'filesystem';
ALTER TABLE settings ADD CONSTRAINT settings_content_storage_check CHECK (content_storage IN ('filesystem', 's3'));
ALTER TABLE settings ADD COLUMN content_retention_days integer NOT NULL DEFAULT 90;
UPDATE settings SET ses_marketing_configuration_set = ses_configuration_set,
  ses_transactional_configuration_set = ses_configuration_set,
  campaign_sending_rate = sending_rate;

ALTER TABLE audit_log ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN request_id text;
ALTER TABLE audit_log ADD COLUMN ip inet;

CREATE TABLE campaign_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','sampling','waiting','winner_selected','completed','cancelled')),
  sample_percentage integer NOT NULL CHECK (sample_percentage BETWEEN 10 AND 90),
  winner_metric text NOT NULL CHECK (winner_metric IN ('opens','clicks','manual')),
  wait_minutes integer NOT NULL DEFAULT 60 CHECK (wait_minutes BETWEEN 0 AND 10080),
  minimum_sample_size integer NOT NULL DEFAULT 100 CHECK (minimum_sample_size BETWEEN 2 AND 1000000),
  test_dimensions text[] NOT NULL DEFAULT '{}',
  actual_sample_size integer,
  remainder_size integer,
  winner_variant_id uuid,
  winner_source text CHECK (winner_source IN ('opens','clicks','manual')),
  sample_started_at timestamptz,
  sample_completed_at timestamptz,
  evaluation_at timestamptz,
  winner_selected_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES campaign_experiments(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 9),
  name text NOT NULL,
  weight integer NOT NULL CHECK (weight BETWEEN 1 AND 100),
  is_control boolean NOT NULL DEFAULT false,
  subject text NOT NULL,
  preview_text text NOT NULL DEFAULT '',
  from_name text NOT NULL,
  from_email text NOT NULL,
  reply_to text NOT NULL DEFAULT '',
  content_source text NOT NULL CHECK (content_source IN ('template','direct')),
  template_id uuid REFERENCES templates(id) ON DELETE SET NULL,
  template_version_id uuid REFERENCES template_versions(id) ON DELETE SET NULL,
  html_content text NOT NULL,
  text_content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(experiment_id,position)
);

ALTER TABLE campaign_experiments ADD CONSTRAINT campaign_experiments_winner_variant_fk
  FOREIGN KEY (winner_variant_id) REFERENCES campaign_variants(id) ON DELETE SET NULL;

ALTER TABLE campaign_recipients DROP CONSTRAINT campaign_recipients_status_check;
ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_recipients_status_check
  CHECK (status IN ('pending','held','queued','processing','sent','delivered','bounced','complained','unsubscribed','failed'));
ALTER TABLE campaign_recipients ADD COLUMN variant_id uuid REFERENCES campaign_variants(id) ON DELETE SET NULL;
ALTER TABLE campaign_recipients ADD COLUMN experiment_phase text CHECK (experiment_phase IN ('sample','remainder'));

CREATE INDEX campaign_experiments_due_idx ON campaign_experiments(status,evaluation_at)
  WHERE status='waiting';
CREATE INDEX campaign_variants_campaign_idx ON campaign_variants(campaign_id,position);
CREATE INDEX campaign_recipients_experiment_idx ON campaign_recipients(campaign_id,experiment_phase,variant_id,status);

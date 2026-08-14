"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  apiKeyScopeGroups,
  apiKeyScopeLabels,
  type ApiKeyScope,
} from "@/lib/api-key-scopes";
import { apiRequest } from "@/lib/client-api";
import { suggestEmailCorrection } from "@/lib/email-quality";
import {
  panelPath,
  panelSectionFromPathname,
  type PanelSection as Section,
} from "@/lib/panel-navigation";
import {
  defaultUiTheme,
  normalizeUiTheme,
  uiThemes,
  type UiThemeId,
} from "@/lib/ui-themes";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  ContactRound,
  Copy,
  FileText,
  Gauge,
  Layers3,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Folder,
  KeyRound,
  Mail,
  MailCheck,
  Menu,
  Monitor,
  MousePointerClick,
  Paperclip,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type EntityTag = {
  id: string;
  name: string;
  color: string;
  contact_count?: number;
};

const formValidationMessage =
  "Revisa los campos obligatorios o con un formato incorrecto.";
type ContactList = EntityTag & {
  subscription_id?: string;
  status?: string;
  custom_values?: Record<string, unknown>;
  subscribed_at?: string;
  unsubscribed_at?: string;
};
type Contact = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
  source: string;
  custom_fields: { country?: string; city?: string };
  created_at: string;
  last_activity_at?: string;
  lists: ContactList[];
  tags: EntityTag[];
};
type SegmentRule = {
  kind?: "rule";
  field: string;
  operator: string;
  value?: string | number | boolean | (string | number)[] | null;
  value_to?: string | number | null;
  list_id?: string;
  field_key?: string;
  field_type?: string;
  within_days?: number;
};
type SegmentGroup = {
  kind: "group";
  match: "all" | "any";
  children: SegmentNode[];
};
type SegmentNode = SegmentRule | SegmentGroup;
type Segment = {
  id: string;
  name: string;
  description: string;
  list_id?: string;
  list_name?: string;
  match_type: "all" | "any";
  rules: SegmentRule[];
  definition?: SegmentGroup;
  contact_count: number;
  last_count_at?: string;
  status?: "active" | "archived";
  archived_at?: string;
};
type Template = {
  id: string;
  key: string;
  channel: "marketing" | "transactional";
  format?: "html" | "visual";
  status: string;
  folder?: string;
  list_id?: string;
  published_version_id?: string;
  published_version_number?: number;
  duplicated_from_id?: string;
  name: string;
  subject: string;
  preview_text: string;
  html_content: string;
  text_content: string;
  author_name?: string;
  usage_count?: number;
  created_at?: string;
  archived_at?: string;
  updated_at: string;
};
type ApprovalComment = {
  id: string;
  action: "request" | "approve" | "reject" | "comment" | "invalidated";
  comment: string;
  campaign_version: number;
  actor_name: string;
  actor_kind: "user" | "api_key" | "system";
  created_at: string;
};
type ExperimentSummary = {
  id: string;
  status: string;
  winner_metric: "opens" | "clicks" | "manual";
  sample_percentage: number;
  winner_variant_id?: string;
  actual_sample_size?: number;
  remainder_size?: number;
};
type ExperimentVariant = {
  id?: string;
  position?: number;
  name: string;
  weight: number;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  html_content: string;
  text_content: string;
  sample_recipients?: number;
  sample_delivered?: number;
  sample_opened?: number;
  sample_clicked?: number;
  total_recipients?: number;
  total_delivered?: number;
  total_opened?: number;
  total_clicked?: number;
  sample_open_rate?: number;
  sample_click_rate?: number;
};
type ExperimentReport = ExperimentSummary & {
  wait_minutes: number;
  minimum_sample_size: number;
  test_dimensions: string[];
  evaluation_at?: string;
  winner_source?: string;
  variants: ExperimentVariant[];
  warnings: string[];
};
type Campaign = {
  id: string;
  version: number;
  name: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  template_id?: string;
  template_version_id?: string;
  content_source: "template" | "direct";
  html_content: string;
  text_content: string;
  list_id?: string;
  template_name: string;
  target_type: string;
  target_id: string | null;
  target_name: string;
  status: string;
  scheduled_at?: string;
  created_at: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  open_count: number;
  click_count: number;
  bounce_count: number;
  complaint_count: number;
  unsubscribe_count: number;
  approval_required: boolean;
  approved_at?: string;
  approved_version?: number;
  latest_approval_comment?: ApprovalComment;
  experiment?: ExperimentSummary;
};
type CampaignDetail = Campaign & {
  approval_comments: ApprovalComment[];
  experiment?: ExperimentReport;
};
type ReportSummary = {
  campaigns: number;
  recipients: number;
  sent: number;
  delivered: number;
  unique_opens: number;
  total_opens: number;
  unique_clicks: number;
  total_clicks: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  delayed: number;
  failed: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  click_to_open_rate: number;
};
type ReportCampaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  list_name?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  open_count: number;
  click_count: number;
  bounce_count: number;
  complaint_count: number;
  unsubscribe_count: number;
  unique_opens: number;
  unique_clicks: number;
  delayed_count: number;
  failed_count: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  click_to_open_rate: number;
};
type ReportChange = { delta: number; relative_change: number | null };
type SignalDimension = {
  available: boolean;
  sample_size: number;
  classified: number;
  coverage: number;
  minimum_sample_size: number;
  minimum_group_size: number;
  reason?: string;
  groups: { name: string; count: number; share: number }[];
};
type CampaignsReport = {
  summary: ReportSummary;
  comparison: {
    previous: ReportSummary;
    changes: {
      delivered: ReportChange;
      open_rate: ReportChange;
      click_rate: ReportChange;
      unsubscribe_rate: ReportChange;
    };
  };
  benchmarks: {
    median_open_rate: number;
    median_click_rate: number;
    median_click_to_open_rate: number;
  };
  daily: {
    date: string;
    campaigns: number;
    delivered: number;
    total_opens: number;
    total_clicks: number;
    bounced: number;
    unsubscribed: number;
  }[];
  campaigns: ReportCampaign[];
  dimensions: { key: string; label: string; type: string }[];
  field_breakdown?: {
    field: { key: string; label: string; type: string };
    minimum_group_size: number;
    suppressed_recipients: number;
    groups: {
      value: string;
      recipients: number;
      delivered: number;
      unique_opens: number;
      unique_clicks: number;
      open_rate: number;
      click_rate: number;
    }[];
  };
  segment_breakdown: {
    minimum_group_size: number;
    suppressed_segments: number;
    groups: {
      id: string;
      name: string;
      campaigns: number;
      recipients: number;
      delivered: number;
      unique_opens: number;
      unique_clicks: number;
      open_rate: number;
      click_rate: number;
    }[];
  };
  client_signals: {
    clients: SignalDimension;
    devices: SignalDimension;
    note: string;
  };
};
type TransactionalReport = {
  summary: {
    total: number;
    processed: number;
    sent: number;
    delivered: number;
    delayed: number;
    failed: number;
    bounced: number;
    complained: number;
    opened: number;
    clicked: number;
    automated_opens: number;
    automated_clicks: number;
    avg_processing_ms?: number;
    p95_processing_ms?: number;
    avg_delivery_ms?: number;
    p95_delivery_ms?: number;
    delivery_rate: number;
    failure_rate: number;
  };
  comparison: {
    previous: {
      total: number;
      sent: number;
      delivered: number;
      failed: number;
      delivery_rate: number;
      failure_rate: number;
    };
    changes: {
      total: ReportChange;
      delivered: ReportChange;
      delivery_rate: ReportChange;
      failure_rate: ReportChange;
    };
  };
  daily: {
    date: string;
    total: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
  }[];
  statuses: { status: string; count: number }[];
  templates: {
    name: string;
    total: number;
    delivered: number;
    failed: number;
    avg_delivery_ms?: number;
  }[];
};
type AudienceReport = {
  summary: {
    additions: number;
    removals: number;
    net: number;
    active: number;
    pending: number;
    unsubscribed: number;
  };
  comparison: {
    previous: { additions: number; removals: number; net: number };
    changes: {
      additions: ReportChange;
      removals: ReportChange;
      net: ReportChange;
    };
  };
  daily: { date: string; additions: number; removals: number }[];
  sources: { source: string; count: number }[];
  lists: {
    id: string;
    name: string;
    active: number;
    pending: number;
    unsubscribed: number;
    archived: number;
    total: number;
  }[];
  suppressions: { status: string; reason: string; count: number }[];
};
type CampaignAnalytics = {
  campaign: Campaign & {
    list_name?: string;
    segment_name?: string;
    started_at?: string;
    completed_at?: string;
  };
  summary: {
    total: number;
    sent: number;
    delivered: number;
    delayed: number;
    rejected: number;
    failed: number;
    unique_opens: number;
    total_opens: number;
    unique_clicks: number;
    total_clicks: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
    automated_opens: number;
    automated_clicks: number;
    avg_delivery_ms?: number;
    delivery_rate: number;
    open_rate: number;
    click_rate: number;
    click_to_open_rate: number;
    bounce_rate: number;
    complaint_rate: number;
    unsubscribe_rate: number;
  };
  granularity: string;
  timeline: {
    bucket: string;
    sent: number;
    delivered: number;
    opens: number;
    unique_opens: number;
    clicks: number;
    unique_clicks: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
  }[];
  links: {
    url: string;
    category: "content" | "preferences" | "unsubscribe";
    total_clicks: number;
    unique_clicks: number;
    automated_clicks: number;
  }[];
  statuses: { status: string; count: number }[];
  failures: { reason: string; count: number }[];
  audience_sources: { source: string; count: number }[];
  experiment?: ExperimentReport;
  recipients: {
    id: string;
    email: string;
    status: string;
    sent_at?: string;
    delivered_at?: string;
    opened_at?: string;
    clicked_at?: string;
    open_count: number;
    click_count: number;
    failure_reason?: string;
    variant_name?: string;
    ses_message_id?: string;
  }[];
  pagination: { page: number; limit: number; total: number; pages: number };
  content_preview_url?: string;
  privacy: { open_note: string; automated_events_excluded: boolean };
};
type TransactionalMessage = {
  id: string;
  to_email: string;
  to_name: string;
  subject: string;
  status: string;
  template_version_id?: string;
  metadata: Record<string, unknown>;
  ses_message_id?: string;
  mime_byte_size?: number;
  accepted_at: string;
  processed_at?: string;
  sent_at?: string;
  delivered_at?: string;
  first_opened_at?: string;
  first_clicked_at?: string;
  failure_reason?: string;
  created_at: string;
};
type TransactionalEvent = {
  id: string;
  type: string;
  source: string;
  link_url?: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};
type TransactionalAttachment = {
  id: string;
  asset_id: string;
  filename: string;
  content_type: string;
  disposition: "attachment" | "inline";
  content_id?: string;
  byte_size?: number;
};
type TransactionalAttempt = {
  id: string;
  attempt_number: number;
  kind: "automatic" | "manual_retry";
  status: "started" | "succeeded" | "failed";
  transport: string;
  provider_message_id?: string;
  error_code?: string;
  error_message?: string;
  started_at: string;
  finished_at?: string;
};
type TransactionalDetail = TransactionalMessage & {
  from_email: string;
  from_name: string;
  reply_to: string;
  variables: Record<string, unknown>;
  attempt_count: number;
  batch_id?: string;
  batch_position?: number;
  retry_of_message_id?: string;
  has_mime: boolean;
  events: TransactionalEvent[];
  attachments: TransactionalAttachment[];
  attempts: TransactionalAttempt[];
  can_retry: boolean;
  html_url: string;
  text_url: string;
};
type DataJob = {
  id: string;
  status: string;
  progress: number;
  total_rows: number;
  processed_rows: number;
  result: Record<string, number>;
  error?: string;
  has_errors?: boolean;
  downloadable?: boolean;
  rollback_at?: string;
  rejections?: { row_number: number; email: string; reason: string }[];
};
type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor" | "analyst";
  require_password_change: boolean;
  mfa_enabled: boolean;
};
type UserSummary = CurrentUser & {
  status: string;
  mfa_enabled: boolean;
  last_login_at?: string;
  created_at: string;
  active_sessions: number;
};
type SessionSummary = {
  id: string;
  label: string;
  ip?: string;
  user_agent: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
};
type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  created_by_name?: string | null;
};
type CreatedApiKey = ApiKeySummary & { token: string };
type ListField = {
  id: string;
  key: string;
  label: string;
  type: string;
  help_text: string;
  required: boolean;
  default_value?: unknown;
  options: (string | number)[];
  validation: Record<string, unknown>;
  visibility: "private" | "preference_center";
  position: number;
  status: string;
  dependencies?: {
    segments: { id: string; name: string; status: string }[];
    import_jobs: number;
    templates: { id: string; name: string }[];
  };
};
type ListSummary = EntityTag & {
  etag?: string;
  key: string;
  description: string;
  total_subscription_count?: number;
  field_count?: number;
  active_subscriptions?: number;
  status?: "active" | "archived";
  archived_at?: string;
};
type ListDetail = ListSummary & {
  default_from_name: string;
  default_from_email: string;
  default_reply_to: string;
  language: string;
  legal_footer: string;
  public_signup_enabled: boolean;
  double_opt_in: boolean;
  preference_center_visible: boolean;
  consent_text_default: string;
  fields: ListField[];
  stats: { active: number; unsubscribed: number; total: number };
};
type ListSubscription = {
  id: string;
  etag?: string;
  status: "pending" | "active" | "unsubscribed" | "archived";
  source: string;
  fields: Record<string, unknown>;
  subscribed_at?: string;
  confirmed_at?: string;
  unsubscribed_at?: string;
  reactivated_at?: string;
  created_at: string;
  updated_at: string;
  contact_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  language: string;
  timezone: string;
  contact_fields: Record<string, unknown>;
  contact_status: string;
};
type Suppression = {
  id: string;
  email: string;
  reason: string;
  source: string;
  scope: string;
  status: "active" | "resolved";
  detail: Record<string, unknown>;
  resolution_note: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  resolved_by_name?: string;
};
type SettingsData = {
  organization_name: string;
  ui_theme: UiThemeId;
  default_from_name: string;
  default_from_email: string;
  default_reply_to: string;
  aws_region: string;
  ses_configuration_set: string;
  ses_marketing_configuration_set: string;
  ses_transactional_configuration_set: string;
  mail_transport: "smtp" | "ses";
  sending_rate: number;
  campaign_sending_rate: number;
  transactional_reserved_rate: number;
  physical_address: string;
  track_opens: boolean;
  track_clicks: boolean;
  transactional_track_opens: boolean;
  transactional_track_clicks: boolean;
  timezone: string;
  content_retention_days: number;
  content_storage: "filesystem" | "s3";
  event_retention_days: number;
  audit_retention_days: number;
  import_retention_days: number;
  personal_data_retention_days: number;
  ses_tracking_source: "local" | "ses";
  ses_suppression_sync_enabled: boolean;
  ses_suppression_sync_mode: "import" | "bidirectional";
  bounce_alert_threshold: number;
  complaint_alert_threshold: number;
  delay_alert_threshold: number;
  allowed_sender_domains: string[];
  global_sending_paused: boolean;
};
type HealthCheck = {
  key: string;
  label: string;
  status: "pass" | "warning" | "fail" | "info";
  detail: string;
};
type DeliverabilityMetric = {
  channel: string;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  delayed: number;
  rejected: number;
  bounce_rate: number;
  complaint_rate: number;
  delay_rate: number;
};
type DeliverabilityDashboard = {
  mode: {
    transport: "smtp" | "ses";
    configured_transport: string;
    environment_override?: string;
    region: string;
    region_override?: string;
    local: boolean;
    sending_paused: boolean;
    tracking_source: "local" | "ses";
  };
  health?: {
    status: "local" | "healthy" | "warning" | "error";
    checked_at: string;
    error_message?: string;
    account: {
      production_access?: boolean;
      sending_enabled?: boolean;
      enforcement_status?: string;
      quota?: {
        max_24_hour_send?: number;
        max_send_rate?: number;
        sent_last_24_hours?: number;
      };
    };
    identities: {
      name: string;
      type: string;
      sending_enabled: boolean;
      verification_status: string;
      verified_for_sending: boolean;
      dkim_status?: string;
      mail_from_domain?: string;
      mail_from_status?: string;
    }[];
    configuration_sets: {
      name: string;
      destinations: {
        name: string;
        enabled: boolean;
        event_types: string[];
        sns_topic_arn?: string;
      }[];
    }[];
    checks: HealthCheck[];
  };
  reputation: {
    seven_days: { all: DeliverabilityMetric; channels: DeliverabilityMetric[] };
    thirty_days: {
      all: DeliverabilityMetric;
      channels: DeliverabilityMetric[];
    };
    trend: {
      date: string;
      sent: number;
      delivered: number;
      bounced: number;
      complained: number;
      delayed: number;
    }[];
    risks: {
      campaigns: {
        id: string;
        name: string;
        sent: number;
        bounced: number;
        complained: number;
        bounce_rate: number;
        complaint_rate: number;
      }[];
      templates: {
        name: string;
        sent: number;
        bounced: number;
        complained: number;
      }[];
    };
  };
  alerts: {
    id: string;
    type: string;
    channel: string;
    severity: string;
    status: string;
    title: string;
    detail: Record<string, unknown>;
    last_seen_at: string;
  }[];
  suppressions: {
    summary: { scope: string; reason: string; status: string; count: number }[];
    sync_enabled: boolean;
    sync_mode: string;
    last_sync?: {
      status: string;
      started_at: string;
      imported_count: number;
      exported_count: number;
    };
  };
  thresholds: { bounce: number; complaint: number; delay: number };
  guidance: {
    postmaster_url: string;
    dmarc_url: string;
    vdm_optional: boolean;
  };
};
type OperationsDashboard = {
  configuration: {
    production: boolean;
    ready: boolean;
    checks: { key: string; ok: boolean; required: boolean; detail: string }[];
  };
  queues: Record<string, Record<string, number>>;
  workers: {
    service: string;
    instance_id: string;
    queues: Record<string, unknown>;
    started_at: string;
    heartbeat_at: string;
    healthy: boolean;
  }[];
  storage: {
    storage_backend: string;
    objects: number;
    bytes: number;
    expired: number;
  }[];
  database: { name: string; bytes: number };
  runs: {
    id: string;
    type: string;
    status: string;
    detail: Record<string, unknown>;
    error?: string;
    started_at: string;
    completed_at?: string;
  }[];
  dead_letters: {
    id: string;
    queue_name: string;
    entity_type: string;
    entity_id: string;
    error: string;
    attempts: number;
    status: string;
    failed_at: string;
  }[];
};
type AppData = {
  overview: {
    contacts: number;
    subscribed: number;
    campaigns: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  };
  contacts: Contact[];
  lists: ListSummary[];
  tags: EntityTag[];
  segments: Segment[];
  templates: Template[];
  campaigns: Campaign[];
  transactional: TransactionalMessage[];
  transactionalOverview: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
  };
  settings: SettingsData;
  activity: {
    action: string;
    entity_type: string;
    created_at: string;
    detail: Record<string, unknown>;
  }[];
  currentUser: CurrentUser;
};
const nav: { id: Section; label: string; icon: typeof Mail }[] = [
  { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { id: "contacts", label: "Suscriptores", icon: ContactRound },
  { id: "audiences", label: "Audiencias", icon: ListFilter },
  { id: "templates", label: "Plantillas", icon: FileText },
  { id: "transactional", label: "Transaccionales", icon: MailCheck },
  { id: "campaigns", label: "Campañas", icon: Send },
  { id: "reports", label: "Informes", icon: BarChart3 },
  { id: "deliverability", label: "Entregabilidad", icon: Gauge },
  { id: "operations", label: "Operaciones", icon: Monitor },
  { id: "settings", label: "Ajustes", icon: Settings },
];

function roleCanOpenSection(role: CurrentUser["role"], section: Section) {
  if (role === "analyst" && ["contacts", "audiences", "templates", "transactional"].includes(section)) return false;
  return section !== "operations" || role === "admin";
}

const statusLabel: Record<string, string> = {
  active: "Activo",
  archived: "Archivado",
  pending: "Pendiente",
  pending_approval: "Pendiente de aprobación",
  running: "En proceso",
  accepted: "Aceptado",
  queued: "En cola",
  processing: "Procesando",
  processed: "Procesado",
  sent: "Enviado",
  delivered: "Entregado",
  delayed: "Retrasado",
  opened: "Abierto",
  clicked: "Clic",
  subscribed: "Suscrito",
  unsubscribed: "Baja",
  bounced: "Rebote",
  complained: "Queja",
  blocked: "Bloqueado",
  draft: "Borrador",
  scheduled: "Programada",
  sending: "Enviando",
  paused: "Pausada",
  completed: "Completada",
  cancelled: "Cancelada",
  failed: "Con errores",
};
const normalizeImportHeader = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const number = new Intl.NumberFormat("es-ES");
const date = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const api = apiRequest;

export function MailApp() {
  const router = useRouter();
  const pathname = usePathname();
  const section = panelSectionFromPathname(pathname) ?? "dashboard";
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  async function refresh(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      setData(await api<AppData>("/api/bootstrap"));
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar";
      if (message === "Sesión caducada") router.replace("/login");
      else setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Loading the server-owned application state is the purpose of this mount effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // The initial load intentionally runs once; subsequent refreshes are action-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!data) return;
    const theme = normalizeUiTheme(data.settings.ui_theme);
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("kiromail-theme", theme);
  }, [data]);
  useEffect(() => {
    if (data && !roleCanOpenSection(data.currentUser.role, section)) router.replace("/");
  }, [data, router, section]);
  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  function goToSection(nextSection: Section) {
    router.push(panelPath(nextSection));
    setMobileOpen(false);
  }

  const title = nav.find((item) => item.id === section)?.label ?? "Inicio";
  const role = data?.currentUser.role;
  const visibleNav = nav.filter(
    (item) => !role || roleCanOpenSection(role, item.id),
  );
  const primaryNav = visibleNav.filter(
    (item) => !["deliverability", "operations", "settings"].includes(item.id),
  );
  const systemNav = visibleNav.filter((item) =>
    ["deliverability", "operations", "settings"].includes(item.id),
  );
  const canEdit = role !== "analyst";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Kiro<b>Mail</b>
          </span>
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={19} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">SS</span>
          <span>
            <small>Espacio de trabajo</small>
            <strong>
              {data?.settings.organization_name ?? "KiroMail Studio"}
            </strong>
          </span>
          <ChevronDown size={15} />
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <p className="nav-kicker">Tu espacio</p>
          {primaryNav.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => goToSection(item.id)}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.id === "campaigns" && data && (
                <small>
                  {
                    data.campaigns.filter((campaign) =>
                      ["draft", "pending_approval", "scheduled"].includes(
                        campaign.status,
                      ),
                    ).length
                  }
                </small>
              )}
            </button>
          ))}
          <p className="nav-kicker nav-kicker-bottom">Sistema</p>
          {systemNav.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => goToSection(item.id)}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="ses-mini">
            <span className="live-dot" />
            <div>
              <strong>
                {data?.settings.mail_transport === "ses"
                  ? "Amazon SES"
                  : "Buzón local"}
              </strong>
              <small>
                {data?.settings.mail_transport === "ses"
                  ? data.settings.aws_region
                  : "Mailpit · conectado"}
              </small>
            </div>
          </div>
          <button className="user-row" onClick={logout}>
            <span className="user-avatar">
              {data?.currentUser.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() || "U"}
            </span>
            <span>
              <strong>{data?.currentUser.name || "Usuario"}</strong>
              <small>
                {data?.currentUser.role === "admin"
                  ? "Administrador"
                  : data?.currentUser.role === "editor"
                    ? "Editor"
                    : "Analista"}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button menu-button"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <span className="topbar-kicker">KiroMail</span>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="connection-pill">
              <span className="live-dot" /> Sistema operativo
            </span>
            {canEdit && (
              <button
                className="button button-primary"
                onClick={() => setComposeOpen(true)}
              >
                <Plus size={17} /> Nueva campaña
              </button>
            )}
          </div>
        </header>

        <div className="page-body">
          {loading && !data ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} retry={() => refresh()} />
          ) : (
            data && (
              <>
                {section === "dashboard" && (
                  <Dashboard
                    data={data}
                    go={goToSection}
                    compose={() => setComposeOpen(true)}
                  />
                )}
                {section === "contacts" && (
                  <ContactsView
                    data={data}
                    refresh={() => refresh(true)}
                    notify={notify}
                  />
                )}
                {section === "audiences" && (
                  <AudiencesView
                    data={data}
                    refresh={() => refresh(true)}
                    notify={notify}
                  />
                )}
                {section === "templates" && (
                  <TemplatesView
                    data={data}
                    refresh={() => refresh(true)}
                    notify={notify}
                  />
                )}
                {section === "transactional" && (
                  <TransactionalView
                    data={data}
                    refresh={() => refresh(true)}
                    notify={notify}
                  />
                )}
                {section === "campaigns" && (
                  <CampaignsView
                    data={data}
                    refresh={() => refresh(true)}
                    notify={notify}
                    compose={() => setComposeOpen(true)}
                  />
                )}
                {section === "reports" && <ReportsView data={data} />}
                {section === "deliverability" && (
                  <DeliverabilityView data={data} notify={notify} />
                )}
                {section === "operations" &&
                  data.currentUser.role === "admin" && (
                    <OperationsView notify={notify} />
                  )}
                {section === "settings" && (
                  <SettingsView
                    data={data}
                    refresh={() => refresh(true)}
                    notify={notify}
                  />
                )}
              </>
            )
          )}
        </div>
      </main>
      {composeOpen && data && canEdit && (
        <CampaignModal
          data={data}
          close={() => setComposeOpen(false)}
          done={async (message) => {
            setComposeOpen(false);
            await refresh(true);
            notify(message);
            goToSection("campaigns");
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <CircleCheck size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-page">
      <div className="loading-mark" aria-hidden="true" />
      <p>Preparando tu espacio…</p>
    </div>
  );
}

function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="empty-state">
      <CircleAlert size={28} />
      <h2>No hemos podido cargar los datos</h2>
      <p>{message}</p>
      <button className="button button-secondary" onClick={retry}>
        <RefreshCw size={16} /> Reintentar
      </button>
    </div>
  );
}

function Dashboard({
  data,
  go,
  compose,
}: {
  data: AppData;
  go: (section: Section) => void;
  compose: () => void;
}) {
  const { overview } = data;
  const openRate = overview.delivered
    ? Math.round((overview.opened / overview.delivered) * 1000) / 10
    : 0;
  const clickRate = overview.delivered
    ? Math.round((overview.clicked / overview.delivered) * 1000) / 10
    : 0;
  const bounceRate =
    overview.delivered + overview.bounced
      ? Math.round(
          (overview.bounced / (overview.delivered + overview.bounced)) * 1000,
        ) / 10
      : 0;
  const recent = data.campaigns.slice(0, 4);
  const completed = data.campaigns.find(
    (campaign) => campaign.status === "completed",
  );
  const canEdit = data.currentUser.role !== "analyst";
  return (
    <div className="dashboard-view">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">Martes, día de crear</p>
          <h2>Buenos días.</h2>
          <p>Tu próxima campaña está a unos pocos pasos.</p>
        </div>
        {canEdit && (
          <div className="welcome-actions">
            <button
              className="button button-secondary"
              onClick={() => go("contacts")}
            >
              <Upload size={16} /> Importar suscriptores
            </button>
            <button className="button button-primary" onClick={compose}>
              <Sparkles size={16} /> Crear campaña
            </button>
          </div>
        )}
      </section>
      <section className="metric-grid">
        <Metric
          icon={Users}
          label="Suscriptores activos"
          value={number.format(overview.subscribed)}
          detail={`${number.format(overview.contacts - overview.subscribed)} no enviables`}
          tone="forest"
        />
        <Metric
          icon={MailCheck}
          label="Entregados"
          value={number.format(overview.delivered)}
          detail="Histórico total"
          tone="clay"
        />
        <Metric
          icon={Activity}
          label="Tasa de apertura"
          value={`${openRate}%`}
          detail="Sobre entregados"
          tone="violet"
        />
        <Metric
          icon={MousePointerClick}
          label="Tasa de clic"
          value={`${clickRate}%`}
          detail="Sobre entregados"
          tone="gold"
        />
      </section>
      <div className="dashboard-columns">
        <section className="panel campaign-performance">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Último envío</p>
              <h3>{completed?.name ?? "Aún no hay envíos"}</h3>
            </div>
            <button className="text-button" onClick={() => go("reports")}>
              Ver informe <ArrowRight size={15} />
            </button>
          </div>
          {completed ? (
            <>
              <div className="performance-summary">
                <div>
                  <strong>{number.format(completed.delivered_count)}</strong>
                  <span>entregados</span>
                </div>
                <div>
                  <strong>
                    {completed.delivered_count
                      ? Math.round(
                          (completed.open_count / completed.delivered_count) *
                            100,
                        )
                      : 0}
                    %
                  </strong>
                  <span>aperturas</span>
                </div>
                <div>
                  <strong>
                    {completed.delivered_count
                      ? Math.round(
                          (completed.click_count / completed.delivered_count) *
                            100,
                        )
                      : 0}
                    %
                  </strong>
                  <span>clics</span>
                </div>
              </div>
              <div className="funnel-bars">
                <FunnelBar
                  label="Entregados"
                  value={completed.delivered_count}
                  max={completed.total_recipients}
                  color="#315c5b"
                />
                <FunnelBar
                  label="Abiertos"
                  value={completed.open_count}
                  max={completed.total_recipients}
                  color="#d38464"
                />
                <FunnelBar
                  label="Clics"
                  value={completed.click_count}
                  max={completed.total_recipients}
                  color="#d0a04a"
                />
              </div>
            </>
          ) : (
            <p className="muted">
              Cuando completes tu primer envío verás aquí su rendimiento.
            </p>
          )}
        </section>
        <section className="panel delivery-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Salud de envío</p>
              <h3>Todo en orden</h3>
            </div>
            <span className="status-badge success">
              <CircleCheck size={14} /> Saludable
            </span>
          </div>
          <div className="health-score">
            <div className="health-ring">
              <span>{Math.max(0, Math.round(100 - bounceRate * 5))}</span>
              <small>/ 100</small>
            </div>
            <div>
              <strong>Buena entregabilidad</strong>
              <p>
                Los rebotes están en {bounceRate}%. Mantén tu audiencia limpia.
              </p>
            </div>
          </div>
          <div className="health-details">
            <span>
              <i className="dot forest" /> Rebotes <b>{bounceRate}%</b>
            </span>
            <span>
              <i className="dot clay" /> Quejas{" "}
              <b>{completed?.complaint_count ?? 0}</b>
            </span>
            <span>
              <i className="dot violet" /> Transporte{" "}
              <b>{data.settings.mail_transport === "ses" ? "SES" : "Local"}</b>
            </span>
          </div>
        </section>
      </div>
      <section className="panel recent-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Actividad</p>
            <h3>Campañas recientes</h3>
          </div>
          <button className="text-button" onClick={() => go("campaigns")}>
            Ver todas <ArrowRight size={15} />
          </button>
        </div>
        <div className="campaign-list">
          {recent.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}>
        <Icon size={19} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function FunnelBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="funnel-row">
      <span>{label}</span>
      <div>
        <i style={{ width: `${width}%`, background: color }} />
      </div>
      <strong>{number.format(value)}</strong>
    </div>
  );
}

function CampaignRow({
  campaign,
  actions,
}: {
  campaign: Campaign;
  actions?: React.ReactNode;
}) {
  return (
    <div className="campaign-row">
      <span className={`campaign-icon status-${campaign.status}`}>
        <Mail size={17} />
      </span>
      <div className="campaign-main">
        <strong>{campaign.name}</strong>
        <small>{campaign.subject}</small>
      </div>
      <span className={`status-badge ${campaign.status}`}>
        {statusLabel[campaign.status] ?? campaign.status}
      </span>
      <div className="campaign-audience">
        <Users size={14} /> {campaign.target_name}
      </div>
      <div className="campaign-date">
        {campaign.scheduled_at
          ? date.format(new Date(campaign.scheduled_at))
          : date.format(new Date(campaign.created_at))}
      </div>
      {actions}
    </div>
  );
}

function ContactsView({ data, refresh, notify }: ViewProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [list, setList] = useState("all");
  const [editing, setEditing] = useState<Contact | null | "new">(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [privacyContact, setPrivacyContact] = useState<Contact | null>(null);
  const filtered = useMemo(
    () =>
      data.contacts.filter((contact) => {
        const haystack =
          `${contact.first_name} ${contact.last_name} ${contact.email} ${contact.custom_fields?.city ?? ""} ${contact.custom_fields?.country ?? ""}`.toLowerCase();
        const matchesStatus =
          status === "all" ||
          (status === "active"
            ? contact.status === "active" &&
              contact.lists.some((item) => item.status === "active")
            : status === "unsubscribed"
              ? contact.lists.some((item) => item.status === "unsubscribed")
              : contact.status === status);
        return (
          haystack.includes(query.toLowerCase()) &&
          matchesStatus &&
          (list === "all" || contact.lists.some((item) => item.id === list))
        );
      }),
    [data.contacts, query, status, list],
  );
  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((contact) => selected.includes(contact.id));
  function toggleContact(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function toggleFiltered() {
    setSelected((current) =>
      allFilteredSelected
        ? current.filter((id) => !filtered.some((contact) => contact.id === id))
        : [...new Set([...current, ...filtered.map((contact) => contact.id)])],
    );
  }
  return (
    <>
      <PageIntro
        eyebrow="Newsletter"
        title="Suscriptores"
        text="Tu audiencia, su consentimiento y sus suscripciones en un solo lugar."
        actions={
          <>
            {selected.length === 2 && (
              <button
                className="button button-secondary"
                onClick={() => setMergeOpen(true)}
              >
                <Users size={16} /> Fusionar duplicados
              </button>
            )}
            {selected.length > 0 && (
              <button
                className="button button-secondary"
                onClick={() => setBulkOpen(true)}
              >
                <Users size={16} /> Acciones · {selected.length}
              </button>
            )}
            <button
              className="button button-secondary"
              onClick={() => setExporting(true)}
            >
              <Upload size={16} /> Exportar
            </button>
            <button
              className="button button-secondary"
              onClick={() => setImporting(true)}
            >
              <Upload size={16} /> Importar CSV
            </button>
            <button
              className="button button-primary"
              onClick={() => setEditing("new")}
            >
              <Plus size={16} /> Nuevo suscriptor
            </button>
          </>
        }
      />
      <div className="summary-strip">
        <span>
          <strong>{number.format(data.overview.contacts)}</strong> totales
        </span>
        <span>
          <strong>{number.format(data.overview.subscribed)}</strong> con
          suscripción activa
        </span>
        <span>
          <strong>
            {number.format(
              data.contacts.filter((item) =>
                item.lists.some((own) => own.status === "unsubscribed"),
              ).length,
            )}
          </strong>{" "}
          con alguna baja
        </span>
        <span>
          <strong>
            {number.format(
              data.contacts.filter((item) => item.status === "bounced").length,
            )}
          </strong>{" "}
          rebotes
        </span>
      </div>
      <section className="panel table-panel">
        <div className="table-tools">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Buscar por nombre, correo o ubicación…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar suscriptores por estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Con suscripción activa</option>
            <option value="unsubscribed">Con alguna baja</option>
            <option value="bounced">Rebotes</option>
            <option value="complained">Quejas</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <select
            aria-label="Filtrar suscriptores por lista"
            value={list}
            onChange={(e) => setList(e.target.value)}
          >
            <option value="all">Todas las listas</option>
            {data.lists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {selected.length > 0 && (
          <div className="bulk-selection-bar">
            <strong>{selected.length} seleccionados</strong>
            {selected.length === 2 && (
              <button
                className="text-button"
                onClick={() => setMergeOpen(true)}
              >
                Fusionar duplicados
              </button>
            )}
            <button className="text-button" onClick={() => setBulkOpen(true)}>
              Aplicar una acción
            </button>
            <button className="text-button" onClick={() => setSelected([])}>
              Limpiar selección
            </button>
          </div>
        )}
        <div className="data-table-wrap">
          <table className="data-table contacts-table">
            <thead>
              <tr>
                <th className="select-cell">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar resultados"
                    checked={allFilteredSelected}
                    onChange={toggleFiltered}
                  />
                </th>
                <th>Suscriptor</th>
                <th>Ubicación</th>
                <th>Suscripciones</th>
                <th>Estado global</th>
                <th>Alta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr
                  key={contact.id}
                  className={
                    selected.includes(contact.id) ? "selected-row" : ""
                  }
                >
                  <td className="select-cell">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${contact.email}`}
                      checked={selected.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                    />
                  </td>
                  <td>
                    <button
                      className="contact-cell"
                      onClick={() => setEditing(contact)}
                    >
                      <span className="contact-avatar">
                        {(
                          contact.first_name[0] || contact.email[0]
                        ).toUpperCase()}
                      </span>
                      <span>
                        <strong>
                          {`${contact.first_name} ${contact.last_name}`.trim() ||
                            "Sin nombre"}
                        </strong>
                        <small>{contact.email}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    {[
                      contact.custom_fields?.city,
                      contact.custom_fields?.country,
                    ]
                      .filter(Boolean)
                      .join(", ") || <span className="muted">—</span>}
                  </td>
                  <td>
                    <div className="token-list">
                      {contact.lists.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          className={`token subscription-${item.status}`}
                          style={
                            {
                              "--token-color": item.color,
                            } as React.CSSProperties
                          }
                        >
                          {item.name}
                          {item.status === "unsubscribed" ? " · baja" : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`contact-status ${contact.status}`}>
                      <i />
                      {statusLabel[contact.status] ?? contact.status}
                    </span>
                  </td>
                  <td>{date.format(new Date(contact.created_at))}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        onClick={() => setEditing(contact)}
                        aria-label="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => setPrivacyContact(contact)}
                        aria-label="Anonimizar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="table-empty">
            <Search size={22} />
            <p>No hay suscriptores que coincidan.</p>
          </div>
        )}
        <div className="table-footer">
          Mostrando {filtered.length} de {data.contacts.length} suscriptores
        </div>
      </section>
      {editing && (
        <ContactModal
          contact={editing === "new" ? undefined : editing}
          data={data}
          close={() => setEditing(null)}
          done={async (message) => {
            setEditing(null);
            await refresh();
            notify(message);
          }}
        />
      )}
      {importing && (
        <ImportModal
          lists={data.lists}
          close={() => setImporting(false)}
          done={async (message) => {
            setImporting(false);
            await refresh();
            notify(message);
          }}
        />
      )}
      {exporting && (
        <ExportModal
          lists={data.lists}
          close={() => setExporting(false)}
          notify={notify}
        />
      )}
      {bulkOpen && (
        <BulkContactsModal
          contactIds={selected}
          lists={data.lists}
          close={() => setBulkOpen(false)}
          done={async (message) => {
            setBulkOpen(false);
            setSelected([]);
            await refresh();
            notify(message);
          }}
        />
      )}
      {mergeOpen && selected.length === 2 && (
        <ContactMergeModal
          contacts={selected
            .map((id) => data.contacts.find((contact) => contact.id === id))
            .filter((contact): contact is Contact => Boolean(contact))}
          close={() => setMergeOpen(false)}
          done={async (message) => {
            setMergeOpen(false);
            setSelected([]);
            await refresh();
            notify(message);
          }}
        />
      )}
      {privacyContact && (
        <ContactPrivacyModal
          contact={privacyContact}
          close={() => setPrivacyContact(null)}
          done={async (message) => {
            setPrivacyContact(null);
            setSelected((current) =>
              current.filter((id) => id !== privacyContact.id),
            );
            await refresh();
            notify(message);
          }}
        />
      )}
    </>
  );
}

type ViewProps = {
  data: AppData;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
};

function AudiencesView({ data, refresh, notify }: ViewProps) {
  const [activeAudienceTab, setActiveAudienceTab] = useState<
    "lists" | "segments" | "suppressions"
  >("lists");
  const [listOpen, setListOpen] = useState(false);
  const [viewingList, setViewingList] = useState<ListSummary | null>(null);
  const [selectedList, setSelectedList] = useState<ListSummary | null>(null);
  const [segmentOpen, setSegmentOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [suppressionOpen, setSuppressionOpen] = useState(false);
  const [suppressionAction, setSuppressionAction] = useState<{
    item: Suppression;
    action: "resolve" | "reactivate";
  } | null>(null);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [suppressionCounts, setSuppressionCounts] = useState({
    active: 0,
    resolved: 0,
    marketing: 0,
    transactional: 0,
  });
  const [suppressionQuery, setSuppressionQuery] = useState("");
  const [suppressionStatus, setSuppressionStatus] = useState("active");
  const [suppressionScope, setSuppressionScope] = useState("any");
  async function loadSuppressions() {
    const result = await api<{
      data: Suppression[];
      counts: {
        active: number;
        resolved: number;
        marketing: number;
        transactional: number;
      };
    }>("/api/v1/suppressions?status=any&limit=500");
    setSuppressions(result.data);
    setSuppressionCounts(result.counts);
  }
  useEffect(() => {
    let active = true;
    api<{
      data: Suppression[];
      counts: {
        active: number;
        resolved: number;
        marketing: number;
        transactional: number;
      };
    }>("/api/v1/suppressions?status=any&limit=500")
      .then((result) => {
        if (active) {
          setSuppressions(result.data);
          setSuppressionCounts(result.counts);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const filteredSuppressions = suppressions.filter(
    (item) =>
      (suppressionStatus === "any" || item.status === suppressionStatus) &&
      (suppressionScope === "any" || item.scope === suppressionScope) &&
      item.email.toLowerCase().includes(suppressionQuery.toLowerCase()),
  );
  async function archive(url: string, label: string) {
    if (!confirm(`¿Archivar “${label}”? Podrás restaurarlo después.`)) return;
    await api(url, { method: "DELETE" });
    await refresh();
    notify("Audiencia archivada");
  }
  async function duplicate(url: string, label: string) {
    await api(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await refresh();
    notify(`Copia de “${label}” creada`);
  }
  if (viewingList) {
    const currentList =
      data.lists.find((item) => item.id === viewingList.id) ?? viewingList;
    return (
      <>
        <ListSubscriptionsView
          list={currentList}
          back={() => setViewingList(null)}
          configure={() => setSelectedList(currentList)}
        />
        {selectedList && (
          <ListDetailModal
            list={selectedList}
            close={() => setSelectedList(null)}
            done={async (message) => {
              await refresh();
              notify(message);
            }}
          />
        )}
      </>
    );
  }
  return (
    <>
      <PageIntro
        eyebrow="Organización"
        title="Audiencias"
        text="Gestiona listas, segmentos y bloqueos sin mezclar contextos."
        actions={
          <>
            <button
              className="button button-secondary"
              onClick={() => setArchiveOpen(true)}
            >
              <RotateCcw size={15} /> Archivados
            </button>
            {activeAudienceTab === "lists" && (
              <button
                className="button button-primary"
                onClick={() => setListOpen(true)}
              >
                <Plus size={16} /> Nueva lista
              </button>
            )}
            {activeAudienceTab === "segments" && (
              <button
                className="button button-primary"
                onClick={() => setSegmentOpen(true)}
              >
                <Plus size={16} /> Nuevo segmento
              </button>
            )}
            {activeAudienceTab === "suppressions" && (
              <button
                className="button button-primary"
                onClick={() => setSuppressionOpen(true)}
              >
                <Plus size={16} /> Añadir supresión
              </button>
            )}
          </>
        }
      />
      <nav className="audience-tabs" aria-label="Secciones de audiencias">
        <button
          className={activeAudienceTab === "lists" ? "active" : ""}
          onClick={() => setActiveAudienceTab("lists")}
          aria-current={activeAudienceTab === "lists" ? "page" : undefined}
        >
          <ListFilter size={15} /> Listas <b>{data.lists.length}</b>
        </button>
        <button
          className={activeAudienceTab === "segments" ? "active" : ""}
          onClick={() => setActiveAudienceTab("segments")}
          aria-current={activeAudienceTab === "segments" ? "page" : undefined}
        >
          <Layers3 size={15} /> Segmentos <b>{data.segments.length}</b>
        </button>
        <button
          className={activeAudienceTab === "suppressions" ? "active" : ""}
          onClick={() => setActiveAudienceTab("suppressions")}
          aria-current={
            activeAudienceTab === "suppressions" ? "page" : undefined
          }
        >
          <ShieldCheck size={15} /> Supresiones <b>{suppressionCounts.active}</b>
        </button>
      </nav>
      {activeAudienceTab === "lists" && (
        <div className="audience-grid">
        <section className="panel audience-panel audience-panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Suscripciones</p>
              <h3>Newsletters y listas</h3>
            </div>
          </div>
          <p className="panel-explainer">
            Cada lista puede tener columnas propias —fecha de registro, sexo,
            equipo preferido— además de reglas de consentimiento y remitente.
          </p>
          <div className="collection-list">
            {data.lists.map((item) => (
              <article key={item.id}>
                <i style={{ background: item.color }} />
                <button
                  className="collection-main"
                  onClick={() => setViewingList(item)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.description || "Lista de suscripción"}</small>
                </button>
                <span>
                  <b>{item.contact_count}</b> suscriptores ·{" "}
                  {item.field_count ?? 0} campos
                </span>
                <button
                  className="icon-button bordered"
                  onClick={() =>
                    duplicate(`/api/v1/lists/${item.id}/duplicate`, item.name)
                  }
                  aria-label={`Duplicar ${item.name}`}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="icon-button bordered"
                  onClick={() => setSelectedList(item)}
                  aria-label={`Configurar ${item.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="icon-button danger"
                  onClick={() => archive(`/api/v1/lists/${item.id}`, item.name)}
                  aria-label={`Archivar ${item.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>
        </div>
      )}
      {activeAudienceTab === "suppressions" && (
        <section className="panel suppression-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Entregabilidad y consentimiento</p>
            <h3>Lista de supresión</h3>
            <p className="panel-explainer">
              Bloqueos globales o por canal. Resolver conserva todo el historial
              y requiere una acción explícita.
            </p>
          </div>
        </div>
        <div className="suppression-summary">
          <span>
            <strong>{suppressionCounts.active}</strong> activas
          </span>
          <span>
            <strong>{suppressionCounts.marketing}</strong> afectan marketing
          </span>
          <span>
            <strong>{suppressionCounts.transactional}</strong> afectan
            transaccionales
          </span>
          <span>
            <strong>{suppressionCounts.resolved}</strong> resueltas
          </span>
        </div>
        <div className="table-tools suppression-tools">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Buscar correo…"
              value={suppressionQuery}
              onChange={(event) => setSuppressionQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar supresiones por estado"
            value={suppressionStatus}
            onChange={(event) => setSuppressionStatus(event.target.value)}
          >
            <option value="active">Activas</option>
            <option value="resolved">Resueltas</option>
            <option value="any">Todas</option>
          </select>
          <select
            aria-label="Filtrar supresiones por alcance"
            value={suppressionScope}
            onChange={(event) => setSuppressionScope(event.target.value)}
          >
            <option value="any">Todos los alcances</option>
            <option value="marketing">Solo marketing</option>
            <option value="transactional">Solo transaccional</option>
            <option value="all">Todas las comunicaciones</option>
          </select>
        </div>
        <div className="data-table-wrap">
          <table className="data-table suppression-table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Motivo</th>
                <th>Alcance</th>
                <th>Origen</th>
                <th>Estado</th>
                <th>Actualización</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredSuppressions.map((item) => {
                const protectedItem = ["privacy", "merged"].includes(
                  item.reason,
                );
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.email}</strong>
                      {item.resolution_note && (
                        <small>{item.resolution_note}</small>
                      )}
                    </td>
                    <td>
                      {suppressionReasonLabel[item.reason] ?? item.reason}
                    </td>
                    <td>{suppressionScopeLabel[item.scope] ?? item.scope}</td>
                    <td>{item.source}</td>
                    <td>
                      <span className={`status-badge ${item.status}`}>
                        {item.status === "active" ? "Activa" : "Resuelta"}
                      </span>
                    </td>
                    <td>{date.format(new Date(item.updated_at))}</td>
                    <td>
                      {protectedItem ? (
                        <span className="muted">Permanente</span>
                      ) : (
                        <button
                          className="button button-secondary button-small"
                          onClick={() =>
                            setSuppressionAction({
                              item,
                              action:
                                item.status === "active"
                                  ? "resolve"
                                  : "reactivate",
                            })
                          }
                        >
                          {item.status === "active" ? "Resolver" : "Reactivar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filteredSuppressions.length && (
          <div className="table-empty">
            <CircleCheck size={22} />
            <p>No hay supresiones con estos filtros.</p>
          </div>
        )}
        </section>
      )}
      {activeAudienceTab === "segments" && (
        <section className="panel segments-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Filtros vivos</p>
            <h3>Segmentos</h3>
          </div>
          <span className="muted">Se recalculan antes de cada envío</span>
        </div>
        <div className="segment-grid">
          {data.segments.map((segment) => (
            <article className="segment-card" key={segment.id}>
              <div className="segment-card-top">
                <span className="segment-icon">
                  <Layers3 size={19} />
                </span>
                <div className="row-actions">
                  <button
                    className="icon-button bordered"
                    onClick={() =>
                      duplicate(
                        `/api/v1/segments/${segment.id}/duplicate`,
                        segment.name,
                      )
                    }
                    aria-label={`Duplicar ${segment.name}`}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="icon-button bordered"
                    onClick={() => setSelectedSegment(segment)}
                    aria-label={`Editar ${segment.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() =>
                      archive(`/api/v1/segments/${segment.id}`, segment.name)
                    }
                    aria-label={`Archivar ${segment.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h4>{segment.name}</h4>
              <p>{segment.description || "Segmento dinámico"}</p>
              <span className="segment-list-name">
                {segment.list_name ??
                  data.lists.find((item) => item.id === segment.list_id)
                    ?.name ??
                  "Todas las listas · legado"}
              </span>
              <div className="rule-preview">
                {segment.rules.slice(0, 2).map((rule, index) => (
                  <span key={index}>
                    {rule.field === "list_field"
                      ? (rule.field_key ?? rule.field)
                      : rule.field}{" "}
                    · {rule.operator} ·{" "}
                    <b>
                      {displayRuleValue(rule, data)}
                      {rule.within_days ? ` · ${rule.within_days} días` : ""}
                    </b>
                  </span>
                ))}
              </div>
              <footer>
                <strong>{segment.contact_count}</strong>
                <span>suscriptores ahora</span>
              </footer>
            </article>
          ))}
        </div>
        </section>
      )}
      {listOpen && (
        <SimpleEntityModal
          title="Nueva lista"
          kind="list"
          close={() => setListOpen(false)}
          done={async () => {
            setListOpen(false);
            await refresh();
            notify("Lista creada");
          }}
        />
      )}
      {selectedList && (
        <ListDetailModal
          list={selectedList}
          close={() => setSelectedList(null)}
          done={async (message) => {
            await refresh();
            notify(message);
          }}
        />
      )}
      {suppressionOpen && (
        <SuppressionModal
          close={() => setSuppressionOpen(false)}
          done={async () => {
            setSuppressionOpen(false);
            await Promise.all([loadSuppressions(), refresh()]);
            notify("Supresión añadida");
          }}
        />
      )}
      {suppressionAction && (
        <SuppressionActionModal
          item={suppressionAction.item}
          action={suppressionAction.action}
          close={() => setSuppressionAction(null)}
          done={async () => {
            const action = suppressionAction.action;
            setSuppressionAction(null);
            await Promise.all([loadSuppressions(), refresh()]);
            notify(
              action === "resolve"
                ? "Supresión resuelta"
                : "Supresión reactivada",
            );
          }}
        />
      )}
      {(segmentOpen || selectedSegment) && (
        <SegmentModal
          data={data}
          segment={selectedSegment ?? undefined}
          close={() => {
            setSegmentOpen(false);
            setSelectedSegment(null);
          }}
          done={async (message) => {
            setSegmentOpen(false);
            setSelectedSegment(null);
            await refresh();
            notify(message);
          }}
        />
      )}
      {archiveOpen && (
        <AudienceArchiveModal
          close={() => setArchiveOpen(false)}
          done={async (message) => {
            await refresh();
            notify(message);
          }}
        />
      )}
    </>
  );
}

function listSubscriptionUrl(
  listId: string,
  options: { query: string; status: string; cursor?: string | null },
) {
  const params = new URLSearchParams({ limit: "100" });
  if (options.query.trim()) params.set("q", options.query.trim());
  if (options.status !== "any") params.set("status", options.status);
  if (options.cursor) params.set("cursor", options.cursor);
  return `/api/v1/lists/${listId}/subscriptions?${params.toString()}`;
}

function readableFieldLabel(key: string) {
  const known: Record<string, string> = {
    city: "Ciudad",
    country: "País",
  };
  if (known[key]) return known[key];
  const label = key.replaceAll("_", " ").trim();
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : key;
}

function listCellValue(value: unknown, type?: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value))
    return value.length ? value.map((item) => String(item)).join(", ") : "—";
  if (type === "date" || type === "datetime") {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) return date.format(parsed);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ListSubscriptionsView({
  list,
  back,
  configure,
}: {
  list: ListSummary;
  back: () => void;
  configure: () => void;
}) {
  const [detail, setDetail] = useState<ListDetail>();
  const [subscriptions, setSubscriptions] = useState<ListSubscription[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("any");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<ListDetail>(`/api/v1/lists/${list.id}`)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "No se pudo cargar la lista",
          );
      });
    return () => {
      active = false;
    };
  }, [list.id, list.etag]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      api<{ data: ListSubscription[]; next_cursor: string | null }>(
        listSubscriptionUrl(list.id, { query, status }),
      )
        .then((result) => {
          if (!active) return;
          setSubscriptions(result.data);
          setNextCursor(result.next_cursor);
        })
        .catch((err) => {
          if (active)
            setError(
              err instanceof Error
                ? err.message
                : "No se pudieron cargar las suscripciones",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [list.id, query, status]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await api<{
        data: ListSubscription[];
        next_cursor: string | null;
      }>(listSubscriptionUrl(list.id, { query, status, cursor: nextCursor }));
      setSubscriptions((current) => [...current, ...result.data]);
      setNextCursor(result.next_cursor);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar más suscripciones",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const activeFields = useMemo(
    () =>
      (detail?.fields ?? [])
        .filter((field) => field.status === "active")
        .sort((a, b) => a.position - b.position),
    [detail],
  );
  const contactFieldKeys = useMemo(() => {
    const discovered = new Set(
      subscriptions.flatMap((item) => Object.keys(item.contact_fields ?? {})),
    );
    discovered.delete("city");
    discovered.delete("country");
    return ["city", "country", ...Array.from(discovered).sort()];
  }, [subscriptions]);
  const tableWidth = Math.max(
    1280,
    930 + (contactFieldKeys.length + activeFields.length) * 145,
  );

  return (
    <>
      <PageIntro
        eyebrow={`Lista · ${detail?.key ?? list.key}`}
        title={detail?.name ?? list.name}
        text={
          detail?.description ||
          "Suscriptores, consentimiento y columnas propias de esta lista."
        }
        actions={
          <div className="list-inline-actions">
            <button className="button button-secondary" onClick={back}>
              <ArrowLeft size={16} /> Volver a audiencias
            </button>
            <button className="button button-primary" onClick={configure}>
              <Pencil size={15} /> Configurar lista
            </button>
          </div>
        }
      />
      <div className="summary-strip list-inline-summary">
        <span>
          <strong>{number.format(detail?.stats.active ?? 0)}</strong> activas
        </span>
        <span>
          <strong>{number.format(detail?.stats.unsubscribed ?? 0)}</strong> bajas
        </span>
        <span>
          <strong>{number.format(detail?.stats.total ?? 0)}</strong> histórico
        </span>
        <span>
          <strong>{number.format(activeFields.length)}</strong> columnas propias
        </span>
      </div>
      <section className="panel table-panel list-subscriptions-panel">
        <div className="list-table-heading">
          <div>
            <p className="eyebrow">Contenido de la lista</p>
            <h3>Suscriptores y columnas</h3>
          </div>
          <span>
            Desplázate horizontalmente para consultar todas las columnas
          </span>
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Buscar en cualquier columna…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar por estado de suscripción"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="any">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="pending">Pendientes</option>
            <option value="unsubscribed">Bajas</option>
            <option value="archived">Archivadas</option>
          </select>
        </div>
        {error && <p className="form-error list-table-error">{error}</p>}
        <div className="data-table-wrap list-subscriptions-wrap">
          <table
            className="data-table list-subscriptions-table"
            style={{ minWidth: tableWidth }}
          >
            <thead>
              <tr>
                <th>Suscriptor</th>
                <th>Teléfono</th>
                <th>Idioma</th>
                <th>Zona horaria</th>
                {contactFieldKeys.map((key) => (
                  <th key={`contact-${key}`}>{readableFieldLabel(key)}</th>
                ))}
                {activeFields.map((field) => (
                  <th key={field.id} title={field.key}>
                    {field.label}
                  </th>
                ))}
                <th>Suscripción</th>
                <th>Estado global</th>
                <th>Origen</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="list-subscriber-cell">
                      <span className="contact-avatar">
                        {(item.first_name[0] || item.email[0]).toUpperCase()}
                      </span>
                      <span>
                        <strong>
                          {`${item.first_name} ${item.last_name}`.trim() ||
                            "Sin nombre"}
                        </strong>
                        <small>{item.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>{listCellValue(item.phone)}</td>
                  <td>{listCellValue(item.language)}</td>
                  <td>{listCellValue(item.timezone)}</td>
                  {contactFieldKeys.map((key) => (
                    <td key={`${item.id}-contact-${key}`}>
                      {listCellValue(item.contact_fields?.[key])}
                    </td>
                  ))}
                  {activeFields.map((field) => (
                    <td key={`${item.id}-${field.id}`}>
                      {listCellValue(item.fields?.[field.key], field.type)}
                    </td>
                  ))}
                  <td>
                    <span className={`status-badge ${item.status}`}>
                      {statusLabel[item.status] ?? item.status}
                    </span>
                  </td>
                  <td>
                    <span className={`contact-status ${item.contact_status}`}>
                      <i />
                      {statusLabel[item.contact_status] ?? item.contact_status}
                    </span>
                  </td>
                  <td>
                    <code className="list-source">{item.source}</code>
                  </td>
                  <td>{date.format(new Date(item.subscribed_at ?? item.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && !subscriptions.length ? (
          <div className="table-empty">
            <RefreshCw className="spin" size={22} />
            <p>Cargando suscriptores…</p>
          </div>
        ) : !subscriptions.length ? (
          <div className="table-empty">
            <Users size={22} />
            <p>
              {query || status !== "any"
                ? "No hay suscriptores que coincidan."
                : "Esta lista todavía no tiene suscriptores."}
            </p>
          </div>
        ) : null}
        <div className="table-footer list-table-footer">
          <span>
            Mostrando {number.format(subscriptions.length)} suscriptores
            {nextCursor ? " · hay más resultados" : ""}
          </span>
          {nextCursor && (
            <button
              className="button button-secondary button-small"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Cargando…" : "Cargar más"}
            </button>
          )}
        </div>
      </section>
    </>
  );
}

const suppressionReasonLabel: Record<string, string> = {
  unsubscribe: "Baja",
  bounce: "Rebote",
  complaint: "Queja",
  manual: "Manual",
  privacy: "Privacidad",
  merged: "Contacto fusionado",
};
const suppressionScopeLabel: Record<string, string> = {
  marketing: "Marketing",
  transactional: "Transaccional",
  all: "Todas las comunicaciones",
};

function AudienceArchiveModal({
  close,
  done,
}: {
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [fields, setFields] = useState<
    { list_id: string; list_name: string; field: ListField }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [listResult, segmentResult] = await Promise.all([
        api<{ data: ListSummary[] }>("/api/v1/lists?include_archived=true"),
        api<{ data: Segment[] }>("/api/v1/segments?include_archived=true"),
      ]);
      setLists(listResult.data.filter((item) => item.status === "archived"));
      setSegments(
        segmentResult.data.filter((item) => item.status === "archived"),
      );
      const details = await Promise.all(
        listResult.data.map((item) =>
          api<ListDetail>(`/api/v1/lists/${item.id}`),
        ),
      );
      setFields(
        details.flatMap((detail) =>
          detail.fields
            .filter((field) => field.status === "archived")
            .map((field) => ({
              list_id: detail.id,
              list_name: detail.name,
              field,
            })),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el archivo",
      );
    } finally {
      setLoading(false);
    }
  }
  // The modal owns this remote snapshot and refreshes it after each mutation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  async function restore(
    kind: "lists" | "segments",
    id: string,
    label: string,
  ) {
    try {
      await api(`/api/v1/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      await load();
      await done(`“${label}” restaurado`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar");
    }
  }
  async function restoreField(listId: string, field: ListField) {
    try {
      await api(`/api/v1/lists/${listId}/fields/${field.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      await load();
      await done(`Campo “${field.label}” restaurado`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo restaurar el campo",
      );
    }
  }
  return (
    <Modal
      title="Audiencias archivadas"
      eyebrow="Archivo reversible"
      close={close}
      wide
    >
      <div className="modal-form archive-manager">
        <p className="panel-explainer">
          Las listas conservan sus suscripciones y campos. Los segmentos
          conservan sus reglas y volverán a calcularse cuando se usen.
        </p>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="muted">Cargando archivo…</p>
        ) : (
          <>
            <section>
              <h3>Listas</h3>
              <div className="archive-list">
                {lists.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.description || item.key} ·{" "}
                        {item.active_subscriptions ?? 0} suscripciones activas
                      </small>
                    </div>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => restore("lists", item.id, item.name)}
                    >
                      <RotateCcw size={13} /> Restaurar
                    </button>
                  </article>
                ))}
              </div>
              {!lists.length && (
                <p className="archive-empty">No hay listas archivadas.</p>
              )}
            </section>
            <section>
              <h3>Segmentos</h3>
              <div className="archive-list">
                {segments.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.description || "Segmento dinámico"}</small>
                    </div>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => restore("segments", item.id, item.name)}
                    >
                      <RotateCcw size={13} /> Restaurar
                    </button>
                  </article>
                ))}
              </div>
              {!segments.length && (
                <p className="archive-empty">No hay segmentos archivados.</p>
              )}
            </section>
            <section>
              <h3>Campos de lista</h3>
              <div className="archive-list">
                {fields.map((item) => (
                  <article key={item.field.id}>
                    <div>
                      <strong>{item.field.label}</strong>
                      <small>
                        {item.list_name} · <code>{item.field.key}</code>
                      </small>
                    </div>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => restoreField(item.list_id, item.field)}
                    >
                      <RotateCcw size={13} /> Restaurar
                    </button>
                  </article>
                ))}
              </div>
              {!fields.length && (
                <p className="archive-empty">No hay campos archivados.</p>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}

function ListDetailModal({
  list,
  close,
  done,
}: {
  list: ListSummary;
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState<ListDetail>();
  const [fieldOpen, setFieldOpen] = useState<ListField | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setDetail(await api<ListDetail>(`/api/v1/lists/${list.id}`));
  }
  useEffect(() => {
    let active = true;
    api<ListDetail>(`/api/v1/lists/${list.id}`)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "No se pudo cargar la lista",
        ),
      );
    return () => {
      active = false;
    };
  }, [list.id]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/v1/lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          color: form.get("color"),
          default_from_name: form.get("default_from_name"),
          default_from_email: form.get("default_from_email"),
          default_reply_to: form.get("default_reply_to"),
          language: form.get("language"),
          legal_footer: form.get("legal_footer"),
          public_signup_enabled: form.get("public_signup_enabled") === "on",
          double_opt_in: form.get("double_opt_in") === "on",
          preference_center_visible:
            form.get("preference_center_visible") === "on",
          consent_text_default: form.get("consent_text_default"),
        }),
      });
      await load();
      await done("Lista actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }
  async function archiveField(field: ListField) {
    if (
      !confirm(
        `¿Archivar el campo “${field.label}”? Los datos históricos se conservarán.`,
      )
    )
      return;
    await api(`/api/v1/lists/${list.id}/fields/${field.id}`, {
      method: "DELETE",
    });
    await load();
    await done("Campo archivado");
  }
  async function move(field: ListField, direction: -1 | 1) {
    if (!detail) return;
    const fields = detail.fields
      .filter((item) => item.status === "active")
      .sort((a, b) => a.position - b.position);
    const index = fields.findIndex((item) => item.id === field.id);
    const other = fields[index + direction];
    if (!other) return;
    await Promise.all([
      api(`/api/v1/lists/${list.id}/fields/${field.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: other.position }),
      }),
      api(`/api/v1/lists/${list.id}/fields/${other.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: field.position }),
      }),
    ]);
    await load();
  }
  return (
    <Modal
      title={detail?.name ?? list.name}
      eyebrow="Configuración de lista"
      close={close}
      wide
    >
      {!detail ? (
        <div className="modal-form">
          <p className="muted">{error || "Cargando configuración…"}</p>
        </div>
      ) : (
        <>
          <form
            className="modal-form list-settings-form"
            onSubmit={submit}
            onInvalid={() => setError(formValidationMessage)}
          >
            <div className="list-stats">
              <span>
                <strong>{detail.stats.active}</strong> activas
              </span>
              <span>
                <strong>{detail.stats.unsubscribed}</strong> bajas
              </span>
              <span>
                <strong>{detail.stats.total}</strong> histórico
              </span>
            </div>
            <div className="form-grid">
              <label>
                Nombre
                <input name="name" defaultValue={detail.name} required />
              </label>
              <label>
                Color
                <input name="color" type="color" defaultValue={detail.color} />
              </label>
              <label className="full">
                Descripción
                <textarea
                  name="description"
                  defaultValue={detail.description}
                />
              </label>
              <label>
                Nombre del remitente
                <input
                  name="default_from_name"
                  defaultValue={detail.default_from_name}
                />
              </label>
              <label>
                Correo del remitente
                <input
                  name="default_from_email"
                  type="email"
                  defaultValue={detail.default_from_email}
                />
              </label>
              <label>
                Responder a
                <input
                  name="default_reply_to"
                  type="email"
                  defaultValue={detail.default_reply_to}
                />
              </label>
              <label>
                Idioma
                <input name="language" defaultValue={detail.language} />
              </label>
              <label className="full">
                Texto de consentimiento por defecto
                <textarea
                  name="consent_text_default"
                  defaultValue={detail.consent_text_default}
                />
              </label>
              <label className="full">
                Pie legal
                <textarea
                  name="legal_footer"
                  defaultValue={detail.legal_footer}
                />
              </label>
            </div>
            <fieldset className="toggle-fieldset">
              <legend>Alta pública y preferencias</legend>
              <label className="toggle-row">
                <span>
                  <strong>Formulario público de alta</strong>
                  <small>
                    Permite nuevas altas desde el endpoint público de esta
                    lista.
                  </small>
                </span>
                <input
                  type="checkbox"
                  name="public_signup_enabled"
                  defaultChecked={detail.public_signup_enabled}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>Doble confirmación</strong>
                  <small>
                    La suscripción queda pendiente hasta confirmar el correo.
                  </small>
                </span>
                <input
                  type="checkbox"
                  name="double_opt_in"
                  defaultChecked={detail.double_opt_in}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>Visible en centro de preferencias</strong>
                  <small>
                    El suscriptor puede gestionar esta lista por separado.
                  </small>
                </span>
                <input
                  type="checkbox"
                  name="preference_center_visible"
                  defaultChecked={detail.preference_center_visible}
                />
              </label>
            </fieldset>
            {error && <p className="form-error">{error}</p>}
            <footer className="list-save-row">
              <button
                type="submit"
                className="button button-primary"
                disabled={saving}
              >
                {saving ? "Guardando…" : "Guardar configuración"}
              </button>
            </footer>
          </form>
          <section className="list-fields-section">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Columnas propias</p>
                <h3>Campos de la lista</h3>
                <p className="panel-explainer">
                  La clave y el tipo quedan fijos para no romper importaciones,
                  API ni datos existentes.
                </p>
              </div>
              <button
                className="button button-secondary button-small"
                onClick={() => setFieldOpen("new")}
              >
                <Plus size={14} /> Nuevo campo
              </button>
            </div>
            <div className="list-field-table">
              {detail.fields
                .filter((field) => field.status === "active")
                .sort((a, b) => a.position - b.position)
                .map((field, index, fields) => (
                  <article key={field.id}>
                    <code>{field.key}</code>
                    <div>
                      <strong>{field.label}</strong>
                      <small>
                        {field.type} ·{" "}
                        {field.required ? "obligatorio" : "opcional"} ·{" "}
                        {field.visibility === "preference_center"
                          ? "visible en preferencias"
                          : "privado"}
                      </small>
                      {field.dependencies &&
                        (field.dependencies.segments.length > 0 ||
                          field.dependencies.import_jobs > 0 ||
                          field.dependencies.templates.length > 0) && (
                          <small
                            title={[
                              ...field.dependencies.segments.map(
                                (item) => `Segmento: ${item.name}`,
                              ),
                              ...field.dependencies.templates.map(
                                (item) => `Plantilla: ${item.name}`,
                              ),
                              field.dependencies.import_jobs
                                ? `${field.dependencies.import_jobs} importaciones históricas`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            Dependencias: {field.dependencies.segments.length}{" "}
                            segmentos · {field.dependencies.templates.length}{" "}
                            plantillas · {field.dependencies.import_jobs}{" "}
                            importaciones
                          </small>
                        )}
                    </div>
                    <div className="field-order">
                      <button
                        className="icon-button bordered"
                        onClick={() => move(field, -1)}
                        disabled={index === 0}
                        aria-label="Subir"
                      >
                        ↑
                      </button>
                      <button
                        className="icon-button bordered"
                        onClick={() => move(field, 1)}
                        disabled={index === fields.length - 1}
                        aria-label="Bajar"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      className="icon-button bordered"
                      onClick={() => setFieldOpen(field)}
                      aria-label="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button danger"
                      onClick={() => archiveField(field)}
                      aria-label="Archivar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </article>
                ))}
            </div>
            {!detail.fields.some((field) => field.status === "active") && (
              <div className="list-fields-empty">
                Esta lista aún no tiene columnas personalizadas.
              </div>
            )}
          </section>
        </>
      )}
      {fieldOpen && (
        <ListFieldModal
          listId={list.id}
          field={fieldOpen === "new" ? undefined : fieldOpen}
          close={() => setFieldOpen(null)}
          done={async (message) => {
            setFieldOpen(null);
            await load();
            await done(message);
          }}
        />
      )}
    </Modal>
  );
}

const fieldTypeLabels: Record<string, string> = {
  text: "Texto corto",
  textarea: "Texto largo",
  integer: "Número entero",
  decimal: "Número decimal",
  date: "Fecha",
  datetime: "Fecha y hora",
  boolean: "Sí / no",
  select: "Selección única",
  multiselect: "Selección múltiple",
  email: "Correo electrónico",
  url: "URL",
};

function ListFieldModal({
  listId,
  field,
  close,
  done,
}: {
  listId: string;
  field?: ListField;
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const validation: Record<string, unknown> = {};
    if (form.get("min")) validation.min = Number(form.get("min"));
    if (form.get("max")) validation.max = Number(form.get("max"));
    if (form.get("pattern")) validation.pattern = form.get("pattern");
    const options = String(form.get("options") ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const common = {
      label: form.get("label"),
      help_text: form.get("help_text"),
      required: form.get("required") === "on",
      options,
      validation,
      visibility: form.get("visibility"),
    };
    const payload = field
      ? common
      : {
          ...common,
          key: String(form.get("key") ?? "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_"),
          type: form.get("type"),
          default_value: form.get("default_value") || undefined,
        };
    try {
      await api(
        field
          ? `/api/v1/lists/${listId}/fields/${field.id}`
          : `/api/v1/lists/${listId}/fields`,
        {
          method: field ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await done(field ? "Campo actualizado" : "Campo creado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      setSaving(false);
    }
  }
  return (
    <Modal
      title={field ? "Editar campo" : "Nuevo campo"}
      eyebrow="Columna de la lista"
      close={close}
    >
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="form-grid">
          <label>
            Clave estable
            <input
              name="key"
              defaultValue={field?.key}
              disabled={Boolean(field)}
              pattern="[a-z][a-z0-9_]*"
              required
            />
            <span className="field-help">
              Ej. equipo_preferido. Se usa en CSV, API y segmentos.
            </span>
          </label>
          <label>
            Tipo
            <select
              name="type"
              defaultValue={field?.type ?? "text"}
              disabled={Boolean(field)}
            >
              {Object.entries(fieldTypeLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Etiqueta
            <input
              name="label"
              defaultValue={field?.label}
              required
              autoFocus
            />
          </label>
          <label className="full">
            Ayuda para el usuario
            <input name="help_text" defaultValue={field?.help_text} />
          </label>
          <label>
            Valor por defecto
            <input
              name="default_value"
              defaultValue={
                field?.default_value == null ? "" : String(field.default_value)
              }
              disabled={Boolean(field)}
            />
          </label>
          <label>
            Visibilidad
            <select
              name="visibility"
              defaultValue={field?.visibility ?? "private"}
            >
              <option value="private">Solo interna</option>
              <option value="preference_center">Centro de preferencias</option>
            </select>
          </label>
          <label className="full">
            Opciones, una por línea
            <textarea
              name="options"
              defaultValue={field?.options?.join("\n")}
              placeholder="Opción A&#10;Opción B"
            />
            <span className="field-help">
              Solo se usan en selección única o múltiple.
            </span>
          </label>
          <label>
            Mínimo
            <input
              name="min"
              type="number"
              step="any"
              defaultValue={String(field?.validation?.min ?? "")}
            />
          </label>
          <label>
            Máximo
            <input
              name="max"
              type="number"
              step="any"
              defaultValue={String(field?.validation?.max ?? "")}
            />
          </label>
          <label className="full">
            Patrón de validación
            <input
              name="pattern"
              defaultValue={String(field?.validation?.pattern ?? "")}
              placeholder="Expresión regular opcional"
            />
          </label>
        </div>
        <label className="toggle-row">
          <span>
            <strong>Campo obligatorio</strong>
            <small>Se validará al editar, importar o enviar por API.</small>
          </span>
          <input
            name="required"
            type="checkbox"
            defaultChecked={field?.required}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <ModalActions
          close={close}
          saving={saving}
          label={field ? "Guardar campo" : "Crear campo"}
        />
      </form>
    </Modal>
  );
}

function SuppressionModal({
  close,
  done,
}: {
  close: () => void;
  done: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/v1/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          reason: form.get("reason"),
          scope: form.get("scope"),
          note: form.get("note"),
        }),
      });
      await done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
      setSaving(false);
    }
  }
  return (
    <Modal title="Añadir supresión" eyebrow="Control de envíos" close={close}>
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <label>
          Correo electrónico
          <input type="email" name="email" required autoFocus />
        </label>
        <div className="form-grid">
          <label>
            Motivo
            <select name="reason" defaultValue="manual">
              <option value="manual">Bloqueo manual</option>
              <option value="unsubscribe">Baja</option>
              <option value="bounce">Rebote</option>
              <option value="complaint">Queja</option>
            </select>
          </label>
          <label>
            Alcance
            <select name="scope" defaultValue="all">
              <option value="marketing">Solo campañas</option>
              <option value="transactional">Solo transaccionales</option>
              <option value="all">Todas las comunicaciones</option>
            </select>
          </label>
          <label className="full">
            Nota
            <textarea name="note" placeholder="Motivo interno y referencia" />
          </label>
        </div>
        <div className="info-callout">
          <CircleAlert size={17} />
          <p>
            Una supresión global impide campañas y correos transaccionales. Una
            baja de una lista concreta se gestiona en la suscripción, no aquí.
          </p>
        </div>
        {error && <p className="form-error">{error}</p>}
        <ModalActions close={close} saving={saving} label="Añadir supresión" />
      </form>
    </Modal>
  );
}

function SuppressionActionModal({
  item,
  action,
  close,
  done,
}: {
  item: Suppression;
  action: "resolve" | "reactivate";
  close: () => void;
  done: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/v1/suppressions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: form.get("note") }),
      });
      await done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
      setSaving(false);
    }
  }
  return (
    <Modal
      title={
        action === "resolve" ? "Resolver supresión" : "Reactivar supresión"
      }
      eyebrow="Historial de entregabilidad"
      close={close}
    >
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="suppression-action-summary">
          <strong>{item.email}</strong>
          <span>
            {suppressionReasonLabel[item.reason] ?? item.reason} ·{" "}
            {suppressionScopeLabel[item.scope] ?? item.scope}
          </span>
        </div>
        {action === "resolve" ? (
          <label>
            Nota de resolución
            <textarea
              name="note"
              placeholder="Por qué se permite volver a enviar"
              autoFocus
            />
          </label>
        ) : (
          <div className="info-callout">
            <CircleAlert size={17} />
            <p>
              Volverá a bloquear los envíos incluidos en su alcance. Si es
              global, también actualizará el estado del contacto.
            </p>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <ModalActions
          close={close}
          saving={saving}
          label={action === "resolve" ? "Confirmar resolución" : "Reactivar"}
        />
      </form>
    </Modal>
  );
}

function displayRuleValue(rule: SegmentRule, data: AppData) {
  if (rule.field === "list")
    return (
      data.lists.find((item) => item.id === rule.value)?.name ?? rule.value
    );
  if (rule.field === "tag")
    return data.tags.find((item) => item.id === rule.value)?.name ?? rule.value;
  if (rule.field === "campaign_activity")
    return (
      data.campaigns.find((item) => item.id === rule.value)?.name ??
      String(rule.value ?? "")
    );
  return Array.isArray(rule.value)
    ? rule.value.join(", ")
    : String(rule.value ?? "");
}

function TemplatesView({ data, refresh, notify }: ViewProps) {
  const templateRouter = useRouter();
  const [templates, setTemplates] = useState<Template[]>(data.templates);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("active");
  const [folder, setFolder] = useState("all");
  const [sort, setSort] = useState("updated_desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const result = await api<{ data: Template[] }>(
        `/api/v1/templates?include_archived=true&sort=${sort}`,
      );
      setTemplates(result.data);
    } finally {
      setLoading(false);
    }
  }
  // Sorting changes the authoritative server query for this library view.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);
  const folders = [
    ...new Set(templates.map((item) => item.folder || "").filter(Boolean)),
  ].sort();
  const filtered = templates.filter(
    (item) =>
      (status === "all" ||
        (status === "active"
          ? item.status !== "archived"
          : item.status === status)) &&
      (channel === "all" || item.channel === channel) &&
      (folder === "all" || (item.folder || "") === folder) &&
      `${item.name} ${item.key} ${item.subject}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function archive(item: Template) {
    if (
      !confirm(
        `¿Archivar la plantilla “${item.name}”? Las versiones históricas seguirán intactas.`,
      )
    )
      return;
    await api(`/api/v1/templates/${item.id}`, { method: "DELETE" });
    setSelected((current) => current.filter((id) => id !== item.id));
    await Promise.all([load(), refresh()]);
    notify("Plantilla archivada");
  }
  async function restore(item: Template) {
    await api(`/api/v1/templates/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: item.published_version_id ? "published" : "draft",
      }),
    });
    await Promise.all([load(), refresh()]);
    notify("Plantilla restaurada");
  }
  async function duplicate(item: Template) {
    await api(`/api/v1/templates/${item.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await Promise.all([load(), refresh()]);
    notify("Plantilla duplicada como borrador");
  }
  async function move(item: Template) {
    const target = prompt("Carpeta de destino", item.folder || "");
    if (target === null) return;
    await api(`/api/v1/templates/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: target.trim() }),
    });
    await load();
    notify("Plantilla movida");
  }
  async function bulk(action: "archive" | "folder") {
    const items = templates.filter(
      (item) => selected.includes(item.id) && item.status !== "archived",
    );
    if (!items.length) return;
    if (
      action === "archive" &&
      !confirm(`¿Archivar ${items.length} plantillas?`)
    )
      return;
    const target =
      action === "folder"
        ? prompt("Carpeta de destino para la selección", "")
        : "";
    if (action === "folder" && target === null) return;
    for (const item of items)
      await api(
        `/api/v1/templates/${item.id}`,
        action === "archive"
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folder: target?.trim() ?? "" }),
            },
      );
    setSelected([]);
    await Promise.all([load(), refresh()]);
    notify(
      action === "archive" ? "Plantillas archivadas" : "Plantillas movidas",
    );
  }
  return (
    <>
      <PageIntro
        eyebrow="Diseño"
        title="Plantillas"
        text="HTML y constructor práctico, en una pantalla completa con versiones publicables."
        actions={
          <button
            className="button button-primary"
            onClick={() => templateRouter.push("/plantillas/nueva")}
          >
            <Plus size={16} /> Nueva plantilla
          </button>
        }
      />
      <section className="template-library-tools">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Buscar por nombre, clave o asunto…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Canal"
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="all">Todos los canales</option>
          <option value="marketing">Marketing</option>
          <option value="transactional">Transaccional</option>
        </select>
        <select
          aria-label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="active">Activas</option>
          <option value="published">Publicadas</option>
          <option value="draft">Borradores</option>
          <option value="archived">Archivadas</option>
          <option value="all">Todas</option>
        </select>
        <select
          aria-label="Carpeta"
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
        >
          <option value="all">Todas las carpetas</option>
          {folders.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Orden"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="updated_desc">Modificación reciente</option>
          <option value="created_desc">Creación reciente</option>
          <option value="name_asc">Nombre A–Z</option>
        </select>
      </section>
      {selected.length > 0 && (
        <div className="template-bulk-bar">
          <strong>{selected.length} seleccionadas</strong>
          <button
            className="button button-secondary button-small"
            onClick={() => bulk("folder")}
          >
            Mover a carpeta
          </button>
          <button
            className="button button-danger button-small"
            onClick={() => bulk("archive")}
          >
            Archivar
          </button>
          <button className="text-button" onClick={() => setSelected([])}>
            Limpiar
          </button>
        </div>
      )}
      {loading && <p className="muted">Actualizando biblioteca…</p>}
      <div className="template-grid">
        {filtered.map((item) => (
          <article
            className={`template-card ${item.status === "archived" ? "archived" : ""}`}
            key={item.id}
          >
            <label className="template-select">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                disabled={item.status === "archived"}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, item.id]
                      : current.filter((id) => id !== item.id),
                  )
                }
              />
              <span>Seleccionar</span>
            </label>
            <div className="template-preview">
              <iframe
                title={`Vista previa de ${item.name}`}
                srcDoc={item.html_content}
                sandbox=""
              />
            </div>
            <div className="template-info">
              <div>
                <p className="eyebrow">
                  {item.channel} · {item.format ?? "html"} · v
                  {item.published_version_number ?? 1}
                </p>
                <h3>{item.name}</h3>
                <span>{item.subject}</span>
                <small className="template-key">
                  {item.folder ? `${item.folder} · ` : ""}
                  {item.key}
                </small>
                <small>
                  {item.author_name || "Sistema"} · {item.usage_count ?? 0} usos
                </small>
              </div>
              <div className="row-actions">
                {item.status === "archived" ? (
                  <button
                    className="button button-secondary button-small"
                    onClick={() => restore(item)}
                  >
                    <RotateCcw size={13} /> Restaurar
                  </button>
                ) : (
                  <>
                    <button
                      className="icon-button bordered"
                      onClick={() => move(item)}
                      aria-label={`Mover ${item.name}`}
                    >
                      <FolderIcon />
                    </button>
                    <button
                      className="icon-button bordered"
                      onClick={() => duplicate(item)}
                      aria-label={`Duplicar ${item.name}`}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-button bordered"
                      onClick={() =>
                        templateRouter.push(`/plantillas/${item.id}/editar`)
                      }
                      aria-label={`Editar ${item.name}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button bordered danger"
                      onClick={() => archive(item)}
                      aria-label={`Archivar ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
        {status !== "archived" && (
          <button
            className="template-card template-add"
            onClick={() => templateRouter.push("/plantillas/nueva")}
          >
            <span>
              <Plus size={24} />
            </span>
            <strong>Crear desde una base</strong>
            <small>Seis diseños iniciales en pantalla completa</small>
          </button>
        )}
      </div>
      {!filtered.length && !loading && (
        <div className="table-empty">
          <FileText size={24} />
          <p>No hay plantillas con estos filtros.</p>
        </div>
      )}
    </>
  );
}

function FolderIcon() {
  return <Folder size={14} />;
}

function TransactionalView({ data, refresh, notify }: ViewProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<TransactionalDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [part, setPart] = useState<"html" | "text">("html");
  const [retrying, setRetrying] = useState(false);
  const [detailError, setDetailError] = useState("");
  const messages = data.transactional.filter(
    (message) =>
      (status === "all" || message.status === status) &&
      `${message.to_email} ${message.subject} ${JSON.stringify(message.metadata)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function openMessage(id: string) {
    setLoadingDetail(true);
    setDetailError("");
    try {
      setSelected(
        await api<TransactionalDetail>(`/api/v1/transactional/messages/${id}`),
      );
      setPart("html");
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "No se pudo cargar el mensaje",
      );
    } finally {
      setLoadingDetail(false);
    }
  }
  async function retryMessage() {
    if (
      !selected ||
      !confirm(
        "Se creará un nuevo mensaje con exactamente el mismo contenido y adjuntos. ¿Continuar?",
      )
    )
      return;
    setRetrying(true);
    setDetailError("");
    try {
      const result = await api<{ id: string }>(
        `/api/v1/transactional/messages/${selected.id}/retry`,
        { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      await refresh();
      notify("Reintento encolado como un mensaje nuevo");
      await openMessage(result.id);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "No se pudo reintentar",
      );
    } finally {
      setRetrying(false);
    }
  }
  return (
    <>
      <PageIntro
        eyebrow="Aplicaciones y sistema"
        title="Transaccionales"
        text="Cada email individual, su contenido exacto y toda su línea temporal."
      />
      <section className="metric-grid transactional-metrics">
        <Metric
          icon={Mail}
          label="Aceptados"
          value={number.format(data.transactionalOverview.total)}
          detail="Histórico individual"
          tone="forest"
        />
        <Metric
          icon={Send}
          label="Enviados"
          value={number.format(data.transactionalOverview.sent)}
          detail="Aceptados por transporte"
          tone="clay"
        />
        <Metric
          icon={MailCheck}
          label="Entregados"
          value={number.format(data.transactionalOverview.delivered)}
          detail="Confirmados por receptor"
          tone="violet"
        />
        <Metric
          icon={CircleAlert}
          label="Fallidos"
          value={number.format(data.transactionalOverview.failed)}
          detail="Requieren revisión"
          tone="gold"
        />
      </section>
      <section className="panel table-panel">
        <div className="table-tools">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Buscar destinatario, asunto o metadata…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar mensajes por estado"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="queued">En cola</option>
            <option value="processing">Procesando</option>
            <option value="sent">Enviados</option>
            <option value="delivered">Entregados</option>
            <option value="failed">Fallidos</option>
            <option value="bounced">Rebotes</option>
          </select>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mensaje</th>
                <th>Destinatario</th>
                <th>Estado</th>
                <th>Plantilla</th>
                <th>Interacción</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr
                  key={message.id}
                  className="clickable-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir mensaje ${message.subject} para ${message.to_email}`}
                  onClick={() => openMessage(message.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMessage(message.id);
                    }
                  }}
                >
                  <td>
                    <strong>{message.subject}</strong>
                    <small className="table-id">{message.id}</small>
                  </td>
                  <td>
                    {message.to_name && (
                      <strong>
                        {message.to_name}
                        <br />
                      </strong>
                    )}
                    <span>{message.to_email}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${message.status}`}>
                      {statusLabel[message.status] ?? message.status}
                    </span>
                  </td>
                  <td>
                    {message.template_version_id ? (
                      <span className="token">Versión fijada</span>
                    ) : (
                      <span className="muted">HTML directo</span>
                    )}
                  </td>
                  <td>
                    {message.first_clicked_at
                      ? "Clic"
                      : message.first_opened_at
                        ? "Abierto"
                        : "—"}
                  </td>
                  <td>{date.format(new Date(message.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!messages.length && (
          <div className="table-empty">
            <Mail size={24} />
            <p>No hay mensajes con estos filtros.</p>
          </div>
        )}
      </section>
      {(selected || loadingDetail) && (
        <div className="transactional-detail-layer">
          <button
            className="detail-scrim"
            aria-label="Cerrar"
            onClick={() => setSelected(null)}
          />
          <aside className="transactional-detail">
            {loadingDetail && !selected ? (
              <LoadingState />
            ) : (
              selected && (
                <>
                  <header>
                    <div>
                      <p className="eyebrow">Mensaje transaccional</p>
                      <h2>{selected.subject}</h2>
                      <div className="detail-status-row">
                        <span className={`status-badge ${selected.status}`}>
                          {statusLabel[selected.status] ?? selected.status}
                        </span>
                        {selected.can_retry &&
                          data.currentUser.role !== "analyst" && (
                            <button
                              className="button button-secondary button-small"
                              onClick={retryMessage}
                              disabled={retrying}
                            >
                              <RotateCcw size={14} />
                              {retrying ? "Encolando…" : "Reintentar envío"}
                            </button>
                          )}
                      </div>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => setSelected(null)}
                    >
                      <X size={19} />
                    </button>
                  </header>
                  <div className="detail-body">
                    {detailError && <p className="form-error">{detailError}</p>}
                    <div className="message-addresses">
                      <span>
                        <small>De</small>
                        <strong>
                          {selected.from_name} &lt;{selected.from_email}&gt;
                        </strong>
                      </span>
                      <span>
                        <small>Para</small>
                        <strong>
                          {selected.to_name} &lt;{selected.to_email}&gt;
                        </strong>
                      </span>
                      <span>
                        <small>Identificador del proveedor</small>
                        <strong>
                          {selected.ses_message_id || "Pendiente"}
                        </strong>
                      </span>
                      {selected.batch_id && (
                        <span>
                          <small>Lote</small>
                          <strong>
                            {selected.batch_id} · posición{" "}
                            {Number(selected.batch_position) + 1}
                          </strong>
                        </span>
                      )}
                      {selected.retry_of_message_id && (
                        <span>
                          <small>Reintento de</small>
                          <strong>{selected.retry_of_message_id}</strong>
                        </span>
                      )}
                    </div>
                    <div className="content-tabs">
                      <button
                        className={part === "html" ? "active" : ""}
                        onClick={() => setPart("html")}
                      >
                        Vista HTML
                      </button>
                      <button
                        className={part === "text" ? "active" : ""}
                        onClick={() => setPart("text")}
                      >
                        Texto plano
                      </button>
                    </div>
                    {part === "html" ? (
                      <iframe
                        className="message-preview"
                        sandbox="allow-same-origin"
                        title="Contenido exacto enviado"
                        src={selected.html_url}
                      />
                    ) : (
                      <iframe
                        className="message-preview text-preview"
                        sandbox="allow-same-origin"
                        title="Texto exacto enviado"
                        src={selected.text_url}
                      />
                    )}
                    <section className="detail-section">
                      <h3>Adjuntos · {selected.attachments.length}</h3>
                      {selected.attachments.length ? (
                        <div className="attachment-list">
                          {selected.attachments.map((item) => (
                            <article key={item.id}>
                              <span>
                                <Paperclip size={15} />
                              </span>
                              <div>
                                <strong>{item.filename}</strong>
                                <small>
                                  {item.content_type} ·{" "}
                                  {number.format(item.byte_size ?? 0)} bytes ·{" "}
                                  {item.disposition}
                                </small>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="muted detail-empty">
                          Este mensaje no contiene adjuntos.
                        </p>
                      )}
                    </section>
                    <section className="detail-section">
                      <h3>
                        Intentos de transporte · {selected.attempts.length}
                      </h3>
                      {selected.attempts.length ? (
                        <div className="attempt-list">
                          {selected.attempts.map((item) => (
                            <article key={item.id}>
                              <span className={`status-badge ${item.status}`}>
                                {statusLabel[item.status] ?? item.status}
                              </span>
                              <div>
                                <strong>
                                  Intento {item.attempt_number} ·{" "}
                                  {item.transport}
                                </strong>
                                <small>
                                  {item.kind === "manual_retry"
                                    ? "Reintento manual"
                                    : "Envío automático"}{" "}
                                  ·{" "}
                                  {new Date(item.started_at).toLocaleString(
                                    "es-ES",
                                  )}
                                </small>
                                {item.error_message && (
                                  <small className="attempt-error">
                                    {item.error_code}: {item.error_message}
                                  </small>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="muted detail-empty">
                          Todavía no hay intentos registrados.
                        </p>
                      )}
                    </section>
                    <section className="detail-section">
                      <h3>Metadata</h3>
                      <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
                    </section>
                    <section className="detail-section">
                      <h3>Línea temporal</h3>
                      <div className="event-timeline">
                        {selected.events.map((event) => (
                          <article key={event.id}>
                            <i />
                            <div>
                              <strong>
                                {statusLabel[event.type] ?? event.type}
                              </strong>
                              <span>
                                {new Date(event.occurred_at).toLocaleString(
                                  "es-ES",
                                )}
                              </span>
                              {event.link_url && (
                                <small>{event.link_url}</small>
                              )}
                              <small>{event.source}</small>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function CampaignsView({
  data,
  refresh,
  notify,
  compose,
}: ViewProps & { compose: () => void }) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [reviewing, setReviewing] = useState<Campaign | null>(null);
  const [experimenting, setExperimenting] = useState<Campaign | null>(null);
  const [reporting, setReporting] = useState<Campaign | null>(null);
  const campaigns = data.campaigns.filter(
    (item) => filter === "all" || item.status === filter,
  );
  const canEdit = data.currentUser.role !== "analyst";
  async function action(campaign: Campaign, actionName: string) {
    if (
      actionName === "send" &&
      !confirm(`¿Enviar “${campaign.name}” ahora? La audiencia quedará fijada.`)
    )
      return;
    if (
      actionName === "cancel" &&
      !confirm(
        `¿Cancelar “${campaign.name}”? Los mensajes ya aceptados por el proveedor no se pueden retirar.`,
      )
    )
      return;
    if (actionName === "send") {
      const preflight = await api<{
        valid: boolean;
        errors: { message: string }[];
        audience: { included: number };
      }>(`/api/v1/campaigns/${campaign.id}/preflight`);
      if (!preflight.valid)
        throw new Error(
          preflight.errors.map((item) => item.message).join(" · "),
        );
      await api(`/api/v1/campaigns/${campaign.id}/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          confirm_recipient_count: preflight.audience.included,
        }),
      });
    } else
      await api(`/api/v1/campaigns/${campaign.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName }),
      });
    await refresh();
    notify(
      actionName === "send"
        ? "Campaña añadida a la cola"
        : actionName === "pause"
          ? "Campaña pausada"
          : actionName === "resume"
            ? "Campaña reanudada"
            : actionName === "cancel"
              ? "Campaña cancelada"
              : "Campaña actualizada",
    );
  }
  async function duplicate(campaign: Campaign) {
    await api(`/api/v1/campaigns/${campaign.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${campaign.name} · copia` }),
    });
    await refresh();
    notify("Campaña duplicada como borrador");
  }
  return (
    <>
      <PageIntro
        eyebrow="Envíos"
        title="Campañas"
        text="Crea, programa y sigue cada envío desde un mismo lugar."
        actions={
          canEdit ? (
            <button className="button button-primary" onClick={compose}>
              <Plus size={16} /> Nueva campaña
            </button>
          ) : undefined
        }
      />
      <div className="filter-tabs">
        {[
          ["all", "Todas"],
          ["draft", "Borradores"],
          ["pending_approval", "Por aprobar"],
          ["scheduled", "Programadas"],
          ["sending", "En curso"],
          ["paused", "Pausadas"],
          ["completed", "Completadas"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {label}
            <span>
              {id === "all"
                ? data.campaigns.length
                : data.campaigns.filter((campaign) => campaign.status === id)
                    .length}
            </span>
          </button>
        ))}
      </div>
      <section className="panel campaign-table">
        <div className="campaign-list campaign-list-full">
          {campaigns.map((campaign) => {
            const approved = Boolean(
              campaign.approved_at &&
                campaign.approved_version === campaign.version,
            );
            const hasReport = campaign.total_recipients > 0;
            return (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                actions={
                  canEdit || campaign.experiment || hasReport ? (
                    <div className="row-actions">
                      {hasReport && (
                        <button
                          className="button button-small button-secondary"
                          onClick={() => setReporting(campaign)}
                        >
                          <BarChart3 size={14} />
                          Informe
                        </button>
                      )}
                      {campaign.experiment && (
                        <button
                          className="button button-small button-secondary"
                          onClick={() => setExperimenting(campaign)}
                        >
                          <Layers3 size={14} />
                          A/B
                        </button>
                      )}
                      {canEdit && (
                        <>
                          {["draft", "scheduled"].includes(campaign.status) && (
                            <button
                              className="icon-button"
                              onClick={() => setEditing(campaign)}
                              aria-label="Editar"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {campaign.status === "draft" &&
                            !campaign.experiment && (
                              <button
                                className="button button-small button-secondary"
                                onClick={() => setExperimenting(campaign)}
                              >
                                <Layers3 size={14} />
                                Crear A/B
                              </button>
                            )}
                          {["draft", "pending_approval", "scheduled"].includes(
                            campaign.status,
                          ) && (
                            <button
                              className="button button-small button-secondary"
                              onClick={() => setReviewing(campaign)}
                            >
                              <MailCheck size={14} />
                              {campaign.status === "pending_approval"
                                ? "Revisar"
                                : approved
                                  ? "Aprobada"
                                  : "Aprobación"}
                            </button>
                          )}
                          {campaign.status === "draft" &&
                            (!campaign.approval_required || approved) && (
                              <button
                                className="button button-small button-primary"
                                onClick={() => action(campaign, "send")}
                              >
                                <Send size={14} /> Enviar
                              </button>
                            )}
                          {campaign.status === "paused" && (
                            <button
                              className="button button-small button-primary"
                              onClick={() => action(campaign, "resume")}
                            >
                              <Send size={14} /> Reanudar
                            </button>
                          )}
                          {campaign.status === "sending" && (
                            <button
                              className="button button-small button-secondary"
                              onClick={() => action(campaign, "pause")}
                            >
                              <Clock3 size={14} /> Pausar
                            </button>
                          )}
                          {[
                            "pending_approval",
                            "scheduled",
                            "sending",
                            "paused",
                          ].includes(campaign.status) && (
                            <button
                              className="button button-small button-secondary"
                              onClick={() => action(campaign, "cancel")}
                            >
                              <X size={14} /> Cancelar
                            </button>
                          )}
                          <button
                            className="icon-button"
                            onClick={() => duplicate(campaign)}
                            aria-label="Duplicar"
                          >
                            <Copy size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </div>
        {!campaigns.length && (
          <div className="table-empty">
            <Mail size={24} />
            <p>No hay campañas en este estado.</p>
          </div>
        )}
      </section>
      {editing && (
        <CampaignModal
          data={data}
          campaign={editing}
          close={() => setEditing(null)}
          done={async (message) => {
            setEditing(null);
            await refresh();
            notify(message);
          }}
        />
      )}
      {reviewing && (
        <CampaignApprovalModal
          campaign={reviewing}
          role={data.currentUser.role}
          close={() => setReviewing(null)}
          done={async (message) => {
            setReviewing(null);
            await refresh();
            notify(message);
          }}
        />
      )}
      {experimenting && (
        <CampaignExperimentModal
          campaign={experimenting}
          close={() => setExperimenting(null)}
          done={async (message) => {
            setExperimenting(null);
            await refresh();
            notify(message);
          }}
        />
      )}
      {reporting && (
        <CampaignReportModal
          campaign={reporting}
          close={() => setReporting(null)}
        />
      )}
    </>
  );
}

function CampaignApprovalModal({
  campaign,
  role,
  close,
  done,
}: {
  campaign: Campaign;
  role: CurrentUser["role"];
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<CampaignDetail>(`/api/v1/campaigns/${campaign.id}`)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la revisión",
          );
      });
    return () => {
      active = false;
    };
  }, [campaign.id]);
  async function submit(
    actionName: "request_approval" | "approve" | "reject" | "comment",
  ) {
    if (!comment.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/campaigns/${campaign.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, comment: comment.trim() }),
      });
      await done(
        actionName === "request_approval"
          ? "Campaña enviada a aprobación"
          : actionName === "approve"
            ? "Campaña aprobada"
            : actionName === "reject"
              ? "Campaña rechazada"
              : "Comentario añadido",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo completar la revisión",
      );
      setSaving(false);
    }
  }
  const approved = Boolean(
    detail?.approved_at && detail.approved_version === detail.version,
  );
  const pending = detail?.status === "pending_approval";
  const canDecide = pending && role === "admin";
  return (
    <Modal
      title="Revisión y aprobación"
      eyebrow={campaign.name}
      close={close}
      wide
    >
      <div className="approval-layout">
        <section>
          <div
            className={`approval-state ${approved ? "approved" : pending ? "pending" : "draft"}`}
          >
            {approved ? (
              <>
                <CircleCheck size={20} />
                <div>
                  <strong>Versión {detail?.version} aprobada</strong>
                  <p>
                    Puede programarse o enviarse mientras no cambien contenido
                    ni audiencia.
                  </p>
                </div>
              </>
            ) : pending ? (
              <>
                <Clock3 size={20} />
                <div>
                  <strong>Pendiente de aprobación</strong>
                  <p>
                    Un administrador debe revisar la versión {detail?.version}.
                  </p>
                </div>
              </>
            ) : (
              <>
                <CircleAlert size={20} />
                <div>
                  <strong>
                    {detail?.approval_required
                      ? "Necesita una nueva aprobación"
                      : "Aprobación opcional"}
                  </strong>
                  <p>
                    Solicita revisión antes de programar o enviar si este
                    contenido lo requiere.
                  </p>
                </div>
              </>
            )}
          </div>
          <label>
            Comentario
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
              placeholder={
                canDecide
                  ? "Explica la decisión…"
                  : pending
                    ? "Añade contexto para la revisión…"
                    : "Describe qué debe revisar el administrador…"
              }
              autoFocus
            />
          </label>
          {error && <p className="form-error">{error}</p>}
        </section>
        <aside className="approval-history">
          <h3>Historial</h3>
          {detail?.approval_comments.length ? (
            detail.approval_comments.map((item) => (
              <article key={item.id}>
                <i className={item.action} />
                <div>
                  <strong>
                    {item.action === "request"
                      ? "Solicitud"
                      : item.action === "approve"
                        ? "Aprobación"
                        : item.action === "reject"
                          ? "Rechazo"
                          : item.action === "invalidated"
                            ? "Invalidada"
                            : "Comentario"}{" "}
                    · v{item.campaign_version}
                  </strong>
                  <p>{item.comment}</p>
                  <small>
                    {item.actor_name} ·{" "}
                    {new Date(item.created_at).toLocaleString("es-ES")}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">Todavía no hay actividad de revisión.</p>
          )}
        </aside>
      </div>
      <footer className="modal-actions">
        <button className="button button-secondary" onClick={close}>
          Cerrar
        </button>
        {canDecide ? (
          <>
            <button
              className="button button-secondary"
              disabled={saving || !comment.trim()}
              onClick={() => submit("reject")}
            >
              Rechazar
            </button>
            <button
              className="button button-primary"
              disabled={saving || !comment.trim()}
              onClick={() => submit("approve")}
            >
              Aprobar versión
            </button>
          </>
        ) : pending ? (
          <button
            className="button button-primary"
            disabled={saving || !comment.trim()}
            onClick={() => submit("comment")}
          >
            Añadir comentario
          </button>
        ) : approved ? (
          <button
            className="button button-primary"
            disabled={saving || !comment.trim()}
            onClick={() => submit("comment")}
          >
            Añadir comentario
          </button>
        ) : (
          <button
            className="button button-primary"
            disabled={saving || !comment.trim()}
            onClick={() => submit("request_approval")}
          >
            Solicitar aprobación
          </button>
        )}
      </footer>
    </Modal>
  );
}

function CampaignExperimentModal({
  campaign,
  close,
  done,
}: {
  campaign: Campaign;
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const makeVariant = (
    name: string,
    weight: number,
    subject: string,
  ): ExperimentVariant => ({
    name,
    weight,
    subject,
    preview_text: campaign.preview_text,
    from_name: campaign.from_name,
    from_email: campaign.from_email,
    reply_to: campaign.reply_to,
    html_content: campaign.html_content,
    text_content: campaign.text_content,
  });
  const [report, setReport] = useState<ExperimentReport | null>(null);
  const [loading, setLoading] = useState(Boolean(campaign.experiment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [samplePercentage, setSamplePercentage] = useState(40);
  const [winnerMetric, setWinnerMetric] = useState<
    "opens" | "clicks" | "manual"
  >("clicks");
  const [waitMinutes, setWaitMinutes] = useState(60);
  const [minimumSample, setMinimumSample] = useState(100);
  const [variants, setVariants] = useState<ExperimentVariant[]>([
    makeVariant("Variante A · control", 50, campaign.subject),
    makeVariant("Variante B", 50, `${campaign.subject} · alternativa`),
  ]);
  useEffect(() => {
    if (!campaign.experiment) return;
    let active = true;
    api<ExperimentReport>(`/api/v1/campaigns/${campaign.id}/experiment`)
      .then((value) => {
        if (active) {
          setReport(value);
          setSamplePercentage(value.sample_percentage);
          setWinnerMetric(value.winner_metric);
          setWaitMinutes(value.wait_minutes);
          setMinimumSample(value.minimum_sample_size);
          setVariants(value.variants);
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "No se pudo cargar la prueba",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaign.id, campaign.experiment]);
  function patchVariant(index: number, change: Partial<ExperimentVariant>) {
    setVariants((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...change } : item,
      ),
    );
  }
  function rebalance(items: ExperimentVariant[]) {
    const base = Math.floor(100 / items.length);
    return items.map((item, index) => ({
      ...item,
      weight: base + (index < 100 - base * items.length ? 1 : 0),
    }));
  }
  function addVariant() {
    if (variants.length >= 4) return;
    setVariants((current) =>
      rebalance([
        ...current,
        makeVariant(
          `Variante ${String.fromCharCode(65 + current.length)}`,
          1,
          campaign.subject,
        ),
      ]),
    );
  }
  function removeVariant(index: number) {
    if (variants.length <= 2) return;
    setVariants((current) =>
      rebalance(current.filter((_, itemIndex) => itemIndex !== index)),
    );
  }
  async function save() {
    if (variants.reduce((sum, item) => sum + Number(item.weight), 0) !== 100) {
      setError("Los pesos deben sumar exactamente 100%.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/campaigns/${campaign.id}/experiment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: campaign.version,
          sample_percentage: samplePercentage,
          winner_metric: winnerMetric,
          wait_minutes: waitMinutes,
          minimum_sample_size: minimumSample,
          variants: variants.map((item) => ({
            name: item.name,
            weight: Number(item.weight),
            subject: item.subject,
            preview_text: item.preview_text,
            from: { name: item.from_name, email: item.from_email },
            reply_to: item.reply_to,
            content: { html: item.html_content, text: item.text_content },
          })),
        }),
      });
      await done("Prueba A/B configurada");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar la prueba",
      );
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("¿Retirar la prueba A/B de este borrador?")) return;
    setSaving(true);
    try {
      await api(`/api/v1/campaigns/${campaign.id}/experiment`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: campaign.version }),
      });
      await done("Prueba A/B retirada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo retirar");
      setSaving(false);
    }
  }
  async function choose(variantId?: string) {
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/campaigns/${campaign.id}/experiment/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          variantId
            ? { action: "select_winner", variant_id: variantId }
            : { action: "evaluate" },
        ),
      });
      await done(
        variantId
          ? "Ganador A/B elegido"
          : "Muestra evaluada y ganador elegido",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo elegir ganador",
      );
      setSaving(false);
    }
  }
  const editable =
    campaign.status === "draft" && (!report || report.status === "configured");
  const statusText =
    report?.status === "configured"
      ? "Configurada"
      : report?.status === "sampling"
        ? "Enviando muestra"
        : report?.status === "waiting"
          ? "Muestra lista"
          : report?.status === "winner_selected"
            ? "Ganador en envío"
            : report?.status === "completed"
              ? "Completada"
              : (report?.status ?? "Nueva");
  if (loading)
    return (
      <Modal title="Prueba A/B" eyebrow={campaign.name} close={close} wide>
        <LoadingState />
      </Modal>
    );
  return (
    <Modal title="Prueba A/B" eyebrow={campaign.name} close={close} wide>
      <div className="experiment-body">
        {report && (
          <section className="experiment-overview">
            <div>
              <span className={`status-badge ${report.status}`}>
                {statusText}
              </span>
              <strong>
                {report.sample_percentage}% de muestra ·{" "}
                {report.actual_sample_size ?? "—"} personas
              </strong>
              <small>
                Ganador por{" "}
                {report.winner_metric === "clicks"
                  ? "clics"
                  : report.winner_metric === "opens"
                    ? "aperturas"
                    : "decisión manual"}{" "}
                · espera {report.wait_minutes} min · resto{" "}
                {report.remainder_size ?? "—"}
              </small>
            </div>
            {report.test_dimensions?.length > 0 && (
              <div className="token-list">
                {report.test_dimensions.map((item) => (
                  <span className="token" key={item}>
                    {item === "subject"
                      ? "Asunto"
                      : item === "preview_text"
                        ? "Preencabezado"
                        : item === "sender"
                          ? "Remitente"
                          : "Contenido"}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
        {report?.warnings.map((item) => (
          <div className="info-callout" key={item}>
            <CircleAlert size={17} />
            <p>{item}</p>
          </div>
        ))}
        {editable ? (
          <>
            <section className="experiment-settings">
              <label>
                Muestra sobre la audiencia
                <input
                  type="number"
                  min="10"
                  max="90"
                  value={samplePercentage}
                  onChange={(event) =>
                    setSamplePercentage(Number(event.target.value))
                  }
                />
                <small>
                  {samplePercentage}% recibe variantes; el resto espera al
                  ganador.
                </small>
              </label>
              <label>
                Criterio ganador
                <select
                  value={winnerMetric}
                  onChange={(event) =>
                    setWinnerMetric(event.target.value as typeof winnerMetric)
                  }
                >
                  <option value="clicks">Clics únicos</option>
                  <option value="opens">Aperturas únicas</option>
                  <option value="manual">Elección manual</option>
                </select>
              </label>
              <label>
                Espera antes de evaluar
                <input
                  type="number"
                  min="0"
                  max="10080"
                  value={waitMinutes}
                  onChange={(event) =>
                    setWaitMinutes(Number(event.target.value))
                  }
                />
                <small>Minutos desde que termina la muestra.</small>
              </label>
              <label>
                Muestra mínima recomendada
                <input
                  type="number"
                  min="2"
                  value={minimumSample}
                  onChange={(event) =>
                    setMinimumSample(Number(event.target.value))
                  }
                />
              </label>
            </section>
            <div className="variant-editor-head">
              <div>
                <h3>Variantes</h3>
                <p>
                  El primer bloque es el control. Puedes cambiar asunto,
                  preencabezado, remitente o el HTML completo.
                </p>
              </div>
              <button
                className="button button-secondary button-small"
                disabled={variants.length >= 4}
                onClick={addVariant}
              >
                <Plus size={14} /> Añadir variante
              </button>
            </div>
            <section className="variant-editor-grid">
              {variants.map((item, index) => (
                <article
                  key={item.id ?? index}
                  className={index === 0 ? "control" : ""}
                >
                  <header>
                    <span>
                      {index === 0
                        ? "Control"
                        : `Variante ${String.fromCharCode(65 + index)}`}
                    </span>
                    {index > 1 && (
                      <button
                        className="icon-button danger"
                        onClick={() => removeVariant(index)}
                        aria-label={`Eliminar ${item.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </header>
                  <div className="form-grid">
                    <label>
                      Nombre
                      <input
                        value={item.name}
                        onChange={(event) =>
                          patchVariant(index, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Peso %
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={item.weight}
                        onChange={(event) =>
                          patchVariant(index, {
                            weight: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="full">
                      Asunto
                      <input
                        value={item.subject}
                        onChange={(event) =>
                          patchVariant(index, { subject: event.target.value })
                        }
                      />
                    </label>
                    <label className="full">
                      Preencabezado
                      <input
                        value={item.preview_text}
                        onChange={(event) =>
                          patchVariant(index, {
                            preview_text: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Nombre remitente
                      <input
                        value={item.from_name}
                        onChange={(event) =>
                          patchVariant(index, { from_name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Correo remitente
                      <input
                        type="email"
                        value={item.from_email}
                        onChange={(event) =>
                          patchVariant(index, {
                            from_email: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="full">
                      HTML
                      <textarea
                        className="experiment-html"
                        value={item.html_content}
                        onChange={(event) =>
                          patchVariant(index, {
                            html_content: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="full">
                      Texto plano
                      <textarea
                        value={item.text_content}
                        onChange={(event) =>
                          patchVariant(index, {
                            text_content: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </section>
            <div
              className={`weight-total ${variants.reduce((sum, item) => sum + Number(item.weight), 0) === 100 ? "valid" : "invalid"}`}
            >
              Reparto total:{" "}
              {variants.reduce((sum, item) => sum + Number(item.weight), 0)}%
            </div>
          </>
        ) : (
          report && (
            <section className="variant-results">
              {report.variants.map((item, index) => {
                const winner = report.winner_variant_id === item.id;
                return (
                  <article key={item.id} className={winner ? "winner" : ""}>
                    <header>
                      <div>
                        <span>{index === 0 ? "Control" : "Variante"}</span>
                        <h3>{item.name}</h3>
                      </div>
                      {winner && (
                        <span className="winner-pill">
                          <Check size={13} /> Ganadora
                        </span>
                      )}
                    </header>
                    <strong>{item.subject}</strong>
                    <div className="variant-metrics">
                      <span>
                        <small>Muestra</small>
                        <b>{item.sample_recipients ?? 0}</b>
                      </span>
                      <span>
                        <small>Entregados</small>
                        <b>{item.sample_delivered ?? 0}</b>
                      </span>
                      <span>
                        <small>Apertura</small>
                        <b>
                          {((item.sample_open_rate ?? 0) * 100).toFixed(1)}%
                        </b>
                      </span>
                      <span>
                        <small>Clic</small>
                        <b>
                          {((item.sample_click_rate ?? 0) * 100).toFixed(1)}%
                        </b>
                      </span>
                      <span>
                        <small>Total final</small>
                        <b>{item.total_recipients ?? 0}</b>
                      </span>
                    </div>
                    {report.status === "waiting" &&
                      winnerMetric === "manual" && (
                        <button
                          className="button button-primary button-small"
                          disabled={saving}
                          onClick={() => choose(item.id)}
                        >
                          Elegir esta variante
                        </button>
                      )}
                  </article>
                );
              })}
            </section>
          )
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
      <footer className="modal-actions">
        {editable && report && (
          <button
            className="button button-secondary"
            disabled={saving}
            onClick={remove}
          >
            Retirar A/B
          </button>
        )}
        <button className="button button-secondary" onClick={close}>
          Cerrar
        </button>
        {editable && (
          <button
            className="button button-primary"
            disabled={
              saving ||
              variants.some(
                (item) =>
                  !item.name ||
                  !item.subject ||
                  !item.from_email ||
                  !item.html_content,
              )
            }
            onClick={save}
          >
            {saving
              ? "Guardando…"
              : report
                ? "Actualizar prueba"
                : "Configurar prueba"}
          </button>
        )}
        {report?.status === "waiting" && winnerMetric !== "manual" && (
          <button
            className="button button-primary"
            disabled={saving}
            onClick={() => choose()}
          >
            Evaluar ahora
          </button>
        )}
      </footer>
    </Modal>
  );
}

function ReportsView({ data }: { data: AppData }) {
  const [tab, setTab] = useState<"campaigns" | "transactional" | "audience">(
    "campaigns",
  );
  const [days, setDays] = useState(30);
  const [listId, setListId] = useState("all");
  const [breakdownField, setBreakdownField] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaignReport, setCampaignReport] = useState<CampaignsReport | null>(
    null,
  );
  const [transactionalReport, setTransactionalReport] =
    useState<TransactionalReport | null>(null);
  const [audienceReport, setAudienceReport] = useState<AudienceReport | null>(
    null,
  );
  const [selected, setSelected] = useState<Campaign | null>(null);
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400_000);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (listId !== "all" && tab !== "transactional")
      params.set("list_id", listId);
    if (tab === "campaigns" && listId !== "all" && breakdownField)
      params.set("breakdown_field", breakdownField);
    return params.toString();
  }, [days, listId, tab, breakdownField]);
  // A changed report scope intentionally enters a fresh loading state before fetching.
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    const endpoint =
      tab === "campaigns"
        ? "campaigns"
        : tab === "transactional"
          ? "transactional"
          : "audience";
    api<CampaignsReport | TransactionalReport | AudienceReport>(
      `/api/v1/reports/${endpoint}?${range}`,
    )
      .then((result) => {
        if (!active) return;
        if (tab === "campaigns") setCampaignReport(result as CampaignsReport);
        else if (tab === "transactional")
          setTransactionalReport(result as TransactionalReport);
        else setAudienceReport(result as AudienceReport);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "No se pudo cargar el informe",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, range, revision]);
  const exportUrl = `/api/v1/reports/${tab}?${range}&format=csv`;
  return (
    <>
      <PageIntro
        eyebrow="Resultados"
        title="Informes"
        text="Campañas, transaccionales y crecimiento de audiencia, sin mezclar señales de canales distintos."
        actions={
          <a className="button button-secondary" href={exportUrl}>
            <Upload size={15} />
            Exportar CSV
          </a>
        }
      />
      <div className="report-controls">
        <div className="filter-tabs report-tabs">
          {[
            ["campaigns", "Campañas"],
            ["transactional", "Transaccionales"],
            ["audience", "Audiencia"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="report-filters">
          <label>
            Periodo
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
              <option value={365}>Último año</option>
            </select>
          </label>
          {tab !== "transactional" && (
            <label>
              Lista
              <select
                value={listId}
                onChange={(event) => {
                  setListId(event.target.value);
                  setBreakdownField("");
                }}
              >
                <option value="all">Todas las listas</option>
                {data.lists.map((list) => (
                  <option value={list.id} key={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tab === "campaigns" &&
          listId !== "all" &&
          campaignReport?.dimensions.length ? (
            <label>
              Comparar campo
              <select
                value={breakdownField}
                onChange={(event) => setBreakdownField(event.target.value)}
              >
                <option value="">Sin desglose</option>
                {campaignReport.dimensions.map((field) => (
                  <option value={field.key} key={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      {loading ? (
        <section className="panel report-loading">
          <RefreshCw className="spin" size={20} />
          Calculando métricas desde los eventos brutos…
        </section>
      ) : error ? (
        <ErrorState
          message={error}
          retry={() => setRevision((value) => value + 1)}
        />
      ) : tab === "campaigns" && campaignReport ? (
        <AdvancedCampaignsReportPanel
          report={campaignReport}
          select={(item) =>
            setSelected(
              data.campaigns.find((c) => c.id === item.id) ??
                (item as unknown as Campaign),
            )
          }
        />
      ) : tab === "transactional" && transactionalReport ? (
        <AdvancedTransactionalReportPanel report={transactionalReport} />
      ) : audienceReport ? (
        <AdvancedAudienceReportPanel report={audienceReport} />
      ) : null}
      <div className="report-notes">
        <article>
          <Gauge size={21} />
          <div>
            <strong>Señales, no lecturas garantizadas</strong>
            <p>
              Las aperturas pueden estar infladas por privacidad y precarga. Los
              eventos automatizados identificables se separan, sin borrar el
              dato bruto.
            </p>
          </div>
        </article>
        <article>
          <UserMinus size={21} />
          <div>
            <strong>Únicos y totales nunca se mezclan</strong>
            <p>
              Las tasas usan personas únicas; el volumen total de aperturas y
              clics permanece disponible para diagnóstico.
            </p>
          </div>
        </article>
      </div>
      {selected && (
        <CampaignReportModal
          campaign={selected}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}

function CampaignsReportPanel({
  report,
  select,
}: {
  report: CampaignsReport;
  select: (campaign: ReportCampaign) => void;
}) {
  const s = report.summary;
  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow light">Entregados en el periodo</p>
          <h2>{number.format(s.delivered)}</h2>
          <span>
            {number.format(s.campaigns)} campañas ·{" "}
            {number.format(s.recipients)} destinatarios
          </span>
        </div>
        <div className="report-hero-metrics">
          <span>
            <small>Apertura única</small>
            <strong>{formatPercent(s.open_rate)}</strong>
          </span>
          <span>
            <small>Clic único</small>
            <strong>{formatPercent(s.click_rate)}</strong>
          </span>
          <span>
            <small>Clic / apertura</small>
            <strong>{formatPercent(s.click_to_open_rate)}</strong>
          </span>
        </div>
      </section>
      <section className="report-metric-strip">
        <MiniReportMetric label="Enviados" value={s.sent} />
        <MiniReportMetric label="Retrasados" value={s.delayed} />
        <MiniReportMetric label="Fallidos" value={s.failed} />
        <MiniReportMetric label="Rebotes" value={s.bounced} />
        <MiniReportMetric label="Quejas" value={s.complained} />
        <MiniReportMetric label="Bajas" value={s.unsubscribed} />
      </section>
      <TrendChart
        rows={report.daily.map((row) => ({
          date: row.date,
          primary: row.delivered,
          secondary: row.total_clicks,
        }))}
        primary="Entregados"
        secondary="Clics totales"
      />
      <section className="panel report-table-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Comparativa</p>
            <h3>Rendimiento por campaña</h3>
          </div>
          <div className="benchmark-pills">
            <span>
              Mediana apertura{" "}
              {formatPercent(report.benchmarks.median_open_rate)}
            </span>
            <span>
              Mediana clic {formatPercent(report.benchmarks.median_click_rate)}
            </span>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Entregados</th>
                <th>Apertura única</th>
                <th>Clic único</th>
                <th>CTOR</th>
                <th>Incidencias</th>
              </tr>
            </thead>
            <tbody>
              {report.campaigns.map((item) => (
                <tr
                  key={item.id}
                  className="clickable-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir informe de ${item.name}`}
                  onClick={() => select(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select(item);
                    }
                  }}
                >
                  <td>
                    <strong>{item.name}</strong>
                    <small>
                      {item.list_name ?? "Sin lista"} ·{" "}
                      {date.format(
                        new Date(item.started_at ?? item.created_at),
                      )}
                    </small>
                  </td>
                  <td>{number.format(item.delivered_count)}</td>
                  <td>
                    <Rate
                      value={item.unique_opens}
                      total={item.delivered_count}
                    />
                  </td>
                  <td>
                    <Rate
                      value={item.unique_clicks}
                      total={item.delivered_count}
                    />
                  </td>
                  <td>{formatPercent(item.click_to_open_rate)}</td>
                  <td>
                    {item.bounce_count +
                      item.complaint_count +
                      item.failed_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.campaigns.length && (
          <div className="table-empty">
            <BarChart3 size={24} />
            <p>No hay campañas en este periodo.</p>
          </div>
        )}
      </section>
    </>
  );
}

function TransactionalReportPanel({ report }: { report: TransactionalReport }) {
  const s = report.summary;
  return (
    <>
      <section className="report-hero transactional-tone">
        <div>
          <p className="eyebrow light">Solicitudes transaccionales</p>
          <h2>{number.format(s.total)}</h2>
          <span>
            {number.format(s.delivered)} entregadas · {number.format(s.failed)}{" "}
            fallidas
          </span>
        </div>
        <div className="report-hero-metrics">
          <span>
            <small>Procesado medio</small>
            <strong>{formatDuration(s.avg_processing_ms)}</strong>
          </span>
          <span>
            <small>P95 procesado</small>
            <strong>{formatDuration(s.p95_processing_ms)}</strong>
          </span>
          <span>
            <small>P95 entrega</small>
            <strong>{formatDuration(s.p95_delivery_ms)}</strong>
          </span>
        </div>
      </section>
      <section className="report-metric-strip">
        <MiniReportMetric label="Procesados" value={s.processed} />
        <MiniReportMetric label="Enviados" value={s.sent} />
        <MiniReportMetric label="Entregados" value={s.delivered} />
        <MiniReportMetric label="Retrasados" value={s.delayed} />
        <MiniReportMetric label="Rebotes" value={s.bounced} />
        <MiniReportMetric label="Fallidos" value={s.failed} />
      </section>
      <TrendChart
        rows={report.daily.map((row) => ({
          date: row.date,
          primary: row.total,
          secondary: row.failed,
        }))}
        primary="Solicitados"
        secondary="Fallidos"
      />
      <div className="report-two-columns">
        <section className="panel report-ranked">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Plantillas</p>
              <h3>Volumen y latencia</h3>
            </div>
          </div>
          {report.templates.map((item) => (
            <article key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {number.format(item.delivered)} entregados ·{" "}
                  {number.format(item.failed)} fallidos
                </small>
              </div>
              <span>{number.format(item.total)}</span>
              <em>{formatDuration(item.avg_delivery_ms)}</em>
            </article>
          ))}
        </section>
        <section className="panel report-ranked">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Estado final</p>
              <h3>Distribución</h3>
            </div>
          </div>
          {report.statuses.map((item) => (
            <article key={item.status}>
              <div>
                <strong>{statusLabel[item.status] ?? item.status}</strong>
              </div>
              <span>{number.format(item.count)}</span>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

function AudienceReportPanel({ report }: { report: AudienceReport }) {
  const s = report.summary;
  return (
    <>
      <section className="report-hero audience-tone">
        <div>
          <p className="eyebrow light">Crecimiento neto</p>
          <h2>
            {s.net >= 0 ? "+" : ""}
            {number.format(s.net)}
          </h2>
          <span>
            {number.format(s.additions)} altas · {number.format(s.removals)}{" "}
            bajas
          </span>
        </div>
        <div className="report-hero-metrics">
          <span>
            <small>Activas ahora</small>
            <strong>{number.format(s.active)}</strong>
          </span>
          <span>
            <small>Pendientes</small>
            <strong>{number.format(s.pending)}</strong>
          </span>
          <span>
            <small>Bajas históricas</small>
            <strong>{number.format(s.unsubscribed)}</strong>
          </span>
        </div>
      </section>
      <TrendChart
        rows={report.daily.map((row) => ({
          date: row.date,
          primary: row.additions,
          secondary: row.removals,
        }))}
        primary="Altas"
        secondary="Bajas"
      />
      <div className="report-two-columns">
        <section className="panel report-table-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Publicaciones</p>
              <h3>Estado por lista</h3>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lista</th>
                  <th>Activas</th>
                  <th>Pendientes</th>
                  <th>Bajas</th>
                </tr>
              </thead>
              <tbody>
                {report.lists.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{number.format(item.active)}</td>
                    <td>{number.format(item.pending)}</td>
                    <td>{number.format(item.unsubscribed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel report-ranked">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Adquisición</p>
              <h3>Origen de las altas</h3>
            </div>
          </div>
          {report.sources.map((item) => (
            <article key={item.source}>
              <div>
                <strong>{item.source}</strong>
              </div>
              <span>{number.format(item.count)}</span>
            </article>
          ))}
          {!report.sources.length && (
            <p className="muted">No hay altas en este periodo.</p>
          )}
        </section>
      </div>
    </>
  );
}

function ChangeBadge({
  change,
  rate = false,
  inverse = false,
}: {
  change: ReportChange;
  rate?: boolean;
  inverse?: boolean;
}) {
  const raw = rate ? change.delta : change.relative_change;
  if (raw === null)
    return <span className="comparison-badge neutral">Sin base anterior</span>;
  const positive = inverse ? raw < 0 : raw > 0;
  const neutral = Math.abs(raw) < 0.00005;
  return (
    <span
      className={`comparison-badge ${neutral ? "neutral" : positive ? "positive" : "negative"}`}
    >
      {raw > 0 ? "+" : ""}
      {rate ? `${(raw * 100).toFixed(1)} pp` : formatPercent(raw)}
    </span>
  );
}

function PeriodComparison({
  items,
}: {
  items: {
    label: string;
    current: string;
    previous: string;
    change: ReportChange;
    rate?: boolean;
    inverse?: boolean;
  }[];
}) {
  return (
    <section className="panel period-comparison">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Periodo anterior equivalente</p>
          <h3>Evolución comparable</h3>
        </div>
        <span className="muted">Misma duración, inmediatamente anterior</span>
      </div>
      <div className="comparison-grid">
        {items.map((item) => (
          <article key={item.label}>
            <small>{item.label}</small>
            <strong>{item.current}</strong>
            <span>Antes: {item.previous}</span>
            <ChangeBadge
              change={item.change}
              rate={item.rate}
              inverse={item.inverse}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function SignalPanel({
  title,
  dimension,
}: {
  title: string;
  dimension: SignalDimension;
}) {
  return (
    <section className="panel report-ranked">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Señal agregada</p>
          <h3>{title}</h3>
        </div>
        <span className="muted">{dimension.sample_size} señales</span>
      </div>
      {dimension.available ? (
        dimension.groups.map((item) => (
          <article key={item.name}>
            <div>
              <strong>{item.name}</strong>
              <small>{formatPercent(item.share)} de las clasificadas</small>
            </div>
            <span>{number.format(item.count)}</span>
          </article>
        ))
      ) : (
        <p className="muted signal-unavailable">{dimension.reason}</p>
      )}
    </section>
  );
}

function CampaignComparisonBreakdowns({ report }: { report: CampaignsReport }) {
  return (
    <>
      <div className="report-two-columns advanced-breakdowns">
        <section className="panel report-ranked">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Segmentos históricos</p>
              <h3>Rendimiento por segmento</h3>
            </div>
            <span className="muted">
              Mín. {report.segment_breakdown.minimum_group_size}
            </span>
          </div>
          {report.segment_breakdown.groups.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.campaigns} campañas · {item.recipients} destinatarios ·
                  apertura {formatPercent(item.open_rate)}
                </small>
              </div>
              <span>{formatPercent(item.click_rate)}</span>
            </article>
          ))}
          {!report.segment_breakdown.groups.length && (
            <p className="muted signal-unavailable">
              No hay segmentos con una muestra suficiente en este periodo.
            </p>
          )}
        </section>
        {report.field_breakdown ? (
          <section className="panel report-ranked">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Snapshot de audiencia</p>
                <h3>{report.field_breakdown.field.label}</h3>
              </div>
              <span className="muted">
                Mín. {report.field_breakdown.minimum_group_size}
              </span>
            </div>
            {report.field_breakdown.groups.map((item) => (
              <article key={item.value}>
                <div>
                  <strong>{item.value}</strong>
                  <small>
                    {item.recipients} destinatarios · apertura{" "}
                    {formatPercent(item.open_rate)}
                  </small>
                </div>
                <span>{formatPercent(item.click_rate)}</span>
              </article>
            ))}
            {!report.field_breakdown.groups.length && (
              <p className="muted signal-unavailable">
                Los grupos son demasiado pequeños para mostrarlos.
              </p>
            )}
            {report.field_breakdown.suppressed_recipients > 0 && (
              <p className="privacy-footnote">
                {report.field_breakdown.suppressed_recipients} destinatarios
                permanecen ocultos en grupos pequeños.
              </p>
            )}
          </section>
        ) : (
          <section className="panel report-ranked">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Campos de lista</p>
                <h3>Comparativa categórica</h3>
              </div>
            </div>
            <p className="muted signal-unavailable">
              Selecciona una lista y un campo categórico para comparar sus
              valores históricos.
            </p>
          </section>
        )}
      </div>
      <div className="report-two-columns">
        <SignalPanel
          title="Cliente de correo"
          dimension={report.client_signals.clients}
        />
        <SignalPanel
          title="Dispositivo"
          dimension={report.client_signals.devices}
        />
      </div>
      <p className="privacy-footnote client-note">
        {report.client_signals.note}
      </p>
    </>
  );
}

function AdvancedCampaignsReportPanel({
  report,
  select,
}: {
  report: CampaignsReport;
  select: (campaign: ReportCampaign) => void;
}) {
  return (
    <>
      <CampaignsReportPanel report={report} select={select} />
      <PeriodComparison
        items={[
          {
            label: "Entregados",
            current: number.format(report.summary.delivered),
            previous: number.format(report.comparison.previous.delivered),
            change: report.comparison.changes.delivered,
          },
          {
            label: "Apertura única",
            current: formatPercent(report.summary.open_rate),
            previous: formatPercent(report.comparison.previous.open_rate),
            change: report.comparison.changes.open_rate,
            rate: true,
          },
          {
            label: "Clic único",
            current: formatPercent(report.summary.click_rate),
            previous: formatPercent(report.comparison.previous.click_rate),
            change: report.comparison.changes.click_rate,
            rate: true,
          },
          {
            label: "Tasa de bajas",
            current: formatPercent(
              report.summary.delivered
                ? report.summary.unsubscribed / report.summary.delivered
                : 0,
            ),
            previous: formatPercent(
              report.comparison.previous.delivered
                ? report.comparison.previous.unsubscribed /
                    report.comparison.previous.delivered
                : 0,
            ),
            change: report.comparison.changes.unsubscribe_rate,
            rate: true,
            inverse: true,
          },
        ]}
      />
      <CampaignComparisonBreakdowns report={report} />
    </>
  );
}

function AdvancedTransactionalReportPanel({
  report,
}: {
  report: TransactionalReport;
}) {
  return (
    <>
      <TransactionalReportPanel report={report} />
      <PeriodComparison
        items={[
          {
            label: "Solicitudes",
            current: number.format(report.summary.total),
            previous: number.format(report.comparison.previous.total),
            change: report.comparison.changes.total,
          },
          {
            label: "Entregados",
            current: number.format(report.summary.delivered),
            previous: number.format(report.comparison.previous.delivered),
            change: report.comparison.changes.delivered,
          },
          {
            label: "Tasa de entrega",
            current: formatPercent(report.summary.delivery_rate),
            previous: formatPercent(report.comparison.previous.delivery_rate),
            change: report.comparison.changes.delivery_rate,
            rate: true,
          },
          {
            label: "Tasa de fallo",
            current: formatPercent(report.summary.failure_rate),
            previous: formatPercent(report.comparison.previous.failure_rate),
            change: report.comparison.changes.failure_rate,
            rate: true,
            inverse: true,
          },
        ]}
      />
    </>
  );
}

function AdvancedAudienceReportPanel({ report }: { report: AudienceReport }) {
  return (
    <>
      <AudienceReportPanel report={report} />
      <PeriodComparison
        items={[
          {
            label: "Altas",
            current: number.format(report.summary.additions),
            previous: number.format(report.comparison.previous.additions),
            change: report.comparison.changes.additions,
          },
          {
            label: "Bajas",
            current: number.format(report.summary.removals),
            previous: number.format(report.comparison.previous.removals),
            change: report.comparison.changes.removals,
            inverse: true,
          },
          {
            label: "Crecimiento neto",
            current: number.format(report.summary.net),
            previous: number.format(report.comparison.previous.net),
            change: report.comparison.changes.net,
          },
        ]}
      />
    </>
  );
}

function CampaignReportModal({
  campaign,
  close,
}: {
  campaign: Campaign;
  close: () => void;
}) {
  const [report, setReport] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"overview" | "links" | "recipients">(
    "overview",
  );
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // Recipient filters replace the server-owned page and expose a loading state.
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (status !== "all") params.set("status", status);
    if (query.trim()) params.set("query", query.trim());
    api<CampaignAnalytics>(`/api/v1/campaigns/${campaign.id}/report?${params}`)
      .then((value) => {
        if (active) {
          setReport(value);
          setError("");
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "No se pudo cargar el informe",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaign.id, status, query, page, revision]);
  if (loading && !report)
    return (
      <Modal
        title="Informe de campaña"
        eyebrow={campaign.name}
        close={close}
        wide
      >
        <LoadingState />
      </Modal>
    );
  if (error && !report)
    return (
      <Modal
        title="Informe de campaña"
        eyebrow={campaign.name}
        close={close}
        wide
      >
        <ErrorState
          message={error}
          retry={() => setRevision((value) => value + 1)}
        />
      </Modal>
    );
  if (!report) return null;
  const s = report.summary;
  return (
    <Modal
      title={report.campaign.name}
      eyebrow="Informe de campaña"
      close={close}
      wide
    >
      <div className="campaign-report">
        <div className="campaign-report-head">
          <div>
            <span className={`status-badge ${report.campaign.status}`}>
              {statusLabel[report.campaign.status] ?? report.campaign.status}
            </span>
            <small>
              {report.campaign.list_name ?? "Sin lista"} ·{" "}
              {report.campaign.started_at
                ? new Date(report.campaign.started_at).toLocaleString("es-ES")
                : "No iniciada"}
            </small>
          </div>
          <div className="report-export-actions">
            <a
              className="button button-secondary button-small"
              href={`/api/v1/campaigns/${campaign.id}/report/export?kind=recipients`}
            >
              <Upload size={13} />
              Destinatarios
            </a>
            <a
              className="button button-secondary button-small"
              href={`/api/v1/campaigns/${campaign.id}/report/export?kind=events`}
            >
              <Upload size={13} />
              Eventos
            </a>
            <a
              className="button button-secondary button-small"
              href={`/api/v1/campaigns/${campaign.id}/report/export?kind=links`}
            >
              <Upload size={13} />
              Enlaces
            </a>
          </div>
        </div>
        <div className="content-tabs report-detail-tabs">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            Resumen
          </button>
          <button
            className={tab === "links" ? "active" : ""}
            onClick={() => setTab("links")}
          >
            Contenido y enlaces
          </button>
          <button
            className={tab === "recipients" ? "active" : ""}
            onClick={() => setTab("recipients")}
          >
            Destinatarios · {number.format(report.pagination.total)}
          </button>
        </div>
        {tab === "overview" && (
          <>
            <section className="campaign-kpis">
              <MiniReportMetric label="Enviados" value={s.sent} />
              <MiniReportMetric
                label="Entregados"
                value={s.delivered}
                detail={formatPercent(s.delivery_rate)}
              />
              <MiniReportMetric
                label="Aperturas únicas"
                value={s.unique_opens}
                detail={formatPercent(s.open_rate)}
              />
              <MiniReportMetric
                label="Clics únicos"
                value={s.unique_clicks}
                detail={formatPercent(s.click_rate)}
              />
              <MiniReportMetric
                label="Clic / apertura"
                value={s.unique_clicks}
                detail={formatPercent(s.click_to_open_rate)}
              />
              <MiniReportMetric
                label="Bajas"
                value={s.unsubscribed}
                detail={formatPercent(s.unsubscribe_rate)}
              />
            </section>
            <section className="panel report-funnel-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Embudo</p>
                  <h3>De la cola a la interacción</h3>
                </div>
                <span className="muted">
                  Entrega media {formatDuration(s.avg_delivery_ms)}
                </span>
              </div>
              <div className="funnel-bars">
                <FunnelBar
                  label="Enviados"
                  value={s.sent}
                  max={s.total}
                  color="#315c5b"
                />
                <FunnelBar
                  label="Entregados"
                  value={s.delivered}
                  max={s.total}
                  color="#608b83"
                />
                <FunnelBar
                  label="Aperturas únicas"
                  value={s.unique_opens}
                  max={s.total}
                  color="#d38464"
                />
                <FunnelBar
                  label="Clics únicos"
                  value={s.unique_clicks}
                  max={s.total}
                  color="#d0a04a"
                />
              </div>
              <div className="incident-row">
                <span>
                  Retrasados <b>{s.delayed}</b>
                </span>
                <span>
                  Rechazados <b>{s.rejected}</b>
                </span>
                <span>
                  Fallidos <b>{s.failed}</b>
                </span>
                <span>
                  Rebotes <b>{s.bounced}</b>
                </span>
                <span>
                  Quejas <b>{s.complained}</b>
                </span>
              </div>
            </section>
            <TrendChart
              rows={report.timeline.map((row) => ({
                date: row.bucket,
                primary: row.delivered,
                secondary: row.unique_clicks,
              }))}
              primary="Entregas"
              secondary="Clics únicos"
              compact
            />
            <div className="report-two-columns">
              <section className="panel report-ranked">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Estado</p>
                    <h3>Destinatarios</h3>
                  </div>
                </div>
                {report.statuses.map((item) => (
                  <article key={item.status}>
                    <div>
                      <strong>{statusLabel[item.status] ?? item.status}</strong>
                    </div>
                    <span>{item.count}</span>
                  </article>
                ))}
              </section>
              <section className="panel report-ranked">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Audiencia</p>
                    <h3>Origen de suscripción</h3>
                  </div>
                </div>
                {report.audience_sources.map((item) => (
                  <article key={item.source}>
                    <div>
                      <strong>{item.source}</strong>
                    </div>
                    <span>{item.count}</span>
                  </article>
                ))}
              </section>
            </div>
            {report.failures.length > 0 && (
              <section className="panel report-ranked">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Diagnóstico</p>
                    <h3>Motivos de fallo</h3>
                  </div>
                </div>
                {report.failures.map((item) => (
                  <article key={item.reason}>
                    <div>
                      <strong>{item.reason}</strong>
                    </div>
                    <span>{item.count}</span>
                  </article>
                ))}
              </section>
            )}
            {report.experiment && (
              <section className="panel report-experiment">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Prueba A/B</p>
                    <h3>Resultados por variante</h3>
                  </div>
                </div>
                <div className="variant-results">
                  {report.experiment.variants.map((item) => (
                    <article
                      key={item.id}
                      className={
                        report.experiment?.winner_variant_id === item.id
                          ? "winner"
                          : ""
                      }
                    >
                      <header>
                        <h3>{item.name}</h3>
                        {report.experiment?.winner_variant_id === item.id && (
                          <span className="winner-pill">
                            <Check size={13} />
                            Ganadora
                          </span>
                        )}
                      </header>
                      <div className="variant-metrics">
                        <span>
                          <small>Total</small>
                          <b>{item.total_recipients ?? 0}</b>
                        </span>
                        <span>
                          <small>Entregados</small>
                          <b>{item.total_delivered ?? 0}</b>
                        </span>
                        <span>
                          <small>Abiertos</small>
                          <b>{item.total_opened ?? 0}</b>
                        </span>
                        <span>
                          <small>Clics</small>
                          <b>{item.total_clicked ?? 0}</b>
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <div className="info-callout">
              <CircleAlert size={17} />
              <p>
                {report.privacy.open_note} Detectados: {s.automated_opens}{" "}
                aperturas y {s.automated_clicks} clics automatizados. No se
                muestran dispositivo o cliente porque no hay una señal
                suficientemente fiable.
              </p>
            </div>
          </>
        )}
        {tab === "links" && (
          <div className="click-map-layout">
            <section>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Mapa de contenido</p>
                  <h3>HTML exacto enviado</h3>
                </div>
              </div>
              {report.content_preview_url ? (
                <iframe
                  className="message-preview campaign-content-map"
                  sandbox="allow-same-origin"
                  title="Contenido exacto de la campaña"
                  src={report.content_preview_url}
                />
              ) : (
                <p className="muted">
                  El contenido histórico no está disponible.
                </p>
              )}
            </section>
            <section className="panel report-ranked link-ranking">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Ranking</p>
                  <h3>Enlaces</h3>
                </div>
              </div>
              {report.links.map((item, index) => (
                <article key={item.url}>
                  <b>{index + 1}</b>
                  <div>
                    <strong>{item.url}</strong>
                    <small>
                      {item.category === "content"
                        ? "Contenido"
                        : item.category === "preferences"
                          ? "Preferencias"
                          : "Baja"}{" "}
                      · {item.total_clicks} clics totales
                      {item.automated_clicks
                        ? ` · ${item.automated_clicks} automáticos`
                        : ""}
                    </small>
                  </div>
                  <span>{item.unique_clicks}</span>
                </article>
              ))}
              {!report.links.length && (
                <p className="muted">No hay enlaces rastreados.</p>
              )}
            </section>
          </div>
        )}
        {tab === "recipients" && (
          <>
            <div className="table-tools report-recipient-tools">
              <label className="search-field">
                <Search size={16} />
                <input
                  placeholder="Buscar email…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <select
                aria-label="Filtrar destinatarios por estado"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Todos los estados</option>
                {report.statuses.map((item) => (
                  <option key={item.status} value={item.status}>
                    {statusLabel[item.status] ?? item.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Destinatario</th>
                    <th>Estado</th>
                    <th>Entrega</th>
                    <th>Aperturas</th>
                    <th>Clics</th>
                    <th>Variante / error</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recipients.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.email}</strong>
                        <small>
                          {item.ses_message_id ?? "Sin ID de proveedor"}
                        </small>
                      </td>
                      <td>
                        <span className={`status-badge ${item.status}`}>
                          {statusLabel[item.status] ?? item.status}
                        </span>
                      </td>
                      <td>
                        {item.delivered_at
                          ? new Date(item.delivered_at).toLocaleString("es-ES")
                          : "—"}
                      </td>
                      <td>{item.open_count}</td>
                      <td>{item.click_count}</td>
                      <td>{item.failure_reason ?? item.variant_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <span>
                Página {report.pagination.page} de {report.pagination.pages} ·{" "}
                {number.format(report.pagination.total)} resultados
              </span>
              <div>
                <button
                  className="button button-secondary button-small"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <button
                  className="button button-secondary button-small"
                  disabled={page >= report.pagination.pages || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <footer className="modal-actions">
        <button className="button button-secondary" onClick={close}>
          Cerrar
        </button>
      </footer>
    </Modal>
  );
}

function TrendChart({
  rows,
  primary,
  secondary,
  compact = false,
}: {
  rows: { date: string; primary: number; secondary: number }[];
  primary: string;
  secondary: string;
  compact?: boolean;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [Number(row.primary), Number(row.secondary)]),
  );
  return (
    <section className={`panel report-chart ${compact ? "compact" : ""}`}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">Evolución</p>
          <h3>Actividad en el tiempo</h3>
        </div>
        <div className="chart-legend">
          <span>
            <i className="primary" />
            {primary}
          </span>
          <span>
            <i className="secondary" />
            {secondary}
          </span>
        </div>
      </div>
      {rows.length ? (
        <div className="chart-bars">
          {rows.map((row, index) => (
            <div
              key={`${row.date}-${index}`}
              title={`${new Date(row.date).toLocaleString("es-ES")}: ${primary} ${row.primary}, ${secondary} ${row.secondary}`}
            >
              <i
                className="primary"
                style={{
                  height: `${Math.max(2, (Number(row.primary) / max) * 100)}%`,
                }}
              />
              <i
                className="secondary"
                style={{
                  height: `${Math.max(2, (Number(row.secondary) / max) * 100)}%`,
                }}
              />
              <small>
                {index === 0 || index === rows.length - 1
                  ? date.format(new Date(row.date))
                  : ""}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No hay actividad en este periodo.</p>
      )}
    </section>
  );
}
function MiniReportMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <article>
      <small>{label}</small>
      <strong>{number.format(value)}</strong>
      {detail && <span>{detail}</span>}
    </article>
  );
}
function Rate({ value, total }: { value: number; total: number }) {
  return (
    <span className="rate">
      <strong>{total ? ((value / total) * 100).toFixed(1) : "0.0"}%</strong>
      <small>{number.format(value)} únicos</small>
    </span>
  );
}
function formatPercent(value: number | undefined) {
  return `${((value ?? 0) * 100).toFixed(1)}%`;
}
function formatDuration(value: number | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value))
    return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}
function DeliverabilityView({
  data,
  notify,
}: {
  data: AppData;
  notify: (message: string) => void;
}) {
  const [dashboard, setDashboard] = useState<DeliverabilityDashboard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [testEmail, setTestEmail] = useState(data.settings.default_reply_to);
  const isAdmin = data.currentUser.role === "admin";
  async function load(live = false) {
    setLoading(true);
    try {
      setDashboard(
        await api<DeliverabilityDashboard>(
          `/api/v1/deliverability${live ? "?refresh=true" : ""}`,
        ),
      );
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la entregabilidad",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api<DeliverabilityDashboard>("/api/v1/deliverability")
      .then((value) => {
        if (active) {
          setDashboard(value);
          setError("");
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la entregabilidad",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(body: Record<string, unknown>, message: string) {
    setWorking(String(body.action));
    try {
      const result = await api<{
        data: Record<string, unknown>;
        dashboard: DeliverabilityDashboard;
      }>("/api/v1/deliverability/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setDashboard(result.dashboard);
      notify(
        message +
          (result.data.pending_imports !== undefined
            ? ` · ${result.data.pending_imports} por importar, ${result.data.pending_exports} por exportar`
            : ""),
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "No se pudo ejecutar la acción",
      );
    } finally {
      setWorking("");
    }
  }
  if (loading && !dashboard) return <LoadingState />;
  if (error && !dashboard)
    return <ErrorState message={error} retry={() => load(false)} />;
  if (!dashboard) return null;
  const health = dashboard.health;
  const metric = dashboard.reputation.thirty_days.all;
  const quota = health?.account?.quota;
  const openAlerts = dashboard.alerts.filter((item) => item.status === "open");
  return (
    <>
      <PageIntro
        eyebrow="Operaciones"
        title="Entregabilidad"
        text="Estado de Amazon SES, reputación, autenticación, eventos y supresiones en una sola vista."
        actions={
          isAdmin ? (
            <button
              className="button button-secondary"
              disabled={loading}
              onClick={() => load(true)}
            >
              <RefreshCw className={loading ? "spin" : ""} size={15} />
              Comprobar ahora
            </button>
          ) : (
            <button
              className="button button-secondary"
              onClick={() => load(false)}
            >
              <RefreshCw size={15} />
              Actualizar vista
            </button>
          )
        }
      />
      <section
        className={`deliverability-hero ${dashboard.mode.local ? "local" : (health?.status ?? "warning")}`}
      >
        <div>
          <p className="eyebrow light">
            {dashboard.mode.local ? "Entorno de desarrollo" : "Amazon SES"}
          </p>
          <h2>
            {dashboard.mode.local
              ? "Mailpit local"
              : health?.status === "healthy"
                ? "Listo para producción"
                : health?.status === "error"
                  ? "Requiere atención"
                  : "Configuración incompleta"}
          </h2>
          <span>
            {dashboard.mode.region} ·{" "}
            {dashboard.mode.tracking_source === "local"
              ? "tracking local"
              : "tracking de SES"}
            {health?.checked_at
              ? ` · comprobado ${new Date(health.checked_at).toLocaleString("es-ES")}`
              : ""}
          </span>
        </div>
        <div className="deliverability-mode">
          <span
            className={`status-badge ${dashboard.mode.sending_paused ? "failed" : "success"}`}
          >
            {dashboard.mode.sending_paused
              ? "Envíos pausados"
              : "Envíos activos"}
          </span>
          {dashboard.mode.environment_override && (
            <small>Transporte fijado por el entorno</small>
          )}
          {dashboard.mode.region_override && (
            <small>Región fijada por el entorno</small>
          )}
        </div>
      </section>
      {isAdmin && (
        <section className="panel deliverability-actions">
          <div>
            <strong>Control operativo</strong>
            <p>
              {dashboard.mode.local
                ? "La prueba llegará a Mailpit, no a Internet."
                : "La prueba usa la identidad y el Configuration Set transaccional."}
            </p>
          </div>
          <label>
            <input
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              aria-label="Destinatario de prueba"
            />
            <button
              className="button button-secondary"
              disabled={!testEmail || working === "send_test"}
              onClick={() =>
                action(
                  { action: "send_test", email: testEmail },
                  "Prueba técnica enviada",
                )
              }
            >
              <Send size={14} />
              Enviar prueba
            </button>
          </label>
          <button
            className={`button ${dashboard.mode.sending_paused ? "button-primary" : "button-danger"}`}
            disabled={working === "set_sending_paused"}
            onClick={() =>
              action(
                {
                  action: "set_sending_paused",
                  paused: !dashboard.mode.sending_paused,
                  reason: "Control manual desde entregabilidad",
                },
                dashboard.mode.sending_paused
                  ? "Envíos reanudados"
                  : "Envíos pausados",
              )
            }
          >
            {dashboard.mode.sending_paused ? (
              <>
                <RotateCcw size={14} />
                Reanudar envíos
              </>
            ) : (
              <>
                <CircleAlert size={14} />
                Pausa de emergencia
              </>
            )}
          </button>
        </section>
      )}
      <section className="report-metric-strip deliverability-metrics">
        <MiniReportMetric label="Enviados · 30 días" value={metric.sent} />
        <MiniReportMetric
          label="Entregados"
          value={metric.delivered}
          detail={
            metric.sent ? formatPercent(metric.delivered / metric.sent) : "0.0%"
          }
        />
        <MiniReportMetric
          label="Rebotes"
          value={metric.bounced}
          detail={formatPercent(metric.bounce_rate)}
        />
        <MiniReportMetric
          label="Quejas"
          value={metric.complained}
          detail={formatPercent(metric.complaint_rate)}
        />
        <MiniReportMetric
          label="Retrasos"
          value={metric.delayed}
          detail={formatPercent(metric.delay_rate)}
        />
        <MiniReportMetric
          label="Cuota disponible"
          value={Math.max(
            0,
            Number(quota?.max_24_hour_send ?? 0) -
              Number(quota?.sent_last_24_hours ?? 0),
          )}
          detail={
            quota?.max_send_rate
              ? `${quota.max_send_rate}/s`
              : dashboard.mode.local
                ? "solo local"
                : "—"
          }
        />
      </section>
      {openAlerts.length > 0 && (
        <section className="panel deliverability-alerts">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Atención</p>
              <h3>Alertas activas</h3>
            </div>
            <span className="status-badge failed">{openAlerts.length}</span>
          </div>
          {openAlerts.map((alert) => (
            <article key={alert.id} className={alert.severity}>
              <CircleAlert size={18} />
              <div>
                <strong>{alert.title}</strong>
                <small>
                  {alert.channel} · detectada{" "}
                  {new Date(alert.last_seen_at).toLocaleString("es-ES")}
                </small>
              </div>
              <span>{alert.severity === "critical" ? "Crítica" : "Aviso"}</span>
            </article>
          ))}
        </section>
      )}
      <div className="deliverability-grid">
        <section className="panel health-checks">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Producción</p>
              <h3>Checklist técnico</h3>
            </div>
            <span>
              {health?.checks?.filter((item) => item.status === "pass")
                .length ?? 0}
              /
              {health?.checks?.filter((item) => item.status !== "info")
                .length ?? 0}
            </span>
          </div>
          {health?.checks?.map((check) => (
            <article key={check.key}>
              <span className={`check-icon ${check.status}`}>
                {check.status === "pass" ? (
                  <Check size={14} />
                ) : check.status === "info" ? (
                  <BookOpen size={14} />
                ) : (
                  <CircleAlert size={14} />
                )}
              </span>
              <div>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </div>
            </article>
          ))}
        </section>
        <TrendChart
          rows={dashboard.reputation.trend.map((row) => ({
            date: row.date,
            primary: row.delivered,
            secondary: row.bounced + row.complained + row.delayed,
          }))}
          primary="Entregados"
          secondary="Incidencias"
          compact
        />
      </div>
      <div className="deliverability-grid">
        <section className="panel identity-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Autenticación</p>
              <h3>Identidades de envío</h3>
            </div>
          </div>
          {health?.identities?.length ? (
            <div className="identity-list">
              {health.identities.map((identity) => (
                <article key={identity.name}>
                  <div>
                    <strong>{identity.name}</strong>
                    <small>
                      {identity.type === "DOMAIN" ? "Dominio" : "Dirección"} ·
                      DKIM {identity.dkim_status ?? "no aplicable"}
                      {identity.mail_from_domain
                        ? ` · MAIL FROM ${identity.mail_from_status}`
                        : ""}
                    </small>
                  </div>
                  <span
                    className={`status-badge ${identity.verified_for_sending && identity.sending_enabled ? "success" : "failed"}`}
                  >
                    {identity.verified_for_sending && identity.sending_enabled
                      ? "Verificada"
                      : "Pendiente"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">
              {dashboard.mode.local
                ? "Mailpit no necesita identidades verificadas."
                : "No se han encontrado identidades en esta región."}
            </p>
          )}
        </section>
        <section className="panel identity-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Eventos</p>
              <h3>Configuration Sets</h3>
            </div>
          </div>
          {health?.configuration_sets?.length ? (
            <div className="identity-list">
              {health.configuration_sets.map((item) => (
                <article key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.destinations.length
                        ? item.destinations
                            .map(
                              (destination) =>
                                `${destination.name}: ${destination.event_types.join(", ")}`,
                            )
                            .join(" · ")
                        : "Sin destino de eventos habilitado"}
                    </small>
                  </div>
                  <span>
                    {
                      item.destinations.filter(
                        (destination) => destination.enabled,
                      ).length
                    }
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">
              {dashboard.mode.local
                ? "Se comprobarán al activar Amazon SES."
                : "No hay Configuration Sets configurados."}
            </p>
          )}
        </section>
      </div>
      <div className="deliverability-grid">
        <section className="panel suppression-health">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Protección</p>
              <h3>Supresiones</h3>
            </div>
            {dashboard.suppressions.last_sync && (
              <small>
                Última conciliación{" "}
                {new Date(
                  dashboard.suppressions.last_sync.started_at,
                ).toLocaleString("es-ES")}
              </small>
            )}
          </div>
          <div className="suppression-summary">
            {dashboard.suppressions.summary
              .filter((item) => item.status === "active")
              .map((item) => (
                <span key={`${item.scope}-${item.reason}`}>
                  <strong>{item.count}</strong>
                  <small>
                    {item.reason} · {item.scope}
                  </small>
                </span>
              ))}
          </div>
          {!dashboard.suppressions.summary.some(
            (item) => item.status === "active",
          ) && <p className="muted">No hay direcciones suprimidas activas.</p>}
          {isAdmin && (
            <div className="panel-actions">
              <button
                className="button button-secondary button-small"
                disabled={
                  dashboard.mode.local || working === "preview_suppressions"
                }
                onClick={() =>
                  action(
                    { action: "preview_suppressions" },
                    "Previsualización completada",
                  )
                }
              >
                Comparar con SES
              </button>
              <button
                className="button button-secondary button-small"
                disabled={
                  dashboard.mode.local || working === "sync_suppressions"
                }
                onClick={() =>
                  action(
                    {
                      action: "sync_suppressions",
                      mode: dashboard.suppressions.sync_mode,
                    },
                    "Supresiones conciliadas",
                  )
                }
              >
                Conciliar ahora
              </button>
            </div>
          )}
        </section>
        <section className="panel reputation-guidance">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Reputación</p>
              <h3>Referencias operativas</h3>
            </div>
          </div>
          <a
            href={dashboard.guidance.postmaster_url}
            target="_blank"
            rel="noreferrer"
          >
            <Gauge size={18} />
            <span>
              <strong>Google Postmaster Tools</strong>
              <small>Reputación, spam y errores por dominio</small>
            </span>
            <ArrowRight size={15} />
          </a>
          <a
            href={dashboard.guidance.dmarc_url}
            target="_blank"
            rel="noreferrer"
          >
            <MailCheck size={18} />
            <span>
              <strong>DMARC y alineación</strong>
              <small>Política, SPF, DKIM y dominio From</small>
            </span>
            <ArrowRight size={15} />
          </a>
          <div className="info-callout">
            <CircleAlert size={17} />
            <p>
              Virtual Deliverability Manager es compatible de forma opcional. No
              es necesario para operar KiroMail.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
function OperationsView({ notify }: { notify: (message: string) => void }) {
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
      setDashboard(await api("/api/v1/operations"));
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cargar el diagnóstico",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api<OperationsDashboard>("/api/v1/operations")
      .then((result) => {
        if (active) {
          setDashboard(result);
          setError("");
        }
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "No se pudo cargar el diagnóstico",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(payload: Record<string, string>, message: string) {
    setWorking(String(payload.action));
    try {
      await api("/api/v1/operations/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      notify(message);
    } catch (caught) {
      notify(
        caught instanceof Error
          ? caught.message
          : "No se pudo completar la acción",
      );
    } finally {
      setWorking("");
    }
  }
  const bytes = (value: number) =>
    value >= 1_073_741_824
      ? `${(value / 1_073_741_824).toFixed(2)} GB`
      : value >= 1_048_576
        ? `${(value / 1_048_576).toFixed(1)} MB`
        : `${number.format(value)} B`;
  if (loading && !dashboard) return <LoadingState />;
  if (error && !dashboard) return <ErrorState message={error} retry={load} />;
  if (!dashboard) return null;
  const open = dashboard.dead_letters.filter((item) => item.status === "open");
  const healthyWorkers = dashboard.workers.filter((item) => item.healthy);
  return (
    <>
      <PageIntro
        eyebrow="Producción"
        title="Operaciones"
        text="Disponibilidad, colas, almacenamiento, mantenimiento y recuperación desde un único diagnóstico."
        actions={
          <>
            <a
              className="button button-secondary"
              href="/api/metrics"
              target="_blank"
            >
              <Activity size={16} /> Métricas
            </a>
            <button className="button button-secondary" onClick={load}>
              <RefreshCw size={16} /> Actualizar
            </button>
          </>
        }
      />
      <section
        className={`panel operations-hero ${dashboard.configuration.ready ? "healthy" : "warning"}`}
      >
        <div>
          <span className="metric-icon forest">
            <Monitor size={19} />
          </span>
          <div>
            <p className="eyebrow">Estado operativo</p>
            <h3>
              {dashboard.configuration.ready
                ? "La instalación está preparada"
                : "Hay controles de producción pendientes"}
            </h3>
            <p>
              {dashboard.configuration.production
                ? "Modo HTTPS de producción"
                : "Modo local; los secretos de producción no son obligatorios"}
            </p>
          </div>
        </div>
        <div className="operations-hero-stats">
          <span>
            <strong>{healthyWorkers.length}</strong>
            <small>workers activos</small>
          </span>
          <span>
            <strong>{open.length}</strong>
            <small>incidencias DLQ</small>
          </span>
          <span>
            <strong>{bytes(Number(dashboard.database?.bytes ?? 0))}</strong>
            <small>PostgreSQL</small>
          </span>
        </div>
      </section>
      <div className="operations-grid">
        <section className="panel operations-checks">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Perímetro</p>
              <h3>Configuración segura</h3>
            </div>
          </div>
          {dashboard.configuration.checks.map((check) => (
            <article key={check.key}>
              <span
                className={`check-icon ${check.ok ? "pass" : check.required ? "fail" : "info"}`}
              >
                {check.ok ? <Check size={14} /> : <CircleAlert size={14} />}
              </span>
              <div>
                <strong>{check.key.replaceAll("_", " ")}</strong>
                <small>{check.detail}</small>
              </div>
            </article>
          ))}
        </section>
        <section className="panel queue-health">
          <div className="panel-head">
            <div>
              <p className="eyebrow">BullMQ</p>
              <h3>Colas</h3>
            </div>
          </div>
          {Object.entries(dashboard.queues).map(([queue, counts]) => (
            <article key={queue}>
              <strong>{queue}</strong>
              <div>
                {["wait", "active", "delayed", "failed"].map((state) => (
                  <span key={state}>
                    <b>{counts[state] ?? 0}</b>
                    <small>{state}</small>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
      <div className="operations-grid">
        <section className="panel worker-health">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Procesos</p>
              <h3>Workers</h3>
            </div>
          </div>
          {dashboard.workers.length ? (
            dashboard.workers.map((worker) => (
              <article key={`${worker.service}-${worker.instance_id}`}>
                <span className={`live-dot ${worker.healthy ? "" : "stale"}`} />
                <div>
                  <strong>{worker.instance_id}</strong>
                  <small>
                    latido{" "}
                    {new Date(worker.heartbeat_at).toLocaleString("es-ES")} ·
                    iniciado{" "}
                    {new Date(worker.started_at).toLocaleString("es-ES")}
                  </small>
                </div>
                <span
                  className={`status-badge ${worker.healthy ? "success" : "failed"}`}
                >
                  {worker.healthy ? "Operativo" : "Sin latido"}
                </span>
              </article>
            ))
          ) : (
            <p className="muted">Todavía no se ha registrado ningún worker.</p>
          )}
        </section>
        <section className="panel storage-health">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Persistencia</p>
              <h3>Contenido exacto</h3>
            </div>
          </div>
          {dashboard.storage.map((item) => (
            <article key={item.storage_backend}>
              <span>
                <strong>{item.storage_backend}</strong>
                <small>
                  {number.format(item.objects)} objetos · {item.expired}{" "}
                  caducados
                </small>
              </span>
              <b>{bytes(Number(item.bytes))}</b>
            </article>
          ))}
          {!dashboard.storage.length && (
            <p className="muted">Aún no hay blobs almacenados.</p>
          )}
          <div className="panel-actions">
            <button
              className="button button-secondary button-small"
              disabled={Boolean(working)}
              onClick={() =>
                action({ action: "reconcile_blobs" }, "Integridad comprobada")
              }
            >
              Verificar integridad
            </button>
            <button
              className="button button-secondary button-small"
              disabled={Boolean(working)}
              onClick={() =>
                action({ action: "run_retention" }, "Mantenimiento ejecutado")
              }
            >
              Aplicar retención
            </button>
          </div>
        </section>
      </div>
      <section className="panel dead-letter-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Recuperación</p>
            <h3>Dead letter queue</h3>
            <p className="panel-explainer">
              Solo contiene trabajos agotados; reintentar exige una acción
              administrativa explícita.
            </p>
          </div>
          <span
            className={`status-badge ${open.length ? "failed" : "success"}`}
          >
            {open.length} abiertas
          </span>
        </div>
        {open.length ? (
          <div className="dead-letter-list">
            {open.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>
                    {item.queue_name} · {item.entity_type}
                  </strong>
                  <small>
                    {item.entity_id} · {item.attempts} intentos ·{" "}
                    {new Date(item.failed_at).toLocaleString("es-ES")}
                  </small>
                  <p>{item.error}</p>
                </div>
                <div>
                  <button
                    className="button button-secondary button-small"
                    disabled={Boolean(working)}
                    onClick={() =>
                      action(
                        { action: "resolve_dead_letter", id: item.id },
                        "Incidencia resuelta",
                      )
                    }
                  >
                    Resolver
                  </button>
                  <button
                    className="button button-primary button-small"
                    disabled={Boolean(working)}
                    onClick={() =>
                      action(
                        { action: "retry_dead_letter", id: item.id },
                        "Trabajo reencolado",
                      )
                    }
                  >
                    Reintentar
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="operations-empty">
            <CircleCheck size={20} />
            <p>No hay trabajos agotados pendientes de decisión.</p>
          </div>
        )}
      </section>
      <section className="panel operations-runs">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Histórico</p>
            <h3>Mantenimiento</h3>
          </div>
        </div>
        {dashboard.runs.length ? (
          <div>
            {dashboard.runs.map((run) => (
              <article key={run.id}>
                <span
                  className={`status-badge ${run.status === "completed" ? "success" : run.status === "failed" ? "failed" : "processing"}`}
                >
                  {run.status}
                </span>
                <div>
                  <strong>{run.type.replaceAll("_", " ")}</strong>
                  <small>
                    {new Date(run.started_at).toLocaleString("es-ES")}
                    {run.error ? ` · ${run.error}` : ""}
                  </small>
                </div>
                <code>{JSON.stringify(run.detail)}</code>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No hay ejecuciones registradas.</p>
        )}
      </section>
    </>
  );
}
function SettingsView({ data, refresh, notify }: ViewProps) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const handlingInvalid = useRef(false);
  const [activeTab, setActiveTab] = useState<
    | "general"
    | "appearance"
    | "sending"
    | "tracking"
    | "storage"
    | "api"
    | "security"
    | "sessions"
  >("general");
  const [mailTransport, setMailTransport] = useState(
    data.settings.mail_transport,
  );
  const [contentStorage, setContentStorage] = useState(
    data.settings.content_storage,
  );
  const [uiTheme, setUiTheme] = useState<UiThemeId>(
    normalizeUiTheme(data.settings.ui_theme),
  );
  useEffect(() => {
    return () => {
      document.documentElement.dataset.theme = normalizeUiTheme(
        data.settings.ui_theme,
      );
    };
  }, [data.settings.ui_theme]);
  const settingsTabs = [
    { id: "general", label: "General", icon: Settings },
    { id: "appearance", label: "Apariencia", icon: Palette },
    { id: "sending", label: "Envío y SES", icon: Send },
    { id: "tracking", label: "Seguimiento", icon: Activity },
    { id: "storage", label: "Almacenamiento", icon: Layers3 },
    { id: "api", label: "API e integraciones", icon: BookOpen },
    { id: "security", label: "Usuarios y seguridad", icon: ShieldCheck },
    { id: "sessions", label: "Sesiones", icon: Monitor },
  ] as const;
  const configurableTabs = new Set([
    "general",
    "appearance",
    "sending",
    "tracking",
    "storage",
  ]);
  const readinessChecks = [
    {
      label: "Remitente con dominio real",
      ok: !data.settings.default_from_email.endsWith(".local"),
    },
    {
      label: "Dirección postal configurada",
      ok:
        data.settings.physical_address.trim().length > 8 &&
        !data.settings.physical_address.toLowerCase().includes("configura aquí"),
    },
    {
      label: "Amazon SES seleccionado",
      ok: data.settings.mail_transport === "ses",
    },
    {
      label: "Configuration Sets separados",
      ok: Boolean(
        data.settings.ses_marketing_configuration_set &&
          data.settings.ses_transactional_configuration_set,
      ),
    },
    { label: "Verificación en dos pasos", ok: data.currentUser.mfa_enabled },
  ];
  function showInvalidField(event: React.InvalidEvent<HTMLFormElement>) {
    event.preventDefault();
    if (handlingInvalid.current) return;
    handlingInvalid.current = true;
    const control = event.target as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
    const panel = control.closest<HTMLElement>(".settings-tab-panel");
    const tabId = panel?.id.replace("settings-panel-", "") as
      | (typeof settingsTabs)[number]["id"]
      | undefined;
    const label =
      control.getAttribute("aria-label") ||
      control.closest("label")?.firstChild?.textContent?.trim() ||
      control.name;
    if (tabId && configurableTabs.has(tabId)) setActiveTab(tabId);
    setValidationError(
      label
        ? `Revisa «${label}» antes de guardar.`
        : formValidationMessage,
    );
    window.setTimeout(() => {
      control.focus();
      handlingInvalid.current = false;
    }, 0);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setValidationError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      organization_name: form.get("organization_name"),
      ui_theme: form.get("ui_theme"),
      default_from_name: form.get("default_from_name"),
      default_from_email: form.get("default_from_email"),
      default_reply_to: form.get("default_reply_to"),
      aws_region: form.get("aws_region"),
      ses_configuration_set: form.get("ses_configuration_set"),
      ses_marketing_configuration_set: form.get(
        "ses_marketing_configuration_set",
      ),
      ses_transactional_configuration_set: form.get(
        "ses_transactional_configuration_set",
      ),
      mail_transport: form.get("mail_transport"),
      sending_rate: Number(form.get("sending_rate")),
      campaign_sending_rate: Number(form.get("campaign_sending_rate")),
      transactional_reserved_rate: Number(
        form.get("transactional_reserved_rate"),
      ),
      physical_address: form.get("physical_address"),
      track_opens: form.get("track_opens") === "on",
      track_clicks: form.get("track_clicks") === "on",
      transactional_track_opens: form.get("transactional_track_opens") === "on",
      transactional_track_clicks:
        form.get("transactional_track_clicks") === "on",
      timezone: form.get("timezone"),
      content_retention_days: Number(form.get("content_retention_days")),
      content_storage: form.get("content_storage"),
      event_retention_days: Number(form.get("event_retention_days")),
      audit_retention_days: Number(form.get("audit_retention_days")),
      import_retention_days: Number(form.get("import_retention_days")),
      personal_data_retention_days: Number(
        form.get("personal_data_retention_days"),
      ),
      ses_tracking_source: form.get("ses_tracking_source"),
      ses_suppression_sync_enabled:
        form.get("ses_suppression_sync_enabled") === "on",
      ses_suppression_sync_mode: form.get("ses_suppression_sync_mode"),
      bounce_alert_threshold: Number(form.get("bounce_alert_threshold")) / 100,
      complaint_alert_threshold:
        Number(form.get("complaint_alert_threshold")) / 100,
      delay_alert_threshold: Number(form.get("delay_alert_threshold")) / 100,
      allowed_sender_domains: String(form.get("allowed_sender_domains") ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
      global_sending_paused: form.get("global_sending_paused") === "on",
    };
    try {
      await api("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refresh();
      setDirty(false);
      notify("Ajustes guardados");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }
  if (data.currentUser.role !== "admin")
    return (
      <>
        <PageIntro
          eyebrow="Cuenta"
          title="Seguridad de tu cuenta"
          text="Protege el acceso y revoca los dispositivos que no reconozcas."
        />
        <MfaPanel currentUser={data.currentUser} notify={notify} />
        <SessionsPanel notify={notify} />
      </>
    );
  return (
    <>
      <PageIntro
        eyebrow="Configuración"
        title="Ajustes"
        text="Configura cada área sin perderte en un único formulario interminable."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Secciones de ajustes">
          {settingsTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`settings-panel-${tab.id}`}
                className={active ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>
                  <Icon size={16} /> {tab.label}
                </span>
                {active && <ArrowRight size={14} />}
              </button>
            );
          })}
        </nav>
        <div className="settings-content">
          <form
            className="settings-form"
            onSubmit={submit}
            onChange={() => {
              setDirty(true);
              setValidationError("");
            }}
            onInvalid={showInvalidField}
          >
            <div
              id="settings-panel-general"
              role="tabpanel"
              hidden={activeTab !== "general"}
              className="settings-tab-panel"
            >
              <section className="panel settings-section">
                <div className="settings-section-head">
                  <span className="metric-icon forest">
                    <Layers3 size={18} />
                  </span>
                  <div>
                    <h3>Identidad del espacio</h3>
                    <p>Datos visibles en la aplicación y en tus mensajes.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Organización
                    <input name="organization_name" defaultValue={data.settings.organization_name} required />
                  </label>
                  <label>
                    Nombre del remitente
                    <input name="default_from_name" defaultValue={data.settings.default_from_name} required />
                  </label>
                  <label>
                    Correo del remitente
                    <input type="email" name="default_from_email" defaultValue={data.settings.default_from_email} required />
                  </label>
                  <label>
                    Responder a
                    <input type="email" name="default_reply_to" defaultValue={data.settings.default_reply_to} required />
                  </label>
                  <label className="full">
                    Dirección física
                    <textarea name="physical_address" defaultValue={data.settings.physical_address} required />
                  </label>
                </div>
              </section>
              <section className="panel settings-section production-readiness">
                <div className="settings-section-head">
                  <span className="metric-icon clay"><ShieldCheck size={18} /></span>
                  <div>
                    <h3>Preparación para producción</h3>
                    <p>Comprobaciones guardadas que todavía requieren atención.</p>
                  </div>
                  <span className="status-badge draft">
                    {readinessChecks.filter((item) => item.ok).length}/{readinessChecks.length}
                  </span>
                </div>
                <div className="readiness-list">
                  {readinessChecks.map((item) => (
                    <span key={item.label} className={item.ok ? "ready" : "pending"}>
                      {item.ok ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
                      {item.label}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            <div
              id="settings-panel-appearance"
              role="tabpanel"
              hidden={activeTab !== "appearance"}
              className="settings-tab-panel"
            >
              <section className="panel settings-section appearance-settings">
                <div className="settings-section-head">
                  <span className="metric-icon violet">
                    <Palette size={18} />
                  </span>
                  <div>
                    <h3>Tema de la aplicación</h3>
                    <p>
                      Cambia la paleta y la personalidad tipográfica de todo el
                      espacio de trabajo.
                    </p>
                  </div>
                  <span className="status-badge success">
                    {uiThemes.length} temas
                  </span>
                </div>
                <input type="hidden" name="ui_theme" value={uiTheme} />
                <div
                  className="theme-grid"
                  role="radiogroup"
                  aria-label="Tema de la aplicación"
                >
                  {uiThemes.map((theme) => {
                    const selected = uiTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`theme-card theme-card-${theme.id} ${selected ? "selected" : ""}`}
                        style={
                          {
                            "--theme-primary": theme.colors[0],
                            "--theme-accent": theme.colors[1],
                            "--theme-canvas": theme.colors[2],
                            "--theme-surface": theme.colors[3],
                          } as React.CSSProperties
                        }
                        onClick={() => {
                          setUiTheme(theme.id);
                          document.documentElement.dataset.theme = theme.id;
                          setDirty(true);
                        }}
                      >
                        <span className="theme-card-topline">
                          <span>
                            <strong>{theme.name}</strong>
                            {theme.id === defaultUiTheme && (
                              <small>Predeterminado</small>
                            )}
                          </span>
                          <span
                            className={`theme-selected-mark ${selected ? "visible" : ""}`}
                            aria-hidden="true"
                          >
                            <Check size={13} />
                          </span>
                        </span>
                        <span className="theme-card-preview" aria-hidden="true">
                          <i />
                          <span>
                            <b />
                            <b />
                            <b />
                          </span>
                        </span>
                        <span className="theme-card-palette" aria-hidden="true">
                          {theme.colors.map((color) => (
                            <i key={color} style={{ backgroundColor: color }} />
                          ))}
                        </span>
                        <span className="theme-card-copy">
                          <span className="theme-font-sample">Aa</span>
                          <span>
                            <b>{theme.headingFont}</b>
                            <small>{theme.bodyFont}</small>
                          </span>
                        </span>
                        <span className="theme-card-description">
                          {theme.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="info-callout theme-info-callout">
                  <CircleAlert size={17} />
                  <p>
                    Este ajuste modifica la interfaz de KiroMail para todos los
                    usuarios. Las plantillas y los correos conservan su propio
                    diseño.
                  </p>
                </div>
              </section>
            </div>

            <div
              id="settings-panel-sending"
              role="tabpanel"
              hidden={activeTab !== "sending"}
              className="settings-tab-panel"
            >
              <section className="panel settings-section">
                <div className="settings-section-head">
                  <span className="metric-icon clay"><Send size={18} /></span>
                  <div>
                    <h3>Transporte de correo</h3>
                    <p>Selecciona el modo y limita el ritmo a la cuota efectiva.</p>
                  </div>
                  <span className={`status-badge ${mailTransport === "ses" ? "success" : "draft"}`}>
                    {mailTransport === "ses" ? "Amazon SES" : "Modo local"}
                  </span>
                </div>
                <div className="form-grid">
                  <label>
                    Transporte
                    <select
                      name="mail_transport"
                      value={mailTransport}
                      onChange={(event) => setMailTransport(event.target.value as "smtp" | "ses")}
                    >
                      <option value="smtp">SMTP local · Mailpit</option>
                      <option value="ses">Amazon SES</option>
                    </select>
                  </label>
                  <label>
                    Zona horaria
                    <input name="timezone" defaultValue={data.settings.timezone} />
                  </label>
                  <label>
                    Ritmo total por segundo
                    <input type="number" min="1" max="1000" name="sending_rate" defaultValue={data.settings.sending_rate} />
                  </label>
                  <label>
                    Ritmo de campañas
                    <input type="number" min="1" max="1000" name="campaign_sending_rate" defaultValue={data.settings.campaign_sending_rate} />
                  </label>
                  <label>
                    Reserva transaccional
                    <input type="number" min="1" max="1000" name="transactional_reserved_rate" defaultValue={data.settings.transactional_reserved_rate} />
                  </label>
                </div>
                {mailTransport === "smtp" && (
                  <div className="info-callout">
                    <CircleAlert size={17} />
                    <p>Mailpit es seguro para pruebas locales, pero no entrega correo real. Selecciona Amazon SES antes de producir.</p>
                  </div>
                )}
              </section>
              <section className="panel settings-section" hidden={mailTransport !== "ses"}>
                <div className="settings-section-head compact">
                  <span className="metric-icon forest"><MailCheck size={18} /></span>
                  <div>
                    <h3>Amazon SES</h3>
                    <p>Región y Configuration Sets independientes por reputación.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Región AWS
                    <input name="aws_region" defaultValue={data.settings.aws_region} />
                  </label>
                  <label>
                    Configuration Set heredado
                    <input name="ses_configuration_set" defaultValue={data.settings.ses_configuration_set} />
                  </label>
                  <label>
                    Configuration Set marketing
                    <input name="ses_marketing_configuration_set" defaultValue={data.settings.ses_marketing_configuration_set} />
                  </label>
                  <label>
                    Configuration Set transaccional
                    <input name="ses_transactional_configuration_set" defaultValue={data.settings.ses_transactional_configuration_set} />
                  </label>
                </div>
                <div className="info-callout">
                  <CircleAlert size={17} />
                  <p>Las credenciales y los Topic ARN de SNS se montan como secretos del servidor y no se guardan en esta pantalla.</p>
                </div>
              </section>
            </div>

            <div
              id="settings-panel-tracking"
              role="tabpanel"
              hidden={activeTab !== "tracking"}
              className="settings-tab-panel"
            >
              <section className="panel settings-section">
                <div className="settings-section-head">
                  <span className="metric-icon violet"><Activity size={18} /></span>
                  <div>
                    <h3>Seguimiento</h3>
                    <p>Controles separados para campañas y mensajes transaccionales.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Fuente de aperturas y clics
                    <select name="ses_tracking_source" defaultValue={data.settings.ses_tracking_source}>
                      <option value="local">KiroMail · URLs firmadas</option>
                      <option value="ses">Amazon SES · eventos del Configuration Set</option>
                    </select>
                  </label>
                </div>
                <label className="toggle-row">
                  <span><strong>Aperturas de campañas</strong><small>Añade un píxel invisible cuando la fuente es local.</small></span>
                  <input type="checkbox" name="track_opens" defaultChecked={data.settings.track_opens} />
                </label>
                <label className="toggle-row">
                  <span><strong>Clics de campañas</strong><small>Convierte enlaces de marketing en redirecciones medibles.</small></span>
                  <input type="checkbox" name="track_clicks" defaultChecked={data.settings.track_clicks} />
                </label>
                <label className="toggle-row">
                  <span><strong>Aperturas transaccionales</strong><small>Desactivado por defecto para mensajes sensibles.</small></span>
                  <input type="checkbox" name="transactional_track_opens" defaultChecked={data.settings.transactional_track_opens} />
                </label>
                <label className="toggle-row">
                  <span><strong>Clics transaccionales</strong><small>Puede sobrescribirse por plantilla o petición.</small></span>
                  <input type="checkbox" name="transactional_track_clicks" defaultChecked={data.settings.transactional_track_clicks} />
                </label>
              </section>
              <section className="panel settings-section">
                <div className="settings-section-head">
                  <span className="metric-icon clay"><Gauge size={18} /></span>
                  <div>
                    <h3>Entregabilidad y supresiones</h3>
                    <p>Dominios, umbrales y conciliación con la cuenta SES.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Dominios remitentes adicionales
                    <input name="allowed_sender_domains" defaultValue={(data.settings.allowed_sender_domains ?? []).join(", ")} placeholder="news.ejemplo.com, mail.ejemplo.com" />
                  </label>
                  <label>
                    Alerta de rebote (%)
                    <input type="number" min="0.0001" max="100" step="0.0001" name="bounce_alert_threshold" defaultValue={Number(data.settings.bounce_alert_threshold) * 100} />
                  </label>
                  <label>
                    Alerta de queja (%)
                    <input type="number" min="0.0001" max="100" step="0.0001" name="complaint_alert_threshold" defaultValue={Number(data.settings.complaint_alert_threshold) * 100} />
                  </label>
                  <label>
                    Alerta de retraso (%)
                    <input type="number" min="0.0001" max="100" step="0.0001" name="delay_alert_threshold" defaultValue={Number(data.settings.delay_alert_threshold) * 100} />
                  </label>
                  <label>
                    Modo de conciliación
                    <select name="ses_suppression_sync_mode" defaultValue={data.settings.ses_suppression_sync_mode}>
                      <option value="import">SES → lista local</option>
                      <option value="bidirectional">Bidireccional, sin borrados</option>
                    </select>
                  </label>
                </div>
                <label className="toggle-row">
                  <span><strong>Conciliar supresiones automáticamente</strong><small>Compara a diario con la lista de supresión de SES.</small></span>
                  <input type="checkbox" name="ses_suppression_sync_enabled" defaultChecked={data.settings.ses_suppression_sync_enabled} />
                </label>
                <label className="toggle-row emergency-toggle">
                  <span><strong>Pausa global de emergencia</strong><small>Impide aceptar o procesar envíos hasta que se desactive.</small></span>
                  <input type="checkbox" name="global_sending_paused" defaultChecked={data.settings.global_sending_paused} />
                </label>
              </section>
            </div>

            <div
              id="settings-panel-storage"
              role="tabpanel"
              hidden={activeTab !== "storage"}
              className="settings-tab-panel"
            >
              <section className="panel settings-section">
                <div className="settings-section-head">
                  <span className="metric-icon forest"><Layers3 size={18} /></span>
                  <div>
                    <h3>Contenido y retención</h3>
                    <p>Persistencia del mensaje exacto y plazos de conservación.</p>
                  </div>
                  <span className="status-badge draft">{contentStorage === "s3" ? "S3" : "Filesystem"}</span>
                </div>
                <div className="form-grid">
                  <label>
                    Backend de contenido
                    <select
                      name="content_storage"
                      value={contentStorage}
                      onChange={(event) => setContentStorage(event.target.value as "filesystem" | "s3")}
                    >
                      <option value="filesystem">Filesystem persistente</option>
                      <option value="s3">Amazon S3 / compatible</option>
                    </select>
                  </label>
                  <label>
                    Retención de contenido (días)
                    <input type="number" min="0" max="3650" name="content_retention_days" defaultValue={data.settings.content_retention_days} />
                  </label>
                  <label>
                    Retención de eventos (días)
                    <input type="number" min="30" max="3650" name="event_retention_days" defaultValue={data.settings.event_retention_days} />
                  </label>
                  <label>
                    Retención de auditoría (días)
                    <input type="number" min="90" max="3650" name="audit_retention_days" defaultValue={data.settings.audit_retention_days} />
                  </label>
                  <label>
                    Archivos de importación (días)
                    <input type="number" min="1" max="365" name="import_retention_days" defaultValue={data.settings.import_retention_days} />
                  </label>
                  <label>
                    IP y agente de usuario (días)
                    <input type="number" min="1" max="730" name="personal_data_retention_days" defaultValue={data.settings.personal_data_retention_days} />
                  </label>
                </div>
                <div className="info-callout">
                  <CircleAlert size={17} />
                  <p>
                    {contentStorage === "s3"
                      ? "El bucket, región y credenciales se inyectan como secretos. S3 debe estar configurado antes de guardar este modo."
                      : "El contenido se conserva en el volumen Docker content_data y debe incluirse en la copia externa del servidor."}
                  </p>
                </div>
              </section>
            </div>

            {configurableTabs.has(activeTab) && (
              <div className="settings-save" aria-live="polite">
                <span className={validationError ? "form-error" : undefined}>
                  {validationError ||
                    (dirty ? "Tienes cambios sin guardar" : "Todo guardado")}
                </span>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={saving || !dirty}
                >
                  <Check size={16} /> {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            )}
          </form>

          <div
            id="settings-panel-api"
            role="tabpanel"
            hidden={activeTab !== "api"}
            className="settings-tab-panel"
          >
            <section className="panel settings-section settings-api-panel">
              <div className="settings-section-head">
                <span className="metric-icon forest"><BookOpen size={18} /></span>
                <div>
                  <h3>API e integraciones</h3>
                  <p>Contrato OpenAPI 3.1, scopes y ejemplos ejecutables.</p>
                </div>
                <Link className="button button-secondary button-small" href="/api-docs">Abrir documentación</Link>
              </div>
              <div className="info-callout">
                <CircleAlert size={17} />
                <p>El esquema JSON está disponible en <code>/api/openapi</code> y puede importarse en Postman, Insomnia o generadores compatibles.</p>
              </div>
            </section>
            <ApiKeysPanel currentUser={data.currentUser} notify={notify} />
          </div>

          <div
            id="settings-panel-security"
            role="tabpanel"
            hidden={activeTab !== "security"}
            className="settings-tab-panel settings-admin-panels"
          >
            <MfaPanel currentUser={data.currentUser} notify={notify} />
            <UsersPanel currentUser={data.currentUser} notify={notify} />
          </div>

          <div
            id="settings-panel-sessions"
            role="tabpanel"
            hidden={activeTab !== "sessions"}
            className="settings-tab-panel settings-admin-panels"
          >
            <SessionsPanel notify={notify} />
          </div>
        </div>
      </div>
    </>
  );
}

function apiKeyIsActive(key: ApiKeySummary) {
  return !key.revoked_at && (!key.expires_at || new Date(key.expires_at) > new Date());
}

function apiKeyDate(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Nunca";
}

function ApiKeysPanel({
  currentUser,
  notify,
}: {
  currentUser: CurrentUser;
  notify: (message: string) => void;
}) {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(currentUser.role === "admin");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    if (currentUser.role !== "admin") return;
    setLoading(true);
    try {
      setKeys((await api<{ data: ApiKeySummary[] }>("/api/v1/api-keys")).data);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las claves API",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser.role !== "admin") return;
    let active = true;
    api<{ data: ApiKeySummary[] }>("/api/v1/api-keys")
      .then((result) => {
        if (active) setKeys(result.data);
      })
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las claves API",
        ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // The panel fetches once on mount; action-driven reloads use load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.role]);

  const activeKeys = keys.filter(apiKeyIsActive);
  const inactiveKeys = keys.filter((key) => !apiKeyIsActive(key));
  const visibleKeys = showInactive ? keys : activeKeys;

  return (
    <section className="panel settings-section api-key-management">
      <div className="settings-section-head">
        <span className="metric-icon violet">
          <KeyRound size={18} />
        </span>
        <div>
          <h3>Claves API</h3>
          <p>
            Credenciales independientes para servidores e integraciones, con
            permisos mínimos y revocación inmediata.
          </p>
        </div>
        {currentUser.role === "admin" && (
          <div className="settings-head-actions">
            {inactiveKeys.length > 0 && (
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => setShowInactive((value) => !value)}
              >
                {showInactive
                  ? "Ocultar inactivas"
                  : `Ver inactivas (${inactiveKeys.length})`}
              </button>
            )}
            <button
              type="button"
              className="button button-primary button-small"
              onClick={() => setCreating(true)}
            >
              <Plus size={14} /> Nueva clave API
            </button>
          </div>
        )}
      </div>

      {currentUser.role !== "admin" ? (
        <div className="info-callout">
          <ShieldCheck size={17} />
          <p>Solo un administrador puede crear, consultar o revocar claves API.</p>
        </div>
      ) : loading ? (
        <p className="muted">Cargando claves API…</p>
      ) : visibleKeys.length ? (
        <div className="api-key-list">
          {visibleKeys.map((key) => {
            const active = apiKeyIsActive(key);
            const expired = !key.revoked_at && Boolean(key.expires_at) && !active;
            return (
              <article key={key.id} className={active ? "" : "inactive"}>
                <span className="api-key-icon">
                  <KeyRound size={16} />
                </span>
                <div className="api-key-identity">
                  <strong>{key.name}</strong>
                  <code>km_live_{key.prefix}_••••••••</code>
                  <small>
                    Creada {apiKeyDate(key.created_at)}
                    {key.created_by_name ? ` por ${key.created_by_name}` : ""}
                  </small>
                </div>
                <div className="api-key-access">
                  <div className="api-key-scopes">
                    {key.scopes.slice(0, 4).map((scope) => (
                      <span key={scope}>
                        {apiKeyScopeLabels[scope] ?? scope}
                      </span>
                    ))}
                    {key.scopes.length > 4 && (
                      <span>+{key.scopes.length - 4} permisos</span>
                    )}
                  </div>
                  <small>
                    Último uso: {apiKeyDate(key.last_used_at)} · Caduca: {apiKeyDate(key.expires_at)}
                  </small>
                </div>
                <div className="api-key-actions">
                  <span
                    className={`status-badge ${active ? "success" : expired ? "scheduled" : "failed"}`}
                  >
                    {active ? "Activa" : expired ? "Caducada" : "Revocada"}
                  </span>
                  {active && (
                    <button
                      type="button"
                      className="button button-danger button-small"
                      onClick={() => setRevoking(key)}
                    >
                      Revocar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="api-key-empty">
          <KeyRound size={21} />
          <div>
            <strong>
              {keys.length ? "No hay claves activas" : "Todavía no hay claves API"}
            </strong>
            <p>
              {keys.length
                ? "Puedes consultar las caducadas o revocadas desde el histórico."
                : "Crea una credencial distinta para cada integración y concede solo los permisos que necesite."}
            </p>
          </div>
        </div>
      )}

      {creating && (
        <CreateApiKeyModal
          close={() => setCreating(false)}
          created={async (key) => {
            setCreating(false);
            setCreated(key);
            await load();
          }}
        />
      )}
      {created && (
        <ApiKeySecretModal
          apiKey={created}
          notify={notify}
          close={() => {
            setCreated(null);
            notify("Clave API creada");
          }}
        />
      )}
      {revoking && (
        <RevokeApiKeyModal
          apiKey={revoking}
          close={() => setRevoking(null)}
          done={async () => {
            setRevoking(null);
            await load();
            notify("Clave API revocada");
          }}
        />
      )}
    </section>
  );
}

function CreateApiKeyModal({
  close,
  created,
}: {
  close: () => void;
  created: (key: CreatedApiKey) => Promise<void>;
}) {
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [minimumExpiry] = useState(() =>
    new Date(Date.now() + 60_000).toISOString().slice(0, 16),
  );

  function toggleScope(scope: ApiKeyScope) {
    setScopes((current) => {
      if (scope === "*") return current.includes("*") ? [] : ["*"];
      const withoutFullAccess = current.filter((item) => item !== "*");
      return withoutFullAccess.includes(scope)
        ? withoutFullAccess.filter((item) => item !== scope)
        : [...withoutFullAccess, scope];
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scopes.length) {
      setError("Selecciona al menos un permiso.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const expiresAt = String(form.get("expires_at") ?? "").trim();
    try {
      const key = await api<CreatedApiKey>("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          scopes,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      await created(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la clave");
      setBusy(false);
    }
  }

  return (
    <Modal title="Nueva clave API" eyebrow="Credencial de integración" close={close} wide>
      <form
        className="modal-form api-key-create-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="form-grid">
          <label>
            Nombre de la integración
            <input
              name="name"
              maxLength={120}
              placeholder="Web de pedidos, automatización…"
              required
              autoFocus
            />
          </label>
          <label>
            Caducidad opcional
            <input
              name="expires_at"
              type="datetime-local"
              min={minimumExpiry}
            />
          </label>
        </div>
        <fieldset className="api-key-permissions">
          <legend>Permisos</legend>
          <p>Aplica el principio de mínimo privilegio. Podrás revocar la clave, pero sus permisos no se editan.</p>
          <div>
            {apiKeyScopeGroups.map((group) => (
              <section key={group.label}>
                <header>
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </header>
                <div>
                  {group.scopes.map((scope) => (
                    <label key={scope.id}>
                      <input
                        type="checkbox"
                        checked={scopes.includes(scope.id)}
                        onChange={() => toggleScope(scope.id)}
                      />
                      <span>
                        <strong>{scope.label}</strong>
                        <code>{scope.id}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <ModalActions close={close} saving={busy} label="Crear clave API" />
      </form>
    </Modal>
  );
}

function ApiKeySecretModal({
  apiKey,
  notify,
  close,
}: {
  apiKey: CreatedApiKey;
  notify: (message: string) => void;
  close: () => void;
}) {
  async function copyToken() {
    try {
      await navigator.clipboard.writeText(apiKey.token);
      notify("Clave copiada");
    } catch {
      notify("No se pudo copiar; selecciónala manualmente");
    }
  }
  return (
    <Modal title="Guarda esta clave ahora" eyebrow="Se muestra una sola vez" close={close}>
      <div className="modal-form api-key-secret">
        <div className="info-callout">
          <CircleAlert size={17} />
          <p>
            KiroMail solo almacena su hash. Al cerrar esta ventana no podrás volver a consultar el secreto.
          </p>
        </div>
        <label>
          Clave de {apiKey.name}
          <span className="api-key-secret-value">
            <input value={apiKey.token} readOnly onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className="button button-secondary" onClick={copyToken}>
              <Copy size={15} /> Copiar
            </button>
          </span>
        </label>
        <p className="field-help">
          Úsala como <code>Authorization: Bearer {apiKey.token.slice(0, 20)}…</code>
        </p>
        <footer className="modal-actions">
          <button type="button" className="button button-primary" onClick={close}>
            Ya la he guardado
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function RevokeApiKeyModal({
  apiKey,
  close,
  done,
}: {
  apiKey: ApiKeySummary;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function revoke() {
    setBusy(true);
    setError("");
    try {
      await api("/api/v1/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: apiKey.id }),
      });
      await done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar la clave");
      setBusy(false);
    }
  }
  return (
    <Modal title="Revocar clave API" eyebrow="Acción inmediata" close={close}>
      <div className="modal-form">
        <p className="bulk-action-description">
          <strong>{apiKey.name}</strong> dejará de autenticar peticiones inmediatamente. Esta acción no se puede deshacer; si vuelve a necesitar acceso tendrás que crear otra clave.
        </p>
        {error && <p className="form-error">{error}</p>}
        <footer className="modal-actions">
          <button type="button" className="button button-secondary" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="button button-danger" disabled={busy} onClick={revoke}>
            {busy ? "Revocando…" : "Revocar clave"}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function MfaPanel({
  currentUser,
  notify,
}: {
  currentUser: CurrentUser;
  notify: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(currentUser.mfa_enabled);
  const [remaining, setRemaining] = useState(0);
  const [setup, setSetup] = useState<{
    secret: string;
    qr_data_url: string;
  } | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ enabled: boolean; recovery_codes_remaining: number }>("/api/auth/mfa")
      .then((result) => {
        if (active) {
          setEnabled(result.enabled);
          setRemaining(result.recovery_codes_remaining);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  async function begin() {
    setBusy(true);
    try {
      setSetup(await api("/api/auth/mfa", { method: "POST" }));
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la configuración",
      );
    } finally {
      setBusy(false);
    }
  }
  async function enable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ enabled: boolean; recovery_codes: string[] }>(
        "/api/auth/mfa",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: form.get("code") }),
        },
      );
      setEnabled(result.enabled);
      setRecovery(result.recovery_codes);
      setRemaining(result.recovery_codes.length);
      setSetup(null);
      notify("Verificación en dos pasos activada");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Código no válido");
    } finally {
      setBusy(false);
    }
  }
  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/auth/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: form.get("password"),
          code: form.get("code"),
        }),
      });
      setEnabled(false);
      setRemaining(0);
      setDisableOpen(false);
      notify("Verificación en dos pasos desactivada");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo desactivar");
    } finally {
      setBusy(false);
    }
  }
  async function copyRecovery() {
    await navigator.clipboard.writeText(recovery.join("\n"));
    notify("Códigos copiados");
  }
  return (
    <section className="panel settings-section mfa-panel">
      <div className="settings-section-head">
        <span className="metric-icon forest">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h3>Verificación en dos pasos</h3>
          <p>
            Código TOTP compatible con cualquier aplicación de autenticación y
            códigos de recuperación de un solo uso.
          </p>
        </div>
        <span className={`status-badge ${enabled ? "success" : "draft"}`}>
          {enabled ? "Activa" : "No activa"}
        </span>
      </div>
      {enabled && !recovery.length && !disableOpen && (
        <div className="mfa-status">
          <p>
            <strong>Acceso protegido.</strong> Quedan {remaining} códigos de
            recuperación.
          </p>
          <button
            className="button button-secondary button-small"
            onClick={() => setDisableOpen(true)}
          >
            Desactivar
          </button>
        </div>
      )}
      {!enabled && !setup && !recovery.length && (
        <button
          className="button button-primary button-small"
          disabled={busy}
          onClick={begin}
        >
          {busy ? "Preparando…" : "Configurar TOTP"}
        </button>
      )}
      {setup && (
        <form
          className="mfa-setup"
          onSubmit={enable}
          onInvalid={() => notify(formValidationMessage)}
        >
          <Image
            src={setup.qr_data_url}
            alt="Código QR para configurar TOTP"
            width={220}
            height={220}
            unoptimized
          />
          <div>
            <p>Escanea el QR o introduce esta clave:</p>
            <code>{setup.secret}</code>
            <label>
              Código de seis cifras
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                autoFocus
              />
            </label>
            <button
              type="submit"
              className="button button-primary button-small"
              disabled={busy}
            >
              {busy ? "Verificando…" : "Verificar y activar"}
            </button>
          </div>
        </form>
      )}
      {recovery.length > 0 && (
        <div className="recovery-codes">
          <div className="info-callout">
            <CircleAlert size={17} />
            <p>
              Guarda estos códigos ahora. No volverán a mostrarse y cada uno
              funciona una sola vez.
            </p>
          </div>
          <div>
            {recovery.map((code) => (
              <code key={code}>{code}</code>
            ))}
          </div>
          <button
            className="button button-secondary button-small"
            onClick={copyRecovery}
          >
            <Copy size={14} /> Copiar códigos
          </button>
          <button
            className="button button-primary button-small"
            onClick={() => setRecovery([])}
          >
            Ya los he guardado
          </button>
        </div>
      )}
      {disableOpen && (
        <form
          className="mfa-disable"
          onSubmit={disable}
          onInvalid={() => notify(formValidationMessage)}
        >
          <label>
            Contraseña
            <input name="password" type="password" required />
          </label>
          <label>
            Código TOTP o de recuperación
            <input name="code" required />
          </label>
          <div>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setDisableOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button button-primary button-small"
              disabled={busy}
            >
              Confirmar desactivación
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function UsersPanel({
  currentUser,
  notify,
}: {
  currentUser: CurrentUser;
  notify: (message: string) => void;
}) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showDisabled, setShowDisabled] = useState(false);
  async function load() {
    setLoading(true);
    try {
      setUsers((await api<{ data: UserSummary[] }>("/api/users")).data);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los usuarios",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api<{ data: UserSummary[] }>("/api/users")
      .then((result) => {
        if (active) setUsers(result.data);
      })
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los usuarios",
        ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // This panel fetches once on mount; action-driven reloads use load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function update(user: UserSummary, patch: Record<string, string>) {
    try {
      await api(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
      notify("Usuario actualizado");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo actualizar");
    }
  }
  const disabledCount = users.filter((user) => user.status === "disabled").length;
  const visibleUsers = showDisabled
    ? users
    : users.filter((user) => user.status === "active");
  return (
    <section className="panel settings-section user-management">
      <div className="settings-section-head">
        <span className="metric-icon violet">
          <Users size={18} />
        </span>
        <div>
          <h3>Usuarios y permisos</h3>
          <p>
            Los cambios de rol o la desactivación revocan las sesiones abiertas.
          </p>
        </div>
        <div className="settings-head-actions">
          {disabledCount > 0 && (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setShowDisabled((value) => !value)}
            >
              {showDisabled
                ? "Ocultar desactivados"
                : `Ver desactivados (${disabledCount})`}
            </button>
          )}
          <button
            type="button"
            className="button button-primary button-small"
            onClick={() => setCreating(true)}
          >
            <UserPlus size={14} /> Nuevo usuario
          </button>
        </div>
      </div>
      {loading ? (
        <p className="muted">Cargando usuarios…</p>
      ) : (
        <div className="user-admin-list">
          {visibleUsers.map((user) => (
            <article key={user.id}>
              <span className="user-avatar">
                {user.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <strong>
                  {user.name}
                  {user.id === currentUser.id && <em>Tú</em>}
                </strong>
                <small>
                  {user.email} · {user.active_sessions} sesiones activas
                </small>
              </div>
              <select
                aria-label={`Rol de ${user.name}`}
                value={user.role}
                onChange={(event) => update(user, { role: event.target.value })}
              >
                <option value="admin">Administrador</option>
                <option value="editor">Editor</option>
                <option value="analyst">Analista</option>
              </select>
              <button
                className={`button button-small ${user.status === "active" ? "button-secondary" : "button-primary"}`}
                onClick={() =>
                  update(user, {
                    status: user.status === "active" ? "disabled" : "active",
                  })
                }
              >
                {user.status === "active" ? "Desactivar" : "Activar"}
              </button>
            </article>
          ))}
        </div>
      )}
      {creating && (
        <CreateUserModal
          close={() => setCreating(false)}
          done={async () => {
            setCreating(false);
            await load();
            notify("Usuario creado");
          }}
        />
      )}
    </section>
  );
}

function CreateUserModal({
  close,
  done,
}: {
  close: () => void;
  done: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          role: form.get("role"),
          password: form.get("password"),
        }),
      });
      await done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
      setBusy(false);
    }
  }
  return (
    <Modal title="Nuevo usuario" eyebrow="Acceso interno" close={close}>
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="form-grid">
          <label>
            Nombre
            <input name="name" required autoFocus />
          </label>
          <label>
            Rol
            <select name="role" defaultValue="editor">
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="analyst">Analista</option>
            </select>
          </label>
          <label className="full">
            Correo electrónico
            <input name="email" type="email" required />
          </label>
          <label className="full">
            Contraseña inicial
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={512}
              required
            />
            <span className="field-help">
              Mínimo 12 caracteres. El usuario podrá restablecerla desde la
              pantalla de acceso.
            </span>
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <ModalActions close={close} saving={busy} label="Crear usuario" />
      </form>
    </Modal>
  );
}

function SessionsPanel({ notify }: { notify: (message: string) => void }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setSessions(
        (await api<{ data: SessionSummary[] }>("/api/auth/sessions")).data,
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las sesiones",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api<{ data: SessionSummary[] }>("/api/auth/sessions")
      .then((result) => {
        if (active) setSessions(result.data);
      })
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las sesiones",
        ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // This panel fetches once on mount; action-driven reloads use load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function revoke(session: SessionSummary) {
    try {
      const result = await api<{ current: boolean }>("/api/auth/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: session.id }),
      });
      if (result.current) {
        router.replace("/login");
        router.refresh();
        return;
      }
      await load();
      notify("Sesión revocada");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo revocar");
    }
  }
  async function revokeOthers() {
    try {
      const result = await api<{ revoked_count: number }>("/api/auth/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_others: true }),
      });
      await load();
      notify(`${result.revoked_count} sesiones revocadas`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudieron revocar");
    }
  }
  return (
    <section className="panel settings-section session-management">
      <div className="settings-section-head">
        <span className="metric-icon clay">
          <Monitor size={18} />
        </span>
        <div>
          <h3>Dispositivos con sesión</h3>
          <p>
            Cada acceso tiene un token independiente, caducidad y última
            actividad.
          </p>
        </div>
        {sessions.some((session) => !session.current) && (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={revokeOthers}
          >
            Revocar las demás
          </button>
        )}
      </div>
      {loading ? (
        <p className="muted">Cargando sesiones…</p>
      ) : (
        <div className="session-list">
          {sessions.map((session) => (
            <article key={session.id}>
              <span>
                <KeyRound size={17} />
              </span>
              <div>
                <strong>
                  {session.label}
                  {session.current && <em>Esta sesión</em>}
                </strong>
                <small>
                  {session.ip || "IP no disponible"} · última actividad{" "}
                  {new Date(session.last_used_at).toLocaleString("es-ES")}
                </small>
              </div>
              <button
                className="button button-secondary button-small"
                onClick={() => revoke(session)}
              >
                Revocar
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PageIntro({
  eyebrow,
  title,
  text,
  actions,
}: {
  eyebrow: string;
  title: string;
  text: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </section>
  );
}

function Modal({
  title,
  eyebrow,
  close,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelector =
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusable = () =>
      Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) =>
          !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
    (
      modal.querySelector<HTMLElement>("[autofocus]") ??
      focusable()[0] ??
      modal
    ).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.setTimeout(() => previousFocus?.focus(), 0);
    };
  }, []);

  return (
    <div
      className="modal-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        className="modal-scrim"
        onClick={close}
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Cerrar diálogo"
      />
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <header>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button bordered"
            onClick={close}
            aria-label="Cerrar diálogo"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ContactModal({
  contact,
  data,
  close,
  done,
}: {
  contact?: Contact;
  data: AppData;
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(contact?.email ?? "");
  const emailSuggestion = useMemo(() => suggestEmailCorrection(email), [email]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      id: contact?.id,
      email: form.get("email"),
      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      phone: form.get("phone"),
      status: form.get("status"),
      country: form.get("country"),
      city: form.get("city"),
      listIds: form.getAll("listIds"),
      tagIds: contact?.tags.map((tag) => tag.id) ?? [],
    };
    try {
      await api("/api/contacts", {
        method: contact ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await done(contact ? "Suscriptor actualizado" : "Suscriptor creado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setSaving(false);
    }
  }
  return (
    <Modal
      title={contact ? "Editar suscriptor" : "Nuevo suscriptor"}
      eyebrow="Newsletter"
      close={close}
    >
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="form-grid">
          <label>
            Nombre
            <input name="first_name" defaultValue={contact?.first_name} />
          </label>
          <label>
            Apellidos
            <input name="last_name" defaultValue={contact?.last_name} />
          </label>
          <label className="full">
            Correo electrónico
            <input
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {emailSuggestion && (
              <span className="field-help" aria-live="polite">
                Posible error de dominio.{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEmail(emailSuggestion)}
                >
                  Usar {emailSuggestion}
                </button>
              </span>
            )}
          </label>
          <label>
            Teléfono
            <input name="phone" defaultValue={contact?.phone} />
          </label>
          <label>
            Ciudad
            <input name="city" defaultValue={contact?.custom_fields?.city} />
          </label>
          <label>
            País
            <input
              name="country"
              defaultValue={contact?.custom_fields?.country}
            />
          </label>
          <label>
            Estado global
            <select name="status" defaultValue={contact?.status ?? "active"}>
              <option value="active">Activo</option>
              <option value="bounced">Rebote</option>
              <option value="complained">Queja</option>
              <option value="blocked">Bloqueado</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Suscripciones activas</legend>
          <div className="choice-grid">
            {data.lists.map((item) => (
              <label key={item.id} className="choice">
                <input
                  type="checkbox"
                  name="listIds"
                  value={item.id}
                  defaultChecked={contact?.lists.some(
                    (own) => own.id === item.id && own.status === "active",
                  )}
                />
                <span>
                  <i style={{ background: item.color }} />
                  {item.name}
                </span>
              </label>
            ))}
          </div>
          <p className="field-help">
            Desmarcar una lista registra una baja solo en esa lista. Una baja
            anterior nunca se reactiva silenciosamente.
          </p>
        </fieldset>
        {contact && (
          <>
            <div className="subscriber-meta">
              <span>
                <small>Origen</small>
                <strong>
                  {contact.source === "csv"
                    ? "Importación CSV"
                    : contact.source === "api"
                      ? "API"
                      : "Alta manual"}
                </strong>
              </span>
              <span>
                <small>Fecha de alta</small>
                <strong>{date.format(new Date(contact.created_at))}</strong>
              </span>
            </div>
            <a
              className="button button-secondary"
              href={`/api/v1/contacts/${contact.id}/export`}
              download
            >
              Exportar todos sus datos (JSON)
            </a>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <ModalActions
          close={close}
          saving={saving}
          label={contact ? "Guardar cambios" : "Crear suscriptor"}
        />
      </form>
    </Modal>
  );
}

function ContactMergeModal({
  contacts,
  close,
  done,
}: {
  contacts: Contact[];
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [survivorId, setSurvivorId] = useState(contacts[0]?.id ?? "");
  const [strategy, setStrategy] = useState<"target" | "source" | "fill_empty">(
    "fill_empty",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const survivor = contacts.find((contact) => contact.id === survivorId);
  const source = contacts.find((contact) => contact.id !== survivorId);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!survivor || !source) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/contacts/${source.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge",
          survivor_contact_id: survivor.id,
          field_strategy: strategy,
          reason,
        }),
      });
      await done("Contactos fusionados sin reactivar bajas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo fusionar");
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Fusionar contactos duplicados"
      eyebrow="Identidad y consentimiento"
      close={close}
    >
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="info-callout">
          <ShieldCheck size={18} />
          <p>
            Las suscripciones e historial se consolidan. Si uno de los dos
            registros tiene una baja, la baja prevalece. El correo descartado
            queda suprimido y no puede reimportarse.
          </p>
        </div>
        <fieldset>
          <legend>Registro que se conservará</legend>
          <div className="choice-grid">
            {contacts.map((contact) => (
              <label className="choice" key={contact.id}>
                <input
                  type="radio"
                  name="survivor"
                  value={contact.id}
                  checked={survivorId === contact.id}
                  onChange={() => setSurvivorId(contact.id)}
                />
                <span>
                  <i />
                  {contact.email}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Cómo combinar nombre, teléfono y campos
          <select
            value={strategy}
            onChange={(event) =>
              setStrategy(event.target.value as typeof strategy)
            }
          >
            <option value="fill_empty">
              Conservar el principal y completar vacíos
            </option>
            <option value="target">
              Conservar solo los datos del principal
            </option>
            <option value="source">Preferir los datos del duplicado</option>
          </select>
        </label>
        <label>
          Motivo de la fusión
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={500}
            placeholder="Ej.: duplicado confirmado por la persona"
          />
        </label>
        {source && survivor && (
          <p className="field-help">
            <strong>{source.email}</strong> quedará como registro técnico
            fusionado hacia <strong>{survivor.email}</strong>.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        <ModalActions
          close={close}
          saving={saving}
          label="Fusionar contactos"
        />
      </form>
    </Modal>
  );
}

function ContactPrivacyModal({
  contact,
  close,
  done,
}: {
  contact: Contact;
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/contacts/${contact.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "anonymize", reason }),
      });
      await done("Datos personales anonimizados");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anonimizar");
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Anonimizar datos personales"
      eyebrow="Derecho de supresión"
      close={close}
    >
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="info-callout">
          <ShieldCheck size={18} />
          <p>
            Se borrarán los datos identificativos, campos de listas, enlaces y
            previsualizaciones históricas. Se conservarán métricas no personales
            y una supresión mínima de <strong>{contact.email}</strong> para que
            no pueda volver a darse de alta por accidente.
          </p>
        </div>
        <label>
          Motivo o referencia de la solicitud
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={500}
            placeholder="Ej.: solicitud recibida el 4/8/2026"
          />
        </label>
        <p className="form-error">Esta operación no se puede deshacer.</p>
        {error && <p className="form-error">{error}</p>}
        <ModalActions
          close={close}
          saving={saving}
          label="Anonimizar definitivamente"
        />
      </form>
    </Modal>
  );
}

function ImportModal({
  lists,
  close,
  done,
}: {
  lists: AppData["lists"];
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  type Preview = {
    delimiter: string;
    headers: string[];
    rows: Record<string, string>[];
    suggested_mapping: Record<string, string>;
  };
  type Field = { key: string; label: string; type: string };
  const [file, setFile] = useState<File>();
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [preview, setPreview] = useState<Preview>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Field[]>([]);
  const [policy, setPolicy] = useState("fill_empty");
  const [initialStatus, setInitialStatus] = useState("active");
  const [job, setJob] = useState<DataJob>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!listId) return;
    api<{ fields: Field[] }>(`/api/v1/lists/${listId}`)
      .then((result) =>
        setFields(
          result.fields.filter(
            (field) =>
              (field as Field & { status?: string }).status !== "archived",
          ),
        ),
      )
      .catch(() => setFields([]));
  }, [listId]);
  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    const timer = window.setInterval(
      () =>
        api<DataJob>(`/api/v1/imports/${job.id}`)
          .then(setJob)
          .catch(() => {}),
      800,
    );
    return () => clearInterval(timer);
  }, [job]);
  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<Preview>("/api/v1/imports/preview", {
        method: "POST",
        body: form,
      });
      const nextMapping = { ...result.suggested_mapping };
      for (const header of result.headers) {
        const systemTarget = result.suggested_mapping[header];
        const customField = fields.find((field) =>
          [field.key, field.label].some(
            (value) =>
              normalizeImportHeader(value) === normalizeImportHeader(header),
          ),
        );
        if (
          customField &&
          !["email", "first_name", "last_name", "phone"].includes(systemTarget)
        )
          nextMapping[header] = `field:${customField.key}`;
      }
      setPreview(result);
      setMapping(nextMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el CSV");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!file || !preview || !listId) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append(
        "config",
        JSON.stringify({
          list_id: listId,
          mapping,
          delimiter: preview.delimiter,
          initial_status: initialStatus,
          existing_policy: policy,
          update_unsubscribed: true,
          source: "csv",
          consent_text: "Importación administrativa",
          legal_basis: "consent",
        }),
      );
      const result = await api<{ id: string }>("/api/v1/imports", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: form,
      });
      setJob({
        id: result.id,
        status: "pending",
        progress: 0,
        total_rows: 0,
        processed_rows: 0,
        result: {},
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar");
    } finally {
      setBusy(false);
    }
  }
  async function rollback() {
    if (!job) return;
    await api(`/api/v1/imports/${job.id}/rollback`, { method: "POST" });
    setJob({ ...job, rollback_at: new Date().toISOString() });
  }
  if (job)
    return (
      <Modal
        title="Importación en segundo plano"
        eyebrow="Trabajo de datos"
        close={close}
      >
        <div className="modal-form job-progress">
          <div className={`job-state ${job.status}`}>
            <strong>
              {job.status === "completed" && job.has_errors
                ? "Completada con incidencias"
                : (statusLabel[job.status] ?? job.status)}
            </strong>
            <span>{job.progress}%</span>
            <i>
              <b style={{ width: `${job.progress}%` }} />
            </i>
          </div>
          {job.status === "completed" && (
            <>
              <div className="job-result-grid">
                <span>
                  <strong>{job.result.created ?? 0}</strong>Nuevos
                </span>
                <span>
                  <strong>{job.result.updated ?? 0}</strong>Actualizados
                </span>
                <span>
                  <strong>{job.result.new_subscriptions ?? 0}</strong>
                  Suscripciones
                </span>
                <span>
                  <strong>
                    {(job.result.failed ?? 0) + (job.result.skipped ?? 0)}
                  </strong>
                  Omitidos
                </span>
              </div>
              {job.rejections?.length ? (
                <div className="job-rejections">
                  {job.rejections.slice(0, 5).map((item) => (
                    <p key={item.row_number}>
                      <b>Fila {item.row_number}</b> {item.email || "Sin email"}{" "}
                      · {item.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          )}
          {job.error && <p className="form-error">{job.error}</p>}
          <footer className="modal-actions">
            <button className="button button-secondary" onClick={close}>
              Cerrar
            </button>
            {job.has_errors && (
              <a
                className="button button-secondary"
                href={`/api/v1/imports/${job.id}/errors`}
              >
                Descargar errores
              </a>
            )}
            {job.status === "completed" &&
              !job.rollback_at &&
              (job.result.new_subscriptions ?? 0) > 0 && (
                <button className="button button-secondary" onClick={rollback}>
                  Revertir altas
                </button>
              )}
            {job.status === "completed" && (
              <button
                className="button button-primary"
                onClick={() => done("Importación completada")}
              >
                Ver suscriptores
              </button>
            )}
          </footer>
        </div>
      </Modal>
    );
  return (
    <Modal
      title="Importar suscriptores"
      eyebrow={preview ? "Mapeo y consentimiento" : "Archivo CSV"}
      close={close}
      wide={Boolean(preview)}
    >
      <div className="modal-form">
        {!preview ? (
          <>
            <label className="drop-zone">
              <Upload size={25} />
              <strong>{file?.name || "Selecciona un archivo CSV"}</strong>
              <span>
                UTF-8, con coma, punto y coma o tabulador. Primero mostraremos
                una vista previa.
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setFile(event.target.files?.[0])}
              />
            </label>
            <label>
              Lista de destino
              <select
                value={listId}
                onChange={(event) => setListId(event.target.value)}
              >
                <option value="">Selecciona una lista…</option>
                {lists.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <div className="import-detected">
              <span>
                Codificación <strong>UTF-8</strong>
              </span>
              <span>
                Separador{" "}
                <strong>
                  {preview.delimiter === "\t" ? "Tabulador" : preview.delimiter}
                </strong>
              </span>
              <span>
                Muestra <strong>{preview.rows.length} filas</strong>
              </span>
            </div>
            <div className="mapping-grid">
              <strong>Columna CSV</strong>
              <strong>Guardar como</strong>
              {preview.headers.map((header) => (
                <div className="mapping-row" key={header}>
                  <span>
                    {header}
                    <small>{preview.rows[0]?.[header] || "—"}</small>
                  </span>
                  <select
                    value={mapping[header] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [header]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Ignorar</option>
                    <optgroup label="Contacto">
                      <option value="email">Email *</option>
                      <option value="first_name">Nombre</option>
                      <option value="last_name">Apellidos</option>
                      <option value="phone">Teléfono</option>
                      <option value="city">Ciudad global</option>
                      <option value="country">País global</option>
                      <option value="language">Idioma</option>
                      <option value="timezone">Zona horaria</option>
                    </optgroup>
                    {fields.length > 0 && (
                      <optgroup label="Campos de la lista">
                        {fields.map((field) => (
                          <option key={field.key} value={`field:${field.key}`}>
                            {field.label} · {field.type}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Estado inicial
                <select
                  value={initialStatus}
                  onChange={(event) => setInitialStatus(event.target.value)}
                >
                  <option value="active">
                    Activo · consentimiento acreditado
                  </option>
                  <option value="pending">Pendiente de confirmación</option>
                </select>
              </label>
              <label>
                Datos existentes
                <select
                  value={policy}
                  onChange={(event) => setPolicy(event.target.value)}
                >
                  <option value="fill_empty">Completar solo vacíos</option>
                  <option value="preserve">Conservar sin cambios</option>
                  <option value="overwrite">Sobrescribir</option>
                </select>
              </label>
            </div>
            <div className="info-callout">
              <CircleAlert size={17} />
              <p>
                Una baja anterior nunca se reactiva. Los valores pueden
                actualizarse, pero reactivar exige una acción explícita
                posterior.
              </p>
            </div>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <footer className="modal-actions">
          <button
            className="button button-secondary"
            onClick={preview ? () => setPreview(undefined) : close}
          >
            {preview ? "Atrás" : "Cancelar"}
          </button>
          <button
            className="button button-primary"
            disabled={
              busy ||
              !file ||
              !listId ||
              (Boolean(preview) && !Object.values(mapping).includes("email"))
            }
            onClick={preview ? start : inspect}
          >
            {busy
              ? "Procesando…"
              : preview
                ? "Iniciar importación"
                : "Previsualizar CSV"}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function ExportModal({
  lists,
  close,
  notify,
}: {
  lists: AppData["lists"];
  close: () => void;
  notify: (message: string) => void;
}) {
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [status, setStatus] = useState("active");
  const [job, setJob] = useState<DataJob>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    const timer = window.setInterval(
      () =>
        api<DataJob>(`/api/v1/exports/${job.id}`)
          .then(setJob)
          .catch(() => {}),
      800,
    );
    return () => clearInterval(timer);
  }, [job]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("/api/v1/exports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          list_id: listId,
          status: status === "all" ? undefined : status,
        }),
      });
      setJob({
        id: result.id,
        status: "pending",
        progress: 0,
        total_rows: 0,
        processed_rows: 0,
        result: {},
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Exportar suscriptores" eyebrow="CSV UTF-8" close={close}>
      {job ? (
        <div className="modal-form job-progress">
          <div className={`job-state ${job.status}`}>
            <strong>{statusLabel[job.status] ?? job.status}</strong>
            <span>{job.progress}%</span>
            <i>
              <b style={{ width: `${job.progress}%` }} />
            </i>
          </div>
          {job.status === "completed" && (
            <p className="job-summary">
              Archivo preparado con{" "}
              <strong>{job.result.rows ?? job.total_rows}</strong> filas.
            </p>
          )}
          {job.error && <p className="form-error">{job.error}</p>}
          <footer className="modal-actions">
            <button className="button button-secondary" onClick={close}>
              Cerrar
            </button>
            {job.status === "completed" && (
              <a
                className="button button-primary"
                href={`/api/v1/exports/${job.id}/download`}
                onClick={() => notify("Exportación descargada")}
              >
                Descargar CSV
              </a>
            )}
          </footer>
        </div>
      ) : (
        <div className="modal-form">
          <label>
            Lista
            <select
              value={listId}
              onChange={(event) => setListId(event.target.value)}
            >
              {lists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Suscripciones
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="active">Activas</option>
              <option value="unsubscribed">Bajas</option>
              <option value="pending">Pendientes</option>
              <option value="all">Todos los estados</option>
            </select>
          </label>
          <div className="info-callout">
            <CircleAlert size={17} />
            <p>
              El archivo incluirá campos globales y todas las columnas propias
              de la lista, con BOM UTF-8 para Excel.
            </p>
          </div>
          {error && <p className="form-error">{error}</p>}
          <footer className="modal-actions">
            <button className="button button-secondary" onClick={close}>
              Cancelar
            </button>
            <button
              className="button button-primary"
              disabled={busy || !listId}
              onClick={start}
            >
              {busy ? "Preparando…" : "Crear exportación"}
            </button>
          </footer>
        </div>
      )}
    </Modal>
  );
}

function BulkContactsModal({
  contactIds,
  lists,
  close,
  done,
}: {
  contactIds: string[];
  lists: ListSummary[];
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [action, setAction] = useState<
    "subscribe" | "unsubscribe" | "archive" | "block"
  >("subscribe");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [reactivate, setReactivate] = useState(false);
  const [reason, setReason] = useState("Operación masiva desde el panel");
  const [job, setJob] = useState<DataJob>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    const timer = window.setInterval(
      () =>
        api<DataJob>(`/api/v1/jobs/${job.id}`)
          .then(setJob)
          .catch(() => {}),
      650,
    );
    return () => clearInterval(timer);
  }, [job]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("/api/v1/contacts/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          contact_ids: contactIds,
          action,
          list_id: action === "block" ? undefined : listId,
          reactivate: action === "subscribe" && reactivate,
          reason,
        }),
      });
      setJob({
        id: result.id,
        status: "pending",
        progress: 0,
        total_rows: contactIds.length,
        processed_rows: 0,
        result: {},
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!job) return;
    try {
      await api(`/api/v1/jobs/${job.id}`, { method: "DELETE" });
      setJob({ ...job, status: "cancelled" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar");
    }
  }
  const actionDescription = {
    subscribe: "Añade una suscripción activa a la lista elegida.",
    unsubscribe: "Da de baja solamente de la lista elegida.",
    archive: "Archiva la pertenencia a la lista conservando el historial.",
    block:
      "Impide todas las campañas y mensajes transaccionales para estos correos.",
  }[action];
  if (job)
    return (
      <Modal
        title="Operación masiva"
        eyebrow={`${contactIds.length} suscriptores`}
        close={close}
      >
        <div className="modal-form job-progress">
          <div className={`job-state ${job.status}`}>
            <strong>{statusLabel[job.status] ?? job.status}</strong>
            <span>{job.progress}%</span>
            <i>
              <b style={{ width: `${job.progress}%` }} />
            </i>
          </div>
          {job.status === "completed" && (
            <>
              <div className="job-result-grid bulk-job-result">
                <span>
                  <strong>{job.result.changed ?? 0}</strong>Modificados
                </span>
                <span>
                  <strong>{job.result.created_subscriptions ?? 0}</strong>Nuevas
                  altas
                </span>
                <span>
                  <strong>{job.result.reactivated ?? 0}</strong>Reactivados
                </span>
                <span>
                  <strong>{job.result.skipped ?? 0}</strong>Omitidos
                </span>
                <span>
                  <strong>{job.result.failed ?? 0}</strong>Errores
                </span>
              </div>
              {(job.result.skipped ?? 0) > 0 && (
                <div className="info-callout">
                  <CircleAlert size={17} />
                  <p>
                    Los omitidos ya estaban en el estado solicitado, necesitaban
                    campos obligatorios o tenían una baja que no se autorizó
                    reactivar.
                  </p>
                </div>
              )}
            </>
          )}
          {job.error && <p className="form-error">{job.error}</p>}
          <footer className="modal-actions">
            <button className="button button-secondary" onClick={close}>
              Cerrar
            </button>
            {["pending", "running"].includes(job.status) && (
              <button className="button button-secondary" onClick={cancel}>
                Cancelar trabajo
              </button>
            )}
            {job.status === "completed" && (
              <button
                className="button button-primary"
                onClick={() => done("Operación masiva completada")}
              >
                Ver resultado
              </button>
            )}
          </footer>
        </div>
      </Modal>
    );
  return (
    <Modal
      title="Acción sobre suscriptores"
      eyebrow={`${contactIds.length} seleccionados`}
      close={close}
    >
      <div className="modal-form">
        <label>
          Acción
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as typeof action)}
          >
            <option value="subscribe">Añadir a una lista</option>
            <option value="unsubscribe">Dar de baja de una lista</option>
            <option value="archive">Archivar en una lista</option>
            <option value="block">Bloquear todas las comunicaciones</option>
          </select>
        </label>
        {action !== "block" && (
          <label>
            Lista
            <select
              value={listId}
              onChange={(event) => setListId(event.target.value)}
            >
              {lists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="bulk-action-description">{actionDescription}</p>
        {action === "subscribe" && (
          <label className="toggle-row bulk-reactivation">
            <span>
              <strong>Reactivar bajas anteriores</strong>
              <small>
                Es una acción explícita: quedará registrada como nueva
                suscripción.
              </small>
            </span>
            <input
              type="checkbox"
              checked={reactivate}
              onChange={(event) => setReactivate(event.target.checked)}
            />
          </label>
        )}
        <label>
          Motivo o referencia
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
          />
        </label>
        {action === "block" && (
          <div className="info-callout">
            <CircleAlert size={17} />
            <p>
              El bloqueo es global y afecta tanto a campañas como a correos
              transaccionales. Podrá resolverse después desde Audiencias.
            </p>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <footer className="modal-actions">
          <button className="button button-secondary" onClick={close}>
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={busy || (action !== "block" && !listId)}
            onClick={start}
          >
            {busy ? "Creando trabajo…" : "Aplicar en segundo plano"}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function SimpleEntityModal({
  title,
  kind,
  close,
  done,
}: {
  title: string;
  kind: "list" | "tag";
  close: () => void;
  done: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const colors = ["#315c5b", "#d38464", "#745b9b", "#d0a04a", "#607d9a"];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(kind === "list" ? "/api/lists" : "/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description") ?? "",
          color: form.get("color"),
        }),
      });
      await done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
      setSaving(false);
    }
  }
  return (
    <Modal title={title} eyebrow="Audiencias" close={close}>
      <form
        className="modal-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <label>
          Nombre
          <input name="name" required autoFocus />
        </label>
        {kind === "list" && (
          <label>
            Descripción
            <textarea
              name="description"
              placeholder="¿Quién pertenece a esta lista?"
            />
          </label>
        )}
        <fieldset>
          <legend>Color</legend>
          <div className="color-options">
            {colors.map((color, index) => (
              <label key={color}>
                <input
                  type="radio"
                  name="color"
                  value={color}
                  defaultChecked={index === 0}
                />
                <span style={{ background: color }} />
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <ModalActions close={close} saving={saving} label="Crear" />
      </form>
    </Modal>
  );
}

type SegmentPreview = {
  count: number;
  examples: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  }[];
  explanation: string;
};
const segmentFieldOptions = [
  ["status", "Estado global"],
  ["email", "Correo"],
  ["first_name", "Nombre"],
  ["last_name", "Apellidos"],
  ["phone", "Teléfono"],
  ["country", "País"],
  ["city", "Ciudad"],
  ["language", "Idioma"],
  ["timezone", "Zona horaria"],
  ["source", "Origen del contacto"],
  ["created_at", "Fecha de creación"],
  ["last_activity_at", "Última actividad"],
  ["subscription_status", "Estado en esta lista"],
  ["subscription_source", "Origen de la suscripción"],
  ["subscribed_at", "Fecha de alta en lista"],
  ["confirmed_at", "Fecha de confirmación"],
  ["unsubscribed_at", "Fecha de baja"],
  ["list_field", "Campo propio de la lista"],
  ["campaign_activity", "Actividad de campaña"],
] as const;
function segmentRoot(segment?: Segment): SegmentGroup {
  return segment?.definition?.children?.length
    ? segment.definition
    : {
        kind: "group",
        match: segment?.match_type ?? "all",
        children: segment?.rules?.length
          ? segment.rules.map((rule) => ({ kind: "rule", ...rule }))
          : [{ kind: "rule", field: "email", operator: "contains", value: "" }],
      };
}
function updateSegmentAt(
  root: SegmentGroup,
  path: number[],
  update: (node: SegmentNode) => SegmentNode,
): SegmentGroup {
  if (!path.length) return update(root) as SegmentGroup;
  const [index, ...rest] = path;
  return {
    ...root,
    children: root.children.map((node, nodeIndex) =>
      nodeIndex !== index
        ? node
        : rest.length && node.kind === "group"
          ? updateSegmentAt(node, rest, update)
          : rest.length
            ? node
            : update(node),
    ),
  };
}
function defaultSegmentRule(
  field = "email",
  listFields: ListField[] = [],
): SegmentRule {
  if (field === "status")
    return { kind: "rule", field, operator: "is", value: "active" };
  if (
    [
      "created_at",
      "last_activity_at",
      "subscribed_at",
      "confirmed_at",
      "unsubscribed_at",
    ].includes(field)
  )
    return {
      kind: "rule",
      field,
      operator: "after",
      value: new Date().toISOString().slice(0, 10),
    };
  if (field === "subscription_status")
    return { kind: "rule", field, operator: "is", value: "active" };
  if (field === "campaign_activity")
    return {
      kind: "rule",
      field,
      operator: "received",
      value: "",
      within_days: 30,
    };
  if (field === "list_field") {
    const first = listFields[0];
    return {
      kind: "rule",
      field,
      field_key: first?.key ?? "",
      field_type: first?.type ?? "text",
      operator: first?.type === "multiselect" ? "contains_any" : "is",
      value: first?.type === "multiselect" ? [] : "",
    };
  }
  return { kind: "rule", field, operator: "contains", value: "" };
}
function operatorsFor(rule: SegmentRule) {
  const type =
    rule.field === "list_field"
      ? rule.field_type
      : [
            "created_at",
            "last_activity_at",
            "subscribed_at",
            "confirmed_at",
            "unsubscribed_at",
          ].includes(rule.field)
        ? "date"
        : rule.field === "campaign_activity"
          ? "activity"
          : rule.field === "status" || rule.field === "subscription_status"
            ? "select"
            : "text";
  if (type === "activity")
    return [
      ["received", "recibió"],
      ["not_received", "no recibió"],
      ["opened", "abrió"],
      ["not_opened", "no abrió"],
      ["clicked", "hizo clic"],
      ["not_clicked", "no hizo clic"],
    ];
  if (type === "multiselect")
    return [
      ["contains_any", "incluye alguna"],
      ["contains_all", "incluye todas"],
      ["is_empty", "está vacío"],
      ["not_empty", "no está vacío"],
    ];
  if (["integer", "decimal"].includes(type ?? ""))
    return [
      ["is", "es igual a"],
      ["is_not", "es distinto de"],
      ["greater_than", "mayor que"],
      ["greater_or_equal", "mayor o igual"],
      ["less_than", "menor que"],
      ["less_or_equal", "menor o igual"],
      ["between", "entre"],
      ["is_empty", "está vacío"],
      ["not_empty", "no está vacío"],
    ];
  if (["date", "datetime"].includes(type ?? ""))
    return [
      ["before", "antes de"],
      ["after", "después de"],
      ["between", "entre"],
      ["is_empty", "está vacío"],
      ["not_empty", "no está vacío"],
    ];
  if (type === "boolean" || type === "select")
    return [
      ["is", "es"],
      ["is_not", "no es"],
      ["is_empty", "está vacío"],
      ["not_empty", "no está vacío"],
    ];
  return [
    ["is", "es"],
    ["is_not", "no es"],
    ["contains", "contiene"],
    ["not_contains", "no contiene"],
    ["starts_with", "empieza por"],
    ["is_empty", "está vacío"],
    ["not_empty", "no está vacío"],
  ];
}

function SegmentModal({
  data,
  segment,
  close,
  done,
}: {
  data: AppData;
  segment?: Segment;
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const [listId, setListId] = useState(
    segment?.list_id ?? data.lists[0]?.id ?? "",
  );
  const [definition, setDefinition] = useState<SegmentGroup>(() =>
    segmentRoot(segment),
  );
  const [listFields, setListFields] = useState<ListField[]>([]);
  const [preview, setPreview] = useState<SegmentPreview>();
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!listId) return;
    let active = true;
    api<ListDetail>(`/api/v1/lists/${listId}`)
      .then((result) => {
        if (active)
          setListFields(
            result.fields.filter((field) => field.status === "active"),
          );
      })
      .catch(() => {
        if (active) setListFields([]);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  useEffect(() => {
    if (!listId) return;
    let active = true;
    const timer = window.setTimeout(
      () =>
        api<SegmentPreview>("/api/v1/segments/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ list_id: listId, definition }),
        })
          .then((result) => {
            if (active) {
              setPreview(result);
              setPreviewError("");
            }
          })
          .catch((err) => {
            if (active) {
              setPreview(undefined);
              setPreviewError(
                err instanceof Error ? err.message : "Completa las reglas",
              );
            }
          }),
      350,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [listId, definition]);
  function update(path: number[], change: (node: SegmentNode) => SegmentNode) {
    setDefinition((current) => updateSegmentAt(current, path, change));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(
        segment ? `/api/v1/segments/${segment.id}` : "/api/v1/segments",
        {
          method: segment ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            description: form.get("description"),
            list_id: listId,
            definition,
          }),
        },
      );
      await done(segment ? "Segmento actualizado" : "Segmento creado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      setSaving(false);
    }
  }
  return (
    <Modal
      title={segment ? "Editar segmento" : "Nuevo segmento"}
      eyebrow="Reglas tipadas"
      close={close}
      wide
    >
      <form
        className="modal-form typed-segment-form"
        onSubmit={submit}
        onInvalid={() => setError(formValidationMessage)}
      >
        <div className="form-grid">
          <label>
            Nombre
            <input
              name="name"
              defaultValue={segment?.name}
              required
              autoFocus
            />
          </label>
          <label>
            Lista
            <select
              value={listId}
              onChange={(event) => setListId(event.target.value)}
              required
            >
              {data.lists.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Descripción
            <input
              name="description"
              defaultValue={segment?.description}
              placeholder="Describe a quién reúne"
            />
          </label>
        </div>
        <div className="typed-segment-layout">
          <fieldset>
            <legend>Constructor de reglas</legend>
            <SegmentNodeEditor
              node={definition}
              path={[]}
              depth={0}
              listFields={listFields}
              campaigns={data.campaigns.filter(
                (campaign) => campaign.list_id === listId,
              )}
              update={update}
            />
          </fieldset>
          <aside className="segment-preview-panel">
            <p className="eyebrow">Vista previa viva</p>
            {preview ? (
              <>
                <strong>{preview.count}</strong>
                <span>suscriptores coinciden</span>
                <p>{preview.explanation}</p>
                <div>
                  {preview.examples.map((contact) => (
                    <article key={contact.id}>
                      <b>
                        {`${contact.first_name} ${contact.last_name}`.trim() ||
                          "Sin nombre"}
                      </b>
                      <small>{contact.email}</small>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <strong>—</strong>
                <span>{previewError || "Calculando…"}</span>
              </>
            )}
          </aside>
        </div>
        {error && <p className="form-error">{error}</p>}
        <ModalActions
          close={close}
          saving={saving}
          label={segment ? "Guardar segmento" : "Crear segmento"}
        />
      </form>
    </Modal>
  );
}

function SegmentNodeEditor({
  node,
  path,
  depth,
  listFields,
  campaigns,
  update,
}: {
  node: SegmentNode;
  path: number[];
  depth: number;
  listFields: ListField[];
  campaigns: Campaign[];
  update: (path: number[], change: (node: SegmentNode) => SegmentNode) => void;
}) {
  if (node.kind === "group")
    return (
      <div className={`segment-group depth-${depth}`}>
        <header>
          <span>{depth === 0 ? "Las personas cumplen" : "Grupo"}</span>
          <select
            aria-label="Lógica del grupo"
            value={node.match}
            onChange={(event) =>
              update(path, (current) => ({
                ...(current as SegmentGroup),
                match: event.target.value as "all" | "any",
              }))
            }
          >
            <option value="all">todas las condiciones</option>
            <option value="any">cualquiera de las condiciones</option>
          </select>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              update(path, (current) => ({
                ...(current as SegmentGroup),
                children: [
                  ...(current as SegmentGroup).children,
                  defaultSegmentRule("email", listFields),
                ],
              }))
            }
          >
            <Plus size={13} /> Condición
          </button>
          {depth < 2 && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                update(path, (current) => ({
                  ...(current as SegmentGroup),
                  children: [
                    ...(current as SegmentGroup).children,
                    {
                      kind: "group" as const,
                      match: "all" as const,
                      children: [defaultSegmentRule("email", listFields)],
                    },
                  ],
                }))
              }
            >
              <Layers3 size={13} /> Grupo
            </button>
          )}
        </header>
        <div className="segment-group-children">
          {node.children.map((child, index) => (
            <SegmentNodeEditor
              key={`${path.join("-")}-${index}`}
              node={child}
              path={[...path, index]}
              depth={depth + 1}
              listFields={listFields}
              campaigns={campaigns}
              update={update}
            />
          ))}
        </div>
      </div>
    );
  const rule = node;
  const selectedField = listFields.find(
    (field) => field.key === rule.field_key,
  );
  const operators = operatorsFor(rule);
  function setField(field: string) {
    update(path, () => defaultSegmentRule(field, listFields));
  }
  function patch(change: Partial<SegmentRule>) {
    update(path, (current) => ({ ...(current as SegmentRule), ...change }));
  }
  return (
    <div className="typed-rule-row">
      <select
        aria-label="Campo de condición"
        value={rule.field}
        onChange={(event) => setField(event.target.value)}
      >
        {segmentFieldOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {rule.field === "list_field" && (
        <select
          aria-label="Campo propio"
          value={rule.field_key ?? ""}
          onChange={(event) => {
            const field = listFields.find(
              (item) => item.key === event.target.value,
            );
            patch({
              field_key: field?.key ?? "",
              field_type: field?.type ?? "text",
              operator: field?.type === "multiselect" ? "contains_any" : "is",
              value: field?.type === "multiselect" ? [] : "",
            });
          }}
        >
          <option value="">Selecciona un campo…</option>
          {listFields.map((field) => (
            <option value={field.key} key={field.id}>
              {field.label} · {fieldTypeLabels[field.type] ?? field.type}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Operador"
        value={rule.operator}
        onChange={(event) => patch({ operator: event.target.value })}
      >
        {operators.map(([value, label]) => (
          <option value={value} key={value}>
            {label}
          </option>
        ))}
      </select>
      <SegmentTypedValue
        rule={rule}
        field={selectedField}
        campaigns={campaigns}
        patch={patch}
      />
      <button
        type="button"
        className="icon-button danger"
        aria-label="Eliminar condición"
        onClick={() => {
          const parentPath = path.slice(0, -1);
          const index = path.at(-1)!;
          update(parentPath, (current) => ({
            ...(current as SegmentGroup),
            children: (current as SegmentGroup).children.filter(
              (_, childIndex) => childIndex !== index,
            ),
          }));
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function SegmentTypedValue({
  rule,
  field,
  campaigns,
  patch,
}: {
  rule: SegmentRule;
  field?: ListField;
  campaigns: Campaign[];
  patch: (change: Partial<SegmentRule>) => void;
}) {
  if (["is_empty", "not_empty"].includes(rule.operator))
    return <span className="rule-no-value">Sin valor</span>;
  if (rule.field === "status")
    return (
      <select
        aria-label="Valor"
        value={String(rule.value ?? "active")}
        onChange={(event) => patch({ value: event.target.value })}
      >
        <option value="active">Activo</option>
        <option value="bounced">Rebote</option>
        <option value="complained">Queja</option>
        <option value="blocked">Bloqueado</option>
      </select>
    );
  if (rule.field === "subscription_status")
    return (
      <select
        aria-label="Valor"
        value={String(rule.value ?? "active")}
        onChange={(event) => patch({ value: event.target.value })}
      >
        <option value="active">Activa</option>
        <option value="pending">Pendiente</option>
        <option value="unsubscribed">Baja</option>
        <option value="archived">Archivada</option>
      </select>
    );
  if (rule.field === "campaign_activity")
    return (
      <span className="rule-values campaign-rule-values">
        <select
          aria-label="Campaña"
          value={String(rule.value ?? "")}
          onChange={(event) => patch({ value: event.target.value })}
        >
          <option value="">Selecciona una campaña…</option>
          {campaigns.map((campaign) => (
            <option value={campaign.id} key={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
        <label>
          <span>últimos</span>
          <input
            aria-label="Ventana en días"
            type="number"
            min="1"
            max="3650"
            value={rule.within_days ?? 30}
            onChange={(event) =>
              patch({ within_days: Number(event.target.value) })
            }
          />
          <span>días</span>
        </label>
      </span>
    );
  if (rule.field === "list_field" && field?.type === "boolean")
    return (
      <select
        aria-label="Valor"
        value={String(rule.value ?? true)}
        onChange={(event) => patch({ value: event.target.value === "true" })}
      >
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  if (
    rule.field === "list_field" &&
    field &&
    ["select", "multiselect"].includes(field.type)
  ) {
    if (field.type === "multiselect")
      return (
        <select
          aria-label="Valores"
          multiple
          value={(Array.isArray(rule.value) ? rule.value : []).map(String)}
          onChange={(event) =>
            patch({
              value: Array.from(event.target.selectedOptions).map(
                (option) => option.value,
              ),
            })
          }
        >
          {field.options.map((option) => (
            <option key={String(option)}>{String(option)}</option>
          ))}
        </select>
      );
    return (
      <select
        aria-label="Valor"
        value={String(rule.value ?? "")}
        onChange={(event) => patch({ value: event.target.value })}
      >
        <option value="">Selecciona…</option>
        {field.options.map((option) => (
          <option key={String(option)}>{String(option)}</option>
        ))}
      </select>
    );
  }
  const dateField =
    [
      "created_at",
      "last_activity_at",
      "subscribed_at",
      "confirmed_at",
      "unsubscribed_at",
    ].includes(rule.field) || ["date", "datetime"].includes(field?.type ?? "");
  const numeric = ["integer", "decimal"].includes(field?.type ?? "");
  return (
    <span className="rule-values">
      <input
        aria-label="Valor"
        type={dateField ? "date" : numeric ? "number" : "text"}
        step={field?.type === "decimal" ? "any" : undefined}
        value={String(rule.value ?? "")}
        onChange={(event) =>
          patch({
            value:
              numeric && event.target.value !== ""
                ? Number(event.target.value)
                : event.target.value,
          })
        }
        placeholder="Valor"
      />
      {rule.operator === "between" && (
        <input
          aria-label="Valor final"
          type={dateField ? "date" : "number"}
          step={field?.type === "decimal" ? "any" : undefined}
          value={String(rule.value_to ?? "")}
          onChange={(event) =>
            patch({
              value_to:
                numeric && event.target.value !== ""
                  ? Number(event.target.value)
                  : event.target.value,
            })
          }
          placeholder="Hasta"
        />
      )}
    </span>
  );
}

function CampaignModal({
  data,
  campaign,
  close,
  done,
}: {
  data: AppData;
  campaign?: Campaign;
  close: () => void;
  done: (message: string) => Promise<void>;
}) {
  const scheduledLocal = campaign?.scheduled_at
    ? new Date(
        new Date(campaign.scheduled_at).getTime() -
          new Date(campaign.scheduled_at).getTimezoneOffset() * 60_000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(
    campaign?.status === "scheduled" ? "schedule" : "draft",
  );
  const [testEmail, setTestEmail] = useState(data.settings.default_reply_to);
  const [testing, setTesting] = useState(false);
  const [testDone, setTestDone] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(
    campaign?.approval_required ?? false,
  );
  const marketingTemplates = data.templates.filter(
    (item) => item.channel === "marketing",
  );
  const [form, setForm] = useState({
    name: campaign?.name ?? "",
    subject: campaign?.subject ?? marketingTemplates[0]?.subject ?? "",
    preview_text:
      campaign?.preview_text ?? marketingTemplates[0]?.preview_text ?? "",
    from_name: campaign?.from_name ?? data.settings.default_from_name,
    from_email: campaign?.from_email ?? data.settings.default_from_email,
    reply_to: campaign?.reply_to ?? data.settings.default_reply_to,
    template_id:
      campaign?.template_id ??
      (!campaign ? (marketingTemplates[0]?.id ?? "") : ""),
    list_id: campaign?.list_id ?? data.lists[0]?.id ?? "",
    target_type: campaign?.target_type === "segment" ? "segment" : "all",
    target_id: campaign?.target_id ?? "",
    scheduled_at: scheduledLocal,
  });
  const approvalSensitiveChanged = Boolean(
    campaign &&
      (form.subject !== campaign.subject ||
        form.preview_text !== campaign.preview_text ||
        form.from_name !== campaign.from_name ||
        form.from_email !== campaign.from_email ||
        form.reply_to !== campaign.reply_to ||
        form.list_id !== campaign.list_id ||
        form.template_id !== (campaign.template_id ?? "") ||
        form.target_type !==
          (campaign.target_type === "segment" ? "segment" : "all") ||
        form.target_id !== (campaign.target_id ?? "")),
  );
  const currentApproval = Boolean(
    campaign?.approved_at && campaign.approved_version === campaign.version,
  );
  const approvalReady =
    !approvalRequired || (currentApproval && !approvalSensitiveChanged);
  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function selectTemplate(id: string) {
    const template = data.templates.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      template_id: id,
      subject: template?.subject ?? current.subject,
      preview_text: template?.preview_text ?? current.preview_text,
    }));
  }
  const targetOptions = data.segments.filter(
    (item) => !item.list_id || item.list_id === form.list_id,
  );
  async function sendTest() {
    setTesting(true);
    setTestDone(false);
    setError("");
    try {
      await api("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: form.template_id,
          email: testEmail,
          subject: form.subject,
          from_name: form.from_name,
          from_email: form.from_email,
          reply_to: form.reply_to,
        }),
      });
      setTestDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setTesting(false);
    }
  }
  async function submit() {
    setSaving(true);
    setError("");
    try {
      const selectedTemplate = marketingTemplates.find(
        (item) => item.id === form.template_id,
      );
      const payload: Record<string, unknown> = {
        name: form.name,
        list_id: form.list_id,
        subject: form.subject,
        preview_text: form.preview_text,
        from: { name: form.from_name, email: form.from_email },
        reply_to: form.reply_to,
        segment_id: form.target_type === "segment" ? form.target_id : null,
        approval_required: approvalRequired,
      };
      if (selectedTemplate?.published_version_id)
        payload.template_version_id = selectedTemplate.published_version_id;
      if (campaign) payload.version = campaign.version;
      const saved = campaign
        ? await api<Campaign>(`/api/v1/campaigns/${campaign.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await api<Campaign>("/api/v1/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (mode === "schedule")
        await api(`/api/v1/campaigns/${saved.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "schedule",
            scheduled_at: new Date(form.scheduled_at).toISOString(),
          }),
        });
      else if (mode === "draft" && campaign?.status === "scheduled")
        await api(`/api/v1/campaigns/${saved.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unschedule" }),
        });
      else if (mode === "now") {
        const preflight = await api<{
          valid: boolean;
          errors: { message: string }[];
          audience: { included: number };
        }>(`/api/v1/campaigns/${saved.id}/preflight`);
        if (!preflight.valid)
          throw new Error(
            preflight.errors.map((item) => item.message).join(" · "),
          );
        await api(`/api/v1/campaigns/${saved.id}/launch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            confirm_recipient_count: preflight.audience.included,
          }),
        });
      }
      await done(
        mode === "now"
          ? "Campaña añadida a la cola"
          : mode === "schedule"
            ? "Campaña programada"
            : campaign
              ? "Campaña actualizada"
              : "Borrador guardado",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setSaving(false);
    }
  }
  const keepsDirectContent =
    campaign?.content_source === "direct" && !form.template_id;
  return (
    <Modal
      title={campaign ? "Editar campaña" : "Nueva campaña"}
      eyebrow={`Paso ${step} de 3`}
      close={close}
      wide
    >
      <div className="wizard-progress">
        <i className={step >= 1 ? "active" : ""} />
        <i className={step >= 2 ? "active" : ""} />
        <i className={step >= 3 ? "active" : ""} />
      </div>
      <div className="campaign-wizard">
        {step === 1 && (
          <div className="wizard-step">
            <h3>Empecemos por lo esencial</h3>
            <p>Este nombre solo será visible para ti.</p>
            <div className="form-grid">
              <label className="full">
                Nombre de la campaña
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Ej. Newsletter de septiembre"
                  autoFocus
                  required
                />
              </label>
              <label className="full">
                Asunto
                <input
                  value={form.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  required
                />
              </label>
              <label className="full">
                Texto de previsualización
                <input
                  value={form.preview_text}
                  onChange={(e) => set("preview_text", e.target.value)}
                />
              </label>
              <label>
                Nombre del remitente
                <input
                  value={form.from_name}
                  onChange={(e) => set("from_name", e.target.value)}
                />
              </label>
              <label>
                Correo del remitente
                <input
                  type="email"
                  value={form.from_email}
                  onChange={(e) => set("from_email", e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="wizard-step">
            <h3>Elige el mensaje</h3>
            <p>
              {keepsDirectContent
                ? "Puedes conservar el HTML directo congelado o sustituirlo por una plantilla publicada."
                : "Selecciona una plantilla de marketing publicada."}
            </p>
            {keepsDirectContent && (
              <button type="button" className="direct-content-choice selected">
                <span className="mini-preview">
                  <iframe
                    title="HTML directo actual"
                    srcDoc={campaign.html_content}
                    sandbox=""
                  />
                </span>
                <strong>Conservar HTML directo actual</strong>
                <small>No se modifica su contenido exacto.</small>
                <i>
                  <Check size={14} />
                </i>
              </button>
            )}
            <div className="template-picker">
              {marketingTemplates.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={form.template_id === item.id ? "selected" : ""}
                  onClick={() => selectTemplate(item.id)}
                >
                  <span className="mini-preview">
                    <iframe
                      title={item.name}
                      srcDoc={item.html_content}
                      sandbox=""
                    />
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.subject}</small>
                  {form.template_id === item.id && (
                    <i>
                      <Check size={14} />
                    </i>
                  )}
                </button>
              ))}
            </div>
            {form.template_id && (
              <div className="test-send">
                <label>
                  Enviar prueba a
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={sendTest}
                  disabled={testing || !testEmail}
                >
                  {testing ? "Enviando…" : "Enviar prueba"}
                </button>
                {testDone && (
                  <span>
                    <CircleCheck size={15} /> Revisa Mailpit
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="wizard-step">
            <h3>Audiencia y momento</h3>
            <p>
              Cada campaña pertenece a una lista principal; un segmento solo la
              reduce.
            </p>
            <div className="form-grid">
              <label>
                Lista principal
                <select
                  value={form.list_id}
                  onChange={(e) => set("list_id", e.target.value)}
                  required
                >
                  <option value="">Selecciona una lista…</option>
                  {data.lists.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Audiencia dentro de la lista
                <select
                  value={form.target_type}
                  onChange={(e) => {
                    set("target_type", e.target.value);
                    set("target_id", "");
                  }}
                >
                  <option value="all">Toda la lista activa</option>
                  <option value="segment">Aplicar un segmento</option>
                </select>
              </label>
              {form.target_type === "segment" && (
                <label>
                  Segmento
                  <select
                    value={form.target_id}
                    onChange={(e) => set("target_id", e.target.value)}
                    required
                  >
                    <option value="">Selecciona…</option>
                    {targetOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="approval-toggle">
              <input
                type="checkbox"
                checked={approvalRequired}
                onChange={(event) => {
                  setApprovalRequired(event.target.checked);
                  if (event.target.checked && !currentApproval)
                    setMode("draft");
                }}
              />
              <span>
                <strong>Requerir aprobación administrativa</strong>
                <small>
                  Bloquea la programación y el envío hasta aprobar esta versión.
                </small>
              </span>
            </label>
            {approvalRequired && !approvalReady && (
              <div className="info-callout">
                <CircleAlert size={17} />
                <p>
                  Guarda el borrador y solicita aprobación desde la lista de
                  campañas. Los cambios relevantes invalidan una aprobación
                  anterior.
                </p>
              </div>
            )}
            <div className="send-mode">
              <button
                type="button"
                className={mode === "draft" ? "active" : ""}
                onClick={() => setMode("draft")}
              >
                <FileText size={18} />
                <span>
                  <strong>Guardar borrador</strong>
                  <small>Continuar más tarde</small>
                </span>
              </button>
              <button
                type="button"
                disabled={!approvalReady}
                className={mode === "now" ? "active" : ""}
                onClick={() => setMode("now")}
              >
                <Send size={18} />
                <span>
                  <strong>Enviar ahora</strong>
                  <small>
                    {approvalReady
                      ? "Valida y pasa a la cola"
                      : "Necesita aprobación"}
                  </small>
                </span>
              </button>
              <button
                type="button"
                disabled={!approvalReady}
                className={mode === "schedule" ? "active" : ""}
                onClick={() => setMode("schedule")}
              >
                <CalendarClock size={18} />
                <span>
                  <strong>Programar</strong>
                  <small>
                    {approvalReady
                      ? "Elegir fecha y hora"
                      : "Necesita aprobación"}
                  </small>
                </span>
              </button>
            </div>
            {mode === "schedule" && (
              <label className="schedule-field">
                Fecha y hora
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => set("scheduled_at", e.target.value)}
                  required
                />
              </label>
            )}
            <div className="review-card">
              <span className="metric-icon forest">
                <Mail size={18} />
              </span>
              <div>
                <strong>{form.subject || "Sin asunto"}</strong>
                <small>
                  De {form.from_name} ·{" "}
                  {data.lists.find((item) => item.id === form.list_id)?.name ||
                    "Lista por elegir"}
                  {form.target_type === "segment"
                    ? ` · ${targetOptions.find((item) => item.id === form.target_id)?.name || "segmento por elegir"}`
                    : ""}
                </small>
              </div>
            </div>
          </div>
        )}
      </div>
      {error && <p className="form-error modal-error">{error}</p>}
      <footer className="modal-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={step === 1 ? close : () => setStep(step - 1)}
        >
          {step === 1 ? "Cancelar" : "Atrás"}
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="button button-primary"
            disabled={
              (step === 1 && (!form.name || !form.subject)) ||
              (step === 2 && !form.template_id && !keepsDirectContent)
            }
            onClick={() => setStep(step + 1)}
          >
            Continuar <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={submit}
            disabled={
              saving ||
              !form.list_id ||
              (form.target_type === "segment" && !form.target_id) ||
              (mode === "schedule" && !form.scheduled_at) ||
              (["now", "schedule"].includes(mode) && !approvalReady)
            }
          >
            {saving
              ? "Guardando…"
              : mode === "now"
                ? "Confirmar envío"
                : mode === "schedule"
                  ? "Programar campaña"
                  : "Guardar borrador"}
          </button>
        )}
      </footer>
    </Modal>
  );
}

function ModalActions({
  close,
  saving,
  label,
}: {
  close: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <footer className="modal-actions">
      <button type="button" className="button button-secondary" onClick={close}>
        Cancelar
      </button>
      <button
        type="submit"
        className="button button-primary"
        disabled={saving}
      >
        {saving ? "Guardando…" : label}
      </button>
    </footer>
  );
}

/* Response types for the FIF Branch Signal API (https://api-fif.kepiai.co/docs/).
 *
 * The OpenAPI spec types most payloads as a bare `object`, so these are written from live responses.
 * Items marked ASSUMED were empty in every response seen so far and are not described by the spec;
 * they follow the field names of the single-file prototype and must be checked once that data exists. */

export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'none';
export type Channel = 'google' | 'instagram';
export type SourceFilter = 'all' | Channel;
export type PeriodFilter = 'all' | '90' | '180' | '365';

export interface ApiContext {
  filters: { branch: string | null; date_from: string | null; date_to: string | null; source: string };
  as_of: string;
  taxonomy_version?: string;
  scoring_version?: string;
  classifier_version?: string;
  warnings: string[];
}

/* ---------- /v1/meta ---------- */
export interface MetaSource {
  id: Channel;
  label: string;
  last_sync: string | null;
  rows: number;
  status: string;
  universe?: number;
  coverage_pct?: number;
  handle?: string;
  posts?: number;
}

export interface MetaBranch {
  id: string;
  name: string;
  city: string;
  province: string | null;
  place_id: string | null;
  active_contracts: number | null;
}

export interface MetaResponse {
  as_of: string;
  generated_at: string;
  sources: MetaSource[];
  date_bounds: { min: string; max: string } | null;
  branches: MetaBranch[];
  versions: { taxonomy: string; scoring: string; classifier: string };
}

/* ---------- /v1/config ---------- */
export interface ConfigTopic {
  topic_id: string;
  label: string;
  severity: number;
  channels: Channel[];
  keyword_count: number;
}

export interface ConfigResponse {
  taxonomy_version: string;
  severity_ladder: { level: number; label: string; description?: string }[];
  topics: ConfigTopic[];
  scoring: {
    google: {
      severity_x: number;
      rating: Record<string, number>;
      recency_max: number;
      recency_decay_per_30d: number;
      reach: { local_guide: number; lifetime_reviews_div: number; lifetime_reviews_max: number; photo: number };
      unanswered: number;
    };
    instagram: Record<string, number>;
  };
  priority_thresholds: Record<Channel, { critical: number; high: number; medium: number }>;
  known_limits: { id: string; applies_to: Channel[]; text: string }[];
}

/* ---------- /v1/pages/overview ---------- */
export interface OverviewResponse {
  context: ApiContext;
  headline: {
    items_read: number;
    open_cases: number;
    by_priority: Partial<Record<'critical' | 'high' | 'medium' | 'low', number>>;
    conduct_level: number;
    never_answered: number;
    complaint_rate_pct: number;
    oldest_unanswered_days: number;
    /* Added by the API on 24 Sep 2026, still absent from the spec, so these stay optional.
     * complaints and complaint_count carry the same number; complaints is the newer name.
     * never_answered_by_source is also flattened into never_answered_google / _instagram, which we do not read. */
    complaints?: number;
    complaint_count?: number;
    never_answered_by_source?: Partial<Record<Channel, number>>;
  };
  oldest_unanswered: { case_id: string; source: Channel; label: string; stars: number | null; excerpt: string; age_days: number }[];
  trend_monthly: { month: string; reviews: number; avg_rating: number | null; google_complaints: number; instagram_complaints: number }[];
  branch_risk: { branch: string; branch_id: string; risk_score: number; conduct_flags: number; critical_high: number; complaint_rate_pct: number }[];
  channel_severity_mix: { source: Channel; complaints: number; by_severity: Record<string, number> }[];
}

/* ---------- /v1/pages/branches ---------- */
export interface BranchRow {
  branch: string;
  branch_id: string;
  city: string;
  province: string | null;
  avg_rating: number | null;
  complaints: number;
  rating_mix: Record<string, number>;
  risk_score: number;
  coverage_pct: number;
  reviews_read: number;
  reviews_universe: number;
  conduct_flags: number;
  critical_high: number;
  new_account_pct: number;
  rating_only_pct: number;
  active_contracts: number | null;
  oldest_open_days: number;
  complaint_rate_pct: number;
  google_public_score: number | null;
  owner_reply_rate_pct: number;
  complaints_per_1k_contracts: number | null;
}

export interface BranchesResponse {
  context: ApiContext;
  summary: {
    highest_risk: { branch: string; risk_score: number } | null;
    lowest_risk: { branch: string; risk_score: number } | null;
    coverage_pct: number;
    complaint_rate_spread_pts: number;
  };
  rows: BranchRow[];
}

/* ---------- /v1/pages/complaints ---------- */
export interface ComplaintTopic {
  topic_id: string;
  label: string;
  severity: number;
  google: number;
  instagram: number;
  answered: number;
  last_seen: string | null;
  channel_presence: string;
}

export interface ComplaintsResponse {
  context: ApiContext;
  topics: ComplaintTopic[];
  topic_by_branch: { branches: string[]; matrix: { topic_id: string; counts: number[] }[] };
  sentiment_mix: { positive: number; neutral: number; negative: number; no_text_or_reaction: number };
  terms_negative: { term: string; n: number }[];
  praise_drivers: { topic_id: string; label: string; n: number; by_branch: Record<string, number> }[];
}

/* ---------- /v1/pages/integrity ---------- */
/** ASSUMED shape. */
export interface CollectionDay { branch: string; date: string; n: number; avg: number; notext: number }
/** ASSUMED shape. */
export interface DuplicateSet { text: string; users: string[]; n: number }

export interface IntegrityResponse {
  context: ApiContext;
  google: {
    five_star_pct: number;
    one_star_pct: number;
    no_text_pct: number;
    first_time_account_pct: number;
    office_hours_pct: number;
    posting_hours: number[];
    collection_days: CollectionDay[];
    repeat_reviewers: number;
    spam_count: number;
    duplicate_count: number;
    suspicious_accounts: number;
    flagged_reviews: unknown[];
  };
  instagram: {
    threads_read: number;
    duplicate_sets: DuplicateSet[];
    duplicate_count: number;
    accounts_involved: number;
    reaction_only_comments: number;
    spam_count: number;
    suspicious_accounts: number;
  };
}

/* ---------- /v1/pages/social ---------- */
/** ASSUMED shape. */
export interface SocialReply { user: string; text: string; ts: string; is_brand: boolean }
/** ASSUMED shape. */
export interface SocialThread {
  id: string;
  user: string;
  text: string;
  ts: string;
  likes: number;
  declared: number;
  captured: number;
  truncated: boolean;
  brand_replied: boolean;
  latency_h: number | null;
  pile_on: boolean;
  topics: string[];
  is_complaint: boolean;
  criticality: number;
  priority: Priority;
  replies: SocialReply[];
}

export interface SocialResponse {
  context: ApiContext;
  summary: {
    threads: number;
    root_comments: number;
    replies_captured: number;
    replies_declared: number;
    complaint_threads: number;
    conduct_level: number;
    brand_reply_rate_pct: number;
    unanswered: number;
    median_first_response_h: number | null;
    max_first_response_h: number | null;
    truncated_threads: number;
    reattached_brand_replies: number;
    pile_ons: number;
  };
  threads: SocialThread[];
  response_funnel: { complaints: number; answered: number; no_followup: number };
  /** ASSUMED shape. */
  topics: { topic: string; sev: number; n: number; answered: number; last: string }[];
  /** ASSUMED shape. */
  weekly: { week: string; n: number; comp: number }[];
}

/* ---------- /v1/cases ---------- */
export interface CaseItem {
  case_id: string;
  source: Channel;
  channel_ref: { branch_id?: string; branch?: string; place_id?: string };
  posted_at: string;
  age_days: number;
  stars: number | null;
  text: string;
  topic_ids: string[];
  severity: number;
  sentiment: string;
  criticality: number | null;
  /** How criticality was reached. Sent by the API but not described in the spec. */
  score_components?: Partial<Record<'severity' | 'rating' | 'recency' | 'reach' | 'unanswered', number>>;
  priority: Priority;
  author: { display: string | null; lifetime_reviews: number | null; local_guide: boolean | null; has_photo: boolean | null };
  brand_replied: boolean;
  first_response_h: number | null;
  permalink: string | null;
  workflow: { status: string; owner: string | null; updated_at: string | null };
}

export interface CasesResponse {
  context: ApiContext;
  page: { limit: number; offset: number; total: number; sort: string; order: string };
  facets: {
    by_status: Record<string, number>;
    by_severity: Record<string, number>;
    by_source: Partial<Record<Channel, number>>;
    by_topic: Record<string, number>;
  };
  items: CaseItem[];
}

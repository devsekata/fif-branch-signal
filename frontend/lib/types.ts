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

/* ---------- /v1/areas/branches ---------- */
export interface AreaBranchRow {
  branch_id: string;
  branch: string;
  city: string;
  address: string | null;
  /** Null when the address names no kecamatan held in the master tables. */
  kecamatan_id: number | null;
  kecamatan: string | null;
  kabkota_id: number | null;
  kabkota: string | null;
  provinsi_id: number | null;
  provinsi: string | null;
  placed_by: 'address' | null;
  /** The kecamatan the address names, kept even when the master tables do not hold it. */
  stated_kecamatan: string | null;
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  never_answered: number;
  sentiment_score: number | null;
}

export interface AreaBranchesResponse {
  context: ApiContext;
  summary: { branches: number; placed: number; kecamatan: number };
  rows: AreaBranchRow[];
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
/** The API sends `accounts` and `count`; the prototype called them `users` and `n`. Both are read. */
export interface DuplicateSet { text: string; users?: string[]; n?: number; accounts?: string[]; count?: number; window_minutes?: number }

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
/* The API has renamed these fields since the prototype (`user` became `author`, `ts` became
 * `posted_at`, and so on). `lib/social.ts` reads either spelling and hands the views this shape. */
export interface SocialReply { user: string; text: string; ts: string; is_brand: boolean }
export interface SocialThread {
  id: string;
  user: string;
  text: string;
  ts: string;
  age: number;
  likes: number;
  declared: number;
  captured: number;
  truncated: boolean;
  brand_replied: boolean;
  latency_h: number | null;
  pile_on: boolean;
  followups_after_brand: number;
  topics: string[];
  severity: number;
  sentiment: string;
  is_complaint: boolean;
  criticality: number;
  priority: Priority;
  url: string | null;
  replies: SocialReply[];
}

export interface SocialTopic { topic: string; sev: number; n: number; answered: number; last: string | null }

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
  topics: SocialTopic[];
  weekly: { week: string; n: number; comp: number }[];
}

/* ---------- /v1/cases ---------- */
export interface CaseItem {
  case_id: string;
  source: Channel;
  channel_ref: { branch_id?: string; branch?: string; place_id?: string; post_id?: string; thread_id?: string; account_handle?: string };
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

/* ---------- POST /v1/jobs ---------- */
export type JobType = 'google-reviews-ingest' | 'instagram-comments-ingest';
export type JobStatus = 'pending' | 'processing' | 'finished' | 'failed';

export interface CreateJobRequest {
  job_type: JobType;
  /** Worker parameters. The spec types this as a free-form object and documents one example per job type. */
  payload: Record<string, unknown>;
  max_attempts?: number;
  run_at?: string;
}

export interface JobQueueItem {
  id: string;
  jobType: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  createdAt: string;
  /** Returned by the API on 24 Sep 2026 but absent from the spec's JobQueueItem schema. */
  startedAt?: string | null;
  finishedAt: string | null;
  error: string | null;
}

/** 422 body. `detail` is free-form, so it is rendered as JSON rather than parsed. */
export interface ApiError {
  error: { code: string; message: string; detail?: unknown };
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

/* ---------- /v1/signal/* ---------- */
/** Positive, neutral, negative and the 0–100 score built on them. `score` is null when nothing was read. */
/** `irrelevant` is the fourth category: items the relevance classifier marked irrelevant or spam, kept out of `total` and `score`. */
export interface Mix { good: number; neutral: number; bad: number; total: number; score: number | null; irrelevant: number }

export interface SignalMonth extends Mix {
  month: string;
  reviews: number;
  google_complaints: number;
  instagram_complaints: number;
  avg_rating: number | null;
}

export interface SignalOverviewResponse {
  context: ApiContext;
  min_n: number;
  mix: Mix;
  mix_by_source: Record<Channel, Mix>;
  neutral_rating_only: number;
  headline: {
    items_read: number;
    complaints: number;
    complaint_rate_pct: number;
    open_cases: number;
    conduct_level: number;
    never_answered: number;
    oldest_unanswered_days: number;
    by_priority: Record<'critical' | 'high' | 'medium' | 'low', number>;
  };
  longest_unanswered: { case_id: string; source: Channel; label: string; stars: number | null; excerpt: string; age_days: number }[];
  monthly: SignalMonth[];
  severity_mix: { source: Channel; complaints: number; by_severity: Record<string, number> }[];
  collection: { reviews: number; five_star_pct: number; one_star_pct: number; no_text_pct: number; first_time_account_pct: number };
}

/* ---------- GET /v1/pages/listings ---------- */
export type ListingStatus = 'matched' | 'duplicate' | 'unrecognised' | 'no_listing';

export interface ListingRow {
  /** Null on `no_listing` by definition. */
  listing_id: string | null;
  name: string;
  city: string | null;
  status: ListingStatus;
  /** The master's code. Null on `unrecognised` by definition. */
  branch_code: string | null;
  master_name: string | null;
  province: string | null;
  kota: string | null;
  kecamatan: string | null;
  reviews: number;
  rating: number | null;
  /** Null is unknown, not false. */
  managed: boolean | null;
  /** What fired the flag. Empty on matched rows only. */
  evidence: string[];
  twin_of: string | null;
  url: string | null;
  seeded: boolean;
}

export interface ListingsResponse {
  context: ApiContext;
  meta: {
    master_is_simulated: boolean;
    master_note: string;
    seeded_note: string;
    name_threshold: number;
    distance_threshold_m: number;
    signals_available: string[];
    signals_missing: string[];
  };
  counts: Record<ListingStatus, number>;
  summary: { listings_found: number; master_entries: number; reviews_on_listings: number; reviews_off_master: number; reviews_off_master_pct: number };
  rows: ListingRow[];
}

export interface SignalBranch extends Mix {
  branch_id: string;
  branch: string;
  city: string;
  address: string | null;
  province: string | null;
  kota: string | null;
  kecamatan: string | null;
  stated_kecamatan: string | null;
  /** False when the area names come from Google's place data rather than the master tables, which hold no boundary for them. */
  in_master: boolean;
  lat: number | null;
  lng: number | null;
  postal_code: string | null;
  google_score: number | null;
  reviews_universe: number | null;
  reviews_read: number;
  coverage_pct: number | null;
  enough: boolean;
  /** Position among the scored branches of the response, best first. */
  rank: number | null;
  unanswered: number;
  avg_rating: number | null;
  complaints: number;
  complaint_rate_pct: number;
  critical_high: number;
  conduct_flags: number;
  oldest_open_days: number;
  rating_only_pct: number;
  new_account_pct: number;
  risk_score: number;
  rating_mix: [number, number, number, number, number];
}

export interface SignalArea extends Mix {
  name: string;
  province: string | null;
  kota: string | null;
  enough: boolean;
  branches: number;
  unanswered: number;
  in_master: boolean;
}

export interface SignalBranchesResponse {
  context: ApiContext;
  min_n: number;
  branches: SignalBranch[];
  areas: Record<'province' | 'kota' | 'kecamatan', SignalArea[]>;
}

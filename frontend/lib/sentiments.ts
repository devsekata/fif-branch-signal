'use client';

import { post, refreshSekata, sekata, SekataError, useSekata, type SekataResult } from '@/lib/sekata';

/* Brand monitoring and post analysis, served by the Sekata Insight Connector.
 *
 * The screen is called "Post Sentiments" but nothing here measures sentiment polarity. The
 * connector has no such column; what it stores is complaint detection — whether a post carries
 * a complaint, how intense it is, and a short category. Kept that way on purpose, because a
 * field named sentiment that holds something else is how a dashboard starts lying.
 *
 * Google Sheets is deliberately absent. The connector can mirror each brand's analyses into a
 * client spreadsheet (`sheet_url`); this screen never sets one and reads the database back. */

/** `intensity` in the connector, shown as Severity. `none` is a real value, not a null. */
export type Intensity = 'none' | 'low' | 'medium' | 'high';
export type CandidateState = 'pending' | 'promoted' | 'dismissed' | 'expired';
export type AnalysisStatus = 'pending' | 'scraping' | 'analyzing' | 'completed' | 'failed';
export type MediaType = 'Image' | 'Video' | 'Sidecar';

export interface Brand {
  /** null until the connector has saved it. */
  id: number | null;
  name: string;
  /** Alternative spellings, abbreviations and the typos customers actually type. */
  aliases: string[];
  /** What counts as a complaint for this brand. Judged against, not searched for. */
  watchFor: string;
  /** What to search Instagram for. Decides what gets found, not what counts. */
  searchKeyword: string;
  /** The connector caps this at 50 and defaults to 10. */
  searchMaxPosts: number;
  autoSearch: boolean;
  /** Jakarta wall clock, HH:MM. */
  searchTime: string;
  active: boolean;
  createdAt: string;
  lastSearchAt: string | null;
}

/** A post the keyword search surfaced, waiting on a person to judge it. Candidates are
 *  inputs; analyses are outputs. Nothing is analysed automatically. */
export interface Candidate {
  id: number;
  brandId: number;
  url: string;
  mediaType: MediaType | null;
  username: string;
  caption: string;
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  postedAt: string | null;
  /** manual or scheduled. */
  discoveredVia: string;
  state: CandidateState;
}

export interface Analysis {
  id: number;
  brandId: number;
  url: string;
  mediaType: MediaType | null;
  status: AnalysisStatus;
  /** Whether a complaint was found. This is what the recent-complaints count counts. */
  flagFound: boolean | null;
  intensity: Intensity | null;
  category: string;
  summary: string;
  transcript: string;
  keywords: string[];
  /** Decided by a word-boundary regex over the brand name and aliases, not by the model. */
  captionMentions: boolean;
  /** Decided by the model, from what is seen or heard in the media itself. */
  contentMentions: boolean;
  errorMessage: string;
  createdAt: string | null;
  analysedAt: string | null;
}

/* ---------- connector rows ---------- */

interface BrandRow {
  id: number; brand_name: string; aliases: string[] | null; watch_for: string;
  search_keyword: string | null; search_max_posts: number | null;
  is_search_scheduler_active: boolean | null; search_schedule_time: string | null;
  is_active: boolean; created_at: string | null; last_search_run_at?: string | null;
}

interface CandidateRow {
  id: number; brand_config_id: number; source_url: string; media_type: string | null;
  username: string | null; caption: string | null; thumbnail_url: string | null;
  like_count: number | null; comment_count: number | null; posted_at: string | null;
  discovered_via: string | null; status: CandidateState;
}

interface AnalysisRow {
  id: number; brand_config_id: number; source_url: string; media_type: string | null;
  status: AnalysisStatus; flag_found: boolean | null; intensity: string | null;
  category: string | null; summary: string | null; transcript: string | null;
  keywords_detected: string[] | null; caption_mentions_brand: boolean | null;
  content_mentions_brand: boolean | null; error_message: string | null;
  created_at: string | null; analyzed_at: string | null;
}

const toBrand = (r: BrandRow): Brand => ({
  id: r.id,
  name: r.brand_name,
  aliases: r.aliases ?? [],
  watchFor: r.watch_for,
  searchKeyword: r.search_keyword ?? '',
  searchMaxPosts: r.search_max_posts ?? 10,
  autoSearch: !!r.is_search_scheduler_active,
  searchTime: (r.search_schedule_time ?? '03:00').slice(0, 5),
  active: r.is_active,
  createdAt: (r.created_at ?? '').slice(0, 10),
  lastSearchAt: r.last_search_run_at ?? null,
});

const toCandidate = (r: CandidateRow): Candidate => ({
  id: r.id,
  brandId: r.brand_config_id,
  url: r.source_url,
  mediaType: r.media_type as MediaType | null,
  username: r.username ?? '',
  caption: r.caption ?? '',
  thumbnailUrl: r.thumbnail_url,
  likeCount: r.like_count ?? 0,
  commentCount: r.comment_count ?? 0,
  postedAt: r.posted_at,
  discoveredVia: r.discovered_via ?? 'manual',
  state: r.status,
});

const INTENSITIES: Intensity[] = ['none', 'low', 'medium', 'high'];

const toAnalysis = (r: AnalysisRow): Analysis => {
  const i = (r.intensity ?? '').toLowerCase() as Intensity;
  return {
    id: r.id,
    brandId: r.brand_config_id,
    url: r.source_url,
    mediaType: r.media_type as MediaType | null,
    status: r.status,
    flagFound: r.flag_found,
    intensity: INTENSITIES.includes(i) ? i : null,
    category: r.category ?? '',
    summary: r.summary ?? '',
    transcript: r.transcript ?? '',
    keywords: r.keywords_detected ?? [],
    captionMentions: !!r.caption_mentions_brand,
    contentMentions: !!r.content_mentions_brand,
    errorMessage: r.error_message ?? '',
    createdAt: r.created_at,
    analysedAt: r.analyzed_at,
  };
};

function mapped<R, T>(res: SekataResult<R>, fn: (r: R) => T): SekataResult<T> {
  return { ...res, data: res.data === undefined ? undefined : fn(res.data) };
}

/* ---------- reads ---------- */

/** Every brand, active or not; the connector's default would hide the inactive ones. */
export const useBrands = () =>
  mapped(useSekata<BrandRow[]>('/api/brand-configs?active_only=false'), (rows) => rows.map(toBrand));

export interface BrandStats { pending: number; recentComplaints: number }

export const useBrandStats = () =>
  mapped(
    useSekata<{ stats: Record<string, { pending_candidates: number; recent_complaints: number }>; recent_complaints_days: number }>('/api/brand-configs/stats'),
    (r) => ({
      days: r.recent_complaints_days,
      of: (id: number | null): BrandStats => {
        const s = id === null ? undefined : r.stats[String(id)];
        return { pending: s?.pending_candidates ?? 0, recentComplaints: s?.recent_complaints ?? 0 };
      },
    }),
  );

/** The connector pages candidates at 50 at most; newest first, all states at once. */
export const CANDIDATE_LIMIT = 50;

export const useCandidates = (brandId: number | null) =>
  mapped(
    useSekata<{ candidates: CandidateRow[] }>(brandId === null ? null
      : `/api/content-candidates?brand_config_id=${brandId}&status=all&limit=${CANDIDATE_LIMIT}`),
    (r) => r.candidates.map(toCandidate),
  );

export const useAnalyses = (brandId: number | null) =>
  mapped(
    useSekata<{ analyses: AnalysisRow[] }>(brandId === null ? null : `/api/content-analyses?brand_config_id=${brandId}`),
    (r) => r.analyses.map(toAnalysis),
  );

/* ---------- writes ---------- */

export async function saveBrand(b: Brand) {
  const body = {
    brand_name: b.name,
    aliases: b.aliases,
    watch_for: b.watchFor,
    search_keyword: b.searchKeyword,
    search_max_posts: b.searchMaxPosts,
    is_search_scheduler_active: b.autoSearch && !!b.searchKeyword,
    search_schedule_time: b.searchTime,
  };
  if (b.id === null) await post('/api/brand-configs', body);
  else await sekata(`/api/brand-configs/${b.id}`, { method: 'PUT', body: JSON.stringify(body) });
  refreshSekata();
}

/** The connector's DELETE is a soft delete that only ever deactivates; reactivating is a PUT. */
export async function setBrandActive(id: number, active: boolean) {
  if (active) await sekata(`/api/brand-configs/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: true }) });
  else await sekata(`/api/brand-configs/${id}`, { method: 'DELETE' });
  refreshSekata();
}

export async function dismissCandidate(id: number) {
  await post(`/api/content-candidates/${id}/dismiss`);
  refreshSekata();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs the keyword search and waits for it. The connector keeps search jobs in one worker's
 *  memory, so a 404 on the status route means another worker answered, not that it failed. */
export async function searchNow(brandId: number): Promise<string> {
  const { job_id } = await post<{ job_id: string }>(`/api/brand-configs/${brandId}/search-now`);
  for (let i = 0; i < 100; i++) {
    await wait(3000);
    try {
      const s = await sekata<{ status: string; result: string | null; error: string | null }>(`/api/brand-configs/search-status/${job_id}`);
      if (s.status === 'done') { refreshSekata(); return s.result ?? 'Search finished.'; }
      if (s.status === 'failed') { refreshSekata(); throw new Error(s.error ?? 'Search failed.'); }
    } catch (e) {
      if (e instanceof SekataError && e.status === 404) { refreshSekata(); return 'Search started; results appear as they land.'; }
      throw e;
    }
  }
  refreshSekata();
  return 'Search is still running; results appear as they land.';
}

/** Starts an analysis and follows it through the database row rather than the job, because
 *  the job lives in one worker's memory. A video takes minutes; the history table refreshes
 *  on every tick so the row walks through scraping and analyzing on screen. */
export async function analysePost(brandId: number, url: string): Promise<Analysis> {
  const started = await post<{ cached?: boolean; analysis?: AnalysisRow; job_id?: string }>(
    '/api/content-analysis/analyze', { brand_config_id: brandId, source_url: url.trim() });
  if (started.cached && started.analysis) { refreshSekata(); return toAnalysis(started.analysis); }

  const q = `brand_config_id=${brandId}&source_url=${encodeURIComponent(url.trim())}`;
  for (let i = 0; i < 150; i++) {
    await wait(4000);
    const s = await sekata<{ status: string; row?: AnalysisRow; error?: string | null }>(`/api/content-analysis/row-status?${q}`);
    refreshSekata();
    if (s.status === 'completed' && s.row) return toAnalysis(s.row);
    if (s.status === 'failed') throw new Error(s.error ?? 'Analysis failed.');
  }
  throw new Error('Still running after ten minutes. It will show in the history when it finishes.');
}

/** Promote only flips the candidate's state; the analysis is a separate call, same as the
 *  connector's own screen. A failed analysis still leaves the candidate promoted. */
export async function analyseCandidate(c: Candidate) {
  await post(`/api/content-candidates/${c.id}/promote`);
  refreshSekata();
  return analysePost(c.brandId, c.url);
}

/* ---------- helpers ---------- */

export const newBrand = (): Brand => ({
  id: null,
  name: '', aliases: [], watchFor: '', searchKeyword: '',
  searchMaxPosts: 10, autoSearch: false, searchTime: '03:00',
  active: true, createdAt: '', lastSearchAt: null,
});

export const INTENSITY_LABEL: Record<Intensity, string> = {
  none: 'None', low: 'Low', medium: 'Medium', high: 'High',
};

/** The connector's four-state badge, built from two flags of different provenance. */
export function mentionLabel(caption: boolean, content: boolean): { text: string; tone: 'ok' | 'info' | 'warn' } {
  if (caption && content) return { text: 'Caption + content', tone: 'ok' };
  if (content) return { text: 'In content', tone: 'ok' };
  if (caption) return { text: 'Caption only', tone: 'info' };
  return { text: 'Not mentioned', tone: 'warn' };
}

/* The connector scrapes whatever URL it is given, so the shape is checked here before an
 * Apify call is spent: a single post, reel or tv link — a bare username would pull a feed. */
const POST_URL = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?/;

export function readPostUrl(raw: string): { ok: boolean; note: string } {
  const url = raw.trim();
  if (!url) return { ok: false, note: 'Paste the link to one Instagram post or reel.' };
  if (!/^https?:\/\//i.test(url)) return { ok: false, note: 'That does not look like a URL.' };
  if (!POST_URL.test(url)) {
    return { ok: false, note: 'Only a single post, reel or tv link works. A profile URL would pull the whole feed.' };
  }
  const id = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return { ok: true, note: `Ready to analyse ${id?.[1]} ${id?.[2]}.` };
}

/** Jakarta wall clock for a connector timestamp, which is UTC. */
export function wib(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 16);
}

import type { CreateJobRequest } from './types';

/* Payload builders for POST /v1/jobs.
 *
 * The spec types `payload` as a free-form object and documents one example per job type,
 * so the shapes below follow those examples exactly. */

export interface TargetInfo {
  /** What goes into payload.target. */
  target: string;
  /** Extracted place id, when the URL carried one. */
  cid?: string;
  /** Shown under the field so the operator can see what will actually be sent. */
  note: string;
  ok: boolean;
}

/** Google Maps place URLs carry the place id as `!1s0x<ftid>:0x<cid>`; the spec's example
 *  uses the short `?cid=<decimal>` form instead. The decimal exceeds Number.MAX_SAFE_INTEGER,
 *  so the conversion goes through BigInt. A URL we cannot read is passed through untouched. */
export function googleTarget(raw: string): TargetInfo {
  const url = raw.trim();
  if (!url) return { target: '', note: 'Paste the Google Maps URL of the branch.', ok: false };
  if (!/^https?:\/\//i.test(url)) return { target: url, note: 'That does not look like a URL.', ok: false };

  const direct = url.match(/[?&]cid=(\d+)/);
  if (direct) return { target: url, cid: direct[1], note: `Already a CID link — place ${direct[1]}.`, ok: true };

  const ftid = url.match(/!1s(0x[0-9a-f]+):(0x[0-9a-f]+)/i);
  if (ftid) {
    const cid = BigInt(ftid[2]).toString();
    return {
      target: `https://maps.google.com/?cid=${cid}`,
      cid,
      note: `Place id read from the URL and sent as https://maps.google.com/?cid=${cid}`,
      ok: true,
    };
  }

  if (/google\.[a-z.]+\/maps/i.test(url)) {
    return {
      target: url,
      note: 'No place id in this URL. Open the branch from the results list first, then copy the URL — it should contain a "!1s0x…:0x…" part. Sending as-is.',
      ok: true,
    };
  }
  return { target: url, note: 'Not recognised as a Google Maps URL. Sending as-is.', ok: true };
}

export function instagramTarget(raw: string): TargetInfo {
  const url = raw.trim();
  if (!url) return { target: '', note: 'Paste the Instagram profile URL, e.g. https://www.instagram.com/fifclub', ok: false };
  if (!/^https?:\/\//i.test(url)) return { target: url, note: 'That does not look like a URL.', ok: false };
  if (!/instagram\.com/i.test(url)) return { target: url, note: 'Not an instagram.com URL. Sending as-is.', ok: true };

  const post = url.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/i);
  if (post) return { target: url, note: `Single post ${post[1]}. Only this post's comments will be read.`, ok: true };

  const profile = url.match(/instagram\.com\/([\w.]+)\/?(?:\?|$)/i);
  if (profile) return { target: url, note: `Profile @${profile[1]}. The worker decides which posts to walk.`, ok: true };
  return { target: url, note: 'Sending as-is.', ok: true };
}

/** Defaults copied from the spec's instagramJob example. */
export const IG_DEFAULTS = {
  limitPerSource: 100,
  maxRepliesPerComment: 20,
  rawData: false,
  repliesDepthLimit: 3,
  scrapeReplies: true,
};

export function buildGoogleJob(target: string, start: string, end: string): CreateJobRequest {
  const payload: Record<string, unknown> = { target };
  if (start) payload.start = start;
  if (end) payload.end = end;
  return { job_type: 'google-reviews-ingest', payload, max_attempts: 3 };
}

export function buildInstagramJob(url: string): CreateJobRequest {
  return { job_type: 'instagram-comments-ingest', payload: { urls: [url], ...IG_DEFAULTS }, max_attempts: 3 };
}

/** YYYY-MM-DD, and start must not be after end. */
export function dateProblem(start: string, end: string): string | null {
  const shape = /^\d{4}-\d{2}-\d{2}$/;
  if (start && !shape.test(start)) return 'Start date must be YYYY-MM-DD.';
  if (end && !shape.test(end)) return 'End date must be YYYY-MM-DD.';
  if (start && !Number.isFinite(Date.parse(start))) return 'Start date is not a real date.';
  if (end && !Number.isFinite(Date.parse(end))) return 'End date is not a real date.';
  if (start && end && Date.parse(start) > Date.parse(end)) return 'Start date is after the end date.';
  return null;
}

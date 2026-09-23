import { useEffect, useState } from 'react';

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api-fif.kepiai.co').replace(/\/+$/, '');

export type Params = Record<string, string | number | undefined>;

/** Empty and undefined params are left off, so the default filters send only `source=all`. */
export function apiUrl(path: string, params: Params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const qs = q.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

/* In-flight and recent requests are shared, so moving between pages doesn't refetch what is still fresh. */
const TTL = 60_000;
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

function getJson<T>(url: string, fresh: boolean): Promise<T> {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.promise as Promise<T>;
  const promise = fetch(url, { headers: { accept: 'application/json' } }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  });
  promise.catch(() => cache.delete(url));
  cache.set(url, { at: Date.now(), promise });
  return promise as Promise<T>;
}

export interface ApiResult<T> {
  /** Latest payload; while a new request is in flight this is still the previous one. */
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  retry: () => void;
}

/** Fetch an API path; pass `null` to skip. Re-fetches whenever the resulting URL changes. */
export function useApi<T>(path: string | null, params?: Params): ApiResult<T> {
  const url = path === null ? null : apiUrl(path, params);
  const [attempt, setAttempt] = useState(0);
  const key = `${url}#${attempt}`;
  const [res, setRes] = useState<{ key: string; data?: T; error?: string } | null>(null);

  useEffect(() => {
    if (url === null) return;
    let live = true;
    getJson<T>(url, attempt > 0).then(
      (data) => { if (live) setRes({ key, data }); },
      (e: Error) => { if (live) setRes({ key, error: `${e.message} — ${url}` }); },
    );
    return () => { live = false; };
  }, [url, attempt, key]);

  const settled = res?.key === key;
  return {
    data: res?.data,
    error: settled ? res?.error : undefined,
    loading: url !== null && !settled,
    retry: () => setAttempt((a) => a + 1),
  };
}

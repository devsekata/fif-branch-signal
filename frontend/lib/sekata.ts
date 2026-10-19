'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/* Client for the Sekata Insight Connector, reached through app/sekata/[...path]/route.ts.
 * That route signs in to the connector as a service account, so nothing here deals with
 * cookies or a sign-in; a failed sign-in comes back as a 502 with the reason. */

const PREFIX = '/sekata';

export class SekataError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SekataError';
  }
}

export async function sekata<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(PREFIX + path, {
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new SekataError(typeof msg === 'string' ? msg : `${res.status} ${res.statusText}`, res.status);
  }
  return body as T;
}

export const post = <T>(path: string, body?: unknown) =>
  sekata<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

/* Mutations bump one version number and every mounted hook refetches. Coarse, but the
 * connector answers in milliseconds and the lists are short. */
let version = 0;
const subscribers = new Set<() => void>();

export function refreshSekata() {
  version += 1;
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export interface SekataResult<T> {
  data: T | undefined;
  error: string | undefined;
  status: number | undefined;
  loading: boolean;
}

/** GET a connector path; pass `null` to skip. */
export function useSekata<T>(path: string | null): SekataResult<T> {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const key = `${path}#${v}`;
  const [res, setRes] = useState<{ key: string; data?: T; error?: string; status?: number } | null>(null);

  useEffect(() => {
    if (path === null) return;
    let live = true;
    sekata<T>(path).then(
      (data) => { if (live) setRes({ key, data, status: 200 }); },
      (e: SekataError) => { if (live) setRes({ key, error: e.message, status: e.status }); },
    );
    return () => { live = false; };
  }, [path, key]);

  const settled = res?.key === key;
  /* Keep showing the previous payload while a refresh is in flight, so lists do not blink. */
  return {
    data: res?.data,
    error: settled ? res?.error : undefined,
    status: settled ? res?.status : undefined,
    loading: path !== null && !settled,
  };
}

/** Instagram CDN links refuse hotlinking and expire; the connector fetches them server-side. */
export const proxiedImage = (url: string | null) =>
  url ? `${PREFIX}/api/proxy_image?url=${encodeURIComponent(url)}` : null;

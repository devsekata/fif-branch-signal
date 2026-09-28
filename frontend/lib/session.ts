'use client';

import { useSyncExternalStore } from 'react';
import type { RoleId } from './caseflow';

/* Who is handling cases, kept in localStorage.
 *
 * There is no authentication to speak of: the API has no login route and no token, every
 * endpoint is open. This decides which role the dashboard acts as, nothing more, and a
 * determined person can change it from the console. Real access control belongs on the
 * server the day one exists. */

const KEY = 'fif.session';

export interface Session {
  email: string;
  role: RoleId;
  since: string;
}

const subscribers = new Set<() => void>();

/* useSyncExternalStore demands a stable snapshot, so the parsed value is cached against the
 * raw string and only rebuilt when the string itself changes. */
let rawCache: string | null = null;
let parsedCache: Session | null = null;

function readRaw(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** The stored session, or null. Safe to call outside React. */
export function readSession(): Session | null {
  const raw = readRaw();
  if (raw !== rawCache) {
    rawCache = raw;
    try {
      const v = raw ? (JSON.parse(raw) as Session) : null;
      parsedCache = v && typeof v.email === 'string' && v.role ? v : null;
    } catch { parsedCache = null; }
  }
  return parsedCache;
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  window.addEventListener('storage', fn);
  return () => { subscribers.delete(fn); window.removeEventListener('storage', fn); };
}

/** Null on the server and for the hydrating render; the real value from the first client render on. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, readSession, () => null);
}

export function signIn(email: string, role: RoleId) {
  const s: Session = { email: email.trim().toLowerCase(), role, since: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: the session just will not persist */ }
  subscribers.forEach((fn) => fn());
}

export function signOut() {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored to begin with */ }
  subscribers.forEach((fn) => fn());
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';

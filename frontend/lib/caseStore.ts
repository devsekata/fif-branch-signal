'use client';

import { useEffect, useState } from 'react';
import { newCaseState, type CaseState } from './caseflow';

/* Where case handling lives: a module-level map, so a case keeps its state while you move
 * between pages, and loses it on reload. Nothing is sent anywhere — /v1/cases is read-only
 * and the API has no route that accepts a reply. Swapping this file for real persistence
 * is the whole job once those endpoints exist. */

const store = new Map<string, CaseState>();
const subscribers = new Set<() => void>();

export const readCase = (id: string): CaseState => store.get(id) ?? newCaseState();

export function writeCase(id: string, next: CaseState) {
  store.set(id, next);
  subscribers.forEach((fn) => fn());
}

/** Re-renders the caller whenever any case changes. */
export function useCaseStore() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((v) => v + 1);
    subscribers.add(fn);
    return () => { subscribers.delete(fn); };
  }, []);
}

/** Cases that have been touched, for the counter on the queue. */
export const handledCount = () => store.size;

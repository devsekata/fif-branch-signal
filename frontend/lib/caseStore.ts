'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { newCaseState, type CaseState } from './caseflow';

/* Where case handling lives: a module-level map, so a case keeps its state while you move
 * between pages, and loses it on reload. Nothing is sent anywhere — /v1/cases is read-only
 * and the API has no route that accepts a reply. Swapping this file for real persistence
 * is the whole job once those endpoints exist.
 *
 * Subscriptions are per case id. A global notify meant every keystroke in the drawer
 * re-rendered all 138 rows of the queue behind it, which froze the tab. */

const store = new Map<string, CaseState>();
const subscribers = new Map<string, Set<() => void>>();

/** One shared value for every untouched case, so the snapshot is reference-stable. */
const EMPTY: CaseState = Object.freeze(newCaseState()) as CaseState;

export const readCase = (id: string): CaseState => store.get(id) ?? EMPTY;

export function writeCase(id: string, next: CaseState) {
  store.set(id, next);
  subscribers.get(id)?.forEach((fn) => fn());
}

/** Subscribes to one case only. */
export function useCase(id: string | undefined): CaseState {
  const subscribe = useCallback((fn: () => void) => {
    if (!id) return () => {};
    let set = subscribers.get(id);
    if (!set) { set = new Set(); subscribers.set(id, set); }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) subscribers.delete(id);
    };
  }, [id]);

  const snapshot = useCallback(() => (id ? readCase(id) : EMPTY), [id]);
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** Cases that have been touched, for a counter. */
export const handledCount = () => store.size;

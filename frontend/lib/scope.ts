import { useMemo } from 'react';
import type { Params } from './api';
import { useFilters, type Filters } from './filters';
import { page, type PageDef, type PageId } from './pages';
import { useReference } from './reference';
import { daysBefore } from './theme';

/** Which channels a page shows, given the topbar filters. */
export interface Scope {
  page: PageDef;
  branch: string;
  src: 'all' | 'google' | 'instagram';
  useG: boolean;
  useS: boolean;
}

export function makeScope(p: PageDef, f: Filters): Scope {
  const src = p.filters.includes('source') ? f.source : p.id === 'social' ? 'instagram' : 'google';
  return { page: p, branch: f.branch, src, useG: src !== 'instagram', useS: src !== 'google' };
}

/** Query params for a page endpoint. Only filters the page shows are sent, and "all" is left off. */
export function apiParams(p: PageDef, f: Filters, anchor: string | undefined): Params {
  const hasSource = p.filters.includes('source');
  const branchShown = p.filters.includes('branch') && !(hasSource && f.source === 'instagram');
  return {
    source: hasSource ? f.source : 'all',
    branch: branchShown && f.branch !== 'all' ? f.branch : undefined,
    from: p.filters.includes('period') && f.period !== 'all' ? daysBefore(anchor, Number(f.period)) : undefined,
  };
}

export function useScope(id: PageId) {
  const { filters } = useFilters();
  const anchor = useReference().meta?.date_bounds?.max;
  return useMemo(() => {
    const p = page(id);
    return { scope: makeScope(p, filters), params: apiParams(p, filters, anchor) };
  }, [id, filters, anchor]);
}

/* ---------- sortable tables ---------- */
export type SortDir = 'asc' | 'desc';
export type SortState<K extends string> = [K, SortDir];

export function sortRows<R, K extends keyof R & string>(rows: R[], [key, dir]: SortState<K>): R[] {
  return [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (dir === 'asc' ? 1 : -1));
}

export const nextSort = <K extends string>([key, dir]: SortState<K>, f: K): SortState<K> =>
  key === f ? [f, dir === 'asc' ? 'desc' : 'asc'] : [f, 'desc'];

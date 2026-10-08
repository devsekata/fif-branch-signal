'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PeriodFilter, SourceFilter } from './types';

export const LEVELS = ['province', 'kota', 'kecamatan', 'branch'] as const;
export type Level = (typeof LEVELS)[number];

/** One hierarchy selection; the deepest level set is the one that applies. `branch` holds a branch id, the rest hold names. */
export type ScopeSel = Record<Level, string | null>;
export const NO_SCOPE: ScopeSel = { province: null, kota: null, kecamatan: null, branch: null };

export interface Filters {
  scope: ScopeSel;
  period: PeriodFilter;
  source: SourceFilter;
}

const INITIAL: Filters = { scope: NO_SCOPE, period: 'all', source: 'all' };

interface FiltersValue {
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}

const FiltersContext = createContext<FiltersValue | null>(null);

/** Topbar filters live above the pages so they survive navigation, as in the single-file prototype. */
export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState(INITIAL);
  const value = useMemo<FiltersValue>(() => ({
    filters,
    setFilter: (key, v) => setFilters((f) => ({ ...f, [key]: v })),
  }), [filters]);
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used inside <FiltersProvider>');
  return ctx;
}

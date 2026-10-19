import { useMemo } from 'react';
import type { Params } from './api';
import { LEVELS, NO_SCOPE, useFilters, type Filters, type Level, type ScopeSel } from './filters';
import { page, type PageDef, type PageId } from './pages';
import { useReference, type BranchPlace } from './reference';
import { daysBefore } from './theme';

/* ---------- the scope hierarchy (fif_metric_spec.md §6.1) ---------- */
export type AreaLevel = Exclude<Level, 'branch'>;
export const LEVEL_LABEL: Record<Level, string> = { province: 'Province', kota: 'Kota / kabupaten', kecamatan: 'Kecamatan', branch: 'Branch' };

export interface Current { level: Level | 'all'; value: string | null }

/** The deepest level actually chosen. */
export function currentOf(sel: ScopeSel): Current {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const level = LEVELS[i];
    if (sel[level]) return { level, value: sel[level] };
  }
  return { level: 'all', value: null };
}

export const isScoped = (sel: ScopeSel) => LEVELS.some((l) => sel[l]);

/** Does a branch fall inside the scope? A branch missing from the area lookup is excluded from a set scope, never silently included. */
export function coversPlace(sel: ScopeSel, p: BranchPlace | undefined): boolean {
  if (!isScoped(sel)) return true;
  if (!p) return false;
  if (sel.branch) return p.id === sel.branch;
  return (!sel.province || p.province === sel.province)
    && (!sel.kota || p.kota === sel.kota)
    && (!sel.kecamatan || p.kecamatan === sel.kecamatan);
}

/** Choosing a level clears the levels below it and fills the ones above, so the trail reads correctly when picked from below. */
export function pickScope(level: Level | 'all', value: string | null, places: BranchPlace[]): ScopeSel {
  if (level === 'all' || !value) return NO_SCOPE;
  const sample = places.find((p) => (level === 'branch' ? p.id === value : p[level] === value));
  const sel: ScopeSel = { ...NO_SCOPE, [level]: value };
  if (sample) {
    if (level !== 'province') sel.province = sample.province;
    if (level === 'kecamatan' || level === 'branch') sel.kota = sample.kota;
    if (level === 'branch') sel.kecamatan = sample.kecamatan;
  }
  return sel;
}

export interface ScopeOption { value: string; label: string; sub: string }

/** Options for one field, each narrowed by the fields above it. */
export function scopeOptions(level: Level, sel: ScopeSel, places: BranchPlace[]): ScopeOption[] {
  const within = (p: BranchPlace, upTo: Level) =>
    (upTo === 'province' || !sel.province || p.province === sel.province)
    && (upTo === 'province' || upTo === 'kota' || !sel.kota || p.kota === sel.kota)
    && (upTo !== 'branch' || !sel.kecamatan || p.kecamatan === sel.kecamatan);
  if (level === 'branch')
    return places.filter((p) => within(p, 'branch'))
      .map((p) => ({ value: p.id, label: p.name, sub: p.kecamatan ?? p.kota ?? p.city }))
      .sort((a, b) => a.label.localeCompare(b.label));
  const seen = new Map<string, number>();
  for (const p of places) {
    const key = p[level];
    if (key && within(p, level)) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].sort(([a], [b]) => a.localeCompare(b))
    .map(([value, n]) => ({ value, label: value, sub: `${n} ${n === 1 ? 'branch' : 'branches'}` }));
}

/* ---------- what a page shows, given the topbar filters ---------- */
export interface View {
  page: PageDef;
  src: 'all' | 'google' | 'instagram';
  useG: boolean;
  useS: boolean;
  sel: ScopeSel;
  cur: Current;
  isSet: boolean;
  /** Name of the scope in words: an area name, or the branch's name. */
  scopeName: string | null;
  /** Area trail of the scope, outermost first. */
  trail: string[];
  /** Branches inside the scope. Everything when no scope is set. */
  places: BranchPlace[];
  /** First day of the period, or undefined for the full range. */
  from: string | undefined;
  /** Query params for /v1/signal/* and /v1/cases, which resolve the scope hierarchy themselves. */
  sig: Params;
  /** Query params for the page endpoints, which know a single branch and nothing wider. */
  params: Params;
}

export function sourceOf(p: PageDef, f: Filters): View['src'] {
  return p.filters.includes('source') ? f.source : p.id === 'social' ? 'instagram' : 'google';
}

/** A selection as the API takes it. */
export const scopeParams = (sel: ScopeSel): Params => {
  const cur = currentOf(sel);
  return cur.level === 'all' ? {} : { scope_level: cur.level, scope_value: cur.value ?? undefined };
};

export function useView(id: PageId, branchId?: string): View {
  const { filters } = useFilters();
  const { meta, places: allPlaces, place } = useReference();
  const anchor = meta?.date_bounds?.max;

  return useMemo(() => {
    const p = page(id);
    const src = sourceOf(p, filters);
    const useG = src !== 'instagram';
    const useS = src !== 'google';
    /* The branch page is itself a scope; everywhere else the topbar decides. Instagram carries
     * no area, so a view of Instagram alone has no scope to speak of. */
    const sel = branchId ? pickScope('branch', branchId, allPlaces)
      : p.scope === 'none' || p.scope === 'off' || !useG ? NO_SCOPE : filters.scope;
    const cur = currentOf(sel);
    const isSet = cur.level !== 'all';
    const from = p.filters.includes('period') && filters.period !== 'all' ? daysBefore(anchor, Number(filters.period)) : undefined;
    const scopeName = cur.level === 'all' ? null : cur.level === 'branch' ? place(cur.value!)?.name ?? cur.value : cur.value;
    const trail = [sel.province, sel.kota, sel.kecamatan, sel.branch ? place(sel.branch)?.name ?? sel.branch : null].filter((x): x is string => !!x);
    const hasSource = p.filters.includes('source');
    return {
      page: p, src, useG, useS, sel, cur, isSet, scopeName, trail,
      places: isSet ? allPlaces.filter((b) => coversPlace(sel, b)) : allPlaces,
      from,
      sig: { ...scopeParams(sel), from, source: src },
      params: {
        source: hasSource ? filters.source : 'all',
        branch: sel.branch && useG ? sel.branch : undefined,
        from,
      },
    };
  }, [id, branchId, filters, anchor, allPlaces, place]);
}

/* ---------- sortable tables ---------- */
export type SortDir = 'asc' | 'desc';
export type SortState<K extends string> = [K, SortDir];

export function sortRows<R, K extends keyof R & string>(rows: R[], [key, dir]: SortState<K>): R[] {
  return [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (dir === 'asc' ? 1 : -1));
}

export const nextSort = <K extends string>([key, dir]: SortState<K>, f: K): SortState<K> =>
  key === f ? [f, dir === 'asc' ? 'desc' : 'asc'] : [f, 'desc'];

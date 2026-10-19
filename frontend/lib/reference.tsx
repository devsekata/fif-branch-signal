'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApi } from './api';
import type { ConfigResponse, MetaResponse, MetaSource, SignalBranchesResponse } from './types';

interface TopicInfo { label: string; severity: number }

/** Where a branch sits: its area trail, and its point on the map once the place has been scraped with its details. */
export interface BranchPlace {
  id: string;
  name: string;
  city: string;
  address: string | null;
  province: string | null;
  kota: string | null;
  kecamatan: string | null;
  stated_kecamatan: string | null;
  lat?: number | null;
  lng?: number | null;
  postal_code?: string | null;
}

interface Reference {
  meta: MetaResponse | undefined;
  config: ConfigResponse | undefined;
  /** Resolve a topic by id or by label; the API uses ids, older payloads used labels. */
  topic: (key: string) => TopicInfo | undefined;
  branchName: (id: string) => string;
  source: (id: MetaSource['id']) => MetaSource | undefined;
  /** Every branch with its area trail; empty until the lookup has loaded. */
  places: BranchPlace[];
  place: (id: string) => BranchPlace | undefined;
}

const ReferenceContext = createContext<Reference | null>(null);

/** Branch registry, area lookup, source sync state and the topic taxonomy, loaded once for every page. */
export function ReferenceProvider({ children }: { children: ReactNode }) {
  const meta = useApi<MetaResponse>('/v1/meta').data;
  const config = useApi<ConfigResponse>('/v1/config').data;
  /* The same placement the signal endpoints resolve a scope with, so the picker and the figures cannot disagree about where a branch is. */
  const areas = useApi<SignalBranchesResponse>('/v1/signal/branches').data;

  const value = useMemo<Reference>(() => {
    const topics = new Map<string, TopicInfo>();
    for (const t of config?.topics ?? []) {
      const info = { label: t.label, severity: t.severity };
      topics.set(t.topic_id, info);
      topics.set(t.label, info);
    }
    const places: BranchPlace[] = (areas?.branches ?? []).map((r) => ({
      id: r.branch_id, name: r.branch, city: r.city, address: r.address,
      province: r.province, kota: r.kota, kecamatan: r.kecamatan,
      stated_kecamatan: r.stated_kecamatan, lat: r.lat, lng: r.lng, postal_code: r.postal_code,
    }));
    const byId = new Map(places.map((p) => [p.id, p]));
    return {
      meta,
      config,
      topic: (key) => topics.get(key),
      branchName: (id) => byId.get(id)?.name ?? meta?.branches.find((b) => b.id === id)?.name ?? id,
      source: (id) => meta?.sources.find((s) => s.id === id),
      places,
      place: (id) => byId.get(id),
    };
  }, [meta, config, areas]);

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function useReference() {
  const ctx = useContext(ReferenceContext);
  if (!ctx) throw new Error('useReference must be used inside <ReferenceProvider>');
  return ctx;
}

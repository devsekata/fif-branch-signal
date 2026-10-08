'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApi } from './api';
import type { AreaBranchesResponse, ConfigResponse, MetaResponse, MetaSource } from './types';

interface TopicInfo { label: string; severity: number }

/** Where a branch sits. The three area names are null when its address names no kecamatan the master tables hold. */
export interface BranchPlace {
  id: string;
  name: string;
  city: string;
  address: string | null;
  province: string | null;
  kota: string | null;
  kecamatan: string | null;
  stated_kecamatan: string | null;
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
  const areas = useApi<AreaBranchesResponse>('/v1/areas/branches').data;

  const value = useMemo<Reference>(() => {
    const topics = new Map<string, TopicInfo>();
    for (const t of config?.topics ?? []) {
      const info = { label: t.label, severity: t.severity };
      topics.set(t.topic_id, info);
      topics.set(t.label, info);
    }
    const places: BranchPlace[] = (areas?.rows ?? []).map((r) => ({
      id: r.branch_id, name: r.branch, city: r.city, address: r.address,
      province: r.provinsi, kota: r.kabkota, kecamatan: r.kecamatan,
      stated_kecamatan: r.stated_kecamatan,
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

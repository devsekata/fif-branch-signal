'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApi } from './api';
import type { ConfigResponse, MetaResponse, MetaSource } from './types';

interface TopicInfo { label: string; severity: number }

interface Reference {
  meta: MetaResponse | undefined;
  config: ConfigResponse | undefined;
  /** Resolve a topic by id or by label; the API uses ids, older payloads used labels. */
  topic: (key: string) => TopicInfo | undefined;
  branchName: (id: string) => string;
  source: (id: MetaSource['id']) => MetaSource | undefined;
}

const ReferenceContext = createContext<Reference | null>(null);

/** Branch registry, source sync state and the topic taxonomy, loaded once for every page. */
export function ReferenceProvider({ children }: { children: ReactNode }) {
  const meta = useApi<MetaResponse>('/v1/meta').data;
  const config = useApi<ConfigResponse>('/v1/config').data;

  const value = useMemo<Reference>(() => {
    const topics = new Map<string, TopicInfo>();
    for (const t of config?.topics ?? []) {
      const info = { label: t.label, severity: t.severity };
      topics.set(t.topic_id, info);
      topics.set(t.label, info);
    }
    return {
      meta,
      config,
      topic: (key) => topics.get(key),
      branchName: (id) => meta?.branches.find((b) => b.id === id)?.name ?? id,
      source: (id) => meta?.sources.find((s) => s.id === id),
    };
  }, [meta, config]);

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function useReference() {
  const ctx = useContext(ReferenceContext);
  if (!ctx) throw new Error('useReference must be used inside <ReferenceProvider>');
  return ctx;
}

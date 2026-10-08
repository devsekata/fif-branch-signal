import type { CaseItem, Channel, Priority } from './types';

/** A case flattened for display, sorting and the drawer. */
export interface CaseRow {
  id: string;
  priority: Priority;
  score: number;
  source: Channel;
  where: string;
  stars: number | null;
  date: string;
  age: number;
  text: string;
  topics: string[];
  who: string;
  meta: string;
  url: string | null;
  severity: number;
  sentiment: string;
  answered: boolean;
  /** Workflow status as the API last reported it. */
  status: string;
  /** "severity 60 · rating 20 · recency 14.3", for the score cell's tooltip. */
  breakdown: string;
  components: Record<string, number>;
}

export function toRow(c: CaseItem): CaseRow {
  const a = c.author;
  const meta = [a.lifetime_reviews != null ? `${a.lifetime_reviews} reviews` : null, a.local_guide ? 'Local Guide' : null].filter(Boolean).join(', ');
  const components = Object.fromEntries(
    Object.entries(c.score_components ?? {}).filter(([, v]) => typeof v === 'number'),
  ) as Record<string, number>;
  const breakdown = Object.entries(components)
    .filter(([, v]) => v)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  return {
    id: c.case_id, priority: c.priority, score: c.criticality ?? 0, source: c.source,
    where: c.channel_ref.branch ?? 'Official account', stars: c.stars, date: c.posted_at, age: c.age_days,
    text: c.text, topics: c.topic_ids, who: a.display ?? '—', meta, url: c.permalink,
    severity: c.severity, sentiment: c.sentiment, answered: c.brand_replied, status: c.workflow?.status ?? 'open',
    breakdown, components,
  };
}

import type { TrackId } from './caseflow';
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
  /** The handling track the API assigned; null when it sent none and the drawer has to work it out. */
  track: TrackId | null;
  /** Deadline for the case, or null while none has been set. */
  sla: { deadline: string; breached: boolean; remainingH: number | null } | null;
}

const TRACKS: TrackId[] = ['service', 'conduct', 'doxing', 'silent'];
/* The API sends two components under a second name as well; counting both would show each twice. */
const ALIAS: Record<string, string> = { topic_severity: 'severity', rating_severity: 'rating' };

/** "overdue by 3d", "14h left" — how a deadline reads in a queue. */
export function slaLabel(sla: NonNullable<CaseRow['sla']>): string {
  const h = sla.remainingH ?? (new Date(sla.deadline).getTime() - Date.now()) / 3.6e6;
  const span = (x: number) => (x >= 48 ? `${Math.round(x / 24)}d` : `${Math.max(1, Math.round(x))}h`);
  return sla.breached || h < 0 ? `overdue by ${span(Math.abs(h))}` : `${span(h)} left`;
}

export function toRow(c: CaseItem): CaseRow {
  const a = c.author, w = c.workflow;
  const meta = [
    a.lifetime_reviews != null ? `${a.lifetime_reviews} reviews` : null, a.local_guide ? 'Local Guide' : null,
    a.has_photo ? (a.photos && a.photos > 1 ? `${a.photos} photos` : 'with photo') : null,
    c.first_response_h != null ? `answered after ${c.first_response_h >= 48 ? `${Math.round(c.first_response_h / 24)}d` : `${Math.round(c.first_response_h)}h`}` : null,
  ].filter(Boolean).join(', ');
  const components = Object.fromEntries(
    Object.entries(c.score_components ?? {}).filter(([k, v]) => typeof v === 'number' && !(k in ALIAS && ALIAS[k] in (c.score_components ?? {}))),
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
    track: TRACKS.find((t) => t === w?.track) ?? null,
    sla: w?.sla_deadline ? { deadline: w.sla_deadline, breached: !!w.sla_breached, remainingH: w.sla_remaining_h ?? null } : null,
  };
}

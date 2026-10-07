import type { DuplicateSet, Priority, SocialReply, SocialResponse, SocialThread, SocialTopic } from './types';

/* GET /v1/pages/social, read into the shape the views use. Field names moved between the
 * prototype and the API (`user` → `author`, `ts` → `posted_at`, `captured` → `replies_captured`),
 * so each field is looked up under both. */

type Raw = Record<string, unknown>;
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const handle = (v: unknown) => str(v).replace(/^@/, '');

function reply(r: Raw): SocialReply {
  return { user: handle(r.user ?? r.author), text: str(r.text), ts: str(r.ts ?? r.posted_at), is_brand: r.is_brand === true };
}

function thread(t: Raw, i: number): SocialThread {
  const severity = num(t.severity ?? t.sev);
  const captured = num(t.captured ?? t.replies_captured);
  const latency = t.latency_h ?? t.first_response_h;
  const url = t.url ?? t.permalink;
  return {
    id: str(t.id ?? t.thread_id, String(i)),
    user: handle(t.user ?? t.author),
    text: str(t.text),
    ts: str(t.ts ?? t.posted_at),
    age: num(t.age ?? t.age_days),
    likes: num(t.likes),
    declared: num(t.declared ?? t.replies_declared, captured),
    captured,
    truncated: t.truncated === true,
    brand_replied: t.brand_replied === true,
    latency_h: typeof latency === 'number' ? latency : null,
    pile_on: t.pile_on === true,
    followups_after_brand: num(t.followups_after_brand),
    topics: ((t.topics ?? t.topic_ids) as string[] | undefined) ?? [],
    severity,
    sentiment: str(t.sentiment),
    /* The API counts a thread as a complaint from severity 2 up; older payloads said so outright. */
    is_complaint: typeof t.is_complaint === 'boolean' ? t.is_complaint : severity >= 2,
    criticality: num(t.criticality),
    priority: str(t.priority, 'none') as Priority,
    url: typeof url === 'string' ? url : null,
    replies: ((t.replies as Raw[] | undefined) ?? []).map(reply),
  };
}

function topic(t: Raw): SocialTopic {
  const last = t.last ?? t.last_seen;
  return {
    topic: str(t.topic ?? t.topic_id ?? t.label),
    sev: num(t.sev ?? t.severity, 1),
    n: num(t.n),
    answered: num(t.answered),
    last: typeof last === 'string' ? last : null,
  };
}

export function readSocial(d: SocialResponse): SocialResponse {
  const raw = d as unknown as { threads?: Raw[]; topics?: Raw[] };
  return { ...d, threads: (raw.threads ?? []).map(thread), topics: (raw.topics ?? []).map(topic) };
}

export const dupUsers = (d: DuplicateSet) => d.users ?? d.accounts ?? [];
export const dupCount = (d: DuplicateSet) => d.n ?? d.count ?? dupUsers(d).length;

'use client';

import { useMemo, useState } from 'react';
import { ApiPage, Chip, EmptyRow, NoText, Rating, SortHead, SourceBadge, Tags, type Col } from '@/components/ui';
import { useApi } from '@/lib/api';
import { nextSort, sortRows, useScope, type SortState } from '@/lib/scope';
import { T } from '@/lib/theme';
import type { CaseItem, CasesResponse, Channel, Priority } from '@/lib/types';

/** A case flattened for display and sorting. */
interface Row {
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
}

type QueueKey = keyof Row & string;
type QueueFilter = 'all' | 'critical' | 'high' | 'medium';

/** The API's maximum page size; the queue reads one page, highest criticality first. */
const LIMIT = 200;

const COLS: Col<QueueKey>[] = [
  ['priority', 'Priority', false], ['score', 'Score', true], ['source', 'Source', false], ['date', 'Posted', false],
  ['age', 'Age', true], ['text', 'Case and topics', false], ['who', 'Author', false],
];

const CHIPS: [QueueFilter, string][] = [['all', 'Everything'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium']];

function toRow(c: CaseItem): Row {
  const a = c.author;
  const meta = [a.lifetime_reviews != null ? `${a.lifetime_reviews} reviews` : null, a.local_guide ? 'Local Guide' : null].filter(Boolean).join(', ');
  return {
    id: c.case_id, priority: c.priority, score: c.criticality ?? 0, source: c.source,
    where: c.channel_ref.branch ?? 'Official account', stars: c.stars, date: c.posted_at, age: c.age_days,
    text: c.text, topics: c.topic_ids, who: a.display ?? '—', meta, url: c.permalink,
  };
}

export function EscalationsView() {
  const { params } = useScope('escalations');
  const res = useApi<CasesResponse>('/v1/cases', { ...params, limit: LIMIT });
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [sort, setSort] = useState<SortState<QueueKey>>(['score', 'desc']);
  const all = useMemo(() => (res.data?.items ?? []).map(toRow), [res.data]);

  return (
    <ApiPage res={res}>
      {(d) => {
        const counts: Record<string, number> = { all: all.length, critical: 0, high: 0, medium: 0 };
        all.forEach((c) => { if (counts[c.priority] !== undefined) counts[c.priority]++; });
        const q = sortRows(filter === 'all' ? all : all.filter((c) => c.priority === filter), sort);
        return (
          <div className="panel">
            <div className="chips">
              {CHIPS.map(([k, label]) => (
                <button key={k} className={filter === k ? 'on' : undefined} onClick={() => setFilter(k)}>
                  {label} <span style={{ opacity: 0.6 }}>{counts[k] || 0}</span>
                </button>
              ))}
            </div>
            {d.page.total > all.length && (
              <div className="p-note" style={{ marginBottom: 6, color: '#8E5310' }}>
                Showing the {all.length} most critical of {d.page.total} cases.
              </div>
            )}
            <div className="p-note" style={{ marginBottom: 12 }}>Criticality runs 0–100: topic severity weighted fifteen-fold, then rating severity, recency, reviewer reach (Local Guide status, lifetime review count, attached photo) and an unanswered penalty. Weights are configurable and need CX and compliance sign-off before this goes live.</div>
            <div className="t-scroll">
              <table>
                <SortHead cols={COLS} sort={sort} onSort={(f) => setSort((s) => nextSort(s, f))} extra={<th />} />
                <tbody>
                  {q.length ? q.map((c) => (
                    <tr key={c.id}>
                      <td><Chip priority={c.priority} /></td>
                      <td className="n"><b>{c.score}</b></td>
                      <td>
                        <SourceBadge source={c.source} />
                        <div className="sub">{c.where}{c.stars ? <><br /><Rating stars={c.stars} /></> : null}</div>
                      </td>
                      <td className="mono">{c.date}</td>
                      <td className="n" style={c.age > 180 ? { color: T.sig } : undefined}>{c.age}d</td>
                      <td>
                        <div className="quote" style={{ whiteSpace: 'pre-wrap' }}>{c.text ? c.text.slice(0, 420) : <NoText />}</div>
                        <div style={{ marginTop: 6 }}><Tags topics={c.topics} /></div>
                      </td>
                      <td>{c.who}{c.meta && <div className="sub">{c.meta}</div>}</td>
                      <td>{c.url && <a className="link" href={c.url} target="_blank" rel="noopener">Open</a>}</td>
                    </tr>
                  )) : <EmptyRow colSpan={8}>No cases match this filter.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </div>
        );
      }}
    </ApiPage>
  );
}

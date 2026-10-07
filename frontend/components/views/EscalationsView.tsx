'use client';

import { useMemo, useState } from 'react';
import { useCaseDrawer } from '@/components/CaseHost';
import { AiNote, ApiPage, Chip, Chips, EmptyRow, NoText, Rating, SortHead, SourceBadge, Tags, type Col } from '@/components/ui';
import { STATE, type StatusId } from '@/lib/caseflow';
import { useCaseList, type CaseList } from '@/lib/cases';
import { toRow, type CaseRow } from '@/lib/caseRow';
import { useCase } from '@/lib/caseStore';
import { useReference } from '@/lib/reference';
import { nextSort, sortRows, useView, type SortState } from '@/lib/scope';
import { T, plural } from '@/lib/theme';

type QueueKey = keyof CaseRow & string;
type QueueFilter = 'all' | 'critical' | 'high' | 'medium';
type Bucket = 'any' | 'untouched' | 'working' | 'awaiting' | 'closed';

const COLS: Col<QueueKey>[] = [
  ['priority', 'Priority', false], ['score', 'Score', true], ['severity', 'Sev', true], ['status', 'Status', false], ['source', 'Source', false],
  ['date', 'Posted', false], ['age', 'Age', true], ['answered', 'Reply', false],
  ['text', 'Case and topics', false], ['who', 'Author', false],
];

const CHIPS: [QueueFilter, string][] = [['all', 'Everything'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium']];
const BUCKETS: [Bucket, string][] = [['any', 'Any status'], ['untouched', 'Not started'], ['working', 'In progress'], ['awaiting', 'Awaiting approval'], ['closed', 'Closed']];

/** Where a case stands, in the four words a queue is read by. */
const bucketOf = (status: string): Exclude<Bucket, 'any'> =>
  status === 'open' ? 'untouched' : status === 'pending' ? 'awaiting' : status === 'closed' || status === 'resolved' ? 'closed' : 'working';

export function EscalationsView() {
  const view = useView('escalations');
  /* Complaints only, highest criticality first, across as many pages as the scope holds. */
  const res = useCaseList({ ...view.sig, complaints: 'true', sort: 'criticality', order: 'desc' });
  return <ApiPage res={res}>{(d) => <Queue list={d} />}</ApiPage>;
}

function Queue({ list }: { list: CaseList }) {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [bucket, setBucket] = useState<Bucket>('any');
  const [sort, setSort] = useState<SortState<QueueKey>>(['score', 'desc']);
  const { topic } = useReference();
  const pool = list.items;
  const all = useMemo(() => pool.map(toRow), [pool]);
  const { open, drawer } = useCaseDrawer(pool);

  const counts: Record<QueueFilter, number> = { all: all.length, critical: 0, high: 0, medium: 0 };
  const buckets: Record<Bucket, number> = { any: all.length, untouched: 0, working: 0, awaiting: 0, closed: 0 };
  for (const c of all) {
    if (c.priority === 'critical' || c.priority === 'high' || c.priority === 'medium') counts[c.priority]++;
    buckets[bucketOf(c.status)]++;
  }
  const q = sortRows(all.filter((c) => (filter === 'all' || c.priority === filter) && (bucket === 'any' || bucketOf(c.status) === bucket)), sort);

  // what needs attention today
  const stale = all.filter((c) => c.age > 180 && !c.answered).length;
  const top = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all) for (const t of c.topics) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1])[0];
  }, [all]);

  return (
    <div className="panel">
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Chips options={CHIPS} value={filter} onPick={setFilter} counts={counts} />
        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)', margin: '0 4px 14px' }} />
        <Chips options={BUCKETS} value={bucket} onPick={setBucket} counts={buckets} />
      </div>
      {list.partial && (
        <div className="p-note" style={{ marginBottom: 6, color: '#8E5310' }}>
          Showing the {list.items.length.toLocaleString('en-US')} most critical of {list.total.toLocaleString('en-US')} cases. Narrow the scope or the period to reach the rest.
        </div>
      )}
      <div className="p-note" style={{ marginBottom: 12 }}>Criticality runs 0–100: topic severity weighted fifteen-fold, then rating severity, recency, reviewer reach (Local Guide status, lifetime review count, attached photo) and an unanswered penalty. Weights are configurable and need CX and compliance sign-off before this goes live.</div>
      {all.length > 0 && (
        <AiNote title="What needs attention today">
          {all.length} open {plural(all.length, 'case', 'cases')}, {counts.critical} critical.{' '}
          {top ? `${topic(top[0])?.label ?? top[0]} is the most common theme, on ${top[1]} of them. ` : ''}
          {stale
            ? `${stale} ${plural(stale, 'has', 'have')} been public and unanswered for more than six months — those are the ones that read as neglect rather than error.`
            : 'Nothing has been sitting unanswered beyond six months.'}
        </AiNote>
      )}
      <div className="t-scroll q-table" style={{ marginTop: 14 }}>
        <table>
          <SortHead cols={COLS} sort={sort} onSort={(f) => setSort((s) => nextSort(s, f))} extra={<th>Action</th>} />
          <tbody>
            {q.length ? q.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => open(c.id)}>
                <td><Chip priority={c.priority} /></td>
                <td className="n" title={c.breakdown || undefined}>
                  <b>{c.score}</b>
                  {c.breakdown && <div className="sub" style={{ whiteSpace: 'nowrap' }}>{c.breakdown}</div>}
                </td>
                <td className="n"><span className={`tag s${c.severity}`}>{c.severity}</span></td>
                <td><StatusPill id={c.id} status={c.status} /></td>
                <td>
                  <SourceBadge source={c.source} />
                  <div className="sub">{c.where}{c.stars ? <><br /><Rating stars={c.stars} /></> : null}</div>
                </td>
                <td className="mono">{c.date.slice(0, 10)}</td>
                <td className="n" style={c.age > 180 ? { color: T.sig } : undefined}>{c.age}d</td>
                <td style={c.answered ? undefined : { color: T.sig, fontWeight: 600 }}>{c.answered ? 'answered' : 'never'}</td>
                <td>
                  <div className="quote" style={{ whiteSpace: 'pre-wrap' }}>
                    {c.text ? c.text.slice(0, 420) : <NoText />}
                    {c.url && (
                      <a className="open-link" href={c.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}
                        title="Open the original review" aria-label="Open the original review">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M14 4h6v6M20 4l-8.6 8.6M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
                        </svg>
                      </a>
                    )}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Tags topics={c.topics} />
                    {c.sentiment && <span className="sub" style={{ marginLeft: 6 }}>{c.sentiment}</span>}
                  </div>
                </td>
                <td>{c.who}{c.meta && <div className="sub">{c.meta}</div>}</td>
                <td><button className="btn2" style={{ padding: '5px 11px' }}>Handle</button></td>
              </tr>
            )) : <EmptyRow colSpan={COLS.length + 1}>No cases match this filter.</EmptyRow>}
          </tbody>
        </table>
      </div>
      {drawer}
    </div>
  );
}

/** The case's status: what was done in this session if it has been touched, otherwise what the API last reported. */
function StatusPill({ id, status }: { id: string; status: string }) {
  const s = useCase(id);
  const now = s.trail.length ? s.status : status;
  const known = STATE[now as StatusId];
  const tone = known?.tone;
  const color = tone === 'ok' ? 'var(--grow)' : tone === 'bad' ? T.sig : tone === 'warn' ? 'var(--warn)' : 'var(--ink-3)';
  return <span className="sub" style={{ color, fontWeight: 600, whiteSpace: 'nowrap', marginTop: 0 }}>{known?.label ?? now}</span>;
}

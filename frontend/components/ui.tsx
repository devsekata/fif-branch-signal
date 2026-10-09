'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ApiResult } from '@/lib/api';
import { page, type PageId } from '@/lib/pages';
import { useReference } from '@/lib/reference';
import type { SortState } from '@/lib/scope';
import type { Mix } from '@/lib/signal';
import { IRRELEVANT, NEUTRAL, T } from '@/lib/theme';
import type { Channel, Priority } from '@/lib/types';

export function Rating({ stars }: { stars: number }) {
  return (
    <span className="rating">
      <span className="on">{'★'.repeat(stars)}</span>
      <span className="off">{'★'.repeat(5 - stars)}</span>
    </span>
  );
}

export function Chip({ priority, children }: { priority: Priority; children?: ReactNode }) {
  return <span className={`chip c-${priority}`}>{children ?? priority}</span>;
}

export function SourceBadge({ source }: { source: Channel }) {
  return source === 'google'
    ? <span className="src src-google">GOOGLE</span>
    : <span className="src src-ig">IG</span>;
}

/** Topic chips, coloured by severity from the API taxonomy. Accepts topic ids or labels. */
export function Tags({ topics }: { topics: string[] | undefined }) {
  const { topic } = useReference();
  if (!topics?.length) return <span className="tag">untagged</span>;
  return topics.map((t) => {
    const info = topic(t);
    return <span key={t} className={`tag s${info?.severity ?? 1}`}>{info?.label ?? t}</span>;
  });
}

export function Metric({ k, v, n, color, small }: { k: ReactNode; v: ReactNode; n?: ReactNode; color?: string; small?: boolean }) {
  return (
    <div className="metric" style={small ? { padding: '11px 13px' } : undefined}>
      <div className="k">{k}</div>
      <div className="v" style={{ color, fontSize: small ? 22 : undefined }}>{v}</div>
      {n ? <div className="n">{n}</div> : null}
    </div>
  );
}

/** One way to draw a small set of choices: anything with two to five options is chips. */
export function Chips<V extends string>({ options, value, onPick, counts, flush }: {
  options: readonly (readonly [V, string])[];
  value: V;
  onPick: (v: V) => void;
  counts?: Partial<Record<V, number>>;
  /** Sits in a panel head, so it carries no bottom margin. */
  flush?: boolean;
}) {
  return (
    <div className="chips" style={flush ? { margin: 0 } : undefined}>
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : undefined} onClick={() => onPick(v)}>
          {label}{counts && <> <span style={{ opacity: 0.6 }}>{counts[v] ?? 0}</span></>}
        </button>
      ))}
    </div>
  );
}

/** Positive, neutral, negative and irrelevant/spam as one bar, so the mix reads before the numbers do. */
export function MixBar({ mix, height = 9 }: { mix: Mix; height?: number }) {
  const all = mix.total + mix.irrelevant;
  const w = (v: number) => `${all ? (100 * v) / all : 0}%`;
  return (
    <div className="sent-bar" style={{ height }} role="img"
      aria-label={`${mix.good} positive, ${mix.neutral} neutral, ${mix.bad} negative, ${mix.irrelevant} irrelevant or spam of ${all}`}>
      <i style={{ width: w(mix.good), background: T.grow }} />
      <i style={{ width: w(mix.neutral), background: NEUTRAL }} />
      <i style={{ width: w(mix.bad), background: T.sig }} />
      <i style={{ width: w(mix.irrelevant), background: IRRELEVANT }} />
    </div>
  );
}

/** A sentence or two read off the numbers on the panel above it. */
export function AiNote({ title, children }: { title: string; children: ReactNode }) {
  return <div className="ai-note"><b>{title}</b>{children}</div>;
}

export function Formula() {
  return <span className="formula">score = <b>(positive − negative) ÷ total</b>, mapped to 0–100</span>;
}

/** A panel the layout has a place for, whose numbers the API does not return yet. */
export function Pending({ children }: { children: ReactNode }) {
  return <div className="pending"><b>Waiting on the API</b>{children}</div>;
}

/* Each page ends by handing the reader to the page that answers the next question. Escalations is the end of the chain. */
const BRIDGE: Partial<Record<PageId, { q: string; d: string; to: PageId }>> = {
  overview: { q: 'So where is it happening, and is the complaint the same everywhere?',
    d: 'The map answers where. Complaint themes answers whether the problem is local coaching or a head-office process.', to: 'geography' },
  geography: { q: 'Which branch inside that area is driving it?',
    d: 'Area & Branch narrows province to kota to kecamatan to a single branch, with the sentiment behind each score.', to: 'branches' },
  branches: { q: 'What are these branches actually being told?',
    d: 'Complaint themes groups the text by category and severity across both channels.', to: 'complaints' },
  complaints: { q: 'Can the rating even be trusted as a satisfaction signal?',
    d: 'Review integrity shows how much of the score was collected at the counter rather than written at home.', to: 'integrity' },
  integrity: { q: 'And can the branch list itself be trusted?',
    d: 'Listing integrity reconciles what is on Google against the branch master: duplicates splitting the reviews, listings nobody manages, and branches with no listing at all.', to: 'listings' },
  listings: { q: 'Which cases need a person this week?',
    d: 'Escalations ranks every open case across both channels on one criticality score.', to: 'escalations' },
};

export function Bridge({ from }: { from: PageId }) {
  const b = BRIDGE[from];
  if (!b) return null;
  const to = page(b.to);
  return (
    <div className="bridge">
      <span className="q">Next question</span>
      <span className="d"><b style={{ color: 'var(--ink)' }}>{b.q}</b> {b.d}</span>
      <Link href={to.href}>Open {to.label}</Link>
    </div>
  );
}

export function Stat({ k, v, n, bad }: { k: ReactNode; v: ReactNode; n: ReactNode; bad?: boolean }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={bad ? 'v sig' : 'v'}>{v}</div>
      <div className="n">{n}</div>
    </div>
  );
}

export function PanelHead({ title, tag }: { title: ReactNode; tag?: ReactNode }) {
  return (
    <div className="p-head">
      <h3>{title}</h3>
      {tag != null && <span className="p-tag">{tag}</span>}
    </div>
  );
}

export function NoText() {
  return <span style={{ color: 'var(--ink-3)' }}>rating only, no text</span>;
}

/** Column spec: [field, label, numeric]. */
export type Col<K extends string> = [K, string, boolean];

/** Header row whose cells toggle the table's sort; the arrow marks the active column. */
export function SortHead<K extends string>({ cols, sort, onSort, extra }: {
  cols: Col<K>[];
  sort: SortState<K>;
  onSort: (field: K) => void;
  extra?: ReactNode;
}) {
  const [sc, sd] = sort;
  return (
    <thead>
      <tr>
        {cols.map(([f, label, num]) => (
          <th key={f} className={num ? 'n' : undefined} data-sort={f} onClick={() => onSort(f)}>
            {label}{sc === f ? (sd === 'asc' ? ' ↑' : ' ↓') : ''}
          </th>
        ))}
        {extra}
      </tr>
    </thead>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}><div className="empty">{children}</div></td>
    </tr>
  );
}

/** Warnings the API attaches to a payload, e.g. "branches endpoint is Google-only regardless of source filter". */
function apiWarnings(data: unknown): string[] {
  const w = (data as { context?: { warnings?: unknown } } | null | undefined)?.context?.warnings;
  return Array.isArray(w) ? w.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

/** Loading and error states for a page payload. While a refetch runs the previous data stays, dimmed. */
export function ApiPage<T>({ res, children }: { res: ApiResult<T>; children: (data: T) => ReactNode }) {
  if (res.error) {
    return (
      <section className="page">
        <div className="panel api-state">
          <h3>This page could not be loaded</h3>
          <p className="p-note">{res.error}</p>
          <button className="btn" onClick={res.retry}>Try again</button>
        </div>
      </section>
    );
  }
  if (!res.data) {
    return (
      <section className="page">
        <div className="panel api-state"><p className="p-note">Loading data…</p></div>
      </section>
    );
  }
  const warnings = apiWarnings(res.data);
  return (
    <section className={res.loading ? 'page busy' : 'page'} aria-busy={res.loading}>
      {warnings.length > 0 && (
        <div className="panel mb" style={{ borderColor: '#E7D2AE' }}>
          <div className="p-note" style={{ marginBottom: 0, color: '#8E5310' }}>
            {warnings.map((w, i) => <div key={w}>{i > 0 && <br />}Reported by the API: {w}</div>)}
          </div>
        </div>
      )}
      {children(res.data)}
    </section>
  );
}

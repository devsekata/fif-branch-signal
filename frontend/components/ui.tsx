'use client';

import type { ReactNode } from 'react';
import type { ApiResult } from '@/lib/api';
import { useReference } from '@/lib/reference';
import type { SortState } from '@/lib/scope';
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

export function Metric({ k, v, n }: { k: ReactNode; v: ReactNode; n: ReactNode }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="n">{n}</div>
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

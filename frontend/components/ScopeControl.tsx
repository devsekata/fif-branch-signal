'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { LEVELS, NO_SCOPE, useFilters, type Level } from '@/lib/filters';
import { useReference } from '@/lib/reference';
import { coversPlace, isScoped, pickScope, scopeOptions } from '@/lib/scope';
import type { PeriodFilter, SourceFilter } from '@/lib/types';

/** Closes a popover on a click anywhere outside it. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

const FIELD: Record<Level, [string, string]> = {
  province: ['Province', 'All provinces'],
  kota: ['Kota / kabupaten', 'All kota'],
  kecamatan: ['Kecamatan', 'All kecamatan'],
  branch: ['Branch', 'All branches'],
};

/** One hierarchy control for the whole dashboard: each field filters the next. */
export function ScopeControl({ off, title }: { off: boolean; title: string }) {
  const { filters, setFilter } = useFilters();
  const { places, place } = useReference();
  const sel = filters.scope;
  const [open, setOpen] = useState(false);
  const wrap = useDismiss(open, () => setOpen(false));
  const shown = open && !off;

  const trail = [sel.province, sel.kota, sel.kecamatan, sel.branch ? place(sel.branch)?.name ?? sel.branch : null].filter((x): x is string => !!x);
  const inScope = isScoped(sel) ? places.filter((p) => coversPlace(sel, p)).length : places.length;

  return (
    <div className="scope-wrap" ref={wrap}>
      <button className={`ctl scope-btn${trail.length ? ' set' : ''}${off ? ' off' : ''}`} disabled={off}
        aria-haspopup="true" aria-expanded={shown} title={title} onClick={() => setOpen((o) => !o)}>
        <span className="scope-label">
          {trail.length
            ? trail.map((t, i) => <Fragment key={i}>{i > 0 && <span className="crumbsep">▸</span>}{t}</Fragment>)
            : 'All branches'}
        </span>
        <span className="caret">▾</span>
      </button>
      {shown && (
        <div className="popover on">
          <div className="pop-head">Narrow the scope</div>
          <div className="pop-note">Each field filters the next. Type to search inside a field.</div>
          {LEVELS.map((lv) => (
            <ScopeField key={lv} level={lv}
              value={lv === 'branch' ? (sel.branch ? place(sel.branch)?.name ?? sel.branch : '') : sel[lv] ?? ''}
              onPick={(v) => setFilter('scope', pickScope(lv, v, places))} />
          ))}
          <div className="pop-foot">
            <span className="pop-count">{inScope} {inScope === 1 ? 'branch' : 'branches'} in scope</span>
            <button className="btn2" onClick={() => { setFilter('scope', NO_SCOPE); setOpen(false); }}>Clear scope</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScopeField({ level, value, onPick }: { level: Level; value: string; onPick: (value: string) => void }) {
  const { filters } = useFilters();
  const { places } = useReference();
  const [term, setTerm] = useState<string | null>(null);
  const [label, placeholder] = FIELD[level];
  const listing = term !== null;
  const q = (term ?? '').trim().toLowerCase();
  const options = listing ? scopeOptions(level, filters.scope, places).filter((o) => !q || o.label.toLowerCase().includes(q)).slice(0, 60) : [];

  return (
    <div className="fld">
      <label>{label}</label>
      <input className={value ? 'pick set' : 'pick'} placeholder={placeholder} autoComplete="off" aria-label={label}
        value={term ?? value}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => setTerm('')}
        onBlur={() => setTerm(null)} />
      {listing && (
        <div className="picklist on">
          {options.length ? options.map((o) => (
            /* mousedown, not click: the input's blur closes the list before a click would land. */
            <button key={o.value} onMouseDown={(e) => { e.preventDefault(); onPick(o.value); setTerm(null); (document.activeElement as HTMLElement | null)?.blur(); }}>
              {o.label}<div className="sub">{o.sub}</div>
            </button>
          )) : <div className="none">Nothing matches inside the current scope.</div>}
        </div>
      )}
    </div>
  );
}

const SOURCES: [SourceFilter, string][] = [['all', 'Both'], ['google', 'Google'], ['instagram', 'Instagram']];

export function SourceControl() {
  const { filters, setFilter } = useFilters();
  return (
    <div className="seg-ctl" role="group" aria-label="Data source">
      {SOURCES.map(([v, l]) => (
        <button key={v} className={filters.source === v ? 'on' : undefined} onClick={() => setFilter('source', v)}>{l}</button>
      ))}
    </div>
  );
}

const PERIODS: [PeriodFilter, string][] = [['all', 'Full range'], ['365', 'Last 365 days'], ['180', 'Last 180 days'], ['90', 'Last 90 days']];

export function PeriodControl() {
  const { filters, setFilter } = useFilters();
  const bounds = useReference().meta?.date_bounds;
  const [open, setOpen] = useState(false);
  const wrap = useDismiss(open, () => setOpen(false));
  const cur = filters.period;
  return (
    <div className="scope-wrap" ref={wrap}>
      <button className={cur !== 'all' ? 'ctl scope-btn set' : 'ctl scope-btn'} style={{ minWidth: 150 }}
        aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{PERIODS.find((p) => p[0] === cur)![1]}</span><span className="caret">▾</span>
      </button>
      {open && (
        <div className="popover on" style={{ width: 260 }}>
          <div className="pop-head">Period</div>
          <div className="pop-note">
            {bounds ? `Reviews run ${bounds.min} to ${bounds.max}. ` : ''}
            Windows count back from the newest review, not from today, so a stale sync does not empty the dashboard.
          </div>
          <div className="chips" style={{ margin: 0 }}>
            {PERIODS.map(([v, l]) => (
              <button key={v} className={cur === v ? 'on' : undefined} onClick={() => { setFilter('period', v); setOpen(false); }}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { ApiPage, Bridge, Chips, EmptyRow, Metric, PanelHead } from '@/components/ui';
import { useApi } from '@/lib/api';
import { scopeParams, useView } from '@/lib/scope';
import type { ListingRow, ListingStatus, ListingsResponse } from '@/lib/types';

type Filter = 'flagged' | 'duplicate' | 'unrecognised' | 'no_listing' | 'matched' | 'all';

const FILTERS: [Filter, string][] = [
  ['flagged', 'Needs attention'], ['duplicate', 'Duplicates'], ['unrecognised', 'Not in master'],
  ['no_listing', 'No listing'], ['matched', 'Matched'], ['all', 'All'],
];
const STATUS_LABEL: Record<ListingStatus, string> = { matched: 'Matched', duplicate: 'Duplicate', unrecognised: 'Not in master', no_listing: 'No listing' };
/** Rows drawn at once; the rest is reached by narrowing the scope or searching. */
const CAP = 100;

const n = (v: number) => v.toLocaleString('en-US');

export function ListingsView() {
  const view = useView('listings');
  /* No period: a duplicate listing exists whatever window is being looked at. */
  const res = useApi<ListingsResponse>('/v1/pages/listings', scopeParams(view.sel));
  return <ApiPage res={res}>{(d) => <Listings d={d} />}</ApiPage>;
}

function Listings({ d }: { d: ListingsResponse }) {
  const { meta, rows } = d;
  const count = (s: ListingStatus) => rows.filter((r) => r.status === s).length;
  const dup = count('duplicate'), unk = count('unrecognised'), none = count('no_listing'), matched = count('matched');
  return (
    <>
      {meta.master_is_simulated && (
        <div className="panel mb" style={{ borderColor: '#EDE2BC', background: '#FDFBF3' }}>
          <div className="p-head"><h3>FIF&rsquo;s branch master is not connected</h3></div>
          <p className="p-note" style={{ marginBottom: 0 }}>
            {meta.master_note} {meta.seeded_note}{' '}
            Matching uses the signals the scrape actually carries — <b>{meta.signals_available.join(', ')}</b> — at a {meta.name_threshold.toFixed(2)} name
            threshold and {meta.distance_threshold_m} m. <b>{meta.signals_missing.join(', ')}</b> are not available from scraping and are what FIF&rsquo;s
            master and the Google Business Profile connection add.
          </p>
        </div>
      )}

      <div className="grid g-4 mb">
        <Metric k="Listings found" v={d.summary.listings_found} n={`${matched} matched to the branch master`} />
        <Metric k="Suspected duplicates" v={dup} n={dup ? 'same branch, more than one listing' : 'none in this scope'} color={dup ? 'var(--sig)' : undefined} />
        <Metric k="Not in the master" v={unk} n={unk ? 'no branch matches the name' : 'none in this scope'} color={unk ? 'var(--sig)' : undefined} />
        <Metric k="Branches with no listing" v={meta.master_is_simulated ? '—' : none}
          n={meta.master_is_simulated ? 'cannot be known until the master is connected' : none ? 'invisible to anyone searching Maps' : 'none in this scope'}
          color={none ? 'var(--sig)' : undefined} />
      </div>

      <div className="panel mb">
        <PanelHead title="Where the review volume sits"
          tag={d.summary.reviews_on_listings ? `${n(d.summary.reviews_off_master)} of ${n(d.summary.reviews_on_listings)} reviews` : undefined} />
        <div className="p-note">A listing FIF does not manage still collects reviews, still shows a rating in search, and its complaints never reach the escalation queue. That is the cost of a duplicate, not the tidiness.</div>
        <Split rows={rows} pct={d.summary.reviews_off_master_pct} />
      </div>

      <Table rows={rows} counts={{ flagged: dup + unk + none, duplicate: dup, unrecognised: unk, no_listing: none, matched, all: rows.length }} />
      <Bridge from="listings" />
    </>
  );
}

function Split({ rows, pct }: { rows: ListingRow[]; pct: number }) {
  const sum = (s: ListingStatus[]) => rows.filter((r) => r.listing_id && s.includes(r.status)).reduce((a, r) => a + r.reviews, 0);
  const on = sum(['matched']), dup = sum(['duplicate']), unk = sum(['unrecognised']);
  const all = on + dup + unk;
  if (!all) return <div className="empty">No listing in this scope.</div>;
  const w = (v: number) => `${((100 * v) / all).toFixed(1)}%`;
  const parts = [[on, '#1F8C84', 'On matched listings'], [dup, '#C8322B', 'On duplicates'], [unk, '#D8801F', 'On listings not in the master']] as const;
  return (
    <>
      <div className="split-bar" role="img" aria-label={parts.map(([v, , label]) => `${label} ${w(v)}`).join(', ')}>
        {parts.map(([v, c, label]) => <i key={label} style={{ width: w(v), background: c }}>{v > all * 0.08 ? n(v) : ''}</i>)}
      </div>
      <div className="split-key">
        {parts.map(([v, c, label]) => <span key={label}><i style={{ background: c }} />{label} {w(v)}</span>)}
      </div>
      <div className="p-note" style={{ margin: '12px 0 0' }}>
        <b style={{ color: 'var(--ink)' }}>{pct}% of review volume sits on listings FIF does not manage.</b>{' '}
        Those complaints never enter the escalation queue, and that rating still shows in search.
      </div>
    </>
  );
}

function Managed({ managed }: { managed: boolean | null }) {
  /* Three states on purpose: unknown is not "no". */
  if (managed === null || managed === undefined) return <span style={{ color: 'var(--ink-3)' }}>unknown</span>;
  return managed ? <>yes</> : <b style={{ color: 'var(--sig)' }}>no</b>;
}

function Table({ rows, counts }: { rows: ListingRow[]; counts: Record<Filter, number> }) {
  const [filter, setFilter] = useState<Filter>('flagged');
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'all' ? true : filter === 'flagged' ? r.status !== 'matched' : r.status === filter))
      .filter((r) => !q || [r.name, r.master_name, r.branch_code, r.kecamatan, r.kota, r.city].some((x) => x && x.toLowerCase().includes(q)))
      /* Flagged first, then by the volume at stake. */
      .sort((a, b) => Number(a.status === 'matched') - Number(b.status === 'matched') || b.reviews - a.reviews);
  }, [rows, filter, query]);
  const shown = list.slice(0, CAP);
  return (
    <div className="panel">
      <PanelHead title="Listings against the branch master" tag={`${list.length} row${list.length === 1 ? '' : 's'}`} />
      <div className="p-note">Flagged rows carry the evidence that flagged them. A match nobody can audit gets ignored in the field, or trusted when it should not be.</div>
      <Chips options={FILTERS} value={filter} onPick={setFilter} counts={counts} />
      <div className="scope-wrap" style={{ marginBottom: 12 }}>
        <input className="lst-search" type="search" autoComplete="off" aria-label="Search listings"
          placeholder="Search a branch, kecamatan or listing name" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="t-scroll" style={{ maxHeight: 620 }}>
        <table>
          <thead>
            <tr><th>Status</th><th>Listing</th><th>Branch code</th><th>Area</th><th className="n">Reviews</th><th className="n">Rating</th><th>Owner replies</th><th>Why flagged</th></tr>
          </thead>
          <tbody>
            {shown.length ? shown.map((r) => (
              <tr key={r.listing_id ?? `none-${r.branch_code ?? r.name}`}>
                <td><span className={`st-pill st-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                <td>
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer"><b>{r.name}</b></a> : <b>{r.name}</b>}
                  {r.seeded && <span className="dummy-flag">DUMMY</span>}
                  {r.master_name && r.master_name !== r.name && <div className="sub">master: {r.master_name}</div>}
                </td>
                <td className="mono lst-code">{r.branch_code ?? <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                <td>{r.kecamatan ?? r.kota ?? r.city ?? '—'}<div className="sub">{r.kecamatan ? r.kota : r.kota ? r.province : 'not placed'}</div></td>
                <td className="n">{r.reviews ? n(r.reviews) : '—'}</td>
                <td className="n">{r.rating !== null && r.rating !== undefined ? r.rating.toFixed(1) : '—'}</td>
                <td><Managed managed={r.managed} /></td>
                <td><div className="ev">{r.evidence.length ? r.evidence.join(' · ') : '—'}</div></td>
              </tr>
            )) : <EmptyRow colSpan={8}>Nothing matches this filter.</EmptyRow>}
          </tbody>
        </table>
      </div>
      {list.length > CAP && <div className="sub" style={{ marginTop: 10 }}>Showing the first {CAP} of {list.length}. Narrow the scope or search to see the rest.</div>}
    </div>
  );
}

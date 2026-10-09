'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { AiNote, ApiPage, Bridge, Chips, EmptyRow, Formula, Metric, MixBar, PanelHead, SortHead, type Col } from '@/components/ui';
import { useApi } from '@/lib/api';
import { toPoints, type BranchPoint } from '@/lib/geo';
import { branchHref } from '@/lib/pages';
import { nextSort, sortRows, useView, type SortState, type View } from '@/lib/scope';
import { MIN_N, NO_MIX, addMix, readOf, scoreColor, share } from '@/lib/signal';
import { IRRELEVANT, NEUTRAL, STAR, T, monthLabel, plural, riskColor } from '@/lib/theme';
import type { BranchRow, BranchesResponse, SignalBranchesResponse, SignalMonth, SignalOverviewResponse } from '@/lib/types';

/** A league-table row: figures for the current view, beside what Google publishes about the branch. */
interface Row {
  branch_id: string;
  branch: string;
  where: string;
  n: number;
  avg: number | null;
  cr: number;
  crit: number;
  reg: number;
  oldest: number;
  no_text_pct: number;
  first_timer_pct: number;
  risk: number;
  stars: [number, number, number, number, number];
  universe: number;
  coverage: number;
  public_score: number | null;
  owner_reply: number | null;
}
type RowKey = keyof Row & string;

const COLS: Col<RowKey>[] = [
  ['branch', 'Branch', false], ['n', 'Read', true], ['coverage', 'Coverage', true], ['avg', 'Rating', true],
  ['public_score', 'Public score', true], ['cr', 'Complaint rate', true], ['crit', 'Critical + high', true],
  ['reg', 'Conduct flags', true], ['owner_reply', 'Owner replies', true], ['oldest', 'Oldest open', true],
  ['no_text_pct', 'Rating only', true], ['first_timer_pct', 'New accounts', true], ['risk', 'Risk', true],
];

const alarm = (on: boolean | number) => (on ? { color: T.sig, fontWeight: 600 } : undefined);

export function BranchesView() {
  const view = useView('branches');
  /* Public score, review universe and owner-reply rate are properties of the branch, not of the view, so they are read unfiltered. */
  const published = useApi<BranchesResponse>('/v1/pages/branches').data;
  const res = useApi<SignalBranchesResponse>('/v1/signal/branches', { ...view.sig, source: undefined });
  const trend = useApi<SignalOverviewResponse>('/v1/signal/overview', { ...view.sig, source: 'google' }).data?.monthly;
  return <ApiPage res={res}>{(d) => <Branches view={view} data={d} trend={trend} published={published?.rows} />}</ApiPage>;
}

function Branches({ view, data, trend, published }: { view: View; data: SignalBranchesResponse; trend: SignalMonth[] | undefined; published: BranchRow[] | undefined }) {
  const points = useMemo(() => toPoints(data), [data]);
  const rows = useMemo((): Row[] => {
    const pub = new Map((published ?? []).map((r) => [r.branch_id, r]));
    /* Branches with nothing read in this view are dropped from the league table rather than shown at zero. */
    return data.branches.filter((b) => b.reviews_read > 0).map((b) => {
      const g = pub.get(b.branch_id);
      const universe = b.reviews_universe ?? g?.reviews_universe ?? 0;
      return {
        branch_id: b.branch_id, branch: b.branch, where: [b.kecamatan ?? b.city, b.province].filter(Boolean).join(', '),
        n: b.reviews_read, avg: b.avg_rating, cr: b.complaint_rate_pct, crit: b.critical_high, reg: b.conduct_flags,
        oldest: b.oldest_open_days, no_text_pct: b.rating_only_pct, first_timer_pct: b.new_account_pct, risk: b.risk_score, stars: b.rating_mix,
        universe, coverage: universe ? +((100 * b.reviews_read) / universe).toFixed(1) : 0,
        public_score: g?.google_public_score ?? null, owner_reply: g?.owner_reply_rate_pct ?? null,
      };
    });
  }, [data, published]);

  return (
    <>
      <BranchMetrics rows={rows} />
      <ScopeSummary view={view} points={points} />
      <TopBottom view={view} points={points} />
      <div className="panel mb">
        <PanelHead title="Sentiment trend" tag={view.scopeName ?? 'all areas'} />
        <AreaTrend view={view} months={trend} />
      </div>
      <AreaPanel view={view} points={points} />
      <div className="panel mb">
        <PanelHead title="Branch league table" tag="click a column to sort" />
        <div className="p-note" style={{ color: '#8E5310' }}>This page reads Google reviews only. Instagram comments carry no branch, so the source filter does not apply here.</div>
        <CoverageNote rows={rows} />
        <BranchTable rows={rows} />
      </div>
      <Composition rows={rows} />
      <Bridge from="branches" />
    </>
  );
}

function BranchMetrics({ rows }: { rows: Row[] }) {
  const worst = [...rows].sort((a, b) => b.risk - a.risk)[0];
  const best = [...rows].sort((a, b) => a.risk - b.risk)[0];
  const read = rows.reduce((a, r) => a + r.n, 0);
  const total = rows.reduce((a, r) => a + r.universe, 0);
  const spread = rows.length ? Math.max(...rows.map((r) => r.cr)) - Math.min(...rows.map((r) => r.cr)) : 0;
  return (
    <div className="grid g-4 mb">
      <Metric k="Highest risk" v={worst?.branch ?? '–'} n={`score ${worst?.risk ?? 0} · ${worst?.cr ?? 0}% of reviews are complaints`} />
      <Metric k="Lowest risk" v={best?.branch ?? '–'} n={`score ${best?.risk ?? 0} · use as the coaching benchmark`} />
      <Metric k="Spread in complaint rate" v={spread.toFixed(1) + ' pts'} n="between best and worst branch — this is a management gap, not noise" />
      <Metric k="Sample coverage" v={total ? ((100 * read) / total).toFixed(1) + '%' : '—'} n={total ? `${read} of ${total} Google reviews read` : `${read} Google reviews read`} />
    </div>
  );
}

function ScopeSummary({ view, points }: { view: View; points: BranchPoint[] }) {
  if (!view.isSet) {
    return (
      <div className="panel mb">
        <PanelHead title="Currently showing" tag="everything" />
        <div className="p-note" style={{ marginBottom: 0 }}>No scope set. All {points.length} branches in the index are listed below — use the scope control in the header to narrow down.</div>
      </div>
    );
  }
  const mix = points.reduce((a, p) => addMix(a, p.mix), NO_MIX);
  const scored = mix.total >= MIN_N;
  return (
    <div className="panel mb">
      <PanelHead title="Currently showing" tag={view.cur.level} />
      <div className="p-note" style={{ marginBottom: 12 }}>
        {view.trail.map((t, i) => <span key={i}>{i > 0 && <span style={{ color: '#C3D3D1' }}> ▸ </span>}{t}</span>)}
      </div>
      <div className="grid g-4">
        {([
          ['Area', view.scopeName, `${points.length} ${plural(points.length, 'branch', 'branches')}`],
          ['Reviews', readOf(mix).toLocaleString('en-US'), `${mix.good} positive · ${mix.neutral} neutral · ${mix.bad} negative · ${mix.irrelevant} irrelevant/spam`],
          ['Sentiment score', scored ? mix.score : '—', scored ? 'scored on the current window' : `under the ${MIN_N}-review minimum`],
          ['Negative share', `${share(mix.bad, readOf(mix))}%`, 'of reviews in this area'],
        ] as const).map(([k, v, n]) => (
          <div key={k} className="metric"><div className="k">{k}</div><div className="v" style={{ fontSize: 21 }}>{v}</div><div className="n">{n}</div></div>
        ))}
      </div>
    </div>
  );
}

function TopBottom({ view, points }: { view: View; points: BranchPoint[] }) {
  const router = useRouter();
  const s = points.filter((p) => p.enough).sort((a, b) => b.mix.score! - a.mix.score!);
  const topN = Math.min(5, Math.ceil(s.length / 2));
  const botN = Math.min(5, s.length - topN);
  const hidden = Math.max(0, s.length - topN - botN);
  const tag = `${s.length} scored · ${view.scopeName ?? 'all areas'}` + (hidden ? ` · ${hidden} in the middle not listed` : '');
  const empty = <div className="empty-note">Needs at least two scored branches in the selection. {s.length ? 'Only one qualifies here.' : 'None qualifies here.'}</div>;

  const list = (rows: BranchPoint[], rank: (i: number) => number) => {
    const max = Math.max(1, ...rows.map((p) => p.mix.score!));
    return (
      <table>
        <tbody>
          {rows.map((p, i) => {
            const c = scoreColor(p.mix.score);
            return (
              <tr key={p.place.id} className="clickable" onClick={() => router.push(branchHref(p.place.id))}>
                <td className="n" style={{ width: 30 }}><span className="sub">#{rank(i)}</span></td>
                <td>
                  <b>{p.place.name}</b>
                  <div className="sub">{p.place.kecamatan ?? p.place.kota ?? p.place.city} · {readOf(p.mix).toLocaleString('en-US')} reviews</div>
                  <div style={{ marginTop: 5 }}><MixBar mix={p.mix} height={7} /></div>
                </td>
                <td className="n" style={{ width: 64 }}>
                  <b style={{ color: c }}>{p.mix.score}</b>
                  <div className="meter" style={{ marginTop: 5, minWidth: 46 }}><i style={{ width: `${(100 * p.mix.score!) / max}%`, background: c }} /></div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="grid g-2 mb">
      <div className="panel">
        <PanelHead title="Top 5 branches" tag={tag} />
        <div className="p-note">The coaching benchmark. Ranked on sentiment score, so volume does not buy a place here.</div>
        {s.length < 2 ? empty : list(s.slice(0, topN), (i) => i + 1)}
      </div>
      <div className="panel">
        <PanelHead title="Bottom 5 branches" tag={tag} />
        <div className="p-note">Branches under the minimum review count are left out of both lists rather than dropped to the bottom.</div>
        {s.length < 2 ? empty : list(s.slice(-botN).reverse(), (i) => s.length - i)}
      </div>
    </div>
  );
}

function AreaTrend({ view, months: loaded }: { view: View; months: SignalMonth[] | undefined }) {
  const months = useMemo(() => loaded ?? [], [loaded]);
  const config = useMemo((): ChartConfig<'bar' | 'line'> => {
    const bar = { type: 'bar' as const, stack: 'a', borderRadius: 3 };
    return {
      data: {
        labels: months.map((m) => monthLabel(m.month)),
        datasets: [
          { ...bar, label: 'Positive', data: months.map((m) => m.good), backgroundColor: T.grow },
          { ...bar, label: 'Neutral', data: months.map((m) => m.neutral), backgroundColor: NEUTRAL },
          { ...bar, label: 'Negative', data: months.map((m) => m.bad), backgroundColor: T.sig },
          { ...bar, label: 'Irrelevant/spam', data: months.map((m) => m.irrelevant), backgroundColor: IRRELEVANT },
          { type: 'line', label: 'Score', yAxisID: 'y1', data: months.map((m) => m.score),
            borderColor: T.ink, borderWidth: 1.5, tension: 0.35, pointRadius: 0, spanGaps: true },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end', labels: { font: { size: 10.5 } } } },
        scales: {
          x: { ...NOGRID, stacked: true }, y: { ...AXIS, stacked: true, beginAtZero: true },
          y1: { position: 'right', min: 0, max: 100, grid: { display: false }, border: { display: false } },
        },
      },
    };
  }, [months]);
  if (!loaded) return <div className="empty-note">Loading the monthly series…</div>;
  if (!months.length) return <div className="empty-note">{view.isSet ? `No read reviews for ${view.scopeName} in this window.` : 'No reviews in this window.'}</div>;
  return (
    <>
      <div className="p-note">Three-way split per month for the selected area, from reviews actually read.</div>
      <ChartBox config={config} />
    </>
  );
}

function AreaPanel({ view, points }: { view: View; points: BranchPoint[] }) {
  const router = useRouter();
  const list = [...points].sort((a, b) => (a.enough ? a.mix.score! : 999) - (b.enough ? b.mix.score! : 999));
  const scored = list.filter((p) => p.enough);
  const lo = scored[0], hi = scored[scored.length - 1];
  const total = points.reduce((a, p) => addMix(a, p.mix), NO_MIX);
  return (
    <div className="panel mb">
      <PanelHead title={view.scopeName ? `Branches in ${view.scopeName}` : 'All branches in the index'} tag={`${list.length} branches`} />
      <div className="p-note">
        Sentiment here is the three-way split: positive, neutral, negative. A wordless high rating counts as neutral, not positive — it is a tap, not an opinion.{' '}
        <span style={{ marginLeft: 6 }}><Formula /></span>
      </div>
      <div className="t-scroll" style={{ maxHeight: 380 }}>
        <table>
          <thead>
            <tr><th>Branch</th><th>Area</th><th className="n">Reviews</th><th>Sentiment mix</th><th className="n">Score</th><th /></tr>
          </thead>
          <tbody>
            {list.length ? list.map(({ place: b, mix, enough }) => (
              <tr key={b.id} className="clickable" onClick={() => router.push(branchHref(b.id))}>
                <td><b>{b.name}</b></td>
                <td>{b.kecamatan ?? b.kota ?? b.city}<div className="sub">{b.province ?? 'not placed'}</div></td>
                <td className="n">{readOf(mix).toLocaleString('en-US')}</td>
                <td><MixBar mix={mix} /><div className="sub">{mix.good} / {mix.neutral} / {mix.bad} / {mix.irrelevant}</div></td>
                <td className="n">
                  <b style={{ color: scoreColor(mix.score, enough) }}>{enough ? mix.score : '—'}</b>
                  {!enough && <div className="sub">under {MIN_N}</div>}
                </td>
                <td><button className="btn2" style={{ padding: '5px 11px' }}>Open</button></td>
              </tr>
            )) : <EmptyRow colSpan={6}>No branch in this area.</EmptyRow>}
          </tbody>
        </table>
      </div>
      {scored.length > 1 && (
        <AiNote title="What separates the ends of this list">
          {lo.place.name} scores {lo.mix.score} with {lo.mix.bad} negative out of {lo.mix.total} reviews, against {hi.place.name} at {hi.mix.score}.{' '}
          Across this area {share(total.bad, readOf(total))}% of reviews are negative and {share(total.irrelevant, readOf(total))}% are irrelevant or spam.{' '}
          {lo.mix.total < 40 ? 'The lowest scorer also has thin volume, so treat its position as provisional.' : 'Volumes are comparable, so the gap is about service rather than sample size.'}
        </AiNote>
      )}
    </div>
  );
}

function CoverageNote({ rows }: { rows: Row[] }) {
  const cov = rows.filter((r) => r.universe).map((r) => r.coverage);
  const lo = Math.min(...cov), hi = Math.max(...cov);
  return (
    <div className="p-note">
      Coverage is the share of that branch&apos;s real Google review count captured in this scrape.{' '}
      {cov.length > 1 && lo !== hi ? `Because it ranges from ${lo}% to ${hi}%, compare` : 'Compare'} branches on rates, never on counts.
    </div>
  );
}

function BranchTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState<RowKey>>(['risk', 'desc']);
  return (
    <div className="t-scroll">
      <table>
        <SortHead cols={COLS} sort={sort} onSort={(f) => setSort((s) => nextSort(s, f))} />
        <tbody>
          {rows.length ? sortRows(rows, sort).map((r) => {
            const c = riskColor(r.risk);
            return (
              <tr key={r.branch_id} className="clickable" onClick={() => router.push(branchHref(r.branch_id))}>
                <td style={{ minWidth: 170 }}><b>{r.branch}</b><div className="sub">{r.where}</div></td>
                <td className="n">{r.n}{r.universe > 0 && <div className="sub">of {r.universe}</div>}</td>
                <td className="n">{r.universe ? r.coverage + '%' : '—'}</td>
                <td className="n" style={alarm(r.avg !== null && r.avg < 4)}>{r.avg?.toFixed(2) ?? '—'}</td>
                <td className="n" title="The star average Google shows the public, before this scrape's sampling">{r.public_score?.toFixed(1) ?? '—'}</td>
                <td className="n" style={alarm(r.cr > 15)}>{r.cr}%</td>
                <td className="n">{r.crit}</td>
                <td className="n" style={alarm(r.reg)}>{r.reg || '—'}</td>
                <td className="n" style={alarm(r.owner_reply !== null && r.owner_reply < 50)}>{r.owner_reply !== null ? r.owner_reply + '%' : '—'}</td>
                <td className="n">{r.oldest}d</td>
                <td className="n">{r.no_text_pct}%</td>
                <td className="n">{r.first_timer_pct}%</td>
                <td className="n">
                  <b style={{ color: c }}>{r.risk}</b>
                  <div className="meter" style={{ marginTop: 5 }}><i style={{ width: `${r.risk}%`, background: c }} /></div>
                </td>
              </tr>
            );
          }) : <EmptyRow colSpan={COLS.length}>No branch reviews in this view.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

type CompMode = 'rating' | 'coverage';
const COMP_MODES: [CompMode, string][] = [['rating', 'Rating mix'], ['coverage', 'Sample coverage']];

function Composition({ rows }: { rows: Row[] }) {
  const [mode, setMode] = useState<CompMode>('rating');
  const config = useMemo((): ChartConfig<'bar'> => {
    const legend = { position: 'top' as const, align: 'end' as const, labels: { font: { size: 10.5 } } };
    const scales = { x: { ...AXIS, stacked: true, beginAtZero: true }, y: { ...NOGRID, stacked: true } };
    if (mode === 'rating') {
      const bl = [...rows].sort((a, b) => a.branch.localeCompare(b.branch));
      return {
        type: 'bar',
        data: {
          labels: bl.map((b) => b.branch),
          datasets: [1, 2, 3, 4, 5].map((s, i) => ({ label: s + '★', data: bl.map((b) => b.stars[i]), backgroundColor: STAR[i], stack: 'a', borderRadius: 2 })),
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: {
            legend,
            tooltip: { callbacks: { label: (c) => { const t = bl[c.dataIndex].stars.reduce((a, b) => a + b, 0); const x = c.parsed.x ?? 0; return `${c.dataset.label} — ${x} (${share(x, t)}%)`; } } },
          },
          scales,
        },
      };
    }
    const b = rows.filter((r) => r.universe).sort((x, y) => y.universe - x.universe);
    return {
      type: 'bar',
      data: {
        labels: b.map((x) => x.branch),
        datasets: [
          { label: 'Read', data: b.map((x) => x.n), backgroundColor: T.deep, borderRadius: 4, stack: 'a' },
          { label: 'Not read', data: b.map((x) => Math.max(0, x.universe - x.n)), backgroundColor: '#D6E5E3', borderRadius: 4, stack: 'a' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend, tooltip: { callbacks: { afterBody: (c) => `coverage ${b[c[0].dataIndex].coverage}%` } } },
        scales,
      },
    };
  }, [rows, mode]);
  return (
    <div className="panel mb">
      <div className="p-head"><h3>{mode === 'rating' ? 'Rating mix' : 'Sample coverage'}</h3><Chips flush options={COMP_MODES} value={mode} onPick={setMode} /></div>
      <div className="p-note">
        {mode === 'rating'
          ? 'A branch with no one-star reviews is not necessarily healthy. A branch whose one-star reviews repeat the same topic definitely is not.'
          : 'Grey is what exists on Google. Dark is what this prototype has read. Closing this gap is the first job of the production pipeline.'}
      </div>
      {rows.length ? <ChartBox config={config} /> : <div className="empty-note">No branch reviews in this view.</div>}
    </div>
  );
}

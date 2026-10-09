'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { AiNote, ApiPage, Bridge, Chips, EmptyRow, Formula, Metric, MixBar, PanelHead } from '@/components/ui';
import { getJson, useApi } from '@/lib/api';
import { NO_SCOPE, useFilters } from '@/lib/filters';
import { GEO_METRICS, SCORE_RAMP, toAreas, toPoints, type Area, type BranchPoint, type GeoMetric, type RegionCollection } from '@/lib/geo';
import { branchHref } from '@/lib/pages';
import { useReference } from '@/lib/reference';
import { pickScope, useView, type AreaLevel, type View } from '@/lib/scope';
import { MIN_N, NO_MIX, addMix, readOf, scoreColor, share } from '@/lib/signal';
import { IRRELEVANT, NEUTRAL, T, plural } from '@/lib/theme';
import type { SignalBranchesResponse } from '@/lib/types';

const GeoMap = dynamic(() => import('@/components/GeoMap'), {
  ssr: false,
  loading: () => <div className="geo-map geo-wait">Loading map…</div>,
});

/* Outlines shipped with the dashboard (public/geo), taken from the v15 prototype: every province,
 * and the kabupaten/kota of the three provinces it covered. The master tables hold Jakarta Barat
 * only, so without these the national view would be one province wide and nothing outside it
 * could be drawn as an area. A province is drawn from the shipped outline, because the master
 * tables merge it from whichever kecamatan they hold — DKI Jakarta would come out as Jakarta Barat
 * alone. For a kota the master outline is the one used where it exists. */
function useOutlines(file: 'province' | 'kota' | null): RegionCollection | undefined {
  const [got, setGot] = useState<{ file: string; data: RegionCollection } | null>(null);
  useEffect(() => {
    if (!file) return;
    let live = true;
    getJson<RegionCollection>(`/geo/${file}.json`).then((data) => { if (live) setGot({ file, data }); }, () => { /* the map falls back to the master outlines alone */ });
    return () => { live = false; };
  }, [file]);
  return got && got.file === file ? got.data : undefined;
}

/** "Kota Jakarta Barat" and "Jakarta Barat" are the same place under two spellings. */
const bare = (name: string) => name.replace(/^(kota|kabupaten|kab\.?)\s+/i, '').toLowerCase();

const LEVEL_PLURAL: Record<AreaLevel, string> = { province: 'Provinces', kota: 'Kota and kabupaten', kecamatan: 'Kecamatan' };

export function GeographyView() {
  const view = useView('geography');
  const { sel } = view;
  /* Everything inside the area the map is drawn for. A kecamatan or branch scope dims the rest of its kota, it does not remove it. */
  const frame = sel.kota ? { scope_level: 'kota', scope_value: sel.kota } : sel.province ? { scope_level: 'province', scope_value: sel.province } : {};
  const res = useApi<SignalBranchesResponse>('/v1/signal/branches', { ...frame, from: view.from });
  return <ApiPage res={res}>{(d) => <Geography view={view} data={d} />}</ApiPage>;
}

function Geography({ view, data }: { view: View; data: SignalBranchesResponse }) {
  const { places } = useReference();
  const { setFilter } = useFilters();
  const router = useRouter();
  const [metric, setMetric] = useState<GeoMetric>('score');
  const { sel, cur } = view;

  /* The map shows the level one step below the scope: no scope → provinces, a province → its kota,
   * a kota → its kecamatan. Drilling the map sets the scope, so the two can never disagree. */
  const level: AreaLevel = cur.level === 'all' ? 'province' : cur.level === 'province' ? 'kota' : 'kecamatan';
  const focus = cur.level === 'kecamatan' || cur.level === 'branch' ? sel.kecamatan : null;

  const provinsi = useApi<RegionCollection>('/v1/areas/regions', { level: 'provinsi' });
  const kabkota = useApi<RegionCollection>(level === 'province' ? null : '/v1/areas/regions', { level: 'kabkota' });
  const kecamatan = useApi<RegionCollection>(level === 'kecamatan' ? '/v1/areas/kecamatan' : null);
  const boundaries = level === 'province' ? provinsi : level === 'kota' ? kabkota : kecamatan;

  const shipped = useOutlines(level === 'kecamatan' ? null : level);

  const features = useMemo(() => {
    const master = (boundaries.data?.features ?? []).filter((f) =>
      level === 'province' ? true : level === 'kota' ? f.properties.provinsi === sel.province : f.properties.kabkota === sel.kota);
    if (level === 'kecamatan') return master;
    const ours = (shipped?.features ?? []).filter((f) => level === 'province' || f.properties.provinsi === sel.province);
    /* One outline per area: the preferred set, and the other one wherever it has nothing. */
    const [first, rest] = level === 'province' ? [ours, master] : [master, ours];
    const have = new Set(first.map((f) => bare(f.properties.nama)));
    return [...first, ...rest.filter((f) => !have.has(bare(f.properties.nama)))];
  }, [boundaries.data, shipped, level, sel.province, sel.kota]);

  const points = useMemo(() => toPoints(data), [data]);
  const placed = useMemo(() => points.filter((p) => p.place[level]), [points, level]);
  const unplaced = useMemo(() => (level === 'province' ? points.filter((p) => !p.place.province) : []), [points, level]);
  const areas = useMemo(() => toAreas(data, level), [data, level]);
  const byName = useMemo(() => new Map(areas.map((a) => [a.name, a])), [areas]);

  /* One representation per level. Down to kota the polygons carry the data. At kecamatan level
   * they become context and the branches are drawn as points — colouring a whole kecamatan for two
   * branches would make the largest area look like the worst one. An area with no boundary in the
   * master tables is drawn as its branches' points at any level, and the note says so. */
  const outline = level === 'kecamatan';
  const drawn = useMemo(() => new Set(features.map((f) => f.properties.nama)), [features]);
  const markers = useMemo(() => {
    const located = points.filter((p) => p.place.lat != null && p.place.lng != null);
    if (!boundaries.data) return [];
    return outline ? located : located.filter((p) => !p.place[level] || !drawn.has(p.place[level]!));
  }, [points, outline, level, drawn, boundaries.data]);
  const noBoundary = useMemo(() => [...new Set(markers.map((p) => p.place[level]).filter((n): n is string => !!n && !drawn.has(n)))], [markers, level, drawn]);
  const ranked = useMemo(() => points.filter((p) => p.enough).length, [points]);
  const openBranch = useCallback((id: string) => router.push(branchHref(id)), [router]);

  const drill = useCallback((name: string) => {
    setFilter('scope', pickScope(level, name, places));
    /* A kecamatan is as far as the map goes; the branches inside it are listed on Area & Branch. */
    if (level === 'kecamatan') router.push('/branches');
  }, [level, places, router, setFilter]);

  const title = level === 'province' ? 'Indonesia — by province'
    : level === 'kota' ? `${sel.province} — by kota and kabupaten`
    : `${sel.kota} — branches by kecamatan`;

  return (
    <>
      <div className="crumb">
        {level === 'province' ? <span className="here">Indonesia</span> : <button onClick={() => setFilter('scope', NO_SCOPE)}>Indonesia</button>}
        {level !== 'province' && (
          <>
            <span className="sep">▸</span>
            {level === 'kota' ? <span className="here">{sel.province}</span>
              : <button onClick={() => setFilter('scope', pickScope('province', sel.province, places))}>{sel.province}</button>}
          </>
        )}
        {level === 'kecamatan' && (
          <>
            <span className="sep">▸</span>
            {focus ? <button onClick={() => setFilter('scope', pickScope('kota', sel.kota, places))}>{sel.kota}</button> : <span className="here">{sel.kota}</span>}
          </>
        )}
        {focus && <><span className="sep">▸</span><span className="here">{view.scopeName}</span></>}
      </div>

      <GeoMetrics areas={areas} points={placed} />

      <div className="panel mb" style={{ paddingBottom: 0 }}>
        <div className="p-head"><h3>{title}</h3><Chips flush options={GEO_METRICS} value={metric} onPick={setMetric} /></div>
        <div className="p-note">
          {focus && <><b style={{ color: 'var(--ink)' }}>Scoped to {view.scopeName}.</b> The map stays at kecamatan level so you can see it in context — everything outside the scope is dimmed, not hidden. </>}
          {outline
            ? 'At kecamatan level the polygons stop carrying the data and become context. Branches are drawn as points: colour is sentiment, size is review volume. Colouring a whole kecamatan for two branches would make the largest area look like the worst one.'
            : 'Colour runs on the selected metric. Areas under the minimum review count stay grey — a score built on a handful of reviews is noise. Click an area that holds branches to drill in.'}
          {noBoundary.length > 0 && ` No boundary geometry for ${noBoundary.join(', ')} in the master tables, so ${plural(noBoundary.length, 'its', 'their')} branches are drawn as points instead.`}
          {unplaced.length > 0 && ` ${unplaced.length} ${plural(unplaced.length, 'branch has', 'branches have')} no area on record yet and ${plural(unplaced.length, 'is', 'are')} left off this level.`}
        </div>
        {boundaries.error
          ? <div className="empty-note">Boundaries could not be loaded. {boundaries.error}</div>
          : <GeoMap features={features} areas={byName} metric={metric} national={level === 'province'} outline={outline}
              points={markers} ranked={ranked} focus={focus} onPick={drill} onBranch={openBranch} />}
        <Legend metric={metric} points={markers.length > 0} polygons={!outline && features.length > 0} />
        <MapNote areas={areas} level={level} />
        <div style={{ height: 16 }} />
      </div>

      <div className="grid g-2 mb">
        <div className="panel">
          <PanelHead title={`Review distribution — ${LEVEL_PLURAL[level].toLowerCase()}`} tag="positive · neutral · negative · irrelevant/spam" />
          <div className="p-note">A map is good at where, bad at how much. This is the same areas as columns, so volumes can actually be compared.</div>
          <DistChart areas={areas} />
        </div>
        <div className="panel">
          <PanelHead title="Severity against volume" tag="x = reviews · y = % negative · size = negative count" />
          <div className="p-note">The left edge is where thin data lives. A branch high on the y-axis but far left is one angry customer, not a failing branch — this chart separates the two without anyone having to remember the rule.</div>
          <SeverityChart points={points} />
        </div>
      </div>

      <div className="panel mb">
        <PanelHead title={`${LEVEL_PLURAL[level]} in view`} tag="click a row to drill in" />
        <div className="p-note">Areas below the minimum review count are listed but not ranked — a score built on a handful of reviews is noise, and colouring it would put the wrong place at the top.</div>
        <RankTable areas={areas} level={level} onPick={drill} />
      </div>

      <div className="panel">
        <PanelHead title="Where each branch was placed" tag={`${placed.length} of ${points.length} branches placed`} />
        <div className="p-note">
          Each branch is matched on the &ldquo;Kec.&rdquo; part of its address against the master kecamatan, and only when the address is in the same city.
          Where the master tables do not hold that kecamatan, the area Google publishes for the place is used, and the branch is drawn as a point with no boundary behind it.
        </div>
        <PlacedTable points={points} />
      </div>
      <Bridge from="geography" />
    </>
  );
}

function GeoMetrics({ areas, points }: { areas: Area[]; points: BranchPoint[] }) {
  const mix = points.reduce((a, p) => addMix(a, p.mix), NO_MIX);
  const worst = areas.filter((a) => a.enough).sort((a, b) => a.mix.score! - b.mix.score!)[0];
  return (
    <div className="grid g-4 mb">
      <Metric k="Areas in view" v={areas.length} n={`${points.length} branches, ${readOf(mix).toLocaleString('en-US')} reviews`} />
      <Metric k="Sentiment score" v={mix.score ?? '—'} n="across everything in this view" />
      <Metric k="Positive / negative" v={`${mix.good.toLocaleString('en-US')} / ${mix.bad.toLocaleString('en-US')}`} n={`${share(mix.bad, readOf(mix))}% negative, ${share(mix.irrelevant, readOf(mix))}% irrelevant/spam`} />
      <Metric k="Lowest scoring" v={worst?.name ?? '—'} n={worst ? `score ${worst.mix.score}, ${worst.mix.bad} negative reviews` : 'nothing scored yet'} />
    </div>
  );
}

/** What a branch point says: colour is always the sentiment score, size the number of reviews read. */
function PointKey() {
  return (
    <>
      <span className="pt-key">
        <b style={{ color: 'var(--ink)' }}>Branch</b>
        {[5, 9, 14].map((r) => <i key={r} style={{ width: r * 2, height: r * 2 }} />)}
        <span>few &nbsp;→&nbsp; many reviews</span>
      </span>
      <span className="pt-key"><i className="thin" style={{ width: 14, height: 14 }} />under {MIN_N} reviews, not scored</span>
    </>
  );
}

function Legend({ metric, points, polygons }: { metric: GeoMetric; points: boolean; polygons: boolean }) {
  if (metric === 'score' || !polygons) {
    return (
      <div className="legend">
        <span><b style={{ color: 'var(--ink)' }}>Sentiment score</b></span>
        <span className="ramp">{SCORE_RAMP.map((c) => <i key={c} style={{ background: c }} />)}</span>
        <span>0 &nbsp;→&nbsp; 100</span>
        {polygons && <span><span className="swatch hatch" />under {MIN_N} reviews, not scored</span>}
        {points && <PointKey />}
        <Formula />
      </div>
    );
  }
  const rgb = metric === 'bad' || metric === 'unanswered' ? '200,50,43' : metric === 'good' ? '31,140,132' : metric === 'irrelevant' ? '84,104,101' : '19,89,85';
  const label = { bad: 'Negative reviews', good: 'Positive reviews', irrelevant: 'Irrelevant/spam reviews', total: 'Review volume', unanswered: 'Unanswered complaints' }[metric];
  return (
    <div className="legend">
      <span><b style={{ color: 'var(--ink)' }}>{label}</b></span>
      <span className="ramp">{[0.15, 0.45, 0.75, 0.95].map((a) => <i key={a} style={{ background: `rgba(${rgb},${a})` }} />)}</span>
      <span>low &nbsp;→&nbsp; high</span>
      <span><span className="swatch hatch" />no branch in this area</span>
      {points && <PointKey />}
    </div>
  );
}

function MapNote({ areas, level }: { areas: Area[]; level: AreaLevel }) {
  const scored = areas.filter((a) => a.enough).sort((a, b) => a.mix.score! - b.mix.score!);
  if (!scored.length) return null;
  const worst = scored[0], best = scored[scored.length - 1];
  const thin = areas.length - scored.length;
  const gap = Math.round((best.mix.score! - worst.mix.score!) * 10) / 10;
  return (
    <AiNote title="What this map shows">
      {worst.name} sits lowest at {worst.mix.score}, with {worst.mix.bad} negative reviews out of {worst.mix.total}.{' '}
      {scored.length > 1 && <>
        {best.name} sits highest at {best.mix.score}. The spread between the best and worst {level} is {gap} points,{' '}
        {gap > 20 ? 'wide enough that this is a management difference rather than noise' : 'narrow enough that no single area stands out yet'}.{' '}
      </>}
      {thin > 0 && `${thin} ${plural(thin, 'area is', 'areas are')} left unscored for having fewer than ${MIN_N} reviews.`}
    </AiNote>
  );
}

function DistChart({ areas }: { areas: Area[] }) {
  const rows = useMemo(() => [...areas].sort((a, b) => readOf(b.mix) - readOf(a.mix)).slice(0, 14), [areas]);
  const config = useMemo((): ChartConfig<'bar'> => {
    const bar = { stack: 'a', borderRadius: 3 };
    return {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          { ...bar, label: 'Positive', data: rows.map((r) => r.mix.good), backgroundColor: T.grow },
          { ...bar, label: 'Neutral', data: rows.map((r) => r.mix.neutral), backgroundColor: NEUTRAL },
          { ...bar, label: 'Negative', data: rows.map((r) => r.mix.bad), backgroundColor: T.sig },
          { ...bar, label: 'Irrelevant/spam', data: rows.map((r) => r.mix.irrelevant), backgroundColor: IRRELEVANT },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { position: 'top', align: 'end', labels: { font: { size: 10.5 } } },
          tooltip: { callbacks: { afterBody: (c) => { const r = rows[c[0].dataIndex]; return r.enough ? `score ${r.mix.score}` : `under the ${MIN_N}-review minimum`; } } },
        },
        scales: { x: { ...AXIS, stacked: true, beginAtZero: true }, y: { ...NOGRID, stacked: true } },
      },
    };
  }, [rows]);
  if (!rows.length) return <div className="empty-note">No branch in this area yet.</div>;
  return <ChartBox config={config} />;
}

function SeverityChart({ points }: { points: BranchPoint[] }) {
  const pts = useMemo(() => points.filter((p) => p.mix.total > 0).map((p) => ({
    x: p.mix.total, y: Math.round((1000 * p.mix.bad) / p.mix.total) / 10,
    r: Math.max(4, Math.min(20, 3 + Math.sqrt(p.mix.bad) * 2.2)), p,
  })), [points]);
  const ok = useMemo(() => pts.filter((p) => p.p.enough), [pts]);
  const thin = useMemo(() => pts.filter((p) => !p.p.enough), [pts]);
  const config = useMemo((): ChartConfig<'bubble'> => ({
    type: 'bubble',
    data: {
      datasets: [
        { label: 'Scored', data: ok, borderColor: '#0B2320', borderWidth: 0.8,
          backgroundColor: ok.map((p) => (p.y >= 25 ? 'rgba(200,50,43,.55)' : p.y >= 12 ? 'rgba(216,128,31,.5)' : 'rgba(31,140,132,.45)')) },
        { label: `Under ${MIN_N} reviews`, data: thin, backgroundColor: 'rgba(143,165,163,.18)', borderColor: '#8FA5A3', borderWidth: 1.2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end', labels: { font: { size: 10.5 } } },
        tooltip: {
          callbacks: {
            title: (c) => (c[0].raw as typeof pts[number]).p.place.name,
            label: (c) => { const r = c.raw as typeof pts[number]; return `${r.x} reviews · ${r.y}% negative · ${r.p.mix.bad} negative`; },
            afterLabel: (c) => { const r = c.raw as typeof pts[number]; return r.p.enough ? `score ${r.p.mix.score}` : 'not scored'; },
          },
        },
      },
      scales: {
        x: { ...AXIS, beginAtZero: true, title: { display: true, text: 'reviews read' } },
        y: { ...AXIS, beginAtZero: true, title: { display: true, text: '% negative' } },
      },
    },
  }), [ok, thin]);
  if (!pts.length) return <div className="empty-note">No reviews read for the branches in this view.</div>;
  const risky = ok.filter((p) => p.y >= 20).sort((a, b) => b.p.mix.bad - a.p.mix.bad);
  const thinNote = thin.length ? `${thin.length} ${plural(thin.length, 'branch is', 'branches are')} left unscored for thin volume` : '';
  return (
    <>
      <ChartBox config={config} />
      <AiNote title="Reading this chart">
        {risky.length ? (
          <>
            {risky.length} scored {plural(risky.length, 'branch sits', 'branches sit')} above 20% negative.{' '}
            {risky[0].p.place.name} is the heaviest at {risky[0].y}% across {risky[0].x} reviews.{' '}
            {thinNote && `${thinNote} — check them again once the scrape is complete rather than acting on today's ratio.`}
          </>
        ) : <>Nothing scored sits above 20% negative in this view.{thinNote && ` ${thinNote}.`}</>}
      </AiNote>
    </>
  );
}

function RankTable({ areas, level, onPick }: { areas: Area[]; level: AreaLevel; onPick: (name: string) => void }) {
  const rows = [...areas].sort((a, b) => (a.enough !== b.enough ? (a.enough ? -1 : 1) : (a.mix.score ?? 999) - (b.mix.score ?? 999)));
  return (
    <div className="t-scroll">
      <table>
        <thead>
          <tr><th>Area</th><th className="n">Branches</th><th className="n">Reviews</th><th>Sentiment mix</th><th className="n">Score</th><th className="n">Unanswered</th></tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((a) => (
            <tr key={a.name} className="clickable" onClick={() => onPick(a.name)}>
              <td><b>{a.name}</b><div className="sub">{level === 'kecamatan' ? 'click to open its branches' : 'click to drill in'}</div></td>
              <td className="n">{a.branches}</td>
              <td className="n">{readOf(a.mix).toLocaleString('en-US')}</td>
              <td><MixBar mix={a.mix} /><div className="sub">{a.mix.good} / {a.mix.neutral} / {a.mix.bad} / {a.mix.irrelevant}</div></td>
              <td className="n">
                <b style={{ color: scoreColor(a.mix.score, a.enough) }}>{a.enough ? a.mix.score : '—'}</b>
                {!a.enough && <div className="sub">under {MIN_N}</div>}
              </td>
              <td className="n">{a.unanswered || '—'}</td>
            </tr>
          )) : <EmptyRow colSpan={6}>No branch in this area yet.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

function PlacedTable({ points }: { points: BranchPoint[] }) {
  const router = useRouter();
  return (
    <div className="t-scroll" style={{ maxHeight: 380 }}>
      <table>
        <thead>
          <tr><th>Branch</th><th>Kecamatan in the address</th><th>Placed in</th><th className="n">Reviews</th><th className="n">Sentiment</th><th className="n">Negative</th><th className="n">Irrelevant/spam</th><th className="n">Never answered</th></tr>
        </thead>
        <tbody>
          {points.length ? points.map(({ place: b, mix, enough, unanswered }) => (
            <tr key={b.id} className="clickable" onClick={() => router.push(branchHref(b.id))}>
              <td><b>{b.name}</b><div className="sub">{b.address ?? b.city}</div></td>
              <td>{b.stated_kecamatan ?? '—'}</td>
              <td>{b.kecamatan ?? <span style={{ color: 'var(--ink-3)' }}>not placed</span>}{b.kecamatan && <div className="sub">{[b.kota, b.province].filter(Boolean).join(', ')}</div>}</td>
              <td className="n">{readOf(mix)}</td>
              <td className="n"><b style={{ color: scoreColor(mix.score, enough) }}>{enough ? mix.score : '—'}</b></td>
              <td className="n">{mix.bad}</td>
              <td className="n">{mix.irrelevant || '—'}</td>
              <td className="n">{unanswered}</td>
            </tr>
          )) : <EmptyRow colSpan={8}>No branch in this scope.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

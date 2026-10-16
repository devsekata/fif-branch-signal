'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { AiNote, ApiPage, Bridge, Chips, EmptyRow, Formula, Metric, MixBar, PanelHead } from '@/components/ui';
import { getJson, useApi } from '@/lib/api';
import { NO_SCOPE, useFilters } from '@/lib/filters';
import { GEO_METRICS, SCORE_BANDS, scoreBand, toAreas, toPoints, type Area, type BranchPoint, type GeoMetric, type RegionCollection } from '@/lib/geo';
import { branchHref } from '@/lib/pages';
import { useReference } from '@/lib/reference';
import { pickScope, useView, type AreaLevel, type View } from '@/lib/scope';
import { MIN_N, NO_MIX, addMix, readOf, share } from '@/lib/signal';
import { IRRELEVANT, NEUTRAL, T, plural, fmt } from '@/lib/theme';
import type { SignalBranchesResponse } from '@/lib/types';

const GeoMap = dynamic(() => import('@/components/GeoMap'), {
  ssr: false,
  loading: () => <div className="geo-map geo-wait">Loading map…</div>,
});

/* Outlines shipped with the dashboard (public/geo), taken from the v15 prototype: most provinces,
 * and the kabupaten/kota of the three provinces it covered. The master tables now hold an outline
 * for every province and kab/kota, so these are the fallback: a province is drawn from the master,
 * and from here only where the master has nothing. For a kab/kota the shipped outline is drawn
 * where there is one, because it follows the border far more closely than the master's, which is
 * simplified to a dozen points for a kota the size of Jakarta Barat. */
function useOutlines(file: 'province' | 'kota' | null): RegionCollection | undefined {
  const [got, setGot] = useState<{ file: string; data: RegionCollection } | null>(null);
  useEffect(() => {
    if (!file) return;
    let live = true;
    getJson<RegionCollection>(`/geo/${file}.json`).then(
      (data) => { if (live) setGot({ file, data }); },
      /* The map falls back to the master outlines alone; an empty set still says the file has been tried. */
      () => { if (live) setGot({ file, data: { type: 'FeatureCollection', features: [] } }); },
    );
    return () => { live = false; };
  }, [file]);
  return got && got.file === file ? got.data : undefined;
}

/** "Kota Jakarta Barat" and "Jakarta Barat" are the same place under two spellings. */
const bare = (name: string) => name.replace(/^(kota|kabupaten|kab\.?)\s+(administrasi\s+)?/i, '').toLowerCase();
/** A province under whichever spelling: "Daerah Istimewa Yogyakarta" is "DI Yogyakarta". */
const provKey = (name: string | undefined) => (name ?? '').toLowerCase()
  .replace(/daerah khusus ibu ?kota|daerah khusus/g, 'dki').replace(/daerah istimewa/g, 'di').replace(/[^a-z]/g, '');

const LEVEL_PLURAL: Record<AreaLevel, string> = { province: 'Provinces', kota: 'Kota and kabupaten', kecamatan: 'Kecamatan' };

export function GeographyView() {
  const view = useView('geography');
  const { sel } = view;
  /* Everything inside the area the map is drawn for. A kecamatan or branch scope dims the rest of its kota, it does not remove it. */
  const frame = sel.kota ? { scope_level: 'kota', scope_value: sel.kota } : sel.province ? { scope_level: 'province', scope_value: sel.province } : {};
  const res = useApi<SignalBranchesResponse>('/v1/signal/branches', { ...frame, from: view.from });
  return <ApiPage res={res}>{(d) => <Geography view={view} data={d} loading={res.loading} />}</ApiPage>;
}

function Geography({ view, data, loading }: { view: View; data: SignalBranchesResponse; loading: boolean }) {
  const { places } = useReference();
  const { setFilter } = useFilters();
  const router = useRouter();
  const [metric, setMetric] = useState<GeoMetric>('score');
  const { sel, cur } = view;

  /* The map shows the level one step below the scope: no scope → provinces, a province → its kota,
   * a kota → its kecamatan. Drilling the map sets the scope, so the two can never disagree. */
  const level: AreaLevel = cur.level === 'all' ? 'province' : cur.level === 'province' ? 'kota' : 'kecamatan';
  const focus = cur.level === 'kecamatan' || cur.level === 'branch' ? sel.kecamatan : null;

  /* A province fills a few hundred pixels and a kota is seen closer, so each is asked for at the precision it is drawn at. */
  const provinsi = useApi<RegionCollection>('/v1/areas/regions', { level: 'provinsi', precision: 3 });
  /* At kecamatan level the kota's own outline is still wanted, as the area the map is focused on. */
  const kabkota = useApi<RegionCollection>(level !== 'province' && sel.province ? '/v1/areas/regions' : null, { level: 'kabkota', precision: 4, provinsi: sel.province ?? undefined });
  /* One kota's kecamatan, not the country's: every kecamatan outline at once is more than the API can hold. */
  const kecamatan = useApi<RegionCollection>(level === 'kecamatan' && sel.kota ? '/v1/areas/kecamatan' : null, { kabkota: sel.kota ?? undefined, provinsi: sel.province ?? undefined, precision: 5 });
  const boundaries = level === 'province' ? provinsi : level === 'kota' ? kabkota : kecamatan;

  const shipped = useOutlines(level === 'kecamatan' ? null : level);
  const shippedProvinces = useOutlines(level === 'kota' ? 'province' : null);
  const shippedKota = useOutlines(level === 'kecamatan' ? 'kota' : null);

  const features = useMemo(() => {
    const api = boundaries.data?.features ?? [];
    /* The API already narrowed the kecamatan to this kota, under whichever spelling the master uses. */
    if (level === 'kecamatan') return api;
    const ship = shipped?.features ?? [];
    if (level === 'province') {
      /* One outline per province: the master's own, then the shipped one, and one merged from kecamatan only as a last resort. */
      const out = api.filter((f) => f.properties.source === 'master');
      const have = new Set(out.map((f) => provKey(f.properties.nama)));
      for (const f of [...ship, ...api.filter((f) => f.properties.source !== 'master')]) {
        const k = provKey(f.properties.nama);
        if (!have.has(k)) { have.add(k); out.push(f); }
      }
      return out;
    }
    const here = (f: RegionCollection['features'][number]) => !!sel.province && provKey(f.properties.provinsi) === provKey(sel.province);
    const master = api.filter(here);
    /* A shipped outline takes the master's name for the place, so the data finds it: "Jakarta Barat" is "Kota Jakarta Barat". */
    const exact = new Map(master.map((f) => [f.properties.nama.toLowerCase(), f.properties.nama]));
    const loose = new Map(master.map((f) => [bare(f.properties.nama), f.properties.nama]));
    const ours = ship.filter(here).map((f) => {
      const low = f.properties.nama.toLowerCase();
      const name = exact.get(low) ?? (bare(low) === low ? loose.get(low) : undefined);
      return name && name !== f.properties.nama ? { ...f, properties: { ...f.properties, nama: name } } : f;
    });
    const have = new Set(ours.map((f) => f.properties.nama.toLowerCase()));
    return [...ours, ...master.filter((f) => !have.has(f.properties.nama.toLowerCase()))];
  }, [boundaries.data, shipped, level, sel.province]);

  const points = useMemo(() => toPoints(data), [data]);
  const placed = useMemo(() => points.filter((p) => p.place[level]), [points, level]);
  const unplaced = useMemo(() => (level === 'province' ? points.filter((p) => !p.place.province) : []), [points, level]);
  const areas = useMemo(() => toAreas(data, level), [data, level]);
  const byName = useMemo(() => new Map(areas.map((a) => [a.name, a])), [areas]);

  /* Areas are coloured at every level: provinces, then the kab/kota of a province, then the kecamatan
   * of a kota. The branches show only once a kecamatan is chosen: the kecamatan is reduced to borders
   * and its branches, as points, carry the colour. */
  const outline = level === 'kecamatan' && !!focus;
  const drawn = useMemo(() => new Set(features.map((f) => f.properties.nama)), [features]);
  const markers = useMemo(() => {
    const located = points.filter((p) => p.place.lat != null && p.place.lng != null);
    if (!boundaries.data || !outline) return [];
    return located.filter((p) => p.place.kecamatan === focus);
  }, [points, outline, focus, boundaries.data]);
  const noBoundary = useMemo(() => (boundaries.data ? [...new Set(placed.map((p) => p.place[level]).filter((n): n is string => !!n && !drawn.has(n)))] : []), [placed, level, drawn, boundaries.data]);
  const ranked = useMemo(() => points.filter((p) => p.enough).length, [points]);

  /* The area being looked inside: the province at kota level, the kota at kecamatan level. */
  const focusArea = useMemo(() => {
    /* A chosen kecamatan is the frame. */
    if (outline) return features.find((f) => f.properties.nama === focus) ?? null;
    if (level === 'kota') {
      const all = [...(provinsi.data?.features ?? []), ...(shippedProvinces?.features ?? [])];
      return all.find((f) => provKey(f.properties.nama) === provKey(sel.province ?? '')) ?? null;
    }
    /* A kota is framed by its kecamatan, which trace it closely; its master outline is a rough polygon. */
    if (level === 'kecamatan' && sel.kota && features.length) return null;
    if (level === 'kecamatan' && sel.kota) {
      const all = [...(kabkota.data?.features ?? []), ...(shippedKota?.features ?? [])].filter((f) => provKey(f.properties.provinsi) === provKey(sel.province ?? ''));
      const low = sel.kota.toLowerCase();
      return all.find((f) => f.properties.nama.toLowerCase() === low) ?? all.find((f) => bare(f.properties.nama) === bare(sel.kota!)) ?? null;
    }
    return null;
  }, [outline, features, focus, level, sel.province, sel.kota, provinsi.data, kabkota.data, shippedProvinces, shippedKota]);

  /* Only the area looked inside is drawn, never the borders around it: a chosen kecamatan alone, without its neighbours. */
  const drawnFeatures = useMemo(() => (outline ? features.filter((f) => f.properties.nama === focus) : features), [outline, features, focus]);

  /* A drill changes the level at once, but its outlines and figures arrive later. Until both are in,
   * the map keeps showing what it had, so it never empties and falls back to the whole country. */
  const ready = !!boundaries.data && !boundaries.loading && !loading && (level === 'kecamatan' || !!shipped)
    && (level !== 'kota' || !!shippedProvinces) && (level !== 'kecamatan' || (!kabkota.loading && !!shippedKota));
  const next = useMemo(() => ({ features: drawnFeatures, areas: byName, national: level === 'province', outline, points: markers, focus, area: focusArea }),
    [drawnFeatures, byName, level, outline, markers, focus, focusArea]);
  const [drawnMap, setDrawnMap] = useState(next);
  if (ready && drawnMap !== next) setDrawnMap(next);
  const openBranch = useCallback((id: string) => router.push(branchHref(id)), [router]);

  /* A kecamatan is the last step: choosing one shows its branches on the map. */
  const drill = useCallback((name: string) => setFilter('scope', pickScope(level, name, places)), [level, places, setFilter]);

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
          {focus && <><b style={{ color: 'var(--ink)' }}>Scoped to {view.scopeName}.</b> The map stays at kecamatan level so you can see it in context; the scoped kecamatan and its branches carry a heavier outline. </>}
          {outline
            ? 'Kecamatan are drawn as borders only; the colour is on the branches. Each point is a branch: colour is its sentiment score, size is review volume, grey is under the minimum review count. Click a point to open the branch, or another kecamatan to move to it.'
            : level === 'kecamatan'
            ? 'Colour runs on the selected metric. Kecamatan under the minimum review count stay grey. Click a kecamatan to see its branches as points.'
            : 'Colour runs on the selected metric. Areas under the minimum review count stay grey — a score built on a handful of reviews is noise. Click an area that holds branches to drill in; the branches appear as points once a kecamatan is chosen.'}
          {noBoundary.length > 0 && ` No boundary geometry for ${noBoundary.length > 4 ? `${noBoundary.length} ${LEVEL_PLURAL[level].toLowerCase()}` : noBoundary.join(', ')}, so ${plural(noBoundary.length, 'it is', 'they are')} missing from the map and listed in the table below.`}
          {unplaced.length > 0 && ` ${unplaced.length} ${plural(unplaced.length, 'branch has', 'branches have')} no area on record yet and ${plural(unplaced.length, 'is', 'are')} left off this level.`}
        </div>
        {boundaries.error
          ? <div className="empty-note">Boundaries could not be loaded. {boundaries.error}</div>
          : (
            <div className="geo-stage">
              <GeoMap features={drawnMap.features} areas={drawnMap.areas} metric={metric} national={drawnMap.national} outline={drawnMap.outline}
                points={drawnMap.points} ranked={ranked} focus={drawnMap.focus} area={drawnMap.area} onPick={drill} onBranch={openBranch} />
              {!ready && (
                <div className="geo-loading" role="status">
                  <span className="geo-spin" aria-hidden="true" />
                  Loading {level === 'province' ? 'Indonesia' : level === 'kota' ? sel.province : sel.kota}…
                </div>
              )}
            </div>
          )}
        <Legend metric={metric} points={markers.length > 0} polygons={!outline && features.length > 0} items={!outline && features.length > 0 ? areas : markers} />
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
      <Metric k="Areas in view" v={areas.length} n={`${points.length} branches, ${readOf(mix).toLocaleString('id-ID')} reviews`} />
      <Metric k="Sentiment score" v={mix.score ?? '—'} n="across everything in this view" />
      <Metric k="Positive / negative" v={`${mix.good.toLocaleString('id-ID')} / ${mix.bad.toLocaleString('id-ID')}`} n={`${share(mix.bad, readOf(mix))}% negative, ${share(mix.irrelevant, readOf(mix))}% irrelevant/spam`} />
      <Metric k="Lowest scoring" v={worst?.name ?? '—'} n={worst ? `score ${worst.mix.score}, ${fmt(worst.mix.bad)} negative reviews` : 'nothing scored yet'} />
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

/** A score with its band's colour beside it; the number stays in ink, as the palest band is too light for text. */
function BandScore({ score, scored }: { score: number | null; scored: boolean }) {
  if (!scored || score === null) return <b style={{ color: 'var(--ink-3)' }}>—</b>;
  const band = scoreBand(score);
  return (
    <span className="band-score" title={`${band.label} · ${band.name}`}>
      <i style={{ background: band.color }} /><b>{score}</b>
    </span>
  );
}

function Legend({ metric, points, polygons, items }: { metric: GeoMetric; points: boolean; polygons: boolean; items: { mix: { score: number | null }; enough: boolean }[] }) {
  if (metric === 'score' || !polygons) {
    /* What is coloured: the areas, or the branch points when the areas are drawn as outlines only. */
    const count = (b: (typeof SCORE_BANDS)[number]) => items.filter((a) => a.enough && a.mix.score !== null && scoreBand(a.mix.score) === b).length;
    return (
      <div className="legend">
        <span><b style={{ color: 'var(--ink)' }}>Sentiment score</b></span>
        {SCORE_BANDS.map((b) => (
          <span key={b.label} className="band-key" title={`${b.name}: ${count(b)} ${polygons ? 'areas' : 'branches'} in view`}>
            <i style={{ background: b.color }} />{b.label}<span className="n">{count(b)}</span>
          </span>
        ))}
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
      {worst.name} sits lowest at {worst.mix.score}, with {fmt(worst.mix.bad)} negative reviews out of {fmt(worst.mix.total)}.{' '}
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
            label: (c) => { const r = c.raw as typeof pts[number]; return `${fmt(r.x)} reviews · ${r.y}% negative · ${fmt(r.p.mix.bad)} negative`; },
            afterLabel: (c) => { const r = c.raw as typeof pts[number]; return r.p.enough ? `score ${r.p.mix.score}` : 'not scored'; },
          },
        },
      },
      scales: {
        x: { ...AXIS, beginAtZero: true, title: { display: true, text: 'inbound messages' } },
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
              <td className="n">{fmt(a.branches)}</td>
              <td className="n">{readOf(a.mix).toLocaleString('id-ID')}</td>
              <td><MixBar mix={a.mix} /><div className="sub">{fmt(a.mix.good)} / {fmt(a.mix.neutral)} / {fmt(a.mix.bad)} / {fmt(a.mix.irrelevant)}</div></td>
              <td className="n">
                <BandScore score={a.mix.score} scored={a.enough} />
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
              <td className="n"><BandScore score={mix.score} scored={enough} /></td>
              <td className="n">{fmt(mix.bad)}</td>
              <td className="n">{mix.irrelevant || '—'}</td>
              <td className="n">{fmt(unanswered)}</td>
            </tr>
          )) : <EmptyRow colSpan={8}>No branch in this scope.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

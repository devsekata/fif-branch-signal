'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { metricColor, metricValue, type Area, type BranchPoint, type GeoMetric, type RegionFeature } from '@/lib/geo';
import { MIN_N, type Mix } from '@/lib/signal';

export interface GeoMapProps {
  /** Outlines of the level being drawn, already narrowed to its parent area. */
  features: RegionFeature[];
  /** Figures per outline, keyed by the outline's name. */
  areas: Map<string, Area>;
  metric: GeoMetric;
  /** National view keeps the whole archipelago in frame; the levels below fit to the bulk of what is drawn. */
  national: boolean;
  /** At kecamatan level the polygons stop carrying the data and become context for the branch points. */
  outline: boolean;
  /** Branches drawn as points: colour is sentiment, size is review volume. */
  points: BranchPoint[];
  /** How many branches are ranked, for the "#3 of 12" on a point's card. */
  ranked: number;
  /** A kecamatan the scope has narrowed to; the rest is dimmed, not hidden. */
  focus: string | null;
  onPick: (name: string) => void;
  onBranch: (branchId: string) => void;
}

/** An area narrower and shorter than this on screen is lost under the white border the others carry. */
const SMALL_UNDER = 16;

/** Tallest hover card plus a marker radius; decides whether the card fits above a point. */
const TIP_H = 250;

/** Hover cards are built as DOM nodes, so names never pass through innerHTML. */
function el(tag: string, cls: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const row = (k: string, v: string, alarm = false) => {
  const r = el('div', 'pop-r');
  r.append(el('span', '', k), el('b', alarm ? 'sig' : '', v));
  return r;
};

/** Score headline, with the rank folded in so it costs no extra row. */
function tipScore(mix: Mix, enough: boolean, rank: string | null) {
  const score = el('div', enough ? 'tip-score' : 'tip-score muted');
  if (enough) {
    score.append(el('b', '', String(mix.score)), el('span', '', 'sentiment score'));
    if (rank) score.append(el('em', '', rank));
  } else {
    score.append(el('b', '', '—'), el('span', '', `${mix.total} review${mix.total === 1 ? '' : 's'} — under the ${MIN_N} minimum, not scored`));
  }
  return score;
}

/** A four-segment bar and one line of counts, so the mix reads before the numbers do. */
function tipMix(mix: Mix): HTMLElement[] {
  const all = mix.total + mix.irrelevant;
  if (!all) return [];
  const bar = el('div', 'tip-bar');
  for (const [v, c] of [[mix.good, '#1F8C84'], [mix.neutral, '#C7D5D3'], [mix.bad, '#C8322B'], [mix.irrelevant, '#7C9491']] as const) {
    const i = el('i', '');
    i.style.width = `${(100 * v) / all}%`;
    i.style.background = c;
    bar.append(i);
  }
  const key = el('div', 'tip-mix');
  for (const [v, label, c] of [[mix.good, 'positive', '#1F8C84'], [mix.neutral, 'neutral', '#7C9491'], [mix.bad, 'negative', '#C8322B'], [mix.irrelevant, 'irrelevant/spam', '#54685F']] as const) {
    const s = el('span', '');
    const b = el('b', '', v.toLocaleString('en-US'));
    b.style.color = c;
    s.append(b, ` ${label}`);
    key.append(s);
  }
  return [bar, key];
}

function areaTip(name: string, a: Area | undefined, drill: boolean) {
  const box = el('div', 'geo-tip-in');
  box.append(el('div', 'pop-t', name));
  if (!a) {
    box.append(el('div', 'pop-b', 'No branch in this area yet.'));
    return box;
  }
  box.append(el('div', 'tip-where', `${a.branches} ${a.branches === 1 ? 'branch' : 'branches'}`), tipScore(a.mix, a.enough, null), ...tipMix(a.mix));
  box.append(row('Reviews read', (a.mix.total + a.mix.irrelevant).toLocaleString('en-US')));
  if (a.unanswered > 0) box.append(row('Unanswered complaints', String(a.unanswered), true));
  if (drill) box.append(el('div', 'pop-b', 'Click to drill in'));
  return box;
}

function branchTip(p: BranchPoint, ranked: number) {
  const box = el('div', 'geo-tip-in');
  box.append(el('div', 'pop-t', p.place.name));
  const where = [p.place.kecamatan, p.place.kota].filter(Boolean).join(', ');
  if (where) box.append(el('div', 'tip-where', where));
  box.append(tipScore(p.mix, p.enough, p.enough && p.rank ? `#${p.rank} of ${ranked}` : null), ...tipMix(p.mix));
  box.append(row('Reviews read', (p.mix.total + p.mix.irrelevant).toLocaleString('en-US')));
  if (p.unanswered > 0) box.append(row('Unanswered complaints', String(p.unanswered), true));
  box.append(el('div', 'pop-b', 'Click to open the branch'));
  return box;
}

/* Bounds covering the bulk of the drawn area, ignoring far-flung islands. An outlying island is
 * genuinely part of its province and stays on the map, but letting it set the frame puts the
 * mainland — the thing being read — at half scale. Null whenever nothing was excluded. */
function bulkBounds(features: RegionFeature[], share: number): L.LatLngBounds | null {
  const parts: { a: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const f of features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polys) {
      const ring = rings[0];
      if (!ring || ring.length < 4) continue;
      let a = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < ring.length - 1; i++) {
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
        const [x, y] = ring[i];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      parts.push({ a: Math.abs(a) / 2, x0, y0, x1, y1 });
    }
  }
  if (parts.length < 2) return null;
  parts.sort((p, q) => q.a - p.a);
  const total = parts.reduce((s, p) => s + p.a, 0);
  if (!total) return null;
  let acc = 0, used = 0, X0 = 1e9, Y0 = 1e9, X1 = -1e9, Y1 = -1e9;
  for (const p of parts) {
    if (acc / total >= share && used > 0) break;
    acc += p.a; used++;
    X0 = Math.min(X0, p.x0); X1 = Math.max(X1, p.x1);
    Y0 = Math.min(Y0, p.y0); Y1 = Math.max(Y1, p.y1);
  }
  return used === parts.length ? null : L.latLngBounds([[Y0, X0], [Y1, X1]]);
}

const INDONESIA: L.LatLngBoundsExpression = [[-11, 95], [6, 141]];
/* The zoom is capped per level: national has to hold the whole archipelago, a single province or
 * kota should fill the frame rather than be zoomed into one street. */
const MAX_ZOOM = { national: 6, area: 11, branches: 13 };

const located = (p: BranchPoint) => p.place.lat != null && p.place.lng != null;

/** One administrative level as a choropleth, with branches as points. Leaflet needs `window`, so load this with `ssr: false`. */
export default function GeoMap({ features, areas, metric, national, outline, points, ranked, focus, onPick, onBranch }: GeoMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  /* Kept in refs so re-binding a click handler does not redraw the layers. */
  const pick = useRef(onPick);
  const openBranch = useRef(onBranch);
  useEffect(() => { pick.current = onPick; openBranch.current = onBranch; }, [onPick, onBranch]);

  useEffect(() => {
    /* zoomSnap 0 lets fitBounds use a fractional zoom. On integer snapping Leaflet rounds down,
     * so a province could sit at half the scale its frame allows. */
    const m = L.map(box.current!, { scrollWheelZoom: false, zoomSnap: 0, zoomDelta: 0.5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · boundaries BIG RBI 25K',
      maxZoom: 17, opacity: 0.55,
    }).addTo(m);
    m.fitBounds(INDONESIA);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // polygons
  useEffect(() => {
    const m = map.current;
    if (!m || !features.length) return;
    const max = Math.max(1, ...[...areas.values()].map((a) => metricValue(a, metric) ?? 0));
    const small = new Set<string>();
    const style = (f?: RegionFeature): L.PathOptions => {
      const name = f?.properties.nama;
      if (outline) {
        const hit = focus !== null && name === focus;
        return { color: '#135955', weight: hit ? 2.6 : 1.4, opacity: hit ? 1 : 0.5, fill: true, fillColor: '#135955', fillOpacity: hit ? 0.1 : 0.03 };
      }
      const a = name ? areas.get(name) : undefined;
      if (a && small.has(name!)) return { color: '#0B2320', weight: 1, opacity: 1, fillColor: metricColor(a, metric, max), fillOpacity: 1 };
      return {
        color: '#FFFFFF', weight: 1.2, opacity: 0.9,
        fillColor: a ? metricColor(a, metric, max) : '#E3EAE9',
        fillOpacity: a ? 0.82 : 0.35,
        dashArray: a ? undefined : '3 4',
      };
    };
    const layer: L.GeoJSON = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: (f) => style(f as RegionFeature),
      onEachFeature: (f, l) => {
        const name = (f as RegionFeature).properties.nama;
        const a = areas.get(name);
        /* A tooltip, not a popup: at drillable levels the click navigates away and would destroy a popup the moment it opened. */
        l.bindTooltip(() => areaTip(name, a, !outline), { className: 'geo-tip', sticky: true, direction: 'top', opacity: 1 });
        l.on('mouseover', () => (l as L.Path).setStyle({ weight: outline ? 2.2 : 2.4, color: '#0B2320' }));
        l.on('mouseout', () => layer.resetStyle(l as L.Path));
        if (!outline && a) l.on('click', () => pick.current(name));
      },
    }).addTo(m);
    /* At national scale DKI Jakarta is a few pixels wide, less than two white borders. Areas that
     * small keep their polygon but trade the border for a thin dark one, checked again on zoom. */
    const mark = () => {
      small.clear();
      if (outline) return;
      layer.eachLayer((l) => {
        const p = l as L.Polygon;
        const name = (p.feature as RegionFeature).properties.nama;
        if (!areas.has(name)) return;
        const b = p.getBounds();
        const ne = m.latLngToContainerPoint(b.getNorthEast()), sw = m.latLngToContainerPoint(b.getSouthWest());
        if (Math.max(ne.x - sw.x, sw.y - ne.y) < SMALL_UNDER) { small.add(name); p.bringToFront(); }
      });
      layer.setStyle((f) => style(f as RegionFeature));
    };
    mark();
    m.on('zoomend', mark);
    return () => { m.off('zoomend', mark); layer.remove(); };
  }, [features, areas, metric, outline, focus]);

  // branch points
  useEffect(() => {
    const m = map.current;
    const shown = points.filter(located);
    if (!m || !shown.length) return;
    /* Largest first, so a small branch is never buried under a big one. */
    const group = L.layerGroup([...shown].sort((a, b) => b.mix.total - a.mix.total).map((p) => {
      const r = Math.max(5, Math.min(17, 4 + Math.sqrt(p.mix.total) * 0.9));
      const inFocus = focus === null || p.place.kecamatan === focus;
      const mk = L.circleMarker([p.place.lat!, p.place.lng!], {
        radius: r,
        color: p.enough ? '#0B2320' : '#8FA5A3',
        weight: inFocus ? (p.enough ? 1.6 : 1.8) : 0.8,
        opacity: inFocus ? 0.95 : 0.35,
        fillColor: p.enough ? metricColor(p, 'score', 1) : '#FFFFFF',
        fillOpacity: inFocus ? (p.enough ? 0.9 : 0.25) : (p.enough ? 0.3 : 0.1),
        dashArray: p.enough ? undefined : '2 3',
      });
      /* Registered before the tooltip opens: flip the card below the point when there is not
       * enough room above it, instead of letting the map clip it. */
      mk.on('mouseover', () => {
        const t = mk.getTooltip();
        if (!t) return;
        const below = m.latLngToContainerPoint(mk.getLatLng()).y < TIP_H;
        t.options.direction = below ? 'bottom' : 'top';
        t.options.offset = L.point(0, below ? r + 2 : -r - 2);
      });
      mk.bindTooltip(() => branchTip(p, ranked), { className: 'geo-tip', direction: 'top', offset: [0, -r - 2], opacity: 1 });
      mk.on('click', () => openBranch.current(p.place.id));
      return mk;
    })).addTo(m);
    return () => { group.remove(); };
  }, [points, ranked, focus]);

  /* Framed again only when what is drawn changes, so recolouring by another metric leaves the view alone. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const shown = points.filter(located);
    let bounds: L.LatLngBounds | null = null;
    if (features.length) {
      const full = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection).getBounds();
      bounds = national ? full : bulkBounds(features, 0.985) ?? full;
    }
    /* Points with no outline behind them still have to be in frame. */
    if (shown.length && (!features.length || !outline)) {
      const pts = L.latLngBounds(shown.map((p) => [p.place.lat!, p.place.lng!] as [number, number]));
      bounds = bounds ? bounds.extend(pts) : pts;
    }
    if (!bounds) { m.fitBounds(INDONESIA); return; }
    const cap = !features.length ? MAX_ZOOM.branches : national ? MAX_ZOOM.national : outline ? MAX_ZOOM.branches : MAX_ZOOM.area;
    const frame = bounds;
    /* The size is refreshed before fitting, not after: a fit computed against a stale size lands at the wrong zoom. */
    const go = () => { m.invalidateSize(false); m.fitBounds(frame, { padding: [24, 24], maxZoom: cap }); };
    go();
    const t = setTimeout(go, 120);
    return () => clearTimeout(t);
  }, [features, points, national, outline]);

  return <div ref={box} className="geo-map" role="img" aria-label="Map of sentiment by area, with branches as points" />;
}

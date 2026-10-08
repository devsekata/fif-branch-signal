'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { metricColor, metricValue, type Area, type GeoMetric, type RegionFeature } from '@/lib/geo';
import { MIN_N } from '@/lib/signal';

export interface GeoMapProps {
  /** Outlines of the level being drawn, already narrowed to its parent area. */
  features: RegionFeature[];
  /** Figures per outline, keyed by the outline's name. */
  areas: Map<string, Area>;
  metric: GeoMetric;
  /** National view keeps the whole archipelago in frame; the levels below fit to the bulk of what is drawn. */
  national: boolean;
  /** An area the scope has narrowed to; the rest is dimmed, not hidden. */
  focus: string | null;
  /** Wording of the last line of the hover card. */
  hint: string;
  onPick: (name: string) => void;
}

/** Hover card as DOM nodes, so names never pass through innerHTML. */
function el(tag: string, cls: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function tip(name: string, a: Area | undefined, hint: string) {
  const box = el('div', 'geo-tip-in');
  box.append(el('div', 'pop-t', name));
  if (!a) {
    box.append(el('div', 'pop-b', 'No branch in this area yet.'));
    return box;
  }
  const { mix } = a;
  box.append(el('div', 'tip-where', `${a.branches} ${a.branches === 1 ? 'branch' : 'branches'}`));
  const score = el('div', a.enough ? 'tip-score' : 'tip-score muted');
  if (a.enough) score.append(el('b', '', String(mix.score)), el('span', '', 'sentiment score'));
  else score.append(el('b', '', '—'), el('span', '', `${mix.total} review${mix.total === 1 ? '' : 's'} — under the ${MIN_N} minimum, not scored`));
  box.append(score);
  if (mix.total) {
    const bar = el('div', 'tip-bar');
    for (const [v, c] of [[mix.good, '#1F8C84'], [mix.neutral, '#C7D5D3'], [mix.bad, '#C8322B']] as const) {
      const i = el('i', '');
      i.style.width = `${(100 * v) / mix.total}%`;
      i.style.background = c;
      bar.append(i);
    }
    const key = el('div', 'tip-mix');
    for (const [v, label, c] of [[mix.good, 'positive', '#1F8C84'], [mix.neutral, 'neutral', '#7C9491'], [mix.bad, 'negative', '#C8322B']] as const) {
      const s = el('span', '');
      const b = el('b', '', v.toLocaleString('en-US'));
      b.style.color = c;
      s.append(b, ` ${label}`);
      key.append(s);
    }
    box.append(bar, key);
  }
  const row = (k: string, v: string, alarm = false) => {
    const r = el('div', 'pop-r');
    r.append(el('span', '', k), el('b', alarm ? 'sig' : '', v));
    return r;
  };
  box.append(row('Reviews read', mix.total.toLocaleString('en-US')));
  if (a.unanswered > 0) box.append(row('Unanswered complaints', String(a.unanswered), true));
  box.append(el('div', 'pop-b', hint));
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

/** Choropleth of one administrative level. Leaflet needs `window`, so load this with `ssr: false`. */
export default function GeoMap({ features, areas, metric, national, focus, hint, onPick }: GeoMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  /* Kept in a ref so re-binding the click handler does not redraw the layer. */
  const pick = useRef(onPick);
  useEffect(() => { pick.current = onPick; }, [onPick]);

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

  useEffect(() => {
    const m = map.current;
    if (!m || !features.length) return;
    const max = Math.max(1, ...[...areas.values()].map((a) => metricValue(a, metric) ?? 0));
    const style = (f?: RegionFeature): L.PathOptions => {
      const a = f && areas.get(f.properties.nama);
      const dim = focus !== null && f?.properties.nama !== focus;
      return {
        color: '#FFFFFF', weight: 1.2, opacity: 0.9,
        fillColor: a ? metricColor(a, metric, max) : '#E3EAE9',
        fillOpacity: (a ? 0.82 : 0.35) * (dim ? 0.4 : 1),
        dashArray: a ? undefined : '3 4',
      };
    };
    const layer: L.GeoJSON = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: (f) => style(f as RegionFeature),
      onEachFeature: (f, l) => {
        const name = (f as RegionFeature).properties.nama;
        const a = areas.get(name);
        /* A tooltip, not a popup: the click navigates away and would destroy a popup the moment it opened. */
        l.bindTooltip(() => tip(name, a, hint), { className: 'geo-tip', sticky: true, direction: 'top', opacity: 1 });
        l.on('mouseover', () => (l as L.Path).setStyle({ weight: 2.4, color: '#0B2320' }));
        l.on('mouseout', () => layer.resetStyle(l as L.Path));
        if (a) l.on('click', () => pick.current(name));
      },
    }).addTo(m);
    return () => { layer.remove(); };
  }, [features, areas, metric, focus, hint]);

  /* Framed again only when the outlines change, so recolouring by another metric leaves the view alone. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!features.length) { m.fitBounds(INDONESIA); return; }
    const full = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection).getBounds();
    const bounds = national ? full : bulkBounds(features, 0.985) ?? full;
    /* The size is refreshed before fitting, not after: a fit computed against a stale size lands at the wrong zoom. */
    const go = () => { m.invalidateSize(false); m.fitBounds(bounds, { padding: [24, 24] }); };
    go();
    const t = setTimeout(go, 120);
    return () => clearTimeout(t);
  }, [features, national]);

  return <div ref={box} className="geo-map" role="img" aria-label="Map of sentiment by area" />;
}

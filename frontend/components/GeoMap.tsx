'use client';

import { fmt } from '@/lib/theme';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl, type LayerSpecification, type Map as GlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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
  /** Kecamatan level: the kecamatan are borders only, and the branches on them carry the colour. */
  outline: boolean;
  /** Branches drawn as points: colour is sentiment, size is review volume. */
  points: BranchPoint[];
  /** How many branches are ranked, for the "#3 of 12" on a point's card. */
  ranked: number;
  /** A kecamatan the scope has narrowed to; the rest is dimmed, not hidden. */
  focus: string | null;
  /** The province, kota or kecamatan being looked inside. The frame is fitted to it. */
  area?: RegionFeature | null;
  onPick: (name: string) => void;
  onBranch: (branchId: string) => void;
}

/** An area narrower and shorter than this on screen is lost under the white border the others carry. */
const SMALL_UNDER = 16;

/** Tallest hover card plus a marker radius; decides whether the card fits above a point. */
const TIP_H = 250;
const TIP_W = 250;

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
    score.append(el('b', '', '—'), el('span', '', `${fmt(mix.total)} review${mix.total === 1 ? '' : 's'} — under the ${MIN_N} minimum, not scored`));
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
    const b = el('b', '', v.toLocaleString('id-ID'));
    b.style.color = c;
    s.append(b, ` ${label}`);
    key.append(s);
  }
  return [bar, key];
}

function areaTip(name: string, a: Area | undefined, action: string) {
  const box = el('div', 'geo-tip-in');
  box.append(el('div', 'pop-t', name));
  if (!a) {
    box.append(el('div', 'pop-b', 'No branch in this area yet.'));
    return box;
  }
  box.append(el('div', 'tip-where', `${fmt(a.branches)} ${a.branches === 1 ? 'branch' : 'branches'}`), tipScore(a.mix, a.enough, null), ...tipMix(a.mix));
  box.append(row('Inbound Message', (a.mix.total + a.mix.irrelevant).toLocaleString('id-ID')));
  if (a.unanswered > 0) box.append(row('Unanswered complaints', String(a.unanswered), true));
  box.append(el('div', 'pop-b', action));
  return box;
}

function branchTip(p: BranchPoint, ranked: number) {
  const box = el('div', 'geo-tip-in');
  box.append(el('div', 'pop-t', p.place.name));
  const where = [p.place.kecamatan, p.place.kota].filter(Boolean).join(', ');
  if (where) box.append(el('div', 'tip-where', where));
  box.append(tipScore(p.mix, p.enough, p.enough && p.rank ? `#${p.rank} of ${ranked}` : null), ...tipMix(p.mix));
  box.append(row('Inbound Message', (p.mix.total + p.mix.irrelevant).toLocaleString('id-ID')));
  if (p.unanswered > 0) box.append(row('Unanswered complaints', String(p.unanswered), true));
  box.append(el('div', 'pop-b', 'Click to open the branch'));
  return box;
}

/** Points the hover card at whichever side of `at` has room for it, so the map never clips it:
 *  above by default, below near the top edge, and sideways when it would run off the left or right. */
function aim(m: L.Map, t: L.Tooltip, at: L.Point, gap: number) {
  const { x: w, y: h } = m.getSize();
  const dir = at.x < TIP_W / 2 ? 'right' : at.x > w - TIP_W / 2 ? 'left' : at.y < TIP_H && at.y < h / 2 ? 'bottom' : 'top';
  t.options.direction = dir;
  t.options.offset = dir === 'top' ? L.point(0, -gap) : dir === 'bottom' ? L.point(0, gap) : L.point(dir === 'right' ? gap : -gap, 0);
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
const BASEMAP = 'https://tiles.openfreemap.org/styles/liberty';

const MAX_ZOOM = { national: 6, area: 13, branches: 14 };

/* Copied to public/ by next.config.ts: the bundle has no worker beside the MapLibre chunk to find on its own. */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/* Veils the basemap outside the area looked inside, lightly: the land, water and large names still read.
 * Web Mercator stops short of the poles, so does the frame. */
const WORLD: L.LatLngTuple[] = [[-85, -180], [85, -180], [85, 180], [-85, 180]];
const VEIL = '#EEF2F1';
const NONE: RegionFeature[] = [];
const SVG_NS = 'http://www.w3.org/2000/svg';
let veils = 0;

/** The outer ring of each polygon of an area, as Leaflet latlngs. */
const outerRings = (f: RegionFeature) =>
  (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((r) => r[0].map(([x, y]) => [y, x] as L.LatLngTuple));

/* Street-level detail: roads (rail aside) and their names, points of interest, buildings, and the place names below a city. */
const SMALL_PLACES = new Set(['label_other', 'label_village', 'label_town']);
const DETAIL_SOURCES = new Set(['transportation_name', 'poi', 'aerodrome_label', 'building', 'housenumber']);
const sourceOf = (l: LayerSpecification) => ('source-layer' in l ? l['source-layer'] : undefined);
const isRoad = (l: LayerSpecification) => sourceOf(l) === 'transportation_name' || (sourceOf(l) === 'transportation' && !l.id.includes('rail'));
const isDetail = (l: LayerSpecification) => isRoad(l) || DETAIL_SOURCES.has(sourceOf(l) ?? '') || SMALL_PLACES.has(l.id);

/** A basemap's layers, or none before its style has loaded; its style.load handler applies them then. */
function layersOf(gl: GlMap | undefined): LayerSpecification[] {
  try { return gl?.getStyle()?.layers ?? []; } catch { return []; }
}

/** The basemap under everything. Nationally it is faded with its roads hidden, so heat colours read over it.
 *  Inside an area it is in full but without street-level detail, which the streets layer draws within the area
 *  alone, and without its own administrative lines, so the map's borders are the only ones. */
function fitBasemap(base: L.MaplibreGL, inArea: boolean) {
  base.getContainer().style.opacity = inArea ? '1' : '0.55';
  const gl = base.getMaplibreMap();
  for (const l of layersOf(gl)) {
    if (sourceOf(l) === 'boundary') gl.setLayoutProperty(l.id, 'visibility', inArea ? 'none' : 'visible');
    else if (isDetail(l)) gl.setLayoutProperty(l.id, 'visibility', inArea || isRoad(l) ? 'none' : 'visible');
  }
}

/** The streets layer: the same basemap reduced to its street-level detail, clipped to the area looked inside.
 *  Its other names are drawn again too, at the same places, so inside the area they stay above the roads. */
function onlyDetail(streets: L.MaplibreGL) {
  const gl = streets.getMaplibreMap();
  for (const l of layersOf(gl)) gl.setLayoutProperty(l.id, 'visibility', isDetail(l) || l.type === 'symbol' ? 'visible' : 'none');
}

const located = (p: BranchPoint) => p.place.lat != null && p.place.lng != null;

/** One administrative level as a choropleth, with branches as points. Leaflet needs `window`, so load this with `ssr: false`. */
export default function GeoMap({ features, areas, metric, national, outline, points, ranked, focus, area, onPick, onBranch }: GeoMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const basemap = useRef<L.MaplibreGL | null>(null);
  const streets = useRef<L.MaplibreGL | null>(null);
  /* The area looked inside, none at national level: streets are shown only here. */
  const inside = useMemo(() => (national ? NONE : area ? [area] : features), [national, area, features]);
  const inArea = inside.length > 0;
  /* Read when the basemap style finishes loading, which can land after the level has changed. */
  const inAreaNow = useRef(inArea);
  /* The <use> that places the area's shape in the streets layer's own coordinates, moved whenever that layer is. */
  const clipUse = useRef<SVGUseElement | null>(null);
  /* Kept in refs so re-binding a click handler does not redraw the layers. */
  const pick = useRef(onPick);
  const openBranch = useRef(onBranch);
  useEffect(() => { pick.current = onPick; openBranch.current = onBranch; }, [onPick, onBranch]);

  useEffect(() => {
    /* zoomSnap 0 lets fitBounds use a fractional zoom. On integer snapping Leaflet rounds down,
     * so a province could sit at half the scale its frame allows. */
    const m = L.map(box.current!, { scrollWheelZoom: false, zoomSnap: 0, zoomDelta: 0.5 });
    /* The view has to exist before the basemap is added: until then Leaflet defers onAdd and the layer has no container. */
    m.fitBounds(INDONESIA);
    /* A vector basemap, so its roads can be left out under the heat colours they compete with. */
    const base = L.maplibreGL({ style: BASEMAP, attributionControl: false }).addTo(m);
    basemap.current = base;
    base.getMaplibreMap().on('style.load', () => fitBasemap(base, inAreaNow.current));
    /* Above the basemap (tilePane, 200) and below the areas (overlayPane, 400): the streets of the area,
     * then the veil around it and its heavy edge. */
    for (const [name, z] of [['streets', '250'], ['mask', '300']]) {
      const pane = m.createPane(name);
      pane.style.zIndex = z;
      pane.style.pointerEvents = 'none';
    }
    /* The streets are a second basemap clipped to the area, so they end exactly at its edge. */
    const st = L.maplibreGL({ style: BASEMAP, attributionControl: false, pane: 'streets' } as Parameters<typeof L.maplibreGL>[0]).addTo(m);
    streets.current = st;
    st.getContainer().style.display = inAreaNow.current ? '' : 'none';
    st.getMaplibreMap().on('style.load', () => onlyDetail(st));
    /* The clip path is in layer points; the streets container sits at its own layer point, moved as the map pans. */
    st.getMaplibreMap().on('render', () => {
      const use = clipUse.current;
      if (!use) return;
      const at = L.DomUtil.getPosition(st.getContainer());
      use.setAttribute('x', String(-at.x));
      use.setAttribute('y', String(-at.y));
    });
    m.attributionControl.addAttribution('<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · boundaries BIG RBI 25K');
    map.current = m;
    return () => { m.remove(); map.current = null; basemap.current = null; streets.current = null; };
  }, []);

  useEffect(() => {
    inAreaNow.current = inArea;
    if (basemap.current) fitBasemap(basemap.current, inArea);
    if (streets.current) streets.current.getContainer().style.display = inArea ? '' : 'none';
  }, [inArea]);

  /* Outside the area looked inside the basemap is lightly veiled, so the area stands out while the land,
   * water and large names around it still read. No other border is drawn out there. */
  useEffect(() => {
    const m = map.current;
    if (!m || !inside.length) return;
    const veil = L.polygon([WORLD, ...inside.flatMap(outerRings)], { pane: 'mask', stroke: false, fillColor: VEIL, fillOpacity: 0.45, interactive: false }).addTo(m);
    /* The area's edge, heavy, while the borders within it stay thin: every outline inside is traced heavy and
     * clipped to the veil, so only the outer half along the area's own edge is left. The clip uses the veil's
     * live path, which Leaflet redraws on every move and zoom. */
    const edge = L.geoJSON({ type: 'FeatureCollection', features: inside } as GeoJSON.FeatureCollection,
      { pane: 'mask', style: { color: '#0B2320', weight: 5, opacity: 1, fill: false }, interactive: false }).addTo(m);
    /* The area's shape alone, drawn invisibly, for the streets layer to be clipped to. */
    const hole = L.polygon(inside.flatMap(outerRings), { pane: 'mask', stroke: false, fillOpacity: 0, interactive: false }).addTo(m);
    const n = ++veils;
    const clipTo = (path: SVGPathElement | undefined, id: string, evenodd: boolean) => {
      const svg = path?.ownerSVGElement;
      if (!path || !svg) return null;
      path.id = id;
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.id = `${id}-clip`;
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', `#${id}`);
      if (evenodd) { path.setAttribute('clip-rule', 'evenodd'); use.setAttribute('clip-rule', 'evenodd'); }
      clip.append(use);
      svg.prepend(clip);
      return { clip, use };
    };
    const outside = clipTo(veil.getElement() as SVGPathElement | undefined, `veil-${n}`, true);
    if (outside) edge.eachLayer((l) => (l as L.Path).getElement()?.setAttribute('clip-path', `url(#${outside.clip.id})`));
    const within = clipTo(hole.getElement() as SVGPathElement | undefined, `area-${n}`, false);
    const st = streets.current?.getContainer();
    if (within && st) {
      clipUse.current = within.use;
      const at = L.DomUtil.getPosition(st);
      within.use.setAttribute('x', String(-at.x));
      within.use.setAttribute('y', String(-at.y));
      st.style.clipPath = `url(#${within.clip.id})`;
    }
    return () => {
      if (st) st.style.clipPath = '';
      clipUse.current = null;
      outside?.clip.remove(); within?.clip.remove();
      hole.remove(); edge.remove(); veil.remove();
    };
  }, [inside]);

  // polygons
  useEffect(() => {
    const m = map.current;
    if (!m || !features.length) return;
    const max = Math.max(1, ...[...areas.values()].map((a) => metricValue(a, metric) ?? 0));
    const small = new Set<string>();
    const style = (f?: RegionFeature): L.PathOptions => {
      const name = f?.properties.nama;
      const a = name ? areas.get(name) : undefined;
      /* A chosen kecamatan is context: a border and no fill, so the branch points are the only colour on the map.
       * The fill is kept at zero rather than switched off, so hovering anywhere inside still finds the area. */
      if (outline) return { color: '#0B2320', weight: 1, opacity: 1, fill: true, fillOpacity: 0 };
      if (a && national && small.has(name!)) return { color: '#0B2320', weight: 1, opacity: 1, fillColor: metricColor(a, metric, max), fillOpacity: 1 };
      /* Inside an area every part of it gets a thin solid border; the area's own edge is the heavy one. */
      return {
        color: national ? '#FFFFFF' : '#3E5F5B', weight: national ? 1.2 : 1, opacity: national ? 0.9 : 1,
        fillColor: a ? metricColor(a, metric, max) : '#E3EAE9',
        /* Below national the fill is translucent, so the streets of the basemap read through it. */
        fillOpacity: national ? (a ? 0.82 : 0.35) : a ? 0.5 : 0.2,
        dashArray: a || !national ? undefined : '3 4',
      };
    };
    const layer: L.GeoJSON = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: (f) => style(f as RegionFeature),
      onEachFeature: (f, l) => {
        const name = (f as RegionFeature).properties.nama;
        const a = areas.get(name);
        /* A tooltip, not a popup: at drillable levels the click navigates away and would destroy a popup the moment it opened. */
        l.on('mouseover mousemove', (e) => { const t = l.getTooltip(); if (t) aim(m, t, (e as L.LeafletMouseEvent).containerPoint, 6); });
        l.bindTooltip(() => areaTip(name, a, outline ? 'Click to see its branches' : 'Click to drill in'), { className: 'geo-tip', sticky: true, direction: 'top', opacity: 1 });
        if (!outline) l.on('mouseover', () => (l as L.Path).setStyle({ weight: 2.4, color: '#0B2320' }));
        l.on('mouseout', () => layer.resetStyle(l as L.Path));
        if (a) l.on('click', () => pick.current(name));
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
  }, [features, areas, metric, outline, national]);

  // branch points
  useEffect(() => {
    const m = map.current;
    const shown = points.filter(located);
    if (!m || !shown.length) return;
    /* Largest first, so a small branch is never buried under a big one. */
    const group = L.layerGroup([...shown].sort((a, b) => b.mix.total - a.mix.total).map((p) => {
      const r = Math.max(15, Math.min(25, 13 + Math.sqrt(p.mix.total) * 0.8));
      /* Every point is drawn solid. A branch under the minimum review count is grey rather than faded,
       * and the branches of a scoped kecamatan get a heavier ring rather than the others getting fainter. */
      const inFocus = focus !== null && p.place.kecamatan === focus;
      const mk = L.circleMarker([p.place.lat!, p.place.lng!], {
        radius: r,
        color: '#0B2320',
        weight: inFocus ? 2.6 : 1.4,
        opacity: 1,
        fillColor: p.enough ? metricColor(p, 'score', 1) : '#B9C6C4',
        fillOpacity: 1,
      });
      /* Registered before the tooltip opens: flip the card below the point when there is not
       * enough room above it, instead of letting the map clip it. */
      mk.on('mouseover', () => {
        const t = mk.getTooltip();
        if (t) aim(m, t, m.latLngToContainerPoint(mk.getLatLng()), r + 2);
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
    /* Looking inside one area, the frame is that area: a branch filed with a stray coordinate does not widen it. */
    /* Far-flung islands of the area are left out of the frame, as they are for the outlines. */
    if (area) bounds = bulkBounds([area], 0.985) ?? L.geoJSON(area as GeoJSON.Feature).getBounds();
    if (!bounds) { m.fitBounds(INDONESIA); return; }
    const cap = !features.length ? MAX_ZOOM.branches : national ? MAX_ZOOM.national : outline ? MAX_ZOOM.branches : MAX_ZOOM.area;
    const frame = bounds;
    /* The size is refreshed before fitting, not after: a fit computed against a stale size lands at the wrong zoom. */
    const go = () => { m.invalidateSize(false); m.fitBounds(frame, { padding: [24, 24], maxZoom: cap }); };
    go();
    const t = setTimeout(go, 120);
    return () => clearTimeout(t);
  }, [features, points, national, outline, area]);

  return <div ref={box} className="geo-map" role="img" aria-label="Map of sentiment by area, with branches as points" />;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { levelForZoom, scaleColor, type Area, type AreaLevel, type RegionCollection, type RegionFeature, type ScaleStep } from '@/lib/kecamatan';

const INDONESIA: L.LatLngBoundsExpression = [[-11, 95], [6, 141]];

export interface MapLayer {
  boundaries: RegionCollection;
  /** Keyed by the id of the region at this level. */
  areas: Map<number, Area>;
}

export interface KecamatanMapProps {
  /** One set of outlines and figures per administrative level; the zoom decides which is drawn. */
  layers: Record<AreaLevel, MapLayer>;
  scale: ScaleStep[];
  /** Name of the figure being coloured, for the accessible name. */
  metricLabel: string;
  onLevel?: (level: AreaLevel) => void;
}

/** Popup body as DOM nodes, so names never pass through innerHTML. */
function popup(name: string, area: Area) {
  const el = (tag: string, text: string, cls?: string) => {
    const n = document.createElement(tag);
    n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const box = el('div', '', 'kec-pop');
  box.append(el('b', name));
  box.append(
    el('div', `Total Reviews: ${area.total.toLocaleString('en-US')}`),
    el('div', `Branches: ${area.branches.length}`),
    el('div', `Metric: ${area.value}`, 'kec-pop-metric'),
  );
  return box;
}

/** Regions coloured by one figure, stepping from kecamatan to kab/kota to provinsi as the map zooms out.
 *  Leaflet needs `window`, so load this with `ssr: false`. */
export default function KecamatanMap({ layers, scale, metricLabel, onLevel }: KecamatanMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [level, setLevel] = useState<AreaLevel>('kecamatan');

  useEffect(() => {
    const m = L.map(box.current!, { scrollWheelZoom: false, zoomSnap: 0.25 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · boundaries BIG RBI 25K',
      maxZoom: 19,
    }).addTo(m);
    m.on('zoomend', () => setLevel(levelForZoom(m.getZoom())));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => { onLevel?.(level); }, [level, onLevel]);

  const { boundaries, areas } = layers[level];
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const layer = L.geoJSON(boundaries, {
      /* A region with no branch is not drawn at all. */
      filter: (f) => areas.has((f as RegionFeature).properties.id),
      style: (f) => {
        const area = areas.get((f as RegionFeature).properties.id);
        return { fillColor: area && scaleColor(scale, area.value), fillOpacity: 0.8, color: '#555', weight: 2, opacity: 1 };
      },
      onEachFeature: (f, l) => {
        const { id, nama } = (f as RegionFeature).properties;
        /* The detail card follows the pointer in and out. autoPan is off so hovering near an edge does not move the map. */
        l.bindPopup(() => popup(nama, areas.get(id)!), { autoPan: false });
        l.on('mouseover', () => l.openPopup());
        l.on('mouseout', () => l.closePopup());
      },
    }).addTo(m);
    return () => { layer.remove(); };
  }, [boundaries, areas, scale]);

  /* Opens on the finest level, framed on what it has to show; with nothing to draw, on the whole country. */
  const finest = layers.kecamatan.boundaries;
  useEffect(() => {
    const bounds = L.geoJSON(finest).getBounds();
    if (bounds.isValid()) map.current?.fitBounds(bounds, { padding: [12, 12] });
    else map.current?.fitBounds(INDONESIA);
  }, [finest]);

  return <div ref={box} className="kec-map" role="img" aria-label={`Map of ${level} coloured by ${metricLabel.toLowerCase()}`} />;
}

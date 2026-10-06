import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { AreaBranchRow } from './types';

/* Boundaries come from the API, which reads public.master_kecamatan: GET /v1/areas/kecamatan for
 * the kecamatan themselves, GET /v1/areas/regions for kab/kota and provinsi outlines merged from
 * them. The map asks only for regions that hold a branch. Coordinates are lon/lat.
 * Which kecamatan a branch belongs to is decided by the API. */
export interface RegionProps { id: number; nama: string }
export type RegionFeature = Feature<Polygon | MultiPolygon, RegionProps>;
export type RegionCollection<P extends RegionProps = RegionProps> = FeatureCollection<Polygon | MultiPolygon, P>;
export interface KecamatanProps extends RegionProps { kabkota_id: number; kabkota: string; provinsi_id: number; provinsi: string }
export interface KabkotaProps extends RegionProps { provinsi_id: number; provinsi: string }

/* ---------- administrative levels ---------- */
export type AreaLevel = 'kecamatan' | 'kabkota' | 'provinsi';
/** Finest first. A level is drawn from its minZoom up to the next finer level's. */
export const AREA_LEVELS: { id: AreaLevel; label: string; minZoom: number }[] = [
  { id: 'kecamatan', label: 'Kecamatan', minZoom: 11 },
  { id: 'kabkota', label: 'Kab/Kota', minZoom: 8 },
  { id: 'provinsi', label: 'Provinsi', minZoom: 0 },
];
export const levelForZoom = (zoom: number) => AREA_LEVELS.find((l) => zoom >= l.minZoom)!.id;

/* ---------- per-region figures ---------- */
export type AreaMetric = 'sentiment' | 'negative' | 'never_answered';
export const AREA_METRICS: { id: AreaMetric; label: string; unit: string }[] = [
  { id: 'sentiment', label: 'Sentiment Score', unit: '' },
  { id: 'negative', label: 'Bad Reviews', unit: '' },
  { id: 'never_answered', label: 'Unanswered', unit: '' },
];

export interface Area { id: number; branches: AreaBranchRow[]; total: number; value: number }

/** One region can hold several branches: the score is the positive share of all their reviews, counts are summed. */
export function areaValue(branches: AreaBranchRow[], metric: AreaMetric) {
  const sum = (pick: (b: AreaBranchRow) => number) => branches.reduce((a, b) => a + pick(b), 0);
  if (metric === 'sentiment') return Math.round((100 * sum((b) => b.positive)) / Math.max(1, sum((b) => b.total)));
  return sum((b) => b[metric]);
}

/** Group placed branches by the region they fall in at one level. Branches the API could not place, and regions with no branch, are left out. */
export function groupByLevel(rows: AreaBranchRow[], level: AreaLevel, metric: AreaMetric) {
  const by = new Map<number, AreaBranchRow[]>();
  for (const r of rows) {
    const id = r[`${level}_id`];
    if (id !== null) by.set(id, [...(by.get(id) ?? []), r]);
  }
  const areas = new Map<number, Area>();
  for (const [id, branches] of by)
    areas.set(id, { id, branches, total: branches.reduce((a, b) => a + b.total, 0), value: areaValue(branches, metric) });
  return areas;
}

/* ---------- colour scale ---------- */
/* Bands and colours of fif_executive_summary.html. The dark end is always the good end:
 * a high score, or few negative or unanswered reviews. */
export interface ScaleStep { color: string; label: string; min: number; max: number }

const RAMP = ['#0c2c84', '#225ea8', '#41b6c4', '#a1dab4', '#ffffcc'];
const band = (labels: string[], ranges: [number, number][]): ScaleStep[] =>
  RAMP.map((color, n) => ({ color, label: labels[n], min: ranges[n][0], max: ranges[n][1] }));

const SCORE_SCALE = band(
  ['Highest (80–100)', 'High (75–79)', 'Medium (70–74)', 'Low (65–69)', 'Lowest (<65)'],
  [[80, 100], [75, 79], [70, 74], [65, 69], [-Infinity, 64]],
);
const COUNT_SCALE = band(
  ['Lowest (≤20)', 'Low (21–25)', 'Medium (26–30)', 'High (31–40)', 'Highest (>40)'],
  [[-Infinity, 20], [21, 25], [26, 30], [31, 40], [41, Infinity]],
);

export const areaScale = (metric: AreaMetric) => (metric === 'sentiment' ? SCORE_SCALE : COUNT_SCALE);
export const scaleColor = (scale: ScaleStep[], value: number) => scale.find((s) => value >= s.min && value <= s.max)?.color;

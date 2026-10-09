import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { BranchPlace } from './reference';
import type { AreaLevel } from './scope';
import type { Mix, SignalArea, SignalBranch, SignalBranchesResponse } from './types';

/* Boundaries come from the API, which reads public.master_kecamatan: GET /v1/areas/kecamatan for
 * the kecamatan themselves, GET /v1/areas/regions for kab/kota and provinsi outlines merged from
 * them. Coordinates are lon/lat. Which kecamatan a branch belongs to is decided by the API. */
export interface RegionProps { id: number; nama: string; kabkota?: string; provinsi?: string }
export type RegionFeature = Feature<Polygon | MultiPolygon, RegionProps>;
export type RegionCollection = FeatureCollection<Polygon | MultiPolygon, RegionProps>;

/* ---------- per-branch and per-area figures, as GET /v1/signal/branches sends them ---------- */
export interface BranchPoint {
  place: BranchPlace;
  mix: Mix;
  enough: boolean;
  /** Position among scored branches, best first; null when the branch is under the minimum. */
  rank: number | null;
  /** Complaints with no public reply. */
  unanswered: number;
  row: SignalBranch;
}

export interface Area {
  name: string;
  level: AreaLevel;
  mix: Mix;
  enough: boolean;
  branches: number;
  unanswered: number;
}

const mixOf = ({ good, neutral, bad, total, score, irrelevant }: Mix): Mix => ({ good, neutral, bad, total, score, irrelevant: irrelevant ?? 0 });

export function toPoints(d: SignalBranchesResponse | undefined): BranchPoint[] {
  return (d?.branches ?? []).map((b) => ({
    place: {
      id: b.branch_id, name: b.branch, city: b.city, address: b.address,
      province: b.province, kota: b.kota, kecamatan: b.kecamatan, stated_kecamatan: b.stated_kecamatan,
      lat: b.lat, lng: b.lng, postal_code: b.postal_code,
    },
    mix: mixOf(b), enough: b.enough, rank: b.rank, unanswered: b.unanswered, row: b,
  }));
}

export function toAreas(d: SignalBranchesResponse | undefined, level: AreaLevel): Area[] {
  return (d?.areas[level] ?? []).map((a: SignalArea) => ({
    name: a.name, level, mix: mixOf(a), enough: a.enough, branches: a.branches, unanswered: a.unanswered,
  }));
}

/* ---------- colour ---------- */
export type GeoMetric = 'score' | 'bad' | 'good' | 'irrelevant' | 'total' | 'unanswered';
export const GEO_METRICS: [GeoMetric, string][] = [
  ['score', 'Sentiment score'], ['bad', 'Negative'], ['good', 'Positive'], ['irrelevant', 'Irrelevant/spam'], ['total', 'Volume'], ['unanswered', 'Unanswered'],
];
export const SCORE_RAMP = ['#C8322B', '#D8801F', '#B08F2A', '#7FB8AE', '#1F8C84'];

export const metricValue = (a: { mix: Mix; unanswered: number }, metric: GeoMetric) =>
  metric === 'score' ? a.mix.score : metric === 'unanswered' ? a.unanswered : a.mix[metric];

/** Colour by score band; every other metric runs on a volume ramp against the largest value in view. */
export function metricColor(a: { mix: Mix; enough: boolean; unanswered: number }, metric: GeoMetric, max: number) {
  const v = metricValue(a, metric);
  if (metric === 'score') {
    if (v === null || !a.enough) return '#E3EAE9';
    return v >= 80 ? SCORE_RAMP[4] : v >= 65 ? SCORE_RAMP[3] : v >= 50 ? SCORE_RAMP[2] : v >= 35 ? SCORE_RAMP[1] : SCORE_RAMP[0];
  }
  const t = Math.min(1, (v ?? 0) / Math.max(1, max));
  const rgb = metric === 'bad' || metric === 'unanswered' ? '200,50,43' : metric === 'good' ? '31,140,132' : metric === 'irrelevant' ? '84,104,101' : '19,89,85';
  return `rgba(${rgb},${0.15 + 0.75 * t})`;
}

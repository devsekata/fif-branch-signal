import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { BranchPlace } from './reference';
import type { AreaLevel } from './scope';
import type { Mix, SignalArea, SignalBranch, SignalBranchesResponse } from './types';

/* Boundaries come from the API's master tables: GET /v1/areas/kecamatan for the kecamatan, GET
 * /v1/areas/regions for kab/kota and provinsi outlines. A region is the master's own outline
 * (source "master") or, where the master holds none, one merged from the kecamatan loaded for it
 * (source "kecamatan"), which is only as whole as they are. Coordinates are lon/lat. Which area a
 * branch belongs to is decided by the API. */
export interface RegionProps { id: number; nama: string; kabkota?: string; provinsi?: string; source?: 'master' | 'kecamatan' }
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

/** The map's sentiment score: (positive − (negative + neutral)) ÷ (positive + negative + neutral), on the same
 *  0–100 scale as the API score (50 × (1 + x)). Unlike the API score a neutral review counts against the area,
 *  so only praise lifts it. Set here, for the Geography page only; every other page keeps the API's score. */
export const mapScoreOf = ({ good, neutral, bad }: Pick<Mix, 'good' | 'neutral' | 'bad'>) => {
  const total = good + neutral + bad;
  return total ? Math.round(50 * (1 + (good - (bad + neutral)) / total) * 10) / 10 : null;
};

/** The same figures with the map's score in place of the API's. */
export const withMapScore = <T extends { mix: Mix }>(a: T): T => ({ ...a, mix: { ...a.mix, score: mapScoreOf(a.mix) } });

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

/** The sentiment score in five clusters, worst first. One colour per range, on the map, its legend and the tables beside it. */
export const SCORE_BANDS = [
  { min: 0, max: 34, label: '0–34', name: 'poor', color: SCORE_RAMP[0] },
  { min: 35, max: 49, label: '35–49', name: 'weak', color: SCORE_RAMP[1] },
  { min: 50, max: 64, label: '50–64', name: 'mixed', color: SCORE_RAMP[2] },
  { min: 65, max: 79, label: '65–79', name: 'good', color: SCORE_RAMP[3] },
  { min: 80, max: 100, label: '80–100', name: 'strong', color: SCORE_RAMP[4] },
] as const;

export const scoreBand = (score: number) => [...SCORE_BANDS].reverse().find((b) => score >= b.min) ?? SCORE_BANDS[0];

/** The band colour of a score, grey when it is not scored. */
export const bandColor = (score: number | null, scored = true) => (!scored || score === null ? 'var(--ink-3)' : scoreBand(score).color);

export const metricValue = (a: { mix: Mix; unanswered: number }, metric: GeoMetric) =>
  metric === 'score' ? a.mix.score : metric === 'unanswered' ? a.unanswered : a.mix[metric];

/** Colour by score band; every other metric runs on a volume ramp against the largest value in view. */
export function metricColor(a: { mix: Mix; enough: boolean; unanswered: number }, metric: GeoMetric, max: number) {
  const v = metricValue(a, metric);
  if (metric === 'score') {
    if (v === null || !a.enough) return '#E3EAE9';
    return scoreBand(v).color;
  }
  const t = Math.min(1, (v ?? 0) / Math.max(1, max));
  const rgb = metric === 'bad' || metric === 'unanswered' ? '200,50,43' : metric === 'good' ? '31,140,132' : metric === 'irrelevant' ? '84,104,101' : '19,89,85';
  return `rgba(${rgb},${0.15 + 0.75 * t})`;
}

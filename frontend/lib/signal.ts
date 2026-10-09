/* Display helpers for the sentiment figures of GET /v1/signal/*.
 * The definitions themselves — the three-way split, the score, the risk score — live in the API
 * (fif-api/src/utils/signal.ts), so there is exactly one implementation of each. */
import type { Mix } from './types';

export type { Mix };

/** Below this many reviews an area or branch is not scored (fif_metric_spec.md §8.1). The API sends the same value as `min_n`. */
export const MIN_N = 10;

export const NO_MIX: Mix = { good: 0, neutral: 0, bad: 0, total: 0, score: null, irrelevant: 0 };

/** Everything read: the three scored categories and the irrelevant/spam set aside. Shares of this add up to 100. */
export const readOf = (m: Mix) => m.total + m.irrelevant;

const scoreOf = (good: number, bad: number, total: number) => (total ? Math.round(50 * (1 + (good - bad) / total) * 10) / 10 : null);

/** Sum of two mixes, for totalling rows the API already split. */
export const addMix = (a: Mix, b: Mix): Mix => {
  const good = a.good + b.good, neutral = a.neutral + b.neutral, bad = a.bad + b.bad, total = a.total + b.total;
  return { good, neutral, bad, total, score: scoreOf(good, bad, total), irrelevant: a.irrelevant + b.irrelevant };
};

export const share = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);

/** One reading of a 0–100 score, shared by every table and marker. */
export const scoreColor = (score: number | null, scored = true) =>
  !scored || score === null ? 'var(--ink-3)' : score >= 65 ? '#1F8C84' : score >= 50 ? '#B08F2A' : '#C8322B';

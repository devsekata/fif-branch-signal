/* The branch risk score reads the complaint rate shrunk toward the national rate ("Usulan Perubahan —
 * Branch Risk Score"); the API computes it (fif-api src/api/riskPrior.ts). This file re-derives the
 * inputs for the developer-only comparison on the Branches page, which sets the live score beside the
 * previous formula. Every input comes from the data:
 *
 *   rate_adj = (c + m·p) / (n + m)
 *   p = complaint rate of every branch in the active period (the full-range rate below PRIOR_MIN_N reviews)
 *   m = p(1−p) / var_between − 1, estimated once over the full range (empirical Bayes)
 *
 * The severity and age terms of the score are unchanged. */

/** Below this many reviews in the period, p falls back to the full-range rate. */
export const PRIOR_MIN_N = 100;

export interface RiskInput { n: number; c: number; crit: number; reg: number; oldest: number }

export interface MEstimate {
  branches: number;
  N: number;
  C: number;
  p: number;
  varTotal: number;
  varNoise: number;
  varReal: number;
  /** Null when the branches cannot be told apart from sampling noise (varReal ≤ 0). */
  m: number | null;
}

export function estimateM(rows: Pick<RiskInput, 'n' | 'c'>[]): MEstimate {
  const live = rows.filter((r) => r.n > 0);
  const N = live.reduce((a, r) => a + r.n, 0);
  const C = live.reduce((a, r) => a + r.c, 0);
  const p = N ? C / N : 0;
  const varTotal = N ? live.reduce((a, r) => a + r.n * (r.c / r.n - p) ** 2, 0) / N : 0;
  /* Σ n·(p(1−p)/n) / N: each branch's sampling noise, the n's cancelling. */
  const varNoise = N ? (live.length * p * (1 - p)) / N : 0;
  const varReal = varTotal - varNoise;
  return { branches: live.length, N, C, p, varTotal, varNoise, varReal, m: varReal > 0 ? (p * (1 - p)) / varReal - 1 : null };
}

/** The prior for a period: its own rate, or the full-range rate when the period is too thin. */
export function priorOf(period: MEstimate, full: MEstimate): { p: number; fallback: boolean } {
  return period.N < PRIOR_MIN_N ? { p: full.p, fallback: true } : { p: period.p, fallback: false };
}

/** The score with the rate term given; the rest is as the API computes it. Fed the raw rate, it is the previous formula. */
export const riskOf = (ratePct: number, r: RiskInput) =>
  Math.round(Math.min(100, ratePct * 1.15 + r.crit * 4 + r.reg * 7 + Math.min(15, r.oldest / 25)));

import type { View } from './scope';
import type { ComplaintsResponse } from './types';

/* Topics come from GET /v1/pages/complaints rather than from the case rows: /v1/cases returns
 * every Google case with an empty topic list. The payload carries a topic × branch matrix keyed
 * by branch name, which is what lets an area scope be summed here. */

export interface TopicRow {
  id: string;
  label: string;
  sev: number;
  g: number;
  s: number;
  /** Cases carrying a public reply. Null under an area scope, where the API cannot narrow it. */
  answered: number | null;
  last: string | null;
  /** Google mentions per branch name. */
  by_branch: Map<string, number>;
}

/** An area scope has to be summed from the per-branch split; a single branch is narrowed by the API itself. */
const scopedNames = (view: View) => (view.isSet && !view.sel.branch ? new Set(view.places.map((p) => p.name)) : null);

/** Tagged topics in view, both channels side by side, most severe first. */
export function topicRows(payload: ComplaintsResponse | undefined, view: View): TopicRow[] {
  if (!payload) return [];
  const names = scopedNames(view);
  const { branches, matrix } = payload.topic_by_branch;
  const byTopic = new Map(matrix.map((m) => [m.topic_id, m.counts]));
  return payload.topics.map((t) => {
    const counts = byTopic.get(t.topic_id) ?? [];
    const by_branch = new Map(branches.map((b, i) => [b, counts[i] ?? 0] as const).filter(([b]) => !names || names.has(b)));
    return {
      id: t.topic_id, label: t.label, sev: t.severity,
      g: !view.useG ? 0 : names ? [...by_branch.values()].reduce((a, n) => a + n, 0) : t.google,
      s: view.useS && !view.isSet ? t.instagram : 0,
      answered: names ? null : t.answered,
      last: t.last_seen,
      by_branch,
    };
  }).filter((r) => r.g + r.s > 0).sort((x, y) => y.sev - x.sev || (y.g + y.s) - (x.g + x.s));
}

export type PraiseDrivers = ComplaintsResponse['praise_drivers'];

/** Mentions of each praise driver inside the scope. */
export function praiseInScope(praise: PraiseDrivers | undefined, view: View) {
  if (!view.useG) return [];
  const names = scopedNames(view);
  return (praise ?? []).map((p) => ({
    id: p.topic_id,
    label: p.label,
    by_branch: p.by_branch,
    n: names ? Object.entries(p.by_branch).reduce((a, [b, n]) => a + (names.has(b) ? n : 0), 0) : p.n,
  })).filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
}

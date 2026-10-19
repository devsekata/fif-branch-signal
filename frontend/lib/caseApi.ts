import { ApiCallError, apiUrl, postJson } from './api';
import { asState, newCaseState, type CaseState, type HistoryEntry, type StepId } from './caseflow';
import type { CaseItem } from './types';

/* The workflow half of a case, read from GET /v1/cases/{id} and written by
 * POST /v1/cases/{id}/reply. The server enforces the same rules the UI does and answers 403
 * when they disagree, so its reply is the truth and the local state follows it. */

export interface ReplyResponse {
  status?: string;
  /** The v0.3 state the case is in after the move. */
  state?: string;
  steps?: Partial<Record<StepId, boolean>>;
  transition_valid?: boolean;
  reply_text?: string;
  severity?: number;
  escalation_level?: number;
  is_final?: boolean;
  escalation_to?: number | null;
  owner?: string;
  history?: HistoryEntry[];
}

/** The `workflow` block the case endpoints return. */
export interface CaseWorkflow {
  status?: string;
  state?: string;
  steps?: Partial<Record<StepId, boolean>>;
  external?: boolean;
  owner?: string | null;
  updated_at?: string | null;
  escalation_level?: number;
  is_final?: boolean;
  severity?: number;
  history?: HistoryEntry[];
  reply_text?: string;
}


/** Folds whatever the server returned into the state the drawer renders. */
export function fromServer(local: CaseState, w: CaseWorkflow | ReplyResponse | undefined): CaseState {
  if (!w) return local;
  return {
    ...local,
    /* The v0.3 state when the server sends one, else the older status read the way the server reads it. */
    status: asState(w.state ?? w.status, local.status),
    steps: w.steps && typeof w.steps === 'object' ? { ...local.steps, ...w.steps } : local.steps,
    external: 'external' in w && typeof w.external === 'boolean' ? w.external || local.external : local.external,
    isFinal: typeof w.is_final === 'boolean' ? w.is_final : local.isFinal,
    owner: typeof w.owner === 'string' && w.owner ? w.owner : local.owner,
    history: Array.isArray(w.history) ? w.history : local.history,
    draft: typeof w.reply_text === 'string' && w.reply_text ? w.reply_text : local.draft,
    sendState: 'idle',
    pendingMove: null,
    apiError: null,
  };
}

export async function readCaseFromApi(caseId: string): Promise<CaseState> {
  const res = await fetch(apiUrl(`/v1/cases/${encodeURIComponent(caseId)}`), { headers: { accept: 'application/json' } });
  if (!res.ok) throw new ApiCallError(`${res.status} ${res.statusText}`, res.status, null);
  const item = (await res.json()) as CaseItem & { workflow?: CaseWorkflow };
  return fromServer(newCaseState(), item.workflow);
}

export const postReply = (caseId: string, body: unknown) =>
  postJson<ReplyResponse>(`/v1/cases/${encodeURIComponent(caseId)}/reply`, body);

/** What to show when the server turns a move down. 403 is the workflow rules disagreeing. */
export function explain(e: unknown): string {
  if (e instanceof ApiCallError) {
    const body = e.body as { error?: string | { message?: string } } | null;
    const msg = typeof body?.error === 'string' ? body.error : body?.error?.message;
    if (e.status === 403) return `The server refused this step: ${msg ?? 'forbidden by the escalation workflow rules'}.`;
    /* 422 is the state machine: the move is not one this track allows from where the case stands. */
    if (e.status === 422) return `The server refused this step: ${msg ?? 'not a move this case can make from here'}.`;
    if (e.status === 404) return 'The server does not know this case.';
    return msg ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

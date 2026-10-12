/* Reply lifecycle for a case, after fif_metric_spec.md §7 as the API implements it
 * (fif-api src/utils/workflow.ts).
 *
 * The states and the order of each track are the API's own, and every move is posted as
 * `state`, which the API checks against its state machine: a move it does not allow comes back
 * 422 with the states that are allowed, and nothing is changed. The role rules below mirror the
 * server's so the drawer offers only what will be accepted; the server stays the judge.
 *
 * `isFinal` is the older is_final flag, still sent so the server's older rule (a CX HO sends
 * severity 4 wording only after Compliance approved it) keeps working. `sendState` covers the
 * seconds around a request, which is a property of the request, not of the case. */

export type RoleId = 'branch' | 'cx' | 'comp';
export type StatusId =
  | 'open' | 'triaged' | 'draft' | 'pending' | 'approved'
  | 'sending' | 'sent' | 'failed' | 'verified' | 'moderation' | 'closed';
export type TrackId = 'service' | 'conduct' | 'doxing' | 'silent';
export type StepId = 'hidden' | 'reported' | 'legal';
export type SendState = 'idle' | 'sending' | 'failed';

export const ROLES: { id: RoleId; label: string }[] = [
  { id: 'branch', label: 'Branch user' },
  { id: 'cx', label: 'CX HO' },
  { id: 'comp', label: 'Compliance' },
];

export const roleName = (id: RoleId) => ROLES.find((r) => r.id === id)?.label ?? id;

/** escalation_level in the API: 1 Branch user, 2 CX HO, 3 Compliance. */
export const ROLE_LEVEL: Record<RoleId, 1 | 2 | 3> = { branch: 1, cx: 2, comp: 3 };

export const STATE: Record<StatusId, { label: string; tone: '' | 'warn' | 'ok' | 'bad' }> = {
  open: { label: 'Open', tone: '' },
  triaged: { label: 'Triaged', tone: '' },
  draft: { label: 'Draft', tone: '' },
  pending: { label: 'Pending approval', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  sending: { label: 'Sending', tone: 'warn' },
  sent: { label: 'Sent', tone: 'ok' },
  failed: { label: 'Send failed', tone: 'bad' },
  verified: { label: 'Verified', tone: 'ok' },
  moderation: { label: 'In moderation', tone: 'bad' },
  closed: { label: 'Closed', tone: 'ok' },
};

/** Older statuses the API may still hold, read as the state each stands for (the API's stateOf). */
const LEGACY: Record<string, StatusId> = {
  escalated: 'pending', rejected: 'draft', manual_reply_submitted: 'sent', resolved: 'verified',
};

/** The state a stored status or state value stands for. */
export function asState(v: unknown, fallback: StatusId = 'open'): StatusId {
  if (typeof v !== 'string') return fallback;
  if (v in STATE) return v as StatusId;
  return LEGACY[v] ?? fallback;
}

/** Which lifecycle a case follows, in the order the API checks it. Decided by topic, never by role. */
export const TRACKS: Record<TrackId, StatusId[]> = {
  service: ['open', 'triaged', 'draft', 'sending', 'sent', 'verified', 'closed'],
  conduct: ['open', 'triaged', 'draft', 'pending', 'approved', 'sending', 'sent', 'verified', 'closed'],
  doxing: ['open', 'moderation', 'closed'],
  silent: ['open', 'closed'],
};

export interface Move {
  id: string;
  from: StatusId[];
  to: StatusId;
  roles: RoleId[];
  tracks: TrackId[];
  label: string;
  desc: string;
  needsDraft?: boolean;
  needsSteps?: StepId[];
  /** Records the approval on the older is_final flag as well. */
  setsFinal?: boolean;
  step?: StepId;
  kind?: 'primary' | 'danger';
  /** Goes out to the platform: the case passes through `sending` and lands on `sent` or `failed`. */
  async?: boolean;
  /** A reply found on the platform that did not come from the dashboard (the API's `external`). */
  external?: boolean;
}

const ALL: RoleId[] = ['branch', 'cx', 'comp'];
const HO: RoleId[] = ['cx', 'comp'];

/* Every transition the UI can offer, each one the API's nextStates() allows. `roles` is who the
 * API lets take it: a branch user never closes, reopens, approves or sends conduct wording, and
 * a CX HO never approves or rejects conduct wording or closes a conduct or doxing case. */
export const MOVES: Move[] = [
  { id: 'triage', from: ['open'], to: 'triaged', roles: ALL, tracks: ['service', 'conduct'],
    label: 'Take the case', desc: 'Assign it to yourself and start work.', kind: 'primary' },
  { id: 'save_draft', from: ['triaged'], to: 'draft', roles: ALL, tracks: ['service', 'conduct'], needsDraft: true,
    label: 'Save the draft', desc: 'Stores the wording on the case so the next person sees it.', kind: 'primary' },

  /* ---- service ---- */
  { id: 'send', from: ['draft'], to: 'sending', roles: ALL, tracks: ['service'], needsDraft: true, async: true, kind: 'primary',
    label: 'Send the reply', desc: 'Publishes straight to the platform.' },
  { id: 'mark_sent', from: ['draft'], to: 'sent', roles: ALL, tracks: ['service'], needsDraft: true,
    label: 'Mark as posted manually', desc: 'You pasted the reply into the platform yourself. Recorded as sent, not yet verified.' },

  /* ---- conduct: severity 4 wording needs Compliance sign-off before anything is published ---- */
  { id: 'submit', from: ['draft'], to: 'pending', roles: ALL, tracks: ['conduct'], needsDraft: true, kind: 'primary',
    label: 'Submit for compliance approval', desc: 'Severity 4 wording cannot be published without sign-off.' },
  { id: 'approve', from: ['pending'], to: 'approved', roles: ['comp'], tracks: ['conduct'], setsFinal: true, kind: 'primary',
    label: 'Approve the wording', desc: 'Clears the draft for publication exactly as written.' },
  { id: 'reject', from: ['pending'], to: 'draft', roles: ['comp'], tracks: ['conduct'], kind: 'danger',
    label: 'Send back for rewrite', desc: 'Returns it to the author with your note attached.' },
  { id: 'send_appr', from: ['approved'], to: 'sending', roles: HO, tracks: ['conduct'], needsDraft: true, async: true, kind: 'primary',
    label: 'Send the approved reply', desc: 'Publishes the signed-off wording.' },
  { id: 'mark_sent_appr', from: ['approved'], to: 'sent', roles: HO, tracks: ['conduct'], needsDraft: true,
    label: 'Mark as posted manually', desc: 'The approved wording was published by hand.' },

  /* ---- a send that failed ---- */
  { id: 'retry', from: ['failed'], to: 'sending', roles: ALL, tracks: ['service'], needsDraft: true, async: true, kind: 'primary',
    label: 'Retry the send', desc: 'Tries the platform again with the same wording.' },
  { id: 'retry_c', from: ['failed'], to: 'sending', roles: HO, tracks: ['conduct'], needsDraft: true, async: true, kind: 'primary',
    label: 'Retry the send', desc: 'Tries the platform again with the approved wording.' },
  { id: 'redraft', from: ['failed'], to: 'draft', roles: ALL, tracks: ['service', 'conduct'],
    label: 'Back to the draft', desc: 'Change the wording before trying again.' },

  /* ---- confirming ---- */
  { id: 'verify', from: ['sent'], to: 'verified', roles: ALL, tracks: ['service', 'conduct'], kind: 'primary',
    label: 'Confirm it is live', desc: 'The reply was found on the platform. In production the sync does this, not a button.' },
  { id: 'external', from: ['open', 'triaged', 'draft', 'pending', 'approved'], to: 'verified', roles: ALL,
    tracks: ['service', 'conduct'], external: true,
    label: 'Someone replied outside the dashboard', desc: 'The sync found a reply that did not originate here.' },

  /* ---- doxing: the composer is locked by policy, and no role unlocks it ---- */
  { id: 'hide', from: ['open', 'moderation'], to: 'moderation', roles: HO, tracks: ['doxing'], kind: 'danger', step: 'hidden',
    label: 'Hide the comment', desc: 'Removes it from public view without notifying the author.' },
  { id: 'report', from: ['open', 'moderation'], to: 'moderation', roles: HO, tracks: ['doxing'], kind: 'danger', step: 'reported',
    label: 'Report to Meta', desc: 'Files a privacy violation report for exposed personal data.' },
  { id: 'legal', from: ['open', 'moderation'], to: 'moderation', roles: ['comp'], tracks: ['doxing'], kind: 'danger', step: 'legal',
    label: 'Escalate to legal', desc: 'Hands the case over with the archived capture attached.' },

  /* ---- closing ---- */
  { id: 'no_action', from: ['open'], to: 'closed', roles: HO, tracks: ['silent'],
    label: 'Close, no action needed', desc: 'A rating with no text carries nothing to answer.' },
  { id: 'close', from: ['verified'], to: 'closed', roles: HO, tracks: ['service'], kind: 'primary',
    label: 'Close the case', desc: 'Reply confirmed live. Nothing outstanding.' },
  { id: 'close_c', from: ['verified'], to: 'closed', roles: ['comp'], tracks: ['conduct'], kind: 'primary',
    label: 'Close the case', desc: 'Severity 4 cases are closed by Compliance only.' },
  { id: 'close_m', from: ['moderation'], to: 'closed', roles: ['comp'], tracks: ['doxing'], kind: 'primary',
    needsSteps: ['hidden', 'reported'], label: 'Close the case', desc: 'Only once the comment is hidden and reported.' },

  { id: 'reopen', from: ['closed'], to: 'open', roles: HO, tracks: ['service', 'conduct', 'doxing', 'silent'],
    label: 'Reopen', desc: 'Something new surfaced on the same case.' },
];

/** Placeholder copy. Real wording must be written and signed off by FIF legal. */
export const TEMPLATES: Record<'conduct' | 'service', { id: string; label: string; body: string }[]> = {
  conduct: [
    { id: 'c1', label: 'Acknowledge and route to investigation',
      body: 'Terima kasih atas laporannya. Kami menanggapi serius setiap laporan terkait perilaku penagihan dan menindaklanjutinya melalui unit terkait. Agar dapat kami telusuri, mohon hubungi layanan pelanggan kami di [kanal resmi] dengan menyebutkan nomor kontrak Anda.' },
    { id: 'c2', label: 'Request private contact, no admission',
      body: 'Mohon maaf atas ketidaknyamanan yang Anda alami. Kami ingin menindaklanjuti laporan ini secara langsung. Silakan hubungi kami melalui [kanal resmi] agar tim kami dapat membantu menelusuri kendala Anda.' },
  ],
  service: [
    { id: 's1', label: 'Apologise and offer a route',
      body: 'Terima kasih atas masukannya, Bapak/Ibu. Mohon maaf atas pengalaman yang kurang berkenan di cabang kami. Masukan Anda kami sampaikan kepada tim terkait sebagai bahan perbaikan. Untuk bantuan lebih lanjut, silakan hubungi kami di [kanal resmi].' },
    { id: 's2', label: 'Answer a process question',
      body: 'Terima kasih atas pertanyaannya. Untuk [topik], persyaratan dan prosesnya dapat dilihat di [tautan resmi] atau ditanyakan langsung ke cabang terdekat. Kami siap membantu.' },
    { id: 's3', label: 'Application or payment issue',
      body: 'Terima kasih telah menginformasikan kendala ini. Mohon coba [langkah singkat]. Apabila kendala berlanjut, silakan hubungi kami melalui [kanal resmi] dengan menyertakan tangkapan layar agar dapat kami periksa.' },
    { id: 's4', label: 'Thank the customer',
      body: 'Terima kasih atas apresiasinya, Bapak/Ibu. Senang mendengar pelayanan kami membantu. Sampai jumpa kembali.' },
  ],
};

export interface CaseState {
  status: StatusId;
  /** is_final in the API: Compliance has approved the wording. */
  isFinal: boolean;
  /** Where a request to the server has got to. Never sent to the API. */
  sendState: SendState;
  /** The move the last request was for, so a refused one can be explained. */
  pendingMove: string | null;
  draft: string;
  templateId: string;
  owner: string | null;
  steps: Partial<Record<StepId, boolean>>;
  note: string;
  external: boolean;
  /** For the reader: what happened, in words. */
  trail: { text: string; extra: string; who: string; when: string }[];
  /** For the API: the exact shape history[] takes in the reply payload. */
  history: HistoryEntry[];
  /** Why the server turned the last move down, if it did. */
  apiError: string | null;
}

/** One entry of history[] as the API returns and accepts it. */
export interface HistoryEntry {
  escalation_level: number;
  escalation_to: number | null;
  owner: string;
  updated_at: string;
  status?: string;
}

export const newCaseState = (): CaseState => ({
  status: 'open', isFinal: false, sendState: 'idle', pendingMove: null,
  draft: '', templateId: '', owner: null, steps: {}, note: '', external: false, trail: [], history: [],
  apiError: null,
});

/** What a case is handled as when the API sent no track. Topic decides, not the person looking at it. */
export function trackOf(input: { topicIds: string[]; topicLabels: string[]; severity: number; hasText: boolean }): TrackId {
  const hay = [...input.topicIds, ...input.topicLabels].join(' ');
  if (/doxing|data_pribadi|data pribadi/i.test(hay)) return 'doxing';
  if (input.severity === 4) return 'conduct';
  if (!input.hasText) return 'silent';
  return 'service';
}

export interface OfferedMove extends Move { block: string | null }

/** The single move that lands on `status`, or null when none or several do. Several means the
 *  pill cannot stand for one action — doxing reaches `moderation` by hide, report or legal — so
 *  it stays inert and the choice is made from the action list. */
export function moveToStatus(offered: OfferedMove[], status: StatusId): OfferedMove | null {
  const hits = offered.filter((m) => m.to === status);
  return hits.length === 1 ? hits[0] : null;
}

/** Every move reachable from the current state, each with the reason it cannot be taken. */
export function movesFor(s: CaseState, track: TrackId, role: RoleId): OfferedMove[] {
  return MOVES.filter((m) => m.tracks.includes(track) && m.from.includes(s.status)).map((m) => {
    let block: string | null = null;
    if (m.step && s.steps[m.step]) block = 'already done';
    else if (!m.roles.includes(role)) block = `${m.roles.map(roleName).join(' or ')} only`;
    else if (m.needsDraft && !s.draft.trim()) block = 'write the reply first';
    else if (m.needsSteps && m.needsSteps.some((x) => !s.steps[x])) {
      block = `needs ${m.needsSteps.filter((x) => !s.steps[x]).join(' and ')} first`;
    }
    return { ...m, block };
  });
}

const EXTRA: Record<string, string> = {
  verify: 'Simulated here. In production the sync confirms it, and the platform is the source of truth, not this dashboard.',
  external: 'Reply found on the platform with no record of being sent from here.',
  approve: 'The wording is locked from here.',
};

/** Which level a move hands the case to next. null when it stays where it is.
 *
 * Only submit, reject and the doxing steps hand over. The server refuses a Compliance user who
 * sends `pending` or `draft` with any escalation_to ("not permitted to submit drafts for
 * approval"), so everything else sends null. */
export function escalationTo(m: Move, role: RoleId): 1 | 2 | 3 | null {
  if (m.id === 'submit') return role === 'comp' ? null : 3;
  if (m.id === 'reject') return null;
  if (m.step) return 3;
  return null;
}

/** Applies a move the server accepted. Returns a new state; the caller owns rendering. */
export function applyMove(s: CaseState, m: Move, role: RoleId, note?: string, email?: string): CaseState {
  const next: CaseState = { ...s, steps: { ...s.steps }, trail: [...s.trail], history: [...s.history] };
  if (m.id === 'reject') next.note = note?.trim() || 'Needs rewrite';
  else if (m.id !== 'reopen') next.note = '';
  if (m.step) next.steps[m.step] = true;
  if (m.external) next.external = true;
  if (m.setsFinal) next.isFinal = true;
  if (m.id === 'reject' || m.id === 'redraft') next.isFinal = false;
  if (!next.owner && m.to !== 'closed') next.owner = roleName(role);
  if (m.id === 'reopen') {
    next.steps = {}; next.external = false; next.isFinal = false;
  }
  next.status = m.to;
  next.sendState = 'idle';
  next.pendingMove = null;
  next.history.push({
    escalation_level: ROLE_LEVEL[role],
    escalation_to: escalationTo(m, role),
    owner: email ?? roleName(role),
    updated_at: new Date().toISOString(),
    status: next.status,
  });
  return logTo(next, m.label, m.id === 'reject' ? next.note : EXTRA[m.id] ?? '', role);
}

/** The second half of a send: the platform answered, and the case moves from `sending` on. */
export const SENT: Move = {
  id: 'sent', from: ['sending'], to: 'sent', roles: ALL, tracks: ['service', 'conduct'],
  label: 'Reply published', desc: 'The platform accepted the reply. Not yet verified by a sync.',
};
export const FAILED: Move = {
  id: 'failed', from: ['sending'], to: 'failed', roles: ALL, tracks: ['service', 'conduct'],
  label: 'Send failed', desc: 'The platform returned an error. The wording is kept; retry or post it manually.',
};

/** Only these states let the composer be edited; the rest are locked mid-flow. */
export const EDITABLE: StatusId[] = ['triaged', 'draft'];

/** Writing changes the wording only. Saving it is a move of its own, so the server keeps the order. */
export function withDraft(s: CaseState, text: string, templateId = s.templateId): CaseState {
  return { ...s, draft: text, templateId };
}

export function logTo(s: CaseState, text: string, extra: string, role: RoleId): CaseState {
  return {
    ...s,
    trail: [...s.trail, {
      text, extra, who: roleName(role),
      when: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }],
  };
}

/** Labels for the score component bars. */
export const SCORE_LABEL: Record<string, string> = {
  severity: 'Topic severity', rating: 'Rating severity', recency: 'Recency', reach: 'Author reach',
  unanswered: 'No public reply', negative: 'Negative root', thread_heat: 'Thread heat', pile_on: 'Pile-on',
};

/** What a move POSTs to /v1/cases/{case_id}/reply: the target `state`, checked by the server's state machine. */
export function replyBody(s: CaseState, m: Move, role: RoleId, severity: number, email: string) {
  const steps = m.step ? { [m.step]: true } : undefined;
  return {
    state: m.to,
    reply_text: s.draft || undefined,
    severity,
    escalation_level: ROLE_LEVEL[role],
    escalation_to: escalationTo(m, role),
    is_final: m.setsFinal ? true : m.id === 'reject' || m.id === 'redraft' || m.id === 'reopen' ? false : s.isFinal,
    owner: email,
    history: s.history,
    ...(steps ? { steps } : {}),
    ...(m.external ? { external: true } : {}),
  };
}

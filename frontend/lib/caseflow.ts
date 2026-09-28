/* Reply lifecycle for a case.
 *
 * Statuses are the API's own eight, checked against POST /v1/cases/{case_id}/reply on
 * 28 Sep 2026: anything else comes back 400 "Invalid status", and validation runs before the
 * case is even looked up. So a status pill sends its own name and there is no translation
 * layer to drift out of step.
 *
 * Two things the API has no status for sit beside it rather than inside it. `isFinal` carries
 * is_final, which is how Compliance approval is recorded. `sendState` covers the seconds around
 * a request, which is a property of the request, not of the case. */

export type RoleId = 'branch' | 'cx' | 'comp';
export type StatusId =
  | 'open' | 'draft' | 'pending' | 'rejected'
  | 'escalated' | 'manual_reply_submitted' | 'resolved' | 'closed';
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
  draft: { label: 'Draft', tone: '' },
  pending: { label: 'Pending approval', tone: 'warn' },
  rejected: { label: 'Sent back', tone: 'bad' },
  escalated: { label: 'Escalated', tone: 'bad' },
  manual_reply_submitted: { label: 'Posted manually', tone: 'ok' },
  resolved: { label: 'Resolved', tone: 'ok' },
  closed: { label: 'Closed', tone: 'ok' },
};

/** Which lifecycle a case follows. Decided by topic, never by role. */
export const TRACKS: Record<TrackId, StatusId[]> = {
  service: ['open', 'draft', 'manual_reply_submitted', 'resolved', 'closed'],
  conduct: ['open', 'draft', 'pending', 'rejected', 'manual_reply_submitted', 'resolved', 'closed'],
  doxing: ['open', 'escalated', 'closed'],
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
  /** Only while nobody has taken the case. */
  needsUnowned?: boolean;
  /** Only once Compliance has approved, or only while it has not. */
  needsFinal?: boolean;
  needsNotFinal?: boolean;
  /** Records the approval instead of moving the case on. */
  setsFinal?: boolean;
  step?: StepId;
  kind?: 'primary' | 'danger';
  /** Goes through the platform, so the status waits on a request. */
  async?: boolean;
}

/* Every transition the UI can offer. `roles` is who may perform it.
 * Role rules follow Mas Aan's guideline of 24 Sep 2026, with one override from Hapsoro on
 * 28 Sep: closing is Compliance only on every track. */
export const MOVES: Move[] = [
  { id: 'triage', from: ['open'], to: 'open', roles: ['branch', 'cx', 'comp'], tracks: ['service', 'conduct'],
    needsUnowned: true, label: 'Take the case', desc: 'Assign it to yourself and start work.' },

  /* ---- service ---- */
  { id: 'send', from: ['draft'], to: 'resolved', roles: ['branch', 'cx', 'comp'], tracks: ['service'],
    label: 'Send the reply', desc: 'Publishes straight to the platform through the API.',
    needsDraft: true, kind: 'primary', async: true },
  { id: 'mark_sent', from: ['draft'], to: 'manual_reply_submitted', roles: ['branch', 'cx', 'comp'], tracks: ['service'],
    label: 'Mark as posted manually', desc: 'You pasted the reply into the platform yourself. Recorded as posted, not yet confirmed.',
    needsDraft: true },

  /* ---- conduct: severity 4 needs Compliance sign-off before anything is published ---- */
  { id: 'submit', from: ['draft'], to: 'pending', roles: ['branch', 'cx'], tracks: ['conduct'],
    label: 'Submit for compliance approval', desc: 'Severity 4 wording cannot be published without sign-off.',
    needsDraft: true, kind: 'primary' },
  { id: 'approve', from: ['pending'], to: 'pending', roles: ['comp'], tracks: ['conduct'],
    needsNotFinal: true, setsFinal: true, kind: 'primary',
    label: 'Approve the wording', desc: 'Clears the draft for publication exactly as written. Sends is_final true.' },
  { id: 'reject', from: ['pending'], to: 'rejected', roles: ['comp'], tracks: ['conduct'],
    label: 'Send back for rewrite', desc: 'Returns it to the author with your note attached.', kind: 'danger' },
  { id: 'rewrite', from: ['rejected'], to: 'draft', roles: ['branch', 'cx'], tracks: ['conduct'],
    label: 'Rewrite the draft', desc: 'Reopens the composer so the wording can be changed.', kind: 'primary' },
  { id: 'send_appr', from: ['pending'], to: 'resolved', roles: ['cx', 'comp'], tracks: ['conduct'],
    label: 'Send the approved reply', desc: 'Publishes the signed-off wording through the API.',
    needsDraft: true, needsFinal: true, kind: 'primary', async: true },
  { id: 'mark_sent_appr', from: ['pending'], to: 'manual_reply_submitted', roles: ['cx', 'comp'], tracks: ['conduct'],
    label: 'Mark as posted manually', desc: 'The approved wording was published by hand rather than through the API.',
    needsDraft: true, needsFinal: true },

  /* ---- confirming ---- */
  { id: 'sync', from: ['manual_reply_submitted'], to: 'resolved', roles: ['branch', 'cx', 'comp'],
    tracks: ['service', 'conduct'], kind: 'primary',
    label: 'Run the next sync', desc: 'Re-reads the platform and confirms the reply is really there. In production this is the nightly job, not a button.' },
  { id: 'external', from: ['open', 'draft', 'pending'], to: 'resolved', roles: ['branch', 'cx', 'comp'],
    tracks: ['service', 'conduct'],
    label: 'Someone replied outside the dashboard', desc: 'The sync found a reply that did not originate here.' },

  /* ---- doxing: the composer is locked by policy, and no role unlocks it ---- */
  { id: 'hide', from: ['open', 'escalated'], to: 'escalated', roles: ['cx', 'comp'], tracks: ['doxing'],
    label: 'Hide the comment', desc: 'Removes it from public view without notifying the author.', kind: 'danger', step: 'hidden' },
  { id: 'report', from: ['open', 'escalated'], to: 'escalated', roles: ['cx', 'comp'], tracks: ['doxing'],
    label: 'Report to Meta', desc: 'Files a privacy violation report for exposed personal data.', kind: 'danger', step: 'reported' },
  { id: 'legal', from: ['open', 'escalated'], to: 'escalated', roles: ['comp'], tracks: ['doxing'],
    label: 'Escalate to legal', desc: 'Hands the case over with the archived capture attached.', kind: 'danger', step: 'legal' },

  /* Closing follows Mas Aan's guideline, which the server turned out to enforce too: CX HO may
   * close a service case and a no-action one, but never severity 4 or doxing. Probed 28 Sep 2026
   * — the server answers 403 "CX HO is not permitted to close severity 4 or doxing cases". */
  { id: 'no_action', from: ['open'], to: 'closed', roles: ['cx', 'comp'], tracks: ['silent', 'service'],
    label: 'Close, no action needed', desc: 'A rating with no text carries nothing to answer.' },
  { id: 'close', from: ['resolved'], to: 'closed', roles: ['cx', 'comp'], tracks: ['service'],
    label: 'Close the case', desc: 'Reply confirmed live. Nothing outstanding.', kind: 'primary' },
  { id: 'close_c', from: ['resolved'], to: 'closed', roles: ['comp'], tracks: ['conduct'],
    label: 'Close the case', desc: 'Severity 4 cases are closed by compliance only.', kind: 'primary' },
  { id: 'close_m', from: ['escalated'], to: 'closed', roles: ['comp'], tracks: ['doxing'],
    label: 'Close the case', desc: 'Only once the comment is hidden and reported.', kind: 'primary',
    needsSteps: ['hidden', 'reported'] },

  { id: 'reopen', from: ['closed'], to: 'open', roles: ['cx', 'comp'],
    tracks: ['service', 'conduct', 'doxing', 'silent'],
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
  /** is_final in the API. Compliance approval is recorded here, not as a status. */
  isFinal: boolean;
  /** Where a platform request has got to. Never sent to the API. */
  sendState: SendState;
  /** The move a failed send would retry, so retry inherits that move's permissions. */
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

/** What a case is scored and handled as. Topic decides, not the person looking at it. */
export function trackOf(input: { topicIds: string[]; topicLabels: string[]; severity: number; hasText: boolean }): TrackId {
  const hay = [...input.topicIds, ...input.topicLabels].join(' ');
  if (/doxing|data_pribadi|data pribadi/i.test(hay)) return 'doxing';
  if (input.severity === 4 || /penagihan|penggelapan/i.test(hay)) return 'conduct';
  if (!input.hasText) return 'silent';
  return 'service';
}

export interface OfferedMove extends Move { block: string | null }

/** The single move that lands on `status`, or null when none or several do. Several means the
 *  pill cannot stand for one action — doxing reaches `escalated` by hide, report or legal — so
 *  it stays inert and the choice is made from the action list. */
export function moveToStatus(offered: OfferedMove[], status: StatusId): OfferedMove | null {
  const hits = offered.filter((m) => m.to === status);
  return hits.length === 1 ? hits[0] : null;
}

/** Every move reachable from the current status, each with the reason it cannot be taken. */
export function movesFor(s: CaseState, track: TrackId, role: RoleId): OfferedMove[] {
  return MOVES.filter((m) => m.tracks.includes(track) && m.from.includes(s.status)).map((m) => {
    let block: string | null = null;
    if (m.step && s.steps[m.step]) block = 'already done';
    else if (m.needsUnowned && s.owner) block = 'already taken';
    else if (m.needsNotFinal && s.isFinal) block = 'already approved';
    else if (!m.roles.includes(role)) block = `${m.roles.map(roleName).join(' or ')} only`;
    else if (m.needsDraft && !s.draft.trim()) block = 'write the reply first';
    else if (m.needsFinal && !s.isFinal) block = 'needs compliance approval first';
    else if (m.needsSteps && m.needsSteps.some((x) => !s.steps[x])) {
      block = `needs ${m.needsSteps.filter((x) => !s.steps[x]).join(' and ')} first`;
    }
    return { ...m, block };
  });
}

const EXTRA: Record<string, string> = {
  sync: 'Simulated here. In production this is the nightly sync, and the platform is the source of truth, not this dashboard.',
  external: 'Reply found on the platform with no record of being sent from here.',
  approve: 'Recorded as is_final true. The wording is locked from here.',
};

/** Which level a move hands the case to next. null when it stays where it is.
 *
 * `approve` deliberately sends null. Probed against the live API on 28 Sep 2026: the server
 * reads status `pending` carrying any escalation_to as "submitting a draft for approval" and
 * answers 403 "Compliance is not permitted to submit drafts for approval". With null it is
 * accepted and is_final sticks. */
export function escalationTo(m: Move): 1 | 2 | 3 | null {
  if (m.id === 'submit') return 3;      // to Compliance for sign-off
  if (m.id === 'reject') return 1;      // back to the author
  if (m.step) return 3;                 // doxing stays with Compliance
  return null;
}

/** Applies a move. Returns a new state; the caller owns rendering and the async send. */
export function applyMove(s: CaseState, m: Move, role: RoleId, note?: string, email?: string): CaseState {
  const next: CaseState = { ...s, steps: { ...s.steps }, trail: [...s.trail], history: [...s.history] };
  if (m.id === 'reject') next.note = note?.trim() || 'Needs rewrite';
  else if (m.id !== 'reopen') next.note = '';
  if (m.step) next.steps[m.step] = true;
  if (m.id === 'external') next.external = true;
  if (m.setsFinal) next.isFinal = true;
  if (!next.owner && m.to !== 'closed') next.owner = roleName(role);
  if (m.id === 'reopen') {
    next.steps = {}; next.external = false; next.isFinal = false; next.sendState = 'idle'; next.pendingMove = null;
  }
  if (m.id === 'rewrite') next.isFinal = false;

  /* An async move holds the status where it is until the platform answers. */
  if (m.async) {
    next.sendState = 'sending';
    next.pendingMove = m.id;
  } else {
    next.status = m.to;
  }

  next.history.push({
    escalation_level: ROLE_LEVEL[role],
    escalation_to: escalationTo(m),
    owner: email ?? roleName(role),
    updated_at: new Date().toISOString(),
    status: next.status,
  });
  return logTo(next, m.label, m.id === 'reject' ? next.note : EXTRA[m.id] ?? '', role);
}

/** Resolves a send that was waiting on the platform. */
export function finishSend(s: CaseState, ok: boolean, role: RoleId, platform: string): CaseState {
  if (s.sendState !== 'sending') return s;
  const m = MOVES.find((x) => x.id === s.pendingMove);
  if (!m) return { ...s, sendState: 'idle', pendingMove: null };
  if (!ok) {
    return logTo({ ...s, sendState: 'failed' }, 'Send failed',
      'API returned an error. The wording is kept; retry or post it manually.', role);
  }
  return logTo({ ...s, status: m.to, sendState: 'idle', pendingMove: null }, 'Reply published',
    `Delivered through the ${platform} API. Not yet confirmed by a sync.`, role);
}

/** Only these statuses let the composer be edited; the rest are locked mid-flow. */
export const EDITABLE: StatusId[] = ['open', 'draft'];

/** Writing into an untouched case is itself a transition: it becomes a draft. */
export function withDraft(s: CaseState, text: string, templateId = s.templateId): CaseState {
  const status: StatusId = text.trim() && s.status === 'open' ? 'draft' : s.status;
  return { ...s, draft: text, templateId, status };
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

/** Exactly what a move would POST to /v1/cases/{case_id}/reply, once that call is wired. */
export function replyBody(s: CaseState, m: Move, role: RoleId, severity: number, email: string) {
  return {
    status: m.async ? m.to : s.status,
    reply_text: s.draft || undefined,
    severity,
    escalation_level: ROLE_LEVEL[role],
    escalation_to: escalationTo(m),
    is_final: m.setsFinal ? true : s.isFinal,
    owner: email,
    history: s.history,
  };
}

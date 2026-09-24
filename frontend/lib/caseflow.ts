/* Reply lifecycle for a case, ported from the v6 prototype.
 *
 * UI only. Nothing here talks to the API: /v1/cases is read-only, workflow.owner and
 * workflow.updated_at come back null on every row, and no endpoint accepts a reply.
 * State lives in memory for the length of a session and is lost on reload, exactly as
 * in the prototype. This file is the spec the backend would build against. */

export type RoleId = 'branch' | 'cx' | 'comp';
export type StatusId =
  | 'open' | 'triaged' | 'draft' | 'pending' | 'approved'
  | 'sending' | 'sent' | 'failed' | 'verified' | 'moderation' | 'closed';
export type TrackId = 'service' | 'conduct' | 'doxing' | 'silent';
export type StepId = 'hidden' | 'reported' | 'legal';

export const ROLES: { id: RoleId; label: string }[] = [
  { id: 'branch', label: 'Branch user' },
  { id: 'cx', label: 'CX HO' },
  { id: 'comp', label: 'Compliance' },
];

export const roleName = (id: RoleId) => ROLES.find((r) => r.id === id)?.label ?? id;

export const STATE: Record<StatusId, { label: string; tone: '' | 'warn' | 'ok' | 'bad' }> = {
  open: { label: 'Open', tone: '' },
  triaged: { label: 'Triaged', tone: '' },
  draft: { label: 'Draft written', tone: '' },
  pending: { label: 'Pending approval', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  sending: { label: 'Sending', tone: 'warn' },
  sent: { label: 'Reply posted', tone: 'ok' },
  failed: { label: 'Send failed', tone: 'bad' },
  verified: { label: 'Verified on platform', tone: 'ok' },
  moderation: { label: 'Moderation', tone: 'bad' },
  closed: { label: 'Closed', tone: 'ok' },
};

/** Which lifecycle a case follows. Decided by topic, never by role. */
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
  step?: StepId;
  kind?: 'primary' | 'danger';
  async?: boolean;
}

/** Every transition the UI can offer. `roles` is who may perform it. */
export const MOVES: Move[] = [
  { id: 'triage', from: ['open'], to: 'triaged', roles: ['branch', 'cx', 'comp'], tracks: ['service', 'conduct'],
    label: 'Take the case', desc: 'Assign it to yourself and start work.' },

  { id: 'submit', from: ['draft'], to: 'pending', roles: ['branch', 'cx'], tracks: ['conduct'],
    label: 'Submit for compliance approval', desc: 'Severity 4 wording cannot be published without sign-off.',
    needsDraft: true, kind: 'primary' },

  { id: 'approve', from: ['pending'], to: 'approved', roles: ['comp'], tracks: ['conduct'],
    label: 'Approve the wording', desc: 'Clears the draft for publication exactly as written.', kind: 'primary' },
  { id: 'reject', from: ['pending'], to: 'draft', roles: ['comp'], tracks: ['conduct'],
    label: 'Send back for rewrite', desc: 'Returns it to the author with your note attached.', kind: 'danger' },

  { id: 'send', from: ['draft'], to: 'sending', roles: ['branch', 'cx', 'comp'], tracks: ['service'],
    label: 'Send the reply', desc: 'Publishes straight to the platform through the API.',
    needsDraft: true, kind: 'primary', async: true },
  { id: 'send_appr', from: ['approved'], to: 'sending', roles: ['cx', 'comp'], tracks: ['conduct'],
    label: 'Send the approved reply', desc: 'Publishes the signed-off wording through the API.',
    needsDraft: true, kind: 'primary', async: true },

  { id: 'retry', from: ['failed'], to: 'sending', roles: ['branch', 'cx', 'comp'], tracks: ['service', 'conduct'],
    label: 'Retry the send', desc: 'Tries the API again with the same wording.', kind: 'primary', async: true },
  { id: 'fallback', from: ['failed'], to: 'draft', roles: ['branch', 'cx', 'comp'], tracks: ['service'],
    label: 'Fall back to copy and paste', desc: 'Returns to the draft so you can post it manually.' },
  { id: 'fallback_c', from: ['failed'], to: 'approved', roles: ['cx', 'comp'], tracks: ['conduct'],
    label: 'Fall back to copy and paste', desc: 'Keeps the approval and lets you post the wording manually.' },

  { id: 'mark_sent', from: ['draft'], to: 'sent', roles: ['branch', 'cx', 'comp'], tracks: ['service'],
    label: 'Mark as posted manually', desc: 'You pasted the reply into the platform yourself. Recorded as posted, not yet verified.',
    needsDraft: true },
  { id: 'mark_sent_appr', from: ['approved'], to: 'sent', roles: ['cx', 'comp'], tracks: ['conduct'],
    label: 'Mark as posted manually', desc: 'The approved wording was published by hand rather than through the API.',
    needsDraft: true },

  { id: 'sync', from: ['sent'], to: 'verified', roles: ['branch', 'cx', 'comp'], tracks: ['service', 'conduct'],
    label: 'Run the next sync', desc: 'Re-reads the platform and confirms the reply is really there. In production this is the nightly job, not a button.',
    kind: 'primary' },

  { id: 'external', from: ['open', 'triaged', 'draft', 'pending', 'approved'], to: 'verified',
    roles: ['branch', 'cx', 'comp'], tracks: ['service', 'conduct'],
    label: 'Someone replied outside the dashboard', desc: 'The sync found a reply that did not originate here.' },

  { id: 'hide', from: ['open', 'moderation'], to: 'moderation', roles: ['cx', 'comp'], tracks: ['doxing'],
    label: 'Hide the comment', desc: 'Removes it from public view without notifying the author.', kind: 'danger', step: 'hidden' },
  { id: 'report', from: ['open', 'moderation'], to: 'moderation', roles: ['cx', 'comp'], tracks: ['doxing'],
    label: 'Report to Meta', desc: 'Files a privacy violation report for exposed personal data.', kind: 'danger', step: 'reported' },
  { id: 'legal', from: ['open', 'moderation'], to: 'moderation', roles: ['comp'], tracks: ['doxing'],
    label: 'Escalate to legal', desc: 'Hands the case over with the archived capture attached.', kind: 'danger', step: 'legal' },

  { id: 'no_action', from: ['open', 'triaged'], to: 'closed', roles: ['cx', 'comp'], tracks: ['silent', 'service'],
    label: 'Close, no action needed', desc: 'A rating with no text carries nothing to answer.' },

  { id: 'close', from: ['verified'], to: 'closed', roles: ['cx', 'comp'], tracks: ['service'],
    label: 'Close the case', desc: 'Reply confirmed live. Nothing outstanding.', kind: 'primary' },
  { id: 'close_c', from: ['verified'], to: 'closed', roles: ['comp'], tracks: ['conduct'],
    label: 'Close the case', desc: 'Severity 4 cases are closed by compliance only.', kind: 'primary' },
  { id: 'close_m', from: ['moderation'], to: 'closed', roles: ['comp'], tracks: ['doxing'],
    label: 'Close the case', desc: 'Only once the comment is hidden and reported.', kind: 'primary',
    needsSteps: ['hidden', 'reported'] },

  { id: 'reopen', from: ['closed'], to: 'triaged', roles: ['cx', 'comp'],
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
  draft: string;
  templateId: string;
  owner: string | null;
  steps: Partial<Record<StepId, boolean>>;
  note: string;
  external: boolean;
  trail: { text: string; extra: string; who: string; when: string }[];
}

export const newCaseState = (): CaseState => ({
  status: 'open', draft: '', templateId: '', owner: null, steps: {}, note: '', external: false, trail: [],
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

/** Every move reachable from the current status, each with the reason it cannot be taken. */
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
  sync: 'Simulated here. In production this is the nightly sync, and the platform is the source of truth, not this dashboard.',
  external: 'Reply found on the platform with no record of being sent from here.',
};

/** Applies a move. Returns a new state; the caller owns rendering and the async send. */
export function applyMove(s: CaseState, m: Move, role: RoleId, note?: string): CaseState {
  const next: CaseState = { ...s, steps: { ...s.steps }, trail: [...s.trail] };
  if (m.id === 'reject') next.note = note?.trim() || 'Needs rewrite';
  else if (m.id !== 'reopen') next.note = '';
  if (m.step) next.steps[m.step] = true;
  if (m.id === 'external') next.external = true;
  if (!next.owner && m.to !== 'closed') next.owner = roleName(role);
  if (m.id === 'reopen') { next.steps = {}; next.external = false; }
  next.status = m.to;
  return logTo(next, m.label, m.id === 'reject' ? next.note : EXTRA[m.id] ?? '', role);
}

/** Only these statuses let the composer be edited; the rest are locked mid-flow. */
export const EDITABLE: StatusId[] = ['open', 'triaged', 'draft'];

/** Writing into an untouched case is itself a transition: it becomes a draft. */
export function withDraft(s: CaseState, text: string, templateId = s.templateId): CaseState {
  const status = text.trim() && (s.status === 'open' || s.status === 'triaged') ? 'draft' : s.status;
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

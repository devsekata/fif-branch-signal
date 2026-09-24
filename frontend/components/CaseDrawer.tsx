'use client';

import { useEffect, useRef, useState } from 'react';
import { Rating, SourceBadge, Tags } from '@/components/ui';
import {
  EDITABLE, ROLES, SCORE_LABEL, STATE, TEMPLATES, TRACKS,
  applyMove, logTo, movesFor, roleName, trackOf, withDraft,
  type OfferedMove, type RoleId, type TrackId,
} from '@/lib/caseflow';
import { readCase, useCaseStore, writeCase } from '@/lib/caseStore';
import type { Channel, Priority } from '@/lib/types';

/** What the drawer needs from a queue row. */
export interface DrawerCase {
  id: string;
  priority: Priority;
  score: number;
  severity: number;
  source: Channel;
  where: string;
  stars: number | null;
  date: string;
  age: number;
  text: string;
  topics: string[];
  topicLabels: string[];
  who: string;
  meta: string;
  url: string | null;
  components: Record<string, number>;
}

export function CaseDrawer({ c, role, onRole, onClose }: {
  c: DrawerCase | null;
  role: RoleId;
  onRole: (r: RoleId) => void;
  onClose: () => void;
}) {
  useCaseStore();
  const [simFail, setSimFail] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const s = c ? readCase(c.id) : null;
  const track: TrackId | null = c ? trackOf({ topicIds: c.topics, topicLabels: c.topicLabels, severity: c.severity, hasText: !!c.text }) : null;

  /* `sending` is transient: the prototype resolves it on a timer rather than a click,
   * because the real thing is an API round trip. */
  /* Depends on c.id, not c: the parent rebuilds the case object every render, so depending on
   * the object would clear and restart this timer each time and the send could never land. */
  const cid = c?.id;
  const csource = c?.source;
  useEffect(() => {
    if (!cid || s?.status !== 'sending') return;
    timer.current = setTimeout(() => {
      const cur = readCase(cid);
      if (cur.status !== 'sending') return;
      const platform = csource === 'google' ? 'Google Business Profile' : 'Instagram';
      writeCase(cid, simFail
        ? logTo({ ...cur, status: 'failed' }, 'Send failed', 'API returned an error. The wording is kept; retry or post it manually.', role)
        : logTo({ ...cur, status: 'sent' }, 'Reply published', `Delivered through the ${platform} API. Not yet confirmed by a sync.`, role));
    }, 1100);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [cid, csource, s?.status, simFail, role]);

  /* Mounted off-screen for one frame so the panel slides in rather than appearing.
   * The parent keys this component by case id, so every open starts from false. */
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!cid) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [cid, onClose]);

  /* Nothing is rendered while closed. A fixed panel parked at translateX(102%) still counts as
   * overflow to the right of the viewport, which gave the whole page a horizontal scrollbar. */
  if (!c || !s || !track) return null;

  const moves = movesFor(s, track, role);
  const can = moves.filter((m) => !m.block);
  const cant = moves.filter((m) => m.block);
  const sendMove = moves.find((m) => ['send', 'send_appr', 'retry'].includes(m.id));
  const editable = EDITABLE.includes(s.status);
  const pool = track === 'conduct' ? TEMPLATES.conduct : TEMPLATES.service;
  const steps = TRACKS[track];
  const at = steps.indexOf(s.status);

  function run(m: OfferedMove) {
    if (!c || m.block) return;
    let note: string | undefined;
    if (m.id === 'reject') {
      const answer = window.prompt('Why is it going back? The author sees this note.', 'Wording implies an admission of fault.');
      if (answer === null) return;
      note = answer;
    }
    writeCase(c.id, applyMove(readCase(c.id), m, role, note));
  }

  const lock: Partial<Record<string, string>> = {
    pending: 'Locked while compliance reviews it.',
    approved: 'Locked after approval — editing would void the sign-off.',
    sending: 'Sending to the platform…',
    failed: 'The API rejected the send. Retry, or post it manually.',
    sent: 'Posted. Reopen the case to change anything.',
    verified: 'Verified on the platform.',
    closed: 'Case closed.',
  };

  const comp = Object.entries(c.components).filter(([, v]) => typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1]);
  const compMax = comp.length ? Math.max(...comp.map(([, v]) => v)) : 1;

  return (
    <>
      <div className={shown ? 'scrim on' : 'scrim'} onClick={onClose} />
      <aside className={shown ? 'drawer on' : 'drawer'} role="dialog" aria-modal="true" aria-labelledby="dw-title">
        <div className="dw-top">
          <div className="dw-row">
            <div>
              <span className={`chip c-${c.priority}`}>{c.priority}</span>
              <span style={{ marginLeft: 6 }}><SourceBadge source={c.source} /></span>
              <span className="chip c-low" style={{ marginLeft: 6 }}>{track} track</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="demo-tag">Demo role</span>
              <div className="role">
                {ROLES.map((r) => (
                  <button key={r.id} className={role === r.id ? 'on' : undefined} onClick={() => onRole(r.id)}>{r.label}</button>
                ))}
              </div>
              <button className="dw-close" onClick={onClose} aria-label="Close">×</button>
            </div>
          </div>
          <div className="dw-title" id="dw-title">
            {c.source === 'google' ? `${c.where} · ${c.stars ?? '—'}★ review` : 'Thread on the official account'}
          </div>
          <div className="dw-sub">
            <span>Score <b style={{ color: 'var(--ink)' }}>{c.score}</b></span><span style={{ color: '#C3D3D1' }}>·</span>
            <span>Severity {c.severity}</span><span style={{ color: '#C3D3D1' }}>·</span>
            <span>{c.date}</span><span style={{ color: '#C3D3D1' }}>·</span>
            <span>{c.age} days old</span><span style={{ color: '#C3D3D1' }}>·</span>
            <span>{s.owner ? `Owner ${s.owner}` : 'Unassigned'}</span>
            {c.url && <><span style={{ color: '#C3D3D1' }}>·</span><a className="link" href={c.url} target="_blank" rel="noopener">Open original</a></>}
          </div>
          <div className="state-line">
            {steps.map((k, i) => (
              <span key={k}>
                <span className={`st ${at < 0 ? '' : i < at ? 'done' : i === at ? 'now' : ''}`}>{STATE[k].label}</span>
                {i < steps.length - 1 && <span className="arrow"> ▸ </span>}
              </span>
            ))}
            {s.external && <span className="st done">replied outside</span>}
          </div>
        </div>

        <div className="dw-body">
          <div className="blk">
            <h4>The case<span className="hint">{c.who}{c.meta && ` · ${c.meta}`}</span></h4>
            <div className="quote" style={{ whiteSpace: 'pre-wrap' }}>
              {c.text || <span style={{ color: 'var(--ink-3)' }}>Rating only, no text written.</span>}
            </div>
            <div style={{ marginTop: 9 }}><Tags topics={c.topics} /></div>
            {c.stars != null && <div style={{ marginTop: 8 }}><Rating stars={c.stars} /></div>}
          </div>

          {comp.length > 0 && (
            <div className="blk">
              <h4>Why it scores {c.score}<span className="hint">weights come from config</span></h4>
              {comp.map(([k, v]) => (
                <div className="comp-row" key={k}>
                  <span className="lbl">{SCORE_LABEL[k] ?? k}</span>
                  <span className="bar"><i style={{ width: `${(100 * v) / compMax}%` }} /></span>
                  <span className="val">{v}</span>
                </div>
              ))}
            </div>
          )}

          <div className="blk">
            <h4>Next step<span className="hint">as {roleName(role)}</span></h4>
            {track === 'doxing' && (
              <div className="blocked" style={{ marginBottom: 11 }}>
                <b>Do not reply to this one.</b> Answering a comment that exposes someone&apos;s personal data amplifies its reach and puts FIF in public dialogue with content that should be removed. Hide, report, escalate — the composer is locked by policy, and no role unlocks it.
              </div>
            )}
            {track === 'doxing' && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 10 }}>
                Progress: {(['hidden', 'reported', 'legal'] as const).map((k) => (
                  <span key={k} className={`st ${s.steps[k] ? 'done' : ''}`} style={{ marginRight: 5 }}>{k}</span>
                ))}
              </div>
            )}
            {!can.length && !cant.length ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Case closed. Nothing outstanding.</div>
            ) : (
              <div className="actions">
                {can.map((m) => (
                  <button key={m.id} className={`act ${m.kind ?? ''}`} onClick={() => run(m)}>
                    <span className="ic">▸</span>
                    <span><span className="t">{m.label}</span><span className="d">{m.desc}</span></span>
                  </button>
                ))}
                {cant.map((m) => (
                  <button key={m.id} className="act" disabled>
                    <span className="ic">—</span>
                    <span><span className="t">{m.label}</span>
                      <span className="d">{m.block === 'already done' ? 'Already done.' : `Not available to ${roleName(role)} here — ${m.block}.`}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {s.note && <div className="blocked" style={{ marginTop: 11 }}><b>Sent back:</b> {s.note}</div>}
          </div>

          {track === 'doxing' ? (
            <div className="blk">
              <h4>Reply<span className="hint">locked by policy</span></h4>
              <div className="blocked">The composer is disabled for this category. A policy rule, not a permission — no role unlocks it.</div>
            </div>
          ) : (track === 'silent' && !s.draft) ? null : (
            <div className="blk">
              <h4>Reply<span className="hint">templates are placeholders, pending FIF legal</span></h4>
              {lock[s.status] && <div className="sim" style={{ marginBottom: 10 }}><span>●</span><span>{lock[s.status]}</span></div>}
              <select
                className="tpl" value={s.templateId} disabled={!editable}
                onChange={(e) => {
                  const t = pool.find((x) => x.id === e.target.value);
                  const next = withDraft(readCase(c.id), t ? t.body : '', e.target.value);
                  writeCase(c.id, logTo(next, 'Draft written', t ? `From template: ${t.label}` : '', role));
                }}
              >
                <option value="">Choose a template…</option>
                {pool.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <textarea
                className="compose" value={s.draft} disabled={!editable}
                placeholder="Write the reply, or start from a template."
                onChange={(e) => writeCase(c.id, withDraft(readCase(c.id), e.target.value))}
              />
              <div className="cc">
                <button
                  className="btn2" disabled={!s.draft}
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(s.draft); } catch { /* clipboard blocked; the text is still on screen */ }
                    writeCase(c.id, logTo(readCase(c.id), 'Draft copied to paste into the platform', '', role));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 900);
                  }}
                >{copied ? 'Copied' : 'Copy text'}</button>
                <button
                  className="btn2 solid" disabled={!sendMove || !!sendMove.block}
                  title={sendMove ? (sendMove.block ?? 'Publish to the platform') : 'Not available in this state'}
                  onClick={() => sendMove && run(sendMove)}
                >{s.status === 'sending' ? 'Sending…' : s.status === 'failed' ? 'Retry send' : 'Send the reply'}</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={simFail} onChange={(e) => setSimFail(e.target.checked)} /> simulate an API failure
                </label>
                <span className="count">{s.draft.length} characters</span>
              </div>
              {sendMove?.block && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 7 }}>Send is unavailable: {sendMove.block}.</div>}
            </div>
          )}

          <div className="blk">
            <h4>Case history{s.trail.length > 0 && <span className="hint">{s.trail.length} events</span>}</h4>
            {s.trail.length ? (
              <div className="trail">
                {[...s.trail].reverse().map((e, i) => (
                  <div className="ev" key={`${e.when}-${i}`}>
                    <span className="dot2" />
                    <span>
                      {e.text}
                      {e.extra && <div style={{ color: 'var(--ink-2)', marginTop: 2 }}>{e.extra}</div>}
                      <div className="when">{e.who} · {e.when}</div>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                Nothing recorded yet. Every step is logged here with the role that took it. History is held in memory and clears on reload.
              </div>
            )}
          </div>
        </div>

        <div className="dw-foot">
          <div className="sim">
            <span>⚠</span>
            <span>
              <b>Sending is simulated. No message leaves this browser.</b> The Send button walks the real states the dev team must build — sending, posted, failed, verified — but the Google Business Profile API and the Instagram manage-engagement permission are not connected, and <span className="mono">/v1/cases</span> is read-only. The copy-and-paste route stays available for whichever channel ships without an API.
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

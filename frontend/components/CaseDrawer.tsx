'use client';

import { useEffect, useState } from 'react';
import { Rating, SourceBadge, Tags } from '@/components/ui';
import {
  EDITABLE, SCORE_LABEL, STATE, TEMPLATES, TRACKS,
  applyMove, logTo, moveToStatus, movesFor, replyBody, roleName, trackOf, withDraft,
  type OfferedMove, type RoleId, type TrackId,
} from '@/lib/caseflow';
import { explain, fromServer, postReply, readCaseFromApi } from '@/lib/caseApi';
import { readCase, useCase, writeCase } from '@/lib/caseStore';
import type { Channel, Priority } from '@/lib/types';

/** Moves the Send button in the composer stands for, whichever track the case is on. */
const SEND_MOVES = ['send', 'send_appr'];

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

export function CaseDrawer({ c, role, email, onClose }: {
  c: DrawerCase | null;
  role: RoleId;
  email: string;
  onClose: () => void;
}) {
  const [simFail, setSimFail] = useState(false);
  const [copied, setCopied] = useState(false);

  const stored = useCase(c?.id);
  const s = c ? stored : null;
  const track: TrackId | null = c ? trackOf({ topicIds: c.topics, topicLabels: c.topicLabels, severity: c.severity, hasText: !!c.text }) : null;

  /* `sending` is transient: the prototype resolves it on a timer rather than a click,
   * because the real thing is an API round trip. */
  /* Depends on c.id, not c: the parent rebuilds the case object every render, so depending on
   * the object would clear and restart this timer each time and the send could never land. */
  const cid = c?.id;
  /* The server owns the workflow now, so the drawer opens on what it says rather than on
   * whatever this browser happened to remember. */
  useEffect(() => {
    if (!cid) return;
    let live = true;
    readCaseFromApi(cid).then(
      (fresh) => { if (live) writeCase(cid, { ...fresh, draft: readCase(cid).draft || fresh.draft }); },
      () => { /* offline or the case is unknown: keep what is on screen */ },
    );
    return () => { live = false; };
  }, [cid]);

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
  const retryMove = s.sendState === 'failed' ? moves.find((m) => m.id === s.pendingMove) ?? null : null;
  const sendMove = retryMove ?? moves.find((m) => SEND_MOVES.includes(m.id));
  const editable = EDITABLE.includes(s.status) && s.sendState === 'idle';
  const pool = track === 'conduct' ? TEMPLATES.conduct : TEMPLATES.service;
  const steps = TRACKS[track];
  const at = steps.indexOf(s.status);

  async function run(m: OfferedMove) {
    if (!c || m.block || stored.sendState === 'sending') return;
    let note: string | undefined;
    if (m.id === 'reject') {
      const answer = window.prompt('Why is it going back? The author sees this note.', 'Wording implies an admission of fault.');
      if (answer === null) return;
      note = answer;
    }
    const before = readCase(c.id);
    writeCase(c.id, { ...before, sendState: 'sending', pendingMove: m.id, apiError: null });
    try {
      const res = await postReply(c.id, replyBody(before, m, role, c.severity, email));
      const moved = applyMove(before, m, role, note, email);
      writeCase(c.id, fromServer({ ...moved, status: m.to, sendState: 'idle', pendingMove: null }, res));
    } catch (e) {
      /* Nothing is applied when the server says no, so the screen never shows a step it refused. */
      writeCase(c.id, { ...before, sendState: 'failed', pendingMove: m.id, apiError: explain(e) });
    }
  }

  const lock = s.sendState === 'sending' ? 'Saving to the server…'
    : s.sendState === 'failed' ? 'The server refused the last step. Nothing was changed.'
    : ({
        pending: s.isFinal ? 'Approved — editing would void the sign-off.' : 'Locked while compliance reviews it.',
        rejected: 'Sent back. Use Rewrite the draft to reopen the composer.',
        manual_reply_submitted: 'Posted. Reopen the case to change anything.',
        resolved: 'Published and confirmed.',
        closed: 'Case closed.',
      } as Partial<Record<string, string>>)[s.status];


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
              <span className="demo-tag">Acting as</span>
              <span className="role-now">{roleName(role)}</span>
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
          {/* Each status is a button when exactly one permitted move lands on it, so the flow can
              be driven from the line itself. The rules still decide: a status nobody may move to
              from here stays inert and says why. */}
          <div className="state-line">
            {steps.map((k, i) => {
              const mv = moveToStatus(moves, k);
              const tone = at < 0 ? '' : i < at ? 'done' : i === at ? 'now' : '';
              const why = mv?.block ? `${mv.label} — ${mv.block}` : undefined;
              return (
                <span key={k}>
                  {mv && !mv.block ? (
                    <button type="button" className={`st st-go ${tone}`} onClick={() => run(mv)} title={mv.desc}>
                      {STATE[k].label}
                    </button>
                  ) : (
                    <span className={`st ${tone}`} title={why}>{STATE[k].label}</span>
                  )}
                  {i < steps.length - 1 && <span className="arrow"> ▸ </span>}
                </span>
              );
            })}
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
            {s.apiError && (
              <div className="blocked" style={{ marginBottom: 11 }}>
                <b>Nothing was changed.</b> {s.apiError}
              </div>
            )}
            {s.sendState === 'sending' && (
              <div className="sim" style={{ marginBottom: 11 }}><span>●</span><span>Saving to the server…</span></div>
            )}
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
              {lock && <div className="sim" style={{ marginBottom: 10 }}><span>●</span><span>{lock}</span></div>}
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
                >{s.sendState === 'sending' ? 'Sending…' : s.sendState === 'failed' ? 'Retry send' : 'Send the reply'}</button>
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { Chips, PanelHead } from '@/components/ui';
import { T } from '@/lib/theme';

/* Image analysis: upload a picture, get five verdicts back from Gemini or Mistral.
 *
 * The request goes to /vision (app/vision/route.ts), which holds the API keys and forwards the
 * picture to the chosen provider. Both get the same prompt and the same scoring rules, so the
 * same picture can be sent to each and the answers compared. Nothing is stored on either side,
 * so the history below lives in this tab and is gone on reload. */

type Provider = 'gemini' | 'mistral';
const PROVIDERS: [Provider, string][] = [['gemini', 'Gemini'], ['mistral', 'Mistral']];
const PROVIDER_NAME: Record<Provider, string> = { gemini: 'Google Gemini', mistral: 'Mistral' };

type CheckId = 'ai_generated' | 'tampered' | 'indecent' | 'misleading' | 'spam';

interface Check { id: CheckId; label: string; yes: string; no: string; asks: string }

const CHECKS: Check[] = [
  { id: 'ai_generated', label: 'AI-generated', yes: 'Likely AI-generated', no: 'Likely authentic', asks: 'Was this picture made or altered by a generator?' },
  { id: 'tampered', label: 'Digitally altered', yes: 'Likely altered', no: 'No edit found', asks: 'Were numbers, contact details or text replaced after the fact?' },
  { id: 'indecent', label: 'Indecent content', yes: 'Indecent', no: 'Clean', asks: 'Does it show nudity, sexual or otherwise improper content?' },
  { id: 'misleading', label: 'Misleading or deceptive', yes: 'Misleading', no: 'No deception found', asks: 'Every number, link and line of text is checked. One conflict with how FIF operates is enough to flag it.' },
  { id: 'spam', label: 'Spam', yes: 'Spam', no: 'Not spam', asks: 'Is it unsolicited promotion from outside FIF: a loan offer, gambling, a giveaway, a job or contact lure? One sign is enough.' },
];

/** A check is flagged from this score up. A placeholder until it is calibrated on real pictures. */
const FLAG_AT = 60;
/** From this score up a check is not flagged but not cleared either: someone should look. */
const WATCH_AT = 35;

/** The two checks that say the picture itself cannot be trusted. A picture flagged on either is taken out of the results. */
const FAKE: CheckId[] = ['ai_generated', 'tampered'];

interface CheckedItem { kind: 'phone' | 'account' | 'link' | 'handle' | 'text'; value: string; status: 'conflict' | 'ok' | 'unverifiable'; note: string }
interface Verdict { score: number; reason: string; suspect_areas?: string[]; signals?: string[]; needs_checking?: string[]; items_checked?: CheckedItem[]; category?: string }

const SPAM_KIND: Record<string, string> = {
  loan_offer: 'Loan or cash offer', gambling: 'Gambling', engagement_services: 'Followers or likes for sale',
  giveaway_or_prize: 'Giveaway or prize lure', job_lure: 'Job lure', investment_or_mlm: 'Investment or MLM',
  contact_lure: 'Lure to another contact', other_promotion: 'Third-party promotion',
};

const KIND: Record<CheckedItem['kind'], string> = { phone: 'Phone', account: 'Account', link: 'Link', handle: 'Account name', text: 'Text' };
const STATUS: Record<CheckedItem['status'], { label: string; cls: string }> = {
  conflict: { label: 'Conflict', cls: 'chip c-critical' },
  unverifiable: { label: 'Unverifiable', cls: 'chip c-medium' },
  ok: { label: 'OK', cls: 'chip c-low' },
};

/** What POST /vision returns. */
type Analysis = Record<CheckId, Verdict> & { provider?: Provider; model: string; seconds?: number; blocked: string | null; extracted_text: string; summary: string };

interface Result extends Analysis {
  id: string;
  name: string;
  size: number;
  preview: string;
  analysedAt: string;
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

const kb = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const when = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const tone = (score: number) => (score >= FLAG_AT ? T.sig : score >= WATCH_AT ? 'var(--warn)' : 'var(--grow)');

/** Whether a picture was judged generated or altered, and so left out of the results. */
const isFake = (r: Analysis) => FAKE.some((id) => r[id].score >= FLAG_AT);

/** What still needs a person when no check is flagged: items the model could not verify, points it says the
 *  image cannot settle, scores just under the flag, and checks a refusal left unanswered. */
function openPoints(r: Analysis): string[] {
  const out: string[] = [];
  const items = CHECKS.flatMap((c) => r[c.id].items_checked ?? []);
  const conflict = items.filter((it) => it.status === 'conflict').length;
  if (conflict) out.push(`${conflict} ${conflict === 1 ? 'item conflicts' : 'items conflict'} with how FIF operates`);
  const kinds = new Map<string, number>();
  for (const it of items) if (it.status === 'unverifiable') kinds.set(KIND[it.kind].toLowerCase(), (kinds.get(KIND[it.kind].toLowerCase()) ?? 0) + 1);
  for (const [k, n] of kinds) out.push(`${n} ${k}${n === 1 ? '' : 's'} could not be verified`);
  const unsettled = CHECKS.reduce((a, c) => a + (r[c.id].needs_checking?.length ?? 0), 0);
  if (unsettled) out.push(`${unsettled} ${unsettled === 1 ? 'point' : 'points'} the image cannot settle`);
  const near = CHECKS.filter((c) => r[c.id].score >= WATCH_AT && r[c.id].score < FLAG_AT);
  if (near.length) out.push(`${near.map((c) => c.label).join(', ')} close to the flag`);
  if (r.blocked) out.push('four checks not assessed');
  return out;
}

async function analyseImage(file: File, provider: Provider): Promise<Analysis> {
  const form = new FormData();
  form.set('file', file);
  form.set('provider', provider);
  const res = await fetch('/vision', { method: 'POST', body: form });
  const body = (await res.json().catch(() => null)) as (Analysis & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `The analysis failed (${res.status}).`);
  return body;
}

export function ImageAnalysis() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<Result[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('gemini');
  const input = useRef<HTMLInputElement>(null);

  /* Previews are object URLs, which the browser holds until told otherwise. The ones handed to a
   * result live as long as the page; all of them are released when the tab is left. */
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  function clear() {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = '';
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { setError('Only JPG, PNG or WebP pictures can be analysed.'); return; }
    if (f.size > MAX_BYTES) { setError(`That file is ${kb(f.size)}. The limit is ${kb(MAX_BYTES)}.`); return; }
    const url = URL.createObjectURL(f);
    urls.current.push(url);
    setError('');
    setFile(f);
    setPreview(url);
  }

  async function analyse() {
    if (!file || !preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const a = await analyseImage(file, provider);
      const result: Result = { ...a, id: `${Date.now()}-${provider}-${file.name}`, name: file.name, size: file.size, preview, analysedAt: new Date().toISOString() };
      setRows((r) => [result, ...r]);
      setOpenId(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = rows.find((r) => r.id === openId) ?? rows[0];
  /* A generated or altered picture is taken out of the results: it is listed in its own card, and the other
   * checks are counted over the pictures that are left. */
  const fakes = rows.filter(isFake);
  const kept = rows.filter((r) => !isFake(r));
  const flagged = (id: CheckId, from = kept) => from.filter((r) => r[id].score >= FLAG_AT).length;
  const anyFlag = kept.filter((r) => CHECKS.some((c) => r[c.id].score >= FLAG_AT)).length;
  const toCheck = kept.filter((r) => !CHECKS.some((c) => r[c.id].score >= FLAG_AT) && openPoints(r).length).length;

  return (
    <>
      <div className="sim mb">
        <span>⚠</span>
        <span>
          Pictures are sent to <b>{PROVIDER_NAME[provider]}</b> to be judged and are not stored by this dashboard.
          The AI-generated and altered scores are a model&apos;s reading of what is visible, not forensic proof — treat a flag as a reason to look, not as a finding.
          The misleading check judges against a written description of FIF: its official channels are taken from fifgroup.co.id, its practices are not yet confirmed by FIF.
        </span>
      </div>

      <div className="grid g-4 mb">
        <Metric k="Images analysed" v={rows.length} n={rows.length ? `${kept.length} in the results · ${anyFlag} flagged · ${toCheck} to verify` : 'in this session'} />
        <Metric k="AI-generated or altered" v={fakes.length} n={`${flagged('ai_generated', rows)} generated · ${flagged('tampered', rows)} altered · left out of the results`} bad={fakes.length > 0} />
        <Metric k="Misleading or indecent" v={flagged('misleading') + flagged('indecent')} n={`${flagged('misleading')} misleading · ${flagged('indecent')} indecent`} bad={flagged('misleading') + flagged('indecent') > 0} />
        <Metric k="Spam" v={flagged('spam')} n="mass-posted or templated" bad={flagged('spam') > 0} />
      </div>

      <div className="grid g-85 mb">
        <div className="panel">
          <PanelHead title="Analyse an image" />
          <div className="p-note">
            One picture at a time: a screenshot of a post, a flyer, an advertisement carrying the FIF name.
            It is checked five ways, and each check answers on its own. The picture stays after a run, so it can be sent to the other model to compare.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="sub" style={{ margin: 0 }}>Model</span>
            <Chips options={PROVIDERS} value={provider} onPick={setProvider} />
          </div>

          <label
            className={`drop${over ? ' over' : ''}${preview ? ' has' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) pick(e.dataTransfer.files[0]); }}
          >
            <input ref={input} type="file" accept={ACCEPT.join(',')} disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
            {preview
              /* eslint-disable-next-line @next/next/no-img-element -- a local object URL, no known dimensions */
              ? <img src={preview} alt="The picture chosen for analysis" />
              : <span><b>Choose a picture</b> or drop it here<br /><small>JPG, PNG or WebP, up to {kb(MAX_BYTES)}</small></span>}
          </label>
          {file && <div className="sub" style={{ margin: '8px 0 0' }}>{file.name} · {kb(file.size)}</div>}
          {error && <div className="sub warn-text" role="alert" style={{ margin: '8px 0 0' }}>{error}</div>}
          {busy && <div className="sub" role="status" style={{ margin: '8px 0 0' }}>Sending the picture to {PROVIDER_NAME[provider]} and reading its answer. This usually takes a few seconds.</div>}

          <div className="cc" style={{ marginTop: 14 }}>
            <button className="btn" onClick={analyse} disabled={!file || busy}
              style={!file || busy ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
              {busy ? 'Analysing…' : 'Analyse'}
            </button>
            {file && !busy && <button className="btn2" onClick={clear}>Remove</button>}
          </div>
        </div>

        <div className="panel">
          <PanelHead title="Result" tag={shown ? `${when(shown.analysedAt)} WIB · ${shown.model}${shown.seconds != null ? ` · ${shown.seconds}s` : ''}` : undefined} />
          {shown ? <ResultCard r={shown} /> : <div className="empty">Nothing analysed yet. Choose a picture on the left.</div>}
        </div>
      </div>

      <FakeCard rows={fakes} total={rows.length} shownId={shown?.id} onOpen={setOpenId} />

      <div className="panel">
        <PanelHead title="Analysis history" tag={rows.length ? `${kept.length} in the results${fakes.length ? ` · ${fakes.length} left out` : ''}` : undefined} />
        <div className="p-note">Held in this browser tab only, and gone on reload. Click a row to read its result above. Pictures judged AI-generated or altered are listed in the card above, not here.</div>
        {kept.length ? (
          <div className="t-scroll">
            <table>
              <thead>
                <tr><th>Image</th>{CHECKS.map((c) => <th key={c.id}>{c.label}</th>)}<th>Analysed (WIB)</th></tr>
              </thead>
              <tbody>
                {kept.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setOpenId(r.id)} style={r.id === shown?.id ? { background: 'var(--wash)' } : undefined}>
                    <td style={{ maxWidth: 240 }}><b style={{ wordBreak: 'break-all' }}>{r.name}</b><div className="sub">{kb(r.size)}</div></td>
                    {CHECKS.map((c) => {
                      const s = r[c.id].score;
                      return (
                        <td key={c.id}>
                          <b style={{ color: tone(s) }}>{s >= FLAG_AT ? c.yes : c.no}</b>
                          <div className="sub">score {s}</div>
                        </td>
                      );
                    })}
                    <td className="mono">{when(r.analysedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">{rows.length ? 'Every picture analysed so far was left out as AI-generated or altered.' : 'No image analysed in this session.'}</div>}
      </div>
    </>
  );
}

function ResultCard({ r }: { r: Result }) {
  const hits = CHECKS.filter((c) => r[c.id].score >= FLAG_AT).length;
  const open = openPoints(r);
  /* Green only when nothing is flagged and nothing is left to verify; a number that cannot be checked is not a clean result. */
  const state = hits ? 'flag' : open.length ? 'check' : 'clear';
  return (
    <>
      <div className="cand" style={{ marginBottom: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, no known dimensions */}
        <img src={r.preview} alt="" className="cand-shot" />
        <div className="cand-body">
          <div><b style={{ wordBreak: 'break-all' }}>{r.name}</b> <span className="sub" style={{ display: 'inline' }}>· {kb(r.size)}</span></div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '5px 0', lineHeight: 1.55 }}>{r.summary}</div>
          <div className="st" style={{ display: 'inline-block', ...STATE_STYLE[state] }}>
            {state === 'flag' ? `${hits} of ${CHECKS.length} checks flagged` : state === 'check' ? 'No check flagged — needs verifying' : 'No check flagged'}
          </div>
          {isFake(r) && <div className="sub warn-text" style={{ margin: '6px 0 0' }}>Judged AI-generated or altered, so left out of the results.</div>}
          {open.length > 0 && (
            <ul className="img-check-areas" style={{ marginTop: 6 }}>{open.map((o) => <li key={o}>{o}</li>)}</ul>
          )}
        </div>
      </div>
      {r.blocked && (
        <div className="blocked" style={{ marginBottom: 12 }}>
          <b>{r.provider === 'mistral' ? 'Mistral' : 'Gemini'} refused this image ({r.blocked}).</b> Only the indecency check has an answer; the other four were not assessed.
        </div>
      )}
      {CHECKS.map((c) => {
        const v = r[c.id];
        return (
          <div key={c.id} className="img-check">
            <div className="img-check-head">
              <span><b>{c.label}</b><div className="sub">{c.asks}</div></span>
              <span className="img-check-v" style={{ color: tone(v.score) }}>{v.score >= FLAG_AT ? c.yes : c.no}<small>{v.score}</small></span>
            </div>
            <div className="meter"><i style={{ width: `${v.score}%`, background: tone(v.score) }} /></div>
            {v.reason && <div className="img-check-why">{v.reason}</div>}
            {!!v.suspect_areas?.length && (
              <ul className="img-check-areas">{v.suspect_areas.map((a, i) => <li key={i}>{a}</li>)}</ul>
            )}
            {!!v.signals?.length && (
              <>
                <div className="img-check-sub">
                  {c.id === 'spam' ? `Why it is spam${v.category && SPAM_KIND[v.category] ? ` — ${SPAM_KIND[v.category]}` : ''}` : 'Conflicts with how FIF operates'}
                </div>
                <ul className="img-check-areas">{v.signals.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </>
            )}
            {!!v.needs_checking?.length && (
              <>
                <div className="img-check-sub">Cannot be settled from the image</div>
                <ul className="img-check-areas">{v.needs_checking.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </>
            )}
            {!!v.items_checked?.length && (
              <details className="img-text" open={v.items_checked.some((it) => it.status === 'conflict')}>
                <summary>
                  Everything checked — {v.items_checked.length} items, {v.items_checked.filter((it) => it.status === 'conflict').length} in conflict
                </summary>
                <table className="img-items">
                  <tbody>
                    {v.items_checked.map((it, i) => (
                      <tr key={i}>
                        <td><span className={STATUS[it.status].cls}>{STATUS[it.status].label}</span></td>
                        <td className="sub" style={{ whiteSpace: 'nowrap' }}>{KIND[it.kind]}</td>
                        <td><b style={{ wordBreak: 'break-word' }}>{it.value}</b>{it.note && <div className="sub">{it.note}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        );
      })}
      {r.extracted_text && (
        <details className="img-text">
          <summary>Text read from the image</summary>
          <div>{r.extracted_text}</div>
        </details>
      )}
      <div className="sub" style={{ marginTop: 12 }}>Scores run 0–100. A check is flagged from {FLAG_AT} up; the threshold is a placeholder until it is calibrated on real pictures.</div>
    </>
  );
}

const STATE_STYLE = {
  flag: { background: '#FBEAE8', color: '#9C2019', borderColor: '#F3D5D2' },
  check: { background: '#FCF1E1', color: '#8E5310', borderColor: '#F0DDBF' },
  clear: { background: '#E1F4F2', color: '#136E68', borderColor: '#BEE9E6' },
};

/** How a generated or altered picture is caught, and the pictures this session left out of the results for it. */
function FakeCard({ rows, total, shownId, onOpen }: { rows: Result[]; total: number; shownId?: string; onOpen: (id: string) => void }) {
  return (
    <div className="panel mb">
      <PanelHead title="AI-generated and digitally altered" tag={total ? `${rows.length} of ${total} left out` : undefined} />
      <div className="p-note">
        Two of the five checks ask whether the picture itself can be trusted. <b>AI-generated</b> looks for a generator&apos;s marks: skin, hands and
        text that do not hold together, lighting with no single source, backgrounds that melt. <b>Digitally altered</b> looks for what was changed
        after the fact: a phone number, account or amount pasted over the original, mismatched fonts, edges and compression around a replaced area.
        Each answers with a score; from {FLAG_AT} the picture is flagged.
      </div>
      <div className="p-note">
        <b>A picture flagged on either is taken out of the results.</b> It is not counted in the misleading, indecent and spam totals, and it is
        listed here instead of in the history below: a made or edited picture says nothing reliable about what customers saw. Its full result
        can still be opened. The flag is a model&apos;s reading, not forensic proof, so check the picture before acting on it.
      </div>
      {rows.length ? (
        <div className="t-scroll">
          <table>
            <thead><tr><th>Image</th><th className="n">AI-generated</th><th className="n">Digitally altered</th><th>Why</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const why = FAKE.map((id) => r[id]).filter((v) => v.score >= FLAG_AT).map((v) => v.reason).filter(Boolean).join(' ');
                return (
                  <tr key={r.id} className="clickable" onClick={() => onOpen(r.id)} style={r.id === shownId ? { background: 'var(--wash)' } : undefined}>
                    <td style={{ maxWidth: 220 }}><b style={{ wordBreak: 'break-all' }}>{r.name}</b><div className="sub">{when(r.analysedAt)} WIB</div></td>
                    {FAKE.map((id) => (
                      <td key={id} className="n"><b style={{ color: tone(r[id].score) }}>{r[id].score}</b></td>
                    ))}
                    <td style={{ minWidth: 240 }}><span className="sub" style={{ margin: 0 }}>{why || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{total ? 'No picture in this session was judged AI-generated or altered.' : 'Nothing analysed yet.'}</div>
      )}
    </div>
  );
}

function Metric({ k, v, n, bad }: { k: string; v: string | number; n: string; bad?: boolean }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v" style={bad ? { color: T.sig } : undefined}>{v}</div>
      <div className="n">{n}</div>
    </div>
  );
}

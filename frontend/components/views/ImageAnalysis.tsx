'use client';

import { useEffect, useRef, useState } from 'react';
import { PanelHead } from '@/components/ui';
import { T } from '@/lib/theme';

/* Image analysis: upload a picture, get five verdicts back from Gemini.
 *
 * The request goes to /vision (app/vision/route.ts), which holds the API key and forwards the
 * picture to Google. Nothing is stored on either side, so the history below lives in this tab
 * and is gone on reload. */

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
type Analysis = Record<CheckId, Verdict> & { model: string; blocked: string | null; extracted_text: string; summary: string };

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
const tone = (score: number) => (score >= FLAG_AT ? T.sig : score >= 35 ? 'var(--warn)' : 'var(--grow)');

async function analyseImage(file: File): Promise<Analysis> {
  const form = new FormData();
  form.set('file', file);
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
      const a = await analyseImage(file);
      const result: Result = { ...a, id: `${Date.now()}-${file.name}`, name: file.name, size: file.size, preview, analysedAt: new Date().toISOString() };
      setRows((r) => [result, ...r]);
      setOpenId(result.id);
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = rows.find((r) => r.id === openId) ?? rows[0];
  const flagged = (id: CheckId) => rows.filter((r) => r[id].score >= FLAG_AT).length;
  const anyFlag = rows.filter((r) => CHECKS.some((c) => r[c.id].score >= FLAG_AT)).length;

  return (
    <>
      <div className="sim mb">
        <span>⚠</span>
        <span>
          Pictures are sent to <b>Google Gemini</b> to be judged and are not stored by this dashboard.
          The AI-generated and altered scores are a model&apos;s reading of what is visible, not forensic proof — treat a flag as a reason to look, not as a finding.
          The misleading check judges against a written description of FIF: its official channels are taken from fifgroup.co.id, its practices are not yet confirmed by FIF.
        </span>
      </div>

      <div className="grid g-4 mb">
        <Metric k="Images analysed" v={rows.length} n={rows.length ? `${anyFlag} flagged on at least one check` : 'in this session'} />
        <Metric k="AI-generated or altered" v={flagged('ai_generated') + flagged('tampered')} n={`${flagged('ai_generated')} generated · ${flagged('tampered')} altered`} bad={flagged('ai_generated') + flagged('tampered') > 0} />
        <Metric k="Misleading or indecent" v={flagged('misleading') + flagged('indecent')} n={`${flagged('misleading')} misleading · ${flagged('indecent')} indecent`} bad={flagged('misleading') + flagged('indecent') > 0} />
        <Metric k="Spam" v={flagged('spam')} n="mass-posted or templated" bad={flagged('spam') > 0} />
      </div>

      <div className="grid g-85 mb">
        <div className="panel">
          <PanelHead title="Analyse an image" />
          <div className="p-note">
            One picture at a time: a screenshot of a post, a flyer, an advertisement carrying the FIF name.
            It is checked five ways, and each check answers on its own.
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
          {busy && <div className="sub" role="status" style={{ margin: '8px 0 0' }}>Sending the picture to Gemini and reading its answer. This usually takes a few seconds.</div>}

          <div className="cc" style={{ marginTop: 14 }}>
            <button className="btn" onClick={analyse} disabled={!file || busy}
              style={!file || busy ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
              {busy ? 'Analysing…' : 'Analyse'}
            </button>
            {file && !busy && <button className="btn2" onClick={clear}>Remove</button>}
          </div>
        </div>

        <div className="panel">
          <PanelHead title="Result" tag={shown ? `${when(shown.analysedAt)} WIB · ${shown.model}` : undefined} />
          {shown ? <ResultCard r={shown} /> : <div className="empty">Nothing analysed yet. Choose a picture on the left.</div>}
        </div>
      </div>

      <div className="panel">
        <PanelHead title="Analysis history" tag={rows.length ? `${rows.length} analysed` : undefined} />
        <div className="p-note">Held in this browser tab only, and gone on reload. Click a row to read its result above.</div>
        {rows.length ? (
          <div className="t-scroll">
            <table>
              <thead>
                <tr><th>Image</th>{CHECKS.map((c) => <th key={c.id}>{c.label}</th>)}<th>Analysed (WIB)</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
        ) : <div className="empty">No image analysed in this session.</div>}
      </div>
    </>
  );
}

function ResultCard({ r }: { r: Result }) {
  const hits = CHECKS.filter((c) => r[c.id].score >= FLAG_AT).length;
  return (
    <>
      <div className="cand" style={{ marginBottom: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, no known dimensions */}
        <img src={r.preview} alt="" className="cand-shot" />
        <div className="cand-body">
          <div><b style={{ wordBreak: 'break-all' }}>{r.name}</b> <span className="sub" style={{ display: 'inline' }}>· {kb(r.size)}</span></div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '5px 0', lineHeight: 1.55 }}>{r.summary}</div>
          <div className="st" style={{ display: 'inline-block', ...(hits ? { background: '#FBEAE8', color: '#9C2019', borderColor: '#F3D5D2' } : { background: '#E1F4F2', color: '#136E68', borderColor: '#BEE9E6' }) }}>
            {hits ? `${hits} of ${CHECKS.length} checks flagged` : 'No check flagged'}
          </div>
        </div>
      </div>
      {r.blocked && (
        <div className="blocked" style={{ marginBottom: 12 }}>
          <b>Gemini refused this image ({r.blocked}).</b> Only the indecency check has an answer; the other four were not assessed.
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

function Metric({ k, v, n, bad }: { k: string; v: string | number; n: string; bad?: boolean }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v" style={bad ? { color: T.sig } : undefined}>{v}</div>
      <div className="n">{n}</div>
    </div>
  );
}

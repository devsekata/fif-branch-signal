'use client';

import { useState } from 'react';
import { PanelHead } from '@/components/ui';
import { ApiCallError, postJson } from '@/lib/api';
import { buildGoogleJob, buildInstagramJob, dateProblem, googleTarget, instagramTarget } from '@/lib/jobs';
import { wib } from '@/lib/theme';
import type { CreateJobRequest, JobQueueItem, JobStatus } from '@/lib/types';

type Tab = 'google' | 'instagram';

const TABS: [Tab, string][] = [['google', 'Google Review'], ['instagram', 'Instagram Comment']];

const STATUS_COLOR: Record<JobStatus, string> = {
  pending: 'var(--hold)', processing: 'var(--deep)', finished: 'var(--grow)', failed: 'var(--sig)',
};

/** A job this session queued, plus what was sent, since nothing can be read back afterwards. */
interface Submitted { at: number; sent: CreateJobRequest; got: JobQueueItem }

export function IngestView() {
  const [tab, setTab] = useState<Tab>('google');
  const [url, setUrl] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: unknown } | null>(null);
  const [jobs, setJobs] = useState<Submitted[]>([]);

  const isGoogle = tab === 'google';
  const info = isGoogle ? googleTarget(url) : instagramTarget(url);
  const dateErr = isGoogle ? dateProblem(start, end) : null;
  const canSend = info.ok && !dateErr && !busy;

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
  }

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    const sent = isGoogle ? buildGoogleJob(info.target, start, end) : buildInstagramJob(info.target);
    try {
      const got = await postJson<JobQueueItem>('/v1/jobs', sent);
      setJobs((q) => [{ at: Date.now(), sent, got }, ...q]);
      setUrl('');
    } catch (e) {
      if (e instanceof ApiCallError) setError({ message: `${e.status} — ${e.message}`, detail: (e.body as { error?: { detail?: unknown } })?.error?.detail });
      else setError({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <div className="grid g-58 mb">
        <div className="panel">
          <div className="tabs">
            {TABS.map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : undefined} onClick={() => switchTab(k)}>{label}</button>
            ))}
          </div>

          <div className="p-note">
            {isGoogle
              ? 'Open the branch in Google Maps, then copy the address bar. The place id is read out of the URL and sent as a maps.google.com/?cid= link, which is the form the API documents.'
              : 'Paste the profile URL of the official account, for example https://www.instagram.com/fifclub. A single post URL works too and limits the crawl to that post.'}
          </div>

          <Field label="URL" value={url} onChange={setUrl} placeholder={isGoogle ? 'https://www.google.com/maps/place/…' : 'https://www.instagram.com/fifclub'} />
          <div className={info.ok ? 'sub' : 'sub warn-text'} style={{ margin: '-6px 0 14px' }}>{info.note}</div>

          {isGoogle ? (
            <div className="grid g-2">
              <Field label="Start date" value={start} onChange={setStart} placeholder="YYYY-MM-DD" />
              <Field label="End date" value={end} onChange={setEnd} placeholder="YYYY-MM-DD" />
            </div>
          ) : (
            <div className="p-note" style={{ color: '#8E5310' }}>
              The Instagram worker takes no date range. It is driven by a per-source limit and a reply depth instead, so the date fields are hidden here rather than sent and ignored.
            </div>
          )}
          {dateErr && <div className="sub warn-text" style={{ marginTop: -6, marginBottom: 12 }}>{dateErr}</div>}

          <button className="btn" onClick={submit} disabled={!canSend} style={!canSend ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
            {busy ? 'Sending…' : 'Start the crawl'}
          </button>

          {error && (
            <div className="callout" style={{ borderColor: '#EFD7D4', marginTop: 16 }}>
              <h4>The API rejected this job</h4>
              <p>{error.message}</p>
              {error.detail != null && <pre className="mono" style={{ marginTop: 8, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(error.detail, null, 2)}</pre>}
            </div>
          )}
        </div>

        <div className="panel">
          <PanelHead title="What gets sent" tag="POST /v1/jobs" />
          <div className="p-note">Exactly this body, so it can be compared against the spec or replayed with curl.</div>
          <pre className="mono" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(isGoogle ? buildGoogleJob(info.target, start, end) : buildInstagramJob(info.target), null, 2)}
          </pre>
        </div>
      </div>

      <div className="panel">
        <PanelHead title="Queued this session" tag={jobs.length ? `${jobs.length} sent` : undefined} />
        <div className="p-note" style={{ color: '#8E5310' }}>
          The API has no endpoint for reading a job back — <span className="mono">POST /v1/jobs</span> is the only route under Jobs. The status below is the one returned at the moment the job was accepted and it never updates. To see whether a crawl actually landed, watch the row counts on Method &amp; limits.
        </div>
        {jobs.length ? (
          <div className="t-scroll">
            <table>
              <thead>
                <tr><th>Queued</th><th>Job</th><th>Target</th><th>Status</th><th className="n">Attempts</th><th>Job id</th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.got.id}>
                    <td className="mono">{wib(new Date(j.at).toISOString())}</td>
                    <td>{j.got.jobType}</td>
                    <td style={{ wordBreak: 'break-all', maxWidth: 320 }}>{String(j.sent.payload.target ?? (j.sent.payload.urls as string[])?.[0] ?? '—')}</td>
                    <td><b style={{ color: STATUS_COLOR[j.got.status] ?? 'var(--ink)' }}>{j.got.status}</b></td>
                    <td className="n">{j.got.attempts} / {j.got.maxAttempts}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{j.got.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">Nothing queued yet in this session.</div>}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="ctl-text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} />
    </label>
  );
}

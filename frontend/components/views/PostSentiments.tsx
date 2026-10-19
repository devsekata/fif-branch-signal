'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SekataState } from '@/components/SekataGate';
import { PanelHead } from '@/components/ui';
import { proxiedImage } from '@/lib/sekata';
import { T } from '@/lib/theme';
import {
  CANDIDATE_LIMIT, INTENSITY_LABEL, analyseCandidate, analysePost, dismissCandidate, mentionLabel,
  readPostUrl, searchNow, useAnalyses, useBrandStats, useBrands, useCandidates, wib,
  type Analysis, type Brand, type Candidate, type CandidateState, type Intensity,
} from '@/lib/sentiments';

const SEV: Record<Intensity, string> = {
  high: T.sig, medium: 'var(--warn)', low: 'var(--hold)', none: 'var(--ink-3)',
};
const TONE = { ok: 'var(--grow)', info: 'var(--deep)', warn: 'var(--warn)' } as const;

const TABS: [CandidateState | 'all', string][] = [
  ['pending', 'Pending'], ['promoted', 'Analysed'], ['dismissed', 'Dismissed'],
  ['expired', 'Expired'], ['all', 'All'],
];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PostSentiments() {
  const res = useBrands();
  return (
    <SekataState res={res}>
      {(brands) => <Monitor brands={brands.filter((b) => b.active)} />}
    </SekataState>
  );
}

function Monitor({ brands: active }: { brands: Brand[] }) {
  const [brandId, setBrandId] = useState<number | null>(null);
  const brand = active.find((b) => b.id === brandId) ?? active[0];

  if (!brand) {
    return (
      <div className="panel">
        <PanelHead title="Mentions elsewhere" />
        <div className="empty">
          No brand is monitored yet. Set one up in <Link className="link" href="/settings">Settings</Link> first —
          the analyser needs the aliases and the watch list before it can judge a post.
        </div>
      </div>
    );
  }
  return <BrandMonitor key={brand.id} brand={brand} brands={active} onBrand={setBrandId} />;
}

function BrandMonitor({ brand, brands, onBrand }: { brand: Brand; brands: Brand[]; onBrand: (id: number | null) => void }) {
  const id = brand.id!;
  const stats = useBrandStats().data;
  const candidates = useCandidates(id);
  const analyses = useAnalyses(id);

  const [url, setUrl] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [tab, setTab] = useState<CandidateState | 'all'>('pending');

  const target = readPostUrl(url);
  const mine = candidates.data ?? [];
  const shown = tab === 'all' ? mine : mine.filter((c) => c.state === tab);
  const s = stats?.of(id);
  const complaints = s?.recentComplaints ?? 0;

  async function analyse(e: React.FormEvent) {
    e.preventDefault();
    if (!target.ok || analysing) return;
    setAnalysing(true);
    setNote({ text: 'Scraping the post, then judging it. A video can take a few minutes.' });
    try {
      const a = await analysePost(id, url);
      setNote({ text: a.flagFound ? `Complaint found: ${a.category || 'uncategorised'}.` : 'No complaint in this post.' });
      setUrl('');
    } catch (err) {
      setNote({ text: message(err), bad: true });
    } finally {
      setAnalysing(false);
    }
  }

  async function search() {
    setSearching(true);
    setSearchNote({ text: `Searching Instagram for “${brand.searchKeyword}”…` });
    try {
      setSearchNote({ text: await searchNow(id) });
    } catch (err) {
      setSearchNote({ text: message(err), bad: true });
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <div className="grid g-4 mb">
        <Metric k="Monitored as" v={brand.name} n={brand.aliases.length ? `${brand.aliases.length} aliases watched` : 'no aliases set'} />
        <Metric k="Waiting to be judged" v={s?.pending ?? '—'} n="found by search, not yet analysed" />
        <Metric k="Complaints found" v={s ? complaints : '—'} n={`in the last ${stats?.days ?? 7} days`} bad={complaints > 0} />
        <Metric k="Last search" v={brand.lastSearchAt ? wib(brand.lastSearchAt) : 'never'} n={brand.autoSearch ? `runs daily at ${brand.searchTime} WIB` : 'manual only'} />
      </div>

      <div className="grid g-58 mb">
        <div className="panel">
          <PanelHead title="Analyse a post or reel" />
          <div className="p-note">
            One post at a time, judged against what <b>{brand.name}</b> watches for. A profile link will not
            work — it would pull the whole feed.
          </div>

          <form onSubmit={analyse} noValidate>
            {brands.length > 1 && (
              <label className="field">
                <span>Brand</span>
                <select className="ctl-text" value={id} onChange={(e) => onBrand(Number(e.target.value))}>
                  {brands.map((b) => <option key={b.id} value={b.id!}>{b.name}</option>)}
                </select>
              </label>
            )}

            <label className="field">
              <span>Instagram post, reel or tv URL</span>
              <input className="ctl-text" value={url} placeholder="https://www.instagram.com/p/…" disabled={analysing}
                onChange={(e) => { setUrl(e.target.value); setNote(null); }} aria-invalid={!!url && !target.ok} />
            </label>
            <div className={target.ok || !url ? 'sub' : 'sub warn-text'} style={{ margin: '-8px 0 14px' }}>{target.note}</div>

            <button className="btn" type="submit" disabled={!target.ok || analysing}
              style={!target.ok || analysing ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
              {analysing ? 'Analysing…' : 'Analyse'}
            </button>
          </form>

          {note && <div className={note.bad ? 'sub warn-text' : 'sub'} role="status" style={{ marginTop: 12 }}>{note.text}</div>}
        </div>

        <div className="panel">
          <PanelHead title="Discovered posts" tag={brand.searchKeyword
            ? <button className="btn2" onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Search now'}</button>
            : undefined} />
          <div className="p-note">
            {brand.searchKeyword
              ? <>Found by searching Instagram for <b>“{brand.searchKeyword}”</b>. A post sits here until someone
                  analyses or dismisses it, and expires on its own after two weeks.</>
              : <>No keyword set. Add one in <Link className="link" href="/settings">Settings</Link> to have posts found for you.</>}
          </div>
          {searchNote && <div className={searchNote.bad ? 'sub warn-text' : 'sub'} role="status" style={{ marginBottom: 10 }}>{searchNote.text}</div>}

          <div className="chips">
            {TABS.map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : undefined} onClick={() => setTab(k)}>
                {label} <span style={{ opacity: 0.6 }}>{k === 'all' ? mine.length : mine.filter((c) => c.state === k).length}</span>
              </button>
            ))}
          </div>

          <SekataState res={candidates}>
            {() => shown.length
              ? <>
                  <div className="cand-grid">{shown.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
                  {mine.length >= CANDIDATE_LIMIT && <div className="sub" style={{ marginTop: 10 }}>Showing the newest {CANDIDATE_LIMIT}; the connector pages at that size.</div>}
                </>
              : <div className="empty">
                  {tab === 'pending'
                    ? brand.searchKeyword ? 'Nothing waiting. Run a search, or paste a link on the left.' : 'Nothing found automatically. Paste a link on the left.'
                    : `No ${tab} posts.`}
                </div>}
          </SekataState>
        </div>
      </div>

      <div className="panel">
        <PanelHead title="Analysis history" tag={analyses.data?.length ? `${analyses.data.length} analysed` : undefined} />
        <div className="p-note">
          Kept in the connector&apos;s database and read back here. Nothing is written to a spreadsheet.
        </div>
        <SekataState res={analyses}>
          {(rows) => rows.length ? <HistoryTable rows={rows} /> : <div className="empty">Nothing analysed yet for {brand.name}.</div>}
        </SekataState>
      </div>
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

function CandidateCard({ c }: { c: Candidate }) {
  const [busy, setBusy] = useState<'analyse' | 'dismiss' | null>(null);
  const [error, setError] = useState('');
  const shot = proxiedImage(c.thumbnailUrl);

  async function run(kind: 'analyse' | 'dismiss') {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'analyse') await analyseCandidate(c);
      else await dismissCandidate(c.id);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cand">
      {shot
        /* eslint-disable-next-line @next/next/no-img-element -- Instagram CDN via the connector, no known dimensions */
        ? <img src={shot} alt="" className="cand-shot" />
        : <div className="cand-shot cand-shot-none">{c.mediaType ?? 'post'}</div>}
      <div className="cand-body">
        <div><b>@{c.username || 'unknown'}</b> <span className="sub" style={{ display: 'inline' }}>· {(c.mediaType ?? 'post').toLowerCase()} · {wib(c.postedAt)}</span></div>
        <div className="cand-cap">{c.caption || <span style={{ color: 'var(--ink-3)' }}>no caption</span>}</div>
        <div className="sub">♥ {c.likeCount} · 💬 {c.commentCount} · found by {c.discoveredVia} search</div>
        {c.state === 'pending' || busy ? (
          <div className="cc" style={{ marginTop: 8 }}>
            <button className="btn2 solid" disabled={!!busy} onClick={() => run('analyse')}>{busy === 'analyse' ? 'Analysing…' : 'Analyse'}</button>
            <button className="btn2" disabled={!!busy} onClick={() => run('dismiss')}>{busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}</button>
            <a className="btn2" href={c.url} target="_blank" rel="noopener">Open</a>
          </div>
        ) : <div className="st" style={{ marginTop: 8, display: 'inline-block' }}>{c.state}</div>}
        {error && <div className="sub warn-text" style={{ marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}

function HistoryTable({ rows }: { rows: Analysis[] }) {
  return (
    <div className="t-scroll">
      <table>
        <thead>
          <tr>
            <th>Post</th><th>Type</th><th>Complaint</th><th>Severity</th>
            <th>Category</th><th>Brand named</th><th>Analysed (WIB)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const m = mentionLabel(a.captionMentions, a.contentMentions);
            const done = a.status === 'completed';
            return (
              <tr key={a.id}>
                <td style={{ maxWidth: 280 }}>
                  <a className="link" href={a.url} target="_blank" rel="noopener">{a.url.replace(/^https?:\/\/(www\.)?/, '')}</a>
                  {a.summary && <div className="sub">{a.summary}</div>}
                  {a.status === 'failed' && <div className="sub warn-text">{a.errorMessage || 'Analysis failed.'}</div>}
                </td>
                <td>{a.mediaType ?? '—'}</td>
                <td>
                  {!done ? <span className="st">{a.status}</span>
                    : a.flagFound ? <b style={{ color: T.sig }}>Complaint</b> : 'No issue'}
                </td>
                <td>{done && a.intensity ? <b style={{ color: SEV[a.intensity] }}>{INTENSITY_LABEL[a.intensity]}</b> : '—'}</td>
                <td>{a.category || '—'}</td>
                <td style={done ? { color: TONE[m.tone], fontWeight: 600 } : undefined}>{done ? m.text : '—'}</td>
                <td className="mono">{wib(a.analysedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

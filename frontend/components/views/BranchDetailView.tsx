'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useCaseDrawer } from '@/components/CaseHost';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { ApiPage, Chip, Metric, MixBar, NoText, PanelHead, Rating, Tags } from '@/components/ui';
import { useApi } from '@/lib/api';
import { toPoints, type BranchPoint } from '@/lib/geo';
import { useReference, type BranchPlace } from '@/lib/reference';
import { useView, type View } from '@/lib/scope';
import { MIN_N, scoreColor, share } from '@/lib/signal';
import { NEUTRAL, T, monthLabel, sevColor } from '@/lib/theme';
import type { BranchRow, BranchesResponse, CasesResponse, ComplaintsResponse, SignalBranchesResponse, SignalMonth, SignalOverviewResponse } from '@/lib/types';

export function BranchDetailView({ branchId }: { branchId: string }) {
  const view = useView('branch', branchId);
  const { places, place } = useReference();
  const published = useApi<BranchesResponse>('/v1/pages/branches').data;
  const b = place(branchId);

  /* Standing is against every branch in the index, so the branch rows are read unscoped. */
  const res = useApi<SignalBranchesResponse>('/v1/signal/branches');
  const months = useApi<SignalOverviewResponse>('/v1/signal/overview', { scope_level: 'branch', scope_value: branchId, source: 'google' }).data?.monthly;
  const points = useMemo(() => toPoints(res.data), [res.data]);
  const point = points.find((p) => p.place.id === branchId);

  return (
    <ApiPage res={res}>
      {() => (!b || !point ? (
        <div className="panel api-state">
          <h3>{places.length ? 'This branch is not in the index' : 'Loading the branch index…'}</h3>
          {places.length > 0 && <p className="p-note">No branch carries the id {branchId}. It may have been removed, or the link is incomplete.</p>}
          <Back />
        </div>
      ) : <Detail view={view} b={b} point={point} points={points} months={months} published={published?.rows.find((r) => r.branch_id === branchId)} />)}
    </ApiPage>
  );
}

function Back() {
  const router = useRouter();
  return <button className="btn2" onClick={() => router.push('/branches')}>← Back to Area &amp; Branch</button>;
}

function Detail({ view, b, point, points, months, published }: {
  view: View; b: BranchPlace; point: BranchPoint; points: BranchPoint[]; months: SignalMonth[] | undefined; published: BranchRow | undefined;
}) {
  const { mix, enough } = point;
  const avg = point.row.avg_rating?.toFixed(2) ?? null;
  return (
    <>
      <div className="backbar">
        <Back />
        <span className="urlhint">/branches/{b.id}</span>
      </div>
      <div className="grid g-4 mb">
        <Metric k="Sentiment score" v={enough ? mix.score : '—'} n={enough ? 'on the full window' : `under the ${MIN_N}-review minimum`} color={scoreColor(mix.score, enough)} />
        <Metric k="Reviews read" v={mix.total.toLocaleString('en-US')} n="from the Google scrape" />
        <Metric k="Negative share" v={share(mix.bad, mix.total) + '%'} n={`${mix.bad} of ${mix.total} reviews`} color={mix.bad / Math.max(1, mix.total) > 0.2 ? T.sig : undefined} />
        <Metric k="Average rating" v={avg ? avg + '★' : '—'} n={avg ? 'of the reviews read' : 'not available for this branch'} />
      </div>

      <div className="grid g-58 mb">
        <div className="panel">
          <PanelHead title="Branch profile" tag="Google Business Profile" />
          <Info b={b} read={mix.total} published={published} />
        </div>
        <div className="panel">
          <PanelHead title="Standing" tag={`${points.filter((p) => p.enough).length} scored branches`} />
          <div className="p-note">Where this branch sits against every scored branch in the index.</div>
          <Standing point={point} points={points} />
        </div>
      </div>

      <div className="grid g-58 mb">
        <div className="panel">
          <PanelHead title="Sentiment over time" tag={months ? `${months.length} months read` : undefined} />
          <div className="p-note">Monthly, from the reviews actually read for this branch.</div>
          <TrendChart months={months} />
        </div>
        <div className="panel">
          <PanelHead title="Sentiment mix" />
          <div className="p-note">A wordless high rating counts as neutral, not positive. It is a tap, not an opinion.</div>
          <MixBar mix={mix} height={14} />
          <div className="seg-key" style={{ marginTop: 12, flexDirection: 'column', gap: 7 }}>
            <span><i className="dot" style={{ background: T.grow }} />positive — {mix.good} ({share(mix.good, mix.total)}%)</span>
            <span><i className="dot" style={{ background: NEUTRAL }} />neutral — {mix.neutral} ({share(mix.neutral, mix.total)}%)</span>
            <span><i className="dot" style={{ background: T.sig }} />negative — {mix.bad} ({share(mix.bad, mix.total)}%)</span>
          </div>
          <div className="formula" style={{ marginTop: 14 }}>score = <b>(positive − negative) ÷ total</b> → {enough ? mix.score : 'withheld'}</div>
          {!enough && (
            <div className="blocked" style={{ marginTop: 11 }}>
              Fewer than {MIN_N} reviews. The mix is shown, the score is withheld — a ratio built on this few reviews swings on a single new one.
            </div>
          )}
        </div>
      </div>

      <div className="grid g-2">
        <div className="panel">
          <PanelHead title="Category spread" />
          <div className="p-note">Topics tagged on this branch, on the shared severity ladder.</div>
          <Categories view={view} />
        </div>
        <Reviews view={view} />
      </div>
    </>
  );
}

function Info({ b, read, published }: { b: BranchPlace; read: number; published: BranchRow | undefined }) {
  const row = (k: string, v: React.ReactNode, missing = false, note?: string) => (
    <div className="info-row">
      <dt>{k}</dt>
      <dd className={missing ? 'missing' : undefined}>{v}{note && <div className="sub">{note}</div>}</dd>
    </div>
  );
  const area = [b.kecamatan, b.kota, b.province].filter(Boolean).join(' · ');
  const score = published?.google_public_score;
  return (
    <dl className="info-list">
      {row('Branch code', b.id, false, 'The Google place id, until FIF supplies its branch master')}
      {row('Address', b.address ?? 'Not captured', !b.address)}
      {row('Area', area || b.city, !area, area ? undefined : 'The address names no kecamatan the master tables hold')}
      {row('Phone', 'Not captured', true, 'The review scrape does not return it — needs the Places Details API')}
      {row('Opening hours', 'Not captured', true, 'Same gap: Places Details API, not the review endpoint')}
      {row('Google rating',
        score != null ? `${score}★ published, from ${published!.reviews_universe.toLocaleString('en-US')} reviews` : 'Not available', score == null,
        published?.reviews_universe ? `We read ${read} of them — ${((100 * read) / published.reviews_universe).toFixed(1)}% coverage` : undefined)}
      {row('Owner replies', published?.owner_reply_rate_pct != null ? `${published.owner_reply_rate_pct}% of reviews answered` : 'Not captured', published?.owner_reply_rate_pct == null)}
      {row('Place link', <a className="link" href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(b.id)}`} target="_blank" rel="noopener">Open on Google Maps</a>)}
    </dl>
  );
}

function Standing({ point, points }: { point: BranchPoint; points: BranchPoint[] }) {
  if (!point.enough || point.rank === null) {
    return <div className="empty-note">Not ranked. This branch has {point.mix.total} reviews, below the {MIN_N} minimum, so placing it against the others would be misleading.</div>;
  }
  const scored = points.filter((p) => p.enough).sort((a, b) => a.rank! - b.rank!);
  const n = scored.length, pos = point.rank;
  const pct = Math.round((100 * (n - pos)) / Math.max(1, n - 1));
  const peers = scored.filter((p) => p.place.kota && p.place.kota === point.place.kota);
  const peerPos = peers.findIndex((p) => p.place.id === point.place.id) + 1;
  return (
    <>
      <div className="rank-big" style={{ color: scoreColor(point.mix.score) }}>#{pos}<small>of {n}</small></div>
      <div className="rank-track"><i style={{ left: `calc(${(100 * (pos - 1)) / Math.max(1, n - 1)}% - 1px)` }} /></div>
      <div className="seg-key" style={{ marginTop: 9 }}><span>best</span><span style={{ marginLeft: 'auto' }}>worst</span></div>
      <div className="stat-rail" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="stat"><div className="k">Percentile</div><div className="v">{pct}</div><div className="n">scores above {pct}% of branches</div></div>
        <div className="stat">
          <div className="k">Within {point.place.kota ?? 'its area'}</div>
          <div className="v">{peerPos ? `#${peerPos}` : '—'}</div>
          <div className="n">{peerPos ? `of ${peers.length} scored` : 'the branch is not placed in an area'}</div>
        </div>
      </div>
    </>
  );
}

function TrendChart({ months: loaded }: { months: SignalMonth[] | undefined }) {
  const months = useMemo(() => loaded ?? [], [loaded]);
  const config = useMemo((): ChartConfig<'bar'> => {
    const bar = { stack: 'a', borderRadius: 3 };
    return {
      type: 'bar',
      data: {
        labels: months.map((m) => monthLabel(m.month)),
        datasets: [
          { ...bar, label: 'Positive', data: months.map((m) => m.good), backgroundColor: T.grow },
          { ...bar, label: 'Neutral', data: months.map((m) => m.neutral), backgroundColor: NEUTRAL },
          { ...bar, label: 'Negative', data: months.map((m) => m.bad), backgroundColor: T.sig },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { font: { size: 10.5 } } } },
        scales: { x: { ...NOGRID, stacked: true }, y: { ...AXIS, stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
      },
    };
  }, [months]);
  if (!loaded) return <div className="empty-note">Loading the monthly series…</div>;
  if (!months.length) return <div className="empty-note">No reviews read for this branch yet.</div>;
  return <ChartBox config={config} />;
}

function Categories({ view }: { view: View }) {
  const topics = useApi<ComplaintsResponse>('/v1/pages/complaints', { source: 'google', branch: view.sel.branch ?? undefined }).data?.topics;
  const rows = useMemo(() => (topics ?? []).filter((t) => t.google > 0)
    .map((t) => ({ label: t.label, sev: t.severity, n: t.google })).sort((a, b) => b.n - a.n), [topics]);
  const config = useMemo((): ChartConfig<'bar'> => ({
    type: 'bar',
    data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.n), backgroundColor: rows.map((r) => sevColor(r.sev)), borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (c) => `severity ${rows[c.dataIndex].sev}` } } },
      scales: { x: { ...AXIS, beginAtZero: true, ticks: { precision: 0 } }, y: NOGRID },
    },
  }), [rows]);
  if (!rows.length) return <div className="empty-note">No tagged category on this branch in the current window. Its reviews are either positive or carry no text.</div>;
  return <ChartBox config={config} />;
}

function Reviews({ view }: { view: View }) {
  const res = useApi<CasesResponse>('/v1/cases', { scope_level: 'branch', scope_value: view.sel.branch ?? undefined, complaints: 'true', limit: 200 });
  const q = useMemo(() => res.data?.items ?? [], [res.data]);
  const { open, drawer } = useCaseDrawer(q);
  return (
    <div className="panel">
      <PanelHead title="Recent reviews" tag={q.length ? `${q.length} scored cases` : undefined} />
      <div className="p-note">Open a case to reply, escalate or close it.</div>
      <div className="t-scroll" style={{ maxHeight: 420 }}>
        {q.length ? (
          <table>
            <tbody>
              {q.map((c) => (
                <tr key={c.case_id} className="clickable" onClick={() => open(c.case_id)}>
                  <td style={{ width: 92 }}><Chip priority={c.priority} /><div className="sub" style={{ marginTop: 4 }}>{c.posted_at.slice(0, 10)}</div></td>
                  <td>
                    <div className="quote">{c.text ? c.text.slice(0, 220) : <NoText />}</div>
                    <div style={{ marginTop: 5 }}><Tags topics={c.topic_ids} /></div>
                  </td>
                  <td className="n" style={{ width: 60 }}>{c.stars ? <Rating stars={c.stars} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty-note">{res.error ? `Cases could not be loaded. ${res.error}` : !res.data ? 'Loading cases…' : 'No scored case on this branch in the current window.'}</div>}
      </div>
      {drawer}
    </div>
  );
}

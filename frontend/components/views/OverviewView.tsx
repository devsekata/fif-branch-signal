'use client';

import { useMemo } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { ApiPage, Chip, EmptyRow, NoText, PanelHead, Rating, SourceBadge, Stat, Tags } from '@/components/ui';
import { useApi, type Params } from '@/lib/api';
import { useReference } from '@/lib/reference';
import { useScope, type Scope } from '@/lib/scope';
import { IG, MONTHS, PRI, T, clip, pct, plural, riskColor } from '@/lib/theme';
import type { CasesResponse, OverviewResponse } from '@/lib/types';

export function OverviewView() {
  const { scope, params } = useScope('overview');
  const res = useApi<OverviewResponse>('/v1/pages/overview', params);
  return (
    <ApiPage res={res}>
      {(d) => (
        <>
          <div className="grid g-58 mb">
            <Hero scope={scope} h={d.headline} />
            <Oldest d={d} />
          </div>

          <div className="grid g-58 mb">
            <div className="panel">
              <PanelHead title="Complaints against rating, by month" />
              <div className="p-note">Watch where the bars rise while the line holds steady. That gap is a collection campaign covering live complaints, not a branch improving.</div>
              <TrendChart rows={d.trend_monthly} useS={scope.useS} />
            </div>
            <div className="panel">
              <PanelHead title="Branch risk ranking" />
              <div className="p-note">Complaint rate, open critical cases, conduct-risk mentions and ageing, combined into one score.</div>
              <RiskChart rows={scope.useG ? d.branch_risk : []} />
            </div>
          </div>

          <div className="grid g-85 mb">
            <Channels mix={d.channel_severity_mix} />
            <div className="panel">
              <PanelHead title="Work the top of this list first" tag="both channels, highest criticality" />
              <div className="p-note">Full queue with topic tags and links lives in Escalations.</div>
              <TopCases params={params} />
            </div>
          </div>
        </>
      )}
    </ApiPage>
  );
}

function Hero({ scope, h }: { scope: Scope; h: OverviewResponse['headline'] }) {
  const { branchName, meta } = useReference();
  const counts = { critical: h.by_priority.critical ?? 0, high: h.by_priority.high ?? 0, medium: h.by_priority.medium ?? 0, low: h.by_priority.low ?? 0 };
  const flagged = Object.values(counts).reduce((a, b) => a + b, 0);
  const { open_cases: total, items_read: items, conduct_level: reg, never_answered: unanswered, oldest_unanswered_days: oldest } = h;
  const nBranches = meta?.branches.length ?? 0;
  const { src, branch } = scope;
  const where = src === 'instagram' ? 'on the official Instagram account'
    : branch !== 'all' ? 'at ' + branchName(branch)
    : src === 'google' ? `across ${nBranches} ${plural(nBranches, 'branch', 'branches')}`
    : `across ${nBranches} ${plural(nBranches, 'branch', 'branches')} and the Instagram account`;
  const present = Object.entries(counts).filter(([, v]) => v);

  return (
    <div className="hero">
      <div className="lede">
        {total ? (
          <>
            <em>{total} open {plural(total, 'case', 'cases')}</em> {where},{' '}
            {reg
              ? `${reg} of which ${plural(reg, 'describes', 'describe')} collection conduct, misappropriation or exposed personal data. `
              : 'none at the conduct level. '}
            {unanswered} {plural(unanswered, 'has', 'have')} never had a public reply.
          </>
        ) : 'No open cases in this view.'}
      </div>
      <div className="seg">
        {present.map(([k, v]) => <i key={k} style={{ flex: v, background: PRI[k] }} title={`${k}: ${v}`} />)}
        <i style={{ flex: Math.max(0.5, items - flagged), background: '#E0EAE9' }} />
      </div>
      <div className="seg-key">
        {present.map(([k, v]) => (
          <span key={k}><i className="dot" style={{ background: PRI[k] }} />{k} {v}</span>
        ))}
        <span><i className="dot" style={{ background: '#E0EAE9' }} />no issue {Math.max(0, items - flagged)}</span>
      </div>
      <div className="stat-rail">
        <Stat k="Complaint rate" v={h.complaint_rate_pct.toFixed(1) + '%'}
          n={`of ${items} ${src === 'instagram' ? 'threads' : 'items'} read`} bad={h.complaint_rate_pct > 12} />
        <Stat k="Conduct-level cases" v={reg} n="collection, misappropriation, personal data" bad={reg > 0} />
        <Stat k="Never answered" v={unanswered} n="no public reply on record" bad={unanswered > 0} />
        <Stat k="Oldest unanswered" v={oldest + ' days'} n="still public, still open" bad={oldest > 180} />
      </div>
    </div>
  );
}

function Oldest({ d }: { d: OverviewResponse }) {
  const q = d.oldest_unanswered.slice(0, 3);
  return (
    <div className="panel">
      <PanelHead title="Still waiting for an answer" tag={`${d.headline.never_answered} unanswered`} />
      <div className="p-note">These three have been sitting in public the longest without a reply.</div>
      <ul className="clean">
        {q.length ? q.map((c, i) => (
          <li key={c.case_id}>
            <span className="idx">{String(i + 1).padStart(2, '0')}</span>
            <span>
              <b>{c.label}</b> · {c.age_days} days ago {c.stars ? <>· <Rating stars={c.stars} /></> : null}
              <div style={{ marginTop: 3 }}>{c.excerpt ? clip(c.excerpt, 120) : 'rating only, no text'}</div>
            </span>
          </li>
        )) : <li>No unanswered cases in this view.</li>}
      </ul>
    </div>
  );
}

function TrendChart({ rows, useS }: { rows: OverviewResponse['trend_monthly']; useS: boolean }) {
  const config = useMemo((): ChartConfig<'bar' | 'line'> => {
    const labels = rows.map((r) => { const [y, mm] = r.month.split('-'); return MONTHS[+mm - 1] + " '" + y.slice(2); });
    const bar = { type: 'bar' as const, borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.78 };
    return {
      data: {
        labels,
        datasets: [
          { ...bar, label: 'Reviews', data: rows.map((r) => r.reviews), backgroundColor: '#D6E5E3', order: 3 },
          { ...bar, label: 'Google complaints', data: rows.map((r) => r.google_complaints), backgroundColor: T.sig, order: 2 },
          ...(useS ? [{ ...bar, label: 'Instagram complaints', data: rows.map((r) => r.instagram_complaints), backgroundColor: IG, order: 2 }] : []),
          { type: 'line', label: 'Average rating', yAxisID: 'y1', data: rows.map((r) => r.avg_rating),
            borderColor: T.ink, borderWidth: 1.6, tension: 0.35, pointRadius: 0, pointHoverRadius: 4, spanGaps: true, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end' } },
        scales: {
          x: NOGRID, y: { ...AXIS, beginAtZero: true },
          y1: { position: 'right', min: 1, max: 5, ticks: { padding: 6, callback: (v) => v + '★' }, grid: { display: false }, border: { display: false } },
        },
      },
    };
  }, [rows, useS]);
  if (!rows.length) return <div className="empty-note">No reviews or comments in this period.</div>;
  return <ChartBox config={config} />;
}

function RiskChart({ rows: raw }: { rows: OverviewResponse['branch_risk'] }) {
  const rows = useMemo(() => [...raw].sort((a, b) => b.risk_score - a.risk_score), [raw]);
  const config = useMemo((): ChartConfig<'bar'> => ({
    type: 'bar',
    data: {
      labels: rows.map((r) => r.branch),
      datasets: [{ data: rows.map((r) => r.risk_score), borderRadius: 5, barThickness: 22, backgroundColor: rows.map((r) => riskColor(r.risk_score)) }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `risk ${c.parsed.x} · ${rows[c.dataIndex].complaint_rate_pct}% complaints · ${rows[c.dataIndex].conduct_flags} conduct flags` } },
      },
      scales: { x: { ...AXIS, beginAtZero: true, max: 100 }, y: NOGRID },
    },
  }), [rows]);
  if (!rows.length)
    return <div className="empty-note">Branch risk needs a branch. Instagram comments do not carry one, so this panel stays empty while the source is set to Instagram.</div>;
  return <ChartBox config={config} />;
}

function Channels({ mix }: { mix: OverviewResponse['channel_severity_mix'] }) {
  const empty = { complaints: 0, by_severity: {} as Record<string, number> };
  const g = mix.find((m) => m.source === 'google') ?? empty;
  const s = mix.find((m) => m.source === 'instagram') ?? empty;
  const config = useMemo((): ChartConfig<'bar'> => {
    const sev = (m: typeof g, lv: number) => m.by_severity[lv] ?? 0;
    // Complaints below severity 2 carry no ladder topic, so they read as unclassified.
    const other = (m: typeof g) => Math.max(0, m.complaints - sev(m, 4) - sev(m, 3) - sev(m, 2));
    const cols = [T.sig, T.warn, T.calm, '#D6E5E3'];
    const bar = { stack: 'a', borderRadius: 3, barThickness: 26 };
    const names: Record<number, string> = { 4: 'Conduct & regulatory', 3: 'Service failure', 2: 'Process friction' };
    return {
      type: 'bar',
      data: {
        labels: ['Google reviews', 'Instagram'],
        datasets: [
          ...[4, 3, 2].map((v, i) => ({ ...bar, label: names[v], data: [sev(g, v), sev(s, v)], backgroundColor: cols[i] })),
          { ...bar, label: 'Unclassified', data: [other(g), other(s)], backgroundColor: cols[3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { position: 'top', align: 'start', labels: { font: { size: 10.5 } } } },
        scales: { x: { ...AXIS, stacked: true, beginAtZero: true, ticks: { precision: 0, padding: 8 } }, y: { ...NOGRID, stacked: true } },
      },
    };
  }, [g, s]);
  return (
    <div className="panel">
      <PanelHead title="Where complaints arrive" />
      <div className="p-note">Two channels, one severity ladder. Instagram carries fewer cases but a heavier mix.</div>
      <ChartBox config={config} size="sm" />
      <div className="p-note" style={{ margin: '12px 0 0' }}>
        {g.complaints} complaints read from Google against {s.complaints} from Instagram.{' '}
        {pct(s.by_severity[4] ?? 0, s.complaints)}% of the Instagram cases sit at the conduct and regulatory level,{' '}
        against {pct(g.by_severity[4] ?? 0, g.complaints)}% on Google.
      </div>
    </div>
  );
}

function TopCases({ params }: { params: Params }) {
  const res = useApi<CasesResponse>('/v1/cases', { ...params, limit: 7 });
  const q = res.data?.items ?? [];
  return (
    <div className="t-scroll" style={{ maxHeight: 'none', opacity: res.loading && res.data ? 0.55 : 1 }}>
      <table>
        <thead>
          <tr><th>Priority</th><th className="n">Score</th><th>Source</th><th>Posted</th><th>Case</th></tr>
        </thead>
        <tbody>
          {res.error ? <EmptyRow colSpan={5}>Cases could not be loaded. {res.error}</EmptyRow>
            : !res.data ? <EmptyRow colSpan={5}>Loading cases…</EmptyRow>
            : q.length ? q.map((c) => (
              <tr key={c.case_id}>
                <td><Chip priority={c.priority} /></td>
                <td className="n"><b>{c.criticality ?? '—'}</b></td>
                <td>
                  <SourceBadge source={c.source} />
                  <div className="sub">{c.channel_ref.branch ?? 'Official account'}</div>
                </td>
                <td className="mono">{c.posted_at}<div className="sub">{c.age_days}d</div></td>
                <td>
                  <div className="quote">{c.text ? clip(c.text, 150) : <NoText />}</div>
                  <div style={{ marginTop: 5 }}><Tags topics={c.topic_ids} /></div>
                </td>
              </tr>
            )) : <EmptyRow colSpan={5}>No cases match this filter.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

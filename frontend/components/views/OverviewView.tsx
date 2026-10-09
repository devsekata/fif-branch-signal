'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCaseDrawer } from '@/components/CaseHost';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { AiNote, ApiPage, Bridge, Chip, Chips, EmptyRow, Metric, NoText, PanelHead, Pending, Rating, SourceBadge, Stat, Tags } from '@/components/ui';
import { useApi, type ApiResult } from '@/lib/api';
import { useFilters, type Level } from '@/lib/filters';
import { toAreas, toPoints } from '@/lib/geo';
import { branchHref } from '@/lib/pages';
import { useReference } from '@/lib/reference';
import { praiseInScope, topicRows, type PraiseDrivers } from '@/lib/topics';
import { LEVEL_LABEL, pickScope, useView, type View } from '@/lib/scope';
import { MIN_N, readOf, share, type Mix } from '@/lib/signal';
import { IG, IRRELEVANT, NEUTRAL, PRI, T, clip, monthLabel, plural, riskColor, sevColor } from '@/lib/theme';
import type { CasesResponse, ComplaintsResponse, SignalBranchesResponse, SignalOverviewResponse } from '@/lib/types';

type Sig = SignalOverviewResponse;

export function OverviewView() {
  const view = useView('overview');
  const sig = useApi<Sig>('/v1/signal/overview', view.sig);
  /* Branch rows exist for Google only; there is nothing to ask for while the view is Instagram alone. */
  const branches = useApi<SignalBranchesResponse>(view.useG ? '/v1/signal/branches' : null, { ...view.sig, source: undefined });
  const complaints = useApi<ComplaintsResponse>('/v1/pages/complaints', view.params).data;
  return (
    <ApiPage res={sig}>
      {(d) => (
        <>
          <div className="grid g-58 mb">
            <Hero view={view} m={d.mix} />
            <Decision view={view} d={d} />
          </div>

          <div className="grid g-2 mb">
            <Themes view={view} payload={complaints} />
            <BestWorst view={view} res={branches} />
          </div>

          <div className="grid g-58 mb">
            <Trend view={view} months={d.monthly} />
            <div className="panel">
              <PanelHead title="Branch risk ranking" />
              <div className="p-note">Complaint rate, open critical cases, conduct-risk mentions and ageing, combined into one score.</div>
              <RiskChart view={view} res={branches} />
            </div>
          </div>

          <div className="grid g-85 mb">
            <Channels view={view} d={d} praise={complaints?.praise_drivers} />
            <div className="panel">
              <PanelHead title="Work the top of this list first" tag="both channels, highest criticality" />
              <div className="p-note">Full queue with topic tags and links lives in Escalations.</div>
              <TopCases view={view} />
            </div>
          </div>
          <Bridge from="overview" />
        </>
      )}
    </ApiPage>
  );
}

/** "across 25 branches and the Instagram account", for the two opening sentences. */
function useWhere(view: View) {
  const n = useReference().places.length;
  return view.src === 'instagram' ? 'on the official Instagram account'
    : view.isSet ? `in ${view.scopeName}`
    : view.src === 'google' ? `across ${n} ${plural(n, 'branch', 'branches')}`
    : `across ${n} ${plural(n, 'branch', 'branches')} and the Instagram account`;
}

function Hero({ view, m }: { view: View; m: Mix }) {
  /* Shares are of everything read, so the four categories add up to 100. The score is on the three that are opinions. */
  const all = readOf(m);
  const where = useWhere(view);
  const coverage = useReference().source('google');
  const cov = coverage?.universe ? ((100 * coverage.rows) / coverage.universe).toFixed(1) : null;
  const verdict = m.score === null ? '' : m.score >= 70 ? 'Mostly positive' : m.score >= 55 ? 'Mixed, leaning positive' : m.score >= 45 ? 'Mixed' : 'Leaning negative';
  return (
    <div className="hero">
      <div className="dw-sub" style={{ marginBottom: 6 }}><span>How customers are talking about FIF right now</span></div>
      <div className="lede">
        {all ? (
          <>
            {m.score !== null && <><em style={{ color: m.score >= 55 ? 'var(--grow)' : 'var(--sig)' }}>{verdict}</em> {where} —{' '}</>}
            {share(m.good, all)}% positive, {share(m.neutral, all)}% neutral, {share(m.bad, all)}% negative, {share(m.irrelevant, all)}% irrelevant/spam{' '}
            across {all.toLocaleString('en-US')} reviews and comments read.
          </>
        ) : 'Nothing read in this view.'}
      </div>
      <div className="stat-rail" style={{ borderTop: 'none', paddingTop: 0 }}>
        <Stat k="Sentiment score" v={m.score ?? '—'} n="(positive − negative) ÷ total, irrelevant/spam left out" bad={m.score !== null && m.score < 55} />
        <Stat k="Read" v={all.toLocaleString('en-US')} n={cov && view.useG ? `${cov}% of all Google reviews` : 'reviews and comments'} />
        <Stat k="Irrelevant/spam" v={share(m.irrelevant, all) + '%'} n={`${m.irrelevant.toLocaleString('en-US')} set aside by the relevance check`} />
        <Stat k="Negative share" v={share(m.bad, all) + '%'} n={`${m.bad.toLocaleString('en-US')} reviews and comments`} bad={share(m.bad, all) > 15} />
      </div>
      <div style={{ borderTop: '1px solid var(--rule-2)', marginTop: 18, paddingTop: 14 }}>
        <MixDonut m={m} />
      </div>
    </div>
  );
}

function MixDonut({ m }: { m: Mix }) {
  const all = readOf(m);
  const config = useMemo((): ChartConfig<'doughnut'> => {
    const data = [m.good, m.neutral, m.bad, m.irrelevant];
    const colors = [T.grow, '#CBD7D5', T.sig, IRRELEVANT];
    return {
      type: 'doughnut',
      data: { labels: ['Positive', 'Neutral', 'Negative', 'Irrelevant/spam'], datasets: [{ data, backgroundColor: colors, borderColor: '#FFFFFF', borderWidth: 3, hoverOffset: 5 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              padding: 12, font: { size: 11.5 },
              generateLabels: (ch) => (ch.data.labels as string[]).map((l, i) => ({
                text: `${l} — ${data[i].toLocaleString('en-US')} (${share(data[i], all)}%)`,
                fillStyle: colors[i], strokeStyle: colors[i], lineWidth: 0, pointStyle: 'circle' as const, index: i,
              })),
            },
          },
          tooltip: { callbacks: { label: (c) => `${c.parsed.toLocaleString('en-US')} of ${all.toLocaleString('en-US')} (${share(c.parsed, all)}%)` } },
        },
      },
    };
  }, [m, all]);
  if (!all) return <div className="empty-note">Nothing read in this view.</div>;
  return <ChartBox config={config} size="donut" />;
}

/** What needs a decision: the complaint side of the same view. */
function Decision({ view, d: sig }: { view: View; d: Sig }) {
  const where = useWhere(view);
  const h = sig.headline;
  const d = {
    rate: h.complaint_rate_pct, open: h.open_cases, reg: h.conduct_level, unanswered: h.never_answered,
    oldest: h.oldest_unanswered_days, counts: h.by_priority as Record<string, number>, longest: sig.longest_unanswered,
  };
  const present = Object.entries(d.counts).filter(([, v]) => v);
  return (
    <div className="panel">
      <PanelHead title="What needs a decision" tag={`${d.unanswered} unanswered`} />
      <div className="p-note">
        {d.open
          ? `${d.open} open ${plural(d.open, 'case', 'cases')} ${where}. ${d.reg} ${plural(d.reg, 'describes', 'describe')} collection conduct, misappropriation or exposed personal data.`
          : 'No open case in this view.'}
      </div>
      <div className="grid g-2" style={{ gap: 10 }}>
        <Metric small k="Open cases" v={d.open} n={`complaint rate ${d.rate.toFixed(1)}%`} color={d.open > 0 ? 'var(--sig)' : undefined} />
        <Metric small k="Conduct level" v={d.reg} n="severity 4" color={d.reg > 0 ? 'var(--sig)' : undefined} />
        <Metric small k="Never answered" v={d.unanswered} n="no public reply" color={d.unanswered > 0 ? 'var(--sig)' : undefined} />
        <Metric small k="Oldest" v={d.oldest + 'd'} n="still public" color={d.oldest > 180 ? 'var(--sig)' : undefined} />
      </div>
      {d.open > 0 && (
        <>
          <div className="seg" style={{ margin: '14px 0 8px' }}>
            {present.map(([k, v]) => <i key={k} style={{ flex: v, background: PRI[k] }} title={`${k}: ${v}`} />)}
          </div>
          <div className="seg-key">
            {present.map(([k, v]) => <span key={k}><i className="dot" style={{ background: PRI[k] }} />{k} {v}</span>)}
          </div>
        </>
      )}
      <div style={{ borderTop: '1px solid var(--rule-2)', marginTop: 14, paddingTop: 12 }}>
        <div className="p-tag" style={{ marginBottom: 8 }}>Longest unanswered</div>
        <ul className="clean">
          {d.longest.length ? d.longest.map((c, i) => (
            <li key={c.case_id}>
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <b>{c.label}</b> · {c.age_days} days ago{' '}
                {c.stars ? <>· <Rating stars={c.stars} /></> : null}
                <div style={{ marginTop: 3 }}>{c.excerpt ? clip(c.excerpt, 120) : 'rating only, no text'}</div>
              </span>
            </li>
          )) : <li>No unanswered cases in this view.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------- what people are talking about, all three ways ---------- */
type ThemeMode = 'positive' | 'neutral' | 'negative';
const THEME_MODES: [ThemeMode, string][] = [['positive', 'Positive'], ['neutral', 'Neutral'], ['negative', 'Negative']];
const THEME_NOTE: Record<ThemeMode, string> = {
  negative: 'The themes behind the negative share above. Full taxonomy and the branch split live in Complaint themes.',
  positive: 'What customers say when they are satisfied. This is the coaching script, already written by the people being served.',
  neutral: 'Questions, not verdicts. These need an answer rather than an apology — and almost all of them arrive in comments, not reviews.',
};

function Themes({ view, payload }: { view: View; payload: ComplaintsResponse | undefined }) {
  const [mode, setMode] = useState<ThemeMode>('negative');
  const topics = useMemo(() => topicRows(payload, view), [payload, view]);
  const praise = payload?.praise_drivers;
  const rows = mode === 'negative'
    ? topics.map((r) => ({ label: r.label, n: r.g + r.s, color: sevColor(r.sev), sub: `severity ${r.sev}` + (r.s ? ` · ${r.g} Google, ${r.s} Instagram` : '') }))
    : mode === 'positive'
    ? praiseInScope(praise, view).map((p) => ({ label: p.label, n: p.n, color: T.grow, sub: 'positive mentions' }))
    : [];
  const top = [...rows].sort((x, y) => y.n - x.n).slice(0, 4);
  const tot = top.reduce((a, r) => a + r.n, 0);
  return (
    <div className="panel">
      <PanelHead title="What they are talking about" tag={tot ? `${tot} mentions` : undefined} />
      <div className="p-note">{THEME_NOTE[mode]}</div>
      <Chips options={THEME_MODES} value={mode} onPick={setMode} />
      {mode === 'neutral' ? (
        <Pending>Question topics (promo, requirements, payment channels) are in the taxonomy, but the API does not tag neutral text yet, so there is nothing to count on this side.</Pending>
      ) : top.length ? top.map((r) => (
        <div key={r.label} className="theme-row" style={{ cursor: 'default' }}>
          <span className="nm">
            <b>{r.label}</b>
            <div className="sub">{r.sub}</div>
            <div className="track"><i style={{ width: `${tot ? (100 * r.n) / tot : 0}%`, background: r.color }} /></div>
          </span>
          <span className="cnt" style={{ color: r.color }}>
            {r.n}
            <div className="sub" style={{ fontFamily: 'var(--font-jakarta)', fontWeight: 400 }}>{share(r.n, tot)}%</div>
          </span>
        </div>
      )) : <div className="empty-note">Nothing tagged in this view for that side.</div>}
    </div>
  );
}

/* ---------- best and worst, at whichever level the reader wants ---------- */
const BW_LEVELS: [Level, string][] = [['province', 'Province'], ['kota', 'Kota / kabupaten'], ['kecamatan', 'Kecamatan'], ['branch', 'Branch']];

function BestWorst({ view, res }: { view: View; res: ApiResult<SignalBranchesResponse> }) {
  const [level, setLevel] = useState<Level>('kecamatan');
  const { places } = useReference();
  const { setFilter } = useFilters();
  const router = useRouter();
  const lv = LEVEL_LABEL[level].toLowerCase();

  const sorted = useMemo(() => {
    const items = level === 'branch'
      ? toPoints(res.data).filter((p) => p.enough).map((p) => ({ key: p.place.id, name: p.place.name, mix: p.mix }))
      : toAreas(res.data, level).filter((a) => a.enough).map((a) => ({ key: a.name, name: a.name, mix: a.mix }));
    return items.sort((x, y) => y.mix.score! - x.mix.score!);
  }, [res.data, level]);

  /* With three provinces a strict best-3 / worst-3 split silently drops the middle one.
   * Show the whole list whenever it fits; only slice when it does not. */
  const showAll = sorted.length <= 7;
  const picked = useMemo(() => (showAll ? sorted : [...sorted.slice(0, 3), ...sorted.slice(-3).reverse()]), [sorted, showAll]);

  const config = useMemo((): ChartConfig<'bar'> => ({
    type: 'bar',
    data: {
      labels: picked.map((x) => x.name),
      datasets: [{
        data: picked.map((x) => x.mix.score!), borderRadius: 4,
        backgroundColor: picked.map((_, i) => {
          if (!showAll) return i < 3 ? T.grow : T.sig;
          const q = picked.length <= 2 ? 0 : Math.ceil(picked.length / 3);
          return i < q ? T.grow : i >= picked.length - q ? T.sig : T.hold;
        }),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `score ${c.parsed.x}`,
            afterBody: (c) => { const m = picked[c[0].dataIndex].mix; return `${readOf(m).toLocaleString('en-US')} reviews — ${m.good} positive, ${m.neutral} neutral, ${m.bad} negative, ${m.irrelevant} irrelevant/spam`; },
          },
        },
      },
      scales: { x: { ...AXIS, beginAtZero: true, max: 100, title: { display: true, text: 'sentiment score' } }, y: { ...NOGRID, ticks: { padding: 6, font: { size: 11 } } } },
      onClick: (_e, els) => {
        if (!els.length) return;
        const x = picked[els[0].index];
        if (level === 'branch') router.push(branchHref(x.key));
        else { setFilter('scope', pickScope(level, x.key, places)); router.push('/branches'); }
      },
    },
  }), [picked, showAll, level, places, router, setFilter]);

  const best = sorted[0], lowest = sorted[sorted.length - 1];
  const gap = best && lowest ? Math.round((best.mix.score! - lowest.mix.score!) * 10) / 10 : 0;
  return (
    <div className="panel">
      <PanelHead title={`Best and worst by ${lv}`} tag={`${sorted.length} scored` + (showAll ? ' · all shown' : ' · top 3 and bottom 3')} />
      <div className="p-note">Best three and worst three on one axis. Areas under the minimum review count are left out of both ends rather than ranked on thin data.</div>
      <Chips options={BW_LEVELS} value={level} onPick={setLevel} />
      {!view.useG ? (
        <div className="empty-note">Areas and branches come from Google reviews. Instagram comments carry no location, so there is nothing to rank while the source is Instagram.</div>
      ) : res.error ? (
        <div className="empty-note">Branch figures could not be loaded. {res.error}</div>
      ) : !res.data ? (
        <div className="empty-note">Loading branch figures…</div>
      ) : sorted.length < 2 ? (
        <div className="empty-note">Needs at least two scored {lv} entries. {sorted.length ? 'Only one qualifies.' : 'None qualifies.'} Everything else sits under the {MIN_N}-review minimum.</div>
      ) : (
        <>
          <ChartBox config={config} size="sm" />
          <AiNote title="Reading the spread">
            {best.name} leads at {best.mix.score}; {lowest.name} trails at {lowest.mix.score}. That is {gap} points between the ends, on {lv} level.{' '}
            {showAll ? `All ${sorted.length} scored entries are shown.` : `Showing the top three and bottom three of ${sorted.length}.`}{' '}
            {gap > 20
              ? 'A gap this wide is a management difference, not sampling noise — the top of the list is the coaching material for the bottom.'
              : 'The ends sit close enough that no single area stands out; look at the case list rather than the map.'}{' '}
            Click a bar to open it.
          </AiNote>
        </>
      )}
    </div>
  );
}

/* ---------- how sentiment is moving ---------- */
type TrendMode = 'mix' | 'problem';
const TREND_MODES: [TrendMode, string][] = [['mix', 'Positive · neutral · negative · irrelevant'], ['problem', 'Complaints and rating']];

function Trend({ view, months }: { view: View; months: Sig['monthly'] }) {
  const [mode, setMode] = useState<TrendMode>('mix');
  const config = useMemo((): ChartConfig<'bar' | 'line'> => {
    const labels = months.map((m) => monthLabel(m.month));
    const legend = { position: 'top' as const, align: 'end' as const, labels: { font: { size: 10.5 } } };
    if (mode === 'mix') {
      const bar = { type: 'bar' as const, stack: 'a', borderRadius: 3, barPercentage: 0.74, categoryPercentage: 0.8 };
      return {
        data: {
          labels,
          datasets: [
            { ...bar, label: 'Positive', data: months.map((m) => m.good), backgroundColor: T.grow },
            { ...bar, label: 'Neutral', data: months.map((m) => m.neutral), backgroundColor: NEUTRAL },
            { ...bar, label: 'Negative', data: months.map((m) => m.bad), backgroundColor: T.sig },
            { ...bar, label: 'Irrelevant/spam', data: months.map((m) => m.irrelevant), backgroundColor: IRRELEVANT },
            { type: 'line', label: 'Sentiment score', yAxisID: 'y1', data: months.map((m) => m.score),
              borderColor: T.ink, borderWidth: 1.6, tension: 0.35, pointRadius: 0, pointHoverRadius: 4, spanGaps: true },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend },
          scales: {
            x: { ...NOGRID, stacked: true }, y: { ...AXIS, stacked: true, beginAtZero: true },
            y1: { position: 'right', min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { padding: 6 } },
          },
        },
      };
    }
    const bar = { type: 'bar' as const, borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.78 };
    return {
      data: {
        labels,
        datasets: [
          { ...bar, label: 'Reviews', data: months.map((m) => m.reviews), backgroundColor: '#D6E5E3' },
          { ...bar, label: 'Google complaints', data: months.map((m) => m.google_complaints), backgroundColor: T.sig },
          ...(view.useS && !view.isSet ? [{ ...bar, label: 'Instagram complaints', data: months.map((m) => m.instagram_complaints), backgroundColor: IG }] : []),
          { type: 'line', label: 'Average rating', yAxisID: 'y1', data: months.map((m) => m.avg_rating),
            borderColor: T.ink, borderWidth: 1.6, tension: 0.35, pointRadius: 0, pointHoverRadius: 4, spanGaps: true },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend },
        scales: {
          x: NOGRID, y: { ...AXIS, beginAtZero: true },
          y1: { position: 'right', min: 1, max: 5, ticks: { padding: 6, callback: (v) => v + '★' }, grid: { display: false }, border: { display: false } },
        },
      },
    };
  }, [months, mode, view.useS, view.isSet]);

  // direction of travel
  const scored = months.filter((m) => m.total >= MIN_N);
  const half = Math.ceil(scored.length / 2);
  const avg = (arr: typeof scored) => arr.reduce((a, x) => a + x.score!, 0) / arr.length;
  const delta = scored.length >= 2 ? Math.round((avg(scored.slice(-half)) - avg(scored.slice(0, half))) * 10) / 10 : 0;
  const dir = delta > 1.5 ? 'improving' : delta < -1.5 ? 'sliding' : 'flat';
  return (
    <div className="panel">
      <div className="p-head"><h3>How sentiment is moving</h3><Chips flush options={TREND_MODES} value={mode} onPick={setMode} /></div>
      <div className="p-note">
        {mode === 'mix'
          ? 'Every review and comment read, split four ways; irrelevant/spam stays out of the score. The line is the sentiment score for that month — it moves even when volume does not.'
          : 'Complaint volume against the average rating. Watch where the bars rise while the line holds steady — that gap is a collection campaign covering live complaints.'}
      </div>
      {months.length ? <ChartBox config={config} /> : <div className="empty-note">No reviews or comments in this period.</div>}
      {scored.length >= 2 && (
        <AiNote title="Direction of travel">
          The sentiment score is {dir} — {delta > 0 ? '+' : ''}{delta} points comparing the first half of the window with the second.{' '}
          {dir === 'flat' ? 'Nothing in the trend calls for action on its own; the case list is where the signal is.'
            : dir === 'sliding' ? 'Worth asking what changed before the next board cycle.'
            : 'Whatever changed is working; find out what and copy it.'}
        </AiNote>
      )}
    </div>
  );
}

function RiskChart({ view, res }: { view: View; res: ApiResult<SignalBranchesResponse> }) {
  /* Branches with nothing read in this view are dropped rather than shown at zero. */
  const rows = useMemo(() => (res.data?.branches ?? []).filter((b) => b.reviews_read > 0)
    .map((b) => ({ name: b.branch, risk: b.risk_score, cr: b.complaint_rate_pct, reg: b.conduct_flags }))
    .sort((a, b) => b.risk - a.risk), [res.data]);
  const config = useMemo((): ChartConfig<'bar'> => ({
    type: 'bar',
    data: {
      labels: rows.map((r) => r.name),
      datasets: [{ data: rows.map((r) => r.risk), borderRadius: 5, backgroundColor: rows.map((r) => riskColor(r.risk)) }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `risk ${c.parsed.x} · ${rows[c.dataIndex].cr}% complaints · ${rows[c.dataIndex].reg} conduct flags` } },
      },
      scales: { x: { ...AXIS, beginAtZero: true, max: 100 }, y: NOGRID },
    },
  }), [rows]);
  if (!view.useG)
    return <div className="empty-note">Branch risk needs a branch. Instagram comments do not carry one, so this panel stays empty while the source is set to Instagram.</div>;
  if (res.error) return <div className="empty-note">Branch figures could not be loaded. {res.error}</div>;
  if (!res.data) return <div className="empty-note">Loading branch figures…</div>;
  if (!rows.length) return <div className="empty-note">No branch in this scope.</div>;
  return <ChartBox config={config} />;
}

/* ---------- where feedback arrives ---------- */
const SEV_BANDS: [number, string][] = [[4, 'Conduct & regulatory'], [3, 'Service failure'], [2, 'Process friction'], [1, 'Facilities']];
const NO_SEV = { complaints: 0, by_severity: {} as Record<string, number> };

function Channels({ view, d, praise }: { view: View; d: Sig; praise: PraiseDrivers | undefined }) {
  const g = d.severity_mix.find((m) => m.source === 'google') ?? NO_SEV;
  const s = d.severity_mix.find((m) => m.source === 'instagram') ?? NO_SEV;
  const negative = useMemo((): ChartConfig<'bar'> => {
    const band = (m: typeof g) => [...SEV_BANDS.map(([v]) => m.by_severity[v] ?? 0), m.by_severity[0] ?? 0];
    const gd = band(g), sd = band(s);
    const keep = [...SEV_BANDS.map(([, l]) => l), 'Unclassified'].map((l, i) => ({ l, g: gd[i], s: sd[i] })).filter((x) => x.g || x.s);
    const bar = { stack: 'a', borderRadius: 3, barPercentage: 0.92, categoryPercentage: 0.84 };
    return {
      type: 'bar',
      data: {
        labels: keep.map((x) => x.l),
        datasets: [
          { ...bar, label: 'Google reviews', data: keep.map((x) => x.g), backgroundColor: T.sig },
          { ...bar, label: 'Instagram', data: keep.map((x) => x.s), backgroundColor: IG },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { position: 'top', align: 'end', labels: { font: { size: 10.5 } } },
          tooltip: { callbacks: { afterBody: (c) => { const r = keep[c[0].dataIndex]; return `${r.g + r.s} total in this band`; } } },
        },
        scales: { x: { ...AXIS, stacked: true, beginAtZero: true, ticks: { precision: 0, padding: 8 } }, y: { ...NOGRID, stacked: true, ticks: { padding: 6, font: { size: 11 } } } },
      },
    };
  }, [g, s]);

  const cats = useMemo(() => praiseInScope(praise, view), [praise, view]);
  const gPositive = d.mix_by_source.google.good, sPositive = d.mix_by_source.instagram.good;
  const positive = useMemo((): ChartConfig<'bar'> => {
    const tagged = cats.reduce((a, c) => a + c.n, 0);
    const rows = [...cats.map((c) => ({ label: c.label, g: c.n, s: 0 }))];
    const untagged = Math.max(0, gPositive - tagged);
    if (untagged || sPositive) rows.push({ label: 'Untagged', g: untagged, s: sPositive });
    const bar = { stack: 'a', borderRadius: 3, barPercentage: 0.92, categoryPercentage: 0.84 };
    return {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          { ...bar, label: 'Google reviews', data: rows.map((r) => r.g), backgroundColor: T.grow },
          { ...bar, label: 'Instagram', data: rows.map((r) => r.s), backgroundColor: IG },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { position: 'top', align: 'end', labels: { font: { size: 10.5 } } } },
        scales: { x: { ...AXIS, stacked: true, beginAtZero: true, ticks: { precision: 0, padding: 8 } }, y: { ...NOGRID, stacked: true, ticks: { padding: 6, font: { size: 11 } } } },
      },
    };
  }, [cats, gPositive, sPositive]);

  const sev4 = (m: typeof g) => share(m.by_severity[4] ?? 0, m.complaints);
  return (
    <div className="panel">
      <PanelHead title="Where feedback arrives" tag="both sides, by channel" />
      <div className="p-tag" style={{ marginBottom: 6 }}>Negative — by severity</div>
      <div className="p-note" style={{ marginBottom: 8 }}>Two channels, one severity ladder. Instagram carries fewer cases but a heavier mix.</div>
      {g.complaints + s.complaints ? <ChartBox config={negative} /> : <div className="empty-note">No complaints in this view.</div>}
      <div className="p-note" style={{ margin: '10px 0 0' }}>
        {g.complaints} complaints read from Google against {s.complaints} from Instagram.{' '}
        {sev4(s)}% of the Instagram cases sit at the conduct and regulatory level, against {sev4(g)}% on Google.{' '}
        People bring the serious accusations to the brand&apos;s own feed, where everyone can see them.
      </div>
      <div style={{ borderTop: '1px solid var(--rule-2)', margin: '16px 0 0', paddingTop: 14 }}>
        <div className="p-tag" style={{ marginBottom: 6 }}>Positive — by what is being praised</div>
        <div className="p-note" style={{ marginBottom: 8 }}>Same axis, one series per channel. Categories that sit on only one channel are the point, not a gap.</div>
        {gPositive + sPositive ? <ChartBox config={positive} /> : <div className="empty-note">Nothing positive read in this view.</div>}
        <div className="p-note" style={{ margin: '10px 0 0' }}>
          {gPositive.toLocaleString('en-US')} positive reviews on Google against {sPositive} positive comments on Instagram.{' '}
          {cats[0] ? `On Google people name the service — ${cats[0].label} leads with ${cats[0].n} mentions. ` : ''}
          Praise categories are tagged on Google text only, so Instagram praise is counted but not broken down. Counting the two together would turn content engagement into customer satisfaction.
        </div>
      </div>
    </div>
  );
}

function TopCases({ view }: { view: View }) {
  const res = useApi<CasesResponse>('/v1/cases', { ...view.sig, complaints: 'true', limit: 7 });
  const q = useMemo(() => res.data?.items ?? [], [res.data]);
  const { open, drawer } = useCaseDrawer(q);
  return (
    <div className="t-scroll" style={{ maxHeight: 'none' }}>
      <table>
        <thead>
          <tr><th>Priority</th><th className="n">Score</th><th>Source</th><th>Posted</th><th>Case</th></tr>
        </thead>
        <tbody>
          {q.length ? q.map((c) => (
            <tr key={c.case_id} className="clickable" onClick={() => open(c.case_id)}>
              <td><Chip priority={c.priority} /></td>
              <td className="n"><b>{c.criticality ?? '—'}</b></td>
              <td>
                <SourceBadge source={c.source} />
                <div className="sub">{c.channel_ref.branch ?? 'Official account'}</div>
              </td>
              <td className="mono">{c.posted_at.slice(0, 10)}<div className="sub">{c.age_days}d</div></td>
              <td>
                <div className="quote">{c.text ? clip(c.text, 150) : <NoText />}</div>
                <div style={{ marginTop: 5 }}><Tags topics={c.topic_ids} /></div>
              </td>
            </tr>
          )) : <EmptyRow colSpan={5}>{res.error ? `Cases could not be loaded. ${res.error}` : !res.data ? 'Loading cases…' : 'No cases match this filter.'}</EmptyRow>}
        </tbody>
      </table>
      {drawer}
    </div>
  );
}

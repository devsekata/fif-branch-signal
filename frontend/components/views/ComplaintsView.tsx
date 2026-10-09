'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { AiNote, ApiPage, Bridge, Chips, PanelHead, Pending } from '@/components/ui';
import { useApi } from '@/lib/api';
import { toPoints } from '@/lib/geo';
import { branchHref } from '@/lib/pages';
import { useView, type View } from '@/lib/scope';
import { praiseInScope, topicRows, type TopicRow } from '@/lib/topics';
import { IG, T, sevColor } from '@/lib/theme';
import type { ComplaintsResponse, SignalBranchesResponse, SignalOverviewResponse } from '@/lib/types';

type Praise = ReturnType<typeof praiseInScope>;

export function ComplaintsView() {
  const view = useView('complaints');
  const res = useApi<ComplaintsResponse>('/v1/pages/complaints', view.params);
  return <ApiPage res={res}>{(d) => <Complaints view={view} payload={d} />}</ApiPage>;
}

function Complaints({ view, payload }: { view: View; payload: ComplaintsResponse }) {
  const topics = useMemo(() => topicRows(payload, view), [payload, view]);
  const praise = useMemo(() => praiseInScope(payload?.praise_drivers, view), [payload, view]);
  const both = view.useG && view.useS && !view.isSet;
  return (
    <>
      <ClassificationCard view={view} topics={topics} praise={praise} />
      <div className="grid g-58 mb">
        <TopicsPanel view={view} topics={topics} praise={praise} />
        <HeatPanel view={view} topics={topics} praise={praise} />
      </div>
      {both && <Exclusive rows={topics} />}
      <div className="grid g-2 mb">
        <Language view={view} praise={praise} terms={payload?.terms_negative} />
        <div className="panel">
          <PanelHead title="Top praised branches" tag="by positive share" />
          <div className="p-note">Scored branches only. The benchmark list for whoever runs branch coaching.</div>
          <Praised view={view} />
        </div>
      </div>
      <Bridge from="complaints" />
    </>
  );
}

/* ---------- the card the client asked for: one axis of categories, three bars each ---------- */
function ClassificationCard({ view, topics, praise }: { view: View; topics: TopicRow[]; praise: Praise }) {
  const rows = useMemo(() => [
    ...praise.map((p) => ({ label: p.label, group: 'Positive' as const, good: p.n, bad: 0, sev: 0 })),
    ...[...topics].sort((x, y) => (y.g + y.s) - (x.g + x.s)).map((r) => ({ label: r.label, group: 'Negative' as const, good: 0, bad: r.g + r.s, sev: r.sev })),
  ], [praise, topics]);
  const config = useMemo((): ChartConfig<'bar'> => ({
    type: 'bar',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        { label: 'Positive', data: rows.map((r) => r.good), backgroundColor: T.grow, borderRadius: 3 },
        { label: 'Neutral', data: rows.map(() => 0), backgroundColor: T.calm, borderRadius: 3 },
        { label: 'Negative', data: rows.map((r) => r.bad), backgroundColor: T.sig, borderRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { position: 'top', align: 'end', labels: { font: { size: 10.5 } } },
        tooltip: { callbacks: { title: (c) => rows[c[0].dataIndex].label, afterBody: (c) => { const r = rows[c[0].dataIndex]; return r.group === 'Negative' ? `severity ${r.sev}` : r.group; } } },
      },
      /* A category sits on one side only, so the three series share a bar rather than leaving two empty slots per row. */
      scales: { x: { ...AXIS, stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { ...NOGRID, stacked: true, ticks: { padding: 6, font: { size: 11 } } } },
    },
  }), [rows]);

  /* The two kinds of neutral the API can tell apart today: a star with no words, and text with no verdict. */
  const sig = useApi<SignalOverviewResponse>('/v1/signal/overview', view.sig).data;
  const wordless = sig?.neutral_rating_only ?? 0;
  const worded = Math.max(0, (sig?.mix.neutral ?? 0) - wordless);
  return (
    <div className="panel mb">
      <PanelHead title="Review classification — every category" tag={`${rows.length} categories`} />
      <div className="p-note">Every tagged category on one axis, with positive, neutral and negative side by side. Neutral categories — questions about promos, requirements, payment channels — are in the taxonomy but are not tagged by the API yet, so that band is empty.{sig && sig.mix.irrelevant > 0 ? ` ${sig.mix.irrelevant.toLocaleString('en-US')} irrelevant or spam ${sig.mix.irrelevant === 1 ? 'item is' : 'items are'} set aside and belong to no category.` : ''}</div>
      {rows.length ? <ChartBox config={config} /> : <div className="empty-note">Nothing tagged in this view.</div>}
      <div className="split-row">
        <div className="sp">
          <div className="k">Neutral — a question</div><div className="v">—</div>
          <div className="n">Text with no verdict in it. Someone wants an answer, not an apology. The API does not classify questions yet; {worded} neutral {worded === 1 ? 'item carries' : 'items carry'} text and may be one.</div>
        </div>
        <div className="sp">
          <div className="k">Neutral — rating only</div><div className="v">{sig ? wordless.toLocaleString('en-US') : '…'}</div>
          <div className="n">A star with no words. A tap, not an opinion — which is why it is not counted as praise.</div>
        </div>
        <div className="sp hint">
          <div className="k">Why they are split</div>
          <div className="v" style={{ fontSize: 13, fontFamily: 'var(--font-jakarta)', fontWeight: 600, letterSpacing: 0 }}>Two different things</div>
          <div className="n">One needs a reply, the other needs nothing. Collapsing them into one &ldquo;neutral&rdquo; number is how a dashboard ends up reporting silence as satisfaction.</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- what customers complain about ---------- */
type ClsMode = 'bad' | 'good' | 'all';
const CLS_MODES: [ClsMode, string][] = [['bad', 'Negative'], ['good', 'Positive'], ['all', 'Both sides']];

function TopicsPanel({ view, topics, praise }: { view: View; topics: TopicRow[]; praise: Praise }) {
  const [mode, setMode] = useState<ClsMode>('bad');
  const g = praise.reduce((a, x) => a + x.n, 0), bd = topics.reduce((a, x) => a + x.g + x.s, 0);
  const config = useMemo((): ChartConfig<'bar'> => {
    const y = { ...NOGRID, ticks: { padding: 6, font: { size: 11.5 } } };
    if (mode === 'bad') {
      const ds = [];
      if (view.useG) ds.push({ label: 'Google reviews', data: topics.map((r) => r.g), backgroundColor: topics.map((r) => sevColor(r.sev)), borderRadius: 4 });
      if (view.useS) ds.push({ label: 'Instagram', data: topics.map((r) => r.s), backgroundColor: IG, borderRadius: 4 });
      return {
        type: 'bar',
        data: { labels: topics.map((r) => r.label), datasets: ds },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: {
            legend: { display: ds.length > 1, position: 'top', align: 'end' },
            tooltip: {
              callbacks: {
                title: (c) => topics[c[0].dataIndex].label,
                label: (c) => `${c.dataset.label}: ${c.parsed.x}`,
                afterBody: (c) => `severity ${topics[c[0].dataIndex].sev} · last seen ${topics[c[0].dataIndex].last ?? '—'}`,
              },
            },
          },
          scales: { x: { ...AXIS, beginAtZero: true, ticks: { precision: 0, padding: 8 } }, y },
        },
      };
    }
    const pos = praise.map((p) => ({ label: p.label, n: p.n, sev: 0 }));
    const rows = mode === 'good' ? pos : [...pos, ...topics.map((r) => ({ label: r.label, n: r.g + r.s, sev: r.sev }))].sort((a, b) => b.n - a.n).slice(0, 14);
    return {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [{ label: mode === 'good' ? 'Positive mentions' : 'Mentions', data: rows.map((r) => r.n), borderRadius: 4, backgroundColor: rows.map((r) => (r.sev ? sevColor(r.sev) : T.grow)) }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (c) => (rows[c.dataIndex].sev ? `severity ${rows[c.dataIndex].sev}` : 'positive') } } },
        scales: { x: { ...AXIS, beginAtZero: true, ticks: { precision: 0 } }, y },
      },
    };
  }, [mode, topics, praise, view.useG, view.useS]);
  const empty = mode === 'bad' ? !topics.length : mode === 'good' ? !praise.length : !topics.length && !praise.length;
  return (
    <div className="panel">
      <div className="p-head"><h3>What customers complain about</h3><Chips flush options={CLS_MODES} value={mode} onPick={setMode} /></div>
      <div className="p-note">Tagged from review text with an Indonesian keyword model that handles negation. Severity 4 covers conduct and regulatory exposure — field collection behaviour, repossession, alleged misappropriation of payments. Those are the ones that reach OJK and local media.</div>
      {empty ? <div className="empty-note">{mode === 'good' && !view.useG ? 'Praise is tagged on Google review text. Switch the source back to include Google reviews.' : 'Nothing tagged in this view.'}</div> : <ChartBox config={config} />}
      {mode === 'good' && praise.length > 0 && (
        <AiNote title="What earns praise">
          {praise[0].label} leads with {praise[0].n} mentions, ahead of {praise[1]?.label ?? 'everything else'}.{' '}
          These are the behaviours already working somewhere in the network — the cheapest improvement available is making them standard rather than inventing something new.
        </AiNote>
      )}
      {mode === 'all' && !empty && (
        <AiNote title="Both sides at once">
          {g} positive mentions against {bd} negative across the tagged reviews.{' '}
          {g > bd ? 'Praise outweighs complaint in volume, which is exactly why a complaint-only view misleads a board.'
            : 'Complaints outweigh praise in the tagged text, so the ratio is the story rather than any single topic.'}
        </AiNote>
      )}
    </div>
  );
}

/* ---------- where it concentrates ---------- */
type HeatMode = 'bad' | 'good' | 'all';
const HEAT_MODES: [HeatMode, string][] = [['bad', 'Negative'], ['good', 'Positive'], ['all', 'All reviews']];
/** fif_metric_spec.md §8.4: at 2,700 branches an uncapped table is unreadable; the scope filter is the way to narrow it. */
const HEAT_CAP = 6;

function HeatPanel({ view, topics, praise }: { view: View; topics: TopicRow[]; praise: Praise }) {
  const [mode, setMode] = useState<HeatMode>('bad');
  const heat = useMemo(() => {
    /* Both splits are keyed by branch name, which is how the API sends them. */
    const negRows = [...topics].filter((t) => t.g > 0).sort((a, b) => b.g - a.g)
      .map((t) => ({ key: t.id, label: t.label, sev: t.sev, of: (name: string) => t.by_branch.get(name) ?? 0 }));
    const posRows = praise.map((p) => ({ key: p.id, label: p.label, sev: 0, of: (name: string) => p.by_branch[name] ?? 0 }));
    const rows = mode === 'good' ? posRows.slice(0, 8) : mode === 'all' ? [...negRows.slice(0, 5), ...posRows.slice(0, 3)] : negRows.slice(0, 8);
    const volume = (name: string) => [...negRows, ...posRows].reduce((a, r) => a + r.of(name), 0);
    const withData = view.places.filter((p) => volume(p.name) > 0);
    const cols = [...withData].sort((a, b) => volume(b.name) - volume(a.name)).slice(0, HEAT_CAP).sort((a, b) => a.name.localeCompare(b.name));
    return { rows, cols, trimmed: withData.length - cols.length, max: Math.max(1, ...rows.flatMap((r) => cols.map((c) => r.of(c.name)))) };
  }, [view, topics, praise, mode]);
  const short = (name: string) => name.replace(/^FIFGROUP\s*-?\s*/i, '');
  return (
    <div className="panel">
      <div className="p-head"><h3>Where it concentrates</h3>{view.useG && <Chips flush options={HEAT_MODES} value={mode} onPick={setMode} />}</div>
      <div className="p-note">One branch owning a topic is a coaching problem. A topic spread evenly is a process problem, and it belongs to head office.</div>
      {!view.useG ? (
        <div className="empty-note">The heatmap maps topics onto branches. Instagram has no branch dimension, so it cannot be drawn from social data.</div>
      ) : !heat.rows.length || !heat.cols.length ? (
        <div className="empty-note">Nothing tagged on a branch in this view.</div>
      ) : (
        <div className="heat-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th style={{ width: heat.cols.length > 4 ? '36%' : '44%' }}>Topic</th>
                {heat.cols.map((b) => <th key={b.id} style={{ textAlign: 'center' }} title={b.name}>{short(b.name)}</th>)}
              </tr>
            </thead>
            <tbody>
              {heat.rows.map((t) => (
                <tr key={t.key}>
                  <td className="name">
                    <span className={t.sev ? `tag s${t.sev}` : 'tag'} style={t.sev ? undefined : { background: '#E1F4F2', color: '#136E68', borderColor: '#BEE9E6' }}>{t.sev || '+'}</span> {t.label}
                  </td>
                  {heat.cols.map((b) => {
                    const v = t.of(b.name), a = v / heat.max;
                    const rgb = t.sev === 0 ? '31,140,132' : '200,50,43';
                    return (
                      <td key={b.id}>
                        <div className="cell" style={{ background: v ? `rgba(${rgb},${0.14 + 0.76 * a})` : '#EEF4F3', color: a > 0.45 ? '#fff' : '#8A93A6' }}>{v || '·'}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view.useG && heat.trimmed > 0 && (
        <div className="sub" style={{ marginTop: 10 }}>Showing the {HEAT_CAP} highest-volume branches in scope. {heat.trimmed} more hidden — narrow the scope to see them.</div>
      )}
    </div>
  );
}

function Exclusive({ rows }: { rows: TopicRow[] }) {
  return (
    <div className="panel mb">
      <PanelHead title="Which channel each problem arrives on" />
      <div className="p-note">Same ladder, two very different mixes. A topic that only appears on one channel is not absent from the other — it is invisible to it, and that is a monitoring gap rather than a good result.</div>
      <table>
        <thead>
          <tr><th>Topic</th><th className="n">Google</th><th className="n">Instagram</th><th className="n">Answered</th><th>Reads as</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = r.g + r.s;
            const only = r.g && !r.s ? 'Google only' : !r.g && r.s ? 'Instagram only' : 'Both channels';
            const note = only === 'Instagram only' ? 'Never appears in a branch review — this is only visible because someone reads the feed.'
              : only === 'Google only' ? 'Lives at the counter. Nobody posts it on the brand feed.'
              : 'Raised in both places, so it is a process issue rather than a channel quirk.';
            return (
              <tr key={r.id}>
                <td><span className={`tag s${r.sev}`}>{r.sev}</span> {r.label}</td>
                <td className="n">{r.g || '—'}</td>
                <td className="n">{r.s || '—'}</td>
                <td className="n" title={r.answered === null ? undefined : `${r.answered} of ${total} carry a public reply`}>
                  {r.answered ?? '—'}
                  {r.answered !== null && <span className="sub" style={{ display: 'inline', marginLeft: 4 }}>{total ? ((100 * r.answered) / total).toFixed(0) : 0}%</span>}
                </td>
                <td style={{ color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>{only}.</b> {note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- the language people use ---------- */
type LangMode = 'positive' | 'negative';
const LANG_MODES: [LangMode, string][] = [['positive', 'Positive words'], ['negative', 'Words inside complaints']];

function Language({ view, praise, terms: negative }: { view: View; praise: Praise; terms: ComplaintsResponse['terms_negative'] | undefined }) {
  const [mode, setMode] = useState<LangMode>('negative');
  const positive = mode === 'positive';
  const terms = useMemo(() => (positive
    ? praise.map((p) => ({ w: p.label, n: p.n }))
    : (negative ?? []).slice(0, 18).map((t) => ({ w: t.term, n: t.n }))
  ).sort((a, b) => b.n - a.n), [positive, praise, negative]);
  const config = useMemo((): ChartConfig<'bar'> => {
    const top = terms.slice(0, 9);
    return {
      type: 'bar',
      data: { labels: top.map((x) => x.w), datasets: [{ data: top.map((x) => x.n), backgroundColor: positive ? '#8ECFC8' : '#DFA9A5', borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
        scales: { x: { ...AXIS, beginAtZero: true, ticks: { precision: 0 } }, y: NOGRID },
      },
    };
  }, [terms, positive]);
  const max = Math.max(1, ...terms.map((x) => x.n)), min = Math.min(...terms.map((x) => x.n));
  /* Term counts come from the API, which narrows by one branch but not by an area. */
  const wide = !positive && view.isSet && !view.sel.branch;
  return (
    <div className="panel">
      <PanelHead title="The language people use" tag={`${terms.length} terms`} />
      <div className="p-note">Same words, two readings. The cloud carries the phrasing you would quote in a coaching session; the bars carry the counts you would put in a report.</div>
      <Chips options={LANG_MODES} value={mode} onPick={setMode} />
      {!view.useG ? (
        <div className="empty-note">Term frequency runs on Google review text. Switch the source back to include Google reviews.</div>
      ) : !terms.length ? (
        <div className="empty-note">No text on that side in this selection.</div>
      ) : (
        <>
          {wide && <div className="sim" style={{ marginBottom: 10 }}><span>⚠</span><span>These words are counted across every branch: the API narrows term counts by a single branch, not by {view.cur.level}.</span></div>}
          <div className="cloud">
            {terms.map((x) => {
              const t = (x.n - min) / Math.max(1, max - min);
              const color = positive ? (t > 0.66 ? T.deep : t > 0.33 ? '#2F8E86' : '#7FB8AE') : (t > 0.66 ? T.sig : t > 0.33 ? '#C96B64' : '#DFA9A5');
              return <span key={x.w} style={{ fontSize: 13 + t * 19, color }} title={`${x.n} mentions`}>{x.w}</span>;
            })}
          </div>
          <div style={{ marginTop: 14 }}><ChartBox config={config} size="sm" /></div>
          {positive && <Pending>Positive wording is shown as the tagged praise categories. A term count for positive text, like the one behind the complaint side, is not returned by the API yet.</Pending>}
        </>
      )}
    </div>
  );
}

function Praised({ view }: { view: View }) {
  const router = useRouter();
  const res = useApi<SignalBranchesResponse>(view.useG ? '/v1/signal/branches' : null, { ...view.sig, source: undefined });
  const pool = useMemo(() => toPoints(res.data)
    .filter((p) => p.enough)
    .map((p) => ({ ...p, share: Math.round((1000 * p.mix.good) / p.mix.total) / 10 }))
    .sort((a, b) => b.share - a.share).slice(0, 5), [res.data]);
  if (!view.useG) return <div className="empty-note">Branches are scored on Google reviews. Switch the source back to include them.</div>;
  if (!res.data) return <div className="empty-note">{res.error ? `Branch figures could not be loaded. ${res.error}` : 'Loading branch figures…'}</div>;
  if (!pool.length) return <div className="empty-note">No scored branch in this selection.</div>;
  return (
    <table>
      <tbody>
        {pool.map((p, i) => (
          <tr key={p.place.id} className="clickable" onClick={() => router.push(branchHref(p.place.id))}>
            <td className="n" style={{ width: 30 }}><span className="sub">#{i + 1}</span></td>
            <td><b>{p.place.name}</b><div className="sub">{p.place.kecamatan ?? p.place.kota ?? p.place.city}</div></td>
            <td className="n" style={{ width: 70 }}>{p.mix.good.toLocaleString('en-US')}<div className="sub">positive</div></td>
            <td className="n" style={{ width: 56 }}><b style={{ color: T.grow }}>{p.share}%</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

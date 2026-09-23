'use client';

import { useMemo } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { ApiPage, PanelHead } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useReference } from '@/lib/reference';
import { useScope, type Scope } from '@/lib/scope';
import { IG, T, sevColor } from '@/lib/theme';
import type { ComplaintTopic, ComplaintsResponse } from '@/lib/types';

export function ComplaintsView() {
  const { scope, params } = useScope('complaints');
  const res = useApi<ComplaintsResponse>('/v1/pages/complaints', params);
  const both = scope.useG && scope.useS && scope.branch === 'all';
  const topics = useMemo(() => (res.data?.topics ?? []).filter((t) => t.google + t.instagram > 0)
    .sort((x, y) => y.severity - x.severity || (y.google + y.instagram) - (x.google + x.instagram)), [res.data]);
  return (
    <ApiPage res={res}>
      {(d) => (
        <>
          <div className="grid g-58 mb">
            <div className="panel">
              <PanelHead title="What customers actually complain about" />
              <div className="p-note">Tagged from review text with an Indonesian keyword model that handles negation. Severity 4 covers conduct and regulatory exposure — field collection behaviour, repossession, alleged misappropriation of payments. Those are the ones that reach OJK and local media.</div>
              <TopicsChart rows={topics} scope={scope} />
            </div>
            <div className="panel">
              <PanelHead title="Where it concentrates" />
              <div className="p-note">One branch owning a topic is a coaching problem. A topic spread evenly is a process problem, and it belongs to head office.</div>
              {scope.useG
                ? <Heatmap d={d} />
                : <div className="empty-note">The heatmap maps topics onto branches. Instagram has no branch dimension, so it cannot be drawn from social data.</div>}
            </div>
          </div>
          {both && <Exclusive rows={topics} />}
          <div className="grid g-3">
            <div className="panel">
              <PanelHead title="Sentiment mix" />
              <div className="p-note">Star-anchored lexicon, Bahasa Indonesia.</div>
              <SentimentChart mix={d.sentiment_mix} useG={scope.useG} />
            </div>
            <div className="panel">
              <PanelHead title="Words inside complaints" />
              <div className="p-note">Stop-words removed, normalised.</div>
              {scope.useG
                ? <TermsChart rows={d.terms_negative} limit={9} color="#DFA9A5" />
                : <div className="empty-note">Term frequency runs on Google review text. Switch the source back to include Google reviews.</div>}
            </div>
            <div className="panel">
              <PanelHead title="What earns praise" />
              <div className="p-note">The coaching script for weak branches is already written by satisfied customers.</div>
              {scope.useG
                ? <TermsChart rows={d.praise_drivers} color="#8ECFC8" />
                : <div className="empty-note">Praise drivers are extracted from Google review text.</div>}
            </div>
          </div>
        </>
      )}
    </ApiPage>
  );
}

function TopicsChart({ rows, scope }: { rows: ComplaintTopic[]; scope: Scope }) {
  const config = useMemo((): ChartConfig<'bar'> => {
    const ds = [];
    if (scope.useG) ds.push({ label: 'Google reviews', data: rows.map((r) => r.google), backgroundColor: rows.map((r) => sevColor(r.severity)), borderRadius: 4, barThickness: 11 });
    if (scope.useS) ds.push({ label: 'Instagram', data: rows.map((r) => r.instagram), backgroundColor: IG, borderRadius: 4, barThickness: 11 });
    return {
      type: 'bar',
      data: { labels: rows.map((r) => r.label), datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { display: ds.length > 1, position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              title: (c) => rows[c[0].dataIndex].label,
              label: (c) => `${c.dataset.label}: ${c.parsed.x}`,
              afterBody: (c) => `severity ${rows[c[0].dataIndex].severity} · last seen ${rows[c[0].dataIndex].last_seen ?? '—'}`,
            },
          },
        },
        scales: {
          x: { ...AXIS, beginAtZero: true, ticks: { precision: 0, padding: 8 } },
          y: { ...NOGRID, ticks: { padding: 6, font: { size: 11.5 } } },
        },
      },
    };
  }, [rows, scope.useG, scope.useS]);
  if (!rows.length) return <div className="empty-note">No tagged complaints in this view.</div>;
  return <ChartBox config={config} size="lg" />;
}

function Heatmap({ d }: { d: ComplaintsResponse }) {
  const { topic } = useReference();
  const { branches, matrix } = d.topic_by_branch;
  const tp = matrix.slice(0, 8).map((m) => {
    const t = d.topics.find((x) => x.topic_id === m.topic_id);
    return { ...m, label: t?.label ?? topic(m.topic_id)?.label ?? m.topic_id, sev: t?.severity ?? topic(m.topic_id)?.severity ?? 1 };
  });
  if (!tp.length || !branches.length) return <div className="empty-note">No tagged complaints in this view.</div>;
  const max = Math.max(1, ...tp.flatMap((t) => t.counts));
  return (
    <table className="heat">
      <thead>
        <tr>
          <th style={{ width: '44%' }}>Topic</th>
          {branches.map((b) => <th key={b} className="n" style={{ textAlign: 'center' }} title={b}>{b.replace(/^FIFGROUP\s*-\s*/, '').slice(0, 8)}</th>)}
        </tr>
      </thead>
      <tbody>
        {tp.map((t) => (
          <tr key={t.topic_id}>
            <td className="name"><span className={`tag s${t.sev}`}>{t.sev}</span> {t.label}</td>
            {branches.map((b, i) => {
              const v = t.counts[i] || 0, a = v / max;
              return (
                <td key={b}>
                  <div className="cell" style={{ background: v ? `rgba(200,50,43,${0.14 + 0.76 * a})` : '#EEF4F3', color: a > 0.45 ? '#fff' : '#8A93A6' }}>
                    {v || '·'}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Exclusive({ rows }: { rows: ComplaintTopic[] }) {
  return (
    <div className="panel mb">
      <PanelHead title="Which channel each problem arrives on" />
      <div className="p-note">Same ladder, two very different mixes. A topic that only appears on one channel is not absent from the other — it is invisible to it, and that is a monitoring gap rather than a good result.</div>
      <table>
        <thead>
          <tr><th>Topic</th><th className="n">Google</th><th className="n">Instagram</th><th>Reads as</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const only = r.google && !r.instagram ? 'Google only' : !r.google && r.instagram ? 'Instagram only' : 'Both channels';
            const note = only === 'Instagram only'
              ? 'Never appears in a branch review — this is only visible because someone reads the feed.'
              : only === 'Google only'
                ? 'Lives at the counter. Nobody posts it on the brand feed.'
                : 'Raised in both places, so it is a process issue rather than a channel quirk.';
            return (
              <tr key={r.topic_id}>
                <td><span className={`tag s${r.severity}`}>{r.severity}</span> {r.label}</td>
                <td className="n">{r.google || '—'}</td>
                <td className="n">{r.instagram || '—'}</td>
                <td style={{ color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>{only}.</b> {note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SentimentChart({ mix, useG }: { mix: ComplaintsResponse['sentiment_mix']; useG: boolean }) {
  const config = useMemo((): ChartConfig<'doughnut'> => ({
    type: 'doughnut',
    data: {
      labels: ['Positive', 'Neutral', 'Negative', useG ? 'Rating or reaction only' : 'Reaction only'],
      datasets: [{
        data: [mix.positive, mix.neutral, mix.negative, mix.no_text_or_reaction],
        backgroundColor: [T.grow, T.hold, T.sig, '#D3DFDD'], borderColor: '#fff', borderWidth: 3, hoverOffset: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '66%',
      plugins: {
        legend: { position: 'right', labels: { padding: 11, font: { size: 11.5 } } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const t = (c.dataset.data as number[]).reduce((a, b) => a + b, 0);
              return `${c.label}: ${c.parsed} (${t ? ((100 * c.parsed) / t).toFixed(0) : 0}%)`;
            },
          },
        },
      },
    },
  }), [mix, useG]);
  return <ChartBox config={config} size="sm" />;
}

/** Horizontal term counts; rows carry either a `term` (negative terms) or a `label` (praise drivers). */
function TermsChart({ rows, limit, color }: { rows: { n: number; term?: string; label?: string }[]; limit?: number; color: string }) {
  const config = useMemo((): ChartConfig<'bar'> => {
    const top = rows.slice(0, limit);
    return {
      type: 'bar',
      data: { labels: top.map((t) => t.term ?? t.label ?? ''), datasets: [{ data: top.map((t) => t.n), backgroundColor: color, borderRadius: 4, barThickness: 13 }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
        scales: { x: { ...AXIS, beginAtZero: true, ticks: { precision: 0, padding: 8 } }, y: NOGRID },
      },
    };
  }, [rows, limit, color]);
  if (!rows.length) return <div className="empty-note">Nothing to show in this view.</div>;
  return <ChartBox config={config} size="sm" />;
}

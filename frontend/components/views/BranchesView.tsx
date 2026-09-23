'use client';

import { useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { ApiPage, EmptyRow, Metric, PanelHead, SortHead, type Col } from '@/components/ui';
import { useApi } from '@/lib/api';
import { nextSort, sortRows, useScope, type SortState } from '@/lib/scope';
import { STAR, T, riskColor } from '@/lib/theme';
import type { BranchRow, BranchesResponse } from '@/lib/types';

type BranchKey = keyof BranchRow & string;

const COLS: Col<BranchKey>[] = [
  ['branch', 'Branch', false], ['reviews_read', 'Read', true], ['coverage_pct', 'Coverage', true], ['avg_rating', 'Rating', true],
  ['complaint_rate_pct', 'Complaint rate', true], ['critical_high', 'Critical + high', true], ['conduct_flags', 'Conduct flags', true],
  ['oldest_open_days', 'Oldest open', true], ['rating_only_pct', 'Rating only', true], ['new_account_pct', 'New accounts', true], ['risk_score', 'Risk', true],
];

const alarm = (on: boolean | number) => (on ? { color: T.sig, fontWeight: 600 } : undefined);

export function BranchesView() {
  const { params } = useScope('branches');
  const res = useApi<BranchesResponse>('/v1/pages/branches', params);
  return (
    <ApiPage res={res}>
      {(d) => {
        const cov = d.rows.map((r) => r.coverage_pct);
        return (
          <>
            <BranchMetrics d={d} />
            <div className="panel mb">
              <PanelHead title="Branch league table" tag="click a column to sort" />
              <div className="p-note" style={{ color: '#8E5310' }}>This page reads Google reviews only. Instagram comments carry no branch, so the source filter does not apply here.</div>
              <div className="p-note">
                Coverage is the share of that branch&apos;s real Google review count captured in this scrape.{' '}
                {cov.length > 1 && Math.min(...cov) !== Math.max(...cov) ? `Because it ranges from ${Math.min(...cov)}% to ${Math.max(...cov)}%, compare` : 'Compare'} branches on rates, never on counts.
              </div>
              <BranchTable rows={d.rows} />
            </div>
            <div className="grid g-2">
              <div className="panel">
                <PanelHead title="Rating mix" />
                <div className="p-note">A branch with no one-star reviews is not necessarily healthy. A branch whose one-star reviews repeat the same topic is definitely not.</div>
                <StarsChart rows={d.rows} />
              </div>
              <div className="panel">
                <PanelHead title="Sample coverage" />
                <div className="p-note">Grey is what exists on Google. Dark is what this prototype has read. Closing this gap is the first job of the production pipeline.</div>
                <CoverageChart rows={d.rows} />
              </div>
            </div>
          </>
        );
      }}
    </ApiPage>
  );
}

function BranchMetrics({ d }: { d: BranchesResponse }) {
  const { highest_risk: worst, lowest_risk: best, complaint_rate_spread_pts: spread, coverage_pct: cov } = d.summary;
  const worstRate = d.rows.find((r) => r.branch === worst?.branch)?.complaint_rate_pct ?? 0;
  const read = d.rows.reduce((a, r) => a + r.reviews_read, 0);
  const total = d.rows.reduce((a, r) => a + r.reviews_universe, 0);
  return (
    <div className="grid g-4 mb">
      <Metric k="Highest risk" v={worst?.branch ?? '–'} n={`score ${worst?.risk_score ?? 0} · ${worstRate}% of reviews are complaints`} />
      <Metric k="Lowest risk" v={best?.branch ?? '–'} n={`score ${best?.risk_score ?? 0} · use as the coaching benchmark`} />
      <Metric k="Spread in complaint rate" v={spread.toFixed(1) + ' pts'} n="between best and worst branch — this is a management gap, not noise" />
      <Metric k="Sample coverage" v={cov.toFixed(1) + '%'} n={`${read} of ${total} Google reviews read`} />
    </div>
  );
}

function BranchTable({ rows }: { rows: BranchRow[] }) {
  const [sort, setSort] = useState<SortState<BranchKey>>(['risk_score', 'desc']);
  return (
    <div className="t-scroll">
      <table>
        <SortHead cols={COLS} sort={sort} onSort={(f) => setSort((s) => nextSort(s, f))} />
        <tbody>
          {rows.length ? sortRows(rows, sort).map((r) => {
            const c = riskColor(r.risk_score);
            return (
              <tr key={r.branch_id}>
                <td><b>{r.branch}</b><div className="sub">{[r.city, r.province].filter(Boolean).join(', ')}</div></td>
                <td className="n">{r.reviews_read}<div className="sub">of {r.reviews_universe}</div></td>
                <td className="n">{r.coverage_pct}%</td>
                <td className="n" style={alarm(r.avg_rating !== null && r.avg_rating < 4)}>{r.avg_rating?.toFixed(2) ?? '—'}</td>
                <td className="n" style={alarm(r.complaint_rate_pct > 15)}>{r.complaint_rate_pct}%</td>
                <td className="n">{r.critical_high}</td>
                <td className="n" style={alarm(r.conduct_flags)}>{r.conduct_flags || '—'}</td>
                <td className="n">{r.oldest_open_days}d</td>
                <td className="n">{r.rating_only_pct}%</td>
                <td className="n">{r.new_account_pct}%</td>
                <td className="n">
                  <b style={{ color: c }}>{r.risk_score}</b>
                  <div className="meter" style={{ marginTop: 5 }}><i style={{ width: `${r.risk_score}%`, background: c }} /></div>
                </td>
              </tr>
            );
          }) : <EmptyRow colSpan={COLS.length}>No branch reviews in this view.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

function StarsChart({ rows }: { rows: BranchRow[] }) {
  const config = useMemo((): ChartConfig<'bar'> => {
    const bl = [...rows].sort((a, b) => a.branch.localeCompare(b.branch));
    const mat = bl.map((b) => [1, 2, 3, 4, 5].map((s) => b.rating_mix[s] ?? 0));
    return {
      type: 'bar',
      data: {
        labels: bl.map((b) => b.branch),
        datasets: [1, 2, 3, 4, 5].map((s, i) => ({
          label: s + '★', data: mat.map((m) => m[i]), backgroundColor: STAR[i], stack: 'a', borderRadius: 2, barThickness: 24,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              label: (c) => {
                const t = mat[c.dataIndex].reduce((a, b) => a + b, 0);
                const x = c.parsed.x ?? 0;
                return `${c.dataset.label} — ${x} (${t ? ((100 * x) / t).toFixed(0) : 0}%)`;
              },
            },
          },
        },
        scales: { x: { ...AXIS, stacked: true, beginAtZero: true }, y: { ...NOGRID, stacked: true } },
      },
    };
  }, [rows]);
  if (!rows.length) return <div className="empty-note">No branch reviews in this view.</div>;
  return <ChartBox config={config} />;
}

function CoverageChart({ rows }: { rows: BranchRow[] }) {
  const config = useMemo((): ChartConfig<'bar'> => {
    const b = [...rows].sort((x, y) => y.reviews_universe - x.reviews_universe);
    return {
      type: 'bar',
      data: {
        labels: b.map((x) => x.branch),
        datasets: [
          { label: 'Read', data: b.map((x) => x.reviews_read), backgroundColor: T.deep, borderRadius: 4, barThickness: 16 },
          { label: 'Not read', data: b.map((x) => Math.max(0, x.reviews_universe - x.reviews_read)), backgroundColor: '#D6E5E3', borderRadius: 4, barThickness: 16 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: { callbacks: { afterBody: (c) => `coverage ${b[c[0].dataIndex].coverage_pct}%` } },
        },
        scales: { x: { ...AXIS, stacked: true, beginAtZero: true }, y: { ...NOGRID, stacked: true } },
      },
    };
  }, [rows]);
  if (!rows.length) return <div className="empty-note">No branch reviews in this view.</div>;
  return <ChartBox config={config} />;
}

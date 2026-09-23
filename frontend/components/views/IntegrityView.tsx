'use client';

import { useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { ApiPage, EmptyRow, Metric, PanelHead, SortHead, type Col } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useReference } from '@/lib/reference';
import { nextSort, sortRows, useScope, type SortState } from '@/lib/scope';
import { T, plural } from '@/lib/theme';
import type { CollectionDay, IntegrityResponse } from '@/lib/types';

type BurstKey = keyof CollectionDay & string;

const BURST_COLS: Col<BurstKey>[] = [['date', 'Date', false], ['branch', 'Branch', false], ['n', 'Reviews', true], ['avg', 'Rating', true], ['notext', 'Wordless', true]];
const inHours = (h: number) => h >= 8 && h <= 16;

export function IntegrityView() {
  const { scope, params } = useScope('integrity');
  const res = useApi<IntegrityResponse>('/v1/pages/integrity', params);
  return (
    <ApiPage res={res}>
      {(d) => (
        <>
          {scope.useG && <GoogleSummary g={d.google} />}
          {scope.useS && <InstagramIntegrity ig={d.instagram} />}
          {scope.useG && (
            <div className="grid g-2">
              <div className="panel">
                <PanelHead title="Suspected collection days" />
                <div className="p-note">Days where a single branch gathered five or more reviews averaging 4.5 stars or better. Campaigns are not misconduct, but they inflate the public score and bury complaint trends, so they have to be separated from organic volume.</div>
                <Bursts rows={d.google.collection_days} />
              </div>
              <div className="panel">
                <PanelHead title="Hour a review was posted" />
                <div className="p-note">Reviews written at home scatter across the evening. Reviews collected at the service counter cluster inside operating hours, which is what this chart shows.</div>
                <HourChart hours={d.google.posting_hours} />
              </div>
            </div>
          )}
        </>
      )}
    </ApiPage>
  );
}

function GoogleSummary({ g }: { g: IntegrityResponse['google'] }) {
  const big = g.collection_days[0];
  return (
    <>
      <div className="panel mb" style={{ borderColor: '#EFD7D4' }}>
        <PanelHead title="The public score is a collection artefact" />
        <p className="p-note" style={{ marginBottom: 0 }}>
          In this view, {g.five_star_pct.toFixed(0)}% of reviews are five stars,{' '}
          {g.no_text_pct.toFixed(0)}% carry no text at all, {g.first_time_account_pct.toFixed(0)}% come from accounts holding one review or fewer in their lifetime,{' '}
          and {Math.round(g.office_hours_pct)}% were posted inside branch operating hours.{' '}
          {big ? `${big.branch} collected ${big.n} reviews on ${big.date} alone, ${big.notext} of them wordless. ` : ''}
          Treat the public average as a measure of how hard a branch asks, and judge service on the complaint side instead.
        </p>
      </div>
      <div className="grid g-4 mb">
        <Metric k="Five-star share" v={g.five_star_pct.toFixed(0) + '%'} n="of reviews in this view" />
        <Metric k="No text" v={g.no_text_pct.toFixed(0) + '%'} n="a tap, not a review" />
        <Metric k="One-review accounts" v={g.first_time_account_pct.toFixed(0) + '%'} n="created or used once" />
        <Metric k="Repeat reviewers found" v={g.repeat_reviewers} n="Google permits one review per account per place" />
      </div>
    </>
  );
}

function Bursts({ rows }: { rows: CollectionDay[] }) {
  const [sort, setSort] = useState<SortState<BurstKey>>(['n', 'desc']);
  return (
    <div className="t-scroll" style={{ maxHeight: 340 }}>
      <table>
        <SortHead cols={BURST_COLS} sort={sort} onSort={(f) => setSort((s) => nextSort(s, f))} />
        <tbody>
          {rows.length ? sortRows(rows, sort).map((r) => (
            <tr key={r.branch + r.date}>
              <td className="mono">{r.date}</td>
              <td>{r.branch}</td>
              <td className="n"><b>{r.n}</b></td>
              <td className="n">{r.avg?.toFixed(2)}</td>
              <td className="n">
                {r.notext}
                <span className="sub" style={{ display: 'inline', marginLeft: 4 }}>{((100 * r.notext) / Math.max(1, r.n)).toFixed(0)}%</span>
              </td>
            </tr>
          )) : <EmptyRow colSpan={5}>No collection days detected in this view.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

function HourChart({ hours }: { hours: number[] }) {
  const config = useMemo((): ChartConfig<'bar'> => ({
    type: 'bar',
    data: {
      labels: [...Array(24).keys()].map((h) => String(h).padStart(2, '0')),
      datasets: [{ data: hours, borderRadius: 3, backgroundColor: hours.map((_, h) => (inHours(h) ? T.brand : '#D3DFDD')) }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (c) => c[0].label + ':00 WIB',
            label: (c) => c.parsed.y + ' reviews' + (inHours(c.dataIndex) ? ' · operating hours' : ''),
          },
        },
      },
      scales: { x: NOGRID, y: { ...AXIS, beginAtZero: true } },
    },
  }), [hours]);
  return <ChartBox config={config} />;
}

function InstagramIntegrity({ ig }: { ig: IntegrityResponse['instagram'] }) {
  const posts = useReference().source('instagram')?.posts;
  const dup = ig.duplicate_sets;
  return (
    <div className="panel mb">
      <PanelHead title="Coordinated posting on Instagram" />
      <div className="p-note">The equivalent question on social is not whether ratings were farmed, but whether a complaint is one person or a campaign wearing several accounts.</div>
      <div className="grid g-4 mb">
        <Metric k="Identical comment sets" v={dup.length} n="same text, different accounts" />
        <Metric k="Accounts involved" v={ig.accounts_involved} n="posted within minutes of each other" />
        <Metric k="Reaction-only comments" v={ig.reaction_only_comments} n="emoji with no words, the social echo of a bare star" />
        <Metric k="Threads read" v={ig.threads_read} n={posts != null ? `from ${posts} ${plural(posts, 'post', 'posts')}` : 'on the official account'} />
      </div>
      {dup.length ? (
        <table>
          <thead>
            <tr><th>Text posted more than once</th><th className="n">Accounts</th><th>Handles</th></tr>
          </thead>
          <tbody>
            {dup.map((dd, i) => (
              <tr key={i}>
                <td><div className="quote" style={{ whiteSpace: 'pre-wrap' }}>{dd.text}</div></td>
                <td className="n"><b>{dd.n}</b></td>
                <td>{dd.users?.map((u, j) => <span key={u}>{j > 0 && <br />}@{u}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty-note">No duplicated comment text in this window.</div>}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { ApiPage, Bridge, EmptyRow, Metric, PanelHead, SortHead, type Col } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useReference } from '@/lib/reference';
import { nextSort, sortRows, useView, type SortState, type View } from '@/lib/scope';
import { dupCount, dupUsers } from '@/lib/social';
import { T, plural } from '@/lib/theme';
import type { CollectionDay, IntegrityResponse, SignalOverviewResponse } from '@/lib/types';

type BurstKey = keyof CollectionDay & string;

const BURST_COLS: Col<BurstKey>[] = [['date', 'Date', false], ['branch', 'Branch', false], ['n', 'Reviews', true], ['avg', 'Rating', true], ['notext', 'Wordless', true]];
const inHours = (h: number) => h >= 8 && h <= 16;

export function IntegrityView() {
  const view = useView('integrity');
  const res = useApi<IntegrityResponse>('/v1/pages/integrity', view.params);
  /* Collection days and posting hours come precomputed, and the API narrows them by one branch only. */
  const wide = view.isSet && !view.sel.branch;
  const bursts = useMemo(() => {
    const names = wide ? new Set(view.places.map((p) => p.name)) : null;
    return (res.data?.google.collection_days ?? []).filter((r) => !names || names.has(r.branch));
  }, [res.data, wide, view.places]);
  /* The shares at the top follow the scope at every level, which the integrity payload cannot. */
  const collection = useApi<SignalOverviewResponse>(view.useG ? '/v1/signal/overview' : null, { ...view.sig, source: 'google' }).data?.collection;
  return (
    <ApiPage res={res}>
      {(d) => (
        <>
          {view.useG && <GoogleSummary c={collection} g={d.google} big={bursts[0]} wide={wide} />}
          {view.useS && <InstagramIntegrity view={view} ig={d.instagram} />}
          {view.useG && (
            <div className="grid g-2 mb">
              <div className="panel">
                <PanelHead title="Suspected collection days" />
                <div className="p-note">Days where a single branch gathered five or more reviews averaging 4.5 stars or better. Campaigns are not misconduct, but they inflate the public score and bury complaint trends, so they have to be separated from organic volume.</div>
                <Bursts rows={bursts} />
              </div>
              <div className="panel">
                <PanelHead title="Hour a review was posted" />
                <div className="p-note">Reviews written at home scatter across the evening. Reviews collected at the service counter cluster inside operating hours, which is what this chart shows.</div>
                {wide && <div className="sim" style={{ marginBottom: 10 }}><span>⚠</span><span>Posting hours cover every branch: the API narrows them by a single branch, not by {view.cur.level}.</span></div>}
                <HourChart hours={d.google.posting_hours} />
              </div>
            </div>
          )}
          <Bridge from="integrity" />
        </>
      )}
    </ApiPage>
  );
}

function GoogleSummary({ c, g, big, wide }: { c: SignalOverviewResponse['collection'] | undefined; g: IntegrityResponse['google']; big: CollectionDay | undefined; wide: boolean }) {
  /* Until the scoped figures arrive, the payload's own unscoped ones stand in. */
  const five = (c?.five_star_pct ?? g.five_star_pct).toFixed(0);
  const one = (c?.one_star_pct ?? g.one_star_pct).toFixed(0);
  const notext = (c?.no_text_pct ?? g.no_text_pct).toFixed(0);
  const firstTime = (c?.first_time_account_pct ?? g.first_time_account_pct).toFixed(0);
  return (
    <>
      <div className="panel mb" style={{ borderColor: '#EFD7D4' }}>
        <PanelHead title="The public score is a collection artefact" />
        <p className="p-note" style={{ marginBottom: 0 }}>
          In this view, {five}% of reviews are five stars against {one}% at one star,{' '}
          {notext}% carry no text at all, {firstTime}% come from accounts holding one review or fewer in their lifetime,{' '}
          and {Math.round(g.office_hours_pct)}% were posted inside branch operating hours{wide ? ' across all branches' : ''}.{' '}
          {big ? `${big.branch} collected ${big.n} reviews on ${big.date} alone, ${big.notext} of them wordless. ` : ''}
          Treat the public average as a measure of how hard a branch asks, and judge service on the complaint side instead.
        </p>
      </div>
      <div className="grid g-4 mb">
        <Metric k="Five-star share" v={five + '%'} n={`against ${one}% at one star`} />
        <Metric k="No text" v={notext + '%'} n="a tap, not a review" />
        <Metric k="One-review accounts" v={firstTime + '%'} n="created or used once" />
        <Metric k="Repeat reviewers found" v={g.repeat_reviewers} n="Google permits one review per account per place" />
      </div>
      <Flags
        label="What the integrity scan flagged on Google"
        items={[['Spam', g.spam_count], ['Duplicate text', g.duplicate_count], ['Suspicious accounts', g.suspicious_accounts], ['Reviews flagged', g.flagged_reviews.length]]}
      />
    </>
  );
}

/** Counters the API returns whether or not anything was found; a row of zeroes is the useful answer. */
function Flags({ label, items }: { label: string; items: [string, number][] }) {
  const hits = items.filter(([, n]) => n > 0);
  return (
    <div className="p-note mb">
      <b>{label}:</b>{' '}
      {hits.length
        ? items.map(([k, n], i) => <span key={k}>{i > 0 && ' · '}{k} <b style={{ color: n > 0 ? T.sig : undefined }}>{n}</b></span>)
        : `nothing on any of ${items.length} checks (${items.map(([k]) => k.toLowerCase()).join(', ')}).`}
    </div>
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

function InstagramIntegrity({ view, ig }: { view: View; ig: IntegrityResponse['instagram'] }) {
  const posts = useReference().source('instagram')?.posts;
  const dup = ig.duplicate_sets;
  return (
    <div className="panel mb">
      <PanelHead title="Coordinated posting on Instagram" />
      <div className="p-note">The equivalent question on social is not whether ratings were farmed, but whether a complaint is one person or a campaign wearing several accounts.</div>
      {view.isSet && (
        <div className="sim" style={{ marginBottom: 12 }}>
          <span>⚠</span>
          <span>The Google panels on this page are scoped to <b>{view.scopeName}</b>. This one is not — Instagram comments carry no area, so it keeps showing all {ig.threads_read} threads.</span>
        </div>
      )}
      <div className="grid g-4 mb">
        <Metric k="Identical comment sets" v={dup.length} n="same text, different accounts" />
        <Metric k="Accounts involved" v={ig.accounts_involved} n="posted within minutes of each other" />
        <Metric k="Reaction-only comments" v={ig.reaction_only_comments} n="emoji with no words, the social echo of a bare star" />
        <Metric k="Threads read" v={ig.threads_read} n={posts != null ? `from ${posts} ${plural(posts, 'post', 'posts')}` : 'on the official account'} />
      </div>
      <Flags
        label="What the integrity scan flagged on Instagram"
        items={[['Spam', ig.spam_count], ['Duplicate comments', ig.duplicate_count], ['Suspicious accounts', ig.suspicious_accounts]]}
      />
      {dup.length ? (
        <table>
          <thead>
            <tr><th>Text posted more than once</th><th className="n">Accounts</th><th>Handles</th></tr>
          </thead>
          <tbody>
            {dup.map((dd, i) => (
              <tr key={i}>
                <td><div className="quote" style={{ whiteSpace: 'pre-wrap' }}>{dd.text}</div></td>
                <td className="n"><b>{dupCount(dd)}</b></td>
                <td>{dupUsers(dd).map((u, j) => <span key={u + j}>{j > 0 && <br />}@{u.replace(/^@/, '')}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty-note">No duplicated comment text in this window.</div>}
    </div>
  );
}

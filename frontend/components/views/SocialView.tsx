'use client';

import { Fragment, useMemo, useState } from 'react';
import { AXIS, ChartBox, NOGRID, type ChartConfig } from '@/components/ChartBox';
import { ApiPage, Chip, Metric, PanelHead, Tags } from '@/components/ui';
import { useApi, type Params } from '@/lib/api';
import { useReference } from '@/lib/reference';
import { useScope } from '@/lib/scope';
import { T, plural, sevColor } from '@/lib/theme';
import type { IntegrityResponse, SocialResponse, SocialThread } from '@/lib/types';

type SocFilter = 'all' | 'critical' | 'high' | 'medium' | 'unanswered';

const CHIPS: [SocFilter, string][] = [['all', 'All threads'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['unanswered', 'Unanswered']];
const DOXING = ['doxing_sebar_data_pribadi', 'Doxing & Sebar Data Pribadi'];
const isOpenComplaint = (t: SocialThread) => t.is_complaint && !t.brand_replied;

export function SocialView() {
  const { params } = useScope('social');
  const res = useApi<SocialResponse>('/v1/pages/social', params);
  const [filter, setFilter] = useState<SocFilter>('all');
  const { source } = useReference();
  const ig = source('instagram');

  return (
    <ApiPage res={res}>
      {(d) => {
        const S = d.summary;
        const threads = d.threads;
        const counts: Record<SocFilter, number> = {
          all: threads.length,
          critical: threads.filter((t) => t.priority === 'critical').length,
          high: threads.filter((t) => t.priority === 'high').length,
          medium: threads.filter((t) => t.priority === 'medium').length,
          unanswered: threads.filter(isOpenComplaint).length,
        };
        const list = filter === 'unanswered' ? threads.filter(isOpenComplaint)
          : filter === 'all' ? threads : threads.filter((t) => t.priority === filter);
        return (
          <>
            <div className="grid g-4 mb">
              <Metric k="Threads" v={S.threads} n={`${S.root_comments} comments, ${S.replies_captured} replies read`} />
              <Metric k="Complaint threads" v={S.complaint_threads} n={`${S.conduct_level} at conduct and regulatory level`} />
              <Metric k="Answered by the brand" v={S.brand_reply_rate_pct + '%'} n={`${S.unanswered} complaints never got a public reply`} />
              <Metric k="Median first response" v={S.median_first_response_h != null ? S.median_first_response_h + 'h' : '—'}
                n={S.max_first_response_h != null ? `slowest answer took ${Math.round(S.max_first_response_h / 24)} days` : 'no brand answers yet'} />
            </div>

            <DataAlert threads={threads} params={params} />

            <div className="grid g-58 mb">
              <div className="panel">
                <PanelHead title="Conversation threads" tag={`${list.length} of ${threads.length} shown`} />
                <div className="p-note">A thread is the comment plus everything written under it, scored as one case. Replies from <b>{ig?.handle ?? 'the brand account'}</b> are marked. When customers keep piling in after the brand has replied, the thread stays open.</div>
                <div className="chips">
                  {CHIPS.map(([k, label]) => (
                    <button key={k} className={filter === k ? 'on' : undefined} onClick={() => setFilter(k)}>
                      {label} <span style={{ opacity: 0.6 }}>{counts[k] || 0}</span>
                    </button>
                  ))}
                </div>
                <div>
                  {list.length ? list.map((t, i) => <ThreadCard key={t.id ?? i} t={t} />) : <div className="empty">No threads match this filter.</div>}
                </div>
              </div>
              <div>
                <div className="panel mb">
                  <PanelHead title="Response performance" />
                  <div className="p-note">Complaints that got a public answer, and how long people waited.</div>
                  <FunnelChart funnel={d.response_funnel} />
                  <LatencyTable threads={threads} />
                </div>
                <div className="panel">
                  <PanelHead title="Capture quality" />
                  <div className="p-note">
                    The scraper read <b>{S.replies_captured} of {S.replies_declared} declared replies</b>, and cut {S.truncated_threads} threads short.{' '}
                    It also returned {S.reattached_brand_replies} brand {plural(S.reattached_brand_replies, 'answer', 'answers')} as a top-level comment because the text opens with a mention; the pipeline reattaches those, otherwise the reply rate reads lower than it is.{' '}
                    {ig?.posts != null && <>Everything here comes from <b>{ig.posts} {plural(ig.posts, 'post', 'posts')}</b> — enough to prove the model, not enough to trend.</>}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid g-2">
              <div className="panel">
                <PanelHead title="Topics raised, and whether anyone answered" />
                <div className="p-note">Same severity ladder as the branch reviews, plus one category that only exists on social.</div>
                <TopicsChart topics={d.topics} />
              </div>
              <div className="panel">
                <PanelHead title="When comments arrive" />
                <div className="p-note">Comments keep landing on this post months after it was published. A social post is not an event, it is a standing inbox.</div>
                <WeeklyChart weekly={d.weekly} />
              </div>
            </div>
          </>
        );
      }}
    </ApiPage>
  );
}

/** Shown only when threads publish staff personal data; duplicate sets come from the integrity endpoint. */
function DataAlert({ threads, params }: { threads: SocialThread[]; params: Params }) {
  const dox = threads.filter((t) => t.topics?.some((x) => DOXING.includes(x)));
  const dup = useApi<IntegrityResponse>(dox.length ? '/v1/pages/integrity' : null, params).data?.instagram.duplicate_sets[0];
  if (!dox.length) return null;
  const answered = dox.filter((t) => t.brand_replied).length;
  return (
    <div className="warn-strip mb">
      <h4>Personal data of named staff is sitting on FIF&apos;s own post</h4>
      <p>
        {dox.length} {plural(dox.length, 'comment publishes', 'comments publish')} an employee&apos;s personal data and call on readers to report them.{' '}
        {dup?.users?.length ? (
          <>
            {dup.users.length} are word-for-word identical, posted from{' '}
            {dup.users.map((u, i) => <Fragment key={u}>{i > 0 && ' and '}<b>@{u}</b></Fragment>)},{' '}
            which is a coordinated posting pattern rather than an individual complaint.{' '}
          </>
        ) : null}
        {answered ? `${answered} of them ${plural(answered, 'has', 'have')} a brand reply. ` : 'None has been answered or removed. '}
        This is a moderation and legal matter before it is a customer experience one: the exposure risk under UU PDP belongs to FIF as the account owner, not to whoever wrote the comment.{' '}
        Phone numbers, ID numbers and dates of birth are masked in this dashboard at ingestion — a tool that flags a data leak should not reproduce it.
      </p>
    </div>
  );
}

function ThreadCard({ t }: { t: SocialThread }) {
  const replies = t.replies ?? [];
  return (
    <div className={t.priority === 'critical' ? 'thread crit' : 'thread'}>
      <div className="th-head">
        <div className="body">
          <div className="th-meta">
            {t.criticality ? <Chip priority={t.priority} /> : null}
            <b>@{t.user}</b><span>{t.ts}</span>
            {t.likes ? <span>{t.likes} likes</span> : null}
            {t.captured ? <span>{t.captured} {t.captured === 1 ? 'reply' : 'replies'}</span> : null}
            {t.brand_replied
              ? <span className="badge-brand">ANSWERED</span>
              : t.is_complaint ? <Chip priority="critical">no reply</Chip> : null}
            {t.pile_on && <Chip priority="high">pile-on</Chip>}
            {t.truncated && <Chip priority="low">{t.declared - t.captured} replies not captured</Chip>}
          </div>
          <div className="th-text">{t.text}</div>
          <div style={{ marginTop: 7 }}><Tags topics={t.topics} /></div>
        </div>
        <div className="th-score" style={{ color: t.criticality >= 78 ? T.sig : t.criticality >= 60 ? T.warn : 'var(--ink-3)' }}>
          {t.criticality || '—'}
        </div>
      </div>
      {replies.length > 0 && (
        <div className="replies">
          {replies.map((r, i) => (
            <div key={i} className={r.is_brand ? 'reply brand' : 'reply'}>
              <div className="who">@{r.user}{r.is_brand && <span className="badge-brand">FIF</span>}<span className="stamp">{r.ts}</span></div>
              <div className="th-text" style={{ fontSize: 12.5 }}>{r.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: SocialResponse['response_funnel'] }) {
  const config = useMemo((): ChartConfig<'bar'> => ({
    type: 'bar',
    data: {
      labels: ['Complaints', 'Answered', 'No follow-up'],
      datasets: [{ data: [funnel.complaints, funnel.answered, funnel.no_followup], backgroundColor: [T.sig, T.warn, T.grow], borderRadius: 4, barThickness: 16 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
      scales: { x: { ...AXIS, beginAtZero: true, ticks: { precision: 0, padding: 8 } }, y: NOGRID },
    },
  }), [funnel]);
  return <ChartBox config={config} size="xs" />;
}

function LatencyTable({ threads }: { threads: SocialThread[] }) {
  const lat = threads.filter((t) => t.latency_h != null).sort((a, b) => b.latency_h! - a.latency_h!);
  return (
    <table style={{ marginTop: 14 }}>
      <thead>
        <tr><th>Answered thread</th><th className="n">Waited</th></tr>
      </thead>
      <tbody>
        {lat.length ? lat.map((t, i) => {
          const h = t.latency_h!;
          return (
            <tr key={t.id ?? i}>
              <td>@{t.user}<div className="sub">{(t.text ?? '').replace(/\n+/g, ' ').slice(0, 44)}…</div></td>
              <td className="n" style={h > 24 ? { color: T.sig } : undefined}>{h < 24 ? h + 'h' : Math.round(h / 24) + 'd'}</td>
            </tr>
          );
        }) : <tr><td colSpan={2}><div className="empty">No answered threads yet.</div></td></tr>}
      </tbody>
    </table>
  );
}

function TopicsChart({ topics: tp }: { topics: SocialResponse['topics'] }) {
  const config = useMemo((): ChartConfig<'bar'> => ({
    data: {
      labels: tp.map((t) => t.topic),
      datasets: [
        { type: 'bar', label: 'Answered', data: tp.map((t) => t.answered), backgroundColor: T.grow, stack: 'a', borderRadius: 3, barThickness: 16 },
        { type: 'bar', label: 'No reply', data: tp.map((t) => t.n - t.answered), stack: 'a', borderRadius: 3, barThickness: 16,
          backgroundColor: tp.map((t) => sevColor(t.sev)) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: { callbacks: { afterBody: (c) => `severity ${tp[c[0].dataIndex].sev} · last seen ${tp[c[0].dataIndex].last}` } },
      },
      scales: {
        x: { ...AXIS, stacked: true, beginAtZero: true, ticks: { precision: 0, padding: 8 } },
        y: { ...NOGRID, stacked: true, ticks: { padding: 6, font: { size: 11 } } },
      },
    },
  }), [tp]);
  if (!tp.length) return <div className="empty-note">No Instagram topics in this view.</div>;
  return <ChartBox config={config} />;
}

function WeeklyChart({ weekly: w }: { weekly: SocialResponse['weekly'] }) {
  const config = useMemo((): ChartConfig<'bar'> => ({
    data: {
      labels: w.map((x) => x.week),
      datasets: [
        { type: 'bar', label: 'Comments', data: w.map((x) => x.n), backgroundColor: '#D6E5E3', borderRadius: 3 },
        { type: 'bar', label: 'Complaints', data: w.map((x) => x.comp), backgroundColor: T.sig, borderRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end' } },
      scales: { x: NOGRID, y: { ...AXIS, beginAtZero: true, ticks: { precision: 0 } } },
    },
  }), [w]);
  if (!w.length) return <div className="empty-note">No Instagram comments in this view.</div>;
  return <ChartBox config={config} />;
}

'use client';

import { PanelHead } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useReference } from '@/lib/reference';
import { plural } from '@/lib/theme';
import type { ComplaintsResponse, ConfigResponse, SocialResponse } from '@/lib/types';

/** Fallback wording per level when the config ladder carries no description. */
const COVERS: Record<number, string> = {
  4: 'Field collection conduct, repossession, alleged misappropriation of payments',
  3: 'Staff conduct, service failure, unreachable officers',
  2: 'Credit process, survey, fees and interest, waiting time, systems',
  1: 'Facilities and comfort',
};

const ROADMAP = [
  ['Official API instead of scraping', 'The Google Business Profile API returns reviews and lets us post replies from inside this dashboard. It also removes the block risk that comes with scraping five hundred branches.'],
  ['Full history and daily sync', 'A daily incremental pull with change capture, so the trend line is real and a new one-star review appears here the same day it is posted.'],
  ['Classifier instead of keywords', "An LLM classifier with a labelled gold set and a monitored accuracy floor, mapped onto FIF's existing complaint category codes rather than a taxonomy we invented."],
  ['Normalisation by portfolio', 'Complaints per thousand active contracts per branch. A branch with four thousand customers and eight complaints is not the same as one with four hundred.'],
  ['Case ownership and SLA', 'Assignment, status, reply time against target. Without this the queue is a list, not a workflow.'],
  ['Social feed on the same model', 'One queue for Google and social, one taxonomy, one score.'],
];

/** The Google scoring components and their ranges, read from the live config. */
function scoringModel(s: ConfigResponse['scoring']['google']) {
  const reach = s.reach.local_guide + s.reach.lifetime_reviews_max + s.reach.photo;
  return [
    ['Topic severity', `0–${4 * s.severity_x}`, 'Conduct and regulatory topics carry the most weight'],
    ['Rating severity', `0–${Math.max(...Object.values(s.rating))}`, 'One star outranks three'],
    ['Recency', `0–${s.recency_max}`, `A complaint from last week beats one from last year; decays ${s.recency_decay_per_30d} per 30 days`],
    ['Reviewer reach', `0–${reach}`, `Local Guide ${s.reach.local_guide}, photo ${s.reach.photo}, lifetime reviews ÷ ${s.reach.lifetime_reviews_div} capped at ${s.reach.lifetime_reviews_max}`],
    ['No public reply', String(s.unanswered), 'Every unanswered case gains a fixed penalty'],
  ];
}

/** Instagram is scored on its own dimensions; the API sends them as a flat record, so label what we recognise. */
const IG_SCORE_LABEL: Record<string, string> = {
  severity_x: 'Topic severity multiplier',
  negative: 'Negative sentiment',
  recency_max: 'Recency ceiling',
  recency_decay_per_day: 'Recency decay per day',
  reach_max: 'Reach ceiling',
  thread_heat_per_reply: 'Thread heat per reply',
  thread_heat_max: 'Thread heat ceiling',
  pile_on: 'Pile-on',
  unanswered: 'No brand reply',
  answered_no_followup_multiplier: 'Answered but no follow-up (multiplier)',
};

export function MethodView() {
  const { config, meta, source } = useReference();
  const google = source('google'), ig = source('instagram');
  const topics = useApi<ComplaintsResponse>('/v1/pages/complaints', { source: 'all' }).data?.topics;
  const social = useApi<SocialResponse>('/v1/pages/social', { source: 'all' }).data?.summary;
  const found = (sev: number) => topics?.filter((t) => t.severity === sev).reduce((a, t) => a + t.google + t.instagram, 0);
  const covers = (level: number) => config?.severity_ladder.find((s) => s.level === level)?.description ?? COVERS[level];

  /** What the taxonomy carries at a level, as opposed to what was actually found in the data. */
  const taxonomy = (level: number) => {
    const at = (config?.topics ?? []).filter((t) => t.severity === level);
    return {
      topics: at.length,
      keywords: at.reduce((a, t) => a + (t.keyword_count ?? 0), 0),
      names: at.map((t) => `${t.label} (${t.channels.join(', ')})`).join('\n'),
    };
  };

  const limits = [
    [ig?.posts != null ? `${ig.posts} ${plural(ig.posts, 'post', 'posts')} in the scrape` : 'Posts in the scrape', 'No post-level comparison and no reliable trend. A multi-post pull is the next step.'],
    [social ? `${social.replies_captured} of ${social.replies_declared} replies captured` : 'Replies captured',
      'The actor truncates long reply chains, and the biggest thread is always the one most affected. Raise the reply limit before the next run.'],
    ['No branch in the data', 'Social complaints name people and processes, not offices. Social is scored on its own dimension and only meets the branch data inside the queue.'],
    ['Brand replies arrive as root comments', 'Instagram returns an answer opening with a mention as a top-level comment. Left uncorrected it understates the reply rate; the pipeline reattaches them by handle.'],
    ['No mention or hashtag feed yet', "Everything here is on FIF's own post. Complaints posted elsewhere are invisible until listening is connected."],
  ];

  return (
    <section className="page">
      <div className="grid g-58 mb">
        <div className="panel">
          <PanelHead title="How to read this prototype" />
          <div className="callout">
            <h4>It runs on a partial scrape</h4>
            <p>
              {google ? `${google.rows} of ${google.universe ?? '—'} Google reviews were read, ${google.coverage_pct ?? '—'}% overall, and the rate differs per branch. ` : ''}
              Absolute volumes are therefore indicative only, and every comparison in this build uses rates.
            </p>
          </div>
          <div className="callout">
            <h4>Repeat reviewers cannot be measured here</h4>
            <p>Every review in this file comes from a distinct reviewer ID, because Google lets one account hold only one review per place and edits it instead of adding a second. Recurrence is therefore measured by topic per branch, by collection-day bursts, and by reviewer reach — not by counting a person twice.</p>
          </div>
          <div className="callout">
            <h4>Reply speed cannot be measured yet</h4>
            <p>Owner replies now come through, so a reply rate per branch is available, but no case carries a first-response time. How long a branch takes to answer is therefore still unknown, and the rate itself has to be checked against the Google Business Profile account before it goes in front of the client.</p>
          </div>
          <div className="callout">
            <h4>Reviewer names are personal data</h4>
            <p>Names shown in the queue are public, but under UU PDP the production build should pseudonymise them and keep the identity join in a restricted table.</p>
          </div>
          {config?.known_limits?.length ? (
            <div className="callout">
              <h4>Limits the API declares about itself</h4>
              <ul className="clean" style={{ marginTop: 6 }}>
                {config.known_limits.map((l) => (
                  <li key={l.id}>
                    <span>
                      {l.text}
                      <div className="sub">{l.id} · applies to {l.applies_to.join(', ')}</div>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="panel">
          <PanelHead title="Scoring model" tag="Google" />
          <div className="p-note">Every complaint carries one score so that triage does not depend on who reads it first.</div>
          <table>
            <thead><tr><th>Component</th><th className="n">Weight</th><th>Reads</th></tr></thead>
            <tbody>
              {config ? scoringModel(config.scoring.google).map(([c, w, r]) => (
                <tr key={c}><td><b>{c}</b></td><td className="n mono">{w}</td><td style={{ color: 'var(--ink-2)' }}>{r}</td></tr>
              )) : <tr><td colSpan={3}><div className="empty">Loading the scoring config…</div></td></tr>}
            </tbody>
          </table>

          {config && (
            <>
              <div className="p-head" style={{ marginTop: 22 }}><h3>Instagram scoring</h3></div>
              <div className="p-note">Social has no rating and no branch, so it is scored on sentiment, thread heat and pile-on instead.</div>
              <table>
                <thead><tr><th>Component</th><th className="n">Weight</th></tr></thead>
                <tbody>
                  {Object.entries(config.scoring.instagram).map(([k, v]) => (
                    <tr key={k}><td><b>{IG_SCORE_LABEL[k] ?? k}</b></td><td className="n mono">{v}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="p-head" style={{ marginTop: 22 }}><h3>Priority thresholds</h3></div>
              <div className="p-note">Where each score turns into the chip shown on the queue.</div>
              <table>
                <thead><tr><th>Channel</th><th className="n">Critical</th><th className="n">High</th><th className="n">Medium</th></tr></thead>
                <tbody>
                  {Object.entries(config.priority_thresholds).map(([ch, t]) => (
                    <tr key={ch}>
                      <td><b style={{ textTransform: 'capitalize' }}>{ch}</b></td>
                      <td className="n mono">≥ {t.critical}</td>
                      <td className="n mono">≥ {t.high}</td>
                      <td className="n mono">≥ {t.medium}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="p-head" style={{ marginTop: 22 }}><h3>Severity ladder</h3></div>
          <table>
            <thead><tr><th className="n">Level</th><th>Covers</th><th className="n">Topics</th><th className="n">Keywords</th><th className="n">Found</th></tr></thead>
            <tbody>
              {[4, 3, 2, 1].map((level) => {
                const t = taxonomy(level);
                return (
                  <tr key={level}>
                    <td className="n"><span className={`tag s${level}`}>{level}</span></td>
                    <td style={{ color: 'var(--ink-2)' }}>{covers(level)}</td>
                    <td className="n mono" title={t.names}>{t.topics || '—'}</td>
                    <td className="n mono">{t.keywords || '—'}</td>
                    <td className="n mono">{found(level) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="p-head" style={{ marginTop: 22 }}><h3>Instagram-specific limits</h3></div>
          <table>
            <thead><tr><th>Instagram limit</th><th>Effect</th></tr></thead>
            <tbody>
              {limits.map(([l, e]) => (
                <tr key={e}><td><b>{l}</b></td><td style={{ color: 'var(--ink-2)' }}>{e}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <PanelHead title="What production needs that this prototype does not have" />
        <ul className="clean">
          {ROADMAP.map(([t, d], i) => (
            <li key={t}>
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <span><b>{t}</b><div>{d}</div></span>
            </li>
          ))}
        </ul>
        {meta && (
          <div className="p-note" style={{ marginTop: 18, marginBottom: 0 }}>
            Taxonomy {meta.versions.taxonomy} · scoring {meta.versions.scoring} · classifier {meta.versions.classifier}.{' '}
            Data as of {meta.as_of.slice(0, 16).replace('T', ' ')} UTC, generated {meta.generated_at.slice(0, 16).replace('T', ' ')} UTC
            {meta.date_bounds ? `, covering ${meta.date_bounds.min} to ${meta.date_bounds.max}` : ''}.{' '}
            {meta.sources.map((s) => `${s.label}: ${s.rows} rows, ${s.status}`).join(' · ')}.
          </div>
        )}
      </div>
    </section>
  );
}

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
    ['Recency', `0–${s.recency_max}`, 'A complaint from last week beats one from last year'],
    ['Reviewer reach', `0–${reach}`, 'Local Guide status, lifetime review count, attached photo'],
    ['No public reply', String(s.unanswered), 'Every unanswered case gains a fixed penalty'],
  ];
}

export function MethodView() {
  const { config, source } = useReference();
  const google = source('google'), ig = source('instagram');
  const topics = useApi<ComplaintsResponse>('/v1/pages/complaints', { source: 'all' }).data?.topics;
  const social = useApi<SocialResponse>('/v1/pages/social', { source: 'all' }).data?.summary;
  const found = (sev: number) => topics?.filter((t) => t.severity === sev).reduce((a, t) => a + t.google + t.instagram, 0);
  const covers = (level: number) => config?.severity_ladder.find((s) => s.level === level)?.description ?? COVERS[level];

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
            <h4>Reply metrics are unverified</h4>
            <p>The owner-response fields are empty on every row. Either no branch has ever replied, which is the cheapest win available, or the scraper did not capture the field. This has to be checked against the Google Business Profile account before the number goes in front of the client.</p>
          </div>
          <div className="callout">
            <h4>Reviewer names are personal data</h4>
            <p>Names shown in the queue are public, but under UU PDP the production build should pseudonymise them and keep the identity join in a restricted table.</p>
          </div>
        </div>
        <div className="panel">
          <PanelHead title="Scoring model" />
          <div className="p-note">Every complaint carries one score so that triage does not depend on who reads it first.</div>
          <table>
            <thead><tr><th>Component</th><th className="n">Weight</th><th>Reads</th></tr></thead>
            <tbody>
              {config ? scoringModel(config.scoring.google).map(([c, w, r]) => (
                <tr key={c}><td><b>{c}</b></td><td className="n mono">{w}</td><td style={{ color: 'var(--ink-2)' }}>{r}</td></tr>
              )) : <tr><td colSpan={3}><div className="empty">Loading the scoring config…</div></td></tr>}
            </tbody>
          </table>

          <div className="p-head" style={{ marginTop: 22 }}><h3>Severity ladder</h3></div>
          <table>
            <thead><tr><th className="n">Level</th><th>Covers</th><th className="n">Found</th></tr></thead>
            <tbody>
              {[4, 3, 2, 1].map((level) => (
                <tr key={level}>
                  <td className="n"><span className={`tag s${level}`}>{level}</span></td>
                  <td style={{ color: 'var(--ink-2)' }}>{covers(level)}</td>
                  <td className="n mono">{found(level) || '—'}</td>
                </tr>
              ))}
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
      </div>
    </section>
  );
}

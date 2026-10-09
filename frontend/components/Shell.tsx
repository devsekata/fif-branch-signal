'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import { PeriodControl, ScopeControl, SourceControl } from '@/components/ScopeControl';
import { roleName } from '@/lib/caseflow';
import { FiltersProvider, useFilters } from '@/lib/filters';
import { PAGES, branchIdOfPath, pageForPath, type PageId, type ScopeCap } from '@/lib/pages';
import { ReferenceProvider, useReference } from '@/lib/reference';
import { currentOf } from '@/lib/scope';
import { initials, readSession, signOut, useSession } from '@/lib/session';
import { wib } from '@/lib/theme';
import type { CasesResponse } from '@/lib/types';

const ICON: Partial<Record<PageId, ReactNode>> = {
  overview: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  branches: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M14 9h1M14 13h1M10 21v-4h4v4" />,
  geography: <><circle cx="12" cy="10" r="3" /><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /></>,
  complaints: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v4M12 14h.01" />,
  escalations: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
  integrity: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  listings: <><path d="m3 7 2 2 4-4" /><path d="m3 17 2 2 4-4" /><path d="M13 6h8M13 12h8M13 18h8" /></>,
  social: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  method: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
  ingest: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

const NAV = PAGES.filter((p) => !p.hidden);
const GROUPS = [...new Set(NAV.map((p) => p.group))];

/** Critical cases across both channels; the Instagram share feeds the Social listening badge. */
function useTally(): Partial<Record<PageId, number>> {
  const critical = useApi<CasesResponse>('/v1/cases', { source: 'all', priority: 'critical', limit: 1 }).data;
  return { escalations: critical?.page.total, social: critical?.facets.by_source.instagram };
}

function Sidebar() {
  const current = pageForPath(usePathname());
  /* A branch is opened from Area & Branch, so that is the item it lights up. */
  const active = current.id === 'branch' ? 'branches' : current.id;
  const tally = useTally();
  const google = useReference().source('google');
  return (
    <aside>
      <div className="brand">
        <div className="mark"><span>FIF</span></div>
        <div><b>Branch Signal</b><small>FIF Finance · CX &amp; Compliance</small></div>
      </div>
      <nav>
        {GROUPS.map((g) => (
          <Fragment key={g}>
            <div className="nav-group">{g}</div>
            {NAV.filter((p) => p.group === g).map((p) => (
              <Link key={p.id} href={p.href} className={p.id === active ? 'nav-item on' : 'nav-item'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  {ICON[p.id]}
                </svg>
                <span>{p.label}</span>
                {!!tally[p.id] && <span className="tally">{tally[p.id]}</span>}
              </Link>
            ))}
          </Fragment>
        ))}
      </nav>
      <div className="side-foot">
        <div><span className="live" />Google reviews synced</div>
        <div style={{ marginTop: 3 }}>{google?.last_sync ? `Last read ${wib(google.last_sync)}` : ' '}</div>
        <Who />
      </div>
    </aside>
  );
}

/* What the scope control means on each page, and what it cannot do.
 * A page that cannot honour the scope says so rather than ignoring it. */
const CAP_NOTE: Partial<Record<ScopeCap, string>> = {
  self: 'This page is one branch. Changing the scope opens a different branch.',
  partial: 'The Google panels follow the scope. The Instagram panel cannot — social comments carry no area — so it keeps showing everything.',
  none: 'Scope is off here. Instagram comments carry no province, kota or branch, so there is nothing to narrow by.',
};

function Topbar() {
  const pathname = usePathname();
  const p = pageForPath(pathname);
  const { filters } = useFilters();
  const { place } = useReference();
  const src = filters.source;
  const hasSource = p.filters.includes('source');
  const igOnly = hasSource && src === 'instagram';
  const cap = p.scope;
  const capOn = cap !== 'none' && cap !== 'off';
  const cur = currentOf(filters.scope);
  const isSet = cur.level !== 'all';
  const scopeName = cur.level === 'branch' ? place(cur.value!)?.name ?? cur.value : cur.value;
  const note = CAP_NOTE[cap];

  let strip = '';
  if (igOnly) strip = 'Instagram only. Scope is off, because social comments carry no province, kota or branch.';
  else if (cap === 'none') strip = isSet ? `${note} The scope you set (${scopeName}) still applies on every other page.` : note!;
  else if (cap === 'partial' && isSet) strip = note!;
  else if (isSet && hasSource && capOn)
    strip = `Scoped to ${scopeName} — Instagram is excluded, because social comments carry no ${cur.level === 'branch' ? 'branch' : 'area'}.`;

  /* The branch page is titled by the branch it shows. */
  const shown = p.id === 'branch' ? place(branchIdOfPath(pathname) ?? '') : undefined;
  const title = shown?.name ?? p.title;
  const sub = shown ? [shown.kecamatan, shown.kota, shown.province].filter(Boolean).join(' · ') || shown.city : p.sub;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        <div className="controls">
          {cap !== 'off' && cap !== 'self' && (
            <ScopeControl off={!capOn || igOnly}
              title={!capOn || igOnly ? note ?? 'Scope does not apply while the source is Instagram' : 'Narrow every page to a province, kota, kecamatan or branch'} />
          )}
          {hasSource && <SourceControl />}
          {p.filters.includes('period') && <PeriodControl />}
        </div>
      </div>
      {strip && <div className="scope-strip on">{strip}</div>}
    </>
  );
}

/** Who is signed in, and the way out. */
function Who() {
  const session = useSession();
  if (!session) return null;
  const who = session.email.split('@')[0];
  return (
    <div className="who">
      <div className="av">{initials(who)}</div>
      <div style={{ minWidth: 0 }}>
        <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={session.email}>{who}</b>
        <div style={{ fontSize: 11 }}>{roleName(session.role)}</div>
      </div>
      <button className="sign-out" onClick={signOut} title="Sign out">Sign out</button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const onLoginPage = pathname === '/login';

  /* `session` is in the dependencies so signing out re-runs this; without it nothing changed
   * when the session was cleared and the page sat on "Checking your session…" forever.
   * The check itself reads localStorage rather than that value, because the hook reports null
   * for the hydrating render and that would bounce a signed-in person back to the login screen. */
  useEffect(() => {
    if (!onLoginPage && !readSession()) router.replace('/login');
  }, [onLoginPage, pathname, router, session]);

  if (onLoginPage) return <>{children}</>;
  if (!session) return <div className="gate-wait">Checking your session…</div>;

  return (
    <FiltersProvider>
      <ReferenceProvider>
        <div className="shell">
          <Sidebar />
          <main>
            <Topbar />
            {children}
          </main>
        </div>
      </ReferenceProvider>
    </FiltersProvider>
  );
}

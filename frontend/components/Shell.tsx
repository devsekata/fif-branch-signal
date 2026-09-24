'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import { FiltersProvider, useFilters } from '@/lib/filters';
import { PAGES, pageForPath, type PageId } from '@/lib/pages';
import { ReferenceProvider, useReference } from '@/lib/reference';
import { wib } from '@/lib/theme';
import type { CasesResponse, PeriodFilter, SourceFilter } from '@/lib/types';

const ICON: Record<PageId, ReactNode> = {
  overview: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  branches: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M14 9h1M14 13h1M10 21v-4h4v4" />,
  complaints: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v4M12 14h.01" />,
  escalations: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
  integrity: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  social: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  method: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
  ingest: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
};

const GROUPS = [...new Set(PAGES.map((p) => p.group))];

/** Critical cases across both channels; the Instagram share feeds the Social listening badge. */
function useTally(): Partial<Record<PageId, number>> {
  const critical = useApi<CasesResponse>('/v1/cases', { source: 'all', priority: 'critical', limit: 1 }).data;
  return { escalations: critical?.page.total, social: critical?.facets.by_source.instagram };
}

function Sidebar() {
  const current = pageForPath(usePathname());
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
            {PAGES.filter((p) => p.group === g).map((p) => (
              <Link key={p.id} href={p.href} className={p.id === current.id ? 'nav-item on' : 'nav-item'}>
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
        <div className="who">
          <div className="av">SK</div>
          <div><b>Sekata</b><div style={{ fontSize: 11 }}>Prototype build v2</div></div>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  const p = pageForPath(usePathname());
  const { filters, setFilter } = useFilters();
  const branches = useReference().meta?.branches ?? [];
  const src = filters.source;
  const hasSource = p.filters.includes('source');
  const show = {
    branch: p.filters.includes('branch') && !(hasSource && src === 'instagram'),
    period: p.filters.includes('period'),
    source: hasSource,
  };

  let scope = '';
  if (hasSource && src === 'instagram')
    scope = 'Instagram only. Branch filtering is off because social comments carry no branch, and any branch-shaped view on this page is empty by design.';
  if (hasSource && src !== 'instagram' && filters.branch !== 'all' && p.id !== 'branches')
    scope = 'A branch is selected, so Instagram is excluded from this view.';

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{p.title}</h1>
          <p>{p.sub}</p>
        </div>
        <div className="controls">
          {show.branch && (
            <select className="ctl" aria-label="Filter by branch" value={filters.branch}
              onChange={(e) => setFilter('branch', e.target.value)}>
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {show.source && (
            <select className="ctl" aria-label="Filter by data source" value={filters.source}
              onChange={(e) => setFilter('source', e.target.value as SourceFilter)}>
              <option value="all">Data Source</option>
              <option value="google">Google reviews</option>
              <option value="instagram">Instagram</option>
            </select>
          )}
          {show.period && (
            <select className="ctl" aria-label="Filter by period" value={filters.period}
              onChange={(e) => setFilter('period', e.target.value as PeriodFilter)}>
              <option value="all">Full 12 months</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 180 days</option>
              <option value="365">Last 365 days</option>
            </select>
          )}
        </div>
      </div>
      {scope && <div className="scope-strip on">{scope}</div>}
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
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

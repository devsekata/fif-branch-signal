export type PageId = 'overview' | 'geography' | 'branches' | 'branch' | 'complaints' | 'escalations' | 'integrity' | 'listings' | 'social' | 'method' | 'ingest' | 'settings';
export type FilterKey = 'branch' | 'period' | 'source';

/** What the scope control means on a page (fif_metric_spec.md §6.4).
 *  `off` is for pages that hold no review data at all, where the control is not shown. */
export type ScopeCap = 'full' | 'map' | 'self' | 'partial' | 'none' | 'off';

export interface PageDef {
  id: PageId;
  href: string;
  filters: FilterKey[];
  scope: ScopeCap;
  group: 'Monitor' | 'Diagnose' | 'Act' | 'Reference' | 'Data';
  label: string;
  title: string;
  sub: string;
  /** Reached from another page rather than from the sidebar. */
  hidden?: boolean;
}

export const PAGES: PageDef[] = [
  { id: 'overview', href: '/', filters: ['branch', 'period', 'source'], scope: 'full', group: 'Monitor', label: 'Overview', title: 'Overview',
    sub: 'What needs a decision this week, across every branch in the sample.' },
  { id: 'geography', href: '/geography', filters: ['period'], scope: 'map', group: 'Monitor', label: 'Geography', title: 'Geography',
    sub: 'Sentiment across Indonesia, drilled from province to kota to the branches inside a kecamatan.' },
  { id: 'branches', href: '/branches', filters: ['branch', 'period'], scope: 'full', group: 'Monitor', label: 'Area & Branch', title: 'Area and branch performance',
    sub: 'Find any area or branch, see how it is doing, and open the detail without leaving the page.' },
  { id: 'branch', href: '/branches/', filters: [], scope: 'self', hidden: true, group: 'Monitor', label: 'Branch', title: 'Branch detail',
    sub: 'One branch, with the sentiment behind its score.' },
  { id: 'complaints', href: '/complaints', filters: ['branch', 'period', 'source'], scope: 'full', group: 'Diagnose', label: 'Complaint themes', title: 'Complaint themes',
    sub: 'What goes wrong, how serious it is, and whether it belongs to a branch or to head office.' },
  { id: 'escalations', href: '/escalations', filters: ['branch', 'period', 'source'], scope: 'full', group: 'Act', label: 'Escalations', title: 'Escalation queue',
    sub: 'Scored, ranked and still unanswered. Assign an owner, reply in public, close the case.' },
  { id: 'integrity', href: '/integrity', filters: ['period', 'source'], scope: 'partial', group: 'Diagnose', label: 'Review integrity', title: 'Review integrity',
    sub: 'Whether the rating can be trusted as a satisfaction signal, and how much of it was collected at the counter.' },
  { id: 'listings', href: '/listings', filters: ['branch'], scope: 'full', group: 'Diagnose', label: 'Listing integrity', title: 'Listing integrity',
    sub: 'Google listings reconciled against the branch master: duplicates, listings FIF does not manage, and branches with no listing at all.' },
  { id: 'social', href: '/social', filters: ['period'], scope: 'none', group: 'Act', label: 'Social listening', title: 'Social listening',
    sub: 'Instagram comment threads on the official account, scored on the same ladder as branch reviews.' },
  { id: 'method', href: '/method', filters: [], scope: 'off', group: 'Reference', label: 'Method & limits', title: 'Method and limits',
    sub: 'What this prototype measures, what it cannot measure yet, and what production needs.' },
  { id: 'ingest', href: '/ingest', filters: [], scope: 'off', group: 'Data', label: 'Pull data', title: 'Pull new data',
    sub: 'Queue a crawl of a branch on Google Maps or of the Instagram account. Every other page only reads what these jobs bring in.' },
  { id: 'settings', href: '/settings', filters: [], scope: 'off', group: 'Data', label: 'Settings', title: 'Settings',
    sub: 'Which brand is monitored, what counts as a complaint, and what the scraper searches for.' },
];

export const page = (id: PageId) => PAGES.find((p) => p.id === id)!;
export const branchHref = (branchId: string) => `/branches/${encodeURIComponent(branchId)}`;

export function pageForPath(path: string) {
  if (path.startsWith('/branches/') && path.length > '/branches/'.length) return page('branch');
  return PAGES.find((p) => !p.hidden && p.href === path) ?? PAGES[0];
}

/** The branch a `/branches/{id}` path names, or null on any other page. */
export const branchIdOfPath = (path: string) =>
  path.startsWith('/branches/') && path.length > '/branches/'.length ? decodeURIComponent(path.slice('/branches/'.length).replace(/\/+$/, '')) : null;

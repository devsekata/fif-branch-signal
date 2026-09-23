export type PageId = 'overview' | 'branches' | 'complaints' | 'escalations' | 'integrity' | 'social' | 'method';
export type FilterKey = 'branch' | 'period' | 'source';

export interface PageDef {
  id: PageId;
  href: string;
  filters: FilterKey[];
  group: 'Monitor' | 'Diagnose' | 'Act' | 'Reference';
  label: string;
  title: string;
  sub: string;
}

export const PAGES: PageDef[] = [
  { id: 'overview', href: '/', filters: ['branch', 'period', 'source'], group: 'Monitor', label: 'Overview', title: 'Overview',
    sub: 'What needs a decision this week, across every branch in the sample.' },
  { id: 'branches', href: '/branches', filters: ['branch', 'period'], group: 'Monitor', label: 'Branches', title: 'Branch performance',
    sub: 'Ranked on rates rather than counts, because the scrape covers each branch unevenly.' },
  { id: 'complaints', href: '/complaints', filters: ['branch', 'period', 'source'], group: 'Diagnose', label: 'Complaint themes', title: 'Complaint themes',
    sub: 'What goes wrong, how serious it is, and whether it belongs to a branch or to head office.' },
  { id: 'escalations', href: '/escalations', filters: ['branch', 'period', 'source'], group: 'Act', label: 'Escalations', title: 'Escalation queue',
    sub: 'Scored, ranked and still unanswered. Assign an owner, reply in public, close the case.' },
  { id: 'integrity', href: '/integrity', filters: ['period', 'source'], group: 'Diagnose', label: 'Review integrity', title: 'Review integrity',
    sub: 'Whether the rating can be trusted as a satisfaction signal, and how much of it was collected at the counter.' },
  { id: 'social', href: '/social', filters: ['period'], group: 'Act', label: 'Social listening', title: 'Social listening',
    sub: 'Instagram comment threads on the official account, scored on the same ladder as branch reviews.' },
  { id: 'method', href: '/method', filters: [], group: 'Reference', label: 'Method & limits', title: 'Method and limits',
    sub: 'What this prototype measures, what it cannot measure yet, and what production needs.' },
];

export const page = (id: PageId) => PAGES.find((p) => p.id === id)!;
export const pageForPath = (path: string) => PAGES.find((p) => p.href === path) ?? PAGES[0];

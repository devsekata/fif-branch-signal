import type { Metadata } from 'next';
import { BranchesView } from '@/components/views/BranchesView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('branches').title };

export default function Page() {
  return <BranchesView />;
}

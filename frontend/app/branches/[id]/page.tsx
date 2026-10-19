import type { Metadata } from 'next';
import { BranchDetailView } from '@/components/views/BranchDetailView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('branch').title };

export default async function Page(props: PageProps<'/branches/[id]'>) {
  const { id } = await props.params;
  return <BranchDetailView branchId={decodeURIComponent(id)} />;
}

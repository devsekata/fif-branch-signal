import type { Metadata } from 'next';
import { ComplaintsView } from '@/components/views/ComplaintsView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('complaints').title };

export default function Page() {
  return <ComplaintsView />;
}

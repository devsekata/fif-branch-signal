import type { Metadata } from 'next';
import { EscalationsView } from '@/components/views/EscalationsView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('escalations').title };

export default function Page() {
  return <EscalationsView />;
}

import type { Metadata } from 'next';
import { IntegrityView } from '@/components/views/IntegrityView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('integrity').title };

export default function Page() {
  return <IntegrityView />;
}

import type { Metadata } from 'next';
import { GeographyView } from '@/components/views/GeographyView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('geography').title };

export default function Page() {
  return <GeographyView />;
}

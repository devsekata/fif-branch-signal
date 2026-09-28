import type { Metadata } from 'next';
import { IngestView } from '@/components/views/IngestView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('ingest').title };

export default function Page() {
  return <IngestView />;
}

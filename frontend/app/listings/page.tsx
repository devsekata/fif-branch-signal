import type { Metadata } from 'next';
import { ListingsView } from '@/components/views/ListingsView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('listings').title };

export default function Page() {
  return <ListingsView />;
}

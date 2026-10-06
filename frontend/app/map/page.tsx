import type { Metadata } from 'next';
import { AreaMapView } from '@/components/views/AreaMapView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('map').title };

export default function Page() {
  return <AreaMapView />;
}

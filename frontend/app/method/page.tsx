import type { Metadata } from 'next';
import { MethodView } from '@/components/views/MethodView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('method').title };

export default function Page() {
  return <MethodView />;
}

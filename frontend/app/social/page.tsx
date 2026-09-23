import type { Metadata } from 'next';
import { SocialView } from '@/components/views/SocialView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('social').title };

export default function Page() {
  return <SocialView />;
}

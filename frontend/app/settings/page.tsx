import type { Metadata } from 'next';
import { SettingsView } from '@/components/views/SettingsView';
import { page } from '@/lib/pages';

export const metadata: Metadata = { title: page('settings').title };

export default function Page() {
  return <SettingsView />;
}

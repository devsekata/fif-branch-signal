import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Sora } from 'next/font/google';
import { Shell } from '@/components/Shell';
import './globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

export const metadata: Metadata = {
  title: { default: 'FIF Finance · Branch Signal', template: '%s · FIF Branch Signal' },
  description: 'Branch complaints, escalations, review integrity and Instagram listening for FIF Finance.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className={`${sora.variable} ${jakarta.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

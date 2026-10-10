import type { Metadata, Viewport } from 'next';
import { PlayerCardProvider } from '@/components/PlayerCard';
import UpdateCheck from '@/components/UpdateCheck';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Liam',
  description: 'Dynasty fantasy football league hub',
  // Saved to the Home Screen, open full-screen rather than as a Safari tab.
  appleWebApp: { capable: true, title: 'The Liam', statusBarStyle: 'default' },
  // Next emits only the newer `mobile-web-app-capable`; older iOS reads this.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Follows the phone; a theme forced in Settings rewrites these (lib/theme.ts).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f2f2' },
    { media: '(prefers-color-scheme: dark)', color: '#161514' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set before hydration by THEME_SCRIPT, so React mustn't complain about it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <PlayerCardProvider>{children}</PlayerCardProvider>
        <UpdateCheck />
      </body>
    </html>
  );
}

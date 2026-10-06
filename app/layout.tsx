import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GRIDLOCK',
  description: 'Dynasty fantasy football league hub',
  // Saved to the Home Screen, open full-screen rather than as a Safari tab.
  appleWebApp: { capable: true, title: 'GRIDLOCK', statusBarStyle: 'default' },
  // Next emits only the newer `mobile-web-app-capable`; older iOS reads this.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f3f2f2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

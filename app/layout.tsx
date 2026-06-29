import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Emerald AI — AQ Intelligence Platform',
  description: 'Air quality intelligence and media analytics powered by AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: 'var(--ink)' }}>
        {children}
      </body>
    </html>
  );
}

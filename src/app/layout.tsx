import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { getBranding } from '@/lib/branding';
import './globals.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: `${branding.companyName} · ${branding.productName}`,
    description: `${branding.subtitle}: gestione operativa, documenti e controllo costi.`
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  const brandStyle = {
    '--primary': branding.primaryColor,
    '--primary-dark': branding.primaryDarkColor,
    '--sidebar': branding.sidebarColor,
    '--sidebar-bg': branding.sidebarColor,
    '--success': branding.accentColor
  } as CSSProperties;

  return (
    <html lang="it" suppressHydrationWarning style={brandStyle}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
try {
  var storedTheme = localStorage.getItem('nfrp-theme');
  var legacyTheme = localStorage.getItem('document-archive-theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = storedTheme || legacyTheme || (prefersDark ? 'dark' : 'light');
} catch (_) {
  document.documentElement.dataset.theme = 'light';
}
`
          }}
        />
        {children}
      </body>
    </html>
  );
}

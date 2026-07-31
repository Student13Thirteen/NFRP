'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, ScanLine } from 'lucide-react';
import { getActiveNavigationContext } from '@/components/app-navigation-config';

export function DashboardSectionMenu() {
  const pathname = usePathname();
  const context = getActiveNavigationContext(pathname);
  const ContextIcon = context?.item.icon ?? LayoutDashboard;

  return (
    <div className="topbar-actions">
      <div className="topbar-context" aria-label="Posizione corrente">
        <span className="topbar-context-icon"><ContextIcon size={17} aria-hidden /></span>
        <span>
          <small>{context?.groupLabel ?? 'NFRP'}</small>
          <strong>{context?.item.label ?? 'Area di lavoro'}</strong>
        </span>
      </div>
      <Link className="topbar-acquire" href="/acquisitions">
        <ScanLine size={16} aria-hidden />
        Acquisisci
      </Link>
    </div>
  );
}

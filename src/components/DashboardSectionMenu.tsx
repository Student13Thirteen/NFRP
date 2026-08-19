'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpLeft, LayoutDashboard, ScanLine } from 'lucide-react';
import { getActiveNavigationContext } from '@/components/app-navigation-config';

export function DashboardSectionMenu() {
  const pathname = usePathname();
  const context = getActiveNavigationContext(pathname);
  const ContextIcon = context?.item.icon ?? LayoutDashboard;
  const groupLabel = context?.groupLabel ?? 'NFRP';
  const itemLabel = context?.item.label ?? 'Area di lavoro';
  const canReturn = Boolean(context && pathname !== context.item.href);

  const contextBody = (
    <>
      <span className="topbar-context-icon"><ContextIcon size={17} aria-hidden /></span>
      <span>
        <small>{groupLabel}</small>
        <strong>{itemLabel}</strong>
      </span>
      {canReturn ? <ArrowUpLeft className="topbar-context-back" size={15} aria-hidden /> : null}
    </>
  );

  return (
    <div className="topbar-actions">
      {canReturn && context ? (
        <Link className="topbar-context is-link" href={context.item.href} aria-label={`Torna a ${itemLabel}`}>
          {contextBody}
        </Link>
      ) : (
        <div className="topbar-context" aria-label="Posizione corrente">
          {contextBody}
        </div>
      )}
      <Link className="topbar-acquire" href="/acquisitions">
        <ScanLine size={16} aria-hidden />
        Acquisisci
      </Link>
    </div>
  );
}

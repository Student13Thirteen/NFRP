'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ChevronDown,
  LogOut,
  Menu,
  ScanLine,
  X
} from 'lucide-react';
import { logoutAction } from '@/app/login/actions';
import { AppBrand } from '@/components/AppBrand';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { BrandingConfig } from '@/lib/branding-types';
import {
  getActiveNavigationContext,
  isActivePath,
  navigationGroups,
  primaryNavigationItems
} from '@/components/app-navigation-config';

type QueueCounts = {
  acquisitions: number;
  documents: number;
  expenses: number;
  fuel: number;
  leases: number;
  tolls: number;
  trips: number;
};

type AppNavigationProps = {
  branding: BrandingConfig;
  queueCounts: QueueCounts;
  userEmail: string;
};

export function AppNavigation({ branding, queueCounts, userEmail }: AppNavigationProps) {
  const pathname = usePathname();

  return <AppNavigationContent key={pathname} pathname={pathname} branding={branding} queueCounts={queueCounts} userEmail={userEmail} />;
}

function AppNavigationContent({ branding, queueCounts, userEmail, pathname }: AppNavigationProps & { pathname: string }) {
  const [open, setOpen] = useState(false);
  const activeContext = getActiveNavigationContext(pathname);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(activeContext?.groupId ?? null);

  const renderNavigationItem = (item: (typeof primaryNavigationItems)[number], groupId: string | null) => {
    const Icon = item.icon;
    const active = isActivePath(pathname, item.href);
    const badge = item.badge ? queueCounts[item.badge] : 0;

    return (
      <Link
        href={item.href}
        key={item.href}
        className={active ? 'is-active' : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() => {
          if (groupId) setExpandedGroupId(groupId);
          setOpen(false);
        }}
      >
        <Icon size={18} aria-hidden />
        <span>{item.label}</span>
        {badge > 0 ? <b className="nav-queue-badge" aria-label={`${badge} elementi in attesa`}>{badge}</b> : null}
      </Link>
    );
  };

  return (
    <>
      <div className="mobile-app-bar">
        <button className="mobile-menu-button" type="button" onClick={() => setOpen(true)} aria-label="Apri menu">
          <Menu size={21} aria-hidden />
        </button>
        <Link href="/dashboard" className="mobile-app-title" onClick={() => setOpen(false)}>
          <strong>{branding.productName}</strong>
          <span>{branding.companyName}</span>
        </Link>
        <div className="mobile-app-actions">
          <Link className="mobile-acquire-button" href="/acquisitions" aria-label="Acquisisci documenti" onClick={() => setOpen(false)}>
            <ScanLine size={19} aria-hidden />
            {queueCounts.acquisitions > 0 ? <span>{queueCounts.acquisitions}</span> : null}
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <button
        className={`sidebar-backdrop${open ? ' is-open' : ''}`}
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Chiudi menu"
        tabIndex={open ? 0 : -1}
      />

      <aside className={`sidebar${open ? ' is-open' : ''}`}>
        <div className="sidebar-heading">
          <Link href="/dashboard" className="sidebar-brand" onClick={() => setOpen(false)}>
            <AppBrand branding={branding} variant="sidebar" />
          </Link>
          <button className="sidebar-close" type="button" onClick={() => setOpen(false)} aria-label="Chiudi menu">
            <X size={20} aria-hidden />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navigazione principale">
          <div className="sidebar-nav-primary">
            {primaryNavigationItems.map((item) => renderNavigationItem(item, null))}
          </div>

          <div className="sidebar-nav-sections" aria-label="Aree di lavoro">
          {navigationGroups.map((group) => (
            <div className={`sidebar-nav-group${activeContext?.groupId === group.id ? ' is-current' : ''}`} key={group.id}>
              <button
                className="sidebar-group-trigger"
                type="button"
                aria-expanded={expandedGroupId === group.id}
                aria-controls={`sidebar-group-${group.id}`}
                onClick={() => setExpandedGroupId((current) => current === group.id ? null : group.id)}
              >
                <group.icon size={19} aria-hidden />
                <span className="sidebar-group-copy">
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </span>
                <ChevronDown className="sidebar-group-chevron" size={17} aria-hidden />
              </button>
              <div
                className="sidebar-group-items"
                id={`sidebar-group-${group.id}`}
                hidden={expandedGroupId !== group.id}
              >
                {group.items.map((item) => renderNavigationItem(item, group.id))}
              </div>
            </div>
          ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <span title={userEmail}>{userEmail}</span>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Esci" aria-label="Esci">
              <LogOut size={18} aria-hidden />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

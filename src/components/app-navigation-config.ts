import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Bell,
  Palette,
  Bot,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  History,
  Landmark,
  MapPinned,
  Route,
  ScanLine,
  Settings,
  SlidersHorizontal,
  Truck,
  UserRound,
  Warehouse,
  Wrench
} from 'lucide-react';

export type NavigationBadge = 'acquisitions' | 'documents' | 'expenses' | 'fuel' | 'leases' | 'tolls' | 'trips';

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: NavigationBadge;
};

export type NavigationGroup = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

export const primaryNavigationItems: NavigationItem[] = [
  { href: '/dashboard', label: 'Panoramica', icon: Gauge },
  { href: '/acquisitions', label: 'Acquisisci', icon: ScanLine, badge: 'acquisitions' }
];

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'work',
    label: 'Lavoro',
    description: 'Viaggi e documenti',
    icon: ClipboardList,
    items: [
      { href: '/trips', label: 'Viaggi', icon: MapPinned, badge: 'trips' },
      { href: '/documents', label: 'Documenti', icon: FileText },
      { href: '/documents/history', label: 'Storico documenti', icon: History },
      { href: '/documents/disposed', label: 'Documenti mezzi usciti', icon: Archive }
    ]
  },
  {
    id: 'control',
    label: 'Costi e controllo',
    description: 'Spese, fatture e scorte',
    icon: CircleDollarSign,
    items: [
      { href: '/fuel', label: 'Rifornimenti', icon: Fuel, badge: 'fuel' },
      { href: '/tolls', label: 'Autostrade', icon: Route, badge: 'tolls' },
      { href: '/leases', label: 'Leasing', icon: Landmark, badge: 'leases' },
      { href: '/costs', label: 'Centro costi', icon: CircleDollarSign },
      { href: '/maintenances/expenses', label: 'Manutenzioni e fatture', icon: Wrench, badge: 'expenses' },
      { href: '/warehouse', label: 'Magazzino', icon: Boxes }
    ]
  },
  {
    id: 'fleet',
    label: 'Flotta',
    description: 'Persone e mezzi',
    icon: Truck,
    items: [
      { href: '/drivers', label: 'Autisti', icon: UserRound },
      { href: '/vehicles/tractors', label: 'Trattori', icon: Truck },
      { href: '/vehicles/trailers', label: 'Semirimorchi', icon: Archive },
      { href: '/others', label: 'Altre entita', icon: Warehouse }
    ]
  },
  {
    id: 'tools',
    label: 'Strumenti',
    description: 'Assistente e impostazioni',
    icon: SlidersHorizontal,
    items: [
      { href: '/nfrp-bot', label: 'NFRP Bot', icon: Bot },
      { href: '/settings/branding', label: 'Identità aziendale', icon: Palette },
      { href: '/settings/document-types', label: 'Tipi documento', icon: Settings },
      { href: '/settings/notifications', label: 'Notifiche', icon: Bell }
    ]
  }
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/documents') {
    if (pathname.startsWith('/documents/history') || pathname.startsWith('/documents/disposed') || pathname.startsWith('/documents/inbox')) return false;
    return pathname === '/documents' || pathname.startsWith('/documents/new') || /^\/documents\/[^/]+$/.test(pathname);
  }
  if (href === '/documents/history') return pathname.startsWith('/documents/history');
  if (href === '/documents/disposed') return pathname.startsWith('/documents/disposed');
  if (href === '/maintenances/expenses') return pathname.startsWith('/maintenances');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveNavigationContext(pathname: string): {
  groupId: string | null;
  groupLabel: string;
  item: NavigationItem;
} | null {
  if (pathname.startsWith('/documents/inbox')) {
    return { groupId: null, groupLabel: 'NFRP', item: primaryNavigationItems[1] };
  }

  const primaryItem = primaryNavigationItems.find((item) => isActivePath(pathname, item.href));
  if (primaryItem) return { groupId: null, groupLabel: 'NFRP', item: primaryItem };

  for (const group of navigationGroups) {
    const item = group.items.find((candidate) => isActivePath(pathname, candidate.href));
    if (item) return { groupId: group.id, groupLabel: group.label, item };
  }

  return null;
}

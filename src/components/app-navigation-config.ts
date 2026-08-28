import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Bell,
  Bot,
  Boxes,
  Building2,
  CarFront,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  History,
  Landmark,
  MapPinned,
  Palette,
  Route,
  ScanLine,
  Settings,
  SlidersHorizontal,
  Truck,
  UserRound,
  Warehouse,
  Wrench
} from 'lucide-react';

export type NavigationBadge = 'acquisitions' | 'documents' | 'expenses' | 'fines' | 'fuel' | 'leases' | 'tolls' | 'trips';

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
      { href: '/customers', label: 'Clienti', icon: Building2 },
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
      { href: '/tolls', label: 'Pedaggi', icon: Route, badge: 'tolls' },
      { href: '/leases', label: 'Leasing', icon: Landmark, badge: 'leases' },
      { href: '/road-accidents', label: 'Sinistri stradali', icon: CarFront },
      { href: '/fines', label: 'Verbali', icon: FileText, badge: 'fines' },
      { href: '/costs', label: 'Centro costi', icon: CircleDollarSign },
      { href: '/maintenances', label: 'Manutenzioni', icon: Wrench, badge: 'expenses' },
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
      { href: '/vehicles/tractors', label: 'Mezzi a motore', icon: Truck },
      { href: '/vehicles/trailers', label: 'Semirimorchi', icon: Archive },
      { href: '/vehicles/owners', label: 'Proprietari terzi', icon: Building2 },
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
  if (href === '/acquisitions') {
    return pathname === '/acquisitions' || pathname.startsWith('/acquisitions/') || pathname.startsWith('/documents/inbox');
  }
  if (href === '/documents') {
    if (pathname.startsWith('/documents/history') || pathname.startsWith('/documents/disposed') || pathname.startsWith('/documents/inbox')) return false;
    return pathname === '/documents' || pathname.startsWith('/documents/new') || /^\/documents\/[^/]+$/.test(pathname);
  }
  if (href === '/documents/history') return pathname.startsWith('/documents/history');
  if (href === '/documents/disposed') return pathname.startsWith('/documents/disposed');
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sotto questa soglia la sidebar diventa un pannello a scomparsa: i gruppi restano
 * richiusi per tenere il menu corto e per non lasciare decine di link fuori schermo.
 */
export const compactShellMediaQuery = '(max-width: 940px)';

/** Su desktop ogni gruppo e aperto: tutte le destinazioni sono raggiungibili con un click. */
export function getExpandedNavigationGroupIds(): string[] {
  return navigationGroups.map((group) => group.id);
}

/** Su schermo stretto resta aperto solo il gruppo della pagina corrente. */
export function getCompactExpandedNavigationGroupIds(pathname: string): string[] {
  const groupId = getActiveNavigationContext(pathname)?.groupId;
  return groupId ? [groupId] : [];
}

/** Ogni gruppo si apre e si chiude in modo indipendente dagli altri. */
export function toggleNavigationGroupId(expandedGroupIds: readonly string[], groupId: string): string[] {
  return expandedGroupIds.includes(groupId)
    ? expandedGroupIds.filter((id) => id !== groupId)
    : [...expandedGroupIds, groupId];
}

export function getActiveNavigationContext(pathname: string): {
  groupId: string | null;
  groupLabel: string;
  item: NavigationItem;
} | null {
  const primaryItem = primaryNavigationItems.find((item) => isActivePath(pathname, item.href));
  if (primaryItem) return { groupId: null, groupLabel: 'NFRP', item: primaryItem };

  for (const group of navigationGroups) {
    const item = group.items.find((candidate) => isActivePath(pathname, candidate.href));
    if (item) return { groupId: group.id, groupLabel: group.label, item };
  }

  return null;
}

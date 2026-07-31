'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, ClipboardList, FileUp, ReceiptText } from 'lucide-react';

const items = [
  { href: '/maintenances/expenses', label: 'Fatture e DDT', icon: ReceiptText, section: 'expenses' },
  { href: '/maintenances', label: 'Schede intervento', icon: ClipboardList, section: 'maintenances' },
  { href: '/maintenances/expenses/review', label: 'Da validare', icon: ClipboardCheck, section: 'review' },
  { href: '/maintenances/expenses/import', label: 'Importa PDF', icon: FileUp, section: 'import' }
] as const;

function activeSection(pathname: string): (typeof items)[number]['section'] {
  if (pathname.startsWith('/maintenances/expenses/review')) return 'review';
  if (pathname.startsWith('/maintenances/expenses/import')) return 'import';
  if (pathname.startsWith('/maintenances/expenses')) return 'expenses';
  return 'maintenances';
}

export function MaintenanceSectionNav() {
  const pathname = usePathname();
  const current = activeSection(pathname);

  return (
    <nav className="module-tabs" aria-label="Manutenzioni e fatture">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.section === current;
        return (
          <Link
            href={item.href}
            key={item.href}
            className={active ? 'is-active' : undefined}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={17} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

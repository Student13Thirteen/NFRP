'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, FileUp, Wrench } from 'lucide-react';

// Il registro e uno solo: le manutenzioni con una riga e quelle con le righe di una
// fattura o di un DDT stanno nello stesso elenco.
const items = [
  { href: '/maintenances', label: 'Manutenzioni', icon: Wrench, section: 'maintenances' },
  { href: '/maintenances/expenses/review', label: 'Da controllare', icon: ClipboardCheck, section: 'review' },
  { href: '/maintenances/expenses/import', label: 'Importa manutenzioni da PDF', icon: FileUp, section: 'import' }
] as const;

function activeSection(pathname: string): (typeof items)[number]['section'] {
  if (pathname.startsWith('/maintenances/expenses/review')) return 'review';
  if (pathname.startsWith('/maintenances/expenses/import')) return 'import';
  return 'maintenances';
}

export function MaintenanceSectionNav() {
  const pathname = usePathname();
  const current = activeSection(pathname);

  return (
    <nav className="module-tabs" aria-label="Area manutenzioni">
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

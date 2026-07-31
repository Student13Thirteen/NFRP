import { requireUser } from '@/lib/auth';
import { PoweredByNFRP } from '@/components/AppBrand';
import { AppNavigation } from '@/components/AppNavigation';
import { AssistantChatWidget } from '@/components/AssistantChatWidget';
import { DashboardSectionMenu } from '@/components/DashboardSectionMenu';
import { FlashMessage } from '@/components/FlashMessage';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getAssistantEnabled } from '@/lib/env';
import { getBranding } from '@/lib/branding';
import { getFlashMessage } from '@/lib/flash';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [branding, flash, documents, trips, fuel, tolls, expenses, leaseContracts, leaseInvoices] = await Promise.all([
    getBranding(),
    getFlashMessage(),
    prisma.documentInboxItem.count({ where: { status: 'PENDING' } }),
    prisma.tripImportRow.count({ where: { status: 'PENDING' } }),
    prisma.fuelEntry.count({ where: { status: 'PENDING' } }),
    prisma.tollEntry.count({ where: { status: 'PENDING' } }),
    prisma.expenseDocument.count({ where: { status: 'PENDING', source: { not: 'LEASE_INVOICE_IMPORT' } } }),
    prisma.leaseContract.count({ where: { status: 'PENDING' } }),
    prisma.expenseDocument.count({ where: { status: 'PENDING', source: 'LEASE_INVOICE_IMPORT' } })
  ]);
  const assistantEnabled = getAssistantEnabled();
  const leases = leaseContracts + leaseInvoices;
  const queueCounts = {
    documents,
    trips,
    fuel,
    leases,
    tolls,
    expenses,
    acquisitions: documents + trips + fuel + tolls + expenses + leases
  };

  return (
    <div className="app-shell">
      <AppNavigation branding={branding} queueCounts={queueCounts} userEmail={user.email} />
      <main className="main-content">
        <div className="top-utility-bar">
          <DashboardSectionMenu />
          <ThemeToggle />
        </div>
        <FlashMessage key={flash?.createdAt ?? 'empty-flash'} flash={flash} />
        {children}
      </main>
      {assistantEnabled ? <AssistantChatWidget /> : null}
      <PoweredByNFRP />
    </div>
  );
}

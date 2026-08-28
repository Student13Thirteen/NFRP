import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RegistryTable, type RegistryTableRow } from '@/components/RegistrySearch';
import { prisma } from '@/lib/db';
import { getDriverEmploymentSummary, getDriverEmploymentSummaryLabel } from '@/lib/driver-employment-core';
import { findCurrentDriverAssignment, formatPlateList } from '@/lib/fleet-pairing';
import { buildRegistrySearchText } from '@/lib/registry-search';

export default async function DriversPage() {
  await requireUser();
  const drivers = await prisma.driver.findMany({
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      employmentPeriods: { select: { startDate: true, endDate: true } },
      // Il mezzo di oggi e il suo semirimorchio: cosi l'elenco autisti risponde
      // gia alla domanda "con cosa gira" senza aprire la scheda.
      tractorAssignments: {
        select: {
          validFrom: true,
          validTo: true,
          tractor: {
            select: {
              id: true,
              plate: true,
              assignedTrailers: { select: { id: true, plate: true }, orderBy: { plate: 'asc' } }
            }
          }
        },
        orderBy: { validFrom: 'desc' }
      },
      _count: { select: { documents: true } }
    }
  });

  const rows: RegistryTableRow[] = drivers.map((driver) => {
    const driverHref = `/drivers/${driver.id}`;
    const employment = getDriverEmploymentSummary(driver.employmentPeriods);
    const employmentLabel = getDriverEmploymentSummaryLabel(employment);
    const currentAssignment = findCurrentDriverAssignment(driver.tractorAssignments);
    const tractor = currentAssignment?.tractor || null;
    const trailerPlates = tractor ? formatPlateList(tractor.assignedTrailers) : null;
    const statusLabel = driver.active ? 'Attivo' : 'Non attivo';

    return {
      id: driver.id,
      search: buildRegistrySearchText([
        driver.lastName,
        driver.firstName,
        driver.phone,
        driver.email,
        driver.notes,
        tractor?.plate,
        trailerPlates,
        statusLabel,
        employmentLabel
      ]),
      cells: (
        <>
          <td className="click-cell">
            <Link className="table-cell-link" href={driverHref}>
              <strong>
                {driver.lastName} {driver.firstName}
              </strong>
              {driver.notes ? <div className="muted">{driver.notes}</div> : null}
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={driverHref}>
              {driver.phone || '-'}
              <div className="muted">{driver.email || ''}</div>
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={driverHref}>
              {tractor ? <strong>{tractor.plate}</strong> : <span className="muted">Nessuno oggi</span>}
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={driverHref}>
              {trailerPlates || <span className="muted">Nessuno oggi</span>}
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={driverHref}>
              {statusLabel}
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={driverHref}>{employmentLabel}</Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={driverHref}>
              {driver._count.documents}
            </Link>
          </td>
        </>
      )
    };
  });

  return (
    <>
      <PageHeader
        title="Autisti"
        description="Anagrafica autisti, mezzo abbinato oggi e documenti collegati."
        action={
          <Link className="primary-button" href="/drivers/new">
            <Plus size={16} aria-hidden />
            Nuovo autista
          </Link>
        }
      />
      <RegistryTable
        rows={rows}
        columnCount={7}
        searchLabel="Cerca autista"
        searchPlaceholder="Cognome, nome, telefono, email, targa..."
        entityLabel="autisti"
        emptyText="Nessun autista in anagrafica. Usa Nuovo autista per inserire il primo."
        head={
          <tr>
            <th>Autista</th>
            <th>Contatti</th>
            <th>Mezzo a motore</th>
            <th>Semirimorchio</th>
            <th>Stato</th>
            <th>Rapporto di lavoro</th>
            <th>Documenti</th>
          </tr>
        }
      />
    </>
  );
}

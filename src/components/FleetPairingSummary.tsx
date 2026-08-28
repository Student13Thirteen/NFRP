import Link from 'next/link';
import { Container, Truck, UserRound } from 'lucide-react';
import { NO_DRIVER_LABEL, NO_TRACTOR_LABEL, NO_TRAILER_LABEL } from '@/lib/fleet-pairing';

type PairedVehicle = { id: string; plate: string; detail?: string | null };
type PairedDriver = { id: string; name: string; detail?: string | null };

type FleetPairingSummaryProps = {
  /** Scheda da cui si guarda il complesso: viene mostrata senza collegamento a se stessa. */
  current: 'driver' | 'tractor' | 'trailer';
  driver: PairedDriver | null;
  tractor: PairedVehicle | null;
  trailers: PairedVehicle[];
};

type PairingCardProps = {
  title: string;
  icon: React.ReactNode;
  isCurrent: boolean;
  emptyLabel: string;
  emptyHint: string;
  children?: React.ReactNode;
  hasValue: boolean;
};

function PairingCard({ title, icon, isCurrent, emptyLabel, emptyHint, hasValue, children }: PairingCardProps) {
  return (
    <div className={`fleet-pairing-card${isCurrent ? ' is-current' : ''}${hasValue ? '' : ' is-empty'}`}>
      <span className="fleet-pairing-role">
        {icon}
        {title}
        {isCurrent ? <span className="badge valid">Questa scheda</span> : null}
      </span>
      {hasValue ? (
        <div className="fleet-pairing-value">{children}</div>
      ) : (
        <div className="fleet-pairing-value">
          <strong className="muted">{emptyLabel}</strong>
          <span className="muted">{emptyHint}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Riepilogo `autista - mezzo a motore - semirimorchio` valido oggi.
 *
 * Serve a leggere in un colpo solo le due anagrafiche collegate a quella
 * aperta. Le informazioni non sono mai dedotte: l'autista arriva dal periodo di
 * assegnazione al trattore e il semirimorchio dall'abbinamento registrato. Se
 * un collegamento manca viene detto esplicitamente, insieme a dove si imposta.
 */
export function FleetPairingSummary({ current, driver, tractor, trailers }: FleetPairingSummaryProps) {
  return (
    <section className="panel fleet-pairing-panel" aria-label="Complesso di oggi">
      <div className="section-heading-inline">
        <div>
          <h2>Complesso di oggi</h2>
          <p className="muted">
            Autista, mezzo a motore e semirimorchio collegati alla data odierna. L&apos;autista dipende dal periodo di
            assegnazione al mezzo, il semirimorchio dall&apos;abbinamento registrato.
          </p>
        </div>
      </div>
      <div className="fleet-pairing-grid">
        <PairingCard
          title="Autista"
          icon={<UserRound size={16} aria-hidden />}
          isCurrent={current === 'driver'}
          hasValue={Boolean(driver)}
          emptyLabel={NO_DRIVER_LABEL}
          emptyHint={
            tractor
              ? `Registra il periodo nella sezione Assegnazioni autista di ${tractor.plate}.`
              : 'Serve prima un mezzo a motore abbinato.'
          }
        >
          {driver ? (
            current === 'driver' ? (
              <strong>{driver.name}</strong>
            ) : (
              <Link href={`/drivers/${driver.id}`}>
                <strong>{driver.name}</strong>
              </Link>
            )
          ) : null}
          {driver?.detail ? <span className="muted">{driver.detail}</span> : null}
        </PairingCard>

        <PairingCard
          title="Mezzo a motore"
          icon={<Truck size={16} aria-hidden />}
          isCurrent={current === 'tractor'}
          hasValue={Boolean(tractor)}
          emptyLabel={NO_TRACTOR_LABEL}
          emptyHint={
            current === 'driver'
              ? 'Apri il mezzo interessato e aggiungi il periodo con questo autista.'
              : 'Scegli il mezzo nel campo Trattore abbinato di questa scheda.'
          }
        >
          {tractor ? (
            current === 'tractor' ? (
              <strong>{tractor.plate}</strong>
            ) : (
              <Link href={`/vehicles/tractors/${tractor.id}`}>
                <strong>{tractor.plate}</strong>
              </Link>
            )
          ) : null}
          {tractor?.detail ? <span className="muted">{tractor.detail}</span> : null}
        </PairingCard>

        <PairingCard
          title="Semirimorchio"
          icon={<Container size={16} aria-hidden />}
          isCurrent={current === 'trailer'}
          hasValue={trailers.length > 0}
          emptyLabel={NO_TRAILER_LABEL}
          emptyHint={
            tractor
              ? `Abbina la targa nella sezione Semirimorchio abbinato di ${tractor.plate}.`
              : 'Serve prima un mezzo a motore abbinato.'
          }
        >
          {trailers.map((trailer) => (
            <div key={trailer.id}>
              {current === 'trailer' ? (
                <strong>{trailer.plate}</strong>
              ) : (
                <Link href={`/vehicles/trailers/${trailer.id}`}>
                  <strong>{trailer.plate}</strong>
                </Link>
              )}
              {trailer.detail ? <span className="muted"> {trailer.detail}</span> : null}
            </div>
          ))}
        </PairingCard>
      </div>
    </section>
  );
}

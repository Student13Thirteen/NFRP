import { DatePartsInput } from '@/components/DatePartsInput';
import type { RoadAccident, RoadFine } from '@prisma/client';
import { RoadEventFileUpload } from '@/components/RoadEventFileUpload';
import { toDateInputValue } from '@/lib/dates';
import {
  getRoadAccidentResponsibilityLabel,
  getRoadAccidentStatusLabel,
  getRoadFineResponsibilityLabel,
  getRoadFineStatusLabel,
  getRoadEventAttachmentKindLabel,
  ROAD_ACCIDENT_RESPONSIBILITIES,
  ROAD_ACCIDENT_STATUSES,
  ROAD_FINE_RESPONSIBILITIES,
  ROAD_FINE_STATUSES,
  ROAD_EVENT_ATTACHMENT_KINDS,
  roadEventMoneyInput
} from '@/lib/road-events';

type Option = { id: string; label: string };
type CommonProps = { tractors: Option[]; trailers: Option[]; drivers: Option[]; showInitialFiles?: boolean };

export function RoadFineFields({ tractors, trailers, drivers, fine, showInitialFiles = false }: CommonProps & { fine?: RoadFine }) {
  return (
    <>
      <div className="form-section-title">Verbale</div>
      <div className="form-grid">
        <label>Stato<select name="status" defaultValue={fine?.status || 'TO_REVIEW'}>{ROAD_FINE_STATUSES.map((value) => <option key={value} value={value}>{getRoadFineStatusLabel(value)}</option>)}</select></label>
        <label>Responsabilità<select name="responsibility" defaultValue={fine?.responsibility || 'TO_ASSESS'}>{ROAD_FINE_RESPONSIBILITIES.map((value) => <option key={value} value={value}>{getRoadFineResponsibilityLabel(value)}</option>)}</select></label>
        <label>Numero verbale<input name="noticeNumber" defaultValue={fine?.noticeNumber || ''} /></label>
        <label>Autorità emittente<input name="authority" required defaultValue={fine?.authority || ''} placeholder="Polizia stradale, Comune, ente" /></label>
        <DatePartsInput label="Data infrazione" name="violationDate" required defaultValue={fine?.violationDate ? toDateInputValue(fine.violationDate) : toDateInputValue(new Date())} />
        <label>Ora infrazione<input name="violationTime" type="time" defaultValue={fine?.violationTime || ''} /></label>
        <DatePartsInput label="Data notifica" name="notificationDate" defaultValue={fine?.notificationDate ? toDateInputValue(fine.notificationDate) : ''} />
        <label>Luogo<input name="location" required defaultValue={fine?.location || ''} /></label>
        <label>Articolo / violazione<input name="violationCode" defaultValue={fine?.violationCode || ''} placeholder="Es. art. 142 CdS" /></label>
      </div>
      <label>Descrizione del verbale<textarea name="description" required rows={4} defaultValue={fine?.description || ''} /></label>

      <div className="form-section-title">Mezzi e autista</div>
      <div className="form-grid">
        <label>Mezzo a motore<select name="tractorId" defaultValue={fine?.tractorId || ''}><option value="">Nessuno / non definito</option>{tractors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Semirimorchio<select name="trailerId" defaultValue={fine?.trailerId || ''}><option value="">Nessuno / non definito</option>{trailers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Autista<select name="driverId" defaultValue={fine?.driverId || ''}><option value="">Nessuno / da definire</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Punti patente<input name="pointsDeducted" inputMode="numeric" defaultValue={fine?.pointsDeducted ?? ''} /></label>
      </div>

      <div className="form-section-title">Importi e scadenze</div>
      <div className="form-grid">
        <label>Importo ridotto (€)<input name="reducedAmount" inputMode="decimal" defaultValue={roadEventMoneyInput(fine?.reducedAmountCents)} placeholder="0.00" /></label>
        <label>Importo ordinario (€)<input name="standardAmount" inputMode="decimal" defaultValue={roadEventMoneyInput(fine?.standardAmountCents)} placeholder="0.00" /></label>
        <DatePartsInput label="Scadenza importo ridotto" name="discountedPaymentDueDate" defaultValue={fine?.discountedPaymentDueDate ? toDateInputValue(fine.discountedPaymentDueDate) : ''} />
        <DatePartsInput label="Scadenza pagamento" name="paymentDueDate" defaultValue={fine?.paymentDueDate ? toDateInputValue(fine.paymentDueDate) : ''} />
        <DatePartsInput label="Scadenza ricorso" name="appealDueDate" defaultValue={fine?.appealDueDate ? toDateInputValue(fine.appealDueDate) : ''} />
        <label>Importo pagato (€)<input name="paidAmount" inputMode="decimal" defaultValue={roadEventMoneyInput(fine?.paidAmountCents)} placeholder="0.00" /></label>
        <DatePartsInput label="Data pagamento" name="paymentDate" defaultValue={fine?.paymentDate ? toDateInputValue(fine.paymentDate) : ''} />
        <label>Riferimento pagamento<input name="paymentReference" defaultValue={fine?.paymentReference || ''} /></label>
        <label>Addebito all’autista (€)<input name="driverCharge" inputMode="decimal" defaultValue={roadEventMoneyInput(fine?.driverChargeCents)} placeholder="0.00" /></label>
      </div>
      <label>Note operative<textarea name="notes" rows={4} defaultValue={fine?.notes || ''} /></label>
      {showInitialFiles ? (
        <div className="form-grid">
          <label>
            Tipo degli allegati iniziali
            <select name="attachmentKind" defaultValue="NOTICE">
              {ROAD_EVENT_ATTACHMENT_KINDS.map((kind) => <option key={kind} value={kind}>{getRoadEventAttachmentKindLabel(kind)}</option>)}
            </select>
          </label>
          <RoadEventFileUpload />
        </div>
      ) : null}
    </>
  );
}

export function RoadAccidentFields({ tractors, trailers, drivers, accident, showInitialFiles = false }: CommonProps & { accident?: RoadAccident }) {
  return (
    <>
      <div className="form-section-title">Sinistro stradale</div>
      <div className="form-grid">
        <label>Stato<select name="status" defaultValue={accident?.status || 'REPORTED'}>{ROAD_ACCIDENT_STATUSES.map((value) => <option key={value} value={value}>{getRoadAccidentStatusLabel(value)}</option>)}</select></label>
        <label>Responsabilità<select name="responsibility" defaultValue={accident?.responsibility || 'TO_ASSESS'}>{ROAD_ACCIDENT_RESPONSIBILITIES.map((value) => <option key={value} value={value}>{getRoadAccidentResponsibilityLabel(value)}</option>)}</select></label>
        <DatePartsInput label="Data sinistro" name="accidentDate" required defaultValue={accident?.accidentDate ? toDateInputValue(accident.accidentDate) : toDateInputValue(new Date())} />
        <label>Ora sinistro<input name="accidentTime" type="time" defaultValue={accident?.accidentTime || ''} /></label>
        <label>Luogo<input name="location" required defaultValue={accident?.location || ''} /></label>
      </div>
      <label>Dinamica<textarea name="description" required rows={5} defaultValue={accident?.description || ''} /></label>

      <div className="form-section-title">Mezzi, autista e conseguenze</div>
      <div className="form-grid">
        <label>Mezzo a motore<select name="tractorId" defaultValue={accident?.tractorId || ''}><option value="">Nessuno / non definito</option>{tractors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Semirimorchio<select name="trailerId" defaultValue={accident?.trailerId || ''}><option value="">Nessuno / non definito</option>{trailers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Autista<select name="driverId" defaultValue={accident?.driverId || ''}><option value="">Nessuno / da definire</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>
      <div className="form-grid">
        <label className="checkbox-row"><input name="hasInjuries" type="checkbox" defaultChecked={Boolean(accident?.hasInjuries)} />Ci sono feriti</label>
        <label className="checkbox-row"><input name="cargoInvolved" type="checkbox" defaultChecked={Boolean(accident?.cargoInvolved)} />Merce coinvolta</label>
        <label className="checkbox-row"><input name="vehicleImmobilized" type="checkbox" defaultChecked={Boolean(accident?.vehicleImmobilized)} />Mezzo immobilizzato</label>
        <label className="checkbox-row"><input name="towRequired" type="checkbox" defaultChecked={Boolean(accident?.towRequired)} />Traino necessario</label>
      </div>
      <label>Controparti<textarea name="thirdPartyDetails" rows={3} defaultValue={accident?.thirdPartyDetails || ''} /></label>
      <div className="form-grid">
        <label>Testimoni<textarea name="witnesses" rows={3} defaultValue={accident?.witnesses || ''} /></label>
        <label>Autorità intervenute<textarea name="authorityDetails" rows={3} defaultValue={accident?.authorityDetails || ''} /></label>
      </div>

      <div className="form-section-title">Assicurazione e pratica</div>
      <div className="form-grid">
        <label>Compagnia assicurativa<input name="insurerName" defaultValue={accident?.insurerName || ''} /></label>
        <label>Numero polizza<input name="policyNumber" defaultValue={accident?.policyNumber || ''} /></label>
        <label>Numero pratica<input name="claimNumber" defaultValue={accident?.claimNumber || ''} /></label>
        <DatePartsInput label="Data denuncia" name="reportedDate" defaultValue={accident?.reportedDate ? toDateInputValue(accident.reportedDate) : ''} />
        <DatePartsInput label="Prossima scadenza" name="nextDeadline" defaultValue={accident?.nextDeadline ? toDateInputValue(accident.nextDeadline) : ''} />
        <DatePartsInput label="Data chiusura" name="closedDate" defaultValue={accident?.closedDate ? toDateInputValue(accident.closedDate) : ''} />
      </div>

      <div className="form-section-title">Danni, costi e rimborsi</div>
      <p className="muted">Stime e franchigia sono informative. Nel centro costi entrano soltanto il costo diretto e il rimborso con la relativa data. Non ripetere qui fatture già registrate come manutenzione.</p>
      <div className="form-grid">
        <label>Danno stimato (€)<input name="estimatedDamage" inputMode="decimal" defaultValue={roadEventMoneyInput(accident?.estimatedDamageCents)} placeholder="0.00" /></label>
        <label>Franchigia (€)<input name="deductible" inputMode="decimal" defaultValue={roadEventMoneyInput(accident?.deductibleCents)} placeholder="0.00" /></label>
        <label>Costo diretto contabilizzato (€)<input name="directCost" inputMode="decimal" defaultValue={roadEventMoneyInput(accident?.directCostCents)} placeholder="0.00" /></label>
        <DatePartsInput label="Data costo diretto" name="directCostDate" defaultValue={accident?.directCostDate ? toDateInputValue(accident.directCostDate) : ''} />
        <label>Rimborso incassato (€)<input name="reimbursement" inputMode="decimal" defaultValue={roadEventMoneyInput(accident?.reimbursementCents)} placeholder="0.00" /></label>
        <DatePartsInput label="Data rimborso" name="reimbursementDate" defaultValue={accident?.reimbursementDate ? toDateInputValue(accident.reimbursementDate) : ''} />
      </div>
      <label>Note operative<textarea name="notes" rows={4} defaultValue={accident?.notes || ''} /></label>
      {showInitialFiles ? (
        <div className="form-grid">
          <label>
            Tipo degli allegati iniziali
            <select name="attachmentKind" defaultValue="CAI">
              {ROAD_EVENT_ATTACHMENT_KINDS.map((kind) => <option key={kind} value={kind}>{getRoadEventAttachmentKindLabel(kind)}</option>)}
            </select>
          </label>
          <RoadEventFileUpload />
        </div>
      ) : null}
    </>
  );
}

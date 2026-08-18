import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { CustomerFormFields } from '@/components/CustomerFormFields';
import { PageHeader } from '@/components/PageHeader';
import { buildMapsHref } from '@/lib/addresses';
import { prisma } from '@/lib/db';
import { deleteCustomerAction, updateCustomerAction } from '../actions';

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function CustomerDetailPage({ params, searchParams }: CustomerDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { containerTrips: true } } }
  });
  if (!customer) notFound();
  const mapsHref = buildMapsHref(customer);

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`${customer._count.containerTrips} trasporti container collegati.`}
        action={<div className="actions-row">
          {mapsHref ? <Link className="primary-button" href={mapsHref} target="_blank"><MapPin size={16} aria-hidden />Apri in Maps</Link> : null}
          <Link className="secondary-button" href="/customers"><ArrowLeft size={16} aria-hidden />Clienti</Link>
        </div>}
      />
      {query.error ? <p className="form-error" style={{ marginBottom: 18 }}>{query.error}</p> : null}
      <section className="panel">
        <h2>Modifica cliente</h2>
        <form action={updateCustomerAction.bind(null, customer.id)} className="form-stack">
          <CustomerFormFields defaultValues={customer} />
          <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={customer.active} />Attivo</label>
          <button className="primary-button" type="submit"><Save size={16} aria-hidden />Salva modifiche</button>
        </form>
        <div className="record-actions">
          <form action={deleteCustomerAction.bind(null, customer.id)}>
            <ConfirmSubmitButton
              className="danger-button"
              message="Eliminare questo cliente? I viaggi collegati conserveranno ragione sociale e codice presenti nella loro scheda."
            >
              <Trash2 size={16} aria-hidden />Elimina cliente
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>
    </>
  );
}

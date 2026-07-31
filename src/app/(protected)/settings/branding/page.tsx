import Image from 'next/image';
import type { CSSProperties } from 'react';
import { Palette, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { requireUser } from '@/lib/auth';
import { getBranding } from '@/lib/branding';
import { updateBrandingAction } from './actions';

export default async function BrandingSettingsPage() {
  await requireUser();
  const branding = await getBranding();

  return (
    <>
      <PageHeader
        title="Identità aziendale"
        description="Personalizza nome, logo e colori senza modificare il codice."
      />
      <div className="grid two branding-settings-grid">
        <section className="panel">
          <h2>Configurazione</h2>
          <form action={updateBrandingAction} className="form-stack" encType="multipart/form-data">
            <div className="form-grid">
              <label>
                Nome azienda
                <input name="companyName" defaultValue={branding.companyName} maxLength={120} required />
              </label>
              <label>
                Nome prodotto
                <input name="productName" defaultValue={branding.productName} maxLength={40} required />
              </label>
              <label className="form-grid-span-2">
                Sottotitolo
                <input name="subtitle" defaultValue={branding.subtitle} maxLength={80} required />
              </label>
            </div>

            <div className="brand-color-grid">
              <label>
                Colore principale
                <span className="color-input-row">
                  <input name="primaryColor" type="color" defaultValue={branding.primaryColor} />
                  <code>{branding.primaryColor}</code>
                </span>
              </label>
              <label>
                Principale scuro
                <span className="color-input-row">
                  <input name="primaryDarkColor" type="color" defaultValue={branding.primaryDarkColor} />
                  <code>{branding.primaryDarkColor}</code>
                </span>
              </label>
              <label>
                Barra laterale
                <span className="color-input-row">
                  <input name="sidebarColor" type="color" defaultValue={branding.sidebarColor} />
                  <code>{branding.sidebarColor}</code>
                </span>
              </label>
              <label>
                Accento positivo
                <span className="color-input-row">
                  <input name="accentColor" type="color" defaultValue={branding.accentColor} />
                  <code>{branding.accentColor}</code>
                </span>
              </label>
            </div>

            <label>
              Logo aziendale
              <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
              <span className="field-help">PNG, JPG o WebP; massimo 2 MB. Formato orizzontale consigliato.</span>
            </label>
            {branding.logoUrl ? (
              <label className="checkbox-row">
                <input name="removeLogo" type="checkbox" />
                Rimuovi il logo attuale
              </label>
            ) : null}

            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Applica identità
            </button>
          </form>
        </section>

        <section className="panel brand-preview-panel" style={{ '--brand-preview-sidebar': branding.sidebarColor } as CSSProperties}>
          <h2>Anteprima</h2>
          <div className="brand-preview-shell">
            <div className="brand-preview-sidebar">
              {branding.logoUrl ? (
                <Image
                  src={branding.logoUrl}
                  alt={`Logo ${branding.companyName}`}
                  width={240}
                  height={80}
                  sizes="240px"
                  unoptimized
                />
              ) : (
                <strong>{branding.productName}</strong>
              )}
              <span>{branding.companyName}</span>
              <small>{branding.subtitle}</small>
            </div>
            <div className="brand-preview-main">
              <Palette size={28} aria-hidden />
              <strong>Interfaccia personalizzata</strong>
              <span>La configurazione è salvata nel database e resta separata dal codice.</span>
              <button type="button" style={{ background: branding.primaryColor }}>Azione principale</button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

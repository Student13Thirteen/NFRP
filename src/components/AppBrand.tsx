import Image from 'next/image';
import type { BrandingConfig } from '@/lib/branding-types';

type AppBrandVariant = 'auth' | 'sidebar' | 'dashboard' | 'powered';

type AppBrandProps = {
  branding?: BrandingConfig;
  className?: string;
  subtitle?: string;
  title?: string;
  variant?: AppBrandVariant;
};

export function BrandLogo({
  branding,
  className = '',
  variant = 'dashboard'
}: Pick<AppBrandProps, 'branding' | 'className' | 'variant'>) {
  if (variant === 'dashboard' || variant === 'powered') return null;

  return (
    <span className={`brand-logo brand-logo-${variant} ${className}`.trim()} aria-hidden="true">
      {branding?.logoUrl ? (
        <Image
          src={branding.logoUrl}
          alt=""
          width={240}
          height={80}
          sizes="240px"
          unoptimized
        />
      ) : (
        <span className="brand-monogram">{branding?.productName || 'NFRP'}</span>
      )}
    </span>
  );
}

export function AppBrand({
  branding,
  className = '',
  subtitle,
  title,
  variant = 'dashboard'
}: AppBrandProps) {
  const resolvedTitle = title || branding?.companyName || 'Demo Logistics S.r.l.';
  const resolvedSubtitle = subtitle || branding?.subtitle || 'Operations Platform';

  return (
    <div className={`app-brand app-brand-${variant} ${className}`.trim()}>
      <BrandLogo branding={branding} variant={variant} />
      <div className="app-brand-copy">
        <strong>{resolvedTitle}</strong>
        {resolvedSubtitle ? <span>{resolvedSubtitle}</span> : null}
      </div>
    </div>
  );
}

export function PoweredByNFRP() {
  return (
    <div className="powered-by-nfrp" aria-label="Powered by NFRP">
      <span>
        Powered by <strong>NFRP</strong>
      </span>
    </div>
  );
}

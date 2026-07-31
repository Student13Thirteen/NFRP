'use client';

import { FileDown } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

type FilteredReportButtonProps = {
  baseHref: string;
  fixedParams?: Record<string, string>;
  label?: string;
};

export function FilteredReportButton({ baseHref, fixedParams, label = 'Report PDF' }: FilteredReportButtonProps) {
  const searchParams = useSearchParams();
  const reportParams = new URLSearchParams(searchParams.toString());
  reportParams.delete('page');
  reportParams.delete('pageSize');
  for (const [key, value] of Object.entries(fixedParams || {})) reportParams.set(key, value);
  const query = reportParams.toString();
  const href = query ? `${baseHref}?${query}` : baseHref;

  return (
    <a className="secondary-button" href={href} target="_blank" rel="noreferrer">
      <FileDown size={16} aria-hidden />
      {label}
    </a>
  );
}

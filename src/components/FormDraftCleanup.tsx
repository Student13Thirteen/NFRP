'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isFormDraftStorageKey } from '@/lib/form-draft';

export function FormDraftCleanup() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (searchParams.has('error')) return;
    try {
      const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
        .filter((key): key is string => key !== null && isFormDraftStorageKey(key));
      for (const key of keys) sessionStorage.removeItem(key);
    } catch {
      // La pulizia e un aiuto di riservatezza: storage disabilitato non deve bloccare la pagina.
    }
  }, [pathname, search, searchParams]);

  return null;
}

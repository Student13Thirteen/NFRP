import { MaintenanceSectionNav } from '@/components/MaintenanceSectionNav';

export default function MaintenancesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MaintenanceSectionNav />
      {children}
    </>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { MachinesPage } from "@/features/machines/machines-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  const resolvedSearchParams = await searchParams;

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="machines"
    >
      <MachinesPage searchParams={resolvedSearchParams} />
    </AppShell>
  );
}

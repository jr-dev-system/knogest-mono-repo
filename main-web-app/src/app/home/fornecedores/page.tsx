import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { FuelSuppliersPage } from "@/features/fuel-suppliers/fuel-suppliers-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ companies, selectedCompany }, resolvedSearchParams] =
    await Promise.all([requireCompanyWorkspace(), searchParams]);

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="suppliers"
    >
      <FuelSuppliersPage searchParams={resolvedSearchParams} />
    </AppShell>
  );
}

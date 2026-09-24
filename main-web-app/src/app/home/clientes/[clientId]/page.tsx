import { AppShell } from "@/components/layout/app-shell";
import { RegistryDetailPage } from "@/features/commercial-registry/components/registry-detail-page";
import { getRegistryDetail } from "@/features/commercial-registry/commercial-registry.server";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";

export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const [{ companies, selectedCompany }, { clientId }] = await Promise.all([
    requireCompanyWorkspace(),
    params,
  ]);
  const record = await getRegistryDetail("clients", clientId);

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="clients"
    >
      <RegistryDetailPage
        backHref="/home/clientes"
        record={record}
        title="Detalhe do cliente"
      />
    </AppShell>
  );
}

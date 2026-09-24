import { AppShell } from "@/components/layout/app-shell";
import { RegistryDetailPage } from "@/features/commercial-registry/components/registry-detail-page";
import {
  getRegistryDetail,
  getSupplierCatalogOptions,
} from "@/features/commercial-registry/commercial-registry.server";
import {
  lookupRegistryAddressByCepAction,
  removeSupplierOfferAction,
  saveSupplierOfferAction,
  updateFuelSupplierAction,
} from "@/features/commercial-registry/commercial-registry.actions";
import { getInitialRegistryActionState } from "@/features/commercial-registry/commercial-registry-action-state";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ fuelSupplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [
    { companies, selectedCompany },
    { fuelSupplierId },
    resolvedSearchParams,
  ] = await Promise.all([requireCompanyWorkspace(), params, searchParams]);
  const [record, catalog] = await Promise.all([
    getRegistryDetail("suppliers", fuelSupplierId),
    getSupplierCatalogOptions(),
  ]);
  const requestedTab = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab;
  const backHref =
    requestedTab === "suppliers"
      ? "/home/fornecedores?tab=suppliers"
      : "/home/fornecedores";

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="suppliers"
    >
      <RegistryDetailPage
        backHref={backHref}
        catalog={catalog}
        initialOfferState={getInitialRegistryActionState()}
        openCatalogOnLoad={resolvedSearchParams.catalog === "new"}
        record={record}
        lookupAddressByCep={lookupRegistryAddressByCepAction}
        removeOfferAction={removeSupplierOfferAction}
        saveOfferAction={saveSupplierOfferAction}
        updateSupplierAction={updateFuelSupplierAction}
        title="Detalhe do fornecedor"
      />
    </AppShell>
  );
}

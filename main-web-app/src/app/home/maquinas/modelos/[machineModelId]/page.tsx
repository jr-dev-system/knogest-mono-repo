import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { MachineModelDetailPage } from "@/features/machines/components/machine-model-detail-page";
import {
  addMachineModelUnitsAction,
  getMachineAllocationProjectContextAction,
  searchMachineAllocationProjectsAction,
} from "@/features/machines/machines.actions";
import { getMachineModelDetail } from "@/features/machines/machines.server";

export default async function Page({
  params,
}: {
  params: Promise<{ machineModelId: string }>;
}) {
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  const { machineModelId } = await params;
  const model = await getMachineModelDetail(machineModelId);
  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="machines"
    >
      <MachineModelDetailPage
        model={model}
        action={addMachineModelUnitsAction.bind(null, machineModelId)}
        loadProjectAction={getMachineAllocationProjectContextAction}
        searchProjectsAction={searchMachineAllocationProjectsAction}
      />
    </AppShell>
  );
}

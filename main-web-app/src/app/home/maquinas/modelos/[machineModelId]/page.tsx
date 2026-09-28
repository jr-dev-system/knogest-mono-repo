import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { MachineModelDetailPage } from "@/features/machines/components/machine-model-detail-page";
import {
  addMachineModelUnitsAction,
  deleteMachineModelAction,
  getMachineAllocationProjectContextAction,
  searchMachineAllocationProjectsAction,
  updateMachineModelAction,
} from "@/features/machines/machines.actions";
import { getMachineModelDetail } from "@/features/machines/machines.server";
import { getJobRoles } from "@/features/employees/employees.server";

export default async function Page({
  params,
}: {
  params: Promise<{ machineModelId: string }>;
}) {
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  const { machineModelId } = await params;
  const [model, jobRoles] = await Promise.all([
    getMachineModelDetail(machineModelId),
    getJobRoles(),
  ]);
  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="machines"
    >
      <MachineModelDetailPage
        model={model}
        action={addMachineModelUnitsAction.bind(null, machineModelId)}
        deleteAction={deleteMachineModelAction.bind(null, machineModelId)}
        jobRoles={(jobRoles ?? []).filter((role) => role.isActive)}
        loadProjectAction={getMachineAllocationProjectContextAction}
        searchProjectsAction={searchMachineAllocationProjectsAction}
        updateAction={updateMachineModelAction.bind(null, machineModelId)}
      />
    </AppShell>
  );
}

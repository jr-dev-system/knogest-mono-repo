import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { MachineModelDetailPage } from "@/features/machines/components/machine-model-detail-page";
import { addMachineModelUnitsAction } from "@/features/machines/machines.actions";
import { getMachineModelDetail } from "@/features/machines/machines.server";

export default async function Page({
  params,
}: {
  params: Promise<{ machineModelId: string }>;
}) {
  const { companies, selectedCompany, session } = await requireCompanyWorkspace();
  const { machineModelId } = await params;
  const model = await getMachineModelDetail(machineModelId);
  return (
    <AppShell companies={companies} selectedCompany={selectedCompany} userId={session.user.id} currentArea="machines">
      <MachineModelDetailPage model={model} action={addMachineModelUnitsAction.bind(null, machineModelId)} />
    </AppShell>
  );
}

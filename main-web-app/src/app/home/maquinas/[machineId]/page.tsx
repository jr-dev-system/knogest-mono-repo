import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { MachineDetailPage } from "@/features/machines/components/machine-detail-page";
import { updateMachineLoadSpecificationAction } from "@/features/machines/machines.actions";
import { getMachineDetail } from "@/features/machines/machines.server";

export default async function Page({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  const { machineId } = await params;
  const machine = await getMachineDetail(machineId);

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="machines"
    >
      <MachineDetailPage
        machine={machine}
        action={updateMachineLoadSpecificationAction.bind(null, machineId)}
      />
    </AppShell>
  );
}

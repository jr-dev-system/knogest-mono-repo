import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceSelection } from "@/components/pages/workspaces/workspace-selection";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";

export default async function Page() {
  const { companies, selectedCompany } = await requireCompanyWorkspace();

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="dashboard"
    >
      <WorkspaceSelection companyName={selectedCompany.name} />
    </AppShell>
  );
}

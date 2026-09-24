import { Settings } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { getJobRoles } from "@/features/employees/employees.server";
import { JobRolesSettings } from "@/features/job-roles/job-roles-settings";

export default async function Page() {
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  const jobRoles = await getJobRoles();

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="settings"
    >
      <JobRolesSettings roles={jobRoles ?? []} />
      <section
        className="rounded-lg border border-border bg-card px-5 py-12 text-center"
        aria-labelledby="settings-title"
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-md bg-accent text-primary">
          <Settings className="size-6" />
        </span>
        <h2 id="settings-title" className="mt-4 text-xl font-bold">
          Configurações
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Esta área fica reservada para regras da empresa, permissões,
          integrações e preferências operacionais.
        </p>
      </section>
    </AppShell>
  );
}

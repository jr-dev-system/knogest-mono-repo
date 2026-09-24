import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { ProjectsRegistry } from "@/features/projects/components/projects-registry";
import {
  getProjectRegistry,
  getProjectWizardOptions,
} from "@/features/projects/projects.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const search = first(params.search);
  const cursor = first(params.cursor);
  const [page, options] = await Promise.all([
    getProjectRegistry(search, cursor),
    getProjectWizardOptions(),
  ]);

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="works"
    >
      <ProjectsRegistry
        companyId={selectedCompany.id}
        options={options}
        page={page}
        search={search}
      />
    </AppShell>
  );
}

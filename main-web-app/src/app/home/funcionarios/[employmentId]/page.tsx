import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { EmployeeDetailPage } from "@/features/employees/components/employee-detail-page";
import {
  allocateEmployeeAction,
  changeEmployeeJobRoleAction,
  reallocateEmployeeAction,
  terminateEmployeeAction,
  rehireEmployeeAction,
  releaseEmployeeAllocationAction,
  replaceEmployeeAllocationTermsAction,
} from "@/features/employees/employees.actions";
import {
  getEmployeeDetail,
  getEmployeeReallocationDestinations,
  getJobRoles,
} from "@/features/employees/employees.server";
import { getProjectRegistry } from "@/features/projects/projects.server";

export default async function Page({
  params,
}: {
  params: Promise<{ employmentId: string }>;
}) {
  const [{ companies, selectedCompany }, { employmentId }] = await Promise.all([
    requireCompanyWorkspace(),
    params,
  ]);
  const [record, jobRoles, projectRegistry, destinations] = await Promise.all([
    getEmployeeDetail(employmentId),
    getJobRoles(),
    getProjectRegistry(),
    getEmployeeReallocationDestinations(employmentId),
  ]);

  return (
    <AppShell
      companies={companies}
      selectedCompany={selectedCompany}
      currentArea="employees"
    >
      <EmployeeDetailPage
        action={rehireEmployeeAction}
        allocateAction={allocateEmployeeAction}
        releaseAction={releaseEmployeeAllocationAction}
        termsAction={replaceEmployeeAllocationTermsAction}
        reallocateAction={reallocateEmployeeAction}
        terminateAction={terminateEmployeeAction}
        companyId={selectedCompany.id}
        projects={projectRegistry.data.map((project) => ({
          id: project.id,
          name: project.name,
        }))}
        destinations={destinations}
        jobRoleAction={changeEmployeeJobRoleAction}
        jobRoles={jobRoles ?? []}
        record={record}
      />
    </AppShell>
  );
}

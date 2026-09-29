import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { ProjectOperationalDay } from "@/features/projects/components/project-operational-day";
import { getOperationalDay } from "@/features/projects/operational-day.server";
import { getProjectDetail } from "@/features/projects/projects.server";
import { ApiClientError } from "@/lib/api/api-client-error";

export default async function OperationalDayPage({ params }: { params: Promise<{ projectId: string; reportDate: string }> }) {
  const { projectId, reportDate } = await params;
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  let day; let project;
  try {
    [day, project] = await Promise.all([getOperationalDay(projectId, reportDate), getProjectDetail(projectId)]);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
  return <AppShell companies={companies} selectedCompany={selectedCompany} currentArea="works" navigationMode="project"><div className="overflow-hidden rounded-lg border border-border bg-card"><ProjectOperationalDay initialDay={day} projectId={projectId} projectName={project.name}/></div></AppShell>;
}

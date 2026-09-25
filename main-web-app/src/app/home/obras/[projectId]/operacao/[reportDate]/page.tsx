import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { ProjectOperationalDay } from "@/features/projects/components/project-operational-day";
import { getOperationalDay } from "@/features/projects/operational-day.server";
import { getProjectDetail } from "@/features/projects/projects.server";

export default async function OperationalDayPage({ params }: { params: Promise<{ projectId: string; reportDate: string }> }) {
  const { projectId, reportDate } = await params;
  const { companies, selectedCompany } = await requireCompanyWorkspace();
  let day; let project;
  try { [day, project] = await Promise.all([getOperationalDay(projectId, reportDate), getProjectDetail(projectId)]); } catch { notFound(); }
  return <AppShell companies={companies} selectedCompany={selectedCompany} currentArea="works" navigationMode="project"><div className="overflow-hidden rounded-lg border border-border bg-card"><ProjectOperationalDay initialDay={day} projectId={projectId} projectName={project.name}/></div></AppShell>;
}

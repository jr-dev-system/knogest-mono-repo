import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireCompanyWorkspace } from "@/features/company-selection/company-selection.server";
import { ProjectFrequency } from "@/features/projects/components/project-frequency";
import { getProjectFrequency } from "@/features/projects/frequency.server";
import { getProjectDetail } from "@/features/projects/projects.server";
export default async function FrequencyPage({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; const { companies, selectedCompany } = await requireCompanyWorkspace(); let page; let project; try { [page, project] = await Promise.all([getProjectFrequency(projectId), getProjectDetail(projectId)]); } catch { notFound(); } return <AppShell companies={companies} selectedCompany={selectedCompany} currentArea="works" navigationMode="project"><ProjectFrequency page={page} projectId={projectId} projectName={project.name}/></AppShell>; }

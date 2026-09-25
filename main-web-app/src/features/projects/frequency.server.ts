import "server-only";
import { getApiV1ProjectsProjectidFrequency } from "@/generated/clients/getApiV1ProjectsProjectidFrequency";

export type FrequencyPage = { data: Array<{ reportId: string; reportDate: string; shift: "day" | "night"; employees: Array<{ employmentId: string; name: string; jobRole: string; status: "present" | "absent"; checkInAt: string | null; checkOutAt: string | null; regularWorkedMinutes: number; overtimeMinutes: number }> }>; pageInfo: { hasNextPage: boolean; nextCursor: string | null } };
export async function getProjectFrequency(projectId: string) { const response = await getApiV1ProjectsProjectidFrequency({ projectId, params: { limit: 25, sortBy: "reportDate", sortDirection: "desc" } }); return response.data as unknown as FrequencyPage; }

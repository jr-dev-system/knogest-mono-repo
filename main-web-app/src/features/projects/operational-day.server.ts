import "server-only";

import { getApiV1ProjectsProjectidOperationalDaysReportdate } from "@/generated/clients/getApiV1ProjectsProjectidOperationalDaysReportdate";
import type { OperationalDay } from "./operational-day.types";

export async function getOperationalDay(projectId: string, reportDate: string) {
  const response = await getApiV1ProjectsProjectidOperationalDaysReportdate({ projectId, reportDate });
  return response.data as unknown as OperationalDay;
}

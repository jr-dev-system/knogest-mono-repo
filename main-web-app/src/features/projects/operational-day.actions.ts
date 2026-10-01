"use server";

import { z } from "zod";
import { ApiClientError } from "@/lib/api/server-client";
import { getOperationalDay } from "./operational-day.server";
import { postApiV1ProjectsProjectidOperationalDaysReportdateShiftsShiftStart } from "@/generated/clients/postApiV1ProjectsProjectidOperationalDaysReportdateShiftsShiftStart";
import { putApiV1ProjectsProjectidOperationalShiftsReportidRdo } from "@/generated/clients/putApiV1ProjectsProjectidOperationalShiftsReportidRdo";
import { postApiV1ProjectsProjectidOperationalShiftsReportidInterferences } from "@/generated/clients/postApiV1ProjectsProjectidOperationalShiftsReportidInterferences";
import { postApiV1ProjectsProjectidOperationalShiftsReportidInterferencesInterferenceidConfirm } from "@/generated/clients/postApiV1ProjectsProjectidOperationalShiftsReportidInterferencesInterferenceidConfirm";
import { postApiV1ProjectsProjectidOperationalShiftsReportidClose } from "@/generated/clients/postApiV1ProjectsProjectidOperationalShiftsReportidClose";
import { postApiV1ProjectsProjectidOperationalShiftsReportidStatusEvents } from "@/generated/clients/postApiV1ProjectsProjectidOperationalShiftsReportidStatusEvents";
import type {
  OperationalResult,
  OperationalShift,
  OperationalStatusCommand,
} from "./operational-day.types";

const uuid = z.string().uuid();
const date = z.iso.date();
async function reload(
  projectId: string,
  reportDate: string,
): Promise<OperationalResult> {
  return {
    kind: "success",
    day: await getOperationalDay(projectId, reportDate),
  };
}
function failed(error: unknown): OperationalResult {
  if (error instanceof ApiClientError && error.code === "VALIDATION_ERROR") {
    const details = validationDetails(error.data);
    if (details) return { kind: "failure", message: details };
  }
  return {
    kind: "failure",
    message:
      error instanceof Error
        ? error.message
        : "Não foi possível concluir a operação.",
  };
}

function validationDetails(data: unknown) {
  if (!data || typeof data !== "object" || !("details" in data)) return null;
  const details = data.details;
  if (!details || typeof details !== "object") return null;
  const labels: Record<string, string> = {
    endedAt: "Horário de encerramento",
    earlyClosureReason: "Motivo do encerramento antecipado",
    employees: "Equipe",
    machines: "Medidores",
    activityNotes: "Informações complementares",
    fallbackClimateConditions: "Condição climática",
  };
  const messages = Object.entries(details).flatMap(([field, value]) => {
    const entries = Array.isArray(value) ? value : [value];
    return entries
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => `${labels[field] ?? field}: ${entry}`);
  });
  return messages.length ? messages.join(" ") : null;
}

export async function startOperationalShiftAction(input: {
  projectId: string;
  reportDate: string;
  shift: OperationalShift;
  startedAt: string;
  employees: Array<{
    employmentId: string;
    status: "present" | "absent";
    absenceReason?: string | null;
  }>;
  machines: Array<{
    machineId: string;
    condition: "fit" | "unfit";
    conditionNote?: string | null;
  }>;
}): Promise<OperationalResult> {
  try {
    const projectId = uuid.parse(input.projectId);
    const reportDate = date.parse(input.reportDate);
    await postApiV1ProjectsProjectidOperationalDaysReportdateShiftsShiftStart({
      projectId,
      reportDate,
      shift: input.shift,
      data: {
        startedAt: input.startedAt,
        employees: input.employees,
        machines: input.machines,
      },
    });
    return reload(projectId, reportDate);
  } catch (error) {
    return failed(error);
  }
}

export async function saveOperationalRdoAction(input: {
  projectId: string;
  reportDate: string;
  reportId: string;
  data: Parameters<
    typeof putApiV1ProjectsProjectidOperationalShiftsReportidRdo
  >[0]["data"];
}): Promise<OperationalResult> {
  try {
    const projectId = uuid.parse(input.projectId);
    await putApiV1ProjectsProjectidOperationalShiftsReportidRdo({
      projectId,
      reportId: uuid.parse(input.reportId),
      data: input.data,
    });
    return reload(projectId, date.parse(input.reportDate));
  } catch (error) {
    return failed(error);
  }
}

export async function addOperationalInterferenceAction(input: {
  projectId: string;
  reportDate: string;
  reportId: string;
  data: Parameters<
    typeof postApiV1ProjectsProjectidOperationalShiftsReportidInterferences
  >[0]["data"];
}): Promise<OperationalResult> {
  try {
    const projectId = uuid.parse(input.projectId);
    await postApiV1ProjectsProjectidOperationalShiftsReportidInterferences({
      projectId,
      reportId: uuid.parse(input.reportId),
      data: input.data,
    });
    return reload(projectId, date.parse(input.reportDate));
  } catch (error) {
    return failed(error);
  }
}

export async function confirmOperationalInterferenceAction(input: {
  projectId: string;
  reportDate: string;
  reportId: string;
  interferenceId: string;
}): Promise<OperationalResult> {
  try {
    const projectId = uuid.parse(input.projectId);
    await postApiV1ProjectsProjectidOperationalShiftsReportidInterferencesInterferenceidConfirm(
      {
        projectId,
        reportId: uuid.parse(input.reportId),
        interferenceId: uuid.parse(input.interferenceId),
      },
    );
    return reload(projectId, date.parse(input.reportDate));
  } catch (error) {
    return failed(error);
  }
}

export async function closeOperationalShiftAction(input: {
  projectId: string;
  reportDate: string;
  reportId: string;
  data: Parameters<
    typeof postApiV1ProjectsProjectidOperationalShiftsReportidClose
  >[0]["data"];
}): Promise<OperationalResult> {
  try {
    const projectId = uuid.parse(input.projectId);
    await postApiV1ProjectsProjectidOperationalShiftsReportidClose({
      projectId,
      reportId: uuid.parse(input.reportId),
      data: input.data,
    });
    return reload(projectId, date.parse(input.reportDate));
  } catch (error) {
    return failed(error);
  }
}

export async function recordOperationalStatusAction(input: {
  projectId: string;
  reportDate: string;
  reportId: string;
  data: OperationalStatusCommand;
}): Promise<OperationalResult> {
  try {
    const projectId = uuid.parse(input.projectId);
    await postApiV1ProjectsProjectidOperationalShiftsReportidStatusEvents({
      projectId,
      reportId: uuid.parse(input.reportId),
      data: input.data,
    });
    return reload(projectId, date.parse(input.reportDate));
  } catch (error) {
    return failed(error);
  }
}

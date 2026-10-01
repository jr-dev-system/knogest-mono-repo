import type { Prisma } from "../../../db/generated/prisma/client";
import type { HandlerContext } from "../../../lib/utils/handler.dto";
import type {
  CursorBoundary,
  SortDirection,
} from "../../../lib/utils/cursor-pagination";
import { invalidCursorError } from "../../../lib/utils/cursor-pagination";

export type DailyReportScope = {
  corporationId: string;
  companyId: string;
  actorUserId: string;
};

export type DailyReportWriteData = {
  reportDate: Date;
  shift: "DAY" | "NIGHT";
  shiftOrder: number;
  projectNameSnapshot: string;
  municipalitySnapshot: string | null;
  stateSnapshot: string | null;
  contractSnapshot: string | null;
  scheduleScaleSnapshot: string;
  supervisorEmploymentId: string;
  supervisorNameSnapshot: string;
  activityStartTime: string;
  activityEndTime: string;
  activityEndDayOffset: number;
  activityTypes: Array<"EARTHWORKS" | "DRAINAGE" | "PAVING">;
  climateConditions: Array<"RAIN" | "DRY" | "WATERLOGGED_SOIL">;
  dailyRainfallMm: string;
  monthlyRainfallMm: string;
  executedActivities: string;
  interferences: string | null;
  startedAt?: Date | null;
  liveStatus?: "WORKING" | "PAUSED" | null;
  schedulePeriods: Array<{
    startTime: string;
    endTime: string;
    startDayOffset: number;
    endDayOffset: number;
  }>;
  technicalResponsibilities: Array<{
    employmentId: string;
    nameSnapshot: string;
  }>;
  employees: Array<{
    employmentId: string;
    employeeNameSnapshot: string;
    jobRoleSnapshot: string;
    completedFullShift: boolean;
    regularWorkedMinutes: number;
    overtimeMinutes: number;
    attendanceStatus?: "PRESENT" | "ABSENT";
    absenceReason?: string | null;
    checkInAt?: Date | null;
    overtimeConfirmed?: boolean;
    overtimeEnabled?: boolean;
    liveStatus?: "WORKING" | "STOPPED" | "MAINTENANCE" | "UNFIT" | null;
  }>;
  machines: Array<{
    machineId: string;
    machineNameSnapshot: string;
    manufacturerSnapshot: string;
    modelSnapshot: string;
    meterTypeSnapshot: "HOUR_METER" | "ODOMETER";
    identifierKindSnapshot: "PLATE" | "COMPANY_TAG" | null;
    identifierValueSnapshot: string | null;
    startMeterReadingId: string;
    startMeterReadingValue: string;
    endMeterReadingValue: string;
    operationalCondition?: "FIT" | "UNFIT";
    conditionNote?: string | null;
    liveStatus?: "WORKING" | "STOPPED" | "MAINTENANCE" | "UNFIT" | null;
  }>;
};

export const dailyReportDetailInclude = {
  schedulePeriods: { orderBy: { position: "asc" as const } },
  technicalResponsibilities: { orderBy: { position: "asc" as const } },
  employeeEntries: {
    orderBy: [
      { jobRoleSnapshot: "asc" as const },
      { employeeNameSnapshot: "asc" as const },
    ],
    include: { breaks: { orderBy: { position: "asc" as const } } },
  },
  machineEntries: { orderBy: { machineNameSnapshot: "asc" as const } },
  interferenceEntries: {
    orderBy: [{ startedAt: "asc" as const }, { id: "asc" as const }],
  },
  statusEvents: {
    orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }],
    include: { actor: { select: { id: true, email: true } } },
  },
  createdBy: { select: { id: true, email: true } },
  finalizedBy: { select: { id: true, email: true } },
} satisfies Prisma.ProjectDailyReportInclude;

function scopeWhere(scope: DailyReportScope, projectId: string) {
  return {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
    projectId,
  };
}

export async function findProjectDailyReportContextHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  interval: { startAt: Date; endAt: Date },
  shift: "DAY" | "NIGHT",
) {
  const where = scopeWhere(scope, projectId);
  const project = await context.prisma.project.findFirst({
    where: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      id: projectId,
    },
    select: {
      id: true,
      name: true,
      addressCity: true,
      addressState: true,
      contractNumber: true,
      status: true,
      actualStartedAt: true,
    },
  });
  if (!project) return null;

  const overlap = {
    effectiveFrom: { lte: interval.endAt },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: interval.startAt } }],
  };
  const [
    manager,
    technicalResponsibilities,
    scheduleRevision,
    employees,
    machines,
  ] = await Promise.all([
    context.prisma.projectManagerTenure.findFirst({
      where: { ...where, ...overlap },
      orderBy: { effectiveFrom: "desc" },
      select: { employmentId: true },
    }),
    context.prisma.projectTechnicalResponsibility.findMany({
      where: { ...where, ...overlap },
      orderBy: { effectiveFrom: "asc" },
      select: { employmentId: true },
    }),
    context.prisma.projectScheduleRevision.findFirst({
      where: { ...where, ...overlap },
      orderBy: { effectiveFrom: "desc" },
      select: { id: true, nightShiftEnabled: true },
    }),
    context.prisma.projectEmployeeAllocation.findMany({
      where: { ...where, ...overlap, shift },
      orderBy: { effectiveFrom: "asc" },
      select: {
        employmentId: true,
        jobRole: true,
        overtimeEnabled: true,
      },
    }),
    context.prisma.projectMachineAllocation.findMany({
      where: {
        ...where,
        ...overlap,
        shiftAssignments: { some: { ...overlap, shift } },
      },
      orderBy: { effectiveFrom: "asc" },
      select: { machineId: true },
    }),
  ]);

  const employmentIds = [
    manager?.employmentId,
    ...technicalResponsibilities.map((item) => item.employmentId),
    ...employees.map((item) => item.employmentId),
  ].filter((id): id is string => Boolean(id));
  const machineIds = machines.map((item) => item.machineId);
  const [employmentRecords, machineRecords, scheduleDays] = await Promise.all([
    employmentIds.length
      ? context.prisma.employment.findMany({
          where: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            id: { in: employmentIds },
          },
          select: {
            id: true,
            state: true,
            isActive: true,
            person: { select: { displayName: true } },
          },
        })
      : [],
    machineIds.length
      ? context.prisma.machine.findMany({
          where: {
            corporationId: scope.corporationId,
            id: { in: machineIds },
          },
          select: {
            id: true,
            name: true,
            manufacturer: true,
            model: true,
            meterType: true,
            isActive: true,
            identifiers: {
              where: {
                companyId: scope.companyId,
                createdAt: { lte: interval.endAt },
                OR: [
                  { releasedAt: null },
                  { releasedAt: { gt: interval.startAt } },
                ],
              },
              orderBy: { kind: "asc" },
              take: 1,
              select: { kind: true, value: true },
            },
            meterReadings: {
              where: {
                companyId: scope.companyId,
                status: "CONFIRMED",
                recordedAt: { lte: interval.startAt },
              },
              orderBy: { readingSequence: "desc" },
              take: 1,
              select: {
                id: true,
                value: true,
                readingSequence: true,
                recordedAt: true,
              },
            },
          },
        })
      : [],
    scheduleRevision
      ? context.prisma.projectScheduleDay.findMany({
          where: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            scheduleRevisionId: scheduleRevision.id,
            shift,
          },
          orderBy: { dayOfWeek: "asc" },
          select: {
            dayOfWeek: true,
            isWorking: true,
            startTime: true,
            endTime: true,
            endDayOffset: true,
          },
        })
      : [],
  ]);
  const breakTemplates = scheduleRevision
    ? await context.prisma.projectBreakTemplate.findMany({
        where: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          scheduleRevisionId: scheduleRevision.id,
          shift,
        },
        orderBy: { position: "asc" },
        select: { id: true, name: true, durationMinutes: true },
      })
    : [];

  return {
    project,
    shiftEnabled:
      shift === "DAY" || Boolean(scheduleRevision?.nightShiftEnabled),
    manager,
    technicalResponsibilities,
    scheduleDays,
    breakTemplates,
    employees,
    machines,
    employmentRecords,
    machineRecords,
  };
}

export async function createProjectDailyReportHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  data: DailyReportWriteData,
) {
  return context.prisma.projectDailyReport.create({
    data: {
      ...scopeWhere(scope, projectId),
      reportDate: data.reportDate,
      shift: data.shift,
      shiftOrder: data.shiftOrder,
      status: "DRAFT",
      projectNameSnapshot: data.projectNameSnapshot,
      municipalitySnapshot: data.municipalitySnapshot,
      stateSnapshot: data.stateSnapshot,
      contractSnapshot: data.contractSnapshot,
      scheduleScaleSnapshot: data.scheduleScaleSnapshot,
      supervisorEmploymentId: data.supervisorEmploymentId,
      supervisorNameSnapshot: data.supervisorNameSnapshot,
      activityStartTime: data.activityStartTime,
      activityEndTime: data.activityEndTime,
      activityEndDayOffset: data.activityEndDayOffset,
      activityTypes: data.activityTypes,
      climateConditions: data.climateConditions,
      dailyRainfallMm: data.dailyRainfallMm,
      monthlyRainfallMm: data.monthlyRainfallMm,
      executedActivities: data.executedActivities,
      interferences: data.interferences,
      startedAt: data.startedAt,
      liveStatus: data.liveStatus,
      createdByUserId: scope.actorUserId,
      schedulePeriods: {
        create: data.schedulePeriods.map((period, position) => ({
          position,
          ...period,
        })),
      },
      technicalResponsibilities: {
        create: data.technicalResponsibilities.map((item, position) => ({
          position,
          ...item,
        })),
      },
      employeeEntries: {
        create: data.employees,
      },
      machineEntries: {
        create: data.machines,
      },
    },
    include: dailyReportDetailInclude,
  });
}

export async function initializeOperationalStatusEventsHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
  occurredAt: Date,
) {
  const report = await context.prisma.projectDailyReport.findFirst({
    where: { id: reportId, ...scopeWhere(scope, projectId) },
    select: {
      id: true,
      employeeEntries: { select: { id: true, liveStatus: true } },
      machineEntries: { select: { id: true, liveStatus: true } },
    },
  });
  if (!report) return false;
  await context.prisma.projectDailyReportStatusEvent.createMany({
    data: [
      {
        ...scopeWhere(scope, projectId),
        dailyReportId: reportId,
        type: "SHIFT",
        fromStatus: null,
        toStatus: "WORKING",
        occurredAt,
        actorUserId: scope.actorUserId,
      },
      ...report.employeeEntries.map((entry) => ({
        ...scopeWhere(scope, projectId),
        dailyReportId: reportId,
        employeeEntryId: entry.id,
        type: "EMPLOYEE" as const,
        fromStatus: null,
        toStatus: entry.liveStatus!,
        occurredAt,
        actorUserId: scope.actorUserId,
      })),
      ...report.machineEntries.map((entry) => ({
        ...scopeWhere(scope, projectId),
        dailyReportId: reportId,
        machineEntryId: entry.id,
        type: "MACHINE" as const,
        fromStatus: null,
        toStatus: entry.liveStatus!,
        occurredAt,
        actorUserId: scope.actorUserId,
      })),
    ],
  });
  return true;
}

export async function appendOperationalStatusEventHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
  input:
    | {
        type: "SHIFT";
        fromStatus: "WORKING" | "PAUSED";
        toStatus: "WORKING" | "PAUSED";
        occurredAt: Date;
      }
    | {
        type: "EMPLOYEE";
        entryId: string;
        fromStatus: "WORKING" | "STOPPED" | "MAINTENANCE" | "UNFIT";
        toStatus: "WORKING" | "STOPPED" | "MAINTENANCE" | "UNFIT";
        occurredAt: Date;
      }
    | {
        type: "MACHINE";
        entryId: string;
        fromStatus: "WORKING" | "STOPPED" | "MAINTENANCE" | "UNFIT";
        toStatus: "WORKING" | "STOPPED" | "MAINTENANCE" | "UNFIT";
        occurredAt: Date;
      },
) {
  const scoped = scopeWhere(scope, projectId);
  let changed = 0;
  let employeeEntryId: string | undefined;
  let machineEntryId: string | undefined;
  if (input.type === "SHIFT") {
    const result = await context.prisma.projectDailyReport.updateMany({
      where: {
        id: reportId,
        ...scoped,
        status: "DRAFT",
        liveStatus: input.fromStatus,
      },
      data: { liveStatus: input.toStatus },
    });
    changed = result.count;
  } else if (input.type === "EMPLOYEE") {
    const result = await context.prisma.projectDailyReportEmployee.updateMany({
      where: {
        id: input.entryId,
        dailyReportId: reportId,
        ...scoped,
        liveStatus: input.fromStatus,
      },
      data: { liveStatus: input.toStatus },
    });
    changed = result.count;
    employeeEntryId = input.entryId;
  } else {
    const result = await context.prisma.projectDailyReportMachine.updateMany({
      where: {
        id: input.entryId,
        dailyReportId: reportId,
        ...scoped,
        liveStatus: input.fromStatus,
      },
      data: { liveStatus: input.toStatus },
    });
    changed = result.count;
    machineEntryId = input.entryId;
  }
  if (!changed) return false;
  await context.prisma.projectDailyReportStatusEvent.create({
    data: {
      ...scoped,
      dailyReportId: reportId,
      employeeEntryId,
      machineEntryId,
      type: input.type,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      occurredAt: input.occurredAt,
      actorUserId: scope.actorUserId,
    },
  });
  return true;
}

export async function updateProjectDailyReportHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
  data: DailyReportWriteData,
) {
  const where = { ...scopeWhere(scope, projectId), dailyReportId: reportId };
  await context.prisma.projectDailyReportMachine.deleteMany({ where });
  await context.prisma.projectDailyReportEmployee.deleteMany({ where });
  await context.prisma.projectDailyReportTechnicalResponsibility.deleteMany({
    where,
  });
  await context.prisma.projectDailyReportSchedulePeriod.deleteMany({ where });
  return context.prisma.projectDailyReport.update({
    where: { id: reportId },
    data: {
      reportDate: data.reportDate,
      shift: data.shift,
      shiftOrder: data.shiftOrder,
      projectNameSnapshot: data.projectNameSnapshot,
      municipalitySnapshot: data.municipalitySnapshot,
      stateSnapshot: data.stateSnapshot,
      contractSnapshot: data.contractSnapshot,
      scheduleScaleSnapshot: data.scheduleScaleSnapshot,
      supervisorEmploymentId: data.supervisorEmploymentId,
      supervisorNameSnapshot: data.supervisorNameSnapshot,
      activityStartTime: data.activityStartTime,
      activityEndTime: data.activityEndTime,
      activityEndDayOffset: data.activityEndDayOffset,
      activityTypes: data.activityTypes,
      climateConditions: data.climateConditions,
      dailyRainfallMm: data.dailyRainfallMm,
      monthlyRainfallMm: data.monthlyRainfallMm,
      executedActivities: data.executedActivities,
      interferences: data.interferences,
      schedulePeriods: {
        create: data.schedulePeriods.map((period, position) => ({
          position,
          ...period,
        })),
      },
      technicalResponsibilities: {
        create: data.technicalResponsibilities.map((item, position) => ({
          position,
          ...item,
        })),
      },
      employeeEntries: {
        create: data.employees,
      },
      machineEntries: {
        create: data.machines,
      },
    },
    include: dailyReportDetailInclude,
  });
}

export async function findProjectDailyReportHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
) {
  return context.prisma.projectDailyReport.findFirst({
    where: { id: reportId, ...scopeWhere(scope, projectId) },
    include: dailyReportDetailInclude,
  });
}

export async function findProjectDailyReportStateHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
) {
  return context.prisma.projectDailyReport.findFirst({
    where: { id: reportId, ...scopeWhere(scope, projectId) },
    select: { id: true, status: true, startedAt: true },
  });
}

export async function findOperationalShiftByDateHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportDate: Date,
  shift: "DAY" | "NIGHT",
) {
  return context.prisma.projectDailyReport.findFirst({
    where: { ...scopeWhere(scope, projectId), reportDate, shift },
    include: dailyReportDetailInclude,
  });
}

export async function updateOperationalRdoHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
  data: {
    supervisorEmploymentId: string;
    supervisorNameSnapshot: string;
    scheduleScaleSnapshot: string;
    schedulePeriods: Array<{
      startTime: string;
      endTime: string;
      startDayOffset: number;
      endDayOffset: number;
    }>;
    technicalResponsibilities: Array<{
      employmentId: string;
      nameSnapshot: string;
    }>;
    activityStartTime: string;
    activityEndTime: string;
    activityEndDayOffset: number;
    activityTypes: Array<"EARTHWORKS" | "DRAINAGE" | "PAVING">;
    climateConditions: Array<"RAIN" | "DRY" | "WATERLOGGED_SOIL">;
    dailyRainfallMm: string;
    monthlyRainfallMm: string;
    executedActivities: string;
  },
) {
  const nestedWhere = {
    ...scopeWhere(scope, projectId),
    dailyReportId: reportId,
  };
  await context.prisma.projectDailyReportTechnicalResponsibility.deleteMany({
    where: nestedWhere,
  });
  await context.prisma.projectDailyReportSchedulePeriod.deleteMany({
    where: nestedWhere,
  });
  return context.prisma.projectDailyReport.update({
    where: { id: reportId },
    data: {
      supervisorEmploymentId: data.supervisorEmploymentId,
      supervisorNameSnapshot: data.supervisorNameSnapshot,
      scheduleScaleSnapshot: data.scheduleScaleSnapshot,
      activityStartTime: data.activityStartTime,
      activityEndTime: data.activityEndTime,
      activityEndDayOffset: data.activityEndDayOffset,
      activityTypes: data.activityTypes,
      climateConditions: data.climateConditions,
      dailyRainfallMm: data.dailyRainfallMm,
      monthlyRainfallMm: data.monthlyRainfallMm,
      executedActivities: data.executedActivities,
      schedulePeriods: {
        create: data.schedulePeriods.map((item, position) => ({
          ...item,
          position,
        })),
      },
      technicalResponsibilities: {
        create: data.technicalResponsibilities.map((item, position) => ({
          ...item,
          position,
        })),
      },
    },
    include: dailyReportDetailInclude,
  });
}

export async function createOperationalInterferenceHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
  data: {
    category:
      | "WEATHER"
      | "CREW"
      | "EQUIPMENT"
      | "MATERIAL_LOGISTICS"
      | "EXTERNAL"
      | "SAFETY"
      | "OTHER";
    description: string;
    impact: string;
    startedAt: Date;
    endedAt: Date | null;
  },
) {
  return context.prisma.projectDailyReportInterference.create({
    data: {
      ...scopeWhere(scope, projectId),
      dailyReportId: reportId,
      ...data,
    },
  });
}

export async function confirmOperationalInterferenceHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
  interferenceId: string,
  confirmedAt: Date,
) {
  const result = await context.prisma.projectDailyReportInterference.updateMany(
    {
      where: {
        id: interferenceId,
        dailyReportId: reportId,
        ...scopeWhere(scope, projectId),
        confirmedAt: null,
      },
      data: {
        confirmedAt,
        confirmedByUserId: scope.actorUserId,
      },
    },
  );
  return result.count;
}

export async function replaceOperationalEmployeeCloseHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
  input: {
    entryId: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    regularWorkedMinutes: number;
    overtimeMinutes: number;
    completedFullShift: boolean;
    overtimeConfirmed: boolean;
    breaks: Array<{ startAt: Date; endAt: Date }>;
  },
) {
  await context.prisma.projectDailyReportEmployeeBreak.deleteMany({
    where: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      projectId,
      dailyReportId: reportId,
      employeeEntryId: input.entryId,
    },
  });
  await context.prisma.projectDailyReportEmployee.update({
    where: { id: input.entryId },
    data: {
      checkInAt: input.checkInAt,
      checkOutAt: input.checkOutAt,
      regularWorkedMinutes: input.regularWorkedMinutes,
      overtimeMinutes: input.overtimeMinutes,
      completedFullShift: input.completedFullShift,
      overtimeConfirmed: input.overtimeConfirmed,
      breaks: {
        create: input.breaks.map((item, position) => ({
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          projectId,
          dailyReportId: reportId,
          position,
          ...item,
        })),
      },
    },
  });
}

export async function updateOperationalMachineCloseHandler(
  context: HandlerContext,
  entryId: string,
  endMeterReadingValue: string,
) {
  await context.prisma.projectDailyReportMachine.update({
    where: { id: entryId },
    data: { endMeterReadingValue },
  });
}

export async function updateOperationalClosureHandler(
  context: HandlerContext,
  reportId: string,
  data: {
    activityEndTime: string;
    activityEndDayOffset: number;
    earlyClosureReason: string | null;
    interferences: string | null;
    activityTypes: Array<"EARTHWORKS">;
    climateConditions: Array<"RAIN" | "DRY" | "WATERLOGGED_SOIL">;
    executedActivities: string;
  },
) {
  await context.prisma.projectDailyReport.update({
    where: { id: reportId },
    data,
  });
}

export async function listProjectFrequencyHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  input: {
    boundary: CursorBoundary | null;
    limit: number;
    shift?: "DAY" | "NIGHT";
    sortDirection: SortDirection;
  },
) {
  const boundary = dailyReportBoundary(input.boundary, input.sortDirection);
  return context.prisma.projectDailyReport.findMany({
    where: {
      ...scopeWhere(scope, projectId),
      status: "FINALIZED",
      ...(input.shift ? { shift: input.shift } : {}),
      ...(boundary ? { OR: boundary } : {}),
    },
    orderBy: [
      { reportDate: input.sortDirection },
      { shiftOrder: input.sortDirection },
      { id: input.sortDirection },
    ],
    take: input.limit + 1,
    select: {
      id: true,
      reportDate: true,
      shift: true,
      shiftOrder: true,
      startedAt: true,
      finalizedAt: true,
      employeeEntries: {
        orderBy: [{ jobRoleSnapshot: "asc" }, { employeeNameSnapshot: "asc" }],
        include: { breaks: { orderBy: { position: "asc" } } },
      },
    },
  });
}

export async function listProjectDailyReportsHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  input: {
    boundary: CursorBoundary | null;
    limit: number;
    shift?: "DAY" | "NIGHT";
    status?: "DRAFT" | "FINALIZED";
    sortDirection: SortDirection;
  },
) {
  const boundary = dailyReportBoundary(input.boundary, input.sortDirection);
  return context.prisma.projectDailyReport.findMany({
    where: {
      ...scopeWhere(scope, projectId),
      ...(input.shift ? { shift: input.shift } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(boundary ? { OR: boundary } : {}),
    },
    orderBy: [
      { reportDate: input.sortDirection },
      { shiftOrder: input.sortDirection },
      { id: input.sortDirection },
    ],
    take: input.limit + 1,
    select: {
      id: true,
      reportDate: true,
      shift: true,
      shiftOrder: true,
      status: true,
      activityStartTime: true,
      activityEndTime: true,
      activityEndDayOffset: true,
      createdAt: true,
      updatedAt: true,
      finalizedAt: true,
    },
  });
}

function dailyReportBoundary(
  boundary: CursorBoundary | null,
  direction: SortDirection,
): Prisma.ProjectDailyReportWhereInput[] | null {
  if (!boundary) return null;
  if (typeof boundary.value !== "string") throw invalidCursorError();
  const match = /^(\d{4}-\d{2}-\d{2})\|([01])$/u.exec(boundary.value);
  if (!match || !/^[0-9a-f-]{36}$/iu.test(boundary.id))
    throw invalidCursorError();
  const reportDate = new Date(`${match[1]}T00:00:00.000Z`);
  if (Number.isNaN(reportDate.getTime())) throw invalidCursorError();
  const shiftOrder = Number(match[2]);
  const operator = direction === "asc" ? "gt" : "lt";
  return [
    { reportDate: { [operator]: reportDate } },
    { reportDate, shiftOrder: { [operator]: shiftOrder } },
    { reportDate, shiftOrder, id: { [operator]: boundary.id } },
  ];
}

export async function lockProjectDailyReportHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  projectId: string,
  reportId: string,
) {
  await context.prisma.$queryRawUnsafe(
    `SELECT id FROM "project_daily_reports" WHERE "corporation_id" = $1 AND "company_id" = $2 AND "project_id" = $3 AND "id" = $4 FOR UPDATE`,
    scope.corporationId,
    scope.companyId,
    projectId,
    reportId,
  );
}

export async function lockDailyReportMachineHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  machineId: string,
) {
  await context.prisma.$queryRawUnsafe(
    `SELECT id FROM "machines" WHERE "corporation_id" = $1 AND "id" = $2 FOR UPDATE`,
    scope.corporationId,
    machineId,
  );
}

export async function latestMachineReadingHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  machineId: string,
) {
  return context.prisma.machineMeterReading.findFirst({
    where: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      machineId,
      status: "CONFIRMED",
    },
    orderBy: { readingSequence: "desc" },
    select: {
      id: true,
      readingSequence: true,
      value: true,
      recordedAt: true,
    },
  });
}

export async function finalizeDailyReportMachineHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  input: {
    entryId: string;
    machineId: string;
    startMeterReadingId: string;
    endMeterReadingValue: string;
    nextReadingSequence: number;
    recordedAt: Date;
  },
) {
  const reading = await context.prisma.machineMeterReading.create({
    data: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      machineId: input.machineId,
      readingSequence: input.nextReadingSequence,
      value: input.endMeterReadingValue,
      purpose: "ORDINARY",
      actorUserId: scope.actorUserId,
      recordedAt: input.recordedAt,
    },
    select: { id: true },
  });
  await context.prisma.machineMeterReadingReference.createMany({
    data: [
      {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        machineId: input.machineId,
        readingId: input.startMeterReadingId,
        sourceType: "PROJECT_DAILY_REPORT_START",
        sourceId: input.entryId,
      },
      {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        machineId: input.machineId,
        readingId: reading.id,
        sourceType: "PROJECT_DAILY_REPORT_END",
        sourceId: input.entryId,
      },
    ],
  });
  await context.prisma.projectDailyReportMachine.update({
    where: { id: input.entryId },
    data: { endMeterReadingId: reading.id },
  });
}

export async function finalizeProjectDailyReportHandler(
  context: HandlerContext,
  scope: DailyReportScope,
  reportId: string,
  finalizedAt: Date,
) {
  await context.prisma.projectDailyReport.update({
    where: { id: reportId },
    data: {
      status: "FINALIZED",
      finalizedAt,
      finalizedByUserId: scope.actorUserId,
    },
  });
}

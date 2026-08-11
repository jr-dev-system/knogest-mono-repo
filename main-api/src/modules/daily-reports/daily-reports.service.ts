import { AppError } from "../../lib/utils/appError";
import {
  buildCursorPage,
  parseBoundCursor,
} from "../../lib/utils/cursor-pagination";
import type { HandlerContext } from "../../lib/utils/handler.dto";
import type {
  DailyReportCommand,
  DailyReportListQuery,
  DailyReportOptionsQuery,
} from "./daily-reports.dto";
import {
  createProjectDailyReportHandler,
  finalizeDailyReportMachineHandler,
  finalizeProjectDailyReportHandler,
  findProjectDailyReportContextHandler,
  findProjectDailyReportHandler,
  findProjectDailyReportStateHandler,
  latestMachineReadingHandler,
  listProjectDailyReportsHandler,
  lockDailyReportMachineHandler,
  lockProjectDailyReportHandler,
  updateProjectDailyReportHandler,
  type DailyReportScope,
  type DailyReportWriteData,
} from "./handlers/daily-reports.handler";
import { dailyReportProductionReadinessHandler } from "../productions/handlers/productions.handler";

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const dayLabels = ["Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb.", "Dom."];

type DailyReportRecord = NonNullable<
  Awaited<ReturnType<typeof findProjectDailyReportHandler>>
>;

const activityFromApi = {
  earthworks: "EARTHWORKS",
  drainage: "DRAINAGE",
  paving: "PAVING",
} as const;
const climateFromApi = {
  rain: "RAIN",
  dry: "DRY",
  waterlogged_soil: "WATERLOGGED_SOIL",
} as const;

export class DailyReportsService {
  constructor(private readonly context: HandlerContext) {}

  async options(
    scope: DailyReportScope,
    projectId: string,
    query: DailyReportOptionsQuery,
  ) {
    const broadInterval = intervalForOptions(query.reportDate, query.shift);
    const broadContext = await findProjectDailyReportContextHandler(
      this.context,
      scope,
      projectId,
      broadInterval,
      shiftToDb(query.shift),
    );
    assertProjectAvailable(broadContext?.project, query.reportDate);
    if (!broadContext!.scheduleDays.length)
      throw new AppError({
        code: "PROJECT_SHIFT_NOT_ENABLED",
        statusCode: 409,
        message: "O turno selecionado não está habilitado para esta obra",
      });
    const day = broadContext!.scheduleDays.find(
      (item) => item.dayOfWeek === mondayBasedDay(query.reportDate),
    );
    const defaultWindow = {
      startTime: day?.startTime ?? (query.shift === "day" ? "07:00" : "18:00"),
      endTime: day?.endTime ?? (query.shift === "day" ? "18:00" : "06:00"),
      endDayOffset: day?.endDayOffset ?? (query.shift === "day" ? 0 : 1),
    };
    const exactContext = await findProjectDailyReportContextHandler(
      this.context,
      scope,
      projectId,
      intervalFromLocal(
        query.reportDate,
        defaultWindow.startTime,
        defaultWindow.endTime,
        defaultWindow.endDayOffset,
      ),
      shiftToDb(query.shift),
    );
    assertProjectAvailable(exactContext?.project, query.reportDate);
    const context = exactContext!;
    const employmentMap = new Map(
      context.employmentRecords.map((item) => [item.id, item]),
    );
    const responsibleIds = context.employees.map((item) => item.employmentId);
    const responsibleOptions = [...new Set(responsibleIds)].flatMap((id) => {
      const employment = employmentMap.get(id);
      return employment?.isActive && employment.state === "ACTIVE"
        ? [{ id, name: employment.person.displayName }]
        : [];
    });
    const eligibleResponsibleIds = new Set(
      responsibleOptions.map((item) => item.id),
    );
    const employeeOptions = uniqueBy(
      context.employees.flatMap((allocation) => {
        const employment = employmentMap.get(allocation.employmentId);
        return employment?.isActive && employment.state === "ACTIVE"
          ? [
              {
                id: allocation.employmentId,
                name: employment.person.displayName,
                jobRole: allocation.jobRole,
              },
            ]
          : [];
      }),
      (item) => item.id,
    );
    const machineOptions = context.machineRecords.flatMap((machine) => {
      const reading = machine.meterReadings[0];
      if (!machine.isActive || !reading) return [];
      return [
        {
          id: machine.id,
          name: machine.name,
          manufacturer: machine.manufacturer,
          model: machine.model,
          meterType: machine.meterType.toLowerCase(),
          identifier: machine.identifiers[0]
            ? {
                kind: machine.identifiers[0].kind.toLowerCase(),
                value: machine.identifiers[0].value,
              }
            : null,
          startMeterReading: {
            id: reading.id,
            value: reading.value.toFixed(2),
            recordedAt: reading.recordedAt.toISOString(),
          },
        },
      ];
    });
    return {
      project: {
        id: context.project.id,
        name: context.project.name,
        municipality: context.project.addressCity,
        state: context.project.addressState,
        contract: context.project.contractNumber,
      },
      defaults: {
        reportDate: query.reportDate,
        shift: query.shift,
        schedulePeriods: [
          {
            startTime: defaultWindow.startTime,
            endTime: defaultWindow.endTime,
            startDayOffset: 0,
            endDayOffset: defaultWindow.endDayOffset,
          },
        ],
        activityStartTime: defaultWindow.startTime,
        activityEndTime: defaultWindow.endTime,
        activityEndDayOffset: defaultWindow.endDayOffset,
        scheduleScale: scheduleScale(context.scheduleDays),
        supervisorEmploymentId:
          context.manager?.employmentId &&
          eligibleResponsibleIds.has(context.manager.employmentId)
            ? context.manager.employmentId
            : null,
        technicalResponsibilityEmploymentIds: context.technicalResponsibilities
          .map((item) => item.employmentId)
          .filter((id) => eligibleResponsibleIds.has(id)),
      },
      responsibleOptions,
      employeeOptions,
      machineOptions,
    };
  }

  async create(
    scope: DailyReportScope,
    projectId: string,
    command: DailyReportCommand,
  ) {
    try {
      return await this.context.transaction(async (transactionContext) => {
        const data = await this.resolveWriteData(
          transactionContext,
          scope,
          projectId,
          command,
        );
        const record = await createProjectDailyReportHandler(
          transactionContext,
          scope,
          projectId,
          data,
        );
        return toDetailDto(record);
      });
    } catch (error) {
      throw mapUniqueConflict(error);
    }
  }

  async update(
    scope: DailyReportScope,
    projectId: string,
    reportId: string,
    command: DailyReportCommand,
  ) {
    try {
      return await runSerializableWithRetry(() =>
        this.context.transaction(
          async (transactionContext) => {
            await lockProjectDailyReportHandler(
              transactionContext,
              scope,
              projectId,
              reportId,
            );
            const state = await findProjectDailyReportStateHandler(
              transactionContext,
              scope,
              projectId,
              reportId,
            );
            if (!state) throw notFound();
            if (state.status !== "DRAFT") throw immutable();
            const data = await this.resolveWriteData(
              transactionContext,
              scope,
              projectId,
              command,
            );
            const record = await updateProjectDailyReportHandler(
              transactionContext,
              scope,
              projectId,
              reportId,
              data,
            );
            return toDetailDto(record);
          },
          { isolationLevel: "Serializable" },
        ),
      );
    } catch (error) {
      throw mapUniqueConflict(error);
    }
  }

  async detail(scope: DailyReportScope, projectId: string, reportId: string) {
    const record = await findProjectDailyReportHandler(
      this.context,
      scope,
      projectId,
      reportId,
    );
    if (!record) throw notFound();
    return toDetailDto(record);
  }

  async list(
    scope: DailyReportScope,
    projectId: string,
    query: DailyReportListQuery,
  ) {
    const normalizedQuery = {
      shift: query.shift ?? null,
      status: query.status ?? null,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    };
    const cursorScope = {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      projectId,
    };
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      query: normalizedQuery,
      resource: "project-daily-reports",
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const records = await listProjectDailyReportsHandler(
      this.context,
      scope,
      projectId,
      {
        boundary,
        limit: query.limit,
        shift: query.shift ? shiftToDb(query.shift) : undefined,
        status: query.status ? statusToDb(query.status) : undefined,
        sortDirection: query.sortDirection,
      },
    );
    const page = buildCursorPage({
      items: records,
      limit: query.limit,
      query: normalizedQuery,
      resource: "project-daily-reports",
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (item) => ({
        id: item.id,
        value: `${civilDate(item.reportDate)}|${item.shiftOrder}`,
      }),
    });
    return {
      data: page.data.map((item) => ({
        id: item.id,
        reportDate: civilDate(item.reportDate),
        shift: item.shift.toLowerCase(),
        status: item.status.toLowerCase(),
        activityStartTime: item.activityStartTime,
        activityEndTime: item.activityEndTime,
        activityEndDayOffset: item.activityEndDayOffset,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        finalizedAt: item.finalizedAt?.toISOString() ?? null,
      })),
      pageInfo: page.pageInfo,
    };
  }

  async finalize(scope: DailyReportScope, projectId: string, reportId: string) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        async (transactionContext) => {
          await lockProjectDailyReportHandler(
            transactionContext,
            scope,
            projectId,
            reportId,
          );
          const record = await findProjectDailyReportHandler(
            transactionContext,
            scope,
            projectId,
            reportId,
          );
          if (!record) throw notFound();
          if (record.status !== "DRAFT") throw immutable();
          const interval = intervalFromLocal(
            civilDate(record.reportDate),
            record.activityStartTime,
            record.activityEndTime,
            record.activityEndDayOffset,
          );
          const context = await findProjectDailyReportContextHandler(
            transactionContext,
            scope,
            projectId,
            interval,
            record.shift,
          );
          assertProjectAvailable(
            context?.project,
            civilDate(record.reportDate),
          );
          if (interval.endAt.getTime() > Date.now())
            throw new AppError({
              code: "DAILY_REPORT_PROJECT_UNAVAILABLE",
              message: "Daily report cannot be finalized before the shift ends",
              statusCode: 409,
            });

          const productionReadiness =
            await dailyReportProductionReadinessHandler(
              transactionContext,
              scope,
              {
                projectId,
                reportId,
                productionDate: record.reportDate,
                shift: record.shift,
              },
            );
          if (
            productionReadiness.hasDrafts ||
            productionReadiness.hasUnconfirmed
          )
            throw new AppError({
              code: "PRODUCTION_RDO_CONFIRMATION_REQUIRED",
              message:
                "Non-draft productions from this shift must have their operational revision confirmed before finalizing the daily report",
              statusCode: 409,
              data: {
                productionCount: productionReadiness.count,
                hasDrafts: productionReadiness.hasDrafts,
                hasUnconfirmed: productionReadiness.hasUnconfirmed,
              },
            });

          const entries = [...record.machineEntries].sort((left, right) =>
            left.machineId.localeCompare(right.machineId),
          );
          for (const entry of entries) {
            await lockDailyReportMachineHandler(
              transactionContext,
              scope,
              entry.machineId,
            );
            const latest = await latestMachineReadingHandler(
              transactionContext,
              scope,
              entry.machineId,
            );
            if (
              !latest ||
              latest.id !== entry.startMeterReadingId ||
              latest.recordedAt.getTime() > interval.startAt.getTime() ||
              entry.endMeterReadingValue.lt(latest.value)
            )
              throw meterConflict(entry.machineId, entry.machineNameSnapshot);
            await finalizeDailyReportMachineHandler(transactionContext, scope, {
              entryId: entry.id,
              machineId: entry.machineId,
              startMeterReadingId: entry.startMeterReadingId,
              endMeterReadingValue: entry.endMeterReadingValue.toFixed(2),
              nextReadingSequence: latest.readingSequence + 1,
              recordedAt: interval.endAt,
            });
          }
          const finalizedAt = new Date();
          await finalizeProjectDailyReportHandler(
            transactionContext,
            scope,
            reportId,
            finalizedAt,
          );
          const finalized = await findProjectDailyReportHandler(
            transactionContext,
            scope,
            projectId,
            reportId,
          );
          if (!finalized) throw notFound();
          return toDetailDto(finalized);
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async resolveWriteData(
    context: HandlerContext,
    scope: DailyReportScope,
    projectId: string,
    command: DailyReportCommand,
  ): Promise<DailyReportWriteData> {
    const interval = intervalFromLocal(
      command.reportDate,
      command.activityStartTime,
      command.activityEndTime,
      command.activityEndDayOffset,
    );
    const reportContext = await findProjectDailyReportContextHandler(
      context,
      scope,
      projectId,
      interval,
      shiftToDb(command.shift),
    );
    assertProjectAvailable(reportContext?.project, command.reportDate);
    const resolved = reportContext!;
    const employmentMap = new Map(
      resolved.employmentRecords.map((item) => [item.id, item]),
    );
    const eligibleResponsibleIds = new Set(
      resolved.employees.map((item) => item.employmentId),
    );
    if (
      !eligibleResponsibleIds.has(command.supervisorEmploymentId) ||
      command.technicalResponsibilityEmploymentIds.some(
        (id) => !eligibleResponsibleIds.has(id),
      )
    )
      throw resourceUnavailable("responsible");
    const supervisor = employmentMap.get(command.supervisorEmploymentId);
    if (!supervisor || !supervisor.isActive || supervisor.state !== "ACTIVE")
      throw resourceUnavailable("supervisor");

    const employeeAllocationMap = new Map(
      resolved.employees.map((item) => [item.employmentId, item]),
    );
    const employees = command.employees.map((entry) => {
      const allocation = employeeAllocationMap.get(entry.employmentId);
      const employment = employmentMap.get(entry.employmentId);
      if (
        !allocation ||
        !employment ||
        !employment.isActive ||
        employment.state !== "ACTIVE"
      )
        throw resourceUnavailable("employee");
      const regularWorkedMinutes = entry.completedFullShift
        ? activityWindowMinutes(command)
        : entry.regularWorkedMinutes;
      if (regularWorkedMinutes + entry.overtimeMinutes > 1440)
        throw resourceUnavailable("employee-hours");
      return {
        employmentId: entry.employmentId,
        employeeNameSnapshot: employment.person.displayName,
        jobRoleSnapshot: allocation.jobRole,
        completedFullShift: entry.completedFullShift,
        regularWorkedMinutes,
        overtimeMinutes: entry.overtimeMinutes,
      };
    });

    const machineMap = new Map(
      resolved.machineRecords.map((item) => [item.id, item]),
    );
    const allocatedMachineIds = new Set(
      resolved.machines.map((item) => item.machineId),
    );
    const machines = command.machines.map((entry) => {
      const machine = machineMap.get(entry.machineId);
      const reading = machine?.meterReadings[0];
      if (
        !machine ||
        !machine.isActive ||
        !reading ||
        !allocatedMachineIds.has(entry.machineId)
      )
        throw resourceUnavailable("machine");
      const finalValue = normalizeDecimal(entry.endMeterReadingValue);
      if (
        decimalHundredths(finalValue) <
        decimalHundredths(reading.value.toFixed(2))
      )
        throw meterConflict(entry.machineId, machine.name);
      return {
        machineId: machine.id,
        machineNameSnapshot: machine.name,
        manufacturerSnapshot: machine.manufacturer,
        modelSnapshot: machine.model,
        meterTypeSnapshot: machine.meterType,
        identifierKindSnapshot: machine.identifiers[0]?.kind ?? null,
        identifierValueSnapshot: machine.identifiers[0]?.value ?? null,
        startMeterReadingId: reading.id,
        startMeterReadingValue: reading.value.toFixed(2),
        endMeterReadingValue: finalValue,
      };
    });

    return {
      reportDate: new Date(`${command.reportDate}T00:00:00.000Z`),
      shift: shiftToDb(command.shift),
      shiftOrder: command.shift === "day" ? 0 : 1,
      projectNameSnapshot: resolved.project.name,
      municipalitySnapshot: resolved.project.addressCity,
      stateSnapshot: resolved.project.addressState,
      contractSnapshot: resolved.project.contractNumber,
      scheduleScaleSnapshot: scheduleScale(resolved.scheduleDays),
      supervisorEmploymentId: command.supervisorEmploymentId,
      supervisorNameSnapshot: supervisor.person.displayName,
      activityStartTime: command.activityStartTime,
      activityEndTime: command.activityEndTime,
      activityEndDayOffset: command.activityEndDayOffset,
      activityTypes: command.activityTypes.map((item) => activityFromApi[item]),
      climateConditions: command.climateConditions.map(
        (item) => climateFromApi[item],
      ),
      dailyRainfallMm: normalizeDecimal(command.dailyRainfallMm),
      monthlyRainfallMm: normalizeDecimal(command.monthlyRainfallMm),
      executedActivities: command.executedActivities,
      interferences: command.interferences,
      schedulePeriods: command.schedulePeriods,
      technicalResponsibilities:
        command.technicalResponsibilityEmploymentIds.map((employmentId) => {
          const employment = employmentMap.get(employmentId);
          if (
            !employment ||
            !employment.isActive ||
            employment.state !== "ACTIVE"
          )
            throw resourceUnavailable("technical-responsibility");
          return {
            employmentId,
            nameSnapshot: employment.person.displayName,
          };
        }),
      employees,
      machines,
    };
  }
}

function toDetailDto(record: DailyReportRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    reportDate: civilDate(record.reportDate),
    shift: record.shift.toLowerCase(),
    status: record.status.toLowerCase(),
    project: {
      name: record.projectNameSnapshot,
      municipality: record.municipalitySnapshot,
      state: record.stateSnapshot,
      contract: record.contractSnapshot,
    },
    scheduleScale: record.scheduleScaleSnapshot,
    supervisor: {
      employmentId: record.supervisorEmploymentId,
      name: record.supervisorNameSnapshot,
    },
    technicalResponsibilities: record.technicalResponsibilities.map((item) => ({
      employmentId: item.employmentId,
      name: item.nameSnapshot,
    })),
    schedulePeriods: record.schedulePeriods.map((item) => ({
      startTime: item.startTime,
      endTime: item.endTime,
      startDayOffset: item.startDayOffset,
      endDayOffset: item.endDayOffset,
    })),
    activityWindow: {
      startTime: record.activityStartTime,
      endTime: record.activityEndTime,
      endDayOffset: record.activityEndDayOffset,
    },
    activityTypes: record.activityTypes.map((item) => item.toLowerCase()),
    climateConditions: record.climateConditions.map((item) =>
      item.toLowerCase(),
    ),
    rainfall: {
      dailyMm: record.dailyRainfallMm.toFixed(2),
      monthlyMm: record.monthlyRainfallMm.toFixed(2),
    },
    employees: record.employeeEntries.map((item) => ({
      employmentId: item.employmentId,
      name: item.employeeNameSnapshot,
      jobRole: item.jobRoleSnapshot,
      completedFullShift: item.completedFullShift,
      regularWorkedMinutes: item.regularWorkedMinutes,
      overtimeMinutes: item.overtimeMinutes,
    })),
    machines: record.machineEntries.map((item) => ({
      machineId: item.machineId,
      name: item.machineNameSnapshot,
      manufacturer: item.manufacturerSnapshot,
      model: item.modelSnapshot,
      meterType: item.meterTypeSnapshot.toLowerCase(),
      identifier: item.identifierValueSnapshot
        ? {
            kind: item.identifierKindSnapshot!.toLowerCase(),
            value: item.identifierValueSnapshot,
          }
        : null,
      startMeterReading: {
        id: item.startMeterReadingId,
        value: item.startMeterReadingValue.toFixed(2),
      },
      endMeterReading: {
        id: item.endMeterReadingId,
        value: item.endMeterReadingValue.toFixed(2),
      },
    })),
    executedActivities: record.executedActivities,
    interferences: record.interferences,
    createdBy: record.createdBy,
    finalizedBy: record.finalizedBy,
    finalizedAt: record.finalizedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function assertProjectAvailable(
  project: { status: string; actualStartedAt: Date | null } | null | undefined,
  reportDate: string,
): asserts project is { status: string; actualStartedAt: Date } {
  const today = dateInTimeZone(new Date());
  const startedOn = project?.actualStartedAt
    ? dateInTimeZone(project.actualStartedAt)
    : null;
  if (
    !project ||
    project.status !== "ACTIVE" ||
    !startedOn ||
    reportDate < startedOn ||
    reportDate > today
  )
    throw new AppError({
      code: "DAILY_REPORT_PROJECT_UNAVAILABLE",
      message: "Project is unavailable for this daily report date",
      statusCode: 409,
    });
}

function intervalForOptions(reportDate: string, shift: "day" | "night") {
  return intervalFromLocal(
    reportDate,
    "00:00",
    shift === "day" ? "23:59" : "23:59",
    shift === "day" ? 0 : 1,
  );
}

function intervalFromLocal(
  reportDate: string,
  startTime: string,
  endTime: string,
  endDayOffset: number,
) {
  return {
    startAt: zonedCivilDateTime(reportDate, startTime, 0),
    endAt: zonedCivilDateTime(reportDate, endTime, endDayOffset),
  };
}

function activityWindowMinutes(
  command: Pick<
    DailyReportCommand,
    "activityStartTime" | "activityEndTime" | "activityEndDayOffset"
  >,
) {
  return (
    command.activityEndDayOffset * 1440 +
    clockMinutes(command.activityEndTime) -
    clockMinutes(command.activityStartTime)
  );
}

function clockMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

function zonedCivilDateTime(
  reportDate: string,
  time: string,
  dayOffset: number,
) {
  const [year, month, day] = reportDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const civilUtc = new Date(
    Date.UTC(year!, month! - 1, day! + dayOffset, hour!, minute!, 0, 0),
  );
  const offset = timeZoneOffsetMs(civilUtc);
  const first = new Date(civilUtc.getTime() - offset);
  return new Date(civilUtc.getTime() - timeZoneOffsetMs(first));
}

function timeZoneOffsetMs(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return (
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    ) - date.getTime()
  );
}

function dateInTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function mondayBasedDay(reportDate: string) {
  const day = new Date(`${reportDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function scheduleScale(days: Array<{ dayOfWeek: number; isWorking: boolean }>) {
  const working = days
    .filter((day) => day.isWorking)
    .map((day) => day.dayOfWeek);
  if (!working.length) return "Não informada";
  const contiguous = working.every(
    (day, index) => index === 0 || day === working[index - 1]! + 1,
  );
  if (contiguous && working.length > 1)
    return `${dayLabels[working[0]! - 1]!} a ${dayLabels[working.at(-1)! - 1]!}`;
  return working.map((day) => dayLabels[day - 1] ?? String(day)).join(", ");
}

function normalizeDecimal(value: string) {
  const [integer, fraction = ""] = value.split(".");
  return `${BigInt(integer!).toString()}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function decimalHundredths(value: string) {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer!) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

function civilDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shiftToDb(shift: "day" | "night") {
  return shift === "day" ? ("DAY" as const) : ("NIGHT" as const);
}

function statusToDb(status: "draft" | "finalized") {
  return status === "draft" ? ("DRAFT" as const) : ("FINALIZED" as const);
}

function notFound() {
  return new AppError({
    code: "NOT_FOUND",
    message: "Daily report not found",
    statusCode: 404,
  });
}

function immutable() {
  return new AppError({
    code: "DAILY_REPORT_IMMUTABLE",
    message: "Finalized daily reports are immutable",
    statusCode: 409,
  });
}

function resourceUnavailable(resource: string) {
  return new AppError({
    code: "DAILY_REPORT_RESOURCE_UNAVAILABLE",
    message: "Daily report resource is unavailable",
    statusCode: 409,
    data: { resource },
  });
}

function meterConflict(machineId: string, machineName: string) {
  return new AppError({
    code: "DAILY_REPORT_METER_READING_CONFLICT",
    message: "Machine meter history changed",
    statusCode: 409,
    data: { machineId, machineName },
  });
}

function mapUniqueConflict(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  )
    return new AppError({
      code: "DAILY_REPORT_ALREADY_EXISTS",
      message: "A daily report already exists for this date and shift",
      statusCode: 409,
    });
  return error;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

async function runSerializableWithRetry<T>(work: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === 3) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

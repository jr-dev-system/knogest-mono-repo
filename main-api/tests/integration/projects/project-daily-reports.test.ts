import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../../src/app";
import { OrganizationService } from "../../../src/modules/organization/organization.service";
import type { ProjectCommand } from "../../../src/modules/projects/projects.dto";
import { ProjectsService } from "../../../src/modules/projects/projects.service";
import { resetIntegrationData } from "../reset-integration-data";

import type { FastifyInstance } from "fastify";

describe("project daily reports", () => {
  const syntheticEmployeeCpfFixture = "111.444.777-35";
  const syntheticNightEmployeeCpfFixture = "529.982.247-25";
  const syntheticClientCnpjFixture = "12.345.678/0001-95";
  let app: FastifyInstance;
  let organization: OrganizationService;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    organization = new OrganizationService(app.handlerContext);
  });

  beforeEach(async () => {
    await resetIntegrationData(app.prisma);
  });

  afterAll(() => app.close());

  async function setup() {
    const pilot = await organization.provision({
      corporationName: "Daily reports",
      domainHost: "daily-reports.localhost",
      adminEmail: "master@example.com",
      adminPassword: "correct integration password",
      companyNames: ["One", "Two"],
    });
    const companyId = pilot.companies[0].id;
    const otherCompanyId = pilot.companies[1].id;
    const now = new Date();
    const session = await app.prisma.session.create({
      data: {
        corporationId: pilot.corporation.id,
        userId: pilot.administrator.id,
        companyId,
        refreshTokenHash: "daily-report-refresh-token",
        idleExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        absoluteExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
    });
    const otherSession = await app.prisma.session.create({
      data: {
        corporationId: pilot.corporation.id,
        userId: pilot.administrator.id,
        companyId: otherCompanyId,
        refreshTokenHash: "daily-report-other-refresh-token",
        idleExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        absoluteExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
    });
    const authorization = bearer({
      userId: pilot.administrator.id,
      corporationId: pilot.corporation.id,
      sessionId: session.id,
      companyId,
    });
    const otherAuthorization = bearer({
      userId: pilot.administrator.id,
      corporationId: pilot.corporation.id,
      sessionId: otherSession.id,
      companyId: otherCompanyId,
    });
    const role = await app.prisma.jobRole.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId,
        name: "Supervisor de Terraplanagem",
        normalizedName: "supervisor de terraplanagem",
      },
    });
    const employeeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: {
        document: syntheticEmployeeCpfFixture,
        fullName: "Rafael Brito",
        companyRegistrationNumber: "SUP-001",
        admissionDate: "2026-01-01",
        jobRoleId: role.id,
      },
    });
    expect(employeeResponse.statusCode, employeeResponse.body).toBe(201);
    const employmentId = employeeResponse.json().data.id as string;
    const nightEmployeeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: {
        document: syntheticNightEmployeeCpfFixture,
        fullName: "Marina Noturna",
        companyRegistrationNumber: "SUP-002",
        admissionDate: "2026-01-01",
        jobRoleId: role.id,
      },
    });
    expect(nightEmployeeResponse.statusCode, nightEmployeeResponse.body).toBe(
      201,
    );
    const nightEmploymentId = nightEmployeeResponse.json().data.id as string;
    const clientResponse = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization },
      payload: {
        entityType: "legal_entity",
        document: syntheticClientCnpjFixture,
        legalName: "Jardins das Oliveiras I",
      },
    });
    expect(clientResponse.statusCode, clientResponse.body).toBe(201);
    const reportDate = dateInSaoPauloDaysAgo(1);
    const projectCommand: ProjectCommand = {
      name: "Jardim das Oliveiras",
      address: {
        postalCode: "65900000",
        street: "Rua das Oliveiras",
        number: "100",
        complement: null,
        neighborhood: "Centro",
        city: "Imperatriz",
        state: "MA",
      },
      latitude: null,
      longitude: null,
      contractNumber: "Loteamento Jardins das Oliveiras I",
      approvedBudget: "100000.00",
      plannedStartDate: reportDate,
      plannedEndDate: null,
      clientId: clientResponse.json().data.id as string,
      managerEmploymentId: employmentId,
      technicalResponsibilityEmploymentIds: [employmentId, nightEmploymentId],
      weeklySchedule: [
        ...[1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
          shift: "day" as const,
          dayOfWeek,
          isWorking: dayOfWeek <= 6,
          startTime: dayOfWeek <= 6 ? "07:00" : null,
          endTime: dayOfWeek <= 6 ? "18:00" : null,
          endDayOffset: 0,
        })),
        ...[1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
          shift: "night" as const,
          dayOfWeek,
          isWorking: dayOfWeek <= 6,
          startTime: dayOfWeek <= 6 ? "18:00" : null,
          endTime: dayOfWeek <= 6 ? "06:00" : null,
          endDayOffset: dayOfWeek <= 6 ? 1 : 0,
        })),
      ],
      breakTemplates: [
        {
          shift: "day",
          name: "Almoço",
          durationMinutes: 60,
        },
      ],
      initialEmployeeAllocations: [],
      initialMachineAllocations: [],
      projectSupplierOffers: [],
    };
    const project = await new ProjectsService(app.handlerContext).finalize(
      {
        corporationId: pilot.corporation.id,
        companyId,
        sessionId: session.id,
        userId: pilot.administrator.id,
        role: "MASTER_ADMIN",
      },
      companyId,
      "00000000-0000-4000-8000-000000002901",
      projectCommand,
    );
    const machineModel = await app.prisma.machineModel.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId,
        type: "WHITE_LINE",
        manufacturer: "Hyundai",
        model: "R220",
        normalizedManufacturer: "hyundai",
        normalizedModel: "r220",
        normalizedVersion: "",
        meterType: "HOUR_METER",
        loadVolumeM3: "10.000",
        requiresOperator: true,
        requiredJobRoleId: role.id,
      },
    });
    const machine = await app.prisma.machine.create({
      data: {
        corporationId: pilot.corporation.id,
        machineModelId: machineModel.id,
        name: "EH-01 Hyundai",
        type: "WHITE_LINE",
        loadVolumeM3: "10.000",
        manufacturer: "Hyundai",
        model: "R220",
        meterType: "HOUR_METER",
      },
    });
    await app.prisma.machineTransportSpecification.create({
      data: {
        machineId: machine.id,
        nominalCapacity: "10.000",
        effectiveCapacity: "10.000",
        capacityUnitCode: "M3_LOOSE",
      },
    });
    const initialReading = await app.prisma.machineMeterReading.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId,
        machineId: machine.id,
        readingSequence: 1,
        value: "2168.10",
        purpose: "INITIAL",
        actorUserId: pilot.administrator.id,
        recordedAt: new Date(
          new Date(`${reportDate}T00:00:00-03:00`).getTime() - 60_000,
        ),
      },
    });
    const employees = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${project.projectId}/mobilization/employees`,
      headers: { authorization },
      payload: {
        allocations: [
          {
            employmentId,
            shift: "day",
            confirmedJobRoleId: role.id,
            monthlyWorkloadHours: 220,
            compensationMode: "monthly",
            compensationValue: "5000.00",
            overtimeRate: "30.00",
            overtimeEnabled: false,
          },
          {
            employmentId: nightEmploymentId,
            shift: "night",
            confirmedJobRoleId: role.id,
            monthlyWorkloadHours: 180,
            compensationMode: "monthly",
            compensationValue: "5000.00",
            overtimeRate: "30.00",
          },
        ],
      },
    });
    expect(employees.statusCode, employees.body).toBe(200);
    const machines = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${project.projectId}/mobilization/machines`,
      headers: { authorization },
      payload: {
        allocations: [
          {
            machineId: machine.id,
            startMeterReadingId: initialReading.id,
            operatorAssignments: [
              { shift: "day", operatorEmploymentId: employmentId },
              {
                shift: "night",
                operatorEmploymentId: nightEmploymentId,
              },
            ],
          },
        ],
      },
    });
    expect(machines.statusCode, machines.body).toBe(200);
    const temporalStart = new Date(`${reportDate}T00:00:00-03:00`);
    await Promise.all([
      app.prisma.projectManagerTenure.updateMany({
        where: { projectId: project.projectId },
        data: { effectiveFrom: temporalStart },
      }),
      app.prisma.projectTechnicalResponsibility.updateMany({
        where: { projectId: project.projectId },
        data: { effectiveFrom: temporalStart },
      }),
      app.prisma.projectScheduleRevision.updateMany({
        where: { projectId: project.projectId },
        data: { effectiveFrom: temporalStart },
      }),
      app.prisma.projectEmployeeAllocation.updateMany({
        where: { projectId: project.projectId },
        data: { effectiveFrom: temporalStart },
      }),
      app.prisma.projectMachineAllocation.updateMany({
        where: { projectId: project.projectId },
        data: { effectiveFrom: temporalStart },
      }),
      app.prisma.projectMachineShiftAssignment.updateMany({
        where: { projectId: project.projectId },
        data: { effectiveFrom: temporalStart },
      }),
      app.prisma.project.update({
        where: { id: project.projectId },
        data: { status: "ACTIVE", actualStartedAt: temporalStart },
      }),
    ]);
    return {
      authorization,
      otherAuthorization,
      projectId: project.projectId,
      employmentId,
      nightEmploymentId,
      machineId: machine.id,
      initialReadingId: initialReading.id,
      reportDate,
    };
  }

  function bearer(input: {
    userId: string;
    corporationId: string;
    sessionId: string;
    companyId: string;
  }) {
    return `Bearer ${app.jwt.sign({ ...input, role: "MASTER_ADMIN" })}`;
  }

  function command(scope: Awaited<ReturnType<typeof setup>>, shift = "day") {
    const night = shift === "night";
    const operationalEmploymentId = night
      ? scope.nightEmploymentId
      : scope.employmentId;
    return {
      reportDate: scope.reportDate,
      shift,
      schedulePeriods: [
        {
          startTime: night ? "18:00" : "07:00",
          endTime: night ? "23:00" : "12:00",
          startDayOffset: 0,
          endDayOffset: 0,
        },
        ...(night
          ? []
          : [
              {
                startTime: "13:00",
                endTime: "18:00",
                startDayOffset: 0,
                endDayOffset: 0,
              },
            ]),
      ],
      activityStartTime: night ? "18:00" : "07:00",
      activityEndTime: night ? "23:00" : "18:00",
      activityEndDayOffset: 0,
      activityTypes: ["earthworks"],
      climateConditions: ["dry"],
      dailyRainfallMm: "0",
      monthlyRainfallMm: "0",
      supervisorEmploymentId: operationalEmploymentId,
      technicalResponsibilityEmploymentIds: [operationalEmploymentId],
      employees: [
        {
          employmentId: operationalEmploymentId,
          completedFullShift: true,
          regularWorkedMinutes: 1,
          overtimeMinutes: 60,
        },
      ],
      machines: night
        ? []
        : [{ machineId: scope.machineId, endMeterReadingValue: "2174.60" }],
      executedActivities: "Transporte de material para a área do açude.",
      interferences: "Parada para manutenção do ar-condicionado.",
    };
  }

  it("creates one draft per shift and isolates reports by company", async () => {
    const scope = await setup();
    await app.prisma.project.update({
      where: { id: scope.projectId },
      data: { status: "PAUSED" },
    });
    const unavailable = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/options?reportDate=${scope.reportDate}&shift=day`,
      headers: { authorization: scope.authorization },
    });
    expect(unavailable.statusCode, unavailable.body).toBe(409);
    expect(unavailable.json().code).toBe("DAILY_REPORT_PROJECT_UNAVAILABLE");
    await app.prisma.project.update({
      where: { id: scope.projectId },
      data: { status: "ACTIVE" },
    });
    const options = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/options?reportDate=${scope.reportDate}&shift=day`,
      headers: { authorization: scope.authorization },
    });
    expect(options.statusCode, options.body).toBe(200);
    expect(options.json().data.defaults.scheduleScale).toBe("Seg. a Sáb.");
    expect(options.json().data.defaults.breakTemplates).toEqual([
      expect.objectContaining({ name: "Almoço", durationMinutes: 60 }),
    ]);
    expect(options.json().data.machineOptions[0].startMeterReading.value).toBe(
      "2168.10",
    );

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: command(scope),
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().data.employees[0]).toMatchObject({
      name: "Rafael Brito",
      completedFullShift: true,
      regularWorkedMinutes: 660,
      overtimeMinutes: 60,
    });
    const reportId = created.json().data.id as string;
    const updated = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}`,
      headers: { authorization: scope.authorization },
      payload: {
        ...command(scope),
        executedActivities: "Atividade atualizada no rascunho.",
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().data.executedActivities).toBe(
      "Atividade atualizada no rascunho.",
    );
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}`,
      headers: { authorization: scope.authorization },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data.project).toMatchObject({
      name: "Jardim das Oliveiras",
      municipality: "Imperatriz",
      state: "MA",
    });

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: command(scope),
    });
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json().code).toBe("DAILY_REPORT_ALREADY_EXISTS");

    const night = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: command(scope, "night"),
    });
    expect(night.statusCode, night.body).toBe(201);

    const firstPage = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports?limit=1`,
      headers: { authorization: scope.authorization },
    });
    expect(firstPage.statusCode, firstPage.body).toBe(200);
    expect(firstPage.json().data.data).toHaveLength(1);
    expect(firstPage.json().data.data[0].shift).toBe("night");
    expect(firstPage.json().data.pageInfo.hasNextPage).toBe(true);
    const secondPage = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports?limit=1&cursor=${encodeURIComponent(firstPage.json().data.pageInfo.nextCursor)}`,
      headers: { authorization: scope.authorization },
    });
    expect(secondPage.statusCode, secondPage.body).toBe(200);
    expect(secondPage.json().data.data[0].shift).toBe("day");

    const isolated = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.otherAuthorization },
    });
    expect(isolated.statusCode, isolated.body).toBe(200);
    expect(isolated.json().data.data).toEqual([]);
  });

  it("applies the shared shift breaks to automatic employee hours", async () => {
    const scope = await setup();
    const started = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/operational-days/${scope.reportDate}/shifts/day/start`,
      headers: { authorization: scope.authorization },
      payload: {
        startedAt: `${scope.reportDate}T10:00:00.000Z`,
        employees: [
          {
            employmentId: scope.employmentId,
            status: "present",
            absenceReason: null,
          },
        ],
        machines: [
          {
            machineId: scope.machineId,
            condition: "fit",
            conditionNote: null,
          },
        ],
      },
    });
    expect(started.statusCode, started.body).toBe(201);
    const reportId = started.json().data.id as string;

    const rdo = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/operational-shifts/${reportId}/rdo`,
      headers: { authorization: scope.authorization },
      payload: {
        schedulePeriods: [
          {
            startTime: "07:00",
            endTime: "18:00",
            startDayOffset: 0,
            endDayOffset: 0,
          },
        ],
        activityStartTime: "07:00",
        activityEndTime: "18:00",
        activityEndDayOffset: 0,
        activityTypes: ["earthworks"],
        climateConditions: ["dry"],
        dailyRainfallMm: "0",
        monthlyRainfallMm: "0",
        supervisorEmploymentId: scope.employmentId,
        technicalResponsibilityEmploymentIds: [scope.employmentId],
        executedActivities: "Execução acompanhada pela central operacional.",
      },
    });
    expect(rdo.statusCode, rdo.body).toBe(200);

    const closed = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/operational-shifts/${reportId}/close`,
      headers: { authorization: scope.authorization },
      payload: {
        endedAt: `${scope.reportDate}T22:00:00.000Z`,
        earlyClosureReason: null,
        employees: [
          {
            employmentId: scope.employmentId,
            checkInAt: null,
            checkOutAt: null,
            breaks: [
              {
                startAt: `${scope.reportDate}T15:00:00.000Z`,
                endAt: `${scope.reportDate}T16:00:00.000Z`,
              },
            ],
            overtimeConfirmed: true,
          },
        ],
        machines: [
          { machineId: scope.machineId, endMeterReadingValue: "2170.00" },
        ],
      },
    });
    expect(closed.statusCode, closed.body).toBe(200);
    expect(closed.json().data.employees[0]).toMatchObject({
      regularWorkedMinutes: 600,
      overtimeMinutes: 0,
      breaks: [
        {
          startAt: `${scope.reportDate}T15:00:00.000Z`,
          endAt: `${scope.reportDate}T16:00:00.000Z`,
        },
      ],
    });
  });

  it("records scoped and audited live shift, employee, and machine statuses", async () => {
    const scope = await setup();
    const started = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/operational-days/${scope.reportDate}/shifts/day/start`,
      headers: { authorization: scope.authorization },
      payload: {
        startedAt: `${scope.reportDate}T10:00:00.000Z`,
        employees: [
          {
            employmentId: scope.employmentId,
            status: "present",
            absenceReason: null,
          },
        ],
        machines: [
          {
            machineId: scope.machineId,
            condition: "fit",
            conditionNote: null,
          },
        ],
      },
    });
    expect(started.statusCode, started.body).toBe(201);
    const reportId = started.json().data.id as string;
    expect(started.json().data).toMatchObject({
      liveState: { status: "working" },
      employees: [{ liveState: { status: "working" } }],
      machines: [{ liveState: { status: "working" } }],
    });

    const transition = (payload: Record<string, string>) =>
      app.inject({
        method: "POST",
        url: `/api/v1/projects/${scope.projectId}/operational-shifts/${reportId}/status-events`,
        headers: { authorization: scope.authorization },
        payload,
      });
    const paused = await transition({ type: "shift", status: "paused" });
    expect(paused.statusCode, paused.body).toBe(201);
    expect(paused.json().data.liveState.status).toBe("paused");
    expect(paused.json().data.liveBreaks).toMatchObject([
      { endAt: null },
    ]);

    const stopped = await transition({
      type: "employee",
      employmentId: scope.employmentId,
      status: "stopped",
    });
    expect(stopped.statusCode, stopped.body).toBe(201);
    expect(stopped.json().data.employees[0].liveState.status).toBe("stopped");

    const maintenance = await transition({
      type: "machine",
      machineId: scope.machineId,
      status: "maintenance",
    });
    expect(maintenance.statusCode, maintenance.body).toBe(201);
    expect(maintenance.json().data.machines[0].liveState.status).toBe(
      "maintenance",
    );

    const duplicate = await transition({ type: "shift", status: "paused" });
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json().code).toBe("OPERATIONAL_STATUS_CONFLICT");

    const isolated = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/operational-shifts/${reportId}/status-events`,
      headers: { authorization: scope.otherAuthorization },
      payload: { type: "shift", status: "working" },
    });
    expect(isolated.statusCode, isolated.body).toBe(404);

    const events = await app.prisma.projectDailyReportStatusEvent.findMany({
      where: { dailyReportId: reportId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    expect(events).toHaveLength(6);
    expect(events.map((event) => event.type)).toEqual([
      "SHIFT",
      "EMPLOYEE",
      "MACHINE",
      "SHIFT",
      "EMPLOYEE",
      "MACHINE",
    ]);
    expect(events.every((event) => event.actorUserId)).toBe(true);
  });

  it("finalizes atomically, creates meter references and becomes immutable", async () => {
    const scope = await setup();
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: command(scope),
    });
    expect(created.statusCode, created.body).toBe(201);
    const reportId = created.json().data.id as string;

    const finalized = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}/finalize`,
      headers: { authorization: scope.authorization },
    });
    expect(finalized.statusCode, finalized.body).toBe(200);
    expect(finalized.json().data.status).toBe("finalized");
    expect(finalized.json().data.machines[0].endMeterReading.id).toEqual(
      expect.any(String),
    );
    const readings = await app.prisma.machineMeterReading.findMany({
      where: { machineId: scope.machineId },
      orderBy: { readingSequence: "asc" },
      include: { references: true },
    });
    expect(readings).toHaveLength(2);
    expect(readings[1]).toMatchObject({
      readingSequence: 2,
      purpose: "ORDINARY",
    });
    expect(
      readings.flatMap((reading) =>
        reading.references.map((reference) => reference.sourceType),
      ),
    ).toEqual(
      expect.arrayContaining([
        "PROJECT_DAILY_REPORT_START",
        "PROJECT_DAILY_REPORT_END",
      ]),
    );

    const nightCommand = command(scope, "night");
    nightCommand.machines = [
      { machineId: scope.machineId, endMeterReadingValue: "2176.00" },
    ];
    const night = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: nightCommand,
    });
    expect(night.statusCode, night.body).toBe(201);
    expect(night.json().data.machines[0].startMeterReading.value).toBe(
      "2174.60",
    );
    const finalizedNight = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${night.json().data.id}/finalize`,
      headers: { authorization: scope.authorization },
    });
    expect(finalizedNight.statusCode, finalizedNight.body).toBe(200);
    const chainedReadings = await app.prisma.machineMeterReading.findMany({
      where: { machineId: scope.machineId },
      orderBy: { readingSequence: "asc" },
    });
    expect(chainedReadings).toHaveLength(3);
    expect(chainedReadings[2]).toMatchObject({ readingSequence: 3 });
    expect(chainedReadings[2]!.value.toFixed(2)).toBe("2176.00");

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}`,
      headers: { authorization: scope.authorization },
      payload: command(scope),
    });
    expect(update.statusCode, update.body).toBe(409);
    expect(update.json().code).toBe("DAILY_REPORT_IMMUTABLE");
  });

  it("rolls back finalization when the initial machine reading is stale", async () => {
    const scope = await setup();
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: command(scope),
    });
    expect(created.statusCode, created.body).toBe(201);
    const reportId = created.json().data.id as string;
    await app.prisma.machineMeterReading.create({
      data: {
        corporationId: (
          await app.prisma.project.findUniqueOrThrow({
            where: { id: scope.projectId },
          })
        ).corporationId,
        companyId: (
          await app.prisma.project.findUniqueOrThrow({
            where: { id: scope.projectId },
          })
        ).companyId,
        machineId: scope.machineId,
        readingSequence: 2,
        value: "2170.00",
        purpose: "ORDINARY",
        actorUserId: (
          await app.prisma.projectDailyReport.findUniqueOrThrow({
            where: { id: reportId },
          })
        ).createdByUserId,
        recordedAt: new Date(),
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}/finalize`,
      headers: { authorization: scope.authorization },
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().code).toBe("DAILY_REPORT_METER_READING_CONFLICT");
    const report = await app.prisma.projectDailyReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { machineEntries: true },
    });
    expect(report.status).toBe("DRAFT");
    expect(report.machineEntries[0]?.endMeterReadingId).toBeNull();
  });

  it("links submitted operational revisions and invalidates only after operational reopening", async () => {
    const scope = await setup();
    const project = await app.prisma.project.findUniqueOrThrow({
      where: { id: scope.projectId },
    });
    const session = await app.prisma.session.findFirstOrThrow({
      where: {
        corporationId: project.corporationId,
        companyId: project.companyId,
      },
    });
    const effectiveFrom = new Date(`${scope.reportDate}T00:00:00-03:00`);
    const front = await app.prisma.projectWorkFront.create({
      data: {
        corporationId: project.corporationId,
        companyId: project.companyId,
        projectId: project.id,
        name: "Frente de transporte",
        location: "Estacas 10 a 25",
        status: "ACTIVE",
        actualStartedAt: effectiveFrom,
      },
    });
    const service = await app.prisma.projectWorkFrontService.create({
      data: {
        corporationId: project.corporationId,
        companyId: project.companyId,
        projectId: project.id,
        workFrontId: front.id,
        serviceCode: "cut",
        unitCode: "M3",
        quantity: "5000.00",
        productionProfile: "EXCAVATION",
        dmtPolicy: "OPTIONAL",
      },
    });
    await app.prisma.projectWorkFrontMachineAssignment.create({
      data: {
        corporationId: project.corporationId,
        companyId: project.companyId,
        projectId: project.id,
        workFrontId: front.id,
        machineId: scope.machineId,
        operatorEmploymentId: scope.employmentId,
        effectiveFrom,
        createdByUserId: session.userId,
      },
    });
    const yellowMachineModel = await app.prisma.machineModel.create({
      data: {
        corporationId: project.corporationId,
        companyId: project.companyId,
        type: "YELLOW_LINE",
        manufacturer: "Teste",
        model: "YL-01",
        normalizedManufacturer: "teste",
        normalizedModel: "yl-01",
        normalizedVersion: "",
        meterType: "HOUR_METER",
        requiresOperator: false,
      },
    });
    const yellowMachine = await app.prisma.machine.create({
      data: {
        corporationId: project.corporationId,
        machineModelId: yellowMachineModel.id,
        name: "Máquina amarela inelegível",
        type: "YELLOW_LINE",
        manufacturer: "Teste",
        model: "YL-01",
        meterType: "HOUR_METER",
      },
    });
    const whiteWithoutVolumeModel = await app.prisma.machineModel.create({
      data: {
        corporationId: project.corporationId,
        companyId: project.companyId,
        type: "WHITE_LINE",
        manufacturer: "Teste",
        model: "WL-00",
        normalizedManufacturer: "teste",
        normalizedModel: "wl-00",
        normalizedVersion: "",
        meterType: "HOUR_METER",
        requiresOperator: false,
      },
    });
    const whiteWithoutVolume = await app.prisma.machine.create({
      data: {
        corporationId: project.corporationId,
        machineModelId: whiteWithoutVolumeModel.id,
        name: "Linha branca sem volume",
        type: "WHITE_LINE",
        manufacturer: "Teste",
        model: "WL-00",
        meterType: "HOUR_METER",
      },
    });
    await app.prisma.projectWorkFrontMachineAssignment.createMany({
      data: [yellowMachine, whiteWithoutVolume].map((machine) => ({
        corporationId: project.corporationId,
        companyId: project.companyId,
        projectId: project.id,
        workFrontId: front.id,
        machineId: machine.id,
        operatorEmploymentId: scope.employmentId,
        effectiveFrom,
        createdByUserId: session.userId,
      })),
    });
    const commonProduction = {
      productionDate: scope.reportDate,
      shift: "day",
      startTime: "07:00",
      endTime: "18:00",
      endDayOffset: 0,
      responsibleEmploymentId: scope.employmentId,
      evidence: [
        {
          kind: "ticket",
          name: "Ticket 001",
          url: "https://example.test/tickets/001.pdf",
          notes: null,
        },
      ],
      notes: null,
    };
    const equipment = {
      machineId: scope.machineId,
      role: "transport",
      operatorEmploymentId: scope.employmentId,
      workedMinutes: 600,
      productiveMinutes: 540,
      waitingMinutes: 30,
      stoppedMinutes: 30,
      initialMeterValue: null,
      finalMeterValue: null,
      defaultTripCapacityM3: null,
      stops: [],
    };

    const options = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/productions/options?productionDate=${scope.reportDate}&shift=day`,
      headers: { authorization: scope.authorization },
    });
    expect(options.statusCode, options.body).toBe(200);
    const productionOptions = options
      .json()
      .data.workFronts.find((item: { id: string }) => item.id === front.id);
    expect(
      productionOptions.equipment.map((machine: { id: string }) => machine.id),
    ).toEqual(
      expect.arrayContaining([
        scope.machineId,
        yellowMachine.id,
        whiteWithoutVolume.id,
      ]),
    );
    expect(
      productionOptions.trucks.map((machine: { id: string }) => machine.id),
    ).toEqual([scope.machineId]);
    expect(options.json().data.dateLimits).toMatchObject({
      maximum: dateInSaoPauloDaysAgo(0),
      timeZone: "America/Sao_Paulo",
    });

    const direct = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions`,
      headers: { authorization: scope.authorization },
      payload: {
        ...commonProduction,
        kind: "individual_activity",
        startTime: null,
        endTime: null,
        submitNow: true,
        entryMode: "direct_total",
        individualActivity: {
          workFrontId: front.id,
          workFrontServiceId: service.id,
          quantityMethod: "manual",
          location: "Estacas 10 a 25",
          startStation: "10+000",
          endStation: "25+000",
          layer: null,
          elevation: null,
          materialName: "Solo de 1ª categoria",
          materialCategory: "Material comum",
          volumeCondition: "bank",
          operationalQuantity: "100.125",
          conversionFactor: null,
          layerThicknessCm: null,
          compactionPasses: null,
          moistureCondition: null,
          exceptionalFromMovement: false,
          exceptionReason: null,
        },
        truckSummaries: [],
        equipment: [
          { ...equipment, machineId: yellowMachine.id, role: "excavation" },
        ],
      },
    });
    expect(direct.statusCode, direct.body).toBe(201);
    expect(direct.json().data).toMatchObject({
      kind: "individual_activity",
      status: "submitted",
      unitCode: "M3_BANK",
      operationalRevision: 1,
      startTime: null,
      endTime: null,
    });
    expect(direct.json().data.metrics.officialQuantity).toBe("100.125");

    const route = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/haul-routes`,
      headers: { authorization: scope.authorization },
      payload: {
        code: "corte-a-aterro-b",
        name: "Corte A → Aterro B",
        origin: "Corte A",
        destination: "Aterro B",
        loadedDistanceKm: "5.000",
        emptyReturnDistanceKm: "4.500",
        contractualDmtKm: "5.000",
        contractualBand: "0-5 km",
        effectiveFrom: `${scope.reportDate}T00:00:00-03:00`,
      },
    });
    expect(route.statusCode, route.body).toBe(201);

    const draft = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions`,
      headers: { authorization: scope.authorization },
      payload: {
        ...commonProduction,
        kind: "material_movement",
        submitNow: false,
        entryMode: "trips",
        materialMovement: {
          workFrontId: front.id,
          workFrontServiceId: service.id,
          destinationWorkFrontId: front.id,
          routeRevisionId: route.json().data.revision.id,
          origin: "Corte A",
          destination: "Aterro B",
          dmtKm: "5.000",
          contractualDmtKm: "5.000",
          contractualBand: "0-5 km",
          layer: "Camada 1",
          volumeCondition: "loose",
          layerThicknessCm: null,
          compactionPasses: null,
          moistureCondition: null,
          components: [
            {
              workFrontId: front.id,
              workFrontServiceId: service.id,
              type: "cut",
              operationalQuantity: "18.500",
              unitCode: "M3_BANK",
              volumeCondition: "bank",
            },
            {
              workFrontId: front.id,
              workFrontServiceId: service.id,
              type: "transport",
              operationalQuantity: null,
              unitCode: "M3_LOOSE",
              volumeCondition: "loose",
            },
          ],
        },
        truckSummaries: [
          {
            machineId: scope.machineId,
            driverEmploymentId: scope.employmentId,
            acceptedTrips: 0,
            rejectedTrips: 0,
            partialTripCount: 0,
            partialVolume: "0",
            actualWeightT: null,
            loadFactor: "1",
            averageCycleMinutes: null,
            occurrenceNotes: null,
          },
        ],
        equipment: [equipment],
      },
    });
    expect(draft.statusCode, draft.body).toBe(201);
    expect(draft.json().data.equipment[0].defaultTripCapacityM3).toBe("10.000");
    expect(draft.json().data).toMatchObject({
      materialName: null,
      origin: front.name,
      destination: front.name,
      startTime: "07:00",
      endTime: "18:00",
    });
    const draftId = draft.json().data.id as string;
    const productionEquipmentId = draft.json().data.equipment[0].id as string;
    const idempotencyKey = "00000000-0000-4000-8000-000000002999";
    const firstTripPayload = {
      expectedRevision: 1,
      idempotencyKey,
      productionEquipmentId,
      recordedAt: `${scope.reportDate}T13:00:00-03:00`,
      capacityM3: "10.000",
      adjustedVolumeM3: "9.500",
      ticketNumber: "VT-001",
      notes: null,
    };
    const firstTrip = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/trips`,
      headers: { authorization: scope.authorization },
      payload: firstTripPayload,
    });
    expect(firstTrip.statusCode, firstTrip.body).toBe(201);
    expect(firstTrip.json().data.metrics.operationalVolumeM3).toBe("9.500");
    expect(firstTrip.json().data.metrics.officialQuantity).toBe("9.500");
    const repeatedTrip = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/trips`,
      headers: { authorization: scope.authorization },
      payload: firstTripPayload,
    });
    expect(repeatedTrip.statusCode, repeatedTrip.body).toBe(201);
    expect(repeatedTrip.json().data.metrics.tripCount).toBe(1);

    const secondTrip = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/trips`,
      headers: { authorization: scope.authorization },
      payload: {
        ...firstTripPayload,
        expectedRevision: 2,
        idempotencyKey: "00000000-0000-4000-8000-000000002998",
        recordedAt: `${scope.reportDate}T14:00:00-03:00`,
        adjustedVolumeM3: null,
        ticketNumber: "VT-002",
      },
    });
    expect(secondTrip.statusCode, secondTrip.body).toBe(201);
    expect(secondTrip.json().data.metrics.operationalVolumeM3).toBe("19.500");
    expect(secondTrip.json().data.metrics.officialQuantity).toBe("19.500");

    const thirdTrip = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/trips`,
      headers: { authorization: scope.authorization },
      payload: {
        ...firstTripPayload,
        expectedRevision: 3,
        idempotencyKey: "00000000-0000-4000-8000-000000002997",
        recordedAt: `${scope.reportDate}T15:00:00-03:00`,
        adjustedVolumeM3: null,
        ticketNumber: "VT-003",
      },
    });
    expect(thirdTrip.statusCode, thirdTrip.body).toBe(201);
    expect(thirdTrip.json().data.metrics.officialQuantity).toBe("29.500");
    const removedTrip = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/trips/${thirdTrip.json().data.trips[2].id}?expectedRevision=4`,
      headers: { authorization: scope.authorization },
    });
    expect(removedTrip.statusCode, removedTrip.body).toBe(200);
    expect(removedTrip.json().data.metrics.officialQuantity).toBe("19.500");

    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/submit`,
      headers: { authorization: scope.authorization },
      payload: { expectedRevision: 5 },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json().data).toMatchObject({
      status: "submitted",
      operationalRevision: 5,
    });
    const checked = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/check`,
      headers: { authorization: scope.authorization },
      payload: { expectedRevision: 6 },
    });
    expect(checked.statusCode, checked.body).toBe(200);
    const quality = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/quality-checks`,
      headers: { authorization: scope.authorization },
      payload: {
        expectedRevision: 7,
        type: "field_inspection",
        status: "accepted",
        value: null,
        unitCode: null,
        notes: "Conferência de campo aceita",
        evidence: [],
      },
    });
    expect(quality.statusCode, quality.body).toBe(200);
    const cutComponent = quality
      .json()
      .data.components.find(
        (component: { type: string }) => component.type === "cut",
      );
    const technicalAcceptance = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/quality-checks`,
      headers: { authorization: scope.authorization },
      payload: {
        expectedRevision: 8,
        type: "topography",
        status: "accepted",
        value: "18.750",
        unitCode: "M3_BANK",
        notes: "Volume topográfico aceito",
        evidence: [],
        acceptedQuantity: {
          componentId: cutComponent.id,
          value: "18.750",
          unitCode: "M3_BANK",
          volumeCondition: "bank",
        },
      },
    });
    expect(technicalAcceptance.statusCode, technicalAcceptance.body).toBe(200);
    expect(
      technicalAcceptance
        .json()
        .data.components.find(
          (component: { id: string }) => component.id === cutComponent.id,
        ).quantities,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "technically_accepted",
          method: "topography",
          value: "18.750",
          unitCode: "M3_BANK",
        }),
      ]),
    );
    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/approve`,
      headers: { authorization: scope.authorization },
      payload: { expectedRevision: 9 },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json().data).toMatchObject({
      status: "approved",
      operationalRevision: 5,
    });
    const released = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/release`,
      headers: { authorization: scope.authorization },
      payload: { expectedRevision: approved.json().data.revision },
    });
    expect(released.statusCode, released.body).toBe(200);
    expect(released.json().data).toMatchObject({
      status: "released",
      operationalRevision: 5,
    });
    const history = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/history?limit=20`,
      headers: { authorization: scope.authorization },
    });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json().data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "submitted" }),
        expect.objectContaining({ event: "field_checked" }),
        expect.objectContaining({ event: "approved" }),
        expect.objectContaining({ event: "released" }),
      ]),
    );

    const report = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: command(scope),
    });
    expect(report.statusCode, report.body).toBe(201);
    const reportId = report.json().data.id as string;
    const pendingConfirmation = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}/productions`,
      headers: { authorization: scope.authorization },
    });
    expect(pendingConfirmation.statusCode, pendingConfirmation.body).toBe(200);
    expect(pendingConfirmation.json().data.needsReconfirmation).toBe(true);
    const unconfirmed = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}/finalize`,
      headers: { authorization: scope.authorization },
    });
    expect(unconfirmed.statusCode, unconfirmed.body).toBe(409);
    expect(unconfirmed.json().code).toBe(
      "PRODUCTION_RDO_CONFIRMATION_REQUIRED",
    );
    const confirmation = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}/productions/confirm`,
      headers: { authorization: scope.authorization },
      payload: {
        productionIds: [direct.json().data.id, draftId],
      },
    });
    expect(confirmation.statusCode, confirmation.body).toBe(200);
    expect(confirmation.json().data.needsReconfirmation).toBe(false);
    const finalized = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}/finalize`,
      headers: { authorization: scope.authorization },
    });
    expect(finalized.statusCode, finalized.body).toBe(200);

    const reopened = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/reopen`,
      headers: { authorization: scope.authorization },
      payload: {
        expectedRevision: released.json().data.revision,
        reason: "Correção do volume medido",
      },
    });
    expect(reopened.statusCode, reopened.body).toBe(200);
    expect(reopened.json().data.rdo).toEqual({ linked: true, stale: true });
    const summary = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/daily-reports/${reportId}/productions`,
      headers: { authorization: scope.authorization },
    });
    expect(summary.statusCode, summary.body).toBe(200);
    expect(summary.json().data.needsReconfirmation).toBe(true);
  });
});

function dateInSaoPauloDaysAgo(days: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const current = new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
  current.setUTCDate(current.getUTCDate() - days);
  return current.toISOString().slice(0, 10);
}

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
      breakTemplates: [],
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
    const machine = await app.prisma.machine.create({
      data: {
        corporationId: pilot.corporation.id,
        name: "EH-01 Hyundai",
        type: "WHITE_LINE",
        loadVolumeM3: "10.000",
        manufacturer: "Hyundai",
        model: "R220",
        meterType: "HOUR_METER",
      },
    });
    await app.prisma.machineOwnershipPeriod.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId,
        machineId: machine.id,
        effectiveFrom: new Date(`${reportDate}T00:00:00-03:00`),
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

  it("links only approved production revisions and invalidates the RDO link after reopening", async () => {
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
        productionProfile: "TRANSPORT",
        dmtPolicy: "REQUIRED",
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
    const yellowMachine = await app.prisma.machine.create({
      data: {
        corporationId: project.corporationId,
        name: "Máquina amarela inelegível",
        type: "YELLOW_LINE",
        manufacturer: "Teste",
        model: "YL-01",
        meterType: "HOUR_METER",
      },
    });
    const whiteWithoutVolume = await app.prisma.machine.create({
      data: {
        corporationId: project.corporationId,
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
    const baseProduction = {
      workFrontId: front.id,
      workFrontServiceId: service.id,
      productionDate: scope.reportDate,
      shift: "day",
      startTime: "07:00",
      endTime: "18:00",
      endDayOffset: 0,
      responsibleEmploymentId: scope.employmentId,
      location: "Estacas 10 a 25",
      startStation: "10+000",
      endStation: "25+000",
      materialName: "Solo de 1ª categoria",
      materialCategory: "Material comum",
      volumeCondition: "loose",
      conversionFactor: null,
      origin: "Corte A",
      destination: "Aterro B",
      dmtKm: "5.000",
      layer: null,
      elevation: null,
      layerThicknessCm: null,
      compactionPasses: null,
      moistureCondition: null,
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

    const options = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/productions/options?productionDate=${scope.reportDate}&shift=day`,
      headers: { authorization: scope.authorization },
    });
    expect(options.statusCode, options.body).toBe(200);
    expect(
      options
        .json()
        .data.workFronts.find((item: { id: string }) => item.id === front.id)
        .machines.map((machine: { id: string }) => machine.id),
    ).toEqual([scope.machineId]);

    const manualIneligibleMachine = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions`,
      headers: { authorization: scope.authorization },
      payload: {
        ...baseProduction,
        approveNow: false,
        entryMode: "direct_total",
        directQuantity: "1.000",
        measuredQuantity: null,
        equipment: [
          {
            machineId: yellowMachine.id,
            role: "transport",
            operatorEmploymentId: scope.employmentId,
            workedMinutes: 10,
            initialMeterValue: null,
            finalMeterValue: null,
            defaultTripCapacityM3: "99.000",
            stops: [],
          },
        ],
      },
    });
    expect(manualIneligibleMachine.statusCode).toBe(409);
    expect(manualIneligibleMachine.json().code).toBe(
      "PRODUCTION_RESOURCE_UNAVAILABLE",
    );

    const direct = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions`,
      headers: { authorization: scope.authorization },
      payload: {
        ...baseProduction,
        approveNow: true,
        entryMode: "direct_total",
        directQuantity: "100.125",
        measuredQuantity: "96.500",
        equipment: [
          {
            machineId: scope.machineId,
            role: "transport",
            operatorEmploymentId: scope.employmentId,
            workedMinutes: 600,
            initialMeterValue: "2168.10",
            finalMeterValue: "2174.60",
            defaultTripCapacityM3: null,
            stops: [],
          },
        ],
      },
    });
    expect(direct.statusCode, direct.body).toBe(201);
    expect(direct.json().data.metrics.officialQuantity).toBe("96.500");
    expect(direct.json().data.equipment[0].defaultTripCapacityM3).toBe(
      "10.000",
    );
    expect(direct.json().data.approval.direct).toBe(true);

    const draft = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions`,
      headers: { authorization: scope.authorization },
      payload: {
        ...baseProduction,
        approveNow: false,
        entryMode: "trips",
        directQuantity: null,
        measuredQuantity: null,
        equipment: [
          {
            machineId: scope.machineId,
            role: "transport",
            operatorEmploymentId: scope.employmentId,
            workedMinutes: 600,
            initialMeterValue: null,
            finalMeterValue: null,
            defaultTripCapacityM3: "99.000",
            stops: [
              {
                durationMinutes: 30,
                reason: "Manutenção preventiva",
                notes: null,
              },
            ],
          },
        ],
      },
    });
    expect(draft.statusCode, draft.body).toBe(201);
    expect(draft.json().data.equipment[0].defaultTripCapacityM3).toBe("10.000");
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

    const updated = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}`,
      headers: { authorization: scope.authorization },
      payload: {
        ...baseProduction,
        expectedRevision: 5,
        approveNow: false,
        entryMode: "trips",
        directQuantity: null,
        measuredQuantity: "18.000",
        equipment: [
          {
            machineId: scope.machineId,
            role: "transport",
            operatorEmploymentId: scope.employmentId,
            workedMinutes: 600,
            initialMeterValue: null,
            finalMeterValue: null,
            defaultTripCapacityM3: "10.000",
            stops: [],
          },
        ],
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().data.metrics).toMatchObject({
      officialQuantity: "18.000",
      operationalVolumeM3: "19.500",
      difference: "-1.500",
      transportMomentM3Km: "97.500",
    });
    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/productions/${draftId}/approve`,
      headers: { authorization: scope.authorization },
      payload: { expectedRevision: 6 },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json().data.approval.direct).toBe(false);

    const report = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/daily-reports`,
      headers: { authorization: scope.authorization },
      payload: command(scope),
    });
    expect(report.statusCode, report.body).toBe(201);
    const reportId = report.json().data.id as string;
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
        expectedRevision: approved.json().data.revision,
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

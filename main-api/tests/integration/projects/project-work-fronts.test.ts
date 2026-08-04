import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../../src/app";
import { OrganizationService } from "../../../src/modules/organization/organization.service";
import type { ProjectCommand } from "../../../src/modules/projects/projects.dto";
import { ProjectsService } from "../../../src/modules/projects/projects.service";
import { resetIntegrationData } from "../reset-integration-data";
import { encodeCursor } from "../../../src/lib/utils/cursor-pagination";

import type { FastifyInstance } from "fastify";

describe("project work-front quantities", () => {
  const syntheticEmployeeCpfFixture = "111.444.777-35";
  const syntheticClientCnpjFixture = "12.345.678/0001-95";
  const syntheticFuelSupplierCpfFixture = "529.982.247-25";
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
      corporationName: "Project work fronts",
      domainHost: "project-work-fronts.localhost",
      adminEmail: "master@example.com",
      adminPassword: "correct integration password",
      companyNames: ["One"],
    });
    const companyId = pilot.companies[0].id;
    const now = new Date();
    const session = await app.prisma.session.create({
      data: {
        corporationId: pilot.corporation.id,
        userId: pilot.administrator.id,
        companyId,
        refreshTokenHash: "project-work-front-refresh-token",
        idleExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        absoluteExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    const authorization = `Bearer ${app.jwt.sign({
      userId: pilot.administrator.id,
      corporationId: pilot.corporation.id,
      sessionId: session.id,
      role: "MASTER_ADMIN",
      companyId,
    })}`;
    const role = await app.prisma.jobRole.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId,
        name: "Engenheiro",
        normalizedName: "engenheiro",
      },
    });
    const employeeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: {
        document: syntheticEmployeeCpfFixture,
        fullName: "Responsável técnico",
        companyRegistrationNumber: "ENG-001",
        admissionDate: "2026-07-01",
        jobRoleId: role.id,
      },
    });
    expect(employeeResponse.statusCode, employeeResponse.body).toBe(201);
    const employmentId = employeeResponse.json().data.id as string;
    const clientResponse = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization },
      payload: {
        entityType: "legal_entity",
        document: syntheticClientCnpjFixture,
        legalName: "Cliente da obra Ltda",
      },
    });
    expect(clientResponse.statusCode, clientResponse.body).toBe(201);
    const clientId = clientResponse.json().data.id as string;
    const projectCommand: ProjectCommand = {
      name: "Obra de teste",
      address: {
        postalCode: "60170000",
        street: "Rua A",
        number: "10",
        complement: null,
        neighborhood: "Meireles",
        city: "Fortaleza",
        state: "CE",
      },
      latitude: null,
      longitude: null,
      contractNumber: null,
      approvedBudget: "100.00",
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-12-31",
      clientId,
      managerEmploymentId: employmentId,
      technicalResponsibilityEmploymentIds: [employmentId],
      weeklySchedule: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        shift: "day",
        dayOfWeek,
        isWorking: dayOfWeek < 6,
        startTime: dayOfWeek < 6 ? "08:00" : null,
        endTime: dayOfWeek < 6 ? "17:00" : null,
        endDayOffset: 0,
      })),
      breakTemplates: [],
      initialEmployeeAllocations: [],
      initialMachineAllocations: [],
      projectSupplierOffers: [],
    };
    const projectScope = {
      corporationId: pilot.corporation.id,
      companyId,
      sessionId: session.id,
      userId: pilot.administrator.id,
      role: "MASTER_ADMIN" as const,
    };
    const project = await new ProjectsService(app.handlerContext).finalize(
      projectScope,
      companyId,
      "00000000-0000-4000-8000-000000000901",
      projectCommand,
    );
    const revision = await app.prisma.projectQuantityBaselineRevision.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId,
        projectId: project.projectId,
        revision: 1,
        createdByUserId: pilot.administrator.id,
      },
      select: { id: true },
    });
    await app.prisma.projectQuantityBaselineItem.create({
      data: {
        revisionId: revision.id,
        serviceCode: "cut",
        unitCode: "M3",
        total: "100.00",
      },
    });
    return {
      authorization,
      projectId: project.projectId,
      corporationId: pilot.corporation.id,
      companyId,
      userId: pilot.administrator.id,
      employmentId,
      jobRoleId: role.id,
    };
  }

  async function prepareProjectResources(
    scope: Awaited<ReturnType<typeof setup>>,
    activateDirectly = true,
  ) {
    const machine = await app.prisma.machine.create({
      data: {
        corporationId: scope.corporationId,
        name: "Escavadeira de teste",
        type: "YELLOW_LINE",
        manufacturer: "Teste",
        model: "EX-01",
        meterType: "HOUR_METER",
      },
    });
    await app.prisma.machineOwnershipPeriod.create({
      data: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        machineId: machine.id,
      },
    });
    const reading = await app.prisma.machineMeterReading.create({
      data: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        machineId: machine.id,
        readingSequence: 1,
        value: "10.00",
        purpose: "INITIAL",
        actorUserId: scope.userId,
      },
    });
    const employees = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/mobilization/employees`,
      headers: { authorization: scope.authorization },
      payload: {
        allocations: [
          {
            employmentId: scope.employmentId,
            confirmedJobRoleId: scope.jobRoleId,
            monthlyWorkloadHours: 220,
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
      url: `/api/v1/projects/${scope.projectId}/mobilization/machines`,
      headers: { authorization: scope.authorization },
      payload: {
        allocations: [
          {
            machineId: machine.id,
            startMeterReadingId: reading.id,
            operatorEmploymentId: scope.employmentId,
          },
        ],
      },
    });
    expect(machines.statusCode, machines.body).toBe(200);
    if (activateDirectly)
      await app.prisma.project.update({
        where: { id: scope.projectId },
        data: { status: "ACTIVE", actualStartedAt: new Date() },
      });
    return { machineId: machine.id };
  }

  function createFront(
    authorization: string,
    projectId: string,
    name: string,
    quantity: string,
  ) {
    return app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/fronts`,
      headers: { authorization },
      payload: {
        name,
        requiresEmployees: true,
        requiresMachines: true,
        services: [{ serviceCode: "cut", unitCode: "M3", quantity }],
      },
    });
  }

  it("accepts quantity, blocks an excess and allows the exact balance", async () => {
    const scope = await setup();
    const first = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente 1",
      "60.00",
    );
    expect(first.statusCode, first.body).toBe(200);

    const excess = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente 2",
      "41.00",
    );
    expect(excess.statusCode, excess.body).toBe(422);
    expect(excess.json()).toEqual(
      expect.objectContaining({
        code: "WORK_FRONT_QUANTITY_EXCEEDS_BALANCE",
        details: expect.objectContaining({
          blockers: [
            expect.objectContaining({
              section: "fronts",
              message: expect.stringContaining("saldo disponível 40.000 M3"),
            }),
          ],
        }),
      }),
    );

    const exactBalance = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente 3",
      "40.00",
    );
    expect(exactBalance.statusCode, exactBalance.body).toBe(200);
  });

  it("paginates team candidates by role and saves only the selected shift", async () => {
    const scope = await setup();
    const secondEmployee = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization: scope.authorization },
      payload: {
        document: syntheticFuelSupplierCpfFixture,
        fullName: "Operador noturno",
        companyRegistrationNumber: "ENG-002",
        admissionDate: "2026-07-01",
        jobRoleId: scope.jobRoleId,
      },
    });
    expect(secondEmployee.statusCode, secondEmployee.body).toBe(201);
    const secondEmploymentId = secondEmployee.json().data.id as string;

    const candidates = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/team-candidates?shift=day&limit=15&search=engenheiro`,
      headers: { authorization: scope.authorization },
    });
    expect(candidates.statusCode, candidates.body).toBe(200);
    expect(candidates.json().data.data).toHaveLength(2);

    const foreignCursor = encodeCursor({
      v: 1,
      resource: "another-resource",
      scopeHash: "0".repeat(64),
      queryHash: "0".repeat(64),
      sortBy: "name",
      sortDirection: "asc",
      last: { value: "A", id: scope.employmentId },
    });
    const invalidCursor = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/team-candidates?shift=day&cursor=${foreignCursor}`,
      headers: { authorization: scope.authorization },
    });
    expect(invalidCursor.statusCode, invalidCursor.body).toBe(400);

    const dayMobilization = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/mobilization/employees`,
      headers: { authorization: scope.authorization },
      payload: {
        allocations: [scope.employmentId, secondEmploymentId].map(
          (employmentId) => ({
            employmentId,
            shift: "day",
            confirmedJobRoleId: scope.jobRoleId,
            monthlyWorkloadHours: 220,
            compensationMode: "monthly",
            compensationValue: "5000.00",
            overtimeRate: "22.73",
          }),
        ),
      },
    });
    expect(dayMobilization.statusCode, dayMobilization.body).toBe(200);

    const nightMobilization = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/mobilization/employees/night`,
      headers: { authorization: scope.authorization },
      payload: {
        allocations: [
          {
            employmentId: secondEmploymentId,
            shift: "night",
            confirmedJobRoleId: scope.jobRoleId,
            monthlyWorkloadHours: 180,
            compensationMode: "monthly",
            compensationValue: "4500.00",
            overtimeRate: "25.00",
          },
        ],
        weeklySchedule: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
          shift: "night",
          dayOfWeek,
          isWorking: dayOfWeek < 6,
          startTime: dayOfWeek < 6 ? "18:00" : null,
          endTime: dayOfWeek < 6 ? "06:00" : null,
          endDayOffset: dayOfWeek < 6 ? 1 : 0,
        })),
        breakTemplates: [],
      },
    });
    expect(nightMobilization.statusCode, nightMobilization.body).toBe(200);
    expect(nightMobilization.json().data.employeeAllocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employment: expect.objectContaining({ id: scope.employmentId }),
          shift: "day",
        }),
        expect.objectContaining({
          employment: expect.objectContaining({ id: secondEmploymentId }),
          shift: "night",
          monthlyWorkloadHours: 180,
        }),
      ]),
    );
  });

  it("excludes the edited front from its own allocated balance", async () => {
    const scope = await setup();
    const created = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente editável",
      "60.00",
    );
    expect(created.statusCode, created.body).toBe(200);
    const frontId = created.json().data.workFronts[0].id as string;

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${scope.projectId}/fronts/${frontId}`,
      headers: { authorization: scope.authorization },
      payload: {
        name: "Frente editável",
        requiresEmployees: true,
        requiresMachines: true,
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "100.00" }],
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
  });

  it("edits only active-front services between produced and globally available quantities", async () => {
    const scope = await setup();
    const created = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente com produção",
      "12.000",
    );
    expect(created.statusCode, created.body).toBe(200);
    const front = created
      .json()
      .data.workFronts.find(
        (item: { name: string }) => item.name === "Frente com produção",
      ) as {
      id: string;
      name: string;
      location: string | null;
      requiresEmployees: boolean;
      requiresMachines: boolean;
      services: Array<{ serviceCode: string }>;
    };
    const service = await app.prisma.projectWorkFrontService.findFirstOrThrow({
      where: { workFrontId: front.id, serviceCode: "cut" },
      select: { id: true },
    });
    await app.prisma.project.update({
      where: { id: scope.projectId },
      data: { status: "ACTIVE", actualStartedAt: new Date() },
    });
    await app.prisma.projectWorkFront.update({
      where: { id: front.id },
      data: { status: "ACTIVE", actualStartedAt: new Date() },
    });
    await app.prisma.projectProduction.createMany({
      data: [
        {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          projectId: scope.projectId,
          workFrontId: front.id,
          workFrontServiceId: service.id,
          serviceCodeSnapshot: "cut",
          unitCodeSnapshot: "M3",
          productionProfileSnapshot: "EXCAVATION",
          dmtPolicySnapshot: "OPTIONAL",
          productionDate: new Date("2026-08-03T00:00:00.000Z"),
          shift: "DAY",
          shiftOrder: 0,
          status: "DRAFT",
          entryMode: "DIRECT_TOTAL",
          directQuantity: "2.000",
          officialQuantity: "2.000",
          createdByUserId: scope.userId,
        },
        {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          projectId: scope.projectId,
          workFrontId: front.id,
          workFrontServiceId: service.id,
          serviceCodeSnapshot: "cut",
          unitCodeSnapshot: "M3",
          productionProfileSnapshot: "EXCAVATION",
          dmtPolicySnapshot: "OPTIONAL",
          productionDate: new Date("2026-08-03T00:00:00.000Z"),
          shift: "DAY",
          shiftOrder: 0,
          status: "APPROVED",
          entryMode: "DIRECT_TOTAL",
          directQuantity: "4.000",
          officialQuantity: "4.000",
          createdByUserId: scope.userId,
          approvedByUserId: scope.userId,
          approvedAt: new Date("2026-08-03T12:00:00.000Z"),
        },
      ],
    });

    const belowProduced = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${front.id}/services`,
      headers: { authorization: scope.authorization },
      payload: {
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "5.999" }],
      },
    });
    expect(belowProduced.statusCode, belowProduced.body).toBe(422);
    expect(belowProduced.json().code).toBe(
      "WORK_FRONT_QUANTITY_BELOW_PRODUCED",
    );

    const exactMinimum = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${front.id}/services`,
      headers: { authorization: scope.authorization },
      payload: {
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "6.000" }],
      },
    });
    expect(exactMinimum.statusCode, exactMinimum.body).toBe(200);
    const minimumFront = exactMinimum
      .json()
      .data.workFronts.find((item: { id: string }) => item.id === front.id);
    expect(minimumFront).toMatchObject({
      id: front.id,
      name: front.name,
      location: front.location,
      requiresEmployees: front.requiresEmployees,
      requiresMachines: front.requiresMachines,
      services: [
        expect.objectContaining({
          quantity: "6.000",
          produced: "6.000",
          minimumQuantity: "6.000",
          maximumQuantity: "100.000",
          hasProductions: true,
        }),
      ],
    });
    expect(
      await app.prisma.projectWorkFrontService.findFirstOrThrow({
        where: { workFrontId: front.id, serviceCode: "cut" },
        select: { id: true },
      }),
    ).toEqual({ id: service.id });

    const exactMaximum = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${front.id}/services`,
      headers: { authorization: scope.authorization },
      payload: {
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "100.000" }],
      },
    });
    expect(exactMaximum.statusCode, exactMaximum.body).toBe(200);

    const aboveMaximum = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${front.id}/services`,
      headers: { authorization: scope.authorization },
      payload: {
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "100.001" }],
      },
    });
    expect(aboveMaximum.statusCode).toBe(422);
    expect(aboveMaximum.json().code).toBe(
      "WORK_FRONT_QUANTITY_EXCEEDS_BALANCE",
    );
  });

  it("blocks removing a front service linked to a zero-quantity draft", async () => {
    const scope = await setup();
    const created = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente com rascunho zerado",
      "12.000",
    );
    expect(created.statusCode, created.body).toBe(200);
    const front = created
      .json()
      .data.workFronts.find(
        (item: { name: string }) => item.name === "Frente com rascunho zerado",
      ) as { id: string };
    const service = await app.prisma.projectWorkFrontService.findFirstOrThrow({
      where: { workFrontId: front.id, serviceCode: "cut" },
      select: { id: true },
    });
    await app.prisma.projectProduction.create({
      data: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        projectId: scope.projectId,
        workFrontId: front.id,
        workFrontServiceId: service.id,
        serviceCodeSnapshot: "cut",
        unitCodeSnapshot: "M3",
        productionProfileSnapshot: "EXCAVATION",
        dmtPolicySnapshot: "OPTIONAL",
        productionDate: new Date("2026-08-03T00:00:00.000Z"),
        shift: "DAY",
        shiftOrder: 0,
        status: "DRAFT",
        entryMode: "DIRECT_TOTAL",
        officialQuantity: "0.000",
        createdByUserId: scope.userId,
      },
    });

    const removed = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${front.id}/services`,
      headers: { authorization: scope.authorization },
      payload: { services: [] },
    });
    expect(removed.statusCode, removed.body).toBe(422);
    expect(removed.json().code).toBe("WORK_FRONT_SERVICE_HAS_PRODUCTION");
  });

  it("updates both planned dates through readiness", async () => {
    const scope = await setup();
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/readiness`,
      headers: { authorization: scope.authorization },
      payload: {
        plannedStartDate: "2026-07-02",
        plannedEndDate: "2026-12-30",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.baseline).toEqual(
      expect.objectContaining({
        plannedStartDate: "2026-07-02",
        plannedEndDate: "2026-12-30",
      }),
    );
  });

  it("blocks a baseline revision below the allocated quantity", async () => {
    const scope = await setup();
    const created = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente alocada",
      "60.00",
    );
    expect(created.statusCode, created.body).toBe(200);

    const belowAllocated = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/quantity-baseline-revisions`,
      headers: { authorization: scope.authorization },
      payload: {
        items: [{ serviceCode: "cut", unitCode: "M3", total: "59.00" }],
      },
    });
    expect(belowAllocated.statusCode, belowAllocated.body).toBe(422);
    expect(belowAllocated.json()).toEqual(
      expect.objectContaining({
        code: "PROJECT_QUANTITY_BASELINE_BELOW_ALLOCATED",
        details: expect.objectContaining({
          blockers: [expect.objectContaining({ section: "metrics" })],
        }),
      }),
    );

    const exactAllocated = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/quantity-baseline-revisions`,
      headers: { authorization: scope.authorization },
      payload: {
        items: [{ serviceCode: "cut", unitCode: "M3", total: "60.00" }],
      },
    });
    expect(exactAllocated.statusCode, exactAllocated.body).toBe(200);
  });

  it("serializes concurrent allocations so only one can consume the balance", async () => {
    const scope = await setup();
    const responses = await Promise.all([
      createFront(scope.authorization, scope.projectId, "Frente A", "60.00"),
      createFront(scope.authorization, scope.projectId, "Frente B", "60.00"),
    ]);

    expect(
      responses.map((response) => response.statusCode).sort(),
      JSON.stringify(responses.map((response) => response.json())),
    ).toEqual([200, 422]);
  });

  it("serializes a baseline reduction against a concurrent allocation", async () => {
    const scope = await setup();
    const responses = await Promise.all([
      createFront(scope.authorization, scope.projectId, "Frente A", "60.00"),
      app.inject({
        method: "POST",
        url: `/api/v1/projects/${scope.projectId}/quantity-baseline-revisions`,
        headers: { authorization: scope.authorization },
        payload: {
          items: [{ serviceCode: "cut", unitCode: "M3", total: "50.00" }],
        },
      }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 422,
    ]);
  });

  it("activates the project without starting or mobilizing its valid front", async () => {
    const scope = await setup();
    const created = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente posterior à mobilização",
      "40.00",
    );
    expect(created.statusCode, created.body).toBe(200);
    const frontId = created.json().data.workFronts[0].id as string;
    await prepareProjectResources(scope, false);

    const supplier = await app.inject({
      method: "POST",
      url: "/api/v1/suppliers",
      headers: { authorization: scope.authorization },
      payload: {
        entityType: "individual",
        document: syntheticFuelSupplierCpfFixture,
        fullName: "Posto da obra",
      },
    });
    expect(supplier.statusCode, supplier.body).toBe(201);
    const fuelCategory = await app.prisma.suppliedItemCategory.findFirstOrThrow(
      {
        where: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          systemKey: "fuel",
        },
      },
    );
    const item = await app.inject({
      method: "POST",
      url: "/api/v1/supplied-items",
      headers: { authorization: scope.authorization },
      payload: {
        name: "Diesel de ativação",
        baseUnitId: "00000000-0000-4000-8000-00000000a003",
        categoryId: fuelCategory.id,
      },
    });
    expect(item.statusCode, item.body).toBe(201);
    const offer = await app.inject({
      method: "POST",
      url: `/api/v1/suppliers/${supplier.json().data.id}/offers`,
      headers: { authorization: scope.authorization },
      payload: {
        itemId: item.json().data.id,
        baseUnitId: "00000000-0000-4000-8000-00000000a003",
        purchaseUnitId: "00000000-0000-4000-8000-00000000a003",
        conversionToBase: "1.000000",
        price: "6.5000",
      },
    });
    expect(offer.statusCode, offer.body).toBe(201);
    const readiness = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/readiness`,
      headers: { authorization: scope.authorization },
      payload: {
        fuelOffers: [
          {
            mode: "existing",
            sourceOfferId: offer.json().data.id,
            price: "6.5000",
          },
        ],
        compensationPaymentTerms: [
          { compensationMode: "monthly", daysAfterPeriodEnd: 5 },
        ],
      },
    });
    expect(readiness.statusCode, readiness.body).toBe(200);
    expect(readiness.json().data.readiness.canActivate).toBe(true);

    const activated = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/activate`,
      headers: { authorization: scope.authorization },
    });
    expect(activated.statusCode, activated.body).toBe(200);
    expect(activated.json().data.status).toBe("active");
    expect(activated.json().data.actualStartedAt).toEqual(expect.any(String));
    expect(
      activated
        .json()
        .data.workFronts.find((front: { id: string }) => front.id === frontId),
    ).toEqual(
      expect.objectContaining({
        status: "planned",
        actualStartedAt: null,
        employeeAssignments: [],
        machineAssignments: [],
      }),
    );
    const activationEvent = await app.prisma.projectLifecycleEvent.findFirst({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        projectId: scope.projectId,
        fromStatus: "PLANNED",
        toStatus: "ACTIVE",
      },
    });
    expect(activationEvent).not.toBeNull();
  });

  it("prepares, starts and demobilizes a front without changing its active status", async () => {
    const scope = await setup();
    const created = await createFront(
      scope.authorization,
      scope.projectId,
      "Frente operacional",
      "40.00",
    );
    expect(created.statusCode, created.body).toBe(200);
    const frontId = created.json().data.workFronts[0].id as string;
    const resources = await prepareProjectResources(scope);

    const mobilized = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${frontId}/mobilization`,
      headers: { authorization: scope.authorization },
      payload: { employmentIds: [], machineIds: [resources.machineId] },
    });
    expect(mobilized.statusCode, mobilized.body).toBe(200);
    const preparedFront = mobilized
      .json()
      .data.workFronts.find((front: { id: string }) => front.id === frontId);
    expect(preparedFront).toEqual(
      expect.objectContaining({
        requiresEmployees: true,
        requiresMachines: true,
        eligibility: { canStart: true, blockers: [] },
        employeeAssignments: [
          expect.objectContaining({ source: "machine_operator" }),
        ],
        machineAssignments: [expect.any(Object)],
      }),
    );

    const started = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${scope.projectId}/fronts/${frontId}/start`,
      headers: { authorization: scope.authorization },
    });
    expect(started.statusCode, started.body).toBe(200);
    expect(
      started
        .json()
        .data.workFronts.find((front: { id: string }) => front.id === frontId)
        .status,
    ).toBe("active");

    const demobilized = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${frontId}/mobilization`,
      headers: { authorization: scope.authorization },
      payload: { employmentIds: [], machineIds: [] },
    });
    expect(demobilized.statusCode, demobilized.body).toBe(200);
    const activeFront = demobilized
      .json()
      .data.workFronts.find((front: { id: string }) => front.id === frontId);
    expect(activeFront.status).toBe("active");
    expect(activeFront.employeeAssignments).toEqual([]);
    expect(activeFront.machineAssignments).toEqual([]);

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${scope.projectId}/mobilization-history?resourceType=employee&frontId=${frontId}`,
      headers: { authorization: scope.authorization },
    });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json().data.data).toEqual([
      expect.objectContaining({
        resourceType: "employee",
        source: "machine_operator",
        effectiveTo: expect.any(String),
      }),
    ]);
  });

  it("blocks an occupied resource from being assigned to another front", async () => {
    const scope = await setup();
    const [firstResponse, secondResponse] = await Promise.all([
      createFront(scope.authorization, scope.projectId, "Frente A", "40.00"),
      createFront(scope.authorization, scope.projectId, "Frente B", "40.00"),
    ]);
    expect(firstResponse.statusCode, firstResponse.body).toBe(200);
    expect(secondResponse.statusCode, secondResponse.body).toBe(200);
    const frontIds = [
      ...(firstResponse.json().data.workFronts as { id: string }[]),
      ...(secondResponse.json().data.workFronts as { id: string }[]),
    ]
      .map((front) => front.id)
      .filter((id, index, ids) => ids.indexOf(id) === index);
    const resources = await prepareProjectResources(scope);

    const first = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${frontIds[0]}/mobilization`,
      headers: { authorization: scope.authorization },
      payload: { employmentIds: [], machineIds: [resources.machineId] },
    });
    expect(first.statusCode, first.body).toBe(200);
    const occupied = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${scope.projectId}/fronts/${frontIds[1]}/mobilization`,
      headers: { authorization: scope.authorization },
      payload: { employmentIds: [], machineIds: [resources.machineId] },
    });
    expect(occupied.statusCode, occupied.body).toBe(409);
    expect(occupied.json()).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          resources: [
            expect.objectContaining({
              section: "fronts",
              reason: "assigned-to-front",
            }),
          ],
        }),
      }),
    );
  });
});

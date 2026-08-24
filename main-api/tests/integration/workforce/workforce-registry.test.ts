import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../../src/app";
import { OrganizationService } from "../../../src/modules/organization/organization.service";
import { resetIntegrationData } from "../reset-integration-data";

import type { FastifyInstance } from "fastify";

describe("workforce Person and Employment registry", () => {
  const syntheticCpfFixture = "529.982.247-25";
  const secondarySyntheticCpfFixture = "111.444.777-35";
  const syntheticCpfNormalizedFixture = "52998224725";

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

  async function provision(suffix: string) {
    const provisioned = await organization.provision({
      corporationName: `Workforce ${suffix}`,
      domainHost: `workforce-${suffix}.localhost`,
      adminEmail: "master@example.com",
      adminPassword: "correct integration password",
      companyNames: ["One", "Two"],
    });
    const jobRoleIds = await Promise.all(
      provisioned.companies.map(async (company) => {
        const jobRole = await app.prisma.jobRole.create({
          data: {
            corporationId: provisioned.corporation.id,
            companyId: company.id,
            name: "Operador",
            normalizedName: "operador",
          },
          select: { id: true },
        });
        return jobRole.id;
      }),
    );
    return { ...provisioned, jobRoleIds };
  }

  async function authFor(input: {
    corporationId: string;
    userId: string;
    companyId: string;
  }) {
    const now = new Date();
    const session = await app.prisma.session.create({
      data: {
        corporationId: input.corporationId,
        userId: input.userId,
        companyId: input.companyId,
        refreshTokenHash: "integration-refresh-token-hash",
        idleExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        absoluteExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    return `Bearer ${app.jwt.sign({
      userId: input.userId,
      corporationId: input.corporationId,
      sessionId: session.id,
      role: "MASTER_ADMIN",
      companyId: input.companyId,
    })}`;
  }

  function payload(
    registration = "EMP-001",
    document = syntheticCpfFixture,
    fullName = "Synthetic Worker",
    jobRoleId = "",
  ) {
    return {
      document,
      fullName,
      companyRegistrationNumber: registration,
      admissionDate: "2026-07-01",
      jobRoleId,
    };
  }

  async function createEmployee(
    authorization: string,
    registration = "EMP-001",
    document = syntheticCpfFixture,
    jobRoleId = "",
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: payload(
        registration,
        document,
        `Synthetic Worker ${registration}`,
        jobRoleId,
      ),
    });
    expect(response.statusCode).toBe(201);
    return response.json().data as {
      id: string;
      person: { id: string };
      periods: { id: string }[];
    };
  }

  async function terminateEmploymentDirectly(input: {
    corporationId: string;
    companyId: string;
    employmentId: string;
    effectiveTo?: Date;
  }) {
    const effectiveTo = input.effectiveTo ?? new Date("2026-07-15T00:00:00Z");
    await app.prisma.employmentPeriod.updateMany({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: input.employmentId,
        effectiveTo: null,
      },
      data: {
        effectiveTo,
        terminationReason: "Synthetic termination fixture",
      },
    });
    await app.prisma.employment.update({
      where: {
        corporationId_companyId_id: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          id: input.employmentId,
        },
      },
      data: {
        isActive: false,
        state: "TERMINATED",
        terminatedAt: effectiveTo,
      },
      select: { id: true },
    });
  }

  it("lists only the authenticated Company's job roles", async () => {
    const pilot = await provision("job-roles");
    const authorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/job-roles",
      headers: { authorization },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({
        id: pilot.jobRoleIds[0],
        name: "Operador",
        isActive: true,
      }),
    ]);
  });

  it("creates job roles per Company and maps normalized duplicates to a conflict", async () => {
    const pilot = await provision("create-job-role");
    const firstCompanyAuthorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });
    const secondCompanyAuthorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[1].id,
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/job-roles",
      headers: { authorization: firstCompanyAuthorization },
      payload: { name: "Topógrafo" },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      name: "Topógrafo",
      isActive: true,
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/job-roles",
      headers: { authorization: firstCompanyAuthorization },
      payload: { name: "  topógrafo  " },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      code: "JOB_ROLE_ALREADY_EXISTS",
    });

    const secondCompanyList = await app.inject({
      method: "GET",
      url: "/api/v1/job-roles",
      headers: { authorization: secondCompanyAuthorization },
    });
    expect(secondCompanyList.statusCode).toBe(200);
    expect(secondCompanyList.json().data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Topógrafo" })]),
    );

    const isolated = await app.inject({
      method: "POST",
      url: "/api/v1/job-roles",
      headers: { authorization: secondCompanyAuthorization },
      payload: { name: "TOPÓGRAFO" },
    });
    expect(isolated.statusCode).toBe(201);
    expect(isolated.json().data.id).not.toBe(created.json().data.id);
  });

  it("creates a Person, Employment, and first open Employment Period atomically", async () => {
    const pilot = await provision("create");
    const authorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: payload(undefined, undefined, undefined, pilot.jobRoleIds[0]),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.person.document.plaintextDocument).toBe(
      syntheticCpfNormalizedFixture,
    );
    expect(await app.prisma.person.count()).toBe(1);
    expect(await app.prisma.employment.count()).toBe(1);
    expect(await app.prisma.employmentPeriod.count()).toBe(1);

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/employees?limit=1&sortBy=name&sortDirection=asc",
      headers: { authorization },
    });
    expect(listed.statusCode).toBe(200);
    expect(JSON.stringify(listed.json())).not.toContain(
      syntheticCpfNormalizedFixture,
    );
    expect(listed.json().data.data[0]).toMatchObject({
      availability: { state: "available", hasOpenAllocation: false },
      employment: { state: "active", admissionDate: "2026-07-01" },
    });
  });

  it("reuses a Person across Companies in the same Corporation and isolates Corporations", async () => {
    const first = await provision("first");
    const second = await provision("second");
    const firstCompanyOne = await authFor({
      corporationId: first.corporation.id,
      userId: first.administrator.id,
      companyId: first.companies[0].id,
    });
    const firstCompanyTwo = await authFor({
      corporationId: first.corporation.id,
      userId: first.administrator.id,
      companyId: first.companies[1].id,
    });
    const secondCompany = await authFor({
      corporationId: second.corporation.id,
      userId: second.administrator.id,
      companyId: second.companies[0].id,
    });

    for (const [authorization, registration, jobRoleId] of [
      [firstCompanyOne, "EMP-001", first.jobRoleIds[0]],
      [firstCompanyTwo, "EMP-002", first.jobRoleIds[1]],
      [secondCompany, "EMP-001", second.jobRoleIds[0]],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/employees",
        headers: { authorization },
        payload: payload(registration, undefined, undefined, jobRoleId),
      });
      expect(response.statusCode).toBe(201);
    }

    expect(await app.prisma.person.count()).toBe(2);
    expect(await app.prisma.employment.count()).toBe(3);
  });

  it("rejects duplicate active Employment and duplicate active registration numbers", async () => {
    const pilot = await provision("duplicates");
    const authorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });

    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/employees",
          headers: { authorization },
          payload: payload(
            "EMP-001",
            undefined,
            undefined,
            pilot.jobRoleIds[0],
          ),
        })
      ).statusCode,
    ).toBe(201);

    const duplicateEmployment = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: payload("EMP-002", undefined, undefined, pilot.jobRoleIds[0]),
    });
    expect(duplicateEmployment.statusCode).toBe(409);
    expect(duplicateEmployment.json()).toMatchObject({
      code: "EMPLOYMENT_ALREADY_EXISTS",
    });

    const duplicateRegistration = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: {
        document: "111.444.777-35",
        fullName: "Synthetic Second Worker",
        companyRegistrationNumber: "EMP-001",
        admissionDate: "2026-07-02",
        jobRoleId: pilot.jobRoleIds[0],
      },
    });
    expect(duplicateRegistration.statusCode).toBe(409);
    expect(duplicateRegistration.json()).toMatchObject({
      code: "REGISTRATION_NUMBER_ALREADY_EXISTS",
    });
    expect(await app.prisma.employmentPeriod.count()).toBe(1);
  });

  it("rehires a terminated Employment without rewriting closed period history", async () => {
    const pilot = await provision("rehire");
    const authorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });
    const created = await createEmployee(
      authorization,
      undefined,
      undefined,
      pilot.jobRoleIds[0],
    );
    const closedPeriodId = created.periods[0].id;
    await terminateEmploymentDirectly({
      corporationId: pilot.corporation.id,
      companyId: pilot.companies[0].id,
      employmentId: created.id,
    });
    const beforeClosed = await app.prisma.employmentPeriod.findUniqueOrThrow({
      where: { id: closedPeriodId },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/employees/${created.id}/rehire`,
      headers: { authorization },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: created.id,
      person: { id: created.person.id },
      employment: { state: "active", isActive: true },
      availability: { state: "available", hasOpenAllocation: false },
    });
    expect(response.json().data.periods).toHaveLength(2);
    expect(
      response
        .json()
        .data.periods.map((period: { state: string }) => period.state),
    ).toEqual(["current", "closed"]);

    const afterClosed = await app.prisma.employmentPeriod.findUniqueOrThrow({
      where: { id: closedPeriodId },
    });
    expect(afterClosed).toMatchObject({
      admissionDate: beforeClosed.admissionDate,
      effectiveFrom: beforeClosed.effectiveFrom,
      effectiveTo: beforeClosed.effectiveTo,
      terminationReason: beforeClosed.terminationReason,
    });
    expect(await app.prisma.employmentPeriod.count()).toBe(2);
    expect(
      await app.prisma.employmentPeriod.count({
        where: { employmentId: created.id, effectiveTo: null },
      }),
    ).toBe(1);
  });

  it("rejects active, duplicate, and concurrent rehire attempts safely", async () => {
    const pilot = await provision("rehire-conflict");
    const authorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });
    const active = await createEmployee(
      authorization,
      "EMP-ACTIVE",
      undefined,
      pilot.jobRoleIds[0],
    );

    const activeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/employees/${active.id}/rehire`,
      headers: { authorization },
      payload: {},
    });
    expect(activeResponse.statusCode).toBe(409);
    expect(activeResponse.json()).toMatchObject({
      code: "EMPLOYMENT_CURRENT_STATE_CONFLICT",
    });
    expect(await app.prisma.employmentPeriod.count()).toBe(1);

    const terminated = await createEmployee(
      authorization,
      "EMP-RACE",
      secondarySyntheticCpfFixture,
      pilot.jobRoleIds[0],
    );
    await terminateEmploymentDirectly({
      corporationId: pilot.corporation.id,
      companyId: pilot.companies[0].id,
      employmentId: terminated.id,
    });

    const attempts = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/employees/${terminated.id}/rehire`,
        headers: { authorization },
        payload: {},
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/employees/${terminated.id}/rehire`,
        headers: { authorization },
        payload: {},
      }),
    ]);

    expect(attempts.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    const conflict = attempts.find((response) => response.statusCode === 409);
    expect(conflict?.json()).toMatchObject({
      code: "EMPLOYMENT_CURRENT_STATE_CONFLICT",
    });
    expect(
      await app.prisma.employmentPeriod.count({
        where: { employmentId: terminated.id, effectiveTo: null },
      }),
    ).toBe(1);

    const duplicateAfterSuccess = await app.inject({
      method: "POST",
      url: `/api/v1/employees/${terminated.id}/rehire`,
      headers: { authorization },
      payload: {},
    });
    expect(duplicateAfterSuccess.statusCode).toBe(409);
    expect(duplicateAfterSuccess.json()).toMatchObject({
      code: "EMPLOYMENT_CURRENT_STATE_CONFLICT",
    });
  });

  it("keeps terminated history explicit and hides foreign rehire targets", async () => {
    const pilot = await provision("rehire-scope");
    const firstCompany = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });
    const secondCompany = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[1].id,
    });
    const created = await createEmployee(
      firstCompany,
      undefined,
      undefined,
      pilot.jobRoleIds[0],
    );
    await terminateEmploymentDirectly({
      corporationId: pilot.corporation.id,
      companyId: pilot.companies[0].id,
      employmentId: created.id,
    });

    const activeList = await app.inject({
      method: "GET",
      url: "/api/v1/employees?state=active",
      headers: { authorization: firstCompany },
    });
    expect(activeList.statusCode).toBe(200);
    expect(activeList.json().data.data).toHaveLength(0);

    const terminatedList = await app.inject({
      method: "GET",
      url: "/api/v1/employees?state=terminated",
      headers: { authorization: firstCompany },
    });
    expect(terminatedList.statusCode).toBe(200);
    expect(terminatedList.json().data.data[0]).toMatchObject({
      id: created.id,
      employment: { state: "terminated", isActive: false },
      availability: { state: "unavailable" },
    });

    const foreign = await app.inject({
      method: "POST",
      url: `/api/v1/employees/${created.id}/rehire`,
      headers: { authorization: secondCompany },
      payload: {},
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ code: "NOT_FOUND" });

    const absent = await app.inject({
      method: "POST",
      url: "/api/v1/employees/00000000-0000-4000-8000-000000000999/rehire",
      headers: { authorization: firstCompany },
      payload: {},
    });
    expect(absent.statusCode).toBe(404);
    expect(absent.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(await app.prisma.employmentPeriod.count()).toBe(1);
  });

  it("blocks mutation and deletion of closed Employment Periods", async () => {
    const pilot = await provision("period-immutability");
    const authorization = await authFor({
      corporationId: pilot.corporation.id,
      userId: pilot.administrator.id,
      companyId: pilot.companies[0].id,
    });
    const created = await createEmployee(
      authorization,
      undefined,
      undefined,
      pilot.jobRoleIds[0],
    );
    await terminateEmploymentDirectly({
      corporationId: pilot.corporation.id,
      companyId: pilot.companies[0].id,
      employmentId: created.id,
    });
    const closedPeriod = await app.prisma.employmentPeriod.findFirstOrThrow({
      where: { employmentId: created.id },
      select: { id: true },
    });

    await expect(
      app.prisma.employmentPeriod.update({
        where: { id: closedPeriod.id },
        data: { terminationReason: "edited" },
      }),
    ).rejects.toBeTruthy();

    await expect(
      app.prisma.employmentPeriod.delete({ where: { id: closedPeriod.id } }),
    ).rejects.toBeTruthy();
  });
});

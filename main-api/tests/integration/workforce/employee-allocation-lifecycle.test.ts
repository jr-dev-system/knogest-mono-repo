import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../../src/app";
import { OrganizationService } from "../../../src/modules/organization/organization.service";
import type { ProjectCommand } from "../../../src/modules/projects/projects.dto";
import { ProjectsService } from "../../../src/modules/projects/projects.service";
import { resetIntegrationData } from "../reset-integration-data";

import type { FastifyInstance } from "fastify";

describe("Employee allocation lifecycle", () => {
  let app: FastifyInstance;
  let organization: OrganizationService;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    organization = new OrganizationService(app.handlerContext);
  });
  beforeEach(async () => resetIntegrationData(app.prisma));
  afterAll(() => app.close());

  async function fixture() {
    const pilot = await organization.provision({
      corporationName: "Allocation",
      domainHost: "allocation.localhost",
      adminEmail: "master@example.com",
      adminPassword: "correct integration password",
      companyNames: ["One", "Two"],
    });
    const company = pilot.companies[0];
    const now = new Date();
    const session = await app.prisma.session.create({
      data: {
        corporationId: pilot.corporation.id,
        userId: pilot.administrator.id,
        companyId: company.id,
        refreshTokenHash: "integration",
        idleExpiresAt: new Date(now.getTime() + 3600000),
        absoluteExpiresAt: new Date(now.getTime() + 7200000),
      },
    });
    const authorization = `Bearer ${app.jwt.sign({ userId: pilot.administrator.id, corporationId: pilot.corporation.id, sessionId: session.id, role: "MASTER_ADMIN", companyId: company.id })}`;
    const role = await app.prisma.jobRole.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId: company.id,
        name: "Operator",
        normalizedName: "operator",
      },
    });
    const syntheticCpf = "529.982.247-25";
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: { authorization },
      payload: {
        document: syntheticCpf,
        fullName: "Worker",
        companyRegistrationNumber: "EMP-01",
        admissionDate: "2026-07-01",
        jobRoleId: role.id,
      },
    }); // synthetic CPF fixture
    expect(created.statusCode).toBe(201);
    const employment = { id: created.json().data.id as string };
    const client = await app.prisma.client.create({
      data: {
        corporationId: pilot.corporation.id,
        companyId: company.id,
        entityType: "LEGAL_ENTITY",
        documentType: "CNPJ",
        ciphertext: "cipher",
        iv: "iv",
        authTag: "tag",
        encryptionKeyVersion: "v1",
        documentDigest: "client-digest",
        displayName: "Client",
        legalName: "Client Ltd",
      },
    });
    await app.prisma.fuelType.createMany({
      data: [
        { id: "diesel-s10", name: "Diesel S10" },
        { id: "diesel-s500", name: "Diesel S500" },
      ],
    });
    const projectService = new ProjectsService(app.handlerContext);
    const command = (
      name: string,
      supplierDocument: string,
    ): ProjectCommand => ({
      name,
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
      clientId: client.id,
      managerEmploymentId: employment.id,
      technicalResponsibilityEmploymentIds: [employment.id],
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
      projectSupplierOffers: [
        {
          supplier: {
            entityType: "legal_entity",
            document: supplierDocument,
            fullName: null,
            legalName: "Synthetic Supplier",
            tradeName: null,
            phone: null,
            email: null,
            addressLine: null,
            city: null,
            state: null,
            postalCode: null,
            saveGlobally: false,
          },
          item: {
            name: "Diesel S10",
            baseUnitId: "00000000-0000-4000-8000-00000000a001",
            saveGlobally: false,
          },
          sourceOfferId: null,
          purchaseUnitId: "00000000-0000-4000-8000-00000000a001",
          conversionToBase: "1.000000",
          price: "1.0000",
        },
      ],
    });
    const scope = {
      corporationId: pilot.corporation.id,
      companyId: company.id,
      sessionId: session.id,
      userId: pilot.administrator.id,
      role: "MASTER_ADMIN" as const,
    };
    const plannedSyntheticSupplierDocument = "11.222.333/0001-81";
    const activeSyntheticSupplierDocument = "12.345.678/0001-95";
    const plannedResult = await projectService.finalize(
      scope,
      company.id,
      "00000000-0000-4000-8000-000000000001",
      command("Planned", plannedSyntheticSupplierDocument),
    );
    const activeResult = await projectService.finalize(
      scope,
      company.id,
      "00000000-0000-4000-8000-000000000002",
      command("Active", activeSyntheticSupplierDocument),
    );
    const planned = await app.prisma.project.findUniqueOrThrow({
      where: { id: plannedResult.projectId },
    });
    const active = await app.prisma.project.update({
      where: { id: activeResult.projectId },
      data: { status: "ACTIVE" },
    });
    return { authorization, employment, planned, active };
  }

  const terms = {
    jobRole: "Operator",
    monthlyWorkloadHours: 220,
    compensationMode: "daily",
    compensationValue: "100.00",
    overtimeRate: "10.00",
  };

  it("closes, reallocates, and replaces terms without mutating history", async () => {
    const { authorization, employment, planned, active } = await fixture();
    const allocated = await app.inject({
      method: "POST",
      url: "/api/v1/employee-allocations",
      headers: { authorization },
      payload: { employmentId: employment.id, projectId: planned.id, ...terms },
    });
    expect(allocated.statusCode).toBe(201);
    const allocationId = allocated.json().data.id as string;

    const termsChanged = await app.inject({
      method: "POST",
      url: `/api/v1/employee-allocations/${allocationId}/terms`,
      headers: { authorization },
      payload: { ...terms, overtimeRate: "11.00", reason: "Adjustment" },
    });
    expect(termsChanged.statusCode).toBe(200);
    const currentId = termsChanged.json().data.current.id as string;
    expect(
      await app.prisma.projectEmployeeAllocation.count({
        where: { effectiveTo: null },
      }),
    ).toBe(1);

    const moved = await app.inject({
      method: "POST",
      url: `/api/v1/employee-allocations/${currentId}/reallocate`,
      headers: { authorization },
      payload: {
        ...terms,
        destinationCompanyId: (
          await app.prisma.project.findUniqueOrThrow({
            where: { id: active.id },
          })
        ).companyId,
        destinationProjectId: active.id,
        reason: "Move",
      },
    });
    expect(moved.statusCode).toBe(200);
    const destinationId = moved.json().data.destination.id as string;

    const released = await app.inject({
      method: "POST",
      url: `/api/v1/employee-allocations/${destinationId}/release`,
      headers: { authorization },
      payload: { reason: "Finished" },
    });
    expect(released.statusCode).toBe(200);
    const rows = await app.prisma.projectEmployeeAllocation.findMany({
      orderBy: { effectiveFrom: "asc" },
    });
    expect(rows).toHaveLength(3);
    expect(
      rows.every(
        (row) => row.effectiveTo && row.endedByUserId && row.endedReason,
      ),
    ).toBe(true);
    expect(rows[0].overtimeRate.toFixed(2)).toBe("10.00");
    expect(rows[1].overtimeRate.toFixed(2)).toBe("11.00");
    expect(
      await app.prisma.projectEmployeeAllocation.count({
        where: { effectiveTo: null },
      }),
    ).toBe(0);
  });

  it("allows only one concurrent open allocation for the same Person", async () => {
    const { authorization, employment, planned, active } = await fixture();
    const attempts = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/employee-allocations",
        headers: { authorization },
        payload: {
          employmentId: employment.id,
          projectId: planned.id,
          ...terms,
        },
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/employee-allocations",
        headers: { authorization },
        payload: {
          employmentId: employment.id,
          projectId: active.id,
          ...terms,
        },
      }),
    ]);
    expect(attempts.map((attempt) => attempt.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await app.prisma.projectEmployeeAllocation.count({
        where: { effectiveTo: null },
      }),
    ).toBe(1);
  });
});

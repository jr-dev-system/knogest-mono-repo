import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPrismaClient } from "../../../src/db/prisma.db";
import type { PrismaClient } from "../../../src/db/generated/prisma/client";
import { seedEpicOneDevelopmentData } from "../../../prisma/seeds/epic-one-development-data";
import { seedReferenceData } from "../../../prisma/seeds/reference-data";
import { resetIntegrationData } from "../reset-integration-data";

describe("development fixtures", () => {
  let prisma: PrismaClient;
  let closePool: () => Promise<void>;

  beforeAll(() => {
    const client = createPrismaClient();
    prisma = client.prisma;
    closePool = () => client.pool.end();
  });

  beforeEach(async () => {
    await resetIntegrationData(prisma);
    await seedReferenceData(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closePool();
  });

  it("creates two operational companies and one completely empty company", async () => {
    const seeded = await seedEpicOneDevelopmentData(prisma);

    expect(await prisma.corporation.count()).toBe(1);
    expect(await prisma.company.count()).toBe(3);
    expect(seeded.pilot.companies).toHaveLength(3);

    const emptyCompany = seeded.pilot.companies.find(
      (company) => company.name === "Empresa Vazia",
    );
    expect(emptyCompany).toBeDefined();

    const emptyCompanyId = emptyCompany!.id;
    const emptyCounts = await Promise.all([
      prisma.employment.count({ where: { companyId: emptyCompanyId } }),
      prisma.jobRole.count({ where: { companyId: emptyCompanyId } }),
      prisma.client.count({ where: { companyId: emptyCompanyId } }),
      prisma.fuelSupplier.count({ where: { companyId: emptyCompanyId } }),
      prisma.machineOwnershipPeriod.count({
        where: { companyId: emptyCompanyId },
      }),
      prisma.machineIdentifier.count({ where: { companyId: emptyCompanyId } }),
      prisma.machineMeterReading.count({
        where: { companyId: emptyCompanyId },
      }),
      prisma.project.count({ where: { companyId: emptyCompanyId } }),
      prisma.measurementUnit.count({ where: { companyId: emptyCompanyId } }),
      prisma.suppliedItemCategory.count({
        where: { companyId: emptyCompanyId },
      }),
      prisma.suppliedItem.count({ where: { companyId: emptyCompanyId } }),
      prisma.supplierOffer.count({ where: { companyId: emptyCompanyId } }),
      prisma.supplierOfferPrice.count({
        where: { companyId: emptyCompanyId },
      }),
      prisma.sensitiveDocumentProtectionHarness.count({
        where: { companyId: emptyCompanyId },
      }),
    ]);
    expect(emptyCounts).toEqual(Array(emptyCounts.length).fill(0));

    for (const company of seeded.pilot.companies.filter(
      (company) => company.id !== emptyCompanyId,
    )) {
      const projects = await prisma.project.findMany({
        where: { companyId: company.id },
        select: { id: true },
      });
      const projectIds = projects.map((project) => project.id);
      const [
        employmentCount,
        machineCount,
        clientCount,
        supplierCount,
        baselineCount,
        clientPeriodCount,
        managerCount,
        responsibilityCount,
        scheduleCount,
        scheduleDaysCount,
        breakCount,
        employeeAllocationCount,
        machineAllocationCount,
        fuelAgreementCount,
      ] = await Promise.all([
        prisma.employment.count({ where: { companyId: company.id } }),
        prisma.machineOwnershipPeriod.count({
          where: { companyId: company.id, effectiveTo: null },
        }),
        prisma.client.count({ where: { companyId: company.id } }),
        prisma.fuelSupplier.count({ where: { companyId: company.id } }),
        prisma.projectBaseline.count({
          where: { projectId: { in: projectIds } },
        }),
        prisma.projectClientPeriod.count({
          where: { projectId: { in: projectIds } },
        }),
        prisma.projectManagerTenure.count({
          where: { projectId: { in: projectIds } },
        }),
        prisma.projectTechnicalResponsibility.count({
          where: { projectId: { in: projectIds } },
        }),
        prisma.projectScheduleRevision.count({
          where: { projectId: { in: projectIds } },
        }),
        prisma.projectScheduleDay.count({
          where: { companyId: company.id },
        }),
        prisma.projectBreakTemplate.count({
          where: { companyId: company.id },
        }),
        prisma.projectEmployeeAllocation.count({
          where: { projectId: { in: projectIds } },
        }),
        prisma.projectMachineAllocation.count({
          where: { projectId: { in: projectIds } },
        }),
        prisma.projectFuelAgreement.count({
          where: { projectId: { in: projectIds } },
        }),
      ]);

      expect(projects).toHaveLength(2);
      expect(employmentCount).toBe(3);
      expect(machineCount).toBe(2);
      expect(clientCount).toBe(2);
      expect(supplierCount).toBe(2);
      expect(baselineCount).toBe(2);
      expect(clientPeriodCount).toBe(2);
      expect(managerCount).toBe(2);
      expect(responsibilityCount).toBe(2);
      expect(scheduleCount).toBe(2);
      expect(scheduleDaysCount).toBe(14);
      expect(breakCount).toBe(2);
      expect(employeeAllocationCount).toBe(0);
      expect(machineAllocationCount).toBe(0);
      expect(fuelAgreementCount).toBe(0);
    }
  });

  it("is idempotent for the deterministic development data", async () => {
    await seedEpicOneDevelopmentData(prisma);
    await seedEpicOneDevelopmentData(prisma);

    expect(await prisma.company.count()).toBe(3);
    expect(await prisma.employment.count()).toBe(6);
    expect(await prisma.machine.count()).toBe(4);
    expect(await prisma.client.count()).toBe(4);
    expect(await prisma.fuelSupplier.count()).toBe(4);
    expect(await prisma.project.count()).toBe(4);
  });

  it("reconciles reference units inserted by migrations with generated IDs", async () => {
    await prisma.measurementUnit.deleteMany();
    await prisma.measurementUnit.createMany({
      data: [
        {
          id: "00000000-0000-4000-8000-00000000b001",
          code: "M3_BANK",
          name: "Migration name",
        },
        {
          id: "00000000-0000-4000-8000-00000000b002",
          code: "M3_LOOSE",
          name: "Migration name",
        },
        {
          id: "00000000-0000-4000-8000-00000000b003",
          code: "M3_COMPACTED",
          name: "Migration name",
        },
        {
          id: "00000000-0000-4000-8000-00000000b004",
          code: "M3_PLACED",
          name: "Migration name",
        },
        {
          id: "00000000-0000-4000-8000-00000000b005",
          code: "M",
          name: "Migration name",
        },
        {
          id: "00000000-0000-4000-8000-00000000b006",
          code: "KM",
          name: "Migration name",
        },
        {
          id: "00000000-0000-4000-8000-00000000b007",
          code: "T_KM",
          name: "Migration name",
        },
      ],
    });

    await seedReferenceData(prisma);
    await seedReferenceData(prisma);

    expect(await prisma.measurementUnit.count()).toBe(15);
    await expect(
      prisma.measurementUnit.findUniqueOrThrow({
        where: { id: "00000000-0000-4000-8000-00000000b001" },
      }),
    ).resolves.toMatchObject({
      code: "M3_BANK",
      name: "Metro cúbico em corte",
    });
  });
});

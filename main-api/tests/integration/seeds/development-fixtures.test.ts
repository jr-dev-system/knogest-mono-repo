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

  it("creates operational companies and one completely empty company", async () => {
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

    const expectedByCompany = {
      "Terraplanagem Norte": {
        projects: 2,
        employees: 3,
        machines: 2,
        clients: 2,
        suppliers: 2,
        employeeAllocations: 0,
        machineAllocations: 0,
        fuelAgreements: 0,
      },
      "Mineração Serra Azul": {
        projects: 1,
        employees: 15,
        machines: 9,
        clients: 1,
        suppliers: 1,
        employeeAllocations: 15,
        machineAllocations: 9,
        fuelAgreements: 1,
      },
    } as const;

    for (const company of seeded.pilot.companies.filter(
      (company) => company.id !== emptyCompanyId,
    )) {
      const expected =
        expectedByCompany[company.name as keyof typeof expectedByCompany];
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
        prisma.machine.count({
          where: { machineModel: { companyId: company.id }, isActive: true },
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

      expect(projects).toHaveLength(expected.projects);
      expect(employmentCount).toBe(expected.employees);
      expect(machineCount).toBe(expected.machines);
      expect(clientCount).toBe(expected.clients);
      expect(supplierCount).toBe(expected.suppliers);
      expect(baselineCount).toBe(expected.projects);
      expect(clientPeriodCount).toBe(expected.projects);
      expect(managerCount).toBe(expected.projects);
      expect(responsibilityCount).toBe(expected.projects);
      expect(scheduleCount).toBe(expected.projects);
      expect(scheduleDaysCount).toBe(expected.projects * 7);
      expect(breakCount).toBe(expected.projects);
      expect(employeeAllocationCount).toBe(expected.employeeAllocations);
      expect(machineAllocationCount).toBe(expected.machineAllocations);
      expect(fuelAgreementCount).toBe(expected.fuelAgreements);
    }

    const serraAzul = seeded.pilot.companies.find(
      (company) => company.name === "Mineração Serra Azul",
    )!;
    const patio = await prisma.project.findFirstOrThrow({
      where: { companyId: serraAzul.id, name: "Pátio de Estocagem Serra" },
      select: { id: true, status: true },
    });
    expect(patio.status).toBe("ACTIVE");
    await expect(
      prisma.client.findFirstOrThrow({
        where: { companyId: serraAzul.id },
        select: { displayName: true, entityType: true },
      }),
    ).resolves.toEqual({
      displayName: "Construtora Quatro Rodas Ltda.",
      entityType: "LEGAL_ENTITY",
    });
    await expect(
      prisma.fuelSupplier.findFirstOrThrow({
        where: { companyId: serraAzul.id },
        select: { displayName: true, entityType: true },
      }),
    ).resolves.toEqual({
      displayName: "Posto 4 Rodas Ltda.",
      entityType: "LEGAL_ENTITY",
    });

    const machines = await prisma.machine.findMany({
      where: { machineModel: { companyId: serraAzul.id } },
      include: { identifiers: true, transportSpecification: true },
      orderBy: { name: "asc" },
    });
    expect(machines).toHaveLength(9);
    expect(
      new Set(
        machines.flatMap((machine) =>
          machine.identifiers.map((id) => id.value),
        ),
      ).size,
    ).toBe(9);
    expect(
      machines
        .filter((machine) => machine.name.startsWith("Caminhão Basculante"))
        .map((machine) => ({
          type: machine.type,
          capacity: machine.loadCapacity?.toFixed(3),
          unit: machine.loadCapacityUnitCode,
          volume: machine.loadVolumeM3?.toFixed(3),
        })),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        type: "WHITE_LINE",
        capacity: "16.000",
        unit: "M3_LOOSE",
        volume: "16.000",
      })),
    );
    expect(
      machines
        .filter((machine) => machine.name.startsWith("Caminhão-Pipa"))
        .map((machine) => ({
          type: machine.type,
          capacity: machine.loadCapacity?.toFixed(3),
          unit: machine.loadCapacityUnitCode,
        })),
    ).toEqual(
      Array.from({ length: 2 }, () => ({
        type: "WHITE_LINE",
        capacity: "8000.000",
        unit: "LITER",
      })),
    );
    const employeeTerms = await prisma.projectEmployeeAllocation.findMany({
      where: { projectId: patio.id },
      select: { compensationValue: true, overtimeRate: true },
      orderBy: { employmentId: "asc" },
    });
    expect(
      employeeTerms.map((terms) => ({
        compensationValue: terms.compensationValue.toFixed(2),
        overtimeRate: terms.overtimeRate.toFixed(2),
      })),
    ).toEqual([
      { compensationValue: "0.00", overtimeRate: "0.00" },
      { compensationValue: "7000.00", overtimeRate: "47.73" },
      { compensationValue: "3502.40", overtimeRate: "23.88" },
      { compensationValue: "2840.20", overtimeRate: "19.37" },
      { compensationValue: "2840.20", overtimeRate: "19.37" },
      { compensationValue: "2840.20", overtimeRate: "19.37" },
      { compensationValue: "3502.40", overtimeRate: "23.88" },
      { compensationValue: "2840.20", overtimeRate: "19.37" },
      { compensationValue: "1661.00", overtimeRate: "11.33" },
      { compensationValue: "3714.60", overtimeRate: "25.33" },
      { compensationValue: "2840.20", overtimeRate: "19.37" },
      { compensationValue: "2434.00", overtimeRate: "16.60" },
      { compensationValue: "1854.00", overtimeRate: "12.64" },
      { compensationValue: "1661.00", overtimeRate: "11.33" },
      { compensationValue: "2840.20", overtimeRate: "19.37" },
    ]);
    const fuelAgreement = await prisma.projectFuelAgreement.findFirstOrThrow({
      where: { projectId: patio.id },
      select: { id: true },
    });
    const fuelPrice = await prisma.projectFuelPrice.findFirstOrThrow({
      where: { agreementId: fuelAgreement.id },
      select: { fuelTypeId: true, pricePerLiter: true },
    });
    expect(fuelPrice.fuelTypeId).toBe("diesel-s10");
    expect(fuelPrice.pricePerLiter.toFixed(4)).toBe("6.8900");
  });

  it("is idempotent for the deterministic development data", async () => {
    await seedEpicOneDevelopmentData(prisma);
    await seedEpicOneDevelopmentData(prisma);

    expect(await prisma.company.count()).toBe(3);
    expect(await prisma.employment.count()).toBe(18);
    expect(await prisma.machine.count()).toBe(11);
    expect(await prisma.client.count()).toBe(3);
    expect(await prisma.fuelSupplier.count()).toBe(3);
    expect(await prisma.project.count()).toBe(3);
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

import { createPrismaClient } from "../src/db/prisma.db";
import type { Prisma } from "../src/db/generated/prisma/client";
import { protectSensitiveDocument } from "../src/lib/security/sensitive-document";

const terminatedEmployeeSyntheticCpfFixture = "111.444.777-35";
const productionEmployeeSyntheticCpfFixture = "123.456.789-09";
export const productionProjectFixtureId =
  "00000000-0000-4000-8000-000000003901";

async function main() {
  const { prisma, pool } = createPrismaClient();
  try {
    const corporation = await prisma.corporation.findFirstOrThrow({
      where: { domains: { some: { host: "piloto.localhost" } } },
      select: { id: true },
    });
    const company = await prisma.company.findFirstOrThrow({
      where: { corporationId: corporation.id, isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    await seedTerminatedEmployee(prisma, corporation.id, company.id);
    const protectedClientDocument = protectSensitiveDocument({
      document: "12.345.678/0001-95",
      registryType: "CLIENT",
    });
    const client = await prisma.client.create({
      data: {
        corporationId: corporation.id,
        companyId: company.id,
        entityType: "LEGAL_ENTITY",
        documentType: protectedClientDocument.documentType,
        ciphertext: protectedClientDocument.ciphertext,
        iv: protectedClientDocument.iv,
        authTag: protectedClientDocument.authTag,
        encryptionKeyVersion: protectedClientDocument.encryptionKeyVersion,
        documentDigest: protectedClientDocument.documentDigest,
        displayName: "Cliente Produção E2E",
        legalName: "Cliente Produção E2E Ltda.",
      },
    });
    await prisma.$transaction((transaction) =>
      seedProductionWizardFixture(
        transaction,
        corporation.id,
        company.id,
        client.id,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function seedTerminatedEmployee(
  prisma: ReturnType<typeof createPrismaClient>["prisma"],
  corporationId: string,
  companyId: string,
) {
  const protectedDocument = protectSensitiveDocument({
    document: terminatedEmployeeSyntheticCpfFixture,
    registryType: "PERSON",
  });
  const person = await prisma.person.create({
    data: {
      corporationId,
      documentType: "CPF",
      ciphertext: protectedDocument.ciphertext,
      iv: protectedDocument.iv,
      authTag: protectedDocument.authTag,
      encryptionKeyVersion: protectedDocument.encryptionKeyVersion,
      documentDigest: protectedDocument.documentDigest,
      displayName: "Synthetic Rehire Fixture",
      fullName: "Synthetic Rehire Fixture",
    },
  });
  const employment = await prisma.employment.create({
    data: {
      corporationId,
      companyId,
      personId: person.id,
      companyRegistrationNumber: "E2E-REHIRE",
      isActive: false,
      state: "TERMINATED",
      terminatedAt: new Date("2026-06-30T00:00:00.000Z"),
    },
  });
  await prisma.employmentPeriod.create({
    data: {
      corporationId,
      companyId,
      employmentId: employment.id,
      admissionDate: new Date("2026-06-01T00:00:00.000Z"),
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-06-30T00:00:00.000Z"),
      terminationReason: "Synthetic termination fixture",
    },
  });
}

async function seedProductionWizardFixture(
  prisma: Prisma.TransactionClient,
  corporationId: string,
  companyId: string,
  clientId: string,
) {
  const actor = await prisma.user.findFirstOrThrow({
    where: { corporationId, role: "MASTER_ADMIN", isActive: true },
    select: { id: true },
  });
  const effectiveFrom = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const protectedDocument = protectSensitiveDocument({
    document: productionEmployeeSyntheticCpfFixture,
    registryType: "PERSON",
  });
  const role = await prisma.jobRole.create({
    data: {
      corporationId,
      companyId,
      name: "Encarregado E2E",
      normalizedName: "encarregado e2e",
    },
  });
  const person = await prisma.person.create({
    data: {
      corporationId,
      documentType: "CPF",
      ciphertext: protectedDocument.ciphertext,
      iv: protectedDocument.iv,
      authTag: protectedDocument.authTag,
      encryptionKeyVersion: protectedDocument.encryptionKeyVersion,
      documentDigest: protectedDocument.documentDigest,
      displayName: "Encarregado Produção E2E",
      fullName: "Encarregado Produção E2E",
    },
  });
  const employment = await prisma.employment.create({
    data: {
      corporationId,
      companyId,
      personId: person.id,
      companyRegistrationNumber: "E2E-PRODUCTION",
    },
  });
  await prisma.employmentPeriod.create({
    data: {
      corporationId,
      companyId,
      employmentId: employment.id,
      admissionDate: effectiveFrom,
      effectiveFrom,
    },
  });
  const jobRolePeriod = await prisma.employmentJobRolePeriod.create({
    data: {
      corporationId,
      companyId,
      employmentId: employment.id,
      jobRoleId: role.id,
      effectiveFrom,
    },
  });
  const project = await prisma.project.create({
    data: {
      id: productionProjectFixtureId,
      corporationId,
      companyId,
      name: "Terraplanagem Wizard E2E",
      address: "Canteiro E2E, São Paulo - SP",
      addressCity: "São Paulo",
      addressState: "SP",
      status: "ACTIVE",
      actualStartedAt: effectiveFrom,
    },
  });
  await Promise.all([
    prisma.projectBaseline.create({
      data: {
        corporationId,
        companyId,
        projectId: project.id,
        approvedBudget: "100000.00",
        plannedStartDate: effectiveFrom,
        plannedEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        effectiveFrom,
      },
    }),
    prisma.projectClientPeriod.create({
      data: {
        corporationId,
        companyId,
        projectId: project.id,
        clientId,
        effectiveFrom,
      },
    }),
    prisma.projectManagerTenure.create({
      data: {
        corporationId,
        companyId,
        projectId: project.id,
        employmentId: employment.id,
        effectiveFrom,
      },
    }),
    prisma.projectTechnicalResponsibility.create({
      data: {
        corporationId,
        companyId,
        projectId: project.id,
        employmentId: employment.id,
        effectiveFrom,
      },
    }),
  ]);
  const schedule = await prisma.projectScheduleRevision.create({
    data: { corporationId, companyId, projectId: project.id, effectiveFrom },
  });
  await prisma.projectScheduleDay.createMany({
    data: Array.from({ length: 7 }, (_, index) => ({
      corporationId,
      companyId,
      scheduleRevisionId: schedule.id,
      shift: "DAY" as const,
      dayOfWeek: index + 1,
      isWorking: true,
      startTime: "07:00",
      endTime: "18:00",
      endDayOffset: 0,
    })),
  });
  await prisma.projectEmployeeAllocation.create({
    data: {
      corporationId,
      companyId,
      projectId: project.id,
      employmentId: employment.id,
      personId: person.id,
      shift: "DAY",
      jobRole: role.name,
      employmentJobRolePeriodId: jobRolePeriod.id,
      compensationMode: "monthly",
      compensationValue: "5000.00",
      overtimeRate: "30.00",
      effectiveFrom,
      createdByUserId: actor.id,
    },
  });
  const originFront = await prisma.projectWorkFront.create({
    data: {
      corporationId,
      companyId,
      projectId: project.id,
      name: "A - Corte E2E",
      location: "Estacas 10 a 20",
      status: "ACTIVE",
      actualStartedAt: effectiveFrom,
    },
  });
  const destinationFront = await prisma.projectWorkFront.create({
    data: {
      corporationId,
      companyId,
      projectId: project.id,
      name: "B - Aterro E2E",
      location: "Estacas 30 a 40",
      status: "ACTIVE",
      actualStartedAt: effectiveFrom,
    },
  });
  await prisma.projectWorkFrontService.createMany({
    data: [
      {
        corporationId,
        companyId,
        projectId: project.id,
        workFrontId: originFront.id,
        serviceCode: "cut",
        unitCode: "M3",
        quantity: "1000.000",
        productionProfile: "EXCAVATION",
        dmtPolicy: "OPTIONAL",
      },
      {
        corporationId,
        companyId,
        projectId: project.id,
        workFrontId: destinationFront.id,
        serviceCode: "fill",
        unitCode: "M3",
        quantity: "1000.000",
        productionProfile: "COMPACTION",
        dmtPolicy: "OPTIONAL",
      },
    ],
  });
  const excavator = await prisma.machine.create({
    data: {
      corporationId,
      name: "Escavadeira E2E",
      type: "YELLOW_LINE",
      manufacturer: "Synthetic",
      model: "EX-200",
      meterType: "HOUR_METER",
    },
  });
  const truck = await prisma.machine.create({
    data: {
      corporationId,
      name: "Caminhão E2E",
      type: "WHITE_LINE",
      manufacturer: "Synthetic",
      model: "TR-10",
      meterType: "ODOMETER",
      loadVolumeM3: "10.000",
      transportSpecification: {
        create: {
          nominalCapacity: "10.000",
          effectiveCapacity: "9.500",
          capacityUnitCode: "M3_LOOSE",
        },
      },
    },
  });
  await prisma.machineOwnershipPeriod.createMany({
    data: [excavator.id, truck.id].map((machineId) => ({
      corporationId,
      companyId,
      machineId,
      effectiveFrom,
    })),
  });
  await prisma.projectWorkFrontMachineAssignment.createMany({
    data: [excavator.id, truck.id].map((machineId) => ({
      corporationId,
      companyId,
      projectId: project.id,
      workFrontId: originFront.id,
      machineId,
      shift: "DAY" as const,
      operatorEmploymentId: employment.id,
      effectiveFrom,
      createdByUserId: actor.id,
    })),
  });
}

void main();

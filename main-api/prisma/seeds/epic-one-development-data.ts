import type { PrismaClient } from "../../src/db/generated/prisma/client";
import { ensureCompanyCatalogBootstrap } from "../../src/modules/commercial/catalog-bootstrap";
import { hashPassword } from "../../src/lib/security/password";
import { protectSensitiveDocument } from "../../src/lib/security/sensitive-document";

const PILOT_CORPORATION_ID = "00000000-0000-4000-8000-000000000001";
const PILOT_ADMIN_ID = "00000000-0000-4000-8000-000000000011";
const EMPTY_COMPANY = {
  id: "00000000-0000-4000-8000-000000000103",
  name: "Empresa Vazia",
} as const;

const fixtureId = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

type CompanyFixture = {
  id: string;
  name: string;
  prefix: string;
  employees: Array<{
    id: string;
    document: string;
    fullName: string;
    registrationNumber: string;
    role: string;
  }>;
  clients: Array<{
    id: string;
    document: string;
    legalName: string;
  }>;
  suppliers: Array<{
    id: string;
    document: string;
    legalName: string;
  }>;
  machines: Array<{
    id: string;
    name: string;
    manufacturer: string;
    model: string;
    companyTag: string;
    initialMeterReading: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    address: string;
    contractNumber: string;
    approvedBudget: string;
    plannedStartDate: string;
    plannedEndDate: string;
    clientIndex: number;
    managerIndex: number;
    technicalResponsibleIndex: number;
  }>;
};

// All documents below are synthetic development-only values with valid checksums.
const companies: CompanyFixture[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Terraplanagem Norte",
    prefix: "TN",
    employees: [
      {
        id: fixtureId(1101),
        document: "10100100180",
        fullName: "Marina Alves",
        registrationNumber: "TN-001",
        role: "Engenheira responsável",
      },
      {
        id: fixtureId(1102),
        document: "10100100260",
        fullName: "Carlos Mendes",
        registrationNumber: "TN-002",
        role: "Operador de máquinas",
      },
      {
        id: fixtureId(1103),
        document: "10100100341",
        fullName: "Juliana Rocha",
        registrationNumber: "TN-003",
        role: "Técnica de segurança",
      },
    ],
    clients: [
      {
        id: fixtureId(1201),
        document: "10100100000143",
        legalName: "Construtora Horizonte Norte Ltda.",
      },
      {
        id: fixtureId(1202),
        document: "10100100000224",
        legalName: "Empreendimentos Vale Verde Ltda.",
      },
    ],
    suppliers: [
      {
        id: fixtureId(1301),
        document: "10100100000305",
        legalName: "Combustíveis Estrada Norte Ltda.",
      },
      {
        id: fixtureId(1302),
        document: "10100100000496",
        legalName: "Posto Operacional Horizonte Ltda.",
      },
    ],
    machines: [
      {
        id: fixtureId(1401),
        name: "Escavadeira Norte 01",
        manufacturer: "Caterpillar",
        model: "320 GC",
        companyTag: "TN-ESC-01",
        initialMeterReading: "1250.00",
      },
      {
        id: fixtureId(1402),
        name: "Motoniveladora Norte 01",
        manufacturer: "John Deere",
        model: "670G",
        companyTag: "TN-MOT-01",
        initialMeterReading: "840.00",
      },
    ],
    projects: [
      {
        id: fixtureId(1501),
        name: "Acesso Rodoviário Norte",
        address: "Rodovia BR-101, km 24, Fortaleza - CE",
        contractNumber: "TN-2026-001",
        approvedBudget: "850000.00",
        plannedStartDate: "2026-07-01",
        plannedEndDate: "2026-11-30",
        clientIndex: 0,
        managerIndex: 0,
        technicalResponsibleIndex: 2,
      },
      {
        id: fixtureId(1502),
        name: "Drenagem Vale Verde",
        address: "Estrada da Serra, s/n, Caucaia - CE",
        contractNumber: "TN-2026-002",
        approvedBudget: "620000.00",
        plannedStartDate: "2026-08-01",
        plannedEndDate: "2026-12-20",
        clientIndex: 1,
        managerIndex: 0,
        technicalResponsibleIndex: 1,
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "Mineração Serra Azul",
    prefix: "MSA",
    employees: [
      {
        id: fixtureId(2101),
        document: "20200200178",
        fullName: "Rafael Lima",
        registrationNumber: "MSA-001",
        role: "Engenheiro de produção",
      },
      {
        id: fixtureId(2102),
        document: "20200200259",
        fullName: "Bianca Souza",
        registrationNumber: "MSA-002",
        role: "Operadora de máquinas",
      },
      {
        id: fixtureId(2103),
        document: "20200200330",
        fullName: "Diego Martins",
        registrationNumber: "MSA-003",
        role: "Técnico de segurança",
      },
    ],
    clients: [
      {
        id: fixtureId(2201),
        document: "20200200000103",
        legalName: "Minas do Atlântico Ltda.",
      },
      {
        id: fixtureId(2202),
        document: "20200200000286",
        legalName: "Pedreira Serra Azul Ltda.",
      },
    ],
    suppliers: [
      {
        id: fixtureId(2301),
        document: "20200200000367",
        legalName: "Combustíveis Serra Azul Ltda.",
      },
      {
        id: fixtureId(2302),
        document: "20200200000448",
        legalName: "Posto Minas Operacional Ltda.",
      },
    ],
    machines: [
      {
        id: fixtureId(2401),
        name: "Escavadeira Serra 01",
        manufacturer: "Komatsu",
        model: "PC210",
        companyTag: "MSA-ESC-01",
        initialMeterReading: "980.00",
      },
      {
        id: fixtureId(2402),
        name: "Trator de Esteira Serra 01",
        manufacturer: "Caterpillar",
        model: "D6 GC",
        companyTag: "MSA-TRT-01",
        initialMeterReading: "630.00",
      },
    ],
    projects: [
      {
        id: fixtureId(2501),
        name: "Expansão Serra Azul",
        address: "Mina Serra Azul, zona rural, Quixadá - CE",
        contractNumber: "MSA-2026-001",
        approvedBudget: "1250000.00",
        plannedStartDate: "2026-07-15",
        plannedEndDate: "2027-01-31",
        clientIndex: 0,
        managerIndex: 0,
        technicalResponsibleIndex: 2,
      },
      {
        id: fixtureId(2502),
        name: "Pátio de Estocagem Serra",
        address: "Acesso da Pedreira, km 8, Quixeramobim - CE",
        contractNumber: "MSA-2026-002",
        approvedBudget: "730000.00",
        plannedStartDate: "2026-09-01",
        plannedEndDate: "2027-02-28",
        clientIndex: 1,
        managerIndex: 0,
        technicalResponsibleIndex: 1,
      },
    ],
  },
];

const daySchedule = Array.from({ length: 7 }, (_, index) => ({
  dayOfWeek: index + 1,
  isWorking: index < 5,
  startTime: index < 5 ? "08:00" : null,
  endTime: index < 5 ? "17:00" : null,
}));

async function seedCompany(prisma: PrismaClient, fixture: CompanyFixture) {
  await prisma.company.upsert({
    where: {
      corporationId_name: {
        corporationId: PILOT_CORPORATION_ID,
        name: fixture.name,
      },
    },
    update: { isActive: true },
    create: {
      id: fixture.id,
      corporationId: PILOT_CORPORATION_ID,
      name: fixture.name,
      isActive: true,
    },
  });

  await ensureCompanyCatalogBootstrap(prisma, {
    corporationId: PILOT_CORPORATION_ID,
    companyId: fixture.id,
  });

  for (const [index, employee] of fixture.employees.entries()) {
    const personId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 11 : 21}${index + 1}01`),
    );
    const roleId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 11 : 21}${index + 1}02`),
    );
    const employmentPeriodId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 11 : 21}${index + 1}03`),
    );
    const rolePeriodId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 11 : 21}${index + 1}04`),
    );
    const protectedDocument = protectSensitiveDocument({
      document: employee.document,
      registryType: "PERSON",
    });
    const normalizedRole = employee.role.toLocaleLowerCase("pt-BR");

    await prisma.person.upsert({
      where: { id: personId },
      update: {
        ...protectedDocument,
        displayName: employee.fullName,
        fullName: employee.fullName,
        isActive: true,
      },
      create: {
        id: personId,
        corporationId: PILOT_CORPORATION_ID,
        ...protectedDocument,
        displayName: employee.fullName,
        fullName: employee.fullName,
        isActive: true,
      },
    });
    await prisma.jobRole.upsert({
      where: {
        corporationId_companyId_normalizedName: {
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          normalizedName: normalizedRole,
        },
      },
      update: { name: employee.role, isActive: true },
      create: {
        id: roleId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        name: employee.role,
        normalizedName: normalizedRole,
        isActive: true,
      },
    });
    const role = await prisma.jobRole.findUniqueOrThrow({
      where: {
        corporationId_companyId_normalizedName: {
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          normalizedName: normalizedRole,
        },
      },
      select: { id: true },
    });
    await prisma.employment.upsert({
      where: { id: employee.id },
      update: {
        personId,
        companyRegistrationNumber: employee.registrationNumber,
        state: "ACTIVE",
        isActive: true,
        terminatedAt: null,
      },
      create: {
        id: employee.id,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        personId,
        companyRegistrationNumber: employee.registrationNumber,
        state: "ACTIVE",
        isActive: true,
      },
    });
    await prisma.employmentPeriod.upsert({
      where: { id: employmentPeriodId },
      update: {
        admissionDate: new Date("2026-01-05T00:00:00.000Z"),
        effectiveFrom: new Date("2026-01-05T00:00:00.000Z"),
        effectiveTo: null,
        terminationReason: null,
        endedByUserId: null,
      },
      create: {
        id: employmentPeriodId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        employmentId: employee.id,
        admissionDate: new Date("2026-01-05T00:00:00.000Z"),
        effectiveFrom: new Date("2026-01-05T00:00:00.000Z"),
      },
    });
    await prisma.employmentJobRolePeriod.upsert({
      where: { id: rolePeriodId },
      update: {
        jobRoleId: role.id,
        effectiveFrom: new Date("2026-01-05T00:00:00.000Z"),
        effectiveTo: null,
        endedByUserId: null,
        endedReason: null,
      },
      create: {
        id: rolePeriodId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        employmentId: employee.id,
        jobRoleId: role.id,
        effectiveFrom: new Date("2026-01-05T00:00:00.000Z"),
      },
    });
  }

  for (const client of fixture.clients) {
    const protectedDocument = protectSensitiveDocument({
      document: client.document,
      registryType: "CLIENT",
    });
    await prisma.client.upsert({
      where: { id: client.id },
      update: {
        ...protectedDocument,
        entityType: "LEGAL_ENTITY",
        displayName: client.legalName,
        legalName: client.legalName,
        tradeName: null,
        isActive: true,
        inactivatedAt: null,
        removedAt: null,
        removedByUserId: null,
      },
      create: {
        id: client.id,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        ...protectedDocument,
        entityType: "LEGAL_ENTITY",
        displayName: client.legalName,
        legalName: client.legalName,
        isActive: true,
      },
    });
  }

  for (const supplier of fixture.suppliers) {
    const protectedDocument = protectSensitiveDocument({
      document: supplier.document,
      registryType: "FUEL_SUPPLIER",
    });
    await prisma.fuelSupplier.upsert({
      where: { id: supplier.id },
      update: {
        ...protectedDocument,
        entityType: "LEGAL_ENTITY",
        displayName: supplier.legalName,
        legalName: supplier.legalName,
        tradeName: null,
        isActive: true,
        inactivatedAt: null,
        removedAt: null,
        removedByUserId: null,
      },
      create: {
        id: supplier.id,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        ...protectedDocument,
        entityType: "LEGAL_ENTITY",
        displayName: supplier.legalName,
        legalName: supplier.legalName,
        isActive: true,
      },
    });
  }

  for (const [index, machine] of fixture.machines.entries()) {
    const ownershipId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 14 : 24}${index + 1}01`),
    );
    const identifierId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 14 : 24}${index + 1}02`),
    );
    const readingId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 14 : 24}${index + 1}03`),
    );
    await prisma.machineModel.upsert({
      where: { id: machine.id },
      update: {
        manufacturer: machine.manufacturer,
        model: machine.model,
        normalizedManufacturer: machine.manufacturer.toLowerCase(),
        normalizedModel: machine.model.toLowerCase(),
        normalizedVersion: "",
        type: "YELLOW_LINE",
        meterType: "HOUR_METER",
      },
      create: {
        id: machine.id,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        manufacturer: machine.manufacturer,
        model: machine.model,
        normalizedManufacturer: machine.manufacturer.toLowerCase(),
        normalizedModel: machine.model.toLowerCase(),
        normalizedVersion: "",
        type: "YELLOW_LINE",
        meterType: "HOUR_METER",
        requiresOperator: false,
      },
    });
    await prisma.machine.upsert({
      where: { id: machine.id },
      update: {
        name: machine.name,
        description: `Equipamento de desenvolvimento ${fixture.prefix}`,
        type: "YELLOW_LINE",
        manufacturer: machine.manufacturer,
        model: machine.model,
        meterType: "HOUR_METER",
        machineModelId: machine.id,
        isActive: true,
      },
      create: {
        id: machine.id,
        corporationId: PILOT_CORPORATION_ID,
        name: machine.name,
        description: `Equipamento de desenvolvimento ${fixture.prefix}`,
        type: "YELLOW_LINE",
        manufacturer: machine.manufacturer,
        model: machine.model,
        meterType: "HOUR_METER",
        machineModelId: machine.id,
        isActive: true,
      },
    });
    await prisma.machineOwnershipPeriod.upsert({
      where: { id: ownershipId },
      update: { effectiveTo: null },
      create: {
        id: ownershipId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        machineId: machine.id,
        effectiveFrom: new Date("2026-01-05T00:00:00.000Z"),
      },
    });
    await prisma.machineIdentifier.upsert({
      where: { id: identifierId },
      update: {
        kind: "COMPANY_TAG",
        value: machine.companyTag,
        normalizedValue: machine.companyTag,
        releasedAt: null,
      },
      create: {
        id: identifierId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        machineId: machine.id,
        kind: "COMPANY_TAG",
        value: machine.companyTag,
        normalizedValue: machine.companyTag,
      },
    });
    await prisma.machineMeterReading.upsert({
      where: { id: readingId },
      update: {
        readingSequence: 1,
        value: machine.initialMeterReading,
        status: "CONFIRMED",
        purpose: "INITIAL",
        actorUserId: PILOT_ADMIN_ID,
        recordedAt: new Date("2026-01-05T00:00:00.000Z"),
      },
      create: {
        id: readingId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        machineId: machine.id,
        readingSequence: 1,
        value: machine.initialMeterReading,
        status: "CONFIRMED",
        purpose: "INITIAL",
        actorUserId: PILOT_ADMIN_ID,
        recordedAt: new Date("2026-01-05T00:00:00.000Z"),
      },
    });
  }

  for (const [index, project] of fixture.projects.entries()) {
    await prisma.$transaction(async (tx) => {
      const baselineId = fixtureId(
        Number(`${fixture.prefix === "TN" ? 15 : 25}${index + 1}01`),
      );
      const clientPeriodId = fixtureId(
        Number(`${fixture.prefix === "TN" ? 15 : 25}${index + 1}02`),
      );
      const managerTenureId = fixtureId(
        Number(`${fixture.prefix === "TN" ? 15 : 25}${index + 1}03`),
      );
      const responsibilityId = fixtureId(
        Number(`${fixture.prefix === "TN" ? 15 : 25}${index + 1}04`),
      );
      const scheduleId = fixtureId(
        Number(`${fixture.prefix === "TN" ? 15 : 25}${index + 1}05`),
      );
      const breakTemplateId = fixtureId(
        Number(`${fixture.prefix === "TN" ? 15 : 25}${index + 1}06`),
      );
      const now = new Date("2026-06-30T12:00:00.000Z");

      await tx.project.upsert({
        where: { id: project.id },
        update: {
          name: project.name,
          address: project.address,
          contractNumber: project.contractNumber,
          normalizedContractNumber:
            project.contractNumber.toLocaleLowerCase("pt-BR"),
          status: "PLANNED",
          actualStartedAt: null,
        },
        create: {
          id: project.id,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          name: project.name,
          address: project.address,
          contractNumber: project.contractNumber,
          normalizedContractNumber:
            project.contractNumber.toLocaleLowerCase("pt-BR"),
          status: "PLANNED",
        },
      });
      await tx.projectBaseline.upsert({
        where: { id: baselineId },
        update: {
          approvedBudget: project.approvedBudget,
          plannedStartDate: new Date(
            `${project.plannedStartDate}T00:00:00.000Z`,
          ),
          plannedEndDate: new Date(`${project.plannedEndDate}T00:00:00.000Z`),
          effectiveFrom: now,
          effectiveTo: null,
        },
        create: {
          id: baselineId,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          projectId: project.id,
          approvedBudget: project.approvedBudget,
          plannedStartDate: new Date(
            `${project.plannedStartDate}T00:00:00.000Z`,
          ),
          plannedEndDate: new Date(`${project.plannedEndDate}T00:00:00.000Z`),
          effectiveFrom: now,
        },
      });
      await tx.projectClientPeriod.upsert({
        where: { id: clientPeriodId },
        update: {
          clientId: fixture.clients[project.clientIndex].id,
          effectiveFrom: now,
          effectiveTo: null,
        },
        create: {
          id: clientPeriodId,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          projectId: project.id,
          clientId: fixture.clients[project.clientIndex].id,
          effectiveFrom: now,
        },
      });
      await tx.projectManagerTenure.upsert({
        where: { id: managerTenureId },
        update: {
          employmentId: fixture.employees[project.managerIndex].id,
          effectiveFrom: now,
          effectiveTo: null,
        },
        create: {
          id: managerTenureId,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          projectId: project.id,
          employmentId: fixture.employees[project.managerIndex].id,
          effectiveFrom: now,
        },
      });
      await tx.projectTechnicalResponsibility.upsert({
        where: { id: responsibilityId },
        update: {
          employmentId: fixture.employees[project.technicalResponsibleIndex].id,
          effectiveFrom: now,
          effectiveTo: null,
          endedByUserId: null,
          endedReason: null,
        },
        create: {
          id: responsibilityId,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          projectId: project.id,
          employmentId: fixture.employees[project.technicalResponsibleIndex].id,
          effectiveFrom: now,
        },
      });
      await tx.projectScheduleRevision.upsert({
        where: { id: scheduleId },
        update: { effectiveFrom: now, effectiveTo: null },
        create: {
          id: scheduleId,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          projectId: project.id,
          effectiveFrom: now,
        },
      });
      for (const day of daySchedule) {
        await tx.projectScheduleDay.upsert({
          where: {
            scheduleRevisionId_shift_dayOfWeek: {
              scheduleRevisionId: scheduleId,
              shift: "DAY",
              dayOfWeek: day.dayOfWeek,
            },
          },
          update: day,
          create: {
            id: fixtureId(
              Number(
                `${fixture.prefix === "TN" ? 15 : 25}${index + 1}${String(day.dayOfWeek).padStart(2, "0")}`,
              ),
            ),
            corporationId: PILOT_CORPORATION_ID,
            companyId: fixture.id,
            scheduleRevisionId: scheduleId,
            ...day,
          },
        });
      }
      await tx.projectBreakTemplate.upsert({
        where: {
          scheduleRevisionId_shift_position: {
            scheduleRevisionId: scheduleId,
            shift: "DAY",
            position: 0,
          },
        },
        update: { name: "Intervalo de almoço", durationMinutes: 60 },
        create: {
          id: breakTemplateId,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          scheduleRevisionId: scheduleId,
          position: 0,
          name: "Intervalo de almoço",
          durationMinutes: 60,
        },
      });
    });
  }
}

async function seedEmptyCompany(prisma: PrismaClient) {
  await prisma.company.upsert({
    where: {
      corporationId_name: {
        corporationId: PILOT_CORPORATION_ID,
        name: EMPTY_COMPANY.name,
      },
    },
    update: { isActive: true },
    create: {
      id: EMPTY_COMPANY.id,
      corporationId: PILOT_CORPORATION_ID,
      name: EMPTY_COMPANY.name,
      isActive: true,
    },
  });
}

export async function seedEpicOneDevelopmentData(prisma: PrismaClient) {
  const passwordHash = await hashPassword("1234");

  await prisma.corporation.upsert({
    where: { id: PILOT_CORPORATION_ID },
    update: { name: "Pilot Development Corporation", isActive: true },
    create: {
      id: PILOT_CORPORATION_ID,
      name: "Pilot Development Corporation",
      isActive: true,
    },
  });
  await prisma.domain.upsert({
    where: { host: "piloto.localhost" },
    update: { corporationId: PILOT_CORPORATION_ID, isActive: true },
    create: {
      corporationId: PILOT_CORPORATION_ID,
      host: "piloto.localhost",
      isActive: true,
    },
  });
  await prisma.user.upsert({
    where: {
      corporationId_email: {
        corporationId: PILOT_CORPORATION_ID,
        email: "master@piloto.localhost",
      },
    },
    update: { passwordHash, role: "MASTER_ADMIN", isActive: true },
    create: {
      id: PILOT_ADMIN_ID,
      corporationId: PILOT_CORPORATION_ID,
      email: "master@piloto.localhost",
      passwordHash,
      role: "MASTER_ADMIN",
      isActive: true,
    },
  });

  for (const fixture of companies) await seedCompany(prisma, fixture);
  await seedEmptyCompany(prisma);

  return {
    pilot: {
      corporationId: PILOT_CORPORATION_ID,
      domain: "piloto.localhost",
      adminEmail: "master@piloto.localhost",
      companies: [
        ...companies.map(({ id, name }) => ({ id, name })),
        EMPTY_COMPANY,
      ],
    },
  };
}

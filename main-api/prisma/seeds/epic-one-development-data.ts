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

const MONTHLY_WORKLOAD_HOURS = 220;

function calculateMonthlyOvertimeRate(compensationValue?: string) {
  if (!compensationValue) return "0.00";

  const [whole, fraction = "00"] = compensationValue.split(".");
  const monthlyCents = Number(whole) * 100 + Number(fraction);
  const overtimeCents = Math.round(
    (monthlyCents * 3) / (MONTHLY_WORKLOAD_HOURS * 2),
  );
  return (overtimeCents / 100).toFixed(2);
}

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
    compensationValue?: string;
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
    machineModelId?: string;
    modelVersion?: string;
    companyTag: string;
    initialMeterReading: string;
    type?: "YELLOW_LINE" | "WHITE_LINE";
    meterType?: "HOUR_METER" | "ODOMETER";
    hourlyRate?: string;
    loadCapacity?: string;
    loadCapacityUnitCode?: "M3_LOOSE" | "M3_COMPACTED" | "LITER" | "CUBIC_YARD";
    loadVolumeM3?: string;
    operatorIndex?: number;
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
        document: "20260900176",
        fullName: "Hallison",
        registrationNumber: "MSA-001",
        role: "Engenheiro Civil",
      },
      {
        id: fixtureId(2102),
        document: "20260900257",
        fullName: "Raimundo Rafael Santos Brito",
        registrationNumber: "MSA-002",
        role: "Supervisor de Terraplenagem",
        compensationValue: "7000.00",
      },
      {
        id: fixtureId(2103),
        document: "20260900338",
        fullName: "Romildo Sarasate da Cruz",
        registrationNumber: "MSA-003",
        role: "Operador de Máquina",
        compensationValue: "3502.40",
      },
      {
        id: fixtureId(2104),
        document: "20260900419",
        fullName: "Josué Oliveira Fernandes",
        registrationNumber: "MSA-004",
        role: "Motorista",
        compensationValue: "2840.20",
      },
      {
        id: fixtureId(2105),
        document: "20260900508",
        fullName: "Israel Costa de Sousa Silva",
        registrationNumber: "MSA-005",
        role: "Motorista",
        compensationValue: "2840.20",
      },
      {
        id: fixtureId(2106),
        document: "20260900680",
        fullName: "Fabio Barbosa da Silva",
        registrationNumber: "MSA-006",
        role: "Operador de Máquina",
        compensationValue: "2840.20",
      },
      {
        id: fixtureId(2107),
        document: "20260900761",
        fullName: "Raimundo de Sousa",
        registrationNumber: "MSA-007",
        role: "Operador de Máquina",
        compensationValue: "3502.40",
      },
      {
        id: fixtureId(2108),
        document: "20260900842",
        fullName: "Isaias Sousa de Oliveira",
        registrationNumber: "MSA-008",
        role: "Motorista",
        compensationValue: "2840.20",
      },
      {
        id: fixtureId(2109),
        document: "20260900923",
        fullName: "Francivan da Silva Sena",
        registrationNumber: "MSA-009",
        role: "Ajudante",
        compensationValue: "1661.00",
      },
      {
        id: fixtureId(2110),
        document: "20260901067",
        fullName: "Justino Pereira Cabral",
        registrationNumber: "MSA-010",
        role: "Operador de Máquina",
        compensationValue: "3714.60",
      },
      {
        id: fixtureId(2111),
        document: "20260901148",
        fullName: "Francisco Carlos da Cruz Sousa",
        registrationNumber: "MSA-011",
        role: "Motorista",
        compensationValue: "2840.20",
      },
      {
        id: fixtureId(2112),
        document: "20260901229",
        fullName: "Alan Conceição Silva",
        registrationNumber: "MSA-012",
        role: "Soldador / Auxiliar Mecânico",
        compensationValue: "2434.00",
      },
      {
        id: fixtureId(2113),
        document: "20260901300",
        fullName: "Paulo Daniel Cruza Tavares",
        registrationNumber: "MSA-013",
        role: "Meio Oficial",
        compensationValue: "1854.00",
      },
      {
        id: fixtureId(2114),
        document: "20260901490",
        fullName: "Yuri Samuel Melo",
        registrationNumber: "MSA-014",
        role: "Ajudante",
        compensationValue: "1661.00",
      },
      {
        id: fixtureId(2115),
        document: "20260901571",
        fullName: "Gabriel Oliveira de Sousa",
        registrationNumber: "MSA-015",
        role: "Operador de Máquina",
        compensationValue: "2840.20",
      },
    ],
    clients: [
      {
        id: fixtureId(2201),
        document: "20260928000112",
        legalName: "Construtora Quatro Rodas Ltda.",
      },
    ],
    suppliers: [
      {
        id: fixtureId(2301),
        document: "20260928000201",
        legalName: "Posto 4 Rodas Ltda.",
      },
    ],
    machines: [
      {
        id: fixtureId(2401),
        name: "Escavadeira HX220L Serra 01",
        manufacturer: "Hyundai",
        model: "HX220L",
        companyTag: "MSA-ESC-001",
        initialMeterReading: "0.00",
        hourlyRate: "200.00",
        operatorIndex: 2,
      },
      {
        id: fixtureId(2402),
        name: "Trator de Esteira FD9 Serra 01",
        manufacturer: "Fiatallis",
        model: "FD9",
        companyTag: "MSA-TRT-001",
        initialMeterReading: "0.00",
        hourlyRate: "200.00",
        operatorIndex: 5,
      },
      {
        id: fixtureId(2403),
        name: "Motoniveladora Serra 01",
        manufacturer: "Caterpillar",
        model: "120K",
        companyTag: "MSA-MOT-001",
        initialMeterReading: "0.00",
        hourlyRate: "200.00",
        operatorIndex: 6,
      },
      {
        id: fixtureId(2404),
        name: "Rolo Compactador Serra 01",
        manufacturer: "Müller",
        model: "VAP 70",
        companyTag: "MSA-RLC-001",
        initialMeterReading: "0.00",
        hourlyRate: "115.00",
        operatorIndex: 9,
      },
      {
        id: fixtureId(2405),
        name: "Caminhão-Pipa Serra 01",
        manufacturer: "Mercedes-Benz",
        model: "2730",
        modelVersion: "Pipa 8.000 L",
        companyTag: "MSA-PIP-001",
        initialMeterReading: "0.00",
        type: "WHITE_LINE",
        meterType: "ODOMETER",
        hourlyRate: "125.00",
        loadCapacity: "8000.000",
        loadCapacityUnitCode: "LITER",
        operatorIndex: 3,
      },
      {
        id: fixtureId(2406),
        name: "Caminhão-Pipa Serra 02",
        manufacturer: "Mercedes-Benz",
        model: "2730",
        machineModelId: fixtureId(2405),
        modelVersion: "Pipa 8.000 L",
        companyTag: "MSA-PIP-002",
        initialMeterReading: "0.00",
        type: "WHITE_LINE",
        meterType: "ODOMETER",
        hourlyRate: "125.00",
        loadCapacity: "8000.000",
        loadCapacityUnitCode: "LITER",
        operatorIndex: 4,
      },
      {
        id: fixtureId(2407),
        name: "Caminhão Basculante Serra 01",
        manufacturer: "Mercedes-Benz",
        model: "2730",
        modelVersion: "Basculante 16 m³",
        companyTag: "MSA-BSC-001",
        initialMeterReading: "0.00",
        type: "WHITE_LINE",
        meterType: "ODOMETER",
        hourlyRate: "125.00",
        loadCapacity: "16.000",
        loadCapacityUnitCode: "M3_LOOSE",
        loadVolumeM3: "16.000",
        operatorIndex: 7,
      },
      {
        id: fixtureId(2408),
        name: "Caminhão Basculante Serra 02",
        manufacturer: "Volkswagen",
        model: "31.280",
        companyTag: "MSA-BSC-002",
        initialMeterReading: "0.00",
        type: "WHITE_LINE",
        meterType: "ODOMETER",
        hourlyRate: "125.00",
        loadCapacity: "16.000",
        loadCapacityUnitCode: "M3_LOOSE",
        loadVolumeM3: "16.000",
        operatorIndex: 8,
      },
      {
        id: fixtureId(2409),
        name: "Caminhão Basculante Serra 03",
        manufacturer: "Volkswagen",
        model: "17.180",
        companyTag: "MSA-BSC-003",
        initialMeterReading: "0.00",
        type: "WHITE_LINE",
        meterType: "ODOMETER",
        hourlyRate: "125.00",
        loadCapacity: "16.000",
        loadCapacityUnitCode: "M3_LOOSE",
        loadVolumeM3: "16.000",
        operatorIndex: 10,
      },
    ],
    projects: [
      {
        id: fixtureId(2502),
        name: "Pátio de Estocagem Serra",
        address: "Pátio de Estocagem Serra, Quixeramobim - CE",
        contractNumber: "MSA-2026-002",
        approvedBudget: "730000.00",
        plannedStartDate: "2026-08-25",
        plannedEndDate: "2027-02-28",
        clientIndex: 0,
        managerIndex: 0,
        technicalResponsibleIndex: 0,
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

async function seedSerraAzulPatioRoster(
  prisma: PrismaClient,
  fixture: CompanyFixture,
) {
  const project = fixture.projects.find(
    (candidate) => candidate.name === "Pátio de Estocagem Serra",
  );
  if (!project) return;

  const effectiveFrom = new Date("2026-08-25T08:00:00.000Z");
  for (const [index, employee] of fixture.employees.entries()) {
    const role = await prisma.jobRole.findUniqueOrThrow({
      where: {
        corporationId_companyId_normalizedName: {
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          normalizedName: employee.role.toLocaleLowerCase("pt-BR"),
        },
      },
      select: { id: true },
    });
    const rolePeriodId = fixtureId(Number(`21${index + 1}04`));
    const allocationId = fixtureId(26001 + index);
    const currentAllocation = await prisma.projectEmployeeAllocation.findFirst({
      where: {
        corporationId: PILOT_CORPORATION_ID,
        personId: fixtureId(Number(`21${index + 1}01`)),
        effectiveTo: null,
      },
      select: { id: true },
    });
    const activeAllocationId = currentAllocation?.id ?? allocationId;
    const allocation = {
      corporationId: PILOT_CORPORATION_ID,
      companyId: fixture.id,
      projectId: project.id,
      employmentId: employee.id,
      personId: fixtureId(Number(`21${index + 1}01`)),
      shift: "DAY" as const,
      jobRole: employee.role,
      confirmedJobRoleId: role.id,
      employmentJobRolePeriodId: rolePeriodId,
      monthlyWorkloadHours: MONTHLY_WORKLOAD_HOURS,
      compensationMode: "monthly",
      compensationValue: employee.compensationValue ?? "0.00",
      overtimeRate: calculateMonthlyOvertimeRate(employee.compensationValue),
      effectiveFrom,
      effectiveTo: null,
      createdByUserId: PILOT_ADMIN_ID,
      endedByUserId: null,
      endedReason: null,
    };
    await prisma.projectEmployeeAllocation.upsert({
      where: { id: activeAllocationId },
      update: allocation,
      create: { id: activeAllocationId, ...allocation },
    });
  }

  for (const [index, machine] of fixture.machines.entries()) {
    const allocationId = fixtureId(27001 + index);
    const shiftAssignmentId = fixtureId(28001 + index);
    const startMeterReadingId = fixtureId(Number(`24${index + 1}03`));
    const operatorEmploymentId =
      machine.operatorIndex === undefined
        ? null
        : (fixture.employees[machine.operatorIndex]?.id ?? null);
    const currentAllocation = await prisma.projectMachineAllocation.findFirst({
      where: {
        corporationId: PILOT_CORPORATION_ID,
        machineId: machine.id,
        effectiveTo: null,
      },
      select: { id: true },
    });
    const activeAllocationId = currentAllocation?.id ?? allocationId;
    const allocation = {
      corporationId: PILOT_CORPORATION_ID,
      companyId: fixture.id,
      projectId: project.id,
      machineId: machine.id,
      startMeterReadingId,
      operatorEmploymentId,
      effectiveFrom,
      effectiveTo: null,
      createdByUserId: PILOT_ADMIN_ID,
      endedByUserId: null,
      endedReason: null,
    };
    await prisma.projectMachineAllocation.upsert({
      where: { id: activeAllocationId },
      update: allocation,
      create: { id: activeAllocationId, ...allocation },
    });
    const currentShiftAssignment =
      await prisma.projectMachineShiftAssignment.findFirst({
        where: {
          corporationId: PILOT_CORPORATION_ID,
          machineId: machine.id,
          shift: "DAY",
          effectiveTo: null,
        },
        select: { id: true },
      });
    const activeShiftAssignmentId =
      currentShiftAssignment?.id ?? shiftAssignmentId;
    await prisma.projectMachineShiftAssignment.upsert({
      where: { id: activeShiftAssignmentId },
      update: {
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        projectId: project.id,
        machineId: machine.id,
        operatorEmploymentId,
        effectiveFrom,
        effectiveTo: null,
        createdByUserId: PILOT_ADMIN_ID,
        endedByUserId: null,
        endedReason: null,
        projectMachineAllocationId: activeAllocationId,
        shift: "DAY",
      },
      create: {
        id: activeShiftAssignmentId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        projectId: project.id,
        machineId: machine.id,
        operatorEmploymentId,
        effectiveFrom,
        createdByUserId: PILOT_ADMIN_ID,
        projectMachineAllocationId: activeAllocationId,
        shift: "DAY",
      },
    });
  }

  const fuelAgreementId = fixtureId(29001);
  await prisma.$transaction(async (tx) => {
    await tx.projectFuelAgreement.upsert({
      where: { id: fuelAgreementId },
      update: {
        fuelSupplierId: fixture.suppliers[0].id,
        effectiveFrom,
        effectiveTo: null,
      },
      create: {
        id: fuelAgreementId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        projectId: project.id,
        fuelSupplierId: fixture.suppliers[0].id,
        effectiveFrom,
      },
    });
    await tx.projectFuelPrice.upsert({
      where: { id: fixtureId(29002) },
      update: {
        agreementId: fuelAgreementId,
        fuelTypeId: "diesel-s10",
        pricePerLiter: "6.8900",
        effectiveFrom,
        effectiveTo: null,
      },
      create: {
        id: fixtureId(29002),
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        agreementId: fuelAgreementId,
        fuelTypeId: "diesel-s10",
        pricePerLiter: "6.8900",
        effectiveFrom,
      },
    });
  });
}

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
    const identifierId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 14 : 24}${index + 1}02`),
    );
    const readingId = fixtureId(
      Number(`${fixture.prefix === "TN" ? 14 : 24}${index + 1}03`),
    );
    const type = machine.type ?? "YELLOW_LINE";
    const meterType = machine.meterType ?? "HOUR_METER";
    const machineModelId = machine.machineModelId ?? machine.id;
    const operator =
      machine.operatorIndex === undefined
        ? undefined
        : fixture.employees[machine.operatorIndex];
    const requiredJobRole = operator
      ? await prisma.jobRole.findUnique({
          where: {
            corporationId_companyId_normalizedName: {
              corporationId: PILOT_CORPORATION_ID,
              companyId: fixture.id,
              normalizedName: operator.role.toLocaleLowerCase("pt-BR"),
            },
          },
          select: { id: true },
        })
      : null;
    await prisma.machineModel.upsert({
      where: { id: machineModelId },
      update: {
        manufacturer: machine.manufacturer,
        model: machine.model,
        version: machine.modelVersion,
        normalizedManufacturer: machine.manufacturer.toLowerCase(),
        normalizedModel: machine.model.toLowerCase(),
        normalizedVersion: machine.modelVersion?.toLowerCase() ?? "",
        type,
        meterType,
        requiresOperator: Boolean(requiredJobRole),
        requiredJobRoleId: requiredJobRole?.id ?? null,
      },
      create: {
        id: machineModelId,
        corporationId: PILOT_CORPORATION_ID,
        companyId: fixture.id,
        manufacturer: machine.manufacturer,
        model: machine.model,
        version: machine.modelVersion,
        normalizedManufacturer: machine.manufacturer.toLowerCase(),
        normalizedModel: machine.model.toLowerCase(),
        normalizedVersion: machine.modelVersion?.toLowerCase() ?? "",
        type,
        meterType,
        requiresOperator: Boolean(requiredJobRole),
        requiredJobRoleId: requiredJobRole?.id,
      },
    });
    await prisma.machine.upsert({
      where: { id: machine.id },
      update: {
        name: machine.name,
        description:
          fixture.prefix === "MSA"
            ? "Equipamento do Pátio de Estocagem Serra"
            : `Equipamento de desenvolvimento ${fixture.prefix}`,
        type,
        manufacturer: machine.manufacturer,
        model: machine.model,
        version: machine.modelVersion,
        meterType,
        machineModelId,
        hourlyRate: machine.hourlyRate,
        loadCapacity: machine.loadCapacity,
        loadCapacityUnitCode: machine.loadCapacityUnitCode,
        loadVolumeM3: machine.loadVolumeM3,
        isActive: true,
      },
      create: {
        id: machine.id,
        corporationId: PILOT_CORPORATION_ID,
        name: machine.name,
        description:
          fixture.prefix === "MSA"
            ? "Equipamento do Pátio de Estocagem Serra"
            : `Equipamento de desenvolvimento ${fixture.prefix}`,
        type,
        manufacturer: machine.manufacturer,
        model: machine.model,
        version: machine.modelVersion,
        meterType,
        machineModelId,
        hourlyRate: machine.hourlyRate,
        loadCapacity: machine.loadCapacity,
        loadCapacityUnitCode: machine.loadCapacityUnitCode,
        loadVolumeM3: machine.loadVolumeM3,
        isActive: true,
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
    if (
      type === "WHITE_LINE" &&
      machine.loadCapacity &&
      machine.loadCapacityUnitCode
    ) {
      await prisma.machineTransportSpecification.upsert({
        where: { machineId: machine.id },
        update: {
          nominalCapacity: machine.loadCapacity,
          effectiveCapacity: machine.loadCapacity,
          capacityUnitCode: machine.loadCapacityUnitCode,
        },
        create: {
          machineId: machine.id,
          nominalCapacity: machine.loadCapacity,
          effectiveCapacity: machine.loadCapacity,
          capacityUnitCode: machine.loadCapacityUnitCode,
        },
      });
    }
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
      const isSerraAzulPatio =
        fixture.prefix === "MSA" && project.name === "Pátio de Estocagem Serra";

      await tx.project.upsert({
        where: { id: project.id },
        update: {
          name: project.name,
          address: project.address,
          contractNumber: project.contractNumber,
          normalizedContractNumber:
            project.contractNumber.toLocaleLowerCase("pt-BR"),
          status: isSerraAzulPatio ? "ACTIVE" : "PLANNED",
          actualStartedAt: isSerraAzulPatio
            ? new Date("2026-08-25T08:00:00.000Z")
            : null,
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
          status: isSerraAzulPatio ? "ACTIVE" : "PLANNED",
          actualStartedAt: isSerraAzulPatio
            ? new Date("2026-08-25T08:00:00.000Z")
            : undefined,
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
      const currentSchedule = await tx.projectScheduleRevision.findFirst({
        where: { projectId: project.id, effectiveTo: null },
        select: { id: true },
      });
      const activeScheduleId = currentSchedule?.id ?? scheduleId;
      await tx.projectScheduleRevision.upsert({
        where: { id: activeScheduleId },
        update: { effectiveFrom: now, effectiveTo: null },
        create: {
          id: activeScheduleId,
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
              scheduleRevisionId: activeScheduleId,
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
            scheduleRevisionId: activeScheduleId,
            ...day,
          },
        });
      }
      await tx.projectBreakTemplate.upsert({
        where: {
          scheduleRevisionId_shift_position: {
            scheduleRevisionId: activeScheduleId,
            shift: "DAY",
            position: 0,
          },
        },
        update: { name: "Intervalo de almoço", durationMinutes: 60 },
        create: {
          id: breakTemplateId,
          corporationId: PILOT_CORPORATION_ID,
          companyId: fixture.id,
          scheduleRevisionId: activeScheduleId,
          position: 0,
          name: "Intervalo de almoço",
          durationMinutes: 60,
        },
      });
    });
  }

  if (fixture.prefix === "MSA") await seedSerraAzulPatioRoster(prisma, fixture);
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

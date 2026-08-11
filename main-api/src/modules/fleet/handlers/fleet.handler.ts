import type { Prisma } from "../../../db/generated/prisma/client";
import { AppError } from "../../../lib/utils/appError";
import type {
  CursorBoundary,
  SortDirection,
} from "../../../lib/utils/cursor-pagination";
import { invalidCursorError } from "../../../lib/utils/cursor-pagination";
import type { HandlerContext } from "../../../lib/utils/handler.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface MachineRecord {
  id: string;
  corporationId: string;
  name: string;
  description: string | null;
  type: "YELLOW_LINE" | "WHITE_LINE";
  manufacturer: string;
  model: string;
  meterType: "HOUR_METER" | "ODOMETER";
  loadVolumeM3: Prisma.Decimal | null;
  maxSupportedWeightT: Prisma.Decimal | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownershipPeriods: {
    id: string;
    corporationId: string;
    companyId: string;
    machineId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  identifiers: {
    id: string;
    kind: "PLATE" | "COMPANY_TAG";
    value: string;
    normalizedValue: string;
    releasedAt: Date | null;
  }[];
  meterReadings: {
    id: string;
    readingSequence: number;
    value: Prisma.Decimal;
    status: "CONFIRMED";
    purpose: "INITIAL" | "OWNERSHIP_TRANSFER" | "ORDINARY";
    actorUserId: string;
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }[];
}

function machineSelect(companyId: string) {
  return {
    id: true,
    corporationId: true,
    name: true,
    description: true,
    type: true,
    manufacturer: true,
    model: true,
    meterType: true,
    loadVolumeM3: true,
    maxSupportedWeightT: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    ownershipPeriods: {
      where: { companyId, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" as const },
      take: 1,
      select: {
        id: true,
        corporationId: true,
        companyId: true,
        machineId: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    identifiers: {
      where: { companyId, releasedAt: null },
      orderBy: { kind: "asc" as const },
      select: {
        id: true,
        kind: true,
        value: true,
        normalizedValue: true,
        releasedAt: true,
      },
    },
    meterReadings: {
      where: { companyId, status: "CONFIRMED" as const },
      orderBy: { readingSequence: "desc" as const },
      take: 1,
      select: {
        id: true,
        readingSequence: true,
        value: true,
        status: true,
        purpose: true,
        actorUserId: true,
        recordedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  };
}

function isUniqueError(
  error: unknown,
): error is { code: string; meta?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function identifierConflictError(): AppError {
  return new AppError({
    code: "MACHINE_IDENTIFIER_CONFLICT",
    message: "Machine identifier already exists in this Company",
    statusCode: 409,
  });
}

function notFoundError(): AppError {
  return new AppError({
    code: "NOT_FOUND",
    message: "Machine not found",
    statusCode: 404,
  });
}

function readingDecreaseError(): AppError {
  return new AppError({
    code: "MACHINE_READING_DECREASE",
    message: "Machine meter reading cannot be lower than the latest reading",
    statusCode: 409,
  });
}

function immutableReadingError(): AppError {
  return new AppError({
    code: "MACHINE_READING_IMMUTABLE",
    message: "Machine meter reading cannot be corrected",
    statusCode: 409,
  });
}

function neighborBoundError(): AppError {
  return new AppError({
    code: "MACHINE_READING_NEIGHBOR_BOUND_VIOLATION",
    message: "Machine meter reading correction violates neighbor bounds",
    statusCode: 409,
  });
}

function boundaryWhere({
  boundary,
  sortBy,
  sortDirection,
}: {
  boundary: CursorBoundary | null;
  sortBy: "name" | "createdAt";
  sortDirection: SortDirection;
}): Prisma.MachineWhereInput | undefined {
  if (!boundary) return undefined;
  if (!UUID_PATTERN.test(boundary.id)) throw invalidCursorError();
  if (sortBy === "createdAt") {
    if (typeof boundary.value !== "string") throw invalidCursorError();
    const createdAt = new Date(String(boundary.value));
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== boundary.value
    ) {
      throw invalidCursorError();
    }
    return sortDirection === "asc"
      ? {
          OR: [
            { createdAt: { gt: createdAt } },
            { createdAt, id: { gt: boundary.id } },
          ],
        }
      : {
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt, id: { lt: boundary.id } },
          ],
        };
  }

  const name = String(boundary.value);
  return sortDirection === "asc"
    ? { OR: [{ name: { gt: name } }, { name, id: { gt: boundary.id } }] }
    : { OR: [{ name: { lt: name } }, { name, id: { lt: boundary.id } }] };
}

function orderBy({
  sortBy,
  sortDirection,
}: {
  sortBy: "name" | "createdAt";
  sortDirection: SortDirection;
}): Prisma.MachineOrderByWithRelationInput[] {
  if (sortBy === "name")
    return [{ name: sortDirection }, { id: sortDirection }];
  return [{ createdAt: sortDirection }, { id: sortDirection }];
}

function searchWhere({
  companyId,
  search,
}: {
  companyId: string;
  search?: string;
}): Prisma.MachineWhereInput | undefined {
  if (!search) return undefined;
  const normalizedIdentifierSearch = search.replace(/\W/gu, "").toUpperCase();
  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { manufacturer: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
      ...(normalizedIdentifierSearch
        ? [
            {
              identifiers: {
                some: {
                  companyId,
                  releasedAt: null,
                  normalizedValue: { contains: normalizedIdentifierSearch },
                },
              },
            },
          ]
        : []),
    ],
  };
}

async function latestMachineReading(
  context: HandlerContext,
  input: { corporationId: string; machineId: string },
) {
  return context.prisma.machineMeterReading.findFirst({
    where: {
      corporationId: input.corporationId,
      machineId: input.machineId,
      status: "CONFIRMED",
    },
    orderBy: { readingSequence: "desc" },
    select: { readingSequence: true, value: true },
  });
}

async function nextReadingSequence(
  context: HandlerContext,
  input: { corporationId: string; machineId: string },
) {
  const latest = await latestMachineReading(context, input);
  return {
    latest,
    readingSequence: latest ? latest.readingSequence + 1 : 1,
  };
}

async function lockMachine(
  context: HandlerContext,
  input: { corporationId: string; machineId: string },
) {
  await context.prisma.$queryRawUnsafe(
    `SELECT id FROM "machines" WHERE "corporation_id" = $1 AND "id" = $2 FOR UPDATE`,
    input.corporationId,
    input.machineId,
  );
}

export async function createMachineHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    actorUserId: string;
    name: string;
    description?: string;
    type: "YELLOW_LINE" | "WHITE_LINE";
    manufacturer: string;
    model: string;
    meterType: "HOUR_METER" | "ODOMETER";
    loadVolumeM3?: string;
    maxSupportedWeightT?: string;
    identifiers: {
      kind: "PLATE" | "COMPANY_TAG";
      value: string;
      normalizedValue: string;
    }[];
    initialMeterReading: string;
  },
): Promise<MachineRecord> {
  try {
    const machine = await context.prisma.machine.create({
      data: {
        corporationId: input.corporationId,
        name: input.name,
        description: input.description,
        type: input.type,
        manufacturer: input.manufacturer,
        model: input.model,
        meterType: input.meterType,
        loadVolumeM3: input.loadVolumeM3,
        maxSupportedWeightT: input.maxSupportedWeightT,
      },
      select: { id: true },
    });
    if (input.type === "WHITE_LINE" && input.loadVolumeM3)
      await context.prisma.machineTransportSpecification.create({
        data: {
          machineId: machine.id,
          nominalCapacity: input.loadVolumeM3,
          effectiveCapacity: input.loadVolumeM3,
          capacityUnitCode: "M3_LOOSE",
          maxSupportedWeightT: input.maxSupportedWeightT,
        },
      });
    await context.prisma.machineOwnershipPeriod.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        machineId: machine.id,
      },
      select: { id: true },
    });
    await context.prisma.machineIdentifier.createMany({
      data: input.identifiers.map((identifier) => ({
        corporationId: input.corporationId,
        companyId: input.companyId,
        machineId: machine.id,
        kind: identifier.kind,
        value: identifier.value,
        normalizedValue: identifier.normalizedValue,
      })),
    });
    await context.prisma.machineMeterReading.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        machineId: machine.id,
        readingSequence: 1,
        value: input.initialMeterReading,
        purpose: "INITIAL",
        actorUserId: input.actorUserId,
      },
      select: { id: true },
    });
    return findMachineDetailHandler(context, {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: machine.id,
    });
  } catch (error) {
    if (isUniqueError(error)) throw identifierConflictError();
    throw error;
  }
}

export async function listMachinesHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    search?: string;
    type?: "YELLOW_LINE" | "WHITE_LINE";
    limit: number;
    boundary: CursorBoundary | null;
    sortBy: "name" | "createdAt";
    sortDirection: SortDirection;
  },
): Promise<MachineRecord[]> {
  return (await context.prisma.machine.findMany({
    where: {
      corporationId: input.corporationId,
      isActive: true,
      ownershipPeriods: {
        some: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          effectiveTo: null,
        },
      },
      ...(input.type ? { type: input.type } : {}),
      ...searchWhere({ companyId: input.companyId, search: input.search }),
      ...boundaryWhere(input),
    },
    orderBy: orderBy(input),
    take: input.limit + 1,
    select: machineSelect(input.companyId),
  })) as MachineRecord[];
}

export async function findMachineDetailHandler(
  context: HandlerContext,
  input: { corporationId: string; companyId: string; machineId: string },
): Promise<MachineRecord> {
  const record = (await context.prisma.machine.findFirst({
    where: {
      id: input.machineId,
      corporationId: input.corporationId,
      isActive: true,
      ownershipPeriods: {
        some: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          effectiveTo: null,
        },
      },
    },
    select: machineSelect(input.companyId),
  })) as MachineRecord | null;

  if (!record) throw notFoundError();
  return record;
}

export async function updateMachineLoadSpecificationHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    machineId: string;
    loadVolumeM3: string | null;
    maxSupportedWeightT: string | null;
  },
) {
  await findMachineDetailHandler(context, input);
  await context.prisma.machine.update({
    where: {
      corporationId_id: {
        corporationId: input.corporationId,
        id: input.machineId,
      },
    },
    data: {
      loadVolumeM3: input.loadVolumeM3,
      maxSupportedWeightT: input.maxSupportedWeightT,
    },
  });
  if (input.loadVolumeM3)
    await context.prisma.machineTransportSpecification.upsert({
      where: { machineId: input.machineId },
      create: {
        machineId: input.machineId,
        nominalCapacity: input.loadVolumeM3,
        effectiveCapacity: input.loadVolumeM3,
        capacityUnitCode: "M3_LOOSE",
        maxSupportedWeightT: input.maxSupportedWeightT,
      },
      update: {
        nominalCapacity: input.loadVolumeM3,
        effectiveCapacity: input.loadVolumeM3,
        maxSupportedWeightT: input.maxSupportedWeightT,
      },
    });
  else
    await context.prisma.machineTransportSpecification.deleteMany({
      where: { machineId: input.machineId },
    });
  return findMachineDetailHandler(context, input);
}

export async function appendMachineMeterReadingHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    machineId: string;
    actorUserId: string;
    value: string;
    valueCents: bigint;
  },
) {
  await findMachineDetailHandler(context, input);
  await lockMachine(context, input);
  const { latest, readingSequence } = await nextReadingSequence(context, input);
  if (latest && decimalToCents(String(latest.value)) > input.valueCents) {
    throw readingDecreaseError();
  }
  await context.prisma.machineMeterReading.create({
    data: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      readingSequence,
      value: input.value,
      purpose: "ORDINARY",
      actorUserId: input.actorUserId,
    },
    select: { id: true },
  });
  return findMachineDetailHandler(context, input);
}

export async function correctMachineMeterReadingHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    machineId: string;
    readingId: string;
    actorUserId: string;
    value: string;
    valueCents: bigint;
    reason: string;
  },
) {
  await findMachineDetailHandler(context, input);
  await lockMachine(context, input);
  const reading = await context.prisma.machineMeterReading.findFirst({
    where: {
      id: input.readingId,
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      status: "CONFIRMED",
    },
    select: {
      id: true,
      value: true,
      readingSequence: true,
      purpose: true,
      recordedAt: true,
      references: { select: { id: true }, take: 1 },
    },
  });
  if (!reading) throw notFoundError();
  if (
    !["INITIAL", "OWNERSHIP_TRANSFER"].includes(reading.purpose) ||
    reading.references.length > 0
  ) {
    throw immutableReadingError();
  }

  const [previous, next] = await Promise.all([
    context.prisma.machineMeterReading.findFirst({
      where: {
        corporationId: input.corporationId,
        machineId: input.machineId,
        status: "CONFIRMED",
        readingSequence: { lt: reading.readingSequence },
      },
      orderBy: { readingSequence: "desc" },
      select: { value: true },
    }),
    context.prisma.machineMeterReading.findFirst({
      where: {
        corporationId: input.corporationId,
        machineId: input.machineId,
        status: "CONFIRMED",
        readingSequence: { gt: reading.readingSequence },
      },
      orderBy: { readingSequence: "asc" },
      select: { value: true },
    }),
  ]);

  if (previous && decimalToCents(String(previous.value)) > input.valueCents) {
    throw neighborBoundError();
  }
  if (next && decimalToCents(String(next.value)) < input.valueCents) {
    throw neighborBoundError();
  }

  await context.prisma.machineMeterReading.update({
    where: {
      corporationId_companyId_machineId_id: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        machineId: input.machineId,
        id: input.readingId,
      },
    },
    data: { value: input.value },
    select: { id: true },
  });
  await context.prisma.machineMeterReadingCorrection.create({
    data: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      readingId: input.readingId,
      actorUserId: input.actorUserId,
      oldValue: String(reading.value),
      newValue: input.value,
      reason: input.reason,
    },
    select: { id: true },
  });
  return findMachineDetailHandler(context, input);
}

function decimalToCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

export async function findAllocatedMachineIdsHandler(
  context: HandlerContext,
  corporationId: string,
  machineIds: string[],
) {
  if (!machineIds.length) return [];
  return context.prisma.projectMachineAllocation.findMany({
    where: { corporationId, machineId: { in: machineIds }, effectiveTo: null },
    select: { machineId: true },
  });
}

export async function allocateMachineHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    machineId: string;
    projectId: string;
    operatorEmploymentId: string;
    effectiveFrom: Date;
  },
) {
  await lockMachine(context, input);
  const [machine, ownership, project, reading, allocation, operator] =
    await Promise.all([
      context.prisma.machine.findFirst({
        where: {
          id: input.machineId,
          corporationId: input.corporationId,
          isActive: true,
        },
        select: { id: true },
      }),
      context.prisma.machineOwnershipPeriod.findFirst({
        where: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          machineId: input.machineId,
          effectiveTo: null,
        },
        select: { id: true },
      }),
      context.prisma.project.findFirst({
        where: {
          id: input.projectId,
          corporationId: input.corporationId,
          companyId: input.companyId,
          status: { in: ["PLANNED", "ACTIVE"] },
        },
        select: { id: true },
      }),
      context.prisma.machineMeterReading.findFirst({
        where: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          machineId: input.machineId,
          status: "CONFIRMED",
        },
        orderBy: { readingSequence: "desc" },
        select: { id: true, value: true },
      }),
      context.prisma.projectMachineAllocation.findFirst({
        where: {
          corporationId: input.corporationId,
          machineId: input.machineId,
          effectiveTo: null,
        },
        select: { id: true },
      }),
      context.prisma.projectEmployeeAllocation.findFirst({
        where: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          projectId: input.projectId,
          employmentId: input.operatorEmploymentId,
          effectiveTo: null,
          employmentJobRolePeriod: {
            employment: {
              state: "ACTIVE",
              isActive: true,
              periods: { some: { effectiveTo: null } },
            },
          },
        },
        select: { id: true },
      }),
    ]);
  if (!machine || !ownership || !reading)
    throw new AppError({
      code: "MACHINE_ALLOCATION_UNAVAILABLE",
      message: "Machine is unavailable for allocation",
      statusCode: 409,
    });
  if (!project)
    throw new AppError({
      code: "MACHINE_ALLOCATION_PROJECT_UNAVAILABLE",
      message: "Project is unavailable for machine allocation",
      statusCode: 409,
    });
  if (!operator)
    throw new AppError({
      code: "MACHINE_ALLOCATION_UNAVAILABLE",
      message: "Machine operator must be allocated to the project",
      statusCode: 409,
    });
  if (allocation)
    throw new AppError({
      code: "MACHINE_ALLOCATION_UNAVAILABLE",
      message: "Machine is unavailable for allocation",
      statusCode: 409,
    });
  try {
    return await context.prisma.projectMachineAllocation.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        projectId: input.projectId,
        machineId: input.machineId,
        startMeterReadingId: reading.id,
        operatorEmploymentId: input.operatorEmploymentId,
        effectiveFrom: input.effectiveFrom,
      },
      select: {
        id: true,
        projectId: true,
        machineId: true,
        startMeterReadingId: true,
        operatorEmploymentId: true,
        effectiveFrom: true,
      },
    });
  } catch (error) {
    if (isUniqueError(error))
      throw new AppError({
        code: "MACHINE_ALLOCATION_UNAVAILABLE",
        message: "Machine is unavailable for allocation",
        statusCode: 409,
      });
    throw error;
  }
}

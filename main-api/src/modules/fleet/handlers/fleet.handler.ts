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

function normalizedJobRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export interface MachineRecord {
  id: string;
  corporationId: string;
  name: string;
  description: string | null;
  type: "YELLOW_LINE" | "WHITE_LINE";
  manufacturer: string;
  model: string;
  version: string | null;
  meterType: "HOUR_METER" | "ODOMETER";
  loadVolumeM3: Prisma.Decimal | null;
  maxSupportedWeightT: Prisma.Decimal | null;
  transportSpecification: {
    nominalCapacity: Prisma.Decimal;
    effectiveCapacity: Prisma.Decimal;
    capacityUnitCode: string;
    maxSupportedWeightT: Prisma.Decimal | null;
  } | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  machineModel: {
    id: string;
    companyId: string;
    description: string | null;
    type: "YELLOW_LINE" | "WHITE_LINE";
    manufacturer: string;
    model: string;
    version: string | null;
    loadCapacity: Prisma.Decimal | null;
    loadCapacityUnitCode: string | null;
    loadVolumeM3: Prisma.Decimal | null;
    maxSupportedWeightT: Prisma.Decimal | null;
    requiresOperator: boolean;
    requiredJobRoleId: string | null;
    requiredJobRole: { id: string; name: string } | null;
  };
  ownershipPeriods: {
    id: string;
    corporationId: string;
    companyId: string;
    machineId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    ownershipKind: "OWNED" | "RENTED" | "THIRD_PARTY";
    externalOwnerName: string | null;
    suggestedHourlyRate: Prisma.Decimal | null;
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
    purpose: "INITIAL" | "RESTORATION" | "OWNERSHIP_TRANSFER" | "ORDINARY";
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
    version: true,
    meterType: true,
    loadVolumeM3: true,
    maxSupportedWeightT: true,
    transportSpecification: {
      select: {
        nominalCapacity: true,
        effectiveCapacity: true,
        capacityUnitCode: true,
        maxSupportedWeightT: true,
      },
    },
    isActive: true,
    createdAt: true,
    updatedAt: true,
    machineModel: {
      select: {
        id: true,
        companyId: true,
        description: true,
        type: true,
        manufacturer: true,
        model: true,
        version: true,
        loadCapacity: true,
        loadCapacityUnitCode: true,
        loadVolumeM3: true,
        maxSupportedWeightT: true,
        requiresOperator: true,
        requiredJobRoleId: true,
        requiredJobRole: { select: { id: true, name: true } },
      },
    },
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
        ownershipKind: true,
        externalOwnerName: true,
        suggestedHourlyRate: true,
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
    machineModelId?: string;
    name?: string;
    description?: string;
    type: "YELLOW_LINE" | "WHITE_LINE";
    manufacturer: string;
    model: string;
    version?: string;
    loadCapacity?: string;
    loadCapacityUnitCode?: string;
    meterType: "HOUR_METER" | "ODOMETER";
    loadVolumeM3?: string;
    maxSupportedWeightT?: string;
    identifiers: {
      kind: "PLATE" | "COMPANY_TAG";
      value: string;
      normalizedValue: string;
    }[];
    initialMeterReading: string;
    ownershipKind?: "OWNED" | "RENTED";
    externalOwnerName?: string;
    suggestedHourlyRate?: string;
  },
): Promise<MachineRecord> {
  try {
    const machineModel = input.machineModelId
      ? await context.prisma.machineModel.findFirst({
          where: {
            id: input.machineModelId,
            corporationId: input.corporationId,
            companyId: input.companyId,
            isActive: true,
          },
          select: { id: true },
        })
      : await createLegacyMachineModel(context, input);
    if (!machineModel) throw notFoundError();
    const machine = await context.prisma.machine.create({
      data: {
        corporationId: input.corporationId,
        machineModelId: machineModel.id,
        name:
          input.name ??
          input.identifiers[0]?.value ??
          "Unidade sem identificação",
        description: input.description,
        type: input.type,
        manufacturer: input.manufacturer,
        model: input.model,
        version: input.version,
        meterType: input.meterType,
        loadVolumeM3: input.loadVolumeM3,
        maxSupportedWeightT: input.maxSupportedWeightT,
      },
      select: { id: true },
    });
    if (
      input.type === "WHITE_LINE" &&
      input.loadCapacity &&
      input.loadCapacityUnitCode
    )
      await context.prisma.machineTransportSpecification.create({
        data: {
          machineId: machine.id,
          nominalCapacity: input.loadCapacity,
          effectiveCapacity: input.loadCapacity,
          capacityUnitCode: input.loadCapacityUnitCode,
          maxSupportedWeightT: input.maxSupportedWeightT,
        },
      });
    await context.prisma.machineOwnershipPeriod.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        machineId: machine.id,
        ownershipKind: input.ownershipKind ?? "OWNED",
        externalOwnerName: input.externalOwnerName,
        suggestedHourlyRate: input.suggestedHourlyRate,
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

async function createLegacyMachineModel(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    description?: string;
    type: "YELLOW_LINE" | "WHITE_LINE";
    manufacturer: string;
    model: string;
    version?: string;
    loadCapacity?: string;
    loadCapacityUnitCode?:
      | "M3_LOOSE"
      | "M3_COMPACTED"
      | "LITER"
      | "CUBIC_YARD";
    loadVolumeM3?: string;
    maxSupportedWeightT?: string;
  },
) {
  const requiredJobRole = await context.prisma.jobRole.upsert({
    where: {
      corporationId_companyId_normalizedName: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        normalizedName: "qualquer um",
      },
    },
    create: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      name: "Qualquer um",
      normalizedName: "qualquer um",
    },
    update: { isActive: true },
    select: { id: true },
  });
  return context.prisma.machineModel.create({
    data: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      description: input.description,
      type: input.type,
      manufacturer: input.manufacturer,
      model: input.model,
      version: input.version,
      normalizedManufacturer: input.manufacturer
        .trim()
        .toLocaleLowerCase("pt-BR"),
      normalizedModel: input.model.trim().toLocaleLowerCase("pt-BR"),
      normalizedVersion: input.version?.trim().toLocaleLowerCase("pt-BR") ?? "",
      loadCapacity: input.loadCapacity,
      loadCapacityUnitCode: input.loadCapacityUnitCode,
      loadVolumeM3: input.loadVolumeM3,
      maxSupportedWeightT: input.maxSupportedWeightT,
      requiresOperator: true,
      requiredJobRoleId: requiredJobRole.id,
    },
    select: { id: true },
  });
}

function machineModelSelect(companyId: string) {
  return {
    id: true,
    corporationId: true,
    companyId: true,
    description: true,
    type: true,
    manufacturer: true,
    model: true,
    version: true,
    loadCapacity: true,
    loadCapacityUnitCode: true,
    loadVolumeM3: true,
    maxSupportedWeightT: true,
    requiresOperator: true,
    requiredJobRoleId: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    requiredJobRole: { select: { id: true, name: true } },
    machines: {
      where: { isActive: true },
      orderBy: { name: "asc" as const },
      select: machineSelect(companyId),
    },
  };
}

export async function createMachineModelHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    actorUserId: string;
    description?: string;
    type: "YELLOW_LINE" | "WHITE_LINE";
    manufacturer: string;
    model: string;
    version?: string;
    loadCapacity?: string;
    loadCapacityUnitCode?: string;
    loadVolumeM3?: string;
    maxSupportedWeightT?: string;
    requiresOperator: boolean;
    requiredJobRoleId: string | null;
  },
) {
  let machineModel: { id: string };
  try {
    machineModel = await context.prisma.machineModel.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        description: input.description,
        type: input.type,
        manufacturer: input.manufacturer,
        model: input.model,
        version: input.version,
        normalizedManufacturer: input.manufacturer
          .trim()
          .toLocaleLowerCase("pt-BR"),
        normalizedModel: input.model.trim().toLocaleLowerCase("pt-BR"),
        normalizedVersion:
          input.version?.trim().toLocaleLowerCase("pt-BR") ?? "",
        loadCapacity: input.loadCapacity,
        loadCapacityUnitCode: input.loadCapacityUnitCode,
        loadVolumeM3: input.loadVolumeM3,
        maxSupportedWeightT: input.maxSupportedWeightT,
        requiresOperator: input.requiresOperator,
        requiredJobRoleId: input.requiredJobRoleId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueError(error))
      throw new AppError({
        code: "MACHINE_MODEL_ALREADY_EXISTS",
        message:
          "A Machine Model with this manufacturer, model and version already exists",
        statusCode: 409,
      });
    throw error;
  }
  return findMachineModelDetailHandler(context, {
    corporationId: input.corporationId,
    companyId: input.companyId,
    machineModelId: machineModel.id,
  });
}

export async function listMachineModelsHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    search?: string;
    type?: "YELLOW_LINE" | "WHITE_LINE";
    limit: number;
    boundary: CursorBoundary | null;
    sortBy: "model" | "createdAt";
    sortDirection: SortDirection;
  },
) {
  const boundaryClause = input.boundary
    ? input.sortBy === "createdAt"
      ? input.sortDirection === "asc"
        ? {
            OR: [
              { createdAt: { gt: new Date(String(input.boundary.value)) } },
              {
                createdAt: new Date(String(input.boundary.value)),
                id: { gt: input.boundary.id },
              },
            ],
          }
        : {
            OR: [
              { createdAt: { lt: new Date(String(input.boundary.value)) } },
              {
                createdAt: new Date(String(input.boundary.value)),
                id: { lt: input.boundary.id },
              },
            ],
          }
      : input.sortDirection === "asc"
        ? {
            OR: [
              { model: { gt: String(input.boundary.value) } },
              {
                model: String(input.boundary.value),
                id: { gt: input.boundary.id },
              },
            ],
          }
        : {
            OR: [
              { model: { lt: String(input.boundary.value) } },
              {
                model: String(input.boundary.value),
                id: { lt: input.boundary.id },
              },
            ],
          }
    : {};
  return context.prisma.machineModel.findMany({
    where: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      isActive: true,
      ...(input.type ? { type: input.type } : {}),
      ...(input.search
        ? {
            OR: [
              { manufacturer: { contains: input.search, mode: "insensitive" } },
              { model: { contains: input.search, mode: "insensitive" } },
              {
                machines: {
                  some: {
                    name: { contains: input.search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
      ...boundaryClause,
    },
    orderBy:
      input.sortBy === "model"
        ? [{ model: input.sortDirection }, { id: input.sortDirection }]
        : [{ createdAt: input.sortDirection }, { id: input.sortDirection }],
    take: input.limit + 1,
    select: machineModelSelect(input.companyId),
  });
}

export async function findMachineModelDetailHandler(
  context: HandlerContext,
  input: { corporationId: string; companyId: string; machineModelId: string },
) {
  const record = await context.prisma.machineModel.findFirst({
    where: {
      id: input.machineModelId,
      corporationId: input.corporationId,
      companyId: input.companyId,
      isActive: true,
    },
    select: machineModelSelect(input.companyId),
  });
  if (!record) throw notFoundError();
  return record;
}

export async function addMachineModelUnitsHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    actorUserId: string;
    machineModelId: string;
    unit: {
      name?: string;
      meterType: "HOUR_METER" | "ODOMETER";
      ownershipKind: "OWNED" | "RENTED";
      externalOwnerName?: string;
      suggestedHourlyRate?: string;
      identifiers: {
        kind: "PLATE" | "COMPANY_TAG";
        value: string;
        normalizedValue: string;
      }[];
      initialMeterReading: string;
    };
  },
) {
  const model = await findMachineModelDetailHandler(context, input);
  return createMachineHandler(context, {
    ...input,
    name: input.unit.name,
    description: model.description ?? undefined,
    type: model.type,
    manufacturer: model.manufacturer,
    model: model.model,
    version: model.version ?? undefined,
    meterType: input.unit.meterType,
    loadCapacity: model.loadCapacity?.toFixed(3) ?? undefined,
    loadCapacityUnitCode: model.loadCapacityUnitCode ?? undefined,
    loadVolumeM3: model.loadVolumeM3?.toFixed(3) ?? undefined,
    maxSupportedWeightT: model.maxSupportedWeightT?.toFixed(3) ?? undefined,
    ownershipKind: input.unit.ownershipKind,
    externalOwnerName: input.unit.externalOwnerName,
    suggestedHourlyRate: input.unit.suggestedHourlyRate,
    identifiers: input.unit.identifiers,
    initialMeterReading: input.unit.initialMeterReading,
  });
}

export async function allocateNewMachineUnitHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    actorUserId: string;
    machine: MachineRecord;
    allocation: {
      projectId: string;
      confirmedHourlyRate?: string;
      monthlyHours?: number;
      operatorAssignments: {
        shift: "day" | "night";
        operatorEmploymentId: string;
      }[];
    };
  },
) {
  const project = await context.prisma.project.findFirst({
    where: {
      id: input.allocation.projectId,
      corporationId: input.corporationId,
      companyId: input.companyId,
      status: { in: ["PLANNED", "ACTIVE"] },
    },
    select: { id: true },
  });
  if (!project)
    throw new AppError({
      code: "NOT_FOUND",
      message: "Eligible Project not found",
      statusCode: 404,
    });
  const latestReading = input.machine.meterReadings[0];
  if (!latestReading)
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Machine requires a confirmed meter reading",
      statusCode: 422,
    });
  const ownership = input.machine.ownershipPeriods[0];
  if (
    ownership?.ownershipKind === "RENTED" &&
    (!input.allocation.confirmedHourlyRate || !input.allocation.monthlyHours)
  )
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "Rented Machine allocation requires confirmed rate and monthly hours",
      statusCode: 422,
    });
  if (
    ownership?.ownershipKind === "OWNED" &&
    (input.allocation.confirmedHourlyRate || input.allocation.monthlyHours)
  )
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Owned Machine allocation cannot include rental terms",
      statusCode: 422,
    });
  if (
    input.machine.machineModel.requiresOperator &&
    !input.allocation.operatorAssignments.length
  )
    throw new AppError({
      code: "MACHINE_OPERATOR_REQUIRED",
      message: "Machine requires an operator",
      statusCode: 409,
    });
  if (
    !input.machine.machineModel.requiresOperator &&
    input.allocation.operatorAssignments.length
  )
    throw new AppError({
      code: "MACHINE_OPERATOR_NOT_ALLOWED",
      message: "Machine does not accept operators",
      statusCode: 409,
    });
  for (const assignment of input.allocation.operatorAssignments) {
    const [employment, occupiedAssignment] = await Promise.all([
      context.prisma.projectEmployeeAllocation.findFirst({
        where: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          projectId: project.id,
          employmentId: assignment.operatorEmploymentId,
          shift: assignment.shift === "day" ? "DAY" : "NIGHT",
          effectiveTo: null,
        },
        select: { id: true, confirmedJobRoleId: true },
      }),
      context.prisma.projectMachineShiftAssignment.findFirst({
        where: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          projectId: project.id,
          shift: assignment.shift === "day" ? "DAY" : "NIGHT",
          operatorEmploymentId: assignment.operatorEmploymentId,
          effectiveTo: null,
        },
        select: { id: true },
      }),
    ]);
    const acceptsAnyJobRole =
      input.machine.machineModel.requiredJobRole !== null &&
      normalizedJobRoleName(input.machine.machineModel.requiredJobRole.name) ===
        "qualquer um";
    if (
      !employment ||
      occupiedAssignment ||
      (!acceptsAnyJobRole &&
        input.machine.machineModel.requiredJobRoleId &&
        employment.confirmedJobRoleId !==
          input.machine.machineModel.requiredJobRoleId)
    )
      throw new AppError({
        code: "MACHINE_OPERATOR_INVALID",
        message: "Machine operator is not compatible with this Project shift",
        statusCode: 409,
      });
  }
  const now = new Date();
  const row = await context.prisma.projectMachineAllocation.create({
    data: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      projectId: project.id,
      machineId: input.machine.id,
      startMeterReadingId: latestReading.id,
      operatorEmploymentId:
        input.allocation.operatorAssignments[0]?.operatorEmploymentId ?? null,
      lessorNameSnapshot: ownership?.externalOwnerName,
      hourlyRateSnapshot: input.allocation.confirmedHourlyRate,
      monthlyHours: input.allocation.monthlyHours,
      effectiveFrom: now,
      createdByUserId: input.actorUserId,
    },
    select: { id: true },
  });
  if (input.allocation.operatorAssignments.length)
    await context.prisma.projectMachineShiftAssignment.createMany({
      data: input.allocation.operatorAssignments.map((assignment) => ({
        corporationId: input.corporationId,
        companyId: input.companyId,
        projectId: project.id,
        projectMachineAllocationId: row.id,
        machineId: input.machine.id,
        shift: assignment.shift === "day" ? "DAY" : "NIGHT",
        operatorEmploymentId: assignment.operatorEmploymentId,
        effectiveFrom: now,
        createdByUserId: input.actorUserId,
      })),
    });
  await context.prisma.machineMeterReadingReference.create({
    data: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machine.id,
      readingId: latestReading.id,
      sourceType: "PROJECT_ALLOCATION",
      sourceId: row.id,
    },
  });
}

export async function updateMachineModelHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    machineModelId: string;
    description?: string;
    type: "YELLOW_LINE" | "WHITE_LINE";
    manufacturer: string;
    model: string;
    version?: string;
    loadCapacity?: string;
    loadCapacityUnitCode?: string;
    loadVolumeM3?: string;
    maxSupportedWeightT?: string;
    requiresOperator: boolean;
    requiredJobRoleId: string | null;
  },
) {
  const current = await findMachineModelDetailHandler(context, input);
  const operatorRuleChanged =
    current.requiresOperator !== input.requiresOperator ||
    current.requiredJobRoleId !== input.requiredJobRoleId;
  if (operatorRuleChanged) {
    const assigned = await context.prisma.projectMachineAllocation.findFirst({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        machineId: { in: current.machines.map((machine) => machine.id) },
        effectiveTo: null,
      },
      select: { id: true },
    });
    if (assigned)
      throw new AppError({
        code: "CONFLICT",
        message:
          "Machine model operator rule cannot change while units are mobilized",
        statusCode: 409,
      });
  }
  await context.prisma.machineModel.update({
    where: { id: input.machineModelId },
    data: {
      description: input.description,
      type: input.type,
      manufacturer: input.manufacturer,
      model: input.model,
      version: input.version,
      normalizedManufacturer: input.manufacturer
        .trim()
        .toLocaleLowerCase("pt-BR"),
      normalizedModel: input.model.trim().toLocaleLowerCase("pt-BR"),
      normalizedVersion: input.version?.trim().toLocaleLowerCase("pt-BR") ?? "",
      loadCapacity: input.loadCapacity,
      loadCapacityUnitCode: input.loadCapacityUnitCode,
      loadVolumeM3: input.loadVolumeM3,
      maxSupportedWeightT: input.maxSupportedWeightT,
      requiresOperator: input.requiresOperator,
      requiredJobRoleId: input.requiredJobRoleId,
    },
  });
  await context.prisma.machine.updateMany({
    where: { machineModelId: input.machineModelId },
    data: {
      description: input.description,
      type: input.type,
      manufacturer: input.manufacturer,
      model: input.model,
      version: input.version,
      loadVolumeM3: input.loadVolumeM3,
      maxSupportedWeightT: input.maxSupportedWeightT,
    },
  });
  const machines = await context.prisma.machine.findMany({
    where: { machineModelId: input.machineModelId, isActive: true },
    select: { id: true },
  });
  if (input.loadCapacity && input.loadCapacityUnitCode) {
    for (const machine of machines)
      await context.prisma.machineTransportSpecification.upsert({
        where: { machineId: machine.id },
        create: {
          machineId: machine.id,
          nominalCapacity: input.loadCapacity,
          effectiveCapacity: input.loadCapacity,
          capacityUnitCode: input.loadCapacityUnitCode,
          maxSupportedWeightT: input.maxSupportedWeightT,
        },
        update: {
          nominalCapacity: input.loadCapacity,
          effectiveCapacity: input.loadCapacity,
          capacityUnitCode: input.loadCapacityUnitCode,
          maxSupportedWeightT: input.maxSupportedWeightT,
        },
      });
  } else {
    await context.prisma.machineTransportSpecification.deleteMany({
      where: { machineId: { in: machines.map((machine) => machine.id) } },
    });
  }
  return findMachineModelDetailHandler(context, input);
}

export async function findDeletedMachineMatchesHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    machineModelId: string;
    identifiers: { kind: "PLATE" | "COMPANY_TAG"; normalizedValue: string }[];
  },
) {
  if (!input.identifiers.length) return [];
  return context.prisma.machine.findMany({
    where: {
      corporationId: input.corporationId,
      machineModelId: input.machineModelId,
      isActive: false,
      identifiers: {
        some: {
          companyId: input.companyId,
          OR: input.identifiers.map((identifier) => ({
            kind: identifier.kind,
            normalizedValue: identifier.normalizedValue,
          })),
        },
      },
    },
    select: {
      id: true,
      deletedAt: true,
      identifiers: {
        where: { companyId: input.companyId },
        select: { kind: true, value: true, normalizedValue: true },
      },
    },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreMachineHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    actorUserId: string;
    machineModelId: string;
    machineId: string;
    name?: string;
    identifiers: {
      kind: "PLATE" | "COMPANY_TAG";
      value: string;
      normalizedValue: string;
    }[];
    initialMeterReading: string;
    ownershipKind: "OWNED" | "RENTED";
    externalOwnerName?: string;
    suggestedHourlyRate?: string;
  },
) {
  const machine = await context.prisma.machine.findFirst({
    where: {
      id: input.machineId,
      corporationId: input.corporationId,
      machineModelId: input.machineModelId,
      isActive: false,
    },
    select: { id: true },
  });
  if (!machine) throw notFoundError();
  const latest = await latestMachineReading(context, input);
  const decimal = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  };
  if (
    latest &&
    decimal(String(latest.value)) > decimal(input.initialMeterReading)
  )
    throw readingDecreaseError();
  const now = new Date();
  await context.prisma.machine.update({
    where: {
      corporationId_id: {
        corporationId: input.corporationId,
        id: input.machineId,
      },
    },
    data: {
      isActive: true,
      deletedAt: null,
      deletedByUserId: null,
      name:
        input.name ??
        input.identifiers[0]?.value ??
        "Unidade sem identificação",
    },
  });
  await context.prisma.machineOwnershipPeriod.create({
    data: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      ownershipKind: input.ownershipKind,
      externalOwnerName: input.externalOwnerName,
      suggestedHourlyRate: input.suggestedHourlyRate,
      effectiveFrom: now,
    },
  });
  await context.prisma.machineIdentifier.createMany({
    data: input.identifiers.map((identifier) => ({
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      kind: identifier.kind,
      value: identifier.value,
      normalizedValue: identifier.normalizedValue,
    })),
  });
  await context.prisma.machineMeterReading.create({
    data: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      readingSequence: (latest?.readingSequence ?? 0) + 1,
      value: input.initialMeterReading,
      purpose: "RESTORATION",
      actorUserId: input.actorUserId,
      recordedAt: now,
    },
  });
  return findMachineDetailHandler(context, input);
}

export async function softDeleteMachineHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    actorUserId: string;
    machineId: string;
  },
) {
  const machine = await context.prisma.machine.findFirst({
    where: {
      id: input.machineId,
      corporationId: input.corporationId,
      isActive: true,
    },
    select: {
      id: true,
      ownershipPeriods: {
        where: { companyId: input.companyId, effectiveTo: null },
        select: { id: true, ownershipKind: true },
        take: 1,
      },
    },
  });
  if (!machine) throw notFoundError();
  const allocation = await context.prisma.projectMachineAllocation.findFirst({
    where: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      effectiveTo: null,
    },
    select: { id: true },
  });
  if (allocation)
    throw new AppError({
      code: "MACHINE_DELETE_BLOCKED",
      message: "Machine has an open allocation",
      statusCode: 409,
    });
  const ownership = machine.ownershipPeriods[0] ?? null;
  if (
    ownership?.ownershipKind === "RENTED" ||
    ownership?.ownershipKind === "THIRD_PARTY"
  )
    throw new AppError({
      code: "MACHINE_RENTAL_ACTIVE",
      message: "Rented Machine must be without rental before deletion",
      statusCode: 409,
    });
  const now = new Date();
  if (ownership)
    await context.prisma.machineOwnershipPeriod.update({
      where: { id: ownership.id },
      data: { effectiveTo: now },
    });
  await context.prisma.machineIdentifier.updateMany({
    where: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      machineId: input.machineId,
      releasedAt: null,
    },
    data: { releasedAt: now },
  });
  await context.prisma.machine.update({
    where: {
      corporationId_id: {
        corporationId: input.corporationId,
        id: input.machineId,
      },
    },
    data: {
      isActive: false,
      deletedAt: now,
      deletedByUserId: input.actorUserId,
    },
  });
  return { id: input.machineId, deletedAt: now.toISOString() };
}

export async function findActiveJobRoleHandler(
  context: HandlerContext,
  input: { corporationId: string; companyId: string; jobRoleId: string },
) {
  return context.prisma.jobRole.findFirst({
    where: {
      id: input.jobRoleId,
      corporationId: input.corporationId,
      companyId: input.companyId,
      isActive: true,
    },
    select: { id: true },
  });
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

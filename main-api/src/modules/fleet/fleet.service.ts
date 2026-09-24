import {
  buildCursorPage,
  parseBoundCursor,
} from "../../lib/utils/cursor-pagination";
import { AppError, isAppError } from "../../lib/utils/appError";
import type { HandlerContext } from "../../lib/utils/handler.dto";
import { loadCapacityInCubicMeters } from "../../lib/utils/load-capacity";
import type {
  AppendMachineMeterReadingInput,
  CorrectMachineMeterReadingInput,
  CreateMachineInput,
  CreateMachineModelInput,
  AddMachineModelUnitsInput,
  AddMachineModelUnitsBatchInput,
  LoadCapacityUnitCode,
  ListMachineModelsQuery,
  AllocateMachineInput,
  ListMachinesQuery,
  UpdateMachineLoadSpecificationInput,
} from "./fleet.dto";
import {
  appendMachineMeterReadingHandler,
  correctMachineMeterReadingHandler,
  createMachineHandler,
  createMachineModelHandler,
  addMachineModelUnitsHandler,
  allocateNewMachineUnitHandler,
  findMachineModelDetailHandler,
  findActiveJobRoleHandler,
  listMachineModelsHandler,
  updateMachineModelHandler,
  findMachineDetailHandler,
  findAllocatedMachineIdsHandler,
  allocateMachineHandler,
  listMachinesHandler,
  updateMachineLoadSpecificationHandler,
  findDeletedMachineMatchesHandler,
  restoreMachineHandler,
  softDeleteMachineHandler,
  type MachineRecord,
} from "./handlers/fleet.handler";
import {
  MvpMachineOperationalStatusPort,
  type MachineOperationalStatusPort,
} from "./machine-operational-status.port";

interface AuthenticatedCompanyScope {
  corporationId: string;
  companyId: string;
  actorUserId: string;
}

function normalizeIdentifier(value: string) {
  return value.replace(/[^A-Za-z0-9]/gu, "").toUpperCase();
}

function normalizeDecimal(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function normalizeSpecificationDecimal(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(3, "0").slice(0, 3)}`;
}

function canonicalLoadSpecification(input: {
  loadCapacity?: string;
  loadCapacityUnitCode?: LoadCapacityUnitCode;
  loadVolumeM3?: string;
}) {
  const capacity = input.loadCapacity ?? input.loadVolumeM3;
  const unit =
    input.loadCapacityUnitCode ?? (input.loadVolumeM3 ? "M3_LOOSE" : undefined);
  if (!capacity || !unit)
    return {
      loadCapacity: undefined,
      loadCapacityUnitCode: undefined,
      loadVolumeM3: undefined,
    };
  const normalizedCapacity = normalizeSpecificationDecimal(capacity);
  return {
    loadCapacity: normalizedCapacity,
    loadCapacityUnitCode: unit,
    loadVolumeM3: loadCapacityInCubicMeters(normalizedCapacity, unit),
  };
}

function loadSpecificationNotApplicable(): never {
  throw new AppError({
    code: "MACHINE_LOAD_SPEC_NOT_APPLICABLE",
    message: "Load specification is available only for white-line machines",
    statusCode: 422,
  });
}

function decimalToCents(value: string): bigint {
  const [whole, fraction = ""] = normalizeDecimal(value).split(".");
  return BigInt(whole) * 100n + BigInt(fraction);
}

function normalizedQueryForCursor(query: ListMachinesQuery) {
  return {
    availability: query.availability ?? null,
    search: query.search?.toLocaleLowerCase("pt-BR") ?? null,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
    type: query.type ?? null,
  };
}

function scopeForCursor(scope: AuthenticatedCompanyScope) {
  return {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
  };
}

function currentIdentifier(
  record: MachineRecord,
  kind: "PLATE" | "COMPANY_TAG",
) {
  return (
    record.identifiers.find((identifier) => identifier.kind === kind) ?? null
  );
}

function latestReading(record: MachineRecord) {
  const reading = record.meterReadings[0] ?? null;
  if (!reading) return null;
  return {
    id: reading.id,
    value: normalizeDecimal(String(reading.value)),
    purpose: reading.purpose,
    recordedAt: reading.recordedAt.toISOString(),
  };
}

function ownershipDto(record: MachineRecord) {
  const ownership = record.ownershipPeriods[0] ?? null;
  return ownership
    ? {
        companyId: ownership.companyId,
        kind: ownership.ownershipKind,
        lessorName: ownership.externalOwnerName,
        suggestedHourlyRate: ownership.suggestedHourlyRate?.toFixed(2) ?? null,
        effectiveFrom: ownership.effectiveFrom.toISOString(),
        effectiveTo: ownership.effectiveTo?.toISOString() ?? null,
      }
    : null;
}

function availabilityDto(record: MachineRecord, hasOpenAllocation = false) {
  const ownership = record.ownershipPeriods[0] ?? null;
  return {
    state:
      !record.isActive || hasOpenAllocation
        ? ("unavailable" as const)
        : ownership
          ? ("available" as const)
          : ("without_rental" as const),
    hasOpenAllocation,
  };
}

function toMachineDto(
  record: MachineRecord,
  allocatedMachineIds = new Set<string>(),
) {
  const plate = currentIdentifier(record, "PLATE");
  const companyTag = currentIdentifier(record, "COMPANY_TAG");
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    type: record.type,
    manufacturer: record.manufacturer,
    model: record.model,
    version: record.version,
    loadCapacity:
      record.transportSpecification?.nominalCapacity.toFixed(3) ?? null,
    loadCapacityUnitCode:
      record.transportSpecification?.capacityUnitCode ?? null,
    meterType: record.meterType,
    loadVolumeM3: record.loadVolumeM3?.toFixed(3) ?? null,
    maxSupportedWeightT: record.maxSupportedWeightT?.toFixed(3) ?? null,
    machineModel: {
      id: record.machineModel.id,
      requiresOperator: record.machineModel.requiresOperator,
      requiredJobRole: record.machineModel.requiredJobRole,
    },
    identifiers: {
      plate: plate
        ? { value: plate.value, normalizedValue: plate.normalizedValue }
        : null,
      companyTag: companyTag
        ? {
            value: companyTag.value,
            normalizedValue: companyTag.normalizedValue,
          }
        : null,
    },
    latestMeterReading: latestReading(record),
    availability: availabilityDto(record, allocatedMachineIds.has(record.id)),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toMachineModelDto(
  record: Awaited<ReturnType<typeof findMachineModelDetailHandler>>,
) {
  return {
    id: record.id,
    description: record.description,
    type: record.type,
    manufacturer: record.manufacturer,
    model: record.model,
    version: record.version,
    loadCapacity: record.loadCapacity?.toFixed(3) ?? null,
    loadCapacityUnitCode: record.loadCapacityUnitCode,
    loadVolumeM3: record.loadVolumeM3?.toFixed(3) ?? null,
    maxSupportedWeightT: record.maxSupportedWeightT?.toFixed(3) ?? null,
    requiresOperator: record.requiresOperator,
    requiredJobRole: record.requiredJobRole,
    unitCount: record.machines.length,
    units: record.machines.map((machine) => toMachineDto(machine)),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toMachineDetailDto(record: MachineRecord) {
  return {
    ...toMachineDto(record),
    ownership: ownershipDto(record),
  };
}

function identifiersFromInput(input: CreateMachineInput) {
  const identifiers = [
    input.plate
      ? {
          kind: "PLATE" as const,
          value: input.plate,
          normalizedValue: normalizeIdentifier(input.plate),
        }
      : null,
    input.companyTag
      ? {
          kind: "COMPANY_TAG" as const,
          value: input.companyTag,
          normalizedValue: normalizeIdentifier(input.companyTag),
        }
      : null,
  ].filter(
    (
      identifier,
    ): identifier is {
      kind: "PLATE" | "COMPANY_TAG";
      value: string;
      normalizedValue: string;
    } => identifier !== null,
  );

  if (
    identifiers.some((identifier) => identifier.normalizedValue.length === 0)
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Machine identifier must include at least one letter or number",
      statusCode: 400,
    });
  }
  return identifiers;
}

function identifiersFromUnit(input: { plate?: string; companyTag?: string }) {
  return identifiersFromInput({
    plate: input.plate,
    companyTag: input.companyTag,
    name: "unit",
    type: "YELLOW_LINE",
    manufacturer: "unit",
    model: "unit",
    meterType: "HOUR_METER",
    description: undefined,
    loadVolumeM3: undefined,
    maxSupportedWeightT: undefined,
    initialMeterReading: "0",
  });
}

export class FleetService {
  constructor(
    private readonly context: HandlerContext,
    private readonly operationalStatus: MachineOperationalStatusPort = new MvpMachineOperationalStatusPort(),
  ) {}

  async create(scope: AuthenticatedCompanyScope, input: CreateMachineInput) {
    if (
      input.type !== "WHITE_LINE" &&
      (input.loadVolumeM3 || input.maxSupportedWeightT)
    )
      loadSpecificationNotApplicable();
    const loadSpecification = canonicalLoadSpecification(input);
    return this.context.transaction(async (transactionContext) => {
      const record = await createMachineHandler(transactionContext, {
        ...scope,
        identifiers: identifiersFromInput(input),
        name: input.name,
        description: input.description,
        type: input.type,
        manufacturer: input.manufacturer,
        model: input.model,
        meterType: input.meterType,
        ...loadSpecification,
        maxSupportedWeightT: input.maxSupportedWeightT
          ? normalizeSpecificationDecimal(input.maxSupportedWeightT)
          : undefined,
        initialMeterReading: normalizeDecimal(input.initialMeterReading),
      });
      return toMachineDetailDto(record);
    });
  }

  private async validateRequiredJobRole(
    scope: AuthenticatedCompanyScope,
    input: { requiresOperator: boolean; requiredJobRoleId?: string | null },
  ) {
    if (!input.requiresOperator) return null;
    const role = await findActiveJobRoleHandler(this.context, {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      jobRoleId: input.requiredJobRoleId!,
    });
    if (!role)
      throw new AppError({
        code: "MACHINE_MODEL_JOB_ROLE_INVALID",
        message:
          "Machine model operator job role is not available in this Company",
        statusCode: 422,
      });
    return role.id;
  }

  async createModel(
    scope: AuthenticatedCompanyScope,
    input: CreateMachineModelInput,
  ) {
    const requiredJobRoleId = await this.validateRequiredJobRole(scope, input);
    const loadSpecification = canonicalLoadSpecification(input);
    return this.context.transaction(async (transactionContext) => {
      const record = await createMachineModelHandler(transactionContext, {
        ...scope,
        ...input,
        requiredJobRoleId,
        ...loadSpecification,
        maxSupportedWeightT: input.maxSupportedWeightT
          ? normalizeSpecificationDecimal(input.maxSupportedWeightT)
          : undefined,
      });
      return toMachineModelDto(record);
    });
  }

  async listModels(
    scope: AuthenticatedCompanyScope,
    query: ListMachineModelsQuery,
  ) {
    const normalizedQuery = {
      search: query.search?.toLocaleLowerCase("pt-BR") ?? null,
      type: query.type ?? null,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    };
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      query: normalizedQuery,
      resource: "machine-models",
      scope: scopeForCursor(scope),
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const records = await listMachineModelsHandler(this.context, {
      ...scope,
      ...query,
      boundary,
    });
    const page = buildCursorPage({
      items: records,
      limit: query.limit,
      query: normalizedQuery,
      resource: "machine-models",
      scope: scopeForCursor(scope),
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (item) => ({
        id: item.id,
        value:
          query.sortBy === "createdAt"
            ? item.createdAt.toISOString()
            : item.model,
      }),
    });
    return {
      data: page.data.map((record) => toMachineModelDto(record)),
      pageInfo: page.pageInfo,
    };
  }

  async modelDetail(scope: AuthenticatedCompanyScope, machineModelId: string) {
    return toMachineModelDto(
      await findMachineModelDetailHandler(this.context, {
        ...scope,
        machineModelId,
      }),
    );
  }

  async addModelUnits(
    scope: AuthenticatedCompanyScope,
    machineModelId: string,
    input: AddMachineModelUnitsInput,
  ) {
    return this.context.transaction(async (transactionContext) => {
      const identifiers = identifiersFromUnit(input);
      const matches = await findDeletedMachineMatchesHandler(
        transactionContext,
        {
          ...scope,
          machineModelId,
          identifiers,
        },
      );
      if (matches.length && !input.deletedMatchResolution)
        throw new AppError({
          code: "MACHINE_DELETED_IDENTIFIER_MATCH",
          message: "A deleted Machine has matching identifiers",
          statusCode: 409,
          data: {
            matches: matches.map((match) => ({
              machineId: match.id,
              deletedAt: match.deletedAt?.toISOString() ?? null,
              matchedIdentifiers: match.identifiers
                .filter((identifier) =>
                  identifiers.some(
                    (submitted) =>
                      submitted.kind === identifier.kind &&
                      submitted.normalizedValue === identifier.normalizedValue,
                  ),
                )
                .map((identifier) => ({
                  kind: identifier.kind,
                  value: identifier.value,
                })),
            })),
          },
        });
      const unit =
        input.deletedMatchResolution?.action === "RESTORE"
          ? await restoreMachineHandler(transactionContext, {
              ...scope,
              machineModelId,
              machineId: input.deletedMatchResolution.machineId!,
              name: input.name,
              identifiers,
              initialMeterReading: normalizeDecimal(input.initialMeterReading),
              ownershipKind: input.ownership.kind,
              externalOwnerName:
                input.ownership.kind === "RENTED"
                  ? input.ownership.lessorName
                  : undefined,
              suggestedHourlyRate:
                input.ownership.kind === "RENTED"
                  ? normalizeDecimal(input.ownership.suggestedHourlyRate)
                  : undefined,
            })
          : await addMachineModelUnitsHandler(transactionContext, {
              ...scope,
              machineModelId,
              unit: {
                name: input.name,
                meterType: input.meterType,
                ownershipKind: input.ownership.kind,
                externalOwnerName:
                  input.ownership.kind === "RENTED"
                    ? input.ownership.lessorName
                    : undefined,
                suggestedHourlyRate:
                  input.ownership.kind === "RENTED"
                    ? input.ownership.suggestedHourlyRate
                    : undefined,
                identifiers,
                initialMeterReading: normalizeDecimal(
                  input.initialMeterReading,
                ),
              },
            });
      if (input.allocation)
        await allocateNewMachineUnitHandler(transactionContext, {
          ...scope,
          machine: unit,
          allocation: input.allocation,
        });
      return toMachineModelDto(
        await findMachineModelDetailHandler(transactionContext, {
          ...scope,
          machineModelId,
        }),
      );
    });
  }

  async addModelUnitsBatch(
    scope: AuthenticatedCompanyScope,
    machineModelId: string,
    input: AddMachineModelUnitsBatchInput,
  ) {
    const created: Array<{ index: number; machineId: string | null }> = [];
    const rejected: Array<{ index: number; code: string; message: string }> =
      [];

    for (const [index, unit] of input.units.entries()) {
      try {
        const model = await this.addModelUnits(scope, machineModelId, unit);
        const plate = unit.plate?.replace(/[^A-Za-z0-9]/gu, "").toUpperCase();
        const companyTag = unit.companyTag
          ?.replace(/[^A-Za-z0-9]/gu, "")
          .toUpperCase();
        const createdUnit = model.units.find(
          (candidate) =>
            (plate && candidate.identifiers.plate?.normalizedValue === plate) ||
            (companyTag &&
              candidate.identifiers.companyTag?.normalizedValue === companyTag),
        );
        created.push({ index, machineId: createdUnit?.id ?? null });
      } catch (error) {
        rejected.push({
          index,
          code: isAppError(error) ? error.code : "INTERNAL_ERROR",
          message: isAppError(error)
            ? error.message
            : "Machine unit could not be created",
        });
      }
    }

    return { created, rejected };
  }

  async softDelete(scope: AuthenticatedCompanyScope, machineId: string) {
    return this.context.transaction(async (transactionContext) => {
      const status = await this.operationalStatus.getStatus({
        ...scope,
        machineId,
      });
      if (status.hasOpenShift || status.hasPendingFinalReading)
        throw new AppError({
          code: "MACHINE_DELETE_BLOCKED",
          message: "Machine has an operational blocker",
          statusCode: 409,
        });
      return softDeleteMachineHandler(transactionContext, {
        ...scope,
        machineId,
      });
    });
  }

  async updateModel(
    scope: AuthenticatedCompanyScope,
    machineModelId: string,
    input: import("./fleet.dto").UpdateMachineModelInput,
  ) {
    const requiredJobRoleId = await this.validateRequiredJobRole(scope, input);
    const loadSpecification = canonicalLoadSpecification(input);
    return this.context.transaction(async (transactionContext) =>
      toMachineModelDto(
        await updateMachineModelHandler(transactionContext, {
          ...scope,
          ...input,
          machineModelId,
          requiredJobRoleId,
          ...loadSpecification,
          maxSupportedWeightT: input.maxSupportedWeightT
            ? normalizeSpecificationDecimal(input.maxSupportedWeightT)
            : undefined,
        }),
      ),
    );
  }

  async list(scope: AuthenticatedCompanyScope, query: ListMachinesQuery) {
    const normalizedQuery = normalizedQueryForCursor(query);
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      query: normalizedQuery,
      resource: "machines",
      scope: scopeForCursor(scope),
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const records = await listMachinesHandler(this.context, {
      ...scope,
      search: query.search,
      type: query.type,
      limit: query.limit,
      boundary,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const page = buildCursorPage({
      items: records,
      limit: query.limit,
      query: normalizedQuery,
      resource: "machines",
      scope: scopeForCursor(scope),
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (item) => ({
        id: item.id,
        value:
          query.sortBy === "createdAt"
            ? item.createdAt.toISOString()
            : item.name,
      }),
    });
    const allocationRows = await findAllocatedMachineIdsHandler(
      this.context,
      scope.corporationId,
      page.data.map((item) => item.id),
    );
    const allocatedMachineIds = new Set(
      allocationRows.map((row) => row.machineId),
    );
    return {
      data: page.data.map((record) =>
        toMachineDto(record, allocatedMachineIds),
      ),
      pageInfo: page.pageInfo,
    };
  }

  async detail(scope: AuthenticatedCompanyScope, machineId: string) {
    const record = await findMachineDetailHandler(this.context, {
      ...scope,
      machineId,
    });
    return toMachineDetailDto(record);
  }

  async updateLoadSpecification(
    scope: AuthenticatedCompanyScope,
    machineId: string,
    input: UpdateMachineLoadSpecificationInput,
  ) {
    const current = await findMachineDetailHandler(this.context, {
      ...scope,
      machineId,
    });
    if (current.type !== "WHITE_LINE") loadSpecificationNotApplicable();
    const record = await updateMachineLoadSpecificationHandler(this.context, {
      ...scope,
      machineId,
      loadVolumeM3: input.loadVolumeM3
        ? normalizeSpecificationDecimal(input.loadVolumeM3)
        : null,
      maxSupportedWeightT: input.maxSupportedWeightT
        ? normalizeSpecificationDecimal(input.maxSupportedWeightT)
        : null,
    });
    return toMachineDetailDto(record);
  }

  async allocate(
    scope: AuthenticatedCompanyScope,
    machineId: string,
    input: AllocateMachineInput,
  ) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        async (tx) => {
          const status = await this.operationalStatus.getStatus({
            ...scope,
            machineId,
          });
          if (status.hasOpenShift || status.hasPendingFinalReading) {
            throw new AppError({
              code: "MACHINE_ALLOCATION_OPERATIONALLY_BLOCKED",
              message: "Machine has an operational blocker",
              statusCode: 409,
            });
          }
          const allocation = await allocateMachineHandler(tx, {
            ...scope,
            machineId,
            projectId: input.projectId,
            operatorEmploymentId: input.operatorEmploymentId,
            effectiveFrom: new Date(),
          });
          return {
            ...allocation,
            effectiveFrom: allocation.effectiveFrom.toISOString(),
          };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async appendReading(
    scope: AuthenticatedCompanyScope,
    machineId: string,
    input: AppendMachineMeterReadingInput,
  ) {
    return runSerializableWithRetry(async () =>
      this.context.transaction(
        async (transactionContext) => {
          const record = await appendMachineMeterReadingHandler(
            transactionContext,
            {
              ...scope,
              machineId,
              value: normalizeDecimal(input.value),
              valueCents: decimalToCents(input.value),
            },
          );
          return toMachineDetailDto(record);
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async correctReading(
    scope: AuthenticatedCompanyScope,
    machineId: string,
    readingId: string,
    input: CorrectMachineMeterReadingInput,
  ) {
    return runSerializableWithRetry(async () =>
      this.context.transaction(
        async (transactionContext) => {
          const record = await correctMachineMeterReadingHandler(
            transactionContext,
            {
              ...scope,
              machineId,
              readingId,
              value: normalizeDecimal(input.value),
              valueCents: decimalToCents(input.value),
              reason: input.reason,
            },
          );
          return toMachineDetailDto(record);
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }
}

async function runSerializableWithRetry<T>(work: () => Promise<T>) {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

import { Prisma } from "../../../db/generated/prisma/client";
import type { HandlerContext } from "../../../lib/utils/handler.dto";
import { AppError } from "../../../lib/utils/appError";
import {
  protectSensitiveDocument,
  toMaskedDocumentDto,
} from "../../../lib/security/sensitive-document";
import {
  buildCursorPage,
  parseBoundCursor,
} from "../../../lib/utils/cursor-pagination";
import { hashProjectCommand } from "../project-canonicalization";
import {
  buildCatalogCategoryStates,
  itemCatalogState,
} from "../../commercial/catalog-classification";
import {
  formatProjectAddress,
  type ProjectCommand,
  type ProjectEmployeeMobilizationCommand,
  type ProjectListQuery,
  type ProjectMachineMobilizationCommand,
  type ProjectMobilizationHistoryQuery,
  type ProjectQuantityBaselineRevisionCommand,
  type ProjectReadinessCommand,
  type ProjectWorkFrontCommand,
  type ProjectWorkFrontMobilizationCommand,
  type ProjectWorkFrontServicesCommand,
} from "../projects.dto";

export type ProjectScope = {
  corporationId: string;
  companyId: string;
  sessionId: string;
  userId: string;
  role: "MASTER_ADMIN";
};

const operation = "project-finalization:v1";
type ProjectLifecycleStatus =
  | "PLANNED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";
type ProjectStatusDto = Lowercase<ProjectLifecycleStatus>;

const resource = (
  kind: string,
  id: string,
  section: string,
  reason = "unavailable",
) => ({ kind, id, section, reason });

type ReadinessBlocker = {
  section:
    | "dates"
    | "metrics"
    | "fronts"
    | "fuel"
    | "items"
    | "equipment"
    | "team"
    | "payments";
  message: string;
};

const serviceUnits = {
  cut: "M3",
  fill: "M3",
  finishing: "M2",
  top_soil: "M3_KM",
  unsuitable_soil_removal: "M3",
  replacement_fill: "M3",
} as const;

const serviceLabels: Record<keyof typeof serviceUnits, string> = {
  cut: "Corte",
  fill: "Aterro",
  finishing: "Acabamento",
  top_soil: "Top Soil",
  unsuitable_soil_removal: "Remoção de solo impróprio",
  replacement_fill: "Aterro de substituição",
};

type EarthworksServiceCode = keyof typeof serviceUnits;

function assertServiceUnits(
  items: Array<{ serviceCode: string; unitCode: string }>,
) {
  for (const item of items) {
    const expected = serviceUnits[item.serviceCode as EarthworksServiceCode];
    if (!expected || item.unitCode !== expected)
      validationError(
        "services",
        "invalid_unit",
        "A unidade informada não corresponde ao serviço de terraplanagem.",
      );
  }
}

function decimalString(value: Prisma.Decimal | number | string, scale: number) {
  if (typeof value === "string")
    return new Prisma.Decimal(value).toFixed(scale);
  if (typeof value === "number")
    return new Prisma.Decimal(value).toFixed(scale);
  return value.toFixed(scale);
}

function civilDateString(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function statusDto(status: ProjectLifecycleStatus): ProjectStatusDto {
  return status.toLowerCase() as ProjectStatusDto;
}

function dbShift(shift: "day" | "night") {
  return shift === "day" ? ("DAY" as const) : ("NIGHT" as const);
}

function shiftDto(shift: "DAY" | "NIGHT") {
  return shift.toLowerCase() as "day" | "night";
}

function projectNotFound(): never {
  throw new AppError({
    code: "NOT_FOUND",
    statusCode: 404,
    message: "Project not found",
  });
}

function projectLifecycleConflict(message: string): never {
  throw new AppError({
    code: "PROJECT_RESOURCE_CONFLICT",
    statusCode: 409,
    message,
    data: { fields: [], resources: [] },
  });
}

function conflict(resources: Array<ReturnType<typeof resource>> = []) {
  return new AppError({
    code: "PROJECT_RESOURCE_CONFLICT",
    statusCode: 409,
    message: "Project resources changed",
    data: { fields: [], resources },
  });
}

function mapEntityType(entityType: "individual" | "legal_entity") {
  return entityType === "individual" ? "INDIVIDUAL" : "LEGAL_ENTITY";
}

async function assertWorkspace(
  context: HandlerContext,
  scope: ProjectScope,
  expectedCompanyId: string,
) {
  const session = await context.prisma.session.findFirst({
    where: {
      id: scope.sessionId,
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      revokedAt: null,
      user: { id: scope.userId, isActive: true, role: "MASTER_ADMIN" },
      company: { id: expectedCompanyId, isActive: true },
    },
  });
  if (!session || expectedCompanyId !== scope.companyId)
    throw new AppError({
      code: "PROJECT_WORKSPACE_CHANGED",
      statusCode: 409,
      message: "Project workspace changed",
      data: { fields: [], resources: [] },
    });
}

async function validateResources(
  context: HandlerContext,
  scope: ProjectScope,
  command: ProjectCommand,
) {
  const existingSupplierIds = command.projectSupplierOffers
    .map((item) => item.supplierId)
    .filter((id): id is string => Boolean(id));
  const uniqueExistingSupplierIds = [...new Set(existingSupplierIds)];
  const existingItemIds = command.projectSupplierOffers
    .map((item) => item.itemId)
    .filter((id): id is string => Boolean(id));
  const uniqueExistingItemIds = [...new Set(existingItemIds)];
  const unitIds = [
    ...command.projectSupplierOffers.map((item) => item.purchaseUnitId),
    ...command.projectSupplierOffers
      .map((item) => item.item?.baseUnitId)
      .filter((id): id is string => Boolean(id)),
  ];
  const sourceOfferIds = command.projectSupplierOffers
    .map((item) => item.sourceOfferId)
    .filter((id): id is string => Boolean(id));
  const jobRoleIds = command.initialEmployeeAllocations
    .map((item) => item.confirmedJobRoleId)
    .filter((id): id is string => Boolean(id));

  const [
    client,
    employments,
    suppliers,
    items,
    units,
    sourceOffers,
    machines,
    jobRoles,
  ] = await Promise.all([
    context.prisma.client.findFirst({
      where: {
        id: command.clientId,
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        removedAt: null,
      },
    }),
    context.prisma.employment.findMany({
      where: {
        id: {
          in: [
            ...new Set([
              command.managerEmploymentId,
              ...command.technicalResponsibilityEmploymentIds,
              ...command.initialEmployeeAllocations.map(
                (item) => item.employmentId,
              ),
            ]),
          ],
        },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        state: "ACTIVE",
        isActive: true,
        periods: { some: { effectiveTo: null } },
      },
      select: {
        id: true,
        personId: true,
        jobRolePeriods: {
          where: { effectiveTo: null },
          select: {
            id: true,
            jobRole: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
    }),
    context.prisma.fuelSupplier.findMany({
      where: {
        id: { in: uniqueExistingSupplierIds },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        removedAt: null,
        isGlobal: true,
      },
      select: { id: true },
    }),
    context.prisma.suppliedItem.findMany({
      where: {
        id: { in: uniqueExistingItemIds },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isGlobal: true,
        isActive: true,
      },
      select: { id: true },
    }),
    context.prisma.measurementUnit.findMany({
      where: {
        id: { in: unitIds },
        isActive: true,
        OR: [
          { corporationId: null, companyId: null },
          { corporationId: scope.corporationId, companyId: scope.companyId },
        ],
      },
      select: { id: true },
    }),
    context.prisma.supplierOffer.findMany({
      where: {
        id: { in: sourceOfferIds },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
      },
      select: { id: true },
    }),
    context.prisma.machine.findMany({
      where: {
        id: {
          in: command.initialMachineAllocations.map((item) => item.machineId),
        },
        corporationId: scope.corporationId,
        isActive: true,
        ownershipPeriods: {
          some: { companyId: scope.companyId, effectiveTo: null },
        },
      },
      select: {
        id: true,
        meterReadings: {
          where: { status: "CONFIRMED" },
          orderBy: { readingSequence: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
    context.prisma.jobRole.findMany({
      where: {
        id: { in: [...new Set(jobRoleIds)] },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
      },
      select: { id: true, name: true },
    }),
  ]);
  if (!client) throw conflict();
  const employmentMap = new Map(employments.map((item) => [item.id, item]));
  const jobRoleMap = new Map(jobRoles.map((item) => [item.id, item]));
  for (const id of [
    command.managerEmploymentId,
    ...command.technicalResponsibilityEmploymentIds,
  ])
    if (!employmentMap.has(id))
      throw conflict([
        resource(
          id === command.managerEmploymentId
            ? "manager"
            : "technicalResponsibility",
          id,
          "accountability",
        ),
      ]);
  for (const allocation of command.initialEmployeeAllocations)
    if (!employmentMap.has(allocation.employmentId))
      throw conflict([
        resource("employee", allocation.employmentId, "employees"),
      ]);
    else {
      const employment = employmentMap.get(allocation.employmentId)!;
      const currentRole = employment.jobRolePeriods[0];
      const selectedRole = allocation.confirmedJobRoleId
        ? jobRoleMap.get(allocation.confirmedJobRoleId)
        : undefined;
      const temporaryRoleIsConfirmed = Boolean(
        allocation.confirmedJobRoleName &&
        !allocation.confirmedJobRoleId &&
        !allocation.confirmedJobRolePeriodId,
      );
      const legacyRoleIsConfirmed =
        !selectedRole &&
        !temporaryRoleIsConfirmed &&
        Boolean(currentRole?.jobRole.isActive) &&
        currentRole?.id === allocation.confirmedJobRolePeriodId;
      const suppliedPeriodIsValid =
        !allocation.confirmedJobRolePeriodId ||
        (currentRole?.id === allocation.confirmedJobRolePeriodId &&
          (!selectedRole || currentRole.jobRole.id === selectedRole.id));
      if (
        (!selectedRole &&
          !legacyRoleIsConfirmed &&
          !temporaryRoleIsConfirmed) ||
        !suppliedPeriodIsValid
      )
        throw conflict([
          resource(
            "jobRole",
            allocation.employmentId,
            "employees",
            "job-role-changed",
          ),
        ]);
    }
  const teamByEmployment = new Map(
    command.initialEmployeeAllocations.map((item) => [
      item.employmentId,
      item.shift,
    ]),
  );
  for (const allocation of command.initialMachineAllocations)
    for (const assignment of allocation.operatorAssignments)
      if (
        teamByEmployment.get(assignment.operatorEmploymentId) !==
        assignment.shift
      )
        throw conflict([
          resource("employee", assignment.operatorEmploymentId, "machines"),
        ]);
  if (suppliers.length !== uniqueExistingSupplierIds.length)
    throw conflict([resource("supplier", "unknown", "supplierOffers")]);
  if (items.length !== uniqueExistingItemIds.length)
    throw conflict([resource("suppliedItem", "unknown", "supplierOffers")]);
  if (units.length !== new Set(unitIds).size)
    throw conflict([resource("measurementUnit", "unknown", "supplierOffers")]);
  if (sourceOffers.length !== sourceOfferIds.length)
    throw conflict([resource("supplierOffer", "unknown", "supplierOffers")]);
  const machineMap = new Map(machines.map((item) => [item.id, item]));
  for (const allocation of command.initialMachineAllocations) {
    const machine = machineMap.get(allocation.machineId);
    if (
      !machine ||
      machine.meterReadings[0]?.id !== allocation.startMeterReadingId
    )
      throw conflict(
        machine
          ? [
              resource(
                "machine",
                allocation.machineId,
                "machines",
                "latest-reading-changed",
              ),
            ]
          : [],
      );
  }
  return { employmentMap, jobRoleMap };
}

async function createInlineSupplier(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  supplier: NonNullable<
    ProjectCommand["projectSupplierOffers"][number]["supplier"]
  >,
) {
  const protectedDocumentResult = protectSensitiveDocument({
    document: supplier.document,
    registryType: "FUEL_SUPPLIER",
  });
  if (
    (supplier.entityType === "individual" &&
      protectedDocumentResult.documentType !== "CPF") ||
    (supplier.entityType === "legal_entity" &&
      protectedDocumentResult.documentType !== "CNPJ")
  )
    throw new AppError({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      message: "Supplier document type does not match entity type",
    });
  const displayName =
    supplier.entityType === "individual"
      ? supplier.fullName
      : supplier.legalName;
  if (!displayName)
    throw new AppError({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      message: "Supplier name is required",
    });
  const row = await tx.prisma.fuelSupplier.create({
    data: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      ...protectedDocumentResult,
      displayName,
      entityType: mapEntityType(supplier.entityType),
      fullName: supplier.fullName,
      legalName: supplier.legalName,
      tradeName: supplier.tradeName,
      phone: supplier.phone,
      email: supplier.email,
      addressLine: supplier.addressLine,
      city: supplier.city,
      state: supplier.state,
      postalCode: supplier.postalCode,
      isGlobal: supplier.saveGlobally,
      projectId: supplier.saveGlobally ? null : projectId,
    },
    select: { id: true },
  });
  return row.id;
}

async function createInlineItem(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  item: NonNullable<ProjectCommand["projectSupplierOffers"][number]["item"]>,
) {
  const row = await tx.prisma.suppliedItem.create({
    data: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      projectId: item.saveGlobally ? null : projectId,
      name: item.name,
      baseUnitId: item.baseUnitId,
      isGlobal: item.saveGlobally,
    },
    select: { id: true },
  });
  return row.id;
}

async function runSerializable<T>(
  context: HandlerContext,
  work: (tx: HandlerContext) => Promise<T>,
) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await context.transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 5
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }
  throw new Error("Unreachable serializable retry state");
}

type ReadinessOffer = NonNullable<
  ProjectReadinessCommand["fuelOffers"]
>[number];
type ReadinessEmployeeAllocation = NonNullable<
  ProjectReadinessCommand["employeeAllocations"]
>[number];
type ReadinessMachineAllocation = NonNullable<
  ProjectReadinessCommand["machineAllocations"]
>[number];
type ProjectOfferUsageKind = "fuel" | "material";

function validationError(path: string, code: string, message: string): never {
  throw new AppError({
    code: "VALIDATION_ERROR",
    statusCode: 400,
    message,
    data: { fields: [{ path, code }], resources: [] },
  });
}

function projectScopeWhere(scope: ProjectScope, projectId: string) {
  return {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
    projectId,
  };
}

async function lockProjectQuantityAllocation(
  tx: HandlerContext,
  projectId: string,
) {
  await tx.prisma.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0)) IS NULL AS locked`,
  );
}

async function assertQuantityBaselineCoversAllocatedFronts(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  items: ProjectQuantityBaselineRevisionCommand["items"],
) {
  const scopeWhere = projectScopeWhere(scope, projectId);
  const fronts = await tx.prisma.projectWorkFront.findMany({
    where: { ...scopeWhere, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  const services = fronts.length
    ? await tx.prisma.projectWorkFrontService.findMany({
        where: {
          ...scopeWhere,
          workFrontId: { in: fronts.map((front) => front.id) },
        },
        select: { serviceCode: true, unitCode: true, quantity: true },
      })
    : [];
  const allocatedByService = new Map<
    string,
    { quantity: Prisma.Decimal; unitCode: string }
  >();
  for (const service of services) {
    const current = allocatedByService.get(service.serviceCode);
    allocatedByService.set(service.serviceCode, {
      quantity: (current?.quantity ?? new Prisma.Decimal(0)).add(
        service.quantity,
      ),
      unitCode: service.unitCode,
    });
  }
  const proposedByService = new Map(
    items.map((item) => [item.serviceCode, item]),
  );
  const blockers: ReadinessBlocker[] = [];
  for (const [serviceCode, allocated] of allocatedByService) {
    const proposed = proposedByService.get(
      serviceCode as EarthworksServiceCode,
    );
    if (
      !proposed ||
      new Prisma.Decimal(proposed.total).lessThan(allocated.quantity)
    ) {
      const label =
        serviceLabels[serviceCode as EarthworksServiceCode] ?? serviceCode;
      blockers.push({
        section: "metrics",
        message: `${label}: o total de referência deve ser igual ou superior aos ${decimalString(allocated.quantity, 3)} ${allocated.unitCode} já distribuídos.`,
      });
    }
  }
  if (blockers.length)
    throw new AppError({
      code: "PROJECT_QUANTITY_BASELINE_BELOW_ALLOCATED",
      statusCode: 422,
      message:
        "Os quantitativos de referência não podem ficar abaixo do volume distribuído.",
      data: { fields: [], resources: [], blockers },
    });
}

async function assertWorkFrontAllocationWithinBaseline(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  services: ProjectWorkFrontCommand["services"],
  excludedFrontId?: string,
) {
  const scopeWhere = projectScopeWhere(scope, projectId);
  const revision = await tx.prisma.projectQuantityBaselineRevision.findFirst({
    where: scopeWhere,
    orderBy: { revision: "desc" },
    select: { id: true },
  });
  if (!revision)
    validationError(
      "services",
      "quantity_baseline_required",
      "Cadastre os quantitativos de referência antes de distribuir uma frente.",
    );

  const baselineItems = await tx.prisma.projectQuantityBaselineItem.findMany({
    where: { revisionId: revision.id },
    select: { serviceCode: true, unitCode: true, total: true },
  });
  const allocatedFronts = await tx.prisma.projectWorkFront.findMany({
    where: {
      ...scopeWhere,
      status: { not: "CANCELLED" },
      ...(excludedFrontId ? { id: { not: excludedFrontId } } : {}),
    },
    select: { id: true },
  });
  const allocatedServices = allocatedFronts.length
    ? await tx.prisma.projectWorkFrontService.findMany({
        where: {
          ...scopeWhere,
          workFrontId: { in: allocatedFronts.map((front) => front.id) },
        },
        select: { serviceCode: true, quantity: true },
      })
    : [];
  const baselineByService = new Map(
    baselineItems.map((item) => [item.serviceCode, item]),
  );
  const allocatedByService = new Map<string, Prisma.Decimal>();
  for (const service of allocatedServices) {
    const allocated =
      allocatedByService.get(service.serviceCode) ?? new Prisma.Decimal(0);
    allocatedByService.set(
      service.serviceCode,
      allocated.add(service.quantity),
    );
  }

  const blockers: ReadinessBlocker[] = [];
  for (const service of services) {
    const baseline = baselineByService.get(service.serviceCode);
    if (!baseline)
      validationError(
        "services",
        "service_not_in_quantity_baseline",
        "O serviço informado não existe nos quantitativos de referência atuais.",
      );
    if (baseline.unitCode !== service.unitCode)
      validationError(
        "services",
        "unit_differs_from_quantity_baseline",
        "A unidade informada não corresponde ao quantitativo de referência atual.",
      );
    const allocated =
      allocatedByService.get(service.serviceCode) ?? new Prisma.Decimal(0);
    const available = baseline.total.sub(allocated);
    const requested = new Prisma.Decimal(service.quantity);
    if (requested.greaterThan(available)) {
      const label =
        serviceLabels[service.serviceCode as EarthworksServiceCode] ??
        service.serviceCode;
      blockers.push({
        section: "fronts",
        message: `${label}: solicitado ${decimalString(requested, 3)} ${service.unitCode}; saldo disponível ${decimalString(available, 3)} ${service.unitCode}.`,
      });
    }
  }
  if (blockers.length)
    throw new AppError({
      code: "WORK_FRONT_QUANTITY_EXCEEDS_BALANCE",
      statusCode: 422,
      message: "Um ou mais quantitativos ultrapassam o saldo disponível.",
      data: { fields: [], resources: [], blockers },
    });
}

async function assertWorkFrontServicesCoverProduction(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  frontId: string,
  services: ProjectWorkFrontServicesCommand["services"],
) {
  const groups = await tx.prisma.projectProduction.groupBy({
    by: ["serviceCodeSnapshot"],
    where: { ...projectScopeWhere(scope, projectId), workFrontId: frontId },
    _sum: { officialQuantity: true },
    _count: { _all: true },
  });
  const proposed = new Map(
    services.map((service) => [service.serviceCode, service]),
  );
  const removed = groups.find(
    (group) =>
      group._count._all > 0 &&
      !proposed.has(group.serviceCodeSnapshot as EarthworksServiceCode),
  );
  if (removed)
    throw new AppError({
      code: "WORK_FRONT_SERVICE_HAS_PRODUCTION",
      statusCode: 422,
      message: "Um serviço com lançamentos de produção não pode ser removido.",
      data: {
        fields: [],
        resources: [],
        blockers: [
          {
            section: "fronts",
            message: `${serviceLabels[removed.serviceCodeSnapshot as EarthworksServiceCode] ?? removed.serviceCodeSnapshot}: existem lançamentos de produção vinculados.`,
          },
        ],
      },
    });

  const blockers: ReadinessBlocker[] = [];
  for (const group of groups) {
    const service = proposed.get(
      group.serviceCodeSnapshot as EarthworksServiceCode,
    );
    if (!service) continue;
    const produced = group._sum.officialQuantity ?? new Prisma.Decimal(0);
    const requested = new Prisma.Decimal(service.quantity);
    if (requested.lt(produced))
      blockers.push({
        section: "fronts",
        message: `${serviceLabels[group.serviceCodeSnapshot as EarthworksServiceCode] ?? group.serviceCodeSnapshot}: o mínimo é ${decimalString(produced, 3)} ${service.unitCode}, já produzido nesta frente.`,
      });
  }
  if (blockers.length)
    throw new AppError({
      code: "WORK_FRONT_QUANTITY_BELOW_PRODUCED",
      statusCode: 422,
      message:
        "A distribuição da frente não pode ficar abaixo do quantitativo produzido.",
      data: { fields: [], resources: [], blockers },
    });
}

async function reconcileWorkFrontServices(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  frontId: string,
  services: ProjectWorkFrontServicesCommand["services"],
) {
  const scopeWhere = projectScopeWhere(scope, projectId);
  const current = await tx.prisma.projectWorkFrontService.findMany({
    where: { ...scopeWhere, workFrontId: frontId },
    select: { id: true, serviceCode: true },
  });
  const desiredCodes = new Set(services.map((service) => service.serviceCode));
  const removedIds = current
    .filter(
      (service) =>
        !desiredCodes.has(service.serviceCode as EarthworksServiceCode),
    )
    .map((service) => service.id);
  if (removedIds.length)
    await tx.prisma.projectWorkFrontService.deleteMany({
      where: { id: { in: removedIds }, ...scopeWhere, workFrontId: frontId },
    });
  for (const service of services) {
    const existing = current.find(
      (item) => item.serviceCode === service.serviceCode,
    );
    if (existing)
      await tx.prisma.projectWorkFrontService.update({
        where: { id: existing.id },
        data: { unitCode: service.unitCode, quantity: service.quantity },
      });
    else
      await tx.prisma.projectWorkFrontService.create({
        data: {
          ...scopeWhere,
          workFrontId: frontId,
          serviceCode: service.serviceCode,
          unitCode: service.unitCode,
          quantity: service.quantity,
        },
      });
  }
}

async function replaceAccountability(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  accountability: NonNullable<ProjectReadinessCommand["accountability"]>,
  now: Date,
) {
  const employmentIds = [
    accountability.managerEmploymentId,
    ...accountability.technicalResponsibilityEmploymentIds,
  ];
  const [client, employments] = await Promise.all([
    tx.prisma.client.findFirst({
      where: {
        id: accountability.clientId,
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        removedAt: null,
      },
      select: { id: true },
    }),
    tx.prisma.employment.findMany({
      where: {
        id: { in: [...new Set(employmentIds)] },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        state: "ACTIVE",
        isActive: true,
        periods: { some: { effectiveTo: null } },
      },
      select: { id: true },
    }),
  ]);
  if (!client)
    throw conflict([
      resource("client", accountability.clientId, "accountability"),
    ]);
  const employmentSet = new Set(employments.map((item) => item.id));
  for (const id of employmentIds)
    if (!employmentSet.has(id))
      throw conflict([
        resource(
          id === accountability.managerEmploymentId
            ? "manager"
            : "technicalResponsibility",
          id,
          "accountability",
        ),
      ]);

  const scopeWhere = projectScopeWhere(scope, projectId);
  await tx.prisma.projectClientPeriod.deleteMany({ where: scopeWhere });
  await tx.prisma.projectClientPeriod.create({
    data: {
      ...scopeWhere,
      clientId: accountability.clientId,
      effectiveFrom: now,
    },
  });
  await tx.prisma.projectManagerTenure.deleteMany({ where: scopeWhere });
  await tx.prisma.projectManagerTenure.create({
    data: {
      ...scopeWhere,
      employmentId: accountability.managerEmploymentId,
      effectiveFrom: now,
    },
  });
  await tx.prisma.projectTechnicalResponsibility.deleteMany({
    where: scopeWhere,
  });
  await tx.prisma.projectTechnicalResponsibility.createMany({
    data: accountability.technicalResponsibilityEmploymentIds.map(
      (employmentId) => ({
        ...scopeWhere,
        employmentId,
        effectiveFrom: now,
      }),
    ),
  });
}

async function replaceProjectOffers(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  usageKind: ProjectOfferUsageKind,
  offers: ReadinessOffer[],
  now: Date,
) {
  const sourceOfferIds = offers
    .map((item) => ("sourceOfferId" in item ? item.sourceOfferId : null))
    .filter((id): id is string => Boolean(id));
  const newOffers = offers.filter(
    (
      item,
    ): item is Extract<
      ReadinessOffer,
      { mode: "projectOnly" | "companyCatalog" }
    > => !("sourceOfferId" in item),
  );
  const sourceOffers = await tx.prisma.supplierOffer.findMany({
    where: {
      id: { in: [...new Set(sourceOfferIds)] },
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      isActive: true,
    },
    select: {
      id: true,
      supplierId: true,
      itemId: true,
      purchaseUnitId: true,
      conversionToBase: true,
    },
  });
  if (sourceOffers.length !== new Set(sourceOfferIds).size)
    throw conflict([resource("supplierOffer", "unknown", "supplierOffers")]);

  const sourceById = new Map(sourceOffers.map((item) => [item.id, item]));
  const supplierIds = [
    ...sourceOffers.map((item) => item.supplierId),
    ...newOffers.map((item) => item.supplierId),
  ];
  const itemIds = [
    ...sourceOffers.map((item) => item.itemId),
    ...newOffers.map((item) => item.itemId),
  ];
  const unitIds = [
    ...sourceOffers.map((item) => item.purchaseUnitId),
    ...newOffers.map((item) => item.purchaseUnitId),
  ];
  const [suppliers, items, units, categories] = await Promise.all([
    tx.prisma.fuelSupplier.findMany({
      where: {
        id: { in: [...new Set(supplierIds)] },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        removedAt: null,
        isGlobal: true,
      },
      select: { id: true },
    }),
    tx.prisma.suppliedItem.findMany({
      where: {
        id: { in: [...new Set(itemIds)] },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        isGlobal: true,
      },
      select: { id: true, categoryId: true, isActive: true },
    }),
    tx.prisma.measurementUnit.findMany({
      where: {
        id: { in: [...new Set(unitIds)] },
        isActive: true,
        OR: [
          { corporationId: null, companyId: null },
          { corporationId: scope.corporationId, companyId: scope.companyId },
        ],
      },
      select: { id: true },
    }),
    tx.prisma.suppliedItemCategory.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
      },
      select: {
        id: true,
        parentId: true,
        systemKey: true,
        isActive: true,
      },
    }),
  ]);
  if (suppliers.length !== new Set(supplierIds).size)
    throw conflict([resource("supplier", "unknown", "supplierOffers")]);
  if (items.length !== new Set(itemIds).size)
    throw conflict([resource("suppliedItem", "unknown", "supplierOffers")]);
  if (units.length !== new Set(unitIds).size)
    throw conflict([resource("measurementUnit", "unknown", "supplierOffers")]);

  const supplierSet = new Set(suppliers.map((item) => item.id));
  const categoryStates = buildCatalogCategoryStates(categories);
  const itemSet = new Set(
    items
      .filter((item) => {
        const state = itemCatalogState(categoryStates, item);
        return state.effectiveActive && state.kind === usageKind;
      })
      .map((item) => item.id),
  );
  const unitSet = new Set(units.map((item) => item.id));
  for (const offer of newOffers) {
    if (!supplierSet.has(offer.supplierId))
      throw conflict([
        resource("supplier", offer.supplierId, "supplierOffers"),
      ]);
    if (!itemSet.has(offer.itemId))
      throw conflict([
        resource("suppliedItem", offer.itemId, "supplierOffers"),
      ]);
    if (!unitSet.has(offer.purchaseUnitId))
      throw conflict([
        resource("measurementUnit", offer.purchaseUnitId, "supplierOffers"),
      ]);
  }

  const normalizedOffers: Array<{
    sourceOfferId: string | null;
    supplierId: string;
    itemId: string;
    purchaseUnitId: string;
    conversionToBase: Prisma.Decimal | string;
    price: string;
  }> = [];

  for (const offer of offers) {
    if ("sourceOfferId" in offer) {
      const source = sourceById.get(offer.sourceOfferId);
      if (!source)
        throw conflict([
          resource("supplierOffer", offer.sourceOfferId, "supplierOffers"),
        ]);
      if (!itemSet.has(source.itemId))
        throw conflict([
          resource(
            "suppliedItem",
            source.itemId,
            usageKind === "fuel" ? "fuelOffers" : "materialOffers",
            "catalog_kind_mismatch",
          ),
        ]);
      normalizedOffers.push({
        sourceOfferId: source.id,
        supplierId: source.supplierId,
        itemId: source.itemId,
        purchaseUnitId: source.purchaseUnitId,
        conversionToBase: offer.conversionToBase ?? source.conversionToBase,
        price: offer.price,
      });
      continue;
    }

    if (offer.mode === "projectOnly") {
      normalizedOffers.push({
        sourceOfferId: null,
        supplierId: offer.supplierId,
        itemId: offer.itemId,
        purchaseUnitId: offer.purchaseUnitId,
        conversionToBase: offer.conversionToBase,
        price: offer.price,
      });
      continue;
    }

    const duplicate = await tx.prisma.supplierOffer.findFirst({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        supplierId: offer.supplierId,
        itemId: offer.itemId,
        isActive: true,
      },
      select: { id: true },
    });
    if (duplicate)
      throw conflict([
        resource("supplierOffer", duplicate.id, "supplierOffers"),
      ]);

    const source = await tx.prisma.supplierOffer.create({
      data: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        supplierId: offer.supplierId,
        itemId: offer.itemId,
        purchaseUnitId: offer.purchaseUnitId,
        conversionToBase: offer.conversionToBase,
      },
      select: {
        id: true,
        supplierId: true,
        itemId: true,
        purchaseUnitId: true,
        conversionToBase: true,
      },
    });
    await tx.prisma.supplierOfferPrice.create({
      data: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        offerId: source.id,
        price: offer.price,
        effectiveFrom: now,
      },
    });
    normalizedOffers.push({
      sourceOfferId: source.id,
      supplierId: source.supplierId,
      itemId: source.itemId,
      purchaseUnitId: source.purchaseUnitId,
      conversionToBase: source.conversionToBase,
      price: offer.price,
    });
  }

  const scopeWhere = projectScopeWhere(scope, projectId);
  const currentOffers = await tx.prisma.projectSupplierOffer.findMany({
    where: { ...scopeWhere, usageKind },
    select: { id: true },
  });
  if (currentOffers.length)
    await tx.prisma.projectSupplierOfferPrice.deleteMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        projectOfferId: { in: currentOffers.map((offer) => offer.id) },
      },
    });
  await tx.prisma.projectSupplierOffer.deleteMany({
    where: { ...scopeWhere, usageKind },
  });

  for (const offer of normalizedOffers) {
    const row = await tx.prisma.projectSupplierOffer.create({
      data: {
        ...scopeWhere,
        usageKind,
        supplierId: offer.supplierId,
        itemId: offer.itemId,
        sourceOfferId: offer.sourceOfferId,
        purchaseUnitId: offer.purchaseUnitId,
        conversionToBase: offer.conversionToBase,
        price: offer.price,
        effectiveFrom: now,
      },
      select: { id: true },
    });
    await tx.prisma.projectSupplierOfferPrice.create({
      data: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        projectOfferId: row.id,
        price: offer.price,
        effectiveFrom: now,
      },
    });
  }
}

async function replaceProjectSchedule(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  weeklySchedule: NonNullable<
    ProjectEmployeeMobilizationCommand["weeklySchedule"]
  >,
  breakTemplates: NonNullable<
    ProjectEmployeeMobilizationCommand["breakTemplates"]
  >,
  now: Date,
) {
  const scopeWhere = projectScopeWhere(scope, projectId);
  const enabledShifts = new Set(weeklySchedule.map((day) => day.shift));
  for (const shift of enabledShifts) {
    const days = weeklySchedule.filter((day) => day.shift === shift);
    if (
      days.length !== 7 ||
      new Set(days.map((day) => day.dayOfWeek)).size !== 7 ||
      !days.some((day) => day.isWorking)
    )
      validationError(
        "weeklySchedule",
        "invalid-shift-schedule",
        "Cada turno habilitado deve possuir os sete dias e ao menos um dia útil.",
      );
  }
  if (!enabledShifts.has("day"))
    validationError(
      "weeklySchedule",
      "day-shift-required",
      "O turno diurno não pode ser removido.",
    );
  if (!enabledShifts.has("night")) {
    const [nightEmployee, nightMachine, nightFrontEmployee, nightFrontMachine] =
      await Promise.all([
        tx.prisma.projectEmployeeAllocation.findFirst({
          where: { ...scopeWhere, shift: "NIGHT", effectiveTo: null },
          select: { employmentId: true },
        }),
        tx.prisma.projectMachineShiftAssignment.findFirst({
          where: { ...scopeWhere, shift: "NIGHT", effectiveTo: null },
          select: { machineId: true },
        }),
        tx.prisma.projectWorkFrontEmployeeAssignment.findFirst({
          where: { ...scopeWhere, shift: "NIGHT", effectiveTo: null },
          select: { employmentId: true },
        }),
        tx.prisma.projectWorkFrontMachineAssignment.findFirst({
          where: { ...scopeWhere, shift: "NIGHT", effectiveTo: null },
          select: { machineId: true },
        }),
      ]);
    const blockingResource =
      (nightEmployee &&
        resource("employee", nightEmployee.employmentId, "employees")) ||
      (nightMachine &&
        resource("machine", nightMachine.machineId, "machines")) ||
      (nightFrontEmployee &&
        resource("employee", nightFrontEmployee.employmentId, "fronts")) ||
      (nightFrontMachine &&
        resource("machine", nightFrontMachine.machineId, "fronts"));
    if (blockingResource)
      throw conflict([
        { ...blockingResource, reason: "night-shift-still-in-use" },
      ]);
  }
  await tx.prisma.projectScheduleRevision.updateMany({
    where: { ...scopeWhere, effectiveTo: null },
    data: { effectiveTo: now },
  });
  const revision = await tx.prisma.projectScheduleRevision.create({
    data: { ...scopeWhere, effectiveFrom: now },
    select: { id: true },
  });
  await tx.prisma.projectScheduleDay.createMany({
    data: weeklySchedule.map((day) => ({
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      scheduleRevisionId: revision.id,
      shift: dbShift(day.shift),
      dayOfWeek: day.dayOfWeek,
      isWorking: day.isWorking,
      startTime: day.startTime,
      endTime: day.endTime,
      endDayOffset: day.endDayOffset,
    })),
  });
  if (breakTemplates.length)
    await tx.prisma.projectBreakTemplate.createMany({
      data: breakTemplates.map((item, position) => ({
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        scheduleRevisionId: revision.id,
        shift: dbShift(item.shift),
        position,
        name: item.name,
        durationMinutes: item.durationMinutes,
      })),
    });
}

async function replaceEmployeeAllocations(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  allocations: ReadinessEmployeeAllocation[],
  now: Date,
  reason = "Atualização da mobilização da obra",
) {
  const employmentIds = allocations.map((item) => item.employmentId);
  const activeSchedule = await tx.prisma.projectScheduleRevision.findFirst({
    where: { ...projectScopeWhere(scope, projectId), effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true },
  });
  const enabledShiftRows = activeSchedule
    ? await tx.prisma.projectScheduleDay.findMany({
        where: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          scheduleRevisionId: activeSchedule.id,
        },
        distinct: ["shift"],
        select: { shift: true },
      })
    : [];
  const enabledShifts = new Set(enabledShiftRows.map((item) => item.shift));
  const disabledAllocation = allocations.find(
    (allocation) => !enabledShifts.has(dbShift(allocation.shift)),
  );
  if (disabledAllocation)
    validationError(
      "allocations.shift",
      "shift-not-enabled",
      "O turno do trabalhador precisa estar habilitado na obra.",
    );
  const jobRoleIds = allocations
    .map((item) => item.confirmedJobRoleId)
    .filter((id): id is string => Boolean(id));
  const [employments, conflictingAllocations, jobRoles] = await Promise.all([
    tx.prisma.employment.findMany({
      where: {
        id: { in: [...new Set(employmentIds)] },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        state: "ACTIVE",
        isActive: true,
        periods: { some: { effectiveTo: null } },
      },
      select: {
        id: true,
        personId: true,
        jobRolePeriods: {
          where: { effectiveTo: null },
          select: {
            id: true,
            jobRole: { select: { id: true, name: true, isActive: true } },
          },
          take: 1,
        },
      },
    }),
    tx.prisma.projectEmployeeAllocation.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        employmentId: { in: [...new Set(employmentIds)] },
        effectiveTo: null,
        NOT: { projectId },
      },
      select: { employmentId: true },
    }),
    tx.prisma.jobRole.findMany({
      where: {
        id: { in: [...new Set(jobRoleIds)] },
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
      },
      select: { id: true, name: true },
    }),
  ]);
  if (conflictingAllocations.length)
    throw conflict([
      resource(
        "employee",
        conflictingAllocations[0].employmentId,
        "employees",
        "already-allocated",
      ),
    ]);
  const employmentMap = new Map(employments.map((item) => [item.id, item]));
  const jobRoleMap = new Map(jobRoles.map((item) => [item.id, item]));
  for (const allocation of allocations) {
    const employment = employmentMap.get(allocation.employmentId);
    if (!employment)
      throw conflict([
        resource("employee", allocation.employmentId, "employees"),
      ]);
    const currentRole = employment.jobRolePeriods[0];
    const selectedRole = allocation.confirmedJobRoleId
      ? jobRoleMap.get(allocation.confirmedJobRoleId)
      : undefined;
    const hasTemporaryRole = Boolean(
      allocation.confirmedJobRoleName && !allocation.confirmedJobRoleId,
    );
    const usesCurrentRole =
      !selectedRole &&
      !hasTemporaryRole &&
      Boolean(currentRole?.jobRole.isActive) &&
      currentRole?.id === allocation.confirmedJobRolePeriodId;
    if (!selectedRole && !hasTemporaryRole && !usesCurrentRole)
      throw conflict([
        resource(
          "jobRole",
          allocation.employmentId,
          "employees",
          "job-role-changed",
        ),
      ]);
  }

  const scopeWhere = projectScopeWhere(scope, projectId);
  const desiredEmploymentIds = new Set(
    allocations.map((allocation) => allocation.employmentId),
  );
  const currentAllocations = await tx.prisma.projectEmployeeAllocation.findMany(
    {
      where: { ...scopeWhere, effectiveTo: null },
      select: { employmentId: true, shift: true },
    },
  );
  const desiredByEmployment = new Map(
    allocations.map((allocation) => [allocation.employmentId, allocation]),
  );
  const removedEmploymentIds = currentAllocations
    .map((allocation) => allocation.employmentId)
    .filter((employmentId) => !desiredEmploymentIds.has(employmentId));
  if (removedEmploymentIds.length) {
    const [assigned, operatedMachine] = await Promise.all([
      tx.prisma.projectWorkFrontEmployeeAssignment.findFirst({
        where: {
          ...scopeWhere,
          employmentId: { in: removedEmploymentIds },
          effectiveTo: null,
        },
        select: { employmentId: true, workFrontId: true },
      }),
      tx.prisma.projectMachineShiftAssignment.findFirst({
        where: {
          ...scopeWhere,
          operatorEmploymentId: { in: removedEmploymentIds },
          effectiveTo: null,
        },
        select: { operatorEmploymentId: true, machineId: true },
      }),
    ]);
    if (assigned)
      throw conflict([
        resource(
          "employee",
          assigned.employmentId,
          "fronts",
          "assigned-to-front",
        ),
      ]);
    if (operatedMachine)
      throw conflict([
        resource(
          "employee",
          operatedMachine.operatorEmploymentId,
          "machines",
          "already-allocated",
        ),
      ]);
  }
  const movedEmployees = currentAllocations.flatMap((allocation) => {
    const desired = desiredByEmployment.get(allocation.employmentId);
    if (!desired || dbShift(desired.shift) === allocation.shift) return [];
    return [
      {
        employmentId: allocation.employmentId,
        from: allocation.shift,
        to: dbShift(desired.shift),
      },
    ];
  });
  for (const moved of movedEmployees) {
    const machineAssignment =
      await tx.prisma.projectMachineShiftAssignment.findFirst({
        where: {
          ...scopeWhere,
          operatorEmploymentId: moved.employmentId,
          effectiveTo: null,
        },
        select: { id: true, machineId: true },
      });
    if (machineAssignment) {
      const occupiedTarget =
        await tx.prisma.projectMachineShiftAssignment.findFirst({
          where: {
            ...scopeWhere,
            machineId: machineAssignment.machineId,
            shift: moved.to,
            effectiveTo: null,
            NOT: { id: machineAssignment.id },
          },
          select: { id: true },
        });
      if (occupiedTarget)
        throw conflict([
          resource(
            "machine",
            machineAssignment.machineId,
            "machines",
            "shift-already-occupied",
          ),
        ]);
      await tx.prisma.projectMachineShiftAssignment.update({
        where: { id: machineAssignment.id },
        data: { shift: moved.to },
      });
      await tx.prisma.projectWorkFrontMachineAssignment.updateMany({
        where: {
          ...scopeWhere,
          machineId: machineAssignment.machineId,
          operatorEmploymentId: moved.employmentId,
          shift: moved.from,
          effectiveTo: null,
        },
        data: { shift: moved.to },
      });
    }
    await tx.prisma.projectWorkFrontEmployeeAssignment.updateMany({
      where: {
        ...scopeWhere,
        employmentId: moved.employmentId,
        shift: moved.from,
        effectiveTo: null,
      },
      data: { shift: moved.to },
    });
  }
  await tx.prisma.projectEmployeeAllocation.updateMany({
    where: { ...scopeWhere, effectiveTo: null },
    data: {
      effectiveTo: now,
      endedByUserId: scope.userId,
      endedReason: reason,
    },
  });
  if (!allocations.length) return;
  for (const allocation of allocations) {
    const employment = employmentMap.get(allocation.employmentId)!;
    const currentRole = employment.jobRolePeriods[0];
    const selectedRole = allocation.confirmedJobRoleId
      ? jobRoleMap.get(allocation.confirmedJobRoleId)!
      : allocation.confirmedJobRoleName
        ? null
        : currentRole!.jobRole;
    const referencesEmploymentRole =
      selectedRole !== null && currentRole?.jobRole.id === selectedRole.id;
    const jobRoleName = allocation.confirmedJobRoleName ?? selectedRole?.name;
    if (!jobRoleName)
      validationError(
        "employeeAllocations",
        "job-role-required",
        "A job role must be confirmed",
      );
    await tx.prisma.projectEmployeeAllocation.create({
      data: {
        ...scopeWhere,
        personId: employment.personId,
        effectiveFrom: now,
        employmentId: allocation.employmentId,
        shift: dbShift(allocation.shift),
        employmentJobRolePeriodId: referencesEmploymentRole
          ? currentRole?.id
          : null,
        jobRole: jobRoleName,
        monthlyWorkloadHours: allocation.monthlyWorkloadHours,
        compensationMode: allocation.compensationMode,
        compensationValue: allocation.compensationValue,
        overtimeRate: allocation.overtimeRate,
        createdByUserId: scope.userId,
      },
    });
  }
}

async function replaceMachineAllocations(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  allocations: ReadinessMachineAllocation[],
  now: Date,
  reason = "Atualização da mobilização da obra",
) {
  const scopeWhere = projectScopeWhere(scope, projectId);
  const teamRows = await tx.prisma.projectEmployeeAllocation.findMany({
    where: { ...scopeWhere, effectiveTo: null },
    select: { employmentId: true, shift: true },
  });
  const teamByEmployment = new Map(
    teamRows.map((item) => [item.employmentId, shiftDto(item.shift)]),
  );
  for (const allocation of allocations)
    for (const assignment of allocation.operatorAssignments)
      if (
        teamByEmployment.get(assignment.operatorEmploymentId) !==
        assignment.shift
      )
        throw conflict([
          resource("employee", assignment.operatorEmploymentId, "machines"),
        ]);

  const machineIds = allocations.map((item) => item.machineId);
  const [machines, conflicts] = await Promise.all([
    tx.prisma.machine.findMany({
      where: {
        id: { in: [...new Set(machineIds)] },
        corporationId: scope.corporationId,
        isActive: true,
        ownershipPeriods: {
          some: { companyId: scope.companyId, effectiveTo: null },
        },
      },
      select: {
        id: true,
        meterReadings: {
          where: { status: "CONFIRMED" },
          orderBy: { readingSequence: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
    tx.prisma.projectMachineAllocation.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        machineId: { in: [...new Set(machineIds)] },
        effectiveTo: null,
        NOT: { projectId },
      },
      select: { machineId: true },
    }),
  ]);
  if (conflicts.length)
    throw conflict([
      resource(
        "machine",
        conflicts[0].machineId,
        "machines",
        "already-allocated",
      ),
    ]);
  const machineMap = new Map(machines.map((item) => [item.id, item]));
  for (const allocation of allocations) {
    const machine = machineMap.get(allocation.machineId);
    if (!machine)
      throw conflict([resource("machine", allocation.machineId, "machines")]);
    if (machine.meterReadings[0]?.id !== allocation.startMeterReadingId)
      throw conflict([
        resource(
          "machine",
          allocation.machineId,
          "machines",
          "latest-reading-changed",
        ),
      ]);
  }

  const current = await tx.prisma.projectMachineAllocation.findMany({
    where: { ...scopeWhere, effectiveTo: null },
    select: {
      id: true,
      machineId: true,
      startMeterReadingId: true,
      operatorEmploymentId: true,
      shiftAssignments: {
        where: { effectiveTo: null },
        select: { shift: true, operatorEmploymentId: true },
      },
    },
  });
  const desiredByMachine = new Map(
    allocations.map((allocation) => [allocation.machineId, allocation]),
  );
  const changedMachineIds = current
    .filter((item) => {
      const desired = desiredByMachine.get(item.machineId);
      return (
        !desired ||
        desired.startMeterReadingId !== item.startMeterReadingId ||
        desired.operatorEmploymentId !== item.operatorEmploymentId ||
        JSON.stringify(
          desired.operatorAssignments
            .map((assignment) => ({
              shift: dbShift(assignment.shift),
              operatorEmploymentId: assignment.operatorEmploymentId,
            }))
            .sort((left, right) => left.shift.localeCompare(right.shift)),
        ) !==
          JSON.stringify(
            item.shiftAssignments
              .map((assignment) => ({
                shift: assignment.shift,
                operatorEmploymentId: assignment.operatorEmploymentId,
              }))
              .sort((left, right) => left.shift.localeCompare(right.shift)),
          )
      );
    })
    .map((item) => item.machineId);
  if (changedMachineIds.length) {
    const assigned =
      await tx.prisma.projectWorkFrontMachineAssignment.findFirst({
        where: {
          ...scopeWhere,
          machineId: { in: changedMachineIds },
          effectiveTo: null,
        },
        select: { machineId: true, workFrontId: true },
      });
    if (assigned)
      throw conflict([
        resource("machine", assigned.machineId, "fronts", "assigned-to-front"),
      ]);
  }
  await tx.prisma.projectMachineAllocation.updateMany({
    where: { ...scopeWhere, effectiveTo: null },
    data: {
      effectiveTo: now,
      endedByUserId: scope.userId,
      endedReason: reason,
    },
  });
  await tx.prisma.projectMachineShiftAssignment.updateMany({
    where: { ...scopeWhere, effectiveTo: null },
    data: {
      effectiveTo: now,
      endedByUserId: scope.userId,
      endedReason: reason,
    },
  });
  for (const allocation of allocations) {
    const row = await tx.prisma.projectMachineAllocation.create({
      data: {
        ...scopeWhere,
        effectiveFrom: now,
        createdByUserId: scope.userId,
        machineId: allocation.machineId,
        startMeterReadingId: allocation.startMeterReadingId,
        operatorEmploymentId: allocation.operatorEmploymentId,
      },
      select: { id: true },
    });
    await tx.prisma.projectMachineShiftAssignment.createMany({
      data: allocation.operatorAssignments.map((assignment) => ({
        ...scopeWhere,
        projectMachineAllocationId: row.id,
        machineId: allocation.machineId,
        shift: dbShift(assignment.shift),
        operatorEmploymentId: assignment.operatorEmploymentId,
        effectiveFrom: now,
        createdByUserId: scope.userId,
      })),
    });
    await tx.prisma.machineMeterReadingReference.create({
      data: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        machineId: allocation.machineId,
        readingId: allocation.startMeterReadingId,
        sourceType: "PROJECT_ALLOCATION",
        sourceId: row.id,
      },
    });
  }
}

async function replacePaymentTerms(
  tx: HandlerContext,
  scope: ProjectScope,
  projectId: string,
  terms: NonNullable<ProjectReadinessCommand["compensationPaymentTerms"]>,
) {
  const scopeWhere = projectScopeWhere(scope, projectId);
  const teamModes = await tx.prisma.projectEmployeeAllocation.findMany({
    where: { ...scopeWhere, effectiveTo: null },
    select: { compensationMode: true },
  });
  const requiredPaymentModes = [
    ...new Set(teamModes.map((item) => item.compensationMode).sort()),
  ];
  const suppliedPaymentModes = terms
    .map((item) => item.compensationMode)
    .sort();
  if (
    requiredPaymentModes.length !== suppliedPaymentModes.length ||
    requiredPaymentModes.some(
      (mode, index) => mode !== suppliedPaymentModes[index],
    )
  )
    validationError(
      "compensationPaymentTerms",
      "payment-modes-mismatch",
      "Payment terms must match Project compensation modes",
    );

  await tx.prisma.projectCompensationPaymentTerm.deleteMany({
    where: scopeWhere,
  });
  if (terms.length)
    await tx.prisma.projectCompensationPaymentTerm.createMany({
      data: terms.map((term) => ({
        ...scopeWhere,
        compensationMode: term.compensationMode,
        daysAfterPeriodEnd: term.daysAfterPeriodEnd,
      })),
    });
}

async function buildProjectReadinessOptions(
  context: HandlerContext,
  scope: ProjectScope,
  projectId: string,
) {
  const project = await context.prisma.project.findFirst({
    where: {
      id: projectId,
      corporationId: scope.corporationId,
      companyId: scope.companyId,
    },
    select: { id: true },
  });
  if (!project) projectNotFound();

  const scopeWhere = projectScopeWhere(scope, projectId);
  const [
    clients,
    employments,
    currentEmployeeAllocations,
    currentMachineAllocations,
    machines,
    jobRoles,
    supplierOffers,
    suppliers,
    suppliedItems,
    suppliedItemCategories,
    measurementUnits,
  ] = await Promise.all([
    context.prisma.client.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        removedAt: null,
      },
      orderBy: { displayName: "asc" },
      take: 200,
      select: {
        id: true,
        displayName: true,
        documentType: true,
        ciphertext: true,
        iv: true,
        authTag: true,
        encryptionKeyVersion: true,
      },
    }),
    context.prisma.employment.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        state: "ACTIVE",
        isActive: true,
        periods: { some: { effectiveTo: null } },
      },
      orderBy: { person: { displayName: "asc" } },
      take: 300,
      select: {
        id: true,
        personId: true,
        person: { select: { displayName: true } },
        jobRolePeriods: {
          where: { effectiveTo: null },
          select: {
            id: true,
            jobRole: { select: { id: true, name: true, isActive: true } },
          },
          take: 1,
        },
      },
    }),
    context.prisma.projectEmployeeAllocation.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      select: { employmentId: true, personId: true },
    }),
    context.prisma.projectMachineAllocation.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      select: { machineId: true },
    }),
    context.prisma.machine.findMany({
      where: {
        corporationId: scope.corporationId,
        isActive: true,
        ownershipPeriods: {
          some: { companyId: scope.companyId, effectiveTo: null },
        },
      },
      orderBy: { name: "asc" },
      take: 300,
      select: {
        id: true,
        name: true,
        meterReadings: {
          where: { status: "CONFIRMED" },
          orderBy: { readingSequence: "desc" },
          take: 1,
          select: { id: true, value: true },
        },
      },
    }),
    context.prisma.jobRole.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    context.prisma.supplierOffer.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        id: true,
        supplierId: true,
        itemId: true,
        purchaseUnitId: true,
        conversionToBase: true,
      },
    }),
    context.prisma.fuelSupplier.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        removedAt: null,
        isGlobal: true,
      },
      orderBy: { displayName: "asc" },
      take: 300,
      select: {
        id: true,
        displayName: true,
        tradeName: true,
        documentType: true,
        ciphertext: true,
        iv: true,
        authTag: true,
        encryptionKeyVersion: true,
      },
    }),
    context.prisma.suppliedItem.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        isActive: true,
        isGlobal: true,
      },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        baseUnitId: true,
        categoryId: true,
        isActive: true,
      },
    }),
    context.prisma.suppliedItemCategory.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        systemKey: true,
        isActive: true,
      },
    }),
    context.prisma.measurementUnit.findMany({
      where: {
        isActive: true,
        OR: [
          { corporationId: null, companyId: null },
          { corporationId: scope.corporationId, companyId: scope.companyId },
        ],
      },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  const [offerSuppliers, offerItems, offerUnits, offerPrices] =
    await Promise.all([
      context.prisma.fuelSupplier.findMany({
        where: {
          id: {
            in: [...new Set(supplierOffers.map((item) => item.supplierId))],
          },
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          isActive: true,
          removedAt: null,
          isGlobal: true,
        },
        select: {
          id: true,
          displayName: true,
          tradeName: true,
          documentType: true,
          ciphertext: true,
          iv: true,
          authTag: true,
          encryptionKeyVersion: true,
        },
      }),
      context.prisma.suppliedItem.findMany({
        where: {
          id: { in: [...new Set(supplierOffers.map((item) => item.itemId))] },
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          isActive: true,
          isGlobal: true,
        },
        select: {
          id: true,
          name: true,
          baseUnitId: true,
          categoryId: true,
          isActive: true,
        },
      }),
      context.prisma.measurementUnit.findMany({
        where: {
          id: {
            in: [...new Set(supplierOffers.map((item) => item.purchaseUnitId))],
          },
          isActive: true,
          OR: [
            { corporationId: null, companyId: null },
            { corporationId: scope.corporationId, companyId: scope.companyId },
          ],
        },
        select: { id: true, code: true, name: true },
      }),
      context.prisma.supplierOfferPrice.findMany({
        where: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          offerId: { in: supplierOffers.map((item) => item.id) },
          effectiveTo: null,
        },
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        select: { offerId: true, price: true, effectiveFrom: true },
      }),
    ]);
  const offerSupplierMap = new Map(
    offerSuppliers.map((item) => [item.id, item]),
  );
  const offerItemMap = new Map(offerItems.map((item) => [item.id, item]));
  const offerUnitMap = new Map(offerUnits.map((item) => [item.id, item]));
  const offerPriceMap = new Map(
    offerPrices.map((item) => [item.offerId, item]),
  );
  const categoryStates = buildCatalogCategoryStates(suppliedItemCategories);

  const currentEmploymentIds = new Set(
    currentEmployeeAllocations.map((item) => item.employmentId),
  );
  const currentPersonIds = new Set(
    currentEmployeeAllocations.map((item) => item.personId),
  );
  const currentMachineIds = new Set(
    currentMachineAllocations.map((item) => item.machineId),
  );

  const [otherEmployeeAllocations, otherMachineAllocations] = await Promise.all(
    [
      context.prisma.projectEmployeeAllocation.findMany({
        where: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          personId: { in: employments.map((item) => item.personId) },
          effectiveTo: null,
          NOT: { projectId },
        },
        select: { personId: true },
      }),
      context.prisma.projectMachineAllocation.findMany({
        where: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          machineId: { in: machines.map((item) => item.id) },
          effectiveTo: null,
          NOT: { projectId },
        },
        select: { machineId: true },
      }),
    ],
  );
  const unavailablePersonIds = new Set(
    otherEmployeeAllocations.map((item) => item.personId),
  );
  const unavailableMachineIds = new Set(
    otherMachineAllocations.map((item) => item.machineId),
  );

  return {
    clients: clients.map((client) => ({
      id: client.id,
      label: client.displayName,
      detail: toMaskedDocumentDto(client).maskedDocument,
    })),
    employees: employments
      .filter(
        (employment) =>
          !unavailablePersonIds.has(employment.personId) ||
          currentPersonIds.has(employment.personId),
      )
      .map((employment) => {
        const role = employment.jobRolePeriods[0];
        return {
          id: employment.id,
          label: employment.person.displayName,
          detail: role?.jobRole.name ?? null,
          jobRolePeriodId: role?.id ?? null,
          jobRoleId: role?.jobRole.id ?? null,
          available:
            !unavailablePersonIds.has(employment.personId) ||
            currentEmploymentIds.has(employment.id),
        };
      }),
    machines: machines
      .filter(
        (machine) =>
          (!unavailableMachineIds.has(machine.id) ||
            currentMachineIds.has(machine.id)) &&
          machine.meterReadings.length > 0,
      )
      .map((machine) => ({
        id: machine.id,
        label: machine.name,
        detail: machine.meterReadings[0]
          ? decimalString(machine.meterReadings[0].value, 2)
          : null,
        readingId: machine.meterReadings[0]?.id ?? null,
        available:
          !unavailableMachineIds.has(machine.id) ||
          currentMachineIds.has(machine.id),
      })),
    jobRoles: jobRoles.map((role) => ({ id: role.id, label: role.name })),
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.displayName,
      tradeName: supplier.tradeName,
      document: toMaskedDocumentDto(supplier),
    })),
    suppliedItems: suppliedItems
      .filter((item) => itemCatalogState(categoryStates, item).effectiveActive)
      .map((item) => ({
        id: item.id,
        name: item.name,
        baseUnitId: item.baseUnitId,
        categoryId: item.categoryId,
        kind: itemCatalogState(categoryStates, item).kind,
      })),
    suppliedItemCategories: suppliedItemCategories
      .filter(
        (category) => categoryStates.get(category.id)?.effectiveActive ?? false,
      )
      .map((category) => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        systemKey: category.systemKey,
        kind: categoryStates.get(category.id)?.kind ?? "material",
      })),
    measurementUnits,
    supplierOffers: supplierOffers
      .filter((offer) => {
        const supplier = offerSupplierMap.get(offer.supplierId);
        const item = offerItemMap.get(offer.itemId);
        const unit = offerUnitMap.get(offer.purchaseUnitId);
        const price = offerPriceMap.get(offer.id);
        return Boolean(supplier && item && unit && price);
      })
      .map((offer) => {
        const supplier = offerSupplierMap.get(offer.supplierId)!;
        const item = offerItemMap.get(offer.itemId)!;
        const unit = offerUnitMap.get(offer.purchaseUnitId)!;
        const price = offerPriceMap.get(offer.id)!;
        const state = itemCatalogState(categoryStates, item);
        return {
          id: offer.id,
          supplier: {
            id: supplier.id,
            name: supplier.displayName,
            tradeName: supplier.tradeName,
            document: toMaskedDocumentDto(supplier),
          },
          item: {
            id: item.id,
            name: item.name,
            baseUnitId: item.baseUnitId,
          },
          purchaseUnit: unit,
          conversionToBase: decimalString(offer.conversionToBase, 6),
          currentPrice: {
            price: decimalString(price.price, 4),
            effectiveFrom: price.effectiveFrom.toISOString(),
          },
          kind: state.kind,
        };
      }),
  };
}

async function buildProjectSnapshot(
  context: HandlerContext,
  scope: ProjectScope,
  projectId: string,
) {
  const scopeWhere = {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
    projectId,
  };
  const project = await context.prisma.project.findFirst({
    where: {
      id: projectId,
      corporationId: scope.corporationId,
      companyId: scope.companyId,
    },
  });
  if (!project) projectNotFound();

  const [
    baseline,
    clientPeriod,
    managerTenure,
    technicalResponsibilities,
    scheduleRevision,
    employeeAllocations,
    machineAllocations,
    supplierOffers,
    productionMetricTargets,
    compensationPaymentTerms,
    quantityBaselineRevision,
    workFronts,
    workFrontServices,
    workFrontEmployeeAssignments,
    workFrontMachineAssignments,
    productionQuantityGroups,
  ] = await Promise.all([
    context.prisma.projectBaseline.findFirst({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    }),
    context.prisma.projectClientPeriod.findFirst({
      where: { ...scopeWhere, effectiveTo: null },
    }),
    context.prisma.projectManagerTenure.findFirst({
      where: { ...scopeWhere, effectiveTo: null },
    }),
    context.prisma.projectTechnicalResponsibility.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "asc" },
    }),
    context.prisma.projectScheduleRevision.findFirst({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    }),
    context.prisma.projectEmployeeAllocation.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "asc" },
    }),
    context.prisma.projectMachineAllocation.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "asc" },
      include: {
        shiftAssignments: {
          where: { effectiveTo: null },
          orderBy: { shift: "asc" },
        },
      },
    }),
    context.prisma.projectSupplierOffer.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "asc" },
    }),
    context.prisma.projectProductionMetricTarget.findMany({
      where: scopeWhere,
      orderBy: { metricCode: "asc" },
    }),
    context.prisma.projectCompensationPaymentTerm.findMany({
      where: scopeWhere,
      orderBy: { compensationMode: "asc" },
    }),
    context.prisma.projectQuantityBaselineRevision.findFirst({
      where: scopeWhere,
      orderBy: { revision: "desc" },
    }),
    context.prisma.projectWorkFront.findMany({
      where: scopeWhere,
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    context.prisma.projectWorkFrontService.findMany({
      where: scopeWhere,
      orderBy: { serviceCode: "asc" },
    }),
    context.prisma.projectWorkFrontEmployeeAssignment.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "asc" },
    }),
    context.prisma.projectWorkFrontMachineAssignment.findMany({
      where: { ...scopeWhere, effectiveTo: null },
      orderBy: { effectiveFrom: "asc" },
    }),
    context.prisma.projectProduction.groupBy({
      by: ["workFrontId", "serviceCodeSnapshot"],
      where: scopeWhere,
      _sum: { officialQuantity: true },
      _count: { _all: true },
    }),
  ]);

  const quantityBaselineItems = quantityBaselineRevision
    ? await context.prisma.projectQuantityBaselineItem.findMany({
        where: { revisionId: quantityBaselineRevision.id },
        orderBy: { serviceCode: "asc" },
      })
    : [];

  const [scheduleDays, breakTemplates] = scheduleRevision
    ? await Promise.all([
        context.prisma.projectScheduleDay.findMany({
          where: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            scheduleRevisionId: scheduleRevision.id,
          },
          orderBy: [{ shift: "asc" }, { dayOfWeek: "asc" }],
        }),
        context.prisma.projectBreakTemplate.findMany({
          where: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            scheduleRevisionId: scheduleRevision.id,
          },
          orderBy: [{ shift: "asc" }, { position: "asc" }],
        }),
      ])
    : [[], []];

  const employmentIds = [
    managerTenure?.employmentId,
    ...technicalResponsibilities.map((item) => item.employmentId),
    ...employeeAllocations.map((item) => item.employmentId),
    ...machineAllocations.flatMap((item) =>
      item.shiftAssignments.map(
        (assignment) => assignment.operatorEmploymentId,
      ),
    ),
    ...workFrontEmployeeAssignments.map((item) => item.employmentId),
    ...workFrontMachineAssignments.map((item) => item.operatorEmploymentId),
  ].filter((id): id is string => Boolean(id));
  const machineIds = [
    ...machineAllocations.map((item) => item.machineId),
    ...workFrontMachineAssignments.map((item) => item.machineId),
  ];
  const readingIds = machineAllocations.map((item) => item.startMeterReadingId);
  const fuelSupplierIds = supplierOffers.map((item) => item.supplierId);
  const supplierItemIds = supplierOffers.map((item) => item.itemId);
  const purchaseUnitIds = supplierOffers.map((item) => item.purchaseUnitId);
  const sourceOfferIds = supplierOffers
    .map((item) => item.sourceOfferId)
    .filter((id): id is string => Boolean(id));

  const projectSupplierOfferPrices = supplierOffers.length
    ? await context.prisma.projectSupplierOfferPrice.findMany({
        where: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          projectOfferId: { in: supplierOffers.map((item) => item.id) },
          effectiveTo: null,
        },
      })
    : [];

  const [
    client,
    employments,
    machines,
    readings,
    fuelSuppliers,
    suppliedItems,
    measurementUnits,
    sourceOffers,
  ] = await Promise.all([
    clientPeriod
      ? context.prisma.client.findFirst({
          where: {
            id: clientPeriod.clientId,
            corporationId: scope.corporationId,
            companyId: scope.companyId,
          },
          select: {
            id: true,
            displayName: true,
            documentType: true,
            ciphertext: true,
            iv: true,
            authTag: true,
            encryptionKeyVersion: true,
            isActive: true,
            removedAt: true,
          },
        })
      : null,
    employmentIds.length
      ? context.prisma.employment.findMany({
          where: {
            id: { in: [...new Set(employmentIds)] },
            corporationId: scope.corporationId,
            companyId: scope.companyId,
          },
          select: {
            id: true,
            state: true,
            isActive: true,
            person: { select: { displayName: true } },
            periods: {
              where: { effectiveTo: null },
              select: { id: true },
              take: 1,
            },
            jobRolePeriods: {
              where: { effectiveTo: null },
              select: {
                jobRole: { select: { name: true } },
              },
              take: 1,
            },
          },
        })
      : [],
    machineIds.length
      ? context.prisma.machine.findMany({
          where: {
            id: { in: [...new Set(machineIds)] },
            corporationId: scope.corporationId,
          },
          select: {
            id: true,
            name: true,
            meterType: true,
            isActive: true,
            identifiers: {
              where: { companyId: scope.companyId, releasedAt: null },
              select: { kind: true, value: true },
              take: 1,
            },
          },
        })
      : [],
    readingIds.length
      ? context.prisma.machineMeterReading.findMany({
          where: {
            id: { in: [...new Set(readingIds)] },
            corporationId: scope.corporationId,
            companyId: scope.companyId,
          },
          select: { id: true, value: true },
        })
      : [],
    fuelSupplierIds.length
      ? context.prisma.fuelSupplier.findMany({
          where: {
            id: { in: [...new Set(fuelSupplierIds)] },
            corporationId: scope.corporationId,
            companyId: scope.companyId,
          },
          select: {
            id: true,
            displayName: true,
            tradeName: true,
            documentType: true,
            ciphertext: true,
            iv: true,
            authTag: true,
            encryptionKeyVersion: true,
            isActive: true,
            removedAt: true,
          },
        })
      : [],
    supplierItemIds.length
      ? context.prisma.suppliedItem.findMany({
          where: {
            id: { in: [...new Set(supplierItemIds)] },
            corporationId: scope.corporationId,
            companyId: scope.companyId,
          },
          select: { id: true, name: true, isActive: true },
        })
      : [],
    purchaseUnitIds.length
      ? context.prisma.measurementUnit.findMany({
          where: {
            id: { in: [...new Set(purchaseUnitIds)] },
            OR: [
              { corporationId: null, companyId: null },
              {
                corporationId: scope.corporationId,
                companyId: scope.companyId,
              },
            ],
          },
          select: { id: true, code: true, name: true, isActive: true },
        })
      : [],
    sourceOfferIds.length
      ? context.prisma.supplierOffer.findMany({
          where: {
            id: { in: [...new Set(sourceOfferIds)] },
            corporationId: scope.corporationId,
            companyId: scope.companyId,
          },
          select: { id: true, isActive: true },
        })
      : [],
  ]);

  const employmentMap = new Map(employments.map((item) => [item.id, item]));
  const machineMap = new Map(machines.map((item) => [item.id, item]));
  const readingMap = new Map(readings.map((item) => [item.id, item]));
  const fuelSupplierMap = new Map(fuelSuppliers.map((item) => [item.id, item]));
  const suppliedItemMap = new Map(suppliedItems.map((item) => [item.id, item]));
  const unitMap = new Map(measurementUnits.map((item) => [item.id, item]));
  const sourceOfferMap = new Map(sourceOffers.map((item) => [item.id, item]));
  const projectOfferPriceMap = new Map(
    projectSupplierOfferPrices.map((item) => [item.projectOfferId, item]),
  );
  const currentTeamEmploymentIds = new Set(
    employeeAllocations.map((item) => item.employmentId),
  );

  const employeeDto = (employmentId: string) => {
    const employment = employmentMap.get(employmentId);
    if (!employment) return null;
    return {
      id: employment.id,
      name: employment.person.displayName,
      jobRole: employment.jobRolePeriods[0]?.jobRole.name ?? null,
      isActive:
        employment.isActive &&
        employment.state === "ACTIVE" &&
        employment.periods.length > 0,
    };
  };

  const fuelSupplierDto = (fuelSupplierId: string) => {
    const supplier = fuelSupplierMap.get(fuelSupplierId);
    if (!supplier) return null;
    return {
      id: supplier.id,
      name: supplier.displayName,
      tradeName: supplier.tradeName,
      document: toMaskedDocumentDto(supplier),
      isActive: supplier.isActive && supplier.removedAt === null,
    };
  };

  const employeeAllocationDtos = employeeAllocations.map((allocation) => ({
    id: allocation.id,
    employment: employeeDto(allocation.employmentId),
    shift: shiftDto(allocation.shift),
    jobRole: allocation.jobRole,
    monthlyWorkloadHours: allocation.monthlyWorkloadHours,
    compensationMode: allocation.compensationMode,
    compensationValue: decimalString(allocation.compensationValue, 2),
    overtimeRate: decimalString(allocation.overtimeRate, 2),
    effectiveFrom: allocation.effectiveFrom.toISOString(),
  }));

  const machineAllocationDtos = machineAllocations.map((allocation) => {
    const machine = machineMap.get(allocation.machineId);
    const reading = readingMap.get(allocation.startMeterReadingId);
    return {
      id: allocation.id,
      machine: machine
        ? {
            id: machine.id,
            name: machine.name,
            meterType: machine.meterType.toLowerCase(),
            identifier: machine.identifiers[0] ?? null,
            isActive: machine.isActive,
          }
        : null,
      operator: employeeDto(allocation.operatorEmploymentId),
      operatorAssignments: allocation.shiftAssignments.map((assignment) => ({
        id: assignment.id,
        shift: shiftDto(assignment.shift),
        operator: employeeDto(assignment.operatorEmploymentId),
        effectiveFrom: assignment.effectiveFrom.toISOString(),
      })),
      startMeterReading: reading
        ? {
            id: reading.id,
            value: decimalString(reading.value, 2),
          }
        : null,
      effectiveFrom: allocation.effectiveFrom.toISOString(),
    };
  });

  const supplierOfferDtos = supplierOffers.map((offer) => {
    const item = suppliedItemMap.get(offer.itemId);
    const unit = unitMap.get(offer.purchaseUnitId);
    const sourceOffer = offer.sourceOfferId
      ? sourceOfferMap.get(offer.sourceOfferId)
      : null;
    return {
      id: offer.id,
      usageKind: offer.usageKind,
      sourceOfferId: offer.sourceOfferId,
      sourceOfferIsActive: sourceOffer?.isActive ?? false,
      supplier: fuelSupplierDto(offer.supplierId),
      item: item
        ? { id: item.id, name: item.name, isActive: item.isActive }
        : null,
      purchaseUnit: unit
        ? {
            id: unit.id,
            code: unit.code,
            name: unit.name,
            isActive: unit.isActive,
          }
        : null,
      conversionToBase: decimalString(offer.conversionToBase, 6),
      price: decimalString(
        projectOfferPriceMap.get(offer.id)?.price ?? offer.price,
        4,
      ),
      effectiveFrom: offer.effectiveFrom.toISOString(),
    };
  });
  const fuelOfferDtos = supplierOfferDtos.filter(
    (offer) => offer.usageKind === "fuel",
  );
  const materialOfferDtos = supplierOfferDtos.filter(
    (offer) => offer.usageKind !== "fuel",
  );
  const hasInvalidProjectOffer = (offer: (typeof supplierOfferDtos)[number]) =>
    (offer.sourceOfferId !== null && !offer.sourceOfferIsActive) ||
    !offer.supplier?.isActive ||
    !offer.item?.isActive ||
    !offer.purchaseUnit?.isActive;

  const baselineItems = quantityBaselineItems.length
    ? quantityBaselineItems.map((item) => ({
        serviceCode: item.serviceCode,
        unitCode: item.unitCode,
        total: item.total,
      }))
    : productionMetricTargets.map((item) => ({
        serviceCode: item.metricCode,
        unitCode:
          serviceUnits[item.metricCode as EarthworksServiceCode] ?? "M3",
        total: item.targetTotal,
      }));
  const baselineByService = new Map(
    baselineItems.map((item) => [item.serviceCode, item]),
  );
  const allocatedByService = new Map<string, Prisma.Decimal>();
  for (const service of workFrontServices) {
    const front = workFronts.find((item) => item.id === service.workFrontId);
    if (!front || front.status === "CANCELLED") continue;
    const current =
      allocatedByService.get(service.serviceCode) ?? new Prisma.Decimal(0);
    allocatedByService.set(service.serviceCode, current.add(service.quantity));
  }
  const producedByFrontService = new Map(
    productionQuantityGroups.map((group) => [
      `${group.workFrontId}:${group.serviceCodeSnapshot}`,
      {
        quantity: group._sum.officialQuantity ?? new Prisma.Decimal(0),
        count: group._count._all,
      },
    ]),
  );
  const producedByService = new Map<string, Prisma.Decimal>();
  for (const group of productionQuantityGroups) {
    const current =
      producedByService.get(group.serviceCodeSnapshot) ?? new Prisma.Decimal(0);
    producedByService.set(
      group.serviceCodeSnapshot,
      current.add(group._sum.officialQuantity ?? 0),
    );
  }
  const quantityBaseline = {
    revision:
      quantityBaselineRevision?.revision ?? (baselineItems.length ? 1 : null),
    createdAt: quantityBaselineRevision?.createdAt.toISOString() ?? null,
    reason: quantityBaselineRevision?.reason ?? null,
    items: baselineItems.map((item) => {
      const allocated =
        allocatedByService.get(item.serviceCode) ?? new Prisma.Decimal(0);
      return {
        serviceCode: item.serviceCode,
        unitCode: item.unitCode,
        total: decimalString(item.total, 3),
        allocated: decimalString(allocated, 3),
        unallocated: decimalString(item.total.sub(allocated), 3),
        produced: decimalString(
          producedByService.get(item.serviceCode) ?? 0,
          3,
        ),
      };
    }),
  };
  const workFrontDtos = workFronts.map((front) => {
    const services = workFrontServices
      .filter((service) => service.workFrontId === front.id)
      .map((service) => {
        const produced = producedByFrontService.get(
          `${front.id}:${service.serviceCode}`,
        );
        const baseline = baselineByService.get(service.serviceCode);
        const allocated =
          allocatedByService.get(service.serviceCode) ?? new Prisma.Decimal(0);
        const maximum = baseline
          ? service.quantity.add(baseline.total.sub(allocated))
          : service.quantity;
        return {
          serviceCode: service.serviceCode,
          unitCode: service.unitCode,
          quantity: decimalString(service.quantity, 3),
          produced: decimalString(produced?.quantity ?? 0, 3),
          minimumQuantity: decimalString(produced?.quantity ?? 0, 3),
          maximumQuantity: decimalString(maximum, 3),
          hasProductions: Boolean(produced?.count),
        };
      });
    const planningBlockers = services.flatMap((service) => {
      const baseline = baselineByService.get(service.serviceCode);
      if (!baseline) return ["Serviço não está na linha de base atual."];
      if (baseline.unitCode !== service.unitCode)
        return ["Unidade do serviço diverge da linha de base."];
      const allocated =
        allocatedByService.get(service.serviceCode) ?? new Prisma.Decimal(0);
      if (allocated.gt(baseline.total))
        return [
          "A distribuição das frentes excede o quantitativo de referência.",
        ];
      return [];
    });
    if (!services.length) planningBlockers.push("Informe ao menos um serviço.");
    if (!front.requiresEmployees && !front.requiresMachines)
      planningBlockers.push("Defina ao menos uma exigência de mobilização.");
    const employeeAssignments = workFrontEmployeeAssignments
      .filter((assignment) => assignment.workFrontId === front.id)
      .map((assignment) => ({
        id: assignment.id,
        shift: shiftDto(assignment.shift),
        source: assignment.source.toLowerCase(),
        employment: employeeDto(assignment.employmentId),
        effectiveFrom: assignment.effectiveFrom.toISOString(),
      }));
    const machineAssignments = workFrontMachineAssignments
      .filter((assignment) => assignment.workFrontId === front.id)
      .map((assignment) => {
        const machine = machineMap.get(assignment.machineId);
        return {
          id: assignment.id,
          shift: shiftDto(assignment.shift),
          machine: machine
            ? {
                id: machine.id,
                name: machine.name,
                meterType: machine.meterType.toLowerCase(),
                identifier: machine.identifiers[0] ?? null,
                isActive: machine.isActive,
              }
            : null,
          operator: employeeDto(assignment.operatorEmploymentId),
          effectiveFrom: assignment.effectiveFrom.toISOString(),
        };
      });
    const startBlockers = [...planningBlockers];
    if (project.status !== "ACTIVE")
      startBlockers.push("Inicie a obra antes de preparar esta frente.");
    if (front.requiresEmployees && employeeAssignments.length === 0)
      startBlockers.push("Mobilize ao menos uma pessoa nesta frente.");
    if (front.requiresMachines && machineAssignments.length === 0)
      startBlockers.push("Mobilize ao menos uma máquina nesta frente.");
    return {
      id: front.id,
      name: front.name,
      location: front.location,
      notes: front.notes,
      plannedStartDate: civilDateString(front.plannedStartDate),
      plannedEndDate: civilDateString(front.plannedEndDate),
      requiresEmployees: front.requiresEmployees,
      requiresMachines: front.requiresMachines,
      status: front.status.toLowerCase(),
      actualStartedAt: front.actualStartedAt?.toISOString() ?? null,
      services,
      employeeAssignments,
      machineAssignments,
      mobilizationRecorded:
        employeeAssignments.length > 0 || machineAssignments.length > 0,
      planningEligibility: {
        isValid: front.status === "PLANNED" && planningBlockers.length === 0,
        blockers: planningBlockers,
      },
      eligibility: {
        canStart: front.status === "PLANNED" && startBlockers.length === 0,
        blockers: startBlockers,
      },
    };
  });

  const blockers: ReadinessBlocker[] = [];
  if (!baseline?.plannedEndDate)
    blockers.push({
      section: "dates",
      message: "Informe a data prevista de fim da obra.",
    });
  if (baselineItems.length === 0)
    blockers.push({
      section: "metrics",
      message: "Selecione ao menos uma métrica de produção com meta total.",
    });
  if (!workFrontDtos.some((front) => front.planningEligibility.isValid))
    blockers.push({
      section: "fronts",
      message: "Cadastre uma frente planejada válida para iniciar a obra.",
    });
  if (
    fuelOfferDtos.length === 0 ||
    fuelOfferDtos.some((offer) => hasInvalidProjectOffer(offer))
  )
    blockers.push({
      section: "fuel",
      message: "Confirme uma oferta ativa de combustível e o preço da obra.",
    });
  if (!client || !client.isActive || client.removedAt)
    blockers.push({
      section: "team",
      message: "Confirme um cliente ativo para a obra.",
    });
  if (!managerTenure || !employeeDto(managerTenure.employmentId)?.isActive)
    blockers.push({
      section: "team",
      message: "Confirme um gestor ativo para a obra.",
    });
  if (
    technicalResponsibilities.length === 0 ||
    technicalResponsibilities.some(
      (item) => !employeeDto(item.employmentId)?.isActive,
    )
  )
    blockers.push({
      section: "team",
      message: "Confirme ao menos um responsável técnico ativo.",
    });
  if (
    scheduleDays.length !== 7 ||
    !scheduleDays.some((day) => day.isWorking) ||
    scheduleDays.some(
      (day) =>
        (day.isWorking && (!day.startTime || !day.endTime)) ||
        (!day.isWorking && (day.startTime || day.endTime)),
    )
  )
    blockers.push({
      section: "team",
      message: "Confirme uma agenda semanal válida.",
    });
  if (
    machineAllocations.some(
      (allocation) =>
        !currentTeamEmploymentIds.has(allocation.operatorEmploymentId),
    )
  )
    blockers.push({
      section: "equipment",
      message: "Cada máquina precisa de operador presente na equipe da obra.",
    });
  if (employeeAllocationDtos.length === 0)
    blockers.push({
      section: "team",
      message: "Mobilize ao menos uma pessoa para iniciar a obra.",
    });
  if (machineAllocationDtos.length === 0)
    blockers.push({
      section: "equipment",
      message:
        "Mobilize ao menos uma máquina com operador para iniciar a obra.",
    });
  if (materialOfferDtos.some((offer) => hasInvalidProjectOffer(offer)))
    blockers.push({
      section: "items",
      message: "Revise fornecedores, itens e unidades configurados.",
    });
  const requiredPaymentModes = [
    ...new Set(
      employeeAllocationDtos.map((item) => item.compensationMode).sort(),
    ),
  ];
  const suppliedPaymentModes = compensationPaymentTerms
    .map((item) => item.compensationMode)
    .sort();
  if (
    requiredPaymentModes.length !== suppliedPaymentModes.length ||
    requiredPaymentModes.some(
      (mode, index) => mode !== suppliedPaymentModes[index],
    )
  )
    blockers.push({
      section: "payments",
      message:
        "Defina o prazo de pagamento para cada modalidade presente na equipe.",
    });

  return {
    id: project.id,
    name: project.name,
    address: {
      formatted: project.address,
      postalCode: project.addressPostalCode,
      street: project.addressStreet,
      number: project.addressNumber,
      complement: project.addressComplement,
      neighborhood: project.addressNeighborhood,
      city: project.addressCity,
      state: project.addressState,
    },
    latitude: project.latitude ? decimalString(project.latitude, 6) : null,
    longitude: project.longitude ? decimalString(project.longitude, 6) : null,
    contractNumber: project.contractNumber,
    status: statusDto(project.status),
    actualStartedAt: project.actualStartedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    baseline: baseline
      ? {
          approvedBudget: decimalString(baseline.approvedBudget, 2),
          plannedStartDate: civilDateString(baseline.plannedStartDate),
          plannedEndDate: civilDateString(baseline.plannedEndDate),
          effectiveFrom: baseline.effectiveFrom.toISOString(),
        }
      : null,
    client: client
      ? {
          id: client.id,
          name: client.displayName,
          document: toMaskedDocumentDto(client),
          isActive: client.isActive && client.removedAt === null,
        }
      : null,
    manager: managerTenure ? employeeDto(managerTenure.employmentId) : null,
    technicalResponsibilities: technicalResponsibilities
      .map((item) => employeeDto(item.employmentId))
      .filter(Boolean),
    schedule: {
      shifts: [...new Set(scheduleDays.map((day) => shiftDto(day.shift)))],
      days: scheduleDays.map((day) => ({
        shift: shiftDto(day.shift),
        dayOfWeek: day.dayOfWeek,
        isWorking: day.isWorking,
        startTime: day.startTime,
        endTime: day.endTime,
        endDayOffset: day.endDayOffset,
      })),
      breakTemplates: breakTemplates.map((item) => ({
        id: item.id,
        shift: shiftDto(item.shift),
        name: item.name,
        durationMinutes: item.durationMinutes,
      })),
    },
    employeeAllocations: employeeAllocationDtos,
    machineAllocations: machineAllocationDtos,
    fuelOffers: fuelOfferDtos,
    supplierOffers: materialOfferDtos,
    productionMetricTargets: productionMetricTargets.map((item) => ({
      metricCode: item.metricCode,
      targetTotal: decimalString(item.targetTotal, 3),
    })),
    quantityBaseline,
    workFronts: workFrontDtos,
    compensationPaymentTerms: compensationPaymentTerms.map((item) => ({
      compensationMode: item.compensationMode,
      daysAfterPeriodEnd: item.daysAfterPeriodEnd,
    })),
    readiness: {
      canActivate: blockers.length === 0,
      blockers,
    },
  };
}

export class ProjectsHandler {
  constructor(private readonly context: HandlerContext) {}

  async finalize(
    scope: ProjectScope,
    expectedCompanyId: string,
    key: string,
    command: ProjectCommand,
  ) {
    const requestHash = hashProjectCommand(command);
    try {
      return await runSerializable(this.context, async (tx) => {
        await assertWorkspace(tx, scope, expectedCompanyId);
        const existing = await tx.prisma.idempotencyRecord.findUnique({
          where: {
            sessionId_corporationId_companyId_operation_key: {
              sessionId: scope.sessionId,
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              operation,
              key,
            },
          },
        });
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw new AppError({
              code: "IDEMPOTENCY_PAYLOAD_CONFLICT",
              statusCode: 409,
              message: "Idempotency key has a different payload",
            });
          return { projectId: existing.projectId, status: "planned" as const };
        }
        const { employmentMap: employments, jobRoleMap } =
          await validateResources(tx, scope, command);
        const now = new Date();
        const formattedAddress = formatProjectAddress(command.address);
        const project = await tx.prisma.project.create({
          data: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            name: command.name,
            address: formattedAddress,
            addressPostalCode: command.address.postalCode,
            addressStreet: command.address.street,
            addressNumber: command.address.number,
            addressComplement: command.address.complement,
            addressNeighborhood: command.address.neighborhood,
            addressCity: command.address.city,
            addressState: command.address.state,
            latitude: command.latitude,
            longitude: command.longitude,
            contractNumber: command.contractNumber,
            normalizedContractNumber:
              command.contractNumber?.toLocaleLowerCase("pt-BR") ?? null,
            status: "PLANNED",
          },
        });
        await tx.prisma.projectBaseline.create({
          data: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            projectId: project.id,
            approvedBudget: command.approvedBudget,
            plannedStartDate: new Date(
              `${command.plannedStartDate}T00:00:00.000Z`,
            ),
            plannedEndDate:
              command.plannedEndDate === null
                ? null
                : new Date(`${command.plannedEndDate}T00:00:00.000Z`),
            effectiveFrom: now,
          },
        });
        await tx.prisma.projectClientPeriod.create({
          data: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            projectId: project.id,
            clientId: command.clientId,
            effectiveFrom: now,
          },
        });
        await tx.prisma.projectManagerTenure.create({
          data: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            projectId: project.id,
            employmentId: command.managerEmploymentId,
            effectiveFrom: now,
          },
        });
        await tx.prisma.projectTechnicalResponsibility.createMany({
          data: command.technicalResponsibilityEmploymentIds.map(
            (employmentId) => ({
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              projectId: project.id,
              employmentId,
              effectiveFrom: now,
            }),
          ),
        });
        const schedule = await tx.prisma.projectScheduleRevision.create({
          data: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            projectId: project.id,
            effectiveFrom: now,
          },
        });
        await tx.prisma.projectScheduleDay.createMany({
          data: command.weeklySchedule.map((day) => ({
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            scheduleRevisionId: schedule.id,
            dayOfWeek: day.dayOfWeek,
            isWorking: day.isWorking,
            startTime: day.startTime,
            endTime: day.endTime,
            endDayOffset: day.endDayOffset,
            shift: dbShift(day.shift),
          })),
        });
        if (command.breakTemplates.length)
          await tx.prisma.projectBreakTemplate.createMany({
            data: command.breakTemplates.map((item, position) => ({
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              scheduleRevisionId: schedule.id,
              position,
              shift: dbShift(item.shift),
              name: item.name,
              durationMinutes: item.durationMinutes,
            })),
          });
        for (const allocation of command.initialEmployeeAllocations) {
          const employment = employments.get(allocation.employmentId)!;
          const currentRole = employment.jobRolePeriods[0];
          const confirmedRole = allocation.confirmedJobRoleId
            ? jobRoleMap.get(allocation.confirmedJobRoleId)!
            : allocation.confirmedJobRoleName
              ? null
              : currentRole!.jobRole;
          const referencesEmploymentRole =
            confirmedRole !== null &&
            currentRole?.jobRole.id === confirmedRole.id;
          const jobRoleName =
            allocation.confirmedJobRoleName ?? confirmedRole?.name;
          if (!jobRoleName)
            throw new AppError({
              code: "VALIDATION_ERROR",
              message: "A job role must be confirmed",
              statusCode: 400,
            });
          await tx.prisma.projectEmployeeAllocation.create({
            data: {
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              projectId: project.id,
              personId: employment.personId,
              effectiveFrom: now,
              employmentId: allocation.employmentId,
              shift: dbShift(allocation.shift),
              employmentJobRolePeriodId: referencesEmploymentRole
                ? currentRole?.id
                : null,
              jobRole: jobRoleName,
              monthlyWorkloadHours: allocation.monthlyWorkloadHours,
              compensationMode: allocation.compensationMode,
              compensationValue: allocation.compensationValue,
              overtimeRate: allocation.overtimeRate,
              createdByUserId: scope.userId,
            },
          });
        }
        for (const allocation of command.initialMachineAllocations) {
          const row = await tx.prisma.projectMachineAllocation.create({
            data: {
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              projectId: project.id,
              effectiveFrom: now,
              machineId: allocation.machineId,
              startMeterReadingId: allocation.startMeterReadingId,
              operatorEmploymentId: allocation.operatorEmploymentId,
            },
          });
          await tx.prisma.projectMachineShiftAssignment.createMany({
            data: allocation.operatorAssignments.map((assignment) => ({
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              projectId: project.id,
              projectMachineAllocationId: row.id,
              machineId: allocation.machineId,
              shift: dbShift(assignment.shift),
              operatorEmploymentId: assignment.operatorEmploymentId,
              effectiveFrom: now,
              createdByUserId: scope.userId,
            })),
          });
          await tx.prisma.machineMeterReadingReference.create({
            data: {
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              machineId: allocation.machineId,
              readingId: allocation.startMeterReadingId,
              sourceType: "PROJECT_ALLOCATION",
              sourceId: row.id,
            },
          });
        }
        for (const offer of command.projectSupplierOffers) {
          const supplierId =
            offer.supplierId ??
            (await createInlineSupplier(
              tx,
              scope,
              project.id,
              offer.supplier!,
            ));
          const itemId =
            offer.itemId ??
            (await createInlineItem(tx, scope, project.id, offer.item!));
          const row = await tx.prisma.projectSupplierOffer.create({
            data: {
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              projectId: project.id,
              usageKind: "material",
              supplierId,
              itemId,
              sourceOfferId: offer.sourceOfferId ?? null,
              purchaseUnitId: offer.purchaseUnitId,
              conversionToBase: offer.conversionToBase,
              price: offer.price,
              effectiveFrom: now,
            },
            select: { id: true },
          });
          await tx.prisma.projectSupplierOfferPrice.create({
            data: {
              corporationId: scope.corporationId,
              companyId: scope.companyId,
              projectOfferId: row.id,
              price: offer.price,
              effectiveFrom: now,
            },
          });
        }
        await tx.prisma.idempotencyRecord.create({
          data: {
            sessionId: scope.sessionId,
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            operation,
            key,
            requestHash,
            projectId: project.id,
            completedAt: now,
            expiresAt: new Date(now.getTime() + 30 * 86_400_000),
          },
        });
        return { projectId: project.id, status: "planned" as const };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const completed =
          await this.context.prisma.idempotencyRecord.findUnique({
            where: {
              sessionId_corporationId_companyId_operation_key: {
                sessionId: scope.sessionId,
                corporationId: scope.corporationId,
                companyId: scope.companyId,
                operation,
                key,
              },
            },
          });
        if (completed) {
          if (completed.requestHash !== requestHash)
            throw new AppError({
              code: "IDEMPOTENCY_PAYLOAD_CONFLICT",
              statusCode: 409,
              message: "Idempotency key has a different payload",
            });
          return { projectId: completed.projectId, status: "planned" as const };
        }
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2003", "P2004"].includes(error.code)
      )
        throw conflict();
      throw error;
    }
  }

  async saveReadiness(
    scope: ProjectScope,
    projectId: string,
    command: ProjectReadinessCommand,
  ) {
    return runSerializable(this.context, async (tx) => {
      const project = await tx.prisma.project.findFirst({
        where: {
          id: projectId,
          corporationId: scope.corporationId,
          companyId: scope.companyId,
        },
        select: { id: true, status: true },
      });
      if (!project) projectNotFound();
      if (project.status !== "PLANNED")
        projectLifecycleConflict("Only planned Projects can update readiness");

      const now = new Date();
      const scopeWhere = projectScopeWhere(scope, projectId);

      if (
        command.plannedStartDate !== undefined ||
        command.plannedEndDate !== undefined
      ) {
        const currentBaseline = await tx.prisma.projectBaseline.findFirst({
          where: { ...scopeWhere, effectiveTo: null },
          select: { plannedStartDate: true, plannedEndDate: true },
        });
        if (!currentBaseline)
          throw conflict([resource("project", projectId, "identity")]);
        const plannedStartDate = command.plannedStartDate
          ? new Date(`${command.plannedStartDate}T00:00:00.000Z`)
          : currentBaseline.plannedStartDate;
        const plannedEndDate = command.plannedEndDate
          ? new Date(`${command.plannedEndDate}T00:00:00.000Z`)
          : currentBaseline.plannedEndDate;
        if (plannedEndDate && plannedEndDate < plannedStartDate)
          validationError(
            "plannedEndDate",
            "end_before_start",
            "A data final não pode ser anterior à data inicial.",
          );
        const updatedBaseline = await tx.prisma.projectBaseline.updateMany({
          where: { ...scopeWhere, effectiveTo: null },
          data: { plannedStartDate, plannedEndDate },
        });
        if (updatedBaseline.count !== 1)
          throw conflict([resource("project", projectId, "identity")]);
      }

      if (command.productionMetricTargets !== undefined) {
        await tx.prisma.projectProductionMetricTarget.deleteMany({
          where: scopeWhere,
        });
        await tx.prisma.projectProductionMetricTarget.createMany({
          data: command.productionMetricTargets.map((target) => ({
            ...scopeWhere,
            metricCode: target.metricCode,
            targetTotal: target.targetTotal,
          })),
        });
        const currentRevision =
          await tx.prisma.projectQuantityBaselineRevision.findFirst({
            where: scopeWhere,
            orderBy: { revision: "desc" },
            select: { revision: true },
          });
        const revision = await tx.prisma.projectQuantityBaselineRevision.create(
          {
            data: {
              ...scopeWhere,
              revision: (currentRevision?.revision ?? 0) + 1,
              reason: "Atualização dos quantitativos de referência",
              createdByUserId: scope.userId,
            },
            select: { id: true },
          },
        );
        await tx.prisma.projectQuantityBaselineItem.createMany({
          data: command.productionMetricTargets.map((target) => ({
            revisionId: revision.id,
            serviceCode: target.metricCode,
            unitCode: serviceUnits[target.metricCode as EarthworksServiceCode],
            total: target.targetTotal,
          })),
        });
      }

      if (command.fuelOffers !== undefined)
        await replaceProjectOffers(
          tx,
          scope,
          projectId,
          "fuel",
          command.fuelOffers,
          now,
        );

      if (command.materialOffers !== undefined)
        await replaceProjectOffers(
          tx,
          scope,
          projectId,
          "material",
          command.materialOffers,
          now,
        );

      if (command.accountability !== undefined)
        await replaceAccountability(
          tx,
          scope,
          projectId,
          command.accountability,
          now,
        );

      if (command.employeeAllocations !== undefined) {
        await replaceEmployeeAllocations(
          tx,
          scope,
          projectId,
          command.employeeAllocations,
          now,
        );
        await tx.prisma.projectCompensationPaymentTerm.deleteMany({
          where: scopeWhere,
        });
      }

      if (command.machineAllocations !== undefined)
        await replaceMachineAllocations(
          tx,
          scope,
          projectId,
          command.machineAllocations,
          now,
        );

      if (command.compensationPaymentTerms !== undefined)
        await replacePaymentTerms(
          tx,
          scope,
          projectId,
          command.compensationPaymentTerms,
        );

      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async saveQuantityBaseline(
    scope: ProjectScope,
    projectId: string,
    command: ProjectQuantityBaselineRevisionCommand,
  ) {
    assertServiceUnits(command.items);
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const project = await tx.prisma.project.findFirst({
        where: {
          id: projectId,
          corporationId: scope.corporationId,
          companyId: scope.companyId,
        },
        select: { status: true },
      });
      if (!project) projectNotFound();
      if (!["PLANNED", "ACTIVE"].includes(project.status))
        projectLifecycleConflict(
          "Project quantities cannot change in this state",
        );
      await assertQuantityBaselineCoversAllocatedFronts(
        tx,
        scope,
        projectId,
        command.items,
      );
      const scopeWhere = projectScopeWhere(scope, projectId);
      const current = await tx.prisma.projectQuantityBaselineRevision.findFirst(
        {
          where: scopeWhere,
          orderBy: { revision: "desc" },
          select: { revision: true },
        },
      );
      const revision = await tx.prisma.projectQuantityBaselineRevision.create({
        data: {
          ...scopeWhere,
          revision: (current?.revision ?? 0) + 1,
          reason: command.reason,
          createdByUserId: scope.userId,
        },
        select: { id: true },
      });
      await tx.prisma.projectQuantityBaselineItem.createMany({
        data: command.items.map((item) => ({
          revisionId: revision.id,
          serviceCode: item.serviceCode,
          unitCode: item.unitCode,
          total: item.total,
        })),
      });
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async createWorkFront(
    scope: ProjectScope,
    projectId: string,
    command: ProjectWorkFrontCommand,
  ) {
    assertServiceUnits(command.services);
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const project = await tx.prisma.project.findFirst({
        where: {
          id: projectId,
          corporationId: scope.corporationId,
          companyId: scope.companyId,
        },
        select: { status: true },
      });
      if (!project) projectNotFound();
      if (!["PLANNED", "ACTIVE"].includes(project.status))
        projectLifecycleConflict("Project does not accept new work fronts");
      await assertWorkFrontAllocationWithinBaseline(
        tx,
        scope,
        projectId,
        command.services,
      );
      const front = await tx.prisma.projectWorkFront.create({
        data: {
          ...projectScopeWhere(scope, projectId),
          name: command.name,
          location: command.location,
          notes: command.notes,
          plannedStartDate: command.plannedStartDate
            ? new Date(`${command.plannedStartDate}T00:00:00.000Z`)
            : null,
          plannedEndDate: command.plannedEndDate
            ? new Date(`${command.plannedEndDate}T00:00:00.000Z`)
            : null,
          requiresEmployees: command.requiresEmployees,
          requiresMachines: command.requiresMachines,
        },
        select: { id: true },
      });
      await tx.prisma.projectWorkFrontService.createMany({
        data: command.services.map((service) => ({
          ...projectScopeWhere(scope, projectId),
          workFrontId: front.id,
          serviceCode: service.serviceCode,
          unitCode: service.unitCode,
          quantity: service.quantity,
        })),
      });
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async updateWorkFront(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
    command: ProjectWorkFrontCommand,
  ) {
    assertServiceUnits(command.services);
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const front = await tx.prisma.projectWorkFront.findFirst({
        where: { id: frontId, ...projectScopeWhere(scope, projectId) },
        select: { status: true },
      });
      if (!front) projectNotFound();
      if (front.status !== "PLANNED")
        projectLifecycleConflict("Only planned work fronts can be edited");
      await assertWorkFrontAllocationWithinBaseline(
        tx,
        scope,
        projectId,
        command.services,
        frontId,
      );
      await assertWorkFrontServicesCoverProduction(
        tx,
        scope,
        projectId,
        frontId,
        command.services,
      );
      await tx.prisma.projectWorkFront.updateMany({
        where: {
          id: frontId,
          ...projectScopeWhere(scope, projectId),
          status: "PLANNED",
        },
        data: {
          name: command.name,
          location: command.location,
          notes: command.notes,
          plannedStartDate: command.plannedStartDate
            ? new Date(`${command.plannedStartDate}T00:00:00.000Z`)
            : null,
          plannedEndDate: command.plannedEndDate
            ? new Date(`${command.plannedEndDate}T00:00:00.000Z`)
            : null,
          requiresEmployees: command.requiresEmployees,
          requiresMachines: command.requiresMachines,
        },
      });
      await reconcileWorkFrontServices(
        tx,
        scope,
        projectId,
        frontId,
        command.services,
      );
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async saveWorkFrontServices(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
    command: ProjectWorkFrontServicesCommand,
  ) {
    assertServiceUnits(command.services);
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const front = await tx.prisma.projectWorkFront.findFirst({
        where: { id: frontId, ...projectScopeWhere(scope, projectId) },
        select: { status: true, project: { select: { status: true } } },
      });
      if (!front) projectNotFound();
      if (
        (front.status !== "PLANNED" && front.status !== "ACTIVE") ||
        (front.project.status !== "PLANNED" &&
          front.project.status !== "ACTIVE")
      )
        projectLifecycleConflict(
          "Work front services cannot change in this state",
        );
      await assertWorkFrontAllocationWithinBaseline(
        tx,
        scope,
        projectId,
        command.services,
        frontId,
      );
      await assertWorkFrontServicesCoverProduction(
        tx,
        scope,
        projectId,
        frontId,
        command.services,
      );
      await reconcileWorkFrontServices(
        tx,
        scope,
        projectId,
        frontId,
        command.services,
      );
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async saveEmployeeMobilization(
    scope: ProjectScope,
    projectId: string,
    command: ProjectEmployeeMobilizationCommand,
  ) {
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const project = await tx.prisma.project.findFirst({
        where: {
          id: projectId,
          corporationId: scope.corporationId,
          companyId: scope.companyId,
        },
        select: { status: true },
      });
      if (!project) projectNotFound();
      if (!["PLANNED", "ACTIVE"].includes(project.status))
        projectLifecycleConflict(
          "Project does not accept mobilization changes",
        );
      const scheduleEnablesNight = command.weeklySchedule?.some(
        (day) => day.shift === "night",
      );
      if (
        scheduleEnablesNight &&
        command.weeklySchedule &&
        command.breakTemplates
      )
        await replaceProjectSchedule(
          tx,
          scope,
          projectId,
          command.weeklySchedule,
          command.breakTemplates,
          new Date(),
        );
      await replaceEmployeeAllocations(
        tx,
        scope,
        projectId,
        command.allocations,
        new Date(),
        command.reason ?? "Atualização da equipe mobilizada na obra",
      );
      if (
        scheduleEnablesNight === false &&
        command.weeklySchedule &&
        command.breakTemplates
      )
        await replaceProjectSchedule(
          tx,
          scope,
          projectId,
          command.weeklySchedule,
          command.breakTemplates,
          new Date(),
        );
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async saveMachineMobilization(
    scope: ProjectScope,
    projectId: string,
    command: ProjectMachineMobilizationCommand,
  ) {
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const project = await tx.prisma.project.findFirst({
        where: {
          id: projectId,
          corporationId: scope.corporationId,
          companyId: scope.companyId,
        },
        select: { status: true },
      });
      if (!project) projectNotFound();
      if (!["PLANNED", "ACTIVE"].includes(project.status))
        projectLifecycleConflict(
          "Project does not accept mobilization changes",
        );
      await replaceMachineAllocations(
        tx,
        scope,
        projectId,
        command.allocations,
        new Date(),
        command.reason ?? "Atualização das máquinas mobilizadas na obra",
      );
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async saveWorkFrontMobilization(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
    command: ProjectWorkFrontMobilizationCommand,
  ) {
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const scopeWhere = projectScopeWhere(scope, projectId);
      const [project, front, employeePool, machineAllocationPool] =
        await Promise.all([
          tx.prisma.project.findFirst({
            where: {
              id: projectId,
              corporationId: scope.corporationId,
              companyId: scope.companyId,
            },
            select: { status: true },
          }),
          tx.prisma.projectWorkFront.findFirst({
            where: { id: frontId, ...scopeWhere },
            select: { status: true },
          }),
          tx.prisma.projectEmployeeAllocation.findMany({
            where: {
              ...scopeWhere,
              employmentId: { in: command.employmentIds },
              effectiveTo: null,
            },
            select: { employmentId: true, shift: true },
          }),
          tx.prisma.projectMachineAllocation.findMany({
            where: {
              ...scopeWhere,
              machineId: { in: command.machineIds },
              effectiveTo: null,
            },
            select: {
              machineId: true,
              shiftAssignments: {
                where: { effectiveTo: null },
                select: { shift: true, operatorEmploymentId: true },
              },
            },
          }),
        ]);
      const requestedMachineKeys = new Set(
        command.machineAssignments.map(
          (item) => `${item.machineId}:${dbShift(item.shift)}`,
        ),
      );
      const machinePool = machineAllocationPool.flatMap((allocation) =>
        allocation.shiftAssignments
          .filter((assignment) =>
            requestedMachineKeys.has(
              `${allocation.machineId}:${assignment.shift}`,
            ),
          )
          .map((assignment) => ({
            machineId: allocation.machineId,
            shift: assignment.shift,
            operatorEmploymentId: assignment.operatorEmploymentId,
          })),
      );
      if (!project || !front) projectNotFound();
      if (project.status !== "ACTIVE")
        projectLifecycleConflict(
          "Start the Project before preparing a work front",
        );
      if (!["PLANNED", "ACTIVE"].includes(front.status))
        projectLifecycleConflict("Work front does not accept mobilization");
      if (employeePool.length !== command.employmentIds.length)
        throw conflict([
          resource(
            "employee",
            command.employmentIds.find(
              (id) => !employeePool.some((item) => item.employmentId === id),
            ) ?? projectId,
            "fronts",
          ),
        ]);
      if (machinePool.length !== command.machineAssignments.length)
        throw conflict([
          resource(
            "machine",
            command.machineAssignments.find(
              (requested) =>
                !machinePool.some(
                  (item) =>
                    item.machineId === requested.machineId &&
                    item.shift === dbShift(requested.shift),
                ),
            )?.machineId ?? projectId,
            "fronts",
          ),
        ]);

      const directEmployees = new Set(command.employmentIds);
      const operatorEmployees = new Set(
        machinePool.map((item) => item.operatorEmploymentId),
      );
      const desiredEmployees = new Set([
        ...directEmployees,
        ...operatorEmployees,
      ]);
      const employeeShiftById = new Map(
        employeePool.map((item) => [item.employmentId, item.shift]),
      );
      for (const item of machinePool)
        employeeShiftById.set(item.operatorEmploymentId, item.shift);
      const [occupiedEmployee, occupiedMachine] = await Promise.all([
        desiredEmployees.size
          ? tx.prisma.projectWorkFrontEmployeeAssignment.findFirst({
              where: {
                ...scopeWhere,
                employmentId: { in: [...desiredEmployees] },
                effectiveTo: null,
                NOT: { workFrontId: frontId },
              },
              select: { employmentId: true, workFrontId: true },
            })
          : null,
        command.machineAssignments.length
          ? tx.prisma.projectWorkFrontMachineAssignment.findFirst({
              where: {
                ...scopeWhere,
                OR: command.machineAssignments.map((item) => ({
                  machineId: item.machineId,
                  shift: dbShift(item.shift),
                })),
                effectiveTo: null,
                NOT: { workFrontId: frontId },
              },
              select: { machineId: true, workFrontId: true },
            })
          : null,
      ]);
      if (occupiedEmployee)
        throw conflict([
          resource(
            "employee",
            occupiedEmployee.employmentId,
            "fronts",
            "assigned-to-front",
          ),
        ]);
      if (occupiedMachine)
        throw conflict([
          resource(
            "machine",
            occupiedMachine.machineId,
            "fronts",
            "assigned-to-front",
          ),
        ]);

      const [currentEmployees, currentMachines] = await Promise.all([
        tx.prisma.projectWorkFrontEmployeeAssignment.findMany({
          where: { ...scopeWhere, workFrontId: frontId, effectiveTo: null },
        }),
        tx.prisma.projectWorkFrontMachineAssignment.findMany({
          where: { ...scopeWhere, workFrontId: frontId, effectiveTo: null },
        }),
      ]);
      const sourceFor = (employmentId: string) =>
        directEmployees.has(employmentId) && operatorEmployees.has(employmentId)
          ? ("BOTH" as const)
          : directEmployees.has(employmentId)
            ? ("DIRECT" as const)
            : ("MACHINE_OPERATOR" as const);
      const employeeRowsToClose = currentEmployees.filter(
        (item) =>
          !desiredEmployees.has(item.employmentId) ||
          item.source !== sourceFor(item.employmentId) ||
          item.shift !== employeeShiftById.get(item.employmentId),
      );
      const desiredMachineMap = new Map(
        machinePool.map((item) => [`${item.machineId}:${item.shift}`, item]),
      );
      const machineRowsToClose = currentMachines.filter((item) => {
        const desired = desiredMachineMap.get(
          `${item.machineId}:${item.shift}`,
        );
        return (
          !desired || desired.operatorEmploymentId !== item.operatorEmploymentId
        );
      });
      const now = new Date();
      const endedReason =
        command.reason ?? "Atualização da mobilização da frente";
      if (employeeRowsToClose.length)
        await tx.prisma.projectWorkFrontEmployeeAssignment.updateMany({
          where: { id: { in: employeeRowsToClose.map((item) => item.id) } },
          data: {
            effectiveTo: now,
            endedByUserId: scope.userId,
            endedReason,
          },
        });
      if (machineRowsToClose.length)
        await tx.prisma.projectWorkFrontMachineAssignment.updateMany({
          where: { id: { in: machineRowsToClose.map((item) => item.id) } },
          data: {
            effectiveTo: now,
            endedByUserId: scope.userId,
            endedReason,
          },
        });

      const remainingEmployeeIds = new Set(
        currentEmployees
          .filter(
            (item) => !employeeRowsToClose.some((row) => row.id === item.id),
          )
          .map((item) => item.employmentId),
      );
      const employeesToCreate = [...desiredEmployees].filter(
        (employmentId) => !remainingEmployeeIds.has(employmentId),
      );
      if (employeesToCreate.length)
        await tx.prisma.projectWorkFrontEmployeeAssignment.createMany({
          data: employeesToCreate.map((employmentId) => ({
            ...scopeWhere,
            workFrontId: frontId,
            employmentId,
            shift: employeeShiftById.get(employmentId)!,
            source: sourceFor(employmentId),
            effectiveFrom: now,
            createdByUserId: scope.userId,
          })),
        });
      const remainingMachineKeys = new Set(
        currentMachines
          .filter(
            (item) => !machineRowsToClose.some((row) => row.id === item.id),
          )
          .map((item) => `${item.machineId}:${item.shift}`),
      );
      const machinesToCreate = machinePool.filter(
        (item) => !remainingMachineKeys.has(`${item.machineId}:${item.shift}`),
      );
      if (machinesToCreate.length)
        await tx.prisma.projectWorkFrontMachineAssignment.createMany({
          data: machinesToCreate.map((item) => ({
            ...scopeWhere,
            workFrontId: frontId,
            machineId: item.machineId,
            shift: item.shift,
            operatorEmploymentId: item.operatorEmploymentId,
            effectiveFrom: now,
            createdByUserId: scope.userId,
          })),
        });
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async startWorkFront(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
  ) {
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const snapshot = await buildProjectSnapshot(tx, scope, projectId);
      if (snapshot.status !== "active")
        projectLifecycleConflict(
          "Start the Project before starting a work front",
        );
      const front = snapshot.workFronts.find((item) => item.id === frontId);
      if (!front) projectNotFound();
      if (!front.eligibility.canStart)
        throw new AppError({
          code: "WORK_FRONT_NOT_ELIGIBLE",
          statusCode: 422,
          message: "Work front is not eligible to start",
          data: {
            fields: [],
            resources: [],
            blockers: front.eligibility.blockers,
          },
        });
      const now = new Date();
      const updated = await tx.prisma.projectWorkFront.updateMany({
        where: {
          id: frontId,
          ...projectScopeWhere(scope, projectId),
          status: "PLANNED",
        },
        data: { status: "ACTIVE", actualStartedAt: now },
      });
      if (updated.count !== 1) projectLifecycleConflict("Work front changed");
      await tx.prisma.projectWorkFrontLifecycleEvent.create({
        data: {
          ...projectScopeWhere(scope, projectId),
          workFrontId: frontId,
          fromStatus: "PLANNED",
          toStatus: "ACTIVE",
          occurredAt: now,
          actorUserId: scope.userId,
          reason: null,
        },
      });
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async cancelWorkFront(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
  ) {
    return runSerializable(this.context, async (tx) => {
      const front = await tx.prisma.projectWorkFront.findFirst({
        where: { id: frontId, ...projectScopeWhere(scope, projectId) },
        select: { status: true },
      });
      if (!front) projectNotFound();
      if (front.status !== "PLANNED")
        projectLifecycleConflict("Only planned work fronts can be cancelled");
      const now = new Date();
      const updated = await tx.prisma.projectWorkFront.updateMany({
        where: {
          id: frontId,
          ...projectScopeWhere(scope, projectId),
          status: "PLANNED",
        },
        data: { status: "CANCELLED" },
      });
      if (updated.count !== 1) projectLifecycleConflict("Work front changed");
      await Promise.all([
        tx.prisma.projectWorkFrontEmployeeAssignment.updateMany({
          where: {
            ...projectScopeWhere(scope, projectId),
            workFrontId: frontId,
            effectiveTo: null,
          },
          data: {
            effectiveTo: now,
            endedByUserId: scope.userId,
            endedReason: "Cancelamento da frente",
          },
        }),
        tx.prisma.projectWorkFrontMachineAssignment.updateMany({
          where: {
            ...projectScopeWhere(scope, projectId),
            workFrontId: frontId,
            effectiveTo: null,
          },
          data: {
            effectiveTo: now,
            endedByUserId: scope.userId,
            endedReason: "Cancelamento da frente",
          },
        }),
      ]);
      await tx.prisma.projectWorkFrontLifecycleEvent.create({
        data: {
          ...projectScopeWhere(scope, projectId),
          workFrontId: frontId,
          fromStatus: "PLANNED",
          toStatus: "CANCELLED",
          occurredAt: now,
          actorUserId: scope.userId,
          reason: null,
        },
      });
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async activate(scope: ProjectScope, projectId: string) {
    return runSerializable(this.context, async (tx) => {
      await lockProjectQuantityAllocation(tx, projectId);
      const snapshot = await buildProjectSnapshot(tx, scope, projectId);
      if (snapshot.status !== "planned")
        projectLifecycleConflict("Project is not planned");
      if (!snapshot.readiness.canActivate)
        throw new AppError({
          code: "PROJECT_RESOURCE_CONFLICT",
          statusCode: 409,
          message: "Project readiness is incomplete",
          data: {
            fields: [],
            resources: [],
            blockers: snapshot.readiness.blockers,
          },
        });

      const now = new Date();
      const updated = await tx.prisma.project.updateMany({
        where: {
          id: projectId,
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          status: "PLANNED",
          actualStartedAt: null,
        },
        data: {
          status: "ACTIVE",
          actualStartedAt: now,
        },
      });
      if (updated.count !== 1) projectLifecycleConflict("Project changed");
      await tx.prisma.projectLifecycleEvent.create({
        data: {
          corporationId: scope.corporationId,
          companyId: scope.companyId,
          projectId,
          fromStatus: "PLANNED",
          toStatus: "ACTIVE",
          occurredAt: now,
          actorUserId: scope.userId,
          reason: null,
        },
      });
      return buildProjectSnapshot(tx, scope, projectId);
    });
  }

  async mobilizationHistory(
    scope: ProjectScope,
    projectId: string,
    query: ProjectMobilizationHistoryQuery,
  ) {
    const scopeWhere = projectScopeWhere(scope, projectId);
    const project = await this.context.prisma.project.findFirst({
      where: {
        id: projectId,
        corporationId: scope.corporationId,
        companyId: scope.companyId,
      },
      select: { id: true },
    });
    if (!project) projectNotFound();
    if (query.frontId) {
      const front = await this.context.prisma.projectWorkFront.findFirst({
        where: { id: query.frontId, ...scopeWhere },
        select: { id: true },
      });
      if (!front) projectNotFound();
    }
    const resource = `project-${query.resourceType}-mobilization-history`;
    const queryBinding = { resourceType: query.resourceType };
    const cursorScope = {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      projectId,
      frontId: query.frontId ?? null,
    };
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      resource,
      scope: cursorScope,
      query: queryBinding,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const comparison = query.sortDirection === "asc" ? "gt" : "lt";
    const cursorWhere = boundary
      ? {
          OR: [
            {
              effectiveFrom: { [comparison]: new Date(String(boundary.value)) },
            },
            {
              effectiveFrom: new Date(String(boundary.value)),
              id: { [comparison]: boundary.id },
            },
          ],
        }
      : undefined;
    const page = <T extends { id: string; effectiveFrom: Date }>(items: T[]) =>
      buildCursorPage({
        items,
        limit: query.limit,
        resource,
        scope: cursorScope,
        query: queryBinding,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        getLast: (item) => ({
          value: item.effectiveFrom.toISOString(),
          id: item.id,
        }),
      });

    if (query.resourceType === "employee") {
      type EmployeeHistoryRow = {
        id: string;
        employmentId: string;
        source: string | null;
        effectiveFrom: Date;
        effectiveTo: Date | null;
        createdBy: { id: string; email: string } | null;
        endedBy: { id: string; email: string } | null;
        endedReason: string | null;
      };
      let rows: EmployeeHistoryRow[];
      if (query.frontId) {
        const found =
          await this.context.prisma.projectWorkFrontEmployeeAssignment.findMany(
            {
              where: {
                ...scopeWhere,
                workFrontId: query.frontId,
                AND: cursorWhere,
              },
              include: {
                createdBy: { select: { id: true, email: true } },
                endedBy: { select: { id: true, email: true } },
              },
              orderBy: [
                { effectiveFrom: query.sortDirection },
                { id: query.sortDirection },
              ],
              take: query.limit + 1,
            },
          );
        rows = found.map((row) => ({
          ...row,
          source: row.source.toLowerCase(),
        }));
      } else {
        const found =
          await this.context.prisma.projectEmployeeAllocation.findMany({
            where: { ...scopeWhere, AND: cursorWhere },
            include: {
              createdBy: { select: { id: true, email: true } },
              endedBy: { select: { id: true, email: true } },
            },
            orderBy: [
              { effectiveFrom: query.sortDirection },
              { id: query.sortDirection },
            ],
            take: query.limit + 1,
          });
        rows = found.map((row) => ({ ...row, source: null }));
      }
      const employmentIds = [...new Set(rows.map((row) => row.employmentId))];
      const employments = employmentIds.length
        ? await this.context.prisma.employment.findMany({
            where: {
              id: { in: employmentIds },
              corporationId: scope.corporationId,
              companyId: scope.companyId,
            },
            select: { id: true, person: { select: { displayName: true } } },
          })
        : [];
      const names = new Map(
        employments.map((item) => [item.id, item.person.displayName]),
      );
      const built = page(rows);
      return {
        data: built.data.map((row) => ({
          id: row.id,
          layer: query.frontId ? ("front" as const) : ("project" as const),
          resourceType: "employee" as const,
          resource: {
            id: row.employmentId,
            name: names.get(row.employmentId) ?? "Funcionário",
          },
          source: row.source,
          effectiveFrom: row.effectiveFrom.toISOString(),
          effectiveTo: row.effectiveTo?.toISOString() ?? null,
          createdBy: row.createdBy
            ? { id: row.createdBy.id, email: row.createdBy.email }
            : null,
          endedBy: row.endedBy
            ? { id: row.endedBy.id, email: row.endedBy.email }
            : null,
          endedReason: row.endedReason,
        })),
        pageInfo: built.pageInfo,
      };
    }

    type MachineHistoryRow = {
      id: string;
      machineId: string;
      operatorEmploymentId: string;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      createdBy: { id: string; email: string } | null;
      endedBy: { id: string; email: string } | null;
      endedReason: string | null;
    };
    let rows: MachineHistoryRow[];
    if (query.frontId) {
      rows =
        await this.context.prisma.projectWorkFrontMachineAssignment.findMany({
          where: {
            ...scopeWhere,
            workFrontId: query.frontId,
            AND: cursorWhere,
          },
          include: {
            createdBy: { select: { id: true, email: true } },
            endedBy: { select: { id: true, email: true } },
          },
          orderBy: [
            { effectiveFrom: query.sortDirection },
            { id: query.sortDirection },
          ],
          take: query.limit + 1,
        });
    } else {
      rows = await this.context.prisma.projectMachineAllocation.findMany({
        where: { ...scopeWhere, AND: cursorWhere },
        include: {
          createdBy: { select: { id: true, email: true } },
          endedBy: { select: { id: true, email: true } },
        },
        orderBy: [
          { effectiveFrom: query.sortDirection },
          { id: query.sortDirection },
        ],
        take: query.limit + 1,
      });
    }
    const machineIds = [...new Set(rows.map((row) => row.machineId))];
    const machines = machineIds.length
      ? await this.context.prisma.machine.findMany({
          where: {
            id: { in: machineIds },
            corporationId: scope.corporationId,
          },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(machines.map((item) => [item.id, item.name]));
    const built = page(rows);
    return {
      data: built.data.map((row) => ({
        id: row.id,
        layer: query.frontId ? ("front" as const) : ("project" as const),
        resourceType: "machine" as const,
        resource: {
          id: row.machineId,
          name: names.get(row.machineId) ?? "Máquina",
        },
        operatorEmploymentId: row.operatorEmploymentId,
        effectiveFrom: row.effectiveFrom.toISOString(),
        effectiveTo: row.effectiveTo?.toISOString() ?? null,
        createdBy: row.createdBy
          ? { id: row.createdBy.id, email: row.createdBy.email }
          : null,
        endedBy: row.endedBy
          ? { id: row.endedBy.id, email: row.endedBy.email }
          : null,
        endedReason: row.endedReason,
      })),
      pageInfo: built.pageInfo,
    };
  }

  async list(scope: ProjectScope, query: ProjectListQuery) {
    const normalizedSearch = query.search?.toLocaleLowerCase("pt-BR");
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      resource: "projects",
      scope: { corporationId: scope.corporationId, companyId: scope.companyId },
      query: { search: normalizedSearch },
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const comparison = query.sortDirection === "asc" ? "gt" : "lt";
    const cursorWhere: Prisma.ProjectWhereInput | undefined = boundary
      ? query.sortBy === "name"
        ? {
            OR: [
              { name: { [comparison]: String(boundary.value) } },
              {
                name: String(boundary.value),
                id: { [comparison]: boundary.id },
              },
            ],
          }
        : {
            OR: [
              { createdAt: { [comparison]: new Date(String(boundary.value)) } },
              {
                createdAt: new Date(String(boundary.value)),
                id: { [comparison]: boundary.id },
              },
            ],
          }
      : undefined;
    const searchWhere: Prisma.ProjectWhereInput | undefined = normalizedSearch
      ? {
          OR: [
            { name: { contains: query.search!, mode: "insensitive" } },
            { normalizedContractNumber: { contains: normalizedSearch } },
          ],
        }
      : undefined;
    const rows = await this.context.prisma.project.findMany({
      where: {
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        AND: [searchWhere, cursorWhere].filter(
          (item): item is Prisma.ProjectWhereInput => Boolean(item),
        ),
      },
      orderBy: [
        { [query.sortBy]: query.sortDirection },
        { id: query.sortDirection },
      ],
      take: query.limit + 1,
    });
    return buildCursorPage({
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        contractNumber: row.contractNumber,
        status: statusDto(row.status),
        actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      limit: query.limit,
      resource: "projects",
      scope: { corporationId: scope.corporationId, companyId: scope.companyId },
      query: { search: normalizedSearch },
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (row) => ({
        value: query.sortBy === "name" ? row.name : row.createdAt,
        id: row.id,
      }),
    });
  }

  async detail(scope: ProjectScope, projectId: string) {
    return buildProjectSnapshot(this.context, scope, projectId);
  }

  async readinessOptions(scope: ProjectScope, projectId: string) {
    return buildProjectReadinessOptions(this.context, scope, projectId);
  }
}

import type { Prisma } from "../../../db/generated/prisma/client";
import type { HandlerContext } from "../../../lib/utils/handler.dto";
import type {
  CursorBoundary,
  SortDirection,
} from "../../../lib/utils/cursor-pagination";
import {
  buildCursorPage,
  invalidCursorError,
  parseBoundCursor,
} from "../../../lib/utils/cursor-pagination";

export type ProductionScope = {
  corporationId: string;
  companyId: string;
  actorUserId: string;
  role: "MASTER_ADMIN";
};

export const productionDetailInclude = {
  equipment: {
    orderBy: [
      { role: "asc" as const },
      { machineNameSnapshot: "asc" as const },
    ],
    include: {
      stops: { orderBy: { createdAt: "asc" as const } },
      trips: {
        orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }],
      },
    },
  },
  trips: {
    orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }],
  },
  revisions: { orderBy: { revision: "desc" as const }, take: 20 },
  dailyReportLinks: { orderBy: { confirmedAt: "desc" as const } },
  individualActivity: true,
  materialMovement: true,
  components: {
    orderBy: { position: "asc" as const },
    include: { quantities: { orderBy: { kind: "asc" as const } } },
  },
  truckSummaries: { orderBy: { machineNameSnapshot: "asc" as const } },
  qualityChecks: { orderBy: { createdAt: "asc" as const } },
  approvals: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ProjectProductionInclude;

export type ProductionWriteData = {
  kind: "INDIVIDUAL_ACTIVITY" | "MATERIAL_MOVEMENT";
  workFrontId: string;
  workFrontServiceId: string;
  serviceCodeSnapshot: string;
  unitCodeSnapshot: string;
  productionProfileSnapshot:
    | "GENERIC"
    | "EXCAVATION"
    | "LOADING"
    | "TRANSPORT"
    | "SPREADING"
    | "GRADING"
    | "COMPACTION";
  dmtPolicySnapshot: "NOT_APPLICABLE" | "OPTIONAL" | "REQUIRED";
  productionDate: Date;
  shift: "DAY" | "NIGHT";
  shiftOrder: number;
  entryMode: "DIRECT_TOTAL" | "TRUCK_SUMMARY" | "TRIPS";
  startTime: string | null;
  endTime: string | null;
  endDayOffset: number;
  responsibleEmploymentId: string | null;
  responsibleNameSnapshot: string | null;
  location: string | null;
  startStation: string | null;
  endStation: string | null;
  layer: string | null;
  elevation: string | null;
  materialName: string | null;
  materialCategory: string | null;
  volumeCondition: "BANK" | "LOOSE" | "COMPACTED" | "PLACED" | null;
  directQuantity: string | null;
  measuredQuantity: string | null;
  officialQuantity: string;
  conversionFactor: string | null;
  origin: string | null;
  destination: string | null;
  dmtKm: string | null;
  layerThicknessCm: string | null;
  compactionPasses: number | null;
  moistureCondition: string | null;
  evidence: Prisma.InputJsonValue;
  notes: string | null;
  batchFingerprint: string | null;
  individualActivity: {
    quantityMethod: "MANUAL" | "TOPOGRAPHY" | "LABORATORY";
    location: string | null;
    startStation: string | null;
    endStation: string | null;
    layer: string | null;
    elevation: string | null;
    exceptionalFromMovement: boolean;
    exceptionReason: string | null;
    destinationKind: "FILL" | "DISPOSAL" | "OTHER" | null;
    destinationWorkFrontId: string | null;
    compactionReductionPercent: string | null;
  } | null;
  materialMovement: {
    materialRevisionId: string | null;
    routeRevisionId: string | null;
    origin: string;
    destination: string;
    layer: string | null;
    materialSnapshot: Prisma.InputJsonValue;
    routeSnapshot: Prisma.InputJsonValue;
  } | null;
  components: Array<{
    workFrontId: string;
    workFrontServiceId: string;
    componentType:
      | "INDIVIDUAL"
      | "CUT"
      | "LOADING"
      | "TRANSPORT"
      | "UNLOADING"
      | "SPREADING"
      | "COMPACTION"
      | "FILL"
      | "FINISHING";
    position: number;
    serviceCodeSnapshot: string;
    unitCodeSnapshot: string;
    volumeCondition: "BANK" | "LOOSE" | "COMPACTED" | "PLACED" | null;
    quantities: Array<{
      kind:
        | "OPERATIONAL"
        | "ESTIMATED"
        | "TECHNICALLY_ACCEPTED"
        | "CONTRACT_MEASURED";
      method:
        | "MANUAL"
        | "TRUCK_SUMMARY"
        | "TRIP_EVENTS"
        | "WEIGHBRIDGE"
        | "CONVERTED"
        | "TOPOGRAPHY"
        | "LABORATORY"
        | "CONTRACT_MEASUREMENT";
      value: string;
      unitCode: string;
      volumeCondition: "BANK" | "LOOSE" | "COMPACTED" | "PLACED" | null;
      sourceSnapshot: Prisma.InputJsonValue;
    }>;
  }>;
  truckSummaries: Array<{
    machineId: string;
    driverEmploymentId: string | null;
    driverNameSnapshot: string | null;
    machineNameSnapshot: string;
    identifierSnapshot: string | null;
    capacitySnapshot: string;
    capacityUnitCodeSnapshot: string;
    acceptedTrips: number;
    rejectedTrips: number;
    partialTripCount: number;
    partialVolume: string;
    actualWeightT: string | null;
    loadFactor: string;
    averageCycleMinutes: number | null;
    averageLoadingMinutes: string | null;
    averageUnloadingMinutes: string | null;
    dmtKm: string | null;
    occurrenceNotes: string | null;
  }>;
  equipment: Array<{
    machineId: string;
    machineNameSnapshot: string;
    manufacturerSnapshot: string;
    modelSnapshot: string;
    identifierSnapshot: string | null;
    meterTypeSnapshot: "HOUR_METER" | "ODOMETER";
    role:
      | "EXCAVATION"
      | "LOADING"
      | "TRANSPORT"
      | "SPREADING"
      | "GRADING"
      | "COMPACTION"
      | "WATERING"
      | "SUPPORT";
    operatorEmploymentId: string | null;
    operatorNameSnapshot: string | null;
    initialMeterValue: string | null;
    finalMeterValue: string | null;
    workedMinutes: number | null;
    productiveMinutes: number | null;
    waitingMinutes: number | null;
    stoppedMinutes: number | null;
    defaultTripCapacityM3: string | null;
    stops: Array<{
      durationMinutes: number;
      reason: string;
      notes: string | null;
    }>;
  }>;
};

function scopeWhere(scope: ProductionScope, projectId: string) {
  return {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
    projectId,
  };
}

export async function findProductionOptionsContextHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  interval: { startAt: Date; endAt: Date },
  shift: "DAY" | "NIGHT",
) {
  const project = await context.prisma.project.findFirst({
    where: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      id: projectId,
      status: "ACTIVE",
    },
    select: { id: true, name: true, status: true, actualStartedAt: true },
  });
  if (!project) return null;

  const fronts = await context.prisma.projectWorkFront.findMany({
    where: { ...scopeWhere(scope, projectId), status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });
  const frontIds = fronts.map((front) => front.id);
  const overlap = {
    effectiveFrom: { lte: interval.endAt },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: interval.startAt } }],
  };
  const scheduleRevision =
    await context.prisma.projectScheduleRevision.findFirst({
      where: { ...scopeWhere(scope, projectId), ...overlap },
      orderBy: { effectiveFrom: "desc" },
      select: { id: true, nightShiftEnabled: true },
    });
  const shiftEnabled =
    shift === "DAY" || Boolean(scheduleRevision?.nightShiftEnabled);
  const [services, shiftAssignments, employeeAllocations] = await Promise.all([
    frontIds.length
      ? context.prisma.projectWorkFrontService.findMany({
          where: {
            ...scopeWhere(scope, projectId),
            workFrontId: { in: frontIds },
          },
          orderBy: [{ workFrontId: "asc" }, { serviceCode: "asc" }],
        })
      : [],
    context.prisma.projectMachineShiftAssignment.findMany({
      where: {
        ...scopeWhere(scope, projectId),
        ...overlap,
        shift,
        projectMachineAllocation: { ...overlap },
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    context.prisma.projectEmployeeAllocation.findMany({
      where: { ...scopeWhere(scope, projectId), ...overlap, shift },
      orderBy: { effectiveFrom: "asc" },
    }),
  ]);
  const employmentIds = [
    ...employeeAllocations.map((item) => item.employmentId),
    ...shiftAssignments.map((item) => item.operatorEmploymentId),
  ].filter((id): id is string => Boolean(id));
  const machineIds = shiftAssignments.map((item) => item.machineId);
  const [employments, machines] = await Promise.all([
    employmentIds.length
      ? await context.prisma.employment.findMany({
          where: {
            corporationId: scope.corporationId,
            companyId: scope.companyId,
            id: { in: employmentIds },
          },
          include: { person: true },
        })
      : [],
    machineIds.length
      ? context.prisma.machine.findMany({
          where: {
            corporationId: scope.corporationId,
            id: { in: machineIds },
            isActive: true,
          },
          include: {
            transportSpecification: true,
            identifiers: {
              where: {
                companyId: scope.companyId,
                OR: [
                  { releasedAt: null },
                  { releasedAt: { gt: interval.startAt } },
                ],
              },
              orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
              take: 1,
            },
          },
        })
      : [],
  ]);
  const employmentMap = new Map(employments.map((item) => [item.id, item]));
  const machineMap = new Map(machines.map((item) => [item.id, item]));
  return {
    project,
    shiftEnabled,
    fronts,
    services,
    assignments: shiftAssignments.flatMap((assignment) => {
      const machine = machineMap.get(assignment.machineId);
      if (!machine) return [];
      return [
        {
          machineId: assignment.machineId,
          operatorEmploymentId: assignment.operatorEmploymentId,
          machine,
          operator: assignment.operatorEmploymentId
            ? (employmentMap.get(assignment.operatorEmploymentId) ?? null)
            : null,
        },
      ];
    }),
    employeeAllocations: employeeAllocations.flatMap((allocation) => {
      const employment = employmentMap.get(allocation.employmentId);
      return employment ? [{ ...allocation, employment }] : [];
    }),
  };
}

export async function listProductionTruckOptionsHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  input: {
    interval: { startAt: Date; endAt: Date };
    shift: "DAY" | "NIGHT";
    productionDate: string;
    limit: number;
    cursor?: string;
  },
) {
  const options = await findProductionOptionsContextHandler(
    context,
    scope,
    projectId,
    input.interval,
    input.shift,
  );
  if (!options) return null;
  const cursorScope = {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
    projectId,
  };
  const cursorQuery = {
    productionDate: input.productionDate,
    shift: input.shift,
  };
  const boundary = parseBoundCursor({
    cursor: input.cursor,
    resource: "production-truck-options",
    scope: cursorScope,
    query: cursorQuery,
    sortBy: "name",
    sortDirection: "asc",
  });
  const unique = new Map(
    options.assignments.flatMap((assignment) => {
      const specification = assignment.machine.transportSpecification;
      if (
        !specification ||
        specification.capacityUnitCode === "LITER" ||
        !specification.effectiveCapacity.gt(0)
      )
        return [];
      return [[assignment.machine.id, assignment] as const];
    }),
  );
  const ordered = [...unique.values()]
    .sort(
      (left, right) =>
        left.machine.name.localeCompare(right.machine.name, "pt-BR") ||
        left.machine.id.localeCompare(right.machine.id),
    )
    .filter(
      (assignment) =>
        !boundary ||
        assignment.machine.name.localeCompare(String(boundary.value), "pt-BR") >
          0 ||
        (assignment.machine.name === String(boundary.value) &&
          assignment.machine.id > boundary.id),
    )
    .slice(0, input.limit + 1);
  const page = buildCursorPage({
    items: ordered,
    limit: input.limit,
    resource: "production-truck-options",
    scope: cursorScope,
    query: cursorQuery,
    sortBy: "name",
    sortDirection: "asc",
    getLast: (assignment) => ({
      value: assignment.machine.name,
      id: assignment.machine.id,
    }),
  });
  return {
    project: options.project,
    shiftEnabled: options.shiftEnabled,
    data: page.data.map((assignment) => {
      const specification = assignment.machine.transportSpecification!;
      const identifier = assignment.machine.identifiers[0] ?? null;
      return {
        id: assignment.machine.id,
        name: assignment.machine.name,
        manufacturer: assignment.machine.manufacturer,
        model: assignment.machine.model,
        identifier: identifier?.value ?? null,
        identifierKind: identifier?.kind ?? null,
        effectiveCapacity: specification.effectiveCapacity.toFixed(3),
        capacityUnitCode: specification.capacityUnitCode,
        driver: assignment.operator
          ? {
              id: assignment.operator.id,
              name: assignment.operator.person.displayName,
            }
          : null,
      };
    }),
    pageInfo: page.pageInfo,
  };
}

export async function createProductionHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  data: ProductionWriteData,
  input: {
    approved: boolean;
    event: "CREATED" | "DIRECT_APPROVED";
    snapshot: Prisma.InputJsonValue;
  },
) {
  const now = new Date();
  return context.prisma.projectProduction.create({
    data: {
      ...scopeWhere(scope, projectId),
      ...productionScalars(data),
      status: input.approved ? "APPROVED" : "DRAFT",
      createdByUserId: scope.actorUserId,
      approvedByUserId: input.approved ? scope.actorUserId : null,
      approvedAt: input.approved ? now : null,
      equipment: { create: equipmentCreate(data.equipment) },
      ...(data.individualActivity
        ? { individualActivity: { create: data.individualActivity } }
        : {}),
      ...(data.materialMovement
        ? { materialMovement: { create: data.materialMovement } }
        : {}),
      components: { create: componentCreate(data.components) },
      truckSummaries: { create: data.truckSummaries },
      revisions: {
        create: {
          revision: 1,
          event: input.event,
          snapshot: input.snapshot,
          actorUserId: scope.actorUserId,
        },
      },
    },
    include: productionDetailInclude,
  });
}

export async function countShiftProductionsHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionDate: Date,
  shift: "DAY" | "NIGHT",
) {
  return context.prisma.projectProduction.count({
    where: { ...scopeWhere(scope, projectId), productionDate, shift },
  });
}

export async function findProductionByFingerprintHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  batchFingerprint: string,
  exceptProductionId?: string,
) {
  return context.prisma.projectProduction.findFirst({
    where: {
      ...scopeWhere(scope, projectId),
      batchFingerprint,
      ...(exceptProductionId ? { id: { not: exceptProductionId } } : {}),
    },
    select: { id: true },
  });
}

export async function replaceProductionHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionId: string,
  expectedRevision: number,
  data: ProductionWriteData,
  snapshot: Prisma.InputJsonValue,
) {
  const bumped = await context.prisma.projectProduction.updateMany({
    where: {
      id: productionId,
      ...scopeWhere(scope, projectId),
      status: "DRAFT",
      revision: expectedRevision,
    },
    data: {
      revision: { increment: 1 },
      operationalRevision: { increment: 1 },
    },
  });
  if (bumped.count !== 1) return null;

  const currentEquipment =
    await context.prisma.projectProductionEquipment.findMany({
      where: { productionId },
      select: { id: true, machineId: true },
    });
  const desiredMachineIds = new Set(
    data.equipment.map((item) => item.machineId),
  );
  const removedIds = currentEquipment
    .filter((item) => !desiredMachineIds.has(item.machineId))
    .map((item) => item.id);
  if (removedIds.length)
    await context.prisma.projectProductionEquipment.deleteMany({
      where: { id: { in: removedIds }, trips: { none: {} } },
    });

  for (const item of data.equipment) {
    const existing = currentEquipment.find(
      (equipment) => equipment.machineId === item.machineId,
    );
    if (existing) {
      await context.prisma.projectProductionStop.deleteMany({
        where: { productionEquipmentId: existing.id },
      });
      await context.prisma.projectProductionEquipment.update({
        where: { id: existing.id },
        data: {
          ...equipmentScalars(item),
          stops: { create: item.stops },
        },
      });
    } else {
      await context.prisma.projectProductionEquipment.create({
        data: {
          productionId,
          ...equipmentScalars(item),
          stops: { create: item.stops },
        },
      });
    }
  }

  await Promise.all([
    context.prisma.projectProductionIndividualActivity.deleteMany({
      where: { productionId },
    }),
    context.prisma.projectMaterialMovement.deleteMany({
      where: { productionId },
    }),
    context.prisma.projectProductionComponent.deleteMany({
      where: { productionId },
    }),
    context.prisma.projectProductionTruckSummary.deleteMany({
      where: { productionId },
    }),
    context.prisma.projectDailyReportProduction.updateMany({
      where: { productionId },
      data: { isStale: true },
    }),
  ]);

  return context.prisma.projectProduction.update({
    where: { id: productionId },
    data: {
      ...productionScalars(data),
      ...(data.individualActivity
        ? { individualActivity: { create: data.individualActivity } }
        : {}),
      ...(data.materialMovement
        ? { materialMovement: { create: data.materialMovement } }
        : {}),
      components: { create: componentCreate(data.components) },
      truckSummaries: { create: data.truckSummaries },
      revisions: {
        create: {
          revision: expectedRevision + 1,
          event: "UPDATED",
          snapshot,
          actorUserId: scope.actorUserId,
        },
      },
    },
    include: productionDetailInclude,
  });
}

export async function findProductionHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionId: string,
) {
  return context.prisma.projectProduction.findFirst({
    where: { id: productionId, ...scopeWhere(scope, projectId) },
    include: productionDetailInclude,
  });
}

export async function listProductionsHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  input: {
    boundary: CursorBoundary | null;
    limit: number;
    productionDate?: Date;
    shift?: "DAY" | "NIGHT";
    status?:
      | "DRAFT"
      | "SUBMITTED"
      | "FIELD_CHECKED"
      | "AWAITING_TECHNICAL"
      | "APPROVED"
      | "REJECTED"
      | "RELEASED"
      | "MEASURED";
    kind?: "INDIVIDUAL_ACTIVITY" | "MATERIAL_MOVEMENT";
    workFrontId?: string;
    sortDirection: SortDirection;
  },
) {
  const boundary = productionBoundary(input.boundary, input.sortDirection);
  return context.prisma.projectProduction.findMany({
    where: {
      ...scopeWhere(scope, projectId),
      ...(input.productionDate ? { productionDate: input.productionDate } : {}),
      ...(input.shift ? { shift: input.shift } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.workFrontId ? { workFrontId: input.workFrontId } : {}),
      ...(boundary ? { OR: boundary } : {}),
    },
    orderBy: [
      { productionDate: input.sortDirection },
      { shiftOrder: input.sortDirection },
      { id: input.sortDirection },
    ],
    take: input.limit + 1,
    include: productionDetailInclude,
  });
}

export async function listProductionHistoryHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionId: string,
  input: {
    boundary: CursorBoundary | null;
    limit: number;
    sortDirection: SortDirection;
  },
) {
  const production = await context.prisma.projectProduction.findFirst({
    where: { id: productionId, ...scopeWhere(scope, projectId) },
    select: { id: true },
  });
  if (!production) return null;
  const operator = input.sortDirection === "asc" ? "gt" : "lt";
  const boundary = input.boundary;
  if (boundary && typeof boundary.value !== "number")
    throw invalidCursorError();
  return context.prisma.projectProductionRevision.findMany({
    where: {
      productionId,
      ...(boundary
        ? {
            OR: [
              { revision: { [operator]: boundary.value as number } },
              {
                revision: boundary.value as number,
                id: { [operator]: boundary.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ revision: input.sortDirection }, { id: input.sortDirection }],
    take: input.limit + 1,
  });
}

export async function transitionProductionHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionId: string,
  input: {
    expectedRevision: number;
    from: Array<
      | "DRAFT"
      | "SUBMITTED"
      | "FIELD_CHECKED"
      | "AWAITING_TECHNICAL"
      | "APPROVED"
      | "REJECTED"
      | "RELEASED"
    >;
    to:
      | "DRAFT"
      | "SUBMITTED"
      | "FIELD_CHECKED"
      | "AWAITING_TECHNICAL"
      | "APPROVED"
      | "REJECTED"
      | "RELEASED";
    event:
      | "SUBMITTED"
      | "FIELD_CHECKED"
      | "AWAITING_TECHNICAL"
      | "APPROVED"
      | "REJECTED"
      | "RELEASED"
      | "REOPENED";
    phase:
      | "SUBMISSION"
      | "FIELD_CHECK"
      | "TECHNICAL_CHECK"
      | "RELEASE"
      | "REOPEN";
    decision: "SUBMITTED" | "ACCEPTED" | "REJECTED" | "RELEASED" | "REOPENED";
    reason: string | null;
    snapshot: Prisma.InputJsonValue;
    invalidateRdo?: boolean;
  },
) {
  const now = new Date();
  const updated = await context.prisma.projectProduction.updateMany({
    where: {
      id: productionId,
      ...scopeWhere(scope, projectId),
      status: { in: input.from },
      revision: input.expectedRevision,
    },
    data: {
      status: input.to,
      revision: { increment: 1 },
      ...(input.invalidateRdo ? { operationalRevision: { increment: 1 } } : {}),
      ...(input.to === "APPROVED" || input.to === "RELEASED"
        ? { approvedByUserId: scope.actorUserId, approvedAt: now }
        : {}),
      ...(input.to === "DRAFT"
        ? {
            approvedByUserId: null,
            approvedAt: null,
            lastReopenReason: input.reason,
          }
        : {}),
    },
  });
  if (updated.count !== 1) return null;
  await Promise.all([
    context.prisma.projectProductionRevision.create({
      data: {
        productionId,
        revision: input.expectedRevision + 1,
        event: input.event,
        reason: input.reason,
        snapshot: input.snapshot,
        actorUserId: scope.actorUserId,
      },
    }),
    context.prisma.projectProductionApproval.create({
      data: {
        productionId,
        revision: input.expectedRevision + 1,
        phase: input.phase,
        decision: input.decision,
        reason: input.reason,
        snapshot: input.snapshot,
        actorUserId: scope.actorUserId,
      },
    }),
    ...(input.invalidateRdo
      ? [
          context.prisma.projectDailyReportProduction.updateMany({
            where: { productionId },
            data: { isStale: true },
          }),
        ]
      : []),
  ]);
  return findProductionHandler(context, scope, projectId, productionId);
}

export async function addProductionQualityCheckHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionId: string,
  input: {
    expectedRevision: number;
    type:
      | "FIELD_INSPECTION"
      | "TOPOGRAPHY"
      | "DENSITY"
      | "PROCTOR"
      | "COMPACTION"
      | "MOISTURE"
      | "FINISHING";
    status: "PENDING" | "ACCEPTED" | "REJECTED";
    value: string | null;
    unitCode: string | null;
    notes: string | null;
    evidence: Prisma.InputJsonValue;
    acceptedQuantity: {
      componentId: string;
      method: "TOPOGRAPHY" | "LABORATORY";
      value: string;
      unitCode: string;
      volumeCondition: "BANK" | "LOOSE" | "COMPACTED" | "PLACED" | null;
      sourceSnapshot: Prisma.InputJsonValue;
    } | null;
    snapshot: Prisma.InputJsonValue;
  },
) {
  if (input.acceptedQuantity) {
    const component = await context.prisma.projectProductionComponent.findFirst(
      {
        where: {
          id: input.acceptedQuantity.componentId,
          productionId,
          production: scopeWhere(scope, projectId),
        },
        select: { id: true },
      },
    );
    if (!component) return null;
  }
  const updated = await context.prisma.projectProduction.updateMany({
    where: {
      id: productionId,
      ...scopeWhere(scope, projectId),
      status: {
        in: ["FIELD_CHECKED", "AWAITING_TECHNICAL", "APPROVED"],
      },
      revision: input.expectedRevision,
    },
    data: {
      revision: { increment: 1 },
      status: "AWAITING_TECHNICAL",
    },
  });
  if (updated.count !== 1) return null;
  await Promise.all([
    context.prisma.projectProductionQualityCheck.create({
      data: {
        productionId,
        type: input.type,
        status: input.status,
        value: input.value,
        unitCode: input.unitCode,
        notes: input.notes,
        evidence: input.evidence,
        actorUserId: scope.actorUserId,
      },
    }),
    context.prisma.projectProductionRevision.create({
      data: {
        productionId,
        revision: input.expectedRevision + 1,
        event: "QUALITY_RECORDED",
        snapshot: input.snapshot,
        actorUserId: scope.actorUserId,
      },
    }),
    ...(input.acceptedQuantity
      ? [
          context.prisma.projectProductionQuantity.upsert({
            where: {
              componentId_kind: {
                componentId: input.acceptedQuantity.componentId,
                kind: "TECHNICALLY_ACCEPTED",
              },
            },
            create: {
              componentId: input.acceptedQuantity.componentId,
              kind: "TECHNICALLY_ACCEPTED",
              method: input.acceptedQuantity.method,
              value: input.acceptedQuantity.value,
              unitCode: input.acceptedQuantity.unitCode,
              volumeCondition: input.acceptedQuantity.volumeCondition,
              sourceSnapshot: input.acceptedQuantity.sourceSnapshot,
            },
            update: {
              method: input.acceptedQuantity.method,
              value: input.acceptedQuantity.value,
              unitCode: input.acceptedQuantity.unitCode,
              volumeCondition: input.acceptedQuantity.volumeCondition,
              sourceSnapshot: input.acceptedQuantity.sourceSnapshot,
            },
          }),
        ]
      : []),
  ]);
  return findProductionHandler(context, scope, projectId, productionId);
}

export async function addProductionTripHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionId: string,
  input: {
    expectedRevision: number;
    idempotencyKey: string;
    productionEquipmentId: string;
    recordedAt: Date;
    capacityM3: string;
    adjustedVolumeM3: string | null;
    ticketNumber: string | null;
    notes: string | null;
    officialQuantity: string;
  },
  snapshot: Prisma.InputJsonValue,
) {
  const duplicate = await context.prisma.projectProductionTrip.findUnique({
    where: {
      productionId_idempotencyKey: {
        productionId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (duplicate) {
    const samePayload =
      duplicate.productionEquipmentId === input.productionEquipmentId &&
      duplicate.capacityM3.toFixed(3) === input.capacityM3 &&
      (duplicate.adjustedVolumeM3?.toFixed(3) ?? null) ===
        input.adjustedVolumeM3 &&
      duplicate.ticketNumber === input.ticketNumber &&
      duplicate.notes === input.notes;
    return {
      duplicate,
      payloadConflict: !samePayload,
      production: await findProductionHandler(
        context,
        scope,
        projectId,
        productionId,
      ),
    };
  }

  const bumped = await context.prisma.projectProduction.updateMany({
    where: {
      id: productionId,
      ...scopeWhere(scope, projectId),
      status: "DRAFT",
      entryMode: "TRIPS",
      revision: input.expectedRevision,
    },
    data: {
      revision: { increment: 1 },
      operationalRevision: { increment: 1 },
      officialQuantity: input.officialQuantity,
    },
  });
  if (bumped.count !== 1) return null;
  const trip = await context.prisma.projectProductionTrip.create({
    data: {
      productionId,
      productionEquipmentId: input.productionEquipmentId,
      idempotencyKey: input.idempotencyKey,
      recordedAt: input.recordedAt,
      capacityM3: input.capacityM3,
      adjustedVolumeM3: input.adjustedVolumeM3,
      ticketNumber: input.ticketNumber,
      notes: input.notes,
      createdByUserId: scope.actorUserId,
    },
  });
  await context.prisma.projectProductionRevision.create({
    data: {
      productionId,
      revision: input.expectedRevision + 1,
      event: "TRIP_ADDED",
      snapshot,
      actorUserId: scope.actorUserId,
    },
  });
  await context.prisma.projectDailyReportProduction.updateMany({
    where: { productionId },
    data: { isStale: true },
  });
  return {
    duplicate: trip,
    payloadConflict: false,
    production: await findProductionHandler(
      context,
      scope,
      projectId,
      productionId,
    ),
  };
}

export async function removeProductionTripHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionId: string,
  tripId: string,
  expectedRevision: number,
  officialQuantity: string,
  snapshot: Prisma.InputJsonValue,
) {
  const existing = await context.prisma.projectProductionTrip.findFirst({
    where: { id: tripId, productionId },
    select: { id: true },
  });
  if (!existing) return { missing: true as const };
  const bumped = await context.prisma.projectProduction.updateMany({
    where: {
      id: productionId,
      ...scopeWhere(scope, projectId),
      status: "DRAFT",
      revision: expectedRevision,
    },
    data: {
      revision: { increment: 1 },
      operationalRevision: { increment: 1 },
      officialQuantity,
    },
  });
  if (bumped.count !== 1) return null;
  await context.prisma.projectProductionTrip.deleteMany({
    where: { id: tripId, productionId },
  });
  await context.prisma.projectProductionRevision.create({
    data: {
      productionId,
      revision: expectedRevision + 1,
      event: "TRIP_REMOVED",
      snapshot,
      actorUserId: scope.actorUserId,
    },
  });
  await context.prisma.projectDailyReportProduction.updateMany({
    where: { productionId },
    data: { isStale: true },
  });
  return {
    missing: false as const,
    production: await findProductionHandler(
      context,
      scope,
      projectId,
      productionId,
    ),
  };
}

export async function findDailyReportForProductionHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  reportId: string,
) {
  return context.prisma.projectDailyReport.findFirst({
    where: { id: reportId, ...scopeWhere(scope, projectId) },
    select: {
      id: true,
      projectId: true,
      reportDate: true,
      shift: true,
      status: true,
    },
  });
}

export async function listShiftProductionsHandler(
  context: HandlerContext,
  scope: ProductionScope,
  projectId: string,
  productionDate: Date,
  shift: "DAY" | "NIGHT",
) {
  return context.prisma.projectProduction.findMany({
    where: { ...scopeWhere(scope, projectId), productionDate, shift },
    orderBy: [{ serviceCodeSnapshot: "asc" }, { id: "asc" }],
    take: 201,
    include: productionDetailInclude,
  });
}

export async function confirmDailyReportProductionsHandler(
  context: HandlerContext,
  scope: ProductionScope,
  reportId: string,
  productions: Array<{
    id: string;
    revision: number;
    operationalRevision: number;
  }>,
) {
  const ids = productions.map((item) => item.id);
  await context.prisma.projectDailyReportProduction.deleteMany({
    where: { dailyReportId: reportId, productionId: { notIn: ids } },
  });
  const confirmedAt = new Date();
  for (const production of productions)
    await context.prisma.projectDailyReportProduction.upsert({
      where: {
        dailyReportId_productionId: {
          dailyReportId: reportId,
          productionId: production.id,
        },
      },
      create: {
        dailyReportId: reportId,
        productionId: production.id,
        confirmedRevision: production.revision,
        confirmedOperationalRevision: production.operationalRevision,
        isStale: false,
        confirmedByUserId: scope.actorUserId,
        confirmedAt,
      },
      update: {
        confirmedRevision: production.revision,
        confirmedOperationalRevision: production.operationalRevision,
        isStale: false,
        confirmedByUserId: scope.actorUserId,
        confirmedAt,
      },
    });
  return context.prisma.projectDailyReportProduction.findMany({
    where: { dailyReportId: reportId },
    orderBy: { confirmedAt: "asc" },
  });
}

export async function dailyReportProductionReadinessHandler(
  context: HandlerContext,
  scope: { corporationId: string; companyId: string },
  input: {
    projectId: string;
    reportId: string;
    productionDate: Date;
    shift: "DAY" | "NIGHT";
  },
) {
  const productions = await context.prisma.projectProduction.findMany({
    where: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      projectId: input.projectId,
      productionDate: input.productionDate,
      shift: input.shift,
    },
    take: 201,
    select: {
      id: true,
      status: true,
      revision: true,
      operationalRevision: true,
      dailyReportLinks: {
        where: { dailyReportId: input.reportId },
        select: { confirmedOperationalRevision: true, isStale: true },
      },
    },
  });
  return {
    count: productions.length,
    hasDrafts: productions.some((production) => production.status === "DRAFT"),
    hasUnconfirmed: productions.some((production) => {
      const link = production.dailyReportLinks[0];
      return (
        !link ||
        link.isStale ||
        link.confirmedOperationalRevision !== production.operationalRevision
      );
    }),
  };
}

function productionScalars(data: ProductionWriteData) {
  const {
    equipment,
    individualActivity,
    materialMovement,
    components,
    truckSummaries,
    ...scalars
  } = data;
  void equipment;
  void individualActivity;
  void materialMovement;
  void components;
  void truckSummaries;
  return scalars;
}

function equipmentScalars(item: ProductionWriteData["equipment"][number]) {
  const { stops, ...scalars } = item;
  void stops;
  return scalars;
}

function equipmentCreate(items: ProductionWriteData["equipment"]) {
  return items.map((item) => ({
    ...equipmentScalars(item),
    stops: { create: item.stops },
  }));
}

function componentCreate(items: ProductionWriteData["components"]) {
  return items.map(({ quantities, ...component }) => ({
    ...component,
    quantities: { create: quantities },
  }));
}

function productionBoundary(
  boundary: CursorBoundary | null,
  direction: SortDirection,
): Prisma.ProjectProductionWhereInput[] | null {
  if (!boundary) return null;
  if (typeof boundary.value !== "string") throw invalidCursorError();
  const match = /^(\d{4}-\d{2}-\d{2})\|([01])$/u.exec(boundary.value);
  if (!match || !/^[0-9a-f-]{36}$/iu.test(boundary.id))
    throw invalidCursorError();
  const productionDate = new Date(`${match[1]}T00:00:00.000Z`);
  if (Number.isNaN(productionDate.getTime())) throw invalidCursorError();
  const shiftOrder = Number(match[2]);
  const operator = direction === "asc" ? "gt" : "lt";
  return [
    { productionDate: { [operator]: productionDate } },
    { productionDate, shiftOrder: { [operator]: shiftOrder } },
    { productionDate, shiftOrder, id: { [operator]: boundary.id } },
  ];
}

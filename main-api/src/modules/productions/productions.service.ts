import { createHash } from "node:crypto";

import { AppError } from "../../lib/utils/appError";
import {
  findEarthworkMaterialRevisionForProductionHandler,
  findHaulRouteRevisionForProductionHandler,
} from "../earthwork-catalogs/handlers/earthwork-catalogs.handler";
import {
  buildCursorPage,
  parseBoundCursor,
} from "../../lib/utils/cursor-pagination";
import type { HandlerContext } from "../../lib/utils/handler.dto";
import type {
  ProductionCommand,
  ProductionDecision,
  ProductionHistoryQuery,
  ProductionListQuery,
  ProductionOptionsQuery,
  ProductionPairCommand,
  ProductionTruckOptionsQuery,
  ProductionQualityCheck,
  ProductionReopen,
  ProductionTransition,
  ProductionTripCommand,
} from "./productions.dto";
import {
  addProductionQualityCheckHandler,
  addProductionTripHandler,
  confirmDailyReportProductionsHandler,
  countShiftProductionsHandler,
  createProductionHandler,
  findDailyReportForProductionHandler,
  findProductionHandler,
  findProductionByFingerprintHandler,
  findProductionOptionsContextHandler,
  listProductionTruckOptionsHandler,
  listProductionsHandler,
  listProductionHistoryHandler,
  listShiftProductionsHandler,
  removeProductionTripHandler,
  replaceProductionHandler,
  transitionProductionHandler,
  type ProductionScope,
  type ProductionWriteData,
} from "./handlers/productions.handler";
import {
  calculateCompactedVolumeFromReduction,
  calculateEarthworkMovement,
  calculateTruckSummaryVolume,
} from "./earthwork-calculations";

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

function transportCapacityInM3(value: string, unitCode: string) {
  const factor =
    unitCode === "LITER" ? 0.001 : unitCode === "CUBIC_YARD" ? 0.764555 : 1;
  return (Number(value) * factor).toFixed(3);
}

const roleToDb = {
  excavation: "EXCAVATION",
  loading: "LOADING",
  transport: "TRANSPORT",
  spreading: "SPREADING",
  grading: "GRADING",
  compaction: "COMPACTION",
  watering: "WATERING",
  support: "SUPPORT",
} as const;

const productionClimateToDb = {
  rain: "RAIN",
  dry: "DRY",
  waterlogged_soil: "WATERLOGGED_SOIL",
} as const;

const profileByServiceCode: Record<
  string,
  ProductionWriteData["productionProfileSnapshot"]
> = {
  cut: "EXCAVATION",
  fill: "COMPACTION",
  finishing: "GRADING",
  top_soil: "SPREADING",
  unsuitable_soil_removal: "TRANSPORT",
  replacement_fill: "COMPACTION",
};

type ProductionRecord = NonNullable<
  Awaited<ReturnType<typeof findProductionHandler>>
>;

export class ProductionsService {
  constructor(private readonly context: HandlerContext) {}

  async options(
    scope: ProductionScope,
    projectId: string,
    query: ProductionOptionsQuery,
  ) {
    const interval = shiftInterval(query.productionDate, query.shift);
    const context = await findProductionOptionsContextHandler(
      this.context,
      scope,
      projectId,
      interval,
      shiftToDb(query.shift),
    );
    if (!context) throw projectUnavailable();
    assertProductionDateAllowed(
      query.productionDate,
      context.project.actualStartedAt,
    );
    if (!context.shiftEnabled) throw shiftNotEnabled();
    const availableMachines = uniqueBy(
      context.assignments,
      (assignment) => assignment.machineId,
    );
    return {
      project: context.project,
      defaults: {
        productionDate: query.productionDate,
        shift: query.shift,
      },
      dateLimits: productionDateLimits(context.project.actualStartedAt),
      capabilities: capabilities(scope),
      responsibleOptions: uniqueBy(
        context.employeeAllocations.flatMap((allocation) =>
          allocation.employment.isActive &&
          allocation.employment.state === "ACTIVE"
            ? [
                {
                  id: allocation.employmentId,
                  name: allocation.employment.person.displayName,
                  jobRole: allocation.jobRole,
                },
              ]
            : [],
        ),
        (item) => item.id,
      ),
      workFronts: context.fronts.map((front) => ({
        ...front,
        services: context.services
          .filter((service) => service.workFrontId === front.id)
          .map((service) => ({
            id: service.id,
            serviceCode: service.serviceCode,
            unitCode: service.unitCode,
            quantity: service.quantity.toFixed(3),
            productionProfile: resolvedProfile(
              service.productionProfile,
              service.serviceCode,
            ).toLowerCase(),
            dmtPolicy: service.dmtPolicy.toLowerCase(),
          })),
        equipment: availableMachines.flatMap((assignment) =>
          assignment.machine.isActive
            ? [
                {
                  id: assignment.machine.id,
                  name: assignment.machine.name,
                  manufacturer: assignment.machine.manufacturer,
                  model: assignment.machine.model,
                  meterType: assignment.machine.meterType.toLowerCase(),
                  machineType: assignment.machine.type.toLowerCase(),
                  loadVolumeM3:
                    assignment.machine.transportSpecification?.effectiveCapacity.toFixed(
                      3,
                    ) ??
                    assignment.machine.loadVolumeM3?.toFixed(3) ??
                    null,
                  maxSupportedWeightT:
                    assignment.machine.transportSpecification?.maxSupportedWeightT?.toFixed(
                      3,
                    ) ??
                    assignment.machine.maxSupportedWeightT?.toFixed(3) ??
                    null,
                  identifier: assignment.machine.identifiers[0]?.value ?? null,
                  identifierKind:
                    assignment.machine.identifiers[0]?.kind ?? null,
                  operator: assignment.operator
                    ? {
                        id: assignment.operator.id,
                        name: assignment.operator.person.displayName,
                      }
                    : null,
                },
              ]
            : [],
        ),
        trucks: availableMachines.flatMap((assignment) => {
          const specification = assignment.machine.transportSpecification;
          return assignment.machine.isActive &&
            specification &&
            specification.capacityUnitCode !== "LITER" &&
            specification.effectiveCapacity.gt(0)
            ? [
                {
                  id: assignment.machine.id,
                  name: assignment.machine.name,
                  manufacturer: assignment.machine.manufacturer,
                  model: assignment.machine.model,
                  meterType: assignment.machine.meterType.toLowerCase(),
                  identifier: assignment.machine.identifiers[0]?.value ?? null,
                  identifierKind:
                    assignment.machine.identifiers[0]?.kind ?? null,
                  nominalCapacity: specification.nominalCapacity.toFixed(3),
                  effectiveCapacity: specification.effectiveCapacity.toFixed(3),
                  capacityUnitCode: specification.capacityUnitCode,
                  maxSupportedWeightT:
                    specification.maxSupportedWeightT?.toFixed(3) ?? null,
                  driver: assignment.operator
                    ? {
                        id: assignment.operator.id,
                        name: assignment.operator.person.displayName,
                      }
                    : null,
                },
              ]
            : [];
        }),
      })),
    };
  }

  async truckOptions(
    scope: ProductionScope,
    projectId: string,
    query: ProductionTruckOptionsQuery,
  ) {
    const result = await listProductionTruckOptionsHandler(
      this.context,
      scope,
      projectId,
      {
        interval: shiftInterval(query.productionDate, query.shift),
        shift: shiftToDb(query.shift),
        productionDate: query.productionDate,
        limit: query.limit,
        cursor: query.cursor,
      },
    );
    if (!result) throw projectUnavailable();
    assertProductionDateAllowed(
      query.productionDate,
      result.project.actualStartedAt,
    );
    if (!result.shiftEnabled) throw shiftNotEnabled();
    return { data: result.data, pageInfo: result.pageInfo };
  }

  async create(
    scope: ProductionScope,
    projectId: string,
    command: ProductionCommand,
  ) {
    if (command.source === "operational_center" && command.submitNow)
      throw new AppError({
        code: "PRODUCTION_RDO_CONFIRMATION_REQUIRED",
        message:
          "Productions created in the operational center are confirmed when the shift closes",
        statusCode: 409,
      });
    assertCapability(scope, "createDraft");
    if (command.submitNow || command.approveNow)
      assertCapability(scope, "submit");
    return this.context.transaction(async (transactionContext) => {
      const data = await this.resolveWriteData(
        transactionContext,
        scope,
        projectId,
        command,
      );
      const shiftProductionCount = await countShiftProductionsHandler(
        transactionContext,
        scope,
        projectId,
        data.productionDate,
        data.shift,
      );
      if (shiftProductionCount >= 200)
        throw new AppError({
          code: "PRODUCTION_SHIFT_LIMIT_EXCEEDED",
          message: "The production limit for this project shift was reached",
          statusCode: 409,
          data: { limit: 200 },
        });
      if (data.batchFingerprint) {
        const duplicate = await findProductionByFingerprintHandler(
          transactionContext,
          scope,
          projectId,
          data.batchFingerprint,
        );
        if (duplicate)
          throw new AppError({
            code: "PRODUCTION_DUPLICATE_BATCH",
            message: "An equivalent material movement batch already exists",
            statusCode: 409,
            data: { existingProductionId: duplicate.id },
          });
      }
      if (command.submitNow || command.approveNow)
        validateApprovalData(data, {
          operationalQuantity: data.officialQuantity,
          tripCount: data.truckSummaries.reduce(
            (sum, truck) => sum + truck.acceptedTrips,
            0,
          ),
        });
      const record = await createProductionHandler(
        transactionContext,
        scope,
        projectId,
        data,
        {
          approved: false,
          event: "CREATED",
          snapshot: snapshotOf(command, "created"),
        },
      );
      if (!(command.submitNow || command.approveNow))
        return toDetailDto(record);
      const submitted = await transitionProductionHandler(
        transactionContext,
        scope,
        projectId,
        record.id,
        {
          expectedRevision: record.revision,
          from: ["DRAFT"],
          to: "SUBMITTED",
          event: "SUBMITTED",
          phase: "SUBMISSION",
          decision: "SUBMITTED",
          reason: null,
          snapshot: snapshotOf(command, "submitted"),
        },
      );
      if (!submitted) throw changedConcurrently();
      return toDetailDto(submitted);
    });
  }

  async createPair(
    scope: ProductionScope,
    projectId: string,
    pair: ProductionPairCommand,
  ) {
    assertCapability(scope, "createDraft");
    if (pair.cut.submitNow || pair.fill.submitNow)
      assertCapability(scope, "submit");
    if (
      pair.cut.kind !== "individual_activity" ||
      pair.fill.kind !== "individual_activity"
    )
      throw resourceUnavailable("production-pair-kind");
    const cutCommand = pair.cut as Extract<
      ProductionCommand,
      { kind: "individual_activity" }
    >;
    const requestedFillCommand = pair.fill as Extract<
      ProductionCommand,
      { kind: "individual_activity" }
    >;
    if (
      pair.cut.productionDate !== pair.fill.productionDate ||
      pair.cut.shift !== pair.fill.shift ||
      pair.cut.submitNow !== pair.fill.submitNow
    )
      throw resourceUnavailable("production-pair-context");
    const compactionReductionPercent =
      requestedFillCommand.individualActivity.compactionReductionPercent;
    if (compactionReductionPercent === null)
      throw resourceUnavailable("compaction-factor");
    return this.context.transaction(async (transactionContext) => {
      const cutData = await this.resolveWriteData(
        transactionContext,
        scope,
        projectId,
        cutCommand,
      );
      if (
        cutData.serviceCodeSnapshot !== "cut" ||
        cutCommand.individualActivity.destinationKind !== "fill" ||
        cutCommand.individualActivity.destinationWorkFrontId !==
          requestedFillCommand.individualActivity.workFrontId
      )
        throw resourceUnavailable("cut-fill-destination");
      const compactedQuantity = calculateCompactedVolumeFromReduction(
        cutData.officialQuantity,
        compactionReductionPercent,
      );
      const fillCommand: Extract<
        ProductionCommand,
        { kind: "individual_activity" }
      > = {
        ...requestedFillCommand,
        entryMode: "direct_total",
        truckSummaries: [],
        individualActivity: {
          ...requestedFillCommand.individualActivity,
          operationalQuantity: compactedQuantity,
          volumeCondition: "compacted",
        },
      };
      const fillData = await this.resolveWriteData(
        transactionContext,
        scope,
        projectId,
        fillCommand,
      );
      if (fillData.serviceCodeSnapshot !== "fill")
        throw resourceUnavailable("fill-service");
      const count = await countShiftProductionsHandler(
        transactionContext,
        scope,
        projectId,
        cutData.productionDate,
        cutData.shift,
      );
      if (count > 198)
        throw new AppError({
          code: "PRODUCTION_SHIFT_LIMIT_EXCEEDED",
          message: "The production limit for this project shift was reached",
          statusCode: 409,
          data: { limit: 200 },
        });
      if (pair.cut.submitNow) {
        validateApprovalData(cutData, {
          operationalQuantity: cutData.officialQuantity,
          tripCount: cutData.truckSummaries.reduce(
            (sum, truck) => sum + truck.acceptedTrips,
            0,
          ),
        });
        validateApprovalData(fillData, {
          operationalQuantity: fillData.officialQuantity,
          tripCount: 0,
        });
      }
      const cutRecord = await createProductionHandler(
        transactionContext,
        scope,
        projectId,
        cutData,
        {
          approved: false,
          event: "CREATED",
          snapshot: snapshotOf(pair.cut, "created"),
        },
      );
      const fillRecord = await createProductionHandler(
        transactionContext,
        scope,
        projectId,
        fillData,
        {
          approved: false,
          event: "CREATED",
          snapshot: snapshotOf(fillCommand, "created"),
        },
      );
      if (!pair.cut.submitNow)
        return { cut: toDetailDto(cutRecord), fill: toDetailDto(fillRecord) };
      const [submittedCut, submittedFill] = await Promise.all([
        transitionProductionHandler(
          transactionContext,
          scope,
          projectId,
          cutRecord.id,
          {
            expectedRevision: cutRecord.revision,
            from: ["DRAFT"],
            to: "SUBMITTED",
            event: "SUBMITTED",
            phase: "SUBMISSION",
            decision: "SUBMITTED",
            reason: null,
            snapshot: snapshotOf(pair.cut, "submitted"),
          },
        ),
        transitionProductionHandler(
          transactionContext,
          scope,
          projectId,
          fillRecord.id,
          {
            expectedRevision: fillRecord.revision,
            from: ["DRAFT"],
            to: "SUBMITTED",
            event: "SUBMITTED",
            phase: "SUBMISSION",
            decision: "SUBMITTED",
            reason: null,
            snapshot: snapshotOf(fillCommand, "submitted"),
          },
        ),
      ]);
      if (!submittedCut || !submittedFill) throw changedConcurrently();
      return {
        cut: toDetailDto(submittedCut),
        fill: toDetailDto(submittedFill),
      };
    });
  }

  async update(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionCommand,
  ) {
    assertCapability(scope, "createDraft");
    if (command.submitNow || command.approveNow)
      assertCapability(scope, "submit");
    const expectedRevision = command.expectedRevision;
    if (!expectedRevision) throw revisionRequired();
    return this.context.transaction(async (transactionContext) => {
      const current = await findProductionHandler(
        transactionContext,
        scope,
        projectId,
        productionId,
      );
      if (!current) throw notFound();
      if (current.source === "OPERATIONAL_CENTER" && command.submitNow)
        throw new AppError({
          code: "PRODUCTION_RDO_CONFIRMATION_REQUIRED",
          message:
            "Productions created in the operational center are confirmed when the shift closes",
          statusCode: 409,
        });
      if (current.status !== "DRAFT") throw immutable();
      assertEquipmentWithTripsPreserved(current, command);
      const data = await this.resolveWriteData(
        transactionContext,
        scope,
        projectId,
        command,
        current.trips.map(
          (trip) =>
            trip.adjustedVolumeM3?.toFixed(3) ?? trip.capacityM3.toFixed(3),
        ),
      );
      if (
        current.kind === "MATERIAL_MOVEMENT" &&
        current.batchFingerprint !== data.batchFingerprint
      )
        throw new AppError({
          code: "PRODUCTION_BATCH_IDENTITY_IMMUTABLE",
          message:
            "Changing material movement identity requires a new production batch",
          statusCode: 409,
          data: { existingProductionId: current.id },
        });
      if (data.batchFingerprint) {
        const duplicate = await findProductionByFingerprintHandler(
          transactionContext,
          scope,
          projectId,
          data.batchFingerprint,
          productionId,
        );
        if (duplicate)
          throw new AppError({
            code: "PRODUCTION_DUPLICATE_BATCH",
            message: "An equivalent material movement batch already exists",
            statusCode: 409,
            data: { existingProductionId: duplicate.id },
          });
      }
      const record = await replaceProductionHandler(
        transactionContext,
        scope,
        projectId,
        productionId,
        expectedRevision,
        data,
        snapshotOf(command, "updated"),
      );
      if (!record) throw changedConcurrently();
      if (command.submitNow || command.approveNow) {
        validateApproval(record);
        const submitted = await transitionProductionHandler(
          transactionContext,
          scope,
          projectId,
          productionId,
          {
            expectedRevision: record.revision,
            from: ["DRAFT"],
            to: "SUBMITTED",
            event: "SUBMITTED",
            phase: "SUBMISSION",
            decision: "SUBMITTED",
            reason: null,
            snapshot: snapshotOf(toDetailDto(record), "submitted"),
          },
        );
        if (!submitted) throw changedConcurrently();
        return toDetailDto(submitted);
      }
      return toDetailDto(record);
    });
  }

  async detail(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
  ) {
    const record = await findProductionHandler(
      this.context,
      scope,
      projectId,
      productionId,
    );
    if (!record) throw notFound();
    return toDetailDto(record);
  }

  async history(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    query: ProductionHistoryQuery,
  ) {
    assertCapability(scope, "viewHistory");
    const normalizedQuery = {
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    };
    const cursorScope = {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      projectId,
      productionId,
    };
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      query: normalizedQuery,
      resource: "project-production-history",
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const records = await listProductionHistoryHandler(
      this.context,
      scope,
      projectId,
      productionId,
      { boundary, limit: query.limit, sortDirection: query.sortDirection },
    );
    if (!records) throw notFound();
    const page = buildCursorPage({
      items: records,
      limit: query.limit,
      query: normalizedQuery,
      resource: "project-production-history",
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (item) => ({ id: item.id, value: item.revision }),
    });
    return {
      data: page.data.map((revision) => ({
        id: revision.id,
        revision: revision.revision,
        event: revision.event.toLowerCase(),
        reason: revision.reason,
        actorUserId: revision.actorUserId,
        snapshot: revision.snapshot,
        createdAt: revision.createdAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }

  async list(
    scope: ProductionScope,
    projectId: string,
    query: ProductionListQuery,
  ) {
    const normalizedQuery = {
      productionDate: query.productionDate ?? null,
      shift: query.shift ?? null,
      status: query.status ?? null,
      kind: query.kind ?? null,
      workFrontId: query.workFrontId ?? null,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    };
    const cursorScope = {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      projectId,
    };
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      query: normalizedQuery,
      resource: "project-productions",
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const records = await listProductionsHandler(
      this.context,
      scope,
      projectId,
      {
        boundary,
        limit: query.limit,
        productionDate: query.productionDate
          ? civilDateValue(query.productionDate)
          : undefined,
        shift: query.shift ? shiftToDb(query.shift) : undefined,
        status: query.status
          ? (query.status.toUpperCase() as
              | "DRAFT"
              | "SUBMITTED"
              | "FIELD_CHECKED"
              | "AWAITING_TECHNICAL"
              | "APPROVED"
              | "REJECTED"
              | "RELEASED"
              | "MEASURED")
          : undefined,
        kind: query.kind
          ? (query.kind.toUpperCase() as
              | "INDIVIDUAL_ACTIVITY"
              | "MATERIAL_MOVEMENT")
          : undefined,
        workFrontId: query.workFrontId,
        sortDirection: query.sortDirection,
      },
    );
    const page = buildCursorPage({
      items: records,
      limit: query.limit,
      query: normalizedQuery,
      resource: "project-productions",
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (item) => ({
        id: item.id,
        value: `${civilDate(item.productionDate)}|${item.shiftOrder}`,
      }),
    });
    return {
      data: page.data.map(toSummaryDto),
      pageInfo: page.pageInfo,
      capabilities: capabilities(scope),
    };
  }

  async approve(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionTransition,
  ) {
    const current = await findProductionHandler(
      this.context,
      scope,
      projectId,
      productionId,
    );
    if (!current) throw notFound();
    assertCapability(scope, "approve");
    if (
      current.status !== "AWAITING_TECHNICAL" &&
      !(
        current.kind === "INDIVIDUAL_ACTIVITY" &&
        current.status === "FIELD_CHECKED"
      )
    )
      throw immutable();
    validateTechnicalApproval(current);
    const record = await this.context.transaction((transactionContext) =>
      transitionProductionHandler(
        transactionContext,
        scope,
        projectId,
        productionId,
        {
          expectedRevision: command.expectedRevision,
          from:
            current.kind === "INDIVIDUAL_ACTIVITY"
              ? ["FIELD_CHECKED", "AWAITING_TECHNICAL"]
              : ["AWAITING_TECHNICAL"],
          to: "APPROVED",
          event: "APPROVED",
          phase: "TECHNICAL_CHECK",
          decision: "ACCEPTED",
          reason: null,
          snapshot: snapshotOf(toDetailDto(current), "approved"),
        },
      ),
    );
    if (!record) throw changedConcurrently();
    return toDetailDto(record);
  }

  async reopen(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionReopen,
  ) {
    assertCapability(scope, "reopen");
    const current = await findProductionHandler(
      this.context,
      scope,
      projectId,
      productionId,
    );
    if (!current) throw notFound();
    if (
      !["SUBMITTED", "REJECTED", "APPROVED", "RELEASED"].includes(
        current.status,
      )
    )
      throw immutable();
    const record = await this.context.transaction((transactionContext) =>
      transitionProductionHandler(
        transactionContext,
        scope,
        projectId,
        productionId,
        {
          expectedRevision: command.expectedRevision,
          from: ["SUBMITTED", "REJECTED", "APPROVED", "RELEASED"],
          to: "DRAFT",
          event: "REOPENED",
          phase: "REOPEN",
          decision: "REOPENED",
          reason: command.reason,
          snapshot: snapshotOf(toDetailDto(current), "reopened"),
          invalidateRdo: true,
        },
      ),
    );
    if (!record) throw changedConcurrently();
    return toDetailDto(record);
  }

  async submit(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionTransition,
  ) {
    assertCapability(scope, "submit");
    const current = await this.detailRecord(scope, projectId, productionId);
    if (current.status !== "DRAFT") throw immutable();
    if (current.source === "OPERATIONAL_CENTER")
      throw new AppError({
        statusCode: 409,
        code: "PRODUCTION_RDO_CONFIRMATION_REQUIRED",
        message:
          "Productions registered in the operational center are confirmed when the shift is closed.",
      });
    validateApproval(current);
    return this.transition(scope, projectId, current, {
      ...command,
      from: ["DRAFT"],
      to: "SUBMITTED",
      event: "SUBMITTED",
      phase: "SUBMISSION",
      decision: "SUBMITTED",
      reason: null,
    });
  }

  async check(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionTransition,
  ) {
    assertCapability(scope, "check");
    const current = await this.detailRecord(scope, projectId, productionId);
    if (current.status !== "SUBMITTED") throw immutable();
    return this.transition(scope, projectId, current, {
      ...command,
      from: ["SUBMITTED"],
      to: "FIELD_CHECKED",
      event: "FIELD_CHECKED",
      phase: "FIELD_CHECK",
      decision: "ACCEPTED",
      reason: null,
    });
  }

  async reject(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionDecision,
  ) {
    assertCapability(scope, "reject");
    if (!command.reason) throw transitionReasonRequired();
    const current = await this.detailRecord(scope, projectId, productionId);
    if (
      !["SUBMITTED", "FIELD_CHECKED", "AWAITING_TECHNICAL"].includes(
        current.status,
      )
    )
      throw immutable();
    return this.transition(scope, projectId, current, {
      expectedRevision: command.expectedRevision,
      from: ["SUBMITTED", "FIELD_CHECKED", "AWAITING_TECHNICAL"],
      to: "REJECTED",
      event: "REJECTED",
      phase: current.status === "SUBMITTED" ? "FIELD_CHECK" : "TECHNICAL_CHECK",
      decision: "REJECTED",
      reason: command.reason,
    });
  }

  async release(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionDecision,
  ) {
    assertCapability(scope, "release");
    const current = await this.detailRecord(scope, projectId, productionId);
    if (current.status !== "APPROVED") throw immutable();
    return this.transition(scope, projectId, current, {
      expectedRevision: command.expectedRevision,
      from: ["APPROVED"],
      to: "RELEASED",
      event: "RELEASED",
      phase: "RELEASE",
      decision: "RELEASED",
      reason: command.reason,
    });
  }

  async qualityCheck(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionQualityCheck,
  ) {
    assertCapability(
      scope,
      command.type === "topography"
        ? "recordTopography"
        : command.type === "field_inspection"
          ? "check"
          : "recordLaboratory",
    );
    const record = await this.context.transaction((transactionContext) =>
      addProductionQualityCheckHandler(
        transactionContext,
        scope,
        projectId,
        productionId,
        {
          expectedRevision: command.expectedRevision,
          type: command.type.toUpperCase() as
            | "FIELD_INSPECTION"
            | "TOPOGRAPHY"
            | "DENSITY"
            | "PROCTOR"
            | "COMPACTION"
            | "MOISTURE"
            | "FINISHING",
          status: command.status.toUpperCase() as
            | "PENDING"
            | "ACCEPTED"
            | "REJECTED",
          value: command.value ? normalizeDecimal(command.value, 3) : null,
          unitCode: command.unitCode,
          notes: command.notes,
          evidence: command.evidence,
          acceptedQuantity: command.acceptedQuantity
            ? {
                componentId: command.acceptedQuantity.componentId,
                method:
                  command.type === "topography" ? "TOPOGRAPHY" : "LABORATORY",
                value: normalizeDecimal(command.acceptedQuantity.value, 3),
                unitCode: command.acceptedQuantity.unitCode,
                volumeCondition: command.acceptedQuantity.volumeCondition
                  ? (command.acceptedQuantity.volumeCondition.toUpperCase() as
                      | "BANK"
                      | "LOOSE"
                      | "COMPACTED"
                      | "PLACED")
                  : null,
                sourceSnapshot: snapshotOf(command, "technically-accepted"),
              }
            : null,
          snapshot: snapshotOf(command, "quality-recorded"),
        },
      ),
    );
    if (!record) throw changedConcurrently();
    return toDetailDto(record);
  }

  private async detailRecord(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
  ) {
    const record = await findProductionHandler(
      this.context,
      scope,
      projectId,
      productionId,
    );
    if (!record) throw notFound();
    return record;
  }

  private async transition(
    scope: ProductionScope,
    projectId: string,
    current: ProductionRecord,
    input: Omit<Parameters<typeof transitionProductionHandler>[4], "snapshot">,
  ) {
    const record = await this.context.transaction((transactionContext) =>
      transitionProductionHandler(
        transactionContext,
        scope,
        projectId,
        current.id,
        {
          ...input,
          snapshot: snapshotOf(toDetailDto(current), input.event.toLowerCase()),
        },
      ),
    );
    if (!record) throw changedConcurrently();
    return toDetailDto(record);
  }

  async addTrip(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    command: ProductionTripCommand,
  ) {
    assertCapability(scope, "createDraft");
    return this.context.transaction(async (transactionContext) => {
      const production = await findProductionHandler(
        transactionContext,
        scope,
        projectId,
        productionId,
      );
      if (!production) throw notFound();
      if (production.status !== "DRAFT" || production.entryMode !== "TRIPS")
        throw immutable();
      const equipment = production.equipment.find(
        (item) => item.id === command.productionEquipmentId,
      );
      if (!equipment || equipment.role !== "TRANSPORT")
        throw resourceUnavailable("transport-equipment");
      const capacity = equipment.defaultTripCapacityM3?.toFixed(3);
      if (!capacity) throw resourceUnavailable("trip-capacity");
      const adjustedVolumeM3 = command.adjustedVolumeM3
        ? normalizeDecimal(command.adjustedVolumeM3, 3)
        : null;
      const officialQuantity = calculateOfficialQuantity(production, [
        ...production.trips.map(
          (trip) =>
            trip.adjustedVolumeM3?.toFixed(3) ?? trip.capacityM3.toFixed(3),
        ),
        adjustedVolumeM3 ?? capacity,
      ]);
      const recordedAt = command.recordedAt
        ? new Date(command.recordedAt)
        : new Date();
      const interval = shiftInterval(
        civilDate(production.productionDate),
        production.shift === "DAY" ? "day" : "night",
      );
      if (
        recordedAt.getTime() < interval.startAt.getTime() ||
        recordedAt.getTime() > interval.endAt.getTime()
      )
        throw new AppError({
          code: "PRODUCTION_RESOURCE_UNAVAILABLE",
          message: "Trip timestamp is outside the production shift",
          statusCode: 422,
          data: { resource: "trip-recorded-at" },
        });
      const result = await addProductionTripHandler(
        transactionContext,
        scope,
        projectId,
        productionId,
        {
          expectedRevision: command.expectedRevision,
          idempotencyKey: command.idempotencyKey,
          productionEquipmentId: command.productionEquipmentId,
          recordedAt,
          capacityM3: normalizeDecimal(capacity, 3),
          adjustedVolumeM3,
          ticketNumber: command.ticketNumber,
          notes: command.notes,
          officialQuantity,
        },
        snapshotOf(command, "trip-added"),
      );
      if (!result) throw changedConcurrently();
      if (result.payloadConflict)
        throw new AppError({
          code: "IDEMPOTENCY_PAYLOAD_CONFLICT",
          message: "Idempotency key was already used with another trip payload",
          statusCode: 409,
        });
      if (!result.production) throw notFound();
      return toDetailDto(result.production);
    });
  }

  async removeTrip(
    scope: ProductionScope,
    projectId: string,
    productionId: string,
    tripId: string,
    expectedRevision: number,
  ) {
    assertCapability(scope, "createDraft");
    const result = await this.context.transaction(
      async (transactionContext) => {
        const current = await findProductionHandler(
          transactionContext,
          scope,
          projectId,
          productionId,
        );
        if (!current) throw notFound();
        const officialQuantity = calculateOfficialQuantity(
          current,
          current.trips
            .filter((trip) => trip.id !== tripId)
            .map(
              (trip) =>
                trip.adjustedVolumeM3?.toFixed(3) ?? trip.capacityM3.toFixed(3),
            ),
        );
        return removeProductionTripHandler(
          transactionContext,
          scope,
          projectId,
          productionId,
          tripId,
          expectedRevision,
          officialQuantity,
          snapshotOf({ tripId }, "trip-removed"),
        );
      },
    );
    if (!result) throw changedConcurrently();
    if (result.missing) throw notFound();
    if (!result.production) throw notFound();
    return toDetailDto(result.production);
  }

  async dailyReportSummary(
    scope: ProductionScope,
    projectId: string,
    reportId: string,
  ) {
    const report = await findDailyReportForProductionHandler(
      this.context,
      scope,
      projectId,
      reportId,
    );
    if (!report) throw notFound();
    const records = await listShiftProductionsHandler(
      this.context,
      scope,
      projectId,
      report.reportDate,
      report.shift,
    );
    assertShiftCollectionBound(records);
    return summarizeForDailyReport(report.id, records);
  }

  async confirmDailyReport(
    scope: ProductionScope,
    projectId: string,
    reportId: string,
    productionIds: string[],
  ) {
    const report = await findDailyReportForProductionHandler(
      this.context,
      scope,
      projectId,
      reportId,
    );
    if (!report) throw notFound();
    const records = await listShiftProductionsHandler(
      this.context,
      scope,
      projectId,
      report.reportDate,
      report.shift,
    );
    assertShiftCollectionBound(records);
    const selected = records.filter((record) =>
      productionIds.includes(record.id),
    );
    if (
      selected.length !== new Set(productionIds).size ||
      selected.length !== records.length ||
      selected.some((record) => record.status === "DRAFT")
    )
      throw new AppError({
        code: "PRODUCTION_RDO_CONFIRMATION_REQUIRED",
        message: "Draft productions from the report shift cannot be confirmed",
        statusCode: 409,
      });
    await this.context.transaction((transactionContext) =>
      confirmDailyReportProductionsHandler(
        transactionContext,
        scope,
        reportId,
        selected.map((record) => ({
          id: record.id,
          revision: record.revision,
          operationalRevision: record.operationalRevision,
        })),
      ),
    );
    const refreshed = await listShiftProductionsHandler(
      this.context,
      scope,
      projectId,
      report.reportDate,
      report.shift,
    );
    assertShiftCollectionBound(refreshed);
    return summarizeForDailyReport(report.id, refreshed);
  }

  private async resolveWriteData(
    context: HandlerContext,
    scope: ProductionScope,
    projectId: string,
    command: ProductionCommand,
    tripVolumesM3: string[] = [],
  ): Promise<ProductionWriteData> {
    const normalized = normalizeProductionCommand(command);
    const options = await findProductionOptionsContextHandler(
      context,
      scope,
      projectId,
      shiftInterval(normalized.productionDate, normalized.shift),
      shiftToDb(normalized.shift),
    );
    if (!options) throw projectUnavailable();
    if (!options.shiftEnabled) throw shiftNotEnabled();
    assertProductionDateAllowed(
      normalized.productionDate,
      options.project.actualStartedAt,
    );
    const front = options.fronts.find(
      (item) => item.id === normalized.workFrontId,
    );
    const destinationFront =
      command.kind === "material_movement"
        ? options.fronts.find(
            (item) =>
              item.id === command.materialMovement.destinationWorkFrontId,
          )
        : null;
    const service = options.services.find(
      (item) =>
        item.id === normalized.workFrontServiceId &&
        item.workFrontId === normalized.workFrontId,
    );
    if (!front || !service) throw resourceUnavailable("work-front-service");
    if (command.kind === "individual_activity") {
      const usesTrucks = command.entryMode === "truck_summary";
      const isFill = ["fill", "replacement_fill"].includes(service.serviceCode);
      if (
        usesTrucks &&
        (!isVolumetric(service.unitCode) ||
          !command.truckSummaries.length ||
          (!command.individualActivity.dmtKm &&
            command.truckSummaries.some((truck) => !truck.dmtKm)))
      )
        throw resourceUnavailable("truck-summary");
      if (
        (usesTrucks &&
          isFill &&
          command.individualActivity.swellFactor === null &&
          command.individualActivity.compactionReductionPercent === null) ||
        ((command.individualActivity.swellFactor ||
          command.individualActivity.compactionReductionPercent !== null) &&
          !isFill)
      )
        throw resourceUnavailable("swell-factor");
    }
    if (command.kind === "material_movement" && !destinationFront)
      throw resourceUnavailable("destination-work-front");
    if (
      command.kind === "material_movement" &&
      !command.materialMovement.components.some(
        (component) => component.workFrontId === destinationFront!.id,
      )
    )
      throw resourceUnavailable("destination-work-front-service");
    const assignments = options.assignments;
    const assignmentByMachine = new Map(
      assignments.map((item) => [item.machineId, item]),
    );
    const responsible = normalized.responsibleEmploymentId
      ? options.employeeAllocations.find(
          (item) => item.employmentId === normalized.responsibleEmploymentId,
        )?.employment
      : null;
    if (
      normalized.responsibleEmploymentId &&
      (!responsible || !responsible.isActive || responsible.state !== "ACTIVE")
    )
      throw resourceUnavailable("responsible");

    const equipment = normalized.equipment.map((entry) => {
      const assignment = assignmentByMachine.get(entry.machineId);
      if (!assignment || !assignment.machine.isActive)
        throw resourceUnavailable("machine");
      if (
        entry.operatorEmploymentId &&
        entry.operatorEmploymentId !== assignment.operatorEmploymentId
      )
        throw resourceUnavailable("operator");
      return {
        machineId: assignment.machine.id,
        machineNameSnapshot: assignment.machine.name,
        manufacturerSnapshot: assignment.machine.manufacturer,
        modelSnapshot: assignment.machine.model,
        identifierSnapshot: assignment.machine.identifiers[0]?.value ?? null,
        meterTypeSnapshot: assignment.machine.meterType,
        role: roleToDb[entry.role],
        operatorEmploymentId: entry.operatorEmploymentId,
        operatorNameSnapshot:
          entry.operatorEmploymentId && assignment.operator
            ? assignment.operator.person.displayName
            : null,
        initialMeterValue: entry.initialMeterValue
          ? normalizeDecimal(entry.initialMeterValue, 2)
          : null,
        finalMeterValue: entry.finalMeterValue
          ? normalizeDecimal(entry.finalMeterValue, 2)
          : null,
        workedMinutes: entry.workedMinutes,
        productiveMinutes: entry.productiveMinutes,
        waitingMinutes: entry.waitingMinutes,
        stoppedMinutes: entry.stoppedMinutes,
        defaultTripCapacityM3:
          assignment.machine.loadVolumeM3?.toFixed(3) ?? null,
        stops: entry.stops,
      };
    });
    const materialRevision =
      command.kind === "material_movement" &&
      command.materialMovement.materialRevisionId
        ? await findEarthworkMaterialRevisionForProductionHandler(
            context,
            scope,
            projectId,
            command.materialMovement.materialRevisionId,
            shiftInterval(normalized.productionDate, normalized.shift).startAt,
          )
        : null;
    if (
      command.kind === "material_movement" &&
      command.materialMovement.materialRevisionId &&
      !materialRevision
    )
      throw resourceUnavailable("earthwork-material-revision");
    const routeRevision =
      command.kind === "material_movement" &&
      command.materialMovement.routeRevisionId
        ? await findHaulRouteRevisionForProductionHandler(
            context,
            scope,
            projectId,
            command.materialMovement.routeRevisionId,
            shiftInterval(normalized.productionDate, normalized.shift).startAt,
          )
        : null;
    if (
      command.kind === "material_movement" &&
      command.materialMovement.routeRevisionId &&
      !routeRevision
    )
      throw resourceUnavailable("haul-route-revision");
    const effectiveMaterial =
      command.kind === "material_movement"
        ? {
            name:
              materialRevision?.material.name ??
              command.materialMovement.materialName,
            category:
              materialRevision?.material.category ??
              command.materialMovement.materialCategory,
            densityTPerM3:
              materialRevision?.densityTPerM3?.toFixed(6) ??
              command.materialMovement.densityTPerM3,
            swellFactor:
              materialRevision?.swellFactor?.toFixed(6) ??
              command.materialMovement.swellFactor,
            looseToCompactedFactor:
              materialRevision?.looseToCompactedFactor?.toFixed(6) ??
              command.materialMovement.looseToCompactedFactor,
          }
        : null;
    const effectiveRoute =
      command.kind === "material_movement"
        ? {
            origin: front.name,
            destination: destinationFront!.name,
            loadedDistanceKm:
              routeRevision?.loadedDistanceKm.toFixed(3) ??
              command.materialMovement.dmtKm,
            contractualDmtKm:
              routeRevision?.contractualDmtKm?.toFixed(3) ??
              command.materialMovement.contractualDmtKm,
            contractualBand:
              routeRevision?.contractualBand ??
              command.materialMovement.contractualBand,
          }
        : null;
    const profile = resolvedProfile(
      service.productionProfile,
      service.serviceCode,
    );
    if (command.kind === "material_movement")
      validateDmt(service.dmtPolicy, {
        ...normalized,
        origin: effectiveRoute?.origin ?? normalized.origin,
        destination: effectiveRoute?.destination ?? normalized.destination,
        dmtKm: effectiveRoute?.loadedDistanceKm ?? normalized.dmtKm,
      });
    const directQuantity = normalized.directQuantity
      ? normalizeDecimal(normalized.directQuantity, 3)
      : null;
    const measuredQuantity = null;
    const conversionFactor = normalized.conversionFactor
      ? normalizeDecimal(normalized.conversionFactor, 6)
      : null;
    const entryMode =
      normalized.entryMode === "trips"
        ? "TRIPS"
        : normalized.entryMode === "truck_summary"
          ? "TRUCK_SUMMARY"
          : "DIRECT_TOTAL";
    if (command.kind === "material_movement") {
      const summariesWithWeight = command.truckSummaries.filter(
        (truck) => truck.actualWeightT !== null,
      ).length;
      if (
        summariesWithWeight > 0 &&
        summariesWithWeight !== command.truckSummaries.length
      )
        throw new AppError({
          code: "PRODUCTION_MIXED_TRANSPORT_BASIS",
          message:
            "All truck summaries must use the same operational basis when weighbridge values are informed",
          statusCode: 422,
        });
    }
    const movementCalculation =
      command.kind === "material_movement"
        ? calculateEarthworkMovement({
            trucks: command.truckSummaries.map((truck) => {
              const assignment = assignmentByMachine.get(truck.machineId);
              const specification = assignment?.machine.transportSpecification;
              if (!assignment || !specification)
                throw resourceUnavailable("truck");
              return {
                capacity: transportCapacityInM3(
                  specification.effectiveCapacity.toFixed(3),
                  specification.capacityUnitCode,
                ),
                acceptedTrips: truck.acceptedTrips,
                partialTripCount: truck.partialTripCount,
                partialVolume: normalizeDecimal(truck.partialVolume, 3),
                loadFactor: normalizeDecimal(truck.loadFactor, 6),
                actualWeightT: truck.actualWeightT
                  ? normalizeDecimal(truck.actualWeightT, 3)
                  : null,
              };
            }),
            densityTPerM3: effectiveMaterial?.densityTPerM3 ?? null,
            swellFactor: effectiveMaterial?.swellFactor ?? null,
            looseToCompactedFactor:
              effectiveMaterial?.looseToCompactedFactor ?? null,
            contractualDmtKm:
              effectiveRoute?.contractualDmtKm ??
              effectiveRoute?.loadedDistanceKm ??
              null,
          })
        : null;
    const activityTruckVolumes =
      command.kind === "individual_activity" &&
      command.entryMode === "truck_summary"
        ? command.truckSummaries.map((truck) => {
            const specification = assignmentByMachine.get(truck.machineId)
              ?.machine.transportSpecification;
            if (
              !specification ||
              specification.capacityUnitCode === "LITER" ||
              truck.acceptedTrips < 1
            )
              throw resourceUnavailable("truck");
            return calculateTruckSummaryVolume({
              capacity: transportCapacityInM3(
                specification.effectiveCapacity.toFixed(3),
                specification.capacityUnitCode,
              ),
              acceptedTrips: truck.acceptedTrips,
              partialTripCount: truck.partialTripCount,
              partialVolume: normalizeDecimal(truck.partialVolume, 3),
              loadFactor: normalizeDecimal(truck.loadFactor, 6),
              actualWeightT: null,
            });
          })
        : [];
    const activityLooseVolume = scaledToDecimal(
      activityTruckVolumes.reduce(
        (sum, volume) => sum + decimalToScaled(volume, 3),
        BigInt(0),
      ),
      3,
    );
    const activityDmtKm =
      command.kind === "individual_activity" &&
      command.entryMode === "truck_summary" &&
      command.truckSummaries.every((truck) => truck.dmtKm)
        ? (() => {
            const volume = activityTruckVolumes.reduce(
              (sum, value) => sum + decimalToScaled(value, 3),
              BigInt(0),
            );
            if (volume === BigInt(0)) return null;
            const weighted = activityTruckVolumes.reduce(
              (sum, value, index) =>
                sum +
                decimalToScaled(value, 3) *
                  decimalToScaled(command.truckSummaries[index]!.dmtKm!, 3),
              BigInt(0),
            );
            return scaledToDecimal((weighted + volume / BigInt(2)) / volume, 3);
          })()
        : normalized.dmtKm;
    const activityQuantity =
      command.kind === "individual_activity" &&
      command.entryMode === "truck_summary"
        ? command.individualActivity.compactionReductionPercent !== null
          ? calculateCompactedVolumeFromReduction(
              activityLooseVolume,
              command.individualActivity.compactionReductionPercent,
            )
          : command.individualActivity.swellFactor
            ? scaledToDecimal(
                (decimalToScaled(activityLooseVolume, 3) * BigInt(1_000_000) +
                  decimalToScaled(command.individualActivity.swellFactor, 6) /
                    BigInt(2)) /
                  decimalToScaled(command.individualActivity.swellFactor, 6),
                3,
              )
            : activityLooseVolume
        : null;
    const effectiveDirectQuantity =
      movementCalculation?.actualWeightT ??
      movementCalculation?.looseVolumeM3 ??
      activityQuantity ??
      directQuantity;
    const officialQuantity = calculateProductionMetrics({
      tripVolumesM3,
      measuredQuantity,
      directQuantity: effectiveDirectQuantity,
      conversionFactor,
      entryMode,
      dmtKm: normalized.dmtKm,
      unitCode: service.unitCode,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      endDayOffset: normalized.endDayOffset,
      workedMinutes: 0,
      stoppedMinutes: 0,
    }).officialQuantity;

    return {
      source:
        command.source === "operational_center"
          ? "OPERATIONAL_CENTER"
          : "PRODUCTION_PAGE",
      climateConditions: command.climateConditions.map(
        (condition) => productionClimateToDb[condition],
      ),
      kind:
        command.kind === "material_movement"
          ? "MATERIAL_MOVEMENT"
          : "INDIVIDUAL_ACTIVITY",
      workFrontId: normalized.workFrontId,
      workFrontServiceId: normalized.workFrontServiceId,
      serviceCodeSnapshot: service.serviceCode,
      unitCodeSnapshot:
        command.kind === "material_movement"
          ? movementCalculation?.actualWeightT
            ? "T"
            : "M3_LOOSE"
          : explicitUnitCode(
              service.unitCode,
              command.individualActivity.volumeCondition,
            ),
      productionProfileSnapshot: profile,
      dmtPolicySnapshot: service.dmtPolicy,
      productionDate: civilDateValue(normalized.productionDate),
      shift: shiftToDb(normalized.shift),
      shiftOrder: normalized.shift === "day" ? 0 : 1,
      entryMode,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      endDayOffset: normalized.endDayOffset,
      responsibleEmploymentId: normalized.responsibleEmploymentId,
      responsibleNameSnapshot: responsible?.person.displayName ?? null,
      location: normalized.location || front.location,
      startStation: normalized.startStation,
      endStation: normalized.endStation,
      layer: normalized.layer,
      elevation: normalized.elevation,
      materialName: effectiveMaterial?.name ?? normalized.materialName,
      materialCategory:
        effectiveMaterial?.category ?? normalized.materialCategory,
      volumeCondition:
        movementCalculation?.actualWeightT !== null &&
        movementCalculation?.actualWeightT !== undefined
          ? null
          : normalized.volumeCondition
            ? (normalized.volumeCondition.toUpperCase() as
                | "BANK"
                | "LOOSE"
                | "COMPACTED"
                | "PLACED")
            : null,
      directQuantity: effectiveDirectQuantity,
      measuredQuantity,
      officialQuantity,
      conversionFactor:
        command.kind === "individual_activity"
          ? command.individualActivity.swellFactor
          : conversionFactor,
      origin: effectiveRoute?.origin ?? normalized.origin,
      destination: effectiveRoute?.destination ?? normalized.destination,
      dmtKm: effectiveRoute?.loadedDistanceKm
        ? normalizeDecimal(effectiveRoute.loadedDistanceKm, 3)
        : activityDmtKm,
      layerThicknessCm: normalized.layerThicknessCm
        ? normalizeDecimal(normalized.layerThicknessCm, 2)
        : null,
      compactionPasses: normalized.compactionPasses,
      moistureCondition: normalized.moistureCondition,
      evidence: normalized.evidence,
      notes: normalized.notes,
      batchFingerprint:
        command.kind === "material_movement"
          ? movementFingerprint(projectId, command, {
              materialName: effectiveMaterial?.name ?? normalized.materialName,
              origin: effectiveRoute?.origin ?? normalized.origin,
              destination:
                effectiveRoute?.destination ?? normalized.destination,
            })
          : null,
      individualActivity:
        command.kind === "individual_activity"
          ? {
              quantityMethod:
                command.individualActivity.quantityMethod.toUpperCase() as
                  | "MANUAL"
                  | "TOPOGRAPHY"
                  | "LABORATORY",
              location: normalized.location || front.location,
              startStation: normalized.startStation,
              endStation: normalized.endStation,
              layer: normalized.layer,
              elevation: normalized.elevation,
              exceptionalFromMovement:
                command.individualActivity.exceptionalFromMovement,
              exceptionReason: command.individualActivity.exceptionReason,
              destinationKind: command.individualActivity.destinationKind
                ? (command.individualActivity.destinationKind.toUpperCase() as
                    | "FILL"
                    | "DISPOSAL"
                    | "OTHER")
                : null,
              destinationWorkFrontId:
                command.individualActivity.destinationWorkFrontId,
              compactionReductionPercent:
                command.individualActivity.compactionReductionPercent,
            }
          : null,
      materialMovement:
        command.kind === "material_movement"
          ? {
              materialRevisionId: command.materialMovement.materialRevisionId,
              routeRevisionId: command.materialMovement.routeRevisionId,
              origin: effectiveRoute!.origin,
              destination: effectiveRoute!.destination,
              layer: command.materialMovement.layer,
              materialSnapshot: {
                revisionId: command.materialMovement.materialRevisionId,
                name: effectiveMaterial?.name,
                category: effectiveMaterial?.category,
                densityTPerM3: effectiveMaterial?.densityTPerM3,
                swellFactor: effectiveMaterial?.swellFactor,
                looseToCompactedFactor:
                  effectiveMaterial?.looseToCompactedFactor,
              },
              routeSnapshot: {
                revisionId: command.materialMovement.routeRevisionId,
                origin: effectiveRoute?.origin,
                destination: effectiveRoute?.destination,
                loadedDistanceKm: effectiveRoute?.loadedDistanceKm,
                contractualDmtKm: effectiveRoute?.contractualDmtKm,
                contractualBand: effectiveRoute?.contractualBand,
              },
            }
          : null,
      components: resolveComponents(
        command,
        options.services,
        movementCalculation,
        activityQuantity,
      ),
      truckSummaries: command.truckSummaries.length
        ? command.truckSummaries.map((truck) => {
            const assignment = assignmentByMachine.get(truck.machineId);
            const specification = assignment?.machine.transportSpecification;
            if (!assignment || !specification)
              throw resourceUnavailable("truck");
            if (
              truck.driverEmploymentId &&
              truck.driverEmploymentId !== assignment.operatorEmploymentId
            )
              throw resourceUnavailable("driver");
            return {
              machineId: truck.machineId,
              driverEmploymentId: truck.driverEmploymentId,
              driverNameSnapshot:
                truck.driverEmploymentId && assignment.operator
                  ? assignment.operator.person.displayName
                  : null,
              machineNameSnapshot: assignment.machine.name,
              identifierSnapshot:
                assignment.machine.identifiers[0]?.value ?? null,
              capacitySnapshot: specification.effectiveCapacity.toFixed(3),
              capacityUnitCodeSnapshot: specification.capacityUnitCode,
              acceptedTrips: truck.acceptedTrips,
              rejectedTrips: truck.rejectedTrips,
              partialTripCount: truck.partialTripCount,
              partialVolume: normalizeDecimal(truck.partialVolume, 3),
              actualWeightT: truck.actualWeightT
                ? normalizeDecimal(truck.actualWeightT, 3)
                : null,
              loadFactor: normalizeDecimal(truck.loadFactor, 6),
              averageCycleMinutes: truck.averageCycleMinutes,
              averageLoadingMinutes: truck.averageLoadingMinutes
                ? normalizeDecimal(truck.averageLoadingMinutes, 2)
                : null,
              averageUnloadingMinutes: truck.averageUnloadingMinutes
                ? normalizeDecimal(truck.averageUnloadingMinutes, 2)
                : null,
              dmtKm: truck.dmtKm ? normalizeDecimal(truck.dmtKm, 3) : null,
              occurrenceNotes: truck.occurrenceNotes,
            };
          })
        : [],
      equipment,
    };
  }
}

export function toDetailDto(record: ProductionRecord) {
  const metrics = calculateMetrics(record);
  return {
    id: record.id,
    projectId: record.projectId,
    kind: record.kind.toLowerCase(),
    workFrontId: record.workFrontId,
    workFrontServiceId: record.workFrontServiceId,
    serviceCode: record.serviceCodeSnapshot,
    unitCode: record.unitCodeSnapshot,
    productionProfile: record.productionProfileSnapshot.toLowerCase(),
    dmtPolicy: record.dmtPolicySnapshot.toLowerCase(),
    productionDate: civilDate(record.productionDate),
    shift: record.shift.toLowerCase(),
    status: record.status.toLowerCase(),
    source: record.source.toLowerCase(),
    climateConditions: record.climateConditions.map((item) =>
      item.toLowerCase(),
    ),
    entryMode: record.entryMode.toLowerCase(),
    revision: record.revision,
    operationalRevision: record.operationalRevision,
    startTime: record.startTime,
    endTime: record.endTime,
    endDayOffset: record.endDayOffset,
    responsible: record.responsibleEmploymentId
      ? {
          employmentId: record.responsibleEmploymentId,
          name: record.responsibleNameSnapshot,
        }
      : null,
    location: record.location,
    startStation: record.startStation,
    endStation: record.endStation,
    layer: record.layer,
    elevation: record.elevation,
    materialName: record.materialName,
    materialCategory: record.materialCategory,
    volumeCondition:
      record.volumeCondition === "CUT"
        ? "bank"
        : (record.volumeCondition?.toLowerCase() ?? null),
    directQuantity: record.directQuantity?.toFixed(3) ?? null,
    measuredQuantity: record.measuredQuantity?.toFixed(3) ?? null,
    conversionFactor: record.conversionFactor?.toFixed(6) ?? null,
    origin: record.origin,
    destination: record.destination,
    dmtKm: record.dmtKm?.toFixed(3) ?? null,
    layerThicknessCm: record.layerThicknessCm?.toFixed(2) ?? null,
    compactionPasses: record.compactionPasses,
    moistureCondition: record.moistureCondition,
    evidence: productionEvidence(record.evidence),
    notes: record.notes,
    individualActivity: record.individualActivity
      ? {
          quantityMethod:
            record.individualActivity.quantityMethod.toLowerCase(),
          exceptionalFromMovement:
            record.individualActivity.exceptionalFromMovement,
          exceptionReason: record.individualActivity.exceptionReason,
          destinationKind:
            record.individualActivity.destinationKind?.toLowerCase() ?? null,
          destinationWorkFrontId:
            record.individualActivity.destinationWorkFrontId,
          compactionReductionPercent:
            record.individualActivity.compactionReductionPercent?.toFixed(2) ??
            null,
        }
      : null,
    materialMovement: record.materialMovement
      ? {
          materialRevisionId: record.materialMovement.materialRevisionId,
          routeRevisionId: record.materialMovement.routeRevisionId,
          origin: record.materialMovement.origin,
          destination: record.materialMovement.destination,
          layer: record.materialMovement.layer,
          materialSnapshot: record.materialMovement.materialSnapshot,
          routeSnapshot: record.materialMovement.routeSnapshot,
        }
      : null,
    components: record.components.map((component) => ({
      id: component.id,
      workFrontId: component.workFrontId,
      workFrontServiceId: component.workFrontServiceId,
      type: component.componentType.toLowerCase(),
      serviceCode: component.serviceCodeSnapshot,
      unitCode: component.unitCodeSnapshot,
      volumeCondition:
        component.volumeCondition === "CUT"
          ? "bank"
          : (component.volumeCondition?.toLowerCase() ?? null),
      quantities: component.quantities.map((quantity) => ({
        id: quantity.id,
        kind: quantity.kind.toLowerCase(),
        method: quantity.method.toLowerCase(),
        value: quantity.value.toFixed(3),
        unitCode: quantity.unitCode,
        volumeCondition:
          quantity.volumeCondition === "CUT"
            ? "bank"
            : (quantity.volumeCondition?.toLowerCase() ?? null),
        sourceSnapshot: quantity.sourceSnapshot,
      })),
    })),
    truckSummaries: record.truckSummaries.map((truck) => ({
      id: truck.id,
      machineId: truck.machineId,
      machineName: truck.machineNameSnapshot,
      identifier: truck.identifierSnapshot,
      driver: truck.driverEmploymentId
        ? {
            employmentId: truck.driverEmploymentId,
            name: truck.driverNameSnapshot,
          }
        : null,
      effectiveCapacity: truck.capacitySnapshot.toFixed(3),
      capacityUnitCode: truck.capacityUnitCodeSnapshot,
      acceptedTrips: truck.acceptedTrips,
      rejectedTrips: truck.rejectedTrips,
      partialTripCount: truck.partialTripCount,
      partialVolume: truck.partialVolume.toFixed(3),
      actualWeightT: truck.actualWeightT?.toFixed(3) ?? null,
      loadFactor: truck.loadFactor.toFixed(6),
      averageCycleMinutes: truck.averageCycleMinutes,
      averageLoadingMinutes: truck.averageLoadingMinutes?.toFixed(2) ?? null,
      averageUnloadingMinutes:
        truck.averageUnloadingMinutes?.toFixed(2) ?? null,
      dmtKm: truck.dmtKm?.toFixed(3) ?? null,
      occurrenceNotes: truck.occurrenceNotes,
      calculatedVolume: calculateTruckSummaryVolume({
        capacity: truck.capacitySnapshot.toFixed(3),
        acceptedTrips: truck.acceptedTrips,
        partialTripCount: truck.partialTripCount,
        partialVolume: truck.partialVolume.toFixed(3),
        loadFactor: truck.loadFactor.toFixed(6),
        actualWeightT: truck.actualWeightT?.toFixed(3) ?? null,
      }),
    })),
    qualityChecks: record.qualityChecks.map((check) => ({
      id: check.id,
      type: check.type.toLowerCase(),
      status: check.status.toLowerCase(),
      value: check.value?.toFixed(3) ?? null,
      unitCode: check.unitCode,
      notes: check.notes,
      evidence: productionEvidence(check.evidence),
      actorUserId: check.actorUserId,
      createdAt: check.createdAt.toISOString(),
    })),
    approvalHistory: record.approvals.map((approval) => ({
      id: approval.id,
      revision: approval.revision,
      phase: approval.phase.toLowerCase(),
      decision: approval.decision.toLowerCase(),
      reason: approval.reason,
      actorUserId: approval.actorUserId,
      createdAt: approval.createdAt.toISOString(),
    })),
    metrics,
    equipment: record.equipment.map((item) => ({
      id: item.id,
      machineId: item.machineId,
      name: item.machineNameSnapshot,
      manufacturer: item.manufacturerSnapshot,
      model: item.modelSnapshot,
      identifier: item.identifierSnapshot,
      meterType: item.meterTypeSnapshot.toLowerCase(),
      role: item.role.toLowerCase(),
      operator: item.operatorEmploymentId
        ? {
            employmentId: item.operatorEmploymentId,
            name: item.operatorNameSnapshot,
          }
        : null,
      initialMeterValue: item.initialMeterValue?.toFixed(2) ?? null,
      finalMeterValue: item.finalMeterValue?.toFixed(2) ?? null,
      workedMinutes: item.workedMinutes,
      defaultTripCapacityM3: item.defaultTripCapacityM3?.toFixed(3) ?? null,
      stoppedMinutes: item.stops.reduce(
        (total, stop) => total + stop.durationMinutes,
        0,
      ),
      stops: item.stops.map((stop) => ({
        id: stop.id,
        durationMinutes: stop.durationMinutes,
        reason: stop.reason,
        notes: stop.notes,
      })),
      tripCount: item.trips.length,
      tripVolumeM3: sumTripVolume(item.trips),
    })),
    trips: record.trips.map((trip) => ({
      id: trip.id,
      productionEquipmentId: trip.productionEquipmentId,
      idempotencyKey: trip.idempotencyKey,
      recordedAt: trip.recordedAt.toISOString(),
      capacityM3: trip.capacityM3.toFixed(3),
      adjustedVolumeM3: trip.adjustedVolumeM3?.toFixed(3) ?? null,
      ticketNumber: trip.ticketNumber,
      notes: trip.notes,
    })),
    approval: {
      approvedByUserId: record.approvedByUserId,
      approvedAt: record.approvedAt?.toISOString() ?? null,
      direct: record.revisions.some((item) => item.event === "DIRECT_APPROVED"),
    },
    rdo: {
      linked: record.dailyReportLinks.length > 0,
      stale: record.dailyReportLinks.some(
        (item) =>
          item.isStale ||
          item.confirmedOperationalRevision !== record.operationalRevision,
      ),
    },
    lastReopenReason: record.lastReopenReason,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toSummaryDto(record: ProductionRecord) {
  const detail = toDetailDto(record);
  return {
    id: detail.id,
    kind: detail.kind,
    workFrontId: detail.workFrontId,
    workFrontServiceId: detail.workFrontServiceId,
    serviceCode: detail.serviceCode,
    unitCode: detail.unitCode,
    productionDate: detail.productionDate,
    shift: detail.shift,
    status: detail.status,
    source: detail.source,
    climateConditions: detail.climateConditions,
    revision: detail.revision,
    operationalRevision: detail.operationalRevision,
    location: detail.location,
    route:
      detail.origin || detail.destination
        ? { origin: detail.origin, destination: detail.destination }
        : null,
    dmtKm: detail.dmtKm,
    volumeCondition: detail.volumeCondition,
    officialQuantity: detail.metrics.officialQuantity,
    operationalVolumeM3: detail.metrics.operationalVolumeM3,
    tripCount: detail.metrics.tripCount,
    equipmentCount: detail.equipment.length,
    needsApproval: !["approved", "released", "measured"].includes(
      detail.status,
    ),
    rdo: detail.rdo,
    updatedAt: detail.updatedAt,
  };
}

function calculateOfficialQuantity(
  record: ProductionRecord,
  tripVolumesM3: string[],
) {
  return calculateProductionMetrics({
    tripVolumesM3,
    measuredQuantity: record.measuredQuantity?.toFixed(3) ?? null,
    directQuantity: record.directQuantity?.toFixed(3) ?? null,
    conversionFactor: record.conversionFactor?.toFixed(6) ?? null,
    entryMode: record.entryMode,
    dmtKm: record.dmtKm?.toFixed(3) ?? null,
    unitCode: record.unitCodeSnapshot,
    startTime: record.startTime,
    endTime: record.endTime,
    endDayOffset: record.endDayOffset,
    workedMinutes: record.equipment.reduce(
      (total, item) => total + (item.workedMinutes ?? 0),
      0,
    ),
    stoppedMinutes: record.equipment.reduce(
      (total, item) =>
        total +
        item.stops.reduce(
          (stopTotal, stop) => stopTotal + stop.durationMinutes,
          0,
        ),
      0,
    ),
  }).officialQuantity;
}

function calculateMetrics(record: ProductionRecord) {
  const truckSummaryVolumes = record.truckSummaries.map((truck) =>
    calculateTruckSummaryVolume({
      capacity: transportCapacityInM3(
        truck.capacitySnapshot.toFixed(3),
        truck.capacityUnitCodeSnapshot,
      ),
      acceptedTrips: truck.acceptedTrips,
      partialTripCount: truck.partialTripCount,
      partialVolume: truck.partialVolume.toFixed(3),
      loadFactor: truck.loadFactor.toFixed(6),
      actualWeightT: truck.actualWeightT?.toFixed(3) ?? null,
    }),
  );
  const calculated = calculateProductionMetrics({
    tripVolumesM3:
      record.entryMode === "TRUCK_SUMMARY"
        ? truckSummaryVolumes
        : record.trips.map(
            (trip) =>
              trip.adjustedVolumeM3?.toFixed(3) ?? trip.capacityM3.toFixed(3),
          ),
    summaryTripCount:
      record.entryMode === "TRUCK_SUMMARY"
        ? record.truckSummaries.reduce(
            (sum, truck) => sum + truck.acceptedTrips,
            0,
          )
        : undefined,
    measuredQuantity: record.measuredQuantity?.toFixed(3) ?? null,
    directQuantity: record.directQuantity?.toFixed(3) ?? null,
    conversionFactor: record.conversionFactor?.toFixed(6) ?? null,
    entryMode: record.entryMode,
    dmtKm: record.dmtKm?.toFixed(3) ?? null,
    unitCode: record.unitCodeSnapshot,
    startTime: record.startTime,
    endTime: record.endTime,
    endDayOffset: record.endDayOffset,
    workedMinutes: record.equipment.reduce(
      (total, item) => total + (item.workedMinutes ?? 0),
      0,
    ),
    stoppedMinutes: record.equipment.reduce(
      (total, item) =>
        total +
        item.stops.reduce(
          (stopTotal, stop) => stopTotal + stop.durationMinutes,
          0,
        ),
      0,
    ),
  });
  return {
    ...calculated,
    officialQuantity: record.officialQuantity.toFixed(3),
  };
}

export function calculateProductionMetrics(input: {
  tripVolumesM3: string[];
  measuredQuantity: string | null;
  directQuantity: string | null;
  conversionFactor: string | null;
  entryMode: "DIRECT_TOTAL" | "TRUCK_SUMMARY" | "TRIPS";
  summaryTripCount?: number;
  dmtKm: string | null;
  unitCode: string;
  startTime: string | null;
  endTime: string | null;
  endDayOffset: number;
  workedMinutes: number;
  stoppedMinutes: number;
}) {
  const operationalVolumeM3 = scaledToDecimal(
    input.tripVolumesM3.reduce(
      (sum, volume) => sum + decimalToScaled(volume, 3),
      BigInt(0),
    ),
    3,
  );
  const officialQuantity =
    input.measuredQuantity ??
    (input.entryMode === "TRIPS"
      ? isVolumetric(input.unitCode)
        ? operationalVolumeM3
        : input.conversionFactor
          ? multiplyDecimal(
              operationalVolumeM3,
              input.conversionFactor,
              3,
              3,
              6,
            )
          : "0.000"
      : (input.directQuantity ?? "0.000"));
  const difference =
    input.measuredQuantity &&
    input.tripVolumesM3.length &&
    isVolumetric(input.unitCode)
      ? subtractDecimal(input.measuredQuantity, operationalVolumeM3)
      : null;
  const differencePercent =
    difference && Number(operationalVolumeM3) > 0
      ? ((Number(difference) / Number(operationalVolumeM3)) * 100).toFixed(2)
      : null;
  const duration = activityDuration(
    input.startTime,
    input.endTime,
    input.endDayOffset,
  );
  const hours = duration ? duration / 60 : null;
  return {
    operationalVolumeM3,
    officialQuantity,
    difference,
    differencePercent,
    tripCount: input.summaryTripCount ?? input.tripVolumesM3.length,
    tripsPerHour:
      hours && hours > 0
        ? (
            (input.summaryTripCount ?? input.tripVolumesM3.length) / hours
          ).toFixed(2)
        : null,
    quantityPerHour:
      hours && hours > 0 ? (Number(officialQuantity) / hours).toFixed(3) : null,
    dmtKm: input.dmtKm,
    transportMomentM3Km:
      input.dmtKm &&
      (input.tripVolumesM3.length || isVolumetric(input.unitCode))
        ? multiplyDecimal(
            input.tripVolumesM3.length ? operationalVolumeM3 : officialQuantity,
            input.dmtKm,
            3,
          )
        : null,
    workedMinutes: input.workedMinutes,
    stoppedMinutes: input.stoppedMinutes,
  };
}

function validateApproval(record: ProductionRecord) {
  const metrics = calculateMetrics(record);
  validateApprovalData(
    {
      unitCodeSnapshot: record.unitCodeSnapshot,
      kind: record.kind,
      entryMode: record.entryMode,
      volumeCondition:
        record.volumeCondition === "CUT" ? "BANK" : record.volumeCondition,
      responsibleEmploymentId: record.responsibleEmploymentId,
      startTime: record.startTime,
      endTime: record.endTime,
      dmtPolicySnapshot: record.dmtPolicySnapshot,
      dmtKm: record.dmtKm?.toFixed(3) ?? null,
      conversionFactor: record.conversionFactor?.toFixed(6) ?? null,
      origin: record.origin,
      destination: record.destination,
      productionProfileSnapshot: record.productionProfileSnapshot,
      layerThicknessCm: record.layerThicknessCm?.toFixed(2) ?? null,
      compactionPasses: record.compactionPasses,
      equipment: record.equipment.map((item) => ({
        role: item.role,
        defaultTripCapacityM3: item.defaultTripCapacityM3?.toFixed(3) ?? null,
      })),
      truckSummaries: record.truckSummaries.map((truck) => ({
        capacitySnapshot: truck.capacitySnapshot.toFixed(3),
      })),
    },
    {
      operationalQuantity: metrics.officialQuantity,
      tripCount: metrics.tripCount,
    },
  );
}

function validateTechnicalApproval(record: ProductionRecord) {
  const latestByType = new Map<
    ProductionRecord["qualityChecks"][number]["type"],
    ProductionRecord["qualityChecks"][number]
  >();
  for (const check of record.qualityChecks) latestByType.set(check.type, check);
  const rejected = [...latestByType.values()].filter(
    (check) => check.status === "REJECTED",
  );
  if (rejected.length)
    throw new AppError({
      code: "PRODUCTION_QUALITY_REJECTED",
      message: "Rejected quality checks prevent technical approval",
      statusCode: 422,
      data: { types: rejected.map((check) => check.type.toLowerCase()) },
    });
  const requiredTypes =
    record.kind === "INDIVIDUAL_ACTIVITY"
      ? []
      : record.productionProfileSnapshot === "COMPACTION"
        ? ["COMPACTION"]
        : record.productionProfileSnapshot === "GRADING"
          ? ["FINISHING"]
          : [];
  const missing = requiredTypes.filter(
    (type) =>
      latestByType.get(type as "COMPACTION" | "FINISHING")?.status !==
      "ACCEPTED",
  );
  if (missing.length)
    throw new AppError({
      code: "PRODUCTION_QUALITY_PENDING",
      message: "Required quality checks are still pending",
      statusCode: 422,
      data: { types: missing.map((type) => type.toLowerCase()) },
    });
}

function validateApprovalData(
  data: Omit<
    Pick<
      ProductionWriteData,
      | "unitCodeSnapshot"
      | "kind"
      | "entryMode"
      | "volumeCondition"
      | "responsibleEmploymentId"
      | "startTime"
      | "endTime"
      | "dmtPolicySnapshot"
      | "dmtKm"
      | "conversionFactor"
      | "origin"
      | "destination"
      | "productionProfileSnapshot"
      | "layerThicknessCm"
      | "compactionPasses"
    >,
    never
  > & {
    equipment: Array<{
      role: ProductionWriteData["equipment"][number]["role"];
      defaultTripCapacityM3: string | null;
    }>;
    truckSummaries: Array<{ capacitySnapshot: string }>;
  },
  metrics: { operationalQuantity: string; tripCount: number },
) {
  const missing: string[] = [];
  if (!data.responsibleEmploymentId) missing.push("responsible");
  if (data.kind === "MATERIAL_MOVEMENT" && !data.equipment.length)
    missing.push("equipment");
  if (Number(metrics.operationalQuantity) <= 0) missing.push("quantity");
  if (isVolumetric(data.unitCodeSnapshot) && !data.volumeCondition)
    missing.push("volume-condition");
  if (
    data.kind === "MATERIAL_MOVEMENT" &&
    data.productionProfileSnapshot === "TRANSPORT" &&
    !data.equipment.some((item) => item.role === "TRANSPORT")
  )
    missing.push("transport-equipment");
  if (data.entryMode === "TRIPS") {
    if (metrics.tripCount <= 0) missing.push("trips");
    if (
      !data.equipment.some(
        (item) =>
          item.role === "TRANSPORT" && Boolean(item.defaultTripCapacityM3),
      )
    )
      missing.push("transport-equipment-capacity");
    if (!isVolumetric(data.unitCodeSnapshot) && !data.conversionFactor)
      missing.push("conversion-factor");
  }
  if (data.entryMode === "TRUCK_SUMMARY") {
    if (metrics.tripCount <= 0) missing.push("truck-summary-trips");
    if (!data.truckSummaries.length) missing.push("trucks");
  }
  if (
    data.dmtPolicySnapshot === "REQUIRED" &&
    (!data.dmtKm ||
      (data.kind === "MATERIAL_MOVEMENT" &&
        (!data.origin || !data.destination)))
  )
    missing.push("route-dmt");
  if (
    data.kind === "MATERIAL_MOVEMENT" &&
    ["SPREADING", "COMPACTION"].includes(data.productionProfileSnapshot) &&
    !data.layerThicknessCm
  )
    missing.push("layer-thickness");
  if (
    data.kind === "MATERIAL_MOVEMENT" &&
    data.productionProfileSnapshot === "COMPACTION" &&
    data.compactionPasses === null
  )
    missing.push("compaction-passes");
  if (missing.length)
    throw new AppError({
      code: "PRODUCTION_APPROVAL_INCOMPLETE",
      message: "Production is incomplete and cannot be approved",
      statusCode: 422,
      data: { fields: missing },
    });
}

function validateDmt(
  policy: "NOT_APPLICABLE" | "OPTIONAL" | "REQUIRED",
  command: {
    dmtKm: string | null;
    origin: string | null;
    destination: string | null;
  },
) {
  if (
    policy === "NOT_APPLICABLE" &&
    (command.dmtKm || command.origin || command.destination)
  )
    throw new AppError({
      code: "PRODUCTION_DMT_NOT_APPLICABLE",
      message: "DMT is not applicable to this service",
      statusCode: 422,
    });
  if (
    policy === "REQUIRED" &&
    (!command.dmtKm || !command.origin || !command.destination)
  )
    throw new AppError({
      code: "PRODUCTION_DMT_REQUIRED",
      message: "Origin, destination and DMT are required",
      statusCode: 422,
    });
  if (
    policy === "OPTIONAL" &&
    command.dmtKm &&
    (!command.origin || !command.destination)
  )
    throw new AppError({
      code: "PRODUCTION_DMT_REQUIRED",
      message: "Origin and destination are required when DMT is informed",
      statusCode: 422,
    });
}

function summarizeForDailyReport(
  reportId: string,
  records: ProductionRecord[],
) {
  const rows = records.map((record) => {
    const link = record.dailyReportLinks.find(
      (item) => item.dailyReportId === reportId,
    );
    return {
      ...toSummaryDto(record),
      selected: Boolean(link),
      confirmedRevision: link?.confirmedRevision ?? null,
      confirmedOperationalRevision: link?.confirmedOperationalRevision ?? null,
      stale:
        !link ||
        link.isStale ||
        link.confirmedOperationalRevision !== record.operationalRevision,
      qualityPending: !["approved", "released", "measured"].includes(
        record.status.toLowerCase(),
      ),
    };
  });
  const groups = new Map<
    string,
    {
      serviceCode: string;
      unitCode: string;
      volumeCondition: string | null;
      origin: string | null;
      destination: string | null;
      officialQuantity: bigint;
      operationalVolumeM3: bigint;
      tripCount: number;
      transportMomentM3Km: bigint;
      dmtWeightedVolumeM3Km: bigint;
      dmtWeightM3: bigint;
    }
  >();
  for (const record of records) {
    const detail = toDetailDto(record);
    const key = [
      detail.serviceCode,
      detail.unitCode,
      detail.volumeCondition ?? "",
      detail.origin ?? "",
      detail.destination ?? "",
    ].join("|");
    const group = groups.get(key) ?? {
      serviceCode: detail.serviceCode,
      unitCode: detail.unitCode,
      volumeCondition: detail.volumeCondition,
      origin: detail.origin,
      destination: detail.destination,
      officialQuantity: BigInt(0),
      operationalVolumeM3: BigInt(0),
      tripCount: 0,
      transportMomentM3Km: BigInt(0),
      dmtWeightedVolumeM3Km: BigInt(0),
      dmtWeightM3: BigInt(0),
    };
    group.officialQuantity += decimalToScaled(
      detail.metrics.officialQuantity,
      3,
    );
    group.operationalVolumeM3 += decimalToScaled(
      detail.metrics.operationalVolumeM3,
      3,
    );
    group.tripCount += detail.metrics.tripCount;
    group.transportMomentM3Km += decimalToScaled(
      detail.metrics.transportMomentM3Km ?? "0.000",
      3,
    );
    if (detail.dmtKm && isVolumetric(detail.unitCode)) {
      const weight =
        Number(detail.metrics.operationalVolumeM3) > 0
          ? detail.metrics.operationalVolumeM3
          : detail.metrics.officialQuantity;
      group.dmtWeightedVolumeM3Km +=
        decimalToScaled(weight, 3) * decimalToScaled(detail.dmtKm, 3);
      group.dmtWeightM3 += decimalToScaled(weight, 3);
    }
    groups.set(key, group);
  }
  return {
    reportId,
    productions: rows,
    groups: [...groups.values()].map((group) => {
      const {
        dmtWeightM3,
        dmtWeightedVolumeM3Km,
        officialQuantity,
        operationalVolumeM3,
        transportMomentM3Km,
        ...identity
      } = group;
      return {
        ...identity,
        officialQuantity: scaledToDecimal(officialQuantity, 3),
        operationalVolumeM3: scaledToDecimal(operationalVolumeM3, 3),
        transportMomentM3Km: scaledToDecimal(transportMomentM3Km, 3),
        weightedDmtKm:
          dmtWeightM3 > BigInt(0)
            ? scaledToDecimal(
                divideRounded(dmtWeightedVolumeM3Km, dmtWeightM3),
                3,
              )
            : null,
      };
    }),
    hasDrafts: records.some((record) => record.status === "DRAFT"),
    hasPendingQuality: rows.some((row) => row.qualityPending),
    needsReconfirmation: rows.some((row) => row.stale),
  };
}

function capabilities(_scope: ProductionScope) {
  return {
    createDraft: true,
    submit: true,
    check: true,
    recordTopography: true,
    recordLaboratory: true,
    approve: true,
    reject: true,
    release: true,
    reopen: true,
    viewHistory: true,
    measure: true,
    publishDirect: true,
    approveOthers: true,
  };
}

function assertCapability(
  scope: ProductionScope,
  capability: keyof ReturnType<typeof capabilities>,
) {
  if (!capabilities(scope)[capability])
    throw new AppError({
      code: "FORBIDDEN",
      message: "Insufficient production permission",
      statusCode: 403,
    });
}

function assertEquipmentWithTripsPreserved(
  current: ProductionRecord,
  command: ProductionCommand,
) {
  const desired = new Set(command.equipment.map((item) => item.machineId));
  const inUse = current.equipment.filter(
    (item) => item.trips.length > 0 && !desired.has(item.machineId),
  );
  if (inUse.length)
    throw new AppError({
      code: "PRODUCTION_EQUIPMENT_HAS_TRIPS",
      message: "A machine with recorded trips cannot be removed",
      statusCode: 409,
      data: { machineIds: inUse.map((item) => item.machineId) },
    });
}

function assertShiftCollectionBound(records: ProductionRecord[]) {
  if (records.length > 200)
    throw new AppError({
      code: "PRODUCTION_SHIFT_LIMIT_EXCEEDED",
      message: "The production limit for this project shift was exceeded",
      statusCode: 409,
      data: { limit: 200 },
    });
}

function normalizeProductionCommand(command: ProductionCommand) {
  const common = {
    productionDate: command.productionDate,
    shift: command.shift,
    startTime: command.startTime,
    endTime: command.endTime,
    endDayOffset: command.endDayOffset,
    responsibleEmploymentId: command.responsibleEmploymentId,
    evidence: command.evidence,
    notes: command.notes,
    equipment: command.equipment,
  };
  if (command.kind === "individual_activity") {
    const activity = command.individualActivity;
    return {
      ...common,
      kind: command.kind,
      entryMode: command.entryMode,
      workFrontId: activity.workFrontId,
      workFrontServiceId: activity.workFrontServiceId,
      location: activity.location,
      startStation: activity.startStation,
      endStation: activity.endStation,
      layer: activity.layer,
      elevation: activity.elevation,
      materialName: activity.materialName,
      materialCategory: activity.materialCategory,
      volumeCondition: activity.volumeCondition,
      directQuantity: activity.operationalQuantity,
      conversionFactor: activity.conversionFactor,
      origin: null,
      destination: null,
      dmtKm: activity.dmtKm,
      layerThicknessCm: activity.layerThicknessCm,
      compactionPasses: activity.compactionPasses,
      moistureCondition: activity.moistureCondition,
    };
  }
  const movement = command.materialMovement;
  return {
    ...common,
    kind: command.kind,
    entryMode: command.entryMode,
    workFrontId: movement.workFrontId,
    workFrontServiceId: movement.workFrontServiceId,
    location: null,
    startStation: null,
    endStation: null,
    layer: movement.layer,
    elevation: null,
    materialName: movement.materialName,
    materialCategory: movement.materialCategory,
    volumeCondition: movement.volumeCondition,
    directQuantity: null,
    conversionFactor: null,
    origin: movement.origin,
    destination: movement.destination,
    dmtKm: movement.dmtKm,
    layerThicknessCm: movement.layerThicknessCm,
    compactionPasses: movement.compactionPasses,
    moistureCondition: movement.moistureCondition,
  };
}

function resolveComponents(
  command: ProductionCommand,
  services: Array<{
    id: string;
    workFrontId: string;
    serviceCode: string;
    unitCode: string;
  }>,
  movementCalculation: ReturnType<typeof calculateEarthworkMovement> | null,
  activityQuantity: string | null,
): ProductionWriteData["components"] {
  if (command.kind === "individual_activity") {
    const activity = command.individualActivity;
    const service = services.find(
      (item) =>
        item.id === activity.workFrontServiceId &&
        item.workFrontId === activity.workFrontId,
    );
    if (!service) throw resourceUnavailable("work-front-service");
    const volumeCondition = dbVolumeCondition(activity.volumeCondition);
    return [
      {
        workFrontId: activity.workFrontId,
        workFrontServiceId: activity.workFrontServiceId,
        componentType: "INDIVIDUAL",
        position: 0,
        serviceCodeSnapshot: service.serviceCode,
        unitCodeSnapshot: explicitUnitCode(
          service.unitCode,
          activity.volumeCondition,
        ),
        volumeCondition,
        quantities:
          (activityQuantity ?? activity.operationalQuantity)
            ? [
                {
                  kind: "OPERATIONAL",
                  method: activityQuantity
                    ? "TRUCK_SUMMARY"
                    : (activity.quantityMethod.toUpperCase() as
                        | "MANUAL"
                        | "TOPOGRAPHY"
                        | "LABORATORY"),
                  value: normalizeDecimal(
                    activityQuantity ?? activity.operationalQuantity!,
                    3,
                  ),
                  unitCode: explicitUnitCode(
                    service.unitCode,
                    activity.volumeCondition,
                  ),
                  volumeCondition,
                  sourceSnapshot: {
                    enteredBy: "wizard",
                    accepted: false,
                    ...(activityQuantity
                      ? {
                          truckSummary: true,
                          swellFactor: activity.swellFactor,
                        }
                      : {}),
                  },
                },
              ]
            : [],
      },
    ];
  }
  return command.materialMovement.components.map((component, position) => {
    const service = services.find(
      (item) =>
        item.id === component.workFrontServiceId &&
        item.workFrontId === component.workFrontId,
    );
    if (!service) throw resourceUnavailable("movement-component-service");
    const volumeCondition = dbVolumeCondition(component.volumeCondition);
    const quantities: ProductionWriteData["components"][number]["quantities"] =
      [];
    if (component.operationalQuantity)
      quantities.push({
        kind: "OPERATIONAL",
        method: "MANUAL",
        value: normalizeDecimal(component.operationalQuantity, 3),
        unitCode: component.unitCode,
        volumeCondition,
        sourceSnapshot: { enteredBy: "wizard", accepted: false },
      });
    else if (component.type === "transport" && movementCalculation)
      quantities.push({
        kind: "OPERATIONAL",
        method: movementCalculation.actualWeightT
          ? "WEIGHBRIDGE"
          : "TRUCK_SUMMARY",
        value:
          movementCalculation.actualWeightT ??
          movementCalculation.looseVolumeM3,
        unitCode: movementCalculation.actualWeightT ? "T" : "M3_LOOSE",
        volumeCondition: movementCalculation.actualWeightT ? null : "LOOSE",
        sourceSnapshot: {
          truckSummary: true,
          rejectedTripsExcluded: true,
        },
      });
    const estimated =
      component.type === "cut"
        ? movementCalculation?.estimatedBankVolumeM3
        : ["fill", "compaction"].includes(component.type)
          ? movementCalculation?.estimatedCompactedVolumeM3
          : null;
    if (estimated)
      quantities.push({
        kind: "ESTIMATED",
        method: "CONVERTED",
        value: estimated,
        unitCode: component.type === "cut" ? "M3_BANK" : "M3_COMPACTED",
        volumeCondition: component.type === "cut" ? "BANK" : "COMPACTED",
        sourceSnapshot: {
          materialFactors: true,
          technicallyAccepted: false,
        },
      });
    return {
      workFrontId: component.workFrontId,
      workFrontServiceId: component.workFrontServiceId,
      componentType: component.type.toUpperCase() as Exclude<
        ProductionWriteData["components"][number]["componentType"],
        "INDIVIDUAL"
      >,
      position,
      serviceCodeSnapshot: service.serviceCode,
      unitCodeSnapshot: component.unitCode,
      volumeCondition,
      quantities,
    };
  });
}

function dbVolumeCondition(
  value: "bank" | "loose" | "compacted" | "placed" | null,
) {
  return value
    ? (value.toUpperCase() as "BANK" | "LOOSE" | "COMPACTED" | "PLACED")
    : null;
}

function explicitUnitCode(
  unitCode: string,
  condition: "bank" | "loose" | "compacted" | "placed" | null,
) {
  if (unitCode.toUpperCase() !== "M3" || !condition) return unitCode;
  return `M3_${condition.toUpperCase()}`;
}

function movementFingerprint(
  projectId: string,
  command: Extract<ProductionCommand, { kind: "material_movement" }>,
  resolved: {
    materialName: string | null;
    origin: string | null;
    destination: string | null;
  },
) {
  const movement = command.materialMovement;
  const canonical = JSON.stringify({
    projectId,
    productionDate: command.productionDate,
    shift: command.shift,
    materialRevisionId: movement.materialRevisionId,
    material: resolved.materialName?.trim().toLocaleLowerCase("pt-BR") ?? null,
    origin: resolved.origin?.trim().toLocaleLowerCase("pt-BR") ?? null,
    destination:
      resolved.destination?.trim().toLocaleLowerCase("pt-BR") ?? null,
    routeRevisionId: movement.routeRevisionId,
    layer: movement.layer?.trim().toLocaleLowerCase("pt-BR") ?? null,
    components: movement.components.map((component) => ({
      workFrontId: component.workFrontId,
      workFrontServiceId: component.workFrontServiceId,
      type: component.type,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function productionDateLimits(actualStartedAt: Date | null) {
  const maximum = todayInBusinessZone();
  const sevenDaysAgo = new Date(civilDateValue(maximum));
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const projectStart = actualStartedAt
    ? dateInBusinessZone(actualStartedAt)
    : null;
  const minimumByWindow = civilDate(sevenDaysAgo);
  return {
    minimum:
      projectStart && projectStart > minimumByWindow
        ? projectStart
        : minimumByWindow,
    maximum,
    timeZone: BUSINESS_TIME_ZONE,
  };
}

function assertProductionDateAllowed(
  productionDate: string,
  actualStartedAt: Date | null,
) {
  const limits = productionDateLimits(actualStartedAt);
  if (productionDate < limits.minimum || productionDate > limits.maximum)
    throw new AppError({
      code: "PRODUCTION_DATE_OUT_OF_RANGE",
      message: "Production date is outside the allowed operational window",
      statusCode: 422,
      data: limits,
    });
}

function todayInBusinessZone() {
  return dateInBusinessZone(new Date());
}

function dateInBusinessZone(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function shiftToDb(shift: "day" | "night") {
  return shift === "day" ? ("DAY" as const) : ("NIGHT" as const);
}

function shiftInterval(productionDate: string, shift: "day" | "night") {
  return shift === "day"
    ? intervalFromLocal(productionDate, "00:00", "23:59", 0)
    : intervalFromLocal(productionDate, "18:00", "06:00", 1);
}

function intervalFromLocal(
  date: string,
  startTime: string,
  endTime: string,
  endDayOffset: number,
) {
  return {
    startAt: zonedDate(date, startTime, 0),
    endAt: zonedDate(date, endTime, endDayOffset),
  };
}

function zonedDate(date: string, time: string, dayOffset: number) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const base = new Date(
    Date.UTC(year, month - 1, day + dayOffset, hour, minute),
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(base);
  const offset =
    parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-3";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/u.exec(offset);
  const minutes = match
    ? (match[1] === "+" ? 1 : -1) *
      (Number(match[2]) * 60 + Number(match[3] ?? 0))
    : -180;
  return new Date(base.getTime() - minutes * 60_000);
}

function civilDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function civilDateValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function resolvedProfile(
  stored:
    | "GENERIC"
    | "EXCAVATION"
    | "LOADING"
    | "TRANSPORT"
    | "SPREADING"
    | "GRADING"
    | "COMPACTION",
  serviceCode: string,
) {
  return stored === "GENERIC"
    ? (profileByServiceCode[serviceCode] ?? "GENERIC")
    : stored;
}

function normalizeDecimal(value: string, fractionDigits: number) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(fractionDigits, "0").slice(0, fractionDigits)}`;
}

function sumTripVolume(
  trips: Array<{
    capacityM3: { toFixed(digits: number): string };
    adjustedVolumeM3: { toFixed(digits: number): string } | null;
  }>,
) {
  const total = trips.reduce(
    (sum, trip) =>
      sum +
      decimalToScaled(
        trip.adjustedVolumeM3?.toFixed(3) ?? trip.capacityM3.toFixed(3),
        3,
      ),
    BigInt(0),
  );
  return scaledToDecimal(total, 3);
}

function subtractDecimal(left: string, right: string) {
  return scaledToDecimal(
    decimalToScaled(left, 3) - decimalToScaled(right, 3),
    3,
  );
}

function multiplyDecimal(
  left: string,
  right: string,
  outputDigits: number,
  leftDigits = outputDigits,
  rightDigits = outputDigits,
) {
  const scale = BigInt(10 ** (leftDigits + rightDigits - outputDigits));
  const product =
    decimalToScaled(left, leftDigits) * decimalToScaled(right, rightDigits);
  return scaledToDecimal(divideRounded(product, scale), outputDigits);
}

function divideRounded(numerator: bigint, denominator: bigint) {
  if (denominator === BigInt(0)) return BigInt(0);
  const negative = numerator < BigInt(0) !== denominator < BigInt(0);
  const absoluteNumerator = numerator < BigInt(0) ? -numerator : numerator;
  const absoluteDenominator =
    denominator < BigInt(0) ? -denominator : denominator;
  const result =
    (absoluteNumerator + absoluteDenominator / BigInt(2)) / absoluteDenominator;
  return negative ? -result : result;
}

function decimalToScaled(value: string, digits: number) {
  const negative = value.startsWith("-");
  const normalized = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = normalized.split(".");
  const scaled =
    BigInt(whole || "0") * BigInt(10 ** digits) +
    BigInt(fraction.padEnd(digits, "0").slice(0, digits) || "0");
  return negative ? -scaled : scaled;
}

function scaledToDecimal(value: bigint, digits: number) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const divisor = BigInt(10 ** digits);
  return `${negative ? "-" : ""}${absolute / divisor}.${String(
    absolute % divisor,
  ).padStart(digits, "0")}`;
}

function activityDuration(
  startTime: string | null,
  endTime: string | null,
  endDayOffset: number,
) {
  if (!startTime || !endTime) return null;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endDayOffset * 1440 + endHour * 60 + endMinute;
  return end > start ? end - start : null;
}

function isVolumetric(unitCode: string) {
  return /^M3(?:_|$)/u.test(unitCode.toUpperCase());
}

type ProductionJsonValue =
  | string
  | number
  | boolean
  | null
  | ProductionJsonValue[]
  | { [key: string]: ProductionJsonValue };

function snapshotOf(
  value: unknown,
  event: string,
): { event: string; value: ProductionJsonValue } {
  return {
    event,
    value: JSON.parse(JSON.stringify(value)) as ProductionJsonValue,
  };
}

function productionEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      !["photo", "ticket", "attachment"].includes(String(item.kind)) ||
      typeof item.name !== "string" ||
      typeof item.url !== "string"
    )
      return [];
    return [
      {
        kind: item.kind as "photo" | "ticket" | "attachment",
        name: item.name,
        url: item.url,
        notes: typeof item.notes === "string" ? item.notes : null,
      },
    ];
  });
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function projectUnavailable() {
  return new AppError({
    code: "PRODUCTION_PROJECT_UNAVAILABLE",
    message: "Project is unavailable for production",
    statusCode: 409,
  });
}

function shiftNotEnabled() {
  return new AppError({
    code: "PROJECT_SHIFT_NOT_ENABLED",
    message: "O turno selecionado não está habilitado para esta obra",
    statusCode: 409,
  });
}

function resourceUnavailable(resource: string) {
  return new AppError({
    code: "PRODUCTION_RESOURCE_UNAVAILABLE",
    message: "Production resource is unavailable",
    statusCode: 409,
    data: { resource },
  });
}

function notFound() {
  return new AppError({
    code: "NOT_FOUND",
    message: "Production not found",
    statusCode: 404,
  });
}

function immutable() {
  return new AppError({
    code: "PRODUCTION_IMMUTABLE",
    message: "Production state does not allow this operation",
    statusCode: 409,
  });
}

function changedConcurrently() {
  return new AppError({
    code: "PRODUCTION_REVISION_CONFLICT",
    message: "Production changed concurrently",
    statusCode: 409,
  });
}

function revisionRequired() {
  return new AppError({
    code: "VALIDATION_ERROR",
    message: "Expected revision is required when updating a production",
    statusCode: 400,
  });
}

function transitionReasonRequired() {
  return new AppError({
    code: "PRODUCTION_TRANSITION_REASON_REQUIRED",
    message: "A reason is required for this production transition",
    statusCode: 422,
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "../../lib/utils/appError";
import { jsonResponse } from "../../lib/utils/jsonResponse";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../lib/utils/zodResolver";
import {
  dailyReportProductionConfirmSchema,
  productionCommandSchema,
  productionDecisionSchema,
  productionHistoryQuerySchema,
  productionListQuerySchema,
  productionOptionsQuerySchema,
  productionParamsSchema,
  productionReopenSchema,
  productionQualityCheckSchema,
  productionTransitionSchema,
  productionTripDeleteQuerySchema,
  productionTripSchema,
} from "./productions.dto";
import { ProductionsService } from "./productions.service";

const uuid = { type: "string", format: "uuid" } as const;
const nullableString = { type: "string", nullable: true } as const;
const decimal = {
  type: "string",
  pattern: "^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,6})?$",
} as const;
const nullableDecimal = { ...decimal, nullable: true } as const;
const shift = { type: "string", enum: ["day", "night"] } as const;
const productionStatus = {
  type: "string",
  enum: [
    "draft",
    "submitted",
    "field_checked",
    "awaiting_technical",
    "approved",
    "rejected",
    "released",
    "measured",
  ],
} as const;
const equipmentRole = {
  type: "string",
  enum: [
    "excavation",
    "loading",
    "transport",
    "spreading",
    "grading",
    "compaction",
    "watering",
    "support",
  ],
} as const;

const errorSchema = {
  type: "object",
  required: ["success", "code", "message", "details", "requestId"],
  properties: {
    success: { type: "boolean", const: false },
    code: { type: "string" },
    message: { type: "string" },
    details: { type: "object", nullable: true, additionalProperties: true },
    requestId: { type: "string" },
  },
} as const;

const successSchema = (data: object) => ({
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data,
  },
});

const projectParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId"],
  properties: { projectId: uuid },
} as const;
const productionParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "productionId"],
  properties: { projectId: uuid, productionId: uuid },
} as const;
const tripParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "productionId", "tripId"],
  properties: { projectId: uuid, productionId: uuid, tripId: uuid },
} as const;
const reportParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "reportId"],
  properties: { projectId: uuid, reportId: uuid },
} as const;

const stopCommandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["durationMinutes", "reason"],
  properties: {
    durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
    reason: { type: "string", minLength: 1, maxLength: 160 },
    notes: { type: "string", nullable: true, maxLength: 500 },
  },
} as const;
const equipmentCommandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["machineId", "role"],
  properties: {
    machineId: uuid,
    role: equipmentRole,
    operatorEmploymentId: { ...uuid, nullable: true },
    initialMeterValue: nullableDecimal,
    finalMeterValue: nullableDecimal,
    workedMinutes: {
      type: "integer",
      nullable: true,
      minimum: 0,
      maximum: 1440,
    },
    productiveMinutes: {
      type: "integer",
      nullable: true,
      minimum: 0,
      maximum: 1440,
    },
    waitingMinutes: {
      type: "integer",
      nullable: true,
      minimum: 0,
      maximum: 1440,
    },
    stoppedMinutes: {
      type: "integer",
      nullable: true,
      minimum: 0,
      maximum: 1440,
    },
    defaultTripCapacityM3: nullableDecimal,
    stops: { type: "array", maxItems: 20, items: stopCommandSchema },
  },
} as const;
const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "name", "url"],
  properties: {
    kind: { type: "string", enum: ["photo", "ticket", "attachment"] },
    name: { type: "string", minLength: 1, maxLength: 160 },
    url: { type: "string", format: "uri", maxLength: 2_000 },
    notes: { type: "string", nullable: true, maxLength: 500 },
  },
} as const;

const volumeCondition = {
  type: "string",
  nullable: true,
  enum: ["bank", "loose", "compacted", "placed"],
} as const;
const productionCommandCommonProperties = {
  expectedRevision: { type: "integer", minimum: 1 },
  submitNow: { type: "boolean" },
  approveNow: { type: "boolean", deprecated: true },
  productionDate: { type: "string", format: "date" },
  shift,
  startTime: {
    type: "string",
    nullable: true,
    pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
  },
  endTime: {
    type: "string",
    nullable: true,
    pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
  },
  endDayOffset: { type: "integer", minimum: 0, maximum: 1 },
  responsibleEmploymentId: { ...uuid, nullable: true },
  evidence: { type: "array", maxItems: 20, items: evidenceSchema },
  notes: { type: "string", nullable: true, maxLength: 10_000 },
  equipment: {
    type: "array",
    maxItems: 100,
    items: equipmentCommandSchema,
  },
} as const;
const individualActivityCommandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workFrontId", "workFrontServiceId"],
  properties: {
    workFrontId: uuid,
    workFrontServiceId: uuid,
    quantityMethod: {
      type: "string",
      enum: ["manual", "topography", "laboratory"],
    },
    location: { type: "string", nullable: true, maxLength: 240 },
    startStation: { type: "string", nullable: true, maxLength: 80 },
    endStation: { type: "string", nullable: true, maxLength: 80 },
    layer: { type: "string", nullable: true, maxLength: 80 },
    elevation: { type: "string", nullable: true, maxLength: 80 },
    materialName: { type: "string", nullable: true, maxLength: 160 },
    materialCategory: { type: "string", nullable: true, maxLength: 120 },
    volumeCondition,
    operationalQuantity: nullableDecimal,
    conversionFactor: nullableDecimal,
    layerThicknessCm: nullableDecimal,
    compactionPasses: {
      type: "integer",
      nullable: true,
      minimum: 0,
      maximum: 100,
    },
    moistureCondition: { type: "string", nullable: true, maxLength: 120 },
    exceptionalFromMovement: { type: "boolean" },
    exceptionReason: { type: "string", nullable: true, maxLength: 500 },
  },
} as const;
const movementComponentCommandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workFrontId", "workFrontServiceId", "type", "unitCode"],
  properties: {
    workFrontId: uuid,
    workFrontServiceId: uuid,
    type: {
      type: "string",
      enum: [
        "cut",
        "loading",
        "transport",
        "unloading",
        "spreading",
        "compaction",
        "fill",
        "finishing",
      ],
    },
    operationalQuantity: nullableDecimal,
    unitCode: { type: "string", minLength: 1, maxLength: 32 },
    volumeCondition,
  },
} as const;
const materialMovementCommandSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "workFrontId",
    "workFrontServiceId",
    "destinationWorkFrontId",
    "dmtKm",
    "components",
  ],
  properties: {
    workFrontId: uuid,
    workFrontServiceId: uuid,
    destinationWorkFrontId: uuid,
    materialRevisionId: { ...uuid, nullable: true },
    routeRevisionId: { ...uuid, nullable: true },
    materialName: {
      type: "string",
      nullable: true,
      minLength: 1,
      maxLength: 160,
    },
    materialCategory: { type: "string", nullable: true, maxLength: 120 },
    densityTPerM3: nullableDecimal,
    swellFactor: nullableDecimal,
    looseToCompactedFactor: nullableDecimal,
    origin: { type: "string", nullable: true, minLength: 1, maxLength: 240 },
    destination: {
      type: "string",
      nullable: true,
      minLength: 1,
      maxLength: 240,
    },
    dmtKm: decimal,
    contractualDmtKm: nullableDecimal,
    contractualBand: { type: "string", nullable: true, maxLength: 80 },
    layer: { type: "string", nullable: true, maxLength: 80 },
    volumeCondition,
    layerThicknessCm: nullableDecimal,
    compactionPasses: {
      type: "integer",
      nullable: true,
      minimum: 0,
      maximum: 100,
    },
    moistureCondition: { type: "string", nullable: true, maxLength: 120 },
    components: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: movementComponentCommandSchema,
    },
  },
} as const;
const truckSummaryCommandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["machineId", "acceptedTrips"],
  properties: {
    machineId: uuid,
    driverEmploymentId: { ...uuid, nullable: true },
    acceptedTrips: { type: "integer", minimum: 0, maximum: 10_000 },
    rejectedTrips: { type: "integer", minimum: 0, maximum: 10_000 },
    partialTripCount: { type: "integer", minimum: 0, maximum: 10_000 },
    partialVolume: decimal,
    actualWeightT: nullableDecimal,
    loadFactor: decimal,
    averageCycleMinutes: {
      type: "integer",
      nullable: true,
      minimum: 0,
      maximum: 1440,
    },
    occurrenceNotes: { type: "string", nullable: true, maxLength: 500 },
  },
} as const;
const productionCommandOpenApiSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "productionDate", "shift", "individualActivity"],
      properties: {
        ...productionCommandCommonProperties,
        kind: { type: "string", const: "individual_activity" },
        entryMode: { type: "string", const: "direct_total" },
        individualActivity: individualActivityCommandSchema,
        truckSummaries: {
          type: "array",
          maxItems: 100,
          items: truckSummaryCommandSchema,
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "productionDate",
        "shift",
        "materialMovement",
        "truckSummaries",
      ],
      properties: {
        ...productionCommandCommonProperties,
        kind: { type: "string", const: "material_movement" },
        entryMode: {
          type: "string",
          enum: ["truck_summary", "trips"],
        },
        materialMovement: materialMovementCommandSchema,
        truckSummaries: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: truckSummaryCommandSchema,
        },
      },
    },
  ],
} as const;

const metricsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "operationalVolumeM3",
    "officialQuantity",
    "difference",
    "differencePercent",
    "tripCount",
    "tripsPerHour",
    "quantityPerHour",
    "dmtKm",
    "transportMomentM3Km",
    "workedMinutes",
    "stoppedMinutes",
  ],
  properties: {
    operationalVolumeM3: decimal,
    officialQuantity: decimal,
    difference: nullableString,
    differencePercent: nullableString,
    tripCount: { type: "integer" },
    tripsPerHour: nullableString,
    quantityPerHour: nullableString,
    dmtKm: nullableString,
    transportMomentM3Km: nullableString,
    workedMinutes: { type: "integer" },
    stoppedMinutes: { type: "integer" },
  },
} as const;

const summarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "serviceCode",
    "unitCode",
    "productionDate",
    "shift",
    "status",
    "revision",
    "operationalRevision",
    "location",
    "route",
    "dmtKm",
    "volumeCondition",
    "officialQuantity",
    "operationalVolumeM3",
    "tripCount",
    "equipmentCount",
    "needsApproval",
    "rdo",
    "updatedAt",
  ],
  properties: {
    id: uuid,
    kind: {
      type: "string",
      enum: ["individual_activity", "material_movement"],
    },
    serviceCode: { type: "string" },
    unitCode: { type: "string" },
    productionDate: { type: "string", format: "date" },
    shift,
    status: productionStatus,
    revision: { type: "integer" },
    operationalRevision: { type: "integer" },
    location: nullableString,
    route: {
      type: "object",
      nullable: true,
      required: ["origin", "destination"],
      properties: { origin: nullableString, destination: nullableString },
    },
    dmtKm: nullableString,
    volumeCondition: nullableString,
    officialQuantity: decimal,
    operationalVolumeM3: decimal,
    tripCount: { type: "integer" },
    equipmentCount: { type: "integer" },
    needsApproval: { type: "boolean" },
    rdo: {
      type: "object",
      required: ["linked", "stale"],
      properties: {
        linked: { type: "boolean" },
        stale: { type: "boolean" },
      },
    },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const productionDetailSchema = {
  type: "object",
  additionalProperties: true,
  required: [
    "id",
    "kind",
    "projectId",
    "workFrontId",
    "workFrontServiceId",
    "serviceCode",
    "unitCode",
    "productionProfile",
    "dmtPolicy",
    "productionDate",
    "shift",
    "status",
    "entryMode",
    "revision",
    "operationalRevision",
    "metrics",
    "equipment",
    "trips",
    "approval",
    "rdo",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: uuid,
    kind: {
      type: "string",
      enum: ["individual_activity", "material_movement"],
    },
    projectId: uuid,
    workFrontId: uuid,
    workFrontServiceId: uuid,
    serviceCode: { type: "string" },
    unitCode: { type: "string" },
    productionProfile: { type: "string" },
    dmtPolicy: { type: "string" },
    productionDate: { type: "string", format: "date" },
    shift,
    status: productionStatus,
    entryMode: {
      type: "string",
      enum: ["direct_total", "truck_summary", "trips"],
    },
    revision: { type: "integer" },
    operationalRevision: { type: "integer" },
    evidence: { type: "array", items: evidenceSchema },
    metrics: metricsSchema,
    equipment: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    trips: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    components: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    truckSummaries: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    qualityChecks: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    approvalHistory: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    approval: { type: "object", additionalProperties: true },
    rdo: { type: "object", additionalProperties: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const capabilitiesSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "createDraft",
    "submit",
    "check",
    "recordTopography",
    "recordLaboratory",
    "approve",
    "reject",
    "release",
    "reopen",
    "viewHistory",
    "measure",
  ],
  properties: {
    createDraft: { type: "boolean" },
    submit: { type: "boolean" },
    check: { type: "boolean" },
    recordTopography: { type: "boolean" },
    recordLaboratory: { type: "boolean" },
    approve: { type: "boolean" },
    reject: { type: "boolean" },
    release: { type: "boolean" },
    publishDirect: { type: "boolean" },
    approveOthers: { type: "boolean" },
    reopen: { type: "boolean" },
    viewHistory: { type: "boolean" },
    measure: { type: "boolean" },
  },
} as const;

const productionOptionsSchema = {
  type: "object",
  additionalProperties: true,
  required: ["workFronts", "dateLimits"],
  properties: {
    dateLimits: {
      type: "object",
      required: ["minimum", "maximum", "timeZone"],
      properties: {
        minimum: { type: "string", format: "date" },
        maximum: { type: "string", format: "date" },
        timeZone: { type: "string" },
      },
    },
    workFronts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["equipment", "trucks"],
        properties: {
          equipment: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["loadVolumeM3", "maxSupportedWeightT"],
              properties: {
                loadVolumeM3: { type: "string", nullable: true },
                maxSupportedWeightT: { type: "string", nullable: true },
              },
            },
          },
          trucks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: [
                "nominalCapacity",
                "effectiveCapacity",
                "capacityUnitCode",
              ],
              properties: {
                nominalCapacity: { type: "string" },
                effectiveCapacity: { type: "string" },
                capacityUnitCode: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const commonErrors = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  422: errorSchema,
} as const;

function scopeFromRequest(request: {
  authContext?: {
    corporationId: string;
    companyId?: string;
    userId?: string;
    role: "MASTER_ADMIN";
  };
}) {
  const corporationId = request.authContext?.corporationId;
  const companyId = request.authContext?.companyId;
  const actorUserId = request.authContext?.userId;
  const role = request.authContext?.role;
  if (!corporationId || !companyId || !actorUserId || !role)
    throw new AppError({
      code: "COMPANY_CONTEXT_REQUIRED",
      message: "Company context required",
      statusCode: 403,
    });
  return { corporationId, companyId, actorUserId, role };
}

export const v1ProductionsController = async (app: FastifyInstance) => {
  const service = new ProductionsService(app.handlerContext);

  app.get(
    "/projects/:projectId/productions",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateQuery(productionListQuerySchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "List earthworks productions",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            cursor: { type: "string" },
            productionDate: { type: "string", format: "date" },
            shift,
            status: productionStatus,
            kind: {
              type: "string",
              enum: ["individual_activity", "material_movement"],
            },
            workFrontId: uuid,
            sortBy: {
              type: "string",
              enum: ["productionDate"],
              default: "productionDate",
            },
            sortDirection: {
              type: "string",
              enum: ["asc", "desc"],
              default: "desc",
            },
          },
        },
        response: {
          200: successSchema({
            type: "object",
            required: ["data", "pageInfo", "capabilities"],
            properties: {
              data: { type: "array", items: summarySchema },
              pageInfo: {
                type: "object",
                required: ["hasNextPage", "nextCursor"],
                properties: {
                  hasNextPage: { type: "boolean" },
                  nextCursor: { type: "string", nullable: true },
                },
              },
              capabilities: capabilitiesSchema,
            },
          }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.list(
        scopeFromRequest(request),
        projectId,
        request.query as z.infer<typeof productionListQuerySchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.get(
    "/projects/:projectId/productions/options",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateQuery(productionOptionsQuerySchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Resolve production options for a shift",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["productionDate", "shift"],
          properties: {
            productionDate: { type: "string", format: "date" },
            shift,
          },
        },
        response: {
          200: successSchema(productionOptionsSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.options(
        scopeFromRequest(request),
        projectId,
        request.query as z.infer<typeof productionOptionsQuerySchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.get(
    "/projects/:projectId/productions/:productionId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Get an earthworks production",
        security: [{ bearerAuth: [] }],
        params: productionParams,
        response: {
          200: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.detail(
        scopeFromRequest(request),
        projectId,
        productionId!,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.get(
    "/projects/:projectId/productions/:productionId/history",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateQuery(productionHistoryQuerySchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "List the append-only production history",
        security: [{ bearerAuth: [] }],
        params: productionParams,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            cursor: { type: "string" },
            sortBy: {
              type: "string",
              enum: ["revision"],
              default: "revision",
            },
            sortDirection: {
              type: "string",
              enum: ["asc", "desc"],
              default: "desc",
            },
          },
        },
        response: {
          200: successSchema({
            type: "object",
            required: ["data", "pageInfo"],
            properties: {
              data: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              pageInfo: {
                type: "object",
                required: ["hasNextPage", "nextCursor"],
                properties: {
                  hasNextPage: { type: "boolean" },
                  nextCursor: { type: "string", nullable: true },
                },
              },
            },
          }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.history(
        scopeFromRequest(request),
        projectId,
        productionId!,
        request.query as z.infer<typeof productionHistoryQuerySchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/projects/:projectId/productions",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateBody(productionCommandSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Create a production draft or publish directly",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        body: productionCommandOpenApiSchema,
        response: {
          201: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.create(
        scopeFromRequest(request),
        projectId,
        request.body as z.infer<typeof productionCommandSchema>,
      );
      return jsonResponse.success({ reply, data, statusCode: 201 });
    },
  );

  app.put(
    "/projects/:projectId/productions/:productionId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateBody(productionCommandSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Replace a production draft with optimistic revision control",
        security: [{ bearerAuth: [] }],
        params: productionParams,
        body: productionCommandOpenApiSchema,
        response: {
          200: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.update(
        scopeFromRequest(request),
        projectId,
        productionId!,
        request.body as z.infer<typeof productionCommandSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  for (const transition of ["submit", "check"] as const) {
    app.post(
      `/projects/:projectId/productions/:productionId/${transition}`,
      {
        preHandler: [
          app.requireCompanyScope,
          validateParams(productionParamsSchema),
          validateBody(productionTransitionSchema),
        ],
        schema: {
          tags: ["Project productions"],
          summary:
            transition === "submit"
              ? "Submit an operational production"
              : "Field-check a submitted production",
          security: [{ bearerAuth: [] }],
          params: productionParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["expectedRevision"],
            properties: { expectedRevision: { type: "integer", minimum: 1 } },
          },
          response: {
            200: successSchema(productionDetailSchema),
            ...commonErrors,
          },
        },
      },
      async (request, reply) => {
        const { projectId, productionId } = request.params as z.infer<
          typeof productionParamsSchema
        >;
        const command = request.body as z.infer<
          typeof productionTransitionSchema
        >;
        const data = await service[transition](
          scopeFromRequest(request),
          projectId,
          productionId!,
          command,
        );
        return jsonResponse.success({ reply, data });
      },
    );
  }

  for (const transition of ["reject", "release"] as const) {
    app.post(
      `/projects/:projectId/productions/:productionId/${transition}`,
      {
        preHandler: [
          app.requireCompanyScope,
          validateParams(productionParamsSchema),
          validateBody(productionDecisionSchema),
        ],
        schema: {
          tags: ["Project productions"],
          summary:
            transition === "reject"
              ? "Reject a submitted production"
              : "Release an approved production",
          security: [{ bearerAuth: [] }],
          params: productionParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["expectedRevision"],
            properties: {
              expectedRevision: { type: "integer", minimum: 1 },
              reason: { type: "string", nullable: true, maxLength: 500 },
            },
          },
          response: {
            200: successSchema(productionDetailSchema),
            ...commonErrors,
          },
        },
      },
      async (request, reply) => {
        const { projectId, productionId } = request.params as z.infer<
          typeof productionParamsSchema
        >;
        const data = await service[transition](
          scopeFromRequest(request),
          projectId,
          productionId!,
          request.body as z.infer<typeof productionDecisionSchema>,
        );
        return jsonResponse.success({ reply, data });
      },
    );
  }

  app.post(
    "/projects/:projectId/productions/:productionId/quality-checks",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateBody(productionQualityCheckSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Record an append-only production quality check",
        security: [{ bearerAuth: [] }],
        params: productionParams,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["expectedRevision", "type", "status"],
          properties: {
            expectedRevision: { type: "integer", minimum: 1 },
            type: {
              type: "string",
              enum: [
                "field_inspection",
                "topography",
                "density",
                "proctor",
                "compaction",
                "moisture",
                "finishing",
              ],
            },
            status: {
              type: "string",
              enum: ["pending", "accepted", "rejected"],
            },
            value: nullableDecimal,
            unitCode: { type: "string", nullable: true, maxLength: 32 },
            notes: { type: "string", nullable: true, maxLength: 500 },
            evidence: { type: "array", maxItems: 20, items: evidenceSchema },
            acceptedQuantity: {
              type: "object",
              nullable: true,
              additionalProperties: false,
              required: ["componentId", "value", "unitCode"],
              properties: {
                componentId: uuid,
                value: decimal,
                unitCode: { type: "string", minLength: 1, maxLength: 32 },
                volumeCondition,
              },
            },
          },
        },
        response: {
          200: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.qualityCheck(
        scopeFromRequest(request),
        projectId,
        productionId!,
        request.body as z.infer<typeof productionQualityCheckSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/projects/:projectId/productions/:productionId/approve",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateBody(productionTransitionSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Approve a production draft",
        security: [{ bearerAuth: [] }],
        params: productionParams,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["expectedRevision"],
          properties: { expectedRevision: { type: "integer", minimum: 1 } },
        },
        response: {
          200: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.approve(
        scopeFromRequest(request),
        projectId,
        productionId!,
        request.body as z.infer<typeof productionTransitionSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/projects/:projectId/productions/:productionId/reopen",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateBody(productionReopenSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Reopen an approved production with an audit reason",
        security: [{ bearerAuth: [] }],
        params: productionParams,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["expectedRevision", "reason"],
          properties: {
            expectedRevision: { type: "integer", minimum: 1 },
            reason: { type: "string", minLength: 3, maxLength: 500 },
          },
        },
        response: {
          200: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.reopen(
        scopeFromRequest(request),
        projectId,
        productionId!,
        request.body as z.infer<typeof productionReopenSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/projects/:projectId/productions/:productionId/trips",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateBody(productionTripSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Quick-add an idempotent truck trip",
        security: [{ bearerAuth: [] }],
        params: productionParams,
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "expectedRevision",
            "idempotencyKey",
            "productionEquipmentId",
          ],
          properties: {
            expectedRevision: { type: "integer", minimum: 1 },
            idempotencyKey: uuid,
            productionEquipmentId: uuid,
            recordedAt: { type: "string", format: "date-time" },
            capacityM3: decimal,
            adjustedVolumeM3: nullableDecimal,
            ticketNumber: { type: "string", nullable: true, maxLength: 80 },
            notes: { type: "string", nullable: true, maxLength: 500 },
          },
        },
        response: {
          201: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.addTrip(
        scopeFromRequest(request),
        projectId,
        productionId!,
        request.body as z.infer<typeof productionTripSchema>,
      );
      return jsonResponse.success({ reply, data, statusCode: 201 });
    },
  );

  app.delete(
    "/projects/:projectId/productions/:productionId/trips/:tripId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateQuery(productionTripDeleteQuerySchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Remove a trip from a production draft",
        security: [{ bearerAuth: [] }],
        params: tripParams,
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["expectedRevision"],
          properties: { expectedRevision: { type: "integer", minimum: 1 } },
        },
        response: {
          200: successSchema(productionDetailSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, productionId, tripId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const { expectedRevision } = request.query as z.infer<
        typeof productionTripDeleteQuerySchema
      >;
      const data = await service.removeTrip(
        scopeFromRequest(request),
        projectId,
        productionId!,
        tripId!,
        expectedRevision,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.get(
    "/projects/:projectId/daily-reports/:reportId/productions",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Get the production summary for a daily report",
        security: [{ bearerAuth: [] }],
        params: reportParams,
        response: {
          200: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const data = await service.dailyReportSummary(
        scopeFromRequest(request),
        projectId,
        reportId!,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/projects/:projectId/daily-reports/:reportId/productions/confirm",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(productionParamsSchema),
        validateBody(dailyReportProductionConfirmSchema),
      ],
      schema: {
        tags: ["Project productions"],
        summary: "Confirm approved production revisions in a daily report",
        security: [{ bearerAuth: [] }],
        params: reportParams,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["productionIds"],
          properties: {
            productionIds: { type: "array", maxItems: 200, items: uuid },
          },
        },
        response: {
          200: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof productionParamsSchema
      >;
      const { productionIds } = request.body as z.infer<
        typeof dailyReportProductionConfirmSchema
      >;
      const data = await service.confirmDailyReport(
        scopeFromRequest(request),
        projectId,
        reportId!,
        productionIds,
      );
      return jsonResponse.success({ reply, data });
    },
  );
};

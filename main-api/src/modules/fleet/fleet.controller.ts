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
  appendMachineMeterReadingSchema,
  correctMachineMeterReadingSchema,
  createMachineModelSchema,
  addMachineModelUnitsSchema,
  addMachineModelUnitsBatchSchema,
  listMachineModelsQuerySchema,
  machineModelParamsSchema,
  updateMachineModelSchema,
  listMachinesQuerySchema,
  machineParamsSchema,
  machineReadingParamsSchema,
  updateMachineLoadSpecificationSchema,
} from "./fleet.dto";
import { FleetService } from "./fleet.service";

const decimalStringOpenApiPattern = "^(?:0|[1-9]\\d{0,11})(?:\\.[0-9]{1,2})?$";
const identifierOpenApiPattern = ".*[A-Za-z0-9].*";
const positiveSpecificationDecimalOpenApiPattern =
  "^(?:0|[1-9]\\d{0,6})(?:\\.[0-9]{1,3})?$";
const loadCapacityUnitCodes = [
  "M3_LOOSE",
  "M3_COMPACTED",
  "LITER",
  "CUBIC_YARD",
] as const;

const errorSchema = {
  type: "object",
  required: ["success", "code", "message", "details", "requestId"],
  properties: {
    success: { type: "boolean", const: false },
    code: { type: "string" },
    message: { type: "string" },
    details: { type: "object", nullable: true },
    requestId: { type: "string", format: "uuid" },
  },
} as const;

const identifierSchema = {
  type: "object",
  required: ["value", "normalizedValue"],
  properties: {
    value: { type: "string" },
    normalizedValue: { type: "string" },
  },
  additionalProperties: false,
} as const;

const machineSchema = {
  type: "object",
  required: [
    "id",
    "name",
    "description",
    "type",
    "manufacturer",
    "model",
    "version",
    "meterType",
    "loadCapacity",
    "loadCapacityUnitCode",
    "loadVolumeM3",
    "maxSupportedWeightT",
    "machineModel",
    "identifiers",
    "latestMeterReading",
    "availability",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    type: { type: "string", enum: ["YELLOW_LINE", "WHITE_LINE"] },
    manufacturer: { type: "string" },
    model: { type: "string" },
    version: { type: "string", nullable: true },
    meterType: { type: "string", enum: ["HOUR_METER", "ODOMETER"] },
    loadCapacity: { type: "string", nullable: true },
    loadCapacityUnitCode: {
      type: "string",
      enum: loadCapacityUnitCodes,
      nullable: true,
    },
    loadVolumeM3: { type: "string", nullable: true },
    maxSupportedWeightT: { type: "string", nullable: true },
    machineModel: {
      type: "object",
      required: ["id", "requiresOperator", "requiredJobRole"],
      properties: {
        id: { type: "string", format: "uuid" },
        requiresOperator: { type: "boolean" },
        requiredJobRole: {
          type: "object",
          nullable: true,
          required: ["id", "name"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    identifiers: {
      type: "object",
      required: ["plate", "companyTag"],
      properties: {
        plate: { ...identifierSchema, nullable: true },
        companyTag: { ...identifierSchema, nullable: true },
      },
      additionalProperties: false,
    },
    latestMeterReading: {
      type: "object",
      nullable: true,
      required: ["id", "value", "purpose", "recordedAt"],
      properties: {
        id: { type: "string", format: "uuid" },
        value: { type: "string" },
        purpose: {
          type: "string",
          enum: ["INITIAL", "RESTORATION", "OWNERSHIP_TRANSFER", "ORDINARY"],
        },
        recordedAt: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
    availability: {
      type: "object",
      required: ["state", "hasOpenAllocation"],
      properties: {
        state: {
          type: "string",
          enum: ["available", "unavailable", "without_rental"],
        },
        hasOpenAllocation: { type: "boolean" },
      },
      additionalProperties: false,
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const;

const machineModelSchema = {
  type: "object",
  required: [
    "id",
    "description",
    "type",
    "manufacturer",
    "model",
    "version",
    "loadCapacity",
    "loadCapacityUnitCode",
    "loadVolumeM3",
    "maxSupportedWeightT",
    "requiresOperator",
    "requiredJobRole",
    "unitCount",
    "units",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    description: { type: "string", nullable: true },
    type: { type: "string", enum: ["YELLOW_LINE", "WHITE_LINE"] },
    manufacturer: { type: "string" },
    model: { type: "string" },
    version: { type: "string", nullable: true },
    loadCapacity: { type: "string", nullable: true },
    loadCapacityUnitCode: {
      type: "string",
      enum: loadCapacityUnitCodes,
      nullable: true,
    },
    loadVolumeM3: { type: "string", nullable: true },
    maxSupportedWeightT: { type: "string", nullable: true },
    requiresOperator: { type: "boolean" },
    requiredJobRole: {
      type: "object",
      nullable: true,
      required: ["id", "name"],
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
    unitCount: { type: "integer", minimum: 0 },
    units: { type: "array", items: machineSchema },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const;

const machineUnitBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["meterType", "initialMeterReading", "ownership"],
  anyOf: [{ required: ["plate"] }, { required: ["companyTag"] }],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    plate: { type: "string", maxLength: 80, pattern: identifierOpenApiPattern },
    companyTag: {
      type: "string",
      maxLength: 80,
      pattern: identifierOpenApiPattern,
    },
    meterType: { type: "string", enum: ["HOUR_METER", "ODOMETER"] },
    initialMeterReading: {
      type: "string",
      pattern: decimalStringOpenApiPattern,
    },
    ownership: {
      oneOf: [
        {
          type: "object",
          required: ["kind"],
          properties: { kind: { const: "OWNED" } },
          additionalProperties: false,
        },
        {
          type: "object",
          required: ["kind", "lessorName", "suggestedHourlyRate"],
          properties: {
            kind: { const: "RENTED" },
            lessorName: { type: "string", minLength: 1, maxLength: 180 },
            suggestedHourlyRate: {
              type: "string",
              pattern: "^(?:0|[1-9]\\d{0,13})(?:\\.\\d{1,2})?$",
            },
          },
          additionalProperties: false,
        },
      ],
    },
    allocation: {
      type: "object",
      additionalProperties: false,
      required: ["projectId", "operatorAssignments"],
      properties: {
        projectId: { type: "string", format: "uuid" },
        confirmedHourlyRate: {
          type: "string",
          pattern: "^(?:0|[1-9]\\d{0,13})(?:\\.\\d{1,2})?$",
        },
        monthlyHours: { type: "integer", minimum: 1, maximum: 744 },
        operatorAssignments: {
          type: "array",
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["shift", "operatorEmploymentId"],
            properties: {
              shift: { type: "string", enum: ["day", "night"] },
              operatorEmploymentId: { type: "string", format: "uuid" },
            },
          },
        },
      },
    },
    deletedMatchResolution: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["RESTORE", "CREATE_NEW"] },
        machineId: { type: "string", format: "uuid" },
      },
    },
  },
} as const;

const createMachineModelBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "manufacturer", "model", "requiresOperator"],
  properties: {
    description: { type: "string", maxLength: 500 },
    type: { type: "string", enum: ["YELLOW_LINE", "WHITE_LINE"] },
    manufacturer: { type: "string", minLength: 1, maxLength: 120 },
    model: { type: "string", minLength: 1, maxLength: 120 },
    version: { type: "string", maxLength: 120 },
    loadCapacity: {
      type: "string",
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
    loadCapacityUnitCode: { type: "string", enum: loadCapacityUnitCodes },
    loadVolumeM3: {
      type: "string",
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
    maxSupportedWeightT: {
      type: "string",
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
    requiresOperator: { type: "boolean" },
    requiredJobRoleId: { type: "string", format: "uuid", nullable: true },
  },
} as const;

const updateMachineModelBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "manufacturer", "model", "requiresOperator"],
  properties: {
    description: { type: "string", maxLength: 500 },
    type: { type: "string", enum: ["YELLOW_LINE", "WHITE_LINE"] },
    manufacturer: { type: "string", minLength: 1, maxLength: 120 },
    model: { type: "string", minLength: 1, maxLength: 120 },
    version: { type: "string", maxLength: 120 },
    loadCapacity: {
      type: "string",
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
    loadCapacityUnitCode: { type: "string", enum: loadCapacityUnitCodes },
    loadVolumeM3: {
      type: "string",
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
    maxSupportedWeightT: {
      type: "string",
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
    requiresOperator: { type: "boolean" },
    requiredJobRoleId: { type: "string", format: "uuid", nullable: true },
  },
} as const;

const addMachineModelUnitsBodySchema = machineUnitBodySchema;

const addMachineModelUnitsBatchBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "units"],
  properties: {
    projectId: { type: "string", format: "uuid" },
    units: {
      type: "array",
      minItems: 1,
      maxItems: 15,
      items: machineUnitBodySchema,
    },
  },
} as const;

const machineModelUnitsBatchResponseSchema = {
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: {
      type: "object",
      required: ["created", "rejected"],
      properties: {
        created: {
          type: "array",
          items: {
            type: "object",
            required: ["index", "machineId"],
            properties: {
              index: { type: "integer", minimum: 0, maximum: 14 },
              machineId: { type: "string", format: "uuid", nullable: true },
            },
            additionalProperties: false,
          },
        },
        rejected: {
          type: "array",
          items: {
            type: "object",
            required: ["index", "code", "message"],
            properties: {
              index: { type: "integer", minimum: 0, maximum: 14 },
              code: { type: "string" },
              message: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
} as const;

const machineModelParamsOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["machineModelId"],
  properties: { machineModelId: { type: "string", format: "uuid" } },
} as const;

const listMachineModelsOpenApiQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    cursor: { type: "string", minLength: 1, maxLength: 2048 },
    search: { type: "string", maxLength: 120 },
    type: { type: "string", enum: ["YELLOW_LINE", "WHITE_LINE"] },
    sortBy: {
      type: "string",
      enum: ["model", "createdAt"],
      default: "createdAt",
    },
    sortDirection: { type: "string", enum: ["asc", "desc"], default: "desc" },
  },
} as const;

const machineModelDetailResponseSchema = {
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: machineModelSchema,
  },
} as const;

const softDeleteResponseSchema = {
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: {
      type: "object",
      required: ["id", "deletedAt"],
      properties: {
        id: { type: "string", format: "uuid" },
        deletedAt: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const machineModelListResponseSchema = {
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: {
      type: "object",
      required: ["data", "pageInfo"],
      properties: {
        data: { type: "array", items: machineModelSchema },
        pageInfo: {
          type: "object",
          required: ["hasNextPage", "nextCursor"],
          properties: {
            hasNextPage: { type: "boolean" },
            nextCursor: { type: "string", nullable: true },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
} as const;

const machineDetailSchema = {
  ...machineSchema,
  required: [...machineSchema.required, "ownership"],
  properties: {
    ...machineSchema.properties,
    ownership: {
      type: "object",
      nullable: true,
      required: [
        "companyId",
        "kind",
        "lessorName",
        "suggestedHourlyRate",
        "effectiveFrom",
        "effectiveTo",
      ],
      properties: {
        companyId: { type: "string", format: "uuid" },
        kind: { type: "string", enum: ["OWNED", "RENTED", "THIRD_PARTY"] },
        lessorName: { type: "string", nullable: true },
        suggestedHourlyRate: { type: "string", nullable: true },
        effectiveFrom: { type: "string", format: "date-time" },
        effectiveTo: { type: "string", format: "date-time", nullable: true },
      },
      additionalProperties: false,
    },
  },
} as const;

const detailResponseSchema = {
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: machineDetailSchema,
  },
} as const;

const listResponseSchema = {
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: {
      type: "object",
      required: ["data", "pageInfo"],
      properties: {
        data: { type: "array", items: machineSchema },
        pageInfo: {
          type: "object",
          required: ["hasNextPage", "nextCursor"],
          properties: {
            hasNextPage: { type: "boolean" },
            nextCursor: { type: "string", nullable: true },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
} as const;

const updateMachineLoadSpecificationBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["loadVolumeM3", "maxSupportedWeightT"],
  properties: {
    loadVolumeM3: {
      type: "string",
      nullable: true,
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
    maxSupportedWeightT: {
      type: "string",
      nullable: true,
      pattern: positiveSpecificationDecimalOpenApiPattern,
    },
  },
} as const;

const listMachinesOpenApiQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    cursor: { type: "string", minLength: 1, maxLength: 2048 },
    search: { type: "string", maxLength: 120 },
    type: { type: "string", enum: ["YELLOW_LINE", "WHITE_LINE"] },
    availability: { type: "string", enum: ["available"] },
    sortBy: {
      type: "string",
      enum: ["name", "createdAt"],
      default: "createdAt",
    },
    sortDirection: { type: "string", enum: ["asc", "desc"], default: "desc" },
  },
} as const;

const machineParamsOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["machineId"],
  properties: { machineId: { type: "string", format: "uuid" } },
} as const;

const readingParamsOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["machineId", "readingId"],
  properties: {
    machineId: { type: "string", format: "uuid" },
    readingId: { type: "string", format: "uuid" },
  },
} as const;

const appendReadingBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["value"],
  properties: {
    value: { type: "string", pattern: decimalStringOpenApiPattern },
  },
} as const;

const correctReadingBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["value", "reason"],
  properties: {
    value: { type: "string", pattern: decimalStringOpenApiPattern },
    reason: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

function scopeFromRequest(request: {
  authContext?: { corporationId: string; companyId?: string; userId?: string };
}) {
  const corporationId = request.authContext?.corporationId;
  const companyId = request.authContext?.companyId;
  const actorUserId = request.authContext?.userId;
  if (!corporationId || !companyId || !actorUserId) {
    throw new AppError({
      code: "COMPANY_CONTEXT_REQUIRED",
      message: "Company context required",
      statusCode: 403,
    });
  }
  return { corporationId, companyId, actorUserId };
}

export const v1FleetController = async (app: FastifyInstance) => {
  const fleetService = new FleetService(app.handlerContext);

  app.post(
    "/machine-models",
    {
      preHandler: [
        app.requireCompanyScope,
        validateBody(createMachineModelSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Create a Machine Model",
        security: [{ bearerAuth: [] }],
        body: createMachineModelBodySchema,
        response: {
          201: machineModelDetailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await fleetService.createModel(
          scopeFromRequest(request),
          request.body as z.infer<typeof createMachineModelSchema>,
        ),
        statusCode: 201,
      }),
  );

  app.patch(
    "/machine-models/:machineModelId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineModelParamsSchema),
        validateBody(updateMachineModelSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Update a Machine Model",
        security: [{ bearerAuth: [] }],
        params: machineModelParamsOpenApiSchema,
        body: updateMachineModelBodySchema,
        response: {
          200: machineModelDetailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineModelId } = request.params as z.infer<
        typeof machineModelParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await fleetService.updateModel(
          scopeFromRequest(request),
          machineModelId,
          request.body as z.infer<typeof updateMachineModelSchema>,
        ),
      });
    },
  );

  app.delete(
    "/machine-models/:machineModelId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineModelParamsSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Soft delete an empty Machine Model",
        security: [{ bearerAuth: [] }],
        params: machineModelParamsOpenApiSchema,
        response: {
          200: softDeleteResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineModelId } = request.params as z.infer<
        typeof machineModelParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await fleetService.softDeleteModel(
          scopeFromRequest(request),
          machineModelId,
        ),
      });
    },
  );

  app.get(
    "/machine-models",
    {
      preHandler: [
        app.requireCompanyScope,
        validateQuery(listMachineModelsQuerySchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "List Machine Models in the selected Company",
        security: [{ bearerAuth: [] }],
        querystring: listMachineModelsOpenApiQuerySchema,
        response: {
          200: machineModelListResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await fleetService.listModels(
          scopeFromRequest(request),
          request.query as z.infer<typeof listMachineModelsQuerySchema>,
        ),
      }),
  );

  app.get(
    "/machine-models/:machineModelId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineModelParamsSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Get a Machine Model with its units",
        security: [{ bearerAuth: [] }],
        params: machineModelParamsOpenApiSchema,
        response: {
          200: machineModelDetailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineModelId } = request.params as z.infer<
        typeof machineModelParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await fleetService.modelDetail(
          scopeFromRequest(request),
          machineModelId,
        ),
      });
    },
  );

  app.post(
    "/machine-models/:machineModelId/units",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineModelParamsSchema),
        validateBody(addMachineModelUnitsSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Add physical units to a Machine Model",
        security: [{ bearerAuth: [] }],
        params: machineModelParamsOpenApiSchema,
        body: addMachineModelUnitsBodySchema,
        response: {
          201: machineModelDetailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineModelId } = request.params as z.infer<
        typeof machineModelParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await fleetService.addModelUnits(
          scopeFromRequest(request),
          machineModelId,
          request.body as z.infer<typeof addMachineModelUnitsSchema>,
        ),
        statusCode: 201,
      });
    },
  );

  app.post(
    "/machine-models/:machineModelId/units/batch",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineModelParamsSchema),
        validateBody(addMachineModelUnitsBatchSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Add up to 15 physical units to a Machine Model",
        security: [{ bearerAuth: [] }],
        params: machineModelParamsOpenApiSchema,
        body: addMachineModelUnitsBatchBodySchema,
        response: {
          200: machineModelUnitsBatchResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineModelId } = request.params as z.infer<
        typeof machineModelParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await fleetService.addModelUnitsBatch(
          scopeFromRequest(request),
          machineModelId,
          request.body as z.infer<typeof addMachineModelUnitsBatchSchema>,
        ),
      });
    },
  );

  app.get(
    "/machines",
    {
      preHandler: [
        app.requireCompanyScope,
        validateQuery(listMachinesQuerySchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "List Machines in the selected Company",
        security: [{ bearerAuth: [] }],
        querystring: listMachinesOpenApiQuerySchema,
        response: {
          200: listResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const data = await fleetService.list(
        scopeFromRequest(request),
        request.query as z.infer<typeof listMachinesQuerySchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.patch(
    "/machines/:machineId/load-specification",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineParamsSchema),
        validateBody(updateMachineLoadSpecificationSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Update a white-line Machine load specification",
        security: [{ bearerAuth: [] }],
        params: machineParamsOpenApiSchema,
        body: updateMachineLoadSpecificationBodySchema,
        response: {
          200: detailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineId } = request.params as z.infer<
        typeof machineParamsSchema
      >;
      const data = await fleetService.updateLoadSpecification(
        scopeFromRequest(request),
        machineId,
        request.body as z.infer<typeof updateMachineLoadSpecificationSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.delete(
    "/machines/:machineId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineParamsSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Soft delete an eligible physical Machine unit",
        security: [{ bearerAuth: [] }],
        params: machineParamsOpenApiSchema,
        response: {
          200: {
            type: "object",
            required: ["success", "message", "data"],
            properties: {
              success: { type: "boolean", const: true },
              message: { type: "string" },
              data: {
                type: "object",
                required: ["id", "deletedAt"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  deletedAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineId } = request.params as z.infer<
        typeof machineParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await fleetService.softDelete(
          scopeFromRequest(request),
          machineId,
        ),
      });
    },
  );

  app.get(
    "/machines/:machineId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineParamsSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Get a Machine detail in the selected Company",
        security: [{ bearerAuth: [] }],
        params: machineParamsOpenApiSchema,
        response: {
          200: detailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineId } = request.params as z.infer<
        typeof machineParamsSchema
      >;
      const data = await fleetService.detail(
        scopeFromRequest(request),
        machineId,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/machines/:machineId/meter-readings",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineParamsSchema),
        validateBody(appendMachineMeterReadingSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Append a confirmed Machine Meter Reading",
        security: [{ bearerAuth: [] }],
        params: machineParamsOpenApiSchema,
        body: appendReadingBodySchema,
        response: {
          200: detailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineId } = request.params as z.infer<
        typeof machineParamsSchema
      >;
      const data = await fleetService.appendReading(
        scopeFromRequest(request),
        machineId,
        request.body as z.infer<typeof appendMachineMeterReadingSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/machines/:machineId/meter-readings/:readingId/correction",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(machineReadingParamsSchema),
        validateBody(correctMachineMeterReadingSchema),
      ],
      schema: {
        tags: ["Fleet"],
        summary: "Correct an eligible Machine Meter Reading",
        security: [{ bearerAuth: [] }],
        params: readingParamsOpenApiSchema,
        body: correctReadingBodySchema,
        response: {
          200: detailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { machineId, readingId } = request.params as z.infer<
        typeof machineReadingParamsSchema
      >;
      const data = await fleetService.correctReading(
        scopeFromRequest(request),
        machineId,
        readingId,
        request.body as z.infer<typeof correctMachineMeterReadingSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );
};

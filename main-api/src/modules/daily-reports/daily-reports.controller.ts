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
  dailyReportCommandSchema,
  dailyReportListQuerySchema,
  dailyReportOptionsQuerySchema,
  dailyReportParamsSchema,
} from "./daily-reports.dto";
import { DailyReportsService } from "./daily-reports.service";

const uuid = { type: "string", format: "uuid" } as const;
const nullableString = { type: "string", nullable: true } as const;
const time = {
  type: "string",
  pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
} as const;
const decimal = {
  type: "string",
  pattern: "^(?:0|[1-9]\\d{0,7})(?:\\.\\d{1,2})?$",
} as const;
const shift = { type: "string", enum: ["day", "night"] } as const;
const status = { type: "string", enum: ["draft", "finalized"] } as const;

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

const projectParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["projectId"],
  properties: { projectId: uuid },
} as const;

const reportParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "reportId"],
  properties: { projectId: uuid, reportId: uuid },
} as const;

const schedulePeriodSchema = {
  type: "object",
  additionalProperties: false,
  required: ["startTime", "endTime", "startDayOffset", "endDayOffset"],
  properties: {
    startTime: time,
    endTime: time,
    startDayOffset: { type: "integer", minimum: 0, maximum: 1 },
    endDayOffset: { type: "integer", minimum: 0, maximum: 1 },
  },
} as const;

const dailyReportCommandOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "reportDate",
    "shift",
    "schedulePeriods",
    "activityStartTime",
    "activityEndTime",
    "activityEndDayOffset",
    "activityTypes",
    "climateConditions",
    "dailyRainfallMm",
    "monthlyRainfallMm",
    "supervisorEmploymentId",
    "technicalResponsibilityEmploymentIds",
    "employees",
    "machines",
    "executedActivities",
  ],
  properties: {
    reportDate: { type: "string", format: "date" },
    shift,
    schedulePeriods: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: schedulePeriodSchema,
    },
    activityStartTime: time,
    activityEndTime: time,
    activityEndDayOffset: { type: "integer", minimum: 0, maximum: 1 },
    activityTypes: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "string", enum: ["earthworks", "drainage", "paving"] },
    },
    climateConditions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "string", enum: ["rain", "dry", "waterlogged_soil"] },
    },
    dailyRainfallMm: decimal,
    monthlyRainfallMm: decimal,
    supervisorEmploymentId: uuid,
    technicalResponsibilityEmploymentIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: uuid,
    },
    employees: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "employmentId",
          "completedFullShift",
          "regularWorkedMinutes",
          "overtimeMinutes",
        ],
        properties: {
          employmentId: uuid,
          completedFullShift: { type: "boolean" },
          regularWorkedMinutes: { type: "integer", minimum: 0, maximum: 1440 },
          overtimeMinutes: { type: "integer", minimum: 0, maximum: 1440 },
        },
      },
    },
    machines: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["machineId", "endMeterReadingValue"],
        properties: { machineId: uuid, endMeterReadingValue: decimal },
      },
    },
    executedActivities: { type: "string", minLength: 1, maxLength: 10_000 },
    interferences: { type: "string", nullable: true, maxLength: 10_000 },
  },
} as const;

const reportDetailSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "projectId",
    "reportDate",
    "shift",
    "status",
    "project",
    "scheduleScale",
    "supervisor",
    "technicalResponsibilities",
    "schedulePeriods",
    "activityWindow",
    "activityTypes",
    "climateConditions",
    "rainfall",
    "employees",
    "machines",
    "executedActivities",
    "interferences",
    "createdBy",
    "finalizedBy",
    "finalizedAt",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: uuid,
    projectId: uuid,
    reportDate: { type: "string", format: "date" },
    shift,
    status,
    project: {
      type: "object",
      additionalProperties: false,
      required: ["name", "municipality", "state", "contract"],
      properties: {
        name: { type: "string" },
        municipality: nullableString,
        state: nullableString,
        contract: nullableString,
      },
    },
    scheduleScale: { type: "string" },
    supervisor: {
      type: "object",
      additionalProperties: false,
      required: ["employmentId", "name"],
      properties: { employmentId: uuid, name: { type: "string" } },
    },
    technicalResponsibilities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employmentId", "name"],
        properties: { employmentId: uuid, name: { type: "string" } },
      },
    },
    schedulePeriods: { type: "array", items: schedulePeriodSchema },
    activityWindow: {
      type: "object",
      additionalProperties: false,
      required: ["startTime", "endTime", "endDayOffset"],
      properties: {
        startTime: time,
        endTime: time,
        endDayOffset: { type: "integer", minimum: 0, maximum: 1 },
      },
    },
    activityTypes: {
      type: "array",
      items: { type: "string", enum: ["earthworks", "drainage", "paving"] },
    },
    climateConditions: {
      type: "array",
      items: { type: "string", enum: ["rain", "dry", "waterlogged_soil"] },
    },
    rainfall: {
      type: "object",
      additionalProperties: false,
      required: ["dailyMm", "monthlyMm"],
      properties: {
        dailyMm: { type: "string" },
        monthlyMm: { type: "string" },
      },
    },
    employees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "employmentId",
          "name",
          "jobRole",
          "completedFullShift",
          "regularWorkedMinutes",
          "overtimeMinutes",
        ],
        properties: {
          employmentId: uuid,
          name: { type: "string" },
          jobRole: { type: "string" },
          completedFullShift: { type: "boolean" },
          regularWorkedMinutes: { type: "integer" },
          overtimeMinutes: { type: "integer" },
        },
      },
    },
    machines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "machineId",
          "name",
          "manufacturer",
          "model",
          "meterType",
          "identifier",
          "startMeterReading",
          "endMeterReading",
        ],
        properties: {
          machineId: uuid,
          name: { type: "string" },
          manufacturer: { type: "string" },
          model: { type: "string" },
          meterType: { type: "string", enum: ["hour_meter", "odometer"] },
          identifier: {
            type: "object",
            nullable: true,
            additionalProperties: false,
            required: ["kind", "value"],
            properties: {
              kind: { type: "string", enum: ["plate", "company_tag"] },
              value: { type: "string" },
            },
          },
          startMeterReading: {
            type: "object",
            additionalProperties: false,
            required: ["id", "value"],
            properties: { id: uuid, value: { type: "string" } },
          },
          endMeterReading: {
            type: "object",
            additionalProperties: false,
            required: ["id", "value"],
            properties: {
              id: { ...uuid, nullable: true },
              value: { type: "string" },
            },
          },
        },
      },
    },
    executedActivities: { type: "string" },
    interferences: nullableString,
    createdBy: {
      type: "object",
      additionalProperties: false,
      required: ["id", "email"],
      properties: { id: uuid, email: { type: "string" } },
    },
    finalizedBy: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["id", "email"],
      properties: { id: uuid, email: { type: "string" } },
    },
    finalizedAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const optionsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "project",
    "defaults",
    "responsibleOptions",
    "employeeOptions",
    "machineOptions",
  ],
  properties: {
    project: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "municipality", "state", "contract"],
      properties: {
        id: uuid,
        name: { type: "string" },
        municipality: nullableString,
        state: nullableString,
        contract: nullableString,
      },
    },
    defaults: {
      type: "object",
      additionalProperties: false,
      required: [
        "reportDate",
        "shift",
        "schedulePeriods",
        "activityStartTime",
        "activityEndTime",
        "activityEndDayOffset",
        "scheduleScale",
        "supervisorEmploymentId",
        "technicalResponsibilityEmploymentIds",
      ],
      properties: {
        reportDate: { type: "string", format: "date" },
        shift,
        schedulePeriods: { type: "array", items: schedulePeriodSchema },
        activityStartTime: time,
        activityEndTime: time,
        activityEndDayOffset: { type: "integer" },
        scheduleScale: { type: "string" },
        supervisorEmploymentId: { ...uuid, nullable: true },
        technicalResponsibilityEmploymentIds: { type: "array", items: uuid },
      },
    },
    responsibleOptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name"],
        properties: { id: uuid, name: { type: "string" } },
      },
    },
    employeeOptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "jobRole"],
        properties: {
          id: uuid,
          name: { type: "string" },
          jobRole: { type: "string" },
        },
      },
    },
    machineOptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "manufacturer",
          "model",
          "meterType",
          "identifier",
          "startMeterReading",
        ],
        properties: {
          id: uuid,
          name: { type: "string" },
          manufacturer: { type: "string" },
          model: { type: "string" },
          meterType: { type: "string", enum: ["hour_meter", "odometer"] },
          identifier: {
            type: "object",
            nullable: true,
            additionalProperties: false,
            required: ["kind", "value"],
            properties: {
              kind: { type: "string", enum: ["plate", "company_tag"] },
              value: { type: "string" },
            },
          },
          startMeterReading: {
            type: "object",
            additionalProperties: false,
            required: ["id", "value", "recordedAt"],
            properties: {
              id: uuid,
              value: { type: "string" },
              recordedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  },
} as const;

const listItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "reportDate",
    "shift",
    "status",
    "activityStartTime",
    "activityEndTime",
    "activityEndDayOffset",
    "createdAt",
    "updatedAt",
    "finalizedAt",
  ],
  properties: {
    id: uuid,
    reportDate: { type: "string", format: "date" },
    shift,
    status,
    activityStartTime: time,
    activityEndTime: time,
    activityEndDayOffset: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    finalizedAt: { type: "string", format: "date-time", nullable: true },
  },
} as const;

function scopeFromRequest(request: {
  authContext?: { corporationId: string; companyId?: string; userId?: string };
}) {
  const corporationId = request.authContext?.corporationId;
  const companyId = request.authContext?.companyId;
  const actorUserId = request.authContext?.userId;
  if (!corporationId || !companyId || !actorUserId)
    throw new AppError({
      code: "COMPANY_CONTEXT_REQUIRED",
      message: "Company context required",
      statusCode: 403,
    });
  return { corporationId, companyId, actorUserId };
}

const commonErrors = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
} as const;

export const v1DailyReportsController = async (app: FastifyInstance) => {
  const service = new DailyReportsService(app.handlerContext);

  app.get(
    "/projects/:projectId/daily-reports",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(dailyReportParamsSchema),
        validateQuery(dailyReportListQuerySchema),
      ],
      schema: {
        tags: ["Project daily reports"],
        summary: "List project daily reports",
        security: [{ bearerAuth: [] }],
        params: projectParamsSchema,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            cursor: { type: "string" },
            shift,
            status,
            sortBy: {
              type: "string",
              enum: ["reportDate"],
              default: "reportDate",
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
            additionalProperties: false,
            required: ["data", "pageInfo"],
            properties: {
              data: { type: "array", items: listItemSchema },
              pageInfo: {
                type: "object",
                additionalProperties: false,
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
      const { projectId } = request.params as z.infer<
        typeof dailyReportParamsSchema
      >;
      const data = await service.list(
        scopeFromRequest(request),
        projectId,
        request.query as z.infer<typeof dailyReportListQuerySchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.get(
    "/projects/:projectId/daily-reports/options",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(dailyReportParamsSchema),
        validateQuery(dailyReportOptionsQuerySchema),
      ],
      schema: {
        tags: ["Project daily reports"],
        summary: "Resolve temporal options for a project daily report",
        security: [{ bearerAuth: [] }],
        params: projectParamsSchema,
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["reportDate", "shift"],
          properties: { reportDate: { type: "string", format: "date" }, shift },
        },
        response: { 200: successSchema(optionsSchema), ...commonErrors },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof dailyReportParamsSchema
      >;
      const data = await service.options(
        scopeFromRequest(request),
        projectId,
        request.query as z.infer<typeof dailyReportOptionsQuerySchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.get(
    "/projects/:projectId/daily-reports/:reportId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(dailyReportParamsSchema),
      ],
      schema: {
        tags: ["Project daily reports"],
        summary: "Get a project daily report",
        security: [{ bearerAuth: [] }],
        params: reportParamsSchema,
        response: { 200: successSchema(reportDetailSchema), ...commonErrors },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof dailyReportParamsSchema
      >;
      const data = await service.detail(
        scopeFromRequest(request),
        projectId,
        reportId!,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/projects/:projectId/daily-reports",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(dailyReportParamsSchema),
        validateBody(dailyReportCommandSchema),
      ],
      schema: {
        tags: ["Project daily reports"],
        summary: "Create a project daily report draft",
        security: [{ bearerAuth: [] }],
        params: projectParamsSchema,
        body: dailyReportCommandOpenApiSchema,
        response: { 201: successSchema(reportDetailSchema), ...commonErrors },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof dailyReportParamsSchema
      >;
      const data = await service.create(
        scopeFromRequest(request),
        projectId,
        request.body as z.infer<typeof dailyReportCommandSchema>,
      );
      return jsonResponse.success({ reply, data, statusCode: 201 });
    },
  );

  app.put(
    "/projects/:projectId/daily-reports/:reportId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(dailyReportParamsSchema),
        validateBody(dailyReportCommandSchema),
      ],
      schema: {
        tags: ["Project daily reports"],
        summary: "Replace a project daily report draft",
        security: [{ bearerAuth: [] }],
        params: reportParamsSchema,
        body: dailyReportCommandOpenApiSchema,
        response: { 200: successSchema(reportDetailSchema), ...commonErrors },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof dailyReportParamsSchema
      >;
      const data = await service.update(
        scopeFromRequest(request),
        projectId,
        reportId!,
        request.body as z.infer<typeof dailyReportCommandSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/projects/:projectId/daily-reports/:reportId/finalize",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(dailyReportParamsSchema),
      ],
      schema: {
        tags: ["Project daily reports"],
        summary: "Finalize a project daily report without a request body",
        description:
          "This command must be sent without a body and without Content-Type. Finalization records journeys and machine readings atomically and makes the report immutable.",
        security: [{ bearerAuth: [] }],
        params: reportParamsSchema,
        response: {
          200: successSchema(reportDetailSchema),
          ...commonErrors,
          415: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof dailyReportParamsSchema
      >;
      const data = await service.finalize(
        scopeFromRequest(request),
        projectId,
        reportId!,
      );
      return jsonResponse.success({ reply, data });
    },
  );
};

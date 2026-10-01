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
  frequencyListQuerySchema,
  dailyReportListQuerySchema,
  dailyReportOptionsQuerySchema,
  dailyReportParamsSchema,
  operationalDayParamsSchema,
  operationalInterferenceParamsSchema,
  operationalInterferenceCommandSchema,
  operationalReportParamsSchema,
  operationalRdoCommandSchema,
  operationalStatusEventCommandSchema,
  operationalShiftCloseSchema,
  operationalShiftStartSchema,
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
const dateTime = { type: "string", format: "date-time" } as const;

const operationalStartSchema = {
  type: "object",
  additionalProperties: false,
  required: ["startedAt", "employees", "machines"],
  properties: {
    startedAt: dateTime,
    employees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employmentId", "status"],
        properties: {
          employmentId: uuid,
          status: { type: "string", enum: ["present", "absent"] },
          absenceReason: nullableString,
        },
      },
    },
    machines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["machineId", "condition"],
        properties: {
          machineId: uuid,
          condition: { type: "string", enum: ["fit", "unfit"] },
          conditionNote: nullableString,
        },
      },
    },
  },
} as const;

const operationalInterferenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "description", "impact", "startedAt"],
  properties: {
    category: {
      type: "string",
      enum: [
        "weather",
        "crew",
        "equipment",
        "material_logistics",
        "external",
        "safety",
        "other",
      ],
    },
    description: { type: "string" },
    impact: { type: "string" },
    startedAt: dateTime,
    endedAt: { ...dateTime, nullable: true },
  },
} as const;

const operationalStatusEventSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "status"],
      properties: {
        type: { type: "string", const: "shift" },
        status: { type: "string", enum: ["working", "paused"] },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "employmentId", "status"],
      properties: {
        type: { type: "string", const: "employee" },
        employmentId: uuid,
        status: { type: "string", enum: ["working", "stopped", "unfit"] },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "machineId", "status"],
      properties: {
        type: { type: "string", const: "machine" },
        machineId: uuid,
        status: { type: "string", enum: ["working", "stopped", "maintenance"] },
      },
    },
  ],
} as const;

const operationalCloseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["endedAt", "employees", "machines"],
  properties: {
    endedAt: dateTime,
    earlyClosureReason: nullableString,
    activityNotes: { type: "string", nullable: true, maxLength: 10_000 },
    fallbackClimateConditions: {
      type: "array",
      maxItems: 3,
      uniqueItems: true,
      items: { type: "string", enum: ["rain", "dry", "waterlogged_soil"] },
    },
    employees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "employmentId",
          "checkInAt",
          "checkOutAt",
          "breaks",
          "overtimeConfirmed",
        ],
        properties: {
          employmentId: uuid,
          checkInAt: { ...dateTime, nullable: true },
          checkOutAt: { ...dateTime, nullable: true },
          overtimeConfirmed: { type: "boolean" },
          breaks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["startAt", "endAt"],
              properties: { startAt: dateTime, endAt: dateTime },
            },
          },
        },
      },
    },
    machines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["machineId", "endMeterReadingValue"],
        properties: {
          machineId: uuid,
          endMeterReadingValue: { ...decimal, nullable: true },
        },
      },
    },
  },
} as const;

const operationalDayResponseSchema = {
  type: "object",
  additionalProperties: true,
  required: ["reportDate", "shifts"],
  properties: {
    reportDate: { type: "string", format: "date" },
    shifts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["shift", "enabled", "options", "report"],
        properties: {
          shift,
          enabled: { type: "boolean" },
          options: {
            type: "object",
            nullable: true,
            additionalProperties: true,
            properties: {
              defaults: {
                type: "object",
                additionalProperties: true,
                required: ["breakTemplates"],
                properties: {
                  breakTemplates: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "name", "durationMinutes"],
                      properties: {
                        id: uuid,
                        name: { type: "string" },
                        durationMinutes: { type: "integer", minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
          report: {
            type: "object",
            nullable: true,
            additionalProperties: true,
            properties: {
              employees: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                  required: ["employmentId", "shiftCostBrl"],
                  properties: {
                    employmentId: uuid,
                    shiftCostBrl: { ...decimal, nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
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

const operationalRdoSchema = {
  type: "object",
  additionalProperties: false,
  required: [
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
    "executedActivities",
  ],
  properties: {
    schedulePeriods: dailyReportCommandOpenApiSchema.properties.schedulePeriods,
    activityStartTime: time,
    activityEndTime: time,
    activityEndDayOffset: { type: "integer", minimum: 0, maximum: 1 },
    activityTypes: dailyReportCommandOpenApiSchema.properties.activityTypes,
    climateConditions:
      dailyReportCommandOpenApiSchema.properties.climateConditions,
    dailyRainfallMm: decimal,
    monthlyRainfallMm: decimal,
    supervisorEmploymentId: uuid,
    technicalResponsibilityEmploymentIds:
      dailyReportCommandOpenApiSchema.properties
        .technicalResponsibilityEmploymentIds,
    executedActivities: { type: "string", minLength: 1, maxLength: 10000 },
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
          "overtimeEnabled",
          "shiftCostBrl",
        ],
        properties: {
          employmentId: uuid,
          name: { type: "string" },
          jobRole: { type: "string" },
          completedFullShift: { type: "boolean" },
          regularWorkedMinutes: { type: "integer" },
          overtimeMinutes: { type: "integer" },
          overtimeEnabled: { type: "boolean" },
          shiftCostBrl: { ...decimal, nullable: true },
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
        required: ["id", "name", "jobRole", "overtimeEnabled"],
        properties: {
          id: uuid,
          name: { type: "string" },
          jobRole: { type: "string" },
          overtimeEnabled: { type: "boolean" },
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
    "/projects/:projectId/operational-days/:reportDate",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(operationalDayParamsSchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "Get the operational command center for a project day",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "reportDate"],
          properties: {
            projectId: uuid,
            reportDate: { type: "string", format: "date" },
          },
        },
        response: {
          200: successSchema(operationalDayResponseSchema),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportDate } = request.params as z.infer<
        typeof operationalDayParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.operationalDay(
          scopeFromRequest(request),
          projectId,
          reportDate,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/operational-days/:reportDate/shifts/:shift/start",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(operationalDayParamsSchema),
        validateBody(operationalShiftStartSchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "Start an operational shift and its RDO draft",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "reportDate", "shift"],
          properties: {
            projectId: uuid,
            reportDate: { type: "string", format: "date" },
            shift,
          },
        },
        body: operationalStartSchema,
        response: {
          201: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const {
        projectId,
        reportDate,
        shift: selectedShift,
      } = request.params as z.infer<typeof operationalDayParamsSchema>;
      const data = await service.startOperationalShift(
        scopeFromRequest(request),
        projectId,
        reportDate,
        selectedShift!,
        request.body as z.infer<typeof operationalShiftStartSchema>,
      );
      return jsonResponse.success({ reply, data, statusCode: 201 });
    },
  );

  app.put(
    "/projects/:projectId/operational-shifts/:reportId/rdo",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(operationalReportParamsSchema),
        validateBody(operationalRdoCommandSchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "Save RDO answers for an open shift",
        security: [{ bearerAuth: [] }],
        params: reportParamsSchema,
        body: operationalRdoSchema,
        response: {
          200: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof operationalReportParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.saveOperationalRdo(
          scopeFromRequest(request),
          projectId,
          reportId,
          request.body as z.infer<typeof operationalRdoCommandSchema>,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/operational-shifts/:reportId/interferences",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(operationalReportParamsSchema),
        validateBody(operationalInterferenceCommandSchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "Record an interference during an open shift",
        security: [{ bearerAuth: [] }],
        params: reportParamsSchema,
        body: operationalInterferenceSchema,
        response: {
          201: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof operationalReportParamsSchema
      >;
      return jsonResponse.success({
        reply,
        statusCode: 201,
        data: await service.addInterference(
          scopeFromRequest(request),
          projectId,
          reportId,
          request.body as z.infer<typeof operationalInterferenceCommandSchema>,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/operational-shifts/:reportId/interferences/:interferenceId/confirm",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(operationalInterferenceParamsSchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "Confirm an operational interference",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "reportId", "interferenceId"],
          properties: { projectId: uuid, reportId: uuid, interferenceId: uuid },
        },
        response: {
          200: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId, interferenceId } = request.params as z.infer<
        typeof operationalInterferenceParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.confirmInterference(
          scopeFromRequest(request),
          projectId,
          reportId,
          interferenceId,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/operational-shifts/:reportId/status-events",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(operationalReportParamsSchema),
        validateBody(operationalStatusEventCommandSchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "Record an audited operational status transition",
        security: [{ bearerAuth: [] }],
        params: reportParamsSchema,
        body: operationalStatusEventSchema,
        response: {
          201: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof operationalReportParamsSchema
      >;
      return jsonResponse.success({
        reply,
        statusCode: 201,
        data: await service.recordStatusEvent(
          scopeFromRequest(request),
          projectId,
          reportId,
          request.body as z.infer<typeof operationalStatusEventCommandSchema>,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/operational-shifts/:reportId/close",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(operationalReportParamsSchema),
        validateBody(operationalShiftCloseSchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "Close a shift and finalize its RDO atomically",
        security: [{ bearerAuth: [] }],
        params: reportParamsSchema,
        body: operationalCloseSchema,
        response: {
          200: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, reportId } = request.params as z.infer<
        typeof operationalReportParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.closeOperationalShift(
          scopeFromRequest(request),
          projectId,
          reportId,
          request.body as z.infer<typeof operationalShiftCloseSchema>,
        ),
      });
    },
  );

  app.get(
    "/projects/:projectId/frequency",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(dailyReportParamsSchema),
        validateQuery(frequencyListQuerySchema),
      ],
      schema: {
        tags: ["Project operations"],
        summary: "List finalized employee frequency by shift",
        security: [{ bearerAuth: [] }],
        params: projectParamsSchema,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            cursor: { type: "string" },
            shift,
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
          200: successSchema({ type: "object", additionalProperties: true }),
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof dailyReportParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.frequency(
          scopeFromRequest(request),
          projectId,
          request.query as z.infer<typeof frequencyListQuerySchema>,
        ),
      });
    },
  );

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

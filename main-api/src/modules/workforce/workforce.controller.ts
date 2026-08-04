import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { jsonResponse } from "../../lib/utils/jsonResponse";
import {
  maskedSensitiveDocumentSchema,
  protectedSensitiveDocumentSchema,
} from "../../lib/utils/swaggerSchemas";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../lib/utils/zodResolver";
import {
  createEmployeeSchema,
  createJobRoleSchema,
  updateJobRoleSchema,
  changeEmployeeJobRoleSchema,
  listEmployeesQuerySchema,
  rehireEmployeeSchema,
  allocateEmployeeSchema,
  releaseEmployeeAllocationSchema,
  reallocateEmployeeSchema,
  replaceEmployeeAllocationTermsSchema,
  terminateEmploymentSchema,
} from "./workforce.dto";
import { WorkforceService } from "./workforce.service";

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

const createEmployeeBodySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "document",
    "fullName",
    "companyRegistrationNumber",
    "admissionDate",
    "jobRoleId",
  ],
  properties: {
    document: { type: "string", minLength: 1, maxLength: 32, writeOnly: true },
    fullName: { type: "string", minLength: 1, maxLength: 180 },
    companyRegistrationNumber: {
      type: "string",
      minLength: 1,
      maxLength: 80,
    },
    admissionDate: { type: "string", format: "date" },
    jobRoleId: { type: "string", format: "uuid" },
  },
} as const;

const listEmployeesOpenApiQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    cursor: { type: "string", minLength: 1, maxLength: 2048 },
    search: { type: "string", maxLength: 120 },
    state: { type: "string", enum: ["active", "terminated"] },
    availability: { type: "string", enum: ["available"] },
    sortBy: {
      type: "string",
      enum: ["name", "createdAt"],
      default: "createdAt",
    },
    sortDirection: { type: "string", enum: ["asc", "desc"], default: "desc" },
  },
} as const;

const employeeParamsOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["employmentId"],
  properties: { employmentId: { type: "string", format: "uuid" } },
} as const;

const employeeListItemSchema = {
  type: "object",
  required: ["id", "person", "employment", "availability"],
  properties: {
    id: { type: "string", format: "uuid" },
    person: {
      type: "object",
      required: ["id", "fullName", "displayName", "document"],
      properties: {
        id: { type: "string", format: "uuid" },
        fullName: { type: "string" },
        displayName: { type: "string" },
        document: maskedSensitiveDocumentSchema,
      },
      additionalProperties: false,
    },
    employment: {
      type: "object",
      required: [
        "id",
        "companyRegistrationNumber",
        "state",
        "isActive",
        "admissionDate",
        "createdAt",
        "updatedAt",
        "jobRole",
      ],
      properties: {
        id: { type: "string", format: "uuid" },
        companyRegistrationNumber: { type: "string" },
        state: { type: "string", enum: ["active", "terminated"] },
        isActive: { type: "boolean" },
        admissionDate: { type: "string", format: "date", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        jobRole: {
          nullable: true,
          type: "object",
          required: ["id", "name", "periodId"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            periodId: { type: "string", format: "uuid" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    availability: {
      type: "object",
      required: ["state", "hasOpenAllocation", "functionPending"],
      properties: {
        state: { type: "string", enum: ["available", "unavailable"] },
        hasOpenAllocation: { type: "boolean" },
        functionPending: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const currentAllocationSchema = {
  nullable: true,
  type: "object",
  required: [
    "id",
    "employmentId",
    "personId",
    "project",
    "jobRole",
    "monthlyWorkloadHours",
    "compensationMode",
    "compensationValue",
    "overtimeRate",
    "effectiveFrom",
    "effectiveTo",
    "endedReason",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    employmentId: { type: "string", format: "uuid" },
    personId: { type: "string", format: "uuid" },
    project: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "status"],
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        status: { type: "string", enum: ["planned", "active", "paused"] },
      },
    },
    jobRole: { type: "string" },
    monthlyWorkloadHours: { type: "integer" },
    compensationMode: { type: "string" },
    compensationValue: { type: "string" },
    overtimeRate: { type: "string" },
    effectiveFrom: { type: "string", format: "date-time" },
    effectiveTo: { type: "string", format: "date-time", nullable: true },
    endedReason: { type: "string", nullable: true },
  },
  additionalProperties: false,
} as const;

const employeeDetailSchema = {
  ...employeeListItemSchema,
  required: [
    "id",
    "person",
    "employment",
    "availability",
    "periods",
    "jobRolePeriods",
    "currentAllocation",
  ],
  properties: {
    ...employeeListItemSchema.properties,
    person: {
      type: "object",
      required: [
        "id",
        "fullName",
        "displayName",
        "document",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        id: { type: "string", format: "uuid" },
        fullName: { type: "string" },
        displayName: { type: "string" },
        document: protectedSensitiveDocumentSchema,
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
    periods: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "admissionDate",
          "effectiveFrom",
          "effectiveTo",
          "terminationReason",
          "state",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          admissionDate: { type: "string", format: "date" },
          effectiveFrom: { type: "string", format: "date" },
          effectiveTo: { type: "string", format: "date", nullable: true },
          terminationReason: { type: "string", nullable: true },
          state: { type: "string", enum: ["current", "closed"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        additionalProperties: false,
      },
    },
    jobRolePeriods: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "jobRole",
          "effectiveFrom",
          "effectiveTo",
          "reason",
          "state",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          jobRole: {
            type: "object",
            required: ["id", "name"],
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
            },
          },
          effectiveFrom: { type: "string", format: "date" },
          effectiveTo: { type: "string", format: "date", nullable: true },
          reason: { type: "string", nullable: true },
          state: { type: "string", enum: ["current", "closed"] },
        },
      },
    },
    currentAllocation: currentAllocationSchema,
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
        data: { type: "array", items: employeeListItemSchema },
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

const detailResponseSchema = {
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: employeeDetailSchema,
  },
} as const;

const allocationResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: currentAllocationSchema,
  },
} as const;

const allocationReplacementResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: {
      type: "object",
      additionalProperties: false,
      required: ["previous", "current"],
      properties: { previous: currentAllocationSchema, current: currentAllocationSchema },
    },
  },
} as const;

const reallocationResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: {
      type: "object",
      additionalProperties: false,
      required: ["source", "destination"],
      properties: {
        source: currentAllocationSchema,
        destination: currentAllocationSchema,
      },
    },
  },
} as const;

const reallocationDestinationsResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "projects"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          projects: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "name", "status"],
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                status: { type: "string", enum: ["planned", "active"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

const emptyBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

const employeeParamsSchema = z
  .object({ employmentId: z.string().uuid() })
  .strict();
const jobRoleParamsSchema = z.object({ jobRoleId: z.string().uuid() }).strict();
const allocationParamsSchema = z
  .object({ allocationId: z.string().uuid() })
  .strict();
const jobRoleSchema = {
  type: "object",
  required: ["id", "name", "isActive", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    isActive: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const;
const jobRoleBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: { name: { type: "string", minLength: 1, maxLength: 120 } },
} as const;

function scopeFromRequest(request: {
  authContext?: {
    corporationId: string;
    companyId?: string;
    userId?: string;
    sessionId?: string;
  };
}) {
  const corporationId = request.authContext?.corporationId;
  const companyId = request.authContext?.companyId;
  const actorUserId = request.authContext?.userId;
  const sessionId = request.authContext?.sessionId;
  if (!corporationId || !companyId || !actorUserId || !sessionId) {
    throw new Error("Company-scoped route executed without auth context");
  }
  return { corporationId, companyId, actorUserId, sessionId };
}

export const v1WorkforceController = async (app: FastifyInstance) => {
  const workforceService = new WorkforceService(app.handlerContext);

  app.post(
    "/employees",
    {
      preHandler: [app.requireCompanyScope, validateBody(createEmployeeSchema)],
      schema: {
        tags: ["Workforce"],
        summary: "Create a Person Employment in the selected Company",
        security: [{ bearerAuth: [] }],
        body: createEmployeeBodySchema,
        response: {
          201: detailResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const data = await workforceService.create(
        scopeFromRequest(request),
        request.body as z.infer<typeof createEmployeeSchema>,
      );
      return jsonResponse.success({ reply, data, statusCode: 201 });
    },
  );

  app.get(
    "/employee-allocations/selectors/destinations/:employmentId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(employeeParamsSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "List authorized Employee reallocation destinations",
        security: [{ bearerAuth: [] }],
        params: employeeParamsOpenApiSchema,
        response: {
          200: reallocationDestinationsResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await workforceService.listReallocationDestinations(
          scopeFromRequest(request),
          (request.params as z.infer<typeof employeeParamsSchema>).employmentId,
        ),
      }),
  );

  app.post(
    "/employee-allocations",
    {
      preHandler: [
        app.requireCompanyScope,
        validateBody(allocateEmployeeSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Allocate an Employee to an eligible Project",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "employmentId",
            "projectId",
            "jobRole",
            "monthlyWorkloadHours",
            "compensationMode",
            "compensationValue",
            "overtimeRate",
          ],
          properties: {
            employmentId: { type: "string", format: "uuid" },
            projectId: { type: "string", format: "uuid" },
            jobRole: { type: "string", minLength: 1, maxLength: 120 },
            monthlyWorkloadHours: {
              type: "integer",
              minimum: 1,
              maximum: 744,
            },
            compensationMode: {
              enum: ["daily", "hourly", "weekly", "fortnightly", "monthly"],
            },
            compensationValue: {
              type: "string",
              pattern: "^(?:0|[1-9]\\d*)\\.\\d{2}$",
            },
            overtimeRate: {
              type: "string",
              pattern: "^(?:0|[1-9]\\d*)\\.\\d{2}$",
            },
          },
        },
        response: {
          201: allocationResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        statusCode: 201,
        data: await workforceService.allocate(
          scopeFromRequest(request),
          request.body as z.infer<typeof allocateEmployeeSchema>,
        ),
      }),
  );

  const allocationParamsOpenApiSchema = {
    type: "object",
    additionalProperties: false,
    required: ["allocationId"],
    properties: { allocationId: { type: "string", format: "uuid" } },
  } as const;
  const reasonBodySchema = {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
  } as const;

  app.post(
    "/employee-allocations/:allocationId/release",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(allocationParamsSchema),
        validateBody(releaseEmployeeAllocationSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Release an Employee allocation immediately",
        security: [{ bearerAuth: [] }],
        params: allocationParamsOpenApiSchema,
        body: reasonBodySchema,
        response: {
          200: allocationResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await workforceService.releaseAllocation(
          scopeFromRequest(request),
          (request.params as z.infer<typeof allocationParamsSchema>)
            .allocationId,
          request.body as z.infer<typeof releaseEmployeeAllocationSchema>,
        ),
      }),
  );

  app.post(
    "/employee-allocations/:allocationId/reallocate",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(allocationParamsSchema),
        validateBody(reallocateEmployeeSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Reallocate an Employee atomically",
        security: [{ bearerAuth: [] }],
        params: allocationParamsOpenApiSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "destinationCompanyId",
            "destinationProjectId",
            "jobRole",
            "monthlyWorkloadHours",
            "compensationMode",
            "compensationValue",
            "overtimeRate",
            "reason",
          ],
          properties: {
            destinationCompanyId: { type: "string", format: "uuid" },
            destinationProjectId: { type: "string", format: "uuid" },
            jobRole: { type: "string", minLength: 1, maxLength: 120 },
            monthlyWorkloadHours: {
              type: "integer",
              minimum: 1,
              maximum: 744,
            },
            compensationMode: {
              type: "string",
              enum: ["daily", "hourly", "weekly", "fortnightly", "monthly"],
            },
            compensationValue: {
              type: "string",
              pattern: "^(?:0|[1-9]\\d*)\\.\\d{2}$",
            },
            overtimeRate: {
              type: "string",
              pattern: "^(?:0|[1-9]\\d*)\\.\\d{2}$",
            },
            reason: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
        response: {
          200: reallocationResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await workforceService.reallocateAllocation(
          scopeFromRequest(request),
          (request.params as z.infer<typeof allocationParamsSchema>)
            .allocationId,
          request.body as z.infer<typeof reallocateEmployeeSchema>,
        ),
      }),
  );

  app.post(
    "/employee-allocations/:allocationId/terms",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(allocationParamsSchema),
        validateBody(replaceEmployeeAllocationTermsSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Replace effective Employee allocation terms",
        security: [{ bearerAuth: [] }],
        params: allocationParamsOpenApiSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "jobRole",
            "monthlyWorkloadHours",
            "compensationMode",
            "compensationValue",
            "overtimeRate",
            "reason",
          ],
          properties: {
            jobRole: { type: "string", minLength: 1, maxLength: 120 },
            monthlyWorkloadHours: {
              type: "integer",
              minimum: 1,
              maximum: 744,
            },
            compensationMode: {
              type: "string",
              enum: ["daily", "hourly", "weekly", "fortnightly", "monthly"],
            },
            compensationValue: {
              type: "string",
              pattern: "^(?:0|[1-9]\\d*)\\.\\d{2}$",
            },
            overtimeRate: {
              type: "string",
              pattern: "^(?:0|[1-9]\\d*)\\.\\d{2}$",
            },
            reason: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
        response: {
          200: allocationReplacementResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await workforceService.replaceAllocationTerms(
          scopeFromRequest(request),
          (request.params as z.infer<typeof allocationParamsSchema>)
            .allocationId,
          request.body as z.infer<typeof replaceEmployeeAllocationTermsSchema>,
        ),
      }),
  );

  app.get(
    "/job-roles",
    {
      preHandler: [app.requireCompanyScope],
      schema: {
        tags: ["Workforce"],
        summary: "List company job roles",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: { type: "array", items: jobRoleSchema },
            },
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await workforceService.listJobRoles(scopeFromRequest(request)),
      }),
  );
  app.post(
    "/job-roles",
    {
      preHandler: [app.requireCompanyScope, validateBody(createJobRoleSchema)],
      schema: {
        tags: ["Workforce"],
        summary: "Create a company job role",
        security: [{ bearerAuth: [] }],
        body: jobRoleBodySchema,
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: jobRoleSchema,
            },
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({
        reply,
        statusCode: 201,
        data: await workforceService.createJobRole(
          scopeFromRequest(request),
          request.body as z.infer<typeof createJobRoleSchema>,
        ),
      }),
  );
  app.put(
    "/job-roles/:jobRoleId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(jobRoleParamsSchema),
        validateBody(updateJobRoleSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Update or deactivate a company job role",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            isActive: { type: "boolean" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: jobRoleSchema,
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
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await workforceService.updateJobRole(
          scopeFromRequest(request),
          (request.params as z.infer<typeof jobRoleParamsSchema>).jobRoleId,
          request.body as z.infer<typeof updateJobRoleSchema>,
        ),
      }),
  );
  app.put(
    "/employees/:employmentId/job-role",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(employeeParamsSchema),
        validateBody(changeEmployeeJobRoleSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Change an employee current job role",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["jobRoleId", "reason"],
          properties: {
            jobRoleId: { type: "string", format: "uuid" },
            reason: { type: "string", minLength: 1, maxLength: 240 },
          },
        },
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
    async (request, reply) =>
      jsonResponse.success({
        reply,
        data: await workforceService.changeJobRole(
          scopeFromRequest(request),
          (request.params as z.infer<typeof employeeParamsSchema>).employmentId,
          request.body as z.infer<typeof changeEmployeeJobRoleSchema>,
        ),
      }),
  );

  app.get(
    "/employees",
    {
      preHandler: [
        app.requireCompanyScope,
        validateQuery(listEmployeesQuerySchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "List Employees in the selected Company",
        security: [{ bearerAuth: [] }],
        querystring: listEmployeesOpenApiQuerySchema,
        response: {
          200: listResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const data = await workforceService.list(
        scopeFromRequest(request),
        request.query as z.infer<typeof listEmployeesQuerySchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.get(
    "/employees/:employmentId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(employeeParamsSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Get an authorized Employee detail",
        security: [{ bearerAuth: [] }],
        params: employeeParamsOpenApiSchema,
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
      const { employmentId } = request.params as z.infer<
        typeof employeeParamsSchema
      >;
      const data = await workforceService.detail(
        scopeFromRequest(request),
        employmentId,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/employees/:employmentId/terminate",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(employeeParamsSchema),
        validateBody(terminateEmploymentSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Terminate an Employee employment safely",
        security: [{ bearerAuth: [] }],
        params: employeeParamsOpenApiSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 240 } },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["success", "message", "data"],
            properties: {
              success: { type: "boolean", const: true },
              message: { type: "string" },
              data: {
                type: "object",
                additionalProperties: false,
                required: ["employmentId", "terminatedAt", "closedAllocation"],
                properties: {
                  employmentId: { type: "string", format: "uuid" },
                  terminatedAt: { type: "string", format: "date-time" },
                  closedAllocation: { type: "boolean" },
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
      const { employmentId } = request.params as z.infer<typeof employeeParamsSchema>;
      const data = await workforceService.terminate(
        scopeFromRequest(request),
        employmentId,
        request.body as z.infer<typeof terminateEmploymentSchema>,
      );
      return jsonResponse.success({ reply, data });
    },
  );

  app.post(
    "/employees/:employmentId/rehire",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(employeeParamsSchema),
        validateBody(rehireEmployeeSchema),
      ],
      schema: {
        tags: ["Workforce"],
        summary: "Rehire a terminated Employee in the selected Company",
        security: [{ bearerAuth: [] }],
        params: employeeParamsOpenApiSchema,
        body: emptyBodySchema,
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
      const { employmentId } = request.params as z.infer<
        typeof employeeParamsSchema
      >;
      const data = await workforceService.rehire(
        scopeFromRequest(request),
        employmentId,
      );
      return jsonResponse.success({ reply, data });
    },
  );
};

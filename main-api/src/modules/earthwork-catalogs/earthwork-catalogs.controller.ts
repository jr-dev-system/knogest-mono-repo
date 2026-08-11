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
  createEarthworkMaterialRevisionSchema,
  createEarthworkMaterialSchema,
  createHaulRouteRevisionSchema,
  createHaulRouteSchema,
  earthworkCatalogListQuerySchema,
  earthworkCatalogParamsSchema,
  updateEarthworkMaterialSchema,
  updateHaulRouteSchema,
} from "./earthwork-catalogs.dto";
import { EarthworkCatalogsService } from "./earthwork-catalogs.service";

const uuid = { type: "string", format: "uuid" } as const;
const decimal = {
  type: "string",
  pattern: "^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,6})?$",
} as const;
const nullableDecimal = { ...decimal, nullable: true } as const;
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
const errors = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
} as const;
const projectParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId"],
  properties: { projectId: uuid },
} as const;
const resourceParams = (name: "materialId" | "routeId") => ({
  type: "object",
  additionalProperties: false,
  required: ["projectId", name],
  properties: { projectId: uuid, [name]: uuid },
});
const listQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    cursor: { type: "string" },
    search: { type: "string", maxLength: 120 },
    active: { type: "boolean" },
    sortBy: { type: "string", enum: ["name"], default: "name" },
    sortDirection: { type: "string", enum: ["asc", "desc"], default: "asc" },
  },
} as const;
const pageSchema = {
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
} as const;
const materialCreateBody = {
  type: "object",
  additionalProperties: false,
  required: ["code", "name", "effectiveFrom"],
  properties: {
    code: { type: "string", minLength: 1, maxLength: 48 },
    name: { type: "string", minLength: 1, maxLength: 160 },
    classification: { type: "string", nullable: true, maxLength: 120 },
    category: { type: "string", nullable: true, maxLength: 120 },
    densityTPerM3: nullableDecimal,
    swellFactor: nullableDecimal,
    looseToCompactedFactor: nullableDecimal,
    effectiveFrom: { type: "string", format: "date-time" },
  },
} as const;
const materialRevisionBody = {
  type: "object",
  additionalProperties: false,
  required: ["effectiveFrom"],
  properties: {
    densityTPerM3: nullableDecimal,
    swellFactor: nullableDecimal,
    looseToCompactedFactor: nullableDecimal,
    effectiveFrom: { type: "string", format: "date-time" },
  },
} as const;
const routeRevisionBody = {
  type: "object",
  additionalProperties: false,
  required: ["loadedDistanceKm", "effectiveFrom"],
  properties: {
    loadedDistanceKm: decimal,
    emptyReturnDistanceKm: nullableDecimal,
    contractualDmtKm: nullableDecimal,
    contractualBand: { type: "string", nullable: true, maxLength: 80 },
    effectiveFrom: { type: "string", format: "date-time" },
  },
} as const;
const routeCreateBody = {
  type: "object",
  additionalProperties: false,
  required: [
    "code",
    "name",
    "origin",
    "destination",
    "loadedDistanceKm",
    "effectiveFrom",
  ],
  properties: {
    code: { type: "string", minLength: 1, maxLength: 48 },
    name: { type: "string", minLength: 1, maxLength: 160 },
    origin: { type: "string", minLength: 1, maxLength: 240 },
    destination: { type: "string", minLength: 1, maxLength: 240 },
    ...routeRevisionBody.properties,
  },
} as const;

function scopeFromRequest(request: {
  authContext?: {
    corporationId: string;
    companyId?: string;
    userId?: string;
  };
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

export const v1EarthworkCatalogsController = async (app: FastifyInstance) => {
  const service = new EarthworkCatalogsService(app.handlerContext);

  app.get(
    "/projects/:projectId/earthwork-service-definitions",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "List the fixed versioned earthwork service catalog",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        response: {
          200: successSchema({
            type: "array",
            maxItems: 100,
            items: { type: "object", additionalProperties: true },
          }),
          ...errors,
        },
      },
    },
    async (request, reply) =>
      jsonResponse.success({ reply, data: await service.serviceDefinitions() }),
  );

  app.get(
    "/projects/:projectId/earthwork-materials",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateQuery(earthworkCatalogListQuerySchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "List project earthwork materials",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        querystring: listQuery,
        response: { 200: successSchema(pageSchema), ...errors },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.listMaterials(
          scopeFromRequest(request),
          projectId,
          request.query as z.infer<typeof earthworkCatalogListQuerySchema>,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/earthwork-materials",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateBody(createEarthworkMaterialSchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "Create a versioned project earthwork material",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        body: materialCreateBody,
        response: {
          201: successSchema({ type: "object", additionalProperties: true }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        statusCode: 201,
        data: await service.createMaterial(
          scopeFromRequest(request),
          projectId,
          request.body as z.infer<typeof createEarthworkMaterialSchema>,
        ),
      });
    },
  );

  app.put(
    "/projects/:projectId/earthwork-materials/:materialId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateBody(updateEarthworkMaterialSchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "Update project earthwork material metadata",
        security: [{ bearerAuth: [] }],
        params: resourceParams("materialId"),
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "isActive"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 160 },
            classification: { type: "string", nullable: true, maxLength: 120 },
            category: { type: "string", nullable: true, maxLength: 120 },
            isActive: { type: "boolean" },
          },
        },
        response: {
          200: successSchema({ type: "object", additionalProperties: true }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, materialId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.updateMaterial(
          scopeFromRequest(request),
          projectId,
          materialId!,
          request.body as z.infer<typeof updateEarthworkMaterialSchema>,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/earthwork-materials/:materialId/revisions",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateBody(createEarthworkMaterialRevisionSchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "Create a material factor revision",
        security: [{ bearerAuth: [] }],
        params: resourceParams("materialId"),
        body: materialRevisionBody,
        response: {
          201: successSchema({ type: "object", additionalProperties: true }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, materialId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        statusCode: 201,
        data: await service.reviseMaterial(
          scopeFromRequest(request),
          projectId,
          materialId!,
          request.body as z.infer<typeof createEarthworkMaterialRevisionSchema>,
        ),
      });
    },
  );

  app.get(
    "/projects/:projectId/haul-routes",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateQuery(earthworkCatalogListQuerySchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "List project haul routes",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        querystring: listQuery,
        response: { 200: successSchema(pageSchema), ...errors },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.listRoutes(
          scopeFromRequest(request),
          projectId,
          request.query as z.infer<typeof earthworkCatalogListQuerySchema>,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/haul-routes",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateBody(createHaulRouteSchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "Create a versioned project haul route",
        security: [{ bearerAuth: [] }],
        params: projectParams,
        body: routeCreateBody,
        response: {
          201: successSchema({ type: "object", additionalProperties: true }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        statusCode: 201,
        data: await service.createRoute(
          scopeFromRequest(request),
          projectId,
          request.body as z.infer<typeof createHaulRouteSchema>,
        ),
      });
    },
  );

  app.put(
    "/projects/:projectId/haul-routes/:routeId",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateBody(updateHaulRouteSchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "Update project haul route metadata",
        security: [{ bearerAuth: [] }],
        params: resourceParams("routeId"),
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "origin", "destination", "isActive"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 160 },
            origin: { type: "string", minLength: 1, maxLength: 240 },
            destination: { type: "string", minLength: 1, maxLength: 240 },
            isActive: { type: "boolean" },
          },
        },
        response: {
          200: successSchema({ type: "object", additionalProperties: true }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, routeId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        data: await service.updateRoute(
          scopeFromRequest(request),
          projectId,
          routeId!,
          request.body as z.infer<typeof updateHaulRouteSchema>,
        ),
      });
    },
  );

  app.post(
    "/projects/:projectId/haul-routes/:routeId/revisions",
    {
      preHandler: [
        app.requireCompanyScope,
        validateParams(earthworkCatalogParamsSchema),
        validateBody(createHaulRouteRevisionSchema),
      ],
      schema: {
        tags: ["Earthwork catalogs"],
        summary: "Create a haul route distance revision",
        security: [{ bearerAuth: [] }],
        params: resourceParams("routeId"),
        body: routeRevisionBody,
        response: {
          201: successSchema({ type: "object", additionalProperties: true }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const { projectId, routeId } = request.params as z.infer<
        typeof earthworkCatalogParamsSchema
      >;
      return jsonResponse.success({
        reply,
        statusCode: 201,
        data: await service.reviseRoute(
          scopeFromRequest(request),
          projectId,
          routeId!,
          request.body as z.infer<typeof createHaulRouteRevisionSchema>,
        ),
      });
    },
  );
};

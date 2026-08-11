import { z } from "zod";

const uuid = z.string().uuid();
const positiveDecimal = z
  .string()
  .regex(/^(?=[0-9.]*[1-9])(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u);
const nonNegativeDecimal = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u);

export const earthworkCatalogParamsSchema = z
  .object({
    projectId: uuid,
    materialId: uuid.optional(),
    routeId: uuid.optional(),
  })
  .strict();

export const earthworkCatalogListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
    search: z.string().trim().min(1).max(120).optional(),
    active: z.coerce.boolean().optional(),
    sortBy: z.literal("name").default("name"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

const effectiveFrom = z.string().datetime({ offset: true });

export const createEarthworkMaterialSchema = z
  .object({
    code: z.string().trim().min(1).max(48),
    name: z.string().trim().min(1).max(160),
    classification: z.string().trim().max(120).nullable().default(null),
    category: z.string().trim().max(120).nullable().default(null),
    densityTPerM3: positiveDecimal.nullable().default(null),
    swellFactor: positiveDecimal.nullable().default(null),
    looseToCompactedFactor: positiveDecimal.nullable().default(null),
    effectiveFrom,
  })
  .strict();

export const updateEarthworkMaterialSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    classification: z.string().trim().max(120).nullable().default(null),
    category: z.string().trim().max(120).nullable().default(null),
    isActive: z.boolean(),
  })
  .strict();

export const createEarthworkMaterialRevisionSchema = z
  .object({
    densityTPerM3: positiveDecimal.nullable().default(null),
    swellFactor: positiveDecimal.nullable().default(null),
    looseToCompactedFactor: positiveDecimal.nullable().default(null),
    effectiveFrom,
  })
  .strict();

export const createHaulRouteSchema = z
  .object({
    code: z.string().trim().min(1).max(48),
    name: z.string().trim().min(1).max(160),
    origin: z.string().trim().min(1).max(240),
    destination: z.string().trim().min(1).max(240),
    loadedDistanceKm: nonNegativeDecimal,
    emptyReturnDistanceKm: nonNegativeDecimal.nullable().default(null),
    contractualDmtKm: nonNegativeDecimal.nullable().default(null),
    contractualBand: z.string().trim().max(80).nullable().default(null),
    effectiveFrom,
  })
  .strict();

export const updateHaulRouteSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    origin: z.string().trim().min(1).max(240),
    destination: z.string().trim().min(1).max(240),
    isActive: z.boolean(),
  })
  .strict();

export const createHaulRouteRevisionSchema = z
  .object({
    loadedDistanceKm: nonNegativeDecimal,
    emptyReturnDistanceKm: nonNegativeDecimal.nullable().default(null),
    contractualDmtKm: nonNegativeDecimal.nullable().default(null),
    contractualBand: z.string().trim().max(80).nullable().default(null),
    effectiveFrom,
  })
  .strict();

export type EarthworkCatalogListQuery = z.infer<
  typeof earthworkCatalogListQuerySchema
>;
export type CreateEarthworkMaterial = z.infer<
  typeof createEarthworkMaterialSchema
>;
export type UpdateEarthworkMaterial = z.infer<
  typeof updateEarthworkMaterialSchema
>;
export type CreateEarthworkMaterialRevision = z.infer<
  typeof createEarthworkMaterialRevisionSchema
>;
export type CreateHaulRoute = z.infer<typeof createHaulRouteSchema>;
export type UpdateHaulRoute = z.infer<typeof updateHaulRouteSchema>;
export type CreateHaulRouteRevision = z.infer<
  typeof createHaulRouteRevisionSchema
>;

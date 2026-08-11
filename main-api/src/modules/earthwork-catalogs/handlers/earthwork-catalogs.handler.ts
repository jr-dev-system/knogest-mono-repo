import type { HandlerContext } from "../../../lib/utils/handler.dto";
import {
  invalidCursorError,
  type CursorBoundary,
  type SortDirection,
} from "../../../lib/utils/cursor-pagination";
import type {
  CreateEarthworkMaterial,
  CreateEarthworkMaterialRevision,
  CreateHaulRoute,
  CreateHaulRouteRevision,
  UpdateEarthworkMaterial,
  UpdateHaulRoute,
} from "../earthwork-catalogs.dto";

export type EarthworkCatalogScope = {
  corporationId: string;
  companyId: string;
  actorUserId: string;
};

function scopeWhere(scope: EarthworkCatalogScope, projectId: string) {
  return {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
    projectId,
  };
}

export async function findEarthworkCatalogProjectHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
) {
  return context.prisma.project.findFirst({
    where: {
      id: projectId,
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
}

export async function listEarthworkMaterialsHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  input: {
    boundary: CursorBoundary | null;
    limit: number;
    search?: string;
    active?: boolean;
    sortDirection: SortDirection;
  },
) {
  return context.prisma.projectEarthworkMaterial.findMany({
    where: {
      ...scopeWhere(scope, projectId),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { code: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(input.active === undefined ? {} : { isActive: input.active }),
      ...catalogBoundary(input.boundary, input.sortDirection),
    },
    orderBy: [{ name: input.sortDirection }, { id: input.sortDirection }],
    take: input.limit + 1,
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
}

export async function findEarthworkMaterialByCodeHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  code: string,
) {
  return context.prisma.projectEarthworkMaterial.findFirst({
    where: { ...scopeWhere(scope, projectId), code },
    select: { id: true },
  });
}

export async function createEarthworkMaterialHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  input: CreateEarthworkMaterial,
) {
  return context.prisma.projectEarthworkMaterial.create({
    data: {
      ...scopeWhere(scope, projectId),
      code: input.code,
      name: input.name,
      classification: input.classification,
      category: input.category,
      revisions: {
        create: {
          revision: 1,
          densityTPerM3: input.densityTPerM3,
          swellFactor: input.swellFactor,
          looseToCompactedFactor: input.looseToCompactedFactor,
          effectiveFrom: new Date(input.effectiveFrom),
        },
      },
    },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
}

export async function updateEarthworkMaterialHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  materialId: string,
  input: UpdateEarthworkMaterial,
) {
  const result = await context.prisma.projectEarthworkMaterial.updateMany({
    where: { id: materialId, ...scopeWhere(scope, projectId) },
    data: input,
  });
  if (!result.count) return null;
  return context.prisma.projectEarthworkMaterial.findUnique({
    where: { id: materialId },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
}

export async function createEarthworkMaterialRevisionHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  materialId: string,
  input: CreateEarthworkMaterialRevision,
) {
  const material = await context.prisma.projectEarthworkMaterial.findFirst({
    where: { id: materialId, ...scopeWhere(scope, projectId) },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
  if (!material) return null;
  const current = material.revisions[0];
  const effectiveFrom = new Date(input.effectiveFrom);
  if (current && effectiveFrom <= current.effectiveFrom)
    return { conflict: true as const };
  if (current && (!current.effectiveTo || current.effectiveTo > effectiveFrom))
    await context.prisma.projectEarthworkMaterialRevision.update({
      where: { id: current.id },
      data: { effectiveTo: effectiveFrom },
    });
  const revision = await context.prisma.projectEarthworkMaterialRevision.create(
    {
      data: {
        materialId,
        revision: (current?.revision ?? 0) + 1,
        densityTPerM3: input.densityTPerM3,
        swellFactor: input.swellFactor,
        looseToCompactedFactor: input.looseToCompactedFactor,
        effectiveFrom,
      },
    },
  );
  return { conflict: false as const, revision };
}

export async function listHaulRoutesHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  input: {
    boundary: CursorBoundary | null;
    limit: number;
    search?: string;
    active?: boolean;
    sortDirection: SortDirection;
  },
) {
  return context.prisma.projectHaulRoute.findMany({
    where: {
      ...scopeWhere(scope, projectId),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { code: { contains: input.search, mode: "insensitive" } },
              { origin: { contains: input.search, mode: "insensitive" } },
              { destination: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(input.active === undefined ? {} : { isActive: input.active }),
      ...catalogBoundary(input.boundary, input.sortDirection),
    },
    orderBy: [{ name: input.sortDirection }, { id: input.sortDirection }],
    take: input.limit + 1,
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
}

export async function findHaulRouteByCodeHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  code: string,
) {
  return context.prisma.projectHaulRoute.findFirst({
    where: { ...scopeWhere(scope, projectId), code },
    select: { id: true },
  });
}

export async function createHaulRouteHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  input: CreateHaulRoute,
) {
  return context.prisma.projectHaulRoute.create({
    data: {
      ...scopeWhere(scope, projectId),
      code: input.code,
      name: input.name,
      origin: input.origin,
      destination: input.destination,
      revisions: {
        create: {
          revision: 1,
          loadedDistanceKm: input.loadedDistanceKm,
          emptyReturnDistanceKm: input.emptyReturnDistanceKm,
          contractualDmtKm: input.contractualDmtKm,
          contractualBand: input.contractualBand,
          effectiveFrom: new Date(input.effectiveFrom),
        },
      },
    },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
}

export async function updateHaulRouteHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  routeId: string,
  input: UpdateHaulRoute,
) {
  const result = await context.prisma.projectHaulRoute.updateMany({
    where: { id: routeId, ...scopeWhere(scope, projectId) },
    data: input,
  });
  if (!result.count) return null;
  return context.prisma.projectHaulRoute.findUnique({
    where: { id: routeId },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
}

export async function createHaulRouteRevisionHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  routeId: string,
  input: CreateHaulRouteRevision,
) {
  const route = await context.prisma.projectHaulRoute.findFirst({
    where: { id: routeId, ...scopeWhere(scope, projectId) },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
  if (!route) return null;
  const current = route.revisions[0];
  const effectiveFrom = new Date(input.effectiveFrom);
  if (current && effectiveFrom <= current.effectiveFrom)
    return { conflict: true as const };
  if (current && (!current.effectiveTo || current.effectiveTo > effectiveFrom))
    await context.prisma.projectHaulRouteRevision.update({
      where: { id: current.id },
      data: { effectiveTo: effectiveFrom },
    });
  const revision = await context.prisma.projectHaulRouteRevision.create({
    data: {
      routeId,
      revision: (current?.revision ?? 0) + 1,
      loadedDistanceKm: input.loadedDistanceKm,
      emptyReturnDistanceKm: input.emptyReturnDistanceKm,
      contractualDmtKm: input.contractualDmtKm,
      contractualBand: input.contractualBand,
      effectiveFrom,
    },
  });
  return { conflict: false as const, revision };
}

export async function listEarthworkServiceDefinitionsHandler(
  context: HandlerContext,
) {
  return context.prisma.earthworkServiceDefinition.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    take: 100,
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
}

export async function findEarthworkMaterialRevisionForProductionHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  revisionId: string,
  occurredAt: Date,
) {
  return context.prisma.projectEarthworkMaterialRevision.findFirst({
    where: {
      id: revisionId,
      effectiveFrom: { lte: occurredAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }],
      material: {
        ...scopeWhere(scope, projectId),
        isActive: true,
      },
    },
    include: { material: true },
  });
}

export async function findHaulRouteRevisionForProductionHandler(
  context: HandlerContext,
  scope: EarthworkCatalogScope,
  projectId: string,
  revisionId: string,
  occurredAt: Date,
) {
  return context.prisma.projectHaulRouteRevision.findFirst({
    where: {
      id: revisionId,
      effectiveFrom: { lte: occurredAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }],
      route: {
        ...scopeWhere(scope, projectId),
        isActive: true,
      },
    },
    include: { route: true },
  });
}

function catalogBoundary(
  boundary: CursorBoundary | null,
  direction: SortDirection,
) {
  if (!boundary) return {};
  if (typeof boundary.value !== "string") throw invalidCursorError();
  const operator = direction === "asc" ? "gt" : "lt";
  return {
    OR: [
      { name: { [operator]: boundary.value } },
      { name: boundary.value, id: { [operator]: boundary.id } },
    ],
  };
}

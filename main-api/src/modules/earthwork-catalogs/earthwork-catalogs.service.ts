import { AppError } from "../../lib/utils/appError";
import {
  buildCursorPage,
  parseBoundCursor,
} from "../../lib/utils/cursor-pagination";
import type { HandlerContext } from "../../lib/utils/handler.dto";
import type {
  CreateEarthworkMaterial,
  CreateEarthworkMaterialRevision,
  CreateHaulRoute,
  CreateHaulRouteRevision,
  EarthworkCatalogListQuery,
  UpdateEarthworkMaterial,
  UpdateHaulRoute,
} from "./earthwork-catalogs.dto";
import {
  createEarthworkMaterialHandler,
  createEarthworkMaterialRevisionHandler,
  createHaulRouteHandler,
  createHaulRouteRevisionHandler,
  findEarthworkCatalogProjectHandler,
  findEarthworkMaterialByCodeHandler,
  findHaulRouteByCodeHandler,
  listEarthworkMaterialsHandler,
  listEarthworkServiceDefinitionsHandler,
  listHaulRoutesHandler,
  updateEarthworkMaterialHandler,
  updateHaulRouteHandler,
  type EarthworkCatalogScope,
} from "./handlers/earthwork-catalogs.handler";

export class EarthworkCatalogsService {
  constructor(private readonly context: HandlerContext) {}

  async listMaterials(
    scope: EarthworkCatalogScope,
    projectId: string,
    query: EarthworkCatalogListQuery,
  ) {
    await this.assertProject(scope, projectId);
    return this.listCatalog(
      scope,
      projectId,
      query,
      "project-earthwork-materials",
      listEarthworkMaterialsHandler,
      materialDto,
    );
  }

  async createMaterial(
    scope: EarthworkCatalogScope,
    projectId: string,
    input: CreateEarthworkMaterial,
  ) {
    return this.context.transaction(async (transactionContext) => {
      await this.assertProject(scope, projectId, transactionContext);
      if (
        await findEarthworkMaterialByCodeHandler(
          transactionContext,
          scope,
          projectId,
          input.code,
        )
      )
        throw catalogConflict("material-code");
      return materialDto(
        await createEarthworkMaterialHandler(
          transactionContext,
          scope,
          projectId,
          input,
        ),
      );
    });
  }

  async updateMaterial(
    scope: EarthworkCatalogScope,
    projectId: string,
    materialId: string,
    input: UpdateEarthworkMaterial,
  ) {
    const record = await updateEarthworkMaterialHandler(
      this.context,
      scope,
      projectId,
      materialId,
      input,
    );
    if (!record) throw notFound();
    return materialDto(record);
  }

  async reviseMaterial(
    scope: EarthworkCatalogScope,
    projectId: string,
    materialId: string,
    input: CreateEarthworkMaterialRevision,
  ) {
    const result = await this.context.transaction((transactionContext) =>
      createEarthworkMaterialRevisionHandler(
        transactionContext,
        scope,
        projectId,
        materialId,
        input,
      ),
    );
    if (!result) throw notFound();
    if (result.conflict) throw catalogConflict("material-effective-period");
    return revisionDto(result.revision);
  }

  async listRoutes(
    scope: EarthworkCatalogScope,
    projectId: string,
    query: EarthworkCatalogListQuery,
  ) {
    await this.assertProject(scope, projectId);
    return this.listCatalog(
      scope,
      projectId,
      query,
      "project-haul-routes",
      listHaulRoutesHandler,
      routeDto,
    );
  }

  async createRoute(
    scope: EarthworkCatalogScope,
    projectId: string,
    input: CreateHaulRoute,
  ) {
    return this.context.transaction(async (transactionContext) => {
      await this.assertProject(scope, projectId, transactionContext);
      if (
        await findHaulRouteByCodeHandler(
          transactionContext,
          scope,
          projectId,
          input.code,
        )
      )
        throw catalogConflict("route-code");
      return routeDto(
        await createHaulRouteHandler(
          transactionContext,
          scope,
          projectId,
          input,
        ),
      );
    });
  }

  async updateRoute(
    scope: EarthworkCatalogScope,
    projectId: string,
    routeId: string,
    input: UpdateHaulRoute,
  ) {
    const record = await updateHaulRouteHandler(
      this.context,
      scope,
      projectId,
      routeId,
      input,
    );
    if (!record) throw notFound();
    return routeDto(record);
  }

  async reviseRoute(
    scope: EarthworkCatalogScope,
    projectId: string,
    routeId: string,
    input: CreateHaulRouteRevision,
  ) {
    const result = await this.context.transaction((transactionContext) =>
      createHaulRouteRevisionHandler(
        transactionContext,
        scope,
        projectId,
        routeId,
        input,
      ),
    );
    if (!result) throw notFound();
    if (result.conflict) throw catalogConflict("route-effective-period");
    return routeRevisionDto(result.revision);
  }

  async serviceDefinitions() {
    const definitions = await listEarthworkServiceDefinitionsHandler(
      this.context,
    );
    return definitions.map((definition) => ({
      id: definition.id,
      code: definition.code,
      name: definition.name,
      revision: definition.revisions[0]
        ? serviceRevisionDto(definition.revisions[0])
        : null,
    }));
  }

  private async listCatalog<T extends { id: string; name: string }, R>(
    scope: EarthworkCatalogScope,
    projectId: string,
    query: EarthworkCatalogListQuery,
    resource: string,
    handler: (
      context: HandlerContext,
      scope: EarthworkCatalogScope,
      projectId: string,
      input: {
        boundary: ReturnType<typeof parseBoundCursor>;
        limit: number;
        search?: string;
        active?: boolean;
        sortDirection: "asc" | "desc";
      },
    ) => Promise<T[]>,
    dto: (record: T) => R,
  ) {
    const normalizedQuery = {
      search: query.search ?? null,
      active: query.active ?? null,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    };
    const cursorScope = { ...scope, actorUserId: undefined, projectId };
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      query: normalizedQuery,
      resource,
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const records = await handler(this.context, scope, projectId, {
      boundary,
      limit: query.limit,
      search: query.search,
      active: query.active,
      sortDirection: query.sortDirection,
    });
    const page = buildCursorPage({
      items: records,
      limit: query.limit,
      query: normalizedQuery,
      resource,
      scope: cursorScope,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (item) => ({ id: item.id, value: item.name }),
    });
    return { data: page.data.map(dto), pageInfo: page.pageInfo };
  }

  private async assertProject(
    scope: EarthworkCatalogScope,
    projectId: string,
    context = this.context,
  ) {
    if (!(await findEarthworkCatalogProjectHandler(context, scope, projectId)))
      throw new AppError({
        code: "PRODUCTION_PROJECT_UNAVAILABLE",
        message: "Project is unavailable for earthwork production",
        statusCode: 409,
      });
  }
}

function materialDto(record: {
  id: string;
  code: string;
  name: string;
  classification: string | null;
  category: string | null;
  isActive: boolean;
  revisions: Array<{
    id: string;
    revision: number;
    densityTPerM3: { toFixed(digits: number): string } | null;
    swellFactor: { toFixed(digits: number): string } | null;
    looseToCompactedFactor: { toFixed(digits: number): string } | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>;
}) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    classification: record.classification,
    category: record.category,
    isActive: record.isActive,
    revision: record.revisions[0] ? revisionDto(record.revisions[0]) : null,
  };
}

function routeDto(record: {
  id: string;
  code: string;
  name: string;
  origin: string;
  destination: string;
  isActive: boolean;
  revisions: Array<{
    id: string;
    revision: number;
    loadedDistanceKm: { toFixed(digits: number): string };
    emptyReturnDistanceKm: { toFixed(digits: number): string } | null;
    contractualDmtKm: { toFixed(digits: number): string } | null;
    contractualBand: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>;
}) {
  const revision = record.revisions[0];
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    origin: record.origin,
    destination: record.destination,
    isActive: record.isActive,
    revision: revision
      ? {
          id: revision.id,
          revision: revision.revision,
          loadedDistanceKm: revision.loadedDistanceKm.toFixed(3),
          emptyReturnDistanceKm:
            revision.emptyReturnDistanceKm?.toFixed(3) ?? null,
          contractualDmtKm: revision.contractualDmtKm?.toFixed(3) ?? null,
          contractualBand: revision.contractualBand,
          effectiveFrom: revision.effectiveFrom.toISOString(),
          effectiveTo: revision.effectiveTo?.toISOString() ?? null,
        }
      : null,
  };
}

function revisionDto(revision: {
  id: string;
  revision: number;
  densityTPerM3: { toFixed(digits: number): string } | null;
  swellFactor: { toFixed(digits: number): string } | null;
  looseToCompactedFactor: { toFixed(digits: number): string } | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}) {
  return {
    id: revision.id,
    revision: revision.revision,
    densityTPerM3: revision.densityTPerM3?.toFixed(6) ?? null,
    swellFactor: revision.swellFactor?.toFixed(6) ?? null,
    looseToCompactedFactor: revision.looseToCompactedFactor?.toFixed(6) ?? null,
    effectiveFrom: revision.effectiveFrom.toISOString(),
    effectiveTo: revision.effectiveTo?.toISOString() ?? null,
  };
}

function serviceRevisionDto(revision: {
  id: string;
  revision: number;
  unitCode: string;
  productionProfile: string;
  dmtPolicy: string;
  fieldPolicy: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}) {
  return {
    id: revision.id,
    revision: revision.revision,
    unitCode: revision.unitCode,
    productionProfile: revision.productionProfile.toLowerCase(),
    dmtPolicy: revision.dmtPolicy.toLowerCase(),
    fieldPolicy: revision.fieldPolicy,
    effectiveFrom: revision.effectiveFrom.toISOString(),
    effectiveTo: revision.effectiveTo?.toISOString() ?? null,
  };
}

function routeRevisionDto(revision: {
  id: string;
  revision: number;
  loadedDistanceKm: { toFixed(digits: number): string };
  emptyReturnDistanceKm: { toFixed(digits: number): string } | null;
  contractualDmtKm: { toFixed(digits: number): string } | null;
  contractualBand: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}) {
  return {
    id: revision.id,
    revision: revision.revision,
    loadedDistanceKm: revision.loadedDistanceKm.toFixed(3),
    emptyReturnDistanceKm: revision.emptyReturnDistanceKm?.toFixed(3) ?? null,
    contractualDmtKm: revision.contractualDmtKm?.toFixed(3) ?? null,
    contractualBand: revision.contractualBand,
    effectiveFrom: revision.effectiveFrom.toISOString(),
    effectiveTo: revision.effectiveTo?.toISOString() ?? null,
  };
}

function catalogConflict(resource: string) {
  return new AppError({
    code: "PRODUCTION_CATALOG_CONFLICT",
    message: "Earthwork catalog entry conflicts with existing history",
    statusCode: 409,
    data: { resource },
  });
}

function notFound() {
  return new AppError({
    code: "NOT_FOUND",
    message: "Not found",
    statusCode: 404,
  });
}

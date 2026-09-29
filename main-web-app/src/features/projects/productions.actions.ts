"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { deleteApiV1ProjectsProjectidProductionsProductionidTripsTripid } from "@/generated/clients/deleteApiV1ProjectsProjectidProductionsProductionidTripsTripid";
import { getApiV1ProjectsProjectidDailyReportsReportidProductions } from "@/generated/clients/getApiV1ProjectsProjectidDailyReportsReportidProductions";
import { getApiV1ProjectsProjectidEarthworkMaterials } from "@/generated/clients/getApiV1ProjectsProjectidEarthworkMaterials";
import { getApiV1ProjectsProjectidHaulRoutes } from "@/generated/clients/getApiV1ProjectsProjectidHaulRoutes";
import { getApiV1ProjectsProjectidProductions } from "@/generated/clients/getApiV1ProjectsProjectidProductions";
import { getApiV1ProjectsProjectidProductionsOptions } from "@/generated/clients/getApiV1ProjectsProjectidProductionsOptions";
import { getApiV1ProjectsProjectidProductionsTruckOptions } from "@/generated/clients/getApiV1ProjectsProjectidProductionsTruckOptions";
import { getApiV1ProjectsProjectidProductionsProductionid } from "@/generated/clients/getApiV1ProjectsProjectidProductionsProductionid";
import { postApiV1ProjectsProjectidDailyReportsReportidProductionsConfirm } from "@/generated/clients/postApiV1ProjectsProjectidDailyReportsReportidProductionsConfirm";
import { postApiV1ProjectsProjectidEarthworkMaterials } from "@/generated/clients/postApiV1ProjectsProjectidEarthworkMaterials";
import { postApiV1ProjectsProjectidHaulRoutes } from "@/generated/clients/postApiV1ProjectsProjectidHaulRoutes";
import { postApiV1ProjectsProjectidProductions } from "@/generated/clients/postApiV1ProjectsProjectidProductions";
import { postApiV1ProjectsProjectidProductionsCutFillPair } from "@/generated/clients/postApiV1ProjectsProjectidProductionsCutFillPair";
import { postApiV1ProjectsProjectidProductionsProductionidApprove } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidApprove";
import { postApiV1ProjectsProjectidProductionsProductionidCheck } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidCheck";
import { postApiV1ProjectsProjectidProductionsProductionidQualityChecks } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidQualityChecks";
import { postApiV1ProjectsProjectidProductionsProductionidReject } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidReject";
import { postApiV1ProjectsProjectidProductionsProductionidRelease } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidRelease";
import { postApiV1ProjectsProjectidProductionsProductionidReopen } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidReopen";
import { postApiV1ProjectsProjectidProductionsProductionidSubmit } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidSubmit";
import { postApiV1ProjectsProjectidProductionsProductionidTrips } from "@/generated/clients/postApiV1ProjectsProjectidProductionsProductionidTrips";
import { putApiV1ProjectsProjectidProductionsProductionid } from "@/generated/clients/putApiV1ProjectsProjectidProductionsProductionid";
import { ApiClientError } from "@/lib/api/api-client-error";

import type {
  ProjectDailyReportProductionSummary,
  EarthworkCatalogPage,
  EarthworkMaterialOption,
  HaulRouteOption,
  ProjectProductionCommand,
  ProjectProductionDetail,
  ProjectProductionMutationResult,
  ProjectProductionOptions,
  ProjectProductionPairCommand,
  ProjectProductionTruckOptionsPage,
} from "./productions.types";

export async function getEarthworkCatalogOptionsAction(input: {
  projectId: string;
  search?: string;
}) {
  const projectId = uuid.parse(input.projectId);
  const params = {
    limit: 100,
    search: input.search,
    active: true,
    sortBy: "name" as const,
    sortDirection: "asc" as const,
  };
  const [materials, routes] = await Promise.all([
    getApiV1ProjectsProjectidEarthworkMaterials({ projectId, params }),
    getApiV1ProjectsProjectidHaulRoutes({ projectId, params }),
  ]);
  return {
    materials: materials.data as EarthworkCatalogPage<EarthworkMaterialOption>,
    routes: routes.data as EarthworkCatalogPage<HaulRouteOption>,
  };
}

export async function createEarthworkMaterialAction(input: {
  projectId: string;
  code: string;
  name: string;
  classification?: string;
  category?: string;
  densityTPerM3?: string;
  swellFactor?: string;
  looseToCompactedFactor?: string;
  effectiveFrom: string;
}) {
  const response = await postApiV1ProjectsProjectidEarthworkMaterials({
    projectId: uuid.parse(input.projectId),
    data: {
      code: input.code,
      name: input.name,
      classification: input.classification,
      category: input.category,
      densityTPerM3: input.densityTPerM3,
      swellFactor: input.swellFactor,
      looseToCompactedFactor: input.looseToCompactedFactor,
      effectiveFrom: z.iso
        .datetime({ offset: true })
        .parse(input.effectiveFrom),
    },
  });
  return response.data as EarthworkMaterialOption;
}

export async function createHaulRouteAction(input: {
  projectId: string;
  code: string;
  name: string;
  origin: string;
  destination: string;
  loadedDistanceKm: string;
  emptyReturnDistanceKm?: string;
  contractualDmtKm?: string;
  contractualBand?: string;
  effectiveFrom: string;
}) {
  const response = await postApiV1ProjectsProjectidHaulRoutes({
    projectId: uuid.parse(input.projectId),
    data: {
      code: input.code,
      name: input.name,
      origin: input.origin,
      destination: input.destination,
      loadedDistanceKm: input.loadedDistanceKm,
      emptyReturnDistanceKm: input.emptyReturnDistanceKm,
      contractualDmtKm: input.contractualDmtKm,
      contractualBand: input.contractualBand,
      effectiveFrom: z.iso
        .datetime({ offset: true })
        .parse(input.effectiveFrom),
    },
  });
  return response.data as HaulRouteOption;
}

const uuid = z.string().uuid();

export async function getProjectProductionOptionsAction(input: {
  projectId: string;
  productionDate: string;
  shift: "day" | "night";
}): Promise<ProjectProductionOptions> {
  const response = await getApiV1ProjectsProjectidProductionsOptions({
    projectId: uuid.parse(input.projectId),
    params: {
      productionDate: z.iso.date().parse(input.productionDate),
      shift: input.shift,
    },
  });
  return response.data as ProjectProductionOptions;
}

export async function getProjectProductionTruckOptionsAction(input: {
  projectId: string;
  productionDate: string;
  shift: "day" | "night";
  cursor?: string;
}): Promise<ProjectProductionTruckOptionsPage> {
  const response = await getApiV1ProjectsProjectidProductionsTruckOptions({
    projectId: uuid.parse(input.projectId),
    params: {
      productionDate: z.iso.date().parse(input.productionDate),
      shift: input.shift,
      limit: 25,
      cursor: input.cursor
        ? z.string().min(1).max(2048).parse(input.cursor)
        : undefined,
    },
  });
  return response.data;
}

export async function getProjectProductionAction(
  projectId: string,
  productionId: string,
): Promise<ProjectProductionDetail> {
  const response = await getApiV1ProjectsProjectidProductionsProductionid({
    projectId: uuid.parse(projectId),
    productionId: uuid.parse(productionId),
  });
  return response.data as ProjectProductionDetail;
}

export async function getMoreProjectProductionsAction(
  projectId: string,
  cursor: string,
) {
  const response = await getApiV1ProjectsProjectidProductions({
    projectId: uuid.parse(projectId),
    params: {
      cursor: z.string().min(1).max(2048).parse(cursor),
      limit: 25,
      sortBy: "productionDate",
      sortDirection: "desc",
    },
  });
  return response.data;
}

export async function getShiftProjectProductionsAction(input: {
  projectId: string;
  productionDate: string;
  shift: "day" | "night";
}) {
  const projectId = uuid.parse(input.projectId);
  const productionDate = z.iso.date().parse(input.productionDate);
  let cursor: string | undefined;
  let page:
    | Awaited<ReturnType<typeof getApiV1ProjectsProjectidProductions>>["data"]
    | undefined;
  const data: NonNullable<typeof page>["data"] = [];
  do {
    const response = await getApiV1ProjectsProjectidProductions({
      projectId,
      params: {
        productionDate,
        shift: input.shift,
        limit: 100,
        cursor,
        sortBy: "productionDate",
        sortDirection: "asc",
      },
    });
    page = response.data;
    data.push(...page.data);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return {
    ...page!,
    data,
    pageInfo: { hasNextPage: false, nextCursor: null },
  };
}

export async function saveProjectProductionAction(input: {
  projectId: string;
  productionId?: string;
  command: ProjectProductionCommand;
}): Promise<ProjectProductionMutationResult> {
  const projectId = uuid.parse(input.projectId);
  try {
    const response = input.productionId
      ? await putApiV1ProjectsProjectidProductionsProductionid({
          projectId,
          productionId: uuid.parse(input.productionId),
          data: input.command,
        })
      : await postApiV1ProjectsProjectidProductions({
          projectId,
          data: input.command,
        });
    revalidate(projectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function saveProjectProductionPairAction(input: {
  projectId: string;
  command: ProjectProductionPairCommand;
}): Promise<
  | {
      kind: "success";
      productions: {
        cut: ProjectProductionDetail;
        fill: ProjectProductionDetail;
      };
    }
  | Exclude<ProjectProductionMutationResult, { kind: "success" }>
> {
  const projectId = uuid.parse(input.projectId);
  try {
    const response = await postApiV1ProjectsProjectidProductionsCutFillPair({
      projectId,
      data: input.command,
    });
    revalidate(projectId);
    return {
      kind: "success",
      productions: response.data as {
        cut: ProjectProductionDetail;
        fill: ProjectProductionDetail;
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function approveProjectProductionAction(
  projectId: string,
  productionId: string,
  expectedRevision: number,
): Promise<ProjectProductionMutationResult> {
  const parsedProjectId = uuid.parse(projectId);
  try {
    const response =
      await postApiV1ProjectsProjectidProductionsProductionidApprove({
        projectId: parsedProjectId,
        productionId: uuid.parse(productionId),
        data: { expectedRevision },
      });
    revalidate(parsedProjectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function transitionProjectProductionAction(input: {
  projectId: string;
  productionId: string;
  expectedRevision: number;
  transition: "submit" | "check" | "approve" | "release";
  reason?: string;
}): Promise<ProjectProductionMutationResult> {
  const projectId = uuid.parse(input.projectId);
  const productionId = uuid.parse(input.productionId);
  try {
    const response =
      input.transition === "submit"
        ? await postApiV1ProjectsProjectidProductionsProductionidSubmit({
            projectId,
            productionId,
            data: { expectedRevision: input.expectedRevision },
          })
        : input.transition === "check"
          ? await postApiV1ProjectsProjectidProductionsProductionidCheck({
              projectId,
              productionId,
              data: { expectedRevision: input.expectedRevision },
            })
          : input.transition === "approve"
            ? await postApiV1ProjectsProjectidProductionsProductionidApprove({
                projectId,
                productionId,
                data: { expectedRevision: input.expectedRevision },
              })
            : await postApiV1ProjectsProjectidProductionsProductionidRelease({
                projectId,
                productionId,
                data: {
                  expectedRevision: input.expectedRevision,
                  reason: input.reason,
                },
              });
    revalidate(projectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function rejectProjectProductionAction(input: {
  projectId: string;
  productionId: string;
  expectedRevision: number;
  reason: string;
}): Promise<ProjectProductionMutationResult> {
  const projectId = uuid.parse(input.projectId);
  try {
    const response =
      await postApiV1ProjectsProjectidProductionsProductionidReject({
        projectId,
        productionId: uuid.parse(input.productionId),
        data: {
          expectedRevision: input.expectedRevision,
          reason: z.string().trim().min(3).max(500).parse(input.reason),
        },
      });
    revalidate(projectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function recordProjectProductionQualityAction(input: {
  projectId: string;
  productionId: string;
  expectedRevision: number;
  type:
    | "field_inspection"
    | "topography"
    | "density"
    | "proctor"
    | "compaction"
    | "moisture"
    | "finishing";
  status: "pending" | "accepted" | "rejected";
  value?: string;
  unitCode?: string;
  notes?: string;
}): Promise<ProjectProductionMutationResult> {
  const projectId = uuid.parse(input.projectId);
  try {
    const response =
      await postApiV1ProjectsProjectidProductionsProductionidQualityChecks({
        projectId,
        productionId: uuid.parse(input.productionId),
        data: {
          expectedRevision: input.expectedRevision,
          type: input.type,
          status: input.status,
          value: input.value,
          unitCode: input.unitCode,
          notes: input.notes,
          evidence: [],
        },
      });
    revalidate(projectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function reopenProjectProductionAction(input: {
  projectId: string;
  productionId: string;
  expectedRevision: number;
  reason: string;
}): Promise<ProjectProductionMutationResult> {
  const projectId = uuid.parse(input.projectId);
  try {
    const response =
      await postApiV1ProjectsProjectidProductionsProductionidReopen({
        projectId,
        productionId: uuid.parse(input.productionId),
        data: {
          expectedRevision: input.expectedRevision,
          reason: z.string().trim().min(3).max(500).parse(input.reason),
        },
      });
    revalidate(projectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function addProjectProductionTripAction(input: {
  projectId: string;
  productionId: string;
  expectedRevision: number;
  productionEquipmentId: string;
  idempotencyKey: string;
  capacityM3?: string;
}): Promise<ProjectProductionMutationResult> {
  const projectId = uuid.parse(input.projectId);
  try {
    const response =
      await postApiV1ProjectsProjectidProductionsProductionidTrips({
        projectId,
        productionId: uuid.parse(input.productionId),
        data: {
          expectedRevision: input.expectedRevision,
          productionEquipmentId: uuid.parse(input.productionEquipmentId),
          idempotencyKey: uuid.parse(input.idempotencyKey),
          capacityM3: input.capacityM3,
        },
      });
    revalidate(projectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function removeProjectProductionTripAction(input: {
  projectId: string;
  productionId: string;
  tripId: string;
  expectedRevision: number;
}): Promise<ProjectProductionMutationResult> {
  const projectId = uuid.parse(input.projectId);
  try {
    const response =
      await deleteApiV1ProjectsProjectidProductionsProductionidTripsTripid({
        projectId,
        productionId: uuid.parse(input.productionId),
        tripId: uuid.parse(input.tripId),
        params: { expectedRevision: input.expectedRevision },
      });
    revalidate(projectId);
    return {
      kind: "success",
      production: response.data as ProjectProductionDetail,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function getDailyReportProductionsAction(
  projectId: string,
  reportId: string,
): Promise<ProjectDailyReportProductionSummary> {
  const response =
    await getApiV1ProjectsProjectidDailyReportsReportidProductions({
      projectId: uuid.parse(projectId),
      reportId: uuid.parse(reportId),
    });
  return response.data as ProjectDailyReportProductionSummary;
}

export async function confirmDailyReportProductionsAction(input: {
  projectId: string;
  reportId: string;
  productionIds: string[];
}): Promise<ProjectDailyReportProductionSummary> {
  const projectId = uuid.parse(input.projectId);
  const response =
    await postApiV1ProjectsProjectidDailyReportsReportidProductionsConfirm({
      projectId,
      reportId: uuid.parse(input.reportId),
      data: { productionIds: input.productionIds.map((id) => uuid.parse(id)) },
    });
  revalidate(projectId);
  return response.data as ProjectDailyReportProductionSummary;
}

function revalidate(projectId: string) {
  revalidatePath(`/home/obras/${projectId}`);
}

function failure(
  error: unknown,
): Extract<ProjectProductionMutationResult, { kind: "failure" }> {
  if (!(error instanceof ApiClientError))
    return {
      kind: "failure",
      code: "PRODUCTION_ACTION_FAILED",
      message: "Não foi possível concluir a operação de produção.",
    };
  const envelope =
    error.data && typeof error.data === "object"
      ? (error.data as Record<string, unknown>)
      : {};
  return {
    kind: "failure",
    code:
      typeof envelope.code === "string"
        ? envelope.code
        : "PRODUCTION_ACTION_FAILED",
    message:
      typeof envelope.message === "string" ? envelope.message : error.message,
    requestId:
      typeof envelope.requestId === "string" ? envelope.requestId : undefined,
    details:
      envelope.details && typeof envelope.details === "object"
        ? (envelope.details as Record<string, unknown>)
        : undefined,
  };
}

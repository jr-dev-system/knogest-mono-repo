"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { postApiV1Projects } from "@/generated/clients/postApiV1Projects";
import { getApiV1ProjectsProjectidTeamCandidates } from "@/generated/clients/getApiV1ProjectsProjectidTeamCandidates";
import { getApiV1ProjectsProjectidTeamMembers } from "@/generated/clients/getApiV1ProjectsProjectidTeamMembers";
import { getApiV1ProjectsProjectidMobilizationMachineOptions } from "@/generated/clients/getApiV1ProjectsProjectidMobilizationMachineOptions";
import { getApiV1ProjectsProjectidMobilizationMachines } from "@/generated/clients/getApiV1ProjectsProjectidMobilizationMachines";
import { getApiV1ProjectsProjectidFrontsFrontidMobilizationOptions } from "@/generated/clients/getApiV1ProjectsProjectidFrontsFrontidMobilizationOptions";
import client, { ApiClientError } from "@/lib/api/server-client";
import { configureZodPortugueseErrors } from "@/lib/zod-locale";
import { projectCommandSchema, type ProjectCommand } from "./projects-schema";
import type {
  EarthworksServiceCode,
  FuelSupplierOption,
  ProjectDetailSnapshot,
  ProjectMobilizationHistoryPage,
  ProjectMachineMobilizationMembersPage,
  ProjectMachineMobilizationOptionsPage,
  ProjectSuppliedItemOffersPage,
  ProjectTeamCandidatesPage,
  ProjectTeamMembersPage,
  ProjectWorkFrontMobilizationOptionsPage,
  SuppliedItemSelectorPage,
} from "./projects.types";

const viaCepSchema = z
  .object({
    erro: z.boolean().optional(),
    logradouro: z.string().optional(),
    bairro: z.string().optional(),
    localidade: z.string().optional(),
    uf: z.string().optional(),
  })
  .passthrough();

const fieldSchema = z.object({ path: z.string(), code: z.string() });
const resourceSchema = z.object({
  kind: z.enum([
    "client",
    "manager",
    "technicalResponsibility",
    "employee",
    "machine",
    "fuelSupplier",
    "fuelType",
    "supplier",
    "suppliedItem",
    "measurementUnit",
    "supplierOffer",
    "workspace",
    "jobRole",
    "workFront",
  ]),
  id: z.string(),
  section: z.enum([
    "identity",
    "accountability",
    "schedule",
    "employees",
    "machines",
    "fuelOffers",
    "materialOffers",
    "supplierOffers",
    "fronts",
  ]),
  reason: z.string(),
});
const detailsSchema = z
  .object({
    fields: z.array(fieldSchema).default([]),
    resources: z.array(resourceSchema).default([]),
  })
  .passthrough();

export type ProjectSubmissionResult =
  | { kind: "success"; projectId: string; status: "planned" }
  | {
      kind: "recoverable-conflict";
      code: string;
      fields: z.infer<typeof fieldSchema>[];
      resources: z.infer<typeof resourceSchema>[];
      requestId?: string;
    }
  | { kind: "unknown-outcome" }
  | { kind: "terminal-failure"; code: string; requestId?: string };

export type ProjectCepLookupResult =
  | {
      kind: "success";
      address: {
        street: string;
        neighborhood: string;
        city: string;
        state: string;
      };
    }
  | { kind: "failure"; message: string };

const readinessDecimal = (scale: number) => {
  const pattern = new RegExp(`^\\d{1,16}\\.\\d{${scale}}$`, "u");
  return z.string().regex(pattern);
};

const earthworksServiceCodeSchema = z.enum([
  "cut",
  "fill",
  "finishing",
  "top_soil",
  "unsuitable_soil_removal",
  "replacement_fill",
]);
const quantityUnitSchema = z.enum(["M3", "M2", "M3_KM"]);
const frontServiceSchema = z.object({
  serviceCode: earthworksServiceCodeSchema,
  unitCode: quantityUnitSchema,
  quantity: readinessDecimal(3),
});
const quantityBaselineActionSchema = z.object({
  reason: z.string().max(240).nullable().optional(),
  items: z
    .array(
      z.object({
        serviceCode: earthworksServiceCodeSchema,
        unitCode: quantityUnitSchema,
        total: readinessDecimal(3),
      }),
    )
    .min(1)
    .max(20),
});
const workFrontActionSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    location: z.string().trim().max(240).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    plannedStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable()
      .optional(),
    plannedEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable()
      .optional(),
    requiresEmployees: z.boolean(),
    requiresMachines: z.boolean(),
    services: z.array(frontServiceSchema).min(1).max(20),
  })
  .refine((value) => value.requiresEmployees || value.requiresMachines, {
    path: ["requiresEmployees"],
    message: "Selecione ao menos uma exigência de mobilização.",
  });

const workFrontServicesActionSchema = z.object({
  services: z.array(frontServiceSchema).max(20),
});

const workFrontMobilizationActionSchema = z.object({
  employmentIds: z.array(z.string().uuid()).max(200),
  machineAssignments: z
    .array(
      z.object({
        machineId: z.string().uuid(),
        shift: z.enum(["day", "night"]),
      }),
    )
    .max(200),
  reason: z.string().trim().max(500).nullable().optional(),
});

export type QuantityBaselineActionInput = z.infer<
  typeof quantityBaselineActionSchema
>;
export type WorkFrontActionInput = z.infer<typeof workFrontActionSchema>;
export type WorkFrontServicesActionInput = z.infer<
  typeof workFrontServicesActionSchema
>;
export type WorkFrontMobilizationActionInput = z.infer<
  typeof workFrontMobilizationActionSchema
>;
export type WorkFrontServiceInput = {
  serviceCode: EarthworksServiceCode;
  unitCode: "M3" | "M2" | "M3_KM";
  quantity: string;
};

const projectReadinessActionSchema = z
  .object({
    plannedStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .optional(),
    plannedEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .optional(),
    productionMetricTargets: z
      .array(
        z.object({
          metricCode: z.enum(["cut", "fill", "finishing", "top_soil"]),
          targetTotal: readinessDecimal(3),
        }),
      )
      .min(1)
      .max(4)
      .optional(),
    fuelOffers: z
      .array(
        z.union([
          z.object({
            mode: z.literal("existing").optional(),
            sourceOfferId: z.string().uuid(),
            conversionToBase: readinessDecimal(6).optional(),
            price: readinessDecimal(4),
          }),
          z.object({
            mode: z.enum(["projectOnly", "companyCatalog"]),
            supplierId: z.string().uuid(),
            itemId: z.string().uuid(),
            purchaseUnitId: z.string().uuid(),
            conversionToBase: readinessDecimal(6),
            price: readinessDecimal(4),
          }),
        ]),
      )
      .max(10)
      .optional(),
    materialOffers: z
      .array(
        z.union([
          z.object({
            mode: z.literal("existing").optional(),
            sourceOfferId: z.string().uuid(),
            conversionToBase: readinessDecimal(6).optional(),
            price: readinessDecimal(4),
          }),
          z.object({
            mode: z.enum(["projectOnly", "companyCatalog"]),
            supplierId: z.string().uuid(),
            itemId: z.string().uuid(),
            purchaseUnitId: z.string().uuid(),
            conversionToBase: readinessDecimal(6),
            price: readinessDecimal(4),
          }),
        ]),
      )
      .max(50)
      .optional(),
    accountability: z
      .object({
        clientId: z.string().uuid(),
        managerEmploymentId: z.string().uuid(),
        technicalResponsibilityEmploymentIds: z
          .array(z.string().uuid())
          .min(1)
          .max(20),
      })
      .optional(),
    employeeAllocations: z
      .array(
        z.object({
          employmentId: z.string().uuid(),
          shift: z.enum(["day", "night"]),
          confirmedJobRoleId: z.string().uuid().optional(),
          confirmedJobRolePeriodId: z.string().uuid().nullable().optional(),
          confirmedJobRoleName: z
            .string()
            .min(1)
            .max(120)
            .nullable()
            .optional(),
          monthlyWorkloadHours: z.number().int().min(1).max(744),
          compensationMode: z.enum([
            "daily",
            "hourly",
            "weekly",
            "fortnightly",
            "monthly",
          ]),
          compensationValue: readinessDecimal(2),
          overtimeRate: readinessDecimal(2),
        }),
      )
      .max(200)
      .optional(),
    machineAllocations: z
      .array(
        z.object({
          machineId: z.string().uuid(),
          startMeterReadingId: z.string().uuid(),
          operatorAssignments: z
            .array(
              z.object({
                shift: z.enum(["day", "night"]),
                operatorEmploymentId: z.string().uuid(),
              }),
            )
            .min(0)
            .max(2),
        }),
      )
      .max(100)
      .optional(),
    compensationPaymentTerms: z
      .array(
        z.object({
          compensationMode: z.enum([
            "daily",
            "hourly",
            "weekly",
            "fortnightly",
            "monthly",
          ]),
          daysAfterPeriodEnd: z.number().int().min(0).max(60),
        }),
      )
      .max(5)
      .optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (
      command.plannedStartDate &&
      command.plannedEndDate &&
      command.plannedEndDate < command.plannedStartDate
    )
      context.addIssue({
        code: "custom",
        path: ["plannedEndDate"],
        message: "A data final não pode ser anterior à data inicial.",
      });
  });

export type ProjectReadinessActionInput = z.infer<
  typeof projectReadinessActionSchema
>;

export type ProjectReadinessMutationResult =
  | { kind: "success"; project: ProjectDetailSnapshot }
  | {
      kind: "recoverable-conflict";
      code: string;
      blockers?: { section: string; message: string }[];
      resources?: {
        kind: string;
        id: string;
        section: string;
        reason: string;
      }[];
      message: string;
      requestId?: string;
    }
  | {
      kind: "terminal-failure";
      code: string;
      message: string;
      requestId?: string;
    };

export async function lookupProjectAddressByCepAction(
  postalCode: string,
): Promise<ProjectCepLookupResult> {
  const digits = postalCode.replace(/\D/g, "");
  if (!/^\d{8}$/u.test(digits))
    return { kind: "failure", message: "Informe um CEP com 8 dígitos." };

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok)
      return {
        kind: "failure",
        message: "Não foi possível consultar o CEP agora.",
      };

    const parsed = viaCepSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.erro)
      return { kind: "failure", message: "CEP não encontrado." };

    return {
      kind: "success",
      address: {
        street: parsed.data.logradouro ?? "",
        neighborhood: parsed.data.bairro ?? "",
        city: parsed.data.localidade ?? "",
        state: parsed.data.uf ?? "",
      },
    };
  } catch {
    return {
      kind: "failure",
      message: "Não foi possível consultar o CEP agora.",
    };
  }
}

export async function lookupProjectSuppliedItemsAction(input: {
  categoryId?: string | null;
  cursor?: string | null;
  onlyWithActiveOffers?: boolean;
  search?: string;
  kind: "fuel" | "material";
}): Promise<SuppliedItemSelectorPage> {
  const response = await client<{
    success: true;
    data: SuppliedItemSelectorPage;
  }>({
    url: "/api/v1/supplied-items/selectors/active",
    method: "GET",
    params: {
      limit: 20,
      cursor: input.cursor ?? undefined,
      search: input.search || undefined,
      categoryId: input.categoryId || undefined,
      includeDescendants: true,
      onlyWithActiveOffers: input.onlyWithActiveOffers ?? false,
      kind: input.kind,
    },
  });
  return response.data.data;
}

export async function lookupProjectSuppliedItemOfferSuppliersAction(input: {
  itemId: string;
  search?: string;
  kind: "fuel" | "material";
}): Promise<FuelSupplierOption[]> {
  const response = await client<{
    success: true;
    data: FuelSupplierOption[];
  }>({
    url: `/api/v1/supplied-items/${input.itemId}/offer-suppliers`,
    method: "GET",
    params: {
      limit: 25,
      search: input.search || undefined,
      kind: input.kind,
    },
  });
  return response.data.data;
}

export async function lookupProjectSuppliersAction(input: {
  search?: string;
}): Promise<FuelSupplierOption[]> {
  const response = await client<{
    success: true;
    data: FuelSupplierOption[];
  }>({
    url: "/api/v1/fuel-suppliers/selectors/active",
    method: "GET",
    params: {
      limit: 25,
      search: input.search || undefined,
    },
  });
  return response.data.data;
}

export async function lookupProjectSuppliedItemOffersAction(input: {
  cursor?: string | null;
  itemId: string;
  supplierId?: string | null;
  kind: "fuel" | "material";
}): Promise<ProjectSuppliedItemOffersPage> {
  const response = await client<{
    success: true;
    data: ProjectSuppliedItemOffersPage;
  }>({
    url: `/api/v1/supplied-items/${input.itemId}/offers`,
    method: "GET",
    params: {
      limit: 20,
      cursor: input.cursor ?? undefined,
      supplierId: input.supplierId || undefined,
      kind: input.kind,
    },
  });
  return response.data.data;
}

export async function finalizeProjectAction(input: {
  idempotencyKey: string;
  expectedCompanyId: string;
  command: ProjectCommand;
}): Promise<ProjectSubmissionResult> {
  configureZodPortugueseErrors();
  const key = z.string().uuid().parse(input.idempotencyKey).toLowerCase();
  const expectedCompanyId = z.string().uuid().parse(input.expectedCompanyId);
  const command = projectCommandSchema.parse(input.command);
  try {
    const response = await postApiV1Projects(
      {
        data: command as never,
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
          "x-expected-company-id": expectedCompanyId,
        },
      },
      { skipAuthRefresh: true },
    );
    revalidatePath("/home/obras");
    return {
      kind: "success",
      projectId: response.data.projectId,
      status: response.data.status,
    };
  } catch (error) {
    if (!(error instanceof ApiClientError)) return { kind: "unknown-outcome" };
    const envelope =
      error.data && typeof error.data === "object"
        ? (error.data as Record<string, unknown>)
        : {};
    const code =
      typeof envelope.code === "string"
        ? envelope.code
        : "PROJECT_FINALIZATION_FAILED";
    const requestId =
      typeof envelope.requestId === "string" ? envelope.requestId : undefined;
    const parsedDetails = detailsSchema.safeParse(envelope.details);
    if (
      [
        "PROJECT_RESOURCE_CONFLICT",
        "VALIDATION_ERROR",
        "PROJECT_WIZARD_COLLECTION_LIMIT_EXCEEDED",
      ].includes(code) &&
      parsedDetails.success
    )
      return {
        kind: "recoverable-conflict",
        code,
        fields: parsedDetails.data.fields,
        resources: parsedDetails.data.resources,
        requestId,
      };
    return { kind: "terminal-failure", code, requestId };
  }
}

function parseProjectError(error: unknown): ProjectReadinessMutationResult {
  if (error instanceof z.ZodError)
    return {
      kind: "recoverable-conflict",
      code: "VALIDATION_ERROR",
      message:
        error.issues[0]?.message ??
        "Os dados informados para a obra são inválidos.",
    };
  if (!(error instanceof ApiClientError))
    return {
      kind: "terminal-failure",
      code: "UNKNOWN_ERROR",
      message: "Não foi possível concluir a operação agora.",
    };
  const envelope =
    error.data && typeof error.data === "object"
      ? (error.data as Record<string, unknown>)
      : {};
  const code =
    typeof envelope.code === "string" ? envelope.code : "PROJECT_ACTION_FAILED";
  const message =
    typeof envelope.message === "string"
      ? envelope.message
      : error.message || "Não foi possível concluir a operação agora.";
  const requestId =
    typeof envelope.requestId === "string" ? envelope.requestId : undefined;
  const details =
    envelope.details && typeof envelope.details === "object"
      ? (envelope.details as Record<string, unknown>)
      : {};
  const blockers = Array.isArray(details.blockers)
    ? details.blockers
        .filter(
          (item): item is { section: string; message: string } =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).section === "string" &&
            typeof (item as Record<string, unknown>).message === "string",
        )
        .map((item) => ({ section: item.section, message: item.message }))
    : undefined;
  const resources = Array.isArray(details.resources)
    ? details.resources
        .filter(
          (
            item,
          ): item is {
            kind: string;
            id: string;
            section: string;
            reason: string;
          } =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).kind === "string" &&
            typeof (item as Record<string, unknown>).id === "string" &&
            typeof (item as Record<string, unknown>).section === "string" &&
            typeof (item as Record<string, unknown>).reason === "string",
        )
        .map((item) => ({
          kind: item.kind,
          id: item.id,
          section: item.section,
          reason: item.reason,
        }))
    : undefined;
  if (error.status === 400 || error.status === 409 || error.status === 422)
    return {
      kind: "recoverable-conflict",
      code,
      blockers,
      resources,
      message,
      requestId,
    };
  return { kind: "terminal-failure", code, message, requestId };
}

export async function saveProjectReadinessAction(
  projectId: string,
  input: ProjectReadinessActionInput,
): Promise<ProjectReadinessMutationResult> {
  configureZodPortugueseErrors();
  try {
    const id = z.string().uuid().parse(projectId);
    const command = projectReadinessActionSchema.parse(input);
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/readiness`,
      method: "PUT",
      data: command,
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    revalidatePath("/home/obras");
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function activateProjectAction(
  projectId: string,
): Promise<ProjectReadinessMutationResult> {
  const parsedId = z.string().uuid().safeParse(projectId);
  if (!parsedId.success) return parseProjectError(parsedId.error);
  const id = parsedId.data;
  let project: ProjectDetailSnapshot;
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/activate`,
      method: "POST",
    });
    project = response.data.data;
  } catch (error) {
    return parseProjectError(error);
  }
  try {
    revalidatePath(`/home/obras/${id}`);
    revalidatePath("/home/obras");
  } catch (error) {
    console.error("Project activation cache revalidation failed", error);
  }
  return { kind: "success", project };
}

export async function saveProjectEmployeeMobilizationAction(
  projectId: string,
  allocations: NonNullable<ProjectReadinessActionInput["employeeAllocations"]>,
  schedule?: Pick<
    ProjectCommand,
    "nightShiftEnabled" | "weeklySchedule" | "breakTemplates"
  >,
  shift?: "day" | "night",
): Promise<ProjectReadinessMutationResult> {
  const id = z.string().uuid().parse(projectId);
  const parsed = projectReadinessActionSchema.parse({
    employeeAllocations: allocations,
  }).employeeAllocations!;
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/mobilization/employees${shift ? `/${shift}` : ""}`,
      method: "PUT",
      data: {
        allocations: parsed,
        ...(schedule
          ? {
              weeklySchedule: schedule.weeklySchedule,
              breakTemplates: schedule.breakTemplates,
              nightShiftEnabled: schedule.nightShiftEnabled,
            }
          : {}),
      },
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function getProjectTeamCandidatesAction({
  cursor,
  projectId,
  search,
  shift,
}: {
  cursor?: string | null;
  projectId: string;
  search?: string;
  shift: "day" | "night";
}): Promise<ProjectTeamCandidatesPage> {
  const id = z.string().uuid().parse(projectId);
  const response = await getApiV1ProjectsProjectidTeamCandidates({
    projectId: id,
    params: {
      shift,
      limit: 15,
      search: search?.trim() || undefined,
      cursor: cursor || undefined,
    },
  });
  return response.data;
}

export async function getProjectMachineMobilizationOptionsAction({
  cursor,
  manufacturer,
  model,
  projectId,
  search,
  type,
  version,
}: {
  cursor?: string | null;
  manufacturer?: string;
  model?: string;
  projectId: string;
  search?: string;
  type?: "YELLOW_LINE" | "WHITE_LINE";
  version?: string;
}): Promise<ProjectMachineMobilizationOptionsPage> {
  const id = z.string().uuid().parse(projectId);
  const response = await getApiV1ProjectsProjectidMobilizationMachineOptions({
    projectId: id,
    params: {
      limit: 15,
      cursor: cursor || undefined,
      manufacturer: manufacturer?.trim() || undefined,
      model: model?.trim() || undefined,
      search: search?.trim() || undefined,
      type,
      version: version?.trim() || undefined,
    },
  });
  return response.data;
}

export async function getProjectMachineMobilizationMembersAction({
  cursor,
  projectId,
  search,
}: {
  cursor?: string | null;
  projectId: string;
  search?: string;
}): Promise<ProjectMachineMobilizationMembersPage> {
  const id = z.string().uuid().parse(projectId);
  const response = await getApiV1ProjectsProjectidMobilizationMachines({
    projectId: id,
    params: {
      limit: 15,
      cursor: cursor || undefined,
      search: search?.trim() || undefined,
    },
  });
  return response.data;
}

export async function getProjectTeamMembersAction({
  cursor,
  jobRole,
  projectId,
  search,
  shift,
}: {
  cursor?: string | null;
  jobRole?: string;
  projectId: string;
  search?: string;
  shift: "day" | "night";
}): Promise<ProjectTeamMembersPage> {
  const id = z.string().uuid().parse(projectId);
  const response = await getApiV1ProjectsProjectidTeamMembers({
    projectId: id,
    params: {
      shift,
      limit: 15,
      cursor: cursor || undefined,
      search: search?.trim() || undefined,
      jobRole: jobRole?.trim() || undefined,
    },
  });
  return response.data;
}

export async function getProjectWorkFrontMobilizationOptionsAction({
  cursor,
  frontId,
  projectId,
  resourceType,
  search,
}: {
  cursor?: string | null;
  frontId: string;
  projectId: string;
  resourceType: "employee" | "machine";
  search?: string;
}): Promise<ProjectWorkFrontMobilizationOptionsPage> {
  const ids = z
    .object({ projectId: z.string().uuid(), frontId: z.string().uuid() })
    .parse({ projectId, frontId });
  const response =
    await getApiV1ProjectsProjectidFrontsFrontidMobilizationOptions({
      ...ids,
      params: {
        resourceType,
        search: search?.trim() || undefined,
        limit: 15,
        cursor: cursor || undefined,
      },
    });
  return response.data;
}

export async function saveProjectMachineMobilizationAction(
  projectId: string,
  allocations: NonNullable<ProjectReadinessActionInput["machineAllocations"]>,
): Promise<ProjectReadinessMutationResult> {
  configureZodPortugueseErrors();
  try {
    const id = z.string().uuid().parse(projectId);
    const parsed = projectReadinessActionSchema.parse({
      machineAllocations: allocations,
    }).machineAllocations!;
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/mobilization/machines`,
      method: "PUT",
      data: { allocations: parsed },
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function saveProjectQuantityBaselineAction(
  projectId: string,
  input: QuantityBaselineActionInput,
): Promise<ProjectReadinessMutationResult> {
  const id = z.string().uuid().parse(projectId);
  const command = quantityBaselineActionSchema.parse(input);
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/quantity-baseline-revisions`,
      method: "POST",
      data: command,
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function createProjectWorkFrontAction(
  projectId: string,
  input: WorkFrontActionInput,
): Promise<ProjectReadinessMutationResult> {
  const id = z.string().uuid().parse(projectId);
  const command = workFrontActionSchema.parse(input);
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/fronts`,
      method: "POST",
      data: command,
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function updateProjectWorkFrontAction(
  projectId: string,
  frontId: string,
  input: WorkFrontActionInput,
): Promise<ProjectReadinessMutationResult> {
  const id = z.string().uuid().parse(projectId);
  const front = z.string().uuid().parse(frontId);
  const command = workFrontActionSchema.parse(input);
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/fronts/${front}`,
      method: "PATCH",
      data: command,
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function saveProjectWorkFrontServicesAction(
  projectId: string,
  frontId: string,
  input: WorkFrontServicesActionInput,
): Promise<ProjectReadinessMutationResult> {
  const id = z.string().uuid().parse(projectId);
  const front = z.string().uuid().parse(frontId);
  const command = workFrontServicesActionSchema.parse(input);
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/fronts/${front}/services`,
      method: "PUT",
      data: command,
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function startProjectWorkFrontAction(
  projectId: string,
  frontId: string,
): Promise<ProjectReadinessMutationResult> {
  const id = z.string().uuid().parse(projectId);
  const front = z.string().uuid().parse(frontId);
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/fronts/${front}/start`,
      method: "POST",
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function saveProjectWorkFrontMobilizationAction(
  projectId: string,
  frontId: string,
  input: WorkFrontMobilizationActionInput,
): Promise<ProjectReadinessMutationResult> {
  const id = z.string().uuid().parse(projectId);
  const front = z.string().uuid().parse(frontId);
  const command = workFrontMobilizationActionSchema.parse(input);
  try {
    const response = await client<{
      success: true;
      data: ProjectDetailSnapshot;
    }>({
      url: `/api/v1/projects/${id}/fronts/${front}/mobilization`,
      method: "PUT",
      data: command,
      headers: { "content-type": "application/json" },
    });
    revalidatePath(`/home/obras/${id}`);
    return { kind: "success", project: response.data.data };
  } catch (error) {
    return parseProjectError(error);
  }
}

export async function getProjectMobilizationHistoryAction(input: {
  projectId: string;
  resourceType: "employee" | "machine";
  frontId?: string;
  cursor?: string;
}): Promise<ProjectMobilizationHistoryPage> {
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      resourceType: z.enum(["employee", "machine"]),
      frontId: z.string().uuid().optional(),
      cursor: z.string().max(2048).optional(),
    })
    .parse(input);
  const response = await client<{
    success: true;
    data: ProjectMobilizationHistoryPage;
  }>({
    url: `/api/v1/projects/${parsed.projectId}/mobilization-history`,
    method: "GET",
    params: {
      resourceType: parsed.resourceType,
      frontId: parsed.frontId,
      cursor: parsed.cursor,
      limit: 25,
    },
  });
  return response.data.data;
}

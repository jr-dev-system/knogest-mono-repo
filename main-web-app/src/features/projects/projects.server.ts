import "server-only";
import { getApiV1Clients } from "@/generated/clients/getApiV1Clients";
import { getApiV1Employees } from "@/generated/clients/getApiV1Employees";
import { getApiV1JobRoles } from "@/generated/clients/getApiV1JobRoles";
import { getApiV1Machines } from "@/generated/clients/getApiV1Machines";
import client from "@/lib/api/server-client";

import type {
  ProjectDetailSnapshot,
  ProjectReadinessOptions,
  ProjectRegistryPage,
} from "./projects.types";

export type {
  CompensationMode,
  FuelSupplierOption,
  ProductionMetricCode,
  ProjectDetailSnapshot,
  ProjectEmployeeSummary,
  ProjectLifecycleStatus,
  ProjectOfferSnapshot,
  ProjectOption,
  ProjectReadinessOptions,
  ProjectRegistryPage,
  ProjectSuppliedItemOfferOption,
  ProjectSuppliedItemOffersPage,
  SuppliedItemCategoryOption,
  SuppliedItemSelectorOption,
  SuppliedItemSelectorPage,
  SupplierOfferOption,
} from "./projects.types";

export async function getProjectRegistry(search?: string, cursor?: string) {
  const response = await client<{ success: true; data: ProjectRegistryPage }>({
    url: "/api/v1/projects",
    method: "GET",
    params: {
      limit: 25,
      search,
      cursor,
      sortBy: "createdAt",
      sortDirection: "desc",
    },
  });
  return response.data.data;
}

export async function getProjectDetail(projectId: string) {
  const response = await client<{
    success: true;
    data: ProjectDetailSnapshot;
  }>({
    url: `/api/v1/projects/${projectId}`,
    method: "GET",
  });
  return response.data.data;
}

export async function getProjectReadinessOptions(
  projectId: string,
): Promise<ProjectReadinessOptions> {
  const response = await client<{
    success: true;
    data: ProjectReadinessOptions;
  }>({
    url: `/api/v1/projects/${projectId}/readiness-options`,
    method: "GET",
  });
  return response.data.data;
}

export async function getProjectWizardOptions() {
  const [clients, employees, machines, jobRoles] = await Promise.all([
    getApiV1Clients({
      params: {
        limit: 100,
        sortBy: "name",
        sortDirection: "asc",
      },
    }),
    getApiV1Employees({
      params: {
        limit: 100,
        state: "active",
        sortBy: "name",
        sortDirection: "asc",
      },
    }),
    getApiV1Machines({
      params: {
        limit: 100,
        availability: "available",
        sortBy: "name",
        sortDirection: "asc",
      },
    }),
    getApiV1JobRoles(),
  ]);
  return {
    clients: clients.data.data.map((item) => ({
      id: item.id,
      label: item.name,
      detail: item.document.maskedDocument,
    })),
    employees: employees.data.data
      .filter((item) => item.availability.state === "available")
      .map((item) => ({
        id: item.employment.id,
        label: item.person.displayName,
        detail:
          item.employment.jobRole?.name ?? item.person.document.maskedDocument,
        jobRolePeriodId: item.employment.jobRole?.periodId,
        jobRoleId: item.employment.jobRole?.id,
      })),
    machines: machines.data.data
      .filter(
        (item) =>
          item.availability.state === "available" && item.latestMeterReading,
      )
      .map((item) => ({
        id: item.id,
        label: item.name,
        detail: `${item.latestMeterReading!.value}`,
        readingId: item.latestMeterReading!.id,
        manufacturer: item.manufacturer,
        model: item.model,
        meterType: item.meterType,
        requiresOperator: item.machineModel.requiresOperator,
        requiredJobRoleId: item.machineModel.requiredJobRole?.id,
        requiredJobRoleName: item.machineModel.requiredJobRole?.name,
        acceptsAnyJobRole:
          item.machineModel.requiredJobRole?.name === "Qualquer um",
      })),
    jobRoles: (jobRoles.data ?? [])
      .filter((item) => item.isActive)
      .map((item) => ({ id: item.id, label: item.name })),
  };
}

import "server-only";

import { getApiV1MachineModels } from "@/generated/clients/getApiV1MachineModels";
import { getApiV1MachinesMachineid } from "@/generated/clients/getApiV1MachinesMachineid";
import { getApiV1MachineModelsMachinemodelid } from "@/generated/clients/getApiV1MachineModelsMachinemodelid";
import type { GetApiV1MachineModelsQueryParams } from "@/generated/models/GetApiV1MachineModels";

export type MachinesListQuery = {
  cursor?: string;
  search?: string;
  sortBy?: "model" | "createdAt";
  sortDirection?: "asc" | "desc";
  type?: "YELLOW_LINE" | "WHITE_LINE";
};

export type MachineModelListItem = Awaited<
  ReturnType<typeof getApiV1MachineModels>
>["data"]["data"][number];

export type MachineDetail = Awaited<
  ReturnType<typeof getApiV1MachinesMachineid>
>["data"];
export type MachineModelDetail = Awaited<
  ReturnType<typeof getApiV1MachineModelsMachinemodelid>
>["data"];

const pageSize = 10;

function valueFromParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMachinesSearchParams(
  params: Record<string, string | string[] | undefined>,
): MachinesListQuery {
  const sortBy = valueFromParam(params.sortBy);
  const sortDirection = valueFromParam(params.sortDirection);
  const type = valueFromParam(params.type);
  return {
    cursor: valueFromParam(params.cursor),
    search: valueFromParam(params.search),
    sortBy: sortBy === "model" ? "model" : "createdAt",
    sortDirection: sortDirection === "asc" ? "asc" : "desc",
    type:
      type === "YELLOW_LINE" || type === "WHITE_LINE" ? type : undefined,
  };
}

export async function getMachineModelsList(query: MachinesListQuery) {
  const params: GetApiV1MachineModelsQueryParams = {
    cursor: query.cursor,
    limit: pageSize,
    search: query.search,
    sortBy: query.sortBy ?? "createdAt",
    sortDirection: query.sortDirection ?? "desc",
    type: query.type,
  };
  const response = await getApiV1MachineModels({ params });
  return response.data;
}

export async function getMachineDetail(machineId: string) {
  const response = await getApiV1MachinesMachineid({ machineId });
  return response.data as MachineDetail;
}

export async function getMachineModelDetail(machineModelId: string) {
  return (
    await getApiV1MachineModelsMachinemodelid({ machineModelId })
  ).data as MachineModelDetail;
}

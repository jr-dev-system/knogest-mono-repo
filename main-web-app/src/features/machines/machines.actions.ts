"use server";

import { revalidatePath } from "next/cache";

import { postApiV1MachineModels } from "@/generated/clients/postApiV1MachineModels";
import { patchApiV1MachineModelsMachinemodelid } from "@/generated/clients/patchApiV1MachineModelsMachinemodelid";
import { deleteApiV1MachineModelsMachinemodelid } from "@/generated/clients/deleteApiV1MachineModelsMachinemodelid";
import { postApiV1MachineModelsMachinemodelidUnits } from "@/generated/clients/postApiV1MachineModelsMachinemodelidUnits";
import { postApiV1MachineModelsMachinemodelidUnitsBatch } from "@/generated/clients/postApiV1MachineModelsMachinemodelidUnitsBatch";
import { patchApiV1MachinesMachineidLoadSpecification } from "@/generated/clients/patchApiV1MachinesMachineidLoadSpecification";
import type { PostApiV1MachineModelsMutationRequest } from "@/generated/models/PostApiV1MachineModels";
import { ApiClientError } from "@/lib/api/server-client";
import {
  getProjectDetail,
  getProjectRegistry,
} from "@/features/projects/projects.server";
import type {
  MachineAllocationProjectContextResult,
  MachineAllocationProjectsResult,
} from "./machine-allocation.types";
import type { MachineActionState } from "./machines-action-state";
import type {
  MachineUnitBatchActionResult,
  MachineUnitBatchDraft,
} from "./machine-unit-batch.types";

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

function optionalPayloadString(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  return value.length > 0 ? value : undefined;
}

function decimalPayloadValue(formData: FormData, key: string) {
  return optionalString(formData, key).replace(",", ".");
}

function nullableDecimalPayloadValue(formData: FormData, key: string) {
  const value = decimalPayloadValue(formData, key);
  return value.length > 0 ? value : null;
}

function payload(formData: FormData): PostApiV1MachineModelsMutationRequest {
  const type = optionalString(formData, "type");
  const isWhiteLine = type === "WHITE_LINE";
  return {
    description: optionalPayloadString(formData, "description"),
    manufacturer: optionalString(formData, "manufacturer"),
    model: optionalString(formData, "model"),
    version: optionalPayloadString(formData, "version"),
    loadCapacity: isWhiteLine
      ? optionalPayloadString(formData, "loadCapacity")?.replace(",", ".")
      : undefined,
    loadCapacityUnitCode: isWhiteLine
      ? (optionalPayloadString(formData, "loadCapacityUnitCode") as
          | "M3_LOOSE"
          | "M3_COMPACTED"
          | "LITER"
          | "CUBIC_YARD"
          | undefined)
      : undefined,
    maxSupportedWeightT: isWhiteLine
      ? optionalPayloadString(formData, "maxSupportedWeightT")?.replace(
          ",",
          ".",
        )
      : undefined,
    type: type === "WHITE_LINE" ? "WHITE_LINE" : "YELLOW_LINE",
    requiresOperator: optionalString(formData, "requiresOperator") === "true",
    requiredJobRoleId:
      optionalString(formData, "requiresOperator") === "true"
        ? optionalPayloadString(formData, "requiredJobRoleId")
        : null,
  };
}

function failureMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === "MACHINE_IDENTIFIER_CONFLICT") {
      return "Placa ou patrimônio já está em uso nesta empresa.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "Revise cadastro, identificadores e leitura inicial.";
    }
    if (error.code === "MACHINE_LOAD_SPEC_NOT_APPLICABLE") {
      return "Volume de carga e peso máximo são permitidos somente para máquinas de linha branca.";
    }
    if (error.code === "MACHINE_OPERATOR_REQUIRED") {
      return "Selecione ao menos um operador compatível para a obra.";
    }
    if (error.code === "MACHINE_OPERATOR_INVALID") {
      return "O operador selecionado não está mais elegível para essa obra e turno.";
    }
    if (error.code === "MACHINE_OPERATOR_NOT_ALLOWED") {
      return "Este modelo não permite vincular operador.";
    }
    if (error.code === "MACHINE_MODEL_DELETE_BLOCKED") {
      return "Este modelo possui unidades ativas e não pode ser excluído.";
    }
    if (error.status === 404) {
      return "A obra selecionada não está mais disponível para mobilização.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Sua sessão não tem permissão para concluir esta operação.";
    }
    return error.message;
  }
  return "Não foi possível cadastrar o modelo agora.";
}

export async function searchMachineAllocationProjectsAction(input?: {
  cursor?: string | null;
  search?: string;
}): Promise<MachineAllocationProjectsResult> {
  try {
    const page = await getProjectRegistry(
      input?.search?.trim() || undefined,
      input?.cursor || undefined,
      { limit: 15, statuses: ["planned", "active"] },
    );
    return {
      ok: true,
      page: {
        data: page.data.map((project) => ({
          id: project.id,
          name: project.name,
          contractNumber: project.contractNumber,
          status: project.status as "planned" | "active",
        })),
        pageInfo: page.pageInfo,
      },
    };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function getMachineAllocationProjectContextAction(
  projectId: string,
): Promise<MachineAllocationProjectContextResult> {
  try {
    const project = await getProjectDetail(projectId);
    if (project.status !== "planned" && project.status !== "active") {
      return {
        ok: false,
        message: "A obra não aceita novas mobilizações no estado atual.",
      };
    }
    const occupiedOperatorIds = new Set(
      project.machineAllocations.flatMap((allocation) =>
        allocation.operatorAssignments.flatMap((assignment) =>
          assignment.operator ? [assignment.operator.id] : [],
        ),
      ),
    );
    return {
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        shifts: project.schedule.shifts,
        operators: project.employeeAllocations
          .filter(
            (allocation) =>
              allocation.employment?.isActive &&
              !occupiedOperatorIds.has(allocation.employment.id),
          )
          .map((allocation) => ({
            employmentId: allocation.employment!.id,
            name: allocation.employment!.name,
            jobRole: allocation.jobRole,
            confirmedJobRoleId: allocation.confirmedJobRoleId,
            shift: allocation.shift,
          })),
      },
    };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function updateMachineLoadSpecificationAction(
  machineId: string,
  _state: MachineActionState,
  formData: FormData,
): Promise<MachineActionState> {
  try {
    await patchApiV1MachinesMachineidLoadSpecification({
      machineId,
      data: {
        loadVolumeM3: nullableDecimalPayloadValue(formData, "loadVolumeM3"),
        maxSupportedWeightT: nullableDecimalPayloadValue(
          formData,
          "maxSupportedWeightT",
        ),
      },
    });
    revalidatePath(`/home/maquinas/${machineId}`);
    revalidatePath("/home/maquinas");
    return { ok: true, message: "Capacidade da máquina atualizada." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function createMachineModelAction(
  _state: MachineActionState,
  formData: FormData,
): Promise<MachineActionState> {
  try {
    const response = await postApiV1MachineModels({ data: payload(formData) });
    revalidatePath("/home/maquinas");
    return {
      ok: true,
      message: "Modelo cadastrado.",
      createdModel: {
        id: response.data.id,
        name: [
          response.data.manufacturer,
          response.data.model,
          response.data.version,
        ]
          .filter(Boolean)
          .join(" "),
        requiresOperator: response.data.requiresOperator,
        requiredJobRoleId: response.data.requiredJobRole?.id ?? null,
        requiredJobRoleName: response.data.requiredJobRole?.name ?? null,
      },
    };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function updateMachineModelAction(
  machineModelId: string,
  _state: MachineActionState,
  formData: FormData,
): Promise<MachineActionState> {
  try {
    await patchApiV1MachineModelsMachinemodelid({
      machineModelId,
      data: payload(formData),
    });
    revalidatePath(`/home/maquinas/modelos/${machineModelId}`);
    revalidatePath("/home/maquinas");
    return { ok: true, message: "Modelo atualizado." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function deleteMachineModelAction(
  machineModelId: string,
): Promise<MachineActionState> {
  try {
    await deleteApiV1MachineModelsMachinemodelid({ machineModelId });
    revalidatePath("/home/maquinas");
    return { ok: true, message: "Modelo excluído." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function addMachineModelUnitsBatchAction(
  machineModelId: string,
  input: MachineUnitBatchDraft,
): Promise<MachineUnitBatchActionResult> {
  try {
    const response = await postApiV1MachineModelsMachinemodelidUnitsBatch({
      machineModelId,
      data: input,
    });
    revalidatePath(`/home/maquinas/modelos/${machineModelId}`);
    revalidatePath("/home/maquinas");
    return {
      ok: true,
      createdCount: response.data.created.length,
      rejected: response.data.rejected,
      message: response.data.rejected.length
        ? `${response.data.created.length} unidade(s) criada(s); ${response.data.rejected.length} precisam de correção.`
        : `${response.data.created.length} unidade(s) criada(s).`,
    };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function addMachineModelUnitsAction(
  machineModelId: string,
  _state: MachineActionState,
  formData: FormData,
): Promise<MachineActionState> {
  try {
    const ownership = optionalString(formData, "unitOwnership");
    const allocateNow = optionalString(formData, "unitAllocateNow") === "yes";
    const operatorAssignments = [
      ["day", optionalPayloadString(formData, "unitDayOperatorEmploymentId")],
      [
        "night",
        optionalPayloadString(formData, "unitNightOperatorEmploymentId"),
      ],
    ]
      .filter((assignment): assignment is ["day" | "night", string] =>
        Boolean(assignment[1]),
      )
      .map(([shift, operatorEmploymentId]) => ({
        shift,
        operatorEmploymentId,
      }));
    await postApiV1MachineModelsMachinemodelidUnits({
      machineModelId,
      data: {
        name: optionalPayloadString(formData, "unitName"),
        plate: optionalPayloadString(formData, "unitPlate"),
        companyTag: optionalPayloadString(formData, "unitCompanyTag"),
        meterType:
          optionalString(formData, "unitMeterType") === "ODOMETER"
            ? "ODOMETER"
            : "HOUR_METER",
        initialMeterReading: decimalPayloadValue(
          formData,
          "unitInitialMeterReading",
        ),
        ownership:
          ownership === "RENTED"
            ? {
                kind: "RENTED",
                lessorName: optionalString(formData, "unitLessorName"),
                suggestedHourlyRate: decimalPayloadValue(
                  formData,
                  "unitSuggestedHourlyRate",
                ),
              }
            : { kind: "OWNED" },
        allocation: allocateNow
          ? {
              projectId: optionalString(formData, "unitProjectId"),
              operatorAssignments,
              ...(ownership === "RENTED"
                ? {
                    confirmedHourlyRate: decimalPayloadValue(
                      formData,
                      "unitConfirmedHourlyRate",
                    ),
                    monthlyHours: Number(
                      optionalString(formData, "unitMonthlyHours"),
                    ),
                  }
                : {}),
            }
          : undefined,
      },
    });
    revalidatePath(`/home/maquinas/modelos/${machineModelId}`);
    revalidatePath("/home/maquinas");
    return { ok: true, message: "Unidade adicionada." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

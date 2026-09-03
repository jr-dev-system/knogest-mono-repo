"use server";

import { revalidatePath } from "next/cache";

import { postApiV1MachineModels } from "@/generated/clients/postApiV1MachineModels";
import { postApiV1MachineModelsMachinemodelidUnits } from "@/generated/clients/postApiV1MachineModelsMachinemodelidUnits";
import { patchApiV1MachinesMachineidLoadSpecification } from "@/generated/clients/patchApiV1MachinesMachineidLoadSpecification";
import type { PostApiV1MachineModelsMutationRequest } from "@/generated/models/PostApiV1MachineModels";
import { ApiClientError } from "@/lib/api/server-client";
import type { MachineActionState } from "./machines-action-state";

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
  const names = formData.getAll("unitName");
  const plates = formData.getAll("unitPlate");
  const companyTags = formData.getAll("unitCompanyTag");
  const readings = formData.getAll("unitInitialMeterReading");
  return {
    description: optionalPayloadString(formData, "description"),
    meterType:
      optionalString(formData, "meterType") === "ODOMETER"
        ? "ODOMETER"
        : "HOUR_METER",
    manufacturer: optionalString(formData, "manufacturer"),
    model: optionalString(formData, "model"),
    loadVolumeM3: isWhiteLine
      ? optionalPayloadString(formData, "loadVolumeM3")?.replace(",", ".")
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
    units: names.map((name, index) => ({
      name: String(name).trim(),
      plate:
        typeof plates[index] === "string" && plates[index].trim()
          ? plates[index].trim()
          : undefined,
      companyTag:
        typeof companyTags[index] === "string" && companyTags[index].trim()
          ? companyTags[index].trim()
          : undefined,
      initialMeterReading: decimalPayloadValueFromValue(readings[index]),
    })),
  };
}

function decimalPayloadValueFromValue(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value.trim().replace(",", ".") : "";
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
    if (error.status === 401 || error.status === 403) {
      return "Sua sessão não tem permissão para concluir esta operação.";
    }
    return error.message;
  }
  return "Não foi possível cadastrar o modelo agora.";
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
    await postApiV1MachineModels({ data: payload(formData) });
    revalidatePath("/home/maquinas");
    return { ok: true, message: "Modelo e unidades cadastrados." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function addMachineModelUnitsAction(
  machineModelId: string,
  _state: MachineActionState,
  formData: FormData,
): Promise<MachineActionState> {
  const names = formData.getAll("unitName");
  const plates = formData.getAll("unitPlate");
  const companyTags = formData.getAll("unitCompanyTag");
  const readings = formData.getAll("unitInitialMeterReading");
  try {
    await postApiV1MachineModelsMachinemodelidUnits({
      machineModelId,
      data: {
        units: names.map((name, index) => ({
          name: String(name).trim(),
          plate: typeof plates[index] === "string" && plates[index].trim() ? plates[index].trim() : undefined,
          companyTag: typeof companyTags[index] === "string" && companyTags[index].trim() ? companyTags[index].trim() : undefined,
          initialMeterReading: decimalPayloadValueFromValue(readings[index]),
        })),
      },
    });
    revalidatePath(`/home/maquinas/modelos/${machineModelId}`);
    revalidatePath("/home/maquinas");
    return { ok: true, message: "Unidades adicionadas." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

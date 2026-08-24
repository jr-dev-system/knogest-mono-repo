"use server";

import { revalidatePath } from "next/cache";
import { postApiV1JobRoles } from "@/generated/clients/postApiV1JobRoles";
import { putApiV1JobRolesJobroleid } from "@/generated/clients/putApiV1JobRolesJobroleid";
import { ApiClientError } from "@/lib/api/server-client";

export type JobRoleActionState = {
  ok: boolean;
  message: string;
  requestId?: string;
};

type CreatedJobRole = {
  id: string;
  name: string;
  isActive: boolean;
};

type CreateJobRoleResult =
  | { ok: true; data: CreatedJobRole; message: string }
  | { ok: false; message: string; requestId?: string };

const createFailure =
  "Não foi possível criar a função agora. Tente novamente em instantes.";
const updateFailure = "Não foi possível atualizar as funções agora.";

function requestIdFor(error: unknown) {
  if (!(error instanceof ApiClientError)) return undefined;
  const data = error.data;
  if (
    data &&
    typeof data === "object" &&
    "requestId" in data &&
    typeof data.requestId === "string"
  ) {
    return data.requestId;
  }
  return undefined;
}

function messageFor(error: unknown, fallback = createFailure) {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.code === "VALIDATION_ERROR") return "Informe uma função válida.";
  if (error.code === "JOB_ROLE_ALREADY_EXISTS") {
    return "Já existe uma função com esse nome nesta empresa.";
  }
  if (error.status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (error.status === 403) {
    return "Sua sessão não tem permissão para criar funções.";
  }
  if (error.status && error.status >= 500) return fallback;
  return fallback;
}

export async function createJobRoleForEmployee(
  formData: FormData,
): Promise<CreateJobRoleResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name)
    return { ok: false, message: "Informe o nome da função." } as const;
  try {
    const response = await postApiV1JobRoles({ data: { name } });
    if (!response.data) {
      return { ok: false, message: createFailure };
    }
    revalidatePath("/home/configuracoes");
    revalidatePath("/home/funcionarios");
    return {
      ok: true,
      data: response.data,
      message: "Função criada e selecionada.",
    } as const;
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error),
      requestId: requestIdFor(error),
    };
  }
}

export async function createJobRoleAction(
  _state: JobRoleActionState,
  formData: FormData,
): Promise<JobRoleActionState> {
  const result = await createJobRoleForEmployee(formData);
  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      requestId: result.requestId,
    };
  }
  return { ok: true, message: result.message };
}

export async function renameJobRoleAction(
  _state: JobRoleActionState,
  formData: FormData,
): Promise<JobRoleActionState> {
  const jobRoleId = String(formData.get("jobRoleId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!jobRoleId || !name)
    return { ok: false, message: "Informe o nome da função." };
  try {
    await putApiV1JobRolesJobroleid({ jobRoleId, data: { name } });
    revalidatePath("/home/configuracoes");
    revalidatePath("/home/funcionarios");
    return { ok: true, message: "Função renomeada." };
  } catch (error) {
    return { ok: false, message: messageFor(error, updateFailure) };
  }
}

export async function deactivateJobRoleAction(
  _state: JobRoleActionState,
  formData: FormData,
): Promise<JobRoleActionState> {
  const jobRoleId = String(formData.get("jobRoleId") ?? "");
  if (!jobRoleId) return { ok: false, message: updateFailure };
  try {
    await putApiV1JobRolesJobroleid({ jobRoleId, data: { isActive: false } });
    revalidatePath("/home/configuracoes");
    revalidatePath("/home/funcionarios");
    return {
      ok: true,
      message: "Função desativada para novos vínculos e alocações.",
    };
  } catch (error) {
    return { ok: false, message: messageFor(error, updateFailure) };
  }
}

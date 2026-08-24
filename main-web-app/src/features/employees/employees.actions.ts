"use server";

import { revalidatePath } from "next/cache";

import { postApiV1Employees } from "@/generated/clients/postApiV1Employees";
import { postApiV1EmployeesEmploymentidRehire } from "@/generated/clients/postApiV1EmployeesEmploymentidRehire";
import { putApiV1EmployeesEmploymentidJobRole } from "@/generated/clients/putApiV1EmployeesEmploymentidJobRole";
import { postApiV1EmployeeAllocations } from "@/generated/clients/postApiV1EmployeeAllocations";
import { postApiV1EmployeeAllocationsAllocationidRelease } from "@/generated/clients/postApiV1EmployeeAllocationsAllocationidRelease";
import { postApiV1EmployeeAllocationsAllocationidReallocate } from "@/generated/clients/postApiV1EmployeeAllocationsAllocationidReallocate";
import { postApiV1EmployeeAllocationsAllocationidTerms } from "@/generated/clients/postApiV1EmployeeAllocationsAllocationidTerms";
import { postApiV1EmployeesEmploymentidTerminate } from "@/generated/clients/postApiV1EmployeesEmploymentidTerminate";
import type { PostApiV1EmployeesMutationRequest } from "@/generated/models/PostApiV1Employees";
import { ApiClientError } from "@/lib/api/server-client";
import type { EmployeeActionState } from "./employees-action-state";

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

function payload(formData: FormData): PostApiV1EmployeesMutationRequest {
  return {
    admissionDate: optionalString(formData, "admissionDate"),
    companyRegistrationNumber: optionalString(
      formData,
      "companyRegistrationNumber",
    ),
    document: optionalString(formData, "document"),
    fullName: optionalString(formData, "fullName"),
    jobRoleId: optionalString(formData, "jobRoleId"),
  };
}

function failureMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === "EMPLOYMENT_ALREADY_EXISTS") {
      return "Esta pessoa já possui vínculo ativo nesta empresa.";
    }
    if (error.code === "REGISTRATION_NUMBER_ALREADY_EXISTS") {
      return "Esta matrícula já está em uso nesta empresa.";
    }
    if (error.code === "EMPLOYMENT_CURRENT_STATE_CONFLICT") {
      return "Este vínculo não está mais encerrado para recontratação.";
    }
    if (error.code === "NOT_FOUND") {
      return "Este vínculo não está disponível nesta empresa.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "Revise CPF, nome, matrícula e admissão.";
    }
    if (error.code === "JOB_ROLE_UNAVAILABLE") {
      return "A função selecionada não está mais disponível. Selecione outra para continuar.";
    }
    if (
      error.code === "EMPLOYEE_ALLOCATION_UNAVAILABLE" ||
      error.code === "EMPLOYEE_ALLOCATION_CURRENT_STATE_CONFLICT" ||
      error.code === "EMPLOYEE_REALLOCATION_CURRENT_STATE_CONFLICT"
    ) {
      return "A alocação mudou enquanto você confirmava. Revise os dados e tente novamente.";
    }
    if (error.code === "EMPLOYEE_REALLOCATION_DESTINATION_UNAVAILABLE") {
      return "A empresa ou obra de destino não está mais disponível.";
    }
    if (
      error.code === "EMPLOYEE_REALLOCATION_DESTINATION_EMPLOYMENT_REQUIRED"
    ) {
      return "A pessoa não possui vínculo ativo na empresa de destino.";
    }
    if (error.code === "EMPLOYEE_ALLOCATION_TERMS_UNCHANGED") {
      return "Informe ao menos uma alteração nos termos efetivos.";
    }
    if (error.code === "EMPLOYMENT_TERMINATION_MANAGER_BLOCKED") {
      return "Transfira a gerência atual da obra antes de encerrar o vínculo.";
    }
    if (
      error.code === "EMPLOYMENT_TERMINATION_TECHNICAL_RESPONSIBILITY_BLOCKED"
    ) {
      return "Defina outra responsabilidade técnica antes de encerrar o vínculo.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Sua sessão não tem permissão para concluir esta operação.";
    }
    if (error.status && error.status >= 500) {
      return "Não foi possível cadastrar o funcionário agora. Tente novamente em instantes.";
    }
    return error.message;
  }
  return "Não foi possível cadastrar o funcionário agora.";
}

export async function createEmployeeAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  try {
    await postApiV1Employees({ data: payload(formData) });
    revalidatePath("/home/funcionarios");
    return { ok: true, message: "Funcionário cadastrado." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function rehireEmployeeAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const employmentId = optionalString(formData, "employmentId");
  try {
    await postApiV1EmployeesEmploymentidRehire({
      employmentId,
      data: {},
    });
    revalidatePath("/home/funcionarios");
    revalidatePath(`/home/funcionarios/${employmentId}`);
    return { ok: true, message: "Funcionário recontratado." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function changeEmployeeJobRoleAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const employmentId = optionalString(formData, "employmentId");
  try {
    await putApiV1EmployeesEmploymentidJobRole({
      employmentId,
      data: {
        jobRoleId: optionalString(formData, "jobRoleId"),
        reason: optionalString(formData, "reason"),
      },
    });
    revalidatePath("/home/funcionarios");
    revalidatePath(`/home/funcionarios/${employmentId}`);
    return { ok: true, message: "Função atualizada." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

function allocationPayload(formData: FormData) {
  return {
    jobRole: optionalString(formData, "jobRole"),
    monthlyWorkloadHours: Number(
      optionalString(formData, "monthlyWorkloadHours"),
    ),
    compensationMode: optionalString(formData, "compensationMode") as
      | "daily"
      | "hourly"
      | "weekly"
      | "fortnightly"
      | "monthly",
    compensationValue: optionalString(formData, "compensationValue"),
    overtimeRate: optionalString(formData, "overtimeRate"),
  };
}

async function refreshAllocationViews(employmentId: string) {
  revalidatePath("/home/funcionarios");
  revalidatePath(`/home/funcionarios/${employmentId}`);
  revalidatePath("/home/obras");
}

export async function allocateEmployeeAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const employmentId = optionalString(formData, "employmentId");
  try {
    await postApiV1EmployeeAllocations({
      data: {
        employmentId,
        projectId: optionalString(formData, "projectId"),
        ...allocationPayload(formData),
      },
    });
    await refreshAllocationViews(employmentId);
    return { ok: true, message: "Funcionário alocado." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function releaseEmployeeAllocationAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const employmentId = optionalString(formData, "employmentId");
  try {
    await postApiV1EmployeeAllocationsAllocationidRelease({
      allocationId: optionalString(formData, "allocationId"),
      data: { reason: optionalString(formData, "reason") },
    });
    await refreshAllocationViews(employmentId);
    return { ok: true, message: "Funcionário liberado." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function replaceEmployeeAllocationTermsAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const employmentId = optionalString(formData, "employmentId");
  try {
    await postApiV1EmployeeAllocationsAllocationidTerms({
      allocationId: optionalString(formData, "allocationId"),
      data: {
        ...allocationPayload(formData),
        reason: optionalString(formData, "reason"),
      },
    });
    await refreshAllocationViews(employmentId);
    return { ok: true, message: "Termos efetivos atualizados." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function reallocateEmployeeAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const employmentId = optionalString(formData, "employmentId");
  try {
    await postApiV1EmployeeAllocationsAllocationidReallocate({
      allocationId: optionalString(formData, "allocationId"),
      data: {
        ...allocationPayload(formData),
        reason: optionalString(formData, "reason"),
        destinationCompanyId: optionalString(formData, "destinationCompanyId"),
        destinationProjectId: optionalString(formData, "destinationProjectId"),
      },
    });
    await refreshAllocationViews(employmentId);
    return { ok: true, message: "Funcionário realocado." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

export async function terminateEmployeeAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const employmentId = optionalString(formData, "employmentId");
  try {
    await postApiV1EmployeesEmploymentidTerminate({
      employmentId,
      data: { reason: optionalString(formData, "reason") },
    });
    await refreshAllocationViews(employmentId);
    return { ok: true, message: "Vínculo encerrado com segurança." };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

import type { Prisma } from "../../../db/generated/prisma/client";
import { AppError } from "../../../lib/utils/appError";
import type {
  CursorBoundary,
  SortDirection,
} from "../../../lib/utils/cursor-pagination";
import type { HandlerContext } from "../../../lib/utils/handler.dto";

export interface PersonRecord {
  id: string;
  corporationId: string;
  documentType: "CPF" | "CNPJ";
  ciphertext: string;
  iv: string;
  authTag: string;
  encryptionKeyVersion: string;
  documentDigest: string;
  displayName: string;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmploymentPeriodRecord {
  id: string;
  corporationId: string;
  companyId: string;
  employmentId: string;
  admissionDate: Date;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  terminationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmploymentRecord {
  id: string;
  corporationId: string;
  companyId: string;
  personId: string;
  companyRegistrationNumber: string;
  state: "ACTIVE" | "TERMINATED";
  isActive: boolean;
  terminatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  person: PersonRecord;
  periods: EmploymentPeriodRecord[];
  jobRolePeriods: Array<{
    id: string;
    jobRoleId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    reason: string | null;
    jobRole: { id: string; name: string; isActive: boolean };
  }>;
}

export interface WorkforceCreateData {
  corporationId: string;
  companyId: string;
  documentType: "CPF";
  ciphertext: string;
  iv: string;
  authTag: string;
  encryptionKeyVersion: string;
  documentDigest: string;
  fullName: string;
  companyRegistrationNumber: string;
  admissionDate: Date;
}

export interface CreateEmployeeAllocationData {
  corporationId: string;
  companyId: string;
  actorUserId: string;
  employmentId: string;
  projectId: string;
  jobRole: string;
  monthlyWorkloadHours: number;
  compensationMode: string;
  compensationValue: string;
  overtimeRate: string;
  effectiveFrom: Date;
}

export interface AllocationLifecycleScope {
  corporationId: string;
  companyId: string;
  actorUserId: string;
  sessionId: string;
}

export interface AllocationTerms {
  jobRole: string;
  monthlyWorkloadHours: number;
  compensationMode: string;
  compensationValue: string;
  overtimeRate: string;
}

const allocationSelect = {
  id: true,
  corporationId: true,
  companyId: true,
  projectId: true,
  employmentId: true,
  personId: true,
  jobRole: true,
  monthlyWorkloadHours: true,
  compensationMode: true,
  compensationValue: true,
  overtimeRate: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdByUserId: true,
  endedByUserId: true,
  endedReason: true,
};

const personSelect = {
  id: true,
  corporationId: true,
  documentType: true,
  ciphertext: true,
  iv: true,
  authTag: true,
  encryptionKeyVersion: true,
  documentDigest: true,
  displayName: true,
  fullName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const periodSelect = {
  id: true,
  corporationId: true,
  companyId: true,
  employmentId: true,
  admissionDate: true,
  effectiveFrom: true,
  effectiveTo: true,
  terminationReason: true,
  createdAt: true,
  updatedAt: true,
};

const employmentSelect = {
  id: true,
  corporationId: true,
  companyId: true,
  personId: true,
  companyRegistrationNumber: true,
  state: true,
  isActive: true,
  terminatedAt: true,
  createdAt: true,
  updatedAt: true,
  person: { select: personSelect },
  periods: {
    orderBy: { effectiveFrom: "desc" as const },
    select: periodSelect,
  },
  jobRolePeriods: {
    orderBy: { effectiveFrom: "desc" as const },
    select: {
      id: true,
      jobRoleId: true,
      effectiveFrom: true,
      effectiveTo: true,
      reason: true,
      jobRole: { select: { id: true, name: true, isActive: true } },
    },
  },
};

function isUniqueError(
  error: unknown,
): error is { code: string; meta?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isOpenPeriodUniqueError(error: unknown): boolean {
  if (!isUniqueError(error)) return false;
  const meta = error.meta;
  if (typeof meta !== "object" || meta === null || !("target" in meta)) {
    return false;
  }
  const target = meta.target;
  return (
    target === "employment_periods_open_period_unique" ||
    (Array.isArray(target) &&
      target.includes("corporation_id") &&
      target.includes("company_id") &&
      target.includes("employment_id"))
  );
}

function employmentAlreadyExistsError(): AppError {
  return new AppError({
    code: "EMPLOYMENT_ALREADY_EXISTS",
    message: "Active Employment already exists for this Person and Company",
    statusCode: 409,
  });
}

function registrationNumberAlreadyExistsError(): AppError {
  return new AppError({
    code: "REGISTRATION_NUMBER_ALREADY_EXISTS",
    message: "Company registration number already exists for this Company",
    statusCode: 409,
  });
}

function notFoundError(): AppError {
  return new AppError({
    code: "NOT_FOUND",
    message: "Employee not found",
    statusCode: 404,
  });
}

function currentStateConflictError(): AppError {
  return new AppError({
    code: "EMPLOYMENT_CURRENT_STATE_CONFLICT",
    message: "Employment current state does not allow rehire",
    statusCode: 409,
  });
}

export async function createEmployeeAllocationHandler(
  context: HandlerContext,
  input: CreateEmployeeAllocationData,
) {
  const [actor, employment, project] = await Promise.all([
    context.prisma.user.findFirst({
      where: {
        corporationId: input.corporationId,
        id: input.actorUserId,
        isActive: true,
      },
      select: { id: true },
    }),
    context.prisma.employment.findFirst({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        id: input.employmentId,
        isActive: true,
        state: "ACTIVE",
        person: { isActive: true },
        periods: { some: { effectiveTo: null } },
      },
      select: { id: true, personId: true },
    }),
    context.prisma.project.findFirst({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        id: input.projectId,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: { id: true, name: true, status: true },
    }),
  ]);
  if (!actor || !employment || !project) {
    throw new AppError({
      code: "EMPLOYEE_ALLOCATION_STATE_CONFLICT",
      message: "Employee allocation is no longer eligible",
      statusCode: 409,
    });
  }
  try {
    const allocation = await context.prisma.projectEmployeeAllocation.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: input.employmentId,
        projectId: input.projectId,
        personId: employment.personId,
        jobRole: input.jobRole,
        monthlyWorkloadHours: input.monthlyWorkloadHours,
        compensationMode: input.compensationMode,
        compensationValue: input.compensationValue,
        overtimeRate: input.overtimeRate,
        effectiveFrom: input.effectiveFrom,
        createdByUserId: input.actorUserId,
      },
      select: {
        id: true,
        employmentId: true,
        personId: true,
        projectId: true,
        jobRole: true,
        monthlyWorkloadHours: true,
        compensationMode: true,
        compensationValue: true,
        overtimeRate: true,
        effectiveFrom: true,
      },
    });
    return { allocation, project };
  } catch (error) {
    if (isUniqueError(error)) {
      throw new AppError({
        code: "EMPLOYEE_ALLOCATION_UNAVAILABLE",
        message: "Employee is unavailable for operational allocation",
        statusCode: 409,
      });
    }
    throw error;
  }
}

function lifecycleError(
  code:
    | "EMPLOYEE_ALLOCATION_CURRENT_STATE_CONFLICT"
    | "EMPLOYEE_REALLOCATION_CURRENT_STATE_CONFLICT" = "EMPLOYEE_ALLOCATION_CURRENT_STATE_CONFLICT",
) {
  return new AppError({
    code,
    message: "Employee allocation is no longer in an eligible current state",
    statusCode: 409,
  });
}

async function assertTrustedLifecycleScope(
  context: HandlerContext,
  scope: AllocationLifecycleScope,
) {
  const session = await context.prisma.session.findFirst({
    where: {
      id: scope.sessionId,
      corporationId: scope.corporationId,
      userId: scope.actorUserId,
      companyId: scope.companyId,
      revokedAt: null,
      user: { isActive: true },
    },
    select: { id: true },
  });
  if (!session) throw lifecycleError();
}

async function findOpenAllocation(
  context: HandlerContext,
  scope: AllocationLifecycleScope,
  allocationId: string,
) {
  const allocation = await context.prisma.projectEmployeeAllocation.findFirst({
    where: {
      id: allocationId,
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      effectiveTo: null,
    },
    select: allocationSelect,
  });
  if (!allocation) throw lifecycleError();
  const [employment, person, project] = await Promise.all([
    context.prisma.employment.findFirst({
      where: {
        id: allocation.employmentId,
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        state: "ACTIVE",
        isActive: true,
        periods: { some: { effectiveTo: null } },
      },
      select: { id: true },
    }),
    context.prisma.person.findFirst({
      where: {
        id: allocation.personId,
        corporationId: scope.corporationId,
        isActive: true,
      },
      select: { id: true },
    }),
    context.prisma.project.findFirst({
      where: {
        id: allocation.projectId,
        corporationId: scope.corporationId,
        companyId: scope.companyId,
        status: { in: ["PLANNED", "ACTIVE", "PAUSED"] },
      },
      select: { id: true, name: true, status: true },
    }),
  ]);
  if (!employment || !person || !project) throw lifecycleError();
  return { allocation, project };
}

async function closeOpenAllocation(
  context: HandlerContext,
  allocationId: string,
  effectiveTo: Date,
  actorUserId: string,
  reason: string,
  code:
    | "EMPLOYEE_ALLOCATION_CURRENT_STATE_CONFLICT"
    | "EMPLOYEE_REALLOCATION_CURRENT_STATE_CONFLICT" = "EMPLOYEE_ALLOCATION_CURRENT_STATE_CONFLICT",
) {
  const updated = await context.prisma.projectEmployeeAllocation.updateMany({
    where: { id: allocationId, effectiveTo: null },
    data: { effectiveTo, endedByUserId: actorUserId, endedReason: reason },
  });
  if (updated.count !== 1) throw lifecycleError(code);
}

export async function releaseEmployeeAllocationHandler(
  context: HandlerContext,
  input: AllocationLifecycleScope & {
    allocationId: string;
    reason: string;
    effectiveTo: Date;
  },
) {
  await assertTrustedLifecycleScope(context, input);
  const { allocation, project } = await findOpenAllocation(
    context,
    input,
    input.allocationId,
  );
  await closeOpenAllocation(
    context,
    allocation.id,
    input.effectiveTo,
    input.actorUserId,
    input.reason,
  );
  return {
    allocation: {
      ...allocation,
      effectiveTo: input.effectiveTo,
      endedByUserId: input.actorUserId,
      endedReason: input.reason,
    },
    project,
  };
}

export async function reallocateEmployeeHandler(
  context: HandlerContext,
  input: AllocationLifecycleScope &
    AllocationTerms & {
      allocationId: string;
      destinationCompanyId: string;
      destinationProjectId: string;
      reason: string;
      effectiveAt: Date;
    },
) {
  await assertTrustedLifecycleScope(context, input);
  const { allocation: source, project: sourceProject } =
    await findOpenAllocation(context, input, input.allocationId);
  const [company, destinationProject, destinationEmployment] =
    await Promise.all([
      context.prisma.company.findFirst({
        where: {
          id: input.destinationCompanyId,
          corporationId: input.corporationId,
          isActive: true,
        },
        select: { id: true },
      }),
      context.prisma.project.findFirst({
        where: {
          id: input.destinationProjectId,
          corporationId: input.corporationId,
          companyId: input.destinationCompanyId,
          status: { in: ["PLANNED", "ACTIVE"] },
        },
        select: { id: true, name: true, status: true },
      }),
      context.prisma.employment.findFirst({
        where: {
          corporationId: input.corporationId,
          companyId: input.destinationCompanyId,
          personId: source.personId,
          state: "ACTIVE",
          isActive: true,
          periods: { some: { effectiveTo: null } },
        },
        select: { id: true },
      }),
    ]);
  if (!company || !destinationProject)
    throw new AppError({
      code: "EMPLOYEE_REALLOCATION_DESTINATION_UNAVAILABLE",
      message: "Destination is unavailable",
      statusCode: 409,
    });
  if (!destinationEmployment)
    throw new AppError({
      code: "EMPLOYEE_REALLOCATION_DESTINATION_EMPLOYMENT_REQUIRED",
      message: "Destination Employment is required",
      statusCode: 409,
    });
  await closeOpenAllocation(
    context,
    source.id,
    input.effectiveAt,
    input.actorUserId,
    input.reason,
    "EMPLOYEE_REALLOCATION_CURRENT_STATE_CONFLICT",
  );
  try {
    const destination = await context.prisma.projectEmployeeAllocation.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.destinationCompanyId,
        projectId: input.destinationProjectId,
        employmentId: destinationEmployment.id,
        personId: source.personId,
        jobRole: input.jobRole,
        monthlyWorkloadHours: input.monthlyWorkloadHours,
        compensationMode: input.compensationMode,
        compensationValue: input.compensationValue,
        overtimeRate: input.overtimeRate,
        effectiveFrom: input.effectiveAt,
        createdByUserId: input.actorUserId,
      },
      select: allocationSelect,
    });
    return {
      source: {
        ...source,
        effectiveTo: input.effectiveAt,
        endedByUserId: input.actorUserId,
        endedReason: input.reason,
      },
      sourceProject,
      destination,
      destinationProject,
    };
  } catch (error) {
    if (isUniqueError(error))
      throw new AppError({
        code: "EMPLOYEE_REALLOCATION_DESTINATION_UNAVAILABLE",
        message: "Employee is unavailable for destination",
        statusCode: 409,
      });
    throw error;
  }
}

export async function replaceEmployeeAllocationTermsHandler(
  context: HandlerContext,
  input: AllocationLifecycleScope &
    AllocationTerms & {
      allocationId: string;
      reason: string;
      effectiveAt: Date;
    },
) {
  await assertTrustedLifecycleScope(context, input);
  const { allocation: previous, project } = await findOpenAllocation(
    context,
    input,
    input.allocationId,
  );
  const unchanged =
    previous.jobRole === input.jobRole &&
    previous.monthlyWorkloadHours === input.monthlyWorkloadHours &&
    previous.compensationMode === input.compensationMode &&
    previous.compensationValue.toFixed(2) === input.compensationValue &&
    previous.overtimeRate.toFixed(2) === input.overtimeRate;
  if (unchanged)
    throw new AppError({
      code: "EMPLOYEE_ALLOCATION_TERMS_UNCHANGED",
      message: "Allocation terms are unchanged",
      statusCode: 422,
    });
  await closeOpenAllocation(
    context,
    previous.id,
    input.effectiveAt,
    input.actorUserId,
    input.reason,
  );
  const current = await context.prisma.projectEmployeeAllocation.create({
    data: {
      corporationId: previous.corporationId,
      companyId: previous.companyId,
      projectId: previous.projectId,
      employmentId: previous.employmentId,
      personId: previous.personId,
      jobRole: input.jobRole,
      monthlyWorkloadHours: input.monthlyWorkloadHours,
      compensationMode: input.compensationMode,
      compensationValue: input.compensationValue,
      overtimeRate: input.overtimeRate,
      effectiveFrom: input.effectiveAt,
      createdByUserId: input.actorUserId,
    },
    select: allocationSelect,
  });
  return {
    previous: {
      ...previous,
      effectiveTo: input.effectiveAt,
      endedByUserId: input.actorUserId,
      endedReason: input.reason,
    },
    current,
    project,
  };
}

export async function findAllocatedPersonIdsHandler(
  context: HandlerContext,
  corporationId: string,
  personIds: string[],
) {
  if (!personIds.length) return [];
  return context.prisma.projectEmployeeAllocation.findMany({
    where: { corporationId, personId: { in: personIds }, effectiveTo: null },
    select: { personId: true },
  });
}

export async function findCurrentEmployeeAllocationHandler(
  context: HandlerContext,
  input: { corporationId: string; personId: string },
) {
  const allocation = await context.prisma.projectEmployeeAllocation.findFirst({
    where: {
      corporationId: input.corporationId,
      personId: input.personId,
      effectiveTo: null,
    },
    select: allocationSelect,
  });
  if (!allocation) return null;
  const project = await context.prisma.project.findFirst({
    where: { id: allocation.projectId, corporationId: input.corporationId },
    select: { id: true, name: true, status: true },
  });
  return project ? { allocation, project } : null;
}

export async function listReallocationDestinationsHandler(
  context: HandlerContext,
  input: { corporationId: string; companyId: string; employmentId: string },
) {
  const source = await context.prisma.employment.findFirst({
    where: {
      id: input.employmentId,
      corporationId: input.corporationId,
      companyId: input.companyId,
    },
    select: { personId: true },
  });
  if (!source) throw notFoundError();
  const employments = await context.prisma.employment.findMany({
    where: {
      corporationId: input.corporationId,
      personId: source.personId,
      isActive: true,
      state: "ACTIVE",
      company: { isActive: true },
      periods: { some: { effectiveTo: null } },
    },
    select: { companyId: true, company: { select: { id: true, name: true } } },
  });
  const projects = await context.prisma.project.findMany({
    where: {
      corporationId: input.corporationId,
      companyId: { in: employments.map((employment) => employment.companyId) },
      status: { in: ["PLANNED", "ACTIVE"] },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, companyId: true, name: true, status: true },
  });
  return employments.map(({ company }) => ({
    id: company.id,
    name: company.name,
    projects: projects
      .filter((project) => project.companyId === company.id)
      .map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status.toLowerCase(),
      })),
  }));
}

export async function terminateEmploymentHandler(
  context: HandlerContext,
  input: AllocationLifecycleScope & {
    employmentId: string;
    reason: string;
    effectiveAt: Date;
  },
) {
  await assertTrustedLifecycleScope(context, input);
  const employment = await context.prisma.employment.findFirst({
    where: {
      id: input.employmentId,
      corporationId: input.corporationId,
      companyId: input.companyId,
      state: "ACTIVE",
      isActive: true,
      periods: { some: { effectiveTo: null } },
    },
    select: { id: true },
  });
  if (!employment) {
    throw new AppError({
      code: "EMPLOYMENT_TERMINATION_CURRENT_STATE_CONFLICT",
      message: "Employment is no longer active",
      statusCode: 409,
    });
  }

  const activeProject = { status: { notIn: ["COMPLETED", "CANCELLED"] as const } };
  const [manager, responsibilities] = await Promise.all([
    context.prisma.projectManagerTenure.findFirst({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: employment.id,
        effectiveTo: null,
        project: activeProject,
      },
      select: { id: true },
    }),
    context.prisma.projectTechnicalResponsibility.findMany({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: employment.id,
        effectiveTo: null,
        project: activeProject,
      },
      select: { id: true, projectId: true },
    }),
  ]);
  if (manager) {
    throw new AppError({
      code: "EMPLOYMENT_TERMINATION_MANAGER_BLOCKED",
      message: "Employment is the current manager of a non-terminal Project",
      statusCode: 409,
    });
  }
  if (responsibilities.length) {
    const projectIds = [...new Set(responsibilities.map((item) => item.projectId))];
    const replacements = await context.prisma.projectTechnicalResponsibility.findMany({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        projectId: { in: projectIds },
        employmentId: { not: employment.id },
        effectiveTo: null,
      },
      select: { projectId: true },
    });
    const covered = new Set(replacements.map((item) => item.projectId));
    if (projectIds.some((projectId) => !covered.has(projectId))) {
      throw new AppError({
        code: "EMPLOYMENT_TERMINATION_TECHNICAL_RESPONSIBILITY_BLOCKED",
        message: "Employment is the last technical responsibility of a non-terminal Project",
        statusCode: 409,
      });
    }
  }

  const dateOnly = new Date(Date.UTC(
    input.effectiveAt.getUTCFullYear(),
    input.effectiveAt.getUTCMonth(),
    input.effectiveAt.getUTCDate(),
  ));
  const [period, roles, allocation] = await Promise.all([
    context.prisma.employmentPeriod.updateMany({
      where: { employmentId: employment.id, effectiveTo: null },
      data: { effectiveTo: dateOnly, terminationReason: input.reason, endedByUserId: input.actorUserId },
    }),
    context.prisma.employmentJobRolePeriod.updateMany({
      where: { employmentId: employment.id, effectiveTo: null },
      data: { effectiveTo: dateOnly, endedByUserId: input.actorUserId, endedReason: input.reason },
    }),
    context.prisma.projectEmployeeAllocation.updateMany({
      where: { corporationId: input.corporationId, employmentId: employment.id, effectiveTo: null },
      data: { effectiveTo: input.effectiveAt, endedByUserId: input.actorUserId, endedReason: input.reason },
    }),
  ]);
  if (period.count !== 1 || roles.count !== 1 || allocation.count > 1) {
    throw new AppError({ code: "EMPLOYMENT_TERMINATION_CURRENT_STATE_CONFLICT", message: "Employment is no longer active", statusCode: 409 });
  }
  await context.prisma.projectTechnicalResponsibility.updateMany({
    where: { id: { in: responsibilities.map((item) => item.id) }, effectiveTo: null },
    data: { effectiveTo: input.effectiveAt, endedByUserId: input.actorUserId, endedReason: input.reason },
  });
  const updated = await context.prisma.employment.updateMany({
    where: { id: employment.id, state: "ACTIVE", isActive: true },
    data: { state: "TERMINATED", isActive: false, terminatedAt: input.effectiveAt },
  });
  if (updated.count !== 1) {
    throw new AppError({ code: "EMPLOYMENT_TERMINATION_CURRENT_STATE_CONFLICT", message: "Employment is no longer active", statusCode: 409 });
  }
  return { employmentId: employment.id, terminatedAt: input.effectiveAt, closedAllocation: allocation.count === 1 };
}

async function findPersonByDigest(
  context: HandlerContext,
  input: { corporationId: string; documentDigest: string },
): Promise<PersonRecord | null> {
  return (await context.prisma.person.findFirst({
    where: {
      corporationId: input.corporationId,
      documentDigest: input.documentDigest,
    },
    select: personSelect,
  })) as PersonRecord | null;
}

async function createPerson(
  context: HandlerContext,
  input: WorkforceCreateData,
): Promise<PersonRecord> {
  return (await context.prisma.person.create({
    data: {
      corporationId: input.corporationId,
      documentType: input.documentType,
      ciphertext: input.ciphertext,
      iv: input.iv,
      authTag: input.authTag,
      encryptionKeyVersion: input.encryptionKeyVersion,
      documentDigest: input.documentDigest,
      displayName: input.fullName,
      fullName: input.fullName,
    },
    select: personSelect,
  })) as PersonRecord;
}

export async function findOrCreatePersonHandler(
  context: HandlerContext,
  input: WorkforceCreateData,
): Promise<PersonRecord> {
  const existing = await findPersonByDigest(context, input);
  if (existing) return existing;

  try {
    return await createPerson(context, input);
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    const concurrent = await findPersonByDigest(context, input);
    if (concurrent) return concurrent;
    throw error;
  }
}

export async function assertEmploymentCanBeCreatedHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    personId: string;
    companyRegistrationNumber: string;
  },
) {
  const [existingEmployment, existingRegistration] = await Promise.all([
    context.prisma.employment.findFirst({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        personId: input.personId,
        isActive: true,
      },
      select: { id: true },
    }),
    context.prisma.employment.findFirst({
      where: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        companyRegistrationNumber: input.companyRegistrationNumber,
        isActive: true,
      },
      select: { id: true },
    }),
  ]);

  if (existingEmployment) throw employmentAlreadyExistsError();
  if (existingRegistration) throw registrationNumberAlreadyExistsError();
}

export async function createEmploymentWithFirstPeriodHandler(
  context: HandlerContext,
  input: WorkforceCreateData & { personId: string; jobRoleId: string },
): Promise<EmploymentRecord> {
  try {
    const role = await context.prisma.jobRole.findFirst({
      where: {
        id: input.jobRoleId,
        corporationId: input.corporationId,
        companyId: input.companyId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!role)
      throw new AppError({
        code: "JOB_ROLE_UNAVAILABLE",
        message: "Job role is unavailable",
        statusCode: 409,
      });
    const employment = await context.prisma.employment.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        personId: input.personId,
        companyRegistrationNumber: input.companyRegistrationNumber,
      },
      select: { id: true },
    });
    await context.prisma.employmentPeriod.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: employment.id,
        admissionDate: input.admissionDate,
        effectiveFrom: input.admissionDate,
      },
      select: { id: true },
    });
    await context.prisma.employmentJobRolePeriod.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: employment.id,
        jobRoleId: role.id,
        effectiveFrom: input.admissionDate,
      },
    });
    return findEmployeeDetailHandler(context, {
      corporationId: input.corporationId,
      companyId: input.companyId,
      employmentId: employment.id,
    });
  } catch (error) {
    if (isUniqueError(error)) {
      await assertEmploymentCanBeCreatedHandler(context, input);
      throw registrationNumberAlreadyExistsError();
    }
    throw error;
  }
}

const normalizeRoleName = (value: string) =>
  value.trim().normalize("NFC").toLocaleLowerCase("pt-BR");

export async function listJobRolesHandler(
  context: HandlerContext,
  scope: { corporationId: string; companyId: string },
) {
  return context.prisma.jobRole.findMany({
    where: {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createJobRoleHandler(
  context: HandlerContext,
  input: { corporationId: string; companyId: string; name: string },
) {
  const { corporationId, companyId, name } = input;
  try {
    return await context.prisma.jobRole.create({
      data: {
        corporationId,
        companyId,
        name,
        normalizedName: normalizeRoleName(name),
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (isUniqueError(error))
      throw new AppError({
        code: "JOB_ROLE_ALREADY_EXISTS",
        message: "A job role with this name already exists",
        statusCode: 409,
      });
    throw error;
  }
}

export async function updateJobRoleHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    jobRoleId: string;
    name?: string;
    isActive?: boolean;
  },
) {
  const existing = await context.prisma.jobRole.findFirst({
    where: {
      id: input.jobRoleId,
      corporationId: input.corporationId,
      companyId: input.companyId,
    },
    select: { id: true },
  });
  if (!existing)
    throw new AppError({
      code: "NOT_FOUND",
      message: "Job role not found",
      statusCode: 404,
    });
  try {
    return await context.prisma.jobRole.update({
      where: { id: existing.id },
      data: {
        ...(input.name === undefined
          ? {}
          : {
              name: input.name,
              normalizedName: normalizeRoleName(input.name),
            }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (isUniqueError(error))
      throw new AppError({
        code: "JOB_ROLE_ALREADY_EXISTS",
        message: "A job role with this name already exists",
        statusCode: 409,
      });
    throw error;
  }
}

export async function changeEmploymentJobRoleHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    employmentId: string;
    jobRoleId: string;
    reason: string;
    effectiveDate: Date;
  },
) {
  const employment = await context.prisma.employment.findFirst({
    where: {
      id: input.employmentId,
      corporationId: input.corporationId,
      companyId: input.companyId,
      isActive: true,
      state: "ACTIVE",
    },
    select: { id: true },
  });
  const role = await context.prisma.jobRole.findFirst({
    where: {
      id: input.jobRoleId,
      corporationId: input.corporationId,
      companyId: input.companyId,
      isActive: true,
    },
    select: { id: true },
  });
  const current = await context.prisma.employmentJobRolePeriod.findFirst({
    where: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      employmentId: input.employmentId,
      effectiveTo: null,
    },
    select: { id: true, jobRoleId: true },
  });
  if (!employment) throw notFoundError();
  if (!role)
    throw new AppError({
      code: "JOB_ROLE_UNAVAILABLE",
      message: "Job role is unavailable",
      statusCode: 409,
    });
  if (!current || current.jobRoleId === role.id)
    throw new AppError({
      code: "JOB_ROLE_CHANGE_CONFLICT",
      message: "Employment does not have a different current job role",
      statusCode: 409,
    });
  try {
    await context.prisma.employmentJobRolePeriod.update({
      where: { id: current.id },
      data: { effectiveTo: input.effectiveDate },
    });
    await context.prisma.employmentJobRolePeriod.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: input.employmentId,
        jobRoleId: role.id,
        reason: input.reason,
        effectiveFrom: input.effectiveDate,
      },
    });
  } catch (error) {
    if (isUniqueError(error))
      throw new AppError({
        code: "JOB_ROLE_CHANGE_CONFLICT",
        message: "Employee job role changed concurrently",
        statusCode: 409,
      });
    throw error;
  }
  return findEmployeeDetailHandler(context, input);
}

function boundaryWhere({
  boundary,
  sortBy,
  sortDirection,
}: {
  boundary: CursorBoundary | null;
  sortBy: "name" | "createdAt";
  sortDirection: SortDirection;
}): Prisma.EmploymentWhereInput | undefined {
  if (!boundary) return undefined;
  if (sortBy === "createdAt") {
    const createdAt = new Date(String(boundary.value));
    return sortDirection === "asc"
      ? {
          OR: [
            { createdAt: { gt: createdAt } },
            { createdAt, id: { gt: boundary.id } },
          ],
        }
      : {
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt, id: { lt: boundary.id } },
          ],
        };
  }

  const displayName = String(boundary.value);
  return sortDirection === "asc"
    ? {
        OR: [
          { person: { displayName: { gt: displayName } } },
          { person: { displayName }, id: { gt: boundary.id } },
        ],
      }
    : {
        OR: [
          { person: { displayName: { lt: displayName } } },
          { person: { displayName }, id: { lt: boundary.id } },
        ],
      };
}

function orderBy({
  sortBy,
  sortDirection,
}: {
  sortBy: "name" | "createdAt";
  sortDirection: SortDirection;
}): Prisma.EmploymentOrderByWithRelationInput[] {
  if (sortBy === "name") {
    return [{ person: { displayName: sortDirection } }, { id: sortDirection }];
  }
  return [{ createdAt: sortDirection }, { id: sortDirection }];
}

function searchWhere(search?: string): Prisma.EmploymentWhereInput | undefined {
  if (!search) return undefined;
  return {
    OR: [
      { companyRegistrationNumber: { contains: search, mode: "insensitive" } },
      { person: { displayName: { contains: search, mode: "insensitive" } } },
      { person: { fullName: { contains: search, mode: "insensitive" } } },
    ],
  };
}

export async function listEmployeesHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    search?: string;
    state?: "active" | "terminated";
    limit: number;
    boundary: CursorBoundary | null;
    sortBy: "name" | "createdAt";
    sortDirection: SortDirection;
  },
): Promise<EmploymentRecord[]> {
  return (await context.prisma.employment.findMany({
    where: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      ...(input.state === "terminated"
        ? { isActive: false, state: "TERMINATED" as const }
        : { isActive: true, state: "ACTIVE" as const }),
      ...searchWhere(input.search),
      ...boundaryWhere(input),
    },
    orderBy: orderBy(input),
    take: input.limit + 1,
    select: employmentSelect,
  })) as EmploymentRecord[];
}

export async function findEmployeeDetailHandler(
  context: HandlerContext,
  input: { corporationId: string; companyId: string; employmentId: string },
): Promise<EmploymentRecord> {
  const record = (await context.prisma.employment.findFirst({
    where: {
      id: input.employmentId,
      corporationId: input.corporationId,
      companyId: input.companyId,
    },
    select: employmentSelect,
  })) as EmploymentRecord | null;

  if (!record) throw notFoundError();
  return record;
}

export async function rehireEmploymentHandler(
  context: HandlerContext,
  input: {
    corporationId: string;
    companyId: string;
    employmentId: string;
    effectiveDate: Date;
  },
): Promise<EmploymentRecord> {
  const employment = await context.prisma.employment.findFirst({
    where: {
      id: input.employmentId,
      corporationId: input.corporationId,
      companyId: input.companyId,
    },
    select: { id: true, state: true, isActive: true },
  });

  if (!employment) throw notFoundError();

  const openPeriod = await context.prisma.employmentPeriod.findFirst({
    where: {
      corporationId: input.corporationId,
      companyId: input.companyId,
      employmentId: input.employmentId,
      effectiveTo: null,
    },
    select: { id: true },
  });

  if (employment.isActive || employment.state === "ACTIVE" || openPeriod) {
    throw currentStateConflictError();
  }

  try {
    await context.prisma.employmentPeriod.create({
      data: {
        corporationId: input.corporationId,
        companyId: input.companyId,
        employmentId: input.employmentId,
        admissionDate: input.effectiveDate,
        effectiveFrom: input.effectiveDate,
      },
      select: { id: true },
    });
    await context.prisma.employment.update({
      where: {
        corporationId_companyId_id: {
          corporationId: input.corporationId,
          companyId: input.companyId,
          id: input.employmentId,
        },
      },
      data: {
        isActive: true,
        state: "ACTIVE",
        terminatedAt: null,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isOpenPeriodUniqueError(error)) {
      throw currentStateConflictError();
    }
    throw error;
  }

  return findEmployeeDetailHandler(context, input);
}

import { AppError } from "../../lib/utils/appError";
import {
  buildCursorPage,
  parseBoundCursor,
} from "../../lib/utils/cursor-pagination";
import type { HandlerContext } from "../../lib/utils/handler.dto";
import {
  protectSensitiveDocument,
  toMaskedDocumentDto,
  toProtectedDocumentDto,
} from "../../lib/security/sensitive-document";
import type {
  AllocateEmployeeInput,
  ChangeEmployeeJobRoleInput,
  CreateEmployeeInput,
  CreateJobRoleInput,
  ListEmployeesQuery,
  ReallocateEmployeeInput,
  ReleaseEmployeeAllocationInput,
  ReplaceEmployeeAllocationTermsInput,
  TerminateEmploymentInput,
  UpdateJobRoleInput,
} from "./workforce.dto";
import {
  assertEmploymentCanBeCreatedHandler,
  createEmploymentWithFirstPeriodHandler,
  findEmployeeDetailHandler,
  findOrCreatePersonHandler,
  listEmployeesHandler,
  rehireEmploymentHandler,
  changeEmploymentJobRoleHandler,
  createJobRoleHandler,
  listJobRolesHandler,
  updateJobRoleHandler,
  createEmployeeAllocationHandler,
  releaseEmployeeAllocationHandler,
  reallocateEmployeeHandler,
  replaceEmployeeAllocationTermsHandler,
  findAllocatedPersonIdsHandler,
  findCurrentEmployeeAllocationHandler,
  listReallocationDestinationsHandler,
  terminateEmploymentHandler,
  type EmploymentRecord,
  type PersonRecord,
} from "./handlers/workforce.handler";

interface AuthenticatedCompanyScope {
  corporationId: string;
  companyId: string;
}

interface AllocationScope extends AuthenticatedCompanyScope {
  actorUserId: string;
  sessionId: string;
}

function parseAdmissionDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function protectedPersonDocument(record: PersonRecord) {
  return {
    authTag: record.authTag,
    ciphertext: record.ciphertext,
    documentType: record.documentType,
    encryptionKeyVersion: record.encryptionKeyVersion,
    iv: record.iv,
  };
}

function assertCpf(documentType: "CPF" | "CNPJ") {
  if (documentType !== "CPF") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Employee document must be a CPF",
      statusCode: 400,
    });
  }
}

function normalizedQueryForCursor(query: ListEmployeesQuery) {
  return {
    availability: query.availability ?? null,
    search: query.search?.toLocaleLowerCase("pt-BR") ?? null,
    state: query.state ?? null,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  };
}

function scopeForCursor(scope: AuthenticatedCompanyScope) {
  return {
    corporationId: scope.corporationId,
    companyId: scope.companyId,
  };
}

function currentPeriod(record: EmploymentRecord) {
  return record.periods.find((period) => period.effectiveTo === null) ?? null;
}

function openPeriods(record: EmploymentRecord) {
  return record.periods.filter((period) => period.effectiveTo === null);
}

function periodDto(period: EmploymentRecord["periods"][number]) {
  return {
    id: period.id,
    admissionDate: period.admissionDate.toISOString().slice(0, 10),
    effectiveFrom: period.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: period.effectiveTo?.toISOString().slice(0, 10) ?? null,
    terminationReason: period.terminationReason,
    createdAt: period.createdAt.toISOString(),
    updatedAt: period.updatedAt.toISOString(),
    state:
      period.effectiveTo === null ? ("current" as const) : ("closed" as const),
  };
}

function periodsForDetail(record: EmploymentRecord) {
  return [...record.periods].sort((left, right) => {
    if (left.effectiveTo === null && right.effectiveTo !== null) return -1;
    if (left.effectiveTo !== null && right.effectiveTo === null) return 1;
    return right.effectiveFrom.getTime() - left.effectiveFrom.getTime();
  });
}

function isCurrentEmployment(record: EmploymentRecord) {
  return (
    record.state === "ACTIVE" &&
    record.isActive &&
    openPeriods(record).length === 1
  );
}

function availabilityDto(record: EmploymentRecord, hasOpenAllocation = false) {
  const hasCurrentJobRole = record.jobRolePeriods.some(
    (period) => period.effectiveTo === null,
  );
  return {
    state:
      isCurrentEmployment(record) && hasCurrentJobRole && !hasOpenAllocation
        ? ("available" as const)
        : ("unavailable" as const),
    hasOpenAllocation,
    functionPending: !hasCurrentJobRole,
  };
}

function toListDto(
  record: EmploymentRecord,
  allocatedPersonIds = new Set<string>(),
) {
  const openPeriod = currentPeriod(record);
  const currentJobRole =
    record.jobRolePeriods.find((period) => period.effectiveTo === null) ?? null;
  return {
    id: record.id,
    person: {
      id: record.person.id,
      fullName: record.person.fullName,
      displayName: record.person.displayName,
      document: toMaskedDocumentDto(protectedPersonDocument(record.person)),
    },
    employment: {
      id: record.id,
      companyRegistrationNumber: record.companyRegistrationNumber,
      state: isCurrentEmployment(record) ? "active" : "terminated",
      isActive: isCurrentEmployment(record),
      admissionDate:
        openPeriod?.admissionDate.toISOString().slice(0, 10) ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      jobRole: currentJobRole
        ? {
            id: currentJobRole.jobRole.id,
            name: currentJobRole.jobRole.name,
            periodId: currentJobRole.id,
          }
        : null,
    },
    availability: availabilityDto(
      record,
      allocatedPersonIds.has(record.person.id),
    ),
  };
}

function toDetailDto(record: EmploymentRecord) {
  return {
    ...toListDto(record),
    person: {
      id: record.person.id,
      fullName: record.person.fullName,
      displayName: record.person.displayName,
      document: toProtectedDocumentDto(protectedPersonDocument(record.person)),
      createdAt: record.person.createdAt.toISOString(),
      updatedAt: record.person.updatedAt.toISOString(),
    },
    periods: periodsForDetail(record).map(periodDto),
    jobRolePeriods: record.jobRolePeriods.map((period) => ({
      id: period.id,
      jobRole: { id: period.jobRole.id, name: period.jobRole.name },
      effectiveFrom: period.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: period.effectiveTo?.toISOString().slice(0, 10) ?? null,
      reason: period.reason,
      state:
        period.effectiveTo === null
          ? ("current" as const)
          : ("closed" as const),
    })),
    currentAllocation: null,
  };
}

function allocationDto(
  allocation: {
    id: string;
    employmentId: string;
    personId: string;
    projectId: string;
    jobRole: string;
    monthlyWorkloadHours: number;
    compensationMode: string;
    compensationValue: { toFixed: (digits: number) => string };
    overtimeRate: { toFixed: (digits: number) => string };
    effectiveFrom: Date;
    effectiveTo: Date | null;
    endedReason: string | null;
  },
  project: { id: string; name: string; status: string },
) {
  return {
    id: allocation.id,
    employmentId: allocation.employmentId,
    personId: allocation.personId,
    project: {
      id: project.id,
      name: project.name,
      status: project.status.toLowerCase(),
    },
    jobRole: allocation.jobRole,
    monthlyWorkloadHours: allocation.monthlyWorkloadHours,
    compensationMode: allocation.compensationMode,
    compensationValue: allocation.compensationValue.toFixed(2),
    overtimeRate: allocation.overtimeRate.toFixed(2),
    effectiveFrom: allocation.effectiveFrom.toISOString(),
    effectiveTo: allocation.effectiveTo?.toISOString() ?? null,
    endedReason: allocation.endedReason,
  };
}

export class WorkforceService {
  constructor(private readonly context: HandlerContext) {}

  async create(scope: AuthenticatedCompanyScope, input: CreateEmployeeInput) {
    return this.context.transaction(async (transactionContext) => {
      const protectedDocument = protectSensitiveDocument({
        document: input.document,
        registryType: "PERSON",
      });
      assertCpf(protectedDocument.documentType);
      const person = await findOrCreatePersonHandler(transactionContext, {
        ...scope,
        ...protectedDocument,
        documentType: "CPF",
        fullName: input.fullName,
        companyRegistrationNumber: input.companyRegistrationNumber,
        admissionDate: parseAdmissionDate(input.admissionDate),
      });
      await assertEmploymentCanBeCreatedHandler(transactionContext, {
        ...scope,
        personId: person.id,
        companyRegistrationNumber: input.companyRegistrationNumber,
      });
      const employment = await createEmploymentWithFirstPeriodHandler(
        transactionContext,
        {
          ...scope,
          ...protectedDocument,
          documentType: "CPF",
          fullName: input.fullName,
          personId: person.id,
          companyRegistrationNumber: input.companyRegistrationNumber,
          admissionDate: parseAdmissionDate(input.admissionDate),
          jobRoleId: input.jobRoleId,
        },
      );
      return toDetailDto(employment);
    });
  }

  async list(scope: AuthenticatedCompanyScope, query: ListEmployeesQuery) {
    const normalizedQuery = normalizedQueryForCursor(query);
    const boundary = parseBoundCursor({
      cursor: query.cursor,
      query: normalizedQuery,
      resource: "employees",
      scope: scopeForCursor(scope),
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const records = await listEmployeesHandler(this.context, {
      ...scope,
      search: query.search,
      state: query.state,
      limit: query.limit,
      boundary,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
    const page = buildCursorPage({
      items: records,
      limit: query.limit,
      query: normalizedQuery,
      resource: "employees",
      scope: scopeForCursor(scope),
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      getLast: (item) => ({
        id: item.id,
        value:
          query.sortBy === "createdAt"
            ? item.createdAt.toISOString()
            : item.person.displayName,
      }),
    });
    const allocationRows = await findAllocatedPersonIdsHandler(
      this.context,
      scope.corporationId,
      page.data.map((item) => item.person.id),
    );
    const allocatedPersonIds = new Set(
      allocationRows.map((row) => row.personId),
    );
    return {
      data: page.data.map((record) => toListDto(record, allocatedPersonIds)),
      pageInfo: page.pageInfo,
    };
  }

  async detail(scope: AuthenticatedCompanyScope, employmentId: string) {
    const record = await findEmployeeDetailHandler(this.context, {
      ...scope,
      employmentId,
    });
    const current = await findCurrentEmployeeAllocationHandler(this.context, {
      corporationId: scope.corporationId,
      personId: record.person.id,
    });
    return {
      ...toDetailDto(record),
      currentAllocation: current
        ? allocationDto(current.allocation, current.project)
        : null,
    };
  }

  async allocate(scope: AllocationScope, input: AllocateEmployeeInput) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        async (tx) => {
          const result = await createEmployeeAllocationHandler(tx, {
            ...scope,
            ...input,
            effectiveFrom: new Date(),
          });
          const allocation = result.allocation;
          return allocationDto(
            { ...allocation, effectiveTo: null, endedReason: null },
            result.project,
          );
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async releaseAllocation(
    scope: AllocationScope,
    allocationId: string,
    input: ReleaseEmployeeAllocationInput,
  ) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        async (tx) => {
          const result = await releaseEmployeeAllocationHandler(tx, {
            ...scope,
            allocationId,
            reason: input.reason,
            effectiveTo: new Date(),
          });
          return allocationDto(result.allocation, result.project);
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async reallocateAllocation(
    scope: AllocationScope,
    allocationId: string,
    input: ReallocateEmployeeInput,
  ) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        async (tx) => {
          const result = await reallocateEmployeeHandler(tx, {
            ...scope,
            allocationId,
            ...input,
            effectiveAt: new Date(),
          });
          return {
            source: allocationDto(result.source, result.sourceProject),
            destination: allocationDto(
              result.destination,
              result.destinationProject,
            ),
          };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async replaceAllocationTerms(
    scope: AllocationScope,
    allocationId: string,
    input: ReplaceEmployeeAllocationTermsInput,
  ) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        async (tx) => {
          const result = await replaceEmployeeAllocationTermsHandler(tx, {
            ...scope,
            allocationId,
            ...input,
            effectiveAt: new Date(),
          });
          return {
            previous: allocationDto(result.previous, result.project),
            current: allocationDto(result.current, result.project),
          };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async listReallocationDestinations(
    scope: AuthenticatedCompanyScope,
    employmentId: string,
  ) {
    return listReallocationDestinationsHandler(this.context, {
      corporationId: scope.corporationId,
      companyId: scope.companyId,
      employmentId,
    });
  }

  async terminate(
    scope: AllocationScope,
    employmentId: string,
    input: TerminateEmploymentInput,
  ) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        (tx) =>
          terminateEmploymentHandler(tx, {
            ...scope,
            employmentId,
            reason: input.reason,
            effectiveAt: new Date(),
          }),
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async rehire(scope: AuthenticatedCompanyScope, employmentId: string) {
    return runSerializableWithRetry(async () =>
      this.context.transaction(
        async (transactionContext) => {
          const effectiveDate = todayUtc();
          const record = await rehireEmploymentHandler(transactionContext, {
            ...scope,
            employmentId,
            effectiveDate,
          });
          return toDetailDto(record);
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async listJobRoles(scope: AuthenticatedCompanyScope) {
    return listJobRolesHandler(this.context, scope);
  }
  async createJobRole(
    scope: AuthenticatedCompanyScope,
    input: CreateJobRoleInput,
  ) {
    return createJobRoleHandler(this.context, { ...scope, ...input });
  }
  async updateJobRole(
    scope: AuthenticatedCompanyScope,
    jobRoleId: string,
    input: UpdateJobRoleInput,
  ) {
    return updateJobRoleHandler(this.context, {
      ...scope,
      jobRoleId,
      ...input,
    });
  }
  async changeJobRole(
    scope: AuthenticatedCompanyScope,
    employmentId: string,
    input: ChangeEmployeeJobRoleInput,
  ) {
    return runSerializableWithRetry(() =>
      this.context.transaction(
        async (tx) => {
          const result = await changeEmploymentJobRoleHandler(tx, {
            ...scope,
            employmentId,
            ...input,
            effectiveDate: todayUtc(),
          });
          return toDetailDto(result);
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }
}

function todayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function runSerializableWithRetry<T>(work: () => Promise<T>) {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

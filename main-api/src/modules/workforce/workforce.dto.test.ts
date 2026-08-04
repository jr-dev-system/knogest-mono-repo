import { describe, expect, it } from "vitest";

import {
  createEmployeeSchema,
  allocateEmployeeSchema,
  releaseEmployeeAllocationSchema,
  reallocateEmployeeSchema,
  replaceEmployeeAllocationTermsSchema,
  terminateEmploymentSchema,
  listEmployeesQuerySchema,
  rehireEmployeeSchema,
} from "./workforce.dto";

describe("workforce DTOs", () => {
  it("accepts normalized effective allocation terms and rejects untrusted or imprecise input", () => {
    expect(
      allocateEmployeeSchema.parse({
        employmentId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        jobRole: "Operador",
        monthlyWorkloadHours: 744,
        compensationMode: "monthly",
        compensationValue: "0.00",
        overtimeRate: "12.50",
      }),
    ).toMatchObject({ compensationValue: "0.00" });
    expect(() =>
      allocateEmployeeSchema.parse({
        employmentId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        jobRole: "Operador",
        monthlyWorkloadHours: 745,
        compensationMode: "monthly",
        compensationValue: "0.00",
        overtimeRate: "12.50",
      }),
    ).toThrow();
    expect(() =>
      allocateEmployeeSchema.parse({
        employmentId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        jobRole: "Operador",
        monthlyWorkloadHours: 1,
        compensationMode: "monthly",
        compensationValue: "1.001",
        overtimeRate: "0.00",
        corporationId: "00000000-0000-4000-8000-000000000003",
      }),
    ).toThrow();
  });

  it("normalizes lifecycle reasons and requires complete replacement terms", () => {
    expect(
      releaseEmployeeAllocationSchema.parse({
        reason: "  Mobilização encerrada  ",
      }),
    ).toEqual({ reason: "Mobilização encerrada" });
    expect(() =>
      releaseEmployeeAllocationSchema.parse({ reason: "\u0000" }),
    ).toThrow();
    const terms = {
      jobRole: "Operador",
      monthlyWorkloadHours: 220,
      compensationMode: "daily" as const,
      compensationValue: "0.00",
      overtimeRate: "12.50",
      reason: "Novo acordo",
    };
    expect(replaceEmployeeAllocationTermsSchema.parse(terms)).toMatchObject(
      terms,
    );
    expect(() =>
      replaceEmployeeAllocationTermsSchema.parse({
        ...terms,
        compensationValue: "1.5",
      }),
    ).toThrow();
    expect(
      reallocateEmployeeSchema.parse({
        ...terms,
        destinationCompanyId: "00000000-0000-4000-8000-000000000003",
        destinationProjectId: "00000000-0000-4000-8000-000000000004",
      }),
    ).toMatchObject({
      destinationCompanyId: "00000000-0000-4000-8000-000000000003",
    });
  });

  it("normalizes and requires the auditable termination reason", () => {
    expect(
      terminateEmploymentSchema.parse({
        reason: "  Encerramento solicitado  ",
      }),
    ).toEqual({ reason: "Encerramento solicitado" });
    expect(() => terminateEmploymentSchema.parse({ reason: "" })).toThrow();
    expect(() =>
      terminateEmploymentSchema.parse({
        reason: "Encerramento",
        actorUserId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
  });
  it("accepts the minimal Employee registration command", () => {
    expect(
      createEmployeeSchema.parse({
        document: "529.982.247-25",
        fullName: "Synthetic Worker",
        companyRegistrationNumber: "EMP-001",
        admissionDate: "2026-07-01",
        jobRoleId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toMatchObject({
      fullName: "Synthetic Worker",
      companyRegistrationNumber: "EMP-001",
    });
  });

  it("rejects scope and lifecycle fields from Employee registration payloads", () => {
    expect(() =>
      createEmployeeSchema.parse({
        document: "529.982.247-25",
        fullName: "Synthetic Worker",
        companyRegistrationNumber: "EMP-001",
        admissionDate: "2026-07-01",
        jobRoleId: "00000000-0000-4000-8000-000000000001",
        corporationId: "00000000-0000-0000-0000-000000000000",
        isActive: false,
      }),
    ).toThrow();
  });

  it("accepts only an empty Employee rehire command", () => {
    expect(rehireEmployeeSchema.parse({})).toEqual({});
    expect(() =>
      rehireEmployeeSchema.parse({
        admissionDate: "2026-07-01",
        corporationId: "00000000-0000-0000-0000-000000000000",
        employmentPeriodId: "00000000-0000-0000-0000-000000000001",
        isActive: true,
        personId: "00000000-0000-0000-0000-000000000002",
        projectId: "00000000-0000-0000-0000-000000000003",
      }),
    ).toThrow();
  });

  it("normalizes list query defaults and allowlists filters", () => {
    expect(listEmployeesQuerySchema.parse({})).toEqual({
      limit: 25,
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    expect(() => listEmployeesQuerySchema.parse({ sortBy: "role" })).toThrow();
    expect(
      listEmployeesQuerySchema.parse({ state: "terminated" }),
    ).toMatchObject({ state: "terminated" });
  });
});

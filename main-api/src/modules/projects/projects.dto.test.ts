import { describe, expect, it } from "vitest";
import {
  formatProjectAddress,
  projectCommandSchema,
  projectIdempotencyKeySchema,
  projectQuantityBaselineRevisionCommandSchema,
  projectReadinessCommandSchema,
  projectTeamCandidatesQuerySchema,
  projectTeamMembersQuerySchema,
  projectWorkFrontCommandSchema,
  projectWorkFrontMobilizationOptionsQuerySchema,
  projectWorkFrontServicesCommandSchema,
  type ProjectCommand,
} from "./projects.dto";

const supplierOffer = (): ProjectCommand["projectSupplierOffers"][number] => ({
  supplierId: "00000000-0000-4000-8000-000000000701",
  itemId: "00000000-0000-4000-8000-000000000702",
  sourceOfferId: null,
  purchaseUnitId: "00000000-0000-4000-8000-00000000a001",
  conversionToBase: "1.000000",
  price: "1.0000",
});

const command: ProjectCommand = {
  name: "Project",
  address: {
    postalCode: "60170000",
    street: "Rua A",
    number: "10",
    complement: null,
    neighborhood: "Meireles",
    city: "Fortaleza",
    state: "CE",
  },
  latitude: null,
  longitude: null,
  contractNumber: null,
  approvedBudget: "0.00",
  plannedStartDate: "2026-07-01",
  plannedEndDate: null,
  clientId: "00000000-0000-4000-8000-000000000201",
  managerEmploymentId: "00000000-0000-4000-8000-000000000301",
  technicalResponsibilityEmploymentIds: [
    "00000000-0000-4000-8000-000000000301",
  ],
  weeklySchedule: Array.from({ length: 7 }, (_, index) => ({
    shift: "day",
    dayOfWeek: index + 1,
    isWorking: index === 0,
    startTime: index === 0 ? "08:00" : null,
    endTime: index === 0 ? "17:00" : null,
    endDayOffset: 0,
  })),
  breakTemplates: [],
  initialEmployeeAllocations: [],
  initialMachineAllocations: [],
  projectSupplierOffers: [],
};

describe("Projects DTO", () => {
  it("binds team candidate pages to a shift and limits each page to 15", () => {
    expect(
      projectTeamCandidatesQuerySchema.parse({
        shift: "day",
        search: " operador ",
      }),
    ).toMatchObject({ shift: "day", limit: 15, search: "operador" });
    expect(() =>
      projectTeamCandidatesQuerySchema.parse({ shift: "night", limit: 16 }),
    ).toThrow();
    expect(() =>
      projectTeamCandidatesQuerySchema.parse({
        shift: "day",
        cursor: "cursor com espaço",
      }),
    ).toThrow();
  });

  it("normalizes filters and limits the operational team listing to 15 members per cursor page", () => {
    expect(
      projectTeamMembersQuerySchema.parse({
        shift: "night",
        search: "  ana  ",
        jobRole: "  Operador  ",
      }),
    ).toEqual({
      shift: "night",
      limit: 15,
      search: "ana",
      jobRole: "Operador",
    });
    expect(() =>
      projectTeamMembersQuerySchema.parse({ shift: "day", limit: 16 }),
    ).toThrow();
    expect(() =>
      projectTeamMembersQuerySchema.parse({
        shift: "day",
        search: "a".repeat(121),
      }),
    ).toThrow();
  });

  it("limits work-front mobilization searches to cursor pages of 15", () => {
    expect(
      projectWorkFrontMobilizationOptionsQuerySchema.parse({
        resourceType: "machine",
        search: "  escavadeira  ",
      }),
    ).toEqual({
      resourceType: "machine",
      search: "escavadeira",
      limit: 15,
    });
    expect(() =>
      projectWorkFrontMobilizationOptionsQuerySchema.parse({
        resourceType: "employee",
        limit: 16,
      }),
    ).toThrow();
  });

  it("accepts the minimal aggregate", () =>
    expect(projectCommandSchema.safeParse(command).success).toBe(true));

  it("accepts independent overnight schedules and same-shift machine operators", () => {
    const nightOperator = "00000000-0000-4000-8000-000000000302";
    const nightSchedule = command.weeklySchedule.map((day) => ({
      ...day,
      shift: "night" as const,
      startTime: day.isWorking ? "18:00" : null,
      endTime: day.isWorking ? "06:00" : null,
      endDayOffset: day.isWorking ? 1 : 0,
    }));
    const result = projectCommandSchema.safeParse({
      ...command,
      weeklySchedule: [...command.weeklySchedule, ...nightSchedule],
      initialEmployeeAllocations: [
        {
          employmentId: nightOperator,
          shift: "night",
          confirmedJobRolePeriodId: "00000000-0000-4000-8000-000000000402",
          monthlyWorkloadHours: 220,
          compensationMode: "monthly",
          compensationValue: "0.00",
          overtimeRate: "0.00",
        },
      ],
      initialMachineAllocations: [
        {
          machineId: "00000000-0000-4000-8000-000000000501",
          startMeterReadingId: "00000000-0000-4000-8000-000000000601",
          operatorAssignments: [
            { shift: "night", operatorEmploymentId: nightOperator },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a machine operator assigned outside the worker shift", () => {
    const operator = "00000000-0000-4000-8000-000000000302";
    expect(
      projectCommandSchema.safeParse({
        ...command,
        initialEmployeeAllocations: [
          {
            employmentId: operator,
            shift: "day",
            confirmedJobRolePeriodId: "00000000-0000-4000-8000-000000000402",
            monthlyWorkloadHours: 220,
            compensationMode: "monthly",
            compensationValue: "0.00",
            overtimeRate: "0.00",
          },
        ],
        initialMachineAllocations: [
          {
            machineId: "00000000-0000-4000-8000-000000000501",
            startMeterReadingId: "00000000-0000-4000-8000-000000000601",
            operatorAssignments: [
              { shift: "night", operatorEmploymentId: operator },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("only accepts supplier offers after project creation", () => {
    expect(
      projectCommandSchema.safeParse({
        ...command,
        projectSupplierOffers: [supplierOffer()],
      }).success,
    ).toBe(false);
    expect(
      projectCommandSchema.safeParse({
        ...command,
        projectSupplierOffers: [
          {
            ...supplierOffer(),
            supplierId: undefined,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts readiness offers from existing, project-only and company catalog sources", () => {
    expect(
      projectReadinessCommandSchema.safeParse({
        fuelOffers: [
          {
            mode: "existing",
            sourceOfferId: "00000000-0000-4000-8000-000000000701",
            price: "7.5000",
          },
          {
            mode: "projectOnly",
            supplierId: "00000000-0000-4000-8000-000000000702",
            itemId: "00000000-0000-4000-8000-000000000703",
            purchaseUnitId: "00000000-0000-4000-8000-000000000704",
            conversionToBase: "1.000000",
            price: "7.7000",
          },
          {
            mode: "companyCatalog",
            supplierId: "00000000-0000-4000-8000-000000000705",
            itemId: "00000000-0000-4000-8000-000000000706",
            purchaseUnitId: "00000000-0000-4000-8000-000000000707",
            conversionToBase: "1.000000",
            price: "7.9000",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts addresses without numbers", () => {
    expect(
      projectCommandSchema.safeParse({
        ...command,
        address: { ...command.address, number: "" },
      }).success,
    ).toBe(true);
    expect(
      projectCommandSchema.safeParse({
        ...command,
        address: { ...command.address, number: null },
      }).success,
    ).toBe(true);
    expect(
      projectCommandSchema.safeParse({
        ...command,
        address: {
          postalCode: command.address.postalCode,
          street: command.address.street,
          complement: command.address.complement,
          neighborhood: command.address.neighborhood,
          city: command.address.city,
          state: command.address.state,
        },
      }).success,
    ).toBe(true);
  });

  it("formats addresses without a dangling number separator", () => {
    expect(
      formatProjectAddress({ ...command.address, number: null }),
    ).toContain("Rua A - Meireles");
    expect(
      formatProjectAddress({ ...command.address, number: null }),
    ).not.toContain("Rua A,");
  });

  it("rejects incomplete addresses and reversed optional end dates", () => {
    expect(
      projectCommandSchema.safeParse({
        ...command,
        address: { ...command.address, postalCode: "60170-000" },
      }).success,
    ).toBe(false);
    expect(
      projectCommandSchema.safeParse({
        ...command,
        plannedEndDate: "2026-06-30",
      }).success,
    ).toBe(false);
  });
  it("accepts planned date updates and rejects a reversed readiness period", () => {
    expect(
      projectReadinessCommandSchema.safeParse({
        plannedStartDate: "2026-07-02",
        plannedEndDate: "2026-08-02",
      }).success,
    ).toBe(true);
    expect(
      projectReadinessCommandSchema.safeParse({
        plannedStartDate: "2026-08-02",
        plannedEndDate: "2026-07-02",
      }).success,
    ).toBe(false);
  });
  it("rejects unknown properties and over-limit collections", () => {
    expect(
      projectCommandSchema.safeParse({
        ...command,
        companyId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      projectCommandSchema.safeParse({
        ...command,
        breakTemplates: Array.from({ length: 21 }, (_, index) => ({
          shift: "day",
          name: `B${index}`,
          durationMinutes: 1,
        })),
      }).success,
    ).toBe(false);
  });
  it("requires a UUID v4 idempotency key", () => {
    expect(
      projectIdempotencyKeySchema.safeParse(
        "00000000-0000-4000-8000-000000000001",
      ).success,
    ).toBe(true);
    expect(
      projectIdempotencyKeySchema.safeParse(
        "00000000-0000-3000-8000-000000000001",
      ).success,
    ).toBe(false);
  });
  it("requires each initial Machine operator to be part of the initial team", () => {
    const operator = "00000000-0000-4000-8000-000000000302";
    expect(
      projectCommandSchema.safeParse({
        ...command,
        initialEmployeeAllocations: [
          {
            employmentId: operator,
            confirmedJobRolePeriodId: "00000000-0000-4000-8000-000000000402",
            monthlyWorkloadHours: 180,
            compensationMode: "monthly",
            compensationValue: "0.00",
            overtimeRate: "0.00",
          },
        ],
        initialMachineAllocations: [
          {
            machineId: "00000000-0000-4000-8000-000000000501",
            startMeterReadingId: "00000000-0000-4000-8000-000000000601",
            operatorEmploymentId: operator,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      projectCommandSchema.safeParse({
        ...command,
        initialEmployeeAllocations: [
          {
            employmentId: operator,
            confirmedJobRolePeriodId: "00000000-0000-4000-8000-000000000402",
            monthlyWorkloadHours: 220,
            compensationMode: "monthly",
            compensationValue: "0.00",
            overtimeRate: "0.00",
          },
        ],
        initialMachineAllocations: [
          {
            machineId: "00000000-0000-4000-8000-000000000501",
            startMeterReadingId: "00000000-0000-4000-8000-000000000601",
            operatorEmploymentId: operator,
          },
          {
            machineId: "00000000-0000-4000-8000-000000000502",
            startMeterReadingId: "00000000-0000-4000-8000-000000000602",
            operatorEmploymentId: operator,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      projectCommandSchema.safeParse({
        ...command,
        initialMachineAllocations: [
          {
            machineId: "00000000-0000-4000-8000-000000000501",
            startMeterReadingId: "00000000-0000-4000-8000-000000000601",
            operatorEmploymentId: operator,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates earthworks baseline services and work-front quantities", () => {
    expect(
      projectQuantityBaselineRevisionCommandSchema.safeParse({
        items: [
          { serviceCode: "cut", unitCode: "M3", total: "100.00" },
          {
            serviceCode: "unsuitable_soil_removal",
            unitCode: "M3",
            total: "20.00",
          },
          {
            serviceCode: "replacement_fill",
            unitCode: "M3",
            total: "20.00",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      projectWorkFrontCommandSchema.safeParse({
        name: "Frente Norte",
        requiresEmployees: true,
        requiresMachines: true,
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "50.00" }],
      }).success,
    ).toBe(true);
    expect(
      projectWorkFrontCommandSchema.safeParse({
        name: "Frente Norte",
        requiresEmployees: true,
        requiresMachines: true,
        services: [
          { serviceCode: "cut", unitCode: "M3", quantity: "50.00" },
          { serviceCode: "cut", unitCode: "M3", quantity: "10.00" },
        ],
      }).success,
    ).toBe(false);
    expect(
      projectWorkFrontCommandSchema.safeParse({
        name: "Frente sem recursos",
        requiresEmployees: false,
        requiresMachines: false,
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "10.00" }],
      }).success,
    ).toBe(false);
    expect(
      projectWorkFrontServicesCommandSchema.safeParse({ services: [] }).success,
    ).toBe(true);
    expect(
      projectWorkFrontServicesCommandSchema.safeParse({
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "10.125" }],
      }).success,
    ).toBe(true);
    expect(
      projectWorkFrontServicesCommandSchema.safeParse({
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "10.1255" }],
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  emptyProjectCommand,
  projectCommandSchema,
  type ProjectCommand,
} from "./projects-schema";

const supplierOffer = (): ProjectCommand["projectSupplierOffers"][number] => ({
  supplierId: "00000000-0000-4000-8000-000000000701",
  itemId: "00000000-0000-4000-8000-000000000702",
  sourceOfferId: null,
  purchaseUnitId: "00000000-0000-4000-8000-00000000a001",
  conversionToBase: "1,000000",
  price: "1,0000",
});

const valid = (): ProjectCommand => ({
  ...structuredClone(emptyProjectCommand),
  name: "Obra Norte",
  address: {
    postalCode: "60170-000",
    street: "Rua A",
    number: "10",
    complement: null,
    neighborhood: "Meireles",
    city: "Fortaleza",
    state: "ce",
  },
  approvedBudget: "R$ 100,00",
  plannedStartDate: "2026-07-01",
  plannedEndDate: null as string | null,
  clientId: "00000000-0000-4000-8000-000000000201",
  managerEmploymentId: "00000000-0000-4000-8000-000000000301",
  technicalResponsibilityEmploymentIds: [
    "00000000-0000-4000-8000-000000000301",
  ],
  projectSupplierOffers: [],
});

describe("projectCommandSchema", () => {
  it("normalizes the exact command without binary decimals", () => {
    const parsed = projectCommandSchema.parse(valid());
    expect(parsed.approvedBudget).toBe("100.00");
    expect(parsed.address.postalCode).toBe("60170000");
    expect(parsed.address.state).toBe("CE");
    expect(parsed.latitude).toBeNull();
    expect(parsed.longitude).toBeNull();
    expect(parsed.plannedEndDate).toBeNull();
    expect(parsed.weeklySchedule).toHaveLength(7);
    expect(parsed.weeklySchedule.every((day) => day.shift === "day")).toBe(
      true,
    );
    expect(parsed.projectSupplierOffers).toEqual([]);
  });

  it("accepts a separately configured overnight shift", () => {
    const command = valid();
    command.weeklySchedule.push(
      ...command.weeklySchedule.map((day) => ({
        ...day,
        shift: "night" as const,
        startTime: day.isWorking ? "18:00" : null,
        endTime: day.isWorking ? "06:00" : null,
        endDayOffset: day.isWorking ? 1 : 0,
      })),
    );
    const parsed = projectCommandSchema.parse(command);
    expect(parsed.weeklySchedule).toHaveLength(14);
    expect(
      parsed.weeklySchedule.filter((day) => day.shift === "night"),
    ).toHaveLength(7);
  });

  it("only accepts supplier offers after project creation", () => {
    const withOffer = valid();
    withOffer.projectSupplierOffers = [supplierOffer()];
    expect(projectCommandSchema.safeParse(withOffer).success).toBe(false);

    const invalidOffer = valid();
    invalidOffer.projectSupplierOffers = [
      {
        ...supplierOffer(),
        supplierId: undefined,
      },
    ];
    expect(projectCommandSchema.safeParse(invalidOffer).success).toBe(false);
  });

  it("accepts addresses without numbers", () => {
    const emptyNumber = valid();
    emptyNumber.address.number = "";
    expect(projectCommandSchema.parse(emptyNumber).address.number).toBeNull();

    const base = valid();
    const nullNumber = {
      ...base,
      address: { ...base.address, number: null },
    };
    expect(projectCommandSchema.parse(nullNumber).address.number).toBeNull();
  });

  it("rejects reversed dates, partial coordinates and duplicate responsibilities", () => {
    const command = valid();
    command.plannedEndDate = "2026-06-30";
    command.latitude = "-3.700000";
    command.technicalResponsibilityEmploymentIds.push(
      command.managerEmploymentId,
    );
    expect(projectCommandSchema.safeParse(command).success).toBe(false);
  });

  it("rejects incomplete structured addresses", () => {
    const command = valid();
    command.address.postalCode = "123";
    expect(projectCommandSchema.safeParse(command).success).toBe(false);
  });

  it("shows a readable error for partial coordinates", () => {
    const command = valid();
    command.latitude = "-3.700000";

    const parsed = projectCommandSchema.safeParse(command);

    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues[0]?.message).toBe(
        "Informe latitude e longitude para usar a prévia do mapa.",
      );
  });

  it("accepts inclusive optional collection limits", () => {
    const command = valid();
    command.breakTemplates = Array.from({ length: 20 }, (_, index) => ({
      shift: "day",
      name: `Pausa ${index}`,
      durationMinutes: 1,
    }));
    expect(projectCommandSchema.safeParse(command).success).toBe(true);
    command.breakTemplates.push({
      shift: "day",
      name: "Pausa excedente",
      durationMinutes: 1,
    });
    expect(projectCommandSchema.safeParse(command).success).toBe(false);
  });

  it("requires Machine operators to come from the initial team", () => {
    const command = valid();
    const operator = "00000000-0000-4000-8000-000000000302";
    command.initialEmployeeAllocations = [
      {
        employmentId: operator,
        shift: "day",
        confirmedJobRoleId: "00000000-0000-4000-8000-000000000401",
        confirmedJobRolePeriodId: "00000000-0000-4000-8000-000000000402",
        monthlyWorkloadHours: 220,
        compensationMode: "monthly",
        compensationValue: "0.00",
        overtimeRate: "0.00",
      },
    ];
    command.initialMachineAllocations = [
      {
        machineId: "00000000-0000-4000-8000-000000000501",
        startMeterReadingId: "00000000-0000-4000-8000-000000000601",
        operatorAssignments: [{ shift: "day", operatorEmploymentId: operator }],
      },
    ];
    expect(projectCommandSchema.safeParse(command).success).toBe(true);

    command.initialMachineAllocations.push({
      machineId: "00000000-0000-4000-8000-000000000502",
      startMeterReadingId: "00000000-0000-4000-8000-000000000602",
      operatorAssignments: [{ shift: "day", operatorEmploymentId: operator }],
    });
    expect(projectCommandSchema.safeParse(command).success).toBe(false);

    command.initialMachineAllocations.pop();
    command.initialMachineAllocations[0].operatorAssignments[0].operatorEmploymentId =
      "00000000-0000-4000-8000-000000000303";
    expect(projectCommandSchema.safeParse(command).success).toBe(false);
  });

  it("accepts a temporary job role name for initial team allocations", () => {
    const command = valid();
    command.initialEmployeeAllocations = [
      {
        employmentId: "00000000-0000-4000-8000-000000000302",
        shift: "day",
        confirmedJobRoleName: "Apontador de obra",
        confirmedJobRolePeriodId: null,
        monthlyWorkloadHours: 180,
        compensationMode: "monthly",
        compensationValue: "0.00",
        overtimeRate: "0.00",
      },
    ];

    expect(projectCommandSchema.safeParse(command).success).toBe(true);

    command.initialEmployeeAllocations[0].confirmedJobRoleId =
      "00000000-0000-4000-8000-000000000401";
    expect(projectCommandSchema.safeParse(command).success).toBe(false);
  });
});

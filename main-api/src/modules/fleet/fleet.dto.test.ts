import { describe, expect, it } from "vitest";

import {
  appendMachineMeterReadingSchema,
  correctMachineMeterReadingSchema,
  createMachineSchema,
  createMachineModelSchema,
  addMachineModelUnitsBatchSchema,
  listMachinesQuerySchema,
  updateMachineLoadSpecificationSchema,
} from "./fleet.dto";

describe("fleet DTOs", () => {
  it("accepts both fixed Machine types and at least one identifier", () => {
    for (const type of ["YELLOW_LINE", "WHITE_LINE"] as const) {
      expect(
        createMachineSchema.parse({
          companyTag: "MX-001",
          initialMeterReading: "10.25",
          manufacturer: "Synthetic",
          meterType: "HOUR_METER",
          model: "Loader",
          name: `Machine ${type}`,
          type,
        }),
      ).toMatchObject({ type, meterType: "HOUR_METER" });
    }
  });

  it("rejects scope, lifecycle fields, missing identifiers, and invalid decimals", () => {
    expect(() =>
      createMachineSchema.parse({
        corporationId: "00000000-0000-0000-0000-000000000000",
        initialMeterReading: "1.00",
        isActive: false,
        manufacturer: "Synthetic",
        meterType: "HOUR_METER",
        model: "Loader",
        name: "Machine",
        type: "YELLOW_LINE",
      }),
    ).toThrow();
    expect(() =>
      createMachineSchema.parse({
        initialMeterReading: "1.234",
        manufacturer: "Synthetic",
        meterType: "HOUR_METER",
        model: "Loader",
        name: "Machine",
        plate: "ABC1D23",
        type: "YELLOW_LINE",
      }),
    ).toThrow();
    expect(() =>
      createMachineSchema.parse({
        initialMeterReading: "1.00",
        manufacturer: "Synthetic",
        meterType: "HOUR_METER",
        model: "Loader",
        name: "Machine",
        plate: "---",
        type: "YELLOW_LINE",
      }),
    ).toThrow();
    expect(() =>
      createMachineSchema.parse({
        companyTag: "MCH-001",
        initialMeterReading: "0001.00",
        manufacturer: "Synthetic",
        meterType: "HOUR_METER",
        model: "Loader",
        name: "Machine",
        type: "YELLOW_LINE",
      }),
    ).toThrow();
    expect(() =>
      createMachineSchema.parse({
        companyTag: "MCH-001",
        initialMeterReading: "1.00",
        manufacturer: "Synthetic",
        model: "Loader",
        name: "Machine",
        type: "YELLOW_LINE",
      }),
    ).toThrow();
  });

  it("normalizes list defaults and allowlists filters", () => {
    expect(listMachinesQuerySchema.parse({})).toEqual({
      limit: 25,
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    expect(() => listMachinesQuerySchema.parse({ sortBy: "cost" })).toThrow();
    expect(listMachinesQuerySchema.parse({ type: "WHITE_LINE" })).toMatchObject(
      { type: "WHITE_LINE" },
    );
  });

  it("accepts nullable positive load specifications with up to three decimals", () => {
    expect(
      updateMachineLoadSpecificationSchema.parse({
        loadVolumeM3: "12.345",
        maxSupportedWeightT: null,
      }),
    ).toEqual({ loadVolumeM3: "12.345", maxSupportedWeightT: null });
    expect(() =>
      updateMachineLoadSpecificationSchema.parse({
        loadVolumeM3: "0",
        maxSupportedWeightT: null,
      }),
    ).toThrow();
    expect(() =>
      updateMachineLoadSpecificationSchema.parse({
        loadVolumeM3: "1.2345",
        maxSupportedWeightT: null,
      }),
    ).toThrow();
  });

  it("validates append and correction commands as explicit decimal-string commands", () => {
    expect(appendMachineMeterReadingSchema.parse({ value: "12" })).toEqual({
      value: "12",
    });
    expect(
      correctMachineMeterReadingSchema.parse({
        reason: "Initial reading typo",
        value: "12.50",
      }),
    ).toMatchObject({ reason: "Initial reading typo" });
    expect(() =>
      correctMachineMeterReadingSchema.parse({ reason: "", value: "-1" }),
    ).toThrow();
  });

  it("accepts the operational load-capacity unit catalog only for white-line models", () => {
    for (const loadCapacityUnitCode of [
      "M3_LOOSE",
      "M3_COMPACTED",
      "LITER",
      "CUBIC_YARD",
    ] as const) {
      expect(
        createMachineModelSchema.parse({
          type: "WHITE_LINE",
          manufacturer: "Volvo",
          model: "VM",
          loadCapacity: "12.345",
          loadCapacityUnitCode,
          requiresOperator: false,
        }),
      ).toMatchObject({ loadCapacityUnitCode });
    }
    expect(() =>
      createMachineModelSchema.parse({
        type: "YELLOW_LINE",
        manufacturer: "Caterpillar",
        model: "320",
        loadCapacity: "12",
        loadCapacityUnitCode: "LITER",
        requiresOperator: false,
      }),
    ).toThrow();
  });

  it("limits a unit batch to 15 entries and one common Project", () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const unit = (index: number) => ({
      companyTag: `PAT-${index}`,
      meterType: "HOUR_METER" as const,
      initialMeterReading: "0",
      ownership: { kind: "OWNED" as const },
      allocation: { projectId, operatorAssignments: [] },
    });
    expect(
      addMachineModelUnitsBatchSchema.parse({
        projectId,
        units: Array.from({ length: 15 }, (_, index) => unit(index)),
      }).units,
    ).toHaveLength(15);
    expect(() =>
      addMachineModelUnitsBatchSchema.parse({
        projectId,
        units: Array.from({ length: 16 }, (_, index) => unit(index)),
      }),
    ).toThrow();
    expect(() =>
      addMachineModelUnitsBatchSchema.parse({
        projectId,
        units: [
          {
            ...unit(1),
            allocation: {
              projectId: "00000000-0000-4000-8000-000000000002",
              operatorAssignments: [],
            },
          },
        ],
      }),
    ).toThrow();
  });
});

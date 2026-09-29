import { describe, expect, it } from "vitest";

import {
  productionCommandSchema,
  productionPairCommandSchema,
  productionQualityCheckSchema,
  productionTruckOptionsQuerySchema,
  productionTripSchema,
} from "./productions.dto";
import { calculateProductionMetrics } from "./productions.service";

const frontId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const machineId = "44444444-4444-4444-8444-444444444444";

describe("production command", () => {
  it("accepts an incomplete draft so it can be continued during the shift", () => {
    expect(
      productionCommandSchema.parse({
        kind: "individual_activity",
        productionDate: "2026-07-28",
        shift: "day",
        individualActivity: {
          workFrontId: frontId,
          workFrontServiceId: serviceId,
        },
      }),
    ).toMatchObject({
      approveNow: false,
      submitNow: false,
      equipment: [],
      entryMode: "direct_total",
    });
  });

  it("accepts a simple individual truck summary without quality or evidence", () => {
    const command = productionCommandSchema.parse({
      kind: "individual_activity",
      entryMode: "truck_summary",
      productionDate: "2026-07-28",
      shift: "day",
      submitNow: true,
      responsibleEmploymentId: frontId,
      individualActivity: {
        workFrontId: frontId,
        workFrontServiceId: serviceId,
        volumeCondition: "bank",
        dmtKm: "2.400",
      },
      truckSummaries: [
        {
          machineId,
          acceptedTrips: 2,
          averageLoadingMinutes: "5.30",
          averageUnloadingMinutes: "3.15",
          dmtKm: "2.400",
        },
      ],
    });
    expect(command).toMatchObject({
      kind: "individual_activity",
      entryMode: "truck_summary",
      equipment: [],
      truckSummaries: [
        {
          machineId,
          acceptedTrips: 2,
          averageLoadingMinutes: "5.30",
          averageUnloadingMinutes: "3.15",
          dmtKm: "2.400",
        },
      ],
    });
  });

  it("accepts the atomic cut and fill pair contract", () => {
    const common = {
      kind: "individual_activity" as const,
      productionDate: "2026-07-28",
      shift: "day" as const,
      responsibleEmploymentId: frontId,
    };
    expect(
      productionPairCommandSchema.parse({
        cut: {
          ...common,
          entryMode: "truck_summary",
          individualActivity: {
            workFrontId: frontId,
            workFrontServiceId: serviceId,
            volumeCondition: "loose",
            dmtKm: "2.400",
            destinationKind: "fill",
            destinationWorkFrontId: machineId,
          },
          truckSummaries: [{ machineId, acceptedTrips: 2, dmtKm: "2.400" }],
        },
        fill: {
          ...common,
          individualActivity: {
            workFrontId: machineId,
            workFrontServiceId: serviceId,
            operationalQuantity: "19.167",
            volumeCondition: "compacted",
            compactionReductionPercent: "20.00",
          },
        },
      }),
    ).toMatchObject({
      cut: { individualActivity: { destinationKind: "fill" } },
      fill: {
        individualActivity: { compactionReductionPercent: "20.00" },
      },
    });
  });

  it("rejects impossible minute-second values and out-of-range swell percentages", () => {
    const base = {
      kind: "individual_activity" as const,
      entryMode: "truck_summary" as const,
      productionDate: "2026-07-28",
      shift: "day" as const,
      responsibleEmploymentId: frontId,
      individualActivity: {
        workFrontId: frontId,
        workFrontServiceId: serviceId,
        volumeCondition: "loose" as const,
        dmtKm: "2.400",
      },
      truckSummaries: [
        {
          machineId,
          acceptedTrips: 2,
          averageLoadingMinutes: "2.89",
          averageUnloadingMinutes: "3.15",
          dmtKm: "2.400",
        },
      ],
    };
    expect(productionCommandSchema.safeParse(base).success).toBe(false);
    expect(
      productionCommandSchema.safeParse({
        ...base,
        individualActivity: {
          ...base.individualActivity,
          compactionReductionPercent: "100.01",
        },
        truckSummaries: [
          {
            ...base.truckSummaries[0],
            averageLoadingMinutes: "2.30",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("binds truck option cursors to a bounded page query", () => {
    expect(
      productionTruckOptionsQuerySchema.parse({
        productionDate: "2026-07-28",
        shift: "night",
      }),
    ).toEqual({
      productionDate: "2026-07-28",
      shift: "night",
      limit: 25,
    });
  });

  it("requires a reason for an individual activity exceptional to a movement", () => {
    expect(() =>
      productionCommandSchema.parse({
        kind: "individual_activity",
        productionDate: "2026-07-28",
        shift: "day",
        individualActivity: {
          workFrontId: frontId,
          workFrontServiceId: serviceId,
          exceptionalFromMovement: true,
          exceptionReason: null,
        },
      }),
    ).toThrow();
  });

  it("accepts a movement without material and with the same active front at both endpoints", () => {
    const result = productionCommandSchema.parse({
      kind: "material_movement",
      productionDate: "2026-07-28",
      shift: "day",
      materialMovement: {
        workFrontId: frontId,
        workFrontServiceId: serviceId,
        destinationWorkFrontId: frontId,
        dmtKm: "0",
        components: [
          {
            workFrontId: frontId,
            workFrontServiceId: serviceId,
            type: "transport",
            unitCode: "M3_LOOSE",
            volumeCondition: "loose",
          },
        ],
      },
      truckSummaries: [
        {
          machineId,
          acceptedTrips: 1,
        },
      ],
    });

    if (result.kind !== "material_movement") throw new Error("Unexpected kind");
    expect(result.materialMovement).toMatchObject({
      destinationWorkFrontId: frontId,
      materialName: null,
      origin: null,
      destination: null,
    });
  });

  it("rejects duplicate machines and decreasing meter readings", () => {
    const result = productionCommandSchema.safeParse({
      kind: "individual_activity",
      productionDate: "2026-07-28",
      shift: "day",
      individualActivity: {
        workFrontId: frontId,
        workFrontServiceId: serviceId,
      },
      equipment: [
        {
          machineId,
          role: "excavation",
          initialMeterValue: "20.00",
          finalMeterValue: "19.00",
        },
        { machineId, role: "support" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Final meter value cannot be lower than initial value",
          "Machine cannot be repeated",
        ]),
      );
  });

  it("requires a UUID idempotency key for every quick trip", () => {
    const result = productionTripSchema.safeParse({
      expectedRevision: 1,
      idempotencyKey: "same-button-click",
      productionEquipmentId: machineId,
    });
    expect(result.success).toBe(false);
  });

  it("allows only accepted topography or laboratory checks to set the accepted quantity", () => {
    const quantity = {
      componentId: serviceId,
      value: "98.750",
      unitCode: "M3_BANK",
      volumeCondition: "bank" as const,
    };
    expect(
      productionQualityCheckSchema.safeParse({
        expectedRevision: 2,
        type: "topography",
        status: "accepted",
        acceptedQuantity: quantity,
      }).success,
    ).toBe(true);
    expect(
      productionQualityCheckSchema.safeParse({
        expectedRevision: 2,
        type: "field_inspection",
        status: "accepted",
        acceptedQuantity: quantity,
      }).success,
    ).toBe(false);
  });
});

describe("production metrics", () => {
  it("keeps the legacy measured projection compatible without changing trip volume", () => {
    expect(
      calculateProductionMetrics({
        tripVolumesM3: ["10.000", "12.500", "10.000"],
        measuredQuantity: "31.000",
        directQuantity: null,
        conversionFactor: null,
        entryMode: "TRIPS",
        dmtKm: "2.500",
        unitCode: "M3",
        startTime: "07:00",
        endTime: "12:00",
        endDayOffset: 0,
        workedMinutes: 600,
        stoppedMinutes: 30,
      }),
    ).toEqual({
      operationalVolumeM3: "32.500",
      officialQuantity: "31.000",
      difference: "-1.500",
      differencePercent: "-4.62",
      tripCount: 3,
      tripsPerHour: "0.60",
      quantityPerHour: "6.200",
      dmtKm: "2.500",
      transportMomentM3Km: "81.250",
      workedMinutes: 600,
      stoppedMinutes: 30,
    });
  });

  it("does not calculate transport moment for a non-volumetric unit", () => {
    const metrics = calculateProductionMetrics({
      tripVolumesM3: [],
      measuredQuantity: null,
      directQuantity: "800.000",
      conversionFactor: null,
      entryMode: "DIRECT_TOTAL",
      dmtKm: "2.000",
      unitCode: "M2",
      startTime: null,
      endTime: null,
      endDayOffset: 0,
      workedMinutes: 0,
      stoppedMinutes: 0,
    });
    expect(metrics.officialQuantity).toBe("800.000");
    expect(metrics.transportMomentM3Km).toBeNull();
  });

  it("calculates the moment from loose truck volume even when fill quantity is compacted", () => {
    const metrics = calculateProductionMetrics({
      tripVolumesM3: ["23.000"],
      measuredQuantity: null,
      directQuantity: "18.400",
      conversionFactor: null,
      entryMode: "TRUCK_SUMMARY",
      summaryTripCount: 2,
      dmtKm: "2.400",
      unitCode: "M3_COMPACTED",
      startTime: null,
      endTime: null,
      endDayOffset: 0,
      workedMinutes: 0,
      stoppedMinutes: 0,
    });
    expect(metrics.officialQuantity).toBe("18.400");
    expect(metrics.operationalVolumeM3).toBe("23.000");
    expect(metrics.transportMomentM3Km).toBe("55.200");
  });

  it("uses an explicit conversion factor for trip-based non-volumetric services", () => {
    const metrics = calculateProductionMetrics({
      tripVolumesM3: ["10.000"],
      measuredQuantity: null,
      directQuantity: null,
      conversionFactor: "2.500000",
      entryMode: "TRIPS",
      dmtKm: "2.000",
      unitCode: "T",
      startTime: "07:00",
      endTime: "09:00",
      endDayOffset: 0,
      workedMinutes: 120,
      stoppedMinutes: 0,
    });
    expect(metrics.officialQuantity).toBe("25.000");
    expect(metrics.difference).toBeNull();
    expect(metrics.transportMomentM3Km).toBe("20.000");
  });
});

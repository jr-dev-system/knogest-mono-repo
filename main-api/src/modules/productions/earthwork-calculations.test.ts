import { describe, expect, it } from "vitest";

import {
  calculateEarthworkMovement,
  calculateTruckSummaryVolume,
} from "./earthwork-calculations";

describe("earthwork production calculations", () => {
  it("sums full and partial accepted trips without rejected trips", () => {
    expect(
      calculateTruckSummaryVolume({
        capacity: "12.000",
        acceptedTrips: 5,
        partialTripCount: 1,
        partialVolume: "6.000",
        loadFactor: "0.950000",
        actualWeightT: null,
      }),
    ).toBe("51.600");
  });

  it("keeps weighbridge mass authoritative and conversions estimated", () => {
    expect(
      calculateEarthworkMovement({
        trucks: [
          {
            capacity: "10.000",
            acceptedTrips: 10,
            partialTripCount: 0,
            partialVolume: "0",
            loadFactor: "1",
            actualWeightT: "180.000",
          },
        ],
        densityTPerM3: "1.800000",
        swellFactor: "1.250000",
        looseToCompactedFactor: "0.800000",
        contractualDmtKm: "2.500",
      }),
    ).toEqual({
      looseVolumeM3: "100.000",
      actualWeightT: "180.000",
      estimatedBankVolumeM3: "80.000",
      estimatedCompactedVolumeM3: "80.000",
      transportMoment: "450.000",
      transportMomentUnit: "T_KM",
    });
  });
});

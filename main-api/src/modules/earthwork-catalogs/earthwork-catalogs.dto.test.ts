import { describe, expect, it } from "vitest";

import {
  createEarthworkMaterialSchema,
  createHaulRouteSchema,
  earthworkCatalogListQuerySchema,
} from "./earthwork-catalogs.dto";

describe("earthwork catalogs DTO", () => {
  it("accepts versioned material factors", () => {
    expect(
      createEarthworkMaterialSchema.parse({
        code: "solo-1",
        name: "Solo de primeira categoria",
        densityTPerM3: "1.800000",
        swellFactor: "1.250000",
        looseToCompactedFactor: "0.820000",
        effectiveFrom: "2026-08-10T03:00:00.000Z",
      }),
    ).toMatchObject({ code: "solo-1", category: null });
  });

  it("accepts a route with independent loaded, return and contractual distances", () => {
    expect(
      createHaulRouteSchema.parse({
        code: "jazida-a-aterro-1",
        name: "Jazida A → Aterro 1",
        origin: "Jazida A",
        destination: "Aterro 1",
        loadedDistanceKm: "3.250",
        emptyReturnDistanceKm: "3.400",
        contractualDmtKm: "3.000",
        effectiveFrom: "2026-08-10T03:00:00.000Z",
      }),
    ).toMatchObject({ loadedDistanceKm: "3.250" });
  });

  it("rejects unknown pagination filters", () => {
    expect(
      earthworkCatalogListQuerySchema.safeParse({ unknown: "filter" }).success,
    ).toBe(false);
  });
});

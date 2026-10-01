import { describe, expect, it } from "vitest";

import { countDistinctProductionMachines } from "./productions.service";

describe("production summaries", () => {
  it("counts direct equipment and truck summaries without duplicating machines", () => {
    expect(
      countDistinctProductionMachines({
        equipment: [{ machineId: "machine-a" }, { machineId: "machine-b" }],
        truckSummaries: [
          { machineId: "machine-b" },
          { machineId: "machine-c" },
        ],
      }),
    ).toBe(3);
    expect(
      countDistinctProductionMachines({
        equipment: [],
        truckSummaries: [{ machineId: "truck-only" }],
      }),
    ).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import { loadCapacityInCubicMeters } from "./load-capacity";

describe("loadCapacityInCubicMeters", () => {
  it.each([
    ["12.500", "M3_LOOSE", "12.500"],
    ["12.500", "M3_COMPACTED", "12.500"],
    ["1000.000", "LITER", "1.000"],
    ["1.000", "CUBIC_YARD", "0.765"],
  ] as const)("converts %s %s to %s m³", (value, unit, expected) => {
    expect(loadCapacityInCubicMeters(value, unit)).toBe(expected);
  });
});

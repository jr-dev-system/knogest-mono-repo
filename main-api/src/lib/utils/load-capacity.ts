export type LoadCapacityUnitCode =
  | "M3_LOOSE"
  | "M3_COMPACTED"
  | "LITER"
  | "CUBIC_YARD";

export function loadCapacityInCubicMeters(
  value: string,
  unitCode: LoadCapacityUnitCode,
) {
  const factor =
    unitCode === "LITER"
      ? 0.001
      : unitCode === "CUBIC_YARD"
        ? 0.764555
        : 1;
  return (Number(value) * factor).toFixed(3);
}

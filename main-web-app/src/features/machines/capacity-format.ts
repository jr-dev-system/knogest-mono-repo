const labels: Record<string, string> = {
  M3_LOOSE: "m³ solto",
  M3_COMPACTED: "m³ compactado",
  LITER: "L",
  CUBIC_YARD: "yd³",
};

export function formatLoadCapacity(
  value: string | null | undefined,
  unitCode: string | null | undefined,
) {
  if (!value) return null;
  return `${value.replace(".", ",")} ${labels[unitCode ?? ""] ?? unitCode ?? ""}`.trim();
}

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
  const numericValue = Number(value);
  const formattedValue = Number.isFinite(numericValue)
    ? new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 3,
      }).format(numericValue)
    : value.replace(".", ",");
  return `${formattedValue} ${labels[unitCode ?? ""] ?? unitCode ?? ""}`.trim();
}

const serviceLabels: Record<string, string> = {
  cut: "Corte",
  fill: "Aterro",
  finishing: "Acabamento",
  top_soil: "Solo vegetal",
  unsuitable_soil_removal: "Remoção de solo impróprio",
  replacement_fill: "Aterro de substituição",
};

const unitLabels: Record<string, string> = {
  M3: "m³",
  M3_BANK: "m³ no corte",
  M3_LOOSE: "m³ solto",
  M3_COMPACTED: "m³ compactado",
  M3_KM: "m³·km",
  M2: "m²",
  M: "m",
  TON: "t",
  LITER: "L",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  submitted: "Enviada",
  field_checked: "Conferida em campo",
  awaiting_technical: "Aguardando técnica",
  approved: "Aprovada",
  rejected: "Rejeitada",
  released: "Liberada",
  measured: "Medida",
};

export function productionServiceLabel(code: string) {
  return serviceLabels[code] ?? code;
}

export function productionUnitLabel(code: string) {
  return unitLabels[code] ?? code;
}

export function productionStatusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

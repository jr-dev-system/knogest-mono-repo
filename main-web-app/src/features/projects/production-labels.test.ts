import { describe, expect, it } from "vitest";

import { productionServiceLabel, productionUnitLabel } from "./production-labels";

describe("rótulos de produção", () => {
  it("mostra atividades em português", () => {
    expect(productionServiceLabel("cut")).toBe("Corte");
    expect(productionServiceLabel("fill")).toBe("Aterro");
    expect(productionServiceLabel("top_soil")).toBe("Solo vegetal");
  });

  it("mostra as unidades em notação legível", () => {
    expect(productionUnitLabel("M3_LOOSE")).toBe("m³ solto");
    expect(productionUnitLabel("M3_KM")).toBe("m³·km");
    expect(productionUnitLabel("LITER")).toBe("L");
  });
});

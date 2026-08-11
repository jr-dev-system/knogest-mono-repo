import { expect, test } from "@playwright/test";

const productionProjectId = "00000000-0000-4000-8000-000000003901";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email corporativo").fill("master@pilot.test");
  await page.getByLabel("Senha").fill("correct e2e password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/home\/company$/);
  await page
    .getByRole("button", { name: /Pilot E2E Company.*Entrar neste workspace/ })
    .click();
  await expect(
    page.getByRole("link", { name: "Obras", exact: true }),
  ).toBeVisible();
}

async function openProductionWizard(page: import("@playwright/test").Page) {
  await login(page);
  await page.goto(`/home/obras/${productionProjectId}`);
  await page.getByRole("tab", { name: /Produção/ }).click();
  await page.getByRole("button", { name: "Adicionar produção" }).click();
  await expect(
    page.getByRole("heading", { name: "Nova produção" }),
  ).toBeVisible();
}

test.describe.serial("guided earthwork production", () => {
  test("submits the individual activity branch with explicit bank volume", async ({
    page,
  }) => {
    await openProductionWizard(page);
    await expect(page.getByLabel("Tipo de lançamento")).toHaveValue(
      "individual_activity",
    );

    await page.getByRole("button", { name: /Avançar/ }).click();
    await expect(
      page.getByText("Frente e serviço", { exact: true }).last(),
    ).toBeVisible();
    await page.getByRole("button", { name: /Avançar/ }).click();
    await page.getByLabel("Quantidade").fill("125.750");
    await expect(page.getByLabel("Condição")).toHaveValue("bank");
    await page.getByRole("button", { name: /Avançar/ }).click();
    await page.getByLabel(/Escavadeira E2E/).check();
    await page.getByRole("button", { name: /Avançar/ }).click();
    await expect(
      page.getByText("Qualidade e evidências", { exact: true }).last(),
    ).toBeVisible();
    await page.getByRole("button", { name: /Avançar/ }).click();
    await expect(page.getByText("125.750 M3_BANK")).toBeVisible();
    await page.getByRole("button", { name: "Enviar produção" }).click();

    await expect(page.getByText("Produção enviada.")).toBeVisible();
    await expect(page.getByText(/125,750 M3_BANK/)).toBeVisible();
  });

  test("submits the movement branch with inline catalogs and truck summary", async ({
    page,
  }) => {
    await openProductionWizard(page);
    await page
      .getByLabel("Tipo de lançamento")
      .selectOption("material_movement");
    await expect(page.getByText("Caminhões", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Avançar/ }).click();
    await page.getByLabel("Origem").fill("Corte E2E");
    await page.getByLabel("Destino").fill("Aterro E2E");
    await page.getByLabel("Nome do material").fill("Solo argiloso E2E");
    await page.getByLabel("Código para cadastro inline").fill("solo-e2e");
    await page.getByRole("button", { name: /Avançar/ }).click();
    await page
      .getByLabel("Código para cadastro inline")
      .fill("corte-aterro-e2e");
    await page.getByLabel("Distância carregada (km)").fill("4.250");
    await page.getByLabel("DMT contratual (km)").fill("4.000");
    await page.getByRole("button", { name: /Avançar/ }).click();
    await page.getByLabel(/Caminhão E2E/).check();
    await page.getByLabel("Aceitas").fill("8");
    await expect(page.getByText("76.000 m³")).toBeVisible();
    await page.getByRole("button", { name: /Avançar/ }).click();
    await page.getByLabel(/Escavadeira E2E/).check();
    await page.getByRole("button", { name: /Avançar/ }).click();
    await expect(
      page
        .getByText("Recebimento, qualidade e acabamento", { exact: true })
        .last(),
    ).toBeVisible();
    await page.getByRole("button", { name: /Avançar/ }).click();
    await expect(page.getByText("Corte E2E → Aterro E2E")).toBeVisible();
    await expect(page.getByText("1 selecionado(s)").first()).toBeVisible();
    await page.getByRole("button", { name: "Enviar produção" }).click();

    await expect(page.getByText("Produção enviada.")).toBeVisible();
    await expect(page.getByText(/Movimentação de material ·/)).toBeVisible();
  });
});

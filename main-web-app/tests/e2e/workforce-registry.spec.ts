import { expect, test } from "@playwright/test";

const syntheticCpfFixture = "529.982.247-25";
const syntheticCpfNormalizedFixture = "52998224725";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email corporativo").fill("master@pilot.test");
  await page.getByLabel("Senha").fill("correct e2e password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/home\/company$/);
  await page.getByRole("button", { name: /Pilot E2E Company/ }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("creates, lists, and opens a synthetic Employee detail", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Funcionários", exact: true }).click();
  await page.getByRole("button", { name: "Novo funcionário" }).click();
  await page.getByLabel("CPF").fill(syntheticCpfFixture);
  await page.getByLabel("Nome completo").fill("Synthetic E2E Worker");
  await page.getByLabel("Matrícula").fill("E2E-001");
  await page.getByLabel("Admissão").fill("2026-07-01");
  await page.getByRole("button", { name: "Cadastrar funcionário" }).click();
  await expect(page.getByText("Funcionário cadastrado.")).toBeVisible();
  await expect(page.getByText("Synthetic E2E Worker")).toBeVisible();
  await expect(page.getByText("***.***.247-25")).toBeVisible();
  await expect(page.getByText("Disponível")).toBeVisible();

  await page.getByRole("link", { name: "Ver" }).first().click();
  await expect(page.getByText("CPF autorizado")).toBeVisible();
  await expect(page.getByText(syntheticCpfNormalizedFixture)).toBeVisible();
  await expect(page.getByText("Alocação aberta")).toBeVisible();
  await expect(page.getByText("Não")).toBeVisible();
});

test("rehires a terminated Employee and keeps period history visible", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Funcionários", exact: true }).click();
  await page.locator('select[name="state"]').selectOption("terminated");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Synthetic Rehire Fixture")).toBeVisible();
  await expect(page.getByText("Indisponível")).toBeVisible();

  await page.getByRole("link", { name: "Ver" }).first().click();
  await expect(page.getByText("Encerrado")).toBeVisible();
  await expect(page.getByText("Synthetic termination fixture")).toBeVisible();
  await page.getByRole("button", { name: "Recontratar funcionário" }).click();
  await expect(page.getByText("Funcionário recontratado.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Ativo")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Recontratar funcionário" }),
  ).toHaveCount(0);
  await expect(page.getByText("Atual")).toBeVisible();
  await expect(page.getByText("Encerrado")).toBeVisible();

  await page.getByRole("link", { name: "Funcionários", exact: true }).click();
  await expect(page.getByText("Synthetic Rehire Fixture")).toBeVisible();
  await expect(page.getByText("Disponível")).toBeVisible();
});

import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email corporativo").fill("master@pilot.test");
  await page.getByLabel("Senha").fill("correct e2e password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/home\/company$/);
  await page.getByRole("button", { name: /Pilot E2E Company/ }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("creates, lists, and opens a synthetic Machine detail", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Máquinas", exact: true }).click();
  await page.getByRole("button", { name: "Nova máquina" }).click();
  await page.getByLabel("Nome").fill("Synthetic E2E Machine");
  await page.locator('select[name="type"]').selectOption("YELLOW_LINE");
  await page.getByLabel("Fabricante").fill("Synthetic");
  await page.getByLabel("Modelo").fill("Loader 200");
  await page.getByLabel("Patrimônio").fill("MCH-E2E-001");
  await page.getByLabel("Leitura inicial").fill("12.50");
  await page.getByRole("button", { name: "Cadastrar máquina" }).click();
  await expect(page.getByText("Máquina cadastrada.")).toBeVisible();
  await expect(page.getByText("Synthetic E2E Machine")).toBeVisible();
  await expect(page.getByText("MCH-E2E-001")).toBeVisible();
  await expect(page.getByText("12,50 h")).toBeVisible();

  await page.getByRole("link", { name: "Ver" }).first().click();
  await expect(page.getByText("Linha amarela")).toBeVisible();
  await expect(page.getByText("Synthetic / Loader 200")).toBeVisible();
  await expect(page.getByText("Alocação aberta")).toBeVisible();
  await expect(page.getByText("Não")).toBeVisible();
});

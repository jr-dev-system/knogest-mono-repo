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

async function expectTopCenterToast(
  page: import("@playwright/test").Page,
  message: string,
) {
  await expect(page.getByText(message)).toBeVisible();
  const toaster = page.locator("[data-sonner-toaster]");
  await expect(toaster).toHaveAttribute("data-y-position", "top");
  await expect(toaster).toHaveAttribute("data-x-position", "center");
}

test("creates a model with a unit and opens its catalog detail", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Máquinas", exact: true }).click();
  await page.getByRole("button", { name: "Nova máquina" }).click();
  await page.getByLabel("Exige operador?").selectOption("false");
  await page.getByLabel("Nome da unidade 1").fill("Synthetic E2E Machine");
  await page.locator('select[name="type"]').selectOption("YELLOW_LINE");
  await page.getByLabel("Fabricante").fill("Synthetic");
  await page.getByLabel("Modelo").fill("Loader 200");
  await page.getByLabel("Patrimônio").fill("MCH-E2E-001");
  await page.getByLabel("Leitura inicial (h)").fill("12.50");
  await page.getByRole("button", { name: "Cadastrar catálogo" }).click();
  await expectTopCenterToast(page, "Modelo e unidades cadastrados.");
  await expect(page.getByText("Synthetic / Loader 200")).toBeVisible();
  await expect(page.getByText("1 unidade")).toBeVisible();

  await page.getByRole("link", { name: "Ver modelo" }).first().click();
  await expect(page.getByText("Modelo de máquina")).toBeVisible();
  await expect(page.getByText("Synthetic / Loader 200")).toBeVisible();
  await expect(page.getByText("Synthetic E2E Machine")).toBeVisible();
  await expect(page.getByText("Não exige operador")).toBeVisible();
});

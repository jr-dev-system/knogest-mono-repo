import { expect, test } from "@playwright/test";

const syntheticCpfFixture = "529.982.247-25";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email corporativo").fill("master@pilot.test");
  await page.getByLabel("Senha").fill("correct e2e password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/home\/company$/);
  await page.getByRole("button", { name: /Pilot E2E Company/ }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("removes a synthetic Client only after backend confirmation", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByLabel("CPF ou CNPJ").fill(syntheticCpfFixture);
  await page.getByLabel("Nome completo").fill("Synthetic E2E Client");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await expect(page.getByText("Cliente cadastrado.")).toBeVisible();
  await expect(page.getByText("Synthetic E2E Client")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remover" }).click();
  await expect(
    page.getByText("Cliente removido do uso operacional."),
  ).toBeVisible();
  await expect(page.getByText("Synthetic E2E Client")).toHaveCount(0);
});

import { expect, test } from "@playwright/test";

async function loginThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email corporativo").fill("master@pilot.test");
  await page.getByLabel("Senha").fill("correct e2e password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/home\/company$/);
  await page.getByRole("button", { name: /Pilot E2E Company/ }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("adapts the global shell across desktop, tablet, and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginThroughUi(page);

  const desktopSidebar = page.getByTestId("desktop-navigation-sidebar");
  await expect(desktopSidebar).toBeVisible();
  await expect(
    desktopSidebar.getByLabel(/Empresa atual: Pilot E2E Company/),
  ).toBeVisible();
  await expect(
    desktopSidebar.getByRole("button", { name: "Sair" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir menu principal" }),
  ).toBeHidden();
  await expect(page.getByText("Escopo confiável")).toHaveCount(0);
  await expect(page.getByText("Sessão corporativa")).toHaveCount(0);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(desktopSidebar).toBeHidden();
  const menuTrigger = page.getByRole("button", {
    name: "Abrir menu principal",
  });
  await expect(menuTrigger).toBeVisible();
  await menuTrigger.click();

  const drawer = page.getByRole("dialog", { name: "Menu principal" });
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-slot="dialog-overlay"]')).toBeVisible();
  await expect(
    drawer.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
  await expect(
    drawer.getByLabel(/Empresa atual: Pilot E2E Company/),
  ).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Sair" })).toBeVisible();
  expect(
    await drawer
      .getByRole("link", { name: "Configurações" })
      .evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toBe("nowrap");

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await menuTrigger.click();
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBeLessThanOrEqual(390);

  await drawer.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("keeps project navigation independent from the compact drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await loginThroughUi(page);
  await page.goto("/home/obras");
  await page.getByRole("link", { name: "Terraplanagem Wizard E2E" }).click();

  const projectNavigation = page.getByRole("navigation", {
    name: "Navegação da obra",
  });
  await expect(projectNavigation).toBeVisible();
  await expect(
    projectNavigation.getByRole("button", {
      name: "Recolher navegação da obra",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Abrir menu principal" }).click();
  const drawer = page.getByRole("dialog", { name: "Menu principal" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Fechar menu principal" }).click();

  await expect(projectNavigation).toBeVisible();
  await projectNavigation
    .getByRole("button", { name: "Recolher navegação da obra" })
    .click();
  await expect(
    projectNavigation.getByRole("button", {
      name: "Expandir navegação da obra",
    }),
  ).toBeVisible();
});

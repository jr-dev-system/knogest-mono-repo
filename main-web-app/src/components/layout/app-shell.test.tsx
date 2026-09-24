// @vitest-environment jsdom

import * as React from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}));

vi.mock("@/features/auth/actions/forget-browser-session.action", () => ({
  forgetBrowserSessionAction: vi.fn(),
}));

vi.mock("@/features/company-selection/actions/select-company.action", () => ({
  selectCompanyAction: vi.fn(),
}));

import { AppShell, useAppShellNavigation } from "./app-shell";

const companies = [
  { id: "company-1", name: "Empresa Serra" },
  { id: "company-2", name: "Empresa Vale" },
];

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderShell(navigationMode: "default" | "project" = "default") {
  return render(
    <AppShell
      companies={companies}
      selectedCompany={companies[0]}
      currentArea="works"
      navigationMode={navigationMode}
    >
      <p>Conteúdo da página</p>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("keeps company selection and sign out in the desktop navigation", () => {
    renderShell();

    const sidebar = screen.getByTestId("desktop-navigation-sidebar");
    expect(
      within(sidebar).getByLabelText(
        "Empresa atual: Empresa Serra. Trocar empresa",
      ),
    ).toBeTruthy();
    expect(within(sidebar).getByRole("button", { name: "Sair" })).toBeTruthy();
    expect(screen.queryByText("Escopo confiável")).toBeNull();
    expect(screen.queryByText("Sessão corporativa")).toBeNull();
  });

  it("opens an accessible compact drawer and restores focus after Escape", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", {
      name: "Abrir menu principal",
    });
    await user.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "Menu principal" });
    expect(
      within(drawer).getByRole("navigation", { name: "Navegação principal" }),
    ).toBeTruthy();
    expect(
      within(drawer).getByLabelText(
        "Empresa atual: Empresa Serra. Trocar empresa",
      ),
    ).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Sair" })).toBeTruthy();
    expect(
      within(drawer).getByRole("button", { name: "Fechar menu principal" }),
    ).toBeTruthy();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("does not couple the compact drawer to project navigation state", async () => {
    const user = userEvent.setup();

    function NavigationState() {
      const navigation = useAppShellNavigation();
      return (
        <output aria-label="Estado da navegação da obra">
          {navigation?.mainNavigationExpanded ? "expandida" : "recolhida"}
        </output>
      );
    }

    render(
      <AppShell
        companies={companies}
        selectedCompany={companies[0]}
        currentArea="works"
        navigationMode="project"
      >
        <NavigationState />
      </AppShell>,
    );

    expect(
      screen.getByLabelText("Estado da navegação da obra").textContent,
    ).toBe("recolhida");

    await user.click(
      screen.getByRole("button", { name: "Abrir menu principal" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Fechar menu principal" }),
    );

    expect(
      screen.getByLabelText("Estado da navegação da obra").textContent,
    ).toBe("recolhida");
  });
});

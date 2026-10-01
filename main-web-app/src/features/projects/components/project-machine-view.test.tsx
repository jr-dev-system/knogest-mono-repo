// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const getProjectMachineMobilizationMembersAction = vi.hoisted(() => vi.fn());

vi.mock("../projects.actions", () => ({
  getProjectMachineMobilizationMembersAction,
}));

import { ProjectMachineView } from "./project-machine-view";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const machine = (
  id: string,
  name: string,
  type: "YELLOW_LINE" | "WHITE_LINE" = "YELLOW_LINE",
) => ({
  id: `00000000-0000-4000-8000-000000000${id}`,
  machineId: `00000000-0000-4000-8000-0000000001${id}`,
  name,
  type,
  manufacturer: "Caterpillar",
  model: "320",
  version: null,
  meterType: "HOUR_METER" as const,
  identifiers: [{ kind: "COMPANY_TAG" as const, value: `PAT-${id}` }],
  startMeterReading: {
    id: `00000000-0000-4000-8000-0000000002${id}`,
    value: "123.00",
  },
  requiresOperator: true,
  requiredJobRoleId: null,
  requiredJobRoleName: null,
  acceptsAnyJobRole: true,
  operatorAssignments: [
    {
      shift: "day" as const,
      operator: {
        id: `00000000-0000-4000-8000-0000000003${id}`,
        name: "Ana Operadora",
      },
    },
  ],
});

describe("ProjectMachineView", () => {
  it("keeps cursor pages, opens the operator editor, and exposes the settings affordance", async () => {
    getProjectMachineMobilizationMembersAction.mockImplementation(
      async ({ cursor }: { cursor?: string }) => ({
        data: cursor
          ? [machine("2", "Trator 02", "WHITE_LINE")]
          : [machine("1", "Escavadeira 01")],
        pageInfo: cursor
          ? { hasNextPage: false, nextCursor: null }
          : { hasNextPage: true, nextCursor: "page-2" },
      }),
    );
    const onEditMachine = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectMachineView
        canEdit
        onEditMachine={onEditMachine}
        projectId="00000000-0000-4000-8000-000000000901"
      />,
    );

    expect(await screen.findByText("Escavadeira 01")).toBeTruthy();
    const yellowMachineCard = screen.getByRole("article", {
      name: "Escavadeira 01",
    });
    expect(yellowMachineCard.getAttribute("data-machine-type")).toBe(
      "YELLOW_LINE",
    );
    expect(yellowMachineCard.className).toContain("rounded-2xl");
    expect(yellowMachineCard.className).toContain("border-l-amber-400");
    expect(yellowMachineCard.querySelector("header")?.className).toContain(
      "bg-muted/30",
    );
    expect(yellowMachineCard.querySelector("header")?.className).not.toContain(
      "bg-amber-400",
    );
    expect(screen.getByText("Linha amarela").className).toContain(
      "bg-amber-950",
    );
    expect(screen.getByRole("heading", { name: "Operadores" })).toBeTruthy();
    expect(screen.getByText("Dados da máquina")).toBeTruthy();
    expect(screen.getByText("Modelo")).toBeTruthy();
    expect(screen.getByText("Versão")).toBeTruthy();
    expect(screen.getByText("Fabricante")).toBeTruthy();
    expect(screen.getByText("Caterpillar")).toBeTruthy();
    expect(screen.getByText("Não informada")).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Editar operadores de Escavadeira 01",
      }),
    );
    expect(onEditMachine).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Escavadeira 01" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Configurações de Escavadeira 01" }),
    );
    expect(onEditMachine).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Trator 02")).toBeTruthy();
    const whiteMachineCard = screen.getByRole("article", {
      name: "Trator 02",
    });
    expect(whiteMachineCard.getAttribute("data-machine-type")).toBe(
      "WHITE_LINE",
    );
    expect(whiteMachineCard.className).toContain("border-l-slate-800");
    expect(screen.getByText("Linha branca").className).toContain(
      "bg-slate-800",
    );
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText("Escavadeira 01")).toBeTruthy();
    expect(getProjectMachineMobilizationMembersAction).toHaveBeenCalledTimes(2);
  });

  it("restarts the cursor when searching and explains an empty result", async () => {
    getProjectMachineMobilizationMembersAction.mockImplementation(
      async ({ search }: { search?: string }) => ({
        data: search ? [] : [machine("1", "Escavadeira 01")],
        pageInfo: { hasNextPage: false, nextCursor: null },
      }),
    );
    const user = userEvent.setup();

    render(
      <ProjectMachineView
        canEdit={false}
        onEditMachine={vi.fn()}
        projectId="00000000-0000-4000-8000-000000000901"
      />,
    );

    await screen.findByText("Escavadeira 01");
    await user.type(
      screen.getByRole("textbox", { name: "Buscar máquina" }),
      "sem resultado",
    );
    await waitFor(() =>
      expect(
        getProjectMachineMobilizationMembersAction,
      ).toHaveBeenLastCalledWith({
        projectId: "00000000-0000-4000-8000-000000000901",
        cursor: undefined,
        search: "sem resultado",
      }),
    );
    expect(await screen.findByText("Nenhuma máquina encontrada")).toBeTruthy();
  });
});

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

const machine = (id: string, name: string) => ({
  id: `00000000-0000-4000-8000-000000000${id}`,
  machineId: `00000000-0000-4000-8000-0000000001${id}`,
  name,
  type: "YELLOW_LINE" as const,
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
          ? [machine("2", "Trator 02")]
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

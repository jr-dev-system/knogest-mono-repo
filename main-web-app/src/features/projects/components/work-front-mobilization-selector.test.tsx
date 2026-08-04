// @vitest-environment jsdom

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const getOptions = vi.hoisted(() => vi.fn());

vi.mock("../projects.actions", () => ({
  getProjectWorkFrontMobilizationOptionsAction: getOptions,
}));

import { WorkFrontMobilizationSelector } from "./work-front-mobilization-selector";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const projectId = "00000000-0000-4000-8000-000000000901";
const frontId = "00000000-0000-4000-8000-000000000902";

function Harness() {
  const [employees, setEmployees] = React.useState<string[]>([]);
  const [machines, setMachines] = React.useState<string[]>([]);
  return (
    <WorkFrontMobilizationSelector
      disabled={false}
      projectId={projectId}
      frontId={frontId}
      selectedEmploymentIds={employees}
      selectedMachineKeys={machines}
      onSelectedEmploymentIdsChange={setEmployees}
      onSelectedMachineKeysChange={setMachines}
    />
  );
}

describe("WorkFrontMobilizationSelector", () => {
  it("debounces filters and preserves selections and cursor pages between tabs", async () => {
    getOptions.mockImplementation(
      async ({
        cursor,
        resourceType,
        search,
      }: {
        cursor?: string;
        resourceType: "employee" | "machine";
        search?: string;
      }) => {
        if (resourceType === "machine") {
          return {
            data: [
              {
                resourceType: "machine" as const,
                id: "00000000-0000-4000-8000-000000000020",
                selectionKey: "00000000-0000-4000-8000-000000000020:day",
                name: "Escavadeira 01",
                manufacturer: "Caterpillar",
                model: "320",
                identifier: { kind: "COMPANY_TAG" as const, value: "PAT-01" },
                shift: "day" as const,
                operator: {
                  id: "00000000-0000-4000-8000-000000000030",
                  name: "Operador João",
                },
                occupyingFront: {
                  id: "00000000-0000-4000-8000-000000000903",
                  name: "Frente ocupada",
                },
                selected: false,
                disabled: true,
              },
            ],
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        }
        if (search === "topógrafa") {
          return {
            data: [
              {
                resourceType: "employee" as const,
                id: "00000000-0000-4000-8000-000000000013",
                name: "Carla",
                jobRole: "Topógrafa",
                shift: "night" as const,
                occupyingFront: null,
                selected: false,
                disabled: false,
              },
            ],
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        }
        if (cursor === "employee-page-2") {
          return {
            data: [
              {
                resourceType: "employee" as const,
                id: "00000000-0000-4000-8000-000000000012",
                name: "Bruno",
                jobRole: "Ajudante",
                shift: "day" as const,
                occupyingFront: null,
                selected: false,
                disabled: false,
              },
            ],
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        }
        return {
          data: [
            {
              resourceType: "employee" as const,
              id: "00000000-0000-4000-8000-000000000011",
              name: "Ana",
              jobRole: "Operadora",
              shift: "day" as const,
              occupyingFront: null,
              selected: false,
              disabled: false,
            },
          ],
          pageInfo: { hasNextPage: true, nextCursor: "employee-page-2" },
        };
      },
    );
    const user = userEvent.setup();
    render(<Harness />);

    const ana = await screen.findByRole("checkbox", { name: /Ana/u });
    await user.click(ana);
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Bruno")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Máquinas" }));
    const occupiedMachine = await screen.findByRole("checkbox", {
      name: /Escavadeira 01/u,
    });
    expect((occupiedMachine as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText("Operador: Operador João · Ocupada em Frente ocupada"),
    ).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Funcionários" }));
    expect(screen.getByText("Bruno")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(
      (screen.getByRole("checkbox", { name: /Ana/u }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    const search = screen.getByLabelText(
      "Buscar funcionário por nome ou função",
    );
    await user.type(search, "topógrafa");
    expect(getOptions).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "topógrafa" }),
    );
    await waitFor(() =>
      expect(getOptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: "topógrafa",
          resourceType: "employee",
        }),
      ),
    );
    expect(await screen.findByText("Carla")).toBeTruthy();

    await user.clear(search);
    await waitFor(() => expect(screen.getByText("Ana")).toBeTruthy());
    expect(
      (screen.getByRole("checkbox", { name: /Ana/u }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});

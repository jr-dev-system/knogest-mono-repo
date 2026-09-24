// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MachineUnitBatchWizard } from "./machine-unit-batch-wizard";

afterEach(cleanup);

describe("MachineUnitBatchWizard", () => {
  it("keeps loaded works and loads the next eligible page", async () => {
    const user = userEvent.setup();
    const searchProjectsAction = vi.fn(
      async (input?: { cursor?: string | null }) =>
        input?.cursor
          ? {
              ok: true as const,
              page: {
                data: [
                  {
                    id: "00000000-0000-4000-8000-000000000102",
                    name: "Obra em andamento",
                    contractNumber: "CT-02",
                    status: "active" as const,
                  },
                ],
                pageInfo: { hasNextPage: false, nextCursor: null },
              },
            }
          : {
              ok: true as const,
              page: {
                data: [
                  {
                    id: "00000000-0000-4000-8000-000000000101",
                    name: "Obra planejada",
                    contractNumber: "CT-01",
                    status: "planned" as const,
                  },
                ],
                pageInfo: { hasNextPage: true, nextCursor: "next-page" },
              },
            },
    );

    render(
      <MachineUnitBatchWizard
        action={async () => ({
          ok: true,
          createdCount: 1,
          rejected: [],
          message: "Unidade criada.",
        })}
        loadProjectAction={async () => ({
          ok: false,
          message: "Não usado neste teste.",
        })}
        model={{
          id: "00000000-0000-4000-8000-000000000001",
          name: "Escavadeira 320",
          requiresOperator: false,
          requiredJobRoleId: null,
          requiredJobRoleName: null,
        }}
        onOpenChange={() => undefined}
        open
        searchProjectsAction={searchProjectsAction}
      />,
    );

    expect(await screen.findByText("Obra planejada")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Carregar mais obras" }),
    );
    expect(await screen.findByText("Obra em andamento")).toBeTruthy();
    expect(searchProjectsAction).toHaveBeenLastCalledWith({
      cursor: "next-page",
      search: "",
    });
    expect(screen.getByText("Obra planejada")).toBeTruthy();
  });
});

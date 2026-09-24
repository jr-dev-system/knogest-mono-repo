// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MachinesPageView } from "./machines-page";

afterEach(cleanup);

describe("MachinesPageView", () => {
  it("creates only a catalog model and exposes the optional version", async () => {
    const user = userEvent.setup();
    render(
      <MachinesPageView
        action={async () => ({ ok: true, message: "Modelo cadastrado." })}
        batchAction={async () => ({
          ok: true,
          createdCount: 1,
          rejected: [],
          message: "Unidade criada.",
        })}
        jobRoles={[
          { id: "00000000-0000-4000-8000-000000000001", name: "Operador" },
        ]}
        loadProjectAction={async () => ({
          ok: false,
          message: "Não usado neste teste.",
        })}
        pageInfo={{ hasNextPage: false, nextCursor: null }}
        query={{ sortBy: "createdAt", sortDirection: "desc" }}
        rows={[]}
        searchProjectsAction={async () => ({
          ok: true,
          page: {
            data: [],
            pageInfo: { hasNextPage: false, nextCursor: null },
          },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Novo modelo" }));
    expect(screen.getByLabelText("Versão (opcional)")).toBeTruthy();
    expect(screen.queryByText("Unidades físicas")).toBeNull();
    expect(screen.queryByText("Tipo de leitura")).toBeNull();
  });

  it("shows review without submitting and submits only from the final action", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      ok: true,
      message: "Modelo cadastrado.",
      createdModel: {
        id: "00000000-0000-4000-8000-000000000010",
        name: "Volvo VM",
        requiresOperator: true,
        requiredJobRoleId: "00000000-0000-4000-8000-000000000001",
        requiredJobRoleName: "Operador",
      },
    }));
    render(
      <MachinesPageView
        action={action}
        batchAction={async () => ({
          ok: true,
          createdCount: 1,
          rejected: [],
          message: "Criada.",
        })}
        jobRoles={[
          { id: "00000000-0000-4000-8000-000000000001", name: "Operador" },
        ]}
        loadProjectAction={async () => ({ ok: false, message: "Não usado." })}
        pageInfo={{ hasNextPage: false, nextCursor: null }}
        query={{ sortBy: "createdAt", sortDirection: "desc" }}
        rows={[]}
        searchProjectsAction={async () => ({
          ok: true,
          page: {
            data: [],
            pageInfo: { hasNextPage: false, nextCursor: null },
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Novo modelo" }));
    await user.type(screen.getByLabelText("Fabricante"), "Volvo");
    await user.type(screen.getByLabelText("Modelo"), "VM");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.selectOptions(
      screen.getByLabelText("Função exigida"),
      "00000000-0000-4000-8000-000000000001",
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    expect(
      screen.getByRole("region", { name: "Revisão do modelo" }),
    ).toBeTruthy();
    expect(action).not.toHaveBeenCalled();

    const finalAction = screen.getByRole("button", { name: "Criar modelo" });
    expect(finalAction.getAttribute("type")).toBe("button");
    fireEvent.submit(finalAction.closest("form")!);
    expect(action).not.toHaveBeenCalled();

    await user.click(finalAction);
    expect(action).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Criar unidades agora?")).toBeTruthy();
  });

  it("adds the capacity step only for white-line models", async () => {
    const user = userEvent.setup();
    render(
      <MachinesPageView
        action={async () => ({ ok: false, message: "Não usado." })}
        batchAction={async () => ({ ok: false, message: "Não usado." })}
        jobRoles={[]}
        loadProjectAction={async () => ({ ok: false, message: "Não usado." })}
        pageInfo={{ hasNextPage: false, nextCursor: null }}
        query={{ sortBy: "createdAt", sortDirection: "desc" }}
        rows={[]}
        searchProjectsAction={async () => ({
          ok: true,
          page: {
            data: [],
            pageInfo: { hasNextPage: false, nextCursor: null },
          },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Novo modelo" }));
    expect(screen.queryByText("Capacidade", { selector: "span" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Tipo"), "WHITE_LINE");
    expect(screen.getByText("Capacidade", { selector: "span" })).toBeTruthy();
  });
});

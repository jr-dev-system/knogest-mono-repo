// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MachinesPageView } from "./machines-page";

const jobRoles = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Operador" },
];
type MachineAction = (
  state: { ok: boolean; message: string },
  formData: FormData,
) => Promise<{ ok: boolean; message: string }>;

afterEach(cleanup);

function renderMachines(
  action: MachineAction = async () => ({
    ok: true,
    message: "Modelo e unidades cadastrados.",
  }),
) {
  return render(
    <MachinesPageView
      action={action}
      jobRoles={jobRoles}
      pageInfo={{ hasNextPage: false, nextCursor: null }}
      query={{ sortBy: "createdAt", sortDirection: "desc" }}
      rows={[]}
    />,
  );
}

async function fillModelStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Fabricante"), "Caterpillar");
  await user.type(screen.getByLabelText("Modelo"), "320 GC");
  await user.selectOptions(
    screen.getByLabelText("Função exigida"),
    jobRoles[0].id,
  );
}

async function fillFirstUnit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome da unidade"), "Escavadeira 01");
  await user.type(screen.getByLabelText("Patrimônio"), "MCH-001");
  await user.type(screen.getByLabelText("Leitura inicial (h)"), "12,50");
}

describe("MachinesPageView model registration", () => {
  it("validates the first step and clears the operator role when it is not required", async () => {
    const user = userEvent.setup();
    const action = vi.fn<MachineAction>(async () => ({
      ok: true,
      message: "Modelo e unidades cadastrados.",
    }));
    renderMachines(action);
    await user.click(screen.getByRole("button", { name: "Nova máquina" }));
    expect(screen.getByText("Etapa 1 de 3")).toBeTruthy();
    expect(screen.getByLabelText("Função exigida")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(
      await screen.findByText("Há erros nesta etapa do formulário."),
    ).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Exige operador?"), "false");
    expect(screen.queryByLabelText("Função exigida")).toBeNull();
    await user.type(screen.getByLabelText("Fabricante"), "Caterpillar");
    await user.type(screen.getByLabelText("Modelo"), "320 GC");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(await screen.findByLabelText("Nome da unidade")).toBeTruthy();
    await fillFirstUnit(user);
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      screen.getByRole("button", { name: "Cadastrar catálogo" }),
    );
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submittedData = action.mock.calls[0]![1];
    expect(submittedData.has("requiredJobRoleId")).toBe(false);
  });

  it("keeps the selected meter type and manages multiple physical units", async () => {
    const user = userEvent.setup();
    renderMachines();
    await user.click(screen.getByRole("button", { name: "Nova máquina" }));
    await fillModelStep(user);
    const odometer = screen.getByRole("button", { name: "Quilometragem (km)" });
    await user.click(odometer);
    expect(odometer.getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(screen.getByLabelText("Leitura inicial (km)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Adicionar unidade" }));
    expect(screen.getAllByLabelText("Nome da unidade")).toHaveLength(2);
    expect(screen.getAllByLabelText("Leitura inicial (km)")).toHaveLength(2);
  });

  it("preserves the draft through review and shows a formal error when submission fails", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      ok: false,
      message: "Revise os dados.",
    }));
    renderMachines(action);
    await user.click(screen.getByRole("button", { name: "Nova máquina" }));
    await fillModelStep(user);
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await fillFirstUnit(user);
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(await screen.findByLabelText("Revisão do cadastro")).toBeTruthy();
    expect(screen.getByText("Escavadeira 01 · MCH-001")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Editar" })[2]);
    expect(
      (screen.getByLabelText("Nome da unidade") as HTMLInputElement).value,
    ).toBe("Escavadeira 01");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      screen.getByRole("button", { name: "Cadastrar catálogo" }),
    );
    await screen.findByText("Revise os dados.");
    expect(action).toHaveBeenCalledTimes(1);
  });
});

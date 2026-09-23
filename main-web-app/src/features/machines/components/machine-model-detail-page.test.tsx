// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, Toaster } from "sonner";

import type { MachineActionState } from "../machines-action-state";
import type { MachineModelDetail } from "../machines.server";
import { MachineModelDetailPage } from "./machine-model-detail-page";

type AddUnitsAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;

const model: MachineModelDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  description: null,
  type: "YELLOW_LINE",
  manufacturer: "Caterpillar",
  model: "320 GC",
  meterType: "HOUR_METER",
  loadVolumeM3: null,
  maxSupportedWeightT: null,
  requiresOperator: true,
  requiredJobRole: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Operador",
  },
  unitCount: 0,
  units: [],
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.clearAllMocks();
});

function renderPage(action: AddUnitsAction) {
  return render(
    <>
      <MachineModelDetailPage model={model} action={action} />
      <Toaster position="top-center" />
    </>,
  );
}

async function fillUnitForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome da unidade 1"), "Escavadeira 01");
  await user.type(screen.getByLabelText("Leitura inicial (h)"), "12,50");
}

describe("MachineModelDetailPage", () => {
  it("announces a successful unit addition with a transient toast", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    const action = vi.fn<AddUnitsAction>(async () => ({
      ok: true,
      message: "Unidades adicionadas.",
    }));
    renderPage(action);

    await fillUnitForm(user);
    await user.click(
      screen.getByRole("button", { name: "Adicionar unidades" }),
    );

    await waitFor(() => {
      expect(success).toHaveBeenCalledWith("Unidades adicionadas.");
    });
    const notification = await screen.findByText("Unidades adicionadas.");
    expect(notification.closest("[data-sonner-toast]")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a failed addition actionable in the form without duplicating it in a toast", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    const action = vi.fn<AddUnitsAction>(async () => ({
      ok: false,
      message: "Placa ou patrimônio já está em uso nesta empresa.",
    }));
    renderPage(action);

    await fillUnitForm(user);
    await user.click(
      screen.getByRole("button", { name: "Adicionar unidades" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Não foi possível adicionar as unidades.",
    );
    expect(alert.textContent).toContain(
      "Placa ou patrimônio já está em uso nesta empresa.",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Adicionar unidades",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(error).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("locks every mutable control while the addition is pending", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    let resolveAction: (result: MachineActionState) => void = () => undefined;
    const action = vi.fn<AddUnitsAction>(
      () =>
        new Promise<MachineActionState>((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderPage(action);

    await fillUnitForm(user);
    await user.click(
      screen.getByRole("button", { name: "Adicionar unidades" }),
    );

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(
      (screen.getByLabelText("Nome da unidade 1") as HTMLInputElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("Placa") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByLabelText("Patrimônio") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Leitura inicial (h)") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Outra unidade",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Salvando" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveAction({ ok: true, message: "Unidades adicionadas." });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
  });
});

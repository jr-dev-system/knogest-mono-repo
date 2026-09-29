// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, Toaster } from "sonner";

import type { MachineActionState } from "../machines-action-state";
import type { MachineModelDetail } from "../machines.server";
import { MachineModelDetailPage } from "./machine-model-detail-page";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

type AddUnitsAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;
type MachineUnit = MachineModelDetail["units"][number];

function unit(id: number, overrides: Partial<MachineUnit> = {}): MachineUnit {
  const suffix = String(id).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    name: `Unidade ${String(id).padStart(2, "0")}`,
    description: null,
    type: "YELLOW_LINE",
    manufacturer: "Caterpillar",
    model: "320 GC",
    version: null,
    meterType: "HOUR_METER",
    loadCapacity: null,
    loadCapacityUnitCode: null,
    loadVolumeM3: null,
    maxSupportedWeightT: null,
    machineModel: {
      id: "00000000-0000-4000-8000-000000000001",
      requiresOperator: true,
      requiredJobRole: {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Operador",
      },
    },
    identifiers: {
      plate: { value: `ABC-${id}D23`, normalizedValue: `ABC${id}D23` },
      companyTag: null,
    },
    latestMeterReading: {
      id: `10000000-0000-4000-8000-${suffix}`,
      value: `${id}.50`,
      purpose: "INITIAL",
      recordedAt: "2026-09-22T00:00:00.000Z",
    },
    availability: { state: "available", hasOpenAllocation: false },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...overrides,
  } as MachineUnit;
}

const model: MachineModelDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  description: "Escavadeira hidráulica para operações de terraplenagem.",
  type: "YELLOW_LINE",
  manufacturer: "Caterpillar",
  model: "320 GC",
  version: null,
  requiresOperator: true,
  requiredJobRole: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Operador",
  },
  unitCount: 3,
  units: [
    unit(1),
    unit(2, {
      name: "Pá carregadeira",
      meterType: "ODOMETER",
      identifiers: {
        plate: null,
        companyTag: { value: "PAT-200", normalizedValue: "PAT200" },
      },
      availability: { state: "unavailable", hasOpenAllocation: true },
    }),
    unit(3, {
      name: "Rolo compactador",
    }),
  ],
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.clearAllMocks();
});

function renderPage(
  action: AddUnitsAction = async () => ({
    ok: true,
    message: "Unidade criada.",
  }),
  currentModel: MachineModelDetail = model,
  mutations: {
    deleteAction?: () => Promise<MachineActionState>;
    updateAction?: AddUnitsAction;
  } = {},
) {
  return render(
    <>
      <MachineModelDetailPage
        model={currentModel}
        action={action}
        deleteAction={
          mutations.deleteAction ??
          (async () => ({ ok: true, message: "Modelo excluído." }))
        }
        jobRoles={[
          {
            id: "00000000-0000-4000-8000-000000000002",
            name: "Operador",
          },
        ]}
        loadProjectAction={async () => ({
          ok: true,
          project: {
            id: "00000000-0000-4000-8000-000000000101",
            name: "Obra Norte",
            status: "planned",
            shifts: ["day"],
            operators: [
              {
                employmentId: "00000000-0000-4000-8000-000000000201",
                name: "Maria Operadora",
                jobRole: "Operador",
                confirmedJobRoleId:
                  "00000000-0000-4000-8000-000000000002",
                shift: "day",
              },
            ],
          },
        })}
        searchProjectsAction={async () => ({
          ok: true,
          page: {
            data: [
              {
                id: "00000000-0000-4000-8000-000000000101",
                name: "Obra Norte",
                contractNumber: "CT-01",
                status: "planned",
              },
            ],
            pageInfo: { hasNextPage: false, nextCursor: null },
          },
        })}
        updateAction={
          mutations.updateAction ??
          (async () => ({ ok: true, message: "Modelo atualizado." }))
        }
      />
      <Toaster position="top-center" />
    </>,
  );
}

async function reachOperationStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Nova unidade" }));
  await user.type(screen.getByLabelText("Nome (opcional)"), "Escavadeira 01");
  await user.type(screen.getByLabelText("Placa"), "ASL-0123");
  await user.click(screen.getByRole("button", { name: "Avançar" }));
}

async function reachReviewStep(user: ReturnType<typeof userEvent.setup>) {
  await reachOperationStep(user);
  await user.type(screen.getByLabelText("Leitura inicial"), "12,50");
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  await screen.findByText("Alocação inicial");
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  await screen.findByRole("region", { name: "Revisão da unidade" });
}

describe("MachineModelDetailPage", () => {
  it("presents the model context and operational unit columns", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "320 GC" })).toBeTruthy();
    expect(screen.getByText("Caterpillar")).toBeTruthy();
    expect(
      screen.getByText(
        "Escavadeira hidráulica para operações de terraplenagem.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Unidade" })).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Identificadores" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Capacidade" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Última leitura" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Disponibilidade" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ver unidade Unidade 01" })
        .getAttribute("href"),
    ).toBe("/home/maquinas/00000000-0000-4000-8000-000000000001");
  });

  it("shows each unit capacity with its measurement unit", () => {
    renderPage(undefined, {
      ...model,
      type: "WHITE_LINE",
      units: [
        unit(1, {
          type: "WHITE_LINE",
          loadCapacity: "16.000",
          loadCapacityUnitCode: "M3_LOOSE",
          loadVolumeM3: "16.000",
        }),
        unit(2, {
          type: "WHITE_LINE",
          loadCapacity: "8000.000",
          loadCapacityUnitCode: "LITER",
        }),
        unit(3, { type: "WHITE_LINE" }),
      ],
    });

    expect(screen.getByText("16 m³ solto")).toBeTruthy();
    expect(screen.getByText("8.000 L")).toBeTruthy();
    expect(screen.getByText("Não informada")).toBeTruthy();
  });

  it("prefills and submits the model editor", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn<AddUnitsAction>(async () => ({
      ok: true,
      message: "Modelo atualizado.",
    }));
    renderPage(undefined, model, { updateAction });

    await user.click(screen.getByRole("button", { name: "Editar modelo" }));
    expect((screen.getByLabelText("Fabricante") as HTMLInputElement).value).toBe(
      "Caterpillar",
    );
    expect((screen.getByLabelText("Modelo") as HTMLInputElement).value).toBe(
      "320 GC",
    );
    await user.clear(screen.getByLabelText("Descrição (opcional)"));
    await user.type(
      screen.getByLabelText("Descrição (opcional)"),
      "Modelo revisado",
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      screen.getByRole("button", { name: "Salvar alterações" }),
    );

    await waitFor(() => expect(updateAction).toHaveBeenCalledTimes(1));
    expect(updateAction.mock.calls[0][1].get("description")).toBe(
      "Modelo revisado",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks model deletion while active units exist", () => {
    renderPage();

    const button = screen.getByRole("button", { name: "Excluir modelo" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Exclua as 3 unidades ativas antes de excluir o modelo."),
    ).toBeTruthy();
  });

  it("confirms an eligible soft delete and navigates to the registry", async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn(async () => ({
      ok: true,
      message: "Modelo excluído.",
    }));
    renderPage(undefined, { ...model, unitCount: 0, units: [] }, { deleteAction });

    await user.click(screen.getByRole("button", { name: "Excluir modelo" }));
    expect(screen.getByText(/todo o histórico operacional/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );

    await waitFor(() => expect(deleteAction).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/home/maquinas");
  });

  it("keeps the delete alert open when the server reports a conflict", async () => {
    const user = userEvent.setup();
    renderPage(undefined, { ...model, unitCount: 0, units: [] }, {
      deleteAction: async () => ({
        ok: false,
        message: "Este modelo possui unidades ativas e não pode ser excluído.",
      }),
    });

    await user.click(screen.getByRole("button", { name: "Excluir modelo" }));
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Este modelo possui unidades ativas e não pode ser excluído.",
    );
    expect(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    ).toBeTruthy();
  });

  it("filters units by text, availability and meter type and can clear filters", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Buscar por nome, placa ou patrimônio"),
      "PAT-200",
    );
    expect(screen.getByText("Pá carregadeira")).toBeTruthy();
    expect(screen.queryByText("Unidade 01")).toBeNull();

    await user.clear(
      screen.getByPlaceholderText("Buscar por nome, placa ou patrimônio"),
    );
    await user.selectOptions(
      screen.getByLabelText("Disponibilidade"),
      "without_rental",
    );
    expect(screen.getByText("Rolo alugado")).toBeTruthy();
    expect(screen.queryByText("Pá carregadeira")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await user.selectOptions(
      screen.getByLabelText("Tipo de medidor"),
      "ODOMETER",
    );
    expect(screen.getByText("Pá carregadeira")).toBeTruthy();
    expect(screen.queryByText("Rolo alugado")).toBeNull();
  });

  it("shows a useful empty result when filters match no unit", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Buscar por nome, placa ou patrimônio"),
      "inexistente",
    );
    expect(
      screen.getByText("Nenhuma unidade corresponde aos filtros"),
    ).toBeTruthy();
  });

  it("sorts and paginates the unit table", async () => {
    const user = userEvent.setup();
    const units = Array.from({ length: 7 }, (_, index) => unit(index + 1));
    renderPage(undefined, { ...model, unitCount: units.length, units });

    expect(screen.getByText(/1-6 de 7 registros/)).toBeTruthy();
    expect(screen.queryByText("Unidade 07")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Unidade 07")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Primeira página" }));
    await user.click(screen.getByRole("button", { name: "Unidade" }));
    const body = screen.getAllByRole("rowgroup")[1];
    expect(within(body).getAllByRole("row")[0].textContent).toContain(
      "Unidade 01",
    );
  });

  it("validates identification before advancing", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Nova unidade" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Informe a placa ou o patrimônio.");
    expect(screen.getByLabelText("Placa").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("reveals and validates rental terms only for a rented unit", async () => {
    const user = userEvent.setup();
    renderPage();
    await reachOperationStep(user);

    expect(screen.queryByLabelText("Locadora")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Propriedade"), "RENTED");
    expect(screen.getByLabelText("Locadora")).toBeTruthy();
    expect(screen.getByLabelText("Valor/hora sugerido")).toBeTruthy();

    await user.type(screen.getByLabelText("Leitura inicial"), "12,50");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Informe a locadora.");
    expect(alert.textContent).toContain(
      "Informe um valor positivo com até duas casas decimais.",
    );
  });

  it("reviews, normalizes and submits a valid unit", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    const action = vi.fn<AddUnitsAction>(async () => ({
      ok: true,
      message: "Unidade criada.",
    }));
    renderPage(action);
    await reachReviewStep(user);

    const review = screen.getByRole("region", { name: "Revisão da unidade" });
    expect(review.textContent).toContain("Escavadeira 01");
    expect(review.textContent).toContain("Placa ASL-0123");
    expect(review.textContent).toContain("Horímetro · 12,50 h");
    expect(review.textContent).toContain("Não alocar agora");

    await user.click(screen.getByRole("button", { name: "Criar unidade" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1];
    expect(submitted.get("unitInitialMeterReading")).toBe("12.50");
    expect(submitted.get("unitPlate")).toBe("ASL-0123");
    expect(success).toHaveBeenCalledWith("Unidade criada.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never submits while advancing and reaches review before creation", async () => {
    const user = userEvent.setup();
    const action = vi.fn<AddUnitsAction>(async () => ({
      ok: true,
      message: "Unidade criada.",
    }));
    renderPage(action);

    await reachOperationStep(user);
    expect(action).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Leitura inicial"), "12,50");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("Alocação inicial")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(action).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Revisão da unidade" }),
    ).toBeTruthy();
  });

  it("selects a Project and operator for atomic initial allocation", async () => {
    const user = userEvent.setup();
    const action = vi.fn<AddUnitsAction>(async () => ({
      ok: true,
      message: "Unidade criada e alocada.",
    }));
    renderPage(action);
    await reachOperationStep(user);
    await user.type(screen.getByLabelText("Leitura inicial"), "12,50");
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    await user.click(
      screen.getByRole("radio", { name: /Alocar em uma obra/ }),
    );
    await waitFor(() => expect(screen.getByText("Obra Norte")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Obra Norte/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("Operador diurno")).toBeTruthy(),
    );
    await user.selectOptions(
      screen.getByLabelText("Operador diurno"),
      "00000000-0000-4000-8000-000000000201",
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    const review = screen.getByRole("region", { name: "Revisão da unidade" });
    expect(review.textContent).toContain("Obra Norte");
    expect(review.textContent).toContain("Diurno: Maria Operadora");
    await user.click(screen.getByRole("button", { name: "Criar unidade" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1];
    expect(submitted.get("unitAllocateNow")).toBe("yes");
    expect(submitted.get("unitProjectId")).toBe(
      "00000000-0000-4000-8000-000000000101",
    );
    expect(submitted.get("unitDayOperatorEmploymentId")).toBe(
      "00000000-0000-4000-8000-000000000201",
    );
  });

  it("keeps an API failure actionable inside the wizard without an error toast", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, "error");
    const action = vi.fn<AddUnitsAction>(async () => ({
      ok: false,
      message: "Placa ou patrimônio já está em uso nesta empresa.",
    }));
    renderPage(action);
    await reachReviewStep(user);

    await user.click(screen.getByRole("button", { name: "Criar unidade" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Placa ou patrimônio já está em uso nesta empresa.",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Criar unidade",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it("locks wizard controls while creation is pending", async () => {
    const user = userEvent.setup();
    let resolveAction: (result: MachineActionState) => void = () => undefined;
    const action = vi.fn<AddUnitsAction>(
      () =>
        new Promise<MachineActionState>((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderPage(action);
    await reachReviewStep(user);

    await user.click(screen.getByRole("button", { name: "Criar unidade" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(
      (
        screen.getByRole("button", {
          name: "Criar unidade",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Voltar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveAction({ ok: true, message: "Unidade criada." });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

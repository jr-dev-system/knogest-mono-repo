// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const createJobRoleForEmployee = vi.hoisted(() => vi.fn());

vi.mock("@/features/job-roles/job-roles.actions", () => ({
  createJobRoleForEmployee,
}));

import { EmployeeCreationWizard } from "./employee-creation-wizard";
import type { EmployeeActionState } from "../employees-action-state";

type TestEmployeeAction = (
  state: EmployeeActionState,
  formData: FormData,
) => Promise<EmployeeActionState>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EmployeeCreationWizard", () => {
  async function reachEmploymentStep(
    user: ReturnType<typeof userEvent.setup>,
    action: TestEmployeeAction,
  ) {
    render(
      <EmployeeCreationWizard
        action={action}
        initialRoles={[
          {
            id: "00000000-0000-4000-8000-000000000705",
            name: "Encarregado",
            isActive: true,
          },
        ]}
        onCreated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Novo funcionário" }));
    await user.selectOptions(
      screen.getByLabelText("Função"),
      "00000000-0000-4000-8000-000000000705",
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.type(screen.getByLabelText("CPF"), "52998224725");
    await user.type(screen.getByLabelText("Nome completo"), "Ana da Silva");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.type(screen.getByLabelText("Matrícula"), "MAT-001");
    await user.type(screen.getByLabelText("Admissão"), "2026-07-01");
  }

  it("shows the review before submitting after the employment step", async () => {
    const action = vi
      .fn<TestEmployeeAction>()
      .mockResolvedValue({ ok: true, message: "Criado." });
    const user = userEvent.setup();
    await reachEmploymentStep(user, action);

    await user.click(screen.getByRole("button", { name: "Avançar" }));

    expect(
      screen.getByRole("region", { name: "Revisão do cadastro" }),
    ).toBeTruthy();
    expect(screen.getByText("Ana da Silva")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cadastrar funcionário" }),
    ).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the review without submitting when Enter advances from employment", async () => {
    const action = vi
      .fn<TestEmployeeAction>()
      .mockResolvedValue({ ok: true, message: "Criado." });
    const user = userEvent.setup();
    await reachEmploymentStep(user, action);

    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("region", { name: "Revisão do cadastro" }),
    ).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("turns a native form submit into navigation until the review is visible", async () => {
    const action = vi
      .fn<TestEmployeeAction>()
      .mockResolvedValue({ ok: true, message: "Criado." });
    const user = userEvent.setup();
    await reachEmploymentStep(user, action);

    const form = screen.getByLabelText("Admissão").closest("form");
    fireEvent.submit(form!);

    expect(
      await screen.findByRole("region", { name: "Revisão do cadastro" }),
    ).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("ignores a stray submit after entering review and waits for the final action", async () => {
    const action = vi
      .fn<TestEmployeeAction>()
      .mockResolvedValue({ ok: true, message: "Criado." });
    const user = userEvent.setup();
    await reachEmploymentStep(user, action);

    await user.click(screen.getByRole("button", { name: "Avançar" }));
    const review = screen.getByRole("region", {
      name: "Revisão do cadastro",
    });
    const form = review.closest("form");

    fireEvent.submit(form!);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(action).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Revisão do cadastro" }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Cadastrar funcionário" }),
    );
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("selects a newly created role only after a valid response", async () => {
    createJobRoleForEmployee.mockResolvedValue({
      ok: true,
      message: "Função criada e selecionada.",
      data: {
        id: "00000000-0000-4000-8000-000000000704",
        name: "Topógrafo",
        isActive: true,
      },
    });
    const user = userEvent.setup();

    render(
      <EmployeeCreationWizard
        action={async () => ({ ok: false, message: "" })}
        initialRoles={[]}
        onCreated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Novo funcionário" }));
    await user.click(screen.getByRole("button", { name: "Criar nova função" }));
    await user.type(
      screen.getByRole("textbox", { name: "Nome da nova função" }),
      "Topógrafo",
    );
    await user.click(
      screen.getByRole("button", { name: "Criar e selecionar" }),
    );

    await waitFor(() =>
      expect((screen.getByLabelText("Função") as HTMLSelectElement).value).toBe(
        "00000000-0000-4000-8000-000000000704",
      ),
    );
  });

  it("preserves the new role name and displays the request ID when creation fails", async () => {
    createJobRoleForEmployee.mockResolvedValue({
      ok: false,
      message:
        "Não foi possível criar a função agora. Tente novamente em instantes.",
      requestId: "00000000-0000-4000-8000-000000000703",
    });
    const user = userEvent.setup();

    render(
      <EmployeeCreationWizard
        action={async () => ({ ok: false, message: "" })}
        initialRoles={[]}
        onCreated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Novo funcionário" }));
    await user.click(screen.getByRole("button", { name: "Criar nova função" }));
    const input = screen.getByRole("textbox", { name: "Nome da nova função" });
    await user.type(input, "Topógrafo");
    await user.click(
      screen.getByRole("button", { name: "Criar e selecionar" }),
    );

    expect((input as HTMLInputElement).value).toBe("Topógrafo");
    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível criar a função agora. Tente novamente em instantes.",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "00000000-0000-4000-8000-000000000703",
    );
  });
});

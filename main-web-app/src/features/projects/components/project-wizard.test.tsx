// @vitest-environment jsdom

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../projects.actions", () => ({
  finalizeProjectAction: vi.fn(),
  lookupProjectAddressByCepAction: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

import type { BaseFormModalRenderHelpers } from "@/components/modals/BaseFormModal";
import {
  EmployeeMobilization,
  calculateSuggestedHourlyRate,
  MachineMobilization,
  ProjectWizard,
  ProjectWizardIdentity,
  ProjectWizardReview,
  ProjectWizardSubmissionNotice,
  type ProjectWizardOptions,
} from "./project-wizard";
import { emptyProjectCommand, type ProjectCommand } from "../projects-schema";
import { toast } from "sonner";
import { lookupProjectAddressByCepAction } from "../projects.actions";

const options: ProjectWizardOptions = {
  clients: [{ id: "client-1", label: "Cliente Norte" }],
  employees: [
    { id: "employee-1", label: "Ana Silva", detail: "Engenheira" },
    { id: "employee-2", label: "Bruno Lima", detail: "Operador" },
  ],
  machines: [
    {
      id: "machine-1",
      label: "Escavadeira",
      detail: "10.00",
      readingId: "reading-1",
    },
    {
      id: "machine-2",
      label: "Trator",
      detail: "20.00",
      readingId: "reading-2",
    },
  ],
  jobRoles: [{ id: "job-role-1", label: "Engenheira" }],
};

const wizardOptions: ProjectWizardOptions = {
  clients: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      label: "Cliente Norte",
    },
  ],
  employees: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      label: "Ana Silva",
      detail: "Engenheira",
    },
    {
      id: "00000000-0000-4000-8000-000000000302",
      label: "Bruno Lima",
      detail: "Operador",
    },
  ],
  machines: [],
  jobRoles: [
    {
      id: "00000000-0000-4000-8000-000000000401",
      label: "Engenheira",
    },
  ],
};

const command: ProjectCommand = {
  ...structuredClone(emptyProjectCommand),
  name: "Obra Norte",
  address: {
    postalCode: "60170000",
    street: "Rua A",
    number: "10",
    complement: null,
    neighborhood: "Meireles",
    city: "Fortaleza",
    state: "CE",
  },
  approvedBudget: "100.00",
  plannedStartDate: "2026-07-01",
  plannedEndDate: null,
  clientId: "client-1",
  managerEmploymentId: "employee-1",
  technicalResponsibilityEmploymentIds: ["employee-1"],
};

const input = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(lookupProjectAddressByCepAction).mockReset();
});

function IdentityHarness() {
  const form = useForm<ProjectCommand>({ defaultValues: emptyProjectCommand });

  React.useEffect(() => {
    form.setError("name", {
      type: "required",
      message: "Informe o nome da obra.",
    });
  }, [form]);

  return <ProjectWizardIdentity form={form} />;
}

function ReviewHarness() {
  const form = useForm<ProjectCommand>({ defaultValues: command });
  const [step, setStep] = React.useState<number | null>(null);
  const helpers: BaseFormModalRenderHelpers = {
    closeModal: () => undefined,
    currentStep: 5,
    goToStep: setStep,
  };

  return (
    <>
      <ProjectWizardReview form={form} helpers={helpers} options={options} />
      <output>
        {form.getValues("name")}:{step ?? "none"}
      </output>
    </>
  );
}

function MachineHarness({
  duplicateOperator = false,
  withTeam = true,
}: {
  duplicateOperator?: boolean;
  withTeam?: boolean;
} = {}) {
  const form = useForm<ProjectCommand>({
    defaultValues: {
      ...structuredClone(emptyProjectCommand),
      initialEmployeeAllocations: withTeam
        ? [
            {
              employmentId: "employee-1",
              shift: "day",
              confirmedJobRoleId: "job-role-1",
              confirmedJobRolePeriodId: "role-period-1",
              monthlyWorkloadHours: 220,
              compensationMode: "monthly",
              compensationValue: "0.00",
              overtimeRate: "0.00",
            },
            {
              employmentId: "employee-2",
              shift: "day",
              confirmedJobRoleId: "job-role-1",
              confirmedJobRolePeriodId: "role-period-2",
              monthlyWorkloadHours: 180,
              compensationMode: "monthly",
              compensationValue: "0.00",
              overtimeRate: "0.00",
            },
          ]
        : [],
      initialMachineAllocations: duplicateOperator
        ? [
            {
              machineId: "machine-1",
              startMeterReadingId: "reading-1",
              operatorAssignments: [
                { shift: "day", operatorEmploymentId: "employee-1" },
              ],
            },
            {
              machineId: "machine-2",
              startMeterReadingId: "reading-2",
              operatorAssignments: [
                { shift: "day", operatorEmploymentId: "employee-1" },
              ],
            },
          ]
        : [],
    },
  });
  const machineAllocations = useWatch({
    control: form.control,
    name: "initialMachineAllocations",
  });

  return (
    <>
      <MachineMobilization form={form} options={options} />
      <button
        type="button"
        onClick={() =>
          form.setValue("initialEmployeeAllocations", [], {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      >
        Remover equipe
      </button>
      <output>{JSON.stringify(machineAllocations)}</output>
    </>
  );
}

function EmployeeHarness() {
  const [sessionKey, setSessionKey] = React.useState("session-1");
  const form = useForm<ProjectCommand>({
    defaultValues: structuredClone(emptyProjectCommand),
  });
  const employeeAllocations = useWatch({
    control: form.control,
    name: "initialEmployeeAllocations",
  });

  return (
    <>
      <EmployeeMobilization
        form={form}
        options={options}
        sessionKey={sessionKey}
      />
      <button type="button" onClick={() => setSessionKey("session-2")}>
        Nova sessão
      </button>
      <output>{JSON.stringify(employeeAllocations)}</output>
    </>
  );
}

describe("Project wizard polish", () => {
  it.each([
    ["monthly", "2200,00", "220", 5, "10,00"],
    ["weekly", "550,00", "220", 5, "10,83"],
    ["fortnightly", "1100,00", "220", 5, "10,83"],
    ["daily", "100,00", "220", 5, "9,85"],
    ["hourly", "27,50", "180", 5, "27,50"],
  ] as const)(
    "calculates the base hourly value for %s compensation",
    (compensationMode, compensationValue, workload, workingDays, expected) => {
      expect(
        calculateSuggestedHourlyRate({
          compensationMode,
          compensationValue,
          monthlyWorkloadHours: workload,
          workingDaysPerWeek: workingDays,
        }),
      ).toBe(expected);
    },
  );

  it("marks invalid fields without inline validation messages", () => {
    render(<IdentityHarness />);

    expect(
      document.getElementById("project-name")?.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("Endereço")).toBeNull();
    expect(screen.getByLabelText("CEP")).toBeTruthy();
  });

  it("shows a formal readable validation declaration when advancing with invalid data", async () => {
    const user = userEvent.setup();
    render(
      <ProjectWizard
        expectedCompanyId="00000000-0000-4000-8000-000000000001"
        options={wizardOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nova obra" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    const declaration = await screen.findByRole("alert");
    expect(declaration.textContent).toContain("Há erros nesta etapa");
    expect(declaration.textContent).toContain("Nome da obra");
    expect(declaration.textContent).toContain("Informe o nome da obra");
    expect(declaration.textContent).toContain("Logradouro");
    expect(declaration.textContent).toContain("Informe o logradouro");
    expect(declaration.textContent).not.toContain("address.street");
    expect(declaration.textContent).not.toContain("Muito pequeno");
  });

  it("skips the supplier step and reaches review without supplier offers", async () => {
    const user = userEvent.setup();
    vi.mocked(lookupProjectAddressByCepAction).mockResolvedValue({
      kind: "success",
      address: {
        street: "Avenida Beira Mar",
        neighborhood: "Meireles",
        city: "Fortaleza",
        state: "CE",
      },
    });
    render(
      <ProjectWizard
        expectedCompanyId="00000000-0000-4000-8000-000000000001"
        options={wizardOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nova obra" }));

    expect(screen.getByText("Etapa 1 de 6")).toBeTruthy();
    expect(screen.queryByText("Fornecimentos")).toBeNull();

    await user.type(screen.getByLabelText("Nome da obra"), "Obra Norte");
    await user.type(screen.getByLabelText("CEP"), "60170000");
    expect(await screen.findByDisplayValue("Avenida Beira Mar")).toBeTruthy();
    await user.type(screen.getByLabelText("Início planejado"), "2026-07-01");
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    await user.selectOptions(
      screen.getByLabelText("Cliente"),
      "00000000-0000-4000-8000-000000000201",
    );
    await user.selectOptions(
      screen.getByLabelText("Gestor da obra"),
      "00000000-0000-4000-8000-000000000301",
    );
    await user.click(screen.getByLabelText(/Ana Silva/));
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    expect(await screen.findByText("Jornada semanal")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(
      await screen.findByText("Mobilização inicial da equipe"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(
      await screen.findByText("Mobilização inicial de máquinas"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    expect(
      await screen.findByRole("button", { name: "Criar obra" }),
    ).toBeTruthy();
    expect(screen.getByText("Etapa 6 de 6")).toBeTruthy();
    expect(screen.queryByText("Fornecimentos")).toBeNull();
  });

  it("fills structured address fields from ViaCEP", async () => {
    const user = userEvent.setup();
    vi.mocked(lookupProjectAddressByCepAction).mockResolvedValue({
      kind: "success",
      address: {
        street: "Avenida Beira Mar",
        neighborhood: "Meireles",
        city: "Fortaleza",
        state: "CE",
      },
    });
    render(<IdentityHarness />);

    expect(input("Logradouro").disabled).toBe(true);
    expect(input("Latitude").disabled).toBe(false);
    expect(input("Longitude").disabled).toBe(false);
    await user.type(screen.getByLabelText("CEP"), "60170000");

    expect(await screen.findByDisplayValue("Avenida Beira Mar")).toBeTruthy();
    expect(screen.getByDisplayValue("Meireles")).toBeTruthy();
    expect(screen.getByDisplayValue("Fortaleza")).toBeTruthy();
    expect(screen.getByDisplayValue("CE")).toBeTruthy();
    expect(input("Logradouro").disabled).toBe(true);
    expect(input("Bairro").disabled).toBe(true);
    expect(input("Cidade").disabled).toBe(true);
    expect(input("UF").disabled).toBe(true);
    expect(input("Número").disabled).toBe(false);
    expect(input("Complemento (opcional)").disabled).toBe(false);
    expect(input("Latitude").disabled).toBe(false);
    expect(input("Longitude").disabled).toBe(false);
  });

  it("shows a temporary toast and releases address fields when ViaCEP fails", async () => {
    const user = userEvent.setup();
    vi.mocked(lookupProjectAddressByCepAction).mockResolvedValue({
      kind: "failure",
      message: "CEP não encontrado.",
    });
    render(<IdentityHarness />);

    await user.type(screen.getByLabelText("CEP"), "60170000");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "CEP não encontrado. Preencha o endereço manualmente.",
        { position: "top-center", duration: 3500 },
      ),
    );
    expect(input("Logradouro").disabled).toBe(false);
    expect(input("Número").disabled).toBe(false);
    expect(input("Bairro").disabled).toBe(false);
    expect(input("Cidade").disabled).toBe(false);
    expect(input("UF").disabled).toBe(false);
    expect(input("Latitude").disabled).toBe(false);
    expect(input("Longitude").disabled).toBe(false);
  });

  it("returns to a review section without discarding the entered data", async () => {
    const user = userEvent.setup();
    render(<ReviewHarness />);

    await user.click(screen.getAllByRole("button", { name: "Alterar" })[0]);

    expect(screen.getByText("Obra Norte:0")).toBeTruthy();
  });

  it("explains an unknown finalization outcome with a safe recovery action", () => {
    render(
      <ProjectWizardSubmissionNotice result={{ kind: "unknown-outcome" }} />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Tentar novamente");
    expect(screen.getByRole("alert").textContent).toContain(
      "consulte o registro de obras",
    );
  });

  it("requires a selected Machine to use an operator from the initial team", async () => {
    const user = userEvent.setup();
    render(<MachineHarness />);

    await user.click(screen.getByLabelText(/Escavadeira/));
    expect(screen.queryByText("Operador confirmado")).toBeNull();
    await user.selectOptions(
      screen.getByLabelText("Operador da equipe"),
      "employee-1",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar máquina" }));

    expect(screen.getByRole("status").textContent).toContain(
      '"operatorEmploymentId":"employee-1"',
    );

    await user.click(screen.getByRole("button", { name: "Remover equipe" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        '"operatorAssignments":[]',
      ),
    );
  });

  it("removes a confirmed machine allocation from the initial mobilization", async () => {
    const user = userEvent.setup();
    render(<MachineHarness />);

    await user.click(screen.getByLabelText(/Escavadeira/));
    await user.selectOptions(
      screen.getByLabelText("Operador da equipe"),
      "employee-1",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar máquina" }));
    await user.click(
      screen.getByRole("button", { name: "Remover máquina Escavadeira" }),
    );

    expect(screen.getByRole("status").textContent).toBe("[]");
  });

  it("keeps an assigned operator unavailable for other machines", async () => {
    const user = userEvent.setup();
    render(<MachineHarness />);

    await user.click(screen.getByLabelText(/Escavadeira/));
    await user.selectOptions(
      screen.getByLabelText("Operador da equipe"),
      "employee-1",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar máquina" }));

    await user.click(screen.getByLabelText(/Trator/));
    expect(
      (
        screen.getByRole("option", {
          name: /Ana Silva — Engenheira — já alocado em outra máquina/,
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);

    await user.selectOptions(
      screen.getByLabelText("Operador da equipe"),
      "employee-2",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar máquina" }));
    await user.click(
      screen.getByRole("button", { name: "Editar máquina Escavadeira" }),
    );

    expect(
      (
        screen.getByRole("option", {
          name: "Ana Silva — Engenheira",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(
      screen.getByRole("button", { name: "Remover máquina Escavadeira" }),
    );
    await user.click(screen.getByLabelText(/Escavadeira/));

    expect(
      (
        screen.getByRole("option", {
          name: "Ana Silva — Engenheira",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(false);
  });

  it("blocks confirmation when a duplicated operator reaches the machine draft", async () => {
    const user = userEvent.setup();
    render(<MachineHarness duplicateOperator />);

    await user.click(
      screen.getByRole("button", { name: "Editar máquina Trator" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar máquina" }));

    expect(
      screen.getByText("Este operador já está vinculado a outra máquina."),
    ).toBeTruthy();
  });

  it("keeps machines unavailable until the initial team has employees", async () => {
    const user = userEvent.setup();
    render(<MachineHarness withTeam={false} />);

    expect(
      screen.getByText(
        "Selecione funcionários na equipe inicial antes de vincular máquinas.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText(/Escavadeira/) as HTMLInputElement).disabled,
    ).toBe(true);

    await user.click(screen.getByLabelText(/Escavadeira/));

    expect(
      screen.queryByRole("button", { name: "Confirmar máquina" }),
    ).toBeNull();
  });

  it("keeps project-only job roles temporary inside the current wizard session", async () => {
    const user = userEvent.setup();
    render(<EmployeeHarness />);

    await user.click(screen.getByLabelText(/Ana Silva/));
    expect(screen.queryByLabelText("Nova função")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Criar nova função" }));
    await user.type(
      screen.getByLabelText(/Aplicado somente nesta obra/),
      "Apontador",
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByText(/Apontador — somente nesta obra/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar funcionário" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"confirmedJobRoleName":"Apontador"',
    );

    await user.click(screen.getByLabelText(/Bruno Lima/));
    expect(screen.getByRole("option", { name: "Apontador" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(screen.getByRole("button", { name: "Nova sessão" }));
    await user.click(screen.getByLabelText(/Ana Silva/));
    expect(screen.queryByRole("option", { name: "Apontador" })).toBeNull();
  });
});

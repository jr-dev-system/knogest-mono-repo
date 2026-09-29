// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperationalDay } from "../operational-day.types";
import type { ProjectProductionOptions } from "../productions.types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("../operational-day.actions", () => ({
  addOperationalInterferenceAction: vi.fn(),
  closeOperationalShiftAction: vi.fn(),
  confirmOperationalInterferenceAction: vi.fn(),
  saveOperationalRdoAction: vi.fn(),
  startOperationalShiftAction: vi.fn(),
}));
vi.mock("../productions.actions", () => ({
  createHaulRouteAction: vi.fn(),
  getEarthworkCatalogOptionsAction: vi.fn().mockResolvedValue({
    materials: { data: [], pageInfo: { hasNextPage: false, nextCursor: null } },
    routes: { data: [], pageInfo: { hasNextPage: false, nextCursor: null } },
  }),
  getProjectProductionOptionsAction: vi.fn(),
  getProjectProductionTruckOptionsAction: vi.fn(),
  saveProjectProductionAction: vi.fn(),
  saveProjectProductionPairAction: vi.fn(),
}));

import { ProjectOperationalDay } from "./project-operational-day";
import {
  closeOperationalShiftAction,
  startOperationalShiftAction,
} from "../operational-day.actions";
import { getProjectProductionOptionsAction } from "../productions.actions";

afterEach(cleanup);

function operationalDay(withResources = true): OperationalDay {
  return {
    reportDate: "2026-09-24",
    shifts: [
      {
        shift: "day",
        enabled: true,
        suggestedStartedAt: "2026-09-24T20:00:00.000Z",
        report: null,
        options: {
          defaults: {
            breakTemplates: [
              {
                id: "break-lunch",
                name: "Almoço",
                durationMinutes: 60,
              },
            ],
            schedulePeriods: [
              {
                startTime: "08:00",
                endTime: "17:00",
                startDayOffset: 0,
                endDayOffset: 0,
              },
            ],
            activityStartTime: "08:00",
            activityEndTime: "17:00",
            activityEndDayOffset: 0,
            supervisorEmploymentId: null,
            technicalResponsibilityEmploymentIds: [],
          },
          responsibleOptions: [],
          employeeOptions: withResources
            ? [
                {
                  id: "employee-1",
                  name: "Bianca Souza",
                  jobRole: "Operadora",
                  overtimeEnabled: true,
                },
              ]
            : [],
          machineOptions: withResources
            ? [
                {
                  id: "machine-1",
                  name: "PIPA",
                  manufacturer: "Volvo",
                  model: "K2030",
                  meterType: "hour_meter",
                  startMeterReading: { id: "reading-1", value: "10.00" },
                },
              ]
            : [],
        },
      },
      {
        shift: "night",
        enabled: false,
        suggestedStartedAt: null,
        report: null,
        options: null,
      },
    ],
  };
}

const productionOptions: ProjectProductionOptions = {
  project: { id: "project-1", name: "Obra Serra", status: "ACTIVE" },
  defaults: { productionDate: "2026-09-24", shift: "day" },
  dateLimits: {
    minimum: "2026-09-17",
    maximum: "2026-09-24",
    timeZone: "America/Sao_Paulo",
  },
  capabilities: {
    createDraft: true,
    submit: true,
    check: true,
    recordTopography: true,
    recordLaboratory: true,
    approve: true,
    reject: true,
    release: true,
    publishDirect: true,
    approveOthers: true,
    reopen: true,
    viewHistory: true,
    measure: false,
  },
  responsibleOptions: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ana",
      jobRole: "Supervisora",
    },
  ],
  workFronts: [
    {
      id: "front-1",
      name: "Frente Norte",
      location: "Estaca 10",
      services: [
        {
          id: "service-1",
          serviceCode: "cut",
          unitCode: "M3",
          quantity: "100.000",
          productionProfile: "excavation",
          dmtPolicy: "optional",
        },
      ],
      equipment: [],
      trucks: [],
    },
  ],
};

function runningOperationalDay(): OperationalDay {
  const value = operationalDay();
  value.shifts[0]!.report = {
    id: "22222222-2222-4222-8222-222222222222",
    status: "draft",
    shift: "day",
    startedAt: "2026-09-24T11:00:00.000Z",
    finalizedAt: null,
    activityWindow: { startTime: "08:00", endTime: "17:00", endDayOffset: 0 },
    schedulePeriods: [],
    supervisor: {
      employmentId: "11111111-1111-4111-8111-111111111111",
      name: "Ana",
    },
    technicalResponsibilities: [],
    activityTypes: [],
    climateConditions: [],
    rainfall: { dailyMm: "0", monthlyMm: "0" },
    executedActivities: "",
    employees: [],
    machines: [],
    interferenceEntries: [],
  };
  return value;
}

function closingOperationalDay(machineCount = 1, employeeCount = 1) {
  const value = runningOperationalDay();
  const report = value.shifts[0]!.report!;
  report.activityTypes = ["earthworks"];
  report.climateConditions = ["dry"];
  report.executedActivities = "Execução da frente norte.";
  report.schedulePeriods = [
    {
      startTime: "08:00",
      endTime: "17:00",
      startDayOffset: 0,
      endDayOffset: 0,
    },
  ];
  report.employees = Array.from({ length: employeeCount }, (_, index) => ({
    employmentId: `employee-${index + 1}`,
    name: `Funcionário ${index + 1}`,
    jobRole: "Operador",
    overtimeEnabled: true,
    attendanceStatus: "present" as const,
    checkInAt: "2026-09-24T11:00:00.000Z",
    checkOutAt: null,
    overtimeConfirmed: false,
    breaks: [],
  }));
  report.machines = Array.from({ length: machineCount }, (_, index) => ({
    machineId: `machine-${index + 1}`,
    name: `Máquina ${index + 1}`,
    manufacturer: "Volvo",
    model: "K2030",
    meterType: index % 2 ? ("odometer" as const) : ("hour_meter" as const),
    startMeterReading: {
      id: `reading-${index + 1}`,
      value: `${10 + index}.00`,
    },
    operationalCondition: "fit" as const,
  }));
  return value;
}

describe("ProjectOperationalDay", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows the allocated employees and machines in the start checklist", () => {
    render(
      <ProjectOperationalDay
        initialDay={operationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Iniciar turno" }));

    expect(screen.getByLabelText("Horário de início")).toBeTruthy();
    expect(screen.queryByText("Bianca Souza")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar horário e continuar",
      }),
    );

    expect(screen.getByText("Bianca Souza")).toBeTruthy();
    expect(screen.getByText("PIPA")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirmar checklists e iniciar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("explains missing allocations and blocks the start command", () => {
    render(
      <ProjectOperationalDay
        initialDay={operationalDay(false)}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Iniciar turno" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar horário e continuar",
      }),
    );

    expect(
      screen.getByText("Nenhum funcionário está alocado neste turno."),
    ).toBeTruthy();
    expect(
      screen.getByText("Nenhuma máquina está alocada neste turno."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirmar checklists e iniciar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("sends the confirmed start time only after both checklists", async () => {
    vi.mocked(startOperationalShiftAction).mockResolvedValue({
      kind: "success",
      day: runningOperationalDay(),
    });
    render(
      <ProjectOperationalDay
        initialDay={operationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Iniciar turno" }));
    fireEvent.change(screen.getByLabelText("Horário de início"), {
      target: { value: "07:30" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar horário e continuar",
      }),
    );
    expect(startOperationalShiftAction).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar checklists e iniciar",
      }),
    );

    await waitFor(() =>
      expect(startOperationalShiftAction).toHaveBeenCalledWith(
        expect.objectContaining({
          startedAt: "2026-09-24T07:30:00-03:00",
        }),
      ),
    );
  });

  it("guides machine and employee batches and returns edits to review", () => {
    render(
      <ProjectOperationalDay
        initialDay={closingOperationalDay(7, 11)}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar turno" }));
    fireEvent.change(screen.getByLabelText("Encerramento"), {
      target: { value: "18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));

    expect(screen.getByText("1–6 de 7")).toBeTruthy();
    expect(screen.getByLabelText("Leitura final de Máquina 6")).toBeTruthy();
    expect(screen.queryByText("Máquina 7")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Próximas máquinas" }));
    expect(screen.getByText("7–7 de 7")).toBeTruthy();
    expect(screen.getByText("Máquina 7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));

    expect(screen.getByText("1–10 de 11")).toBeTruthy();
    screen
      .getAllByRole("checkbox")
      .forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(
      screen.getByRole("button", { name: "Próximos funcionários" }),
    );
    expect(screen.getByText("11–11 de 11")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));

    expect(
      screen.getByRole("heading", { name: "Revisão do fechamento" }),
    ).toBeTruthy();
    expect(screen.getByText("11:00")).toBeTruthy();
    expect(screen.queryByText(/R\$/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Editar horários" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar à revisão" }));
    expect(
      screen.getByRole("heading", { name: "Revisão do fechamento" }),
    ).toBeTruthy();
  });

  it("submits the complete close command from the review", async () => {
    const day = closingOperationalDay();
    vi.mocked(closeOperationalShiftAction).mockResolvedValue({
      kind: "success",
      day,
    });
    render(
      <ProjectOperationalDay
        initialDay={day}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar turno" }));
    fireEvent.change(screen.getByLabelText("Encerramento"), {
      target: { value: "18:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar intervalo" }),
    );
    fireEvent.click(
      screen.getByRole("combobox", { name: "Usar intervalo cadastrado" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Almoço · 01:00" }),
    );
    fireEvent.change(screen.getByLabelText("Início"), {
      target: { value: "12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao turno" }));
    expect(screen.getByText("12:00–13:00 · 01:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    expect(screen.getByText("Hora extra conferida: 01:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar e finalizar turno",
      }),
    );

    await waitFor(() =>
      expect(closeOperationalShiftAction).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            endedAt: "2026-09-24T18:00:00-03:00",
            employees: [
              expect.objectContaining({
                employmentId: "employee-1",
                breaks: [
                  {
                    startAt: "2026-09-24T15:00:00.000Z",
                    endAt: "2026-09-24T16:00:00.000Z",
                  },
                ],
                overtimeConfirmed: true,
              }),
            ],
            machines: [
              {
                machineId: "machine-1",
                endMeterReadingValue: "10.00",
              },
            ],
          }),
        }),
      ),
    );
  });

  it("only requests overtime confirmation after the scheduled shift end", () => {
    render(
      <ProjectOperationalDay
        initialDay={closingOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar turno" }));
    fireEvent.change(screen.getByLabelText("Encerramento"), {
      target: { value: "17:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Hora extra conferida/u)).toBeNull();
  });

  it("creates a custom interval for the whole shift", async () => {
    render(
      <ProjectOperationalDay
        initialDay={closingOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar turno" }));
    fireEvent.change(screen.getByLabelText("Encerramento"), {
      target: { value: "18:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar intervalo" }),
    );
    fireEvent.click(
      screen.getByRole("combobox", { name: "Usar intervalo cadastrado" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Criar novo intervalo" }),
    );
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Lanche" },
    });
    fireEvent.change(screen.getByLabelText("Início"), {
      target: { value: "16:40" },
    });
    fireEvent.change(screen.getByLabelText("Duração (min)"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao turno" }));

    expect(screen.getByText("Lanche")).toBeTruthy();
    expect(screen.getByText("16:40–17:00 · 00:20")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    expect(screen.queryByText("Intervalos do turno")).toBeNull();
  });

  it("accepts the displayed start minute when the stored start has seconds", () => {
    const day = closingOperationalDay();
    const report = day.shifts[0]!.report!;
    report.startedAt = "2026-09-24T19:22:37.000Z";
    report.activityWindow = {
      startTime: "16:22",
      endTime: "20:00",
      endDayOffset: 0,
    };
    report.employees[0]!.checkInAt = report.startedAt;
    vi.mocked(closeOperationalShiftAction).mockResolvedValue({
      kind: "success",
      day,
    });

    render(
      <ProjectOperationalDay
        initialDay={day}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar turno" }));
    fireEvent.change(screen.getByLabelText("Encerramento"), {
      target: { value: "20:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));

    expect(
      screen.getByRole("heading", { name: "Revisão do fechamento" }),
    ).toBeTruthy();
    expect(screen.queryByText(/devem ficar dentro do turno/u)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar e finalizar turno" }),
    );

    expect(closeOperationalShiftAction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employees: [
            expect.objectContaining({
              checkInAt: "2026-09-24T19:22:37.000Z",
            }),
          ],
        }),
      }),
    );
  });

  it("opens contextual production over the operational day", async () => {
    vi.mocked(getProjectProductionOptionsAction).mockResolvedValue(
      productionOptions,
    );
    const view = render(
      <ProjectOperationalDay
        initialDay={runningOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Adicionar produção" }));

    expect(
      await screen.findByRole("heading", { name: "Nova produção" }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "Corte · m³" })).toBeTruthy();
    expect(screen.queryByLabelText("Responsável")).toBeNull();
    expect(screen.queryByLabelText("Data")).toBeNull();
    expect(screen.queryByLabelText("Turno")).toBeNull();
    expect(screen.queryByLabelText("Início")).toBeNull();
    expect(screen.queryByLabelText("Fim")).toBeNull();
    expect(push).not.toHaveBeenCalled();

    expect(screen.getByLabelText("Frente")).toBeTruthy();

    refresh.mockClear();
    fireEvent.focus(window);
    expect(refresh).not.toHaveBeenCalled();

    view.rerender(
      <ProjectOperationalDay
        initialDay={runningOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );
    expect(screen.getByLabelText("Frente")).toBeTruthy();
    expect(screen.queryByText("Tipo de lançamento")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("heading", { name: "Nova produção" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Central operacional" }),
    ).toBeTruthy();
  });

  it("blocks contextual production until a work front is started", async () => {
    vi.mocked(getProjectProductionOptionsAction).mockResolvedValue({
      ...productionOptions,
      workFronts: [],
    });
    render(
      <ProjectOperationalDay
        initialDay={runningOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Adicionar produção" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Inicie uma frente de serviço antes de registrar produção.",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Avançar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Frente") as HTMLSelectElement).options,
    ).toHaveLength(0);
  });
});

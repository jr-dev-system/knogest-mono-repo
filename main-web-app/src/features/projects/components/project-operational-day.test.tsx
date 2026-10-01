// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperationalDay } from "../operational-day.types";
import type {
  ProjectDailyReportProductionSummary,
  ProjectProductionOptions,
} from "../productions.types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("../operational-day.actions", () => ({
  addOperationalInterferenceAction: vi.fn(),
  closeOperationalShiftAction: vi.fn(),
  confirmOperationalInterferenceAction: vi.fn(),
  recordOperationalStatusAction: vi.fn(),
  saveOperationalRdoAction: vi.fn(),
  startOperationalShiftAction: vi.fn(),
}));
vi.mock("../productions.actions", () => ({
  createHaulRouteAction: vi.fn(),
  getEarthworkCatalogOptionsAction: vi.fn().mockResolvedValue({
    materials: { data: [], pageInfo: { hasNextPage: false, nextCursor: null } },
    routes: { data: [], pageInfo: { hasNextPage: false, nextCursor: null } },
  }),
  getDailyReportProductionsAction: vi.fn(),
  getProjectProductionAction: vi.fn(),
  getProjectProductionOptionsAction: vi.fn(),
  getProjectProductionTruckOptionsAction: vi.fn(),
  saveProjectProductionAction: vi.fn(),
  saveProjectProductionPairAction: vi.fn(),
  reopenProjectProductionAction: vi.fn(),
}));

import { ProjectOperationalDay } from "./project-operational-day";
import {
  closeOperationalShiftAction,
  recordOperationalStatusAction,
  startOperationalShiftAction,
} from "../operational-day.actions";
import {
  getDailyReportProductionsAction,
  getProjectProductionOptionsAction,
} from "../productions.actions";

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(getDailyReportProductionsAction).mockResolvedValue({
    reportId: "report-1",
    productions: [],
    groups: [],
    hasDrafts: false,
    hasPendingQuality: false,
    needsReconfirmation: false,
  });
  vi.mocked(getProjectProductionOptionsAction).mockResolvedValue(
    productionOptions,
  );
});

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

function operationalDayWithNight(): OperationalDay {
  const value = operationalDay();
  const day = value.shifts[0]!;
  const night = value.shifts[1]!;
  night.enabled = true;
  night.suggestedStartedAt = "2026-09-25T09:00:00.000Z";
  night.options = {
    ...day.options!,
    defaults: {
      ...day.options!.defaults,
      schedulePeriods: [
        {
          startTime: "18:00",
          endTime: "06:00",
          startDayOffset: 0,
          endDayOffset: 1,
        },
      ],
      activityStartTime: "18:00",
      activityEndTime: "06:00",
      activityEndDayOffset: 1,
    },
  };
  return value;
}

function nightOperationalDay(): OperationalDay {
  const value = operationalDayWithNight();
  const day = value.shifts[0]!;
  day.enabled = false;
  day.suggestedStartedAt = null;
  day.options = null;
  return value;
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
    liveState: {
      status: "working",
      changedAt: "2026-09-24T11:00:00.000Z",
      changedBy: "operador@obra.com",
    },
    liveBreaks: [],
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

function runningDayWithNightAvailable(): OperationalDay {
  const value = runningOperationalDay();
  value.shifts[1] = operationalDayWithNight().shifts[1]!;
  return value;
}

function overlappingOperationalDay(): OperationalDay {
  const value = runningDayWithNightAvailable();
  const dayReport = value.shifts[0]!.report!;
  value.shifts[1]!.report = {
    ...dayReport,
    id: "33333333-3333-4333-8333-333333333333",
    shift: "night",
    startedAt: "2026-09-24T21:00:00.000Z",
    activityWindow: {
      startTime: "18:00",
      endTime: "06:00",
      endDayOffset: 1,
    },
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
      startTime: "13:00",
      endTime: "17:00",
      startDayOffset: 0,
      endDayOffset: 0,
    },
    {
      startTime: "08:00",
      endTime: "12:00",
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

  it("never exposes a disabled night shift", () => {
    render(
      <ProjectOperationalDay
        initialDay={operationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Turno diurno" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Turno noturno" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Iniciar turno noturno" }),
    ).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("offers an enabled night shift as a discreet action", () => {
    render(
      <ProjectOperationalDay
        initialDay={operationalDayWithNight()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "Turno noturno" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar turno noturno" }),
    );

    expect(
      screen.getByRole("heading", { name: "Iniciar turno" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Horário de início")).toBeTruthy();
  });

  it("alternates overlapping shifts without rendering both panels", () => {
    const value = overlappingOperationalDay();
    value.shifts[0]!.report!.interferenceEntries = [
      {
        id: "day-interference",
        category: "weather",
        description: "Chuva no turno diurno",
        impact: "Ritmo reduzido",
        startedAt: "2026-09-24T12:00:00.000Z",
        endedAt: null,
        confirmedAt: null,
      },
    ];
    value.shifts[1]!.report!.interferenceEntries = [
      {
        id: "night-interference",
        category: "equipment",
        description: "Parada no turno noturno",
        impact: "Máquina indisponível",
        startedAt: "2026-09-24T22:00:00.000Z",
        endedAt: null,
        confirmedAt: null,
      },
    ];
    render(
      <ProjectOperationalDay
        initialDay={value}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Turno diurno" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Turno noturno" }),
    ).toBeNull();
    expect(screen.getByText("Chuva no turno diurno")).toBeTruthy();
    expect(screen.queryByText("Parada no turno noturno")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Exibir turno noturno/u }),
    );

    expect(
      screen.getByRole("heading", { name: "Turno noturno" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Turno diurno" }),
    ).toBeNull();
    expect(screen.getByText("Parada no turno noturno")).toBeTruthy();
    expect(screen.queryByText("Chuva no turno diurno")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("focuses the night panel after starting it", async () => {
    const before = runningDayWithNightAvailable();
    const after = overlappingOperationalDay();
    vi.mocked(startOperationalShiftAction).mockResolvedValue({
      kind: "success",
      day: after,
    });
    render(
      <ProjectOperationalDay
        initialDay={before}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar turno noturno" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar horário e continuar" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar checklists e iniciar" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Turno noturno" }),
      ).toBeTruthy(),
    );
    expect(startOperationalShiftAction).toHaveBeenCalledWith(
      expect.objectContaining({ shift: "night" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Turno diurno" }),
    ).toBeNull();
  });

  it("reconciles the focused shift when refreshed data disables it", async () => {
    const view = render(
      <ProjectOperationalDay
        initialDay={runningOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );
    const nightOnly = nightOperationalDay();
    nightOnly.shifts[1]!.report = overlappingOperationalDay().shifts[1]!.report;

    view.rerender(
      <ProjectOperationalDay
        initialDay={nightOnly}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Turno noturno" }),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole("heading", { name: "Turno diurno" }),
    ).toBeNull();
  });

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
          startedAt: "2026-09-24T10:30:00.000Z",
        }),
      ),
    );
  });

  it("normalizes a night shift start after midnight to the next UTC day", async () => {
    const day = nightOperationalDay();
    vi.mocked(startOperationalShiftAction).mockResolvedValue({
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

    fireEvent.click(screen.getByRole("button", { name: "Iniciar turno" }));
    fireEvent.change(screen.getByLabelText("Horário de início"), {
      target: { value: "06:30" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar horário e continuar",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar checklists e iniciar",
      }),
    );

    await waitFor(() =>
      expect(startOperationalShiftAction).toHaveBeenCalledWith(
        expect.objectContaining({
          shift: "night",
          startedAt: "2026-09-25T09:30:00.000Z",
        }),
      ),
    );
  });

  it("guides machine and employee batches and returns edits to review", async () => {
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
    expect(screen.queryByLabelText("Leitura final de Máquina 7")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Próximas máquinas" }));
    expect(screen.getByText("7–7 de 7")).toBeTruthy();
    expect(screen.getByLabelText("Leitura final de Máquina 7")).toBeTruthy();
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
      await screen.findByRole("heading", { name: "Atividades executadas" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));

    expect(
      screen.getByRole("heading", { name: "Revisão do fechamento" }),
    ).toBeTruthy();
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
    expect(
      screen.getByText(/Confirmo as horas extras calculadas pelo ponto/u),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    expect(
      await screen.findByRole("heading", { name: "Atividades executadas" }),
    ).toBeTruthy();
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
            endedAt: "2026-09-24T21:00:00.000Z",
            employees: [
              {
                employmentId: "employee-1",
                overtimeConfirmed: true,
              },
            ],
            breaks: [
              {
                startAt: "2026-09-24T15:00:00.000Z",
                endAt: "2026-09-24T16:00:00.000Z",
              },
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
    const closeCommand = vi.mocked(closeOperationalShiftAction).mock.calls[0]![0]
      .data;
    expect(closeCommand).not.toHaveProperty("activityNotes");
    expect(closeCommand).not.toHaveProperty("fallbackClimateConditions");
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

    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(
      screen.getByText(/Confirmo as horas extras calculadas pelo ponto/u),
    ).toBeTruthy();
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

  it("accepts the displayed start minute when the stored start has seconds", async () => {
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
      await screen.findByRole("heading", { name: "Atividades executadas" }),
    ).toBeTruthy();
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
            {
              employmentId: "employee-1",
              overtimeConfirmed: false,
            },
          ],
          breaks: [],
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

  it("keeps Central modals open when Escape is pressed", async () => {
    render(
      <ProjectOperationalDay
        initialDay={runningOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar turno" }));
    expect(
      screen.getByRole("heading", { name: "Finalizar turno" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Finalizar turno" }),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: "Completar RDO" }),
    ).toBeNull();
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

  it("uses measurements as the default and separates employees and machines into tables", async () => {
    const value = closingOperationalDay(1, 1);
    value.shifts[0]!.report!.startedAt = new Date(
      Date.now() - 9 * 60 * 60 * 1_000,
    ).toISOString();
    value.shifts[0]!.report!.activityWindow = {
      startTime: "08:00",
      endTime: "16:00",
      endDayOffset: 0,
    };

    render(
      <ProjectOperationalDay
        initialDay={value}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    expect(screen.queryByText("Tempo trabalhado")).toBeNull();
    expect(
      screen.getByRole("tab", { name: "Medições" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    expect(screen.queryByText("Funcionário 1")).toBeNull();

    fireEvent.click(
      screen.getByRole("tab", { name: "Funcionários (1)" }),
    );
    expect(screen.getByText("Funcionário 1")).toBeTruthy();
    expect(screen.getByText("08:00–12:00")).toBeTruthy();
    expect(screen.getByText("13:00–17:00")).toBeTruthy();
    expect(screen.getAllByText("A consolidar")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Terminar horário" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Máquinas (1)" }));
    expect(screen.getByText("Máquina 1")).toBeTruthy();
    expect(screen.getByText("Horímetro")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Em trabalho" })).toBeTruthy();
    await waitFor(() =>
      expect(getDailyReportProductionsAction).toHaveBeenCalledWith(
        "project-1",
        "22222222-2222-4222-8222-222222222222",
      ),
    );
  });

  it("records an employee clock-out with the selected timestamp", async () => {
    const value = closingOperationalDay();
    vi.mocked(recordOperationalStatusAction).mockResolvedValue({
      kind: "success",
      day: value,
    });
    render(
      <ProjectOperationalDay
        initialDay={value}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Funcionários (1)" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Terminar horário" }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Terminar horário" }).at(-1)!,
    );

    await waitFor(() =>
      expect(recordOperationalStatusAction).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          reportId: "22222222-2222-4222-8222-222222222222",
          data: expect.objectContaining({
            type: "employee",
            employmentId: "employee-1",
            action: "end",
            occurredAt: expect.any(String),
          }),
        }),
      ),
    );
  });

  it("shows finalized hours and the audited direct labor cost without a finalization time", () => {
    const value = closingOperationalDay(1, 1);
    const report = value.shifts[0]!.report!;
    report.status = "finalized";
    report.finalizedAt = "2026-09-24T21:00:00.000Z";
    report.employees[0] = {
      ...report.employees[0]!,
      checkOutAt: "2026-09-24T21:00:00.000Z",
      regularWorkedMinutes: 480,
      overtimeMinutes: 60,
      shiftCostBrl: "225.00",
    };

    render(
      <ProjectOperationalDay
        initialDay={value}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    fireEvent.click(
      screen.getByRole("tab", { name: "Funcionários (1)" }),
    );
    expect(screen.getByText("09:00")).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
    expect(screen.getByText("08:00")).toBeTruthy();
    expect(screen.getByText("01:00")).toBeTruthy();
    expect(screen.getByText(/225,00/u)).toBeTruthy();
    expect(screen.getByText("Encerrado")).toBeTruthy();
    expect(screen.queryByText("Em trabalho")).toBeNull();
    expect(screen.queryByText(/Finalizado às/u)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Máquinas (1)" }));
    expect(screen.getByText("Encerrado")).toBeTruthy();
    expect(screen.queryByText("Em trabalho")).toBeNull();
  });

  it("records a general interval through the audited status command", async () => {
    const value = runningOperationalDay();
    const paused = runningOperationalDay();
    paused.shifts[0]!.report!.liveState = {
      status: "paused",
      changedAt: new Date().toISOString(),
      changedBy: "operador@obra.com",
    };
    paused.shifts[0]!.report!.liveBreaks = [
      { startAt: new Date().toISOString(), endAt: null },
    ];
    vi.mocked(recordOperationalStatusAction).mockResolvedValue({
      kind: "success",
      day: paused,
    });

    render(
      <ProjectOperationalDay
        initialDay={value}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar intervalo" }),
    );

    await waitFor(() =>
      expect(recordOperationalStatusAction).toHaveBeenCalledWith({
        projectId: "project-1",
        reportDate: "2026-09-24",
        reportId: "22222222-2222-4222-8222-222222222222",
        data: { type: "shift", status: "paused" },
      }),
    );
    expect(await screen.findByText("Turno pausado")).toBeTruthy();
  });

  it("preserves the command center when production loading fails and retries", async () => {
    vi.mocked(getDailyReportProductionsAction)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        reportId: "report-1",
        productions: [
          {
            id: "production-1",
            serviceCode: "cut",
            unitCode: "M3",
            officialQuantity: "125.000",
            status: "approved",
            location: "Estaca 10",
            tripCount: 4,
            equipmentCount: 2,
          },
        ],
        groups: [],
        hasDrafts: false,
        hasPendingQuality: false,
        needsReconfirmation: false,
      } as unknown as ProjectDailyReportProductionSummary);

    render(
      <ProjectOperationalDay
        initialDay={runningOperationalDay()}
        projectId="project-1"
        projectName="Obra Serra"
      />,
    );

    expect(
      await screen.findByText(/demais dados continuam disponíveis/u),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Medições" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("125.000 m³")).toBeTruthy();
    expect(screen.getByText("Aprovada")).toBeTruthy();
    expect(screen.getByText(/2 equipamento\(s\)/u)).toBeTruthy();
  });
});

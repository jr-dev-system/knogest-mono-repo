// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  saveProjectProductionAction: vi.fn(),
}));

import { ProjectOperationalDay } from "./project-operational-day";
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
            ? [{ id: "employee-1", name: "Bianca Souza", jobRole: "Operadora", overtimeEnabled: true }]
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
      (screen.getByRole("button", {
        name: "Revisar produção",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("Frente") as HTMLSelectElement).options).toHaveLength(0);
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperationalDay } from "../operational-day.types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../operational-day.actions", () => ({
  addOperationalInterferenceAction: vi.fn(),
  closeOperationalShiftAction: vi.fn(),
  confirmOperationalInterferenceAction: vi.fn(),
  saveOperationalRdoAction: vi.fn(),
  startOperationalShiftAction: vi.fn(),
}));

import { ProjectOperationalDay } from "./project-operational-day";

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
            ? [{ id: "employee-1", name: "Bianca Souza", jobRole: "Operadora" }]
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

describe("ProjectOperationalDay", () => {
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
});

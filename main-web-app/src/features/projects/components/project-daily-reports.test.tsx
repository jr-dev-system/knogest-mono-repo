// @vitest-environment jsdom

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../daily-reports.actions", () => ({
  finalizeProjectDailyReportAction: vi.fn(),
  getMoreProjectDailyReportsAction: vi.fn(),
  getProjectDailyReportAction: vi.fn(),
  getProjectDailyReportOptionsAction: vi.fn(),
  saveProjectDailyReportAction: vi.fn(),
}));

vi.mock("../productions.actions", () => ({
  confirmDailyReportProductionsAction: vi.fn(),
  getShiftProjectProductionsAction: vi.fn().mockResolvedValue({
    data: [],
    pageInfo: { hasNextPage: false, nextCursor: null },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import {
  finalizeProjectDailyReportAction,
  getProjectDailyReportAction,
  getProjectDailyReportOptionsAction,
  saveProjectDailyReportAction,
} from "../daily-reports.actions";
import type {
  ProjectDailyReportDetail,
  ProjectDailyReportOptions,
  ProjectDailyReportsPage,
} from "../daily-reports.types";
import { ProjectDailyReports } from "./project-daily-reports";

const projectId = "00000000-0000-4000-8000-000000000001";
const employmentId = "00000000-0000-4000-8000-000000000002";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectDailyReports", () => {
  it("guides a new RDO through the steps and finalizes it directly", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectDailyReportOptionsAction).mockResolvedValue(options);
    vi.mocked(saveProjectDailyReportAction).mockResolvedValue({
      kind: "success",
      report: draft,
    });
    vi.mocked(finalizeProjectDailyReportAction).mockResolvedValue({
      kind: "success",
      report: { ...draft, status: "finalized", finalizedAt: draft.updatedAt },
    });
    render(
      <ProjectDailyReports projectId={projectId} initialPage={emptyPage} />,
    );

    await user.click(screen.getByRole("button", { name: "Novo RDO" }));
    expect(
      await screen.findByRole("heading", { name: "Novo RDO" }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Supervisor") as HTMLSelectElement).value,
    ).toBe(employmentId);
    expect(screen.getByText("Etapa 1 de 6")).toBeTruthy();

    await reachReview(user);
    expect(
      screen.getByText(
        "Confira as informações antes de salvar para continuar depois ou finalizar o RDO.",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Finalizar RDO" }));
    expect(
      screen.getByRole("heading", { name: "Finalizar este RDO?" }),
    ).toBeTruthy();
    expect(finalizeProjectDailyReportAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sim, finalizar" }));

    await waitFor(() =>
      expect(saveProjectDailyReportAction).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, reportId: undefined }),
      ),
    );
    await waitFor(() =>
      expect(finalizeProjectDailyReportAction).toHaveBeenCalledWith(
        projectId,
        draft.id,
      ),
    );
    expect(
      vi.mocked(saveProjectDailyReportAction).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(finalizeProjectDailyReportAction).mock.invocationCallOrder[0]!,
    );
  });

  it("validates each step and saves a draft before leaving", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectDailyReportOptionsAction).mockResolvedValue(options);
    vi.mocked(saveProjectDailyReportAction).mockResolvedValue({
      kind: "success",
      report: draft,
    });
    render(
      <ProjectDailyReports projectId={projectId} initialPage={emptyPage} />,
    );

    await user.click(screen.getByRole("button", { name: "Novo RDO" }));
    await screen.findByRole("heading", { name: "Novo RDO" });
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    expect(screen.getByText("Revise os dados desta etapa.")).toBeTruthy();
    expect(screen.getByText("Descreva os serviços executados.")).toBeTruthy();

    await user.type(
      screen.getByLabelText("Resumo dos serviços executados"),
      "Transporte e compactação de material.",
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      screen.getByRole("button", { name: "Marcar todos com turno completo" }),
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Salvar e sair" }));

    await waitFor(() =>
      expect(saveProjectDailyReportAction).toHaveBeenCalled(),
    );
    expect(
      vi.mocked(saveProjectDailyReportAction).mock.calls[0]?.[0],
    ).toMatchObject({
      projectId,
      command: {
        employees: [
          {
            employmentId,
            completedFullShift: true,
            regularWorkedMinutes: 660,
            overtimeMinutes: 0,
          },
        ],
      },
    });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Novo RDO" })).toBeNull(),
    );
    expect(screen.getByText("Rascunho")).toBeTruthy();
  });

  it("uses the effective window for a full shift and clears the shortcut on manual edit", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectDailyReportOptionsAction).mockResolvedValue(options);
    render(
      <ProjectDailyReports projectId={projectId} initialPage={emptyPage} />,
    );

    await user.click(screen.getByRole("button", { name: "Novo RDO" }));
    await screen.findByRole("heading", { name: "Novo RDO" });
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.type(
      screen.getByLabelText("Resumo dos serviços executados"),
      "Atividade executada.",
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      screen.getByRole("button", { name: "Marcar todos com turno completo" }),
    );

    const regularHours = screen.getByLabelText(
      "Horas normais",
    ) as HTMLInputElement;
    const fullShift = screen.getByLabelText(
      "Cumpriu o turno completo",
    ) as HTMLInputElement;
    expect(regularHours.value).toBe("11:00");
    expect(fullShift.checked).toBe(true);

    await user.clear(regularHours);
    await user.type(regularHours, "08:00");
    expect(fullShift.checked).toBe(false);
  });

  it("protects unsaved data when changing the temporal context or closing", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectDailyReportOptionsAction)
      .mockResolvedValueOnce(options)
      .mockResolvedValueOnce({
        ...options,
        defaults: { ...options.defaults, shift: "night" },
      });
    render(
      <ProjectDailyReports projectId={projectId} initialPage={emptyPage} />,
    );

    await user.click(screen.getByRole("button", { name: "Novo RDO" }));
    await screen.findByRole("heading", { name: "Novo RDO" });
    const shift = screen.getByLabelText("Turno") as HTMLSelectElement;
    await user.selectOptions(shift, "night");
    expect(
      screen.getByRole("heading", { name: "Atualizar data e turno?" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Continuar preenchendo" }),
    );
    expect(shift.value).toBe("day");

    await user.selectOptions(shift, "night");
    await user.click(screen.getByRole("button", { name: "Atualizar período" }));
    await waitFor(() =>
      expect(getProjectDailyReportOptionsAction).toHaveBeenLastCalledWith({
        projectId,
        reportDate: options.defaults.reportDate,
        shift: "night",
      }),
    );
    await waitFor(() => expect(shift.value).toBe("night"));

    const technician = screen.getByRole("checkbox", { name: "Rafael Brito" });
    await user.click(technician);
    await waitFor(() =>
      expect((technician as HTMLInputElement).checked).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("heading", { name: "Descartar alterações?" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Continuar preenchendo" }),
    );
    expect(screen.getByRole("heading", { name: "Novo RDO" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(
      screen.getByRole("button", { name: "Descartar alterações" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Novo RDO" })).toBeNull(),
    );
  });

  it("updates an existing draft and does not finalize when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectDailyReportAction).mockResolvedValue(draft);
    vi.mocked(getProjectDailyReportOptionsAction).mockResolvedValue(options);
    vi.mocked(saveProjectDailyReportAction).mockResolvedValue({
      kind: "failure",
      code: "DAILY_REPORT_RESOURCE_UNAVAILABLE",
      message: "Resource unavailable",
    });
    render(
      <ProjectDailyReports
        projectId={projectId}
        initialPage={{
          data: [summaryFromDraft],
          pageInfo: { hasNextPage: false, nextCursor: null },
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /20\/07\/2026 · Diurno/u }),
    );
    await screen.findByRole("heading", { name: "Continuar RDO" });
    await reachReview(user, { fillService: false, selectTeam: false });

    await user.click(screen.getByRole("button", { name: "Finalizar RDO" }));
    await user.click(screen.getByRole("button", { name: "Sim, finalizar" }));
    await waitFor(() =>
      expect(screen.getByText(/deixou de estar disponível/u)).toBeTruthy(),
    );
    expect(saveProjectDailyReportAction).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: draft.id }),
    );
    expect(finalizeProjectDailyReportAction).not.toHaveBeenCalled();
  });
});

async function reachReview(
  user: ReturnType<typeof userEvent.setup>,
  options: { fillService?: boolean; selectTeam?: boolean } = {},
) {
  const { fillService = true, selectTeam = true } = options;
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  if (fillService)
    await user.type(
      screen.getByLabelText("Resumo dos serviços executados"),
      "Transporte e compactação de material.",
    );
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  if (selectTeam)
    await user.click(
      screen.getByRole("button", { name: "Marcar todos com turno completo" }),
    );
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  expect(screen.getByText("Etapa 6 de 6")).toBeTruthy();
}

const emptyPage: ProjectDailyReportsPage = {
  data: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
};

const options: ProjectDailyReportOptions = {
  project: {
    id: projectId,
    name: "Jardim das Oliveiras",
    municipality: "Imperatriz",
    state: "MA",
    contract: "Loteamento Jardins das Oliveiras I",
  },
  defaults: {
    reportDate: "2026-07-20",
    shift: "day",
    schedulePeriods: [
      {
        startTime: "07:00",
        endTime: "18:00",
        startDayOffset: 0,
        endDayOffset: 0,
      },
    ],
    activityStartTime: "07:00",
    activityEndTime: "18:00",
    activityEndDayOffset: 0,
    scheduleScale: "Seg. a Sáb.",
    supervisorEmploymentId: employmentId,
    technicalResponsibilityEmploymentIds: [employmentId],
  },
  responsibleOptions: [{ id: employmentId, name: "Rafael Brito" }],
  employeeOptions: [
    {
      id: employmentId,
      name: "Rafael Brito",
      jobRole: "Supervisor",
    },
  ],
  machineOptions: [],
};

const draft: ProjectDailyReportDetail = {
  id: "00000000-0000-4000-8000-000000000003",
  projectId,
  reportDate: "2026-07-20",
  shift: "day",
  status: "draft",
  project: options.project,
  scheduleScale: "Seg. a Sáb.",
  supervisor: { employmentId, name: "Rafael Brito" },
  technicalResponsibilities: [{ employmentId, name: "Rafael Brito" }],
  schedulePeriods: options.defaults.schedulePeriods,
  activityWindow: {
    startTime: "07:00",
    endTime: "18:00",
    endDayOffset: 0,
  },
  activityTypes: ["earthworks"],
  climateConditions: ["dry"],
  rainfall: { dailyMm: "0.00", monthlyMm: "0.00" },
  employees: [
    {
      employmentId,
      name: "Rafael Brito",
      jobRole: "Supervisor",
      completedFullShift: true,
      regularWorkedMinutes: 660,
      overtimeMinutes: 0,
    },
  ],
  machines: [],
  executedActivities: "Transporte e compactação de material.",
  interferences: null,
  createdBy: {
    id: "00000000-0000-4000-8000-000000000004",
    email: "master@example.com",
  },
  finalizedBy: null,
  finalizedAt: null,
  createdAt: "2026-07-20T18:00:00.000Z",
  updatedAt: "2026-07-20T18:00:00.000Z",
};

const summaryFromDraft: ProjectDailyReportsPage["data"][number] = {
  id: draft.id,
  reportDate: draft.reportDate,
  shift: draft.shift,
  status: draft.status,
  activityStartTime: draft.activityWindow.startTime,
  activityEndTime: draft.activityWindow.endTime,
  activityEndDayOffset: draft.activityWindow.endDayOffset,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
  finalizedAt: draft.finalizedAt,
};

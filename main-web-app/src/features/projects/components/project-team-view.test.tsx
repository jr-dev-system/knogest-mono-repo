// @vitest-environment jsdom

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectTeamMembersPage } from "../projects.types";

const getProjectTeamMembersAction = vi.hoisted(() => vi.fn());

vi.mock("../projects.actions", () => ({ getProjectTeamMembersAction }));

import { ProjectTeamView } from "./project-team-view";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const member = (id: string, name: string, shift: "day" | "night") => ({
  id,
  employmentId: id,
  name,
  jobRole: shift === "day" ? "Operador" : "Encarregada",
  shift,
  monthlyWorkloadHours: shift === "day" ? 220 : 180,
  compensationMode: "monthly" as const,
  overtimeRate: shift === "day" ? "25.0000" : "30.0000",
});

describe("ProjectTeamView", () => {
  it("restarts cursor pages when changing shifts", async () => {
    getProjectTeamMembersAction.mockImplementation(
      async ({
        cursor,
        shift,
      }: {
        cursor?: string;
        shift: "day" | "night";
      }) => {
        if (shift === "night") {
          return {
            data: [
              member("00000000-0000-4000-8000-000000000003", "Bia", shift),
            ],
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        }
        if (cursor === "day-page-2") {
          return {
            data: [
              member("00000000-0000-4000-8000-000000000002", "Caio", shift),
            ],
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        }
        return {
          data: [member("00000000-0000-4000-8000-000000000001", "Ana", shift)],
          pageInfo: { hasNextPage: true, nextCursor: "day-page-2" },
        };
      },
    );
    const user = userEvent.setup();

    const onEditMember = vi.fn();
    const onRemoveMember = vi.fn();
    render(
      <ProjectTeamView
        projectId="00000000-0000-4000-8000-000000000901"
        counts={{ day: 16, night: 1 }}
        canEdit
        onAddShift={vi.fn()}
        onEditMember={onEditMember}
        onEditShift={vi.fn()}
        onRemoveMember={onRemoveMember}
      />,
    );

    expect(await screen.findByText("Ana")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar Ana" }));
    expect(onEditMember).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ana", shift: "day" }),
    );
    await user.click(screen.getByRole("button", { name: "Remover Ana" }));
    expect(onRemoveMember).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ana", shift: "day" }),
    );
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Caio")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Noturno (1)" }));
    expect(await screen.findByText("Bia")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Diurno (16)" }));
    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(getProjectTeamMembersAction).toHaveBeenCalledTimes(4);
    expect(screen.getByText("Página 1 · até 15 funcionários")).toBeTruthy();
  });

  it("shows an empty state and edits only the active shift", async () => {
    getProjectTeamMembersAction.mockResolvedValue({
      data: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    const onEditShift = vi.fn();
    const onAddShift = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectTeamView
        projectId="00000000-0000-4000-8000-000000000901"
        counts={{ day: 0, night: 0 }}
        canEdit
        onAddShift={onAddShift}
        onEditMember={vi.fn()}
        onEditShift={onEditShift}
        onRemoveMember={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Nenhum funcionário neste turno"),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Noturno (0)" }));
    await waitFor(() =>
      expect(getProjectTeamMembersAction).toHaveBeenCalledTimes(2),
    );
    await user.click(screen.getByRole("button", { name: "Editar turno" }));
    expect(onEditShift).toHaveBeenCalledWith("night");
    await user.click(
      screen.getByRole("button", { name: "Adicionar funcionários" }),
    );
    expect(onAddShift).toHaveBeenCalledWith("night");
  });

  it("restores the requested shift and reports later changes", async () => {
    getProjectTeamMembersAction.mockResolvedValue({
      data: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    const onActiveShiftChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectTeamView
        projectId="00000000-0000-4000-8000-000000000901"
        counts={{ day: 0, night: 0 }}
        canEdit={false}
        initialShift="night"
        onActiveShiftChange={onActiveShiftChange}
        onAddShift={vi.fn()}
        onEditMember={vi.fn()}
        onEditShift={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Nenhum funcionário neste turno"),
    ).toBeTruthy();
    expect(getProjectTeamMembersAction).toHaveBeenCalledWith({
      projectId: "00000000-0000-4000-8000-000000000901",
      shift: "night",
      cursor: undefined,
    });
    await user.click(screen.getByRole("tab", { name: "Diurno (0)" }));
    expect(onActiveShiftChange).toHaveBeenCalledWith("day");
  });

  it("debounces search, combines it with the selected role, and explains role availability", async () => {
    getProjectTeamMembersAction.mockImplementation(
      async ({
        jobRole,
        search,
        shift,
      }: {
        jobRole?: string;
        search?: string;
        shift: "day" | "night";
      }) => {
        const jobRoles =
          shift === "day" ? ["Operador", "Supervisor"] : ["Encarregada"];
        const matches =
          shift === "day" &&
          jobRole !== "Operador" &&
          search !== "sem resultado";
        return {
          data: matches
            ? [
                {
                  ...member(
                    "00000000-0000-4000-8000-000000000004",
                    "Ana",
                    "day",
                  ),
                  jobRole: "Supervisor",
                },
              ]
            : [],
          jobRoles,
          pageInfo: { hasNextPage: false, nextCursor: null },
        };
      },
    );
    const user = userEvent.setup();

    render(
      <ProjectTeamView
        projectId="00000000-0000-4000-8000-000000000901"
        counts={{ day: 1, night: 0 }}
        canEdit={false}
        onAddShift={vi.fn()}
        onEditMember={vi.fn()}
        onEditShift={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    expect(await screen.findByText("Ana")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Ajuda sobre Cargos disponíveis" }),
    );
    expect(
      await screen.findByText(
        "A lista mostra apenas cargos que possuem funcionários no turno selecionado desta obra.",
      ),
    ).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Cargo"), "Supervisor");
    await waitFor(() =>
      expect(getProjectTeamMembersAction).toHaveBeenLastCalledWith({
        projectId: "00000000-0000-4000-8000-000000000901",
        shift: "day",
        cursor: undefined,
        jobRole: "Supervisor",
      }),
    );

    await user.type(
      screen.getByRole("textbox", { name: "Buscar por nome ou cargo" }),
      "sem resultado",
    );
    await waitFor(() =>
      expect(getProjectTeamMembersAction).toHaveBeenLastCalledWith({
        projectId: "00000000-0000-4000-8000-000000000901",
        shift: "day",
        cursor: undefined,
        jobRole: "Supervisor",
        search: "sem resultado",
      }),
    );
    expect(
      await screen.findByText("Nenhum funcionário encontrado"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() =>
      expect(getProjectTeamMembersAction).toHaveBeenLastCalledWith({
        projectId: "00000000-0000-4000-8000-000000000901",
        shift: "day",
        cursor: undefined,
      }),
    );
    expect(await screen.findByText("Ana")).toBeTruthy();
  });

  it("keeps the current results visible while a text search refreshes", async () => {
    let resolveSearch: ((page: ProjectTeamMembersPage) => void) | undefined;
    getProjectTeamMembersAction.mockImplementation(
      ({ search }: { search?: string }) => {
        if (search === "Bruno") {
          return new Promise<ProjectTeamMembersPage>((resolve) => {
            resolveSearch = resolve;
          });
        }

        return Promise.resolve({
          data: [member("00000000-0000-4000-8000-000000000001", "Ana", "day")],
          pageInfo: { hasNextPage: false, nextCursor: null },
        });
      },
    );
    const user = userEvent.setup();

    render(
      <ProjectTeamView
        projectId="00000000-0000-4000-8000-000000000901"
        counts={{ day: 1, night: 0 }}
        canEdit={false}
        onAddShift={vi.fn()}
        onEditMember={vi.fn()}
        onEditShift={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    expect(await screen.findByText("Ana")).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: "Buscar por nome ou cargo" }),
      "Bruno",
    );
    await waitFor(() =>
      expect(getProjectTeamMembersAction).toHaveBeenLastCalledWith({
        projectId: "00000000-0000-4000-8000-000000000901",
        shift: "day",
        cursor: undefined,
        search: "Bruno",
      }),
    );

    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.queryByText("Carregando equipe…")).toBeNull();

    resolveSearch?.({
      data: [member("00000000-0000-4000-8000-000000000002", "Bruno", "day")],
      jobRoles: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });

    expect(await screen.findByText("Bruno")).toBeTruthy();
    expect(screen.queryByText("Ana")).toBeNull();
  });
});

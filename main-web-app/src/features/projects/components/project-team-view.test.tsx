// @vitest-environment jsdom

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  it("keeps independent cursor pages for each shift", async () => {
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

    render(
      <ProjectTeamView
        projectId="00000000-0000-4000-8000-000000000901"
        counts={{ day: 16, night: 1 }}
        canEdit
        onEditShift={vi.fn()}
      />,
    );

    expect(await screen.findByText("Ana")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Caio")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Noturno (1)" }));
    expect(await screen.findByText("Bia")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Diurno (16)" }));
    expect(screen.getByText("Caio")).toBeTruthy();
    expect(getProjectTeamMembersAction).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Página 2 · até 15 funcionários")).toBeTruthy();
  });

  it("shows an empty state and edits only the active shift", async () => {
    getProjectTeamMembersAction.mockResolvedValue({
      data: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    const onEditShift = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectTeamView
        projectId="00000000-0000-4000-8000-000000000901"
        counts={{ day: 0, night: 0 }}
        canEdit
        onEditShift={onEditShift}
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
  });
});

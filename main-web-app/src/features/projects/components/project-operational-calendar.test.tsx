// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ProjectOperationalCalendar } from "./project-operational-calendar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProjectOperationalCalendar", () => {
  it("limits period selectors to the actual start and the current Brasilia month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));

    render(
      <ProjectOperationalCalendar projectId="project-1" startedAt="2026-08-20T12:00:00.000Z" />,
    );

    const monthSelect = screen.getByLabelText("Mês exibido");
    expect(monthSelect.querySelectorAll("option")).toHaveLength(2);
    expect(monthSelect.textContent).toBe("AgostoSetembro");
    expect(screen.getByLabelText("Ano exibido").textContent).toBe("2026");
  });

  it("unlocks the next day when Brasilia reaches midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T02:59:59.000Z"));

    render(
      <ProjectOperationalCalendar projectId="project-1" startedAt="2026-09-01T12:00:00.000Z" />,
    );

    expect(
      (screen.getByRole("button", {
        name: /14 de Setembro de 2026, hoje/u,
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", {
        name: /15 de Setembro de 2026, indisponível/u,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    act(() => vi.advanceTimersByTime(1_026));

    expect(
      (screen.getByRole("button", {
        name: /15 de Setembro de 2026, hoje/u,
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("opens the operational command center for an available day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));

    render(
      <ProjectOperationalCalendar projectId="project-1" startedAt="2026-09-01T12:00:00.000Z" />,
    );

    const day = screen.getByRole("button", {
      name: /14 de Setembro de 2026/u,
    });
    day.click();

    expect((day as HTMLButtonElement).disabled).toBe(false);
    expect(push).toHaveBeenCalledWith(
      "/home/obras/project-1/operacao/2026-09-14",
    );
  });
});

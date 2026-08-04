// @vitest-environment jsdom

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { OperationTabPanel, OperationTabs } from "./operation-tabs";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = React.useState<"employees" | "schedule">(
    "employees",
  );
  return (
    <>
      <OperationTabs
        ariaLabel="Editor de equipe"
        idPrefix="team-editor"
        value={value}
        onValueChange={setValue}
        tabs={[
          { value: "employees", label: "Funcionários" },
          { value: "schedule", label: "Jornada e intervalos" },
        ]}
      />
      <OperationTabPanel
        idPrefix="team-editor"
        value="employees"
        activeValue={value}
      >
        Lista da equipe
      </OperationTabPanel>
      <OperationTabPanel
        idPrefix="team-editor"
        value="schedule"
        activeValue={value}
      >
        Escala do turno
      </OperationTabPanel>
    </>
  );
}

describe("OperationTabs", () => {
  it("moves selection and focus with the keyboard and exposes the active panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const employees = screen.getByRole("tab", { name: "Funcionários" });
    employees.focus();
    await user.keyboard("{ArrowRight}");

    const schedule = screen.getByRole("tab", {
      name: "Jornada e intervalos",
    });
    expect(document.activeElement).toBe(schedule);
    expect(schedule.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain(
      "Escala do turno",
    );
    expect(schedule.getAttribute("aria-controls")).toBe(
      "team-editor-panel-schedule",
    );
  });
});

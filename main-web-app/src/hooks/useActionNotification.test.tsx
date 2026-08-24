// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

import { useActionNotification } from "./useActionNotification";

type State = { ok: boolean; message: string };

function Harness({
  notifyOnError,
  state,
}: {
  notifyOnError?: boolean;
  state: State;
}) {
  useActionNotification(state, { notifyOnError });
  return null;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useActionNotification", () => {
  it("announces successful and failed action results once", () => {
    const initialState = { ok: false, message: "" };
    const successState = { ok: true, message: "Funcionário cadastrado." };
    const failureState = { ok: false, message: "Não foi possível salvar." };
    const view = render(<Harness state={initialState} />);

    view.rerender(<Harness state={successState} />);
    view.rerender(<Harness state={successState} />);
    view.rerender(<Harness state={failureState} />);

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Funcionário cadastrado.");
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar.");
  });

  it("keeps blocking form errors out of the toast channel when requested", () => {
    const view = render(<Harness state={{ ok: false, message: "" }} />);

    view.rerender(
      <Harness
        notifyOnError={false}
        state={{ ok: false, message: "Corrija os campos destacados." }}
      />,
    );

    expect(toast.error).not.toHaveBeenCalled();
  });
});

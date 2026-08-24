import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockApiClientError extends Error {
    status?: number;
    data?: unknown;
    code?: string;

    constructor({
      data,
      message,
      status,
    }: {
      data?: unknown;
      message: string;
      status?: number;
    }) {
      super(message);
      this.status = status;
      this.data = data;
      this.code =
        data &&
        typeof data === "object" &&
        "code" in data &&
        typeof data.code === "string"
          ? data.code
          : undefined;
    }
  }

  return {
    ApiClientError: MockApiClientError,
    postApiV1JobRoles: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/generated/clients/postApiV1JobRoles", () => ({
  postApiV1JobRoles: mocks.postApiV1JobRoles,
}));
vi.mock("@/lib/api/server-client", () => ({
  ApiClientError: mocks.ApiClientError,
}));

import { createJobRoleForEmployee } from "./job-roles.actions";

function formWithName(name: string) {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

describe("createJobRoleForEmployee", () => {
  it("translates a duplicate role into an actionable message", async () => {
    mocks.postApiV1JobRoles.mockRejectedValueOnce(
      new mocks.ApiClientError({
        status: 409,
        message: "A job role with this name already exists",
        data: {
          code: "JOB_ROLE_ALREADY_EXISTS",
          requestId: "00000000-0000-4000-8000-000000000701",
        },
      }),
    );

    await expect(
      createJobRoleForEmployee(formWithName("Topógrafo")),
    ).resolves.toEqual({
      ok: false,
      message: "Já existe uma função com esse nome nesta empresa.",
      requestId: "00000000-0000-4000-8000-000000000701",
    });
  });

  it("hides an internal API failure while preserving its request ID", async () => {
    mocks.postApiV1JobRoles.mockRejectedValueOnce(
      new mocks.ApiClientError({
        status: 500,
        message: "Internal server error",
        data: {
          code: "INTERNAL_ERROR",
          requestId: "00000000-0000-4000-8000-000000000702",
        },
      }),
    );

    await expect(
      createJobRoleForEmployee(formWithName("Topógrafo")),
    ).resolves.toEqual({
      ok: false,
      message:
        "Não foi possível criar a função agora. Tente novamente em instantes.",
      requestId: "00000000-0000-4000-8000-000000000702",
    });
  });
});

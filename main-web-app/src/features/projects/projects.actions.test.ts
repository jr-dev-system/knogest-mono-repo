import { describe, expect, it, vi } from "vitest";

const serverClientMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/api/server-client", () => ({
  ApiClientError: class ApiClientError extends Error {
    data?: unknown;
    status?: number;

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
      this.data = data;
      this.status = status;
    }
  },
  default: serverClientMock,
}));

import { saveProjectMachineMobilizationAction } from "./projects.actions";
import { ApiClientError } from "@/lib/api/server-client";

describe("project readiness actions", () => {
  it("converts local machine-mobilization validation failures into a recoverable result", async () => {
    const result = await saveProjectMachineMobilizationAction(
      "invalid-project-id",
      [],
    );

    expect(result).toMatchObject({
      kind: "recoverable-conflict",
      code: "VALIDATION_ERROR",
    });
  });

  it("preserves safe resource conflict details for actionable client feedback", async () => {
    serverClientMock.mockRejectedValueOnce(
      new ApiClientError({
        status: 409,
        message: "Project resources changed",
        data: {
          code: "PROJECT_RESOURCE_CONFLICT",
          message: "Project resources changed",
          requestId: "00000000-0000-4000-8000-000000000099",
          details: {
            fields: [],
            resources: [
              {
                kind: "employee",
                id: "00000000-0000-4000-8000-000000000021",
                section: "machines",
                reason: "operator-role-mismatch",
              },
            ],
          },
        },
      }),
    );

    const result = await saveProjectMachineMobilizationAction(
      "00000000-0000-4000-8000-000000000001",
      [],
    );

    expect(result).toMatchObject({
      kind: "recoverable-conflict",
      code: "PROJECT_RESOURCE_CONFLICT",
      resources: [
        {
          kind: "employee",
          section: "machines",
          reason: "operator-role-mismatch",
        },
      ],
    });
  });
});

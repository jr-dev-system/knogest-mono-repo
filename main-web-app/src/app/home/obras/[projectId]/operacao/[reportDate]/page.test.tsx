import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/features/company-selection/company-selection.server", () => ({
  requireCompanyWorkspace: vi.fn().mockResolvedValue({ companies: [], selectedCompany: null }),
}));
vi.mock("@/features/projects/operational-day.server", () => ({ getOperationalDay: vi.fn() }));
vi.mock("@/features/projects/projects.server", () => ({ getProjectDetail: vi.fn() }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/features/projects/components/project-operational-day", () => ({ ProjectOperationalDay: () => null }));

import { getOperationalDay } from "@/features/projects/operational-day.server";
import { getProjectDetail } from "@/features/projects/projects.server";
import { ApiClientError } from "@/lib/api/api-client-error";
import OperationalDayPage from "./page";

const params = Promise.resolve({ projectId: "project-1", reportDate: "2026-09-28" });

describe("página do dia operacional", () => {
  beforeEach(() => {
    vi.mocked(getOperationalDay).mockReset();
    vi.mocked(getProjectDetail).mockReset();
    vi.mocked(getProjectDetail).mockResolvedValue({ name: "Obra" } as Awaited<ReturnType<typeof getProjectDetail>>);
  });

  it("mantém 404 real como página não encontrada", async () => {
    vi.mocked(getOperationalDay).mockRejectedValue(new ApiClientError({ message: "Não encontrado", status: 404 }));
    await expect(OperationalDayPage({ params })).rejects.toThrow("NOT_FOUND");
  });

  it("não mascara erro da API como 404", async () => {
    const error = new ApiClientError({ message: "Falha de banco", status: 500 });
    vi.mocked(getOperationalDay).mockRejectedValue(error);
    await expect(OperationalDayPage({ params })).rejects.toBe(error);
  });
});

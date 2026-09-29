// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../productions.actions", () => ({
  createHaulRouteAction: vi.fn(),
  getEarthworkCatalogOptionsAction: vi.fn(),
  getMoreProjectProductionsAction: vi.fn(),
  getProjectProductionAction: vi.fn(),
  getProjectProductionOptionsAction: vi.fn(),
  getProjectProductionTruckOptionsAction: vi.fn(),
  recordProjectProductionQualityAction: vi.fn(),
  rejectProjectProductionAction: vi.fn(),
  reopenProjectProductionAction: vi.fn(),
  saveProjectProductionAction: vi.fn(),
  saveProjectProductionPairAction: vi.fn(),
  transitionProjectProductionAction: vi.fn(),
}));

import {
  createHaulRouteAction,
  getEarthworkCatalogOptionsAction,
  getProjectProductionOptionsAction,
  getProjectProductionTruckOptionsAction,
  saveProjectProductionAction,
  saveProjectProductionPairAction,
} from "../productions.actions";
import type {
  ProjectProductionDetail,
  ProjectProductionOptions,
  ProjectProductionsPage,
} from "../productions.types";
import { ProjectProductions } from "./project-productions";

const projectId = "11111111-1111-4111-8111-111111111111";
const frontId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const excavatorId = "44444444-4444-4444-8444-444444444444";
const truckId = "55555555-5555-4555-8555-555555555555";
const employmentId = "66666666-6666-4666-8666-666666666666";

const capabilities: ProjectProductionsPage["capabilities"] = {
  createDraft: true,
  submit: true,
  check: true,
  recordTopography: true,
  recordLaboratory: true,
  approve: true,
  reject: true,
  release: true,
  publishDirect: true,
  approveOthers: true,
  reopen: true,
  viewHistory: true,
  measure: false,
};

const page: ProjectProductionsPage = {
  data: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
  capabilities,
};

const options: ProjectProductionOptions = {
  project: { id: projectId, name: "BR-101", status: "ACTIVE" },
  defaults: { productionDate: "2026-08-10", shift: "day" },
  dateLimits: {
    minimum: "2026-08-03",
    maximum: "2026-08-10",
    timeZone: "America/Sao_Paulo",
  },
  capabilities,
  responsibleOptions: [
    { id: employmentId, name: "Ana Silva", jobRole: "Apontadora" },
  ],
  workFronts: [
    {
      id: frontId,
      name: "Frente Norte",
      location: "Estaca 10",
      services: [
        {
          id: serviceId,
          serviceCode: "cut",
          unitCode: "M3",
          quantity: "1000.00",
          productionProfile: "excavation",
          dmtPolicy: "optional",
        },
      ],
      equipment: [
        {
          id: excavatorId,
          name: "Escavadeira 01",
          manufacturer: "CAT",
          model: "320",
          meterType: "hour_meter",
          identifier: "EQ-01",
          machineType: "yellow_line",
          loadVolumeM3: null,
          maxSupportedWeightT: null,
          operator: { id: employmentId, name: "João Operador" },
        },
      ],
      trucks: [
        {
          id: truckId,
          name: "Basculante 01",
          manufacturer: "Mercedes-Benz",
          model: "Arocs",
          meterType: "odometer",
          identifier: "TR-01",
          nominalCapacity: "12.000",
          effectiveCapacity: "11.500",
          capacityUnitCode: "M3_LOOSE",
          maxSupportedWeightT: "25.000",
          driver: { id: employmentId, name: "Carlos Motorista" },
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          name: "Caminhão-pipa 01",
          manufacturer: "Mercedes-Benz",
          model: "Arocs",
          meterType: "odometer",
          identifier: "PIPA-01",
          nominalCapacity: "8000.000",
          effectiveCapacity: "8000.000",
          capacityUnitCode: "LITER",
          maxSupportedWeightT: null,
          driver: { id: employmentId, name: "Carlos Motorista" },
        },
      ],
    },
  ],
};

describe("ProjectProductions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProjectProductionOptionsAction).mockResolvedValue(options);
    vi.mocked(getProjectProductionTruckOptionsAction).mockResolvedValue({
      data: [
        {
          id: truckId,
          name: "Basculante 01",
          manufacturer: "Mercedes-Benz",
          model: "Arocs",
          identifier: "TR-01",
          identifierKind: "PLATE",
          effectiveCapacity: "11.500",
          capacityUnitCode: "M3_LOOSE",
          driver: { id: employmentId, name: "Carlos Motorista" },
        },
      ],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    vi.mocked(getEarthworkCatalogOptionsAction).mockResolvedValue({
      materials: {
        data: [],
        pageInfo: { hasNextPage: false, nextCursor: null },
      },
      routes: { data: [], pageInfo: { hasNextPage: false, nextCursor: null } },
    });
    vi.mocked(createHaulRouteAction).mockResolvedValue({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      code: "corte-a-aterro-b",
      name: "Corte A → Aterro B",
      origin: "Corte A",
      destination: "Aterro B",
      isActive: true,
      revision: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        revision: 1,
        loadedDistanceKm: "2.400",
        emptyReturnDistanceKm: null,
        contractualDmtKm: null,
        contractualBand: null,
      },
    });
  });

  afterEach(cleanup);

  it("registra corte com volume calculado pelas viagens e mostra nomes em português", async () => {
    const user = userEvent.setup();
    vi.mocked(saveProjectProductionAction).mockResolvedValue({
      kind: "success",
      production: detail("individual_activity"),
    });
    render(<ProjectProductions projectId={projectId} initialPage={page} />);

    await user.click(
      screen.getByRole("button", { name: "Adicionar produção" }),
    );
    expect(
      await screen.findByRole("option", { name: "Corte · m³" }),
    ).toBeTruthy();
    expect((screen.getByLabelText("Frente") as HTMLSelectElement).value).toBe(
      frontId,
    );
    expect(screen.queryByText("Tipo de lançamento")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      await screen.findByRole("checkbox", { name: /Basculante 01/u }),
    );
    await user.type(screen.getByLabelText("Viagens de Basculante 01"), "2");
    await user.type(
      screen.getByLabelText("Carga média de Basculante 01"),
      "289",
    );
    await user.type(
      screen.getByLabelText("Descarga média de Basculante 01"),
      "315",
    );
    await user.type(screen.getByLabelText("DMT médio de Basculante 01"), "2,4");
    await user.click(
      screen.getByRole("button", { name: "Confirmar caminhão" }),
    );
    expect(screen.getByText(/segundos entre 00 e 59/u)).toBeTruthy();
    await user.clear(screen.getByLabelText("Carga média de Basculante 01"));
    await user.type(
      screen.getByLabelText("Carga média de Basculante 01"),
      "230",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar caminhão" }),
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByLabelText("Descarte"));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    expect(
      screen.getByRole("button", { name: "Editar Basculante 01" }),
    ).toBeTruthy();
    expect(screen.getByText(/23 m³ solto/u)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar produção" }),
    );

    await waitFor(() =>
      expect(saveProjectProductionAction).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          command: expect.objectContaining({
            kind: "individual_activity",
            submitNow: true,
            entryMode: "truck_summary",
            individualActivity: expect.objectContaining({
              volumeCondition: "loose",
              dmtKm: "2.400",
              destinationKind: "disposal",
            }),
            truckSummaries: [
              expect.objectContaining({
                machineId: truckId,
                acceptedTrips: 2,
                averageLoadingMinutes: "2.30",
                averageUnloadingMinutes: "3.15",
                dmtKm: "2.4",
              }),
            ],
          }),
        }),
      ),
    );
  });

  it("blocks a new production until a work front is started", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectProductionOptionsAction).mockResolvedValue({
      ...options,
      workFronts: [],
    });
    render(<ProjectProductions projectId={projectId} initialPage={page} />);

    await user.click(
      screen.getByRole("button", { name: "Adicionar produção" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Inicie uma frente de serviço antes de registrar produção.",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Avançar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Frente") as HTMLSelectElement).options,
    ).toHaveLength(0);
  });

  it("carrega e pagina caminhões automaticamente sem oferecer outras máquinas", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectProductionTruckOptionsAction).mockImplementation(
      async (input) =>
        input.cursor
          ? {
              data: [
                {
                  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                  name: "Basculante 02",
                  manufacturer: "Volvo",
                  model: "FMX",
                  identifier: "PAT-02",
                  identifierKind: "COMPANY_TAG",
                  effectiveCapacity: "10.000",
                  capacityUnitCode: "M3_LOOSE",
                  driver: null,
                },
              ],
              pageInfo: { hasNextPage: false, nextCursor: null },
            }
          : {
              data: [
                {
                  id: truckId,
                  name: "Basculante 01",
                  manufacturer: "Mercedes-Benz",
                  model: "Arocs",
                  identifier: "TR-01",
                  identifierKind: "PLATE",
                  effectiveCapacity: "11.500",
                  capacityUnitCode: "M3_LOOSE",
                  driver: { id: employmentId, name: "Carlos Motorista" },
                },
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  name: "Basculante reserva",
                  manufacturer: "Scania",
                  model: "G 500",
                  identifier: "TR-RES",
                  identifierKind: "PLATE",
                  effectiveCapacity: "12.000",
                  capacityUnitCode: "M3_LOOSE",
                  driver: null,
                },
              ],
              pageInfo: { hasNextPage: true, nextCursor: "next-page" },
            },
    );
    render(<ProjectProductions projectId={projectId} initialPage={page} />);

    await user.click(
      screen.getByRole("button", { name: "Adicionar produção" }),
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    const first = await screen.findByRole("checkbox", {
      name: /Basculante 01/u,
    });
    expect(
      screen.queryByRole("button", { name: "Adicionar máquina" }),
    ).toBeNull();
    expect(screen.queryByText(/Outras máquinas/u)).toBeNull();
    await user.click(first);
    expect(
      screen.getByRole("article", { name: "Configurar Basculante 01" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", {
        name: "Dados operacionais de Basculante 01",
      }).className,
    ).toContain("sm:grid-cols-2");
    expect(
      screen.getByRole("group", {
        name: "Dados operacionais de Basculante 01",
      }).className,
    ).not.toContain("lg:grid-cols-4");
    expect(screen.queryByText("Basculante reserva")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Avançar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Basculante reserva")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /Basculante 01/u }));
    await user.type(screen.getByLabelText("Viagens de Basculante 01"), "2");
    await user.type(
      screen.getByLabelText("Carga média de Basculante 01"),
      "500",
    );
    await user.type(
      screen.getByLabelText("Descarga média de Basculante 01"),
      "300",
    );
    await user.type(screen.getByLabelText("DMT médio de Basculante 01"), "2,4");
    await user.click(
      screen.getByRole("button", { name: "Confirmar caminhão" }),
    );
    await user.click(screen.getByRole("button", { name: /Próxima/u }));
    expect(
      await screen.findByRole("checkbox", { name: /Basculante 02/u }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Anterior/u }));
    expect(
      await screen.findByRole("button", { name: "Editar Basculante 01" }),
    ).toBeTruthy();
  });

  it("não oferece movimentação de material nem campos de qualidade", async () => {
    const user = userEvent.setup();
    render(<ProjectProductions projectId={projectId} initialPage={page} />);
    await user.click(
      screen.getByRole("button", { name: "Adicionar produção" }),
    );
    expect(await screen.findByLabelText("Atividade")).toBeTruthy();
    expect(screen.queryByLabelText("Tipo de lançamento")).toBeNull();
    expect(screen.queryByLabelText("Qualidade")).toBeNull();
    expect(screen.queryByLabelText("Evidência")).toBeNull();
    expect(screen.queryByLabelText("Origem")).toBeNull();
    expect(screen.queryByText("Destino do material")).toBeNull();
  });

  it("permite lançar aterro por volume direto", async () => {
    const user = userEvent.setup();
    vi.mocked(getProjectProductionOptionsAction).mockResolvedValue({
      ...options,
      workFronts: [
        {
          ...options.workFronts[0]!,
          services: [
            { ...options.workFronts[0]!.services[0]!, serviceCode: "fill" },
          ],
        },
      ],
    });
    vi.mocked(saveProjectProductionAction).mockResolvedValue({
      kind: "success",
      production: detail("individual_activity"),
    });
    render(<ProjectProductions projectId={projectId} initialPage={page} />);
    await user.click(
      screen.getByRole("button", { name: "Adicionar produção" }),
    );
    expect(
      await screen.findByRole("option", { name: "Aterro · m³" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByLabelText("Volume direto"));
    await user.type(screen.getByLabelText("Quantidade m³"), "25,5");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      screen.getByRole("button", { name: "Confirmar produção" }),
    );
    await waitFor(() =>
      expect(saveProjectProductionAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            entryMode: "direct_total",
            individualActivity: expect.objectContaining({
              operationalQuantity: "25.5",
            }),
          }),
        }),
      ),
    );
  });

  it("cria corte e aterro juntos e permite voltar da revisão ao destino", async () => {
    const user = userEvent.setup();
    const fillFrontId = "99999999-9999-4999-8999-999999999999";
    const fillServiceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    vi.mocked(getProjectProductionOptionsAction).mockResolvedValue({
      ...options,
      workFronts: [
        options.workFronts[0]!,
        {
          ...options.workFronts[0]!,
          id: fillFrontId,
          name: "Aterro Sul",
          services: [
            {
              ...options.workFronts[0]!.services[0]!,
              id: fillServiceId,
              serviceCode: "fill",
            },
          ],
        },
      ],
    });
    vi.mocked(saveProjectProductionPairAction).mockResolvedValue({
      kind: "success",
      productions: {
        cut: detail("individual_activity"),
        fill: { ...detail("individual_activity"), id: fillFrontId },
      },
    });
    render(<ProjectProductions projectId={projectId} initialPage={page} />);

    await user.click(
      screen.getByRole("button", { name: "Adicionar produção" }),
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      await screen.findByRole("checkbox", { name: /Basculante 01/u }),
    );
    await user.type(screen.getByLabelText("Viagens de Basculante 01"), "2");
    await user.type(
      screen.getByLabelText("Carga média de Basculante 01"),
      "500",
    );
    await user.type(
      screen.getByLabelText("Descarga média de Basculante 01"),
      "300",
    );
    await user.type(screen.getByLabelText("DMT médio de Basculante 01"), "2,4");
    await user.click(
      screen.getByRole("button", { name: "Confirmar caminhão" }),
    );
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByLabelText("Aterro"));
    await user.selectOptions(
      screen.getByLabelText("Frente de aterro"),
      fillFrontId,
    );
    await user.type(
      screen.getByLabelText("Redução por compactação (%)"),
      "2000",
    );
    expect(screen.getByText(/18,4 m³ compactado/u)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Editar Destino" }));
    expect(screen.getByLabelText("Frente de aterro")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(
      screen.getByRole("button", { name: "Confirmar produção" }),
    );

    await waitFor(() =>
      expect(saveProjectProductionPairAction).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          command: expect.objectContaining({
            cut: expect.objectContaining({
              individualActivity: expect.objectContaining({
                destinationKind: "fill",
                destinationWorkFrontId: fillFrontId,
              }),
            }),
            fill: expect.objectContaining({
              individualActivity: expect.objectContaining({
                workFrontId: fillFrontId,
                workFrontServiceId: fillServiceId,
                operationalQuantity: "18.400",
                compactionReductionPercent: "20.00",
              }),
            }),
          }),
        }),
      ),
    );
  });
});

function detail(
  kind: ProjectProductionDetail["kind"],
): ProjectProductionDetail {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    projectId,
    kind,
    workFrontId: frontId,
    workFrontServiceId: serviceId,
    serviceCode: "cut",
    unitCode: kind === "material_movement" ? "M3_LOOSE" : "M3_BANK",
    productionProfile: "excavation",
    dmtPolicy: "optional",
    productionDate: "2026-08-10",
    shift: "day",
    status: "submitted",
    entryMode: kind === "material_movement" ? "truck_summary" : "direct_total",
    revision: 1,
    operationalRevision: 1,
    startTime: "07:00",
    endTime: "17:00",
    endDayOffset: 0,
    responsible: { employmentId, name: "Ana Silva" },
    location: "Estaca 10",
    startStation: null,
    endStation: null,
    layer: null,
    elevation: null,
    materialName: kind === "material_movement" ? "Solo argiloso" : null,
    materialCategory: null,
    volumeCondition: kind === "material_movement" ? "loose" : "bank",
    directQuantity: kind === "individual_activity" ? "25.500" : null,
    measuredQuantity: null,
    conversionFactor: null,
    origin: kind === "material_movement" ? "Corte A" : null,
    destination: kind === "material_movement" ? "Aterro B" : null,
    dmtKm: kind === "material_movement" ? "2.400" : null,
    layerThicknessCm: null,
    compactionPasses: null,
    moistureCondition: null,
    evidence: [],
    notes: null,
    individualActivity:
      kind === "individual_activity"
        ? {
            quantityMethod: "manual",
            exceptionalFromMovement: false,
            exceptionReason: null,
            destinationKind: null,
            destinationWorkFrontId: null,
            compactionReductionPercent: null,
          }
        : null,
    materialMovement:
      kind === "material_movement"
        ? {
            materialRevisionId: null,
            routeRevisionId: null,
            origin: "Corte A",
            destination: "Aterro B",
            layer: null,
            materialSnapshot: {},
            routeSnapshot: {},
          }
        : null,
    components: [],
    truckSummaries: [],
    qualityChecks: [],
    approvalHistory: [],
    metrics: {
      operationalVolumeM3: kind === "material_movement" ? "92.000" : "25.500",
      officialQuantity: kind === "material_movement" ? "92.000" : "25.500",
      difference: null,
      differencePercent: null,
      tripCount: kind === "material_movement" ? 8 : 0,
      tripsPerHour: null,
      quantityPerHour: null,
      dmtKm: kind === "material_movement" ? "2.400" : null,
      transportMomentM3Km: kind === "material_movement" ? "220.800" : null,
      workedMinutes: 0,
      stoppedMinutes: 0,
    },
    equipment: [],
    trips: [],
    approval: {
      approvedByUserId: null,
      approvedAt: null,
      direct: false,
    },
    rdo: { linked: false, stale: false },
    lastReopenReason: null,
    createdByUserId: "88888888-8888-4888-8888-888888888888",
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
  };
}

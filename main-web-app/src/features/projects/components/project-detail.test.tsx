// @vitest-environment jsdom

import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("../projects.actions", () => ({
  activateProjectAction: vi.fn(),
  createProjectWorkFrontAction: vi.fn(),
  getProjectMobilizationHistoryAction: vi.fn(),
  saveProjectEmployeeMobilizationAction: vi.fn(),
  saveProjectMachineMobilizationAction: vi.fn(),
  saveProjectQuantityBaselineAction: vi.fn(),
  saveProjectReadinessAction: vi.fn(),
  saveProjectWorkFrontMobilizationAction: vi.fn(),
  saveProjectWorkFrontServicesAction: vi.fn(),
  startProjectWorkFrontAction: vi.fn(),
  updateProjectWorkFrontAction: vi.fn(),
}));

vi.mock("../daily-reports.actions", () => ({
  finalizeProjectDailyReportAction: vi.fn(),
  getMoreProjectDailyReportsAction: vi.fn(),
  getProjectDailyReportAction: vi.fn(),
  getProjectDailyReportOptionsAction: vi.fn(),
  saveProjectDailyReportAction: vi.fn(),
}));

vi.mock("../productions.actions", () => ({
  addProjectProductionTripAction: vi.fn(),
  approveProjectProductionAction: vi.fn(),
  confirmDailyReportProductionsAction: vi.fn(),
  getMoreProjectProductionsAction: vi.fn(),
  getProjectProductionAction: vi.fn(),
  getProjectProductionOptionsAction: vi.fn(),
  getShiftProjectProductionsAction: vi.fn(),
  removeProjectProductionTripAction: vi.fn(),
  reopenProjectProductionAction: vi.fn(),
  saveProjectProductionAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import {
  activateProjectAction,
  createProjectWorkFrontAction,
  getProjectMobilizationHistoryAction,
  saveProjectQuantityBaselineAction,
  saveProjectReadinessAction,
  saveProjectWorkFrontMobilizationAction,
  saveProjectWorkFrontServicesAction,
  updateProjectWorkFrontAction,
} from "../projects.actions";
import { toast } from "sonner";
import type {
  ProjectDetailSnapshot,
  ProjectOfferSnapshot,
  ProjectReadinessOptions,
  SupplierOfferOption,
} from "../projects.types";
import {
  createBlankFuelDraft,
  draftToFuelCommand,
  FuelAddEditor,
  FuelEditEditor,
  ProjectDetail,
  type FuelDraft,
} from "./project-detail";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const measurementUnits: ProjectReadinessOptions["measurementUnits"] = [
  { id: "unit-h", code: "H", name: "Hora" },
  { id: "unit-l", code: "L", name: "Litro" },
];

const suppliers: ProjectReadinessOptions["suppliers"] = [
  {
    id: "supplier-1",
    name: "Posto Serra Azul",
    tradeName: null,
    document: { documentType: "cnpj", maskedDocument: "00.000.000/0001-00" },
    isActive: true,
  },
];

const suppliedItems: ProjectReadinessOptions["suppliedItems"] = [
  {
    id: "item-1",
    name: "Diesel S10",
    baseUnitId: "unit-l",
    kind: "fuel",
  },
];

const suppliedItemCategories: ProjectReadinessOptions["suppliedItemCategories"] =
  [
    {
      id: "category-1",
      name: "Combustíveis",
      parentId: null,
      kind: "fuel",
    },
  ];

const fuelOptions: SupplierOfferOption[] = [
  {
    id: "offer-1",
    supplier: suppliers[0],
    item: { id: "item-1", name: "Diesel S10", baseUnitId: "unit-l" },
    purchaseUnit: { id: "unit-l", code: "L", name: "Litro" },
    conversionToBase: "1.000000",
    currentPrice: {
      price: "6.5000",
      effectiveFrom: "2026-07-16T00:00:00.000Z",
    },
    kind: "fuel",
  },
];

const fuelOfferSnapshot: ProjectOfferSnapshot = {
  id: "project-offer-1",
  usageKind: "fuel",
  sourceOfferId: null,
  sourceOfferIsActive: true,
  supplier: suppliers[0],
  item: { id: "item-1", name: "Diesel S10", isActive: true },
  purchaseUnit: { id: "unit-l", code: "L", name: "Litro", isActive: true },
  conversionToBase: "1.250000",
  price: "6.7000",
  effectiveFrom: "2026-07-16T00:00:00.000Z",
};

const materialOfferSnapshot: ProjectOfferSnapshot = {
  id: "project-material-offer-1",
  usageKind: "material",
  sourceOfferId: null,
  sourceOfferIsActive: true,
  supplier: suppliers[0],
  item: { id: "material-item-1", name: "Pedra britada", isActive: true },
  purchaseUnit: { id: "unit-l", code: "L", name: "Litro", isActive: true },
  conversionToBase: "1.000000",
  price: "120.0000",
  effectiveFrom: "2026-07-16T00:00:00.000Z",
};

const projectSnapshot: ProjectDetailSnapshot = {
  id: "00000000-0000-4000-8000-000000000901",
  name: "Obra Norte",
  address: {
    formatted: "Rua A, 10 - Fortaleza/CE",
    postalCode: "60170000",
    street: "Rua A",
    number: "10",
    complement: null,
    neighborhood: "Meireles",
    city: "Fortaleza",
    state: "CE",
  },
  latitude: null,
  longitude: null,
  contractNumber: null,
  status: "planned",
  actualStartedAt: null,
  createdAt: "2026-07-16T00:00:00.000Z",
  baseline: {
    approvedBudget: "100.00",
    plannedStartDate: "2026-07-01",
    plannedEndDate: "2026-08-01",
    effectiveFrom: "2026-07-16T00:00:00.000Z",
  },
  client: null,
  manager: null,
  technicalResponsibilities: [],
  schedule: { shifts: ["day"], days: [], breakTemplates: [] },
  employeeAllocations: [],
  machineAllocations: [],
  fuelOffers: [],
  supplierOffers: [],
  productionMetricTargets: [{ metricCode: "cut", targetTotal: "1234.00" }],
  quantityBaseline: {
    revision: 1,
    createdAt: "2026-07-16T00:00:00.000Z",
    reason: null,
    items: [
      {
        serviceCode: "cut",
        unitCode: "M3",
        total: "1234.00",
        allocated: "0.00",
        unallocated: "1234.00",
        produced: "0.000",
      },
    ],
  },
  workFronts: [],
  compensationPaymentTerms: [],
  readiness: {
    canActivate: false,
    blockers: [{ section: "fuel", message: "Informe combustível." }],
  },
};

const projectOptions: ProjectReadinessOptions = {
  clients: [],
  employees: [],
  machines: [],
  jobRoles: [],
  suppliers,
  suppliedItems,
  suppliedItemCategories,
  measurementUnits,
  supplierOffers: fuelOptions,
};

function projectDetailElement(project: ProjectDetailSnapshot) {
  return (
    <ProjectDetail
      lookupSuppliedItemOfferSuppliersAction={
        lookupSuppliedItemOfferSuppliersAction
      }
      lookupSuppliedItemOffersAction={lookupSuppliedItemOffersAction}
      lookupSuppliedItemsAction={lookupSuppliedItemsAction}
      lookupSuppliersAction={lookupSuppliersAction}
      options={projectOptions}
      project={project}
    />
  );
}

function renderProjectDetail(project: ProjectDetailSnapshot) {
  return render(projectDetailElement(project));
}

const lookupSuppliedItemsAction: React.ComponentProps<
  typeof FuelAddEditor
>["lookupSuppliedItemsAction"] = async () => ({
  data: [
    {
      id: "item-1",
      name: "Diesel S10",
      baseUnitId: "unit-l",
      categoryId: "category-1",
      categoryPath: ["Combustíveis"],
      activeSupplierCount: 1,
      kind: "fuel",
    },
  ],
  pageInfo: { hasNextPage: false, nextCursor: null },
});

const lookupSuppliedItemOfferSuppliersAction: React.ComponentProps<
  typeof FuelAddEditor
>["lookupSuppliedItemOfferSuppliersAction"] = async () => suppliers;

const lookupSuppliersAction: React.ComponentProps<
  typeof ProjectDetail
>["lookupSuppliersAction"] = async () => suppliers;

const lookupSuppliedItemOffersAction: React.ComponentProps<
  typeof FuelAddEditor
>["lookupSuppliedItemOffersAction"] = async () => ({
  data: [
    {
      id: "offer-1",
      supplier: suppliers[0],
      baseUnit: { id: "unit-l", code: "L", name: "Litro" },
      purchaseUnit: { id: "unit-l", code: "L", name: "Litro" },
      conversionToBase: "1.000000",
      currentPrice: {
        id: "price-1",
        price: "6.5000",
        effectiveFrom: "2026-07-16T00:00:00.000Z",
      },
    },
  ],
  pageInfo: { hasNextPage: false, nextCursor: null },
});

function FuelAddHarness({
  lookupItems = lookupSuppliedItemsAction,
  step = "source",
}: {
  lookupItems?: React.ComponentProps<
    typeof FuelAddEditor
  >["lookupSuppliedItemsAction"];
  step?: React.ComponentProps<typeof FuelAddEditor>["step"];
}) {
  const [draft, setDraft] = React.useState<FuelDraft | null>({
    ...createBlankFuelDraft(fuelOptions, measurementUnits),
    mode: "new",
    supplierId: "supplier-1",
    itemId: "item-1",
    purchaseUnitId: "unit-l",
  });

  if (!draft) return null;

  return (
    <FuelAddEditor
      categories={suppliedItemCategories}
      draft={draft}
      fuelOptions={fuelOptions}
      lookupSuppliedItemOfferSuppliersAction={
        lookupSuppliedItemOfferSuppliersAction
      }
      lookupSuppliedItemOffersAction={lookupSuppliedItemOffersAction}
      lookupSuppliedItemsAction={lookupItems}
      measurementUnits={measurementUnits}
      suppliers={suppliers}
      suppliedItems={suppliedItems}
      step={step}
      setDraft={setDraft}
    />
  );
}

function FuelEditHarness() {
  const [draft, setDraft] = React.useState<FuelDraft | null>({
    key: fuelOfferSnapshot.id,
    mode: "new",
    sourceOfferId: "",
    supplierId: suppliers[0].id,
    itemId: "item-1",
    purchaseUnitId: "unit-l",
    conversionToBase: "1,250000",
    defaultConversionToBase: "1,250000",
    price: "6,7000",
    customQuantityEnabled: false,
  });

  if (!draft) return null;

  return (
    <FuelEditEditor
      draft={draft}
      offer={fuelOfferSnapshot}
      setDraft={setDraft}
    />
  );
}

describe("Project detail fuel editors", () => {
  it("starts the fuel add wizard at the source choice", () => {
    render(<FuelAddHarness step="source" />);

    expect(screen.getByText("Oferta existente do catálogo")).toBeTruthy();
    expect(screen.getByText("Oferta exclusiva da obra")).toBeTruthy();
  });

  it("hides the catalog toggle when adding a project-only fuel offer", () => {
    render(<FuelAddHarness step="offer" />);

    expect(
      screen.queryByText("Salvar também no catálogo da empresa"),
    ).toBeNull();
    expect(screen.getByLabelText("Buscar fornecedor")).toBeTruthy();
  });

  it("debounces item search before consulting the API", async () => {
    const lookupItems = vi.fn(lookupSuppliedItemsAction);
    render(<FuelAddHarness lookupItems={lookupItems} step="item" />);

    await waitFor(() => expect(lookupItems).toHaveBeenCalledTimes(1));
    lookupItems.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Diesel, gasolina..."), {
      target: { value: "Diesel" },
    });

    expect(lookupItems).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(lookupItems).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Diesel" }),
      ),
    );
  });

  it("always saves a new fuel offer as projectOnly", () => {
    const command = draftToFuelCommand({
      key: "fuel-1",
      mode: "new",
      sourceOfferId: "",
      supplierId: "supplier-1",
      itemId: "item-1",
      purchaseUnitId: "unit-l",
      conversionToBase: "1,000000",
      defaultConversionToBase: "1,000000",
      price: "6,5000",
      customQuantityEnabled: false,
    });

    expect(command).toEqual({
      mode: "projectOnly",
      supplierId: "supplier-1",
      itemId: "item-1",
      purchaseUnitId: "unit-l",
      conversionToBase: "1.000000",
      price: "6.5000",
    });
  });

  it("keeps supplier, item and unit locked in fuel editing and only reveals quantity on demand", async () => {
    const user = userEvent.setup();
    render(<FuelEditHarness />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByLabelText("Preço")).toBeTruthy();
    expect(screen.queryByLabelText("Quantidade")).toBeNull();

    await user.click(screen.getByLabelText("Alterar quantidade nesta obra"));

    expect(screen.getByLabelText("Quantidade")).toBeTruthy();
  });
});

describe("Project activation", () => {
  const activatableProject: ProjectDetailSnapshot = {
    ...projectSnapshot,
    readiness: { canActivate: true, blockers: [] },
  };
  const activatedProject: ProjectDetailSnapshot = {
    ...activatableProject,
    status: "active",
    actualStartedAt: "2026-07-20T22:30:00.000Z",
  };

  const confirmActivation = async (
    user: ReturnType<typeof userEvent.setup>,
  ) => {
    await user.click(screen.getByRole("button", { name: "Iniciar obra" }));
    await user.click(screen.getByRole("button", { name: "Sim, iniciar obra" }));
  };

  it("asks for confirmation and cancels without starting the project", async () => {
    const activateProject = vi.mocked(activateProjectAction);
    const user = userEvent.setup();

    renderProjectDetail(activatableProject);
    await user.click(screen.getByRole("button", { name: "Iniciar obra" }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Iniciar esta obra?")).toBeTruthy();
    expect(activateProject).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Não, cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(activateProject).not.toHaveBeenCalled();
  });

  it("applies the active snapshot immediately and refreshes for reconciliation", async () => {
    const activateProject = vi.mocked(activateProjectAction);
    activateProject.mockResolvedValue({
      kind: "success",
      project: activatedProject,
    });
    const user = userEvent.setup();

    renderProjectDetail(activatableProject);
    await confirmActivation(user);

    await waitFor(() =>
      expect(activateProject).toHaveBeenCalledWith(activatableProject.id),
    );
    expect(activateProject).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Obra iniciada.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("tab", { name: /Visão geral/u })).toBeTruthy();
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pronta para iniciar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar obra" })).toBeNull();
  });

  it("synchronizes a later active snapshot received from the server page", async () => {
    vi.mocked(activateProjectAction).mockResolvedValue({
      kind: "success",
      project: activatedProject,
    });
    const user = userEvent.setup();
    const { rerender } = renderProjectDetail(activatableProject);

    await confirmActivation(user);
    await screen.findByRole("tab", { name: /Visão geral/u });

    rerender(
      projectDetailElement({
        ...activatedProject,
        name: "Obra Norte reconciliada",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Obra Norte reconciliada",
      }),
    ).toBeTruthy();
  });

  it("blocks repeated clicks and shows progress while activation is pending", async () => {
    const activateProject = vi.mocked(activateProjectAction);
    let resolveActivation!: (
      result: Awaited<ReturnType<typeof activateProjectAction>>,
    ) => void;
    activateProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveActivation = resolve;
        }),
    );
    const user = userEvent.setup();

    renderProjectDetail(activatableProject);
    await confirmActivation(user);

    const pendingButton = screen.getByRole("button", {
      name: "Iniciando obra...",
    }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");
    await user.click(pendingButton);
    expect(activateProject).toHaveBeenCalledTimes(1);

    resolveActivation({ kind: "success", project: activatedProject });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Visão geral/u })).toBeTruthy(),
    );
  });

  it("keeps the project planned when success does not confirm an active snapshot", async () => {
    vi.mocked(activateProjectAction).mockResolvedValue({
      kind: "success",
      project: activatableProject,
    });
    const user = userEvent.setup();

    renderProjectDetail(activatableProject);
    await confirmActivation(user);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível iniciar a obra.",
        {
          description:
            "A API não confirmou a ativação. Atualize a página e tente novamente.",
        },
      ),
    );
    expect(screen.getByText("Pronta para iniciar")).toBeTruthy();
  });

  it("shows all readiness blockers returned by the backend", async () => {
    vi.mocked(activateProjectAction).mockResolvedValue({
      kind: "recoverable-conflict",
      code: "PROJECT_RESOURCE_CONFLICT",
      message: "Project readiness is incomplete",
      blockers: [
        { section: "fronts", message: "Cadastre uma frente válida." },
        { section: "fuelOffers", message: "Informe o combustível." },
      ],
    });
    const user = userEvent.setup();

    renderProjectDetail(activatableProject);
    await confirmActivation(user);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A obra ainda tem pendências de início.",
        {
          description: "Cadastre uma frente válida. Informe o combustível.",
        },
      ),
    );
  });

  it("shows the safe backend message for a terminal failure", async () => {
    vi.mocked(activateProjectAction).mockResolvedValue({
      kind: "terminal-failure",
      code: "PROJECT_ACTION_FAILED",
      message: "Serviço temporariamente indisponível.",
    });
    const user = userEvent.setup();

    renderProjectDetail(activatableProject);
    await confirmActivation(user);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível iniciar a obra.",
        { description: "Serviço temporariamente indisponível." },
      ),
    );
  });

  it("recovers from a rejected Server Action and allows another attempt", async () => {
    vi.mocked(activateProjectAction).mockRejectedValue(
      new Error("Server Action transport failed"),
    );
    const user = userEvent.setup();

    renderProjectDetail(activatableProject);
    await confirmActivation(user);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível iniciar a obra.",
        {
          description: "A comunicação com o servidor falhou. Tente novamente.",
        },
      ),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Iniciar obra",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
});

describe("Project detail planning metrics", () => {
  it("edits and saves planned dates through their modal", async () => {
    const saveReadiness = vi.mocked(saveProjectReadinessAction);
    saveReadiness.mockResolvedValue({
      kind: "success",
      project: projectSnapshot,
    });
    const user = userEvent.setup();

    renderProjectDetail(projectSnapshot);

    expect(screen.queryByLabelText("Início planejado")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Editar datas" }));
    const modal = screen.getByRole("dialog");
    const startInput = within(modal).getByLabelText(
      "Início planejado",
    ) as HTMLInputElement;
    const endInput = within(modal).getByLabelText(
      "Fim planejado",
    ) as HTMLInputElement;
    expect(startInput.value).toBe("2026-07-01");
    expect(endInput.value).toBe("2026-08-01");

    fireEvent.change(startInput, { target: { value: "2026-07-02" } });
    fireEvent.change(endInput, { target: { value: "2026-08-02" } });
    await user.click(
      within(modal).getByRole("button", { name: "Salvar datas" }),
    );

    await waitFor(() =>
      expect(saveReadiness).toHaveBeenCalledWith(projectSnapshot.id, {
        plannedStartDate: "2026-07-02",
        plannedEndDate: "2026-08-02",
      }),
    );
    expect(saveProjectQuantityBaselineAction).not.toHaveBeenCalled();
  });

  it("blocks a planned end date earlier than the planned start date", async () => {
    const saveReadiness = vi.mocked(saveProjectReadinessAction);
    const user = userEvent.setup();

    renderProjectDetail(projectSnapshot);
    await user.click(screen.getByRole("button", { name: "Editar datas" }));
    const modal = screen.getByRole("dialog");
    const startInput = within(modal).getByLabelText("Início planejado");
    const endInput = within(modal).getByLabelText("Fim planejado");

    fireEvent.change(startInput, { target: { value: "2026-09-01" } });
    fireEvent.change(endInput, { target: { value: "2026-08-01" } });
    await user.click(
      within(modal).getByRole("button", { name: "Salvar datas" }),
    );

    expect(
      within(modal).getByText(
        "A data final não pode ser anterior à data inicial.",
      ),
    ).toBeTruthy();
    expect(saveReadiness).not.toHaveBeenCalled();
  });

  it("shows three-decimal quantities and saves a separate baseline revision", async () => {
    const saveBaseline = vi.mocked(saveProjectQuantityBaselineAction);
    saveBaseline.mockResolvedValue({
      kind: "success",
      project: projectSnapshot,
    });
    const user = userEvent.setup();

    renderProjectDetail(projectSnapshot);
    await user.click(
      screen.getByRole("button", { name: "Editar quantitativos" }),
    );
    const modal = screen.getByRole("dialog");

    const targetInput = within(modal).getAllByLabelText(
      /Total de referência/u,
    )[0] as HTMLInputElement;
    expect(targetInput.value).toBe("1.234,000");

    await user.clear(targetInput);
    await user.type(targetInput, "1234567000");
    expect(targetInput.value).toBe("1.234.567,000");

    await user.click(
      within(modal).getByRole("button", { name: "Salvar quantitativos" }),
    );

    await waitFor(() =>
      expect(saveBaseline).toHaveBeenCalledWith(projectSnapshot.id, {
        items: [{ serviceCode: "cut", unitCode: "M3", total: "1234567.000" }],
      }),
    );
    expect(saveProjectReadinessAction).not.toHaveBeenCalled();
  });

  it("blocks a baseline total below the quantity already distributed", async () => {
    const user = userEvent.setup();
    const allocatedProject: ProjectDetailSnapshot = {
      ...projectSnapshot,
      quantityBaseline: {
        ...projectSnapshot.quantityBaseline,
        items: [
          {
            ...projectSnapshot.quantityBaseline.items[0],
            allocated: "500.00",
            unallocated: "734.00",
          },
        ],
      },
    };

    renderProjectDetail(allocatedProject);
    await user.click(
      screen.getByRole("button", { name: "Editar quantitativos" }),
    );
    const modal = screen.getByRole("dialog");
    const targetInput = within(modal).getAllByLabelText(
      /Total de referência/u,
    )[0] as HTMLInputElement;
    await user.clear(targetInput);
    await user.type(targetInput, "499");

    expect(
      within(modal).getByText("Total abaixo do volume distribuído."),
    ).toBeTruthy();
    expect(targetInput.getAttribute("aria-invalid")).toBe("true");
    expect(
      (
        within(modal).getByRole("button", {
          name: "Salvar quantitativos",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(saveProjectQuantityBaselineAction).not.toHaveBeenCalled();
  });
});

describe("Project work fronts", () => {
  it("creates a work front through the operational modal", async () => {
    const createFront = vi.mocked(createProjectWorkFrontAction);
    createFront.mockResolvedValue({
      kind: "success",
      project: projectSnapshot,
    });
    const user = userEvent.setup();

    renderProjectDetail(projectSnapshot);
    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    await user.click(screen.getByRole("button", { name: /Cadastrar frente/u }));

    expect(
      screen.getByRole("heading", { name: "Cadastrar frente de serviço" }),
    ).toBeTruthy();
    const modal = screen.getByRole("dialog");
    await user.type(
      within(modal).getByLabelText("Nome da frente"),
      "Frente norte",
    );
    await user.type(
      within(modal).getByLabelText("Quantidade para Corte"),
      "250000",
    );
    await user.click(
      within(modal).getByRole("button", { name: /^Cadastrar frente$/u }),
    );

    await waitFor(() =>
      expect(createFront).toHaveBeenCalledWith(projectSnapshot.id, {
        name: "Frente norte",
        location: null,
        notes: null,
        plannedStartDate: null,
        plannedEndDate: null,
        requiresEmployees: true,
        requiresMachines: true,
        services: [{ serviceCode: "cut", unitCode: "M3", quantity: "250.000" }],
      }),
    );
  });

  it("shows the backend error inside the work-front modal", async () => {
    const createFront = vi.mocked(createProjectWorkFrontAction);
    createFront.mockResolvedValue({
      kind: "recoverable-conflict",
      code: "WORK_FRONT_QUANTITY_EXCEEDS_BALANCE",
      message: "Um ou mais quantitativos ultrapassam o saldo disponível.",
      blockers: [
        {
          section: "fronts",
          message: "A frente excede o saldo disponível para corte.",
        },
      ],
    });
    const user = userEvent.setup();

    renderProjectDetail(projectSnapshot);
    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    await user.click(screen.getByRole("button", { name: /Cadastrar frente/u }));
    const modal = screen.getByRole("dialog");
    await user.type(
      within(modal).getByLabelText("Nome da frente"),
      "Frente norte",
    );
    await user.type(
      within(modal).getByLabelText("Quantidade para Corte"),
      "250000",
    );
    await user.click(
      within(modal).getByRole("button", { name: /^Cadastrar frente$/u }),
    );

    expect(
      await screen.findByText("A frente excede o saldo disponível para corte."),
    ).toBeTruthy();
  });

  it("warns and blocks a work front above the available balance", async () => {
    const createFront = vi.mocked(createProjectWorkFrontAction);
    const user = userEvent.setup();

    renderProjectDetail(projectSnapshot);
    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    await user.click(screen.getByRole("button", { name: /Cadastrar frente/u }));
    const modal = screen.getByRole("dialog");
    await user.type(
      within(modal).getByLabelText("Nome da frente"),
      "Frente acima do saldo",
    );
    const quantityInput = within(modal).getByLabelText("Quantidade para Corte");
    await user.type(quantityInput, "1235000");

    expect(
      within(modal).getByText("Quantitativo acima do saldo disponível."),
    ).toBeTruthy();
    expect(
      within(modal).getByText(
        "Solicitado 1.235,000 M3; saldo disponível 1.234,000 M3.",
      ),
    ).toBeTruthy();
    expect(quantityInput.getAttribute("aria-invalid")).toBe("true");
    expect(
      (
        within(modal).getByRole("button", {
          name: /^Cadastrar frente$/u,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(createFront).not.toHaveBeenCalled();
  });

  it("allows a work front equal to the available balance", async () => {
    const createFront = vi.mocked(createProjectWorkFrontAction);
    createFront.mockResolvedValue({
      kind: "success",
      project: projectSnapshot,
    });
    const user = userEvent.setup();

    renderProjectDetail(projectSnapshot);
    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    await user.click(screen.getByRole("button", { name: /Cadastrar frente/u }));
    const modal = screen.getByRole("dialog");
    await user.type(
      within(modal).getByLabelText("Nome da frente"),
      "Frente saldo total",
    );
    await user.type(
      within(modal).getByLabelText("Quantidade para Corte"),
      "1234000",
    );
    await user.click(
      within(modal).getByRole("button", { name: /^Cadastrar frente$/u }),
    );

    await waitFor(() =>
      expect(createFront).toHaveBeenCalledWith(projectSnapshot.id, {
        name: "Frente saldo total",
        location: null,
        notes: null,
        plannedStartDate: null,
        plannedEndDate: null,
        requiresEmployees: true,
        requiresMachines: true,
        services: [
          { serviceCode: "cut", unitCode: "M3", quantity: "1234.000" },
        ],
      }),
    );
  });

  it("keeps the fronts tab without offering to start a front with the project", async () => {
    const user = userEvent.setup();
    const firstFront: ProjectDetailSnapshot["workFronts"][number] = {
      id: "00000000-0000-4000-8000-000000000911",
      name: "Frente norte",
      location: "Trecho A",
      notes: null,
      plannedStartDate: null,
      plannedEndDate: null,
      requiresEmployees: true,
      requiresMachines: true,
      status: "planned",
      actualStartedAt: null,
      services: [
        {
          serviceCode: "cut",
          unitCode: "M3",
          quantity: "250.00",
          produced: "0.000",
          minimumQuantity: "0.000",
          maximumQuantity: "1234.000",
          hasProductions: false,
        },
      ],
      employeeAssignments: [],
      machineAssignments: [],
      mobilizationRecorded: false,
      planningEligibility: { isValid: true, blockers: [] },
      eligibility: {
        canStart: false,
        blockers: ["Inicie a obra antes de preparar esta frente."],
      },
    };
    const initialProject = { ...projectSnapshot, workFronts: [firstFront] };
    const { rerender } = renderProjectDetail(initialProject);

    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    expect(screen.queryByLabelText("Iniciar com a obra")).toBeNull();

    const secondFront = {
      ...firstFront,
      id: "00000000-0000-4000-8000-000000000912",
      name: "Frente sul",
    };
    rerender(
      projectDetailElement({
        ...initialProject,
        workFronts: [firstFront, secondFront],
      }),
    );

    await waitFor(() => expect(screen.getByText("Frente sul")).toBeTruthy());
    expect(
      screen
        .getByRole("tab", { name: /Frentes/u })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("edits requirements and quantities using the front's own balance", async () => {
    const updateFront = vi.mocked(updateProjectWorkFrontAction);
    const front: ProjectDetailSnapshot["workFronts"][number] = {
      id: "00000000-0000-4000-8000-000000000913",
      name: "Frente norte",
      location: "Trecho A",
      notes: null,
      plannedStartDate: null,
      plannedEndDate: null,
      requiresEmployees: true,
      requiresMachines: true,
      status: "planned",
      actualStartedAt: null,
      services: [
        {
          serviceCode: "cut",
          unitCode: "M3",
          quantity: "250.00",
          produced: "0.000",
          minimumQuantity: "0.000",
          maximumQuantity: "1234.000",
          hasProductions: false,
        },
      ],
      employeeAssignments: [],
      machineAssignments: [],
      mobilizationRecorded: false,
      planningEligibility: { isValid: true, blockers: [] },
      eligibility: {
        canStart: false,
        blockers: ["Inicie a obra antes de preparar esta frente."],
      },
    };
    const projectWithFront: ProjectDetailSnapshot = {
      ...projectSnapshot,
      quantityBaseline: {
        ...projectSnapshot.quantityBaseline,
        items: [
          {
            serviceCode: "cut",
            unitCode: "M3",
            total: "1234.00",
            allocated: "250.00",
            unallocated: "984.00",
            produced: "0.000",
          },
        ],
      },
      workFronts: [front],
    };
    updateFront.mockResolvedValue({
      kind: "success",
      project: projectWithFront,
    });
    const user = userEvent.setup();

    renderProjectDetail(projectWithFront);
    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    await user.click(screen.getByRole("button", { name: "Editar frente" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText(/máximo: 1.234,000 M3/u)).toBeTruthy();
    await user.click(
      within(modal).getByRole("checkbox", {
        name: "Exige máquinas mobilizadas",
      }),
    );
    const quantity = within(modal).getByLabelText("Quantidade para Corte");
    await user.clear(quantity);
    await user.type(quantity, "1200000");
    await user.click(
      within(modal).getByRole("button", { name: "Salvar frente" }),
    );

    await waitFor(() =>
      expect(updateFront).toHaveBeenCalledWith(projectSnapshot.id, front.id, {
        name: "Frente norte",
        location: "Trecho A",
        notes: null,
        plannedStartDate: null,
        plannedEndDate: null,
        requiresEmployees: true,
        requiresMachines: false,
        services: [
          { serviceCode: "cut", unitCode: "M3", quantity: "1200.000" },
        ],
      }),
    );
  });
});

describe("Project active work-front mobilization", () => {
  const employee = {
    id: "00000000-0000-4000-8000-000000000921",
    name: "Operador João",
    jobRole: "Operador",
    isActive: true,
  };
  const machine = {
    id: "00000000-0000-4000-8000-000000000922",
    name: "Escavadeira 01",
    meterType: "hour_meter",
    identifier: null,
    isActive: true,
  };
  const frontId = "00000000-0000-4000-8000-000000000923";
  const activeProject: ProjectDetailSnapshot = {
    ...projectSnapshot,
    status: "active",
    actualStartedAt: "2026-07-20T12:00:00.000Z",
    employeeAllocations: [
      {
        id: "00000000-0000-4000-8000-000000000924",
        employment: employee,
        shift: "day",
        jobRole: "Operador",
        monthlyWorkloadHours: 220,
        compensationMode: "monthly",
        compensationValue: "5000.00",
        overtimeRate: "30.00",
        effectiveFrom: "2026-07-20T12:00:00.000Z",
      },
    ],
    machineAllocations: [
      {
        id: "00000000-0000-4000-8000-000000000925",
        machine,
        operator: employee,
        operatorAssignments: [
          {
            id: "00000000-0000-4000-8000-000000000927",
            shift: "day",
            operator: employee,
            effectiveFrom: "2026-07-20T12:00:00.000Z",
          },
        ],
        startMeterReading: {
          id: "00000000-0000-4000-8000-000000000926",
          value: "10.00",
        },
        effectiveFrom: "2026-07-20T12:00:00.000Z",
      },
    ],
    workFronts: [
      {
        id: frontId,
        name: "Frente operacional",
        location: "Trecho A",
        notes: null,
        plannedStartDate: null,
        plannedEndDate: null,
        requiresEmployees: true,
        requiresMachines: true,
        status: "planned",
        actualStartedAt: null,
        services: [
          {
            serviceCode: "cut",
            unitCode: "M3",
            quantity: "100.00",
            produced: "0.000",
            minimumQuantity: "0.000",
            maximumQuantity: "1234.000",
            hasProductions: false,
          },
        ],
        employeeAssignments: [],
        machineAssignments: [],
        mobilizationRecorded: false,
        planningEligibility: { isValid: true, blockers: [] },
        eligibility: {
          canStart: false,
          blockers: [
            "Mobilize ao menos uma pessoa nesta frente.",
            "Mobilize ao menos uma máquina nesta frente.",
          ],
        },
      },
    ],
  };

  it("keeps planning available and edits only an active front distribution", async () => {
    const saveServices = vi.mocked(saveProjectWorkFrontServicesAction);
    const projectWithProduction: ProjectDetailSnapshot = {
      ...activeProject,
      quantityBaseline: {
        ...activeProject.quantityBaseline,
        items: activeProject.quantityBaseline.items.map((item) => ({
          ...item,
          produced: "6.000",
        })),
      },
      workFronts: activeProject.workFronts.map((front) => ({
        ...front,
        status: "active" as const,
        actualStartedAt: "2026-07-20T13:00:00.000Z",
        services: front.services.map((service) => ({
          ...service,
          quantity: "12.000",
          produced: "6.000",
          minimumQuantity: "6.000",
          maximumQuantity: "1234.000",
          hasProductions: true,
        })),
      })),
    };
    saveServices.mockResolvedValue({
      kind: "success",
      project: projectWithProduction,
    });
    const user = userEvent.setup();

    renderProjectDetail(projectWithProduction);
    expect(screen.getByRole("tab", { name: /Planejamento/u })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    await user.click(
      screen.getByRole("button", { name: "Editar distribuição" }),
    );
    const modal = screen.getByRole("dialog");
    expect(
      (within(modal).getByLabelText("Nome da frente") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    const quantity = within(modal).getByLabelText("Quantidade para Corte");
    await user.clear(quantity);
    await user.type(quantity, "5999");
    expect(
      within(modal).getByText("Quantitativo abaixo do produzido."),
    ).toBeTruthy();
    expect(
      (
        within(modal).getByRole("button", {
          name: "Salvar distribuição",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.clear(quantity);
    await user.type(quantity, "6000");
    await user.click(
      within(modal).getByRole("button", { name: "Salvar distribuição" }),
    );

    await waitFor(() =>
      expect(saveServices).toHaveBeenCalledWith(
        projectWithProduction.id,
        frontId,
        {
          services: [{ serviceCode: "cut", unitCode: "M3", quantity: "6.000" }],
        },
      ),
    );
    expect(updateProjectWorkFrontAction).not.toHaveBeenCalled();
  });

  it("prepares a front separately and includes the machine operator", async () => {
    const saveMobilization = vi.mocked(saveProjectWorkFrontMobilizationAction);
    saveMobilization.mockResolvedValue({
      kind: "success",
      project: activeProject,
    });
    const user = userEvent.setup();

    renderProjectDetail(activeProject);
    await user.click(screen.getByRole("tab", { name: /Frentes/u }));
    expect(screen.queryByText("Iniciar com a obra")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Preparar mobilização" }),
    );
    const modal = screen.getByRole("dialog");
    const machineCheckbox = within(modal).getByRole("checkbox", {
      name: /Escavadeira 01/u,
    });
    await user.click(machineCheckbox);
    const operatorCheckbox = within(modal)
      .getAllByRole("checkbox", { name: /Operador João/u })
      .find((checkbox) => (checkbox as HTMLInputElement).disabled) as
      | HTMLInputElement
      | undefined;
    expect(operatorCheckbox).toBeDefined();
    if (!operatorCheckbox) {
      throw new Error("Operator checkbox was not auto-selected");
    }
    expect(operatorCheckbox.checked).toBe(true);
    expect(operatorCheckbox.disabled).toBe(true);
    await user.click(
      within(modal).getByRole("button", { name: "Salvar mobilização" }),
    );

    await waitFor(() =>
      expect(saveMobilization).toHaveBeenCalledWith(activeProject.id, frontId, {
        employmentIds: [],
        machineAssignments: [{ machineId: machine.id, shift: "day" }],
      }),
    );
  });

  it("loads the auditable mobilization history", async () => {
    const getHistory = vi.mocked(getProjectMobilizationHistoryAction);
    getHistory.mockResolvedValue({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000927",
          layer: "project",
          resourceType: "employee",
          resource: { id: employee.id, name: employee.name },
          source: null,
          effectiveFrom: "2026-07-20T12:00:00.000Z",
          effectiveTo: null,
          createdBy: { id: employee.id, email: "admin@example.com" },
          endedBy: null,
          endedReason: null,
        },
      ],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    const user = userEvent.setup();

    renderProjectDetail(activeProject);
    await user.click(screen.getByRole("tab", { name: /Equipe/u }));
    await user.click(screen.getByRole("button", { name: "Histórico" }));

    const historyModal = await screen.findByRole("dialog", {
      name: /Histórico de mobilização/u,
    });
    expect(within(historyModal).getByText("Operador João")).toBeTruthy();
    expect(getHistory).toHaveBeenCalledWith({
      projectId: activeProject.id,
      resourceType: "employee",
      frontId: undefined,
      cursor: undefined,
    });
  });
});

describe("Project detail readiness tabs", () => {
  it("confirms before removing the selected fuel offer", async () => {
    const projectWithFuel: ProjectDetailSnapshot = {
      ...projectSnapshot,
      fuelOffers: [fuelOfferSnapshot],
    };
    const saveReadiness = vi.mocked(saveProjectReadinessAction);
    saveReadiness.mockResolvedValue({
      kind: "success",
      project: { ...projectWithFuel, fuelOffers: [] },
    });
    const user = userEvent.setup();

    renderProjectDetail(projectWithFuel);

    await user.click(screen.getByRole("tab", { name: /Combustível/u }));
    await user.click(screen.getByRole("button", { name: /Editar oferta/u }));
    await user.click(screen.getByRole("button", { name: /Remover oferta/u }));

    expect(saveReadiness).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", {
      name: /Remover oferta de combustível/u,
    });
    await user.click(
      within(dialog).getByRole("button", { name: /Remover oferta/u }),
    );

    await waitFor(() =>
      expect(saveReadiness).toHaveBeenCalledWith(projectWithFuel.id, {
        fuelOffers: [],
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Nenhum combustível confirmado.")).toBeTruthy(),
    );
  });

  it("confirms before removing a supplied item offer", async () => {
    const projectWithMaterial: ProjectDetailSnapshot = {
      ...projectSnapshot,
      supplierOffers: [materialOfferSnapshot],
    };
    const saveReadiness = vi.mocked(saveProjectReadinessAction);
    saveReadiness.mockResolvedValue({
      kind: "success",
      project: { ...projectWithMaterial, supplierOffers: [] },
    });
    const user = userEvent.setup();

    renderProjectDetail(projectWithMaterial);

    await user.click(screen.getByRole("tab", { name: /Itens/u }));
    await user.click(screen.getByRole("button", { name: /Editar/u }));
    await user.click(screen.getByRole("button", { name: /^Remover$/u }));

    expect(saveReadiness).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", {
      name: /Remover esta oferta/u,
    });
    await user.click(
      within(dialog).getByRole("button", { name: /Remover oferta/u }),
    );

    await waitFor(() =>
      expect(saveReadiness).toHaveBeenCalledWith(projectWithMaterial.id, {
        materialOffers: [],
      }),
    );
  });

  it("saves payment rules from intuitive selectors", async () => {
    const projectWithTeam: ProjectDetailSnapshot = {
      ...projectSnapshot,
      employeeAllocations: [
        {
          id: "allocation-daily",
          employment: {
            id: "employee-daily",
            name: "Operador diária",
            jobRole: null,
            isActive: true,
          },
          jobRole: "Operador",
          shift: "day",
          monthlyWorkloadHours: 220,
          compensationMode: "daily",
          compensationValue: "200.00",
          overtimeRate: "25.00",
          effectiveFrom: "2026-07-16T00:00:00.000Z",
        },
        {
          id: "allocation-weekly",
          employment: {
            id: "employee-weekly",
            name: "Operador semanal",
            jobRole: null,
            isActive: true,
          },
          jobRole: "Operador",
          shift: "day",
          monthlyWorkloadHours: 220,
          compensationMode: "weekly",
          compensationValue: "1000.00",
          overtimeRate: "25.00",
          effectiveFrom: "2026-07-16T00:00:00.000Z",
        },
        {
          id: "allocation-fortnightly",
          employment: {
            id: "employee-fortnightly",
            name: "Operador quinzenal",
            jobRole: null,
            isActive: true,
          },
          jobRole: "Operador",
          shift: "day",
          monthlyWorkloadHours: 180,
          compensationMode: "fortnightly",
          compensationValue: "2000.00",
          overtimeRate: "25.00",
          effectiveFrom: "2026-07-16T00:00:00.000Z",
        },
        {
          id: "allocation-monthly",
          employment: {
            id: "employee-monthly",
            name: "Operador mensal",
            jobRole: null,
            isActive: true,
          },
          jobRole: "Operador",
          shift: "day",
          monthlyWorkloadHours: 180,
          compensationMode: "monthly",
          compensationValue: "4000.00",
          overtimeRate: "25.00",
          effectiveFrom: "2026-07-16T00:00:00.000Z",
        },
      ],
    };
    const compensationPaymentTerms = [
      { compensationMode: "daily" as const, daysAfterPeriodEnd: 1 },
      { compensationMode: "weekly" as const, daysAfterPeriodEnd: 5 },
      { compensationMode: "fortnightly" as const, daysAfterPeriodEnd: 3 },
      { compensationMode: "monthly" as const, daysAfterPeriodEnd: 10 },
    ];
    const saveReadiness = vi.mocked(saveProjectReadinessAction);
    saveReadiness.mockResolvedValue({
      kind: "success",
      project: { ...projectWithTeam, compensationPaymentTerms },
    });
    const user = userEvent.setup();

    renderProjectDetail(projectWithTeam);

    await user.click(screen.getByRole("tab", { name: /Pagamentos/u }));
    await user.click(screen.getByRole("button", { name: /Editar/u }));
    await user.selectOptions(screen.getByLabelText(/Diária/u), "1");
    await user.selectOptions(screen.getByLabelText(/Semanal/u), "5");
    await user.selectOptions(screen.getByLabelText(/Quinzenal/u), "3");
    await user.selectOptions(screen.getByLabelText(/Mensal/u), "10");
    await user.click(
      screen.getByRole("button", { name: /Salvar pagamentos/u }),
    );

    await waitFor(() =>
      expect(saveReadiness).toHaveBeenCalledWith(projectWithTeam.id, {
        compensationPaymentTerms,
      }),
    );
    expect(screen.getByText(/No próximo dia útil/u)).toBeTruthy();
    expect(screen.getByText(/Sexta-feira/u)).toBeTruthy();
    expect(screen.getByText(/Quarta-feira/u)).toBeTruthy();
    expect(screen.getByText(/10º dia útil do mês/u)).toBeTruthy();
  });
});

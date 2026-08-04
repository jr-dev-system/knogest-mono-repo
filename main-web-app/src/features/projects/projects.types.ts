export type ProjectLifecycleStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type ProductionMetricCode = "cut" | "fill" | "finishing" | "top_soil";
export type EarthworksServiceCode =
  | ProductionMetricCode
  | "unsuitable_soil_removal"
  | "replacement_fill";

export type CompensationMode =
  | "daily"
  | "hourly"
  | "weekly"
  | "fortnightly"
  | "monthly";

export type FuelSupplierOption = {
  id: string;
  name: string;
  tradeName: string | null;
  document: { documentType: string; maskedDocument: string };
  isActive?: boolean;
};

export type ProjectEmployeeSummary = {
  id: string;
  name: string;
  jobRole: string | null;
  isActive: boolean;
};

export type ProjectOfferSnapshot = {
  id: string;
  usageKind?: "fuel" | "material";
  sourceOfferId: string | null;
  sourceOfferIsActive?: boolean;
  supplier: FuelSupplierOption | null;
  item: { id: string; name: string; isActive: boolean } | null;
  purchaseUnit: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  } | null;
  conversionToBase: string;
  price: string;
  effectiveFrom: string;
};

export type ProjectDetailSnapshot = {
  id: string;
  name: string;
  address: {
    formatted: string;
    postalCode: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  };
  latitude: string | null;
  longitude: string | null;
  contractNumber: string | null;
  status: ProjectLifecycleStatus;
  actualStartedAt: string | null;
  createdAt: string;
  baseline: {
    approvedBudget: string;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    effectiveFrom: string;
  } | null;
  client: {
    id: string;
    name: string;
    document: { documentType: string; maskedDocument: string };
    isActive: boolean;
  } | null;
  manager: ProjectEmployeeSummary | null;
  technicalResponsibilities: ProjectEmployeeSummary[];
  schedule: {
    shifts: ("day" | "night")[];
    days: {
      shift: "day" | "night";
      dayOfWeek: number;
      isWorking: boolean;
      startTime: string | null;
      endTime: string | null;
      endDayOffset: number;
    }[];
    breakTemplates: {
      id: string;
      shift: "day" | "night";
      name: string;
      durationMinutes: number;
    }[];
  };
  employeeAllocations: {
    id: string;
    employment: ProjectEmployeeSummary | null;
    shift: "day" | "night";
    jobRole: string;
    monthlyWorkloadHours: number;
    compensationMode: CompensationMode;
    compensationValue: string;
    overtimeRate: string;
    effectiveFrom: string;
  }[];
  machineAllocations: {
    id: string;
    machine: {
      id: string;
      name: string;
      meterType: string;
      identifier: { kind: string; value: string } | null;
      isActive: boolean;
    } | null;
    operator: ProjectEmployeeSummary | null;
    operatorAssignments: {
      id: string;
      shift: "day" | "night";
      operator: ProjectEmployeeSummary | null;
      effectiveFrom: string;
    }[];
    startMeterReading: { id: string; value: string } | null;
    effectiveFrom: string;
  }[];
  fuelOffers: ProjectOfferSnapshot[];
  supplierOffers: ProjectOfferSnapshot[];
  productionMetricTargets: {
    metricCode: ProductionMetricCode;
    targetTotal: string;
  }[];
  quantityBaseline: {
    revision: number | null;
    createdAt: string | null;
    reason: string | null;
    items: {
      serviceCode: EarthworksServiceCode;
      unitCode: "M3" | "M2" | "M3_KM";
      total: string;
      allocated: string;
      unallocated: string;
      produced: string;
    }[];
  };
  workFronts: {
    id: string;
    name: string;
    location: string | null;
    notes: string | null;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    requiresEmployees: boolean;
    requiresMachines: boolean;
    status: "planned" | "active" | "paused" | "completed" | "cancelled";
    actualStartedAt: string | null;
    services: {
      serviceCode: EarthworksServiceCode;
      unitCode: "M3" | "M2" | "M3_KM";
      quantity: string;
      produced: string;
      minimumQuantity: string;
      maximumQuantity: string;
      hasProductions: boolean;
    }[];
    employeeAssignments: {
      id: string;
      shift: "day" | "night";
      source: "direct" | "machine_operator" | "both";
      employment: ProjectEmployeeSummary | null;
      effectiveFrom: string;
    }[];
    machineAssignments: {
      id: string;
      shift: "day" | "night";
      machine: {
        id: string;
        name: string;
        meterType: string;
        identifier: { kind: string; value: string } | null;
        isActive: boolean;
      } | null;
      operator: ProjectEmployeeSummary | null;
      effectiveFrom: string;
    }[];
    mobilizationRecorded: boolean;
    planningEligibility: { isValid: boolean; blockers: string[] };
    eligibility: { canStart: boolean; blockers: string[] };
  }[];
  compensationPaymentTerms: {
    compensationMode: CompensationMode;
    daysAfterPeriodEnd: number;
  }[];
  readiness: {
    canActivate: boolean;
    blockers: {
      section:
        | "dates"
        | "metrics"
        | "fronts"
        | "fuel"
        | "items"
        | "equipment"
        | "team"
        | "payments";
      message: string;
    }[];
  };
};

export type ProjectMobilizationHistoryItem = {
  id: string;
  layer: "project" | "front";
  resourceType: "employee" | "machine";
  resource: { id: string; name: string };
  source: "direct" | "machine_operator" | "both" | null;
  operatorEmploymentId?: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: { id: string; email: string } | null;
  endedBy: { id: string; email: string } | null;
  endedReason: string | null;
};

export type ProjectMobilizationHistoryPage = {
  data: ProjectMobilizationHistoryItem[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type ProjectOption = {
  id: string;
  label: string;
  detail?: string | null;
  readingId?: string | null;
  jobRolePeriodId?: string | null;
  jobRoleId?: string | null;
  available?: boolean;
};

export type SupplierOfferOption = {
  id: string;
  supplier: FuelSupplierOption;
  item: { id: string; name: string; baseUnitId: string };
  purchaseUnit: { id: string; code: string; name: string };
  conversionToBase: string;
  currentPrice: { price: string; effectiveFrom: string };
  kind: "fuel" | "material";
};

export type SuppliedItemCategoryOption = {
  id: string;
  name: string;
  parentId: string | null;
  systemKey?: string | null;
  kind: "fuel" | "material";
};

export type SuppliedItemSelectorOption = {
  id: string;
  name: string;
  baseUnitId: string;
  categoryId: string | null;
  categoryPath: string[];
  activeSupplierCount: number;
  kind: "fuel" | "material";
};

export type SuppliedItemSelectorPage = {
  data: SuppliedItemSelectorOption[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type ProjectSuppliedItemOfferOption = {
  id: string;
  supplier: FuelSupplierOption;
  baseUnit: { id: string; code: string; name: string } | null;
  purchaseUnit: { id: string; code: string; name: string } | null;
  conversionToBase: string;
  currentPrice: { id: string; price: string; effectiveFrom: string } | null;
};

export type ProjectSuppliedItemOffersPage = {
  data: ProjectSuppliedItemOfferOption[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type ProjectReadinessOptions = {
  clients: ProjectOption[];
  employees: ProjectOption[];
  machines: ProjectOption[];
  jobRoles: ProjectOption[];
  suppliers: FuelSupplierOption[];
  suppliedItems: {
    id: string;
    name: string;
    baseUnitId: string;
    categoryId?: string | null;
    kind: "fuel" | "material";
  }[];
  suppliedItemCategories: SuppliedItemCategoryOption[];
  measurementUnits: { id: string; code: string; name: string }[];
  supplierOffers: SupplierOfferOption[];
};

export type ProjectTeamCandidatesPage =
  GetApiV1ProjectsProjectidTeamCandidatesQueryResponse["data"];
export type ProjectTeamCandidate = ProjectTeamCandidatesPage["data"][number];

export type ProjectTeamMembersPage =
  GetApiV1ProjectsProjectidTeamMembersQueryResponse["data"];
export type ProjectTeamMember = ProjectTeamMembersPage["data"][number];

export type ProjectWorkFrontMobilizationOptionsPage =
  GetApiV1ProjectsProjectidFrontsFrontidMobilizationOptionsQueryResponse["data"];
export type ProjectWorkFrontMobilizationOption =
  ProjectWorkFrontMobilizationOptionsPage["data"][number];

export type ProjectRegistryPage = {
  data: {
    id: string;
    name: string;
    contractNumber: string | null;
    status: ProjectLifecycleStatus;
    actualStartedAt: string | null;
    createdAt: string;
  }[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};
import type { GetApiV1ProjectsProjectidTeamCandidatesQueryResponse } from "@/generated/models/GetApiV1ProjectsProjectidTeamCandidates";
import type { GetApiV1ProjectsProjectidTeamMembersQueryResponse } from "@/generated/models/GetApiV1ProjectsProjectidTeamMembers";
import type { GetApiV1ProjectsProjectidFrontsFrontidMobilizationOptionsQueryResponse } from "@/generated/models/GetApiV1ProjectsProjectidFrontsFrontidMobilizationOptions";

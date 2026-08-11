import type { GetApiV1ProjectsProjectidProductionsQueryResponse } from "@/generated/models/GetApiV1ProjectsProjectidProductions";
import type { PostApiV1ProjectsProjectidProductionsMutationRequest } from "@/generated/models/PostApiV1ProjectsProjectidProductions";

export type ProjectProductionsPage =
  GetApiV1ProjectsProjectidProductionsQueryResponse["data"];
export type ProjectProductionSummary = ProjectProductionsPage["data"][number];
export type ProjectProductionCommand =
  PostApiV1ProjectsProjectidProductionsMutationRequest;

export type ProjectProductionOptions = {
  project: { id: string; name: string; status: string };
  defaults: { productionDate: string; shift: "day" | "night" };
  dateLimits: { minimum: string; maximum: string; timeZone: string };
  capabilities: ProjectProductionsPage["capabilities"];
  responsibleOptions: Array<{ id: string; name: string; jobRole: string }>;
  workFronts: Array<{
    id: string;
    name: string;
    location: string | null;
    services: Array<{
      id: string;
      serviceCode: string;
      unitCode: string;
      quantity: string;
      productionProfile: string;
      dmtPolicy: "not_applicable" | "optional" | "required";
    }>;
    equipment: Array<{
      id: string;
      name: string;
      manufacturer: string;
      model: string;
      meterType: "hour_meter" | "odometer";
      identifier: string | null;
      machineType: "yellow_line" | "white_line";
      loadVolumeM3: string | null;
      maxSupportedWeightT: string | null;
      operator: { id: string; name: string };
    }>;
    trucks: Array<{
      id: string;
      name: string;
      manufacturer: string;
      model: string;
      meterType: "hour_meter" | "odometer";
      identifier: string | null;
      nominalCapacity: string;
      effectiveCapacity: string;
      capacityUnitCode: string;
      maxSupportedWeightT: string | null;
      driver: { id: string; name: string };
    }>;
  }>;
};

export type ProjectProductionDetail = {
  id: string;
  projectId: string;
  kind: "individual_activity" | "material_movement";
  workFrontId: string;
  workFrontServiceId: string;
  serviceCode: string;
  unitCode: string;
  productionProfile: string;
  dmtPolicy: "not_applicable" | "optional" | "required";
  productionDate: string;
  shift: "day" | "night";
  status:
    | "draft"
    | "submitted"
    | "field_checked"
    | "awaiting_technical"
    | "approved"
    | "rejected"
    | "released"
    | "measured";
  entryMode: "direct_total" | "truck_summary" | "trips";
  revision: number;
  operationalRevision: number;
  startTime: string | null;
  endTime: string | null;
  endDayOffset: number;
  responsible: { employmentId: string; name: string | null } | null;
  location: string | null;
  startStation: string | null;
  endStation: string | null;
  layer: string | null;
  elevation: string | null;
  materialName: string | null;
  materialCategory: string | null;
  volumeCondition: "bank" | "loose" | "compacted" | "placed" | null;
  directQuantity: string | null;
  measuredQuantity: string | null;
  conversionFactor: string | null;
  origin: string | null;
  destination: string | null;
  dmtKm: string | null;
  layerThicknessCm: string | null;
  compactionPasses: number | null;
  moistureCondition: string | null;
  evidence: Array<{
    kind: "photo" | "ticket" | "attachment";
    name: string;
    url: string;
    notes: string | null;
  }>;
  notes: string | null;
  individualActivity: {
    quantityMethod: "manual" | "topography" | "laboratory";
    exceptionalFromMovement: boolean;
    exceptionReason: string | null;
  } | null;
  materialMovement: {
    materialRevisionId: string | null;
    routeRevisionId: string | null;
    origin: string;
    destination: string;
    layer: string | null;
    materialSnapshot: Record<string, unknown>;
    routeSnapshot: Record<string, unknown>;
  } | null;
  components: Array<{
    id: string;
    workFrontId: string;
    workFrontServiceId: string;
    type: string;
    serviceCode: string;
    unitCode: string;
    volumeCondition: string | null;
    quantities: Array<{
      id: string;
      kind:
        | "operational"
        | "estimated"
        | "technically_accepted"
        | "contract_measured";
      method: string;
      value: string;
      unitCode: string;
      volumeCondition: string | null;
      sourceSnapshot: Record<string, unknown>;
    }>;
  }>;
  truckSummaries: Array<{
    id: string;
    machineId: string;
    machineName: string;
    identifier: string | null;
    driver: { employmentId: string; name: string | null } | null;
    effectiveCapacity: string;
    capacityUnitCode: string;
    acceptedTrips: number;
    rejectedTrips: number;
    partialTripCount: number;
    partialVolume: string;
    actualWeightT: string | null;
    loadFactor: string;
    averageCycleMinutes: number | null;
    occurrenceNotes: string | null;
    calculatedVolume: string;
  }>;
  qualityChecks: Array<{
    id: string;
    type: string;
    status: "pending" | "accepted" | "rejected";
    value: string | null;
    unitCode: string | null;
    notes: string | null;
    evidence: ProjectProductionDetail["evidence"];
    actorUserId: string;
    createdAt: string;
  }>;
  approvalHistory: Array<{
    id: string;
    revision: number;
    phase: string;
    decision: string;
    reason: string | null;
    actorUserId: string;
    createdAt: string;
  }>;
  metrics: {
    operationalVolumeM3: string;
    officialQuantity: string;
    difference: string | null;
    differencePercent: string | null;
    tripCount: number;
    tripsPerHour: string | null;
    quantityPerHour: string | null;
    dmtKm: string | null;
    transportMomentM3Km: string | null;
    workedMinutes: number;
    stoppedMinutes: number;
  };
  equipment: Array<{
    id: string;
    machineId: string;
    name: string;
    manufacturer: string;
    model: string;
    identifier: string | null;
    meterType: "hour_meter" | "odometer";
    role: ProjectProductionEquipmentRole;
    operator: { employmentId: string; name: string | null } | null;
    initialMeterValue: string | null;
    finalMeterValue: string | null;
    workedMinutes: number | null;
    defaultTripCapacityM3: string | null;
    stoppedMinutes: number;
    stops: Array<{
      id: string;
      durationMinutes: number;
      reason: string;
      notes: string | null;
    }>;
    tripCount: number;
    tripVolumeM3: string;
  }>;
  trips: Array<{
    id: string;
    productionEquipmentId: string;
    idempotencyKey: string;
    recordedAt: string;
    capacityM3: string;
    adjustedVolumeM3: string | null;
    ticketNumber: string | null;
    notes: string | null;
  }>;
  approval: {
    approvedByUserId: string | null;
    approvedAt: string | null;
    direct: boolean;
  };
  rdo: { linked: boolean; stale: boolean };
  lastReopenReason: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectProductionEquipmentRole =
  | "excavation"
  | "loading"
  | "transport"
  | "spreading"
  | "grading"
  | "compaction"
  | "watering"
  | "support";

export type ProjectProductionMutationResult =
  | { kind: "success"; production: ProjectProductionDetail }
  | {
      kind: "failure";
      code: string;
      message: string;
      requestId?: string;
      details?: Record<string, unknown>;
    };

export type ProjectDailyReportProductionSummary = {
  reportId: string;
  productions: Array<
    ProjectProductionSummary & {
      selected: boolean;
      confirmedRevision: number | null;
      confirmedOperationalRevision: number | null;
      stale: boolean;
      qualityPending: boolean;
    }
  >;
  groups: Array<{
    serviceCode: string;
    unitCode: string;
    volumeCondition: string | null;
    origin: string | null;
    destination: string | null;
    officialQuantity: string;
    operationalVolumeM3: string;
    tripCount: number;
    transportMomentM3Km: string;
    weightedDmtKm: string | null;
  }>;
  hasDrafts: boolean;
  hasPendingQuality: boolean;
  needsReconfirmation: boolean;
};

export type EarthworkCatalogPage<T> = {
  data: T[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type EarthworkMaterialOption = {
  id: string;
  code: string;
  name: string;
  classification: string | null;
  category: string | null;
  isActive: boolean;
  revision: {
    id: string;
    revision: number;
    densityTPerM3: string | null;
    swellFactor: string | null;
    looseToCompactedFactor: string | null;
  } | null;
};

export type HaulRouteOption = {
  id: string;
  code: string;
  name: string;
  origin: string;
  destination: string;
  isActive: boolean;
  revision: {
    id: string;
    revision: number;
    loadedDistanceKm: string;
    emptyReturnDistanceKm: string | null;
    contractualDmtKm: string | null;
    contractualBand: string | null;
  } | null;
};

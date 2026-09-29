import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().date();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u);
const positiveDecimal = z
  .string()
  .regex(/^(?=[0-9.]*[1-9])(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u);

export const productionParamsSchema = z
  .object({
    projectId: uuid,
    productionId: uuid.optional(),
    tripId: uuid.optional(),
    reportId: uuid.optional(),
  })
  .strict();

export const productionListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
    productionDate: date.optional(),
    shift: z.enum(["day", "night"]).optional(),
    status: z
      .enum([
        "draft",
        "submitted",
        "field_checked",
        "awaiting_technical",
        "approved",
        "rejected",
        "released",
        "measured",
      ])
      .optional(),
    kind: z.enum(["individual_activity", "material_movement"]).optional(),
    workFrontId: uuid.optional(),
    sortBy: z.literal("productionDate").default("productionDate"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const productionOptionsQuerySchema = z
  .object({
    productionDate: date,
    shift: z.enum(["day", "night"]),
  })
  .strict();

export const productionHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
    sortBy: z.literal("revision").default("revision"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

const stopSchema = z
  .object({
    durationMinutes: z.number().int().min(1).max(1440),
    reason: z.string().trim().min(1).max(160),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

const equipmentSchema = z
  .object({
    machineId: uuid,
    role: z.enum([
      "excavation",
      "loading",
      "transport",
      "spreading",
      "grading",
      "compaction",
      "watering",
      "support",
    ]),
    operatorEmploymentId: uuid.nullable().default(null),
    initialMeterValue: decimal.nullable().default(null),
    finalMeterValue: decimal.nullable().default(null),
    workedMinutes: z.number().int().min(0).max(1440).nullable().default(null),
    productiveMinutes: z
      .number()
      .int()
      .min(0)
      .max(1440)
      .nullable()
      .default(null),
    waitingMinutes: z.number().int().min(0).max(1440).nullable().default(null),
    stoppedMinutes: z.number().int().min(0).max(1440).nullable().default(null),
    defaultTripCapacityM3: positiveDecimal.nullable().default(null),
    stops: z.array(stopSchema).max(20).default([]),
  })
  .strict();

const evidenceSchema = z
  .object({
    kind: z.enum(["photo", "ticket", "attachment"]),
    name: z.string().trim().min(1).max(160),
    url: z.string().url().max(2_000),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

const productionCommandBase = z.object({
  expectedRevision: z.number().int().positive().optional(),
  submitNow: z.boolean().default(false),
  approveNow: z.boolean().default(false),
  productionDate: date,
  shift: z.enum(["day", "night"]),
  startTime: time.nullable().default(null),
  endTime: time.nullable().default(null),
  endDayOffset: z.number().int().min(0).max(1).default(0),
  responsibleEmploymentId: uuid.nullable().default(null),
  evidence: z.array(evidenceSchema).max(20).default([]),
  notes: z.string().trim().max(10_000).nullable().default(null),
  equipment: z.array(equipmentSchema).max(100).default([]),
});

const volumeConditionSchema = z
  .enum(["bank", "loose", "compacted", "placed"])
  .nullable()
  .default(null);

const individualActivitySchema = z
  .object({
    workFrontId: uuid,
    workFrontServiceId: uuid,
    quantityMethod: z
      .enum(["manual", "topography", "laboratory"])
      .default("manual"),
    location: z.string().trim().max(240).nullable().default(null),
    startStation: z.string().trim().max(80).nullable().default(null),
    endStation: z.string().trim().max(80).nullable().default(null),
    layer: z.string().trim().max(80).nullable().default(null),
    elevation: z.string().trim().max(80).nullable().default(null),
    materialName: z.string().trim().max(160).nullable().default(null),
    materialCategory: z.string().trim().max(120).nullable().default(null),
    volumeCondition: volumeConditionSchema,
    operationalQuantity: decimal.nullable().default(null),
    dmtKm: decimal.nullable().default(null),
    swellFactor: positiveDecimal.nullable().default(null),
    conversionFactor: positiveDecimal.nullable().default(null),
    layerThicknessCm: decimal.nullable().default(null),
    compactionPasses: z.number().int().min(0).max(100).nullable().default(null),
    moistureCondition: z.string().trim().max(120).nullable().default(null),
    exceptionalFromMovement: z.boolean().default(false),
    exceptionReason: z.string().trim().min(3).max(500).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.exceptionalFromMovement && !value.exceptionReason)
      context.addIssue({
        code: "custom",
        path: ["exceptionReason"],
        message: "An exception reason is required",
      });
  });

const movementComponentSchema = z
  .object({
    workFrontId: uuid,
    workFrontServiceId: uuid,
    type: z.enum([
      "cut",
      "loading",
      "transport",
      "unloading",
      "spreading",
      "compaction",
      "fill",
      "finishing",
    ]),
    operationalQuantity: decimal.nullable().default(null),
    unitCode: z.string().trim().min(1).max(32),
    volumeCondition: volumeConditionSchema,
  })
  .strict();

const materialMovementSchema = z
  .object({
    workFrontId: uuid,
    workFrontServiceId: uuid,
    destinationWorkFrontId: uuid,
    materialRevisionId: uuid.nullable().default(null),
    routeRevisionId: uuid.nullable().default(null),
    materialName: z.string().trim().min(1).max(160).nullable().default(null),
    materialCategory: z.string().trim().max(120).nullable().default(null),
    densityTPerM3: positiveDecimal.nullable().default(null),
    swellFactor: positiveDecimal.nullable().default(null),
    looseToCompactedFactor: positiveDecimal.nullable().default(null),
    origin: z.string().trim().min(1).max(240).nullable().default(null),
    destination: z.string().trim().min(1).max(240).nullable().default(null),
    dmtKm: decimal,
    contractualDmtKm: decimal.nullable().default(null),
    contractualBand: z.string().trim().max(80).nullable().default(null),
    layer: z.string().trim().max(80).nullable().default(null),
    volumeCondition: volumeConditionSchema.default("loose"),
    layerThicknessCm: decimal.nullable().default(null),
    compactionPasses: z.number().int().min(0).max(100).nullable().default(null),
    moistureCondition: z.string().trim().max(120).nullable().default(null),
    components: z.array(movementComponentSchema).min(1).max(12),
  })
  .strict();

const truckSummarySchema = z
  .object({
    machineId: uuid,
    driverEmploymentId: uuid.nullable().default(null),
    acceptedTrips: z.number().int().min(0).max(10_000),
    rejectedTrips: z.number().int().min(0).max(10_000).default(0),
    partialTripCount: z.number().int().min(0).max(10_000).default(0),
    partialVolume: decimal.default("0"),
    actualWeightT: decimal.nullable().default(null),
    loadFactor: positiveDecimal.default("1"),
    averageCycleMinutes: z
      .number()
      .int()
      .min(0)
      .max(1440)
      .nullable()
      .default(null),
    occurrenceNotes: z.string().trim().max(500).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.partialTripCount > value.acceptedTrips)
      context.addIssue({
        code: "custom",
        path: ["partialTripCount"],
        message: "Partial trips cannot exceed accepted trips",
      });
  });

export const productionCommandSchema = z
  .discriminatedUnion("kind", [
    productionCommandBase
      .extend({
        kind: z.literal("individual_activity"),
        entryMode: z.enum(["direct_total", "truck_summary"]).default("direct_total"),
        individualActivity: individualActivitySchema,
        truckSummaries: z.array(truckSummarySchema).max(100).default([]),
      })
      .strict(),
    productionCommandBase
      .extend({
        kind: z.literal("material_movement"),
        entryMode: z.enum(["truck_summary", "trips"]).default("truck_summary"),
        materialMovement: materialMovementSchema,
        truckSummaries: z.array(truckSummarySchema).min(1).max(100),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.startTime &&
      value.endTime &&
      value.shift === "day" &&
      value.endDayOffset !== 0
    )
      context.addIssue({
        code: "custom",
        path: ["endDayOffset"],
        message: "Day shift must end on the production date",
      });
    value.equipment.forEach((equipment, index) => {
      if (
        equipment.initialMeterValue &&
        equipment.finalMeterValue &&
        Number(equipment.finalMeterValue) < Number(equipment.initialMeterValue)
      )
        context.addIssue({
          code: "custom",
          path: ["equipment", index, "finalMeterValue"],
          message: "Final meter value cannot be lower than initial value",
        });
    });
    const machineIds = new Set<string>();
    value.equipment.forEach((equipment, index) => {
      if (machineIds.has(equipment.machineId))
        context.addIssue({
          code: "custom",
          path: ["equipment", index, "machineId"],
          message: "Machine cannot be repeated",
        });
      machineIds.add(equipment.machineId);
    });
    const truckIds = new Set<string>();
    value.truckSummaries.forEach((truck, index) => {
      if (truckIds.has(truck.machineId))
        context.addIssue({
          code: "custom",
          path: ["truckSummaries", index, "machineId"],
          message: "Truck cannot be repeated",
        });
      truckIds.add(truck.machineId);
    });
  });

export const productionDecisionSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500).nullable().default(null),
  })
  .strict();

export const productionQualityCheckSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    type: z.enum([
      "field_inspection",
      "topography",
      "density",
      "proctor",
      "compaction",
      "moisture",
      "finishing",
    ]),
    status: z.enum(["pending", "accepted", "rejected"]),
    value: decimal.nullable().default(null),
    unitCode: z.string().trim().max(32).nullable().default(null),
    notes: z.string().trim().max(500).nullable().default(null),
    evidence: z.array(evidenceSchema).max(20).default([]),
    acceptedQuantity: z
      .object({
        componentId: uuid,
        value: decimal,
        unitCode: z.string().trim().min(1).max(32),
        volumeCondition: volumeConditionSchema,
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.acceptedQuantity) return;
    if (value.status !== "accepted")
      context.addIssue({
        code: "custom",
        path: ["acceptedQuantity"],
        message: "An accepted quantity requires an accepted quality check",
      });
    if (["field_inspection", "finishing"].includes(value.type))
      context.addIssue({
        code: "custom",
        path: ["acceptedQuantity"],
        message:
          "Only topography or laboratory checks can originate an accepted quantity",
      });
  });

export const productionTransitionSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();

export const productionReopenSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const productionTripSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    idempotencyKey: uuid,
    productionEquipmentId: uuid,
    recordedAt: z.string().datetime({ offset: true }).optional(),
    capacityM3: positiveDecimal.optional(),
    adjustedVolumeM3: positiveDecimal.nullable().default(null),
    ticketNumber: z.string().trim().max(80).nullable().default(null),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

export const productionTripDeleteQuerySchema = z
  .object({ expectedRevision: z.coerce.number().int().positive() })
  .strict();

export const dailyReportProductionConfirmSchema = z
  .object({
    productionIds: z.array(uuid).max(200),
  })
  .strict();

export type ProductionCommand = z.infer<typeof productionCommandSchema>;
export type ProductionListQuery = z.infer<typeof productionListQuerySchema>;
export type ProductionOptionsQuery = z.infer<
  typeof productionOptionsQuerySchema
>;
export type ProductionHistoryQuery = z.infer<
  typeof productionHistoryQuerySchema
>;
export type ProductionTransition = z.infer<typeof productionTransitionSchema>;
export type ProductionDecision = z.infer<typeof productionDecisionSchema>;
export type ProductionQualityCheck = z.infer<
  typeof productionQualityCheckSchema
>;
export type ProductionReopen = z.infer<typeof productionReopenSchema>;
export type ProductionTripCommand = z.infer<typeof productionTripSchema>;

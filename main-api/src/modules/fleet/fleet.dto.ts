import { z } from "zod";

const optionalSearch = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalIdentifier = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine(
    (value) => value === undefined || /[A-Za-z0-9]/u.test(value),
    "Identifier must include at least one letter or number",
  );

export const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);

const positiveSpecificationDecimalSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0, "Value must be greater than zero");

const positiveHourlyRateSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0, "Value must be greater than zero");

export const loadCapacityUnitCodeSchema = z.enum([
  "M3_LOOSE",
  "M3_COMPACTED",
  "LITER",
  "CUBIC_YARD",
]);
export type LoadCapacityUnitCode = z.infer<typeof loadCapacityUnitCodeSchema>;

export const createMachineSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    type: z.enum(["YELLOW_LINE", "WHITE_LINE"]),
    manufacturer: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
    version: z.string().trim().max(120).optional(),
    meterType: z.enum(["HOUR_METER", "ODOMETER"]),
    loadVolumeM3: positiveSpecificationDecimalSchema.optional(),
    maxSupportedWeightT: positiveSpecificationDecimalSchema.optional(),
    plate: optionalIdentifier,
    companyTag: optionalIdentifier,
    initialMeterReading: decimalStringSchema,
  })
  .strict()
  .refine((value) => Boolean(value.plate || value.companyTag), {
    message: "At least one identifier is required",
    path: ["plate"],
  });

export type CreateMachineInput = z.infer<typeof createMachineSchema>;

export const machineUnitSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(160)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    plate: optionalIdentifier,
    companyTag: optionalIdentifier,
    meterType: z.enum(["HOUR_METER", "ODOMETER"]),
    initialMeterReading: decimalStringSchema,
    hourlyRate: positiveHourlyRateSchema.optional(),
    loadCapacity: positiveSpecificationDecimalSchema.optional(),
    loadCapacityUnitCode: loadCapacityUnitCodeSchema.optional(),
    maxSupportedWeightT: positiveSpecificationDecimalSchema.optional(),
    allocation: z
      .object({
        projectId: z.string().uuid(),
        operatorAssignments: z
          .array(
            z.object({
              shift: z.enum(["day", "night"]),
              operatorEmploymentId: z.string().uuid(),
            }),
          )
          .max(2),
      })
      .strict()
      .optional(),
    deletedMatchResolution: z
      .object({
        action: z.enum(["RESTORE", "CREATE_NEW"]),
        machineId: z.string().uuid().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.plate && !value.companyTag)
      context.addIssue({
        code: "custom",
        message: "At least one identifier is required",
        path: ["plate"],
      });
    if (Boolean(value.loadCapacity) !== Boolean(value.loadCapacityUnitCode))
      context.addIssue({
        code: "custom",
        message: "Load capacity and unit must be provided together",
        path: [value.loadCapacity ? "loadCapacityUnitCode" : "loadCapacity"],
      });
    if (
      value.deletedMatchResolution?.action === "RESTORE" &&
      !value.deletedMatchResolution.machineId
    )
      context.addIssue({
        code: "custom",
        message: "A deleted Machine is required for restore",
        path: ["deletedMatchResolution", "machineId"],
      });
  });

const machineModelFieldsSchema = z
  .object({
    description: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    type: z.enum(["YELLOW_LINE", "WHITE_LINE"]),
    manufacturer: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
    version: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    requiresOperator: z.boolean(),
    requiredJobRoleId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requiresOperator && !value.requiredJobRoleId)
      context.addIssue({
        code: "custom",
        path: ["requiredJobRoleId"],
        message: "An operator job role is required",
      });
    if (!value.requiresOperator && value.requiredJobRoleId)
      context.addIssue({
        code: "custom",
        path: ["requiredJobRoleId"],
        message:
          "A machine model without operator requirement cannot define a job role",
      });
  });

export const createMachineModelSchema = machineModelFieldsSchema;
export type CreateMachineModelInput = z.infer<typeof createMachineModelSchema>;

export const addMachineModelUnitsSchema = machineUnitSchema;
export type AddMachineModelUnitsInput = z.infer<
  typeof addMachineModelUnitsSchema
>;

export const addMachineModelUnitsBatchSchema = z
  .object({
    projectId: z.string().uuid(),
    units: z.array(machineUnitSchema).min(1).max(15),
  })
  .strict()
  .superRefine((value, context) => {
    value.units.forEach((unit, index) => {
      if (!unit.allocation || unit.allocation.projectId !== value.projectId)
        context.addIssue({
          code: "custom",
          path: ["units", index, "allocation", "projectId"],
          message: "Every batch unit must be allocated to the common Project",
        });
    });
  });
export type AddMachineModelUnitsBatchInput = z.infer<
  typeof addMachineModelUnitsBatchSchema
>;

export const updateMachineModelSchema = machineModelFieldsSchema;
export type UpdateMachineModelInput = z.infer<typeof updateMachineModelSchema>;

export const machineModelParamsSchema = z
  .object({ machineModelId: z.string().uuid() })
  .strict();

export const listMachineModelsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().trim().min(1).max(2048).optional(),
    search: optionalSearch,
    type: z.enum(["YELLOW_LINE", "WHITE_LINE"]).optional(),
    sortBy: z.enum(["model", "createdAt"]).default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
export type ListMachineModelsQuery = z.infer<
  typeof listMachineModelsQuerySchema
>;

export const updateMachineLoadSpecificationSchema = z
  .object({
    loadCapacity: positiveSpecificationDecimalSchema.nullable(),
    loadCapacityUnitCode: loadCapacityUnitCodeSchema.nullable(),
    maxSupportedWeightT: positiveSpecificationDecimalSchema.nullable(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.loadCapacity) === Boolean(value.loadCapacityUnitCode),
    {
      message: "Load capacity and unit must be provided together",
      path: ["loadCapacity"],
    },
  );

export type UpdateMachineLoadSpecificationInput = z.infer<
  typeof updateMachineLoadSpecificationSchema
>;

export const allocateMachineSchema = z
  .object({
    projectId: z.string().uuid(),
    operatorEmploymentId: z.string().uuid(),
  })
  .strict();
export type AllocateMachineInput = z.infer<typeof allocateMachineSchema>;

export const listMachinesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().trim().min(1).max(2048).optional(),
    search: optionalSearch,
    type: z.enum(["YELLOW_LINE", "WHITE_LINE"]).optional(),
    availability: z.enum(["available"]).optional(),
    sortBy: z.enum(["name", "createdAt"]).default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type ListMachinesQuery = z.infer<typeof listMachinesQuerySchema>;

export const machineParamsSchema = z
  .object({ machineId: z.string().uuid() })
  .strict();

export const machineReadingParamsSchema = z
  .object({
    machineId: z.string().uuid(),
    readingId: z.string().uuid(),
  })
  .strict();

export const appendMachineMeterReadingSchema = z
  .object({ value: decimalStringSchema })
  .strict();

export type AppendMachineMeterReadingInput = z.infer<
  typeof appendMachineMeterReadingSchema
>;

export const correctMachineMeterReadingSchema = z
  .object({
    value: decimalStringSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type CorrectMachineMeterReadingInput = z.infer<
  typeof correctMachineMeterReadingSchema
>;

import { z } from "zod";
import {
  decimalInputToCanonical,
  onlyDigits,
} from "@/lib/brazilian-input-mask";

const controlPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

const text = (
  max: number,
  multiline = false,
  requiredMessage = "Preencha este campo.",
) =>
  z
    .string()
    .transform((value) => value.trim().normalize("NFC"))
    .pipe(
      z
        .string()
        .min(1, requiredMessage)
        .max(max, `Use no máximo ${max} caracteres.`)
        .refine(
          (value) =>
            !controlPattern.test(value) &&
            (multiline || !/[\r\n]/u.test(value)),
          "Remova caracteres inválidos do texto.",
        ),
    );

const optionalText = (max: number) =>
  z
    .union([
      z.null(),
      z.undefined(),
      z
        .string()
        .transform((value) => value.trim().normalize("NFC"))
        .pipe(
          z
            .string()
            .max(max, `Use no máximo ${max} caracteres.`)
            .refine(
              (value) => !controlPattern.test(value),
              "Remova caracteres inválidos do texto.",
            ),
        ),
    ])
    .transform((value) => value || null);

const optionalNullableText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) =>
      typeof value === "string" ? value.trim().normalize("NFC") : value,
    )
    .pipe(
      z.union([
        z
          .string()
          .max(max, `Use no máximo ${max} caracteres.`)
          .refine((value) => !controlPattern.test(value), {
            message: "Remova caracteres inválidos do texto.",
          }),
        z.null(),
        z.undefined(),
      ]),
    )
    .transform((value) => value || null);

function decimal(scale: number, integral: number, positive: boolean) {
  const pattern = new RegExp(
    `^\\d{1,${integral}}(?:\\.\\d{1,${scale}})?$`,
    "u",
  );
  return z
    .string()
    .trim()
    .transform((value) =>
      value.includes(",") || /[^\d.]/u.test(value)
        ? decimalInputToCanonical(value, scale)
        : value,
    )
    .pipe(z.string().regex(pattern, "Informe um valor válido."))
    .transform((value) => {
      const [whole, fraction = ""] = value.split(".");
      return `${whole.replace(/^0+(?=\d)/u, "")}.${fraction.padEnd(scale, "0")}`;
    })
    .refine(
      (value) => !positive || !/^0+\.0+$/u.test(value),
      "Informe um valor maior que zero.",
    );
}

const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : value))
  .pipe(
    z.union([
      z.string().regex(datePattern),
      z.literal(""),
      z.null(),
      z.undefined(),
    ]),
  )
  .transform((value) => value || null);

export const projectAddressSchema = z
  .object({
    postalCode: z
      .string()
      .transform((value) => onlyDigits(value, 8))
      .pipe(z.string().regex(/^\d{8}$/u, "Informe um CEP com 8 dígitos.")),
    street: text(160, false, "Informe o logradouro."),
    number: optionalNullableText(30),
    complement: optionalNullableText(100),
    neighborhood: text(100, false, "Informe o bairro."),
    city: text(100, false, "Informe a cidade."),
    state: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{2}$/u, "Informe a UF com 2 letras.")),
  })
  .strict()
  .superRefine((address, context) => {
    const formatted = [
      address.number ? `${address.street}, ${address.number}` : address.street,
      address.complement,
      `${address.neighborhood} - ${address.city}/${address.state}`,
      `CEP ${address.postalCode.slice(0, 5)}-${address.postalCode.slice(5)}`,
    ]
      .filter(Boolean)
      .join(" - ");
    if (formatted.length > 500)
      context.addIssue({
        code: "custom",
        path: ["street"],
        message:
          "O endereço ficou muito longo. Revise os campos de localização.",
      });
  });

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^-?\d{1,3}(?:\.\d{1,6})?$/u, "Informe uma coordenada válida.")
    .refine(
      (value) => Number(value) >= min && Number(value) <= max,
      "Informe uma coordenada dentro do intervalo permitido.",
    )
    .transform((value) => {
      const number = Number(value);
      return (Object.is(number, -0) ? 0 : number).toFixed(6);
    });

const optionalCoordinate = (min: number, max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? value.trim() : value))
    .pipe(
      z.union([coordinate(min, max), z.literal(""), z.null(), z.undefined()]),
    )
    .transform((value) => value || null);

export const weekDays = [1, 2, 3, 4, 5, 6, 7] as const;

const scheduleDaySchema = z
  .object({
    shift: z.enum(["day", "night"]),
    dayOfWeek: z.number().int().min(1).max(7),
    isWorking: z.boolean(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    endDayOffset: z.number().int().min(0).max(1),
  })
  .strict()
  .superRefine((day, context) => {
    if (!day.isWorking) {
      if (
        day.startTime !== null ||
        day.endTime !== null ||
        day.endDayOffset !== 0
      )
        context.addIssue({
          code: "custom",
          message: "Remova os horários de dias sem trabalho.",
        });
      return;
    }
    if (!day.startTime || !timePattern.test(day.startTime))
      context.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Informe um horário inicial válido.",
      });
    if (!day.endTime || !timePattern.test(day.endTime))
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Informe um horário final válido.",
      });
    if (
      day.startTime &&
      day.endTime &&
      day.endDayOffset === 0 &&
      day.startTime >= day.endTime
    )
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "O horário final deve ser posterior ao inicial.",
      });
  });

const breakTemplateSchema = z.object({
  shift: z.enum(["day", "night"]),
  name: text(120),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
});

const employeeAllocationSchema = z
  .object({
    employmentId: z.string().uuid(),
    shift: z.enum(["day", "night"]),
    confirmedJobRoleId: z.string().uuid().optional(),
    confirmedJobRolePeriodId: z.string().uuid().nullable().optional(),
    confirmedJobRoleName: optionalText(120).optional(),
    monthlyWorkloadHours: z.coerce.number().int().min(1).max(744),
    compensationMode: z.enum([
      "daily",
      "hourly",
      "weekly",
      "fortnightly",
      "monthly",
    ]),
    compensationValue: decimal(2, 16, false),
    overtimeRate: decimal(2, 16, false),
  })
  .superRefine((allocation, context) => {
    const hasExistingRole = Boolean(
      allocation.confirmedJobRoleId || allocation.confirmedJobRolePeriodId,
    );
    const hasTemporaryRole = Boolean(allocation.confirmedJobRoleName);
    if (!hasExistingRole && !hasTemporaryRole)
      context.addIssue({
        code: "custom",
        path: ["confirmedJobRoleId"],
        message: "Selecione ou crie a função aplicada nesta obra.",
      });
    if (hasExistingRole && hasTemporaryRole)
      context.addIssue({
        code: "custom",
        path: ["confirmedJobRoleName"],
        message: "Use uma função existente ou uma função temporária.",
      });
  });

const machineAllocationSchema = z.object({
  machineId: z.string().uuid(),
  startMeterReadingId: z.string().uuid(),
  operatorAssignments: z
          .array(
      z.object({
        shift: z.enum(["day", "night"]),
        operatorEmploymentId: z.string().uuid(),
      }),
    )
          .min(0)
    .max(2),
});

const supplierInlineSchema = z
  .object({
    entityType: z.enum(["individual", "legal_entity"]),
    document: text(32, false, "Informe o documento do fornecedor."),
    fullName: optionalText(180),
    legalName: optionalText(180),
    tradeName: optionalText(180),
    phone: optionalText(32),
    email: optionalText(254),
    addressLine: optionalText(220),
    city: optionalText(120),
    state: optionalText(80),
    postalCode: optionalText(24),
    saveGlobally: z.boolean().default(false),
  })
  .superRefine((supplier, context) => {
    if (supplier.entityType === "individual" && !supplier.fullName)
      context.addIssue({
        code: "custom",
        path: ["fullName"],
        message: "Informe o nome do fornecedor.",
      });
    if (supplier.entityType === "legal_entity" && !supplier.legalName)
      context.addIssue({
        code: "custom",
        path: ["legalName"],
        message: "Informe a razão social do fornecedor.",
      });
  });

const suppliedItemInlineSchema = z.object({
  name: text(160, false, "Informe o item fornecido."),
  baseUnitId: z.string().uuid("Selecione a unidade de medida."),
  saveGlobally: z.boolean().default(false),
});

const projectSupplierOfferSchema = z
  .object({
    supplierId: z.string().uuid().optional(),
    supplier: supplierInlineSchema.optional(),
    itemId: z.string().uuid().optional(),
    item: suppliedItemInlineSchema.optional(),
    sourceOfferId: z.string().uuid().nullable().optional(),
    purchaseUnitId: z.string().uuid("Selecione a unidade de medida."),
    conversionToBase: decimal(6, 12, true),
    price: decimal(4, 14, true),
  })
  .superRefine((offer, context) => {
    if (!offer.supplierId && !offer.supplier)
      context.addIssue({
        code: "custom",
        path: ["supplier"],
        message: "Selecione ou crie um fornecedor.",
      });
    if (offer.supplierId && offer.supplier)
      context.addIssue({
        code: "custom",
        path: ["supplierId"],
        message: "Use fornecedor existente ou novo, não os dois.",
      });
    if (!offer.itemId && !offer.item)
      context.addIssue({
        code: "custom",
        path: ["item"],
        message: "Selecione ou crie um item fornecido.",
      });
    if (offer.itemId && offer.item)
      context.addIssue({
        code: "custom",
        path: ["itemId"],
        message: "Use item existente ou novo, não os dois.",
      });
  });

export const projectCommandSchema = z
  .object({
    name: text(160, false, "Informe o nome da obra."),
    address: projectAddressSchema,
    latitude: optionalCoordinate(-90, 90),
    longitude: optionalCoordinate(-180, 180),
    contractNumber: optionalText(120),
    approvedBudget: decimal(2, 16, false),
    plannedStartDate: z
      .string()
      .regex(datePattern, "Informe a data de início planejada."),
    plannedEndDate: optionalDate,
    clientId: z.string().uuid("Selecione o cliente."),
    managerEmploymentId: z.string().uuid("Selecione o gestor da obra."),
    technicalResponsibilityEmploymentIds: z
      .array(z.string().uuid())
      .min(1, "Selecione pelo menos um responsável técnico.")
      .max(20, "Selecione no máximo 20 responsáveis técnicos."),
    nightShiftEnabled: z.boolean(),
    weeklySchedule: z.array(scheduleDaySchema).min(7).max(14),
    breakTemplates: z.array(breakTemplateSchema).max(20),
    initialEmployeeAllocations: z.array(employeeAllocationSchema).max(200),
    initialMachineAllocations: z.array(machineAllocationSchema).max(100),
    projectSupplierOffers: z
      .array(projectSupplierOfferSchema)
      .max(0, "Configure os fornecimentos após criar a obra."),
  })
  .strict()
  .superRefine((command, context) => {
    if ((command.latitude === null) !== (command.longitude === null))
      context.addIssue({
        code: "custom",
        path: [command.latitude === null ? "latitude" : "longitude"],
        message: "Informe latitude e longitude para usar a prévia do mapa.",
      });
    if (
      command.plannedEndDate !== null &&
      command.plannedEndDate < command.plannedStartDate
    )
      context.addIssue({
        code: "custom",
        path: ["plannedEndDate"],
        message: "A data final deve ser posterior à inicial",
      });
    const shifts = [...new Set(command.weeklySchedule.map((day) => day.shift))];
    if (!shifts.includes("day"))
      context.addIssue({
        code: "custom",
        path: ["weeklySchedule"],
        message: "O turno diurno é obrigatório.",
      });
    for (const shift of shifts) {
      const days = command.weeklySchedule.filter((day) => day.shift === shift);
      if (
        days
          .map((day) => day.dayOfWeek)
          .sort()
          .join(",") !== "1,2,3,4,5,6,7"
      )
        context.addIssue({
          code: "custom",
          path: ["weeklySchedule"],
          message: "Cada turno deve conter segunda a domingo.",
        });
      if (!days.some((day) => day.isWorking))
        context.addIssue({
          code: "custom",
          path: ["weeklySchedule"],
          message: "Informe ao menos um dia de trabalho em cada turno.",
        });
    }
    for (const [path, values] of [
      [
        "technicalResponsibilityEmploymentIds",
        command.technicalResponsibilityEmploymentIds,
      ],
      [
        "initialEmployeeAllocations",
        command.initialEmployeeAllocations.map((item) => item.employmentId),
      ],
      [
        "initialMachineAllocations",
        command.initialMachineAllocations.map((item) => item.machineId),
      ],
      [
        "projectSupplierOffers",
        command.projectSupplierOffers
          .map((item) =>
            item.supplierId && item.itemId && item.purchaseUnitId
              ? `${item.supplierId}:${item.itemId}:${item.purchaseUnitId}`
              : "",
          )
          .filter(Boolean),
      ],
    ] as const) {
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: "custom",
          path: [path],
          message: "Itens duplicados",
        });
    }
    const teamByEmployment = new Map(
      command.initialEmployeeAllocations.map((item) => [
        item.employmentId,
        item.shift,
      ]),
    );
    const machineOperatorAssignments =
      command.initialMachineAllocations.flatMap(
        (item) => item.operatorAssignments,
      );
    const machineOperatorIds = machineOperatorAssignments.map(
      (item) => item.operatorEmploymentId,
    );
    if (new Set(machineOperatorIds).size !== machineOperatorIds.length)
      context.addIssue({
        code: "custom",
        path: ["initialMachineAllocations"],
        message: "Um operador não pode operar duas máquinas ao mesmo tempo.",
      });
    command.initialMachineAllocations.forEach((allocation, index) => {
      allocation.operatorAssignments.forEach((assignment, shiftIndex) => {
        if (
          teamByEmployment.get(assignment.operatorEmploymentId) !==
          assignment.shift
        )
          context.addIssue({
            code: "custom",
            path: [
              "initialMachineAllocations",
              index,
              "operatorAssignments",
              shiftIndex,
              "operatorEmploymentId",
            ],
            message: "Selecione um operador da equipe do mesmo turno.",
          });
      });
    });
  });

export type ProjectCommand = z.infer<typeof projectCommandSchema>;

export const emptyProjectCommand: ProjectCommand = {
  name: "",
  address: {
    postalCode: "",
    street: "",
    number: "",
    complement: null,
    neighborhood: "",
    city: "",
    state: "",
  },
  latitude: null,
  longitude: null,
  contractNumber: null,
  approvedBudget: "0.00",
  plannedStartDate: "",
  plannedEndDate: "",
  clientId: "",
  managerEmploymentId: "",
  technicalResponsibilityEmploymentIds: [],
  nightShiftEnabled: false,
  weeklySchedule: weekDays.map((dayOfWeek) => ({
    shift: "day",
    dayOfWeek,
    isWorking: dayOfWeek <= 5,
    startTime: dayOfWeek <= 5 ? "08:00" : null,
    endTime: dayOfWeek <= 5 ? "17:00" : null,
    endDayOffset: 0,
  })),
  breakTemplates: [],
  initialEmployeeAllocations: [],
  initialMachineAllocations: [],
  projectSupplierOffers: [],
};

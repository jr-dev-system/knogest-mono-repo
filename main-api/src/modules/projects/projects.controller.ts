import type { FastifyInstance, FastifyRequest } from "fastify";
import { jsonResponse } from "../../lib/utils/jsonResponse";
import {
  projectCommandSchema,
  projectEmployeeMobilizationCommandSchema,
  projectIdempotencyKeySchema,
  projectListQuerySchema,
  projectMachineMobilizationCommandSchema,
  projectMobilizationHistoryQuerySchema,
  projectParamsSchema,
  projectQuantityBaselineRevisionCommandSchema,
  projectReadinessCommandSchema,
  projectShiftParamsSchema,
  projectTeamCandidatesQuerySchema,
  projectTeamMembersQuerySchema,
  projectWorkFrontCommandSchema,
  projectWorkFrontMobilizationCommandSchema,
  projectWorkFrontMobilizationOptionsQuerySchema,
  projectWorkFrontParamsSchema,
  projectWorkFrontServicesCommandSchema,
} from "./projects.dto";
import { ProjectsService, type ProjectScope } from "./projects.service";

const errorSchema = {
  type: "object",
  required: ["success", "code", "message", "details", "requestId"],
  properties: {
    success: { type: "boolean", const: false },
    code: { type: "string" },
    message: { type: "string" },
    details: { type: "object", nullable: true, additionalProperties: true },
    requestId: { type: "string" },
  },
} as const;
const successSchema = (data: object) => ({
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", const: true },
    message: { type: "string" },
    data,
  },
});
const projectLifecycleStatusSchema = {
  enum: ["planned", "active", "paused", "completed", "cancelled"],
} as const;
const projectItemSchema = {
  type: "object",
  required: [
    "id",
    "name",
    "contractNumber",
    "status",
    "actualStartedAt",
    "createdAt",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    contractNumber: { type: "string", nullable: true },
    status: projectLifecycleStatusSchema,
    actualStartedAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
};
const uuid = { type: "string", format: "uuid" } as const;
const cursorPageInfoSchema = {
  type: "object",
  required: ["hasNextPage", "nextCursor"],
  properties: {
    hasNextPage: { type: "boolean" },
    nextCursor: { type: "string", nullable: true },
  },
} as const;
const occupyingFrontSchema = {
  type: "object",
  nullable: true,
  required: ["id", "name"],
  properties: { id: uuid, name: { type: "string" } },
} as const;
const workFrontMobilizationEmployeeOptionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "resourceType",
    "id",
    "name",
    "jobRole",
    "shift",
    "occupyingFront",
    "selected",
    "disabled",
  ],
  properties: {
    resourceType: { type: "string", const: "employee" },
    id: uuid,
    name: { type: "string" },
    jobRole: { type: "string" },
    shift: { enum: ["day", "night"] },
    occupyingFront: occupyingFrontSchema,
    selected: { type: "boolean" },
    disabled: { type: "boolean" },
  },
} as const;
const workFrontMobilizationMachineOptionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "resourceType",
    "id",
    "selectionKey",
    "name",
    "manufacturer",
    "model",
    "identifier",
    "shift",
    "operator",
    "occupyingFront",
    "selected",
    "disabled",
  ],
  properties: {
    resourceType: { type: "string", const: "machine" },
    id: uuid,
    selectionKey: { type: "string" },
    name: { type: "string" },
    manufacturer: { type: "string" },
    model: { type: "string" },
    identifier: {
      type: "object",
      nullable: true,
      required: ["kind", "value"],
      properties: {
        kind: { enum: ["PLATE", "COMPANY_TAG"] },
        value: { type: "string" },
      },
    },
    shift: { enum: ["day", "night"] },
    operator: {
      type: "object",
      nullable: true,
      required: ["id", "name"],
      properties: { id: uuid, name: { type: "string" } },
    },
    occupyingFront: occupyingFrontSchema,
    selected: { type: "boolean" },
    disabled: { type: "boolean" },
  },
} as const;
const projectAddressOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["postalCode", "street", "neighborhood", "city", "state"],
  properties: {
    postalCode: { type: "string", pattern: "^\\d{8}$" },
    street: { type: "string", minLength: 1, maxLength: 160 },
    number: { type: "string", nullable: true, maxLength: 30 },
    complement: { type: "string", nullable: true, maxLength: 100 },
    neighborhood: { type: "string", minLength: 1, maxLength: 100 },
    city: { type: "string", minLength: 1, maxLength: 100 },
    state: { type: "string", pattern: "^[A-Z]{2}$" },
  },
} as const;
const projectCommandOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "address",
    "latitude",
    "longitude",
    "approvedBudget",
    "plannedStartDate",
    "clientId",
    "managerEmploymentId",
    "technicalResponsibilityEmploymentIds",
    "weeklySchedule",
    "breakTemplates",
    "initialEmployeeAllocations",
    "initialMachineAllocations",
    "projectSupplierOffers",
  ],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    address: projectAddressOpenApiSchema,
    latitude: { type: "string", nullable: true },
    longitude: { type: "string", nullable: true },
    contractNumber: { type: "string", nullable: true, maxLength: 120 },
    approvedBudget: { type: "string" },
    plannedStartDate: { type: "string", format: "date" },
    plannedEndDate: { type: "string", format: "date", nullable: true },
    clientId: uuid,
    managerEmploymentId: uuid,
    technicalResponsibilityEmploymentIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: uuid,
    },
    weeklySchedule: {
      type: "array",
      minItems: 7,
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "shift",
          "dayOfWeek",
          "isWorking",
          "startTime",
          "endTime",
          "endDayOffset",
        ],
        properties: {
          shift: { enum: ["day", "night"] },
          dayOfWeek: { type: "integer", minimum: 1, maximum: 7 },
          isWorking: { type: "boolean" },
          startTime: { type: "string", nullable: true },
          endTime: { type: "string", nullable: true },
          endDayOffset: { type: "integer", minimum: 0, maximum: 1 },
        },
      },
    },
    breakTemplates: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["shift", "name", "durationMinutes"],
        properties: {
          shift: { enum: ["day", "night"] },
          name: { type: "string", maxLength: 120 },
          durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
        },
      },
    },
    initialEmployeeAllocations: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "employmentId",
          "monthlyWorkloadHours",
          "compensationMode",
          "compensationValue",
          "overtimeRate",
        ],
        properties: {
          employmentId: uuid,
          shift: { enum: ["day", "night"] },
          confirmedJobRoleId: uuid,
          confirmedJobRolePeriodId: { ...uuid, nullable: true },
          confirmedJobRoleName: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            nullable: true,
          },
          monthlyWorkloadHours: {
            type: "integer",
            minimum: 1,
            maximum: 744,
          },
          compensationMode: {
            enum: ["daily", "hourly", "weekly", "fortnightly", "monthly"],
          },
          compensationValue: { type: "string" },
          overtimeRate: { type: "string" },
        },
      },
    },
    initialMachineAllocations: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["machineId", "startMeterReadingId"],
        properties: {
          machineId: uuid,
          startMeterReadingId: uuid,
          operatorEmploymentId: uuid,
          operatorAssignments: {
            type: "array",
            minItems: 0,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["shift", "operatorEmploymentId"],
              properties: {
                shift: { enum: ["day", "night"] },
                operatorEmploymentId: uuid,
              },
            },
          },
        },
      },
    },
    projectSupplierOffers: {
      type: "array",
      maxItems: 0,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["purchaseUnitId", "conversionToBase", "price"],
        properties: {
          supplierId: uuid,
          supplier: {
            type: "object",
            additionalProperties: false,
            required: ["entityType", "document", "saveGlobally"],
            properties: {
              entityType: { enum: ["individual", "legal_entity"] },
              document: { type: "string", maxLength: 32 },
              fullName: { type: "string", nullable: true, maxLength: 180 },
              legalName: { type: "string", nullable: true, maxLength: 180 },
              tradeName: { type: "string", nullable: true, maxLength: 180 },
              phone: { type: "string", nullable: true, maxLength: 32 },
              email: { type: "string", nullable: true, maxLength: 254 },
              addressLine: { type: "string", nullable: true, maxLength: 220 },
              city: { type: "string", nullable: true, maxLength: 120 },
              state: { type: "string", nullable: true, maxLength: 80 },
              postalCode: { type: "string", nullable: true, maxLength: 24 },
              saveGlobally: { type: "boolean", default: false },
            },
          },
          itemId: uuid,
          item: {
            type: "object",
            additionalProperties: false,
            required: ["name", "baseUnitId", "saveGlobally"],
            properties: {
              name: { type: "string", minLength: 1, maxLength: 160 },
              baseUnitId: uuid,
              saveGlobally: { type: "boolean", default: false },
            },
          },
          sourceOfferId: { type: "string", format: "uuid", nullable: true },
          purchaseUnitId: uuid,
          conversionToBase: { type: "string" },
          price: { type: "string" },
        },
      },
    },
  },
} as const;

const projectReadinessCommandOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    plannedStartDate: { type: "string", format: "date" },
    plannedEndDate: { type: "string", format: "date" },
    productionMetricTargets: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metricCode", "targetTotal"],
        properties: {
          metricCode: { enum: ["cut", "fill", "finishing", "top_soil"] },
          targetTotal: { type: "string" },
        },
      },
    },
    fuelOffers: {
      type: "array",
      maxItems: 10,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["sourceOfferId", "price"],
            properties: {
              mode: { enum: ["existing"] },
              sourceOfferId: uuid,
              conversionToBase: { type: "string" },
              price: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "mode",
              "supplierId",
              "itemId",
              "purchaseUnitId",
              "conversionToBase",
              "price",
            ],
            properties: {
              mode: { enum: ["projectOnly", "companyCatalog"] },
              supplierId: uuid,
              itemId: uuid,
              purchaseUnitId: uuid,
              conversionToBase: { type: "string" },
              price: { type: "string" },
            },
          },
        ],
      },
    },
    materialOffers: {
      type: "array",
      maxItems: 50,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["sourceOfferId", "price"],
            properties: {
              mode: { enum: ["existing"] },
              sourceOfferId: uuid,
              price: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "mode",
              "supplierId",
              "itemId",
              "purchaseUnitId",
              "conversionToBase",
              "price",
            ],
            properties: {
              mode: { enum: ["projectOnly", "companyCatalog"] },
              supplierId: uuid,
              itemId: uuid,
              purchaseUnitId: uuid,
              conversionToBase: { type: "string" },
              price: { type: "string" },
            },
          },
        ],
      },
    },
    accountability: {
      type: "object",
      additionalProperties: false,
      required: [
        "clientId",
        "managerEmploymentId",
        "technicalResponsibilityEmploymentIds",
      ],
      properties: {
        clientId: uuid,
        managerEmploymentId: uuid,
        technicalResponsibilityEmploymentIds: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: uuid,
        },
      },
    },
    employeeAllocations:
      projectCommandOpenApiSchema.properties.initialEmployeeAllocations,
    machineAllocations:
      projectCommandOpenApiSchema.properties.initialMachineAllocations,
    compensationPaymentTerms: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["compensationMode", "daysAfterPeriodEnd"],
        properties: {
          compensationMode: {
            enum: ["daily", "hourly", "weekly", "fortnightly", "monthly"],
          },
          daysAfterPeriodEnd: { type: "integer", minimum: 0, maximum: 60 },
        },
      },
    },
  },
} as const;

const projectQuantityBaselineRevisionCommandOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    reason: { type: "string", nullable: true, maxLength: 240 },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["serviceCode", "unitCode", "total"],
        properties: {
          serviceCode: {
            enum: [
              "cut",
              "fill",
              "finishing",
              "top_soil",
              "unsuitable_soil_removal",
              "replacement_fill",
            ],
          },
          unitCode: { enum: ["M3", "M2", "M3_KM"] },
          total: { type: "string" },
        },
      },
    },
  },
} as const;

const projectWorkFrontCommandOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "requiresEmployees", "requiresMachines", "services"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    location: { type: "string", nullable: true, maxLength: 240 },
    notes: { type: "string", nullable: true, maxLength: 1000 },
    plannedStartDate: { type: "string", format: "date", nullable: true },
    plannedEndDate: { type: "string", format: "date", nullable: true },
    requiresEmployees: { type: "boolean" },
    requiresMachines: { type: "boolean" },
    services: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["serviceCode", "unitCode", "quantity"],
        properties: {
          serviceCode:
            projectQuantityBaselineRevisionCommandOpenApiSchema.properties.items
              .items.properties.serviceCode,
          unitCode:
            projectQuantityBaselineRevisionCommandOpenApiSchema.properties.items
              .items.properties.unitCode,
          quantity: { type: "string" },
        },
      },
    },
  },
} as const;

const projectWorkFrontMobilizationOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["employmentIds"],
  anyOf: [{ required: ["machineIds"] }, { required: ["machineAssignments"] }],
  properties: {
    employmentIds: {
      type: "array",
      maxItems: 200,
      uniqueItems: true,
      items: uuid,
    },
    machineIds: {
      type: "array",
      maxItems: 100,
      uniqueItems: true,
      items: uuid,
    },
    machineAssignments: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["machineId", "shift"],
        properties: {
          machineId: uuid,
          shift: { enum: ["day", "night"] },
        },
      },
    },
    reason: { type: "string", nullable: true, maxLength: 500 },
  },
} as const;

const projectWorkFrontServicesCommandOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["services"],
  properties: {
    services: {
      ...projectWorkFrontCommandOpenApiSchema.properties.services,
      minItems: 0,
    },
  },
} as const;

const projectEmployeeMobilizationOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["allocations"],
  properties: {
    allocations:
      projectReadinessCommandOpenApiSchema.properties.employeeAllocations,
    weeklySchedule: projectCommandOpenApiSchema.properties.weeklySchedule,
    breakTemplates: projectCommandOpenApiSchema.properties.breakTemplates,
    reason: { type: "string", nullable: true, maxLength: 500 },
  },
} as const;

const projectMachineMobilizationOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["allocations"],
  properties: {
    allocations:
      projectReadinessCommandOpenApiSchema.properties.machineAllocations,
    reason: { type: "string", nullable: true, maxLength: 500 },
  },
} as const;

const mobilizationHistoryPageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["data", "pageInfo"],
  properties: {
    data: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    pageInfo: {
      type: "object",
      additionalProperties: false,
      required: ["hasNextPage", "nextCursor"],
      properties: {
        hasNextPage: { type: "boolean" },
        nextCursor: { type: "string", nullable: true },
      },
    },
  },
} as const;

const projectReadinessBlockerSchema = {
  type: "object",
  required: ["section", "message"],
  properties: {
    section: {
      enum: [
        "dates",
        "metrics",
        "fronts",
        "fuel",
        "items",
        "equipment",
        "team",
        "payments",
      ],
    },
    message: { type: "string" },
  },
  additionalProperties: false,
} as const;

const projectEmployeeAllocationSnapshotSchema = {
  type: "object",
  additionalProperties: true,
  required: [
    "id",
    "employment",
    "shift",
    "jobRole",
    "confirmedJobRoleId",
    "confirmedJobRolePeriodId",
    "monthlyWorkloadHours",
    "compensationMode",
    "compensationValue",
    "overtimeRate",
    "effectiveFrom",
  ],
  properties: {
    id: uuid,
    employment: { type: "object", nullable: true, additionalProperties: true },
    shift: { enum: ["day", "night"] },
    jobRole: { type: "string" },
    confirmedJobRoleId: { ...uuid, nullable: true },
    confirmedJobRolePeriodId: { ...uuid, nullable: true },
    monthlyWorkloadHours: { type: "integer", minimum: 1, maximum: 744 },
    compensationMode: {
      enum: ["daily", "hourly", "weekly", "fortnightly", "monthly"],
    },
    compensationValue: { type: "string" },
    overtimeRate: { type: "string" },
    effectiveFrom: { type: "string", format: "date-time" },
  },
} as const;

const projectDetailSchema = {
  type: "object",
  additionalProperties: true,
  required: [
    "id",
    "name",
    "status",
    "actualStartedAt",
    "createdAt",
    "baseline",
    "quantityBaseline",
    "workFronts",
    "employeeAllocations",
    "readiness",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    contractNumber: { type: "string", nullable: true },
    status: projectLifecycleStatusSchema,
    actualStartedAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    baseline: { type: "object", nullable: true, additionalProperties: true },
    employeeAllocations: {
      type: "array",
      items: projectEmployeeAllocationSnapshotSchema,
    },
    quantityBaseline: {
      type: "object",
      additionalProperties: false,
      required: ["revision", "createdAt", "reason", "items"],
      properties: {
        revision: { type: "integer", nullable: true },
        createdAt: { type: "string", format: "date-time", nullable: true },
        reason: { type: "string", nullable: true },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "serviceCode",
              "unitCode",
              "total",
              "allocated",
              "unallocated",
              "produced",
            ],
            properties: {
              serviceCode: { type: "string" },
              unitCode: { type: "string" },
              total: { type: "string" },
              allocated: { type: "string" },
              unallocated: { type: "string" },
              produced: { type: "string" },
            },
          },
        },
      },
    },
    workFronts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["services"],
        properties: {
          services: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "serviceCode",
                "unitCode",
                "quantity",
                "produced",
                "minimumQuantity",
                "maximumQuantity",
                "hasProductions",
              ],
              properties: {
                serviceCode: { type: "string" },
                unitCode: { type: "string" },
                quantity: { type: "string" },
                produced: { type: "string" },
                minimumQuantity: { type: "string" },
                maximumQuantity: { type: "string" },
                hasProductions: { type: "boolean" },
              },
            },
          },
        },
      },
    },
    readiness: {
      type: "object",
      required: ["canActivate", "blockers"],
      properties: {
        canActivate: { type: "boolean" },
        blockers: { type: "array", items: projectReadinessBlockerSchema },
      },
      additionalProperties: false,
    },
  },
} as const;

const projectReadinessMachineOptionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "label",
    "manufacturer",
    "model",
    "meterType",
    "detail",
    "readingId",
    "requiresOperator",
    "requiredJobRoleId",
    "requiredJobRoleName",
    "acceptsAnyJobRole",
    "available",
  ],
  properties: {
    id: uuid,
    label: { type: "string" },
    manufacturer: { type: "string" },
    model: { type: "string" },
    meterType: { enum: ["HOUR_METER", "ODOMETER"] },
    detail: { type: "string", nullable: true },
    readingId: { ...uuid, nullable: true },
    requiresOperator: { type: "boolean" },
    requiredJobRoleId: { ...uuid, nullable: true },
    requiredJobRoleName: { type: "string", nullable: true },
    acceptsAnyJobRole: { type: "boolean" },
    available: { type: "boolean" },
  },
} as const;

const projectReadinessOptionsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "clients",
    "employees",
    "machines",
    "jobRoles",
    "suppliers",
    "suppliedItems",
    "suppliedItemCategories",
    "measurementUnits",
    "supplierOffers",
  ],
  properties: {
    clients: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    employees: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    machines: {
      type: "array",
      items: projectReadinessMachineOptionSchema,
    },
    jobRoles: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    suppliers: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    suppliedItems: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    suppliedItemCategories: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    measurementUnits: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    supplierOffers: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
  },
} as const;

const projectTeamCandidatesPageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["data", "pageInfo"],
  properties: {
    data: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "detail",
          "jobRolePeriodId",
          "jobRoleId",
          "allocatedShift",
        ],
        properties: {
          id: uuid,
          label: { type: "string" },
          detail: { type: "string", nullable: true },
          jobRolePeriodId: { ...uuid, nullable: true },
          jobRoleId: { ...uuid, nullable: true },
          allocatedShift: {
            enum: ["day", "night", null],
            nullable: true,
          },
        },
      },
    },
    pageInfo: {
      type: "object",
      additionalProperties: false,
      required: ["hasNextPage", "nextCursor"],
      properties: {
        hasNextPage: { type: "boolean" },
        nextCursor: { type: "string", nullable: true },
      },
    },
  },
} as const;

const projectTeamMembersPageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["data", "pageInfo"],
  properties: {
    data: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "employmentId",
          "name",
          "jobRole",
          "shift",
          "monthlyWorkloadHours",
          "compensationMode",
          "overtimeRate",
        ],
        properties: {
          id: uuid,
          employmentId: uuid,
          name: { type: "string" },
          jobRole: { type: "string" },
          shift: { enum: ["day", "night"] },
          monthlyWorkloadHours: {
            type: "integer",
            minimum: 1,
            maximum: 744,
          },
          compensationMode: {
            enum: ["daily", "hourly", "weekly", "fortnightly", "monthly"],
          },
          overtimeRate: { type: "string" },
        },
      },
    },
    pageInfo: {
      type: "object",
      additionalProperties: false,
      required: ["hasNextPage", "nextCursor"],
      properties: {
        hasNextPage: { type: "boolean" },
        nextCursor: { type: "string", nullable: true },
      },
    },
  },
} as const;

function scope(request: FastifyRequest): ProjectScope {
  const auth = request.authContext;
  if (!auth?.companyId) throw new Error("Company scope middleware invariant");
  return {
    corporationId: auth.corporationId,
    companyId: auth.companyId,
    sessionId: auth.sessionId,
    userId: auth.userId,
    role: auth.role,
  };
}

export async function v1ProjectsController(app: FastifyInstance) {
  const service = new ProjectsService(app.handlerContext);

  app.post(
    "/projects",
    {
      bodyLimit: 1_048_576,
      preHandler: app.requireCompanyScope,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (request: FastifyRequest) =>
            `${request.authContext?.sessionId ?? request.ip}:${request.authContext?.companyId ?? "unknown"}`,
        },
      },
      schema: {
        tags: ["Projects"],
        summary: "Create a complete Project aggregate",
        security: [{ bearerAuth: [] }],
        consumes: ["application/json"],
        headers: {
          type: "object",
          required: ["idempotency-key", "x-expected-company-id"],
          properties: {
            "idempotency-key": { type: "string", format: "uuid" },
            "x-expected-company-id": { type: "string", format: "uuid" },
            "content-type": { const: "application/json" },
          },
        },
        body: projectCommandOpenApiSchema,
        response: {
          201: successSchema({
            type: "object",
            required: ["projectId", "status"],
            properties: {
              projectId: { type: "string", format: "uuid" },
              status: { const: "planned" },
            },
          }),
          400: errorSchema,
          409: errorSchema,
          413: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const contentType = request.headers["content-type"]
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== "application/json")
        return jsonResponse.error({
          reply,
          statusCode: 415,
          code: "BAD_REQUEST",
          message: "Content-Type must be application/json",
        });
      const rawKey = request.headers["idempotency-key"];
      if (typeof rawKey !== "string")
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Idempotency-Key is required",
        });
      const parsedKey = projectIdempotencyKeySchema.safeParse(
        rawKey.toLowerCase(),
      );
      if (!parsedKey.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "IDEMPOTENCY_KEY_INVALID",
          message: "Idempotency-Key must be a UUID v4",
        });
      const expected = request.headers["x-expected-company-id"];
      if (typeof expected !== "string")
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Expected Company is required",
        });
      const parsed = projectCommandSchema.safeParse(request.body);
      if (!parsed.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Project command is invalid",
          details: {
            fields: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
            })),
            resources: [],
          },
        });
      try {
        return jsonResponse.success({
          reply,
          statusCode: 201,
          message: "Project created",
          data: await service.finalize(
            scope(request),
            expected,
            parsedKey.data,
            parsed.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.get(
    "/projects",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
            cursor: { type: "string", maxLength: 2048 },
            search: { type: "string", maxLength: 120 },
            sortBy: { enum: ["name", "createdAt"] },
            sortDirection: { enum: ["asc", "desc"] },
          },
        },
        response: {
          200: successSchema({
            type: "object",
            required: ["data", "pageInfo"],
            properties: {
              data: { type: "array", items: projectItemSchema },
              pageInfo: {
                type: "object",
                required: ["hasNextPage", "nextCursor"],
                properties: {
                  hasNextPage: { type: "boolean" },
                  nextCursor: { type: "string", nullable: true },
                },
              },
            },
          }),
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const parsed = projectListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid Project query",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.list(scope(request), parsed.data),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string", format: "uuid" } },
        },
        response: {
          200: successSchema(projectDetailSchema),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return jsonResponse.success({
          reply,
          data: await service.detail(scope(request), request.params.projectId),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.get<{
    Params: { projectId: string };
    Querystring: { shift?: string; limit?: number; cursor?: string };
  }>(
    "/projects/:projectId/team-members",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "List paginated members of one Project shift",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: uuid },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["shift"],
          properties: {
            shift: { enum: ["day", "night"] },
            limit: { type: "integer", minimum: 1, maximum: 15, default: 15 },
            cursor: { type: "string", maxLength: 2048 },
          },
        },
        response: {
          200: successSchema(projectTeamMembersPageSchema),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const parsedParams = projectParamsSchema.safeParse(request.params);
      const parsedQuery = projectTeamMembersQuerySchema.safeParse(
        request.query,
      );
      if (!parsedParams.success || !parsedQuery.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid Project team members query",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.teamMembers(
            scope(request),
            parsedParams.data.projectId,
            parsedQuery.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.get<{
    Params: { projectId: string };
    Querystring: {
      shift?: string;
      limit?: number;
      cursor?: string;
      search?: string;
    };
  }>(
    "/projects/:projectId/team-candidates",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "List paginated employee candidates for one Project shift",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: uuid },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["shift"],
          properties: {
            shift: { enum: ["day", "night"] },
            limit: { type: "integer", minimum: 1, maximum: 15, default: 15 },
            cursor: { type: "string", maxLength: 2048 },
            search: { type: "string", maxLength: 120 },
          },
        },
        response: {
          200: successSchema(projectTeamCandidatesPageSchema),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const parsedParams = projectParamsSchema.safeParse(request.params);
      const parsedQuery = projectTeamCandidatesQuerySchema.safeParse(
        request.query,
      );
      if (!parsedParams.success || !parsedQuery.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid Project team candidates query",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.teamCandidates(
            scope(request),
            parsedParams.data.projectId,
            parsedQuery.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/readiness-options",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "List Project readiness editor options",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string", format: "uuid" } },
        },
        response: {
          200: successSchema(projectReadinessOptionsSchema),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const parsedParams = projectParamsSchema.safeParse(request.params);
      if (!parsedParams.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid Project params",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.readinessOptions(
            scope(request),
            parsedParams.data.projectId,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.put<{ Params: { projectId: string } }>(
    "/projects/:projectId/readiness",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary:
          "Save the operational readiness checklist for a planned Project",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string", format: "uuid" } },
        },
        body: projectReadinessCommandOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const parsedParams = projectParamsSchema.safeParse(request.params);
      if (!parsedParams.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid Project params",
        });
      const parsedBody = projectReadinessCommandSchema.safeParse(request.body);
      if (!parsedBody.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Project readiness command is invalid",
          details: {
            fields: parsedBody.error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
            })),
            resources: [],
          },
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.saveReadiness(
            scope(request),
            parsedParams.data.projectId,
            parsedBody.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/quantity-baseline-revisions",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Create a Project quantity baseline revision",
        security: [{ bearerAuth: [] }],
        body: projectQuantityBaselineRevisionCommandOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = projectQuantityBaselineRevisionCommandSchema.safeParse(
        request.body,
      );
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid quantity baseline command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.saveQuantityBaseline(
            scope(request),
            params.data.projectId,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/fronts",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Create a work front for a Project",
        security: [{ bearerAuth: [] }],
        body: projectWorkFrontCommandOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = projectWorkFrontCommandSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid work front command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.createWorkFront(
            scope(request),
            params.data.projectId,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.patch<{ Params: { projectId: string; frontId: string } }>(
    "/projects/:projectId/fronts/:frontId",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Update a planned work front",
        security: [{ bearerAuth: [] }],
        body: projectWorkFrontCommandOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectWorkFrontParamsSchema.safeParse(request.params);
      const body = projectWorkFrontCommandSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid work front command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.updateWorkFront(
            scope(request),
            params.data.projectId,
            params.data.frontId,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.put<{ Params: { projectId: string; frontId: string } }>(
    "/projects/:projectId/fronts/:frontId/services",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Replace the service distribution of a Project work front",
        security: [{ bearerAuth: [] }],
        body: projectWorkFrontServicesCommandOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectWorkFrontParamsSchema.safeParse(request.params);
      const body = projectWorkFrontServicesCommandSchema.safeParse(
        request.body,
      );
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid work front services command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.saveWorkFrontServices(
            scope(request),
            params.data.projectId,
            params.data.frontId,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.put<{ Params: { projectId: string } }>(
    "/projects/:projectId/mobilization/employees",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Reconcile employees mobilized to a Project",
        security: [{ bearerAuth: [] }],
        body: projectEmployeeMobilizationOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = projectEmployeeMobilizationCommandSchema.safeParse(
        request.body,
      );
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid employee mobilization command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.saveEmployeeMobilization(
            scope(request),
            params.data.projectId,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.put<{ Params: { projectId: string; shift: string } }>(
    "/projects/:projectId/mobilization/employees/:shift",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Reconcile employees mobilized to one Project shift",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "shift"],
          properties: {
            projectId: uuid,
            shift: { enum: ["day", "night"] },
          },
        },
        body: projectEmployeeMobilizationOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectShiftParamsSchema.safeParse(request.params);
      const body = projectEmployeeMobilizationCommandSchema.safeParse(
        request.body,
      );
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid shift employee mobilization command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.saveEmployeeMobilizationShift(
            scope(request),
            params.data.projectId,
            params.data.shift,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.put<{ Params: { projectId: string } }>(
    "/projects/:projectId/mobilization/machines",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Reconcile machines mobilized to a Project",
        security: [{ bearerAuth: [] }],
        body: projectMachineMobilizationOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = projectMachineMobilizationCommandSchema.safeParse(
        request.body,
      );
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid machine mobilization command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.saveMachineMobilization(
            scope(request),
            params.data.projectId,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.put<{ Params: { projectId: string; frontId: string } }>(
    "/projects/:projectId/fronts/:frontId/mobilization",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Prepare resources mobilized to a work front",
        security: [{ bearerAuth: [] }],
        body: projectWorkFrontMobilizationOpenApiSchema,
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectWorkFrontParamsSchema.safeParse(request.params);
      const body = projectWorkFrontMobilizationCommandSchema.safeParse(
        request.body,
      );
      if (!params.success || !body.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid work front mobilization command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.saveWorkFrontMobilization(
            scope(request),
            params.data.projectId,
            params.data.frontId,
            body.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.get<{
    Params: { projectId: string; frontId: string };
    Querystring: Record<string, unknown>;
  }>(
    "/projects/:projectId/fronts/:frontId/mobilization-options",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "List paginated work-front mobilization options",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["projectId", "frontId"],
          properties: { projectId: uuid, frontId: uuid },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["resourceType"],
          properties: {
            resourceType: { enum: ["employee", "machine"] },
            search: { type: "string", maxLength: 120 },
            limit: { type: "integer", minimum: 1, maximum: 15, default: 15 },
            cursor: { type: "string", maxLength: 2048 },
          },
        },
        response: {
          200: successSchema({
            type: "object",
            required: ["data", "pageInfo"],
            properties: {
              data: {
                type: "array",
                items: {
                  oneOf: [
                    workFrontMobilizationEmployeeOptionSchema,
                    workFrontMobilizationMachineOptionSchema,
                  ],
                },
              },
              pageInfo: cursorPageInfoSchema,
            },
          }),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectWorkFrontParamsSchema.safeParse(request.params);
      const query = projectWorkFrontMobilizationOptionsQuerySchema.safeParse(
        request.query,
      );
      if (!params.success || !query.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid work front mobilization options query",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.workFrontMobilizationOptions(
            scope(request),
            params.data.projectId,
            params.data.frontId,
            query.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  app.get<{
    Params: { projectId: string };
    Querystring: Record<string, unknown>;
  }>(
    "/projects/:projectId/mobilization-history",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "List Project or work-front mobilization history",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["resourceType"],
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            cursor: { type: "string", maxLength: 2048 },
            resourceType: { enum: ["employee", "machine"] },
            frontId: uuid,
            sortBy: { enum: ["effectiveFrom"], default: "effectiveFrom" },
            sortDirection: { enum: ["asc", "desc"], default: "desc" },
          },
        },
        response: {
          200: successSchema(mobilizationHistoryPageSchema),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const query = projectMobilizationHistoryQuerySchema.safeParse(
        request.query,
      );
      if (!params.success || !query.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid mobilization history query",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.mobilizationHistory(
            scope(request),
            params.data.projectId,
            query.data,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );

  for (const action of ["start", "cancel"] as const)
    app.post<{ Params: { projectId: string; frontId: string } }>(
      `/projects/:projectId/fronts/:frontId/${action}`,
      {
        preHandler: app.requireCompanyScope,
        schema: {
          tags: ["Projects"],
          summary: `${action === "start" ? "Start" : "Cancel"} a work front`,
          security: [{ bearerAuth: [] }],
          response: {
            200: successSchema(projectDetailSchema),
            400: errorSchema,
            404: errorSchema,
            409: errorSchema,
            415: errorSchema,
            422: errorSchema,
          },
        },
      },
      async (request, reply) => {
        const params = projectWorkFrontParamsSchema.safeParse(request.params);
        if (!params.success)
          return jsonResponse.error({
            reply,
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Invalid work front params",
          });
        try {
          const data =
            action === "start"
              ? await service.startWorkFront(
                  scope(request),
                  params.data.projectId,
                  params.data.frontId,
                )
              : await service.cancelWorkFront(
                  scope(request),
                  params.data.projectId,
                  params.data.frontId,
                );
          return jsonResponse.success({ reply, data });
        } catch (error) {
          return jsonResponse.fromError({ reply, error });
        }
      },
    );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/activate",
    {
      preHandler: app.requireCompanyScope,
      schema: {
        tags: ["Projects"],
        summary: "Activate a planned Project after readiness validation",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string", format: "uuid" } },
        },
        response: {
          200: successSchema(projectDetailSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          415: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const parsedParams = projectParamsSchema.safeParse(request.params);
      if (!parsedParams.success)
        return jsonResponse.error({
          reply,
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid Project activation command",
        });
      try {
        return jsonResponse.success({
          reply,
          data: await service.activate(
            scope(request),
            parsedParams.data.projectId,
          ),
        });
      } catch (error) {
        return jsonResponse.fromError({ reply, error });
      }
    },
  );
}

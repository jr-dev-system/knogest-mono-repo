"use client";

import * as React from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  BaseFormModal,
  type BaseFormModalRenderHelpers,
  type WizardStep,
} from "@/components/modals/BaseFormModal";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import type { MachineActionState } from "../machines-action-state";
import { meterTypeLabel, meterUnit, type MeterType } from "../meter-format";

type JobRole = { id: string; name: string };
type MachineAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;

const decimalPattern = /^\d+(?:[.,]\d{1,3})?$/;

const machineModelSchema = z
  .object({
    description: z
      .string()
      .trim()
      .max(1_000, "A descrição deve ter no máximo 1.000 caracteres."),
    loadVolumeM3: z.string().trim(),
    manufacturer: z
      .string()
      .trim()
      .min(1, "Informe o fabricante.")
      .max(160, "O fabricante deve ter no máximo 160 caracteres."),
    maxSupportedWeightT: z.string().trim(),
    meterType: z.enum(["HOUR_METER", "ODOMETER"]),
    model: z
      .string()
      .trim()
      .min(1, "Informe o modelo.")
      .max(160, "O modelo deve ter no máximo 160 caracteres."),
    requiredJobRoleId: z.string().trim(),
    requiresOperator: z.boolean(),
    type: z.enum(["YELLOW_LINE", "WHITE_LINE"]),
    units: z
      .array(
        z
          .object({
            companyTag: z
              .string()
              .trim()
              .max(120, "O patrimônio deve ter no máximo 120 caracteres."),
            initialMeterReading: z
              .string()
              .trim()
              .min(1, "Informe a leitura inicial.")
              .refine(
                (value) => decimalPattern.test(value),
                "Informe uma leitura válida com até três casas decimais.",
              ),
            name: z
              .string()
              .trim()
              .min(1, "Informe o nome da unidade.")
              .max(160, "O nome deve ter no máximo 160 caracteres."),
            plate: z
              .string()
              .trim()
              .max(32, "A placa deve ter no máximo 32 caracteres."),
          })
          .superRefine((unit, context) => {
            if (!unit.plate && !unit.companyTag) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Informe a placa, o patrimônio ou ambos.",
                path: ["plate"],
              });
            }
          }),
      )
      .min(1, "Cadastre ao menos uma unidade física."),
  })
  .superRefine((values, context) => {
    if (values.requiresOperator && !values.requiredJobRoleId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione a função exigida para operar este modelo.",
        path: ["requiredJobRoleId"],
      });
    }

    if (values.type !== "WHITE_LINE") return;

    for (const [field, label] of [
      ["loadVolumeM3", "Volume de carga"],
      ["maxSupportedWeightT", "Peso máximo suportado"],
    ] as const) {
      const value = values[field];
      if (!value) continue;
      const numericValue = Number(value.replace(",", "."));
      if (!decimalPattern.test(value) || numericValue <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} deve ser um número positivo com até três casas decimais.`,
          path: [field],
        });
      }
    }
  });

type MachineModelValues = z.infer<typeof machineModelSchema>;

const defaultValues: MachineModelValues = {
  description: "",
  loadVolumeM3: "",
  manufacturer: "",
  maxSupportedWeightT: "",
  meterType: "HOUR_METER",
  model: "",
  requiredJobRoleId: "",
  requiresOperator: true,
  type: "YELLOW_LINE",
  units: [
    {
      companyTag: "",
      initialMeterReading: "",
      name: "",
      plate: "",
    },
  ],
};

const fieldLabels = {
  description: "Descrição",
  loadVolumeM3: "Volume de carga",
  manufacturer: "Fabricante",
  maxSupportedWeightT: "Peso máximo suportado",
  meterType: "Tipo de leitura",
  model: "Modelo",
  requiredJobRoleId: "Função exigida",
  requiresOperator: "Exige operador",
  type: "Tipo",
  units: "Unidades físicas",
};

const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

function TextField({
  form,
  label,
  name,
  inputMode,
  placeholder,
}: {
  form: UseFormReturn<MachineModelValues>;
  label: string;
  name:
    | "manufacturer"
    | "model"
    | "description"
    | "loadVolumeM3"
    | "maxSupportedWeightT";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  const error = form.formState.errors[name];
  const id = `machine-model-${name}`;

  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>
      <span>{label}</span>
      <Input
        id={id}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className="h-11"
        {...form.register(name)}
      />
    </label>
  );
}

function ModelAndOperatorStep({
  form,
  jobRoles,
}: {
  form: UseFormReturn<MachineModelValues>;
  jobRoles: JobRole[];
}) {
  const type = form.watch("type");
  const requiresOperator = form.watch("requiresOperator");
  const selectedMeter = form.watch("meterType");
  const requiredRoleError = form.formState.errors.requiredJobRoleId;

  return (
    <div className="space-y-4">
      <FormSection
        title="Características do modelo"
        description="Essas informações serão compartilhadas por todas as unidades físicas."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label
            className="grid gap-1.5 text-sm font-semibold"
            htmlFor="machine-model-type"
          >
            <span>Tipo</span>
            <select
              id="machine-model-type"
              className={controlClass}
              aria-invalid={Boolean(form.formState.errors.type)}
              {...form.register("type")}
            >
              <option value="YELLOW_LINE">Linha amarela</option>
              <option value="WHITE_LINE">Linha branca</option>
            </select>
          </label>
          <TextField form={form} label="Fabricante" name="manufacturer" />
          <TextField form={form} label="Modelo" name="model" />
          <TextField form={form} label="Descrição" name="description" />
        </div>
      </FormSection>

      {type === "WHITE_LINE" && (
        <FormSection
          title="Capacidade de carga"
          description="Campos opcionais usados como referência na produção."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              form={form}
              label="Volume de carga (m³)"
              name="loadVolumeM3"
              inputMode="decimal"
              placeholder="Ex.: 12,500"
            />
            <TextField
              form={form}
              label="Peso máximo suportado (t)"
              name="maxSupportedWeightT"
              inputMode="decimal"
              placeholder="Ex.: 20,000"
            />
          </div>
        </FormSection>
      )}

      <FormSection
        title="Medição"
        description="A mesma unidade de leitura será usada por todas as unidades deste modelo."
      >
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="group"
          aria-label="Tipo de leitura"
        >
          {(["HOUR_METER", "ODOMETER"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={selectedMeter === option ? "default" : "outline"}
              aria-pressed={selectedMeter === option}
              className="min-h-11 justify-start font-bold"
              onClick={() =>
                form.setValue("meterType", option, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              {meterTypeLabel(option)} ({meterUnit(option)})
            </Button>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Regra de operador"
        description="Ela vale para todas as unidades físicas deste modelo."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label
            className="grid gap-1.5 text-sm font-semibold"
            htmlFor="machine-model-requires-operator"
          >
            <span>Exige operador?</span>
            <select
              id="machine-model-requires-operator"
              className={controlClass}
              value={requiresOperator ? "true" : "false"}
              onChange={(event) => {
                const nextValue = event.target.value === "true";
                form.setValue("requiresOperator", nextValue, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                if (!nextValue) {
                  form.setValue("requiredJobRoleId", "", { shouldDirty: true });
                  form.clearErrors("requiredJobRoleId");
                }
              }}
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </label>

          {requiresOperator && (
            <label
              className="grid gap-1.5 text-sm font-semibold"
              htmlFor="machine-model-required-role"
            >
              <span>Função exigida</span>
              <select
                id="machine-model-required-role"
                className={controlClass}
                aria-invalid={Boolean(requiredRoleError)}
                {...form.register("requiredJobRoleId")}
              >
                <option value="">Selecione a função</option>
                {jobRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </FormSection>
    </div>
  );
}

function UnitsStep({ form }: { form: UseFormReturn<MachineModelValues> }) {
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    name: "units",
  });
  const meterType = form.watch("meterType") as MeterType;

  return (
    <FormSection
      title="Unidades físicas"
      description="Identifique cada máquina física e registre sua leitura inicial."
    >
      <div className="space-y-4">
        {fields.map((field, index) => {
          const unitError = form.formState.errors.units?.[index];
          const prefix = `machine-unit-${field.id}`;

          return (
            <section
              key={field.id}
              aria-labelledby={`${prefix}-heading`}
              className="border-t border-border pt-4 first:border-t-0 first:pt-0"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id={`${prefix}-heading`} className="text-sm font-bold">
                  Unidade {index + 1}
                </h3>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 text-destructive hover:text-destructive"
                    aria-label={`Remover unidade ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" />
                    Remover
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <UnitField
                  form={form}
                  error={unitError?.name}
                  id={`${prefix}-name`}
                  index={index}
                  label="Nome da unidade"
                  field="name"
                />
                <UnitField
                  form={form}
                  error={unitError?.plate}
                  id={`${prefix}-plate`}
                  index={index}
                  label="Placa"
                  field="plate"
                />
                <UnitField
                  form={form}
                  error={unitError?.companyTag}
                  id={`${prefix}-company-tag`}
                  index={index}
                  label="Patrimônio"
                  field="companyTag"
                />
                <UnitField
                  form={form}
                  error={unitError?.initialMeterReading}
                  id={`${prefix}-initial-reading`}
                  index={index}
                  label={`Leitura inicial (${meterUnit(meterType)})`}
                  field="initialMeterReading"
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
            </section>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() =>
            append({
              companyTag: "",
              initialMeterReading: "",
              name: "",
              plate: "",
            })
          }
        >
          <Plus className="size-4" />
          Adicionar unidade
        </Button>
        <p className="text-sm leading-6 text-muted-foreground">
          Informe placa, patrimônio ou ambos. A leitura inicial aceita vírgula
          ou ponto decimal.
        </p>
      </div>
    </FormSection>
  );
}

function UnitField({
  error,
  field,
  form,
  id,
  index,
  inputMode,
  label,
  placeholder,
}: {
  error: unknown;
  field: "name" | "plate" | "companyTag" | "initialMeterReading";
  form: UseFormReturn<MachineModelValues>;
  id: string;
  index: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  placeholder?: string;
}) {
  const name = `units.${index}.${field}` as const;

  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>
      <span>{label}</span>
      <Input
        id={id}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className="h-11"
        {...form.register(name)}
      />
    </label>
  );
}

function ReviewRow({
  label,
  onEdit,
  value,
}: {
  label: string;
  onEdit: () => void;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <div className="mt-1 break-words text-sm font-semibold text-foreground">
          {value}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        Editar
      </Button>
    </div>
  );
}

function ReviewStep({
  form,
  helpers,
  jobRoles,
}: {
  form: UseFormReturn<MachineModelValues>;
  helpers: BaseFormModalRenderHelpers;
  jobRoles: JobRole[];
}) {
  const values = form.watch();
  const requiredRole = jobRoles.find(
    (role) => role.id === values.requiredJobRoleId,
  );

  return (
    <section aria-label="Revisão do cadastro" className="space-y-1">
      <p className="text-sm leading-6 text-muted-foreground">
        Revise antes de cadastrar. Você poderá alterar cada grupo sem perder o
        preenchimento.
      </p>
      <ReviewRow
        label="Modelo e operador"
        onEdit={() => helpers.goToStep(0)}
        value={
          <>
            <p>
              {values.manufacturer || "Fabricante não informado"} /{" "}
              {values.model || "Modelo não informado"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {values.requiresOperator
                ? `Exige ${requiredRole?.name ?? "função não selecionada"}`
                : "Não exige operador"}
            </p>
          </>
        }
      />
      <ReviewRow
        label="Medição e capacidade"
        onEdit={() => helpers.goToStep(0)}
        value={
          <>
            <p>
              {meterTypeLabel(values.meterType)} ({meterUnit(values.meterType)})
            </p>
            {values.type === "WHITE_LINE" &&
              (values.loadVolumeM3 || values.maxSupportedWeightT) && (
                <p className="mt-1 text-muted-foreground">
                  {[
                    values.loadVolumeM3 && `${values.loadVolumeM3} m³`,
                    values.maxSupportedWeightT &&
                      `${values.maxSupportedWeightT} t`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
          </>
        }
      />
      <ReviewRow
        label="Unidades físicas"
        onEdit={() => helpers.goToStep(1)}
        value={
          <ul className="space-y-1" aria-label="Unidades cadastradas">
            {values.units.map((unit, index) => (
              <li key={`${unit.name}-${index}`}>
                {unit.name || `Unidade ${index + 1}`}
                {unit.plate || unit.companyTag
                  ? ` · ${[unit.plate, unit.companyTag].filter(Boolean).join(" · ")}`
                  : ""}
              </li>
            ))}
          </ul>
        }
      />
    </section>
  );
}

function valuesToFormData(values: MachineModelValues) {
  const formData = new FormData();
  formData.set("description", values.description.trim());
  formData.set("manufacturer", values.manufacturer.trim());
  formData.set("meterType", values.meterType);
  formData.set("model", values.model.trim());
  formData.set("requiresOperator", String(values.requiresOperator));
  formData.set("type", values.type);
  if (values.requiresOperator) {
    formData.set("requiredJobRoleId", values.requiredJobRoleId);
  }
  if (values.type === "WHITE_LINE") {
    formData.set("loadVolumeM3", values.loadVolumeM3.trim());
    formData.set("maxSupportedWeightT", values.maxSupportedWeightT.trim());
  }
  for (const unit of values.units) {
    formData.append("unitName", unit.name.trim());
    formData.append("unitPlate", unit.plate.trim());
    formData.append("unitCompanyTag", unit.companyTag.trim());
    formData.append("unitInitialMeterReading", unit.initialMeterReading.trim());
  }
  return formData;
}

export function MachineModelCreationWizard({
  action,
  jobRoles,
}: {
  action: MachineAction;
  jobRoles: JobRole[];
}) {
  const steps = React.useMemo<WizardStep<MachineModelValues>[]>(
    () => [
      {
        title: "Modelo e operador",
        fields: [
          "type",
          "manufacturer",
          "model",
          "description",
          "meterType",
          "loadVolumeM3",
          "maxSupportedWeightT",
          "requiresOperator",
          "requiredJobRoleId",
        ],
        fieldLabels,
        component: (form) => (
          <ModelAndOperatorStep form={form} jobRoles={jobRoles} />
        ),
      },
      {
        title: "Unidades físicas",
        fields: ["units"],
        fieldLabels,
        component: (form) => <UnitsStep form={form} />,
      },
      {
        title: "Revisão",
        fields: [],
        component: (form, helpers) => (
          <ReviewStep form={form} helpers={helpers} jobRoles={jobRoles} />
        ),
      },
    ],
    [jobRoles],
  );

  return (
    <BaseFormModal<MachineModelValues>
      title="Cadastrar modelo de máquina"
      description="Conclua três etapas curtas para registrar o modelo e suas unidades físicas."
      icon={Truck}
      size="lg"
      schema={machineModelSchema}
      defaultValues={defaultValues}
      fieldLabels={fieldLabels}
      steps={steps}
      submitLabel="Cadastrar catálogo"
      onSubmit={async (values) => {
        const result = await action(
          { ok: false, message: "" },
          valuesToFormData(values),
        );
        if (!result.ok) throw new Error(result.message);
        toast.success(result.message || "Modelo e unidades cadastrados.");
      }}
      trigger={
        <Button type="button">
          <Plus className="size-4" />
          Nova máquina
        </Button>
      }
    />
  );
}

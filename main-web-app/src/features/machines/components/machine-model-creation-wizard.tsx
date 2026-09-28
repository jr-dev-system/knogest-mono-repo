"use client";

import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import { Pencil, Plus, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import {
  BaseFormModal,
  type BaseFormModalRenderHelpers,
  type WizardStep,
} from "@/components/modals/BaseFormModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import type {
  MachineAllocationProjectContextResult,
  MachineAllocationProjectsResult,
} from "../machine-allocation.types";
import type {
  MachineUnitBatchActionResult,
  MachineUnitBatchDraft,
} from "../machine-unit-batch.types";
import type { MachineActionState } from "../machines-action-state";
import type { MachineModelDetail } from "../machines.server";
import { MachineUnitBatchWizard } from "./machine-unit-batch-wizard";

type JobRole = { id: string; name: string };
type MachineAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;
type BatchAction = (
  machineModelId: string,
  input: MachineUnitBatchDraft,
) => Promise<MachineUnitBatchActionResult>;
type SearchProjectsAction = (input?: {
  cursor?: string | null;
  search?: string;
}) => Promise<MachineAllocationProjectsResult>;
type LoadProjectAction = (
  projectId: string,
) => Promise<MachineAllocationProjectContextResult>;

const decimalPattern = /^\d+(?:[.,]\d{1,3})?$/;
const capacityUnits = {
  M3_LOOSE: "m³ solto",
  M3_COMPACTED: "m³ compactado",
  LITER: "Litro (L)",
  CUBIC_YARD: "Jarda cúbica (yd³)",
} as const;

const schema = z
  .object({
    description: z.string().trim().max(500),
    manufacturer: z.string().trim().min(1, "Informe o fabricante.").max(120),
    model: z.string().trim().min(1, "Informe o modelo.").max(120),
    version: z.string().trim().max(120),
    type: z.enum(["YELLOW_LINE", "WHITE_LINE"]),
    loadCapacity: z.string().trim(),
    loadCapacityUnitCode: z.enum([
      "M3_LOOSE",
      "M3_COMPACTED",
      "LITER",
      "CUBIC_YARD",
    ]),
    maxSupportedWeightT: z.string().trim(),
    requiresOperator: z.boolean(),
    requiredJobRoleId: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (value.requiresOperator && !value.requiredJobRoleId)
      context.addIssue({
        code: "custom",
        path: ["requiredJobRoleId"],
        message: "Selecione a função exigida.",
      });
    if (value.type === "WHITE_LINE") {
      if (!value.loadCapacity)
        context.addIssue({
          code: "custom",
          path: ["loadCapacity"],
          message: "Informe a capacidade de carga.",
        });
      for (const field of ["loadCapacity", "maxSupportedWeightT"] as const) {
        const raw = value[field];
        if (
          raw &&
          (!decimalPattern.test(raw) || Number(raw.replace(",", ".")) <= 0)
        )
          context.addIssue({
            code: "custom",
            path: [field],
            message: "Informe um valor positivo com até três casas.",
          });
      }
    }
  });
type Values = z.infer<typeof schema>;

const defaults: Values = {
  description: "",
  manufacturer: "",
  model: "",
  version: "",
  type: "YELLOW_LINE",
  loadCapacity: "",
  loadCapacityUnitCode: "M3_LOOSE",
  maxSupportedWeightT: "",
  requiresOperator: true,
  requiredJobRoleId: "",
};
const fieldLabels: Partial<Record<keyof Values, string>> = {
  type: "Tipo",
  manufacturer: "Fabricante",
  model: "Modelo",
  version: "Versão",
  description: "Descrição",
  loadCapacity: "Capacidade de carga",
  loadCapacityUnitCode: "Unidade da capacidade",
  maxSupportedWeightT: "Peso máximo suportado",
  requiresOperator: "Exige operador",
  requiredJobRoleId: "Função exigida",
};
const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

function dialogTransitionDelay() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : 220;
}

function Field({
  form,
  name,
  label,
  inputMode,
}: {
  form: UseFormReturn<Values>;
  name: keyof Values;
  label: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <Input className="h-11" inputMode={inputMode} {...form.register(name)} />
    </label>
  );
}

function CatalogStep({
  form,
  onTypeChange,
}: {
  form: UseFormReturn<Values>;
  onTypeChange: (type: Values["type"]) => void;
}) {
  return (
    <FormSection
      title="Identificação do modelo"
      description="Defina como este modelo aparecerá no catálogo da empresa."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>Tipo</span>
          <select
            className={controlClass}
            value={form.watch("type")}
            onChange={(event) => {
              const type = event.target.value as Values["type"];
              form.setValue("type", type, { shouldDirty: true });
              if (type === "YELLOW_LINE") {
                form.setValue("loadCapacity", "");
                form.setValue("maxSupportedWeightT", "");
              }
              onTypeChange(type);
            }}
          >
            <option value="YELLOW_LINE">Linha amarela</option>
            <option value="WHITE_LINE">Linha branca</option>
          </select>
        </label>
        <Field form={form} name="manufacturer" label="Fabricante" />
        <Field form={form} name="model" label="Modelo" />
        <Field form={form} name="version" label="Versão (opcional)" />
        <div className="md:col-span-2">
          <Field form={form} name="description" label="Descrição (opcional)" />
        </div>
      </div>
    </FormSection>
  );
}

function CapacityStep({ form }: { form: UseFormReturn<Values> }) {
  return (
    <FormSection
      title="Capacidade de carga"
      description="A unidade informada será preservada; a produção converte o volume para m³."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          form={form}
          name="loadCapacity"
          label="Capacidade"
          inputMode="decimal"
        />
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>Unidade</span>
          <select
            className={controlClass}
            {...form.register("loadCapacityUnitCode")}
          >
            {Object.entries(capacityUnits).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Field
          form={form}
          name="maxSupportedWeightT"
          label="Peso máximo suportado (t, opcional)"
          inputMode="decimal"
        />
      </div>
    </FormSection>
  );
}

function OperatorStep({
  form,
  jobRoles,
}: {
  form: UseFormReturn<Values>;
  jobRoles: JobRole[];
}) {
  const requiresOperator = form.watch("requiresOperator");
  return (
    <FormSection
      title="Regra de operador"
      description="Esta regra será aplicada a todas as unidades criadas para o modelo."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>Exige operador?</span>
          <select
            className={controlClass}
            value={requiresOperator ? "true" : "false"}
            onChange={(event) => {
              const next = event.target.value === "true";
              form.setValue("requiresOperator", next, {
                shouldDirty: true,
                shouldValidate: true,
              });
              if (!next) form.setValue("requiredJobRoleId", "");
            }}
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </label>
        {requiresOperator && (
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>Função exigida</span>
            <select
              className={controlClass}
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
  );
}

function ReviewStep({
  form,
  helpers,
  jobRoles,
  isWhiteLine,
}: {
  form: UseFormReturn<Values>;
  helpers: BaseFormModalRenderHelpers;
  jobRoles: JobRole[];
  isWhiteLine: boolean;
}) {
  const values = form.watch();
  const role = jobRoles.find((item) => item.id === values.requiredJobRoleId);
  const rows = [
    {
      label: "Modelo",
      value: [values.manufacturer, values.model, values.version]
        .filter(Boolean)
        .join(" "),
      step: 0,
    },
    {
      label: "Tipo",
      value: isWhiteLine ? "Linha branca" : "Linha amarela",
      step: 0,
    },
    ...(isWhiteLine
      ? [
          {
            label: "Capacidade",
            value: `${values.loadCapacity} ${capacityUnits[values.loadCapacityUnitCode]}`,
            step: 1,
          },
          {
            label: "Peso máximo",
            value: values.maxSupportedWeightT
              ? `${values.maxSupportedWeightT} t`
              : "Não informado",
            step: 1,
          },
        ]
      : []),
    {
      label: "Regra de operador",
      value: values.requiresOperator
        ? `Exige ${role?.name ?? "função selecionada"}`
        : "Não exige operador",
      step: isWhiteLine ? 2 : 1,
    },
  ];
  return (
    <section aria-label="Revisão do modelo" className="space-y-1">
      <p className="pb-2 text-sm leading-6 text-muted-foreground">
        Revise os dados do modelo. Nenhuma solicitação é enviada ao chegar
        nesta etapa.
      </p>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-muted-foreground">
              {row.label}
            </p>
            <p className="mt-1 break-words text-sm font-semibold">
              {row.value}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => helpers.goToStep(row.step)}
          >
            Editar
          </Button>
        </div>
      ))}
    </section>
  );
}

function toFormData(values: Values) {
  const data = new FormData();
  for (const field of [
    "description",
    "manufacturer",
    "model",
    "version",
    "type",
    "loadCapacity",
    "loadCapacityUnitCode",
    "maxSupportedWeightT",
    "requiredJobRoleId",
  ] as const)
    data.set(field, values[field].trim());
  data.set("requiresOperator", String(values.requiresOperator));
  return data;
}

export function MachineModelCreationWizard({
  action,
  batchAction,
  jobRoles,
  loadProjectAction,
  searchProjectsAction,
}: {
  action: MachineAction;
  batchAction: BatchAction;
  jobRoles: JobRole[];
  loadProjectAction: LoadProjectAction;
  searchProjectsAction: SearchProjectsAction;
}) {
  const [selectedType, setSelectedType] =
    React.useState<Values["type"]>("YELLOW_LINE");
  const [createdModel, setCreatedModel] = React.useState<NonNullable<
    MachineActionState["createdModel"]
  > | null>(null);
  const [promptOpen, setPromptOpen] = React.useState(false);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [promptQueued, setPromptQueued] = React.useState(false);
  const [batchQueued, setBatchQueued] = React.useState(false);
  const isWhiteLine = selectedType === "WHITE_LINE";

  React.useEffect(() => {
    if (!promptQueued) return;
    const timer = window.setTimeout(() => {
      setPromptQueued(false);
      setPromptOpen(true);
    }, dialogTransitionDelay());
    return () => window.clearTimeout(timer);
  }, [promptQueued]);

  React.useEffect(() => {
    if (!batchQueued) return;
    const timer = window.setTimeout(() => {
      setBatchQueued(false);
      setBatchOpen(true);
    }, dialogTransitionDelay());
    return () => window.clearTimeout(timer);
  }, [batchQueued]);
  const steps = React.useMemo<WizardStep<Values>[]>(() => {
    const result: WizardStep<Values>[] = [
      {
        title: "Modelo",
        fields: ["type", "manufacturer", "model", "version", "description"],
        fieldLabels,
        component: (form) => (
          <CatalogStep form={form} onTypeChange={setSelectedType} />
        ),
      },
    ];
    if (isWhiteLine)
      result.push({
        title: "Capacidade",
        fields: ["loadCapacity", "loadCapacityUnitCode", "maxSupportedWeightT"],
        fieldLabels,
        component: (form) => <CapacityStep form={form} />,
      });
    result.push(
      {
        title: "Operador",
        fields: ["requiresOperator", "requiredJobRoleId"],
        fieldLabels,
        component: (form) => <OperatorStep form={form} jobRoles={jobRoles} />,
      },
      {
        title: "Revisão",
        fields: [],
        fieldLabels,
        component: (form, helpers) => (
          <ReviewStep
            form={form}
            helpers={helpers}
            isWhiteLine={isWhiteLine}
            jobRoles={jobRoles}
          />
        ),
      },
    );
    return result;
  }, [isWhiteLine, jobRoles]);

  return (
    <>
      <BaseFormModal<Values>
        title="Novo modelo"
        description="Cadastre o modelo, sua capacidade e a regra de operador antes de criar unidades físicas."
        icon={Truck}
        size="lg"
        schema={schema}
        defaultValues={defaults}
        fieldLabels={fieldLabels}
        steps={steps}
        submitLabel="Criar modelo"
        onSessionStart={() => setSelectedType("YELLOW_LINE")}
        onSubmit={async (values) => {
          const result = await action(
            { ok: false, message: "" },
            toFormData(values),
          );
          if (!result.ok || !result.createdModel)
            throw new Error(
              result.message || "Não foi possível criar o modelo.",
            );
          toast.success(result.message);
          setCreatedModel(result.createdModel);
          setPromptQueued(true);
        }}
        trigger={
          <Button type="button">
            <Plus className="size-4" />
            Novo modelo
          </Button>
        }
      />

      <AlertDialog open={promptOpen} onOpenChange={setPromptOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Criar unidades agora?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo {createdModel?.name} foi cadastrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCreatedModel(null)}>
              Agora não
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPromptOpen(false);
                setBatchQueued(true);
              }}
            >
              Criar unidades
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {createdModel && (
        <MachineUnitBatchWizard
          action={batchAction}
          loadProjectAction={loadProjectAction}
          model={createdModel}
          onOpenChange={(open) => {
            setBatchOpen(open);
            if (!open) setCreatedModel(null);
          }}
          open={batchOpen}
          searchProjectsAction={searchProjectsAction}
        />
      )}
    </>
  );
}

export function MachineModelEditWizard({
  action,
  jobRoles,
  model,
}: {
  action: MachineAction;
  jobRoles: JobRole[];
  model: MachineModelDetail;
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] =
    React.useState<Values["type"]>(model.type);
  const isWhiteLine = selectedType === "WHITE_LINE";
  const defaultValues = React.useMemo<Values>(
    () => ({
      description: model.description ?? "",
      manufacturer: model.manufacturer,
      model: model.model,
      version: model.version ?? "",
      type: model.type,
      loadCapacity: model.loadCapacity ?? "",
      loadCapacityUnitCode:
        model.loadCapacityUnitCode ?? "M3_LOOSE",
      maxSupportedWeightT: model.maxSupportedWeightT ?? "",
      requiresOperator: model.requiresOperator,
      requiredJobRoleId: model.requiredJobRole?.id ?? "",
    }),
    [model],
  );
  const steps = React.useMemo<WizardStep<Values>[]>(() => {
    const result: WizardStep<Values>[] = [
      {
        title: "Modelo",
        fields: ["type", "manufacturer", "model", "version", "description"],
        fieldLabels,
        component: (form) => (
          <CatalogStep form={form} onTypeChange={setSelectedType} />
        ),
      },
    ];
    if (isWhiteLine)
      result.push({
        title: "Capacidade",
        fields: ["loadCapacity", "loadCapacityUnitCode", "maxSupportedWeightT"],
        fieldLabels,
        component: (form) => <CapacityStep form={form} />,
      });
    result.push(
      {
        title: "Operador",
        fields: ["requiresOperator", "requiredJobRoleId"],
        fieldLabels,
        component: (form) => <OperatorStep form={form} jobRoles={jobRoles} />,
      },
      {
        title: "Revisão",
        fields: [],
        fieldLabels,
        component: (form, helpers) => (
          <ReviewStep
            form={form}
            helpers={helpers}
            isWhiteLine={isWhiteLine}
            jobRoles={jobRoles}
          />
        ),
      },
    );
    return result;
  }, [isWhiteLine, jobRoles]);

  return (
    <BaseFormModal<Values>
      title="Editar modelo"
      description="Atualize o catálogo e a regra aplicada às unidades deste modelo."
      icon={Pencil}
      size="lg"
      schema={schema}
      defaultValues={defaultValues}
      fieldLabels={fieldLabels}
      steps={steps}
      submitLabel="Salvar alterações"
      onSessionStart={() => setSelectedType(model.type)}
      onSubmit={async (values) => {
        const result = await action(
          { ok: false, message: "" },
          toFormData(values),
        );
        if (!result.ok)
          throw new Error(result.message || "Não foi possível editar o modelo.");
        toast.success(result.message);
        router.refresh();
      }}
      trigger={
        <Button type="button" variant="outline">
          <Pencil className="size-4" />
          Editar modelo
        </Button>
      }
    />
  );
}

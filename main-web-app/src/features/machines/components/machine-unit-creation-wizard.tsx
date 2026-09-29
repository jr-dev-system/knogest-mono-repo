"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { UseFormReturn } from "react-hook-form";
import { Building2, Loader2, Plus, Search, Truck } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type {
  MachineAllocationProjectContext,
  MachineAllocationProjectContextResult,
  MachineAllocationProjectOption,
  MachineAllocationProjectsResult,
} from "../machine-allocation.types";
import type { MachineActionState } from "../machines-action-state";
import { meterTypeLabel, meterUnit } from "../meter-format";

type MachineAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;
type SearchProjectsAction = (input?: {
  cursor?: string | null;
  search?: string;
}) => Promise<MachineAllocationProjectsResult>;
type LoadProjectAction = (
  projectId: string,
) => Promise<MachineAllocationProjectContextResult>;

const decimalPattern = /^(?:0|[1-9]\d{0,11})(?:[.,]\d{1,2})?$/;
const specificationPattern = /^(?:0|[1-9]\d{0,6})(?:[.,]\d{1,3})?$/;
const hourlyRatePattern = /^(?:0|[1-9]\d{0,13})(?:[.,]\d{1,2})?$/;
const identifierPattern = /[A-Za-z0-9]/u;

const baseSchema = z.object({
  unitName: z.string().trim().max(160, "Use no máximo 160 caracteres."),
  unitPlate: z.string().trim().max(80, "Use no máximo 80 caracteres."),
  unitCompanyTag: z.string().trim().max(80, "Use no máximo 80 caracteres."),
  unitMeterType: z.enum(["HOUR_METER", "ODOMETER"]),
  unitInitialMeterReading: z.string().trim(),
  unitHourlyRate: z.string().trim(),
  unitLoadCapacity: z.string().trim(),
  unitLoadCapacityUnitCode: z.enum([
    "M3_LOOSE",
    "M3_COMPACTED",
    "LITER",
    "CUBIC_YARD",
  ]),
  unitMaxSupportedWeightT: z.string().trim(),
  unitAllocateNow: z.enum(["no", "yes"]),
  unitProjectId: z.string().trim(),
  unitDayOperatorEmploymentId: z.string().trim(),
  unitNightOperatorEmploymentId: z.string().trim(),
});

type Values = z.infer<typeof baseSchema>;

function createSchema(modelRule: { requiresOperator: boolean; type: string }) {
  return baseSchema.superRefine((values, context) => {
    if (!values.unitPlate && !values.unitCompanyTag) {
      context.addIssue({
        code: "custom",
        path: ["unitPlate"],
        message: "Informe a placa ou o patrimônio.",
      });
    }
    for (const field of ["unitPlate", "unitCompanyTag"] as const) {
      if (values[field] && !identifierPattern.test(values[field])) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Use ao menos uma letra ou um número.",
        });
      }
    }
    if (!decimalPattern.test(values.unitInitialMeterReading)) {
      context.addIssue({
        code: "custom",
        path: ["unitInitialMeterReading"],
        message: "Informe uma leitura válida com até duas casas decimais.",
      });
    }
    if (values.unitHourlyRate && !isPositiveRate(values.unitHourlyRate)) {
      context.addIssue({
        code: "custom",
        path: ["unitHourlyRate"],
        message: "Informe um valor positivo com até duas casas decimais.",
      });
    }
    if (modelRule.type !== "WHITE_LINE" && values.unitLoadCapacity) {
      context.addIssue({
        code: "custom",
        path: ["unitLoadCapacity"],
        message: "Capacidade é permitida somente para linha branca.",
      });
    }
    for (const field of [
      "unitLoadCapacity",
      "unitMaxSupportedWeightT",
    ] as const) {
      if (
        values[field] &&
        (!specificationPattern.test(values[field]) ||
          Number(values[field].replace(",", ".")) <= 0)
      )
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Informe um valor positivo com até três casas decimais.",
        });
    }
    if (values.unitAllocateNow !== "yes") return;
    if (!values.unitProjectId) {
      context.addIssue({
        code: "custom",
        path: ["unitProjectId"],
        message: "Selecione a obra de destino.",
      });
    }
    if (
      modelRule.requiresOperator &&
      !values.unitDayOperatorEmploymentId &&
      !values.unitNightOperatorEmploymentId
    ) {
      context.addIssue({
        code: "custom",
        path: ["unitDayOperatorEmploymentId"],
        message: "Selecione ao menos um operador compatível.",
      });
    }
  });
}

function isPositiveRate(value: string) {
  return (
    hourlyRatePattern.test(value) && Number(value.replace(",", ".")) > 0
  );
}

const defaultValues: Values = {
  unitName: "",
  unitPlate: "",
  unitCompanyTag: "",
  unitMeterType: "HOUR_METER",
  unitInitialMeterReading: "",
  unitHourlyRate: "",
  unitLoadCapacity: "",
  unitLoadCapacityUnitCode: "M3_LOOSE",
  unitMaxSupportedWeightT: "",
  unitAllocateNow: "no",
  unitProjectId: "",
  unitDayOperatorEmploymentId: "",
  unitNightOperatorEmploymentId: "",
};

const fieldLabels: Record<keyof Values, string> = {
  unitName: "Nome",
  unitPlate: "Placa",
  unitCompanyTag: "Patrimônio",
  unitMeterType: "Medidor",
  unitInitialMeterReading: "Leitura inicial",
  unitHourlyRate: "Valor/hora",
  unitLoadCapacity: "Capacidade de carga",
  unitLoadCapacityUnitCode: "Unidade da capacidade",
  unitMaxSupportedWeightT: "Peso máximo suportado",
  unitAllocateNow: "Alocação imediata",
  unitProjectId: "Obra",
  unitDayOperatorEmploymentId: "Operador diurno",
  unitNightOperatorEmploymentId: "Operador noturno",
};

const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  form,
  inputMode,
  label,
  name,
  placeholder,
}: {
  form: UseFormReturn<Values>;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  name: keyof Values;
  placeholder?: string;
}) {
  const error = form.formState.errors[name];
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <Input
        className="h-11"
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        disabled={form.formState.isSubmitting}
        {...form.register(name)}
      />
    </label>
  );
}

function IdentificationStep({ form }: { form: UseFormReturn<Values> }) {
  return (
    <FormSection
      title="Identificação da unidade"
      description="Informe pelo menos uma identificação operacional: placa ou patrimônio."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          form={form}
          name="unitName"
          label="Nome (opcional)"
          placeholder="Ex.: Caminhão 04"
        />
        <Field
          form={form}
          name="unitPlate"
          label="Placa"
          placeholder="Ex.: ABC-1D23"
        />
        <Field
          form={form}
          name="unitCompanyTag"
          label="Patrimônio"
          placeholder="Ex.: FROTA-042"
        />
      </div>
    </FormSection>
  );
}

function OperationStep({
  form,
  isWhiteLine,
}: {
  form: UseFormReturn<Values>;
  isWhiteLine: boolean;
}) {
  return (
    <div className="space-y-4">
      <FormSection
        title="Medição inicial"
        description="O tipo de medidor não poderá ser alterado após o cadastro."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>Medidor</span>
            <select
              className={controlClass}
              disabled={form.formState.isSubmitting}
              aria-invalid={Boolean(form.formState.errors.unitMeterType)}
              {...form.register("unitMeterType")}
            >
              <option value="HOUR_METER">Horímetro</option>
              <option value="ODOMETER">Odômetro</option>
            </select>
          </label>
          <Field
            form={form}
            name="unitInitialMeterReading"
            label="Leitura inicial"
            inputMode="decimal"
            placeholder="Ex.: 1250,50"
          />
        </div>
      </FormSection>
      <FormSection title="Custo" description="O valor/hora é opcional.">
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            form={form}
            name="unitHourlyRate"
            label="Valor/hora (opcional)"
            inputMode="decimal"
            placeholder="Ex.: 350,00"
          />
        </div>
      </FormSection>
      {isWhiteLine && (
        <FormSection
          title="Capacidade de carga"
          description="Capacidade e peso são opcionais e pertencem somente a esta unidade."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              form={form}
              name="unitLoadCapacity"
              label="Capacidade (opcional)"
              inputMode="decimal"
            />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Unidade</span>
              <select
                className={controlClass}
                {...form.register("unitLoadCapacityUnitCode")}
              >
                <option value="M3_LOOSE">m³ solto</option>
                <option value="M3_COMPACTED">m³ compactado</option>
                <option value="LITER">Litro (L)</option>
                <option value="CUBIC_YARD">Jarda cúbica (yd³)</option>
              </select>
            </label>
            <Field
              form={form}
              name="unitMaxSupportedWeightT"
              label="Peso máximo suportado (t, opcional)"
              inputMode="decimal"
            />
          </div>
        </FormSection>
      )}
    </div>
  );
}

function AllocationStep({
  form,
  loadProjectAction,
  modelRule,
  projectContext,
  searchProjectsAction,
  setProjectContext,
}: {
  form: UseFormReturn<Values>;
  loadProjectAction: LoadProjectAction;
  modelRule: {
    type: "YELLOW_LINE" | "WHITE_LINE";
    requiresOperator: boolean;
    requiredJobRoleId: string | null;
    requiredJobRoleName: string | null;
  };
  projectContext: MachineAllocationProjectContext | null;
  searchProjectsAction: SearchProjectsAction;
  setProjectContext: (project: MachineAllocationProjectContext | null) => void;
}) {
  const allocateNow = form.watch("unitAllocateNow");
  const selectedProjectId = form.watch("unitProjectId");
  const [search, setSearch] = React.useState("");
  const [projects, setProjects] = React.useState<
    MachineAllocationProjectOption[]
  >([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isLoadingProject, setIsLoadingProject] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");

  React.useEffect(() => {
    if (allocateNow !== "yes") return;
    let active = true;
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      const result = await searchProjectsAction({ search });
      if (!active) return;
      if (result.ok) {
        setProjects(result.page.data);
        setNextCursor(result.page.pageInfo.nextCursor);
        setLoadError("");
      } else {
        setProjects([]);
        setNextCursor(null);
        setLoadError(result.message);
      }
      setIsSearching(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [allocateNow, search, searchProjectsAction]);

  const selectProject = async (project: MachineAllocationProjectOption) => {
    form.setValue("unitProjectId", project.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("unitDayOperatorEmploymentId", "", { shouldDirty: true });
    form.setValue("unitNightOperatorEmploymentId", "", {
      shouldDirty: true,
    });
    setProjectContext(null);
    setLoadError("");
    setIsLoadingProject(true);
    const result = await loadProjectAction(project.id);
    if (result.ok) {
      setProjectContext(result.project);
    } else {
      form.setValue("unitProjectId", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      setLoadError(result.message);
    }
    setIsLoadingProject(false);
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setIsSearching(true);
    const result = await searchProjectsAction({ cursor: nextCursor, search });
    if (result.ok) {
      setProjects((current) => [
        ...current,
        ...result.page.data.filter(
          (candidate) => !current.some((item) => item.id === candidate.id),
        ),
      ]);
      setNextCursor(result.page.pageInfo.nextCursor);
    } else {
      setLoadError(result.message);
    }
    setIsSearching(false);
  };

  const acceptsAnyJobRole =
    normalizeRoleName(modelRule.requiredJobRoleName ?? "") === "qualquer um";
  const eligibleOperators = (shift: "day" | "night") =>
    (projectContext?.operators ?? []).filter(
      (operator) =>
        operator.shift === shift &&
        (acceptsAnyJobRole ||
          !modelRule.requiredJobRoleId ||
          operator.confirmedJobRoleId === modelRule.requiredJobRoleId),
    );

  return (
    <div className="space-y-4">
      <FormSection
        title="Alocação inicial"
        description="Você pode deixar a unidade disponível ou mobilizá-la em uma obra agora."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            checked={allocateNow === "no"}
            description="A unidade ficará disponível no catálogo."
            label="Não alocar agora"
            value="no"
            register={form.register("unitAllocateNow")}
          />
          <ChoiceCard
            checked={allocateNow === "yes"}
            description="Cria e mobiliza na mesma operação."
            label="Alocar em uma obra"
            value="yes"
            register={form.register("unitAllocateNow")}
          />
        </div>
      </FormSection>
      {allocateNow === "yes" && (
        <>
          <FormSection
            title="Obra de destino"
            description="Somente obras planejadas ou em andamento aceitam a mobilização."
          >
            <label className="relative block">
              <span className="sr-only">Buscar obra</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar obra por nome ou contrato"
              />
            </label>
            <div
              className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-md border border-border p-2"
              aria-label="Obras disponíveis"
            >
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                    selectedProjectId === project.id
                      ? "border-primary bg-primary/8"
                      : "border-transparent hover:bg-accent",
                  )}
                  aria-pressed={selectedProjectId === project.id}
                  onClick={() => void selectProject(project)}
                  disabled={isLoadingProject}
                >
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {project.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {project.contractNumber ?? "Sem contrato informado"} ·{" "}
                      {project.status === "active"
                        ? "Em andamento"
                        : "Planejada"}
                    </span>
                  </span>
                </button>
              ))}
              {isSearching && (
                <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  Buscando obras...
                </p>
              )}
              {!isSearching && projects.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhuma obra elegível encontrada.
                </p>
              )}
              {nextCursor && !isSearching && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void loadMore()}
                >
                  Carregar mais obras
                </Button>
              )}
            </div>
            {loadError && (
              <p
                role="status"
                className="mt-2 text-sm font-semibold text-destructive"
              >
                {loadError}
              </p>
            )}
          </FormSection>
          {isLoadingProject && (
            <p className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              Carregando equipe e turnos da obra...
            </p>
          )}
          {projectContext && modelRule.requiresOperator && (
            <FormSection
              title="Operadores"
              description={`O modelo exige ${modelRule.requiredJobRoleName ?? "um operador compatível"}. Selecione ao menos um turno.`}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {projectContext.shifts.map((shift) => {
                  const operators = eligibleOperators(shift);
                  const field =
                    shift === "day"
                      ? "unitDayOperatorEmploymentId"
                      : "unitNightOperatorEmploymentId";
                  return (
                    <label
                      key={shift}
                      className="grid gap-1.5 text-sm font-semibold"
                    >
                      <span>
                        {shift === "day"
                          ? "Operador diurno"
                          : "Operador noturno"}
                      </span>
                      <select
                        className={controlClass}
                        {...form.register(field)}
                      >
                        <option value="">Não selecionar</option>
                        {operators.map((operator) => (
                          <option
                            key={operator.employmentId}
                            value={operator.employmentId}
                          >
                            {operator.name} · {operator.jobRole}
                          </option>
                        ))}
                      </select>
                      {operators.length === 0 && (
                        <span className="text-xs font-medium text-muted-foreground">
                          Nenhum integrante elegível neste turno.
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </FormSection>
          )}
        </>
      )}
    </div>
  );
}

function ChoiceCard({
  checked,
  description,
  label,
  register,
  value,
}: {
  checked: boolean;
  description: string;
  label: string;
  register: ReturnType<UseFormReturn<Values>["register"]>;
  value: "no" | "yes";
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors",
        checked
          ? "border-primary bg-primary/8"
          : "border-border hover:bg-accent",
      )}
    >
      <input type="radio" value={value} className="mt-1" {...register} />
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

function ReviewStep({
  form,
  helpers,
  hasEligibleProjects,
  projectContext,
}: {
  form: UseFormReturn<Values>;
  helpers: BaseFormModalRenderHelpers;
  hasEligibleProjects: boolean;
  projectContext: MachineAllocationProjectContext | null;
}) {
  const values = form.watch();
  const identifier = [
    values.unitPlate ? `Placa ${values.unitPlate}` : "",
    values.unitCompanyTag ? `Patrimônio ${values.unitCompanyTag}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const meter = `${values.unitInitialMeterReading} ${meterUnit(values.unitMeterType)}`;
  const operatorNames = projectContext?.operators
    .filter((operator) =>
      [
        values.unitDayOperatorEmploymentId,
        values.unitNightOperatorEmploymentId,
      ].includes(operator.employmentId),
    )
    .map(
      (operator) =>
        `${operator.shift === "day" ? "Diurno" : "Noturno"}: ${operator.name}`,
    )
    .join(" · ");

  return (
    <section aria-label="Revisão da unidade" className="space-y-1">
      <p className="text-sm leading-6 text-muted-foreground">
        Revise os dados antes de criar a unidade. A criação e a mobilização,
        quando escolhida, serão confirmadas juntas.
      </p>
      <ReviewRow
        label="Nome"
        value={values.unitName || "Gerado a partir da identificação"}
        onEdit={() => helpers.goToStep(0)}
      />
      <ReviewRow
        label="Identificadores"
        value={identifier}
        onEdit={() => helpers.goToStep(0)}
      />
      <ReviewRow
        label="Medidor e leitura inicial"
        value={`${meterTypeLabel(values.unitMeterType)} · ${meter}`}
        onEdit={() => helpers.goToStep(1)}
      />
      <ReviewRow
        label="Valor/hora"
        value={values.unitHourlyRate ? `R$ ${values.unitHourlyRate}/h` : "Não informado"}
        onEdit={() => helpers.goToStep(1)}
      />
      {hasEligibleProjects && (
        <ReviewRow
          label="Alocação inicial"
          value={
            values.unitAllocateNow === "yes"
              ? (projectContext?.name ?? "Obra selecionada")
              : "Não alocar agora"
          }
          onEdit={() => helpers.goToStep(2)}
        />
      )}
      {values.unitAllocateNow === "yes" && operatorNames && (
        <ReviewRow
          label="Operadores"
          value={operatorNames}
          onEdit={() => helpers.goToStep(2)}
        />
      )}
    </section>
  );
}

function ReviewRow({
  label,
  onEdit,
  value,
}: {
  label: string;
  onEdit: () => void;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-foreground">
          {value || "Não informado"}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        Editar
      </Button>
    </div>
  );
}

function toFormData(values: Values) {
  const data = new FormData();
  for (const field of Object.keys(values) as (keyof Values)[]) {
    data.set(field, values[field].trim());
  }
  for (const field of [
    "unitInitialMeterReading",
    "unitHourlyRate",
    "unitLoadCapacity",
    "unitMaxSupportedWeightT",
  ] as const) {
    data.set(field, values[field].trim().replace(",", "."));
  }
  return data;
}

function normalizeRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function MachineUnitCreationWizard({
  action,
  loadProjectAction,
  modelName,
  modelRule,
  searchProjectsAction,
}: {
  action: MachineAction;
  loadProjectAction: LoadProjectAction;
  modelName: string;
  modelRule: {
    type: "YELLOW_LINE" | "WHITE_LINE";
    requiresOperator: boolean;
    requiredJobRoleId: string | null;
    requiredJobRoleName: string | null;
  };
  searchProjectsAction: SearchProjectsAction;
}) {
  const router = useRouter();
  const [projectContext, setProjectContext] =
    React.useState<MachineAllocationProjectContext | null>(null);
  const [hasEligibleProjects, setHasEligibleProjects] = React.useState(false);
  const schema = React.useMemo(
    () => createSchema(modelRule),
    [modelRule],
  );
  const steps = React.useMemo<WizardStep<Values>[]>(() => {
    const result: WizardStep<Values>[] = [
      {
        title: "Identificação",
        fields: ["unitName", "unitPlate", "unitCompanyTag"],
        fieldLabels,
        component: (form) => <IdentificationStep form={form} />,
      },
      {
        title: "Medição e custos",
        fields: [
          "unitMeterType",
          "unitInitialMeterReading",
          "unitHourlyRate",
          "unitLoadCapacity",
          "unitLoadCapacityUnitCode",
          "unitMaxSupportedWeightT",
        ],
        fieldLabels,
        component: (form) => (
          <OperationStep
            form={form}
            isWhiteLine={modelRule.type === "WHITE_LINE"}
          />
        ),
      },
    ];
    if (hasEligibleProjects)
      result.push({
        title: "Alocação",
        fields: [
          "unitAllocateNow",
          "unitProjectId",
          "unitDayOperatorEmploymentId",
          "unitNightOperatorEmploymentId",
        ],
        fieldLabels,
        component: (form) => (
          <AllocationStep
            form={form}
            loadProjectAction={loadProjectAction}
            modelRule={modelRule}
            projectContext={projectContext}
            searchProjectsAction={searchProjectsAction}
            setProjectContext={setProjectContext}
          />
        ),
      });
    result.push({
        title: "Revisão",
        fields: [],
        component: (form, helpers) => (
          <ReviewStep
            form={form}
            helpers={helpers}
            hasEligibleProjects={hasEligibleProjects}
            projectContext={projectContext}
          />
        ),
      });
    return result;
  }, [
    hasEligibleProjects,
    loadProjectAction,
    modelRule,
    projectContext,
    searchProjectsAction,
  ]);

  return (
    <BaseFormModal<Values>
      title="Criar unidade"
      description={`Adicione uma unidade física ao modelo ${modelName}.`}
      icon={Truck}
      size="lg"
      schema={schema}
      defaultValues={defaultValues}
      fieldLabels={fieldLabels}
      steps={steps}
      submitLabel="Criar unidade"
      onSessionStart={() => {
        setProjectContext(null);
        setHasEligibleProjects(false);
        void searchProjectsAction().then((result) => {
          setHasEligibleProjects(result.ok && result.page.data.length > 0);
        });
      }}
      onSubmit={async (values) => {
        const result = await action(
          { ok: false, message: "" },
          toFormData(values),
        );
        if (!result.ok) throw new Error(result.message);
        toast.success(result.message);
        router.refresh();
      }}
      trigger={
        <Button type="button">
          <Plus className="size-4" />
          Nova unidade
        </Button>
      }
    />
  );
}

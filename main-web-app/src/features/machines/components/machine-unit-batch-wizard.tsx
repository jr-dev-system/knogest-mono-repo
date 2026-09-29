"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { FormWizardProgress } from "@/components/ui/form-wizard-progress";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";
import { cn } from "@/lib/utils";
import type {
  MachineAllocationProjectContext,
  MachineAllocationProjectContextResult,
  MachineAllocationProjectOption,
  MachineAllocationProjectsResult,
} from "../machine-allocation.types";
import type {
  MachineUnitBatchActionResult,
  MachineUnitBatchDraft,
} from "../machine-unit-batch.types";
import type { MachineActionState } from "../machines-action-state";
import { meterTypeLabel, meterUnit } from "../meter-format";

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

type BatchUnit = {
  id: string;
  name: string;
  plate: string;
  companyTag: string;
  meterType: "HOUR_METER" | "ODOMETER";
  initialMeterReading: string;
  hourlyRate: string;
  loadCapacity: string;
  loadCapacityUnitCode:
    | "M3_LOOSE"
    | "M3_COMPACTED"
    | "LITER"
    | "CUBIC_YARD";
  maxSupportedWeightT: string;
  dayOperatorEmploymentId: string;
  nightOperatorEmploymentId: string;
  serverError?: string;
};

const steps = [
  { title: "Obra" },
  { title: "Identificação" },
  { title: "Medição" },
  { title: "Alocação" },
  { title: "Revisão" },
];
const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const decimalPattern = /^(?:0|[1-9]\d{0,11})(?:[.,]\d{1,2})?$/;
const positiveRatePattern = /^(?:0|[1-9]\d{0,13})(?:[.,]\d{1,2})?$/;
const specificationPattern = /^(?:0|[1-9]\d{0,6})(?:[.,]\d{1,3})?$/;

function newUnit(): BatchUnit {
  return {
    id: crypto.randomUUID(),
    name: "",
    plate: "",
    companyTag: "",
    meterType: "HOUR_METER",
    initialMeterReading: "0",
    hourlyRate: "",
    loadCapacity: "",
    loadCapacityUnitCode: "M3_LOOSE",
    maxSupportedWeightT: "",
    dayOperatorEmploymentId: "",
    nightOperatorEmploymentId: "",
  };
}

function normalizeIdentifier(value: string) {
  return value.replace(/[^A-Za-z0-9]/gu, "").toUpperCase();
}

function normalizeRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function MachineUnitBatchWizard({
  action,
  loadProjectAction,
  model,
  onOpenChange,
  open,
  searchProjectsAction,
}: {
  action: BatchAction;
  loadProjectAction: LoadProjectAction;
  model: NonNullable<MachineActionState["createdModel"]>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  searchProjectsAction: SearchProjectsAction;
}) {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [units, setUnits] = React.useState<BatchUnit[]>(() => [newUnit()]);
  const [projects, setProjects] = React.useState<
    MachineAllocationProjectOption[]
  >([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [projectContext, setProjectContext] =
    React.useState<MachineAllocationProjectContext | null>(null);
  const [search, setSearch] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [isLoadingProject, setIsLoadingProject] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [completedCount, setCompletedCount] = React.useState<number | null>(
    null,
  );
  const projectRequest = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    const requestId = ++projectRequest.current;
    let active = true;
    const timer = window.setTimeout(
      async () => {
        setIsSearching(true);
        const result = await searchProjectsAction({ search });
        if (!active || requestId !== projectRequest.current) return;
        if (result.ok) {
          setProjects(result.page.data);
          setNextCursor(result.page.pageInfo.nextCursor);
          setError(null);
        } else {
          setProjects([]);
          setNextCursor(null);
          setError(result.message);
        }
        setIsSearching(false);
      },
      search ? 300 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, search, searchProjectsAction]);

  const loadMoreProjects = async () => {
    if (!nextCursor || isLoadingMore) return;
    const requestId = projectRequest.current;
    setIsLoadingMore(true);
    const result = await searchProjectsAction({ cursor: nextCursor, search });
    if (requestId !== projectRequest.current) {
      setIsLoadingMore(false);
      return;
    }
    if (result.ok) {
      setProjects((current) => [
        ...current,
        ...result.page.data.filter(
          (candidate) =>
            !current.some((project) => project.id === candidate.id),
        ),
      ]);
      setNextCursor(result.page.pageInfo.nextCursor);
      setError(null);
    } else {
      setError(result.message);
    }
    setIsLoadingMore(false);
  };

  const updateProjectSearch = (value: string) => {
    setSearch(value);
    setNextCursor(null);
    setIsSearching(true);
    setError(null);
  };

  const updateUnit = <K extends keyof BatchUnit>(
    id: string,
    field: K,
    value: BatchUnit[K],
  ) =>
    setUnits((current) =>
      current.map((unit) =>
        unit.id === id
          ? { ...unit, [field]: value, serverError: undefined }
          : unit,
      ),
    );

  const selectProject = async (project: MachineAllocationProjectOption) => {
    setIsLoadingProject(true);
    setError(null);
    const result = await loadProjectAction(project.id);
    if (result.ok) setProjectContext(result.project);
    else setError(result.message);
    setIsLoadingProject(false);
  };

  const validateStep = () => {
    setError(null);
    if (currentStep === 0 && !projectContext) {
      setError("Selecione a obra que receberá as unidades.");
      return false;
    }
    if (currentStep === 1) {
      const identifiers = new Set<string>();
      for (const [index, unit] of units.entries()) {
        if (!unit.plate.trim() && !unit.companyTag.trim()) {
          setError(`Unidade ${index + 1}: informe placa ou patrimônio.`);
          return false;
        }
        for (const value of [unit.plate, unit.companyTag].filter(Boolean)) {
          const normalized = normalizeIdentifier(value);
          if (!normalized || identifiers.has(normalized)) {
            setError(
              `Unidade ${index + 1}: há um identificador vazio ou repetido no lote.`,
            );
            return false;
          }
          identifiers.add(normalized);
        }
      }
    }
    if (currentStep === 2) {
      for (const [index, unit] of units.entries()) {
        if (!decimalPattern.test(unit.initialMeterReading)) {
          setError(`Unidade ${index + 1}: informe uma leitura inicial válida.`);
          return false;
        }
        if (
          unit.hourlyRate &&
          (!positiveRatePattern.test(unit.hourlyRate) ||
            Number(unit.hourlyRate.replace(",", ".")) <= 0)
        ) {
          setError(`Unidade ${index + 1}: informe um valor/hora válido.`);
          return false;
        }
        if (
          [unit.loadCapacity, unit.maxSupportedWeightT].some(
            (value) =>
              value &&
              (!specificationPattern.test(value) ||
                Number(value.replace(",", ".")) <= 0),
          )
        ) {
          setError(`Unidade ${index + 1}: revise capacidade e peso.`);
          return false;
        }
      }
    }
    if (currentStep === 3) {
      const assignments = new Set<string>();
      for (const [index, unit] of units.entries()) {
        if (
          model.requiresOperator &&
          !unit.dayOperatorEmploymentId &&
          !unit.nightOperatorEmploymentId
        ) {
          setError(`Unidade ${index + 1}: selecione ao menos um operador.`);
          return false;
        }
        for (const [shift, operatorId] of [
          ["day", unit.dayOperatorEmploymentId],
          ["night", unit.nightOperatorEmploymentId],
        ] as const) {
          if (!operatorId) continue;
          const key = `${shift}:${operatorId}`;
          if (assignments.has(key)) {
            setError(
              "Um operador não pode operar duas unidades no mesmo turno.",
            );
            return false;
          }
          assignments.add(key);
        }
      }
    }
    return true;
  };

  const advance = () => {
    if (!validateStep()) return;
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const payload = (): MachineUnitBatchDraft => ({
    projectId: projectContext!.id,
    units: units.map((unit) => ({
      name: unit.name.trim() || undefined,
      plate: unit.plate.trim() || undefined,
      companyTag: unit.companyTag.trim() || undefined,
      meterType: unit.meterType,
      initialMeterReading: unit.initialMeterReading.replace(",", "."),
      hourlyRate: unit.hourlyRate
        ? unit.hourlyRate.replace(",", ".")
        : undefined,
      loadCapacity: unit.loadCapacity
        ? unit.loadCapacity.replace(",", ".")
        : undefined,
      loadCapacityUnitCode: unit.loadCapacity
        ? unit.loadCapacityUnitCode
        : undefined,
      maxSupportedWeightT: unit.maxSupportedWeightT
        ? unit.maxSupportedWeightT.replace(",", ".")
        : undefined,
      allocation: {
        projectId: projectContext!.id,
        operatorAssignments: [
          unit.dayOperatorEmploymentId
            ? {
                shift: "day" as const,
                operatorEmploymentId: unit.dayOperatorEmploymentId,
              }
            : null,
          unit.nightOperatorEmploymentId
            ? {
                shift: "night" as const,
                operatorEmploymentId: unit.nightOperatorEmploymentId,
              }
            : null,
        ].filter((item): item is NonNullable<typeof item> => item !== null),
      },
    })),
  });

  const submit = async () => {
    if (!projectContext || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const currentUnits = units;
    const result = await action(model.id, payload());
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.rejected.length) {
      const rejectedByIndex = new Map(
        result.rejected.map((item) => [item.index, item]),
      );
      setUnits(
        currentUnits.flatMap((unit, index) => {
          const rejection = rejectedByIndex.get(index);
          return rejection ? [{ ...unit, serverError: rejection.message }] : [];
        }),
      );
      setCurrentStep(1);
      setError(result.message);
      if (result.createdCount)
        toast.success(`${result.createdCount} unidade(s) criada(s).`);
      return;
    }
    toast.success(result.message);
    setCompletedCount(result.createdCount);
  };

  const restart = () => {
    setCurrentStep(0);
    setUnits([newUnit()]);
    setProjectContext(null);
    setSearch("");
    setError(null);
    setCompletedCount(null);
  };

  return (
    <OperationsModal
      bodyClassName="overflow-hidden p-0"
      description={`Adicione unidades para ${model.name}.`}
      icon={Truck}
      onOpenChange={(next) => !isSubmitting && onOpenChange(next)}
      open={open}
      size="xl"
      title="Criar unidades"
    >
      <div className="flex max-h-[calc(100vh-9rem)] min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {completedCount !== null ? (
            <div className="mx-auto grid max-w-xl justify-items-center gap-4 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold">Lote concluído</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {completedCount} unidade(s) foram criadas e alocadas em{" "}
                  {projectContext?.name}.
                </p>
              </div>
            </div>
          ) : (
            <>
              <FormWizardProgress steps={steps} currentStep={currentStep} />
              {error && (
                <div
                  role="alert"
                  className="mt-5 flex gap-3 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm font-semibold text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="mt-5 space-y-4">
                {currentStep === 0 && (
                  <ProjectStep
                    context={projectContext}
                    isLoading={isLoadingProject}
                    isLoadingMore={isLoadingMore}
                    isSearching={isSearching}
                    nextCursor={nextCursor}
                    onLoadMore={loadMoreProjects}
                    onSelect={selectProject}
                    projects={projects}
                    search={search}
                    setSearch={updateProjectSearch}
                  />
                )}
                {currentStep === 1 && (
                  <IdentificationStep
                    units={units}
                    setUnits={setUnits}
                    updateUnit={updateUnit}
                  />
                )}
                {currentStep === 2 && (
                  <MeasurementStep
                    model={model}
                    units={units}
                    updateUnit={updateUnit}
                  />
                )}
                {currentStep === 3 && projectContext && (
                  <AllocationStep
                    context={projectContext}
                    model={model}
                    units={units}
                    updateUnit={updateUnit}
                  />
                )}
                {currentStep === 4 && (
                  <ReviewStep
                    context={projectContext!}
                    units={units}
                    goToStep={setCurrentStep}
                  />
                )}
              </div>
            </>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-popover px-5 py-4">
          {completedCount !== null ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
              <Button type="button" onClick={restart}>
                <Plus className="size-4" />
                Criar outro lote
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() =>
                  currentStep === 0
                    ? onOpenChange(false)
                    : setCurrentStep((step) => step - 1)
                }
              >
                {currentStep > 0 && <ChevronLeft className="size-4" />}
                {currentStep === 0 ? "Cancelar" : "Voltar"}
              </Button>
              {currentStep < steps.length - 1 ? (
                <Button
                  type="button"
                  disabled={isSubmitting || isLoadingProject}
                  onClick={advance}
                >
                  Avançar
                  <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void submit()}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Criar {units.length} unidade(s)
                </Button>
              )}
            </>
          )}
        </footer>
      </div>
    </OperationsModal>
  );
}

function ProjectStep({
  context,
  isLoading,
  isLoadingMore,
  isSearching,
  nextCursor,
  onLoadMore,
  onSelect,
  projects,
  search,
  setSearch,
}: {
  context: MachineAllocationProjectContext | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  isSearching: boolean;
  nextCursor: string | null;
  onLoadMore: () => void;
  onSelect: (project: MachineAllocationProjectOption) => void;
  projects: MachineAllocationProjectOption[];
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <FormSection
      title="Selecione a obra"
      description="Escolha onde as unidades serão mobilizadas."
    >
      <label className="relative block">
        <span className="sr-only">Buscar obra</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome ou contrato"
        />
      </label>
      <div
        aria-busy={isSearching || isLoadingMore}
        aria-label="Obras disponíveis"
        className="min-h-64 max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-2"
      >
        {projects.map((project) => (
          <button
            type="button"
            key={project.id}
            aria-pressed={context?.id === project.id}
            className={cn(
              "flex min-h-12 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
              context?.id === project.id
                ? "bg-primary/10 font-bold text-primary"
                : "hover:bg-accent",
            )}
            disabled={isLoading || isSearching}
            onClick={() => void onSelect(project)}
          >
            <span>{project.name}</span>
            <span className="text-xs text-muted-foreground">
              {project.contractNumber ?? "Sem contrato"}
            </span>
          </button>
        ))}
        {isSearching && projects.length === 0 && (
          <div className="space-y-2 p-1" aria-label="Buscando obras">
            {["first", "second", "third"].map((key) => (
              <div
                key={key}
                className="h-12 rounded-md bg-muted motion-reduce:animate-none animate-pulse"
              />
            ))}
          </div>
        )}
        {!isSearching && !isLoading && projects.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma obra elegível encontrada.
          </p>
        )}
        {nextCursor && (
          <Button
            type="button"
            variant="ghost"
            disabled={isLoadingMore || isLoading}
            onClick={onLoadMore}
          >
            {isLoadingMore ? "Carregando obras..." : "Carregar mais obras"}
          </Button>
        )}
        {(isSearching || isLoading) && (
          <p className="sr-only" role="status">
            Carregando obras...
          </p>
        )}
      </div>
    </FormSection>
  );
}

function UnitCard({
  children,
  index,
  unit,
}: {
  children: React.ReactNode;
  index: number;
  unit: BatchUnit;
}) {
  return (
    <FormSection
      title={`Unidade ${index + 1}`}
      description={unit.serverError ?? null}
      className={unit.serverError ? "border-destructive/40" : undefined}
    >
      {children}
    </FormSection>
  );
}

function IdentificationStep({
  units,
  setUnits,
  updateUnit,
}: {
  units: BatchUnit[];
  setUnits: React.Dispatch<React.SetStateAction<BatchUnit[]>>;
  updateUnit: <K extends keyof BatchUnit>(
    id: string,
    field: K,
    value: BatchUnit[K],
  ) => void;
}) {
  return (
    <div className="space-y-3">
      {units.map((unit, index) => (
        <UnitCard key={unit.id} index={index} unit={unit}>
          <div className="grid gap-3 md:grid-cols-3">
            <LabeledInput
              label="Nome (opcional)"
              value={unit.name}
              onChange={(value) => updateUnit(unit.id, "name", value)}
            />
            <LabeledInput
              label="Placa"
              value={unit.plate}
              onChange={(value) => updateUnit(unit.id, "plate", value)}
            />
            <LabeledInput
              label="Patrimônio"
              value={unit.companyTag}
              onChange={(value) => updateUnit(unit.id, "companyTag", value)}
            />
          </div>
          {units.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-end text-destructive hover:text-destructive"
              onClick={() =>
                setUnits((current) =>
                  current.filter((item) => item.id !== unit.id),
                )
              }
            >
              <Trash2 className="size-4" />
              Remover unidade
            </Button>
          )}
        </UnitCard>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={units.length >= 15}
        onClick={() => setUnits((current) => [...current, newUnit()])}
      >
        <Plus className="size-4" />
        Adicionar unidade
      </Button>
    </div>
  );
}

function MeasurementStep({
  model,
  units,
  updateUnit,
}: {
  model: NonNullable<MachineActionState["createdModel"]>;
  units: BatchUnit[];
  updateUnit: <K extends keyof BatchUnit>(
    id: string,
    field: K,
    value: BatchUnit[K],
  ) => void;
}) {
  return (
    <div className="space-y-3">
      {units.map((unit, index) => (
        <UnitCard key={unit.id} index={index} unit={unit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Medidor</span>
              <select
                className={controlClass}
                value={unit.meterType}
                onChange={(event) =>
                  updateUnit(
                    unit.id,
                    "meterType",
                    event.target.value as BatchUnit["meterType"],
                  )
                }
              >
                <option value="HOUR_METER">Horímetro</option>
                <option value="ODOMETER">Odômetro</option>
              </select>
            </label>
            <LabeledInput
              label={`Leitura inicial (${meterUnit(unit.meterType)})`}
              value={unit.initialMeterReading}
              onChange={(value) =>
                updateUnit(unit.id, "initialMeterReading", value)
              }
              inputMode="decimal"
            />
            <LabeledInput
              label="Valor/hora (opcional)"
              value={unit.hourlyRate}
              onChange={(value) => updateUnit(unit.id, "hourlyRate", value)}
              inputMode="decimal"
            />
            {model.type === "WHITE_LINE" && (
              <>
                <LabeledInput
                  label="Capacidade (opcional)"
                  value={unit.loadCapacity}
                  onChange={(value) =>
                    updateUnit(unit.id, "loadCapacity", value)
                  }
                  inputMode="decimal"
                />
                <label className="grid gap-1.5 text-sm font-semibold">
                  <span>Unidade da capacidade</span>
                  <select
                    className={controlClass}
                    value={unit.loadCapacityUnitCode}
                    onChange={(event) =>
                      updateUnit(
                        unit.id,
                        "loadCapacityUnitCode",
                        event.target.value as BatchUnit["loadCapacityUnitCode"],
                      )
                    }
                  >
                    <option value="M3_LOOSE">m³ solto</option>
                    <option value="M3_COMPACTED">m³ compactado</option>
                    <option value="LITER">Litro (L)</option>
                    <option value="CUBIC_YARD">Jarda cúbica (yd³)</option>
                  </select>
                </label>
                <LabeledInput
                  label="Peso máximo suportado (t, opcional)"
                  value={unit.maxSupportedWeightT}
                  onChange={(value) =>
                    updateUnit(unit.id, "maxSupportedWeightT", value)
                  }
                  inputMode="decimal"
                />
              </>
            )}
          </div>
        </UnitCard>
      ))}
    </div>
  );
}

function AllocationStep({
  context,
  model,
  units,
  updateUnit,
}: {
  context: MachineAllocationProjectContext;
  model: NonNullable<MachineActionState["createdModel"]>;
  units: BatchUnit[];
  updateUnit: <K extends keyof BatchUnit>(
    id: string,
    field: K,
    value: BatchUnit[K],
  ) => void;
}) {
  const acceptsAny =
    normalizeRoleName(model.requiredJobRoleName ?? "") === "qualquer um";
  const operators = (shift: "day" | "night") =>
    context.operators.filter(
      (operator) =>
        operator.shift === shift &&
        (acceptsAny ||
          !model.requiredJobRoleId ||
          operator.confirmedJobRoleId === model.requiredJobRoleId),
    );
  const selected = new Set(
    units.flatMap((unit) =>
      [
        unit.dayOperatorEmploymentId && `day:${unit.dayOperatorEmploymentId}`,
        unit.nightOperatorEmploymentId &&
          `night:${unit.nightOperatorEmploymentId}`,
      ].filter(Boolean),
    ),
  );
  return (
    <div className="space-y-3">
      {units.map((unit, index) => (
        <UnitCard key={unit.id} index={index} unit={unit}>
          {model.requiresOperator ? (
            <div className="grid gap-3 md:grid-cols-2">
              {context.shifts.map((shift) => {
                const field =
                  shift === "day"
                    ? "dayOperatorEmploymentId"
                    : "nightOperatorEmploymentId";
                const currentValue = unit[field];
                return (
                  <label
                    key={shift}
                    className="grid gap-1.5 text-sm font-semibold"
                  >
                    <span>
                      {shift === "day" ? "Operador diurno" : "Operador noturno"}
                    </span>
                    <select
                      className={controlClass}
                      value={currentValue}
                      onChange={(event) =>
                        updateUnit(unit.id, field, event.target.value)
                      }
                    >
                      <option value="">Não selecionar</option>
                      {operators(shift).map((operator) => (
                        <option
                          key={operator.employmentId}
                          value={operator.employmentId}
                          disabled={
                            selected.has(`${shift}:${operator.employmentId}`) &&
                            currentValue !== operator.employmentId
                          }
                        >
                          {operator.name} · {operator.jobRole}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este modelo não exige operador.
            </p>
          )}
        </UnitCard>
      ))}
    </div>
  );
}

function ReviewStep({
  context,
  goToStep,
  units,
}: {
  context: MachineAllocationProjectContext;
  goToStep: (step: number) => void;
  units: BatchUnit[];
}) {
  return (
    <section aria-label="Revisão do lote" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">{context.name}</h3>
          <p className="text-sm text-muted-foreground">
            {units.length} unidade(s) serão criadas e alocadas.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => goToStep(0)}
        >
          Editar obra
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-secondary/70 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Unidade</th>
              <th className="px-3 py-2">Identificação</th>
              <th className="px-3 py-2">Medição</th>
              <th className="px-3 py-2">Valor/hora</th>
              <th className="px-3 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit, index) => (
              <tr key={unit.id} className="border-t border-border">
                <td className="px-3 py-3 font-semibold">
                  {unit.name || `Unidade ${index + 1}`}
                </td>
                <td className="px-3 py-3">{unit.plate || unit.companyTag}</td>
                <td className="px-3 py-3">
                  {meterTypeLabel(unit.meterType)} · {unit.initialMeterReading}{" "}
                  {meterUnit(unit.meterType)}
                </td>
                <td className="px-3 py-3">
                  {unit.hourlyRate ? `R$ ${unit.hourlyRate}/h` : "Não informado"}
                </td>
                <td className="px-3 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => goToStep(1)}
                  >
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LabeledInput({
  inputMode,
  label,
  onChange,
  value,
}: {
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <Input
        className="h-11"
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

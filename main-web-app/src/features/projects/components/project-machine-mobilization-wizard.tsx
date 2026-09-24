"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

import {
  BaseFormModal,
  type WizardStep,
} from "@/components/modals/BaseFormModal";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Popover } from "@base-ui/react/popover";
import { useDebouncer } from "@/hooks/useDebouncer";
import {
  formatMeterReading,
  type MeterType,
} from "@/features/machines/meter-format";
import { cn } from "@/lib/utils";
import { projectCommandSchema, type ProjectCommand } from "../projects-schema";
import type {
  ProjectMachineMobilizationOption,
  ProjectMachineMobilizationOptionsPage,
} from "../projects.types";
import { getProjectMachineMobilizationOptionsAction } from "../projects.actions";
import type { ProjectWizardOptions } from "./project-wizard";

type Filters = {
  type: "" | "YELLOW_LINE" | "WHITE_LINE";
  manufacturer: string;
  model: string;
  version: string;
  search: string;
};

type MachineDraft = {
  machineId: string;
  operatorAssignments: {
    shift: "day" | "night";
    operatorEmploymentId: string;
  }[];
};

const emptyFilters: Filters = {
  type: "",
  manufacturer: "",
  model: "",
  version: "",
  search: "",
};

const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

const machineReading = (machine: ProjectMachineMobilizationOption) =>
  machine.detail
    ? formatMeterReading(machine.detail, machine.meterType as MeterType)
    : "Não informada";

const machineTypeLabel = (type: ProjectMachineMobilizationOption["type"]) =>
  type === "YELLOW_LINE" ? "Linha amarela" : "Linha branca";

const identifiersLabel = (machine: ProjectMachineMobilizationOption) =>
  machine.identifiers
    .map(
      (identifier) =>
        `${identifier.kind === "PLATE" ? "Placa" : "Patrimônio"}: ${identifier.value}`,
    )
    .join(" · ");

function MachineIdentity({
  machine,
}: {
  machine: ProjectMachineMobilizationOption;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-bold text-foreground">
        {machine.label}
      </p>
      <p className="truncate text-xs font-medium text-muted-foreground">
        {machine.manufacturer} / {machine.model}
        {machine.version ? ` · ${machine.version}` : ""}
      </p>
      <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
        {machineTypeLabel(machine.type)} · Leitura {machineReading(machine)}
        {identifiersLabel(machine) ? ` · ${identifiersLabel(machine)}` : ""}
      </p>
    </div>
  );
}

function MachineConfiguration({
  draft,
  employees,
  enabledShifts,
  form,
  machine,
  onCancel,
  onChange,
  onConfirm,
  message,
  unavailableShifts,
  canConfirm,
}: {
  draft: MachineDraft;
  employees: ProjectWizardOptions["employees"];
  enabledShifts: Array<"day" | "night">;
  form: UseFormReturn<ProjectCommand>;
  machine: ProjectMachineMobilizationOption;
  onCancel: () => void;
  onChange: (shift: "day" | "night", employmentId: string) => void;
  onConfirm: () => void;
  message: string;
  unavailableShifts: Array<"day" | "night">;
  canConfirm: boolean;
}) {
  const configurationRef = React.useRef<HTMLDivElement>(null);
  const allocations = form.watch("initialMachineAllocations");
  const employeeAllocations = form.watch("initialEmployeeAllocations");
  const teamById = new Map(
    employeeAllocations.map((item) => [
      item.employmentId,
      {
        shift: item.shift,
        confirmedJobRoleId: item.confirmedJobRoleId ?? null,
      },
    ]),
  );
  const usedOperators = new Set(
    allocations
      .filter((allocation) => allocation.machineId !== machine.id)
      .flatMap((allocation) =>
        allocation.operatorAssignments.map(
          (assignment) => assignment.operatorEmploymentId,
        ),
      ),
  );
  React.useLayoutEffect(() => {
    const element = configurationRef.current;
    if (!element || typeof element.scrollIntoView !== "function") return;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const frame = window.requestAnimationFrame(() =>
      element.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      ref={configurationRef}
      className="mt-2 scroll-mt-4 grid gap-3 border-t border-primary/20 pt-3 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">Configurar operador</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {machine.requiresOperator
              ? `Função exigida: ${machine.acceptsAnyJobRole ? "Qualquer função" : (machine.requiredJobRoleName ?? "Não informada")}`
              : "Esta máquina não exige operador."}
          </p>
        </div>
        <span className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
          Em configuração
        </span>
      </div>
      {machine.requiresOperator && (
        <div className="grid gap-3 sm:grid-cols-2">
          {enabledShifts.map((shift) => {
            const assignment = draft.operatorAssignments.find(
              (item) => item.shift === shift,
            );
            const currentId = assignment?.operatorEmploymentId ?? "";
            const candidates = employees.filter((employee) => {
              const team = teamById.get(employee.id);
              return (
                team?.shift === shift &&
                (machine.acceptsAnyJobRole ||
                  team.confirmedJobRoleId === machine.requiredJobRoleId ||
                  employee.id === currentId) &&
                (!usedOperators.has(employee.id) || employee.id === currentId)
              );
            });
            return (
              <label key={shift} className="grid gap-1.5 text-sm font-semibold">
                <span>
                  {shift === "day" ? "Operador — Diurno" : "Operador — Noturno"}
                </span>
                <select
                  className={controlClass}
                  disabled={candidates.length === 0}
                  value={currentId}
                  onChange={(event) => onChange(shift, event.target.value)}
                >
                  <option value="" disabled>
                    Selecione um operador
                  </option>
                  {candidates.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.label}
                      {employee.detail ? ` — ${employee.detail}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
      {unavailableShifts.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-semibold text-destructive"
        >
          Não há operador elegível no turno
          {unavailableShifts.length > 1 ? "s " : " "}
          {unavailableShifts
            .map((shift) => (shift === "day" ? "Diurno" : "Noturno"))
            .join(" e ")}
          {
            ". Mobilize um integrante compatível ou libere o operador de outra máquina antes de confirmar."
          }
        </div>
      )}
      {message && (
        <p role="status" className="text-sm font-semibold text-destructive">
          {message}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
          <Check className="size-4" />
          Confirmar máquina
        </Button>
      </div>
    </div>
  );
}

function SelectedCount({ count }: { count: number }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md border border-primary/25 bg-primary/[0.06] text-xs font-bold text-foreground transition-colors duration-150 hover:bg-primary/[0.11] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        aria-label={`${count} máquinas adicionadas. Saiba o que este número representa.`}
      >
        <span className="grid size-5 place-items-center rounded-sm bg-primary text-xs text-primary-foreground">
          {count}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 outline-none"
        >
          <Popover.Popup className="w-64 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none transition-[opacity,transform] duration-150 ease-out data-ending-style:translate-y-1 data-ending-style:opacity-0 data-starting-style:translate-y-1 data-starting-style:opacity-0 motion-reduce:transition-none">
            <p className="font-bold">Máquinas adicionadas</p>
            <p className="mt-1 leading-5 text-muted-foreground">
              Mostra apenas as máquinas adicionadas nesta abertura. As já
              mobilizadas continuam preservadas e não fazem parte desta lista.
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MachineResultsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-2 motion-reduce:animate-none"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="flex min-h-[4.75rem] items-start gap-3 rounded-md border border-border bg-background px-3 py-2 animate-pulse motion-reduce:animate-none"
        >
          <span className="mt-0.5 size-4 shrink-0 rounded-sm bg-muted" />
          <span className="grid flex-1 gap-2 pt-0.5">
            <span className="h-4 w-2/5 rounded-sm bg-muted" />
            <span className="h-3 w-3/5 rounded-sm bg-muted" />
            <span className="h-3 w-4/5 rounded-sm bg-muted" />
          </span>
        </div>
      ))}
    </div>
  );
}

function MachineSelectionStep({
  filters,
  form,
  onFiltersChange,
  page,
  pageIndex,
  onNextPage,
  onPreviousPage,
  selectedOrder,
  machines,
  employees,
  onConfirmed,
  loading,
  loadError,
}: {
  filters: Filters;
  form: UseFormReturn<ProjectCommand>;
  onFiltersChange: (next: Filters) => void;
  page: ProjectMachineMobilizationOptionsPage | null;
  pageIndex: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
  selectedOrder: string[];
  machines: Map<string, ProjectMachineMobilizationOption>;
  employees: ProjectWizardOptions["employees"];
  onConfirmed: (machineId: string) => void;
  loading: boolean;
  loadError: string | null;
}) {
  const [draft, setDraft] = React.useState<MachineDraft | null>(null);
  const [message, setMessage] = React.useState("");
  const allocations = form.watch("initialMachineAllocations");
  const employeeAllocations = form.watch("initialEmployeeAllocations");
  const weeklySchedule = form.watch("weeklySchedule");
  const nightShiftEnabled = form.watch("nightShiftEnabled");
  const enabledShifts = (["day", "night"] as const).filter(
    (shift) =>
      weeklySchedule.some((day) => day.shift === shift && day.isWorking) &&
      (shift === "day" || nightShiftEnabled),
  );
  const draftMachine = draft ? machines.get(draft.machineId) : null;
  const teamById = new Map(
    employeeAllocations.map((item) => [
      item.employmentId,
      {
        shift: item.shift,
        confirmedJobRoleId: item.confirmedJobRoleId ?? null,
      },
    ]),
  );
  const usedOperators = new Set(
    allocations
      .filter((allocation) => allocation.machineId !== draft?.machineId)
      .flatMap((allocation) =>
        allocation.operatorAssignments.map(
          (assignment) => assignment.operatorEmploymentId,
        ),
      ),
  );
  const candidatesForShift = (
    machine: ProjectMachineMobilizationOption,
    shift: "day" | "night",
  ) => {
    const currentId = draft?.operatorAssignments.find(
      (item) => item.shift === shift,
    )?.operatorEmploymentId;
    return employees.filter((employee) => {
      const team = teamById.get(employee.id);
      return (
        team?.shift === shift &&
        (machine.acceptsAnyJobRole ||
          team.confirmedJobRoleId === machine.requiredJobRoleId ||
          employee.id === currentId) &&
        (!usedOperators.has(employee.id) || employee.id === currentId)
      );
    });
  };
  const unavailableShifts = draftMachine?.requiresOperator
    ? enabledShifts.filter(
        (shift) => candidatesForShift(draftMachine, shift).length === 0,
      )
    : [];
  const missingAssignments = draftMachine?.requiresOperator
    ? enabledShifts.filter(
        (shift) =>
          !draft?.operatorAssignments.some(
            (item) => item.shift === shift && item.operatorEmploymentId,
          ),
      )
    : [];
  const canConfirmDraft =
    Boolean(draftMachine) &&
    (!draftMachine?.requiresOperator ||
      (unavailableShifts.length === 0 && missingAssignments.length === 0));
  const begin = (machine: ProjectMachineMobilizationOption) => {
    if (!machine.readingId)
      return setMessage("Esta máquina não tem leitura confirmada.");
    if (machine.requiresOperator && employeeAllocations.length === 0)
      return setMessage(
        "Mobilize a equipe antes de configurar uma máquina com operador.",
      );
    setDraft({
      machineId: machine.id,
      operatorAssignments: machine.requiresOperator
        ? enabledShifts.map((shift) => ({ shift, operatorEmploymentId: "" }))
        : [],
    });
    setMessage("");
  };
  const confirm = () => {
    if (!draft) return;
    const machine = machines.get(draft.machineId);
    if (!machine?.readingId)
      return setMessage("Esta máquina não tem leitura confirmada.");
    const selected = draft.operatorAssignments.filter(
      (item) => item.operatorEmploymentId,
    );
    if (machine.requiresOperator && missingAssignments.length > 0)
      return setMessage("Selecione um operador para cada turno habilitado.");
    if (machine.requiresOperator && unavailableShifts.length > 0)
      return setMessage(
        "Não há operador elegível para todos os turnos habilitados.",
      );
    const teamById = new Map(
      employeeAllocations.map((item) => [item.employmentId, item]),
    );
    if (
      selected.some(
        (item) => teamById.get(item.operatorEmploymentId)?.shift !== item.shift,
      )
    )
      return setMessage("Selecione um operador da equipe do mesmo turno.");
    if (
      !machine.acceptsAnyJobRole &&
      selected.some(
        (item) =>
          teamById.get(item.operatorEmploymentId)?.confirmedJobRoleId !==
          machine.requiredJobRoleId,
      )
    )
      return setMessage(
        "O operador não possui a função confirmada exigida por esta máquina.",
      );
    const others = allocations.filter((item) => item.machineId !== machine.id);
    const used = new Set(
      others.flatMap((item) =>
        item.operatorAssignments.map(
          (assignment) => assignment.operatorEmploymentId,
        ),
      ),
    );
    if (selected.some((item) => used.has(item.operatorEmploymentId)))
      return setMessage("Este operador já está vinculado a outra máquina.");
    const allocation = {
      machineId: machine.id,
      startMeterReadingId: machine.readingId,
      operatorAssignments: machine.requiresOperator ? selected : [],
    };
    form.setValue("initialMachineAllocations", [...allocations, allocation], {
      shouldDirty: true,
      shouldValidate: true,
    });
    onConfirmed(machine.id);
    setDraft(null);
    setMessage("");
  };
  const remove = (machineId: string) => {
    form.setValue(
      "initialMachineAllocations",
      allocations.filter((item) => item.machineId !== machineId),
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
    if (draft?.machineId === machineId) setDraft(null);
  };
  const selected = selectedOrder
    .filter((id) =>
      allocations.some((allocation) => allocation.machineId === id),
    )
    .map((id) => machines.get(id))
    .filter((machine): machine is ProjectMachineMobilizationOption =>
      Boolean(machine),
    );
  const unselected = (page?.data ?? []).filter(
    (machine) =>
      !allocations.some((allocation) => allocation.machineId === machine.id),
  );
  const changeDraft = (shift: "day" | "night", employmentId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            operatorAssignments: [
              ...current.operatorAssignments.filter(
                (item) => item.shift !== shift,
              ),
              { shift, operatorEmploymentId: employmentId },
            ],
          }
        : current,
    );
    setMessage("");
  };
  const isInitialLoading = loading && page === null;

  return (
    <div className="grid gap-5">
      <section className="-mx-5 border-y border-border bg-popover px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Filtros avançados</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Refine a frota antes de adicionar máquinas à obra.
            </p>
          </div>
        </div>
        <div id="machine-advanced-filters" className="mt-2 grid gap-2">
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr))]">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Tipo</span>
              <select
                className={controlClass}
                value={filters.type}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    type: event.target.value as Filters["type"],
                    manufacturer: "",
                    model: "",
                    version: "",
                  })
                }
              >
                <option value="">Todos os tipos</option>
                <option value="YELLOW_LINE">Linha amarela</option>
                <option value="WHITE_LINE">Linha branca</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Fabricante</span>
              <select
                className={controlClass}
                value={filters.manufacturer}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    manufacturer: event.target.value,
                    model: "",
                    version: "",
                  })
                }
              >
                <option value="">Todos</option>
                {(page?.facets.manufacturers ?? []).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Modelo</span>
              <select
                className={controlClass}
                disabled={!filters.manufacturer}
                value={filters.model}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    model: event.target.value,
                    version: "",
                  })
                }
              >
                <option value="">Todos</option>
                {(page?.facets.models ?? []).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Versão</span>
              <select
                className={controlClass}
                disabled={!filters.model}
                value={filters.version}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    version: event.target.value,
                  })
                }
              >
                <option value="">Todas</option>
                {(page?.facets.versions ?? []).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="h-11 w-full pl-9"
                value={filters.search}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    search: event.target.value,
                  })
                }
                placeholder="Buscar unidade, placa ou patrimônio"
              />
            </span>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              onClick={() => onFiltersChange(emptyFilters)}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </section>

      {loadError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-semibold text-destructive"
        >
          {loadError}
        </p>
      )}
      <section aria-label="Máquinas selecionadas" className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-sm font-bold">Selecionadas</h3>
            <SelectedCount count={selected.length} />
          </div>
          <span className="text-xs font-medium text-muted-foreground"></span>
        </div>
        {selected.length ? (
          selected.map((machine) => {
            return (
              <div
                key={machine.id}
                className="rounded-md border border-primary/35 bg-primary/[0.035] px-3 py-2 transition-[background-color,border-color,transform] duration-200 ease-out animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <MachineIdentity machine={machine} />
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Remover máquina ${machine.label}`}
                      onClick={() => remove(machine.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 border-t border-primary/15 pt-1.5 text-xs font-semibold text-muted-foreground">
                  Adicionada nesta edição
                </p>
              </div>
            );
          })
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm font-medium text-muted-foreground">
            Nenhuma máquina selecionada.
          </p>
        )}
      </section>

      <section
        aria-label="Resultados de máquinas"
        aria-busy={isInitialLoading}
        className="grid gap-2"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Resultados</h3>
          {loading && (
            <span
              aria-live="polite"
              className="text-xs font-semibold text-muted-foreground"
            >
              Atualizando resultados…
            </span>
          )}
        </div>
        {isInitialLoading ? (
          <MachineResultsSkeleton />
        ) : unselected.length
          ? unselected.map((machine) => {
              const editing = draft?.machineId === machine.id;
              return (
                <div
                  key={machine.id}
                  className={cn(
                    "rounded-md border border-border bg-background px-3 py-2 transition-[background-color,border-color,transform] duration-200 ease-out hover:bg-muted/50",
                    editing && "border-primary/35 bg-primary/[0.035]",
                    !machine.readingId && "cursor-not-allowed opacity-60",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      className="mt-0.5 size-4 accent-primary"
                      type="checkbox"
                      disabled={!machine.readingId}
                      checked={false}
                      onChange={(event) =>
                        event.target.checked && begin(machine)
                      }
                      aria-label={`Selecionar ${machine.label}`}
                    />
                    <MachineIdentity machine={machine} />
                  </label>
                  {editing && (
                    <MachineConfiguration
                      draft={draft}
                      employees={employees}
                      enabledShifts={enabledShifts}
                      form={form}
                      machine={machine}
                      onCancel={() => setDraft(null)}
                      onChange={changeDraft}
                      onConfirm={confirm}
                      message={message}
                      unavailableShifts={unavailableShifts}
                      canConfirm={canConfirmDraft}
                    />
                  )}
                </div>
              );
            })
          : !loading && (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm font-medium text-muted-foreground">
                Nenhuma máquina encontrada com estes filtros.
              </p>
            )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={pageIndex === 0 || loading}
            onClick={onPreviousPage}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!page?.pageInfo.hasNextPage || loading}
            onClick={onNextPage}
          >
            Próxima
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}

export function ProjectMachineMobilizationWizard({
  defaultValues,
  onSubmit,
  operatorOptions,
  projectId,
}: {
  defaultValues: ProjectCommand;
  onSubmit: (values: ProjectCommand) => Promise<void | boolean>;
  operatorOptions: ProjectWizardOptions["employees"];
  projectId: string;
}) {
  const [session, setSession] = React.useState(0);
  const [filters, setFilters] = React.useState<Filters>(emptyFilters);
  const deferredSearch = useDebouncer(filters.search, 300);
  const [pages, setPages] = React.useState<
    ProjectMachineMobilizationOptionsPage[]
  >([]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [machines, setMachines] = React.useState<
    Map<string, ProjectMachineMobilizationOption>
  >(new Map());
  const [selectedOrder, setSelectedOrder] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);
  const filterKey = JSON.stringify({ ...filters, search: deferredSearch });
  const load = React.useCallback(
    async (cursor?: string | null, append = false) => {
      const id = requestId.current + 1;
      requestId.current = id;
      setLoading(true);
      setLoadError(null);
      try {
        const page = await getProjectMachineMobilizationOptionsAction({
          projectId,
          cursor,
          type: filters.type || undefined,
          manufacturer: filters.manufacturer || undefined,
          model: filters.model || undefined,
          version: filters.version || undefined,
          search: deferredSearch || undefined,
        });
        if (requestId.current !== id) return false;
        setPages((current) => (append ? [...current, page] : [page]));
        setMachines(
          (current) =>
            new Map([
              ...current,
              ...page.selected.map((item) => [item.id, item] as const),
              ...page.data.map((item) => [item.id, item] as const),
            ]),
        );
        return true;
      } catch {
        if (requestId.current === id)
          setLoadError(
            "Não foi possível carregar as máquinas. Tente novamente.",
          );
        return false;
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    },
    [
      deferredSearch,
      filters.manufacturer,
      filters.model,
      filters.type,
      filters.version,
      projectId,
    ],
  );
  React.useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [filterKey, load, session]);
  const page = pages[pageIndex] ?? null;
  const steps: WizardStep<ProjectCommand>[] = [
    {
      title: "Selecionar máquinas",
      fields: ["initialMachineAllocations"],
      component: (form) => (
        <MachineSelectionStep
          filters={filters}
          form={form}
          onFiltersChange={(next) => {
            setPageIndex(0);
            setFilters(next);
          }}
          page={page}
          pageIndex={pageIndex}
          onPreviousPage={() => setPageIndex((index) => Math.max(0, index - 1))}
          onNextPage={() => {
            if (pages[pageIndex + 1]) return setPageIndex(pageIndex + 1);
            if (page?.pageInfo.nextCursor)
              void load(page.pageInfo.nextCursor, true).then(
                (loaded) => loaded && setPageIndex(pageIndex + 1),
              );
          }}
          selectedOrder={selectedOrder}
          machines={machines}
          employees={operatorOptions}
          onConfirmed={(machineId) =>
            setSelectedOrder((current) =>
              current.includes(machineId) ? current : [...current, machineId],
            )
          }
          loading={loading}
          loadError={loadError}
        />
      ),
    },
    {
      title: "Resumo",
      fields: [],
      component: (form, helpers) => (
        <MachineSummary
          form={form}
          selectedOrder={selectedOrder}
          machines={machines}
          employees={operatorOptions}
          onChange={() => helpers.goToStep(0)}
        />
      ),
    },
  ];
  return (
    <BaseFormModal
      trigger={
        <Button type="button" className="min-h-10">
          <Plus className="size-4" />
          Adicionar nova máquina
        </Button>
      }
      icon={Plus}
      size="xl"
      title="Adicionar máquina e operador"
      description="Selecione uma nova máquina, configure os operadores e revise antes de salvar."
      schema={projectCommandSchema}
      defaultValues={defaultValues}
      steps={steps}
      submitLabel="Salvar máquinas"
      onSessionStart={() => {
        setFilters(emptyFilters);
        setPages([]);
        setPageIndex(0);
        setMachines(new Map());
        setSelectedOrder([]);
        setLoading(true);
        setSession((value) => value + 1);
      }}
      onSubmit={onSubmit}
    />
  );
}

function MachineSummary({
  employees,
  form,
  machines,
  onChange,
  selectedOrder,
}: {
  employees: ProjectWizardOptions["employees"];
  form: UseFormReturn<ProjectCommand>;
  machines: Map<string, ProjectMachineMobilizationOption>;
  onChange: () => void;
  selectedOrder: string[];
}) {
  const allocations = form.watch("initialMachineAllocations");
  const visible = selectedOrder
    .filter((id) => allocations.some((item) => item.machineId === id))
    .map((id) => machines.get(id))
    .filter((machine): machine is ProjectMachineMobilizationOption =>
      Boolean(machine),
    );
  return (
    <div className="grid gap-4">
      <FormSection
        title="Máquinas selecionadas"
        description="Confira as máquinas e os operadores antes de salvar."
      >
        {visible.length ? (
          <div className="grid gap-2">
            {visible.map((machine) => {
              const allocation = allocations.find(
                (item) => item.machineId === machine.id,
              );
              return (
                <div
                  key={machine.id}
                  className="rounded-md border border-border bg-background px-3 py-2"
                >
                  <MachineIdentity machine={machine} />
                  <div className="mt-2 grid gap-1 border-t border-border pt-1.5 text-xs font-semibold text-muted-foreground">
                    {machine.requiresOperator ? (
                      allocation?.operatorAssignments.length ? (
                        allocation.operatorAssignments.map((assignment) => (
                          <span key={assignment.shift}>
                            {assignment.shift === "day" ? "Diurno" : "Noturno"}:{" "}
                            {employees.find(
                              (employee) =>
                                employee.id === assignment.operatorEmploymentId,
                            )?.label ?? "Operador não disponível"}
                          </span>
                        ))
                      ) : (
                        <span className="text-destructive">
                          Operador pendente
                        </span>
                      )
                    ) : (
                      <span>Não exige operador</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            Nenhuma máquina será mobilizada nesta obra.
          </p>
        )}
        <Button
          type="button"
          variant="link"
          className="mt-3 h-auto px-0"
          onClick={onChange}
        >
          Alterar seleção
        </Button>
      </FormSection>
    </div>
  );
}

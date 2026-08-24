"use client";

import * as React from "react";
import {
  Check,
  HardHat,
  MapPinned,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import {
  BaseFormModal,
  type BaseFormModalRenderHelpers,
  type WizardStep,
} from "@/components/modals/BaseFormModal";
import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  canonicalDecimalToBrazilian,
  decimalInputToCanonical,
  formatBrazilianDecimalInput,
  formatCep,
} from "@/lib/brazilian-input-mask";
import { cn } from "@/lib/utils";
import {
  finalizeProjectAction,
  lookupProjectAddressByCepAction,
  type ProjectSubmissionResult,
} from "../projects.actions";
import {
  emptyProjectCommand,
  projectCommandSchema,
  type ProjectCommand,
} from "../projects-schema";

type Option = {
  id: string;
  label: string;
  detail?: string;
  readingId?: string;
  jobRolePeriodId?: string;
  jobRoleId?: string;
  allocatedShift?: "day" | "night" | null;
  temporary?: boolean;
};

type AddressAutofillState =
  | { status: "locked"; filled: Set<string> }
  | { status: "manual"; filled: Set<string> }
  | { status: "partial"; filled: Set<string> };

export type ProjectWizardOptions = {
  clients: Option[];
  employees: Option[];
  machines: Option[];
  jobRoles: Option[];
};

const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";
const fieldGridClass = "grid gap-3 md:grid-cols-2";
const temporaryJobRolePrefix = "__project_job_role__:";
const projectFieldLabels: Partial<Record<Path<ProjectCommand>, string>> = {
  name: "Nome da obra",
  contractNumber: "Número do contrato",
  "address.postalCode": "CEP",
  "address.street": "Logradouro",
  "address.number": "Número",
  "address.complement": "Complemento",
  "address.neighborhood": "Bairro",
  "address.city": "Cidade",
  "address.state": "UF",
  latitude: "Latitude",
  longitude: "Longitude",
  approvedBudget: "Orçamento aprovado",
  plannedStartDate: "Início planejado",
  plannedEndDate: "Fim planejado",
  clientId: "Cliente",
  managerEmploymentId: "Gestor da obra",
  technicalResponsibilityEmploymentIds: "Responsáveis técnicos",
  weeklySchedule: "Jornada semanal",
  breakTemplates: "Intervalos sugeridos",
  initialEmployeeAllocations: "Mobilização inicial da equipe",
  initialMachineAllocations: "Mobilização inicial de máquinas",
};

function getFieldError(error: unknown, name: string): unknown {
  return name
    .split(".")
    .reduce<unknown>(
      (current, segment) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      error,
    );
}

function FormField({
  form,
  label,
  name,
  type = "text",
  inputMode,
  maxLength,
  onBlur,
  onChange,
  disabled,
  showError = true,
}: {
  form: UseFormReturn<ProjectCommand>;
  label: string;
  name: Path<ProjectCommand>;
  type?: React.HTMLInputTypeAttribute;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  showError?: boolean;
}) {
  const id = `project-${String(name).replaceAll(".", "-")}`;
  const error = getFieldError(form.formState.errors, name);
  const registered = form.register(name);
  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>
      <span>{label}</span>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        disabled={disabled}
        className="h-11"
        aria-invalid={showError ? Boolean(error) : undefined}
        {...registered}
        onBlur={(event) => {
          registered.onBlur(event);
          onBlur?.(event);
        }}
        onChange={(event) => {
          registered.onChange(event);
          onChange?.(event);
        }}
      />
    </label>
  );
}

function MoneyField({
  fractionDigits = 2,
  form,
  label,
  name,
}: {
  fractionDigits?: number;
  form: UseFormReturn<ProjectCommand>;
  label: string;
  name: Path<ProjectCommand>;
}) {
  const id = `project-${String(name).replaceAll(".", "-")}`;
  const error = getFieldError(form.formState.errors, name);
  const value = String(form.watch(name) ?? "");
  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>
      <span>{label}</span>
      <Input
        id={id}
        className="h-11"
        inputMode="decimal"
        value={
          value.includes(".")
            ? canonicalDecimalToBrazilian(value, fractionDigits)
            : value
        }
        aria-invalid={Boolean(error)}
        onChange={(event) =>
          form.setValue(
            name,
            formatBrazilianDecimalInput(
              event.target.value,
              fractionDigits,
            ) as never,
            { shouldDirty: true, shouldValidate: true },
          )
        }
        onBlur={(event) =>
          form.setValue(
            name,
            formatBrazilianDecimalInput(
              event.target.value,
              fractionDigits,
            ) as never,
            { shouldDirty: true, shouldValidate: true },
          )
        }
      />
    </label>
  );
}

function FormSelect({
  form,
  label,
  name,
  options,
}: {
  form: UseFormReturn<ProjectCommand>;
  label: string;
  name: "clientId" | "managerEmploymentId";
  options: Option[];
}) {
  const id = `project-${name}`;
  const error = form.formState.errors[name];
  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        className={controlClass}
        aria-invalid={Boolean(error)}
        {...form.register(name)}
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.detail ? ` — ${option.detail}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectionRow({
  checked,
  children,
  disabled,
  onChange,
}: {
  checked: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold transition-colors",
        checked && "border-primary bg-primary/5",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

export function ProjectWizardIdentity({
  form,
}: {
  form: UseFormReturn<ProjectCommand>;
}) {
  const [isCepLoading, setIsCepLoading] = React.useState(false);
  const [addressAutofill, setAddressAutofill] =
    React.useState<AddressAutofillState>({
      status: "locked",
      filled: new Set(),
    });
  const [isMapOpen, setIsMapOpen] = React.useState(false);
  const lastLookupRef = React.useRef("");
  const postalCode = form.watch("address.postalCode");
  const latitude = form.watch("latitude");
  const longitude = form.watch("longitude");
  const hasCoordinates = Boolean(latitude && longitude);
  const addressIsLocked = addressAutofill.status === "locked" || isCepLoading;
  const fieldIsDisabled = (name: string) =>
    addressIsLocked || addressAutofill.filled.has(name);

  const lookupCep = async (digits: string) => {
    if (lastLookupRef.current === digits || isCepLoading) return;
    lastLookupRef.current = digits;
    setIsCepLoading(true);
    setAddressAutofill({ status: "locked", filled: new Set() });
    try {
      const result = await lookupProjectAddressByCepAction(digits);
      if (result.kind === "failure") {
        setAddressAutofill({ status: "manual", filled: new Set() });
        toast.error(`${result.message} Preencha o endereço manualmente.`, {
          duration: 3500,
        });
        return;
      }

      const filled = new Set<string>();
      const fill = (
        name:
          | "address.street"
          | "address.neighborhood"
          | "address.city"
          | "address.state",
        value: string | undefined,
      ) => {
        if (!value) return;
        form.setValue(name, value, {
          shouldDirty: true,
          shouldValidate: true,
        });
        filled.add(name);
      };

      form.setValue("address.postalCode", formatCep(digits), {
        shouldDirty: true,
        shouldValidate: true,
      });
      fill("address.street", result.address.street);
      fill("address.neighborhood", result.address.neighborhood);
      fill("address.city", result.address.city);
      fill("address.state", result.address.state);
      setAddressAutofill({ status: "partial", filled });
    } catch {
      setAddressAutofill({ status: "manual", filled: new Set() });
      toast.error(
        "Não foi possível consultar o CEP. Preencha o endereço manualmente.",
        { duration: 3500 },
      );
    } finally {
      setIsCepLoading(false);
    }
  };

  const updateCep = (value: string) => {
    const formatted = formatCep(value);
    const digits = formatted.replace(/\D/g, "");
    if (digits !== postalCode.replace(/\D/g, "")) {
      form.setValue("address.street", "", {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.setValue("address.number", "", {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.setValue("address.complement", null, {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.setValue("address.neighborhood", "", {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.setValue("address.city", "", {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.setValue("address.state", "", {
        shouldDirty: true,
        shouldValidate: false,
      });
      setAddressAutofill({ status: "locked", filled: new Set() });
    }
    form.setValue("address.postalCode", formatted, {
      shouldDirty: true,
      shouldValidate: digits.length === 8,
    });
    if (digits.length !== 8) lastLookupRef.current = "";
    if (digits.length === 8) void lookupCep(digits);
  };

  return (
    <div className="grid gap-4">
      <FormSection title="Identificação">
        <div className={fieldGridClass}>
          <FormField form={form} name="name" label="Nome da obra" />
          <FormField
            form={form}
            name="contractNumber"
            label="Número do contrato (opcional)"
          />
        </div>
      </FormSection>

      <FormSection title="Localização">
        <div className="grid gap-1.5">
          <FormField
            form={form}
            name="address.postalCode"
            label="CEP"
            inputMode="numeric"
            maxLength={9}
            showError={false}
            onBlur={(event) => updateCep(event.target.value)}
            onChange={(event) => updateCep(event.target.value)}
          />
          <p className="min-h-5 text-sm font-medium text-muted-foreground">
            {isCepLoading ? "Buscando endereço pelo CEP..." : " "}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_8rem]">
          <FormField
            form={form}
            name="address.street"
            label="Logradouro"
            disabled={fieldIsDisabled("address.street")}
          />
          <FormField
            form={form}
            name="address.number"
            label="Número"
            disabled={fieldIsDisabled("address.number")}
          />
        </div>
        <div className={fieldGridClass}>
          <FormField
            form={form}
            name="address.complement"
            label="Complemento (opcional)"
            disabled={fieldIsDisabled("address.complement")}
          />
          <FormField
            form={form}
            name="address.neighborhood"
            label="Bairro"
            disabled={fieldIsDisabled("address.neighborhood")}
          />
          <FormField
            form={form}
            name="address.city"
            label="Cidade"
            disabled={fieldIsDisabled("address.city")}
          />
          <FormField
            form={form}
            name="address.state"
            label="UF"
            maxLength={2}
            disabled={fieldIsDisabled("address.state")}
            onBlur={() =>
              form.setValue(
                "address.state",
                form.getValues("address.state").toUpperCase(),
                { shouldDirty: true, shouldValidate: true },
              )
            }
          />
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <FormField form={form} name="latitude" label="Latitude" />
          <FormField form={form} name="longitude" label="Longitude" />
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!hasCoordinates}
            onClick={() => setIsMapOpen(true)}
          >
            <MapPinned className="size-4" />
            Prévia do mapa
          </Button>
        </div>
      </FormSection>

      <FormSection title="Planejamento comercial">
        <div className={fieldGridClass}>
          <MoneyField
            form={form}
            name="approvedBudget"
            label="Orçamento aprovado"
          />
          <span className="hidden md:block" aria-hidden="true" />
          <FormField
            form={form}
            name="plannedStartDate"
            label="Início planejado"
            type="date"
          />
          <FormField
            form={form}
            name="plannedEndDate"
            label="Fim planejado (opcional)"
            type="date"
          />
        </div>
      </FormSection>
      {isMapOpen && hasCoordinates && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Prévia do Google Maps"
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
        >
          <div className="grid max-h-[90vh] w-full max-w-3xl gap-4 overflow-hidden rounded-lg border border-border bg-popover p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold">Prévia do Google Maps</p>
                <p className="text-sm font-medium text-muted-foreground">
                  {latitude}, {longitude}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsMapOpen(false)}
              >
                Fechar
              </Button>
            </div>
            <iframe
              title="Prévia do Google Maps"
              className="h-[24rem] w-full rounded-md border border-border"
              src={`https://www.google.com/maps?q=${encodeURIComponent(
                `${latitude},${longitude}`,
              )}&output=embed`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Accountability({
  form,
  options,
}: {
  form: UseFormReturn<ProjectCommand>;
  options: ProjectWizardOptions;
}) {
  const selected = form.watch("technicalResponsibilityEmploymentIds");
  return (
    <div className="grid gap-4">
      <FormSection title="Cliente e gestão">
        <div className={fieldGridClass}>
          <FormSelect
            form={form}
            name="clientId"
            label="Cliente"
            options={options.clients}
          />
          <FormSelect
            form={form}
            name="managerEmploymentId"
            label="Gestor da obra"
            options={options.employees}
          />
        </div>
      </FormSection>

      <FormSection
        title="Responsabilidades técnicas"
        description="Selecione de 1 a 20 responsáveis técnicos para esta obra."
      >
        <div className="grid gap-2">
          {options.employees.length > 0 ? (
            options.employees.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <SelectionRow
                  key={option.id}
                  checked={checked}
                  onChange={(nextChecked) =>
                    form.setValue(
                      "technicalResponsibilityEmploymentIds",
                      nextChecked
                        ? [...selected, option.id]
                        : selected.filter((id) => id !== option.id),
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                >
                  {option.label}
                  {option.detail ? ` — ${option.detail}` : ""}
                </SelectionRow>
              );
            })
          ) : (
            <p className="text-sm font-medium text-muted-foreground">
              Nenhum funcionário disponível para seleção.
            </p>
          )}
        </div>
      </FormSection>
    </div>
  );
}

export function Schedule({
  fixedShift,
  form,
}: {
  fixedShift?: "day" | "night";
  form: UseFormReturn<ProjectCommand>;
}) {
  const days = form.watch("weeklySchedule");
  const breaks = form.watch("breakTemplates");
  const labels = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo",
  ];
  const enabledShifts = (["day", "night"] as const).filter(
    (shift) =>
      (!fixedShift || shift === fixedShift) &&
      days.some((day) => day.shift === shift),
  );
  const addNightShift = () => {
    const dayRows = days.filter((day) => day.shift === "day");
    form.setValue(
      "weeklySchedule",
      [
        ...days,
        ...dayRows.map((day) => ({
          ...day,
          shift: "night" as const,
          startTime: day.isWorking ? "18:00" : null,
          endTime: day.isWorking ? "06:00" : null,
          endDayOffset: day.isWorking ? 1 : 0,
        })),
      ],
      { shouldDirty: true, shouldValidate: true },
    );
    form.setValue(
      "breakTemplates",
      [
        ...breaks,
        ...breaks
          .filter((item) => item.shift === "day")
          .map((item) => ({ ...item, shift: "night" as const })),
      ],
      { shouldDirty: true, shouldValidate: true },
    );
  };
  const removeNightShift = () => {
    form.setValue(
      "weeklySchedule",
      days.filter((day) => day.shift !== "night"),
      { shouldDirty: true, shouldValidate: true },
    );
    form.setValue(
      "breakTemplates",
      breaks.filter((item) => item.shift !== "night"),
      { shouldDirty: true, shouldValidate: true },
    );
  };
  return (
    <div className="grid gap-4">
      <h3 className="text-base font-bold">Jornada semanal</h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">
          O turno diurno é obrigatório. O noturno é opcional e independente.
        </p>
        {!fixedShift && enabledShifts.includes("night") ? (
          <Button type="button" variant="outline" onClick={removeNightShift}>
            Remover turno noturno
          </Button>
        ) : !fixedShift ? (
          <Button type="button" variant="outline" onClick={addNightShift}>
            <Plus className="size-4" /> Adicionar turno noturno
          </Button>
        ) : null}
      </div>
      {enabledShifts.map((shift) => {
        const shiftDays = days
          .map((day, index) => ({ day, index }))
          .filter((item) => item.day.shift === shift);
        const shiftBreaks = breaks
          .map((item, index) => ({ item, index }))
          .filter((entry) => entry.item.shift === shift);
        const label = shift === "day" ? "Diurno" : "Noturno";
        return (
          <div key={shift} className="grid gap-4 rounded-lg border p-4">
            <FormSection
              title={`Turno ${label}`}
              description="Defina dias e horários próprios para este turno."
            >
              <div className="divide-y divide-border rounded-md border bg-background">
                {shiftDays.map(({ day, index }) => (
                  <div
                    key={`${shift}-${day.dayOfWeek}`}
                    className="grid gap-3 p-3 sm:grid-cols-[minmax(9rem,1fr)_1fr_1fr_auto] sm:items-end"
                  >
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={day.isWorking}
                        className="size-4 accent-primary"
                        onChange={(event) => {
                          const next = [...days];
                          next[index] = {
                            ...day,
                            isWorking: event.target.checked,
                            startTime: event.target.checked
                              ? shift === "day"
                                ? "08:00"
                                : "18:00"
                              : null,
                            endTime: event.target.checked
                              ? shift === "day"
                                ? "17:00"
                                : "06:00"
                              : null,
                            endDayOffset:
                              event.target.checked && shift === "night" ? 1 : 0,
                          };
                          form.setValue("weeklySchedule", next, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                      />
                      {labels[day.dayOfWeek - 1]}
                    </label>
                    <label className="grid gap-1.5 text-sm font-semibold">
                      <span>Início</span>
                      <Input
                        type="time"
                        className="h-11"
                        disabled={!day.isWorking}
                        {...form.register(`weeklySchedule.${index}.startTime`)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-semibold">
                      <span>Fim</span>
                      <Input
                        type="time"
                        className="h-11"
                        disabled={!day.isWorking}
                        {...form.register(`weeklySchedule.${index}.endTime`)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-semibold">
                      <span>Encerramento</span>
                      <select
                        className={controlClass}
                        disabled={!day.isWorking || shift === "day"}
                        {...form.register(
                          `weeklySchedule.${index}.endDayOffset`,
                          { valueAsNumber: true },
                        )}
                      >
                        <option value={0}>Mesmo dia</option>
                        <option value={1}>Dia seguinte</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            </FormSection>
            <FormSection
              title={`Intervalos — ${label}`}
              description="Pausas configuradas exclusivamente para este turno."
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {shiftBreaks.length} intervalo(s)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={breaks.length >= 20}
                  onClick={() =>
                    form.setValue(
                      "breakTemplates",
                      [
                        ...breaks,
                        { shift, name: "Intervalo", durationMinutes: 60 },
                      ],
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                >
                  Adicionar intervalo
                </Button>
              </div>
              {shiftBreaks.map(({ item, index }) => (
                <div
                  key={`${shift}-${index}`}
                  className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
                >
                  <label className="grid gap-1.5 text-sm font-semibold">
                    <span>Nome</span>
                    <Input {...form.register(`breakTemplates.${index}.name`)} />
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold">
                    <span>Duração (min)</span>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      {...form.register(
                        `breakTemplates.${index}.durationMinutes`,
                        { valueAsNumber: true },
                      )}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label={`Remover intervalo ${item.name}`}
                    onClick={() =>
                      form.setValue(
                        "breakTemplates",
                        breaks.filter((_, itemIndex) => itemIndex !== index),
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </FormSection>
          </div>
        );
      })}
    </div>
  );
}

export function EmployeeMobilization({
  fixedShift,
  form,
  onDraftStateChange,
  options,
  sessionKey,
}: {
  fixedShift?: "day" | "night";
  form: UseFormReturn<ProjectCommand>;
  onDraftStateChange?: (hasDraft: boolean) => void;
  options: ProjectWizardOptions;
  sessionKey: string;
}) {
  const allocations = form.watch("initialEmployeeAllocations");
  const weeklySchedule = form.watch("weeklySchedule");
  const [activeEmploymentId, setActiveEmploymentId] = React.useState<
    string | null
  >(null);
  const [draft, setDraft] = React.useState<{
    employmentId: string;
    shift: "day" | "night";
    confirmedJobRoleId: string;
    monthlyHours: string;
    compensationMode: ProjectCommand["initialEmployeeAllocations"][number]["compensationMode"];
    compensationValue: string;
    overtimeRate: string;
    overtimeIsManual: boolean;
  } | null>(null);
  const [jobRoles, setJobRoles] = React.useState(options.jobRoles);
  const [newJobRoleName, setNewJobRoleName] = React.useState("");
  const [isAddingJobRole, setIsAddingJobRole] = React.useState(false);
  const [jobRoleMessage, setJobRoleMessage] = React.useState("");

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Resets transient modal state when the wizard session changes. */
    setActiveEmploymentId(null);
    setDraft(null);
    setJobRoles(options.jobRoles);
    setNewJobRoleName("");
    setIsAddingJobRole(false);
    setJobRoleMessage("");
    onDraftStateChange?.(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [onDraftStateChange, options.jobRoles, sessionKey]);

  const workingDaysForShift = (shift: "day" | "night") =>
    weeklySchedule.filter((day) => day.isWorking && day.shift === shift).length;
  const formatCompensation = (amount: string) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(decimalInputToCanonical(amount) || 0));
  const toHours = (value: string) => Number(value.replace(",", "."));
  const calculateHourlyRate = (
    compensationValue: string,
    compensationMode: ProjectCommand["initialEmployeeAllocations"][number]["compensationMode"],
    monthlyHours: string,
    shift: "day" | "night",
  ) =>
    calculateSuggestedHourlyRate({
      compensationValue,
      compensationMode,
      monthlyWorkloadHours: monthlyHours,
      workingDaysPerWeek: workingDaysForShift(shift),
    });
  const updateDraft = (
    patch: Partial<NonNullable<typeof draft>>,
    manualOvertime = false,
  ) =>
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (manualOvertime) return { ...next, overtimeIsManual: true };
      if (!next.overtimeIsManual)
        next.overtimeRate = calculateHourlyRate(
          next.compensationValue,
          next.compensationMode,
          next.monthlyHours,
          next.shift,
        );
      return next;
    });
  const beginEditing = (option: Option) => {
    const allocation = allocations.find(
      (item) => item.employmentId === option.id,
    );
    if (
      fixedShift &&
      allocation &&
      allocation.shift !== fixedShift &&
      !window.confirm(
        `Transferir ${option.label} para o turno ${fixedShift === "day" ? "Diurno" : "Noturno"}?`,
      )
    )
      return;
    const compensationMode = allocation?.compensationMode ?? "monthly";
    const compensationValue = allocation?.compensationValue ?? "0.00";
    const monthlyHours = String(allocation?.monthlyWorkloadHours ?? 220);
    setActiveEmploymentId(option.id);
    setNewJobRoleName("");
    setIsAddingJobRole(false);
    setJobRoleMessage("");
    const temporaryRoleId = allocation?.confirmedJobRoleName
      ? jobRoles.find((role) => role.label === allocation.confirmedJobRoleName)
          ?.id
      : undefined;
    setDraft({
      employmentId: option.id,
      shift: fixedShift ?? allocation?.shift ?? "day",
      confirmedJobRoleId:
        allocation?.confirmedJobRoleId ??
        temporaryRoleId ??
        option.jobRoleId ??
        "",
      monthlyHours,
      compensationMode,
      compensationValue,
      overtimeRate:
        allocation?.overtimeRate ??
        calculateHourlyRate(
          compensationValue,
          compensationMode,
          monthlyHours,
          allocation?.shift ?? "day",
        ),
      overtimeIsManual: Boolean(allocation),
    });
    onDraftStateChange?.(true);
  };
  const cancelEditing = () => {
    setActiveEmploymentId(null);
    setDraft(null);
    setNewJobRoleName("");
    setIsAddingJobRole(false);
    setJobRoleMessage("");
    onDraftStateChange?.(false);
  };
  const confirmDraft = () => {
    if (!draft) return;
    const hours = toHours(draft.monthlyHours);
    const role = jobRoles.find((item) => item.id === draft.confirmedJobRoleId);
    if (!role) {
      setJobRoleMessage("Selecione o cargo que será aplicado nesta obra.");
      return;
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 744) {
      setJobRoleMessage(
        "Informe uma carga mensal inteira entre 1 e 744 horas.",
      );
      return;
    }
    const option = options.employees.find(
      (item) => item.id === draft.employmentId,
    );
    const isTemporaryRole =
      role.temporary || role.id.startsWith(temporaryJobRolePrefix);
    const allocation = {
      employmentId: draft.employmentId,
      shift: draft.shift,
      ...(isTemporaryRole
        ? {
            confirmedJobRoleName: role.label,
            confirmedJobRolePeriodId: null,
          }
        : {
            confirmedJobRoleId: role.id,
            confirmedJobRolePeriodId:
              option?.jobRoleId === role.id
                ? (option.jobRolePeriodId ?? null)
                : null,
          }),
      monthlyWorkloadHours: hours,
      compensationMode: draft.compensationMode,
      compensationValue: decimalInputToCanonical(draft.compensationValue),
      overtimeRate: decimalInputToCanonical(draft.overtimeRate),
    };
    form.setValue(
      "initialEmployeeAllocations",
      allocations.some((item) => item.employmentId === draft.employmentId)
        ? allocations.map((item) =>
            item.employmentId === draft.employmentId ? allocation : item,
          )
        : [...allocations, allocation],
      { shouldDirty: true, shouldValidate: true },
    );
    cancelEditing();
  };
  const createTemporaryJobRole = () => {
    const name = newJobRoleName.trim().normalize("NFC");
    if (!name) {
      setJobRoleMessage("Informe o nome da função.");
      return;
    }
    if (name.length > 120) {
      setJobRoleMessage("Use no máximo 120 caracteres para a função.");
      return;
    }
    const existing = jobRoles.find(
      (role) =>
        role.label.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0,
    );
    const role =
      existing ??
      ({
        id: `${temporaryJobRolePrefix}${crypto.randomUUID()}`,
        label: name,
        temporary: true,
      } satisfies Option);
    if (!existing)
      setJobRoles((current) =>
        [...current, role].sort((a, b) =>
          a.label.localeCompare(b.label, "pt-BR"),
        ),
      );
    updateDraft({ confirmedJobRoleId: role.id });
    setNewJobRoleName("");
    setIsAddingJobRole(false);
    setJobRoleMessage("");
  };

  const activeOption = activeEmploymentId
    ? options.employees.find((option) => option.id === activeEmploymentId)
    : undefined;
  const selectedRole = draft
    ? jobRoles.find((role) => role.id === draft.confirmedJobRoleId)
    : undefined;

  return (
    <FormSection
      title="Mobilização inicial da equipe"
      description="Opcional. Configure e confirme as condições de cada funcionário antes de mobilizá-lo."
    >
      {activeOption && draft ? (
        <div className="grid gap-5 rounded-lg border border-primary/35 bg-primary/[0.035] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div className="min-w-0">
              <p className="text-base font-bold">{activeOption.label}</p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Função atual: {activeOption.detail || "Não informada"}
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md bg-primary px-2.5 text-sm font-bold text-primary-foreground">
              Em configuração
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold md:col-span-2">
              <span>Turno fixo</span>
              {fixedShift ? (
                <p className="flex min-h-11 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold">
                  {fixedShift === "day" ? "Diurno" : "Noturno"}
                </p>
              ) : (
                <select
                  className={controlClass}
                  value={draft.shift}
                  onChange={(event) =>
                    updateDraft({
                      shift: event.target.value as "day" | "night",
                    })
                  }
                >
                  <option value="day">Diurno</option>
                  {weeklySchedule.some((day) => day.shift === "night") && (
                    <option value="night">Noturno</option>
                  )}
                </select>
              )}
              <span className="text-xs font-medium text-muted-foreground">
                A mudança realoca o trabalhador imediatamente, sem período
                temporário.
              </span>
            </label>
            <div className="grid gap-1.5 text-sm font-semibold md:col-span-2">
              {isAddingJobRole ? (
                <label
                  className="grid gap-1.5"
                  htmlFor="project-temporary-job-role"
                >
                  <span>
                    Aplicado somente nesta obra. O vínculo oficial do
                    funcionário não será alterado.
                  </span>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <Input
                      id="project-temporary-job-role"
                      className="h-11"
                      value={newJobRoleName}
                      maxLength={120}
                      placeholder="Ex.: Encarregado de campo"
                      onChange={(event) =>
                        setNewJobRoleName(event.target.value)
                      }
                    />
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={!newJobRoleName.trim()}
                      onClick={createTemporaryJobRole}
                    >
                      <Check className="size-4" />
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setNewJobRoleName("");
                        setIsAddingJobRole(false);
                        setJobRoleMessage("");
                      }}
                    >
                      <X className="size-4" />
                      Cancelar
                    </Button>
                  </div>
                </label>
              ) : (
                <label className="grid gap-1.5" htmlFor="project-job-role">
                  <span>Cargo na obra</span>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <select
                      id="project-job-role"
                      className={controlClass}
                      value={draft.confirmedJobRoleId}
                      onChange={(event) =>
                        updateDraft({ confirmedJobRoleId: event.target.value })
                      }
                    >
                      <option value="">Selecione o cargo</option>
                      {jobRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setIsAddingJobRole(true);
                        setNewJobRoleName("");
                        setJobRoleMessage("");
                      }}
                    >
                      <Plus className="size-4" />
                      Criar nova função
                    </Button>
                  </div>
                </label>
              )}
            </div>
            <div className="grid content-end gap-1.5 text-sm font-semibold md:col-span-2">
              <span>Função confirmada</span>
              <p className="min-h-11 rounded-md border border-input bg-background px-3 py-2 font-medium text-foreground">
                {selectedRole?.label || "Selecione o cargo acima"}
                {selectedRole?.temporary ? " — somente nesta obra" : ""}
              </p>
            </div>
            <div className="grid gap-1.5 text-sm font-semibold">
              <label htmlFor="project-monthly-workload">Carga mensal</label>
              <select
                id="project-monthly-workload"
                className={controlClass}
                value={
                  draft.monthlyHours === "220" || draft.monthlyHours === "180"
                    ? draft.monthlyHours
                    : "custom"
                }
                onChange={(event) =>
                  updateDraft({
                    monthlyHours:
                      event.target.value === "custom" ? "" : event.target.value,
                  })
                }
              >
                <option value="220">220 h/mês</option>
                <option value="180">180 h/mês</option>
                <option value="custom">Outra carga</option>
              </select>
              {draft.monthlyHours !== "220" && draft.monthlyHours !== "180" && (
                <Input
                  className="h-11"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={744}
                  step={1}
                  placeholder="Horas por mês"
                  value={draft.monthlyHours}
                  onChange={(event) =>
                    updateDraft({ monthlyHours: event.target.value })
                  }
                />
              )}
            </div>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Modalidade de pagamento</span>
              <select
                className={controlClass}
                value={draft.compensationMode}
                onChange={(event) =>
                  updateDraft({
                    compensationMode: event.target
                      .value as typeof draft.compensationMode,
                  })
                }
              >
                <option value="daily">Diária</option>
                <option value="hourly">Hora</option>
                <option value="weekly">Semanal</option>
                <option value="fortnightly">Quinzenal</option>
                <option value="monthly">Mensal</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Valor</span>
              <Input
                className="h-11"
                inputMode="decimal"
                value={
                  draft.compensationValue.includes(".")
                    ? canonicalDecimalToBrazilian(draft.compensationValue)
                    : draft.compensationValue
                }
                onChange={(event) =>
                  updateDraft({
                    compensationValue: formatBrazilianDecimalInput(
                      event.target.value,
                    ),
                  })
                }
              />
            </label>
            <div className="grid gap-1.5 text-sm font-semibold">
              <label htmlFor="project-overtime-rate">Valor da hora extra</label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <Input
                  id="project-overtime-rate"
                  className="h-11"
                  inputMode="decimal"
                  value={
                    draft.overtimeRate.includes(".")
                      ? canonicalDecimalToBrazilian(draft.overtimeRate)
                      : draft.overtimeRate
                  }
                  onChange={(event) =>
                    updateDraft(
                      {
                        overtimeRate: formatBrazilianDecimalInput(
                          event.target.value,
                        ),
                      },
                      true,
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 justify-center px-3 text-sm"
                  onClick={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            overtimeRate: calculateHourlyRate(
                              current.compensationValue,
                              current.compensationMode,
                              current.monthlyHours,
                              current.shift,
                            ),
                            overtimeIsManual: false,
                          }
                        : current,
                    )
                  }
                >
                  Recalcular pelo valor-hora
                </Button>
              </div>
            </div>
          </div>
          {jobRoleMessage && (
            <p
              role="status"
              className="text-sm font-semibold text-muted-foreground"
            >
              {jobRoleMessage}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={cancelEditing}>
              <X className="size-4" />
              Cancelar
            </Button>
            <Button type="button" onClick={confirmDraft}>
              <Check className="size-4" />
              Confirmar funcionário
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-muted-foreground">
            {allocations.length} funcionário(s) confirmado(s)
          </p>
          <div className="grid gap-2">
            {options.employees.length > 0 ? (
              options.employees.map((option) => {
                const allocation = allocations.find(
                  (item) => item.employmentId === option.id,
                );
                const role = allocation
                  ? jobRoles.find(
                      (item) => item.id === allocation.confirmedJobRoleId,
                    )
                  : undefined;
                if (!allocation)
                  return (
                    <SelectionRow
                      key={option.id}
                      checked={false}
                      onChange={(checked) => checked && beginEditing(option)}
                    >
                      {option.label}
                      {option.detail ? ` — ${option.detail}` : ""}
                    </SelectionRow>
                  );
                return (
                  <div
                    key={option.id}
                    className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-primary/35 bg-primary/[0.035] px-3 py-2"
                  >
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <p className="min-w-0 flex-1 text-sm font-semibold">
                      {option.label}
                    </p>
                    <span className="min-h-7 rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {allocation.shift === "day" ? "Diurno" : "Noturno"} ·{" "}
                      {allocation.confirmedJobRoleName ||
                        role?.label ||
                        option.detail ||
                        "Cargo não informado"}{" "}
                      · {allocation.monthlyWorkloadHours} h/mês ·{" "}
                      {formatCompensation(allocation.compensationValue)}{" "}
                      {allocation.compensationMode === "monthly"
                        ? "mensal"
                        : allocation.compensationMode === "daily"
                          ? "diária"
                          : allocation.compensationMode === "hourly"
                            ? "por hora"
                            : allocation.compensationMode === "weekly"
                              ? "semanal"
                              : "quinzenal"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Editar condições de ${option.label}`}
                      onClick={() => beginEditing(option)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {fixedShift && allocation.shift === fixedShift && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Remover ${option.label} do turno`}
                        onClick={() =>
                          form.setValue(
                            "initialEmployeeAllocations",
                            allocations.filter(
                              (item) => item.employmentId !== option.id,
                            ),
                            { shouldDirty: true, shouldValidate: true },
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm font-medium text-muted-foreground">
                Nenhum funcionário disponível para mobilização.
              </p>
            )}
          </div>
        </>
      )}
    </FormSection>
  );
}

export function calculateSuggestedHourlyRate({
  compensationValue,
  compensationMode,
  monthlyWorkloadHours,
  workingDaysPerWeek,
}: {
  compensationValue: string;
  compensationMode: ProjectCommand["initialEmployeeAllocations"][number]["compensationMode"];
  monthlyWorkloadHours: string;
  workingDaysPerWeek: number;
}) {
  const amount = Number(decimalInputToCanonical(compensationValue) || 0);
  const hours = Number(monthlyWorkloadHours.replace(",", "."));
  if (!Number.isFinite(amount) || !Number.isFinite(hours) || hours <= 0)
    return "0,00";
  const monthlyEquivalent =
    compensationMode === "hourly"
      ? amount * hours
      : compensationMode === "daily"
        ? amount * workingDaysPerWeek * (52 / 12)
        : compensationMode === "weekly"
          ? amount * (52 / 12)
          : compensationMode === "fortnightly"
            ? amount * (26 / 12)
            : amount;
  return canonicalDecimalToBrazilian((monthlyEquivalent / hours).toFixed(2));
}

export function MachineMobilization({
  form,
  options,
}: {
  form: UseFormReturn<ProjectCommand>;
  options: ProjectWizardOptions;
}) {
  const allocations = form.watch("initialMachineAllocations");
  const employeeAllocations = form.watch("initialEmployeeAllocations");
  const weeklySchedule = form.watch("weeklySchedule");
  const [activeMachineId, setActiveMachineId] = React.useState<string | null>(
    null,
  );
  const [draft, setDraft] = React.useState<{
    machineId: string;
    operatorAssignments: {
      shift: "day" | "night";
      operatorEmploymentId: string;
    }[];
  } | null>(null);
  const [machineMessage, setMachineMessage] = React.useState("");
  const enabledShifts = (["day", "night"] as const).filter((shift) =>
    weeklySchedule.some((day) => day.shift === shift),
  );
  const teamShiftById = React.useMemo(
    () =>
      new Map(
        employeeAllocations.map((item) => [item.employmentId, item.shift]),
      ),
    [employeeAllocations],
  );
  const usedOperatorIds = React.useMemo(
    () =>
      new Set(
        allocations
          .filter((allocation) => allocation.machineId !== activeMachineId)
          .flatMap((allocation) =>
            allocation.operatorAssignments.map(
              (assignment) => assignment.operatorEmploymentId,
            ),
          )
          .filter(Boolean),
      ),
    [activeMachineId, allocations],
  );

  React.useEffect(() => {
    const normalized = allocations.map((allocation) => ({
      ...allocation,
      operatorAssignments: allocation.operatorAssignments.filter(
        (assignment) =>
          teamShiftById.get(assignment.operatorEmploymentId) ===
            assignment.shift && enabledShifts.includes(assignment.shift),
      ),
    }));
    if (
      normalized.some(
        (allocation, index) =>
          allocation.operatorAssignments.length !==
          allocations[index]?.operatorAssignments.length,
      )
    )
      form.setValue("initialMachineAllocations", normalized, {
        shouldDirty: true,
        shouldValidate: true,
      });
  }, [allocations, enabledShifts, form, teamShiftById]);

  const cancelEditing = () => {
    setActiveMachineId(null);
    setDraft(null);
    setMachineMessage("");
  };
  const beginEditing = (option: Option) => {
    const allocation = allocations.find((item) => item.machineId === option.id);
    if (!option.readingId) {
      setMachineMessage("Esta máquina ainda não tem leitura inicial.");
      return;
    }
    if (!allocation && employeeAllocations.length === 0) return;
    setActiveMachineId(option.id);
    setDraft({
      machineId: option.id,
      operatorAssignments:
        allocation?.operatorAssignments ??
        enabledShifts.map((shift) => ({
          shift,
          operatorEmploymentId: "",
        })),
    });
    setMachineMessage("");
  };
  const removeAllocation = (machineId: string) => {
    form.setValue(
      "initialMachineAllocations",
      allocations.filter((item) => item.machineId !== machineId),
      { shouldDirty: true, shouldValidate: true },
    );
    if (activeMachineId === machineId) cancelEditing();
  };
  const confirmDraft = () => {
    if (!draft) return;
    const option = options.machines.find((item) => item.id === draft.machineId);
    if (!option?.readingId) {
      setMachineMessage("Esta máquina ainda não tem leitura inicial.");
      return;
    }
    const selectedAssignments = draft.operatorAssignments.filter(
      (assignment) => assignment.operatorEmploymentId,
    );
    if (!selectedAssignments.length) {
      setMachineMessage("Selecione ao menos um operador por turno.");
      return;
    }
    if (
      selectedAssignments.some((assignment) =>
        usedOperatorIds.has(assignment.operatorEmploymentId),
      )
    ) {
      setMachineMessage("Este operador já está vinculado a outra máquina.");
      return;
    }
    const allocation = {
      machineId: draft.machineId,
      startMeterReadingId: option.readingId,
      operatorAssignments: selectedAssignments,
    };
    form.setValue(
      "initialMachineAllocations",
      allocations.some((item) => item.machineId === draft.machineId)
        ? allocations.map((item) =>
            item.machineId === draft.machineId ? allocation : item,
          )
        : [...allocations, allocation],
      { shouldDirty: true, shouldValidate: true },
    );
    cancelEditing();
  };

  const activeOption = activeMachineId
    ? options.machines.find((option) => option.id === activeMachineId)
    : undefined;

  return (
    <FormSection
      title="Mobilização inicial de máquinas"
      description="Opcional. Cada máquina selecionada precisa de um operador da equipe inicial."
    >
      {activeOption && draft ? (
        <div className="grid gap-5 rounded-lg border border-primary/35 bg-primary/[0.035] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div className="min-w-0">
              <p className="text-base font-bold">{activeOption.label}</p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Leitura inicial: {activeOption.detail || "Não informada"}
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md bg-primary px-2.5 text-sm font-bold text-primary-foreground">
              Em configuração
            </span>
          </div>
          <div className="grid gap-4">
            {enabledShifts.map((shift) => {
              const assignment = draft.operatorAssignments.find(
                (item) => item.shift === shift,
              ) ?? { shift, operatorEmploymentId: "" };
              const teamOptions = options.employees.filter(
                (option) => teamShiftById.get(option.id) === shift,
              );
              return (
                <label
                  key={shift}
                  className="grid gap-1.5 text-sm font-semibold"
                >
                  <span>
                    {shift === "day"
                      ? "Operador da equipe"
                      : "Operador — Noturno"}
                  </span>
                  <select
                    className={controlClass}
                    value={assignment.operatorEmploymentId}
                    onChange={(event) => {
                      setDraft((current) => {
                        if (!current) return current;
                        const withoutShift = current.operatorAssignments.filter(
                          (item) => item.shift !== shift,
                        );
                        return {
                          ...current,
                          operatorAssignments: [
                            ...withoutShift,
                            {
                              shift,
                              operatorEmploymentId: event.target.value,
                            },
                          ],
                        };
                      });
                      setMachineMessage("");
                    }}
                  >
                    <option value="">Não mobilizar neste turno</option>
                    {teamOptions.map((employee) => (
                      <option
                        key={employee.id}
                        value={employee.id}
                        disabled={usedOperatorIds.has(employee.id)}
                      >
                        {employee.label}
                        {employee.detail ? ` — ${employee.detail}` : ""}
                        {usedOperatorIds.has(employee.id)
                          ? " — já alocado em outra máquina"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          {machineMessage && (
            <p
              role="status"
              className="text-sm font-semibold text-muted-foreground"
            >
              {machineMessage}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={cancelEditing}>
              <X className="size-4" />
              Cancelar
            </Button>
            <Button type="button" onClick={confirmDraft}>
              <Check className="size-4" />
              Confirmar máquina
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-muted-foreground">
            {allocations.length} máquina(s) selecionada(s)
          </p>
          {employeeAllocations.length === 0 && (
            <p className="text-sm font-medium text-muted-foreground">
              Selecione funcionários na equipe inicial antes de vincular
              máquinas.
            </p>
          )}
          {machineMessage && (
            <p
              role="status"
              className="text-sm font-semibold text-muted-foreground"
            >
              {machineMessage}
            </p>
          )}
          <div className="grid gap-2">
            {options.machines.length > 0 ? (
              options.machines.map((option) => {
                const allocation = allocations.find(
                  (item) => item.machineId === option.id,
                );
                if (!allocation) {
                  const disabled =
                    !option.readingId || employeeAllocations.length === 0;
                  return (
                    <SelectionRow
                      key={option.id}
                      checked={false}
                      disabled={disabled}
                      onChange={(checked) => checked && beginEditing(option)}
                    >
                      {option.label}
                      {option.detail ? ` — leitura ${option.detail}` : ""}
                      {!option.readingId ? " — leitura indisponível" : ""}
                      {employeeAllocations.length === 0
                        ? " — equipe não selecionada"
                        : ""}
                    </SelectionRow>
                  );
                }
                return (
                  <div
                    key={option.id}
                    className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-primary/35 bg-primary/[0.035] px-3 py-2"
                  >
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <p className="min-w-0 flex-1 text-sm font-semibold">
                      {option.label}
                    </p>
                    <span className="min-h-7 rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                      Leitura {option.detail || "não informada"} ·{" "}
                      {allocation.operatorAssignments
                        .map((assignment) => {
                          const operator = options.employees.find(
                            (employee) =>
                              employee.id === assignment.operatorEmploymentId,
                          );
                          return `${assignment.shift === "day" ? "Diurno" : "Noturno"}: ${operator?.label ?? "pendente"}`;
                        })
                        .join(" · ")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Editar máquina ${option.label}`}
                      disabled={employeeAllocations.length === 0}
                      onClick={() => beginEditing(option)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Remover máquina ${option.label}`}
                      onClick={() => removeAllocation(option.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })
            ) : (
              <p className="text-sm font-medium text-muted-foreground">
                Nenhuma máquina disponível para mobilização.
              </p>
            )}
          </div>
        </>
      )}
    </FormSection>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-semibold">{value}</dd>
    </div>
  );
}

function ChangeStepButton({
  helpers,
  step,
}: {
  helpers: BaseFormModalRenderHelpers;
  step: number;
}) {
  return (
    <Button
      type="button"
      variant="link"
      className="h-auto justify-self-start px-0 py-0 text-sm"
      onClick={() => helpers.goToStep(step)}
    >
      Alterar
    </Button>
  );
}

export function ProjectWizardReview({
  form,
  helpers,
  options,
}: {
  form: UseFormReturn<ProjectCommand>;
  helpers: BaseFormModalRenderHelpers;
  options: ProjectWizardOptions;
}) {
  const value = form.getValues();
  const labelFor = (items: Option[], id: string) =>
    items.find((item) => item.id === id)?.label ?? "Não informado";
  const formatMoney = (amount: string) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(decimalInputToCanonical(amount) || amount));
  const formatAddress = (address: ProjectCommand["address"]) =>
    [
      address.number ? `${address.street}, ${address.number}` : address.street,
      address.complement,
      address.neighborhood && address.city && address.state
        ? `${address.neighborhood} - ${address.city}/${address.state}`
        : "",
      address.postalCode ? `CEP ${formatCep(address.postalCode)}` : "",
    ]
      .filter(Boolean)
      .join(" - ");

  return (
    <div className="grid gap-4">
      <FormSection title="Identificação">
        <dl className="grid gap-3">
          <SummaryRow label="Obra" value={value.name || "Não informado"} />
          <SummaryRow
            label="Contrato"
            value={value.contractNumber || "Não informado"}
          />
          <SummaryRow
            label="Endereço"
            value={formatAddress(value.address) || "Não informado"}
          />
          <SummaryRow
            label="Coordenadas"
            value={
              value.latitude && value.longitude
                ? `${value.latitude}, ${value.longitude}`
                : "Não informado"
            }
          />
          <SummaryRow
            label="Orçamento aprovado"
            value={formatMoney(value.approvedBudget)}
          />
          <SummaryRow
            label="Período planejado"
            value={
              value.plannedStartDate
                ? value.plannedEndDate
                  ? `${value.plannedStartDate} a ${value.plannedEndDate}`
                  : `A partir de ${value.plannedStartDate}`
                : "Não informado"
            }
          />
        </dl>
        <ChangeStepButton helpers={helpers} step={0} />
      </FormSection>

      <FormSection title="Responsáveis">
        <dl className="grid gap-3">
          <SummaryRow
            label="Cliente"
            value={labelFor(options.clients, value.clientId)}
          />
          <SummaryRow
            label="Gestor"
            value={labelFor(options.employees, value.managerEmploymentId)}
          />
          <SummaryRow
            label="Responsáveis técnicos"
            value={
              value.technicalResponsibilityEmploymentIds.length > 0
                ? value.technicalResponsibilityEmploymentIds
                    .map((id) => labelFor(options.employees, id))
                    .join(", ")
                : "Não informado"
            }
          />
        </dl>
        <ChangeStepButton helpers={helpers} step={1} />
      </FormSection>

      <FormSection title="Configuração inicial">
        <dl className="grid gap-3">
          <SummaryRow
            label="Dias de trabalho"
            value={`${value.weeklySchedule.filter((day) => day.isWorking).length} por semana`}
          />
          <SummaryRow
            label="Intervalos"
            value={
              value.breakTemplates.length > 0
                ? `${value.breakTemplates.length} configurado(s)`
                : "Não informado"
            }
          />
          <SummaryRow
            label="Equipe inicial"
            value={
              value.initialEmployeeAllocations.length > 0
                ? `${value.initialEmployeeAllocations.length} funcionário(s)`
                : "Não informado"
            }
          />
          <SummaryRow
            label="Máquinas iniciais"
            value={
              value.initialMachineAllocations.length > 0
                ? value.initialMachineAllocations
                    .map(
                      (allocation) =>
                        `${labelFor(options.machines, allocation.machineId)} (${allocation.operatorAssignments
                          .map(
                            (assignment) =>
                              `${assignment.shift === "day" ? "diurno" : "noturno"}: ${labelFor(options.employees, assignment.operatorEmploymentId)}`,
                          )
                          .join("; ")})`,
                    )
                    .join(", ")
                : "Não informado"
            }
          />
        </dl>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <ChangeStepButton helpers={helpers} step={2} />
          <ChangeStepButton helpers={helpers} step={3} />
          <ChangeStepButton helpers={helpers} step={4} />
        </div>
      </FormSection>
    </div>
  );
}

export function ProjectWizardSubmissionNotice({
  result,
}: {
  result: ProjectSubmissionResult | null;
}) {
  if (!result || result.kind === "success") return null;

  const content = {
    "recoverable-conflict": {
      title: "Revise os dados antes de tentar novamente.",
      description:
        "Algumas informações mudaram enquanto esta obra era preparada. Seus dados continuam disponíveis para ajuste.",
    },
    "unknown-outcome": {
      title: "Não foi possível confirmar a criação da obra.",
      description:
        "Use “Tentar novamente” sem alterar os dados ou consulte o registro de obras antes de iniciar uma nova criação.",
    },
    "terminal-failure": {
      title: "Não foi possível concluir esta criação.",
      description:
        "Corrija os dados informados ou tente novamente mais tarde. A obra ainda não foi criada.",
    },
  }[result.kind];

  return (
    <FormErrorDeclaration
      title={content.title}
      description={content.description}
      issues={[
        {
          location: "API",
          field: result.kind !== "unknown-outcome" ? result.code : undefined,
          message:
            result.kind === "unknown-outcome"
              ? "Resultado desconhecido. Tente novamente sem alterar os dados."
              : "A criação da obra não foi confirmada pelo servidor.",
        },
      ]}
      className={cn(
        result.kind === "terminal-failure"
          ? undefined
          : "border-amber-300 bg-amber-50 text-amber-950",
      )}
    />
  );
}

export function ProjectWizard({
  expectedCompanyId,
  options,
}: {
  expectedCompanyId: string;
  options: ProjectWizardOptions;
}) {
  const router = useRouter();
  const [key, setKey] = React.useState("");
  const [result, setResult] = React.useState<ProjectSubmissionResult | null>(
    null,
  );
  const [snapshot, setSnapshot] = React.useState<ProjectCommand | null>(null);
  const steps = React.useMemo<WizardStep<ProjectCommand>[]>(
    () => [
      {
        title: "Identidade",
        fields: [
          "name",
          "address",
          "latitude",
          "longitude",
          "contractNumber",
          "approvedBudget",
          "plannedStartDate",
          "plannedEndDate",
        ],
        fieldLabels: projectFieldLabels,
        component: (form) => <ProjectWizardIdentity form={form} />,
      },
      {
        title: "Responsáveis",
        fields: [
          "clientId",
          "managerEmploymentId",
          "technicalResponsibilityEmploymentIds",
        ],
        fieldLabels: projectFieldLabels,
        component: (form) => <Accountability form={form} options={options} />,
      },
      {
        title: "Agenda",
        fields: ["weeklySchedule", "breakTemplates"],
        fieldLabels: projectFieldLabels,
        component: (form) => <Schedule form={form} />,
      },
      {
        title: "Equipe",
        fields: ["initialEmployeeAllocations"],
        fieldLabels: projectFieldLabels,
        component: (form) => (
          <EmployeeMobilization
            form={form}
            options={options}
            sessionKey={key}
          />
        ),
      },
      {
        title: "Máquinas",
        fields: ["initialMachineAllocations"],
        fieldLabels: projectFieldLabels,
        component: (form) => (
          <MachineMobilization form={form} options={options} />
        ),
      },
      {
        title: "Revisão",
        fields: [],
        component: (form, helpers) => (
          <ProjectWizardReview
            form={form}
            helpers={helpers}
            options={options}
          />
        ),
      },
    ],
    [key, options],
  );

  const submit = async (command: ProjectCommand) => {
    const frozen = snapshot ?? structuredClone(command);
    setSnapshot(frozen);
    const next = await finalizeProjectAction({
      idempotencyKey: key,
      expectedCompanyId,
      command: frozen,
    });
    setResult(next);
    if (next.kind === "success") {
      setSnapshot(null);
      setKey("");
      router.replace(`/home/obras/${next.projectId}`);
      router.refresh();
      return true;
    }
    if (next.kind === "recoverable-conflict") setSnapshot(null);
    return false;
  };

  return (
    <BaseFormModal<ProjectCommand>
      title="Nova obra"
      description="Os dados existem somente enquanto este assistente estiver aberto; nenhum rascunho é salvo."
      icon={HardHat}
      size="xl"
      schema={projectCommandSchema}
      defaultValues={emptyProjectCommand}
      fieldLabels={projectFieldLabels}
      steps={steps}
      notice={<ProjectWizardSubmissionNotice result={result} />}
      submitLabel={snapshot ? "Tentar novamente" : "Criar obra"}
      onSessionStart={() => {
        setKey(crypto.randomUUID());
        setResult(null);
        setSnapshot(null);
      }}
      confirmClose={() =>
        snapshot
          ? window.confirm(
              "O resultado da criação é desconhecido. Consulte o registro antes de iniciar outra obra. Deseja descartar mesmo assim?",
            )
          : window.confirm("Descartar os dados não salvos desta obra?")
      }
      onSubmit={submit}
      trigger={
        <Button type="button" size="lg">
          <Plus className="size-4" />
          Nova obra
        </Button>
      }
    />
  );
}

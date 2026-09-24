"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Fuel,
  Gauge,
  HardHat,
  Loader2,
  PackageCheck,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Route,
  Save,
  Search,
  Settings2,
  Trash2,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { useAppShellNavigation } from "@/components/layout/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { OperationsModal } from "@/components/ui/operations-modal";
import { Button } from "@/components/ui/button";
import { FieldHelpPopover } from "@/components/ui/field-help-popover";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { useDebouncer } from "@/hooks/useDebouncer";
import {
  canonicalDecimalToBrazilian,
  decimalInputToCanonical,
  formatBrazilianDecimalInput,
} from "@/lib/brazilian-input-mask";
import { cn } from "@/lib/utils";
import type { ProjectDailyReportsPage } from "../daily-reports.types";
import { ProjectDailyReports } from "./project-daily-reports";
import { ProjectTeamView } from "./project-team-view";
import { WorkFrontMobilizationSelector } from "./work-front-mobilization-selector";
import type { ProjectProductionsPage } from "../productions.types";
import { ProjectProductions } from "./project-productions";
import {
  activateProjectAction,
  createProjectWorkFrontAction,
  getProjectMobilizationHistoryAction,
  getProjectTeamCandidatesAction,
  saveProjectEmployeeMobilizationAction,
  saveProjectMachineMobilizationAction,
  saveProjectQuantityBaselineAction,
  saveProjectReadinessAction,
  saveProjectWorkFrontMobilizationAction,
  saveProjectWorkFrontServicesAction,
  startProjectWorkFrontAction,
  updateProjectWorkFrontAction,
  type ProjectReadinessActionInput,
  type ProjectReadinessMutationResult,
} from "../projects.actions";
import { emptyProjectCommand, type ProjectCommand } from "../projects-schema";
import type {
  CompensationMode,
  FuelSupplierOption,
  EarthworksServiceCode,
  ProjectDetailSnapshot,
  ProjectMobilizationHistoryItem,
  ProjectOfferSnapshot,
  ProjectReadinessOptions,
  ProjectSuppliedItemOfferOption,
  ProjectSuppliedItemOffersPage,
  ProjectTeamCandidatesPage,
  ProjectTeamMember,
  SupplierOfferOption,
  SuppliedItemSelectorOption,
  SuppliedItemSelectorPage,
} from "../projects.types";
import {
  EmployeeMobilization,
  MachineMobilization,
  Schedule,
  type EmployeeMobilizationHandle,
  type ProjectWizardOptions,
} from "./project-wizard";
import {
  buildMaterialAddCommands,
  buildMaterialEditCommands,
  buildMaterialRemoveCommands,
  canContinueMaterialStep,
  createBlankMaterialDraft,
  isMaterialDraftComplete,
  MaterialAddEditor,
  type MaterialAddStep,
  type MaterialDraft,
  MaterialEditEditor,
  MaterialOfferList,
  materialOfferToDraft,
  nextMaterialStep,
  previousMaterialStep,
  type LookupMaterialSuppliersAction,
} from "./project-material-offers";

const metricDefinitions: Array<{
  code: EarthworksServiceCode;
  label: string;
  unit: string;
  description: string;
}> = [
  {
    code: "cut",
    label: "Corte",
    unit: "m3 escavados",
    description: "Retirada de material de uma frente de trabalho.",
  },
  {
    code: "fill",
    label: "Aterro",
    unit: "m3 aterrados",
    description: "Depósito de material onde o terreno será elevado.",
  },
  {
    code: "finishing",
    label: "Acabamento",
    unit: "m2 regularizados",
    description: "Regularização da superfície final da obra.",
  },
  {
    code: "top_soil",
    label: "Top Soil",
    unit: "m3/km",
    description: "Camada vegetal removida ou recomposta por extensão.",
  },
  {
    code: "unsuitable_soil_removal",
    label: "Remoção de solo impróprio",
    unit: "m3 removidos",
    description: "Material sem condição de aproveitamento retirado da área.",
  },
  {
    code: "replacement_fill",
    label: "Aterro de substituição",
    unit: "m3 compactados",
    description:
      "Material de reposição aplicado após a remoção do solo impróprio.",
  },
];

function canonicalDecimalToThousandths(value: string) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/u.exec(value);
  if (!match) return null;
  return (
    BigInt(match[1]) * BigInt(1000) + BigInt((match[2] ?? "").padEnd(3, "0"))
  );
}

function thousandthsToCanonicalDecimal(value: bigint) {
  return `${value / BigInt(1000)}.${String(value % BigInt(1000)).padStart(3, "0")}`;
}

const compensationLabels: Record<CompensationMode, string> = {
  daily: "Diária",
  hourly: "Hora",
  weekly: "Semanal",
  fortnightly: "Quinzenal",
  monthly: "Mensal",
};

const compensationModeOrder: CompensationMode[] = [
  "hourly",
  "daily",
  "weekly",
  "fortnightly",
  "monthly",
];

const dailyPaymentOptions = [
  { value: "0", label: "No fim do dia trabalhado" },
  { value: "1", label: "No próximo dia útil" },
];

const weekDayPaymentOptions = [
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
  { value: "7", label: "Domingo" },
];

const monthlyBusinessDayOptions = Array.from({ length: 22 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1}º dia útil do mês`,
}));

const statusLabels: Record<ProjectDetailSnapshot["status"], string> = {
  planned: "Planejada",
  active: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function machineSaveFailureMessage(
  result: Exclude<ProjectReadinessMutationResult, { kind: "success" }>,
) {
  const reason =
    result.kind === "recoverable-conflict"
      ? result.resources?.[0]?.reason
      : undefined;
  const messageByReason: Record<string, string> = {
    "already-allocated": "Esta máquina já está mobilizada em outra obra.",
    "assigned-to-front":
      "Esta máquina já está vinculada a uma frente e não pode ser alterada aqui.",
    "job-role-changed":
      "A função de um integrante da equipe mudou. Atualize a equipe e tente novamente.",
    "latest-reading-changed":
      "A última leitura da máquina mudou. Reabra esta edição para usar a leitura atual.",
    "operator-not-allowed": "Esta máquina não aceita operador.",
    "operator-required": "Esta máquina exige pelo menos um operador.",
    "operator-role-mismatch":
      "O operador não possui a função exigida por esta máquina.",
    unavailable:
      "A máquina ou o operador não está mais disponível para esta obra.",
  };
  const fallback =
    result.message === "Project resources changed"
      ? "A mobilização mudou enquanto você editava. Atualize as máquinas e tente novamente."
      : result.message || "Não foi possível concluir a mobilização agora.";
  const message = reason ? (messageByReason[reason] ?? fallback) : fallback;

  return result.requestId
    ? `${message} Código de atendimento: ${result.requestId}.`
    : message;
}

export type FuelDraft = {
  key: string;
  mode: "existing" | "new";
  sourceOfferId: string;
  supplierId: string;
  itemId: string;
  purchaseUnitId: string;
  conversionToBase: string;
  price: string;
  customQuantityEnabled: boolean;
  defaultConversionToBase: string;
};

type FuelAddStep = "source" | "item" | "offer" | "details";

type LookupSuppliedItemsAction = (input: {
  categoryId?: string | null;
  cursor?: string | null;
  onlyWithActiveOffers?: boolean;
  search?: string;
  kind: "fuel" | "material";
}) => Promise<SuppliedItemSelectorPage>;

type LookupSuppliedItemOfferSuppliersAction = (input: {
  itemId: string;
  search?: string;
  kind: "fuel" | "material";
}) => Promise<FuelSupplierOption[]>;

type LookupSuppliedItemOffersAction = (input: {
  cursor?: string | null;
  itemId: string;
  supplierId?: string | null;
  kind: "fuel" | "material";
}) => Promise<ProjectSuppliedItemOffersPage>;

export type ReadinessOfferCommand =
  | {
      mode: "existing";
      sourceOfferId: string;
      conversionToBase?: string;
      price: string;
    }
  | {
      mode: "projectOnly" | "companyCatalog";
      supplierId: string;
      itemId: string;
      purchaseUnitId: string;
      conversionToBase: string;
      price: string;
    };

type ProjectTab =
  | "planning"
  | "calendar"
  | "fronts"
  | "overview"
  | "production"
  | "reports"
  | "accountability"
  | "team"
  | "machines"
  | "fuel"
  | "materials"
  | "financial"
  | "payments";

const projectTabs = new Set<ProjectTab>([
  "planning",
  "calendar",
  "fronts",
  "overview",
  "production",
  "reports",
  "accountability",
  "team",
  "machines",
  "fuel",
  "materials",
  "financial",
  "payments",
]);

function resolveInitialProjectTab(
  status: ProjectDetailSnapshot["status"],
  requestedSection?: string,
): ProjectTab {
  const fallback = status === "active" ? "overview" : "planning";
  if (!requestedSection || !projectTabs.has(requestedSection as ProjectTab))
    return fallback;
  if (
    status !== "active" &&
    ["overview", "production", "reports"].includes(requestedSection)
  )
    return fallback;
  return requestedSection as ProjectTab;
}

type ProjectNavigationGroup =
  | "reports"
  | "settings"
  | "suppliers"
  | "financial";

function projectNavigationGroupForTab(
  tab: ProjectTab,
): ProjectNavigationGroup | null {
  if (tab === "accountability" || tab === "machines" || tab === "team")
    return "settings";
  if (tab === "fuel" || tab === "materials") return "suppliers";
  if (tab === "financial" || tab === "payments") return "financial";
  if (tab === "reports") return "reports";
  return null;
}

type ReadinessTone = "ready" | "pending" | "dirty" | "neutral";

type ProjectNavigationStatus = {
  label: string;
  tone: ReadinessTone;
};

type ProjectNavigationGroupItem = {
  label: string;
  status: ProjectNavigationStatus;
};

const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(value: string | null) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Não iniciado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatMoney(value: string, fractionDigits = 2) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value));
}

function metricInitialState(project: ProjectDetailSnapshot) {
  const existing = new Map(
    project.quantityBaseline.items.map((target) => [
      target.serviceCode,
      target.total,
    ]),
  );
  return metricDefinitions.map((metric) => ({
    ...metric,
    enabled: existing.has(metric.code),
    targetTotal: existing.has(metric.code)
      ? canonicalDecimalToBrazilian(existing.get(metric.code)!, 3)
      : "",
  }));
}

function paymentTermsToState(
  terms: ProjectDetailSnapshot["compensationPaymentTerms"],
) {
  return Object.fromEntries(
    terms.map((term) => [
      term.compensationMode,
      String(term.daysAfterPeriodEnd),
    ]),
  ) as Partial<Record<CompensationMode, string>>;
}

function paymentInitialState(project: ProjectDetailSnapshot) {
  return paymentTermsToState(project.compensationPaymentTerms);
}

function paymentModeSort(a: CompensationMode, b: CompensationMode) {
  return compensationModeOrder.indexOf(a) - compensationModeOrder.indexOf(b);
}

function paymentOptionsForMode(mode: CompensationMode) {
  if (mode === "monthly") return monthlyBusinessDayOptions;
  if (mode === "weekly" || mode === "fortnightly") return weekDayPaymentOptions;
  return dailyPaymentOptions;
}

function paymentPromptForMode(mode: CompensationMode) {
  if (mode === "monthly") return "Escolha o dia útil do mês para pagamento.";
  if (mode === "weekly") return "Escolha o dia da semana do pagamento.";
  if (mode === "fortnightly")
    return "Escolha o dia da semana do acerto quinzenal.";
  if (mode === "daily")
    return "Confirme se a diária fecha no mesmo dia ou no próximo dia útil.";
  return "Confirme quando as horas apontadas serão pagas.";
}

function paymentTermSummary(mode: CompensationMode, value: number) {
  const match = paymentOptionsForMode(mode).find(
    (option) => Number(option.value) === value,
  );
  if (match) return match.label;
  return `${value} dia(s) após o fechamento`;
}

function projectToCommand(project: ProjectDetailSnapshot): ProjectCommand {
  return {
    ...emptyProjectCommand,
    name: project.name,
    address: {
      postalCode: project.address.postalCode ?? "",
      street: project.address.street ?? "",
      number: project.address.number,
      complement: project.address.complement,
      neighborhood: project.address.neighborhood ?? "",
      city: project.address.city ?? "",
      state: project.address.state ?? "",
    },
    latitude: project.latitude,
    longitude: project.longitude,
    contractNumber: project.contractNumber,
    approvedBudget: project.baseline?.approvedBudget ?? "0.00",
    plannedStartDate: project.baseline?.plannedStartDate ?? "",
    plannedEndDate: project.baseline?.plannedEndDate ?? null,
    clientId: project.client?.id ?? "",
    managerEmploymentId: project.manager?.id ?? "",
    technicalResponsibilityEmploymentIds: project.technicalResponsibilities.map(
      (person) => person.id,
    ),
    weeklySchedule:
      project.schedule.days.length === 7 || project.schedule.days.length === 14
        ? project.schedule.days
        : emptyProjectCommand.weeklySchedule,
    breakTemplates: project.schedule.breakTemplates.map((item) => ({
      shift: item.shift,
      name: item.name,
      durationMinutes: item.durationMinutes,
    })),
    initialEmployeeAllocations: project.employeeAllocations
      .filter((allocation) => allocation.employment)
      .map((allocation) => ({
        employmentId: allocation.employment!.id,
        shift: allocation.shift,
        confirmedJobRoleId: allocation.confirmedJobRoleId ?? undefined,
        confirmedJobRolePeriodId: allocation.confirmedJobRolePeriodId,
        ...(!allocation.confirmedJobRoleId &&
        !allocation.confirmedJobRolePeriodId
          ? { confirmedJobRoleName: allocation.jobRole }
          : {}),
        monthlyWorkloadHours: allocation.monthlyWorkloadHours,
        compensationMode: allocation.compensationMode,
        compensationValue: allocation.compensationValue,
        overtimeRate: allocation.overtimeRate,
      })),
    initialMachineAllocations: project.machineAllocations
      .filter(
        (allocation) => allocation.machine && allocation.startMeterReading,
      )
      .map((allocation) => ({
        machineId: allocation.machine!.id,
        startMeterReadingId: allocation.startMeterReading!.id,
        operatorAssignments: allocation.operatorAssignments.flatMap(
          (assignment) =>
            assignment.operator
              ? [
                  {
                    shift: assignment.shift,
                    operatorEmploymentId: assignment.operator.id,
                  },
                ]
              : [],
        ),
      })),
    projectSupplierOffers: [],
  };
}

function Section({
  action,
  children,
  description,
  icon: Icon,
  status,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description?: string;
  icon: typeof HardHat;
  status?: { label: string; tone: ReadinessTone };
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-secondary/35 px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold">{title}</h2>
              {status && (
                <span
                  className={cn(
                    "inline-flex min-h-6 items-center rounded-md px-2 text-xs font-bold",
                    status.tone === "ready" &&
                      "bg-emerald-100 text-emerald-900",
                    status.tone === "pending" && "bg-amber-100 text-amber-950",
                    status.tone === "dirty" && "bg-primary/10 text-primary",
                    status.tone === "neutral" &&
                      "bg-background text-muted-foreground",
                  )}
                >
                  {status.label}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-foreground">
        {value}
      </dd>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5">
      <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-sm font-semibold">
        {value}
      </dd>
    </div>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border bg-background px-3 py-5 text-center text-sm font-semibold text-muted-foreground">
      {children}
    </p>
  );
}

function SelectableRow({
  checked,
  children,
  onChange,
}: {
  checked: boolean;
  children: React.ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold transition-colors",
        checked && "border-primary bg-primary/5 text-foreground",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function ProjectNavigationItem({
  active,
  collapsed = false,
  icon: Icon,
  label,
  nested = false,
  onClick,
  status,
}: {
  active: boolean;
  collapsed?: boolean;
  icon: typeof HardHat;
  label: string;
  nested?: boolean;
  onClick: () => void;
  status: ProjectNavigationStatus;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? `${label}: ${status.label}` : undefined}
      title={collapsed ? `${label}: ${status.label}` : undefined}
      className={cn(
        "group flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-semibold transition-colors outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30",
        collapsed && "justify-center px-0",
        nested && !collapsed && "ml-3 w-[calc(100%-0.75rem)]",
        active && "bg-background text-foreground ring-1 ring-border",
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors group-hover:text-primary",
          active && "bg-primary/10 text-primary",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && (
        <span
          role="status"
          aria-label={`${label}: ${status.label}`}
          title={status.label}
          className={cn(
            "size-2 shrink-0 rounded-full",
            status.tone === "ready" && "bg-emerald-500",
            status.tone === "pending" && "bg-amber-500",
            status.tone === "dirty" && "bg-primary",
            status.tone === "neutral" && "bg-muted-foreground",
          )}
        />
      )}
    </button>
  );
}

function projectNavigationGroupSummary(
  items: readonly ProjectNavigationGroupItem[],
) {
  const pendingItems = items.filter((item) => item.status.tone === "pending");

  if (pendingItems.length) return { pendingItems, tone: "pending" as const };
  if (items.every((item) => item.status.tone === "ready"))
    return { pendingItems, tone: "ready" as const };
  if (items.some((item) => item.status.tone === "dirty"))
    return { pendingItems, tone: "dirty" as const };
  return { pendingItems, tone: "neutral" as const };
}

function ProjectNavigationGroupIndicator({
  groupLabel,
  pendingItems,
  tone,
}: {
  groupLabel: string;
  pendingItems: readonly ProjectNavigationGroupItem[];
  tone: ReadinessTone;
}) {
  const indicatorClass = cn(
    "size-2 shrink-0 rounded-full",
    tone === "ready" && "bg-emerald-500",
    tone === "pending" && "bg-amber-500",
    tone === "dirty" && "bg-primary",
    tone === "neutral" && "bg-muted-foreground",
  );

  if (tone !== "pending") {
    return (
      <span
        role="status"
        aria-label={`${groupLabel}: ${
          tone === "ready" ? "OK" : "Atenção necessária"
        }`}
        className={indicatorClass}
      />
    );
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        openOnHover
        delay={150}
        closeDelay={120}
        aria-label={`Ver pendências em ${groupLabel}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-amber-100 focus-visible:bg-amber-100 focus-visible:ring-3 focus-visible:ring-ring/30 data-popup-open:bg-amber-100 dark:hover:bg-amber-950/40 dark:focus-visible:bg-amber-950/40 dark:data-popup-open:bg-amber-950/40"
      >
        <span aria-hidden="true" className={indicatorClass} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 outline-none"
        >
          <Popover.Popup
            initialFocus={false}
            className="origin-[var(--transform-origin)] w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none transition-[opacity,transform] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <Popover.Title className="text-sm font-bold leading-5">
              Pendências em {groupLabel}
            </Popover.Title>
            <Popover.Description className="mt-1 text-sm leading-5 text-muted-foreground">
              Estes itens precisam ser concluídos.
            </Popover.Description>
            <ul className="mt-3 space-y-2" aria-label="Itens pendentes">
              {pendingItems.map((item) => (
                <li
                  key={item.label}
                  className="flex items-start gap-2 text-sm leading-5"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
                  />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ProjectNavigationGroup({
  children,
  collapsed,
  expanded,
  icon: Icon,
  items,
  label,
  onClick,
}: {
  children: React.ReactNode;
  collapsed: boolean;
  expanded: boolean;
  icon: typeof HardHat;
  items: readonly ProjectNavigationGroupItem[];
  label: string;
  onClick: () => void;
}) {
  const summary = projectNavigationGroupSummary(items);

  return (
    <div className="group/project-navigation-group">
      <div
        className={cn(
          "flex min-h-10 w-full items-center rounded-md text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-within:bg-secondary focus-within:text-foreground focus-within:ring-3 focus-within:ring-ring/30",
          collapsed && "justify-center",
          expanded && !collapsed && "bg-secondary/75 text-foreground",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={collapsed ? label : undefined}
          title={collapsed ? label : undefined}
          className={cn(
            "flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left outline-none",
            collapsed && "justify-center px-0",
          )}
          onClick={onClick}
        >
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {expanded ? (
                <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
              )}
            </>
          )}
        </button>
        {!collapsed && !expanded && (
          <div className="mr-1 flex size-8 shrink-0 items-center justify-center">
            <ProjectNavigationGroupIndicator
              groupLabel={label}
              pendingItems={summary.pendingItems}
              tone={summary.tone}
            />
          </div>
        )}
      </div>
      {expanded && !collapsed && (
        <div className="mt-1 space-y-1">{children}</div>
      )}
    </div>
  );
}

function defaultUnitId(
  units: ProjectReadinessOptions["measurementUnits"],
  item?: ProjectReadinessOptions["suppliedItems"][number],
) {
  if (item?.baseUnitId) return item.baseUnitId;
  const liter = units.find(
    (unit) => unit.code.toLocaleLowerCase("pt-BR") === "l",
  );
  return liter?.id ?? units[0]?.id ?? "";
}

function pickFuelOptions(options: SupplierOfferOption[]) {
  return options.filter((offer) => offer.kind === "fuel");
}

export function createBlankFuelDraft(
  options: SupplierOfferOption[],
  measurementUnits: ProjectReadinessOptions["measurementUnits"],
): FuelDraft {
  return {
    key: crypto.randomUUID(),
    mode: options.length > 0 ? "existing" : "new",
    sourceOfferId: "",
    supplierId: "",
    itemId: "",
    purchaseUnitId: defaultUnitId(measurementUnits),
    conversionToBase: "1,000000",
    price: "",
    customQuantityEnabled: false,
    defaultConversionToBase: "1,000000",
  };
}

function createFuelDraftFromOffer(offer: ProjectOfferSnapshot): FuelDraft {
  return {
    key: offer.id,
    mode: offer.sourceOfferId ? "existing" : "new",
    sourceOfferId: offer.sourceOfferId ?? "",
    supplierId: offer.supplier?.id ?? "",
    itemId: offer.item?.id ?? "",
    purchaseUnitId: offer.purchaseUnit?.id ?? "",
    conversionToBase: canonicalDecimalToBrazilian(offer.conversionToBase, 6),
    price: canonicalDecimalToBrazilian(offer.price, 4),
    customQuantityEnabled: false,
    defaultConversionToBase: canonicalDecimalToBrazilian(
      offer.conversionToBase,
      6,
    ),
  };
}

function projectOfferToCommand(
  offer: ProjectOfferSnapshot,
): ReadinessOfferCommand | null {
  if (offer.sourceOfferId) {
    return {
      mode: "existing",
      sourceOfferId: offer.sourceOfferId,
      conversionToBase: offer.conversionToBase,
      price: offer.price,
    };
  }
  if (!offer.supplier?.id || !offer.item?.id || !offer.purchaseUnit?.id)
    return null;
  return {
    mode: "projectOnly",
    supplierId: offer.supplier.id,
    itemId: offer.item.id,
    purchaseUnitId: offer.purchaseUnit.id,
    conversionToBase: offer.conversionToBase,
    price: offer.price,
  };
}

export function draftToFuelCommand(draft: FuelDraft): ReadinessOfferCommand {
  const price = decimalInputToCanonical(draft.price, 4);
  if (draft.mode === "existing") {
    return {
      mode: "existing",
      sourceOfferId: draft.sourceOfferId,
      conversionToBase: decimalInputToCanonical(draft.conversionToBase, 6),
      price,
    };
  }
  return {
    mode: "projectOnly",
    supplierId: draft.supplierId,
    itemId: draft.itemId,
    purchaseUnitId: draft.purchaseUnitId,
    conversionToBase: decimalInputToCanonical(draft.conversionToBase, 6),
    price,
  };
}

function isOfferCommandComplete(command: ReadinessOfferCommand) {
  if (!command.price || command.price === "0.0000") return false;
  if (command.mode === "existing") return Boolean(command.sourceOfferId);
  return (
    Boolean(command.supplierId) &&
    Boolean(command.itemId) &&
    Boolean(command.purchaseUnitId) &&
    Boolean(command.conversionToBase) &&
    command.conversionToBase !== "0.000000"
  );
}

function isPositiveDecimalInput(value: string, fractionDigits: number) {
  const canonical = decimalInputToCanonical(value, fractionDigits);
  return Boolean(canonical && !/^0+\.0+$/u.test(canonical));
}

function isFuelDraftComplete(draft: FuelDraft) {
  const hasPrice = isPositiveDecimalInput(draft.price, 4);
  const hasQuantity = isPositiveDecimalInput(draft.conversionToBase, 6);
  if (draft.mode === "existing") {
    return Boolean(
      draft.sourceOfferId &&
      draft.supplierId &&
      draft.itemId &&
      draft.purchaseUnitId &&
      hasPrice &&
      hasQuantity,
    );
  }
  return Boolean(
    draft.supplierId &&
    draft.itemId &&
    draft.purchaseUnitId &&
    hasPrice &&
    hasQuantity,
  );
}

function canContinueFuelStep(step: FuelAddStep, draft: FuelDraft | null) {
  if (!draft) return false;
  if (step === "source")
    return draft.mode === "existing" || draft.mode === "new";
  if (step === "item") return Boolean(draft.itemId);
  if (step === "offer") {
    if (draft.mode === "existing") return Boolean(draft.sourceOfferId);
    return Boolean(
      draft.supplierId &&
      draft.purchaseUnitId &&
      isPositiveDecimalInput(draft.price, 4) &&
      isPositiveDecimalInput(draft.conversionToBase, 6),
    );
  }
  return isFuelDraftComplete(draft);
}

function previousFuelStep(step: FuelAddStep): FuelAddStep {
  if (step === "details") return "offer";
  if (step === "offer") return "item";
  if (step === "item") return "source";
  return "source";
}

function nextFuelStep(step: FuelAddStep): FuelAddStep {
  if (step === "source") return "item";
  if (step === "item") return "offer";
  if (step === "offer") return "details";
  return "details";
}

function categoryLabel(
  categories: ProjectReadinessOptions["suppliedItemCategories"],
  categoryId: string | null,
) {
  if (!categoryId) return "Sem categoria";
  const byId = new Map(categories.map((category) => [category.id, category]));
  const names: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = categoryId;
  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const category = byId.get(currentId);
    if (!category) break;
    names.unshift(category.name);
    currentId = category.parentId;
  }
  return names.length ? names.join(" / ") : "Categoria indisponível";
}

function ReadonlyField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 min-w-0 break-words text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function QuantityEditor({
  checked,
  label,
  helperText,
  value,
  onCheckedChange,
  onValueChange,
}: {
  checked: boolean;
  label: string;
  helperText: string;
  value: string;
  onCheckedChange: (checked: boolean) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-secondary/40 px-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="size-4 accent-primary"
        />
        {label}
      </label>
      <p className="text-xs font-semibold text-muted-foreground">
        {helperText}
      </p>
      {checked && (
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>Quantidade</span>
          <Input
            className="h-11"
            inputMode="decimal"
            value={value}
            onChange={(event) =>
              onValueChange(formatBrazilianDecimalInput(event.target.value, 6))
            }
          />
        </label>
      )}
    </div>
  );
}

export function FuelAddEditor({
  categories,
  draft,
  fuelOptions,
  lookupSuppliedItemOfferSuppliersAction,
  lookupSuppliedItemOffersAction,
  lookupSuppliedItemsAction,
  measurementUnits,
  suppliers,
  suppliedItems,
  step,
  setDraft,
}: {
  categories: ProjectReadinessOptions["suppliedItemCategories"];
  draft: FuelDraft;
  fuelOptions: SupplierOfferOption[];
  lookupSuppliedItemOfferSuppliersAction: LookupSuppliedItemOfferSuppliersAction;
  lookupSuppliedItemOffersAction: LookupSuppliedItemOffersAction;
  lookupSuppliedItemsAction: LookupSuppliedItemsAction;
  measurementUnits: ProjectReadinessOptions["measurementUnits"];
  suppliers: ProjectReadinessOptions["suppliers"];
  suppliedItems: ProjectReadinessOptions["suppliedItems"];
  step: FuelAddStep;
  setDraft: React.Dispatch<React.SetStateAction<FuelDraft | null>>;
}) {
  const [itemSearch, setItemSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [items, setItems] = React.useState<SuppliedItemSelectorOption[]>([]);
  const [itemPageInfo, setItemPageInfo] = React.useState<{
    hasNextPage: boolean;
    nextCursor: string | null;
  }>({ hasNextPage: false, nextCursor: null });
  const [selectedItem, setSelectedItem] =
    React.useState<SuppliedItemSelectorOption | null>(null);
  const [isItemLoading, setIsItemLoading] = React.useState(false);
  const [itemError, setItemError] = React.useState<string | null>(null);
  const [supplierSearch, setSupplierSearch] = React.useState("");
  const [offerSuppliers, setOfferSuppliers] = React.useState<
    FuelSupplierOption[]
  >([]);
  const [selectedOfferSupplierId, setSelectedOfferSupplierId] =
    React.useState("");
  const [isSupplierLoading, setIsSupplierLoading] = React.useState(false);
  const [supplierError, setSupplierError] = React.useState<string | null>(null);
  const [offers, setOffers] = React.useState<ProjectSuppliedItemOfferOption[]>(
    [],
  );
  const [offerPageInfo, setOfferPageInfo] = React.useState<{
    hasNextPage: boolean;
    nextCursor: string | null;
  }>({ hasNextPage: false, nextCursor: null });
  const [isOfferLoading, setIsOfferLoading] = React.useState(false);
  const [offerError, setOfferError] = React.useState<string | null>(null);
  const [exclusiveSupplierSearch, setExclusiveSupplierSearch] =
    React.useState("");
  const debouncedItemSearch = useDebouncer(itemSearch, 300);
  const debouncedSupplierSearch = useDebouncer(supplierSearch, 300);
  const itemRequestId = React.useRef(0);
  const supplierRequestId = React.useRef(0);
  const offerRequestId = React.useRef(0);

  const selectedOffer = offers.find(
    (offer) => offer.id === draft.sourceOfferId,
  );
  const selectedSupplier =
    draft.mode === "existing"
      ? (selectedOffer?.supplier ??
        offerSuppliers.find((supplier) => supplier.id === draft.supplierId))
      : suppliers.find((supplier) => supplier.id === draft.supplierId);
  const selectedUnit = measurementUnits.find(
    (unit) => unit.id === draft.purchaseUnitId,
  );

  const resetSelections = React.useCallback(
    (mode: FuelDraft["mode"]) => {
      setSelectedItem(null);
      setItemSearch("");
      setCategoryId("");
      setItems([]);
      setSupplierSearch("");
      setOfferSuppliers([]);
      setOffers([]);
      setSelectedOfferSupplierId("");
      setExclusiveSupplierSearch("");
      setItemError(null);
      setSupplierError(null);
      setOfferError(null);
      setDraft({
        ...createBlankFuelDraft(fuelOptions, measurementUnits),
        mode,
      });
    },
    [fuelOptions, measurementUnits, setDraft],
  );

  const loadItems = React.useCallback(
    (cursor?: string | null, append = false) => {
      const requestId = itemRequestId.current + 1;
      itemRequestId.current = requestId;
      setIsItemLoading(true);
      setItemError(null);
      void lookupSuppliedItemsAction({
        categoryId: categoryId || null,
        cursor,
        onlyWithActiveOffers: draft.mode === "existing",
        search: debouncedItemSearch,
        kind: "fuel",
      })
        .then((page) => {
          if (itemRequestId.current !== requestId) return;
          setItems((current) =>
            append ? [...current, ...page.data] : page.data,
          );
          setItemPageInfo(page.pageInfo);
        })
        .catch(() => {
          if (itemRequestId.current !== requestId) return;
          setItems([]);
          setItemPageInfo({ hasNextPage: false, nextCursor: null });
          setItemError("Não foi possível consultar os itens agora.");
        })
        .finally(() => {
          if (itemRequestId.current === requestId) setIsItemLoading(false);
        });
    },
    [categoryId, debouncedItemSearch, draft.mode, lookupSuppliedItemsAction],
  );

  const loadOffers = React.useCallback(
    (cursor?: string | null, append = false) => {
      if (!draft.itemId || draft.mode !== "existing") return;
      const requestId = offerRequestId.current + 1;
      offerRequestId.current = requestId;
      setIsOfferLoading(true);
      setOfferError(null);
      void lookupSuppliedItemOffersAction({
        cursor,
        itemId: draft.itemId,
        supplierId: selectedOfferSupplierId || null,
        kind: "fuel",
      })
        .then((page) => {
          if (offerRequestId.current !== requestId) return;
          setOffers((current) =>
            append ? [...current, ...page.data] : page.data,
          );
          setOfferPageInfo(page.pageInfo);
        })
        .catch(() => {
          if (offerRequestId.current !== requestId) return;
          setOffers([]);
          setOfferPageInfo({ hasNextPage: false, nextCursor: null });
          setOfferError("Não foi possível consultar as ofertas deste item.");
        })
        .finally(() => {
          if (offerRequestId.current === requestId) setIsOfferLoading(false);
        });
    },
    [
      draft.itemId,
      draft.mode,
      lookupSuppliedItemOffersAction,
      selectedOfferSupplierId,
    ],
  );

  React.useEffect(() => {
    if (step !== "item") return;
    void Promise.resolve().then(() => loadItems(null, false));
  }, [loadItems, step]);

  React.useEffect(() => {
    if (step !== "offer" || draft.mode !== "existing" || !draft.itemId) return;
    void Promise.resolve().then(() => {
      const requestId = supplierRequestId.current + 1;
      supplierRequestId.current = requestId;
      setIsSupplierLoading(true);
      setSupplierError(null);
      void lookupSuppliedItemOfferSuppliersAction({
        itemId: draft.itemId,
        search: debouncedSupplierSearch,
        kind: "fuel",
      })
        .then((data) => {
          if (supplierRequestId.current !== requestId) return;
          setOfferSuppliers(data);
        })
        .catch(() => {
          if (supplierRequestId.current !== requestId) return;
          setOfferSuppliers([]);
          setSupplierError("Não foi possível consultar fornecedores do item.");
        })
        .finally(() => {
          if (supplierRequestId.current === requestId)
            setIsSupplierLoading(false);
        });
    });
  }, [
    debouncedSupplierSearch,
    draft.itemId,
    draft.mode,
    lookupSuppliedItemOfferSuppliersAction,
    step,
  ]);

  React.useEffect(() => {
    if (step !== "offer" || draft.mode !== "existing" || !draft.itemId) return;
    void Promise.resolve().then(() => loadOffers(null, false));
  }, [draft.itemId, draft.mode, loadOffers, selectedOfferSupplierId, step]);

  const selectItem = (item: SuppliedItemSelectorOption) => {
    setSelectedItem(item);
    setSelectedOfferSupplierId("");
    setOfferSuppliers([]);
    setOffers([]);
    const defaultConversion = "1,000000";
    setDraft((current) =>
      current
        ? {
            ...current,
            itemId: item.id,
            sourceOfferId: "",
            supplierId: "",
            purchaseUnitId: defaultUnitId(measurementUnits, item),
            conversionToBase: defaultConversion,
            defaultConversionToBase: defaultConversion,
            customQuantityEnabled: false,
            price: "",
          }
        : current,
    );
  };

  const selectOffer = (offer: ProjectSuppliedItemOfferOption) => {
    if (!offer.currentPrice || !offer.purchaseUnit) return;
    const currentPrice = offer.currentPrice;
    const purchaseUnit = offer.purchaseUnit;
    const nextQuantity = canonicalDecimalToBrazilian(offer.conversionToBase, 6);
    setDraft((current) =>
      current
        ? {
            ...current,
            sourceOfferId: offer.id,
            supplierId: offer.supplier.id,
            purchaseUnitId: purchaseUnit.id,
            conversionToBase: nextQuantity,
            defaultConversionToBase: nextQuantity,
            customQuantityEnabled: false,
            price: canonicalDecimalToBrazilian(currentPrice.price, 4),
          }
        : current,
    );
  };

  const filteredExclusiveSuppliers = suppliers.filter((supplier) => {
    const search = exclusiveSupplierSearch.trim().toLocaleLowerCase("pt-BR");
    if (!search) return true;
    return [supplier.name, supplier.tradeName ?? ""].some((value) =>
      value.toLocaleLowerCase("pt-BR").includes(search),
    );
  });

  const quantityHelper =
    draft.mode === "existing"
      ? selectedOffer
        ? `Quantidade padrão da oferta: ${canonicalDecimalToBrazilian(selectedOffer.conversionToBase, 6)}`
        : "Selecione uma oferta para usar a quantidade padrão do catálogo."
      : `Quantidade padrão desta oferta exclusiva: ${draft.defaultConversionToBase}`;

  return (
    <div className="grid gap-4">
      <FuelWizardProgress step={step} />

      {step === "source" && (
        <FormSection
          title="Origem da oferta"
          description="Escolha se a obra vai usar uma oferta já cadastrada ou uma condição exclusiva."
        >
          <div className="grid gap-2">
            <FuelSourceOption
              checked={draft.mode === "existing"}
              title="Oferta existente do catálogo"
              description="Usa item, fornecedor, unidade e preço de uma oferta ativa, com ajuste opcional para esta obra."
              onClick={() => resetSelections("existing")}
            />
            <FuelSourceOption
              checked={draft.mode === "new"}
              title="Oferta exclusiva da obra"
              description="Registra fornecedor, item, unidade e preço apenas para esta obra, sem criar oferta no catálogo."
              onClick={() => resetSelections("new")}
            />
          </div>
        </FormSection>
      )}

      {step === "item" && (
        <FormSection
          title="Item de combustível"
          description={
            draft.mode === "existing"
              ? "A listagem mostra apenas itens com fornecedor ativo e oferta ativa."
              : "Selecione um item ativo do catálogo para criar uma condição exclusiva."
          }
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Buscar por nome</span>
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 pl-9"
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  placeholder="Diesel, gasolina..."
                />
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Categoria</span>
              <select
                className={controlClass}
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setSelectedItem(null);
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          itemId: "",
                          sourceOfferId: "",
                          supplierId: "",
                          price: "",
                        }
                      : current,
                  );
                }}
              >
                <option value="">Todas as categorias</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {categoryLabel(categories, category.id)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {itemError && (
            <FormErrorDeclaration
              title="Não foi possível carregar itens."
              description="A consulta ao catálogo não foi concluída."
              issues={[{ location: "Itens", message: itemError }]}
            />
          )}

          <div className="grid gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={draft.itemId === item.id}
                className={cn(
                  "min-h-16 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  draft.itemId === item.id &&
                    "border-primary bg-primary/5 ring-1 ring-primary/20",
                )}
                onClick={() => selectItem(item)}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{item.name}</span>
                  <span className="rounded-sm bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                    {item.activeSupplierCount} fornecedor(es)
                  </span>
                </span>
                <span className="mt-1 block text-sm font-medium text-muted-foreground">
                  {item.categoryPath.length
                    ? item.categoryPath.join(" / ")
                    : "Sem categoria"}
                </span>
              </button>
            ))}

            {isItemLoading && <LoadingRows />}

            {!isItemLoading && !itemError && items.length === 0 && (
              <p className="rounded-md border border-dashed border-border bg-background px-3 py-5 text-center text-sm font-semibold text-muted-foreground">
                Nenhum item encontrado para os filtros atuais.
              </p>
            )}

            {itemPageInfo.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                className="min-h-10 justify-self-start"
                disabled={isItemLoading}
                onClick={() => loadItems(itemPageInfo.nextCursor, true)}
              >
                Carregar mais itens
              </Button>
            )}
          </div>
        </FormSection>
      )}

      {step === "offer" && draft.mode === "existing" && (
        <FormSection
          title="Oferta disponível"
          description="Filtre por fornecedor ativo e selecione a oferta que será usada nesta obra."
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
            <ReadonlyField
              label="Item selecionado"
              value={
                selectedItem?.name ??
                suppliedItems.find((item) => item.id === draft.itemId)?.name ??
                "Item selecionado"
              }
            />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Filtrar fornecedor</span>
              <Input
                className="h-11"
                value={supplierSearch}
                onChange={(event) => setSupplierSearch(event.target.value)}
                placeholder="Nome do fornecedor"
              />
            </label>
          </div>

          {supplierError && (
            <FormErrorDeclaration
              title="Não foi possível carregar fornecedores."
              description="A consulta aos fornecedores ativos não foi concluída."
              issues={[{ location: "Fornecedores", message: supplierError }]}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={selectedOfferSupplierId ? "outline" : "secondary"}
              size="sm"
              onClick={() => {
                setSelectedOfferSupplierId("");
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        sourceOfferId: "",
                        supplierId: "",
                        price: "",
                      }
                    : current,
                );
              }}
            >
              Todos
            </Button>
            {offerSuppliers.map((supplier) => (
              <Button
                key={supplier.id}
                type="button"
                variant={
                  selectedOfferSupplierId === supplier.id
                    ? "secondary"
                    : "outline"
                }
                size="sm"
                onClick={() => {
                  setSelectedOfferSupplierId(supplier.id);
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          sourceOfferId: "",
                          supplierId: supplier.id,
                          price: "",
                        }
                      : current,
                  );
                }}
              >
                {supplier.name}
              </Button>
            ))}
          </div>

          {isSupplierLoading && (
            <p className="text-sm font-semibold text-muted-foreground">
              Carregando fornecedores...
            </p>
          )}

          {offerError && (
            <FormErrorDeclaration
              title="Não foi possível carregar ofertas."
              description="A consulta às ofertas disponíveis não foi concluída."
              issues={[{ location: "Ofertas", message: offerError }]}
            />
          )}

          <div className="grid gap-2">
            {offers.map((offer) => {
              const isDisabled = !offer.currentPrice || !offer.purchaseUnit;
              return (
                <button
                  key={offer.id}
                  type="button"
                  disabled={isDisabled}
                  aria-pressed={draft.sourceOfferId === offer.id}
                  className={cn(
                    "min-h-16 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55",
                    draft.sourceOfferId === offer.id &&
                      "border-primary bg-primary/5 ring-1 ring-primary/20",
                  )}
                  onClick={() => selectOffer(offer)}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{offer.supplier.name}</span>
                    <span className="rounded-sm bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                      {offer.purchaseUnit?.code ?? "sem un."}
                    </span>
                    <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      {offer.currentPrice
                        ? formatMoney(offer.currentPrice.price, 4)
                        : "Sem preço vigente"}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm font-medium text-muted-foreground">
                    Quantidade:{" "}
                    {canonicalDecimalToBrazilian(offer.conversionToBase, 6)}
                  </span>
                </button>
              );
            })}

            {isOfferLoading && <LoadingRows />}

            {!isOfferLoading && !offerError && offers.length === 0 && (
              <p className="rounded-md border border-dashed border-border bg-background px-3 py-5 text-center text-sm font-semibold text-muted-foreground">
                Nenhuma oferta ativa encontrada para este item.
              </p>
            )}

            {offerPageInfo.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                className="min-h-10 justify-self-start"
                disabled={isOfferLoading}
                onClick={() => loadOffers(offerPageInfo.nextCursor, true)}
              >
                Carregar mais ofertas
              </Button>
            )}
          </div>
        </FormSection>
      )}

      {step === "offer" && draft.mode === "new" && (
        <FormSection
          title="Condição exclusiva"
          description="Escolha fornecedor, unidade, preço e quantidade para uso apenas nesta obra."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ReadonlyField
              label="Item selecionado"
              value={
                selectedItem?.name ??
                suppliedItems.find((item) => item.id === draft.itemId)?.name ??
                "Item selecionado"
              }
            />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Buscar fornecedor</span>
              <Input
                className="h-11"
                value={exclusiveSupplierSearch}
                onChange={(event) =>
                  setExclusiveSupplierSearch(event.target.value)
                }
                placeholder="Nome do fornecedor"
              />
            </label>
          </div>

          <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-border bg-background p-2">
            {filteredExclusiveSuppliers.map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                aria-pressed={draft.supplierId === supplier.id}
                className={cn(
                  "min-h-11 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  draft.supplierId === supplier.id &&
                    "bg-primary/5 font-bold text-primary ring-1 ring-primary/20",
                )}
                onClick={() =>
                  setDraft((current) =>
                    current ? { ...current, supplierId: supplier.id } : current,
                  )
                }
              >
                <span className="block font-bold">{supplier.name}</span>
                <span className="block text-xs font-semibold text-muted-foreground">
                  {supplier.document.maskedDocument}
                </span>
              </button>
            ))}
            {filteredExclusiveSuppliers.length === 0 && (
              <p className="px-3 py-4 text-center text-sm font-semibold text-muted-foreground">
                Nenhum fornecedor ativo encontrado.
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem] md:items-end">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Unidade</span>
              <select
                className={controlClass}
                value={draft.purchaseUnitId}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, purchaseUnitId: event.target.value }
                      : current,
                  )
                }
              >
                <option value="">Selecione</option>
                {measurementUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code} - {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Preço</span>
              <Input
                className="h-11"
                inputMode="decimal"
                value={draft.price}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          price: formatBrazilianDecimalInput(
                            event.target.value,
                            4,
                          ),
                        }
                      : current,
                  )
                }
              />
            </label>
          </div>

          <QuantityEditor
            checked={draft.customQuantityEnabled}
            label="Informar quantidade nesta obra"
            helperText={quantityHelper}
            value={draft.conversionToBase}
            onCheckedChange={(checked) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      customQuantityEnabled: checked,
                      conversionToBase: checked
                        ? current.conversionToBase
                        : current.defaultConversionToBase,
                    }
                  : current,
              )
            }
            onValueChange={(value) =>
              setDraft((current) =>
                current ? { ...current, conversionToBase: value } : current,
              )
            }
          />
        </FormSection>
      )}

      {step === "details" && (
        <FormSection
          title="Revisão"
          description="Confira os dados antes de salvar o combustível na obra."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ReadonlyField
              label="Tipo"
              value={
                draft.mode === "existing"
                  ? "Oferta existente do catálogo"
                  : "Oferta exclusiva da obra"
              }
            />
            <ReadonlyField
              label="Item"
              value={
                selectedItem?.name ??
                suppliedItems.find((item) => item.id === draft.itemId)?.name ??
                "Item selecionado"
              }
            />
            <ReadonlyField
              label="Fornecedor"
              value={selectedSupplier?.name ?? "Fornecedor selecionado"}
            />
            <ReadonlyField
              label="Unidade"
              value={
                selectedUnit
                  ? `${selectedUnit.code} - ${selectedUnit.name}`
                  : "Unidade selecionada"
              }
            />
            <ReadonlyField
              label="Preço"
              value={
                isPositiveDecimalInput(draft.price, 4)
                  ? formatMoney(decimalInputToCanonical(draft.price, 4), 4)
                  : "Não informado"
              }
            />
            <ReadonlyField
              label="Quantidade"
              value={draft.conversionToBase || "Não informada"}
            />
          </div>
          {!isFuelDraftComplete(draft) && (
            <FormErrorDeclaration
              title="Dados incompletos."
              description="Volte às etapas anteriores e complete a oferta."
              issues={[
                {
                  location: "Combustível",
                  message:
                    "Fornecedor, item, unidade, preço e quantidade são obrigatórios.",
                },
              ]}
            />
          )}
        </FormSection>
      )}
    </div>
  );
}

function FuelWizardProgress({ step }: { step: FuelAddStep }) {
  const steps: Array<{ key: FuelAddStep; label: string }> = [
    { key: "source", label: "Origem" },
    { key: "item", label: "Item" },
    { key: "offer", label: "Oferta" },
    { key: "details", label: "Revisão" },
  ];
  const activeIndex = steps.findIndex((item) => item.key === step);

  return (
    <div className="grid gap-2 rounded-md border border-border bg-secondary/30 px-3 py-3 sm:grid-cols-4">
      {steps.map((item, index) => (
        <div
          key={item.key}
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-bold",
            index === activeIndex && "bg-background text-primary",
            index < activeIndex && "text-foreground",
            index > activeIndex && "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-sm border border-border text-xs",
              index <= activeIndex &&
                "border-primary bg-primary text-primary-foreground",
            )}
          >
            {index < activeIndex ? <Check className="size-3" /> : index + 1}
          </span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function FuelSourceOption({
  checked,
  description,
  onClick,
  title,
}: {
  checked: boolean;
  description: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className={cn(
        "min-h-20 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        checked && "border-primary bg-primary/5 ring-1 ring-primary/20",
      )}
      onClick={onClick}
    >
      <span className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border",
            checked && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {checked && <Check className="size-3" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-foreground">
            {title}
          </span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">
            {description}
          </span>
        </span>
      </span>
    </button>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-2" aria-label="Carregando">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="min-h-14 rounded-md border border-border bg-muted/60 px-3 py-3"
        >
          <div className="h-3 w-2/5 rounded-sm bg-muted-foreground/20" />
          <div className="mt-2 h-3 w-3/5 rounded-sm bg-muted-foreground/15" />
        </div>
      ))}
    </div>
  );
}

export function FuelEditEditor({
  draft,
  offer,
  setDraft,
}: {
  draft: FuelDraft;
  offer: ProjectOfferSnapshot;
  setDraft: React.Dispatch<React.SetStateAction<FuelDraft | null>>;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <ReadonlyField
          label="Fornecedor"
          value={offer.supplier?.name ?? "Fornecedor não encontrado"}
        />
        <ReadonlyField
          label="Item"
          value={offer.item?.name ?? "Item não encontrado"}
        />
        <ReadonlyField
          label="Unidade"
          value={offer.purchaseUnit?.code ?? "Unidade não encontrada"}
        />
      </div>

      <p className="text-sm font-semibold text-muted-foreground">
        Para trocar fornecedor, item ou unidade, remova esta oferta e adicione
        novamente.
      </p>

      <label className="grid gap-1.5 text-sm font-semibold">
        <span>Preço</span>
        <Input
          className="h-11"
          inputMode="decimal"
          value={draft.price}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    price: formatBrazilianDecimalInput(event.target.value, 4),
                  }
                : current,
            )
          }
        />
      </label>

      <QuantityEditor
        checked={draft.customQuantityEnabled}
        label="Alterar quantidade nesta obra"
        helperText={`Quantidade atual nesta obra: ${draft.defaultConversionToBase}`}
        value={draft.conversionToBase}
        onCheckedChange={(checked) =>
          setDraft((current) =>
            current
              ? {
                  ...current,
                  customQuantityEnabled: checked,
                  conversionToBase: checked
                    ? current.conversionToBase
                    : current.defaultConversionToBase,
                }
              : current,
          )
        }
        onValueChange={(value) =>
          setDraft((current) =>
            current ? { ...current, conversionToBase: value } : current,
          )
        }
      />
    </div>
  );
}

export function ProjectDetail({
  initialDailyReports,
  initialSection,
  initialTeamShift = "day",
  initialProductions,
  lookupSuppliedItemOfferSuppliersAction,
  lookupSuppliedItemOffersAction,
  lookupSuppliedItemsAction,
  lookupSuppliersAction,
  options,
  project: serverProject,
}: {
  initialDailyReports?: ProjectDailyReportsPage;
  initialSection?: string;
  initialTeamShift?: "day" | "night";
  initialProductions?: ProjectProductionsPage;
  lookupSuppliedItemOfferSuppliersAction: LookupSuppliedItemOfferSuppliersAction;
  lookupSuppliedItemOffersAction: LookupSuppliedItemOffersAction;
  lookupSuppliedItemsAction: LookupSuppliedItemsAction;
  lookupSuppliersAction: LookupMaterialSuppliersAction;
  options: ProjectReadinessOptions;
  project: ProjectDetailSnapshot;
}) {
  const router = useRouter();
  const appShellNavigation = useAppShellNavigation();
  const [project, setProject] = React.useState(serverProject);
  const [isPending, startTransition] = React.useTransition();
  const [isActivating, setIsActivating] = React.useState(false);
  const [isSavingMachines, setIsSavingMachines] = React.useState(false);
  const [machineSaveError, setMachineSaveError] = React.useState<string | null>(
    null,
  );
  const [isActivationConfirmationOpen, setIsActivationConfirmationOpen] =
    React.useState(false);
  const activationInFlightRef = React.useRef(false);
  const machineSaveInFlightRef = React.useRef(false);
  const [plannedStartDate, setPlannedStartDate] = React.useState(
    project.baseline?.plannedStartDate ?? "",
  );
  const [plannedEndDate, setPlannedEndDate] = React.useState(
    project.baseline?.plannedEndDate ?? "",
  );
  const [metrics, setMetrics] = React.useState(() =>
    metricInitialState(project),
  );
  const [fuelAddDraft, setFuelAddDraft] = React.useState<FuelDraft | null>(
    null,
  );
  const [fuelEditDraft, setFuelEditDraft] = React.useState<FuelDraft | null>(
    null,
  );
  const [fuelAddStep, setFuelAddStep] = React.useState<FuelAddStep>("source");
  const [editingFuelOfferId, setEditingFuelOfferId] = React.useState<
    string | null
  >(null);
  const [confirmingFuelRemovalId, setConfirmingFuelRemovalId] = React.useState<
    string | null
  >(null);
  const [fuelOffers, setFuelOffers] = React.useState(project.fuelOffers);
  const [materialView, setMaterialView] = React.useState<
    "list" | "add" | "edit"
  >("list");
  const [materialAddStep, setMaterialAddStep] =
    React.useState<MaterialAddStep>("source");
  const [materialDraft, setMaterialDraft] =
    React.useState<MaterialDraft | null>(null);
  const [editingMaterialOfferId, setEditingMaterialOfferId] = React.useState<
    string | null
  >(null);
  const [materialOffers, setMaterialOffers] = React.useState(
    project.supplierOffers,
  );
  const [materialIssues, setMaterialIssues] = React.useState<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >([]);
  const [paymentTermRows, setPaymentTermRows] = React.useState(
    project.compensationPaymentTerms,
  );
  const [paymentTerms, setPaymentTerms] = React.useState(() =>
    paymentInitialState(project),
  );
  const [plannedDatesDirty, setPlannedDatesDirty] = React.useState(false);
  const [quantityBaselineDirty, setQuantityBaselineDirty] =
    React.useState(false);
  const [plannedDateIssues, setPlannedDateIssues] = React.useState<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >([]);
  const [quantityBaselineIssues, setQuantityBaselineIssues] = React.useState<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >([]);
  const [fuelDirty, setFuelDirty] = React.useState(false);
  const [paymentDirty, setPaymentDirty] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<ProjectTab>(() =>
    resolveInitialProjectTab(serverProject.status, initialSection),
  );
  const [isProjectNavigationExpanded, setProjectNavigationExpanded] =
    React.useState(true);
  const [openNavigationGroups, setOpenNavigationGroups] = React.useState<
    ProjectNavigationGroup[]
  >(() => {
    const group = projectNavigationGroupForTab(
      resolveInitialProjectTab(serverProject.status, initialSection),
    );
    return group ? [group] : [];
  });
  const [frontName, setFrontName] = React.useState("");
  const [frontLocation, setFrontLocation] = React.useState("");
  const [editingFrontId, setEditingFrontId] = React.useState<string | null>(
    null,
  );
  const [frontRequiresEmployees, setFrontRequiresEmployees] =
    React.useState(true);
  const [frontRequiresMachines, setFrontRequiresMachines] =
    React.useState(true);
  const [frontQuantities, setFrontQuantities] = React.useState<
    Record<string, string>
  >({});
  const [frontIssues, setFrontIssues] = React.useState<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >([]);
  const editingFront =
    project.workFronts.find((front) => front.id === editingFrontId) ?? null;
  const frontExcessIssues = React.useMemo<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >(
    () =>
      project.quantityBaseline.items.flatMap((item) => {
        const quantity = decimalInputToCanonical(
          frontQuantities[item.serviceCode] ?? "",
          3,
        );
        const requested = canonicalDecimalToThousandths(quantity);
        const unallocated = canonicalDecimalToThousandths(item.unallocated);
        const current = canonicalDecimalToThousandths(
          editingFront?.services.find(
            (service) => service.serviceCode === item.serviceCode,
          )?.quantity ?? "0.000",
        );
        const available =
          unallocated === null || current === null
            ? null
            : unallocated + current;
        if (requested === null || available === null || requested <= available)
          return [];
        const label =
          metricDefinitions.find((metric) => metric.code === item.serviceCode)
            ?.label ?? item.serviceCode;
        return [
          {
            location: "Quantitativos",
            field: label,
            message: `Solicitado ${canonicalDecimalToBrazilian(quantity, 3)} ${item.unitCode}; saldo disponível ${canonicalDecimalToBrazilian(thousandthsToCanonicalDecimal(available), 3)} ${item.unitCode}.`,
          },
        ];
      }),
    [editingFront, frontQuantities, project.quantityBaseline.items],
  );
  const frontMinimumIssues = React.useMemo<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >(
    () =>
      project.quantityBaseline.items.flatMap((item) => {
        const currentService = editingFront?.services.find(
          (service) => service.serviceCode === item.serviceCode,
        );
        if (!currentService) return [];
        const quantity = decimalInputToCanonical(
          frontQuantities[item.serviceCode] ?? "",
          3,
        );
        const requested = canonicalDecimalToThousandths(quantity || "0.000");
        const minimum = canonicalDecimalToThousandths(
          currentService.minimumQuantity,
        );
        if (requested === null || minimum === null) return [];
        const label =
          metricDefinitions.find((metric) => metric.code === item.serviceCode)
            ?.label ?? item.serviceCode;
        if (requested === BigInt(0) && currentService.hasProductions) {
          return [
            {
              location: "Quantitativos",
              field: label,
              message:
                "Este serviço não pode ser removido porque possui produção vinculada, inclusive em rascunho.",
            },
          ];
        }
        if (requested >= minimum) return [];
        return [
          {
            location: "Quantitativos",
            field: label,
            message: `O mínimo permitido é ${canonicalDecimalToBrazilian(currentService.minimumQuantity, 3)} ${item.unitCode}, correspondente ao total já produzido.`,
          },
        ];
      }),
    [editingFront, frontQuantities, project.quantityBaseline.items],
  );
  const visibleFrontIssues = [
    ...frontMinimumIssues,
    ...frontExcessIssues,
    ...frontIssues,
  ];
  const quantityBaselineAllocationIssues = React.useMemo<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >(
    () =>
      metrics.flatMap((metric) => {
        const persisted = project.quantityBaseline.items.find(
          (item) => item.serviceCode === metric.code,
        );
        const allocated = canonicalDecimalToThousandths(
          persisted?.allocated ?? "0.000",
        );
        if (allocated === null || allocated === BigInt(0)) return [];
        const requested = metric.enabled
          ? canonicalDecimalToThousandths(
              decimalInputToCanonical(metric.targetTotal, 3),
            )
          : null;
        if (requested !== null && requested >= allocated) return [];
        return [
          {
            location: "Quantitativos",
            field: metric.label,
            message: `O total deve ser igual ou superior aos ${canonicalDecimalToBrazilian(persisted?.allocated ?? "0.000", 3)} ${persisted?.unitCode ?? ""} já distribuídos.`,
          },
        ];
      }),
    [metrics, project.quantityBaseline.items],
  );
  const visibleQuantityBaselineIssues = [
    ...quantityBaselineAllocationIssues,
    ...quantityBaselineIssues,
  ];
  const projectSnapshotIdentityRef = React.useRef({
    id: project.id,
    status: project.status,
  });
  const [mobilizingFrontId, setMobilizingFrontId] = React.useState<
    string | null
  >(null);
  const [frontEmploymentIds, setFrontEmploymentIds] = React.useState<string[]>(
    [],
  );
  const [frontMachineIds, setFrontMachineIds] = React.useState<string[]>([]);
  const [frontMobilizationIssues, setFrontMobilizationIssues] = React.useState<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >([]);
  const [historyResourceType, setHistoryResourceType] = React.useState<
    "employee" | "machine"
  >("employee");
  const [historyFrontId, setHistoryFrontId] = React.useState<string | null>(
    null,
  );
  const [historyItems, setHistoryItems] = React.useState<
    ProjectMobilizationHistoryItem[]
  >([]);
  const [historyNextCursor, setHistoryNextCursor] = React.useState<
    string | null
  >(null);
  const [openModal, setOpenModal] = React.useState<
    | "planningDates"
    | "quantityBaseline"
    | "accountability"
    | "team"
    | "teamMember"
    | "machines"
    | "fuelAdd"
    | "fuelEdit"
    | "materials"
    | "payments"
    | "frontCreate"
    | "frontMobilization"
    | "mobilizationHistory"
    | null
  >(null);
  const [selectedTeamShift, setSelectedTeamShift] = React.useState<
    "day" | "night"
  >(initialTeamShift);
  const [teamShift, setTeamShift] = React.useState<"day" | "night">(
    initialTeamShift,
  );
  const [teamSearch, setTeamSearch] = React.useState("");
  const debouncedTeamSearch = useDebouncer(teamSearch, 300);
  const [teamModalMode, setTeamModalMode] = React.useState<"schedule" | "add">(
    "schedule",
  );
  const [editingTeamMember, setEditingTeamMember] =
    React.useState<ProjectTeamMember | null>(null);
  const teamMemberEditorRef = React.useRef<EmployeeMobilizationHandle>(null);
  const [removingTeamMember, setRemovingTeamMember] =
    React.useState<ProjectTeamMember | null>(null);
  const [teamReloadKey, setTeamReloadKey] = React.useState(0);
  const [teamPages, setTeamPages] = React.useState<ProjectTeamCandidatesPage[]>(
    [],
  );
  const [teamPageIndex, setTeamPageIndex] = React.useState(0);
  const [teamCandidatesLoading, setTeamCandidatesLoading] =
    React.useState(false);
  const [teamCandidatesError, setTeamCandidatesError] = React.useState<
    string | null
  >(null);
  const teamCandidateRequestId = React.useRef(0);
  const readinessForm = useForm<ProjectCommand>({
    defaultValues: projectToCommand(project),
  });
  const watchedEmployeeAllocations = useWatch({
    control: readinessForm.control,
    name: "initialEmployeeAllocations",
  });
  const watchedClientId = useWatch({
    control: readinessForm.control,
    name: "clientId",
  });
  const watchedManagerEmploymentId = useWatch({
    control: readinessForm.control,
    name: "managerEmploymentId",
  });
  const watchedTechnicalResponsibilityIds = useWatch({
    control: readinessForm.control,
    name: "technicalResponsibilityEmploymentIds",
  });
  const activeTeamPage = teamPages[teamPageIndex] ?? {
    data: [],
    pageInfo: { hasNextPage: false, nextCursor: null },
  };

  const loadTeamCandidatePage = React.useCallback(
    (cursor?: string | null, append = false) => {
      const requestId = teamCandidateRequestId.current + 1;
      teamCandidateRequestId.current = requestId;
      setTeamCandidatesLoading(true);
      setTeamCandidatesError(null);
      void getProjectTeamCandidatesAction({
        projectId: project.id,
        shift: teamShift,
        search: debouncedTeamSearch,
        cursor,
      })
        .then((page) => {
          if (teamCandidateRequestId.current !== requestId) return;
          if (append) {
            setTeamPages((current) => [...current, page]);
            setTeamPageIndex((current) => current + 1);
          } else {
            setTeamPages([page]);
            setTeamPageIndex(0);
          }
        })
        .catch(() => {
          if (teamCandidateRequestId.current !== requestId) return;
          setTeamPages([]);
          setTeamPageIndex(0);
          setTeamCandidatesError(
            "Não foi possível consultar os funcionários agora.",
          );
        })
        .finally(() => {
          if (teamCandidateRequestId.current === requestId)
            setTeamCandidatesLoading(false);
        });
    },
    [debouncedTeamSearch, project.id, teamShift],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- Loading candidates synchronizes the modal's paged server state. */
  React.useEffect(() => {
    if (openModal === "team" && teamModalMode === "add")
      loadTeamCandidatePage();
  }, [loadTeamCandidatePage, openModal, teamModalMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- ProjectDetail synchronizes the authoritative server snapshot and resets edit buffers when it changes. */
  React.useEffect(() => {
    setProject(serverProject);
  }, [serverProject]);

  React.useEffect(() => {
    const previousIdentity = projectSnapshotIdentityRef.current;
    const projectChanged = previousIdentity.id !== project.id;
    const statusChanged = previousIdentity.status !== project.status;

    readinessForm.reset(projectToCommand(project));
    setPlannedStartDate(project.baseline?.plannedStartDate ?? "");
    setPlannedEndDate(project.baseline?.plannedEndDate ?? "");
    setMetrics(metricInitialState(project));
    setFuelAddDraft(null);
    setFuelEditDraft(null);
    setFuelAddStep("source");
    setEditingFuelOfferId(null);
    setConfirmingFuelRemovalId(null);
    setFuelOffers(project.fuelOffers);
    setMaterialView("list");
    setMaterialAddStep("source");
    setMaterialDraft(null);
    setEditingMaterialOfferId(null);
    setMaterialOffers(project.supplierOffers);
    setMaterialIssues([]);
    setPaymentTermRows(project.compensationPaymentTerms);
    setPaymentTerms(paymentInitialState(project));
    setPlannedDatesDirty(false);
    setQuantityBaselineDirty(false);
    setPlannedDateIssues([]);
    setQuantityBaselineIssues([]);
    setFuelDirty(false);
    setPaymentDirty(false);
    setFrontName("");
    setFrontLocation("");
    setFrontRequiresEmployees(true);
    setFrontRequiresMachines(true);
    setFrontQuantities({});
    setFrontIssues([]);
    setMobilizingFrontId(null);
    setFrontEmploymentIds([]);
    setFrontMachineIds([]);
    setFrontMobilizationIssues([]);
    if (projectChanged || statusChanged) {
      setActiveTab(project.status === "active" ? "overview" : "planning");
    }
    projectSnapshotIdentityRef.current = {
      id: project.id,
      status: project.status,
    };
  }, [project, readinessForm]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const modalOptions = React.useMemo<ProjectWizardOptions>(
    () => ({
      clients: options.clients.map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail ?? undefined,
      })),
      employees: options.employees.map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail ?? undefined,
        jobRolePeriodId: option.jobRolePeriodId ?? undefined,
        jobRoleId: option.jobRoleId ?? undefined,
      })),
      machines: options.machines.map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail ?? undefined,
        readingId: option.readingId ?? undefined,
        manufacturer: option.manufacturer,
        model: option.model,
        meterType: option.meterType,
        requiresOperator: option.requiresOperator,
        requiredJobRoleId: option.requiredJobRoleId ?? undefined,
        requiredJobRoleName: option.requiredJobRoleName ?? undefined,
        acceptsAnyJobRole: option.acceptsAnyJobRole,
      })),
      jobRoles: options.jobRoles.map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail ?? undefined,
      })),
    }),
    [options],
  );
  const teamMemberOptions = React.useMemo<ProjectWizardOptions>(() => {
    if (!editingTeamMember) return { ...modalOptions, employees: [] };
    const knownEmployee = modalOptions.employees.find(
      (employee) => employee.id === editingTeamMember.employmentId,
    );
    return {
      ...modalOptions,
      employees: [
        knownEmployee ?? {
          id: editingTeamMember.employmentId,
          label: editingTeamMember.name,
          detail: editingTeamMember.jobRole,
        },
      ],
    };
  }, [editingTeamMember, modalOptions]);
  const teamCandidateOptions = React.useMemo<ProjectWizardOptions>(
    () => ({
      ...modalOptions,
      employees: activeTeamPage.data
        .filter(
          (option) =>
            option.allocatedShift !== teamShift &&
            !watchedEmployeeAllocations?.some(
              (allocation) =>
                allocation.employmentId === option.id &&
                allocation.shift === teamShift,
            ),
        )
        .map((option) => ({
          id: option.id,
          label: option.label,
          detail: option.detail ?? undefined,
          jobRolePeriodId: option.jobRolePeriodId ?? undefined,
          jobRoleId: option.jobRoleId ?? undefined,
          allocatedShift: option.allocatedShift,
        })),
    }),
    [activeTeamPage.data, modalOptions, teamShift, watchedEmployeeAllocations],
  );

  const paymentModes = React.useMemo(() => {
    const modes = [
      ...new Set(
        (watchedEmployeeAllocations ?? []).map(
          (allocation) => allocation.compensationMode,
        ),
      ),
    ] as CompensationMode[];
    return modes.sort(paymentModeSort);
  }, [watchedEmployeeAllocations]);

  const isEditable = project.status === "planned";
  const canManageMobilization =
    project.status === "planned" || project.status === "active";
  const mobilizingFront = project.workFronts.find(
    (front) => front.id === mobilizingFrontId,
  );
  const canManageFronts =
    project.status === "planned" || project.status === "active";
  const fuelOptions = React.useMemo(
    () => pickFuelOptions(options.supplierOffers),
    [options.supplierOffers],
  );
  const materialDirty = materialView !== "list";
  const hasUnsavedChanges =
    plannedDatesDirty ||
    quantityBaselineDirty ||
    fuelDirty ||
    materialDirty ||
    paymentDirty ||
    readinessForm.formState.isDirty;
  const hasKnownBlockers = !project.readiness.canActivate;
  const accountabilityReady = Boolean(
    project.client &&
    project.manager &&
    project.technicalResponsibilities.length > 0,
  );
  const datesReady = Boolean(
    project.baseline?.plannedStartDate && project.baseline.plannedEndDate,
  );
  const planningReady = Boolean(
    datesReady && project.quantityBaseline.items.length,
  );
  const teamReady = project.employeeAllocations.length > 0;
  const machinesReady = project.machineAllocations.length > 0;
  const paymentsReady =
    paymentTermRows.length > 0 &&
    paymentTermRows.length === paymentModes.length;
  const fuelReady = fuelOffers.length > 0;
  const planningStatus =
    plannedDatesDirty || quantityBaselineDirty
      ? ({ label: "Alterado", tone: "dirty" } as const)
      : planningReady
        ? ({ label: "OK", tone: "ready" } as const)
        : ({ label: "Pendente", tone: "pending" } as const);
  const plannedDatesStatus = plannedDatesDirty
    ? ({ label: "Alterado", tone: "dirty" } as const)
    : datesReady
      ? ({ label: "OK", tone: "ready" } as const)
      : ({ label: "Pendente", tone: "pending" } as const);
  const metricsStatus = quantityBaselineDirty
    ? ({ label: "Alterado", tone: "dirty" } as const)
    : project.quantityBaseline.items.length
      ? ({ label: "OK", tone: "ready" } as const)
      : ({ label: "Pendente", tone: "pending" } as const);
  const fuelStatus = fuelDirty
    ? ({ label: "Alterado", tone: "dirty" } as const)
    : fuelReady
      ? ({ label: "OK", tone: "ready" } as const)
      : ({ label: "Pendente", tone: "pending" } as const);
  const currentEditingFuelOffer = editingFuelOfferId
    ? (fuelOffers.find((offer) => offer.id === editingFuelOfferId) ?? null)
    : null;
  const fuelAddCanContinue = canContinueFuelStep(fuelAddStep, fuelAddDraft);
  const isFuelAddReviewStep = fuelAddStep === "details";
  const fuelAddCanSave = fuelAddDraft
    ? isFuelAddReviewStep && isFuelDraftComplete(fuelAddDraft)
    : false;
  const currentEditingMaterialOffer = editingMaterialOfferId
    ? (materialOffers.find((offer) => offer.id === editingMaterialOfferId) ??
      null)
    : null;
  const materialAddCanContinue = canContinueMaterialStep(
    materialAddStep,
    materialDraft,
  );
  const materialAddCanSave =
    materialAddStep === "review" && isMaterialDraftComplete(materialDraft);
  const accountabilityStatus =
    readinessForm.formState.dirtyFields.clientId ||
    readinessForm.formState.dirtyFields.managerEmploymentId ||
    readinessForm.formState.dirtyFields.technicalResponsibilityEmploymentIds
      ? ({ label: "Alterado", tone: "dirty" } as const)
      : accountabilityReady
        ? ({ label: "OK", tone: "ready" } as const)
        : ({ label: "Pendente", tone: "pending" } as const);
  const teamStatus = readinessForm.formState.dirtyFields
    .initialEmployeeAllocations
    ? ({ label: "Alterado", tone: "dirty" } as const)
    : teamReady
      ? ({ label: "OK", tone: "ready" } as const)
      : ({ label: "Pendente", tone: "pending" } as const);
  const machinesStatus = readinessForm.formState.dirtyFields
    .initialMachineAllocations
    ? ({ label: "Alterado", tone: "dirty" } as const)
    : machinesReady
      ? ({ label: "OK", tone: "ready" } as const)
      : ({ label: "Pendente", tone: "pending" } as const);
  const paymentsStatus = paymentDirty
    ? ({ label: "Reconfirmar", tone: "dirty" } as const)
    : paymentsReady
      ? ({ label: "OK", tone: "ready" } as const)
      : ({ label: "Pendente", tone: "pending" } as const);
  const materialsStatus = materialDirty
    ? ({ label: "Alterado", tone: "dirty" } as const)
    : materialOffers.length
      ? ({ label: "Configurado", tone: "neutral" } as const)
      : ({ label: "Opcional", tone: "neutral" } as const);
  const reportsStatus = initialDailyReports?.data.length
    ? ({
        label: String(initialDailyReports.data.length),
        tone: "ready",
      } as const)
    : ({ label: "Novo", tone: "neutral" } as const);
  const financialStatus = { label: "Consulta", tone: "neutral" } as const;
  const mainNavigationExpanded =
    appShellNavigation?.mainNavigationExpanded ?? false;

  /* eslint-disable react-hooks/set-state-in-effect -- Expanding the global navigation deliberately collapses the contextual work navigation. */
  React.useEffect(() => {
    if (mainNavigationExpanded) setProjectNavigationExpanded(false);
  }, [mainNavigationExpanded]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isNavigationGroupOpen = (group: ProjectNavigationGroup) =>
    openNavigationGroups.includes(group);
  const persistProjectContext = (
    section: ProjectTab,
    shift = selectedTeamShift,
  ) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    if (section === "team") url.searchParams.set("teamShift", shift);
    else url.searchParams.delete("teamShift");
    window.history.replaceState(window.history.state, "", url);
  };
  const selectProjectTab = (tab: ProjectTab) => {
    setActiveTab(tab);
    persistProjectContext(tab);
    const group = projectNavigationGroupForTab(tab);
    if (group && !isNavigationGroupOpen(group)) {
      setOpenNavigationGroups((current) => [...current, group]);
    }
  };
  const toggleProjectNavigation = () => {
    if (isProjectNavigationExpanded) {
      setProjectNavigationExpanded(false);
      return;
    }
    appShellNavigation?.setMainNavigationExpanded(false);
    setProjectNavigationExpanded(true);
  };
  const toggleNavigationGroup = (group: ProjectNavigationGroup) => {
    if (!isProjectNavigationExpanded) {
      appShellNavigation?.setMainNavigationExpanded(false);
      setProjectNavigationExpanded(true);
      setOpenNavigationGroups((current) =>
        current.includes(group) ? current : [...current, group],
      );
      return;
    }
    setOpenNavigationGroups((current) =>
      current.includes(group)
        ? current.filter((value) => value !== group)
        : [...current, group],
    );
  };

  const savePatch = (
    command: ProjectReadinessActionInput,
    successText: string,
    onSuccess?: (updatedProject: ProjectDetailSnapshot) => void,
    onError?: (
      issues: React.ComponentProps<typeof FormErrorDeclaration>["issues"],
    ) => void,
  ) => {
    startTransition(async () => {
      const result = await saveProjectReadinessAction(project.id, command);
      if (result.kind === "success") {
        toast.success(successText);
        onSuccess?.(result.project);
        router.refresh();
        return;
      }
      const issues =
        result.kind === "recoverable-conflict" && result.blockers?.length
          ? result.blockers.map((blocker) => ({
              location: "Obra",
              field: blocker.section,
              message: blocker.message,
            }))
          : [
              {
                location: "Obra",
                message: "Não foi possível salvar esta seção agora.",
              },
            ];
      if (onError) {
        onError(issues);
        return;
      }
      toast.error("Não foi possível salvar esta seção.", {
        description: issues.map((issue) => issue.message).join(" "),
      });
    });
  };

  const openPlannedDatesModal = () => {
    setPlannedStartDate(project.baseline?.plannedStartDate ?? "");
    setPlannedEndDate(project.baseline?.plannedEndDate ?? "");
    setPlannedDatesDirty(false);
    setPlannedDateIssues([]);
    setOpenModal("planningDates");
  };

  const closePlannedDatesModal = () => {
    if (isPending) return;
    setPlannedDatesDirty(false);
    setPlannedDateIssues([]);
    setOpenModal(null);
  };

  const savePlannedDates = () => {
    const issues: React.ComponentProps<typeof FormErrorDeclaration>["issues"] =
      [];
    if (!plannedStartDate)
      issues.push({
        location: "Datas planejadas",
        field: "Início",
        message: "Informe a data planejada de início.",
      });
    if (!plannedEndDate)
      issues.push({
        location: "Datas planejadas",
        field: "Fim",
        message: "Informe a data planejada de fim.",
      });
    if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate)
      issues.push({
        location: "Datas planejadas",
        field: "Fim",
        message: "A data final não pode ser anterior à data inicial.",
      });
    if (issues.length) {
      setPlannedDateIssues(issues);
      return;
    }
    setPlannedDateIssues([]);
    startTransition(async () => {
      const result = await saveProjectReadinessAction(project.id, {
        plannedStartDate,
        plannedEndDate,
      });
      if (result.kind === "success") {
        toast.success("Datas planejadas salvas.");
        setPlannedDatesDirty(false);
        setOpenModal(null);
        router.refresh();
        return;
      }
      setPlannedDateIssues(
        result.kind === "recoverable-conflict" && result.blockers?.length
          ? result.blockers.map((blocker) => ({
              location: "Datas planejadas",
              field: blocker.section,
              message: blocker.message,
            }))
          : [
              {
                location: "Datas planejadas",
                message: result.message,
              },
            ],
      );
    });
  };

  const openQuantityBaselineModal = () => {
    setMetrics(metricInitialState(project));
    setQuantityBaselineDirty(false);
    setQuantityBaselineIssues([]);
    setOpenModal("quantityBaseline");
  };

  const closeQuantityBaselineModal = () => {
    if (isPending) return;
    setQuantityBaselineDirty(false);
    setQuantityBaselineIssues([]);
    setOpenModal(null);
  };

  const saveQuantityBaseline = () => {
    const items = metrics
      .filter((metric) => metric.enabled)
      .map((metric) => ({
        serviceCode: metric.code,
        unitCode: (metric.code === "finishing"
          ? "M2"
          : metric.code === "top_soil"
            ? "M3_KM"
            : "M3") as "M3" | "M2" | "M3_KM",
        total: decimalInputToCanonical(metric.targetTotal, 3),
      }))
      .filter((metric) => metric.total && metric.total !== "0.000");
    if (quantityBaselineAllocationIssues.length) {
      setQuantityBaselineIssues([]);
      return;
    }
    if (items.length === 0) {
      setQuantityBaselineIssues([
        {
          location: "Quantitativos",
          message: "Selecione ao menos um serviço e informe seu total.",
        },
      ]);
      return;
    }
    setQuantityBaselineIssues([]);
    startTransition(async () => {
      const result = await saveProjectQuantityBaselineAction(project.id, {
        items,
      });
      if (result.kind === "success") {
        toast.success("Quantitativos de referência salvos.");
        setQuantityBaselineDirty(false);
        setOpenModal(null);
        router.refresh();
        return;
      }
      setQuantityBaselineIssues(
        result.kind === "recoverable-conflict" && result.blockers?.length
          ? result.blockers.map((blocker) => ({
              location: "Quantitativos",
              field:
                blocker.section === "metrics" ? undefined : blocker.section,
              message: blocker.message,
            }))
          : [
              {
                location: "Quantitativos",
                message: result.message,
              },
            ],
      );
    });
  };

  const getCurrentFuelCommands = () => {
    const commands = fuelOffers.map(projectOfferToCommand);
    if (commands.some((command) => !command)) return null;
    return commands as ReadinessOfferCommand[];
  };

  const saveFuelAdd = () => {
    if (!fuelAddDraft) return;
    const currentFuelOffers = getCurrentFuelCommands();
    const nextOffer = draftToFuelCommand(fuelAddDraft);
    const fuelOffers = currentFuelOffers
      ? [...currentFuelOffers, nextOffer]
      : null;
    const hasDuplicateOffer = fuelOffers
      ? new Set(
          fuelOffers.map((command) =>
            command.mode === "existing"
              ? `existing:${command.sourceOfferId}`
              : `${command.mode}:${command.supplierId}:${command.itemId}:${command.purchaseUnitId}`,
          ),
        ).size !== fuelOffers.length
      : false;
    if (
      !fuelOffers ||
      !isOfferCommandComplete(nextOffer) ||
      hasDuplicateOffer
    ) {
      toast.warning(
        "Selecione ofertas de combustível sem duplicidade e com preço positivo.",
      );
      return;
    }
    savePatch({ fuelOffers }, "Combustível salvo.", (updatedProject) => {
      setFuelOffers(updatedProject.fuelOffers);
      setFuelDirty(false);
      setFuelAddDraft(null);
      setFuelAddStep("source");
      setOpenModal(null);
    });
  };

  const saveFuelEdit = () => {
    if (!fuelEditDraft || !editingFuelOfferId) return;
    const nextOffer = draftToFuelCommand(fuelEditDraft);
    const nextFuelOffers = fuelOffers
      .map((offer) =>
        offer.id === editingFuelOfferId
          ? nextOffer
          : projectOfferToCommand(offer),
      )
      .filter(Boolean) as ReadinessOfferCommand[];
    const hasDuplicateOffer =
      new Set(
        nextFuelOffers.map((command) =>
          command.mode === "existing"
            ? `existing:${command.sourceOfferId}`
            : `${command.mode}:${command.supplierId}:${command.itemId}:${command.purchaseUnitId}`,
        ),
      ).size !== nextFuelOffers.length;
    if (
      nextFuelOffers.length !== fuelOffers.length ||
      !isOfferCommandComplete(nextOffer) ||
      hasDuplicateOffer
    ) {
      toast.warning(
        "Revise preço, quantidade e possíveis duplicidades antes de salvar.",
      );
      return;
    }
    savePatch(
      { fuelOffers: nextFuelOffers },
      "Combustível atualizado.",
      (updatedProject) => {
        setFuelOffers(updatedProject.fuelOffers);
        setFuelDirty(false);
        setFuelEditDraft(null);
        setEditingFuelOfferId(null);
        setConfirmingFuelRemovalId(null);
        setOpenModal(null);
      },
    );
  };

  const removeFuelOffer = () => {
    if (!editingFuelOfferId) return;
    const nextFuelOffers = fuelOffers
      .filter((offer) => offer.id !== editingFuelOfferId)
      .map(projectOfferToCommand);
    if (nextFuelOffers.some((command) => !command)) {
      toast.error(
        "Não foi possível remover esta oferta agora. Atualize a página e tente novamente.",
      );
      return;
    }
    savePatch(
      { fuelOffers: nextFuelOffers as ReadinessOfferCommand[] },
      "Combustível removido.",
      (updatedProject) => {
        setFuelOffers(updatedProject.fuelOffers);
        setFuelDirty(false);
        setFuelEditDraft(null);
        setEditingFuelOfferId(null);
        setConfirmingFuelRemovalId(null);
        setOpenModal(null);
      },
    );
  };

  const resetMaterialEditor = () => {
    setMaterialView("list");
    setMaterialAddStep("source");
    setMaterialDraft(null);
    setEditingMaterialOfferId(null);
    setMaterialIssues([]);
  };

  const saveMaterialAdd = () => {
    if (!materialDraft) return;
    const commands = buildMaterialAddCommands(materialOffers, materialDraft);
    if (!commands) {
      setMaterialIssues([
        {
          location: "Oferta",
          message:
            "Revise os dados e confirme que esta oferta ainda não está vinculada à obra.",
        },
      ]);
      return;
    }
    setMaterialIssues([]);
    savePatch(
      { materialOffers: commands },
      "Oferta adicionada à obra.",
      (updatedProject) => {
        setMaterialOffers(updatedProject.supplierOffers);
        resetMaterialEditor();
      },
      setMaterialIssues,
    );
  };

  const saveMaterialEdit = () => {
    if (!materialDraft || !editingMaterialOfferId) return;
    const commands = buildMaterialEditCommands(
      materialOffers,
      editingMaterialOfferId,
      materialDraft,
    );
    if (!commands) {
      setMaterialIssues([
        {
          location: "Oferta",
          message: "Informe preço e quantidade positivos, sem duplicidade.",
        },
      ]);
      return;
    }
    setMaterialIssues([]);
    savePatch(
      { materialOffers: commands },
      "Oferta atualizada.",
      (updatedProject) => {
        setMaterialOffers(updatedProject.supplierOffers);
        resetMaterialEditor();
      },
      setMaterialIssues,
    );
  };

  const removeMaterialOffer = (offerId: string) => {
    const commands = buildMaterialRemoveCommands(materialOffers, offerId);
    if (!commands) {
      toast.error("Não foi possível preparar a remoção desta oferta.");
      return;
    }
    savePatch(
      { materialOffers: commands },
      "Oferta removida da obra.",
      (updatedProject) => {
        setMaterialOffers(updatedProject.supplierOffers);
        resetMaterialEditor();
      },
    );
  };

  const saveAccountability = () => {
    const values = readinessForm.getValues();
    if (
      !values.clientId ||
      !values.managerEmploymentId ||
      values.technicalResponsibilityEmploymentIds.length === 0
    ) {
      toast.warning("Confirme cliente, gestor e responsável técnico.");
      return;
    }
    savePatch(
      {
        accountability: {
          clientId: values.clientId,
          managerEmploymentId: values.managerEmploymentId,
          technicalResponsibilityEmploymentIds:
            values.technicalResponsibilityEmploymentIds,
        },
      },
      "Responsáveis da obra salvos.",
      () => {
        readinessForm.reset(values);
        setOpenModal(null);
      },
    );
  };

  const saveTeam = () => {
    const values = readinessForm.getValues();
    const shiftAllocations = values.initialEmployeeAllocations.filter(
      (allocation) => allocation.shift === teamShift,
    );
    startTransition(async () => {
      const result = await saveProjectEmployeeMobilizationAction(
        project.id,
        shiftAllocations,
        {
          weeklySchedule: values.weeklySchedule.filter(
            (day) => day.shift === teamShift,
          ),
          breakTemplates: values.breakTemplates.filter(
            (item) => item.shift === teamShift,
          ),
        },
        teamShift,
      );
      if (result.kind === "success") {
        const shiftLabel = teamShift === "day" ? "Diurno" : "Noturno";
        toast.success(
          openModal === "teamMember"
            ? "Funcionário atualizado."
            : teamModalMode === "add"
              ? `Equipe ${shiftLabel.toLocaleLowerCase("pt-BR")} mobilizada.`
              : `Jornada ${shiftLabel.toLocaleLowerCase("pt-BR")} atualizada.`,
        );
        setProject(result.project);
        readinessForm.reset(projectToCommand(result.project));
        setTeamReloadKey((current) => current + 1);
        setEditingTeamMember(null);
        setOpenModal(null);
        router.refresh();
        return;
      }
      toast.error("Não foi possível atualizar a equipe e os turnos.", {
        description: result.message,
      });
    });
  };

  const removeTeamMember = () => {
    if (!removingTeamMember) return;
    const member = removingTeamMember;
    const command = projectToCommand(project);
    const remainingAllocations = command.initialEmployeeAllocations.filter(
      (allocation) => allocation.employmentId !== member.employmentId,
    );
    startTransition(async () => {
      const result = await saveProjectEmployeeMobilizationAction(
        project.id,
        remainingAllocations.filter(
          (allocation) => allocation.shift === member.shift,
        ),
        {
          weeklySchedule: command.weeklySchedule.filter(
            (day) => day.shift === member.shift,
          ),
          breakTemplates: command.breakTemplates.filter(
            (item) => item.shift === member.shift,
          ),
        },
        member.shift,
      );
      if (result.kind === "success") {
        setProject(result.project);
        readinessForm.reset(projectToCommand(result.project));
        setTeamReloadKey((current) => current + 1);
        setRemovingTeamMember(null);
        toast.success(`${member.name} foi removido(a) deste turno.`);
        router.refresh();
        return;
      }
      setRemovingTeamMember(null);
      toast.error("Não foi possível remover este funcionário.", {
        description: result.message,
      });
    });
  };

  const saveMachines = () => {
    const values = readinessForm.getValues();
    if (machineSaveInFlightRef.current) return;
    machineSaveInFlightRef.current = true;
    setMachineSaveError(null);
    setIsSavingMachines(true);
    startTransition(async () => {
      try {
        const result =
          project.status === "active"
            ? await saveProjectMachineMobilizationAction(
                project.id,
                values.initialMachineAllocations,
              )
            : await saveProjectReadinessAction(project.id, {
                machineAllocations: values.initialMachineAllocations,
              });
        if (result.kind === "success") {
          const successMessage =
            project.status === "active"
              ? "Máquinas mobilizadas atualizadas."
              : "Máquinas e operadores salvos.";
          toast.success(successMessage);
          setProject(result.project);
          readinessForm.reset(projectToCommand(result.project));
          setOpenModal(null);
          router.refresh();
          return;
        }
        const message = machineSaveFailureMessage(result);
        const title =
          project.status === "active"
            ? "Não foi possível atualizar as máquinas mobilizadas."
            : "Não foi possível salvar máquinas e operadores.";
        setMachineSaveError(message);
        toast.error(title, { description: message });
      } catch {
        const message = "A comunicação com o servidor falhou. Tente novamente.";
        setMachineSaveError(message);
        toast.error("Não foi possível salvar máquinas e operadores.", {
          description: message,
        });
      } finally {
        machineSaveInFlightRef.current = false;
        setIsSavingMachines(false);
      }
    });
  };

  const savePayments = () => {
    const compensationPaymentTerms = paymentModes
      .map((mode) => ({
        compensationMode: mode,
        daysAfterPeriodEnd: Number(paymentTerms[mode] ?? ""),
      }))
      .filter((term) => Number.isInteger(term.daysAfterPeriodEnd));
    if (compensationPaymentTerms.length !== paymentModes.length) {
      toast.warning(
        "Preencha o prazo de pagamento de todas as modalidades da equipe.",
      );
      return;
    }
    savePatch(
      { compensationPaymentTerms },
      "Pagamentos salvos.",
      (updatedProject) => {
        setPaymentTermRows(updatedProject.compensationPaymentTerms);
        setPaymentTerms(paymentInitialState(updatedProject));
        setPaymentDirty(false);
        setOpenModal(null);
      },
    );
  };

  const activateProject = () => {
    if (activationInFlightRef.current) return;
    if (hasUnsavedChanges) {
      toast.warning("Salve as alterações abertas antes de iniciar a obra.");
      return;
    }
    activationInFlightRef.current = true;
    setIsActivating(true);
    startTransition(async () => {
      try {
        const result = await activateProjectAction(project.id);
        if (result.kind === "success") {
          if (result.project.status !== "active") {
            toast.error("Não foi possível iniciar a obra.", {
              description:
                "A API não confirmou a ativação. Atualize a página e tente novamente.",
            });
            return;
          }
          setProject(result.project);
          setActiveTab("overview");
          toast.success("Obra iniciada.");
          router.refresh();
          return;
        }
        const description =
          result.kind === "recoverable-conflict" && result.blockers?.length
            ? result.blockers.map((blocker) => blocker.message).join(" ")
            : result.message;
        toast.error(
          result.kind === "recoverable-conflict"
            ? "A obra ainda tem pendências de início."
            : "Não foi possível iniciar a obra.",
          { description },
        );
      } catch {
        toast.error("Não foi possível iniciar a obra.", {
          description: "A comunicação com o servidor falhou. Tente novamente.",
        });
      } finally {
        activationInFlightRef.current = false;
        setIsActivating(false);
      }
    });
  };

  const saveWorkFront = () => {
    const services = project.quantityBaseline.items
      .map((item) => ({
        serviceCode: item.serviceCode,
        unitCode: item.unitCode,
        quantity: decimalInputToCanonical(
          frontQuantities[item.serviceCode] ?? "",
          3,
        ),
      }))
      .filter((item) => item.quantity && item.quantity !== "0.000");
    if (frontExcessIssues.length || frontMinimumIssues.length) {
      setFrontIssues([]);
      return;
    }
    if (
      !frontName.trim() ||
      (!services.length && editingFront?.status !== "active") ||
      (!frontRequiresEmployees && !frontRequiresMachines)
    ) {
      setFrontIssues([
        {
          location: "Frente",
          message:
            !frontRequiresEmployees && !frontRequiresMachines
              ? "Selecione ao menos uma exigência de mobilização."
              : "Informe o nome e ao menos um quantitativo distribuído para a frente.",
        },
      ]);
      return;
    }
    setFrontIssues([]);
    startTransition(async () => {
      if (editingFront?.status === "active") {
        const result = await saveProjectWorkFrontServicesAction(
          project.id,
          editingFront.id,
          { services },
        );
        if (result.kind === "success") {
          toast.success("Distribuição da frente atualizada.");
          setEditingFrontId(null);
          setFrontQuantities({});
          setFrontIssues([]);
          setOpenModal(null);
          router.refresh();
          return;
        }
        setFrontIssues(
          result.kind === "recoverable-conflict" && result.blockers?.length
            ? result.blockers.map((blocker) => ({
                location: "Frente",
                field: "Quantitativos",
                message: blocker.message,
              }))
            : [{ location: "Frente", message: result.message }],
        );
        return;
      }
      const command = {
        name: frontName,
        location: frontLocation || null,
        notes: editingFront?.notes ?? null,
        plannedStartDate: editingFront?.plannedStartDate ?? null,
        plannedEndDate: editingFront?.plannedEndDate ?? null,
        requiresEmployees: frontRequiresEmployees,
        requiresMachines: frontRequiresMachines,
        services,
      };
      const result = editingFront
        ? await updateProjectWorkFrontAction(
            project.id,
            editingFront.id,
            command,
          )
        : await createProjectWorkFrontAction(project.id, command);
      if (result.kind === "success") {
        toast.success(
          editingFront ? "Frente atualizada." : "Frente cadastrada.",
        );
        setEditingFrontId(null);
        setFrontName("");
        setFrontLocation("");
        setFrontRequiresEmployees(true);
        setFrontRequiresMachines(true);
        setFrontQuantities({});
        setFrontIssues([]);
        setOpenModal(null);
        router.refresh();
        return;
      }
      setFrontIssues(
        result.kind === "recoverable-conflict" && result.blockers?.length
          ? result.blockers.map((blocker) => ({
              location: "Frente",
              field:
                blocker.section === "fronts"
                  ? "Quantitativos"
                  : blocker.section,
              message: blocker.message,
            }))
          : [
              {
                location: "Frente",
                message: result.message,
              },
            ],
      );
    });
  };

  const openWorkFrontModal = () => {
    setEditingFrontId(null);
    setFrontName("");
    setFrontLocation("");
    setFrontRequiresEmployees(true);
    setFrontRequiresMachines(true);
    setFrontQuantities({});
    setFrontIssues([]);
    setOpenModal("frontCreate");
  };

  const openEditWorkFrontModal = (
    front: ProjectDetailSnapshot["workFronts"][number],
  ) => {
    setEditingFrontId(front.id);
    setFrontName(front.name);
    setFrontLocation(front.location ?? "");
    setFrontRequiresEmployees(front.requiresEmployees);
    setFrontRequiresMachines(front.requiresMachines);
    setFrontQuantities(
      Object.fromEntries(
        front.services.map((service) => [
          service.serviceCode,
          canonicalDecimalToBrazilian(service.quantity, 3),
        ]),
      ),
    );
    setFrontIssues([]);
    setOpenModal("frontCreate");
  };

  const closeWorkFrontModal = () => {
    if (isPending) return;
    setEditingFrontId(null);
    setFrontRequiresEmployees(true);
    setFrontRequiresMachines(true);
    setFrontIssues([]);
    setOpenModal(null);
  };

  const openFrontMobilizationModal = (
    front: ProjectDetailSnapshot["workFronts"][number],
  ) => {
    setMobilizingFrontId(front.id);
    setFrontEmploymentIds(
      front.employeeAssignments
        .filter((assignment) => assignment.source !== "machine_operator")
        .flatMap((assignment) =>
          assignment.employment ? [assignment.employment.id] : [],
        ),
    );
    setFrontMachineIds(
      front.machineAssignments.flatMap((assignment) =>
        assignment.machine
          ? [`${assignment.machine.id}:${assignment.shift}`]
          : [],
      ),
    );
    setFrontMobilizationIssues([]);
    setOpenModal("frontMobilization");
  };

  const closeFrontMobilizationModal = () => {
    if (isPending) return;
    setMobilizingFrontId(null);
    setFrontEmploymentIds([]);
    setFrontMachineIds([]);
    setFrontMobilizationIssues([]);
    setOpenModal(null);
  };

  const saveFrontMobilization = () => {
    if (!mobilizingFrontId) return;
    setFrontMobilizationIssues([]);
    startTransition(async () => {
      const result = await saveProjectWorkFrontMobilizationAction(
        project.id,
        mobilizingFrontId,
        {
          employmentIds: frontEmploymentIds,
          machineAssignments: frontMachineIds.map((key) => {
            const [machineId, shift] = key.split(":");
            return {
              machineId,
              shift: shift as "day" | "night",
            };
          }),
        },
      );
      if (result.kind === "success") {
        toast.success("Mobilização da frente salva.");
        setMobilizingFrontId(null);
        setFrontEmploymentIds([]);
        setFrontMachineIds([]);
        setFrontMobilizationIssues([]);
        setOpenModal(null);
        router.refresh();
        return;
      }
      setFrontMobilizationIssues(
        result.kind === "recoverable-conflict" && result.blockers?.length
          ? result.blockers.map((blocker) => ({
              location: "Mobilização",
              field: blocker.section,
              message: blocker.message,
            }))
          : [{ location: "Mobilização", message: result.message }],
      );
    });
  };

  const loadMobilizationHistory = (
    resourceType: "employee" | "machine",
    frontId: string | null,
    cursor?: string,
  ) => {
    startTransition(async () => {
      try {
        const page = await getProjectMobilizationHistoryAction({
          projectId: project.id,
          resourceType,
          frontId: frontId ?? undefined,
          cursor,
        });
        setHistoryItems((current) =>
          cursor ? [...current, ...page.data] : page.data,
        );
        setHistoryNextCursor(page.pageInfo.nextCursor);
      } catch {
        toast.error("Não foi possível carregar o histórico de mobilização.");
      }
    });
  };

  const openMobilizationHistory = (
    resourceType: "employee" | "machine",
    frontId: string | null = null,
  ) => {
    setHistoryResourceType(resourceType);
    setHistoryFrontId(frontId);
    setHistoryItems([]);
    setHistoryNextCursor(null);
    setOpenModal("mobilizationHistory");
    loadMobilizationHistory(resourceType, frontId);
  };

  const setFuelDraftWithDirty =
    (
      setter: React.Dispatch<React.SetStateAction<FuelDraft | null>>,
    ): React.Dispatch<React.SetStateAction<FuelDraft | null>> =>
    (value) => {
      setFuelDirty(true);
      setter(value);
    };

  const openAddFuelModal = () => {
    const nextDraft = createBlankFuelDraft(
      fuelOptions,
      options.measurementUnits,
    );
    setFuelAddDraft(nextDraft);
    setFuelEditDraft(null);
    setFuelAddStep("source");
    setEditingFuelOfferId(null);
    setConfirmingFuelRemovalId(null);
    setFuelDirty(false);
    setOpenModal("fuelAdd");
  };

  const openEditFuelModal = (offerId: string) => {
    const offer = fuelOffers.find((item) => item.id === offerId);
    if (!offer) return;
    setFuelEditDraft(createFuelDraftFromOffer(offer));
    setFuelAddDraft(null);
    setEditingFuelOfferId(offerId);
    setConfirmingFuelRemovalId(null);
    setFuelDirty(false);
    setOpenModal("fuelEdit");
  };

  const closeFuelModal = () => {
    setFuelAddDraft(null);
    setFuelEditDraft(null);
    setFuelAddStep("source");
    setEditingFuelOfferId(null);
    setConfirmingFuelRemovalId(null);
    setFuelDirty(false);
    setOpenModal(null);
  };

  const openMaterialsModal = () => {
    resetMaterialEditor();
    setOpenModal("materials");
  };

  const openMaterialAdd = () => {
    setMaterialDraft(createBlankMaterialDraft());
    setEditingMaterialOfferId(null);
    setMaterialAddStep("source");
    setMaterialIssues([]);
    setMaterialView("add");
  };

  const openMaterialEdit = (offerId: string) => {
    const offer = materialOffers.find((item) => item.id === offerId);
    if (!offer) return;
    setMaterialDraft(materialOfferToDraft(offer));
    setEditingMaterialOfferId(offerId);
    setMaterialIssues([]);
    setMaterialView("edit");
  };

  const closeMaterialsModal = () => {
    resetMaterialEditor();
    setOpenModal(null);
  };

  const closeTeamOrMachineModal = () => {
    readinessForm.reset(projectToCommand(project));
    if (openModal === "machines") setMachineSaveError(null);
    if (openModal === "teamMember") setEditingTeamMember(null);
    setOpenModal(null);
  };

  const openMachinesModal = () => {
    setMachineSaveError(null);
    setOpenModal("machines");
  };

  const openTeamModal = (
    shift: "day" | "night" = "day",
    mode: "schedule" | "add" = "schedule",
  ) => {
    const command = projectToCommand(project);
    if (
      shift === "night" &&
      !command.weeklySchedule.some((day) => day.shift === "night")
    ) {
      command.weeklySchedule.push(
        ...command.weeklySchedule
          .filter((day) => day.shift === "day")
          .map((day) => ({
            ...day,
            shift: "night" as const,
            startTime: day.isWorking ? "18:00" : null,
            endTime: day.isWorking ? "06:00" : null,
            endDayOffset: day.isWorking ? 1 : 0,
          })),
      );
      command.breakTemplates.push(
        ...command.breakTemplates
          .filter((item) => item.shift === "day")
          .map((item) => ({ ...item, shift: "night" as const })),
      );
    }
    readinessForm.reset(command);
    setSelectedTeamShift(shift);
    setTeamShift(shift);
    persistProjectContext("team", shift);
    setTeamModalMode(mode);
    setTeamSearch("");
    setTeamPages([]);
    setTeamPageIndex(0);
    setTeamCandidatesError(null);
    setOpenModal("team");
  };

  const openTeamMemberModal = (member: ProjectTeamMember) => {
    readinessForm.reset(projectToCommand(project));
    setSelectedTeamShift(member.shift);
    setTeamShift(member.shift);
    setEditingTeamMember(member);
    persistProjectContext("team", member.shift);
    setOpenModal("teamMember");
  };

  const closePaymentsModal = () => {
    setPaymentTerms(paymentTermsToState(paymentTermRows));
    setPaymentDirty(false);
    setOpenModal(null);
  };

  return (
    <article className="space-y-4">
      <Link
        className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        href="/home/obras"
      >
        <ArrowLeft className="size-4" />
        Voltar para obras
      </Link>

      <header className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border bg-secondary/40 px-4 py-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-bold",
                  project.status === "active"
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {statusLabels[project.status]}
              </span>
              {hasUnsavedChanges && isEditable && (
                <span className="inline-flex min-h-8 items-center rounded-md bg-amber-100 px-2.5 text-xs font-bold text-amber-950">
                  Alterações não salvas
                </span>
              )}
              {isEditable && (
                <div
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold",
                    project.readiness.canActivate
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-950",
                  )}
                >
                  <span>
                    {project.readiness.canActivate
                      ? "Pronta para iniciar"
                      : "Checklist pendente"}
                  </span>
                  {!project.readiness.canActivate && (
                    <FieldHelpPopover
                      compact
                      title="Checklist pendente"
                      description="Conclua estes itens antes de iniciar a obra."
                      items={project.readiness.blockers.map(
                        (blocker) => blocker.message,
                      )}
                    />
                  )}
                </div>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-normal">
              {project.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {project.address.formatted}
            </p>
          </div>
          {isEditable && (
            <div className="grid gap-2 xl:min-w-56">
              <AlertDialog
                open={isActivationConfirmationOpen}
                onOpenChange={(open) => {
                  if (!isActivating) setIsActivationConfirmationOpen(open);
                }}
              >
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      className="min-h-11 justify-center"
                      aria-busy={isActivating}
                      disabled={
                        isPending ||
                        isActivating ||
                        hasKnownBlockers ||
                        hasUnsavedChanges
                      }
                    />
                  }
                >
                  {isActivating ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Play aria-hidden="true" className="size-4" />
                  )}
                  {isActivating ? "Iniciando obra..." : "Iniciar obra"}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Iniciar esta obra?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ao confirmar, a obra passará para Em andamento. As frentes
                      de serviço continuarão planejadas e deverão ser iniciadas
                      separadamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Não, cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setIsActivationConfirmationOpen(false);
                        activateProject();
                      }}
                    >
                      Sim, iniciar obra
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <p className="text-xs font-semibold leading-5 text-muted-foreground">
                {hasUnsavedChanges
                  ? "Salve as alterações abertas antes de iniciar."
                  : hasKnownBlockers
                    ? "Resolva as pendências do checklist para liberar."
                    : "Tudo pronto para ativar a obra."}
              </p>
            </div>
          )}
        </div>

        <dl className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryItem
            label="Contrato"
            value={project.contractNumber ?? "Não informado"}
          />
          <SummaryItem
            label="Cliente"
            value={project.client?.name ?? "Não informado"}
          />
          <SummaryItem
            label="Início planejado"
            value={formatDate(project.baseline?.plannedStartDate ?? null)}
          />
          <SummaryItem
            label="Início real"
            value={formatDateTime(project.actualStartedAt)}
          />
        </dl>
      </header>

      <div
        className={cn(
          "grid gap-4 md:items-start",
          isProjectNavigationExpanded
            ? "md:grid-cols-[15rem_minmax(0,1fr)]"
            : "md:grid-cols-[3.5rem_minmax(0,1fr)]",
        )}
      >
        <aside className="min-w-0 md:sticky md:top-20">
          <nav
            aria-label="Navegação da obra"
            className="w-full max-h-[min(54svh,30rem)] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-card p-2 md:max-h-[calc(100dvh-5.75rem)]"
          >
            <div
              className={cn(
                "mb-2 flex min-h-10 items-center gap-2 border-b border-border px-1 pb-2",
                !isProjectNavigationExpanded && "justify-center",
              )}
            >
              {isProjectNavigationExpanded && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">
                    Navegação da obra
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {project.name}
                  </p>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  isProjectNavigationExpanded
                    ? "Recolher navegação da obra"
                    : "Expandir navegação da obra"
                }
                title={
                  isProjectNavigationExpanded
                    ? "Recolher navegação da obra"
                    : "Expandir navegação da obra"
                }
                onClick={toggleProjectNavigation}
              >
                {isProjectNavigationExpanded ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
              </Button>
            </div>

            <div className="space-y-1">
              {project.status === "active" && (
                <ProjectNavigationItem
                  active={activeTab === "overview"}
                  collapsed={!isProjectNavigationExpanded}
                  icon={Gauge}
                  label="Visão geral"
                  status={{ label: "Em andamento", tone: "ready" }}
                  onClick={() => selectProjectTab("overview")}
                />
              )}
              <ProjectNavigationItem
                active={activeTab === "planning"}
                collapsed={!isProjectNavigationExpanded}
                icon={Route}
                label="Planejamento"
                status={planningStatus}
                onClick={() => selectProjectTab("planning")}
              />
              <ProjectNavigationItem
                active={activeTab === "calendar"}
                collapsed={!isProjectNavigationExpanded}
                icon={CalendarRange}
                label="Calendário"
                status={{ label: "Em breve", tone: "neutral" }}
                onClick={() => selectProjectTab("calendar")}
              />
              <ProjectNavigationItem
                active={activeTab === "fronts"}
                collapsed={!isProjectNavigationExpanded}
                icon={HardHat}
                label="Frentes"
                status={
                  project.workFronts.some(
                    (front) => front.planningEligibility.isValid,
                  )
                    ? { label: "OK", tone: "ready" }
                    : { label: "Pendente", tone: "pending" }
                }
                onClick={() => selectProjectTab("fronts")}
              />
              {project.status === "active" && (
                <>
                  <ProjectNavigationItem
                    active={activeTab === "production"}
                    collapsed={!isProjectNavigationExpanded}
                    icon={Gauge}
                    label="Produção"
                    status={
                      initialProductions?.data.length
                        ? {
                            label: String(initialProductions.data.length),
                            tone: "ready",
                          }
                        : { label: "Novo", tone: "neutral" }
                    }
                    onClick={() => selectProjectTab("production")}
                  />
                  <ProjectNavigationGroup
                    collapsed={!isProjectNavigationExpanded}
                    expanded={isNavigationGroupOpen("reports")}
                    icon={FileText}
                    items={[{ label: "RDO", status: reportsStatus }]}
                    label="Relatórios"
                    onClick={() => toggleNavigationGroup("reports")}
                  >
                    <ProjectNavigationItem
                      active={activeTab === "reports"}
                      icon={PackageCheck}
                      label="RDO"
                      nested
                      status={reportsStatus}
                      onClick={() => selectProjectTab("reports")}
                    />
                  </ProjectNavigationGroup>
                </>
              )}

              <div className="my-2 border-t border-border" />

              <ProjectNavigationGroup
                collapsed={!isProjectNavigationExpanded}
                expanded={isNavigationGroupOpen("settings")}
                icon={Settings2}
                items={[
                  { label: "Responsáveis", status: accountabilityStatus },
                  { label: "Máquinas", status: machinesStatus },
                  { label: "Equipe", status: teamStatus },
                ]}
                label="Configurações"
                onClick={() => toggleNavigationGroup("settings")}
              >
                <ProjectNavigationItem
                  active={activeTab === "accountability"}
                  icon={HardHat}
                  label="Responsáveis"
                  nested
                  status={accountabilityStatus}
                  onClick={() => selectProjectTab("accountability")}
                />
                <ProjectNavigationItem
                  active={activeTab === "machines"}
                  icon={Truck}
                  label="Máquinas"
                  nested
                  status={machinesStatus}
                  onClick={() => selectProjectTab("machines")}
                />
                <ProjectNavigationItem
                  active={activeTab === "team"}
                  icon={UsersRound}
                  label="Equipe"
                  nested
                  status={teamStatus}
                  onClick={() => selectProjectTab("team")}
                />
              </ProjectNavigationGroup>

              <ProjectNavigationGroup
                collapsed={!isProjectNavigationExpanded}
                expanded={isNavigationGroupOpen("suppliers")}
                icon={Fuel}
                items={[
                  { label: "Combustível", status: fuelStatus },
                  { label: "Itens fornecidos", status: materialsStatus },
                ]}
                label="Fornecedores"
                onClick={() => toggleNavigationGroup("suppliers")}
              >
                <ProjectNavigationItem
                  active={activeTab === "fuel"}
                  icon={Fuel}
                  label="Combustível"
                  nested
                  status={fuelStatus}
                  onClick={() => selectProjectTab("fuel")}
                />
                <ProjectNavigationItem
                  active={activeTab === "materials"}
                  icon={PackageCheck}
                  label="Itens fornecidos"
                  nested
                  status={materialsStatus}
                  onClick={() => selectProjectTab("materials")}
                />
              </ProjectNavigationGroup>

              <ProjectNavigationGroup
                collapsed={!isProjectNavigationExpanded}
                expanded={isNavigationGroupOpen("financial")}
                icon={WalletCards}
                items={[
                  { label: "Orçamento", status: financialStatus },
                  { label: "Ciclos de pagamento", status: paymentsStatus },
                ]}
                label="Financeiro"
                onClick={() => toggleNavigationGroup("financial")}
              >
                <ProjectNavigationItem
                  active={activeTab === "financial"}
                  icon={WalletCards}
                  label="Orçamento"
                  nested
                  status={financialStatus}
                  onClick={() => selectProjectTab("financial")}
                />
                <ProjectNavigationItem
                  active={activeTab === "payments"}
                  icon={CalendarDays}
                  label="Ciclos de pagamento"
                  nested
                  status={paymentsStatus}
                  onClick={() => selectProjectTab("payments")}
                />
              </ProjectNavigationGroup>
            </div>
          </nav>
        </aside>

        <section className="min-h-[calc(100dvh-7rem)] min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="p-4">
            {activeTab === "overview" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Section
                  icon={Gauge}
                  title="Quantitativos de referência"
                  description="A linha de base aprovada é comparada à distribuição atual; os apontamentos de produção serão adicionados nesta etapa futura."
                  status={{
                    label: `Revisão ${project.quantityBaseline.revision ?? 0}`,
                    tone: "neutral",
                  }}
                >
                  <div className="grid gap-2 text-sm">
                    {project.quantityBaseline.items.map((item) => (
                      <div
                        key={item.serviceCode}
                        className="grid grid-cols-3 gap-2 rounded-md border border-border p-2"
                      >
                        <span className="font-semibold">
                          {metricDefinitions.find(
                            (metric) => metric.code === item.serviceCode,
                          )?.label ?? item.serviceCode}
                        </span>
                        <span>
                          Distribuído:{" "}
                          {canonicalDecimalToBrazilian(item.allocated, 3)}
                        </span>
                        <span>
                          Saldo:{" "}
                          {canonicalDecimalToBrazilian(item.unallocated, 3)}{" "}
                          {item.unitCode}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
                <Section
                  icon={HardHat}
                  title="Frentes ativas"
                  description="Acompanhe quais áreas já foram liberadas. Produção executada ainda não é registrada nesta etapa."
                  status={{
                    label: `${project.workFronts.filter((front) => front.status === "active").length} ativa(s)`,
                    tone: "ready",
                  }}
                >
                  <div className="grid gap-2 text-sm">
                    {project.workFronts
                      .filter((front) => front.status === "active")
                      .map((front) => (
                        <div
                          key={front.id}
                          className="rounded-md border border-border p-2 font-semibold"
                        >
                          {front.name}
                        </div>
                      ))}
                    {!project.workFronts.some(
                      (front) => front.status === "active",
                    ) && (
                      <p className="text-muted-foreground">
                        Nenhuma frente ativa.
                      </p>
                    )}
                  </div>
                </Section>
              </div>
            )}

            {activeTab === "reports" && (
              <Section
                icon={PackageCheck}
                title="RDO"
                description="Cadastre, finalize e compartilhe os Relatórios Diários de Obra desta obra."
                status={{
                  label: initialDailyReports?.data.length
                    ? `${initialDailyReports.data.length} RDO(s)`
                    : "Sem RDO",
                  tone: initialDailyReports?.data.length ? "ready" : "neutral",
                }}
              >
                <ProjectDailyReports
                  projectId={project.id}
                  initialPage={
                    initialDailyReports ?? {
                      data: [],
                      pageInfo: { hasNextPage: false, nextCursor: null },
                    }
                  }
                />
              </Section>
            )}
            {activeTab === "financial" && (
              <Section
                icon={WalletCards}
                title="Orçamento"
                description="Consulte a referência financeira da obra. Custos reais e medições dependem dos lançamentos futuros."
                status={{ label: "Planejado", tone: "neutral" }}
              >
                <dl className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Orçamento aprovado"
                    value={
                      project.baseline
                        ? formatMoney(project.baseline.approvedBudget)
                        : "Não informado"
                    }
                  />
                  <DetailRow
                    label="Custos reais"
                    value="Disponíveis com os lançamentos operacionais"
                  />
                </dl>
                <p className="mt-4 rounded-md bg-secondary/55 px-3 py-2.5 text-sm leading-5 text-secondary-foreground">
                  Os prazos de pagamento da equipe são administrados em
                  &ldquo;Ciclos de pagamento&rdquo;.
                </p>
              </Section>
            )}

            {activeTab === "calendar" && (
              <Section
                icon={CalendarRange}
                title="Calendário"
                description="A agenda operacional da obra ficará disponível aqui."
                status={{ label: "Em breve", tone: "neutral" }}
              >
                <EmptyBlock>
                  Este espaço será usado para acompanhar marcos, atividades e
                  compromissos da obra.
                </EmptyBlock>
              </Section>
            )}

            {activeTab === "planning" && (
              <div className="space-y-4">
                <Section
                  icon={CalendarDays}
                  title="Datas planejadas"
                  description="Período de referência usado para organizar a mobilização e liberar o início operacional."
                  status={plannedDatesStatus}
                  action={
                    isEditable && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-10"
                        disabled={isPending}
                        onClick={openPlannedDatesModal}
                      >
                        <Pencil className="size-4" />
                        Editar datas
                      </Button>
                    )
                  }
                >
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <DetailRow
                      label="Início planejado"
                      value={formatDate(
                        project.baseline?.plannedStartDate ?? null,
                      )}
                    />
                    <DetailRow
                      label="Fim planejado"
                      value={formatDate(
                        project.baseline?.plannedEndDate ?? null,
                      )}
                    />
                  </dl>
                </Section>

                <Section
                  icon={Gauge}
                  title="Quantitativos de referência"
                  description="Este é o total aprovado da obra. As frentes distribuem esse total e não o substituem."
                  status={metricsStatus}
                  action={
                    canManageFronts && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-10"
                        disabled={isPending}
                        onClick={openQuantityBaselineModal}
                      >
                        <Pencil className="size-4" />
                        Editar quantitativos
                      </Button>
                    )
                  }
                >
                  {project.quantityBaseline.items.length ? (
                    <div className="overflow-hidden rounded-md border border-border">
                      <div className="hidden grid-cols-[minmax(0,1fr)_repeat(3,minmax(110px,0.55fr))] gap-3 bg-secondary/45 px-3 py-2 text-xs font-bold text-muted-foreground md:grid">
                        <span>Serviço</span>
                        <span>Total</span>
                        <span>Distribuído</span>
                        <span>Saldo</span>
                      </div>
                      <div className="divide-y divide-border">
                        {project.quantityBaseline.items.map((item) => (
                          <div
                            key={item.serviceCode}
                            className="grid gap-3 bg-background px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(110px,0.55fr))] md:items-center"
                          >
                            <div className="min-w-0">
                              <p className="font-bold">
                                {metricDefinitions.find(
                                  (metric) => metric.code === item.serviceCode,
                                )?.label ?? item.serviceCode}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground md:hidden">
                                {item.unitCode}
                              </p>
                            </div>
                            <p>
                              <span className="font-bold md:hidden">
                                Total:{" "}
                              </span>
                              <strong>
                                {canonicalDecimalToBrazilian(item.total, 3)}
                              </strong>{" "}
                              {item.unitCode}
                            </p>
                            <p>
                              <span className="font-bold md:hidden">
                                Distribuído:{" "}
                              </span>
                              {canonicalDecimalToBrazilian(item.allocated, 3)}
                            </p>
                            <p>
                              <span className="font-bold md:hidden">
                                Saldo:{" "}
                              </span>
                              {canonicalDecimalToBrazilian(item.unallocated, 3)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyBlock>
                      Nenhum quantitativo de referência configurado.
                    </EmptyBlock>
                  )}
                </Section>
              </div>
            )}

            {activeTab === "production" && (
              <Section
                icon={Gauge}
                title="Produção"
                description="Registre quantidades, viagens, DMT, máquinas, horas e paradas por serviço e turno."
                status={{
                  label: initialProductions?.data.length
                    ? `${initialProductions.data.length} lançamento(s)`
                    : "Sem produção",
                  tone: initialProductions?.data.length ? "ready" : "neutral",
                }}
              >
                <ProjectProductions
                  projectId={project.id}
                  initialPage={
                    initialProductions ?? {
                      data: [],
                      pageInfo: { hasNextPage: false, nextCursor: null },
                      capabilities: {
                        createDraft: true,
                        submit: true,
                        check: true,
                        recordTopography: true,
                        recordLaboratory: true,
                        approve: true,
                        reject: true,
                        release: true,
                        publishDirect: true,
                        approveOthers: true,
                        reopen: true,
                        viewHistory: true,
                        measure: false,
                      },
                    }
                  }
                />
              </Section>
            )}

            {activeTab === "fronts" && (
              <div className="space-y-4">
                <Section
                  icon={HardHat}
                  title="Frentes de serviço"
                  description="Cadastre a área de atuação e distribua a parcela planejada para cada frente. O saldo continua disponível para novas frentes."
                  status={
                    project.workFronts.some(
                      (front) => front.planningEligibility.isValid,
                    )
                      ? { label: "Frente elegível", tone: "ready" }
                      : { label: "Pendente", tone: "pending" }
                  }
                  action={
                    canManageFronts ? (
                      <Button
                        type="button"
                        className="min-h-10"
                        disabled={
                          isPending || !project.quantityBaseline.items.length
                        }
                        onClick={openWorkFrontModal}
                      >
                        <Plus className="size-4" />
                        Cadastrar frente
                      </Button>
                    ) : undefined
                  }
                >
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {project.quantityBaseline.items.length
                      ? "Distribua somente os serviços planejados para esta área. O saldo permanece disponível para as próximas frentes."
                      : "Salve os quantitativos de referência antes de distribuir serviços em uma frente."}
                  </p>
                </Section>
                <div className="grid gap-3">
                  {project.workFronts.length ? (
                    project.workFronts.map((front) => (
                      <div
                        key={front.id}
                        className="rounded-md border border-border bg-background p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{front.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {front.location ?? "Localização não informada"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {front.requiresEmployees && (
                              <span className="rounded-sm bg-secondary px-2 py-1 text-xs font-bold">
                                Exige equipe
                              </span>
                            )}
                            {front.requiresMachines && (
                              <span className="rounded-sm bg-secondary px-2 py-1 text-xs font-bold">
                                Exige máquinas
                              </span>
                            )}
                            {(front.status === "planned" ||
                              front.status === "active") && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() => openEditWorkFrontModal(front)}
                              >
                                <Pencil className="size-4" />
                                {front.status === "active"
                                  ? "Editar distribuição"
                                  : "Editar frente"}
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {front.status === "active"
                            ? "Em execução"
                            : project.status === "planned"
                              ? front.planningEligibility.isValid
                                ? "Planejada e válida"
                                : front.planningEligibility.blockers.join(" ")
                              : front.eligibility.canStart
                                ? "Pronta para iniciar"
                                : front.eligibility.blockers.join(" ")}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {front.services.map((service) => (
                            <span
                              key={service.serviceCode}
                              className="rounded-sm bg-secondary px-2 py-1 text-xs font-semibold"
                            >
                              {metricDefinitions.find(
                                (metric) => metric.code === service.serviceCode,
                              )?.label ?? service.serviceCode}
                              :{" "}
                              {canonicalDecimalToBrazilian(service.quantity, 3)}{" "}
                              {service.unitCode}
                            </span>
                          ))}
                        </div>
                        {project.status === "active" && (
                          <div className="mt-3 grid gap-2 rounded-md border border-border bg-secondary/20 p-3 text-sm">
                            <p className="font-bold">Mobilização atual</p>
                            <p className="text-muted-foreground">
                              {front.employeeAssignments.length} pessoa(s) ·{" "}
                              {front.machineAssignments.length} máquina(s)
                            </p>
                            {front.status === "active" &&
                              !front.mobilizationRecorded && (
                                <p className="font-semibold text-amber-800">
                                  Mobilização histórica ainda não registrada.
                                </p>
                              )}
                          </div>
                        )}
                        {project.status === "active" && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() => openFrontMobilizationModal(front)}
                            >
                              <UsersRound className="size-4" />
                              {front.mobilizationRecorded
                                ? "Editar mobilização"
                                : "Preparar mobilização"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() =>
                                openMobilizationHistory("employee", front.id)
                              }
                            >
                              Histórico
                            </Button>
                            {front.status === "planned" && (
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  isPending || !front.eligibility.canStart
                                }
                                onClick={() =>
                                  startTransition(async () => {
                                    const result =
                                      await startProjectWorkFrontAction(
                                        project.id,
                                        front.id,
                                      );
                                    if (result.kind === "success") {
                                      toast.success("Frente iniciada.");
                                      router.refresh();
                                      return;
                                    }
                                    toast.error(
                                      "Não foi possível iniciar esta frente.",
                                    );
                                  })
                                }
                              >
                                <Play className="size-4" />
                                Iniciar frente
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Nenhuma frente cadastrada. Cadastre pelo menos uma para
                      liberar o início da obra.
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "fuel" && (
              <Section
                icon={Fuel}
                title="Combustível"
                description="Selecione ofertas cadastradas no fornecedor e confirme o preço da obra."
                status={fuelStatus}
                action={
                  isEditable && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10"
                      onClick={openAddFuelModal}
                    >
                      <Plus className="size-4" />
                      Adicionar combustível
                    </Button>
                  )
                }
              >
                <div className="grid gap-2 text-sm">
                  {fuelOffers.length ? (
                    fuelOffers.map((offer) => (
                      <div
                        key={offer.id}
                        className="grid gap-3 rounded-md border border-border bg-background px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 font-bold">
                              {offer.item?.name ?? "Item não encontrado"}
                            </p>
                            <span
                              className={cn(
                                "inline-flex min-h-6 items-center rounded-sm px-2 text-xs font-bold",
                                offer.sourceOfferId
                                  ? "bg-secondary text-secondary-foreground"
                                  : "bg-primary/10 text-primary",
                              )}
                            >
                              {offer.sourceOfferId
                                ? "Catálogo"
                                : "Exclusiva da obra"}
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {offer.supplier?.name ??
                              "Fornecedor não encontrado"}{" "}
                            · {offer.purchaseUnit?.code ?? "un."} ·{" "}
                            {formatMoney(offer.price, 4)}
                          </p>
                        </div>
                        {isEditable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-10 justify-self-start md:justify-self-end"
                            onClick={() => openEditFuelModal(offer.id)}
                          >
                            <Pencil className="size-4" />
                            Editar oferta
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="grid gap-3 rounded-md border border-dashed border-border bg-background px-4 py-5 text-center">
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          Nenhum combustível confirmado.
                        </p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          Adicione uma oferta existente ou crie uma oferta
                          exclusiva para esta obra.
                        </p>
                      </div>
                      {isEditable && (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-10 justify-self-center"
                          onClick={openAddFuelModal}
                        >
                          <Plus className="size-4" />
                          Adicionar combustível
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {activeTab === "accountability" && (
              <Section
                icon={HardHat}
                title="Responsáveis da obra"
                description="Cliente, gestor e responsabilidade técnica."
                status={accountabilityStatus}
                action={
                  isEditable && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => setOpenModal("accountability")}
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                  )
                }
              >
                <dl className="grid gap-2">
                  <DetailRow
                    label="Cliente"
                    value={project.client?.name ?? "Não informado"}
                  />
                  <DetailRow
                    label="Gestor"
                    value={project.manager?.name ?? "Não informado"}
                  />
                  <DetailRow
                    label="Responsáveis técnicos"
                    value={
                      project.technicalResponsibilities.length
                        ? project.technicalResponsibilities
                            .map((person) => person.name)
                            .join(", ")
                        : "Não informado"
                    }
                  />
                </dl>
              </Section>
            )}

            {activeTab === "team" && (
              <Section
                icon={UsersRound}
                title="Equipe operacional"
                description="Funcionários mobilizados com função, jornada e remuneração."
                status={teamStatus}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => openMobilizationHistory("employee")}
                    >
                      Histórico
                    </Button>
                  </div>
                }
              >
                <ProjectTeamView
                  projectId={project.id}
                  counts={{
                    day: project.employeeAllocations.filter(
                      (allocation) => allocation.shift === "day",
                    ).length,
                    night: project.employeeAllocations.filter(
                      (allocation) => allocation.shift === "night",
                    ).length,
                  }}
                  canEdit={canManageMobilization}
                  initialShift={selectedTeamShift}
                  onAddShift={(shift) => openTeamModal(shift, "add")}
                  onActiveShiftChange={(shift) => {
                    setSelectedTeamShift(shift);
                    persistProjectContext("team", shift);
                  }}
                  onEditMember={openTeamMemberModal}
                  onEditShift={openTeamModal}
                  onRemoveMember={setRemovingTeamMember}
                  reloadKey={teamReloadKey}
                />
              </Section>
            )}

            {activeTab === "machines" && (
              <Section
                icon={Truck}
                title="Máquinas e operadores"
                description="Cada máquina precisa de operador presente na equipe."
                status={machinesStatus}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => openMobilizationHistory("machine")}
                    >
                      Histórico
                    </Button>
                    {canManageMobilization && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-10"
                        onClick={openMachinesModal}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                    )}
                  </div>
                }
              >
                <div className="grid gap-2 text-sm">
                  {project.machineAllocations.length ? (
                    project.machineAllocations.map((allocation) => (
                      <div
                        key={allocation.id}
                        className="rounded-md border border-border bg-background px-3 py-2"
                      >
                        <p className="font-bold">
                          {allocation.machine?.name ?? "Máquina"}
                        </p>
                        <p className="text-muted-foreground">
                          {allocation.operatorAssignments.length
                            ? allocation.operatorAssignments
                                .map(
                                  (assignment) =>
                                    `${assignment.shift === "night" ? "Noturno" : "Diurno"}: ${assignment.operator?.name ?? "Não informado"}`,
                                )
                                .join(" · ")
                            : "Nenhum operador por turno informado"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <EmptyBlock>Nenhuma máquina alocada.</EmptyBlock>
                  )}
                </div>
              </Section>
            )}

            {activeTab === "payments" && (
              <Section
                icon={WalletCards}
                title="Ciclos de pagamento"
                description="Regra de pagamento para cada modalidade presente na equipe."
                status={paymentsStatus}
                action={
                  isEditable && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => setOpenModal("payments")}
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                  )
                }
              >
                {paymentTermRows.length ? (
                  <div className="grid gap-2 text-sm">
                    {[...paymentTermRows]
                      .sort((a, b) =>
                        paymentModeSort(a.compensationMode, b.compensationMode),
                      )
                      .map((term) => (
                        <p
                          key={term.compensationMode}
                          className="rounded-md border border-border bg-background px-3 py-2"
                        >
                          <span className="font-bold">
                            {compensationLabels[term.compensationMode]}:{" "}
                          </span>
                          {paymentTermSummary(
                            term.compensationMode,
                            term.daysAfterPeriodEnd,
                          )}
                        </p>
                      ))}
                  </div>
                ) : (
                  <EmptyBlock>Nenhum prazo de pagamento confirmado.</EmptyBlock>
                )}
              </Section>
            )}

            {activeTab === "materials" && (
              <Section
                icon={PackageCheck}
                title="Itens e fornecedores"
                description="Ofertas não-combustível vinculadas à obra."
                status={materialsStatus}
                action={
                  isEditable && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10"
                      onClick={openMaterialsModal}
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                  )
                }
              >
                <div className="grid gap-2 text-sm">
                  {materialOffers.length ? (
                    materialOffers.map((offer) => (
                      <div
                        key={offer.id}
                        className="rounded-md border border-border bg-background px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">
                            {offer.item?.name ?? "Item não encontrado"}
                          </p>
                          <span
                            className={cn(
                              "inline-flex min-h-6 items-center rounded-sm px-2 text-xs font-bold",
                              offer.sourceOfferId
                                ? "bg-secondary text-secondary-foreground"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            {offer.sourceOfferId
                              ? "Catálogo"
                              : "Exclusiva da obra"}
                          </span>
                        </div>
                        <p className="text-muted-foreground">
                          {offer.supplier?.name ?? "Fornecedor não encontrado"}{" "}
                          · {offer.purchaseUnit?.code ?? "un."} · Quantidade{" "}
                          {canonicalDecimalToBrazilian(
                            offer.conversionToBase,
                            6,
                          )}{" "}
                          · {formatMoney(offer.price, 4)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <EmptyBlock>Nenhum item adicional configurado.</EmptyBlock>
                  )}
                </div>
              </Section>
            )}
          </div>
        </section>
      </div>

      <OperationsModal
        icon={CalendarDays}
        open={openModal === "planningDates"}
        onOpenChange={(open) => {
          if (!open) closePlannedDatesModal();
        }}
        size="md"
        title="Editar datas planejadas"
        description="Ajuste o período previsto da obra. A data final não pode ser anterior ao início."
        footer={
          <>
            <p className="text-xs font-medium leading-5 text-muted-foreground">
              As datas salvas passam a orientar o planejamento vigente.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={closePlannedDatesModal}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={isPending || !plannedDatesDirty}
                onClick={savePlannedDates}
              >
                <Save className="size-4" />
                {isPending ? "Salvando..." : "Salvar datas"}
              </Button>
            </div>
          </>
        }
      >
        <div className="grid gap-5">
          <FormErrorDeclaration
            issues={plannedDateIssues}
            title="Não foi possível salvar as datas."
            description="Corrija os pontos indicados e tente novamente."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Início planejado</span>
              <Input
                autoFocus
                className="h-11"
                type="date"
                value={plannedStartDate}
                disabled={isPending}
                aria-invalid={plannedDateIssues.some(
                  (issue) => issue.field === "Início",
                )}
                onChange={(event) => {
                  setPlannedStartDate(event.target.value);
                  setPlannedDatesDirty(true);
                  if (plannedDateIssues.length) setPlannedDateIssues([]);
                }}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Fim planejado</span>
              <Input
                className="h-11"
                type="date"
                value={plannedEndDate}
                disabled={isPending}
                aria-invalid={plannedDateIssues.some(
                  (issue) => issue.field === "Fim",
                )}
                onChange={(event) => {
                  setPlannedEndDate(event.target.value);
                  setPlannedDatesDirty(true);
                  if (plannedDateIssues.length) setPlannedDateIssues([]);
                }}
              />
            </label>
          </div>
        </div>
      </OperationsModal>

      <OperationsModal
        icon={UsersRound}
        open={openModal === "teamMember"}
        onOpenChange={(open) => {
          if (!open && !isPending) closeTeamOrMachineModal();
        }}
        size="xl"
        className="sm:max-h-[44rem]"
        bodyClassName="overscroll-contain"
        title={
          editingTeamMember
            ? `Editar ${editingTeamMember.name}`
            : "Editar funcionário"
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={closeTeamOrMachineModal}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => teamMemberEditorRef.current?.confirmDraft()}
            >
              <Check className="size-4" />
              Salvar funcionário
            </Button>
          </>
        }
      >
        {editingTeamMember && (
          <EmployeeMobilization
            allowProjectRoleChange={project.status === "planned"}
            bare
            fixedShift={editingTeamMember.shift}
            form={readinessForm}
            hideDraftActions
            initialEmploymentId={editingTeamMember.employmentId}
            onDraftConfirmed={saveTeam}
            options={teamMemberOptions}
            ref={teamMemberEditorRef}
            sessionKey={`${project.id}-${editingTeamMember.id}-employee`}
            showConfirmedCount={false}
            title={null}
            description={null}
          />
        )}
      </OperationsModal>

      <AlertDialog
        open={Boolean(removingTeamMember)}
        onOpenChange={(open) => {
          if (!isPending && !open) setRemovingTeamMember(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover este funcionário do turno?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removingTeamMember
                ? `${removingTeamMember.name} deixará a equipe ${removingTeamMember.shift === "day" ? "diurna" : "noturna"}.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={removeTeamMember}
            >
              Remover funcionário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OperationsModal
        icon={Gauge}
        open={openModal === "quantityBaseline"}
        onOpenChange={(open) => {
          if (!open) closeQuantityBaselineModal();
        }}
        size="xl"
        title="Editar quantitativos de referência"
        description="Selecione os serviços contratados e informe o total aprovado para cada um."
        footer={
          <>
            <p className="text-xs font-medium leading-5 text-muted-foreground">
              O salvamento cria uma nova revisão da linha de base.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={closeQuantityBaselineModal}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  isPending ||
                  !quantityBaselineDirty ||
                  quantityBaselineAllocationIssues.length > 0
                }
                onClick={saveQuantityBaseline}
              >
                <Save className="size-4" />
                {isPending ? "Salvando..." : "Salvar quantitativos"}
              </Button>
            </div>
          </>
        }
      >
        <div className="grid gap-5">
          <FormErrorDeclaration
            issues={visibleQuantityBaselineIssues}
            title={
              quantityBaselineAllocationIssues.length
                ? "Total abaixo do volume distribuído."
                : "Não foi possível salvar os quantitativos."
            }
            description={
              quantityBaselineAllocationIssues.length
                ? "Ajuste os totais indicados antes de salvar a revisão."
                : "Corrija os pontos indicados e tente novamente."
            }
          />
          <div className="grid gap-3">
            {metrics.map((metric, index) => {
              const persisted = project.quantityBaseline.items.find(
                (item) => item.serviceCode === metric.code,
              );
              const allocated = canonicalDecimalToThousandths(
                persisted?.allocated ?? "0.000",
              );
              const hasAllocated = allocated !== null && allocated > BigInt(0);
              const hasIssue = quantityBaselineAllocationIssues.some(
                (issue) => issue.field === metric.label,
              );
              return (
                <div
                  key={metric.code}
                  className={cn(
                    "grid gap-3 rounded-md border border-border bg-background px-3 py-3 md:grid-cols-[minmax(0,1fr)_190px] md:items-center",
                    metric.enabled && "border-primary bg-primary/5",
                  )}
                >
                  <label className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={metric.enabled}
                      disabled={isPending || hasAllocated}
                      onChange={(event) => {
                        setMetrics((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, enabled: event.target.checked }
                              : item,
                          ),
                        );
                        setQuantityBaselineDirty(true);
                        if (quantityBaselineIssues.length)
                          setQuantityBaselineIssues([]);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">
                        {metric.label}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {metric.description}
                      </span>
                      {hasAllocated && persisted && (
                        <span className="mt-1.5 block text-xs font-semibold text-foreground">
                          Já distribuído:{" "}
                          {canonicalDecimalToBrazilian(persisted.allocated, 3)}{" "}
                          {persisted.unitCode}. Este serviço não pode ser
                          removido.
                        </span>
                      )}
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold">
                    <span>Total de referência ({metric.unit})</span>
                    <Input
                      className="h-11"
                      inputMode="decimal"
                      value={metric.targetTotal}
                      disabled={isPending || !metric.enabled}
                      aria-invalid={hasIssue}
                      onChange={(event) => {
                        setMetrics((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  targetTotal: formatBrazilianDecimalInput(
                                    event.target.value,
                                    3,
                                  ),
                                }
                              : item,
                          ),
                        );
                        setQuantityBaselineDirty(true);
                        if (quantityBaselineIssues.length)
                          setQuantityBaselineIssues([]);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </OperationsModal>

      <OperationsModal
        icon={UsersRound}
        open={openModal === "frontMobilization"}
        onOpenChange={(open) => {
          if (!open) closeFrontMobilizationModal();
        }}
        size="xl"
        title={`Mobilização${mobilizingFront ? ` — ${mobilizingFront.name}` : ""}`}
        description="Destine recursos já mobilizados na obra. Recursos ocupados precisam ser liberados na frente atual primeiro."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={closeFrontMobilizationModal}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={saveFrontMobilization}
            >
              <Save className="size-4" />
              Salvar mobilização
            </Button>
          </>
        }
      >
        <div className="grid gap-5">
          <FormErrorDeclaration
            issues={frontMobilizationIssues}
            title="Não foi possível salvar a mobilização."
            description="Revise os recursos indicados e tente novamente."
          />
          {mobilizingFront && (
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              {mobilizingFront.requiresEmployees && (
                <span className="rounded-sm bg-secondary px-2 py-1">
                  Exige equipe
                </span>
              )}
              {mobilizingFront.requiresMachines && (
                <span className="rounded-sm bg-secondary px-2 py-1">
                  Exige máquinas
                </span>
              )}
            </div>
          )}
          {mobilizingFront && (
            <WorkFrontMobilizationSelector
              key={mobilizingFront.id}
              projectId={project.id}
              frontId={mobilizingFront.id}
              disabled={isPending}
              selectedEmploymentIds={frontEmploymentIds}
              selectedMachineKeys={frontMachineIds}
              onSelectedEmploymentIdsChange={setFrontEmploymentIds}
              onSelectedMachineKeysChange={setFrontMachineIds}
            />
          )}
        </div>
      </OperationsModal>

      <OperationsModal
        icon={CalendarDays}
        open={openModal === "mobilizationHistory"}
        onOpenChange={(open) => {
          if (!open && !isPending) setOpenModal(null);
        }}
        size="xl"
        title="Histórico de mobilização"
        description={
          historyFrontId
            ? "Períodos registrados para a frente selecionada."
            : "Períodos de mobilização geral da obra."
        }
        footer={
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setOpenModal(null)}
          >
            Fechar
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="flex gap-2">
            {(["employee", "machine"] as const).map((resourceType) => (
              <Button
                key={resourceType}
                type="button"
                size="sm"
                variant={
                  historyResourceType === resourceType ? "default" : "outline"
                }
                disabled={isPending}
                onClick={() => {
                  setHistoryResourceType(resourceType);
                  setHistoryItems([]);
                  setHistoryNextCursor(null);
                  loadMobilizationHistory(resourceType, historyFrontId);
                }}
              >
                {resourceType === "employee" ? "Equipe" : "Máquinas"}
              </Button>
            ))}
          </div>
          <div className="grid gap-2">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border bg-background px-3 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong>{item.resource.name}</strong>
                  <span className="font-semibold text-muted-foreground">
                    {item.effectiveTo ? "Encerrada" : "Atual"}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {formatDateTime(item.effectiveFrom)} —{" "}
                  {item.effectiveTo
                    ? formatDateTime(item.effectiveTo)
                    : "em andamento"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registrado por {item.createdBy?.email ?? "sistema"}
                  {item.endedReason ? ` · ${item.endedReason}` : ""}
                </p>
              </div>
            ))}
            {!historyItems.length && !isPending && (
              <EmptyBlock>Nenhum período registrado.</EmptyBlock>
            )}
          </div>
          {historyNextCursor && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                loadMobilizationHistory(
                  historyResourceType,
                  historyFrontId,
                  historyNextCursor,
                )
              }
            >
              Carregar mais
            </Button>
          )}
        </div>
      </OperationsModal>

      <OperationsModal
        icon={HardHat}
        open={openModal === "frontCreate"}
        onOpenChange={(open) => {
          if (!open) closeWorkFrontModal();
        }}
        size="lg"
        title={
          editingFront?.status === "active"
            ? "Editar distribuição da frente"
            : editingFront
              ? "Editar frente de serviço"
              : "Cadastrar frente de serviço"
        }
        description={
          editingFront?.status === "active"
            ? "Ajuste somente os serviços e quantitativos. Os demais dados da frente ativa serão preservados."
            : "Defina a área de atuação, os requisitos de início e os quantitativos planejados para esta frente."
        }
        footer={
          <>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={closeWorkFrontModal}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  isPending ||
                  frontExcessIssues.length > 0 ||
                  frontMinimumIssues.length > 0 ||
                  (editingFront?.status !== "active" &&
                    !frontRequiresEmployees &&
                    !frontRequiresMachines)
                }
                onClick={saveWorkFront}
              >
                <Save className="size-4" />
                {isPending
                  ? "Salvando..."
                  : editingFront
                    ? editingFront.status === "active"
                      ? "Salvar distribuição"
                      : "Salvar frente"
                    : "Cadastrar frente"}
              </Button>
            </div>
          </>
        }
      >
        <div className="grid gap-5">
          <FormErrorDeclaration
            issues={visibleFrontIssues}
            title={
              frontMinimumIssues.length
                ? "Quantitativo abaixo do produzido."
                : frontExcessIssues.length
                  ? "Quantitativo acima do saldo disponível."
                  : editingFront
                    ? "Não foi possível atualizar a frente."
                    : "Não foi possível cadastrar a frente."
            }
            description={
              frontMinimumIssues.length
                ? "Mantenha os valores no mínimo produzido antes de salvar."
                : frontExcessIssues.length
                  ? "Reduza os valores indicados antes de salvar a frente."
                  : "Corrija os pontos indicados e tente novamente."
            }
          />
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              editingFront?.status === "active" && "opacity-70",
            )}
          >
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Nome da frente</span>
              <Input
                autoFocus
                value={frontName}
                disabled={isPending || editingFront?.status === "active"}
                placeholder="Ex.: Frente 01 — acesso norte"
                onChange={(event) => {
                  setFrontName(event.target.value);
                  if (frontIssues.length) setFrontIssues([]);
                }}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>
                Localização{" "}
                <em className="font-normal text-muted-foreground">
                  (opcional)
                </em>
              </span>
              <Input
                value={frontLocation}
                disabled={isPending || editingFront?.status === "active"}
                placeholder="Estaca, trecho ou setor"
                onChange={(event) => {
                  setFrontLocation(event.target.value);
                  if (frontIssues.length) setFrontIssues([]);
                }}
              />
            </label>
          </div>

          {editingFront?.status !== "active" && (
            <FormSection
              title="Exigências para iniciar"
              description="Defina quais recursos precisam estar mobilizados antes do início desta frente."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <SelectableRow
                  checked={frontRequiresEmployees}
                  onChange={setFrontRequiresEmployees}
                >
                  Exige equipe mobilizada
                </SelectableRow>
                <SelectableRow
                  checked={frontRequiresMachines}
                  onChange={setFrontRequiresMachines}
                >
                  Exige máquinas mobilizadas
                </SelectableRow>
              </div>
              {!frontRequiresEmployees && !frontRequiresMachines && (
                <p className="mt-2 text-sm font-semibold text-destructive">
                  Selecione ao menos uma exigência.
                </p>
              )}
            </FormSection>
          )}

          <div className="grid gap-2">
            <div>
              <h3 className="text-sm font-bold">Quantitativos desta frente</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Preencha apenas os serviços que serão executados nesta frente.
              </p>
            </div>
            {project.quantityBaseline.items.map((item) => {
              const currentService = editingFront?.services.find(
                (service) => service.serviceCode === item.serviceCode,
              );
              const maximum =
                currentService?.maximumQuantity ?? item.unallocated;
              const label =
                metricDefinitions.find(
                  (metric) => metric.code === item.serviceCode,
                )?.label ?? item.serviceCode;
              const hasQuantityIssue = [
                ...frontMinimumIssues,
                ...frontExcessIssues,
              ].some((issue) => issue.field === label);
              return (
                <label
                  key={item.serviceCode}
                  className="grid gap-2 rounded-md border border-border bg-background px-3 py-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
                >
                  <span className="min-w-0 text-sm">
                    <strong className="block">{label}</strong>
                    <span className="mt-1 block text-muted-foreground">
                      Produzido:{" "}
                      {canonicalDecimalToBrazilian(
                        currentService?.produced ?? "0.000",
                        3,
                      )}{" "}
                      {item.unitCode} · mínimo:{" "}
                      {canonicalDecimalToBrazilian(
                        currentService?.minimumQuantity ?? "0.000",
                        3,
                      )}{" "}
                      · máximo: {canonicalDecimalToBrazilian(maximum, 3)}{" "}
                      {item.unitCode}
                    </span>
                  </span>
                  <Input
                    aria-label={`Quantidade para ${label}`}
                    aria-invalid={hasQuantityIssue}
                    inputMode="decimal"
                    disabled={isPending}
                    placeholder="0"
                    value={frontQuantities[item.serviceCode] ?? ""}
                    onChange={(event) => {
                      setFrontQuantities((current) => ({
                        ...current,
                        [item.serviceCode]: formatBrazilianDecimalInput(
                          event.target.value,
                          3,
                        ),
                      }));
                      if (frontIssues.length) setFrontIssues([]);
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>
      </OperationsModal>

      <OperationsModal
        icon={Fuel}
        open={openModal === "fuelAdd"}
        onOpenChange={(open) => {
          if (!open && !isPending) closeFuelModal();
        }}
        size="xl"
        title="Adicionar combustível"
        description="Escolha uma oferta existente ou crie uma nova entrada exclusiva para esta obra."
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeFuelModal}>
              Cancelar
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={isPending || fuelAddStep === "source"}
                onClick={() => setFuelAddStep(previousFuelStep(fuelAddStep))}
              >
                Voltar
              </Button>
              {isFuelAddReviewStep ? (
                <Button
                  type="button"
                  disabled={isPending || !fuelAddCanSave}
                  onClick={saveFuelAdd}
                >
                  <Check className="size-4" />
                  Salvar combustível
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isPending || !fuelAddCanContinue}
                  onClick={() => setFuelAddStep(nextFuelStep(fuelAddStep))}
                >
                  Continuar
                </Button>
              )}
            </div>
          </>
        }
      >
        {fuelAddDraft && (
          <FuelAddEditor
            categories={options.suppliedItemCategories.filter(
              (category) => category.kind === "fuel",
            )}
            draft={fuelAddDraft}
            fuelOptions={fuelOptions}
            lookupSuppliedItemOfferSuppliersAction={
              lookupSuppliedItemOfferSuppliersAction
            }
            lookupSuppliedItemOffersAction={lookupSuppliedItemOffersAction}
            lookupSuppliedItemsAction={lookupSuppliedItemsAction}
            measurementUnits={options.measurementUnits}
            suppliers={options.suppliers}
            suppliedItems={options.suppliedItems}
            step={fuelAddStep}
            setDraft={setFuelDraftWithDirty(setFuelAddDraft)}
          />
        )}
      </OperationsModal>

      <OperationsModal
        icon={Fuel}
        open={openModal === "fuelEdit"}
        onOpenChange={(open) => {
          if (!open && !isPending) closeFuelModal();
        }}
        size="lg"
        title="Editar combustível"
        description="Na edição, ajuste apenas o preço da obra e a quantidade específica desta oferta."
        footer={
          <>
            <AlertDialog
              open={Boolean(
                currentEditingFuelOffer &&
                confirmingFuelRemovalId === currentEditingFuelOffer.id,
              )}
              onOpenChange={(open) => {
                if (isPending) return;
                setConfirmingFuelRemovalId(
                  open && currentEditingFuelOffer
                    ? currentEditingFuelOffer.id
                    : null,
                );
              }}
            >
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isPending || !currentEditingFuelOffer}
                  />
                }
              >
                <Trash2 className="size-4" />
                Remover oferta
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Remover oferta de combustível?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    A oferta será desvinculada desta obra. O fornecedor, o item
                    e o catálogo permanecem inalterados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      setConfirmingFuelRemovalId(null);
                      removeFuelOffer();
                    }}
                  >
                    Remover oferta
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={closeFuelModal}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  isPending || !fuelEditDraft || !currentEditingFuelOffer
                }
                onClick={saveFuelEdit}
              >
                <Check className="size-4" />
                Salvar oferta
              </Button>
            </div>
          </>
        }
      >
        {fuelEditDraft && currentEditingFuelOffer && (
          <FuelEditEditor
            draft={fuelEditDraft}
            offer={currentEditingFuelOffer}
            setDraft={setFuelDraftWithDirty(setFuelEditDraft)}
          />
        )}
      </OperationsModal>

      <OperationsModal
        icon={PackageCheck}
        open={openModal === "materials"}
        onOpenChange={(open) => {
          if (!open && !isPending) closeMaterialsModal();
        }}
        size="xl"
        title={
          materialView === "add"
            ? "Adicionar oferta"
            : materialView === "edit"
              ? "Editar oferta"
              : "Editar itens e fornecedores"
        }
        description={
          materialView === "add"
            ? "Escolha a origem, o item e o fornecedor antes de confirmar preço e quantidade."
            : materialView === "edit"
              ? "Atualize a condição aplicada somente nesta obra."
              : "Gerencie as ofertas de materiais vinculadas à obra."
        }
        footer={
          materialView === "list" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={closeMaterialsModal}
            >
              Fechar
            </Button>
          ) : materialView === "add" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isPending}
                onClick={resetMaterialEditor}
              >
                Cancelar
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={isPending || materialAddStep === "source"}
                  onClick={() => {
                    setMaterialIssues([]);
                    setMaterialAddStep(previousMaterialStep(materialAddStep));
                  }}
                >
                  Voltar
                </Button>
                {materialAddStep === "review" ? (
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={isPending || !materialAddCanSave}
                    onClick={saveMaterialAdd}
                  >
                    <Check className="size-4" />
                    Salvar oferta
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={isPending || !materialAddCanContinue}
                    onClick={() => {
                      setMaterialIssues([]);
                      setMaterialAddStep(nextMaterialStep(materialAddStep));
                    }}
                  >
                    Continuar
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isPending}
                onClick={resetMaterialEditor}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={isPending || !isMaterialDraftComplete(materialDraft)}
                onClick={saveMaterialEdit}
              >
                <Check className="size-4" />
                Salvar oferta
              </Button>
            </>
          )
        }
      >
        {materialView === "list" && (
          <MaterialOfferList
            isPending={isPending}
            offers={materialOffers}
            onAdd={openMaterialAdd}
            onEdit={openMaterialEdit}
            onRemove={removeMaterialOffer}
          />
        )}
        {materialView === "add" && materialDraft && (
          <MaterialAddEditor
            categories={options.suppliedItemCategories.filter(
              (category) => category.kind === "material",
            )}
            draft={materialDraft}
            lookupItemsAction={lookupSuppliedItemsAction}
            lookupOfferSuppliersAction={lookupSuppliedItemOfferSuppliersAction}
            lookupOffersAction={lookupSuppliedItemOffersAction}
            lookupSuppliersAction={lookupSuppliersAction}
            measurementUnits={options.measurementUnits}
            saveIssues={materialIssues}
            setDraft={setMaterialDraft}
            step={materialAddStep}
          />
        )}
        {materialView === "edit" &&
          materialDraft &&
          currentEditingMaterialOffer && (
            <MaterialEditEditor
              draft={materialDraft}
              issues={materialIssues}
              offer={currentEditingMaterialOffer}
              setDraft={setMaterialDraft}
            />
          )}
      </OperationsModal>

      <OperationsModal
        icon={HardHat}
        open={openModal === "accountability"}
        onOpenChange={(open) => {
          if (!open && !isPending) closeTeamOrMachineModal();
        }}
        size="xl"
        title="Editar responsáveis da obra"
        description="Defina quem responde pela obra. Esta seleção não mobiliza funcionários para produção."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={closeTeamOrMachineModal}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={saveAccountability}
            >
              <Check className="size-4" />
              Salvar responsáveis
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <FormSection
            title="Governança da obra"
            description="Cliente e gestor aparecem no resumo operacional e nas validações de início."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold">
                <span>Cliente</span>
                <select
                  className={controlClass}
                  value={watchedClientId ?? ""}
                  onChange={(event) =>
                    readinessForm.setValue("clientId", event.target.value, {
                      shouldDirty: true,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {modalOptions.clients.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.detail ? ` · ${option.detail}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                <span>Gestor da obra</span>
                <select
                  className={controlClass}
                  value={watchedManagerEmploymentId ?? ""}
                  onChange={(event) =>
                    readinessForm.setValue(
                      "managerEmploymentId",
                      event.target.value,
                      { shouldDirty: true },
                    )
                  }
                >
                  <option value="">Selecione</option>
                  {modalOptions.employees.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.detail ? ` · ${option.detail}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </FormSection>

          <FormSection
            title="Responsabilidade técnica"
            description="Selecione quem responde tecnicamente pela obra. A equipe operacional é configurada em outro modal."
          >
            <div className="grid gap-2">
              {modalOptions.employees.length ? (
                modalOptions.employees.map((option) => {
                  const selected = watchedTechnicalResponsibilityIds ?? [];
                  const checked = selected.includes(option.id);
                  return (
                    <SelectableRow
                      key={option.id}
                      checked={checked}
                      onChange={(nextChecked) =>
                        readinessForm.setValue(
                          "technicalResponsibilityEmploymentIds",
                          nextChecked
                            ? [...selected, option.id]
                            : selected.filter((id) => id !== option.id),
                          { shouldDirty: true },
                        )
                      }
                    >
                      {option.label}
                      {option.detail ? ` · ${option.detail}` : ""}
                    </SelectableRow>
                  );
                })
              ) : (
                <EmptyBlock>
                  Nenhum funcionário disponível para responsabilidade técnica.
                </EmptyBlock>
              )}
            </div>
          </FormSection>
        </div>
      </OperationsModal>

      <OperationsModal
        icon={UsersRound}
        open={openModal === "team"}
        onOpenChange={(open) => {
          if (!open && !isPending) closeTeamOrMachineModal();
        }}
        size="xl"
        className="sm:max-h-[44rem]"
        bodyClassName="overscroll-contain"
        title={`${teamModalMode === "add" ? "Mobilizar equipe" : "Editar jornada"} ${teamShift === "day" ? "diurna" : "noturna"}`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={closeTeamOrMachineModal}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={saveTeam}>
              <Check className="size-4" />
              {teamModalMode === "add"
                ? "Salvar mobilização"
                : "Salvar jornada"}
            </Button>
          </>
        }
      >
        <div
          key={`${teamShift}-${teamModalMode}`}
          className="grid gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out"
        >
          {teamModalMode === "schedule" ? (
            <Schedule fixedShift={teamShift} form={readinessForm} />
          ) : (
            <>
              <label className="grid gap-1.5 text-sm font-semibold">
                <span>Buscar por nome ou função</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-11 pl-9"
                    value={teamSearch}
                    onChange={(event) => setTeamSearch(event.target.value)}
                    placeholder="Ex.: Maria ou Operador"
                  />
                </div>
              </label>
              {teamCandidatesError ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 p-3 text-sm font-semibold text-destructive"
                >
                  <p>{teamCandidatesError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={() => loadTeamCandidatePage()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : teamCandidatesLoading && activeTeamPage.data.length === 0 ? (
                <div
                  role="status"
                  className="flex min-h-24 items-center justify-center gap-2 text-sm font-semibold text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  Buscando funcionários…
                </div>
              ) : (
                <EmployeeMobilization
                  allowProjectRoleChange={project.status === "planned"}
                  bare
                  fixedShift={teamShift}
                  form={readinessForm}
                  options={teamCandidateOptions}
                  sessionKey={`${project.id}-${teamShift}-candidates`}
                  showConfirmedCount={false}
                  title={null}
                  description={null}
                />
              )}
              {(teamPageIndex > 0 ||
                teamCandidateOptions.employees.length > 0 ||
                activeTeamPage.pageInfo.hasNextPage) && (
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={teamPageIndex === 0 || teamCandidatesLoading}
                    onClick={() => setTeamPageIndex((index) => index - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm font-semibold text-muted-foreground">
                    Página {teamPageIndex + 1}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !activeTeamPage.pageInfo.hasNextPage ||
                      teamCandidatesLoading
                    }
                    onClick={() =>
                      teamPages[teamPageIndex + 1]
                        ? setTeamPageIndex((index) => index + 1)
                        : loadTeamCandidatePage(
                            activeTeamPage.pageInfo.nextCursor,
                            true,
                          )
                    }
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </OperationsModal>

      <OperationsModal
        icon={Truck}
        open={openModal === "machines"}
        onOpenChange={(open) => {
          if (!open && !isPending && !isSavingMachines)
            closeTeamOrMachineModal();
        }}
        size="xl"
        title="Editar máquinas e operadores"
        description="Adicione, remova ou remaneje operadores das máquinas confirmadas."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending || isSavingMachines}
              onClick={closeTeamOrMachineModal}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending || isSavingMachines}
              onClick={saveMachines}
            >
              <Check className="size-4" />
              {isSavingMachines ? "Salvando máquinas..." : "Salvar máquinas"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {machineSaveError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-semibold text-destructive"
            >
              {machineSaveError}
            </div>
          )}
          <MachineMobilization form={readinessForm} options={modalOptions} />
        </div>
      </OperationsModal>

      <OperationsModal
        icon={WalletCards}
        open={openModal === "payments"}
        onOpenChange={(open) => {
          if (!open && !isPending) closePaymentsModal();
        }}
        size="lg"
        title="Editar pagamentos"
        description="Registre a regra prática de pagamento para cada modalidade presente na equipe."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={closePaymentsModal}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={savePayments}>
              <Check className="size-4" />
              Salvar pagamentos
            </Button>
          </>
        }
      >
        {paymentModes.length ? (
          <div className="grid gap-3">
            {paymentModes.map((mode) => (
              <label
                key={mode}
                className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm"
              >
                <span className="font-bold">{compensationLabels[mode]}</span>
                <span className="text-sm leading-5 text-muted-foreground">
                  {paymentPromptForMode(mode)}
                </span>
                <select
                  className={controlClass}
                  value={paymentTerms[mode] ?? ""}
                  onChange={(event) => {
                    setPaymentTerms((current) => ({
                      ...current,
                      [mode]: event.target.value,
                    }));
                    setPaymentDirty(true);
                  }}
                >
                  <option value="">Selecione</option>
                  {paymentOptionsForMode(mode).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            Não há modalidades porque a obra ainda não possui equipe
            operacional.
          </p>
        )}
      </OperationsModal>
    </article>
  );
}

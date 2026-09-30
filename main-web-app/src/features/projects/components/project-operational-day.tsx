"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Fuel,
  Gauge,
  Loader2,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button } from "@/components/ui/button";
import { FormWizardProgress } from "@/components/ui/form-wizard-progress";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  productionServiceLabel,
  productionUnitLabel,
} from "../production-labels";
import {
  addOperationalInterferenceAction,
  closeOperationalShiftAction,
  confirmOperationalInterferenceAction,
  startOperationalShiftAction,
} from "../operational-day.actions";
import {
  getDailyReportProductionsAction,
  getProjectProductionAction,
  getProjectProductionOptionsAction,
  reopenProjectProductionAction,
} from "../productions.actions";
import type {
  OperationalDay,
  OperationalReport,
  OperationalResult,
  OperationalShift,
} from "../operational-day.types";
import type {
  ProjectDailyReportProductionSummary,
  ProjectProductionDetail,
  ProjectProductionOptions,
} from "../productions.types";
import { ProjectProductionWizard } from "./project-production-simple-wizard";

const climateLabels = {
  dry: "Seco",
  rain: "Chuva",
  waterlogged_soil: "Solo encharcado",
};
const interferenceLabels = {
  weather: "Clima",
  crew: "Equipe",
  equipment: "Equipamento",
  material_logistics: "Material e logística",
  external: "Externa",
  safety: "Segurança",
  other: "Outra",
};

function shiftLabel(shift: OperationalShift) {
  return shift === "day" ? "diurno" : "noturno";
}

function preferredShift(day: OperationalDay): OperationalShift {
  const runningDay = day.shifts.find(
    (item) => item.shift === "day" && item.report?.status === "draft",
  );
  if (runningDay) return "day";
  const runningNight = day.shifts.find(
    (item) => item.shift === "night" && item.report?.status === "draft",
  );
  if (runningNight) return "night";
  if (day.shifts.some((item) => item.shift === "day" && item.enabled))
    return "day";
  return day.shifts.find((item) => item.enabled)?.shift ?? "day";
}

function shiftStatusLabel(item: OperationalDay["shifts"][number]) {
  if (item.report?.status === "finalized") return "Finalizado";
  if (item.report?.status === "draft") return "Em andamento";
  return "Não iniciado";
}

export function ProjectOperationalDay({
  initialDay,
  projectId,
  projectName,
}: {
  initialDay: OperationalDay;
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [day, setDay] = React.useState(initialDay);
  const [visibleShift, setVisibleShift] = React.useState<OperationalShift>(() =>
    preferredShift(initialDay),
  );
  const [panel, setPanel] = React.useState<{
    kind: "start" | "interference" | "close";
    shift: OperationalShift;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [production, setProduction] = React.useState<{
    shift: OperationalShift;
    responsibleEmploymentId: string;
    options: ProjectProductionOptions;
  } | null>(null);
  const refresh = React.useCallback(() => router.refresh(), [router]);
  const refreshPaused = panel !== null || production !== null;
  React.useEffect(() => {
    setDay(initialDay);
    setVisibleShift((current) => {
      const currentItem = initialDay.shifts.find(
        (item) => item.shift === current,
      );
      const hasRunningShift = initialDay.shifts.some(
        (item) => item.report?.status === "draft",
      );
      return currentItem?.enabled && (currentItem.report || !hasRunningShift)
        ? current
        : preferredShift(initialDay);
    });
  }, [initialDay]);
  React.useEffect(() => {
    const refreshWhenIdle = () => {
      if (!refreshPaused) refresh();
    };
    const id = window.setInterval(refreshWhenIdle, 30_000);
    const focus = () => refreshWhenIdle();
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", focus);
    };
  }, [refresh, refreshPaused]);
  async function run(
    work: () => Promise<
      ReturnType<typeof startOperationalShiftAction> extends Promise<infer T>
        ? T
        : never
    >,
    success: string,
    onFailure?: (message: string) => void,
  ): Promise<void> {
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (result.kind === "failure") {
      if (onFailure) onFailure(result.message);
      else toast.error(result.message);
      return;
    }
    setDay(result.day);
    if (panel?.kind === "start") setVisibleShift(panel.shift);
    setPanel(null);
    toast.success(success);
  }
  async function openProduction(item: OperationalDay["shifts"][number]) {
    if (!item.report || item.report.status !== "draft") return;
    setBusy(true);
    try {
      const options = await getProjectProductionOptionsAction({
        projectId,
        productionDate: day.reportDate,
        shift: item.shift,
      });
      setProduction({
        shift: item.shift,
        responsibleEmploymentId: item.report.supervisor.employmentId,
        options,
      });
    } catch {
      toast.error("Não foi possível abrir o lançamento de produção.");
    } finally {
      setBusy(false);
    }
  }
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day.reportDate}T12:00:00Z`));
  const visibleItem =
    day.shifts.find((item) => item.shift === visibleShift && item.enabled) ??
    day.shifts.find((item) => item.enabled) ??
    day.shifts[0]!;
  const switchableItems = day.shifts.filter(
    (item) => item.enabled && item.report,
  );
  const startableOtherShift = day.shifts.find(
    (item) =>
      item.shift !== visibleItem.shift && item.enabled && !item.report,
  );
  const visibleRunningReport =
    visibleItem.report?.status === "draft" ? visibleItem.report : null;
  return (
    <main className="min-h-full bg-background">
      <header className="flex flex-col gap-4 border-b border-border bg-card px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button
            variant="ghost"
            className="-ml-2 min-h-11 text-base"
            onClick={() =>
              router.push(`/home/obras/${projectId}?section=calendar`)
            }
          >
            <ArrowLeft />
            Voltar ao calendário
          </Button>
          <h1 className="mt-3 text-2xl font-bold text-balance sm:text-[1.75rem]">
            Central operacional
          </h1>
          <p className="mt-1 text-base font-medium capitalize text-muted-foreground">
            {formatted} · {projectName}
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-12 text-base"
          onClick={refresh}
        >
          <RefreshCw />
          Atualizar operação
        </Button>
      </header>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="space-y-3">
          {(switchableItems.length > 1 || startableOtherShift) && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {switchableItems.length > 1 && (
                <div
                  className="inline-flex w-full rounded-lg border border-border bg-secondary/45 p-1 sm:w-auto"
                  role="group"
                  aria-label="Alternar turno operacional"
                >
                  {switchableItems.map((item) => {
                    const selected = item.shift === visibleItem.shift;
                    const Icon = item.shift === "day" ? Sun : Moon;
                    const status = shiftStatusLabel(item);
                    return (
                      <Button
                        key={item.shift}
                        type="button"
                        variant={selected ? "secondary" : "ghost"}
                        className={cn(
                          "min-h-11 flex-1 gap-2 px-3 font-bold sm:flex-none",
                          selected && "bg-card shadow-xs",
                        )}
                        aria-pressed={selected}
                        aria-label={`Exibir turno ${shiftLabel(item.shift)}, ${status.toLowerCase()}`}
                        onClick={() => setVisibleShift(item.shift)}
                      >
                        <Icon className="size-4" />
                        <span>Turno {shiftLabel(item.shift)}</span>
                        <span className="hidden text-xs font-semibold text-muted-foreground md:inline">
                          {status}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
              {startableOtherShift && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10 self-end px-3 font-semibold sm:ml-auto sm:self-auto"
                  disabled={busy}
                  onClick={() =>
                    setPanel({
                      kind: "start",
                      shift: startableOtherShift.shift,
                    })
                  }
                >
                  {startableOtherShift.shift === "day" ? <Sun /> : <Moon />}
                  Iniciar turno {shiftLabel(startableOtherShift.shift)}
                </Button>
              )}
            </div>
          )}
          <ShiftLane
            key={visibleItem.shift}
            item={visibleItem}
            onAction={(kind) =>
              setPanel({ kind, shift: visibleItem.shift })
            }
            onProduction={() => void openProduction(visibleItem)}
          />
        </div>
        {visibleRunningReport && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
            <div className="border-y border-border py-5">
              <h2 className="text-lg font-bold">
                Agora no turno {shiftLabel(visibleItem.shift)}
              </h2>
              <p className="mt-1 text-base text-muted-foreground">
                Interferências e registros deste turno em andamento.
              </p>
              <div className="mt-4 divide-y divide-border">
                {visibleRunningReport.interferenceEntries.length ? (
                  visibleRunningReport.interferenceEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
                    >
                      <AlertTriangle className="size-5 shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold">
                          {entry.description}
                        </p>
                        <p className="text-sm leading-5 text-muted-foreground">
                          {entry.impact}
                        </p>
                      </div>
                      {entry.confirmedAt ? (
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
                          <Check className="size-4" />
                          Confirmada
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => {
                            void run(
                              () =>
                                confirmOperationalInterferenceAction({
                                  projectId,
                                  reportDate: day.reportDate,
                                  reportId: visibleRunningReport.id,
                                  interferenceId: entry.id,
                                }),
                              "Interferência confirmada.",
                            );
                          }}
                        >
                          Confirmar
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-sm font-medium text-muted-foreground">
                    Nenhuma interferência registrada neste turno.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-secondary/55 p-5">
              <h2 className="text-lg font-bold">Próximo passo</h2>
              <p className="mt-2 text-base leading-6 text-secondary-foreground">
                Mantenha produções e interferências atualizadas e revise
                frequência e medidores deste turno antes de finalizar.
              </p>
            </div>
          </section>
        )}
      </div>
      {panel && (
        <OperationalPanel
          day={day}
          projectId={projectId}
          panel={panel}
          busy={busy}
          close={() => setPanel(null)}
          run={run}
        />
      )}
      {production && (
        <ProjectProductionWizard
          contextualEntry={{
            productionDate: day.reportDate,
            shift: production.shift,
            responsibleEmploymentId: production.responsibleEmploymentId,
          }}
          detail={null}
          onContextChange={(productionDate, shift) =>
            getProjectProductionOptionsAction({
              projectId,
              productionDate,
              shift,
            })
          }
          onOpenChange={(open) => {
            if (!open) setProduction(null);
          }}
          onSaved={() => refresh()}
          open
          options={production.options}
          preventDismissal
          projectId={projectId}
        />
      )}
    </main>
  );
}

function ShiftLane({
  item,
  onAction,
  onProduction,
}: {
  item: OperationalDay["shifts"][number];
  onAction: (kind: "start" | "interference" | "close") => void;
  onProduction: () => void;
}) {
  const report = item.report;
  const running = report?.status === "draft";
  const finalized = report?.status === "finalized";
  const blockers = report
    ? [
        report.interferenceEntries.some((value) => !value.confirmedAt),
      ].filter(Boolean).length
    : 0;
  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        running ? "border-primary" : "border-border",
      )}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-lg",
            item.shift === "day"
              ? "bg-amber-100 text-amber-700"
              : "bg-primary/10 text-primary",
          )}
        >
          {item.shift === "day" ? <Sun /> : <Moon />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight text-balance sm:text-[1.75rem]">
              Turno {item.shift === "day" ? "diurno" : "noturno"}
            </h2>
            <Status
              running={running}
              finalized={finalized}
              enabled={item.enabled}
            />
          </div>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {report?.startedAt
              ? `Iniciado às ${clock(report.startedAt)}`
              : item.enabled
                ? "Aguardando início"
                : "Turno não habilitado"}
          </p>
        </div>
        {!report && item.enabled && (
          <Button
            className="min-h-12 px-5 text-base font-bold"
            onClick={() => onAction("start")}
          >
            Iniciar turno
          </Button>
        )}
      </div>
      {report && (
        <>
          <div className="border-y border-border bg-secondary/30 px-5 py-5">
            <div className="flex items-center justify-between gap-2">
              {["Equipe", "Máquinas", "Operação", "Atividades", "Fechamento"].map(
                (label, index) => {
                  const done =
                    finalized ||
                    index < 2 ||
                    (index === 2 &&
                      (report.interferenceEntries.length > 0 ||
                        report.executedActivities));
                  const current = running && !done;
                  return (
                    <div
                      key={label}
                      className="flex min-w-0 flex-1 flex-col items-center text-center"
                    >
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-full border text-sm font-bold",
                          done
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : current
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-card text-muted-foreground",
                        )}
                      >
                        {done ? <Check className="size-4" /> : index + 1}
                      </span>
                      <span className="mt-2 text-sm font-bold">{label}</span>
                    </div>
                  );
                },
              )}
            </div>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold">
                  {finalized
                    ? "Turno finalizado"
                    : blockers
                      ? `${blockers} pendência(s) para finalizar`
                      : "Pronto para revisão final"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {
                    report.employees.filter(
                      (e) => e.attendanceStatus !== "absent",
                    ).length
                  }{" "}
                  presentes ·{" "}
                  {
                    report.machines.filter(
                      (m) => m.operationalCondition !== "unfit",
                    ).length
                  }{" "}
                  máquinas aptas
                </p>
              </div>
            </div>
            {running && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Action
                  icon={Gauge}
                  label="Adicionar produção"
                  onClick={onProduction}
                />
                <Action
                  icon={AlertTriangle}
                  label="Registrar interferência"
                  onClick={() => onAction("interference")}
                />
                <Action
                  icon={Wrench}
                  label="Manutenção"
                  onClick={() =>
                    toast.info(
                      "A rotina de manutenção estará disponível em breve.",
                    )
                  }
                />
                <Action
                  icon={Fuel}
                  label="Abastecimento"
                  onClick={() =>
                    toast.info(
                      "A rotina de abastecimento estará disponível em breve.",
                    )
                  }
                />
                <Button
                  className="col-span-2 min-h-14 text-base font-bold"
                  onClick={() => onAction("close")}
                >
                  Finalizar turno
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
function Status({
  running,
  finalized,
  enabled,
}: {
  running: boolean;
  finalized: boolean;
  enabled: boolean;
}) {
  const cls = finalized
    ? "bg-emerald-100 text-emerald-800"
    : running
      ? "bg-amber-100 text-amber-800"
      : "bg-secondary text-muted-foreground";
  return (
    <span className={cn("rounded-full px-3 py-1 text-sm font-bold", cls)}>
      {finalized
        ? "Finalizado"
        : running
          ? "Em andamento"
          : enabled
            ? "Não iniciado"
            : "Indisponível"}
    </span>
  );
}
function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Gauge;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      className="min-h-14 justify-start px-4 text-left text-sm font-bold sm:text-base"
      onClick={onClick}
    >
      <Icon className="size-5" />
      {label}
    </Button>
  );
}
function clock(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function OperationalPanel({
  day,
  projectId,
  panel,
  busy,
  close,
  run,
}: {
  day: OperationalDay;
  projectId: string;
  panel: {
    kind: "start" | "interference" | "close";
    shift: OperationalShift;
  };
  busy: boolean;
  close: () => void;
  run: (
    work: () => Promise<OperationalResult>,
    success: string,
    onFailure?: (message: string) => void,
  ) => Promise<void>;
}) {
  const item = day.shifts.find((value) => value.shift === panel.shift)!;
  const report = item.report;
  const options = item.options!;
  const now = React.useMemo(() => new Date().toISOString(), []);
  const [startStep, setStartStep] = React.useState<"time" | "checklists">(
    "time",
  );
  const [startedAtTime, setStartedAtTime] = React.useState(() =>
    localTimeValue(new Date(item.suggestedStartedAt ?? now)),
  );
  const [description, setDescription] = React.useState("");
  const [impact, setImpact] = React.useState("");
  const [interferenceCategory, setInterferenceCategory] =
    React.useState<keyof typeof interferenceLabels>("other");
  const [interferenceStart, setInterferenceStart] = React.useState(
    localTimeValue(new Date()),
  );
  const [interferenceEnd, setInterferenceEnd] = React.useState("");
  const [present, setPresent] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      options.employeeOptions.map((value) => [value.id, true]),
    ),
  );
  const [fit, setFit] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(options.machineOptions.map((value) => [value.id, true])),
  );
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [absenceReasons, setAbsenceReasons] = React.useState<
    Record<string, string>
  >({});
  const operationalStart = instantForClock(
    day.reportDate,
    startedAtTime,
    panel.shift,
  );

  if (panel.kind === "close" && report) {
    return (
      <CloseShiftWizard
        busy={busy}
        close={close}
        day={day}
        projectId={projectId}
        report={report}
        breakTemplates={options.defaults.breakTemplates}
        run={run}
      />
    );
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 sm:items-center"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="operational-panel-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-xl bg-card p-5 sm:max-w-3xl sm:rounded-xl sm:p-6"
      >
        <header className="flex items-start gap-4">
          <div className="flex-1">
            <h2 id="operational-panel-title" className="text-xl font-bold">
              {panel.kind === "start"
                ? "Iniciar turno"
                : panel.kind === "interference"
                    ? "Registrar interferência"
                    : "Revisar e finalizar turno"}
            </h2>
            <p className="mt-1 text-base text-muted-foreground">
              Turno {panel.shift === "day" ? "diurno" : "noturno"}
            </p>
          </div>
          <Button
            size="icon-lg"
            variant="ghost"
            aria-label="Fechar"
            onClick={close}
          >
            <X />
          </Button>
        </header>
        {panel.kind === "start" && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center gap-3 text-sm font-bold">
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border",
                  startStep === "time"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-emerald-600 bg-emerald-600 text-white",
                )}
              >
                {startStep === "time" ? 1 : <Check className="size-4" />}
              </span>
              <span>Horário de início</span>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border",
                  startStep === "checklists"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-muted-foreground",
                )}
              >
                2
              </span>
              <span>Checklists</span>
            </div>

            {startStep === "time" ? (
              <section className="grid gap-5 rounded-lg border border-border bg-secondary/30 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Clock3 className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">
                      Confirme quando o turno começou
                    </h3>
                    <p className="mt-1 max-w-prose text-sm leading-5 text-muted-foreground">
                      Esse horário será usado como entrada inicial da equipe e
                      referência para os medidores.
                    </p>
                  </div>
                </div>
                <label className="grid max-w-xs gap-2 text-sm font-bold">
                  Horário de início
                  <Input
                    aria-label="Horário de início"
                    type="time"
                    className="min-h-12 bg-background text-base tabular-nums"
                    value={startedAtTime}
                    onChange={(event) => setStartedAtTime(event.target.value)}
                  />
                </label>
                <Button
                  className="min-h-12 w-full text-base font-bold sm:w-fit sm:justify-self-end"
                  disabled={!startedAtTime}
                  onClick={() => setStartStep("checklists")}
                >
                  Confirmar horário e continuar
                  <ChevronRight />
                </Button>
              </section>
            ) : (
              <>
                <div className="rounded-md bg-secondary/55 px-4 py-3 text-sm">
                  Início confirmado às{" "}
                  <strong className="tabular-nums">{startedAtTime}</strong>.
                </div>
                <fieldset>
                  <legend className="text-lg font-bold">Funcionários</legend>
                  <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                    {options.employeeOptions.length ? (
                      options.employeeOptions.map((value) => (
                        <div key={value.id} className="p-4">
                          <label className="flex min-h-12 items-center gap-3 text-base">
                            <input
                              type="checkbox"
                              checked={present[value.id]}
                              onChange={(event) =>
                                setPresent((current) => ({
                                  ...current,
                                  [value.id]: event.target.checked,
                                }))
                              }
                              className="size-5 accent-primary"
                            />
                            <span className="flex-1">
                              <strong className="block">{value.name}</strong>
                              <span className="text-sm text-muted-foreground">
                                {value.jobRole}
                              </span>
                            </span>
                            <span className="font-bold">
                              {present[value.id] ? "Presente" : "Ausente"}
                            </span>
                          </label>
                          {!present[value.id] && (
                            <Input
                              className="mt-3 min-h-12 text-base"
                              placeholder="Motivo da ausência (opcional)"
                              value={absenceReasons[value.id] ?? ""}
                              onChange={(event) =>
                                setAbsenceReasons((current) => ({
                                  ...current,
                                  [value.id]: event.target.value,
                                }))
                              }
                            />
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="p-4 text-base text-muted-foreground">
                        Nenhum funcionário está alocado neste turno.
                      </p>
                    )}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-lg font-bold">Máquinas</legend>
                  <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                    {options.machineOptions.length ? (
                      options.machineOptions.map((value) => (
                        <div key={value.id} className="p-4">
                          <label className="flex min-h-12 items-center gap-3 text-base">
                            <input
                              type="checkbox"
                              checked={fit[value.id]}
                              onChange={(event) =>
                                setFit((current) => ({
                                  ...current,
                                  [value.id]: event.target.checked,
                                }))
                              }
                              className="size-5 accent-primary"
                            />
                            <span className="flex-1">
                              <strong className="block">{value.name}</strong>
                              <span className="text-sm text-muted-foreground">
                                {value.manufacturer} {value.model}
                              </span>
                            </span>
                            <span className="font-bold">
                              {fit[value.id] ? "Apta" : "Não apta"}
                            </span>
                          </label>
                          {!fit[value.id] && (
                            <Input
                              className="mt-3 min-h-12 text-base"
                              placeholder="Motivo da indisponibilidade"
                              value={notes[value.id] ?? ""}
                              onChange={(event) =>
                                setNotes((current) => ({
                                  ...current,
                                  [value.id]: event.target.value,
                                }))
                              }
                            />
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="p-4 text-base text-muted-foreground">
                        Nenhuma máquina está alocada neste turno.
                      </p>
                    )}
                  </div>
                </fieldset>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button
                    variant="outline"
                    className="min-h-12 text-base"
                    onClick={() => setStartStep("time")}
                    disabled={busy}
                  >
                    <ChevronLeft /> Voltar ao horário
                  </Button>
                  <Button
                    className="min-h-12 text-base font-bold"
                    disabled={
                      busy ||
                      !options.employeeOptions.length ||
                      !options.machineOptions.length ||
                      options.machineOptions.some(
                        (value) => !fit[value.id] && !notes[value.id]?.trim(),
                      )
                    }
                    onClick={() =>
                      void run(
                        () =>
                          startOperationalShiftAction({
                            projectId,
                            reportDate: day.reportDate,
                            shift: panel.shift,
                            startedAt: operationalStart,
                            employees: options.employeeOptions.map((value) => ({
                              employmentId: value.id,
                              status: present[value.id] ? "present" : "absent",
                              absenceReason: present[value.id]
                                ? null
                                : absenceReasons[value.id] || null,
                            })),
                            machines: options.machineOptions.map((value) => ({
                              machineId: value.id,
                              condition: fit[value.id] ? "fit" : "unfit",
                              conditionNote: fit[value.id]
                                ? null
                                : notes[value.id],
                            })),
                          }),
                        "Turno iniciado e RDO criado em rascunho.",
                      )
                    }
                  >
                    {busy && <Loader2 className="animate-spin" />}
                    Confirmar checklists e iniciar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {panel.kind === "interference" && report && (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-base font-bold">
                Categoria
                <select
                  className="mt-2 min-h-12 w-full rounded-md border border-input bg-background px-3 text-base"
                  value={interferenceCategory}
                  onChange={(event) =>
                    setInterferenceCategory(
                      event.target.value as keyof typeof interferenceLabels,
                    )
                  }
                >
                  {Object.entries(interferenceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-base font-bold">
                Início
                <Input
                  type="time"
                  className="mt-2 min-h-12 text-base"
                  value={interferenceStart}
                  onChange={(event) => setInterferenceStart(event.target.value)}
                />
              </label>
              <label className="block text-base font-bold">
                Fim (opcional)
                <Input
                  type="time"
                  className="mt-2 min-h-12 text-base"
                  value={interferenceEnd}
                  onChange={(event) => setInterferenceEnd(event.target.value)}
                />
              </label>
            </div>
            <label className="block text-base font-bold">
              Descrição
              <Input
                className="mt-2 min-h-12 text-base"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="block text-base font-bold">
              Impacto na operação
              <textarea
                className="mt-2 min-h-28 w-full rounded-md border border-input bg-background p-3 text-base"
                value={impact}
                onChange={(event) => setImpact(event.target.value)}
              />
            </label>
            <Button
              className="min-h-14 w-full text-base font-bold"
              disabled={
                busy ||
                description.trim().length < 3 ||
                impact.trim().length < 3 ||
                !interferenceStart
              }
              onClick={() =>
                void run(
                  () =>
                    addOperationalInterferenceAction({
                      projectId,
                      reportDate: day.reportDate,
                      reportId: report.id,
                      data: {
                        category: interferenceCategory,
                        description,
                        impact,
                        startedAt: instantForClock(
                          day.reportDate,
                          interferenceStart,
                          panel.shift,
                        ),
                        endedAt: interferenceEnd
                          ? instantForClock(
                              day.reportDate,
                              interferenceEnd,
                              panel.shift,
                            )
                          : null,
                      },
                    }),
                  "Interferência registrada.",
                )
              }
            >
              Registrar interferência
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

const closeSteps = [
  { title: "Horários" },
  { title: "Medidores" },
  { title: "Equipe" },
  { title: "Atividades executadas" },
  { title: "Revisão" },
];
const MACHINE_PAGE_SIZE = 6;
const EMPLOYEE_PAGE_SIZE = 10;

function CloseShiftWizard({
  breakTemplates,
  busy,
  close,
  day,
  projectId,
  report,
  run,
}: {
  breakTemplates: Array<{
    id: string;
    name: string;
    durationMinutes: number;
  }>;
  busy: boolean;
  close: () => void;
  day: OperationalDay;
  projectId: string;
  report: OperationalReport;
  run: (
    work: () => Promise<OperationalResult>,
    success: string,
    onFailure?: (message: string) => void,
  ) => Promise<void>;
}) {
  const initialEndTime = React.useMemo(() => localTimeValue(new Date()), []);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [returnToReview, setReturnToReview] = React.useState(false);
  const [machinePage, setMachinePage] = React.useState(0);
  const [employeePage, setEmployeePage] = React.useState(0);
  const [issue, setIssue] = React.useState<string | null>(null);
  const [productionSummary, setProductionSummary] =
    React.useState<ProjectDailyReportProductionSummary | null>(null);
  const [productionOptions, setProductionOptions] =
    React.useState<ProjectProductionOptions | null>(null);
  const [productionsLoading, setProductionsLoading] = React.useState(true);
  const [productionsConfirmed, setProductionsConfirmed] = React.useState(false);
  const [activityNotes, setActivityNotes] = React.useState("");
  const [fallbackClimates, setFallbackClimates] = React.useState<
    Array<keyof typeof climateLabels>
  >([]);
  const [editingProduction, setEditingProduction] =
    React.useState<ProjectProductionDetail | null>(null);
  const [endedAtTime, setEndedAtTime] = React.useState(initialEndTime);
  const [appliedEndTime, setAppliedEndTime] = React.useState(initialEndTime);
  const [earlyClosureReason, setEarlyClosureReason] = React.useState("");
  const [employeeClose, setEmployeeClose] = React.useState<EmployeeCloseState>(
    () =>
      Object.fromEntries(
        report.employees.map((employee) => [
          employee.employmentId,
          {
            checkIn: employee.checkInAt
              ? localTimeValue(new Date(employee.checkInAt))
              : report.startedAt
                ? localTimeValue(new Date(report.startedAt))
                : "",
            checkOut: employee.checkOutAt
              ? localTimeValue(new Date(employee.checkOutAt))
              : initialEndTime,
            overtimeConfirmed: employee.overtimeConfirmed ?? false,
          },
        ]),
      ),
  );
  const [shiftBreaks, setShiftBreaks] = React.useState<ShiftBreak[]>(() => {
    const saved = report.employees.find(
      (employee) =>
        employee.attendanceStatus !== "absent" && employee.breaks?.length,
    )?.breaks;
    return (saved ?? []).map((interval, index) => ({
      id: `saved-${index}`,
      name: `Intervalo ${index + 1}`,
      start: localTimeValue(new Date(interval.startAt)),
      durationMinutes: Math.max(
        1,
        Math.round(
          (new Date(interval.endAt).getTime() -
            new Date(interval.startAt).getTime()) /
            60_000,
        ),
      ),
    }));
  });
  const [breakComposerOpen, setBreakComposerOpen] = React.useState(false);
  const [selectedBreakTemplateId, setSelectedBreakTemplateId] = React.useState<
    string | null
  >(null);
  const [breakDraft, setBreakDraft] = React.useState({
    name: "",
    start: "",
    durationMinutes: "",
  });
  const nextBreakId = React.useRef(1);
  const [machineReadings, setMachineReadings] = React.useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      report.machines.map((machine) => [
        machine.machineId,
        machine.endMeterReading?.value ?? machine.startMeterReading.value,
      ]),
    ),
  );
  const stepHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const endedAt = instantForClock(day.reportDate, endedAtTime, report.shift);
  const plannedMinutes = activityWindowMinutes(report.activityWindow);
  const workedShiftMinutes = report.startedAt
    ? Math.max(
        0,
        Math.round(
          (new Date(endedAt).getTime() - new Date(report.startedAt).getTime()) /
            60_000,
        ),
      )
    : 0;
  const shiftExcessMinutes = Math.max(0, workedShiftMinutes - plannedMinutes);
  const plannedEndAt = instantForDayOffset(
    day.reportDate,
    report.activityWindow.endTime,
    report.activityWindow.endDayOffset,
  );
  const isEarlyClosure =
    new Date(endedAt).getTime() < new Date(plannedEndAt).getTime();
  const machinePageCount = Math.max(
    1,
    Math.ceil(report.machines.length / MACHINE_PAGE_SIZE),
  );
  const employeePageCount = Math.max(
    1,
    Math.ceil(report.employees.length / EMPLOYEE_PAGE_SIZE),
  );
  const visibleMachines = report.machines.slice(
    machinePage * MACHINE_PAGE_SIZE,
    (machinePage + 1) * MACHINE_PAGE_SIZE,
  );
  const visibleEmployees = report.employees.slice(
    employeePage * EMPLOYEE_PAGE_SIZE,
    (employeePage + 1) * EMPLOYEE_PAGE_SIZE,
  );

  React.useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [currentStep, machinePage, employeePage]);

  const fetchProductions = React.useCallback(
    () =>
      Promise.all([
        getDailyReportProductionsAction(projectId, report.id),
        getProjectProductionOptionsAction({
          projectId,
          productionDate: day.reportDate,
          shift: report.shift,
        }),
      ]),
    [day.reportDate, projectId, report.id, report.shift],
  );

  const loadProductions = React.useCallback(async () => {
    try {
      const [summary, options] = await fetchProductions();
      setProductionSummary(summary);
      setProductionOptions(options);
      setProductionsConfirmed(false);
    } catch {
      setIssue("Não foi possível carregar as produções deste turno.");
    } finally {
      setProductionsLoading(false);
    }
  }, [fetchProductions]);

  React.useEffect(() => {
    let active = true;
    fetchProductions()
      .then(([summary, options]) => {
        if (!active) return;
        setProductionSummary(summary);
        setProductionOptions(options);
        setProductionsConfirmed(false);
      })
      .catch(() => {
        if (active)
          setIssue("Não foi possível carregar as produções deste turno.");
      })
      .finally(() => {
        if (active) setProductionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchProductions]);

  async function editProduction(productionId: string) {
    setProductionsLoading(true);
    setIssue(null);
    try {
      let detail = await getProjectProductionAction(projectId, productionId);
      if (detail.status !== "draft") {
        const reopened = await reopenProjectProductionAction({
          projectId,
          productionId,
          expectedRevision: detail.revision,
          reason: "Correção durante o fechamento do turno",
        });
        if (reopened.kind === "failure") {
          setIssue(reopened.message);
          return;
        }
        detail = reopened.production;
      }
      setEditingProduction(detail);
      setProductionsConfirmed(false);
    } catch {
      setIssue("Não foi possível abrir esta produção para edição.");
    } finally {
      setProductionsLoading(false);
    }
  }

  function timeError() {
    if (!report.startedAt || !endedAtTime)
      return "Confirme os horários do turno antes de continuar.";
    const start = new Date(report.startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (!Number.isFinite(end) || end <= start)
      return "O encerramento deve ser posterior ao início do turno.";
    if (end > Date.now() + 60_000)
      return "O encerramento não pode estar no futuro.";
    if (isEarlyClosure && !earlyClosureReason.trim())
      return "Informe o motivo do encerramento antes do horário previsto.";
    return null;
  }

  function machineError(machines = visibleMachines) {
    for (const machine of machines) {
      if (machine.operationalCondition === "unfit") continue;
      const value = normalizedDecimal(machineReadings[machine.machineId]);
      if (!value || !Number.isFinite(Number(value)))
        return `Informe a leitura final de ${machine.name}.`;
      if (Number(value) < Number(machine.startMeterReading.value))
        return `A leitura final de ${machine.name} não pode ser menor que a inicial.`;
    }
    return null;
  }

  function employeeError(employees = visibleEmployees) {
    for (const employee of employees) {
      if (
        employee.attendanceStatus === "absent" ||
        employee.overtimeEnabled === false
      )
        continue;
      const entry = employeeClose[employee.employmentId];
      if (!entry?.checkIn || !entry.checkOut)
        return `Confirme a entrada e a saída de ${employee.name}.`;
      const checkIn = new Date(
        instantForEditableClock(
          day.reportDate,
          entry.checkIn,
          report.shift,
          employee.checkInAt ?? report.startedAt,
        ),
      ).getTime();
      const checkOut = new Date(
        instantForEditableClock(
          day.reportDate,
          entry.checkOut,
          report.shift,
          employee.checkOutAt,
        ),
      ).getTime();
      if (checkOut <= checkIn)
        return `A saída de ${employee.name} deve ser posterior à entrada.`;
      if (
        checkIn < new Date(report.startedAt!).getTime() ||
        checkOut > new Date(endedAt).getTime()
      )
        return `Os horários de ${employee.name} devem ficar dentro do turno.`;
      const overtime = employeeOvertimeMinutes(
        entry,
        shiftBreaks,
        day.reportDate,
        report.shift,
        report.activityWindow,
      );
      if (
        overtime > 0 &&
        employeeExceedsShiftEnd(
          entry,
          day.reportDate,
          report.shift,
          report.activityWindow,
        ) &&
        !entry.overtimeConfirmed
      )
        return `Confirme a quantidade de horas extras de ${employee.name}.`;
    }
    return null;
  }

  function shiftBreakError() {
    if (breakComposerOpen)
      return "Conclua ou cancele o novo intervalo antes de continuar.";
    if (shiftBreaks.length > 6)
      return "O turno pode ter no máximo seis intervalos.";
    const shiftStart = new Date(report.startedAt!).getTime();
    const shiftEnd = new Date(endedAt).getTime();
    const ordered = shiftBreaks
      .map((interval) =>
        shiftBreakInterval(interval, day.reportDate, report.shift),
      )
      .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
    for (const [index, interval] of ordered.entries()) {
      if (
        interval.startAt.getTime() < shiftStart ||
        interval.endAt.getTime() > shiftEnd ||
        interval.endAt <= interval.startAt ||
        (index > 0 && interval.startAt < ordered[index - 1]!.endAt)
      )
        return "Revise os intervalos do turno; eles não podem se sobrepor nem ficar fora do período trabalhado.";
    }
    return null;
  }

  function selectBreakTemplate(templateId: string | null) {
    setSelectedBreakTemplateId(templateId);
    const template = breakTemplates.find((item) => item.id === templateId);
    setBreakDraft((current) => ({
      ...current,
      name: template?.name ?? "",
      durationMinutes: template ? String(template.durationMinutes) : "",
    }));
  }

  function cancelBreakDraft() {
    setBreakComposerOpen(false);
    setSelectedBreakTemplateId(null);
    setBreakDraft({ name: "", start: "", durationMinutes: "" });
  }

  function addShiftBreak() {
    const durationMinutes = Number(breakDraft.durationMinutes);
    if (
      !breakDraft.name.trim() ||
      breakDraft.name.trim().length > 120 ||
      !breakDraft.start ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes <= 0 ||
      durationMinutes > 1440
    ) {
      setIssue("Informe nome, horário de início e duração do intervalo.");
      return;
    }
    if (shiftBreaks.length >= 6) {
      setIssue("O turno pode ter no máximo seis intervalos.");
      return;
    }
    const candidate: ShiftBreak = {
      id: `new-${nextBreakId.current++}`,
      name: breakDraft.name.trim(),
      start: breakDraft.start,
      durationMinutes,
    };
    const next = [...shiftBreaks, candidate];
    const shiftStart = new Date(report.startedAt!).getTime();
    const shiftEnd = new Date(endedAt).getTime();
    const ordered = next
      .map((interval) =>
        shiftBreakInterval(interval, day.reportDate, report.shift),
      )
      .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
    if (
      ordered.some(
        (interval, index) =>
          interval.startAt.getTime() < shiftStart ||
          interval.endAt.getTime() > shiftEnd ||
          (index > 0 && interval.startAt < ordered[index - 1]!.endAt),
      )
    ) {
      setIssue(
        "O intervalo deve ficar dentro do turno e não pode se sobrepor a outro.",
      );
      return;
    }
    setShiftBreaks(next);
    setIssue(null);
    cancelBreakDraft();
  }

  function applyEndTimeToAutomaticEntries() {
    if (endedAtTime === appliedEndTime) return;
    setEmployeeClose((current) =>
      Object.fromEntries(
        Object.entries(current).map(([employmentId, entry]) => [
          employmentId,
          {
            ...entry,
            checkOut:
              entry.checkOut === appliedEndTime ? endedAtTime : entry.checkOut,
          },
        ]),
      ),
    );
    setAppliedEndTime(endedAtTime);
  }

  function completeStep(nextStep: number) {
    setIssue(null);
    if (returnToReview) {
      setReturnToReview(false);
      setCurrentStep(4);
      return;
    }
    setCurrentStep(nextStep);
  }

  function goNext() {
    if (currentStep === 0) {
      const message = timeError() ?? shiftBreakError();
      if (message) return setIssue(message);
      applyEndTimeToAutomaticEntries();
      completeStep(1);
      return;
    }
    if (currentStep === 1) {
      const message = machineError();
      if (message) return setIssue(message);
      setIssue(null);
      if (machinePage < machinePageCount - 1) {
        setMachinePage((page) => page + 1);
        return;
      }
      completeStep(2);
      return;
    }
    if (currentStep === 2) {
      const message = employeeError();
      if (message) return setIssue(message);
      setIssue(null);
      if (employeePage < employeePageCount - 1) {
        setEmployeePage((page) => page + 1);
        return;
      }
      completeStep(3);
      return;
    }
    if (currentStep === 3) {
      if (productionsLoading || !productionSummary)
        return setIssue("Aguarde o carregamento das produções.");
      if (
        productionSummary.productions.some(
          (production) => !production.climateConditions.length,
        )
      )
        return setIssue(
          "Edite as produções sem condição climática antes de continuar.",
        );
      if (productionSummary.productions.length && !productionsConfirmed)
        return setIssue("Confirme o conjunto de produções deste turno.");
      completeStep(4);
    }
  }

  function goBack() {
    setIssue(null);
    if (returnToReview) {
      setReturnToReview(false);
      setCurrentStep(4);
      return;
    }
    if (currentStep === 1 && machinePage > 0) {
      setMachinePage((page) => page - 1);
      return;
    }
    if (currentStep === 2 && employeePage > 0) {
      setEmployeePage((page) => page - 1);
      return;
    }
    setCurrentStep((step) => Math.max(0, step - 1));
  }

  function editStep(step: number) {
    setIssue(null);
    setReturnToReview(true);
    if (step === 1) setMachinePage(0);
    if (step === 2) setEmployeePage(0);
    setCurrentStep(step);
  }

  function totalOvertimeMinutes() {
    return report.employees.reduce((total, employee) => {
      if (
        employee.attendanceStatus === "absent" ||
        employee.overtimeEnabled === false
      )
        return total;
      return (
        total +
        employeeOvertimeMinutes(
          employeeClose[employee.employmentId],
          shiftBreaks,
          day.reportDate,
          report.shift,
          report.activityWindow,
        )
      );
    }, 0);
  }

  function finalize() {
    const scheduleMessage = timeError();
    if (scheduleMessage) {
      setCurrentStep(0);
      setReturnToReview(true);
      setIssue(scheduleMessage);
      return;
    }
    const invalidMachineIndex = report.machines.findIndex((machine) =>
      Boolean(machineError([machine])),
    );
    if (invalidMachineIndex >= 0) {
      setCurrentStep(1);
      setReturnToReview(true);
      setMachinePage(Math.floor(invalidMachineIndex / MACHINE_PAGE_SIZE));
      setIssue(machineError([report.machines[invalidMachineIndex]!]));
      return;
    }
    const invalidBreaks = shiftBreakError();
    if (invalidBreaks) {
      setCurrentStep(0);
      setReturnToReview(true);
      setIssue(invalidBreaks);
      return;
    }
    const invalidEmployeeIndex = report.employees.findIndex((employee) =>
      Boolean(employeeError([employee])),
    );
    if (invalidEmployeeIndex >= 0) {
      setCurrentStep(2);
      setReturnToReview(true);
      setEmployeePage(Math.floor(invalidEmployeeIndex / EMPLOYEE_PAGE_SIZE));
      setIssue(employeeError([report.employees[invalidEmployeeIndex]!]));
      return;
    }
    if (!productionSummary) {
      setCurrentStep(3);
      setIssue("Carregue e revise as produções antes de finalizar.");
      return;
    }
    if (productionSummary.productions.length && !productionsConfirmed) {
      setCurrentStep(3);
      setIssue("Confirme o conjunto de produções deste turno.");
      return;
    }
    if (report.interferenceEntries.some((entry) => !entry.confirmedAt)) {
      setIssue("Confirme todas as interferências antes de finalizar.");
      return;
    }
    setIssue(null);
    void run(
      () =>
        closeOperationalShiftAction({
          projectId,
          reportDate: day.reportDate,
          reportId: report.id,
          data: {
            endedAt,
            earlyClosureReason: earlyClosureReason.trim() || null,
            ...(activityNotes.trim()
              ? { activityNotes: activityNotes.trim() }
              : {}),
            ...(productionSummary.productions.length === 0 &&
            fallbackClimates.length
              ? { fallbackClimateConditions: fallbackClimates }
              : {}),
            employees: report.employees.map((employee) => {
              const entry = employeeClose[employee.employmentId];
              const automatic =
                employee.attendanceStatus === "absent" ||
                employee.overtimeEnabled === false;
              const overtime = employeeOvertimeMinutes(
                entry,
                shiftBreaks,
                day.reportDate,
                report.shift,
                report.activityWindow,
              );
              const requiresOvertimeConfirmation =
                overtime > 0 &&
                employeeExceedsShiftEnd(
                  entry,
                  day.reportDate,
                  report.shift,
                  report.activityWindow,
                );
              return {
                employmentId: employee.employmentId,
                checkInAt: automatic
                  ? null
                  : instantForEditableClock(
                      day.reportDate,
                      entry.checkIn,
                      report.shift,
                      employee.checkInAt ?? report.startedAt,
                    ),
                checkOutAt: automatic
                  ? null
                  : instantForEditableClock(
                      day.reportDate,
                      entry.checkOut,
                      report.shift,
                      employee.checkOutAt,
                    ),
                breaks:
                  employee.attendanceStatus === "absent"
                    ? []
                    : shiftBreaks.map((interval) => {
                        const value = shiftBreakInterval(
                          interval,
                          day.reportDate,
                          report.shift,
                        );
                        return {
                          startAt: value.startAt.toISOString(),
                          endAt: value.endAt.toISOString(),
                        };
                      }),
                overtimeConfirmed:
                  automatic ||
                  !requiresOvertimeConfirmation ||
                  entry.overtimeConfirmed,
              };
            }),
            machines: report.machines.map((machine) => ({
              machineId: machine.machineId,
              endMeterReadingValue:
                machine.operationalCondition === "unfit"
                  ? null
                  : normalizedDecimal(machineReadings[machine.machineId]),
            })),
          },
        }),
      "Turno e RDO finalizados.",
      (message) => {
        setCurrentStep(4);
        setIssue(message);
      },
    );
  }

  const forwardLabel =
    currentStep === 1 && machinePage < machinePageCount - 1
      ? "Próximas máquinas"
      : currentStep === 2 && employeePage < employeePageCount - 1
        ? "Próximos funcionários"
        : returnToReview
          ? "Voltar à revisão"
          : "Avançar";

  const shiftBreakEditor = (
    <div className="grid gap-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-bold">Intervalos do turno</h4>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
            Aplicados a toda a equipe e descontados da jornada prevista e
            realizada.
          </p>
        </div>
        {!breakComposerOpen && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={() => setBreakComposerOpen(true)}
            disabled={shiftBreaks.length >= 6}
          >
            <Plus /> Adicionar intervalo
          </Button>
        )}
      </div>
      {shiftBreaks.length ? (
        <div className="divide-y divide-border rounded-md border border-border bg-background">
          {shiftBreaks.map((interval) => (
            <div
              key={interval.id}
              className="flex min-h-12 items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <strong className="block truncate text-sm">
                  {interval.name}
                </strong>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {interval.start}–{breakEndClock(interval)} ·{" "}
                  {formatDuration(interval.durationMinutes)}
                </span>
              </div>
              <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                aria-label={`Remover ${interval.name}`}
                onClick={() =>
                  setShiftBreaks((current) =>
                    current.filter((item) => item.id !== interval.id),
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum intervalo será descontado.
        </p>
      )}
      {breakComposerOpen && (
        <div className="grid gap-3 rounded-md border border-border bg-background p-3">
          <label className="grid gap-1 text-sm font-bold">
            Usar intervalo cadastrado
            <Select
              value={selectedBreakTemplateId}
              onValueChange={selectBreakTemplate}
            >
              <SelectTrigger
                className="min-h-11"
                aria-label="Usar intervalo cadastrado"
              >
                <SelectValue placeholder="Selecione ou crie um novo" />
              </SelectTrigger>
              <SelectContent>
                {breakTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} · {formatDuration(template.durationMinutes)}
                  </SelectItem>
                ))}
                <SelectItem value="__custom">Criar novo intervalo</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
            <label className="grid gap-1 text-sm font-bold">
              Nome
              <Input
                value={breakDraft.name}
                placeholder="Ex.: Almoço"
                maxLength={120}
                readOnly={selectedBreakTemplateId !== "__custom"}
                disabled={!selectedBreakTemplateId}
                onChange={(event) =>
                  setBreakDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Início
              <Input
                type="time"
                className="tabular-nums"
                value={breakDraft.start}
                disabled={!selectedBreakTemplateId}
                onChange={(event) =>
                  setBreakDraft((current) => ({
                    ...current,
                    start: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Duração (min)
              <Input
                type="number"
                min={1}
                max={1440}
                inputMode="numeric"
                className="tabular-nums"
                value={breakDraft.durationMinutes}
                readOnly={selectedBreakTemplateId !== "__custom"}
                disabled={!selectedBreakTemplateId}
                onChange={(event) =>
                  setBreakDraft((current) => ({
                    ...current,
                    durationMinutes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={cancelBreakDraft}>
              Cancelar
            </Button>
            <Button type="button" onClick={addShiftBreak}>
              Adicionar ao turno
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <OperationsModal
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
      preventDismissal
      size="xl"
      icon={ClipboardCheck}
      title="Finalizar turno"
      description={`Turno ${report.shift === "day" ? "diurno" : "noturno"}. Confirme horários, medidores e equipe antes do fechamento.`}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {currentStep === 0 || currentStep === 4 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={close}
              disabled={busy}
            >
              Fechar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={goBack}
              disabled={busy}
            >
              <ChevronLeft /> {returnToReview ? "Voltar à revisão" : "Voltar"}
            </Button>
          )}
          {currentStep === 4 ? (
            <Button
              type="button"
              className="min-h-11 font-bold"
              onClick={finalize}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Check />
              )}
              Confirmar e finalizar turno
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11 font-bold"
              onClick={goNext}
              disabled={busy}
            >
              {forwardLabel} <ChevronRight />
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-5" aria-busy={busy}>
        <FormWizardProgress currentStep={currentStep} steps={closeSteps} />
        <h2 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
          Etapa {currentStep + 1} de {closeSteps.length}:{" "}
          {closeSteps[currentStep]?.title}
        </h2>
        <FormErrorDeclaration
          title="Revise os dados desta etapa."
          description="Corrija o ponto indicado antes de continuar."
          issues={
            issue
              ? [
                  {
                    location: closeSteps[currentStep]?.title ?? "Fechamento",
                    message: issue,
                  },
                ]
              : []
          }
        />

        {currentStep === 0 && (
          <section className="grid gap-5">
            <div>
              <h3 className="text-lg font-bold">Horários do turno</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                O início já foi confirmado. Ajuste o encerramento se necessário;
                o excedente é recalculado automaticamente.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1 rounded-md border border-border bg-secondary/30 p-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Início confirmado
                </span>
                <strong className="text-lg tabular-nums">
                  {report.startedAt ? clock(report.startedAt) : "—"}
                </strong>
              </div>
              <label className="grid gap-1 rounded-md border border-border bg-background p-3 text-sm font-bold">
                Encerramento
                <Input
                  type="time"
                  className="min-h-11 text-base tabular-nums"
                  value={endedAtTime}
                  onChange={(event) => setEndedAtTime(event.target.value)}
                />
              </label>
              <div className="grid gap-1 rounded-md border border-border bg-secondary/30 p-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Excedente do turno
                </span>
                <strong className="text-lg tabular-nums">
                  {formatDuration(shiftExcessMinutes)}
                </strong>
              </div>
            </div>
            {isEarlyClosure && (
              <label className="grid gap-2 text-sm font-bold">
                Motivo do encerramento antecipado
                <Input
                  className="min-h-12 text-base"
                  placeholder="Explique por que o turno terminou antes do previsto"
                  value={earlyClosureReason}
                  onChange={(event) =>
                    setEarlyClosureReason(event.target.value)
                  }
                />
              </label>
            )}
            {shiftBreakEditor}
            <p className="text-sm leading-5 text-muted-foreground">
              Jornada prevista: {formatDuration(plannedMinutes)}. O excedente do
              turno é informativo; as horas extras são calculadas por pessoa.
            </p>
          </section>
        )}

        {currentStep === 1 && (
          <section className="grid gap-4">
            <BatchHeading
              title="Leituras finais"
              description="Confirme o medidor de cada máquina. A leitura final nunca pode ser menor que a inicial."
              page={machinePage}
              pageSize={MACHINE_PAGE_SIZE}
              total={report.machines.length}
            />
            {visibleMachines.length ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {visibleMachines.map((machine) => (
                  <div
                    key={machine.machineId}
                    className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center"
                  >
                    <div className="min-w-0">
                      <strong className="block break-words text-base">
                        {machine.name}
                      </strong>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {machine.meterType === "hour_meter"
                          ? "Horímetro"
                          : "Odômetro"}{" "}
                        · leitura inicial{" "}
                        <span className="tabular-nums">
                          {machine.startMeterReading.value}
                        </span>
                      </span>
                    </div>
                    {machine.operationalCondition === "unfit" ? (
                      <span className="text-sm font-bold text-muted-foreground">
                        Não apta · sem leitura final
                      </span>
                    ) : (
                      <label className="grid gap-1 text-sm font-bold">
                        Leitura final
                        <Input
                          aria-label={`Leitura final de ${machine.name}`}
                          inputMode="decimal"
                          className="min-h-11 text-base tabular-nums"
                          value={machineReadings[machine.machineId] ?? ""}
                          onChange={(event) =>
                            setMachineReadings((current) => ({
                              ...current,
                              [machine.machineId]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhuma máquina foi registrada neste turno.
              </p>
            )}
          </section>
        )}

        {currentStep === 2 && (
          <section className="grid gap-4">
            <BatchHeading
              title="Frequência e horas extras"
              description="Confirme a jornada e, quando houver excedente, a quantidade de horas extras de cada pessoa. Valores de remuneração não fazem parte deste fechamento."
              page={employeePage}
              pageSize={EMPLOYEE_PAGE_SIZE}
              total={report.employees.length}
            />
            <div className="divide-y divide-border rounded-lg border border-border">
              {visibleEmployees.map((employee) => {
                const entry = employeeClose[employee.employmentId];
                const overtime = employeeOvertimeMinutes(
                  entry,
                  shiftBreaks,
                  day.reportDate,
                  report.shift,
                  report.activityWindow,
                );
                const exceedsShiftEnd = employeeExceedsShiftEnd(
                  entry,
                  day.reportDate,
                  report.shift,
                  report.activityWindow,
                );
                return (
                  <div key={employee.employmentId} className="grid gap-4 p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div>
                        <strong className="text-base">{employee.name}</strong>
                        <p className="text-sm text-muted-foreground">
                          {employee.jobRole}
                        </p>
                      </div>
                      <span className="text-sm font-bold">
                        {employee.attendanceStatus === "absent"
                          ? "Ausente"
                          : "Presente"}
                      </span>
                    </div>
                    {employee.attendanceStatus === "absent" ? (
                      <p className="text-sm text-muted-foreground">
                        Sem marcações de jornada neste turno.
                      </p>
                    ) : employee.overtimeEnabled === false ? (
                      <div className="rounded-md bg-secondary/45 px-3 py-2 text-sm leading-5">
                        Entrada{" "}
                        {report.startedAt ? clock(report.startedAt) : "—"}
                        {" · "}saída {endedAtTime}
                        {" · "}hora extra 00:00. Marcações automáticas conforme
                        a regra da alocação.
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm font-bold">
                            Entrada
                            <Input
                              aria-label={`Entrada de ${employee.name}`}
                              type="time"
                              className="min-h-11 text-base tabular-nums"
                              value={entry?.checkIn ?? ""}
                              onChange={(event) =>
                                setEmployeeClose((current) => ({
                                  ...current,
                                  [employee.employmentId]: {
                                    ...current[employee.employmentId],
                                    checkIn: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-bold">
                            Saída
                            <Input
                              aria-label={`Saída de ${employee.name}`}
                              type="time"
                              className="min-h-11 text-base tabular-nums"
                              value={entry?.checkOut ?? ""}
                              onChange={(event) =>
                                setEmployeeClose((current) => ({
                                  ...current,
                                  [employee.employmentId]: {
                                    ...current[employee.employmentId],
                                    checkOut: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                        {overtime > 0 && exceedsShiftEnd && (
                          <label className="flex min-h-11 items-center gap-3 rounded-md bg-secondary/55 px-3 text-sm font-bold">
                            <input
                              type="checkbox"
                              className="size-5 accent-primary"
                              checked={entry?.overtimeConfirmed ?? false}
                              onChange={(event) =>
                                setEmployeeClose((current) => ({
                                  ...current,
                                  [employee.employmentId]: {
                                    ...current[employee.employmentId],
                                    overtimeConfirmed: event.target.checked,
                                  },
                                }))
                              }
                            />
                            Hora extra conferida: {formatDuration(overtime)}
                          </label>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {currentStep === 3 && (
          <section className="grid gap-5">
            <div>
              <h3 className="text-lg font-bold">Atividades executadas</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Os blocos abaixo são montados automaticamente com as produções
                do turno. Edite somente os valores que precisarem de correção.
              </p>
            </div>

            <label className="flex min-h-12 items-center gap-3 rounded-lg border border-primary/35 bg-primary/[0.04] px-4 font-bold">
              <input
                type="checkbox"
                checked
                disabled
                className="size-5 accent-primary"
              />
              Terraplanagem
              <span className="ml-auto text-xs font-semibold text-muted-foreground">
                Atividade fixa
              </span>
            </label>

            {productionsLoading ? (
              <div className="flex items-center gap-2 rounded-lg border p-4 text-sm">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                Carregando produções do turno…
              </div>
            ) : productionSummary?.productions.length ? (
              <div className="grid gap-3">
                {productionSummary.productions.map((production, index) => {
                  const front = productionOptions?.workFronts.find(
                    (item) => item.id === production.workFrontId,
                  );
                  return (
                    <article
                      key={production.id}
                      className="grid gap-4 rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            Produção {index + 1}
                          </p>
                          <h4 className="mt-1 font-bold">
                            {productionServiceLabel(production.serviceCode)}
                          </h4>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void editProduction(production.id)}
                          disabled={productionsLoading}
                        >
                          <Pencil /> Editar valores
                        </Button>
                      </div>
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <ActivityDatum
                          label="Frente"
                          value={front?.name ?? "Frente cadastrada"}
                        />
                        <ActivityDatum
                          label="Local"
                          value={production.location ?? "Não informado"}
                        />
                        <ActivityDatum
                          label="Destino"
                          value={
                            production.route?.destination ?? "Não informado"
                          }
                        />
                        <ActivityDatum
                          label="Quantidade"
                          value={`${production.officialQuantity} ${productionUnitLabel(production.unitCode)}`}
                        />
                        <ActivityDatum
                          label="Viagens"
                          value={String(production.tripCount)}
                        />
                        <ActivityDatum
                          label="Equipamentos"
                          value={String(production.equipmentCount)}
                        />
                        <ActivityDatum
                          label="Clima"
                          value={production.climateConditions
                            .map((value) => climateLabels[value])
                            .join(", ") || "Pendente"}
                        />
                      </dl>
                    </article>
                  );
                })}
                <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={productionsConfirmed}
                    onChange={(event) => {
                      setProductionsConfirmed(event.target.checked);
                      setIssue(null);
                    }}
                  />
                  Conferi e confirmo todas as produções deste turno
                </label>
              </div>
            ) : (
              <div className="grid gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <div>
                  <p className="font-bold">Turno sem produção registrada</p>
                  <p className="mt-1 text-sm leading-5">
                    O fechamento pode continuar. Se houve uma condição climática
                    relevante, informe-a abaixo.
                  </p>
                </div>
                <Choice
                  title="Condição climática (opcional)"
                  values={climateLabels}
                  selected={fallbackClimates}
                  setSelected={setFallbackClimates}
                />
              </div>
            )}

            <label className="grid gap-2 text-sm font-bold">
              Informações complementares (opcional)
              <textarea
                className="min-h-28 w-full rounded-md border border-input bg-background p-3 text-base font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                maxLength={10_000}
                value={activityNotes}
                onChange={(event) => setActivityNotes(event.target.value)}
                placeholder="Acrescente observações que não constam nas produções."
              />
            </label>
          </section>
        )}

        {currentStep === 4 && (
          <section className="grid gap-4">
            <div>
              <h3 className="text-lg font-bold">Revisão do fechamento</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Confira o resumo. Cada grupo pode ser editado sem refazer as
                outras etapas.
              </p>
            </div>
            <div className="divide-y divide-border rounded-lg border border-border bg-background">
              <ReviewBlock
                title="Horários do turno"
                editLabel="Editar horários"
                onEdit={() => editStep(0)}
              >
                <ReviewLine
                  label="Período"
                  value={`${report.startedAt ? clock(report.startedAt) : "—"}–${endedAtTime}`}
                />
                <ReviewLine
                  label="Excedente"
                  value={formatDuration(shiftExcessMinutes)}
                />
                {isEarlyClosure && (
                  <ReviewLine
                    label="Encerramento antecipado"
                    value={earlyClosureReason || "Motivo pendente"}
                  />
                )}
              </ReviewBlock>
              <ReviewBlock
                title="Medidores"
                editLabel="Editar medidores"
                onEdit={() => editStep(1)}
              >
                <ReviewLine
                  label="Leituras finais"
                  value={`${report.machines.filter((machine) => machine.operationalCondition !== "unfit").length} confirmadas`}
                />
                <ReviewLine
                  label="Sem leitura"
                  value={`${report.machines.filter((machine) => machine.operationalCondition === "unfit").length} máquinas não aptas`}
                />
              </ReviewBlock>
              <ReviewBlock
                title="Equipe"
                editLabel="Editar equipe"
                onEdit={() => editStep(2)}
              >
                <ReviewLine
                  label="Presentes"
                  value={`${report.employees.filter((employee) => employee.attendanceStatus !== "absent").length} funcionários`}
                />
                <ReviewLine
                  label="Ausentes"
                  value={`${report.employees.filter((employee) => employee.attendanceStatus === "absent").length} funcionários`}
                />
                <ReviewLine
                  label="Intervalos"
                  value={
                    shiftBreaks.length
                      ? `${shiftBreaks.length} · ${formatDuration(shiftBreaks.reduce((total, interval) => total + interval.durationMinutes, 0))}`
                      : "Nenhum"
                  }
                />
                <ReviewLine
                  label="Horas extras"
                  value={formatDuration(totalOvertimeMinutes())}
                />
              </ReviewBlock>
              <ReviewBlock
                title="Atividades executadas"
                editLabel="Editar atividades"
                onEdit={() => editStep(3)}
              >
                <ReviewLine label="Atividade" value="Terraplanagem" />
                <ReviewLine
                  label="Produções"
                  value={`${productionSummary?.productions.length ?? 0} registro(s)`}
                />
                <ReviewLine
                  label="Clima"
                  value={
                    Array.from(
                      new Set(
                        productionSummary?.productions.flatMap(
                          (production) => production.climateConditions,
                        ) ?? fallbackClimates,
                      ),
                    )
                      .map((value) => climateLabels[value])
                      .join(", ") || "Não informado"
                  }
                />
                {activityNotes.trim() && (
                  <ReviewLine
                    label="Complemento"
                    value={activityNotes.trim()}
                  />
                )}
              </ReviewBlock>
            </div>
            {report.interferenceEntries.some((entry) => !entry.confirmedAt) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-bold">Interferências pendentes</p>
                <p className="mt-1 text-sm leading-5">
                  Volte à central e confirme todos os registros antes de
                  finalizar o turno.
                </p>
              </div>
            )}
            <p className="text-sm leading-5 text-muted-foreground">
              A confirmação torna o RDO, as jornadas e os medidores imutáveis.
            </p>
          </section>
        )}
      </div>
      {editingProduction && productionOptions && (
        <ProjectProductionWizard
          contextualEntry={{
            productionDate: day.reportDate,
            shift: report.shift,
            responsibleEmploymentId: report.supervisor.employmentId,
          }}
          detail={editingProduction}
          lockActivityIdentity
          preventDismissal
          onContextChange={(productionDate, shift) =>
            getProjectProductionOptionsAction({
              projectId,
              productionDate,
              shift,
            })
          }
          onOpenChange={(open) => {
            if (!open) setEditingProduction(null);
          }}
          onSaved={() => {
            setEditingProduction(null);
            setProductionsLoading(true);
            void loadProductions();
          }}
          open
          options={productionOptions}
          projectId={projectId}
        />
      )}
    </OperationsModal>
  );
}

function BatchHeading({
  description,
  page,
  pageSize,
  title,
  total,
}: {
  description: string;
  page: number;
  pageSize: number;
  title: string;
  total: number;
}) {
  const start = total ? page * pageSize + 1 : 0;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
        {start}–{end} de {total}
      </span>
    </div>
  );
}

function ReviewBlock({
  children,
  editLabel,
  onEdit,
  title,
}: {
  children: React.ReactNode;
  editLabel: string;
  onEdit: () => void;
  title: string;
}) {
  return (
    <section className="grid gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold">{title}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          {editLabel}
        </Button>
      </div>
      <div className="grid gap-2 text-sm">{children}</div>
    </section>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function ActivityDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md bg-secondary/35 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="break-words font-semibold">{value}</dd>
    </div>
  );
}

function Choice<T extends string>({
  title,
  values,
  selected,
  setSelected,
}: {
  title: string;
  values: Record<T, string>;
  selected: T[];
  setSelected: (value: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-base font-bold">{title}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.entries(values) as Array<[T, string]>).map(
          ([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={selected.includes(value) ? "default" : "outline"}
              className="min-h-12 text-base"
              onClick={() =>
                setSelected(
                  selected.includes(value)
                    ? selected.filter((item) => item !== value)
                    : [...selected, value],
                )
              }
            >
              {label}
            </Button>
          ),
        )}
      </div>
    </fieldset>
  );
}

type EmployeeCloseState = Record<
  string,
  {
    checkIn: string;
    checkOut: string;
    overtimeConfirmed: boolean;
  }
>;
type ShiftBreak = {
  id: string;
  name: string;
  start: string;
  durationMinutes: number;
};
function localTimeValue(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function normalizedDecimal(value: string | undefined) {
  return value?.trim().replace(",", ".") ?? "";
}

function clockMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function activityWindowMinutes(window: OperationalReport["activityWindow"]) {
  return Math.max(
    0,
    clockMinutes(window.endTime) +
      window.endDayOffset * 24 * 60 -
      clockMinutes(window.startTime),
  );
}

function instantForDayOffset(
  reportDate: string,
  time: string,
  dayOffset: number,
) {
  const date = new Date(`${reportDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return `${date.toISOString().slice(0, 10)}T${time}:00-03:00`;
}

function employeeOvertimeMinutes(
  entry: EmployeeCloseState[string] | undefined,
  breaks: ShiftBreak[],
  reportDate: string,
  shift: OperationalShift,
  activityWindow: OperationalReport["activityWindow"],
) {
  if (!entry?.checkIn || !entry.checkOut) return 0;
  const checkIn = new Date(
    instantForClock(reportDate, entry.checkIn, shift),
  ).getTime();
  const checkOut = new Date(
    instantForClock(reportDate, entry.checkOut, shift),
  ).getTime();
  const intervals = breaks.map((interval) =>
    shiftBreakInterval(interval, reportDate, shift),
  );
  const breakMinutes = overlapMinutes(intervals, checkIn, checkOut);
  const workedMinutes = Math.max(
    0,
    Math.round((checkOut - checkIn) / 60_000) - breakMinutes,
  );
  const plannedStart = new Date(
    instantForClock(reportDate, activityWindow.startTime, shift),
  ).getTime();
  const plannedEnd = new Date(
    instantForDayOffset(
      reportDate,
      activityWindow.endTime,
      activityWindow.endDayOffset,
    ),
  ).getTime();
  const plannedMinutes = Math.max(
    0,
    Math.round((plannedEnd - plannedStart) / 60_000) -
      overlapMinutes(intervals, plannedStart, plannedEnd),
  );
  return Math.max(0, workedMinutes - plannedMinutes);
}

function employeeExceedsShiftEnd(
  entry: EmployeeCloseState[string] | undefined,
  reportDate: string,
  shift: OperationalShift,
  activityWindow: OperationalReport["activityWindow"],
) {
  if (!entry?.checkOut) return false;
  const checkOut = new Date(
    instantForClock(reportDate, entry.checkOut, shift),
  ).getTime();
  const plannedEnd = new Date(
    instantForDayOffset(
      reportDate,
      activityWindow.endTime,
      activityWindow.endDayOffset,
    ),
  ).getTime();
  return checkOut > plannedEnd;
}

function shiftBreakInterval(
  interval: ShiftBreak,
  reportDate: string,
  shift: OperationalShift,
) {
  const startAt = new Date(instantForClock(reportDate, interval.start, shift));
  return {
    startAt,
    endAt: new Date(startAt.getTime() + interval.durationMinutes * 60_000),
  };
}

function overlapMinutes(
  intervals: Array<{ startAt: Date; endAt: Date }>,
  windowStart: number,
  windowEnd: number,
) {
  return intervals.reduce((total, interval) => {
    const start = Math.max(interval.startAt.getTime(), windowStart);
    const end = Math.min(interval.endAt.getTime(), windowEnd);
    return total + Math.max(0, Math.round((end - start) / 60_000));
  }, 0);
}

function breakEndClock(interval: ShiftBreak) {
  const endMinutes =
    (clockMinutes(interval.start) + interval.durationMinutes) % (24 * 60);
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
}

function instantForClock(
  reportDate: string,
  time: string,
  shift: OperationalShift,
) {
  const [hour] = time.split(":").map(Number);
  const date = new Date(`${reportDate}T12:00:00Z`);
  if (shift === "night" && hour < 12) date.setUTCDate(date.getUTCDate() + 1);
  return new Date(
    `${date.toISOString().slice(0, 10)}T${time}:00-03:00`,
  ).toISOString();
}

function instantForEditableClock(
  reportDate: string,
  time: string,
  shift: OperationalShift,
  originalAt?: string | null,
) {
  if (originalAt && localTimeValue(new Date(originalAt)) === time)
    return originalAt;
  return instantForClock(reportDate, time, shift);
}

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
  PackageCheck,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Users,
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
  OperationTabPanel,
  OperationTabs,
} from "@/components/ui/operation-tabs";
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
  productionStatusLabel,
  productionUnitLabel,
} from "../production-labels";
import {
  addOperationalInterferenceAction,
  closeOperationalShiftAction,
  confirmOperationalInterferenceAction,
  recordOperationalStatusAction,
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
  OperationalEmployee,
  OperationalReport,
  OperationalStatusCommand,
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
  const [productionSummaries, setProductionSummaries] = React.useState<
    Record<
      string,
      | { kind: "loading" }
      | { kind: "failure" }
      | { kind: "success"; data: ProjectDailyReportProductionSummary }
    >
  >({});
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
  const loadProductions = React.useCallback(
    async (reportId: string) => {
      setProductionSummaries((current) => ({
        ...current,
        [reportId]: { kind: "loading" },
      }));
      try {
        const data = await getDailyReportProductionsAction(projectId, reportId);
        setProductionSummaries((current) => ({
          ...current,
          [reportId]: { kind: "success", data },
        }));
      } catch {
        setProductionSummaries((current) => ({
          ...current,
          [reportId]: { kind: "failure" },
        }));
      }
    },
    [projectId],
  );
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
    (item) => item.shift !== visibleItem.shift && item.enabled && !item.report,
  );
  const visibleRunningReport =
    visibleItem.report?.status === "draft" ? visibleItem.report : null;
  React.useEffect(() => {
    const reportId = visibleItem.report?.id;
    if (reportId && !productionSummaries[reportId])
      void loadProductions(reportId);
  }, [loadProductions, productionSummaries, visibleItem.report?.id]);
  function changeStatus(
    report: OperationalReport,
    data: OperationalStatusCommand,
  ) {
    void run(
      () =>
        recordOperationalStatusAction({
          projectId,
          reportDate: day.reportDate,
          reportId: report.id,
          data,
        }),
      "Status operacional atualizado.",
    );
  }
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
            busy={busy}
            productionState={
              visibleItem.report
                ? productionSummaries[visibleItem.report.id]
                : undefined
            }
            onAction={(kind) => setPanel({ kind, shift: visibleItem.shift })}
            onProduction={() => void openProduction(visibleItem)}
            onRetryProductions={() => {
              if (visibleItem.report)
                void loadProductions(visibleItem.report.id);
            }}
            onStatus={(data) => {
              if (visibleItem.report) changeStatus(visibleItem.report, data);
            }}
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
          onSaved={() => {
            refresh();
            const report = day.shifts.find(
              (item) => item.shift === production.shift,
            )?.report;
            if (report) void loadProductions(report.id);
          }}
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
  busy,
  productionState,
  onAction,
  onProduction,
  onRetryProductions,
  onStatus,
}: {
  item: OperationalDay["shifts"][number];
  busy: boolean;
  productionState:
    | { kind: "loading" }
    | { kind: "failure" }
    | { kind: "success"; data: ProjectDailyReportProductionSummary }
    | undefined;
  onAction: (kind: "start" | "interference" | "close") => void;
  onProduction: () => void;
  onRetryProductions: () => void;
  onStatus: (command: OperationalStatusCommand) => void;
}) {
  const [activeTab, setActiveTab] = React.useState<
    "measurements" | "employees" | "machines"
  >("measurements");
  const report = item.report;
  const running = report?.status === "draft";
  const finalized = report?.status === "finalized";
  const paused = report?.liveState?.status === "paused";
  const blockers = report
    ? [report.interferenceEntries.some((value) => !value.confirmedAt)].filter(
        Boolean,
      ).length
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
              paused={paused}
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
          <div className="space-y-6 p-5">
            {running && (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">
                    {paused ? "Turno pausado" : "Turno em execução"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {paused
                      ? "O temporizador de trabalho está congelado até a retomada."
                      : "Pause para registrar um intervalo geral da equipe."}
                  </p>
                </div>
                <Button
                  variant={paused ? "default" : "outline"}
                  className="min-h-12 font-bold"
                  disabled={busy}
                  onClick={() =>
                    onStatus({
                      type: "shift",
                      status: paused ? "working" : "paused",
                    })
                  }
                >
                  {paused ? <Play /> : <Pause />}
                  {paused ? "Retomar turno" : "Iniciar intervalo"}
                </Button>
              </div>
            )}

            {running && (
              <div className="grid grid-cols-2 gap-3 border-b border-border pb-5">
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

            <div className="space-y-4">
              <OperationTabs
                ariaLabel="Dados operacionais do turno"
                idPrefix={`operational-${item.shift}`}
                value={activeTab}
                onValueChange={setActiveTab}
                tabs={[
                  { value: "measurements", label: "Medições" },
                  {
                    value: "employees",
                    label: `Funcionários (${report.employees.length})`,
                  },
                  {
                    value: "machines",
                    label: `Máquinas (${report.machines.length})`,
                  },
                ]}
              />
              <OperationTabPanel
                idPrefix={`operational-${item.shift}`}
                value="measurements"
                activeValue={activeTab}
              >
                <ProductionOverview
                  state={productionState}
                  onRetry={onRetryProductions}
                />
              </OperationTabPanel>
              <OperationTabPanel
                idPrefix={`operational-${item.shift}`}
                value="employees"
                activeValue={activeTab}
              >
                <OperationalEmployeesTable
                  report={report}
                  readOnly={!running || busy}
                  onStatus={onStatus}
                />
              </OperationTabPanel>
              <OperationTabPanel
                idPrefix={`operational-${item.shift}`}
                value="machines"
                activeValue={activeTab}
              >
                <OperationalMachinesTable
                  report={report}
                  readOnly={!running || busy}
                  onStatus={onStatus}
                />
              </OperationTabPanel>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div>
                <p className="text-base font-bold">
                  {finalized
                    ? "Turno finalizado"
                    : blockers
                      ? `${blockers} pendência(s) para finalizar`
                      : "Operação atualizada"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Estados operacionais e intervalos ficam registrados para
                  auditoria.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function OperationalEmployeesTable({
  report,
  readOnly,
  onStatus,
}: {
  report: OperationalReport;
  readOnly: boolean;
  onStatus: (command: OperationalStatusCommand) => void;
}) {
  const finalized = report.status === "finalized";
  const [clockNow, setClockNow] = React.useState(() => Date.now());
  const [clocking, setClocking] = React.useState<{
    employee: OperationalEmployee;
    action: "start" | "end";
  } | null>(null);
  React.useEffect(() => {
    if (finalized) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [finalized]);
  const schedulePeriods = [...report.schedulePeriods].sort(
    (left, right) =>
      left.startDayOffset - right.startDayOffset ||
      left.startTime.localeCompare(right.startTime),
  );
  return (
    <section aria-labelledby="employees-title" className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <h3 id="employees-title" className="text-lg font-bold">
          Jornada dos funcionários
        </h3>
      </div>
      <div
        className="overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        tabIndex={0}
        aria-label="Tabela de jornada dos funcionários"
      >
        <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
          <thead className="bg-muted/80 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Funcionário</th>
              <th className="px-4 py-3">Faixas da jornada</th>
              <th className="px-4 py-3">Entrada</th>
              <th className="px-4 py-3">Saída</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Horas extras</th>
              <th className="px-4 py-3 text-right">Custo do turno</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.employees.map((employee) => {
              const absent = employee.attendanceStatus === "absent";
              const clockStatus =
                employee.timeClock?.status ??
                (employee.liveState?.status === "stopped"
                  ? "stopped"
                  : "running");
              const totalMinutes =
                (employee.regularWorkedMinutes ?? 0) +
                (employee.overtimeMinutes ?? 0);
              return (
                <tr key={employee.employmentId} className="align-top">
                  <td className="px-4 py-4">
                    <div className="min-w-52">
                      <p className="font-bold text-foreground">
                        {employee.name}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {employee.jobRole}
                      </p>
                      <div className="mt-3">
                        {absent ? (
                          <StatusBadge status="unfit" label="Ausente" />
                        ) : finalized ? (
                          <StatusBadge status="closed" label="Encerrado" />
                        ) : (
                          <Button
                            variant={
                              clockStatus === "running" ? "outline" : "default"
                            }
                            className="min-h-11 font-bold"
                            disabled={readOnly}
                            onClick={() =>
                              setClocking({
                                employee,
                                action:
                                  clockStatus === "running" ? "end" : "start",
                              })
                            }
                          >
                            {clockStatus === "running" ? <Pause /> : <Play />}
                            {clockStatus === "running"
                              ? "Terminar horário"
                              : "Iniciar horário"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-60 flex-wrap items-center gap-1.5 tabular-nums">
                      {schedulePeriods.map((period, index) => (
                        <React.Fragment
                          key={`${period.startDayOffset}-${period.startTime}-${period.endTime}`}
                        >
                          {index > 0 && (
                            <span
                              aria-hidden="true"
                              className="text-muted-foreground"
                            >
                              →
                            </span>
                          )}
                          <span className="rounded-md bg-secondary px-2.5 py-1 font-semibold text-secondary-foreground">
                            {period.startTime}–{period.endTime}
                            {period.endDayOffset > period.startDayOffset
                              ? " +1 dia"
                              : ""}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </td>
                  <TableValue>
                    {absent
                      ? "—"
                      : employee.checkInAt
                        ? clock(employee.checkInAt)
                        : "—"}
                  </TableValue>
                  <TableValue>
                    {absent
                      ? "—"
                      : finalized
                        ? employee.checkOutAt
                          ? clock(employee.checkOutAt)
                          : "—"
                        : "Em andamento"}
                  </TableValue>
                  <TableValue>
                    {absent
                      ? "00:00"
                      : finalized
                        ? formatDuration(totalMinutes)
                        : formatDuration(
                            currentClockMinutes(employee, report, clockNow),
                          )}
                  </TableValue>
                  <TableValue>
                    {absent
                      ? "00:00"
                      : finalized
                        ? formatDuration(employee.overtimeMinutes ?? 0)
                        : "A consolidar"}
                  </TableValue>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-extrabold tabular-nums">
                    {absent && finalized
                      ? formatCurrencyBrl("0.00")
                      : finalized
                        ? employee.shiftCostBrl !== null &&
                          employee.shiftCostBrl !== undefined
                          ? formatCurrencyBrl(employee.shiftCostBrl)
                          : "Não disponível"
                        : "A consolidar"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {clocking && (
        <EmployeeTimeClockDialog
          employee={clocking.employee}
          report={report}
          action={clocking.action}
          onClose={() => setClocking(null)}
          onConfirm={(occurredAt) => {
            onStatus({
              type: "employee",
              employmentId: clocking.employee.employmentId,
              action: clocking.action,
              occurredAt,
            });
            setClocking(null);
          }}
        />
      )}
    </section>
  );
}

function EmployeeTimeClockDialog({
  employee,
  report,
  action,
  onClose,
  onConfirm,
}: {
  employee: OperationalEmployee;
  report: OperationalReport;
  action: "start" | "end";
  onClose: () => void;
  onConfirm: (occurredAt: string) => void;
}) {
  const now = React.useMemo(() => new Date(), []);
  const minimum = new Date(
    Math.max(
      new Date(report.startedAt ?? now).getTime(),
      new Date(employee.timeClock?.lastMarkedAt ?? report.startedAt ?? now).getTime(),
    ),
  );
  const [value, setValue] = React.useState(() => dateTimeLocalValue(now));
  const invalid =
    !value ||
    value < dateTimeLocalValue(minimum) ||
    value > dateTimeLocalValue(now);
  const verb = action === "start" ? "Iniciar" : "Terminar";
  return (
    <OperationsModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      preventDismissal
      size="md"
      icon={Clock3}
      title={`${verb} horário`}
      description={`${employee.name}: confirme a data e a hora desta marcação.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={invalid} onClick={() => onConfirm(instantForDateTime(value))}>
            {verb} horário
          </Button>
        </>
      }
    >
      <label className="grid gap-2 text-sm font-bold">
        Data e hora
        <Input
          aria-label={`Data e hora para ${verb.toLowerCase()} horário de ${employee.name}`}
          type="datetime-local"
          min={dateTimeLocalValue(minimum)}
          max={dateTimeLocalValue(now)}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-12 bg-background text-base tabular-nums"
        />
      </label>
      <p className="mt-3 text-sm leading-5 text-muted-foreground">
        Escolha um horário entre a última marcação e agora. O ponto usa o fuso
        horário da obra.
      </p>
    </OperationsModal>
  );
}

function currentClockMinutes(
  employee: OperationalEmployee,
  report: OperationalReport,
  now: number,
) {
  const base = employee.timeClock?.workedMinutes ?? 0;
  if (
    employee.timeClock?.status !== "running" ||
    report.liveState?.status === "paused" ||
    !employee.timeClock.calculatedAt
  )
    return base;
  return base + Math.max(0, Math.floor((now - new Date(employee.timeClock.calculatedAt).getTime()) / 60_000));
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
        status === "unfit" && "bg-red-100 text-red-800",
        status === "closed" && "bg-slate-200 text-slate-800",
      )}
    >
      {label}
    </span>
  );
}

function TableValue({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-4 font-semibold tabular-nums">
      {children}
    </td>
  );
}

function OperationalMachinesTable({
  report,
  readOnly,
  onStatus,
}: {
  report: OperationalReport;
  readOnly: boolean;
  onStatus: (command: OperationalStatusCommand) => void;
}) {
  const finalized = report.status === "finalized";

  return (
    <section aria-labelledby="machines-title" className="space-y-3">
      <div className="flex items-center gap-2">
        <Wrench className="size-5 text-primary" />
        <h3 id="machines-title" className="text-lg font-bold">
          Máquinas do turno
        </h3>
      </div>
      <div
        className="overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        tabIndex={0}
        aria-label="Tabela de máquinas do turno"
      >
        <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
          <thead className="bg-muted/80 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Máquina</th>
              <th className="px-4 py-3">Medidor</th>
              <th className="px-4 py-3">Condição</th>
              <th className="px-4 py-3">Status operacional</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.machines.map((machine) => {
              const unfit = machine.operationalCondition === "unfit";
              const status = unfit
                ? "unfit"
                : finalized
                  ? "closed"
                  : (machine.liveState?.status ?? "working");
              return (
                <tr key={machine.machineId} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-bold">{machine.name}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {machine.manufacturer} · {machine.model}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                    <p className="font-semibold">
                      {machine.meterType === "hour_meter"
                        ? "Horímetro"
                        : "Odômetro"}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {machine.startMeterReading.value}
                      {report.status === "finalized" &&
                      machine.operationalCondition !== "unfit"
                        ? ` → ${machine.endMeterReading?.value ?? "—"}`
                        : ""}
                    </p>
                  </td>
                  <td className="max-w-64 px-4 py-4">
                    <p className="font-semibold">
                      {unfit ? "Não apta" : "Apta"}
                    </p>
                    {machine.conditionNote && (
                      <p className="mt-0.5 text-muted-foreground">
                        {machine.conditionNote}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <ResourceStatusControl
                      name={machine.name}
                      status={status}
                      statuses={[
                        ["working", "Em trabalho"],
                        ["stopped", "Parada"],
                        ["maintenance", "Manutenção"],
                      ]}
                      readOnly={readOnly || unfit}
                      fixedLabel={
                        unfit
                          ? "Não apta"
                          : finalized
                            ? "Encerrado"
                            : undefined
                      }
                      onChange={(next) =>
                        onStatus({
                          type: "machine",
                          machineId: machine.machineId,
                          status: next as
                            | "working"
                            | "stopped"
                            | "maintenance",
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResourceStatusControl({
  name,
  status,
  statuses,
  readOnly,
  fixedLabel,
  onChange,
}: {
  name: string;
  status: string;
  statuses: Array<[string, string]>;
  readOnly: boolean;
  fixedLabel?: string;
  onChange: (status: string) => void;
}) {
  const activeLabel =
    fixedLabel ?? statuses.find(([value]) => value === status)?.[1] ?? status;
  return (
    <div className="min-w-64">
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
          status === "working" && "bg-emerald-100 text-emerald-800",
          status === "stopped" && "bg-slate-200 text-slate-800",
          status === "maintenance" && "bg-amber-100 text-amber-900",
          status === "unfit" && "bg-red-100 text-red-800",
          status === "closed" && "bg-slate-200 text-slate-800",
        )}
      >
        {activeLabel}
      </span>
      {!readOnly && (
        <div
          className="mt-2 flex flex-wrap gap-2"
          role="group"
          aria-label={`Status de ${name}`}
        >
          {statuses.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={status === value ? "secondary" : "outline"}
              className="min-h-10 flex-1 px-2 text-xs font-bold"
              aria-pressed={status === value}
              disabled={status === value}
              onClick={() => onChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductionOverview({
  state,
  onRetry,
}: {
  state:
    | { kind: "loading" }
    | { kind: "failure" }
    | { kind: "success"; data: ProjectDailyReportProductionSummary }
    | undefined;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="productions-title">
      <div className="flex items-center gap-2">
        <PackageCheck className="size-5 text-primary" />
        <h3 id="productions-title" className="text-lg font-bold">
          Produções realizadas
        </h3>
      </div>
      {!state || state.kind === "loading" ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando produções…
        </div>
      ) : state.kind === "failure" ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-red-800">
            Não foi possível carregar as produções. Os demais dados continuam
            disponíveis.
          </p>
          <Button variant="outline" className="min-h-10" onClick={onRetry}>
            <RefreshCw /> Tentar novamente
          </Button>
        </div>
      ) : state.data.productions.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {state.data.productions.map((production) => (
            <article
              key={production.id}
              className="rounded-lg border border-border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">
                  {productionServiceLabel(production.serviceCode)}
                </p>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-bold">
                  {productionStatusLabel(production.status)}
                </span>
              </div>
              <p className="mt-2 text-lg font-extrabold tabular-nums">
                {production.officialQuantity}{" "}
                {productionUnitLabel(production.unitCode)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {production.location ?? "Local não informado"} ·{" "}
                {production.tripCount} viagem(ns) · {production.equipmentCount}{" "}
                equipamento(s)
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm font-medium text-muted-foreground">
          Nenhuma produção registrada neste turno.
        </p>
      )}
    </section>
  );
}

function Status({
  running,
  finalized,
  enabled,
  paused,
}: {
  running: boolean;
  finalized: boolean;
  enabled: boolean;
  paused: boolean;
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
          ? paused
            ? "Em intervalo"
            : "Em andamento"
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

function formatCurrencyBrl(value: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
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
  const [earlyClosureReason, setEarlyClosureReason] = React.useState("");
  const [employeeClose, setEmployeeClose] = React.useState<EmployeeCloseState>(
    () =>
      Object.fromEntries(
        report.employees.map((employee) => [
          employee.employmentId,
          {
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
        Math.max(
          0,
          (employee.timeClock?.workedMinutes ?? 0) - plannedMinutes,
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
            employees: report.employees.map((employee) => ({
              employmentId: employee.employmentId,
              overtimeConfirmed:
                employee.attendanceStatus === "absent" ||
                employee.overtimeEnabled === false ||
                employeeClose[employee.employmentId]?.overtimeConfirmed === true,
            })),
            breaks: shiftBreaks.map((interval) => {
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
              description="A jornada é calculada pelas marcações de ponto. Confirme apenas a hora extra quando ela se aplicar."
              page={employeePage}
              pageSize={EMPLOYEE_PAGE_SIZE}
              total={report.employees.length}
            />
            <div className="divide-y divide-border rounded-lg border border-border">
              {visibleEmployees.map((employee) => {
                const entry = employeeClose[employee.employmentId];
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
                    ) : (
                      <>
                        <div className="rounded-md bg-secondary/45 px-3 py-2 text-sm leading-5">
                          {employee.timeClock?.status === "stopped"
                            ? "Horário encerrado"
                            : "Horário em andamento"}
                          {" · total registrado até agora: "}
                          <strong className="tabular-nums">
                            {formatDuration(employee.timeClock?.workedMinutes ?? 0)}
                          </strong>
                        </div>
                        {employee.overtimeEnabled !== false && (
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
                            Confirmo as horas extras calculadas pelo ponto, se houver.
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
                          value={
                            production.climateConditions
                              .map((value) => climateLabels[value])
                              .join(", ") || "Pendente"
                          }
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

function dateTimeLocalValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

function instantForDateTime(value: string) {
  return new Date(`${value}:00-03:00`).toISOString();
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

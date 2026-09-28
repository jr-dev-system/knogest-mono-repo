"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardCheck,
  Fuel,
  Gauge,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addOperationalInterferenceAction,
  closeOperationalShiftAction,
  confirmOperationalInterferenceAction,
  saveOperationalRdoAction,
  startOperationalShiftAction,
} from "../operational-day.actions";
import { getProjectProductionOptionsAction } from "../productions.actions";
import type {
  OperationalDay,
  OperationalResult,
  OperationalShift,
} from "../operational-day.types";
import type { ProjectProductionOptions } from "../productions.types";
import { ProjectProductionWizard } from "./project-production-wizard";

const activityLabels = {
  earthworks: "Terraplanagem",
  drainage: "Drenagem",
  paving: "Pavimentação",
};
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
  const [panel, setPanel] = React.useState<{
    kind: "start" | "rdo" | "interference" | "close";
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
  ): Promise<void> {
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (result.kind === "failure") {
      toast.error(result.message);
      return;
    }
    setDay(result.day);
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
        <div className="grid gap-4 xl:grid-cols-2">
          {day.shifts.map((item) => (
            <ShiftLane
              key={item.shift}
              item={item}
              onAction={(kind) => setPanel({ kind, shift: item.shift })}
              onProduction={() => void openProduction(item)}
            />
          ))}
        </div>
        {day.shifts.some((item) => item.report?.status === "draft") && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
            <div className="border-y border-border py-5">
              <h2 className="text-lg font-bold">Agora na obra</h2>
              <p className="mt-1 text-base text-muted-foreground">
                Interferências e registros dos turnos em andamento.
              </p>
              <div className="mt-4 divide-y divide-border">
                {day.shifts
                  .flatMap((item) => item.report?.interferenceEntries ?? [])
                  .map((entry) => (
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
                            const report = day.shifts.find((shift) =>
                              shift.report?.interferenceEntries.some(
                                (value) => value.id === entry.id,
                              ),
                            )!.report!;
                            void run(
                              () =>
                                confirmOperationalInterferenceAction({
                                  projectId,
                                  reportDate: day.reportDate,
                                  reportId: report.id,
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
                  ))}
              </div>
            </div>
            <div className="rounded-xl bg-secondary/55 p-5">
              <h2 className="text-lg font-bold">Próximo passo</h2>
              <p className="mt-2 text-base leading-6 text-secondary-foreground">
                Complete os dados do RDO, confirme as interferências e revise
                frequência e medidores antes de finalizar.
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
  onAction: (kind: "start" | "rdo" | "interference" | "close") => void;
  onProduction: () => void;
}) {
  const report = item.report;
  const running = report?.status === "draft";
  const finalized = report?.status === "finalized";
  const blockers = report
    ? [
        !report.activityTypes.length,
        !report.climateConditions.length,
        !report.executedActivities,
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
            <h2 className="text-xl font-bold">
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
              {["Equipe", "Máquinas", "Operação", "RDO", "Fechamento"].map(
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
              {running && (
                <Button
                  variant="outline"
                  className="min-h-12 text-base"
                  onClick={() => onAction("rdo")}
                >
                  <ClipboardCheck />
                  Completar RDO
                </Button>
              )}
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
    kind: "start" | "rdo" | "interference" | "close";
    shift: OperationalShift;
  };
  busy: boolean;
  close: () => void;
  run: (
    work: () => Promise<OperationalResult>,
    success: string,
  ) => Promise<void>;
}) {
  const item = day.shifts.find((value) => value.shift === panel.shift)!;
  const report = item.report;
  const options = item.options!;
  const [activities, setActivities] = React.useState<
    Array<keyof typeof activityLabels>
  >((report?.activityTypes ?? []) as Array<keyof typeof activityLabels>);
  const [climates, setClimates] = React.useState<
    Array<keyof typeof climateLabels>
  >((report?.climateConditions ?? []) as Array<keyof typeof climateLabels>);
  const [narrative, setNarrative] = React.useState(
    report?.executedActivities ?? "",
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
  const now = new Date().toISOString();
  const [endedAtTime, setEndedAtTime] = React.useState(
    localTimeValue(new Date()),
  );
  const [earlyClosureReason, setEarlyClosureReason] = React.useState("");
  const [employeeClose, setEmployeeClose] = React.useState<
    Record<
      string,
      {
        checkIn: string;
        checkOut: string;
        overtimeConfirmed: boolean;
        breaks: Array<{ start: string; end: string }>;
      }
    >
  >(() =>
    Object.fromEntries(
      (report?.employees ?? []).map((value) => [
        value.employmentId,
        {
          checkIn: value.checkInAt
            ? localTimeValue(new Date(value.checkInAt))
            : "",
          checkOut: localTimeValue(new Date()),
          overtimeConfirmed: value.overtimeConfirmed ?? false,
          breaks:
            value.breaks?.map((item) => ({
              start: localTimeValue(new Date(item.startAt)),
              end: localTimeValue(new Date(item.endAt)),
            })) ?? [],
        },
      ]),
    ),
  );
  const [machineReadings, setMachineReadings] = React.useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      (report?.machines ?? []).map((value) => [
        value.machineId,
        value.endMeterReading?.value ?? value.startMeterReading.value,
      ]),
    ),
  );
  const operationalStart = item.suggestedStartedAt ?? now;
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
                : panel.kind === "rdo"
                  ? "Dados do RDO"
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
            <Button
              className="min-h-14 w-full text-base font-bold"
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
                        conditionNote: fit[value.id] ? null : notes[value.id],
                      })),
                    }),
                  "Turno iniciado e RDO criado em rascunho.",
                )
              }
            >
              Confirmar checklists e iniciar
            </Button>
          </div>
        )}
        {panel.kind === "rdo" && report && (
          <div className="mt-6 space-y-5">
            <Choice
              title="Atividades executadas"
              values={activityLabels}
              selected={activities}
              setSelected={setActivities}
            />
            <Choice
              title="Condições climáticas"
              values={climateLabels}
              selected={climates}
              setSelected={setClimates}
            />
            <label className="block text-base font-bold">
              Resumo das atividades
              <textarea
                className="mt-2 min-h-32 w-full rounded-md border border-input bg-background p-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                value={narrative}
                onChange={(event) => setNarrative(event.target.value)}
              />
            </label>
            <Button
              className="min-h-14 w-full text-base font-bold"
              disabled={
                busy ||
                !activities.length ||
                !climates.length ||
                !narrative.trim()
              }
              onClick={() =>
                void run(
                  () =>
                    saveOperationalRdoAction({
                      projectId,
                      reportDate: day.reportDate,
                      reportId: report.id,
                      data: {
                        schedulePeriods: report.schedulePeriods,
                        activityStartTime: report.activityWindow.startTime,
                        activityEndTime: report.activityWindow.endTime,
                        activityEndDayOffset:
                          report.activityWindow.endDayOffset,
                        activityTypes: activities,
                        climateConditions: climates,
                        dailyRainfallMm: report.rainfall.dailyMm,
                        monthlyRainfallMm: report.rainfall.monthlyMm,
                        supervisorEmploymentId: report.supervisor.employmentId,
                        technicalResponsibilityEmploymentIds:
                          report.technicalResponsibilities.map(
                            (value) => value.employmentId,
                          ),
                        executedActivities: narrative,
                      },
                    }),
                  "Dados do RDO salvos.",
                )
              }
            >
              Salvar dados do RDO
            </Button>
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
        {panel.kind === "close" && report && (
          <div className="mt-6 space-y-6">
            <div className="rounded-lg bg-secondary/55 p-4 text-base">
              <p className="font-bold">Prévia do fechamento</p>
              <p className="mt-2">
                {
                  report.employees.filter(
                    (value) => value.attendanceStatus !== "absent",
                  ).length
                }{" "}
                funcionários presentes,{" "}
                {
                  report.machines.filter(
                    (value) => value.operationalCondition !== "unfit",
                  ).length
                }{" "}
                máquinas aptas e {report.interferenceEntries.length}{" "}
                interferência(s).
              </p>
            </div>
            <fieldset>
              <legend className="text-lg font-bold">Frequência e horas</legend>
              <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                {report.employees.map((employee) => (
                  <div key={employee.employmentId} className="space-y-3 p-4">
                    <div>
                      <strong className="text-base">{employee.name}</strong>
                      <p className="text-sm text-muted-foreground">
                        {employee.jobRole} ·{" "}
                        {employee.attendanceStatus === "absent"
                          ? "Ausente"
                          : "Presente"}
                      </p>
                    </div>
                    {employee.attendanceStatus !== "absent" && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm font-bold">
                            Entrada
                            <Input
                              type="time"
                              className="mt-1 min-h-12 text-base"
                              value={
                                employeeClose[employee.employmentId]?.checkIn ??
                                ""
                              }
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
                          <label className="text-sm font-bold">
                            Saída
                            <Input
                              type="time"
                              className="mt-1 min-h-12 text-base"
                              value={
                                employeeClose[employee.employmentId]
                                  ?.checkOut ?? ""
                              }
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
                        <div className="space-y-2">
                          {employeeClose[employee.employmentId]?.breaks.map(
                            (interval, index) => (
                              <div
                                key={index}
                                className="grid grid-cols-[1fr_1fr_auto] gap-2"
                              >
                                <Input
                                  aria-label={`Início do intervalo de ${employee.name}`}
                                  type="time"
                                  className="min-h-12 text-base"
                                  value={interval.start}
                                  onChange={(event) =>
                                    updateBreak(
                                      setEmployeeClose,
                                      employee.employmentId,
                                      index,
                                      "start",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Input
                                  aria-label={`Fim do intervalo de ${employee.name}`}
                                  type="time"
                                  className="min-h-12 text-base"
                                  value={interval.end}
                                  onChange={(event) =>
                                    updateBreak(
                                      setEmployeeClose,
                                      employee.employmentId,
                                      index,
                                      "end",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Button
                                  type="button"
                                  size="icon-lg"
                                  variant="ghost"
                                  aria-label="Remover intervalo"
                                  onClick={() =>
                                    removeBreak(
                                      setEmployeeClose,
                                      employee.employmentId,
                                      index,
                                    )
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            ),
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() =>
                              addBreak(setEmployeeClose, employee.employmentId)
                            }
                          >
                            <Plus />
                            Intervalo
                          </Button>
                          <label className="flex min-h-11 items-center gap-2 rounded-md border border-input px-3 text-sm font-bold">
                            <input
                              type="checkbox"
                              className="size-5 accent-primary"
                              checked={
                                employeeClose[employee.employmentId]
                                  ?.overtimeConfirmed ?? false
                              }
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
                            Horas extras conferidas
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-lg font-bold">
                Marcação final das máquinas
              </legend>
              <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                {report.machines.map((machine) => (
                  <label
                    key={machine.machineId}
                    className="grid gap-3 p-4 sm:grid-cols-[1fr_12rem] sm:items-center"
                  >
                    <span>
                      <strong className="block text-base">
                        {machine.name}
                      </strong>
                      <span className="text-sm text-muted-foreground">
                        Inicial: {machine.startMeterReading.value} ·{" "}
                        {machine.operationalCondition === "unfit"
                          ? "Não apta"
                          : machine.meterType === "hour_meter"
                            ? "Horímetro"
                            : "Odômetro"}
                      </span>
                    </span>
                    {machine.operationalCondition !== "unfit" && (
                      <Input
                        inputMode="decimal"
                        className="min-h-12 text-base"
                        value={machineReadings[machine.machineId] ?? ""}
                        onChange={(event) =>
                          setMachineReadings((current) => ({
                            ...current,
                            [machine.machineId]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            {report.interferenceEntries.some((entry) => !entry.confirmedAt) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-bold">
                  Confirme todas as interferências antes de finalizar.
                </p>
                <p className="mt-1 text-sm">
                  Volte ao painel para revisar{" "}
                  {
                    report.interferenceEntries.filter(
                      (entry) => !entry.confirmedAt,
                    ).length
                  }{" "}
                  registro(s) pendente(s).
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-base font-bold">
                Horário de encerramento
                <Input
                  type="time"
                  className="mt-2 min-h-12 text-base"
                  value={endedAtTime}
                  onChange={(event) => setEndedAtTime(event.target.value)}
                />
              </label>
              <label className="block text-base font-bold">
                Motivo de encerramento antecipado
                <Input
                  className="mt-2 min-h-12 text-base"
                  placeholder="Obrigatório se encerrar antes do previsto"
                  value={earlyClosureReason}
                  onChange={(event) =>
                    setEarlyClosureReason(event.target.value)
                  }
                />
              </label>
            </div>
            <p className="text-base leading-6 text-muted-foreground">
              A confirmação torna o RDO, os horários e os medidores imutáveis.
            </p>
            <Button
              className="min-h-14 w-full text-base font-bold"
              disabled={
                busy ||
                report.interferenceEntries.some(
                  (entry) => !entry.confirmedAt,
                ) ||
                report.employees.some(
                  (employee) =>
                    employee.attendanceStatus !== "absent" &&
                    (!employeeClose[employee.employmentId]?.checkIn ||
                      !employeeClose[employee.employmentId]?.checkOut ||
                      !employeeClose[employee.employmentId]?.overtimeConfirmed),
                ) ||
                report.machines.some(
                  (machine) =>
                    machine.operationalCondition !== "unfit" &&
                    !machineReadings[machine.machineId],
                )
              }
              onClick={() => {
                const endedAt = instantForClock(
                  day.reportDate,
                  endedAtTime,
                  panel.shift,
                );
                void run(
                  () =>
                    closeOperationalShiftAction({
                      projectId,
                      reportDate: day.reportDate,
                      reportId: report.id,
                      data: {
                        endedAt,
                        earlyClosureReason: earlyClosureReason || null,
                        employees: report.employees.map((value) => ({
                          employmentId: value.employmentId,
                          checkInAt:
                            value.attendanceStatus === "absent"
                              ? null
                              : instantForClock(
                                  day.reportDate,
                                  employeeClose[value.employmentId].checkIn,
                                  panel.shift,
                                ),
                          checkOutAt:
                            value.attendanceStatus === "absent"
                              ? null
                              : instantForClock(
                                  day.reportDate,
                                  employeeClose[value.employmentId].checkOut,
                                  panel.shift,
                                ),
                          breaks:
                            value.attendanceStatus === "absent"
                              ? []
                              : employeeClose[value.employmentId].breaks
                                  .filter(
                                    (interval) =>
                                      interval.start && interval.end,
                                  )
                                  .map((interval) => ({
                                    startAt: instantForClock(
                                      day.reportDate,
                                      interval.start,
                                      panel.shift,
                                    ),
                                    endAt: instantForClock(
                                      day.reportDate,
                                      interval.end,
                                      panel.shift,
                                    ),
                                  })),
                          overtimeConfirmed:
                            value.attendanceStatus === "absent" ||
                            employeeClose[value.employmentId].overtimeConfirmed,
                        })),
                        machines: report.machines.map((value) => ({
                          machineId: value.machineId,
                          endMeterReadingValue:
                            value.operationalCondition === "unfit"
                              ? null
                              : machineReadings[value.machineId],
                        })),
                      },
                    }),
                  "Turno e RDO finalizados.",
                );
              }}
            >
              Confirmar e finalizar turno
            </Button>
          </div>
        )}
      </section>
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
    breaks: Array<{ start: string; end: string }>;
  }
>;
type EmployeeCloseSetter = React.Dispatch<
  React.SetStateAction<EmployeeCloseState>
>;
function addBreak(setState: EmployeeCloseSetter, employmentId: string) {
  setState((current) => ({
    ...current,
    [employmentId]: {
      ...current[employmentId],
      breaks: [...current[employmentId].breaks, { start: "", end: "" }],
    },
  }));
}
function removeBreak(
  setState: EmployeeCloseSetter,
  employmentId: string,
  index: number,
) {
  setState((current) => ({
    ...current,
    [employmentId]: {
      ...current[employmentId],
      breaks: current[employmentId].breaks.filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    },
  }));
}
function updateBreak(
  setState: EmployeeCloseSetter,
  employmentId: string,
  index: number,
  field: "start" | "end",
  value: string,
) {
  setState((current) => ({
    ...current,
    [employmentId]: {
      ...current[employmentId],
      breaks: current[employmentId].breaks.map((interval, currentIndex) =>
        currentIndex === index ? { ...interval, [field]: value } : interval,
      ),
    },
  }));
}
function localTimeValue(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
function instantForClock(
  reportDate: string,
  time: string,
  shift: OperationalShift,
) {
  const [hour] = time.split(":").map(Number);
  const date = new Date(`${reportDate}T12:00:00Z`);
  if (shift === "night" && hour < 12) date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)}T${time}:00-03:00`;
}

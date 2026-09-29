"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
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
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { FormWizardProgress } from "@/components/ui/form-wizard-progress";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";
import { cn } from "@/lib/utils";
import { productionServiceLabel, productionUnitLabel } from "../production-labels";
import { configureZodPortugueseErrors } from "@/lib/zod-locale";
import {
  finalizeProjectDailyReportAction,
  getMoreProjectDailyReportsAction,
  getProjectDailyReportAction,
  getProjectDailyReportOptionsAction,
  saveProjectDailyReportAction,
} from "../daily-reports.actions";
import { buildProjectDailyReportMessage } from "../daily-report-message";
import type {
  ProjectDailyReportCommand,
  ProjectDailyReportDetail,
  ProjectDailyReportOptions,
  ProjectDailyReportsPage,
  ProjectDailyReportSummary,
} from "../daily-reports.types";
import { copyTextToClipboard } from "../copy-to-clipboard";
import {
  confirmDailyReportProductionsAction,
  getShiftProjectProductionsAction,
} from "../productions.actions";
import type { ProjectProductionSummary } from "../productions.types";

const time = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d$/u,
    "Informe um horário no formato HH:MM.",
  );
const duration = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "Informe a duração no formato HH:MM.");
const decimal = z
  .string()
  .trim()
  .regex(/^\d{1,8}(?:[,.]\d{1,2})?$/u, "Informe um valor não negativo.");
const formSchema = z
  .object({
    reportDate: z.iso.date(),
    shift: z.enum(["day", "night"]),
    schedulePeriods: z
      .array(
        z.object({
          startTime: time,
          endTime: time,
          startDayOffset: z.number().int().min(0).max(1),
          endDayOffset: z.number().int().min(0).max(1),
        }),
      )
      .min(1)
      .max(6),
    activityStartTime: time,
    activityEndTime: time,
    activityEndDayOffset: z.number().int().min(0).max(1),
    activityTypes: z
      .array(z.enum(["earthworks", "drainage", "paving"]))
      .min(1, "Selecione ao menos uma atividade."),
    climateConditions: z
      .array(z.enum(["rain", "dry", "waterlogged_soil"]))
      .min(1, "Selecione ao menos uma condição climática."),
    dailyRainfallMm: decimal,
    monthlyRainfallMm: decimal,
    supervisorEmploymentId: z.string().uuid("Selecione o supervisor."),
    technicalResponsibilityEmploymentIds: z
      .array(z.string().uuid())
      .min(1, "Selecione ao menos um responsável técnico."),
    employees: z
      .array(
        z.object({
          employmentId: z.string().uuid(),
          completedFullShift: z.boolean(),
          regularDuration: duration,
          overtimeDuration: duration,
        }),
      )
      .min(1, "Selecione ao menos um participante."),
    machines: z.array(
      z.object({
        machineId: z.string().uuid(),
        endMeterReadingValue: decimal,
      }),
    ),
    executedActivities: z
      .string()
      .trim()
      .min(1, "Descreva os serviços executados.")
      .max(10_000),
    interferences: z.string().trim().max(10_000),
  })
  .superRefine((values, context) => {
    const periods = values.schedulePeriods.map((period) => ({
      start: period.startDayOffset * 1440 + clockMinutes(period.startTime),
      end: period.endDayOffset * 1440 + clockMinutes(period.endTime),
    }));
    periods.forEach((period, index) => {
      if (period.end <= period.start)
        context.addIssue({
          code: "custom",
          path: ["schedulePeriods", index, "endTime"],
          message: "A faixa deve terminar depois do início.",
        });
      if (period.end - period.start > 1440)
        context.addIssue({
          code: "custom",
          path: ["schedulePeriods", index, "endTime"],
          message: "A faixa não pode ultrapassar 24 horas.",
        });
      if (index > 0 && period.start < periods[index - 1]!.end)
        context.addIssue({
          code: "custom",
          path: ["schedulePeriods", index, "startTime"],
          message: "As faixas devem estar ordenadas e não podem se sobrepor.",
        });
    });
    if (values.shift === "day" && values.activityEndDayOffset !== 0)
      context.addIssue({
        code: "custom",
        path: ["activityEndDayOffset"],
        message: "O turno diurno deve terminar na data do RDO.",
      });
    const activityStart = clockMinutes(values.activityStartTime);
    const inferredOffset =
      values.shift === "night" &&
      values.activityEndDayOffset === 0 &&
      clockMinutes(values.activityEndTime) <= activityStart
        ? 1
        : values.activityEndDayOffset;
    const activityEnd =
      inferredOffset * 1440 + clockMinutes(values.activityEndTime);
    if (activityEnd <= activityStart || activityEnd - activityStart > 1440)
      context.addIssue({
        code: "custom",
        path: ["activityEndTime"],
        message: "A janela efetiva deve ser positiva e ter no máximo 24 horas.",
      });
    values.employees.forEach((employee, index) => {
      const worked =
        durationMinutes(employee.regularDuration) +
        durationMinutes(employee.overtimeDuration);
      if (worked === 0 || worked > 1440)
        context.addIssue({
          code: "custom",
          path: ["employees", index, "regularDuration"],
          message: "A jornada deve ser positiva e ter no máximo 24 horas.",
        });
    });
  });

type DailyReportFormValues = z.infer<typeof formSchema>;

const dailyReportSteps: Array<{
  title: string;
  fields: FieldPath<DailyReportFormValues>[];
}> = [
  {
    title: "Dados do dia",
    fields: [
      "reportDate",
      "shift",
      "supervisorEmploymentId",
      "technicalResponsibilityEmploymentIds",
    ],
  },
  {
    title: "Horários",
    fields: [
      "schedulePeriods",
      "activityStartTime",
      "activityEndTime",
      "activityEndDayOffset",
    ],
  },
  {
    title: "Serviço",
    fields: [
      "activityTypes",
      "climateConditions",
      "dailyRainfallMm",
      "monthlyRainfallMm",
      "executedActivities",
      "interferences",
    ],
  },
  { title: "Equipe", fields: ["employees"] },
  { title: "Máquinas", fields: ["machines"] },
  { title: "Revisão", fields: [] },
];

type PendingDiscard =
  | { kind: "close" }
  | {
      kind: "temporal";
      reportDate: string;
      shift: "day" | "night";
    };

const activityOptions = [
  ["earthworks", "Terraplanagem"],
  ["drainage", "Drenagem"],
  ["paving", "Pavimentação"],
] as const;
const climateOptions = [
  ["rain", "Chuva"],
  ["dry", "Seco"],
  ["waterlogged_soil", "Solo encharcado"],
] as const;
function formatDecimal(value: string) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

export function ProjectDailyReports({
  initialPage,
  projectId,
}: {
  initialPage: ProjectDailyReportsPage;
  projectId: string;
}) {
  configureZodPortugueseErrors();

  const [reports, setReports] = React.useState(initialPage.data);
  const [pageInfo, setPageInfo] = React.useState(initialPage.pageInfo);
  const [options, setOptions] =
    React.useState<ProjectDailyReportOptions | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ProjectDailyReportDetail | null>(
    null,
  );
  const [formOpen, setFormOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const [contextLoading, setContextLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);
  const [paginationLoading, setPaginationLoading] = React.useState(false);
  const [productionsLoading, setProductionsLoading] = React.useState(false);
  const [shiftProductions, setShiftProductions] = React.useState<
    ProjectProductionSummary[]
  >([]);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [editingSchedule, setEditingSchedule] = React.useState(false);
  const [pendingDiscard, setPendingDiscard] =
    React.useState<PendingDiscard | null>(null);
  const [issues, setIssues] = React.useState<
    React.ComponentProps<typeof FormErrorDeclaration>["issues"]
  >([]);
  const errorSummaryRef = React.useRef<HTMLDivElement>(null);
  const stepHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const form = useForm<DailyReportFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues(),
  });
  const periods = useFieldArray({
    control: form.control,
    name: "schedulePeriods",
  });
  const selectedEmployees = useWatch({
    control: form.control,
    name: "employees",
  });
  const selectedMachines = useWatch({
    control: form.control,
    name: "machines",
  });
  const selectedActivities = useWatch({
    control: form.control,
    name: "activityTypes",
  });
  const selectedClimates = useWatch({
    control: form.control,
    name: "climateConditions",
  });
  const selectedTechnicians = useWatch({
    control: form.control,
    name: "technicalResponsibilityEmploymentIds",
  });
  const watchedPeriods = useWatch({
    control: form.control,
    name: "schedulePeriods",
  });
  const watchedActivityEndDayOffset = useWatch({
    control: form.control,
    name: "activityEndDayOffset",
  });
  const watchedActivityStartTime = useWatch({
    control: form.control,
    name: "activityStartTime",
  });
  const watchedActivityEndTime = useWatch({
    control: form.control,
    name: "activityEndTime",
  });
  const watchedReportDate = useWatch({
    control: form.control,
    name: "reportDate",
  });
  const watchedShift = useWatch({ control: form.control, name: "shift" });
  const reportDateRegistration = form.register("reportDate");
  const shiftRegistration = form.register("shift");
  const isFormBusy = contextLoading || saving || finalizing;
  const isFormDirty = form.formState.isDirty;
  const formIssues = [...issues, ...collectFormIssues(form.formState.errors)];
  const fullShiftMinutes = effectiveWindowMinutes(
    watchedActivityStartTime,
    watchedActivityEndTime,
    watchedActivityEndDayOffset,
  );

  React.useEffect(() => {
    if (formOpen) stepHeadingRef.current?.focus();
  }, [currentStep, formOpen]);

  React.useEffect(() => {
    if (formIssues.length > 0) errorSummaryRef.current?.focus();
  }, [formIssues.length]);

  React.useEffect(() => {
    if (
      currentStep !== dailyReportSteps.length - 1 ||
      !watchedReportDate ||
      !watchedShift
    )
      return;
    let active = true;
    void (async () => {
      if (active) setProductionsLoading(true);
      try {
        const page = await getShiftProjectProductionsAction({
          projectId,
          productionDate: watchedReportDate,
          shift: watchedShift,
        });
        if (active) setShiftProductions(page.data);
      } catch {
        if (active) setShiftProductions([]);
      } finally {
        if (active) setProductionsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentStep, projectId, watchedReportDate, watchedShift]);

  async function openNew() {
    setOpening(true);
    setIssues([]);
    try {
      const resolved = await getProjectDailyReportOptionsAction({
        projectId,
        reportDate: todayInSaoPaulo(),
        shift: "day",
      });
      setOptions(resolved);
      setEditingId(null);
      setDetail(null);
      form.reset(valuesFromOptions(resolved));
      setCurrentStep(0);
      setEditingSchedule(false);
      setFormOpen(true);
    } catch {
      toast.error("Não foi possível carregar o contexto vigente da obra.");
    } finally {
      setOpening(false);
    }
  }

  async function openReport(summary: ProjectDailyReportSummary) {
    setOpening(true);
    setIssues([]);
    try {
      const loaded = await getProjectDailyReportAction(projectId, summary.id);
      if (loaded.status === "finalized") {
        setDetail(loaded);
        setDetailOpen(true);
        return;
      }
      const resolved = await getProjectDailyReportOptionsAction({
        projectId,
        reportDate: loaded.reportDate,
        shift: loaded.shift,
      });
      setOptions(resolved);
      setEditingId(loaded.id);
      setDetail(loaded);
      form.reset(valuesFromDetail(loaded));
      setCurrentStep(0);
      setEditingSchedule(false);
      setFormOpen(true);
    } catch {
      toast.error("Não foi possível abrir este RDO.");
    } finally {
      setOpening(false);
    }
  }

  async function replaceTemporalContext(
    reportDate: string,
    shift: "day" | "night",
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(reportDate)) return;
    if (
      options?.defaults.reportDate === reportDate &&
      options.defaults.shift === shift
    )
      return;
    setContextLoading(true);
    setIssues([]);
    try {
      const resolved = await getProjectDailyReportOptionsAction({
        projectId,
        reportDate,
        shift,
      });
      setOptions(resolved);
      form.reset(valuesFromOptions(resolved));
      setDetail(null);
      setEditingId(null);
      setCurrentStep(0);
      setEditingSchedule(false);
      toast.info("Contexto do RDO atualizado para a nova data e turno.");
    } catch {
      restoreTemporalFields();
      toast.error("A obra não está disponível nessa data e turno.");
    } finally {
      setContextLoading(false);
    }
  }

  function requestTemporalContextChange(
    reportDate: string,
    shift: "day" | "night",
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(reportDate)) return;
    if (
      options?.defaults.reportDate === reportDate &&
      options.defaults.shift === shift
    )
      return;
    setPendingDiscard({ kind: "temporal", reportDate, shift });
  }

  function restoreTemporalFields() {
    if (!options) return;
    form.resetField("reportDate", {
      defaultValue: options.defaults.reportDate,
    });
    form.resetField("shift", { defaultValue: options.defaults.shift });
  }

  function validateMachineReadings(values: DailyReportFormValues) {
    if (!options) return false;
    const invalidMachine = values.machines.find((entry) => {
      const machine = options.machineOptions.find(
        (option) => option.id === entry.machineId,
      );
      return (
        machine &&
        Number(canonicalDecimal(entry.endMeterReadingValue)) <
          Number(machine.startMeterReading.value)
      );
    });
    if (!invalidMachine) return true;
    setIssues([
      {
        location: "Máquinas",
        message: "A leitura final não pode ser menor que a leitura inicial.",
      },
    ]);
    setCurrentStep(4);
    return false;
  }

  async function saveDraft(values: DailyReportFormValues, close: boolean) {
    if (!options || !validateMachineReadings(values)) return false;
    setSaving(true);
    setIssues([]);
    const result = await saveProjectDailyReportAction({
      projectId,
      reportId: editingId ?? undefined,
      command: toCommand(values),
    });
    setSaving(false);
    if (result.kind === "failure") {
      setIssues([
        {
          location: "RDO",
          message: `${translatedError(result.code, result.message)}${result.requestId ? ` Solicitação: ${result.requestId}.` : ""}`,
        },
      ]);
      return false;
    }
    setEditingId(result.report.id);
    setDetail(result.report);
    upsertSummary(result.report);
    form.reset(valuesFromDetail(result.report));
    if (close) setFormOpen(false);
    toast.success(
      close
        ? "Rascunho salvo para continuar depois."
        : "Rascunho do RDO salvo.",
    );
    return true;
  }

  async function finalize(values: DailyReportFormValues) {
    if (!options || !validateMachineReadings(values)) return;
    setFinalizing(true);
    setIssues([]);
    const saved = await saveProjectDailyReportAction({
      projectId,
      reportId: editingId ?? undefined,
      command: toCommand(values),
    });
    if (saved.kind === "failure") {
      setFinalizing(false);
      setIssues([
        {
          location: "Finalização",
          message: translatedError(saved.code, saved.message),
        },
      ]);
      return;
    }
    setEditingId(saved.report.id);
    setDetail(saved.report);
    upsertSummary(saved.report);
    let productionPage;
    try {
      productionPage = await getShiftProjectProductionsAction({
        projectId,
        productionDate: saved.report.reportDate,
        shift: saved.report.shift,
      });
    } catch {
      setFinalizing(false);
      setIssues([
        {
          location: "Produção",
          message:
            "Não foi possível conferir as produções deste turno. Tente novamente.",
        },
      ]);
      return;
    }
    const drafts = productionPage.data.filter(
      (production) => production.status === "draft",
    );
    if (drafts.length) {
      setFinalizing(false);
      setShiftProductions(productionPage.data);
      setIssues([
        {
          location: "Produção",
          message: `${drafts.length} lançamento(s) de produção ainda estão em rascunho. Envie-os antes de finalizar o RDO.`,
        },
      ]);
      return;
    }
    if (productionPage.data.length) {
      try {
        await confirmDailyReportProductionsAction({
          projectId,
          reportId: saved.report.id,
          productionIds: productionPage.data.map((production) => production.id),
        });
      } catch {
        setFinalizing(false);
        setIssues([
          {
            location: "Produção",
            message:
              "As produções mudaram durante a conferência. Revise o resumo antes de finalizar.",
          },
        ]);
        return;
      }
    }
    const result = await finalizeProjectDailyReportAction(
      projectId,
      saved.report.id,
    );
    setFinalizing(false);
    if (result.kind === "failure") {
      setIssues([
        {
          location: "Finalização",
          message: translatedError(result.code, result.message),
        },
      ]);
      return;
    }
    upsertSummary(result.report);
    setDetail(result.report);
    setFormOpen(false);
    setDetailOpen(true);
    toast.success("RDO finalizado. Jornadas e medidores foram registrados.");
  }

  function upsertSummary(report: ProjectDailyReportDetail) {
    const summary = summaryFromDetail(report);
    setReports((current) =>
      [summary, ...current.filter((item) => item.id !== summary.id)].sort(
        compareSummaries,
      ),
    );
  }

  async function loadMore() {
    if (!pageInfo.nextCursor) return;
    setPaginationLoading(true);
    try {
      const next = await getMoreProjectDailyReportsAction(
        projectId,
        pageInfo.nextCursor,
      );
      setReports((current) => [
        ...current,
        ...next.data.filter(
          (item) => !current.some((existing) => existing.id === item.id),
        ),
      ]);
      setPageInfo(next.pageInfo);
    } catch {
      toast.error("Não foi possível carregar mais RDOs.");
    } finally {
      setPaginationLoading(false);
    }
  }

  async function goToNextStep() {
    const step = dailyReportSteps[currentStep];
    if (!step || currentStep >= dailyReportSteps.length - 1) return;
    const valid = await form.trigger(step.fields, { shouldFocus: true });
    if (!valid) return;
    setIssues([]);
    setCurrentStep((value) => Math.min(value + 1, dailyReportSteps.length - 1));
  }

  function requestClose() {
    if (isFormBusy) return;
    if (isFormDirty) setPendingDiscard({ kind: "close" });
    else setFormOpen(false);
  }

  function handleFormOpenChange(open: boolean) {
    if (open) return;
    requestClose();
  }

  async function confirmDiscard() {
    const pending = pendingDiscard;
    setPendingDiscard(null);
    if (!pending) return;
    if (pending.kind === "close") {
      setFormOpen(false);
      return;
    }
    await replaceTemporalContext(pending.reportDate, pending.shift);
  }

  function cancelDiscard() {
    if (pendingDiscard?.kind === "temporal") restoreTemporalFields();
    setPendingDiscard(null);
  }

  async function copyMessage() {
    if (!detail || detail.status !== "finalized") return;
    const copied = await copyTextToClipboard(
      buildProjectDailyReportMessage(detail),
    );
    if (copied) toast.success("Mensagem do RDO copiada.");
    else toast.error("Não foi possível copiar a mensagem neste dispositivo.");
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold">Relatórios Diários de Obra</h3>
          <p className="text-sm text-muted-foreground">
            Um RDO por data e turno. Finalizados preservam o histórico da obra.
          </p>
        </div>
        <Button onClick={openNew} disabled={opening}>
          {opening ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus />
          )}
          Novo RDO
        </Button>
      </div>

      {reports.length ? (
        <div className="grid gap-2">
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => openReport(report)}
              className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="flex min-w-0 items-center gap-3">
                <CalendarDays className="size-5 shrink-0 text-primary" />
                <span>
                  <span className="block font-bold">
                    {formatDate(report.reportDate)} ·{" "}
                    {report.shift === "day" ? "Diurno" : "Noturno"}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {report.activityStartTime}–{report.activityEndTime}
                    {report.activityEndDayOffset ? " (+1 dia)" : ""}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold",
                  report.status === "finalized"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                )}
              >
                {report.status === "finalized" ? "Finalizado" : "Rascunho"}
              </span>
            </button>
          ))}
          {pageInfo.hasNextPage && (
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={paginationLoading}
            >
              {paginationLoading && (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              )}
              Carregar mais
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <FileText className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-bold">Nenhum RDO cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie o primeiro relatório diário desta obra.
          </p>
        </div>
      )}

      <OperationsModal
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        size="xl"
        icon={FileText}
        title={editingId ? "Continuar RDO" : "Novo RDO"}
        description="Registre o que aconteceu neste turno. Você pode salvar para continuar depois ou finalizar quando estiver tudo conferido."
        footer={
          <>
            <div className="flex min-h-10 items-center">
              {currentStep === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11"
                  disabled={isFormBusy}
                  onClick={requestClose}
                >
                  Cancelar
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11"
                  disabled={isFormBusy}
                  onClick={() =>
                    setCurrentStep((step) => Math.max(0, step - 1))
                  }
                >
                  <ChevronLeft /> Voltar
                </Button>
              )}
            </div>
            {currentStep === dailyReportSteps.length - 1 ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11"
                  disabled={isFormBusy || !options}
                  onClick={form.handleSubmit((values) =>
                    saveDraft(values, true),
                  )}
                >
                  {saving ? (
                    <Loader2 className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Save />
                  )}
                  Salvar e sair
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        type="button"
                        variant="destructive"
                        size="lg"
                        className="min-h-11"
                        disabled={isFormBusy || !options}
                      >
                        Finalizar RDO
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Finalizar este RDO?</AlertDialogTitle>
                      <AlertDialogDescription>
                        As produções aprovadas exibidas na revisão serão
                        confirmadas, e as jornadas e leituras finais das
                        máquinas serão registradas. Produções em rascunho
                        impedem a finalização.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        Não, continuar editando
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void form.handleSubmit(finalize)()}
                        disabled={isFormBusy}
                      >
                        Sim, finalizar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <Button
                type="button"
                size="lg"
                className="min-h-11"
                onClick={() => void goToNextStep()}
                disabled={isFormBusy || !options}
              >
                {contextLoading ? (
                  <Loader2 className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <ChevronRight />
                )}
                Avançar
              </Button>
            )}
          </>
        }
      >
        <form
          className="grid gap-5"
          aria-busy={isFormBusy}
          onSubmit={(event) => {
            event.preventDefault();
            if (currentStep < dailyReportSteps.length - 1) void goToNextStep();
          }}
        >
          <FormWizardProgress
            steps={dailyReportSteps}
            currentStep={currentStep}
          />
          <h2 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
            Etapa {currentStep + 1} de {dailyReportSteps.length}:{" "}
            {dailyReportSteps[currentStep]?.title}
          </h2>
          <div ref={errorSummaryRef} tabIndex={-1} className="outline-none">
            <FormErrorDeclaration
              issues={formIssues}
              title="Revise os dados desta etapa."
              description="Corrija os pontos indicados antes de continuar."
            />
          </div>

          {currentStep === 0 && (
            <FormSection
              title="Dados do dia"
              description="Confirme a obra, a data, o turno e quem responde por este relatório."
            >
              <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm sm:grid-cols-3">
                <Info label="Obra" value={options?.project.name ?? "—"} />
                <Info
                  label="Município"
                  value={
                    [options?.project.municipality, options?.project.state]
                      .filter(Boolean)
                      .join("/") || "Não informado"
                  }
                />
                <Info
                  label="Contrato"
                  value={options?.project.contract ?? "Não informado"}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Data do RDO">
                  <Input
                    className="h-11"
                    type="date"
                    max={todayInSaoPaulo()}
                    disabled={contextLoading}
                    aria-invalid={Boolean(form.formState.errors.reportDate)}
                    {...reportDateRegistration}
                    onBlur={(event) => {
                      void reportDateRegistration.onBlur(event);
                      requestTemporalContextChange(
                        event.target.value,
                        form.getValues("shift"),
                      );
                    }}
                  />
                </Field>
                <Field label="Turno">
                  <select
                    className={cn(controlClass, "h-11")}
                    disabled={contextLoading}
                    aria-invalid={Boolean(form.formState.errors.shift)}
                    {...shiftRegistration}
                    onChange={(event) => {
                      void shiftRegistration.onChange(event);
                      requestTemporalContextChange(
                        form.getValues("reportDate"),
                        event.target.value as "day" | "night",
                      );
                    }}
                  >
                    <option value="day">Diurno</option>
                    <option value="night">Noturno</option>
                  </select>
                </Field>
                <Field label="Supervisor">
                  <select
                    className={cn(controlClass, "h-11")}
                    aria-invalid={Boolean(
                      form.formState.errors.supervisorEmploymentId,
                    )}
                    {...form.register("supervisorEmploymentId")}
                  >
                    <option value="">Selecione</option>
                    {options?.responsibleOptions.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-1.5 text-sm">
                  <span className="font-semibold">Responsáveis técnicos</span>
                  <div className="grid gap-2">
                    {options?.responsibleOptions.map((person) => (
                      <CheckLine
                        key={person.id}
                        checked={selectedTechnicians.includes(person.id)}
                        invalid={Boolean(
                          form.formState.errors
                            .technicalResponsibilityEmploymentIds,
                        )}
                        label={person.name}
                        outlined
                        onChange={(checked) =>
                          toggleString(
                            form,
                            "technicalResponsibilityEmploymentIds",
                            person.id,
                            checked,
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            </FormSection>
          )}

          {currentStep === 1 && (
            <FormSection
              title="Horários"
              description="Os horários previstos já vêm da escala da obra. Ajuste somente quando o dia tiver sido diferente."
            >
              <div className="flex flex-col gap-3 rounded-md bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">Horário previsto</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatSchedulePeriods(watchedPeriods)} · Escala{" "}
                    {options?.defaults.scheduleScale ?? "carregando…"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingSchedule((value) => !value)}
                >
                  {editingSchedule
                    ? "Concluir ajuste"
                    : "Ajustar horário previsto"}
                </Button>
              </div>
              {editingSchedule && (
                <div className="grid gap-3">
                  {periods.fields.map((period, index) => (
                    <div
                      key={period.id}
                      className="grid items-end gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
                    >
                      <Field label={`Período ${index + 1} — início`}>
                        <Input
                          className="h-11"
                          type="time"
                          aria-invalid={Boolean(
                            form.formState.errors.schedulePeriods?.[index]
                              ?.startTime,
                          )}
                          {...form.register(
                            `schedulePeriods.${index}.startTime`,
                          )}
                        />
                      </Field>
                      <Field label="Fim">
                        <Input
                          className="h-11"
                          type="time"
                          aria-invalid={Boolean(
                            form.formState.errors.schedulePeriods?.[index]
                              ?.endTime,
                          )}
                          {...form.register(`schedulePeriods.${index}.endTime`)}
                        />
                      </Field>
                      <CheckLine
                        checked={watchedPeriods[index]?.endDayOffset === 1}
                        invalid={Boolean(
                          form.formState.errors.schedulePeriods?.[index]
                            ?.endDayOffset,
                        )}
                        label="Termina no dia seguinte"
                        onChange={(checked) =>
                          form.setValue(
                            `schedulePeriods.${index}.endDayOffset`,
                            checked ? 1 : 0,
                            { shouldDirty: true },
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover faixa"
                        disabled={periods.fields.length === 1}
                        onClick={() => periods.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  {periods.fields.length < 6 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        periods.append({
                          startTime: "13:00",
                          endTime: "18:00",
                          startDayOffset: 0,
                          endDayOffset: 0,
                        })
                      }
                    >
                      <Plus /> Adicionar período
                    </Button>
                  )}
                </div>
              )}
              <div>
                <p className="text-sm font-bold">Horário real do serviço</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Informe quando as atividades começaram e terminaram de fato.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Início">
                  <Input
                    className="h-11"
                    type="time"
                    aria-invalid={Boolean(
                      form.formState.errors.activityStartTime,
                    )}
                    {...form.register("activityStartTime")}
                  />
                </Field>
                <Field label="Término">
                  <Input
                    className="h-11"
                    type="time"
                    aria-invalid={Boolean(
                      form.formState.errors.activityEndTime,
                    )}
                    {...form.register("activityEndTime")}
                  />
                </Field>
                <CheckLine
                  checked={watchedActivityEndDayOffset === 1}
                  invalid={Boolean(form.formState.errors.activityEndDayOffset)}
                  label="Terminou no dia seguinte"
                  onChange={(checked) =>
                    form.setValue("activityEndDayOffset", checked ? 1 : 0, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>
            </FormSection>
          )}

          {currentStep === 2 && (
            <FormSection
              title="Serviço"
              description="Descreva o trabalho realizado e as condições encontradas neste turno."
            >
              <ChoiceGrid title="Serviços realizados">
                {activityOptions.map(([value, label]) => (
                  <CheckLine
                    key={value}
                    checked={selectedActivities.includes(value)}
                    invalid={Boolean(form.formState.errors.activityTypes)}
                    label={label}
                    outlined
                    onChange={(checked) =>
                      toggleString(form, "activityTypes", value, checked)
                    }
                  />
                ))}
              </ChoiceGrid>
              <ChoiceGrid title="Condições do tempo e do solo">
                {climateOptions.map(([value, label]) => (
                  <CheckLine
                    key={value}
                    checked={selectedClimates.includes(value)}
                    invalid={Boolean(form.formState.errors.climateConditions)}
                    label={label}
                    outlined
                    onChange={(checked) =>
                      toggleString(form, "climateConditions", value, checked)
                    }
                  />
                ))}
              </ChoiceGrid>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Chuva de hoje (mm)">
                  <Input
                    className="h-11"
                    inputMode="decimal"
                    aria-invalid={Boolean(
                      form.formState.errors.dailyRainfallMm,
                    )}
                    {...form.register("dailyRainfallMm")}
                  />
                </Field>
                <Field label="Acumulado mensal (mm)">
                  <Input
                    className="h-11"
                    inputMode="decimal"
                    aria-invalid={Boolean(
                      form.formState.errors.monthlyRainfallMm,
                    )}
                    {...form.register("monthlyRainfallMm")}
                  />
                </Field>
              </div>
              <Field label="Resumo dos serviços executados">
                <textarea
                  className={cn(controlClass, "min-h-32 resize-y py-3")}
                  placeholder="Ex.: transporte e compactação de material no setor norte."
                  aria-invalid={Boolean(
                    form.formState.errors.executedActivities,
                  )}
                  {...form.register("executedActivities")}
                />
              </Field>
              <Field label="Imprevistos ou impedimentos (opcional)">
                <textarea
                  className={cn(controlClass, "min-h-24 resize-y py-3")}
                  placeholder="Ex.: acesso interrompido pela chuva entre 14h e 15h."
                  {...form.register("interferences")}
                />
              </Field>
            </FormSection>
          )}

          {currentStep === 3 && (
            <FormSection
              title="Equipe"
              description="Selecione quem trabalhou neste turno. O atalho usa a janela efetiva informada; ajuste as horas quando a jornada realizada for diferente."
            >
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    form.setValue(
                      "employees",
                      (options?.employeeOptions ?? []).map((employee) => ({
                        employmentId: employee.id,
                        completedFullShift: true,
                        regularDuration: formatDuration(fullShiftMinutes),
                        overtimeDuration: "00:00",
                      })),
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                >
                  <Check /> Marcar todos com turno completo
                </Button>
              </div>
              <div className="grid gap-2">
                {options?.employeeOptions.map((employee) => {
                  const index = selectedEmployees.findIndex(
                    (entry) => entry.employmentId === employee.id,
                  );
                  const selected = index >= 0;
                  return (
                    <div
                      key={employee.id}
                      className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(12rem,1fr)_auto_8rem_8rem] md:items-end"
                    >
                      <CheckLine
                        checked={selected}
                        invalid={Boolean(form.formState.errors.employees)}
                        label={`${employee.name} — ${employee.jobRole}`}
                        onChange={(checked) => {
                          const current = form.getValues("employees");
                          form.setValue(
                            "employees",
                            checked
                              ? [
                                  ...current,
                                  {
                                    employmentId: employee.id,
                                    completedFullShift: true,
                                    regularDuration:
                                      formatDuration(fullShiftMinutes),
                                    overtimeDuration: "00:00",
                                  },
                                ]
                              : current.filter(
                                  (entry) => entry.employmentId !== employee.id,
                                ),
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }}
                      />
                      {selected && (
                        <>
                          <CheckLine
                            checked={
                              selectedEmployees[index]!.completedFullShift
                            }
                            label="Cumpriu o turno completo"
                            onChange={(checked) => {
                              form.setValue(
                                `employees.${index}.completedFullShift`,
                                checked,
                                { shouldDirty: true },
                              );
                              if (checked)
                                form.setValue(
                                  `employees.${index}.regularDuration`,
                                  formatDuration(fullShiftMinutes),
                                  { shouldDirty: true },
                                );
                            }}
                          />
                          <Field label="Horas normais">
                            <Input
                              className="h-11"
                              inputMode="numeric"
                              aria-invalid={Boolean(
                                form.formState.errors.employees?.[index]
                                  ?.regularDuration,
                              )}
                              {...form.register(
                                `employees.${index}.regularDuration`,
                                {
                                  onChange: () =>
                                    form.setValue(
                                      `employees.${index}.completedFullShift`,
                                      false,
                                      { shouldDirty: true },
                                    ),
                                },
                              )}
                            />
                          </Field>
                          <Field label="Horas extras">
                            <Input
                              className="h-11"
                              inputMode="numeric"
                              aria-invalid={Boolean(
                                form.formState.errors.employees?.[index]
                                  ?.overtimeDuration,
                              )}
                              {...form.register(
                                `employees.${index}.overtimeDuration`,
                              )}
                            />
                          </Field>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </FormSection>
          )}

          {currentStep === 4 && (
            <FormSection
              title="Máquinas"
              description="Selecione as máquinas usadas e informe a leitura mostrada ao fim do turno."
            >
              <div className="grid gap-2">
                {options?.machineOptions.length ? (
                  options.machineOptions.map((machine) => {
                    const index = selectedMachines.findIndex(
                      (entry) => entry.machineId === machine.id,
                    );
                    const selected = index >= 0;
                    return (
                      <div
                        key={machine.id}
                        className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(12rem,1fr)_9rem_9rem] sm:items-end"
                      >
                        <CheckLine
                          checked={selected}
                          invalid={Boolean(
                            form.formState.errors.machines?.[index],
                          )}
                          label={`${machine.name} — ${machine.manufacturer} ${machine.model} · ${machine.meterType === "hour_meter" ? "Horímetro" : "Odômetro"}`}
                          onChange={(checked) => {
                            const current = form.getValues("machines");
                            form.setValue(
                              "machines",
                              checked
                                ? [
                                    ...current,
                                    {
                                      machineId: machine.id,
                                      endMeterReadingValue:
                                        machine.startMeterReading.value,
                                    },
                                  ]
                                : current.filter(
                                    (entry) => entry.machineId !== machine.id,
                                  ),
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                        />
                        <Field label="Leitura inicial">
                          <Input
                            className="h-11"
                            value={machine.startMeterReading.value}
                            disabled
                          />
                        </Field>
                        {selected && (
                          <Field label="Leitura final">
                            <Input
                              className="h-11"
                              inputMode="decimal"
                              aria-invalid={Boolean(
                                form.formState.errors.machines?.[index]
                                  ?.endMeterReadingValue,
                              )}
                              {...form.register(
                                `machines.${index}.endMeterReadingValue`,
                              )}
                            />
                          </Field>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-md bg-muted/50 p-4 text-sm">
                    <p className="font-bold">Nenhuma máquina disponível</p>
                    <p className="mt-1 leading-5 text-muted-foreground">
                      Não há máquina mobilizada com uma leitura anterior para
                      este turno. Você pode continuar sem informar máquinas.
                    </p>
                  </div>
                )}
              </div>
            </FormSection>
          )}

          {currentStep === 5 && (
            <DailyReportReview
              options={options}
              productions={shiftProductions}
              productionsLoading={productionsLoading}
              values={form.getValues()}
              onEdit={setCurrentStep}
            />
          )}
        </form>
      </OperationsModal>

      <AlertDialog
        open={pendingDiscard !== null}
        onOpenChange={(open) => {
          if (!open) cancelDiscard();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDiscard?.kind === "temporal"
                ? "Atualizar data e turno?"
                : "Descartar alterações?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDiscard?.kind === "temporal"
                ? "Os dados da obra, da equipe e das máquinas serão recarregados para o novo período. As alterações ainda não salvas serão descartadas."
                : "As alterações feitas neste RDO ainda não foram salvas e serão perdidas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              Continuar preenchendo
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmDiscard()}
            >
              {pendingDiscard?.kind === "temporal"
                ? "Atualizar período"
                : "Descartar alterações"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OperationsModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        size="xl"
        icon={FileText}
        title="Detalhes do RDO"
        description="Registro finalizado e imutável."
        footer={
          detail?.status === "finalized" ? (
            <>
              <span className="text-sm text-muted-foreground">
                Finalizado em {formatDateTime(detail.finalizedAt)}
              </span>
              <Button onClick={copyMessage}>
                <Clipboard /> Copiar mensagem
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
            {buildProjectDailyReportMessage(detail)}
          </pre>
        )}
      </OperationsModal>
    </div>
  );
}

function DailyReportReview({
  onEdit,
  options,
  productions,
  productionsLoading,
  values,
}: {
  onEdit: (step: number) => void;
  options: ProjectDailyReportOptions | null;
  productions: ProjectProductionSummary[];
  productionsLoading: boolean;
  values: DailyReportFormValues;
}) {
  const supervisor = options?.responsibleOptions.find(
    (person) => person.id === values.supervisorEmploymentId,
  );
  const technicians = options?.responsibleOptions
    .filter((person) =>
      values.technicalResponsibilityEmploymentIds.includes(person.id),
    )
    .map((person) => person.name);
  const activities = activityOptions
    .filter(([value]) => values.activityTypes.includes(value))
    .map(([, label]) => label);
  const climates = climateOptions
    .filter(([value]) => values.climateConditions.includes(value))
    .map(([, label]) => label);
  const employees = values.employees.map((entry) => {
    const employee = options?.employeeOptions.find(
      (option) => option.id === entry.employmentId,
    );
    return `${employee?.name ?? "Participante"} · ${entry.regularDuration} normais${entry.overtimeDuration !== "00:00" ? ` + ${entry.overtimeDuration} extras` : ""}`;
  });
  const machines = values.machines.map((entry) => {
    const machine = options?.machineOptions.find(
      (option) => option.id === entry.machineId,
    );
    return `${machine?.name ?? "Máquina"} · leitura final ${entry.endMeterReadingValue}`;
  });

  return (
    <FormSection
      title="Revisão"
      description="Confira as informações antes de salvar para continuar depois ou finalizar o RDO."
    >
      <div className="divide-y divide-border rounded-md border border-border bg-background">
        <ReviewSection title="Dados do dia" step={0} onEdit={onEdit}>
          <ReviewLine label="Obra" value={options?.project.name ?? "—"} />
          <ReviewLine
            label="Data e turno"
            value={`${formatDate(values.reportDate)} · ${values.shift === "day" ? "Diurno" : "Noturno"}`}
          />
          <ReviewLine label="Supervisor" value={supervisor?.name ?? "—"} />
          <ReviewLine
            label="Responsáveis técnicos"
            value={technicians?.join(", ") || "—"}
          />
        </ReviewSection>

        <ReviewSection title="Horários" step={1} onEdit={onEdit}>
          <ReviewLine
            label="Previsto"
            value={formatSchedulePeriods(values.schedulePeriods)}
          />
          <ReviewLine
            label="Realizado"
            value={`${values.activityStartTime}–${values.activityEndTime}${values.activityEndDayOffset ? " · terminou no dia seguinte" : ""}`}
          />
        </ReviewSection>

        <ReviewSection title="Serviço" step={2} onEdit={onEdit}>
          <ReviewLine label="Serviços" value={activities.join(", ") || "—"} />
          <ReviewLine label="Condições" value={climates.join(", ") || "—"} />
          <ReviewLine
            label="Chuva"
            value={`${values.dailyRainfallMm} mm hoje · ${values.monthlyRainfallMm} mm no mês`}
          />
          <ReviewLine label="Resumo" value={values.executedActivities} />
          <ReviewLine
            label="Imprevistos"
            value={values.interferences || "Nenhum informado"}
          />
        </ReviewSection>

        <ReviewSection title="Equipe" step={3} onEdit={onEdit}>
          <ReviewList
            values={employees}
            empty="Nenhum participante selecionado."
          />
        </ReviewSection>

        <ReviewSection title="Máquinas" step={4} onEdit={onEdit}>
          <ReviewList values={machines} empty="Nenhuma máquina selecionada." />
        </ReviewSection>

        <section className="grid gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">Produções do turno</h3>
            <div className="flex flex-wrap justify-end gap-2">
              {productions.some(
                (production) => production.status === "draft",
              ) && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700">
                  Envio pendente
                </span>
              )}
              {productions.some((production) =>
                ["submitted", "field_checked", "awaiting_technical"].includes(
                  production.status,
                ),
              ) && (
                <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-bold text-sky-700">
                  Qualidade pendente — não bloqueia o RDO
                </span>
              )}
              {productions.some((production) => production.rdo.stale) && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700">
                  Reconfirmação operacional necessária
                </span>
              )}
            </div>
          </div>
          {productionsLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando produções…
            </p>
          ) : productions.length ? (
            <div className="grid gap-2">
              {productions.map((production) => (
                <div
                  key={production.id}
                  className="flex flex-col gap-1 rounded-md border border-border bg-secondary/20 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <strong>
                      {productionServiceLabel(production.serviceCode)}
                    </strong>{" "}
                    · {formatDecimal(production.officialQuantity)}{" "}
                    {productionUnitLabel(production.unitCode)} · {production.tripCount} viagem(ns)
                  </span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      ["approved", "released", "measured"].includes(
                        production.status,
                      )
                        ? "text-emerald-700"
                        : production.status === "rejected"
                          ? "text-destructive"
                          : "text-amber-700",
                    )}
                  >
                    {productionStatusLabel(production.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma produção lançada para esta data e turno.
            </p>
          )}
        </section>
      </div>

      <p className="text-sm leading-5 text-muted-foreground">
        Finalizar torna as jornadas e leituras oficiais e bloqueia novas
        edições. Para conferir depois, escolha salvar e sair.
      </p>
    </FormSection>
  );
}

function ReviewSection({
  children,
  onEdit,
  step,
  title,
}: {
  children: React.ReactNode;
  onEdit: (step: number) => void;
  step: number;
  title: string;
}) {
  return (
    <section className="grid gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(step)}
        >
          Editar
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
      <span className="min-w-0 break-words font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function productionStatusLabel(status: ProjectProductionSummary["status"]) {
  return (
    {
      draft: "Rascunho",
      submitted: "Enviada",
      field_checked: "Conferida em campo",
      awaiting_technical: "Aguardando técnica",
      approved: "Aprovada",
      rejected: "Rejeitada",
      released: "Liberada",
      measured: "Medida",
    } as Record<ProjectProductionSummary["status"], string>
  )[status];
}

function ReviewList({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-1.5 text-sm">
      {values.map((value) => (
        <li key={value} className="font-semibold">
          {value}
        </li>
      ))}
    </ul>
  );
}

function formatSchedulePeriods(
  schedulePeriods: DailyReportFormValues["schedulePeriods"],
) {
  return schedulePeriods
    .map(
      (period) =>
        `${period.startTime}–${period.endTime}${period.endDayOffset ? " (+1 dia)" : ""}`,
    )
    .join(" · ");
}

function valuesFromOptions(
  options: ProjectDailyReportOptions,
): DailyReportFormValues {
  return {
    reportDate: options.defaults.reportDate,
    shift: options.defaults.shift,
    schedulePeriods: options.defaults.schedulePeriods,
    activityStartTime: options.defaults.activityStartTime,
    activityEndTime: options.defaults.activityEndTime,
    activityEndDayOffset: options.defaults.activityEndDayOffset,
    activityTypes: ["earthworks"],
    climateConditions: ["dry"],
    dailyRainfallMm: "0,00",
    monthlyRainfallMm: "0,00",
    supervisorEmploymentId: options.defaults.supervisorEmploymentId ?? "",
    technicalResponsibilityEmploymentIds:
      options.defaults.technicalResponsibilityEmploymentIds,
    employees: [],
    machines: [],
    executedActivities: "",
    interferences: "",
  };
}

function valuesFromDetail(
  report: ProjectDailyReportDetail,
): DailyReportFormValues {
  return {
    reportDate: report.reportDate,
    shift: report.shift,
    schedulePeriods: report.schedulePeriods,
    activityStartTime: report.activityWindow.startTime,
    activityEndTime: report.activityWindow.endTime,
    activityEndDayOffset: report.activityWindow.endDayOffset,
    activityTypes: [...report.activityTypes],
    climateConditions: [...report.climateConditions],
    dailyRainfallMm: report.rainfall.dailyMm.replace(".", ","),
    monthlyRainfallMm: report.rainfall.monthlyMm.replace(".", ","),
    supervisorEmploymentId: report.supervisor.employmentId,
    technicalResponsibilityEmploymentIds: report.technicalResponsibilities.map(
      (item) => item.employmentId,
    ),
    employees: report.employees.map((employee) => ({
      employmentId: employee.employmentId,
      completedFullShift: employee.completedFullShift,
      regularDuration: formatDuration(employee.regularWorkedMinutes),
      overtimeDuration: formatDuration(employee.overtimeMinutes),
    })),
    machines: report.machines.map((machine) => ({
      machineId: machine.machineId,
      endMeterReadingValue: machine.endMeterReading.value.replace(".", ","),
    })),
    executedActivities: report.executedActivities,
    interferences: report.interferences ?? "",
  };
}

function emptyValues(): DailyReportFormValues {
  return {
    reportDate: todayInSaoPaulo(),
    shift: "day",
    schedulePeriods: [
      {
        startTime: "07:00",
        endTime: "18:00",
        startDayOffset: 0,
        endDayOffset: 0,
      },
    ],
    activityStartTime: "07:00",
    activityEndTime: "18:00",
    activityEndDayOffset: 0,
    activityTypes: ["earthworks"],
    climateConditions: ["dry"],
    dailyRainfallMm: "0,00",
    monthlyRainfallMm: "0,00",
    supervisorEmploymentId: "",
    technicalResponsibilityEmploymentIds: [],
    employees: [],
    machines: [],
    executedActivities: "",
    interferences: "",
  };
}

function toCommand(values: DailyReportFormValues): ProjectDailyReportCommand {
  return {
    reportDate: values.reportDate,
    shift: values.shift,
    schedulePeriods: values.schedulePeriods,
    activityStartTime: values.activityStartTime,
    activityEndTime: values.activityEndTime,
    activityEndDayOffset: values.activityEndDayOffset,
    activityTypes: values.activityTypes,
    climateConditions: values.climateConditions,
    dailyRainfallMm: canonicalDecimal(values.dailyRainfallMm),
    monthlyRainfallMm: canonicalDecimal(values.monthlyRainfallMm),
    supervisorEmploymentId: values.supervisorEmploymentId,
    technicalResponsibilityEmploymentIds:
      values.technicalResponsibilityEmploymentIds,
    employees: values.employees.map((employee) => ({
      employmentId: employee.employmentId,
      completedFullShift: employee.completedFullShift,
      regularWorkedMinutes: durationMinutes(employee.regularDuration),
      overtimeMinutes: durationMinutes(employee.overtimeDuration),
    })),
    machines: values.machines.map((machine) => ({
      machineId: machine.machineId,
      endMeterReadingValue: canonicalDecimal(machine.endMeterReadingValue),
    })),
    executedActivities: values.executedActivities.trim(),
    interferences: values.interferences.trim() || null,
  };
}

function summaryFromDetail(
  report: ProjectDailyReportDetail,
): ProjectDailyReportSummary {
  return {
    id: report.id,
    reportDate: report.reportDate,
    shift: report.shift,
    status: report.status,
    activityStartTime: report.activityWindow.startTime,
    activityEndTime: report.activityWindow.endTime,
    activityEndDayOffset: report.activityWindow.endDayOffset,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    finalizedAt: report.finalizedAt,
  };
}

function compareSummaries(
  left: ProjectDailyReportSummary,
  right: ProjectDailyReportSummary,
) {
  const date = right.reportDate.localeCompare(left.reportDate);
  if (date) return date;
  return Number(right.shift === "night") - Number(left.shift === "night");
}

function toggleString(
  form: UseFormReturn<DailyReportFormValues>,
  name:
    | "technicalResponsibilityEmploymentIds"
    | "activityTypes"
    | "climateConditions",
  value: string,
  checked: boolean,
) {
  if (name === "technicalResponsibilityEmploymentIds") {
    const current = form.getValues(name);
    form.setValue(
      name,
      checked
        ? [...new Set([...current, value])]
        : current.filter((item) => item !== value),
      { shouldDirty: true, shouldValidate: true },
    );
    return;
  }
  if (name === "activityTypes") {
    const activity = value as DailyReportFormValues["activityTypes"][number];
    const current = form.getValues(name);
    form.setValue(
      name,
      checked
        ? [...new Set([...current, activity])]
        : current.filter((item) => item !== activity),
      { shouldDirty: true, shouldValidate: true },
    );
    return;
  }
  const climate = value as DailyReportFormValues["climateConditions"][number];
  const current = form.getValues(name);
  form.setValue(
    name,
    checked
      ? [...new Set([...current, climate])]
      : current.filter((item) => item !== climate),
    { shouldDirty: true, shouldValidate: true },
  );
}

function collectFormIssues(errors: object, prefix = "") {
  const issues: React.ComponentProps<typeof FormErrorDeclaration>["issues"] =
    [];
  Object.entries(errors).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const field = prefix ? `${prefix}.${key}` : key;
    if ("message" in value && typeof value.message === "string")
      issues.push({ field: formFieldLabel(field), message: value.message });
    else issues.push(...collectFormIssues(value, field));
  });
  return issues;
}

function formFieldLabel(field: string) {
  const labels: Array<[string, string]> = [
    ["schedulePeriods", "Horário previsto"],
    ["activityStartTime", "Início do serviço"],
    ["activityEndTime", "Término do serviço"],
    ["activityTypes", "Serviços realizados"],
    ["climateConditions", "Condições do tempo e do solo"],
    ["dailyRainfallMm", "Chuva de hoje"],
    ["monthlyRainfallMm", "Acumulado mensal"],
    ["supervisorEmploymentId", "Supervisor"],
    ["technicalResponsibilityEmploymentIds", "Responsáveis técnicos"],
    ["employees", "Jornada da equipe"],
    ["machines", "Máquinas"],
    ["executedActivities", "Atividades executadas"],
    ["interferences", "Imprevistos ou impedimentos"],
    ["reportDate", "Data do RDO"],
    ["shift", "Turno"],
  ];
  return labels.find(([prefix]) => field.startsWith(prefix))?.[1] ?? "RDO";
}

function translatedError(code: string, fallback: string) {
  const messages: Record<string, string> = {
    DAILY_REPORT_ALREADY_EXISTS: "Já existe um RDO para esta data e turno.",
    DAILY_REPORT_IMMUTABLE:
      "Este RDO já foi finalizado e não pode ser alterado.",
    DAILY_REPORT_PROJECT_UNAVAILABLE:
      "A obra não está disponível para esse período.",
    DAILY_REPORT_RESOURCE_UNAVAILABLE:
      "Um responsável, funcionário ou equipamento deixou de estar disponível.",
    DAILY_REPORT_METER_READING_CONFLICT:
      "O histórico de uma máquina mudou. Reabra o RDO para atualizar a leitura inicial.",
  };
  return messages[code] ?? fallback;
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block truncate font-semibold" title={value}>
        {value}
      </span>
    </div>
  );
}

function ChoiceGrid({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="grid gap-2 text-sm">
      <span className="font-semibold">{title}</span>
      <div className="grid gap-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function CheckLine({
  checked,
  invalid = false,
  label,
  outlined = false,
  onChange,
}: {
  checked: boolean;
  invalid?: boolean;
  label: string;
  outlined?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-medium transition-colors hover:bg-muted/70",
        outlined && "border border-border px-3",
        outlined && checked && "border-primary/50 bg-accent text-foreground",
        outlined && invalid && "border-destructive/60",
      )}
    >
      <input
        type="checkbox"
        aria-invalid={invalid || undefined}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:ring-2 aria-invalid:ring-destructive/40"
      />
      <span>{label}</span>
    </label>
  );
}

const controlClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

function canonicalDecimal(value: string) {
  return value.replace(",", ".");
}

function durationMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function clockMinutes(value: string) {
  return durationMinutes(value);
}

function formatDuration(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function effectiveWindowMinutes(
  startTime: string,
  endTime: string,
  endDayOffset: number,
) {
  if (!startTime || !endTime) return 0;
  return Math.max(
    0,
    endDayOffset * 1440 + clockMinutes(endTime) - clockMinutes(startTime),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00.000Z`),
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

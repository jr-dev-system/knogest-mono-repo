"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Shovel,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button } from "@/components/ui/button";
import { FormWizardProgress } from "@/components/ui/form-wizard-progress";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";
import { formatLoadCapacity } from "@/features/machines/capacity-format";
import {
  canonicalDecimalToBrazilian,
  decimalInputToCanonical,
  formatBrazilianDecimalInput,
} from "@/lib/brazilian-input-mask";

import {
  getProjectProductionTruckOptionsAction,
  saveProjectProductionAction,
  saveProjectProductionPairAction,
} from "../productions.actions";
import { calculateTruckPreview } from "../production-preview";
import {
  productionServiceLabel,
  productionUnitLabel,
} from "../production-labels";
import type {
  ProjectProductionCommand,
  ProjectProductionDetail,
  ProjectProductionOptions,
  ProjectProductionPairCommand,
  ProjectProductionTruckOption,
  ProjectProductionTruckOptionsPage,
} from "../productions.types";
import { LegacyProductionWizard } from "./project-production-wizard";

type Context = {
  productionDate: string;
  shift: "day" | "night";
  responsibleEmploymentId: string;
};
type TruckEntry = {
  trips: string;
  loadingMinutes: string;
  unloadingMinutes: string;
  dmtKm: string;
};
const emptyTruckEntry = (): TruckEntry => ({
  trips: "",
  loadingMinutes: "",
  unloadingMinutes: "",
  dmtKm: "",
});
type Draft = {
  productionDate: string;
  shift: "day" | "night";
  responsibleEmploymentId: string;
  climateConditions: Array<"dry" | "rain" | "waterlogged_soil">;
  workFrontId: string;
  workFrontServiceId: string;
  location: string;
  materialName: string;
  trucks: Record<string, TruckEntry>;
  destinationKind: "fill" | "disposal" | "other" | "";
  destinationWorkFrontId: string;
  destinationWorkFrontServiceId: string;
  fillMode: "direct" | "trucks";
  directQuantity: string;
  compactionReductionPercent: string;
};

const steps = [
  { title: "Atividade" },
  { title: "Caminhões e máquinas" },
  { title: "Destino e quantidade" },
  { title: "Revisão" },
];
const fieldClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold";

function initialDraft(
  options: ProjectProductionOptions,
  detail: ProjectProductionDetail | null,
  contextualEntry?: Context,
): Draft {
  const front =
    options.workFronts.find((item) => item.id === detail?.workFrontId) ??
    options.workFronts[0];
  return {
    productionDate:
      contextualEntry?.productionDate ??
      detail?.productionDate ??
      options.defaults.productionDate,
    shift: contextualEntry?.shift ?? detail?.shift ?? options.defaults.shift,
    responsibleEmploymentId:
      contextualEntry?.responsibleEmploymentId ??
      detail?.responsible?.employmentId ??
      options.responsibleOptions[0]?.id ??
      "",
    climateConditions: detail?.climateConditions ?? [],
    workFrontId: front?.id ?? "",
    workFrontServiceId:
      detail?.workFrontServiceId ?? front?.services[0]?.id ?? "",
    location: detail?.location ?? front?.location ?? "",
    materialName: detail?.materialName ?? "",
    trucks: Object.fromEntries(
      detail?.truckSummaries.map((item) => [
        item.machineId,
        {
          trips: String(item.acceptedTrips),
          loadingMinutes: item.averageLoadingMinutes
            ? canonicalDecimalToBrazilian(item.averageLoadingMinutes, 2)
            : "",
          unloadingMinutes: item.averageUnloadingMinutes
            ? canonicalDecimalToBrazilian(item.averageUnloadingMinutes, 2)
            : "",
          dmtKm: item.dmtKm ?? detail.dmtKm ?? "",
        },
      ]) ?? [],
    ),
    destinationKind: detail?.individualActivity?.destinationKind ?? "",
    destinationWorkFrontId:
      detail?.individualActivity?.destinationWorkFrontId ?? "",
    destinationWorkFrontServiceId: "",
    fillMode:
      !detail || detail.entryMode === "direct_total" ? "direct" : "trucks",
    directQuantity:
      detail?.entryMode === "direct_total" ? (detail.directQuantity ?? "") : "",
    compactionReductionPercent: detail?.individualActivity
      ?.compactionReductionPercent
      ? canonicalDecimalToBrazilian(
          detail.individualActivity.compactionReductionPercent,
          2,
        )
      : "",
  };
}

function canonical(value: string) {
  return value.trim().replace(",", ".");
}
function validPositive(value: string) {
  const normalized = canonical(value);
  return (
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(normalized) &&
    Number(normalized) > 0
  );
}
function validPositiveInteger(value: string) {
  return /^\d+$/u.test(value) && Number(value) > 0 && Number(value) <= 10_000;
}
function validMinuteSecondDuration(value: string) {
  const normalized = decimalInputToCanonical(value, 2);
  return /^(?!0\.00$)(?:(?:0|[1-9]\d{0,2}|1[0-3]\d{2}|14[0-3]\d)\.[0-5]\d|1440\.00)$/u.test(
    normalized,
  );
}
function validPercentage(value: string) {
  const normalized = decimalInputToCanonical(value, 2);
  return (
    /^(?:0|[1-9]\d?|100)\.\d{2}$/u.test(normalized) && Number(normalized) <= 100
  );
}
function capacityM3(value: string, unit: string) {
  const multiplier =
    unit === "LITER" ? 0.001 : unit === "CUBIC_YARD" ? 0.764555 : 1;
  return (Number(value) * multiplier).toFixed(3);
}
function scaled(value: string, digits: number) {
  const [whole, fraction = ""] = canonical(value).split(".");
  return (
    BigInt(whole || "0") * BigInt(10 ** digits) +
    BigInt((fraction + "0".repeat(digits)).slice(0, digits))
  );
}
function decimalFromScaled(value: bigint, digits: number) {
  const divisor = BigInt(10 ** digits);
  return `${value / divisor}.${(value % divisor).toString().padStart(digits, "0")}`;
}
function displayDecimal(value: string) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(
    Number(canonical(value)),
  );
}

function selectedTruckFromDetail(
  detail: ProjectProductionDetail,
  machineId: string,
): ProjectProductionTruckOption | null {
  const truck = detail.truckSummaries.find(
    (item) => item.machineId === machineId,
  );
  if (!truck) return null;
  return {
    id: truck.machineId,
    name: truck.machineName,
    manufacturer: "",
    model: "",
    identifier: truck.identifier,
    identifierKind: null,
    effectiveCapacity: truck.effectiveCapacity,
    capacityUnitCode: truck.capacityUnitCode,
    driver: truck.driver
      ? {
          id: truck.driver.employmentId,
          name: truck.driver.name ?? "Funcionário",
        }
      : null,
  };
}

export function ProjectProductionWizard(props: {
  contextualEntry?: Context;
  detail: ProjectProductionDetail | null;
  onContextChange: (
    productionDate: string,
    shift: "day" | "night",
  ) => Promise<ProjectProductionOptions>;
  onOpenChange: (open: boolean) => void;
  onSaved: (production: ProjectProductionDetail) => void;
  open: boolean;
  options: ProjectProductionOptions;
  projectId: string;
  lockActivityIdentity?: boolean;
  preventDismissal?: boolean;
  workflowActions?: React.ReactNode;
}) {
  const {
    contextualEntry,
    detail,
    onContextChange,
    onOpenChange,
    onSaved,
    open,
    options,
    projectId,
    lockActivityIdentity = false,
    preventDismissal = false,
    workflowActions,
  } = props;
  const isLegacy =
    detail &&
    (detail.kind === "material_movement" ||
      detail.evidence.length > 0 ||
      detail.qualityChecks.length > 0 ||
      detail.trips.length > 0 ||
      detail.individualActivity?.quantityMethod !== "manual");
  const [draft, setDraft] = React.useState(() =>
    initialDraft(options, detail, contextualEntry),
  );
  const [currentStep, setCurrentStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [truckPages, setTruckPages] = React.useState<
    ProjectProductionTruckOptionsPage[]
  >([]);
  const [truckPageIndex, setTruckPageIndex] = React.useState(0);
  const [selectedTrucks, setSelectedTrucks] = React.useState<
    Record<string, ProjectProductionTruckOption>
  >({});
  const [activeTruck, setActiveTruck] =
    React.useState<ProjectProductionTruckOption | null>(null);
  const [truckEntryDraft, setTruckEntryDraft] =
    React.useState<TruckEntry | null>(null);
  const [truckEntryError, setTruckEntryError] = React.useState("");
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    const next = initialDraft(options, detail, contextualEntry);
    setDraft(next);
    setCurrentStep(detail && !lockActivityIdentity ? 3 : 0);
    setError("");
    setTruckPages([]);
    setTruckPageIndex(0);
    setActiveTruck(null);
    setTruckEntryDraft(null);
    setTruckEntryError("");
    setSelectedTrucks(
      detail
        ? Object.fromEntries(
            Object.keys(next.trucks).flatMap((id) => {
              const truck = selectedTruckFromDetail(detail, id);
              return truck ? [[id, truck]] : [];
            }),
          )
        : {},
    );
  }, [open, options, detail, contextualEntry, lockActivityIdentity]);

  const front = options.workFronts.find(
    (item) => item.id === draft.workFrontId,
  );
  const service = front?.services.find(
    (item) => item.id === draft.workFrontServiceId,
  );
  const isCut = service?.serviceCode === "cut";
  const isFill =
    service?.serviceCode === "fill" ||
    service?.serviceCode === "replacement_fill";
  const isVolumetric = Boolean(service && /^M3(?:_|$)/u.test(service.unitCode));
  const usesTrucks = isVolumetric && (!isFill || draft.fillMode === "trucks");
  const editable = !detail || detail.status === "draft";
  const destinationFront = options.workFronts.find(
    (item) => item.id === draft.destinationWorkFrontId,
  );
  const fillFronts = options.workFronts
    .map((item) => ({
      ...item,
      fillServices: item.services.filter(
        (candidate) => candidate.serviceCode === "fill",
      ),
    }))
    .filter(
      (item) => item.fillServices.length > 0 && item.id !== draft.workFrontId,
    );
  const selectedTruckList = Object.values(selectedTrucks).filter(
    (truck) => draft.trucks[truck.id],
  );

  const totals = React.useMemo(() => {
    let volume = BigInt(0);
    let moment = BigInt(0);
    let trips = 0;
    for (const truck of selectedTruckList) {
      const entry = draft.trucks[truck.id];
      if (!entry || !validPositiveInteger(entry.trips)) continue;
      const truckVolume = scaled(
        calculateTruckPreview({
          capacity: capacityM3(truck.effectiveCapacity, truck.capacityUnitCode),
          acceptedTrips: Number(entry.trips),
          partialTripCount: 0,
          partialVolume: "0",
          loadFactor: "1",
          actualWeightT: null,
        }),
        3,
      );
      volume += truckVolume;
      trips += Number(entry.trips);
      if (validPositive(entry.dmtKm))
        moment += truckVolume * scaled(entry.dmtKm, 3);
    }
    const percentage = validPercentage(draft.compactionReductionPercent)
      ? scaled(decimalInputToCanonical(draft.compactionReductionPercent, 2), 2)
      : null;
    const retainedPercentage =
      percentage === null ? null : BigInt(10_000) - percentage;
    const fillVolume =
      retainedPercentage !== null
        ? decimalFromScaled(
            (volume * retainedPercentage + BigInt(5_000)) / BigInt(10_000),
            3,
          )
        : null;
    return {
      fillVolume,
      looseVolume: decimalFromScaled(volume, 3),
      transportMoment: decimalFromScaled(
        (moment + BigInt(500)) / BigInt(1000),
        3,
      ),
      trips,
      weightedDmt:
        volume > BigInt(0)
          ? decimalFromScaled((moment + volume / BigInt(2)) / volume, 3)
          : "0.000",
    };
  }, [draft.compactionReductionPercent, draft.trucks, selectedTruckList]);

  if (isLegacy) return <LegacyProductionWizard {...props} />;

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  }

  async function loadTruckPage(cursor?: string) {
    setBusy(true);
    try {
      const page = await getProjectProductionTruckOptionsAction({
        projectId,
        productionDate: draft.productionDate,
        shift: draft.shift,
        cursor,
      });
      setTruckPages((current) => (cursor ? [...current, page] : [page]));
      return true;
    } catch {
      setError("Não foi possível carregar os caminhões deste turno.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function nextTruckPage() {
    const cached = truckPages[truckPageIndex + 1];
    if (cached) return setTruckPageIndex((current) => current + 1);
    const cursor = truckPages[truckPageIndex]?.pageInfo.nextCursor;
    if (cursor && (await loadTruckPage(cursor)))
      setTruckPageIndex((current) => current + 1);
  }
  function beginTruckEditing(truck: ProjectProductionTruckOption) {
    setActiveTruck(truck);
    setTruckEntryDraft(draft.trucks[truck.id] ?? emptyTruckEntry());
    setTruckEntryError("");
  }
  function cancelTruckEditing() {
    setActiveTruck(null);
    setTruckEntryDraft(null);
    setTruckEntryError("");
  }
  function confirmTruckEditing() {
    if (!activeTruck || !truckEntryDraft) return;
    if (!validPositiveInteger(truckEntryDraft.trips)) {
      setTruckEntryError("Informe uma quantidade válida de viagens.");
      return;
    }
    if (!validMinuteSecondDuration(truckEntryDraft.loadingMinutes)) {
      setTruckEntryError(
        "Informe o carregamento em minutos e segundos, com segundos entre 00 e 59.",
      );
      return;
    }
    if (!validMinuteSecondDuration(truckEntryDraft.unloadingMinutes)) {
      setTruckEntryError(
        "Informe a descarga em minutos e segundos, com segundos entre 00 e 59.",
      );
      return;
    }
    if (!validPositive(truckEntryDraft.dmtKm)) {
      setTruckEntryError("Informe um DMT médio válido.");
      return;
    }
    setSelectedTrucks((current) => ({
      ...current,
      [activeTruck.id]: activeTruck,
    }));
    update({
      trucks: {
        ...draft.trucks,
        [activeTruck.id]: truckEntryDraft,
      },
    });
    cancelTruckEditing();
  }
  function removeTruck(truck: ProjectProductionTruckOption) {
    const next = { ...draft.trucks };
    delete next[truck.id];
    update({ trucks: next });
    setSelectedTrucks((current) => {
      const selected = { ...current };
      delete selected[truck.id];
      return selected;
    });
  }
  function updateTruckEntryDraft(patch: Partial<TruckEntry>) {
    setTruckEntryDraft((current) =>
      current ? { ...current, ...patch } : current,
    );
    setTruckEntryError("");
  }

  function validateStep(step: number) {
    if (step === 0) {
      if (!front || !service)
        return "Selecione uma frente ativa e uma atividade.";
      if (!draft.responsibleEmploymentId)
        return "Selecione o responsável pelo registro.";
      if (!draft.climateConditions.length)
        return "Selecione pelo menos uma condição climática.";
    }
    if (step === 1 && usesTrucks) {
      if (!selectedTruckList.length) return "Adicione pelo menos um caminhão.";
      for (const truck of selectedTruckList) {
        const entry = draft.trucks[truck.id]!;
        if (!validPositiveInteger(entry.trips))
          return `Informe as viagens de ${truck.name}.`;
        if (!validMinuteSecondDuration(entry.loadingMinutes))
          return `Informe o tempo médio de carregamento de ${truck.name}.`;
        if (!validMinuteSecondDuration(entry.unloadingMinutes))
          return `Informe o tempo médio de descarga de ${truck.name}.`;
        if (!validPositive(entry.dmtKm))
          return `Informe o DMT de ${truck.name}.`;
      }
    }
    if (step === 2) {
      if (isCut && !draft.destinationKind)
        return "Selecione o destino do material.";
      if (isCut && draft.destinationKind === "fill") {
        if (!destinationFront || !draft.destinationWorkFrontServiceId)
          return "Selecione a frente de aterro de destino.";
        if (!validPercentage(draft.compactionReductionPercent))
          return "Informe uma redução por compactação entre 0,00% e 100,00%.";
      }
      if (
        isFill &&
        usesTrucks &&
        !validPercentage(draft.compactionReductionPercent)
      )
        return "Informe uma redução por compactação entre 0,00% e 100,00%.";
      if (!usesTrucks && !validPositive(draft.directQuantity))
        return "Informe uma quantidade positiva.";
    }
    return "";
  }
  function goNext() {
    const issue = validateStep(currentStep);
    if (issue) return setError(issue);
    setError("");
    if (currentStep === 0 && usesTrucks && !truckPages.length)
      void loadTruckPage();
    setCurrentStep((current) => Math.min(3, current + 1));
  }

  async function changeContext(date: string, shift: "day" | "night") {
    if (
      !window.confirm(
        "Trocar data ou turno descarta os campos deste lançamento. Continuar?",
      )
    )
      return;
    setBusy(true);
    try {
      const next = await onContextChange(date, shift);
      setDraft(initialDraft(next, null, contextualEntry));
      setSelectedTrucks({});
      setTruckPages([]);
      setTruckPageIndex(0);
      cancelTruckEditing();
      setCurrentStep(0);
    } catch {
      setError("Não foi possível carregar as opções deste turno.");
    } finally {
      setBusy(false);
    }
  }

  function truckSummaries(): NonNullable<
    ProjectProductionCommand["truckSummaries"]
  > {
    return selectedTruckList.map((truck) => {
      const entry = draft.trucks[truck.id]!;
      return {
        machineId: truck.id,
        driverEmploymentId: truck.driver?.id ?? null,
        acceptedTrips: Number(entry.trips),
        rejectedTrips: 0,
        partialTripCount: 0,
        partialVolume: "0",
        loadFactor: "1",
        actualWeightT: null,
        averageCycleMinutes: null,
        averageLoadingMinutes: decimalInputToCanonical(entry.loadingMinutes, 2),
        averageUnloadingMinutes: decimalInputToCanonical(
          entry.unloadingMinutes,
          2,
        ),
        dmtKm: canonical(entry.dmtKm),
        occurrenceNotes: null,
      };
    });
  }
  function buildCommand(submitNow: boolean): ProjectProductionCommand {
    return {
      kind: "individual_activity",
      entryMode: usesTrucks ? "truck_summary" : "direct_total",
      productionDate: draft.productionDate,
      shift: draft.shift,
      responsibleEmploymentId: draft.responsibleEmploymentId,
      source:
        detail?.source ??
        (contextualEntry ? "operational_center" : "production_page"),
      climateConditions: draft.climateConditions,
      expectedRevision: detail?.revision,
      submitNow,
      equipment: [],
      truckSummaries: usesTrucks ? truckSummaries() : [],
      individualActivity: {
        workFrontId: draft.workFrontId,
        workFrontServiceId: draft.workFrontServiceId,
        quantityMethod: "manual",
        location: draft.location || null,
        materialName: draft.materialName || null,
        volumeCondition: isFill ? "compacted" : isVolumetric ? "loose" : null,
        operationalQuantity: usesTrucks
          ? null
          : canonical(draft.directQuantity),
        dmtKm: usesTrucks ? totals.weightedDmt : null,
        compactionReductionPercent:
          isFill && usesTrucks
            ? decimalInputToCanonical(draft.compactionReductionPercent, 2)
            : null,
        destinationKind:
          isCut && draft.destinationKind ? draft.destinationKind : null,
        destinationWorkFrontId:
          isCut && draft.destinationKind === "fill"
            ? draft.destinationWorkFrontId
            : null,
      },
    };
  }
  async function save(submitNow: boolean) {
    for (let step = 0; step < 3; step += 1) {
      const issue = validateStep(step);
      if (issue) {
        setCurrentStep(step);
        setError(issue);
        return;
      }
    }
    setBusy(true);
    try {
      if (isCut && draft.destinationKind === "fill") {
        const cut = buildCommand(submitNow);
        const fill: ProjectProductionCommand = {
          kind: "individual_activity",
          entryMode: "direct_total",
          productionDate: draft.productionDate,
          shift: draft.shift,
          responsibleEmploymentId: draft.responsibleEmploymentId,
          source:
            detail?.source ??
            (contextualEntry ? "operational_center" : "production_page"),
          climateConditions: draft.climateConditions,
          submitNow,
          equipment: [],
          truckSummaries: [],
          individualActivity: {
            workFrontId: draft.destinationWorkFrontId,
            workFrontServiceId: draft.destinationWorkFrontServiceId,
            quantityMethod: "manual",
            location: destinationFront?.location ?? null,
            materialName: draft.materialName || null,
            volumeCondition: "compacted",
            operationalQuantity: totals.fillVolume,
            dmtKm: null,
            compactionReductionPercent: decimalInputToCanonical(
              draft.compactionReductionPercent,
              2,
            ),
            destinationKind: null,
            destinationWorkFrontId: null,
          },
        };
        const result = await saveProjectProductionPairAction({
          projectId,
          command: { cut, fill } as ProjectProductionPairCommand,
        });
        if (result.kind === "failure") return setError(result.message);
        onSaved(result.productions.fill);
        onSaved(result.productions.cut);
      } else {
        const result = await saveProjectProductionAction({
          projectId,
          productionId: detail?.id,
          command: buildCommand(submitNow),
        });
        if (result.kind === "failure") return setError(result.message);
        onSaved(result.production);
      }
      toast.success(submitNow ? "Produção confirmada." : "Rascunho salvo.");
      onOpenChange(false);
    } catch {
      setError("Não foi possível salvar a produção.");
    } finally {
      setBusy(false);
    }
  }

  const page = truckPages[truckPageIndex];
  return (
    <OperationsModal
      open={open}
      onOpenChange={onOpenChange}
      preventDismissal={preventDismissal}
      size="xl"
      icon={Shovel}
      title={detail ? "Produção de terraplanagem" : "Nova produção"}
      description="Registre a atividade em quatro etapas e confira tudo antes de confirmar."
      footer={
        <div className="flex w-full flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy || Boolean(activeTruck)}
          >
            Fechar
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {editable && currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep((step) => step - 1)}
                disabled={busy || Boolean(activeTruck)}
              >
                <ChevronLeft /> Voltar
              </Button>
            )}
            {editable && currentStep < 3 && (
              <Button
                type="button"
                onClick={goNext}
                disabled={
                  busy || Boolean(activeTruck) || !options.workFronts.length
                }
              >
                Avançar <ChevronRight />
              </Button>
            )}
            {editable && currentStep === 3 && (
              <>
                {contextualEntry || detail?.source === "operational_center" ? (
                  <Button
                    type="button"
                    onClick={() => void save(false)}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Check />}{" "}
                    Salvar produção
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void save(false)}
                      disabled={busy}
                    >
                      Salvar rascunho
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void save(true)}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <Check />}{" "}
                      Confirmar produção
                    </Button>
                  </>
                )}
              </>
            )}
            {!editable && workflowActions}
          </div>
        </div>
      }
    >
      <div className="grid gap-5">
        <FormWizardProgress currentStep={currentStep} steps={steps} />
        <FormErrorDeclaration
          title="Revise os dados desta etapa."
          description="Corrija o ponto indicado antes de continuar."
          issues={
            error
              ? [
                  {
                    location: steps[currentStep]?.title ?? "Produção",
                    message: error,
                  },
                ]
              : []
          }
        />
        {!options.workFronts.length && (
          <p role="alert">
            Inicie uma frente de serviço antes de registrar produção.
          </p>
        )}

        {currentStep === 0 && (
          <div className="grid gap-4">
            {!contextualEntry && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm font-semibold">
                  Data
                  <Input
                    type="date"
                    min={options.dateLimits.minimum}
                    max={options.dateLimits.maximum}
                    value={draft.productionDate}
                    onChange={(event) =>
                      void changeContext(event.target.value, draft.shift)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Turno
                  <select
                    className={fieldClass}
                    value={draft.shift}
                    onChange={(event) =>
                      void changeContext(
                        draft.productionDate,
                        event.target.value as "day" | "night",
                      )
                    }
                  >
                    <option value="day">Diurno</option>
                    <option value="night">Noturno</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Responsável
                  <select
                    className={fieldClass}
                    value={draft.responsibleEmploymentId}
                    onChange={(event) =>
                      update({ responsibleEmploymentId: event.target.value })
                    }
                  >
                    <option value="">Selecione</option>
                    {options.responsibleOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                Frente
                <select
                  className={fieldClass}
                  disabled={lockActivityIdentity}
                  value={draft.workFrontId}
                  onChange={(event) => {
                    const next = options.workFronts.find(
                      (item) => item.id === event.target.value,
                    );
                    update({
                      workFrontId: event.target.value,
                      workFrontServiceId: next?.services[0]?.id ?? "",
                      location: next?.location ?? "",
                      trucks: {},
                      destinationKind: "",
                      destinationWorkFrontId: "",
                      destinationWorkFrontServiceId: "",
                      compactionReductionPercent: "",
                    });
                    setSelectedTrucks({});
                    setTruckPages([]);
                    cancelTruckEditing();
                  }}
                >
                  {options.workFronts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Atividade
                <select
                  className={fieldClass}
                  disabled={lockActivityIdentity}
                  value={draft.workFrontServiceId}
                  onChange={(event) => {
                    update({
                      workFrontServiceId: event.target.value,
                      trucks: {},
                      directQuantity: "",
                      destinationKind: "",
                      destinationWorkFrontId: "",
                      destinationWorkFrontServiceId: "",
                      compactionReductionPercent: "",
                    });
                    setSelectedTrucks({});
                    cancelTruckEditing();
                  }}
                >
                  {front?.services.map((item) => (
                    <option key={item.id} value={item.id}>
                      {productionServiceLabel(item.serviceCode)} ·{" "}
                      {productionUnitLabel(item.unitCode)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Local
                <Input
                  disabled={lockActivityIdentity}
                  value={draft.location}
                  onChange={(event) => update({ location: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Material
                <Input
                  disabled={lockActivityIdentity}
                  value={draft.materialName}
                  onChange={(event) =>
                    update({ materialName: event.target.value })
                  }
                />
              </label>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-bold">Condição climática</legend>
              <p className="text-sm text-muted-foreground">
                Selecione as condições observadas durante esta produção.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["dry", "Seco"],
                    ["rain", "Chuva"],
                    ["waterlogged_soil", "Solo encharcado"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex min-h-11 items-center gap-3 rounded-md border bg-background px-3 text-sm font-semibold"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={draft.climateConditions.includes(value)}
                      onChange={(event) =>
                        update({
                          climateConditions: event.target.checked
                            ? [...draft.climateConditions, value]
                            : draft.climateConditions.filter(
                                (condition) => condition !== value,
                              ),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {currentStep === 1 && (
          <div className="grid gap-5">
            {usesTrucks && (
              <section className="grid gap-3">
                <div>
                  <h3 className="font-bold">Caminhões</h3>
                  <p className="text-sm text-muted-foreground">
                    Selecione na lista paginada e configure os dados
                    operacionais de cada caminhão.
                  </p>
                </div>
                <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-2.5 sm:p-3">
                  {busy && !page ? (
                    <p className="text-sm">Carregando caminhões…</p>
                  ) : activeTruck && truckEntryDraft ? (
                    <article
                      aria-label={`Configurar ${activeTruck.name}`}
                      className="grid min-w-0 gap-4 rounded-lg border border-primary/35 bg-primary/[0.035] p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out sm:p-4"
                    >
                      <div className="grid min-w-0 gap-3 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div className="min-w-0">
                          <p className="break-words font-bold">
                            {activeTruck.name}
                          </p>
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {activeTruck.identifier
                              ? `${activeTruck.identifierKind === "PLATE" ? "Placa" : "Patrimônio"}: ${activeTruck.identifier} · `
                              : ""}
                            {activeTruck.manufacturer} {activeTruck.model} ·{" "}
                            {activeTruck.driver?.name ??
                              "Sem funcionário alocado"}
                          </p>
                        </div>
                        <span className="inline-flex min-h-8 w-fit items-center rounded-md bg-primary px-2.5 text-sm font-bold text-primary-foreground">
                          Em configuração
                        </span>
                      </div>
                      <div
                        role="group"
                        aria-label={`Dados operacionais de ${activeTruck.name}`}
                        className="grid min-w-0 gap-x-4 gap-y-3 sm:grid-cols-2"
                      >
                        <label className="grid min-w-0 gap-1 text-sm font-semibold">
                          Viagens
                          <Input
                            autoFocus
                            aria-label={`Viagens de ${activeTruck.name}`}
                            type="number"
                            min={1}
                            max={10000}
                            value={truckEntryDraft.trips}
                            onChange={(event) =>
                              updateTruckEntryDraft({
                                trips: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="grid min-w-0 gap-1 text-sm font-semibold">
                          Carga média (min,ss)
                          <Input
                            aria-label={`Carga média de ${activeTruck.name}`}
                            inputMode="decimal"
                            placeholder="0,00"
                            value={truckEntryDraft.loadingMinutes}
                            onChange={(event) =>
                              updateTruckEntryDraft({
                                loadingMinutes: formatBrazilianDecimalInput(
                                  event.target.value,
                                  2,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="grid min-w-0 gap-1 text-sm font-semibold">
                          Descarga média (min,ss)
                          <Input
                            aria-label={`Descarga média de ${activeTruck.name}`}
                            inputMode="decimal"
                            placeholder="0,00"
                            value={truckEntryDraft.unloadingMinutes}
                            onChange={(event) =>
                              updateTruckEntryDraft({
                                unloadingMinutes: formatBrazilianDecimalInput(
                                  event.target.value,
                                  2,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="grid min-w-0 gap-1 text-sm font-semibold">
                          DMT médio (km)
                          <Input
                            aria-label={`DMT médio de ${activeTruck.name}`}
                            inputMode="decimal"
                            value={truckEntryDraft.dmtKm}
                            onChange={(event) =>
                              updateTruckEntryDraft({
                                dmtKm: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <FormErrorDeclaration
                        title="Revise os dados do caminhão."
                        description="Preencha os dados operacionais para confirmar a seleção."
                        issues={
                          truckEntryError
                            ? [
                                {
                                  location: activeTruck.name,
                                  message: truckEntryError,
                                },
                              ]
                            : []
                        }
                      />
                      <div className="grid gap-2 border-t border-border pt-3 sm:flex sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 w-full sm:min-h-9 sm:w-auto"
                          onClick={cancelTruckEditing}
                        >
                          <X /> Cancelar
                        </Button>
                        <Button
                          type="button"
                          className="min-h-11 w-full sm:min-h-9 sm:w-auto"
                          onClick={confirmTruckEditing}
                        >
                          <Check /> Confirmar caminhão
                        </Button>
                      </div>
                    </article>
                  ) : (
                    page?.data.map((truck) => {
                      const entry = draft.trucks[truck.id];
                      return entry ? (
                        <article
                          key={truck.id}
                          className="flex min-h-14 flex-wrap items-center gap-3 rounded-md border border-primary/35 bg-primary/[0.035] p-3"
                        >
                          <Check className="size-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1 text-sm">
                            <strong className="block">{truck.name}</strong>
                            <span className="text-muted-foreground">
                              {entry.trips} viagem(ns) · {entry.loadingMinutes}/
                              {entry.unloadingMinutes} min · DMT {entry.dmtKm}{" "}
                              km
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            aria-label={`Editar ${truck.name}`}
                            onClick={() => beginTruckEditing(truck)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Remover ${truck.name}`}
                            onClick={() => removeTruck(truck)}
                          >
                            <Trash2 />
                          </Button>
                        </article>
                      ) : (
                        <label
                          key={truck.id}
                          className="flex min-h-14 cursor-pointer items-start gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={false}
                            onChange={(event) =>
                              event.target.checked && beginTruckEditing(truck)
                            }
                          />
                          <span className="min-w-0 text-sm">
                            <strong className="block">{truck.name}</strong>
                            <span className="text-muted-foreground">
                              {truck.identifier
                                ? `${truck.identifierKind === "PLATE" ? "Placa" : "Patrimônio"}: ${truck.identifier} · `
                                : ""}
                              {truck.manufacturer} {truck.model} ·{" "}
                              {truck.driver?.name ?? "Sem funcionário alocado"}{" "}
                              ·{" "}
                              {formatLoadCapacity(
                                truck.effectiveCapacity,
                                truck.capacityUnitCode,
                              )}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                  {!activeTruck && !busy && page && !page.data.length && (
                    <p className="text-sm">
                      Nenhum caminhão disponível neste turno.
                    </p>
                  )}
                  {!activeTruck &&
                    page &&
                    (truckPageIndex > 0 || page.pageInfo.hasNextPage) && (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={truckPageIndex === 0 || busy}
                          onClick={() =>
                            setTruckPageIndex((index) => index - 1)
                          }
                        >
                          <ChevronLeft /> Anterior
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!page.pageInfo.hasNextPage || busy}
                          onClick={() => void nextTruckPage()}
                        >
                          Próxima <ChevronRight />
                        </Button>
                      </div>
                    )}
                </div>
                <p className="rounded-md bg-secondary p-3 text-sm font-semibold">
                  {totals.trips} viagem(ns) ·{" "}
                  {displayDecimal(totals.looseVolume)} m³ solto · DMT ponderado{" "}
                  {displayDecimal(totals.weightedDmt)} km ·{" "}
                  {displayDecimal(totals.transportMoment)} m³·km
                </p>
              </section>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div className="grid gap-4">
            {isCut ? (
              <>
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-bold">
                    Destino do material
                  </legend>
                  {(["fill", "disposal", "other"] as const).map((kind) => (
                    <label
                      key={kind}
                      className="flex gap-2 rounded-md border p-3"
                    >
                      <input
                        type="radio"
                        name="destination"
                        checked={draft.destinationKind === kind}
                        onChange={() =>
                          update({
                            destinationKind: kind,
                            destinationWorkFrontId: "",
                            destinationWorkFrontServiceId: "",
                            compactionReductionPercent:
                              kind === "fill"
                                ? draft.compactionReductionPercent
                                : "",
                          })
                        }
                      />
                      {kind === "fill"
                        ? "Aterro"
                        : kind === "disposal"
                          ? "Descarte"
                          : "Outro"}
                    </label>
                  ))}
                </fieldset>
                {draft.destinationKind === "fill" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm font-semibold">
                      Frente de aterro
                      <select
                        className={fieldClass}
                        value={draft.destinationWorkFrontId}
                        onChange={(event) => {
                          const selected = fillFronts.find(
                            (item) => item.id === event.target.value,
                          );
                          update({
                            destinationWorkFrontId: event.target.value,
                            destinationWorkFrontServiceId:
                              selected?.fillServices[0]?.id ?? "",
                          });
                        }}
                      >
                        <option value="">Selecione</option>
                        {fillFronts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Redução por compactação (%)
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={draft.compactionReductionPercent}
                        onChange={(event) =>
                          update({
                            compactionReductionPercent:
                              formatBrazilianDecimalInput(
                                event.target.value,
                                2,
                              ),
                          })
                        }
                      />
                    </label>
                    <p className="rounded-md bg-secondary p-4 sm:col-span-2">
                      <strong>Volume final de aterro:</strong>{" "}
                      {totals.fillVolume
                        ? displayDecimal(totals.fillVolume)
                        : "—"}{" "}
                      m³ compactado
                    </p>
                  </div>
                )}
              </>
            ) : isFill ? (
              <>
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-bold">
                    Quantidade do aterro
                  </legend>
                  <label className="flex gap-2">
                    <input
                      type="radio"
                      checked={draft.fillMode === "direct"}
                      onChange={() => update({ fillMode: "direct" })}
                    />
                    Volume direto
                  </label>
                  <label className="flex gap-2">
                    <input
                      type="radio"
                      checked={draft.fillMode === "trucks"}
                      onChange={() => update({ fillMode: "trucks" })}
                    />
                    Carradas e compactação
                  </label>
                </fieldset>
                {usesTrucks ? (
                  <label className="grid gap-1 text-sm font-semibold">
                    Redução por compactação (%)
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={draft.compactionReductionPercent}
                      onChange={(event) =>
                        update({
                          compactionReductionPercent:
                            formatBrazilianDecimalInput(event.target.value, 2),
                        })
                      }
                    />
                  </label>
                ) : (
                  <label className="grid gap-1 text-sm font-semibold">
                    Quantidade {productionUnitLabel(service?.unitCode ?? "")}
                    <Input
                      inputMode="decimal"
                      value={draft.directQuantity}
                      onChange={(event) =>
                        update({ directQuantity: event.target.value })
                      }
                    />
                  </label>
                )}
              </>
            ) : !usesTrucks ? (
              <label className="grid gap-1 text-sm font-semibold">
                Quantidade {productionUnitLabel(service?.unitCode ?? "")}
                <Input
                  inputMode="decimal"
                  value={draft.directQuantity}
                  onChange={(event) =>
                    update({ directQuantity: event.target.value })
                  }
                />
              </label>
            ) : (
              <p className="rounded-md bg-secondary p-4">
                Volume calculado: {displayDecimal(totals.looseVolume)} m³
              </p>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="grid gap-2">
            <ReviewRow
              label="Atividade"
              value={`${productionServiceLabel(service?.serviceCode ?? detail?.serviceCode ?? "—")} · ${front?.name ?? "—"}`}
              step={0}
              editable={editable}
              go={setCurrentStep}
            />
            <ReviewRow
              label="Local e material"
              value={`${draft.location || "Não informado"} · ${draft.materialName || "Não informado"}`}
              step={0}
              editable={editable}
              go={setCurrentStep}
            />
            <ReviewRow
              label="Caminhões"
              value={`${selectedTruckList.length} selecionado(s) · ${totals.trips} viagem(ns)`}
              step={1}
              editable={editable}
              go={setCurrentStep}
            />
            {selectedTruckList.map((truck) => {
              const entry = draft.trucks[truck.id]!;
              return (
                <ReviewRow
                  key={truck.id}
                  label={truck.name}
                  value={`${entry.trips} viagens · carga ${entry.loadingMinutes} min · descarga ${entry.unloadingMinutes} min · DMT ${displayDecimal(entry.dmtKm)} km`}
                  step={1}
                  editable={editable}
                  go={setCurrentStep}
                />
              );
            })}
            {isCut && (
              <ReviewRow
                label="Destino"
                value={
                  draft.destinationKind === "fill"
                    ? `Aterro · ${destinationFront?.name ?? "—"}`
                    : draft.destinationKind === "disposal"
                      ? "Descarte"
                      : "Outro"
                }
                step={2}
                editable={editable}
                go={setCurrentStep}
              />
            )}
            {isCut && draft.destinationKind === "fill" && (
              <ReviewRow
                label="Produção de aterro"
                value={`${totals.fillVolume ? displayDecimal(totals.fillVolume) : "—"} m³ compactado · redução ${draft.compactionReductionPercent || "—"}%`}
                step={2}
                editable={editable}
                go={setCurrentStep}
              />
            )}
            <ReviewRow
              label="Volume transportado"
              value={`${displayDecimal(totals.looseVolume)} m³ solto · ${displayDecimal(totals.transportMoment)} m³·km`}
              step={2}
              editable={editable}
              go={setCurrentStep}
            />
            {!usesTrucks && (
              <ReviewRow
                label="Quantidade"
                value={`${displayDecimal(draft.directQuantity)} ${productionUnitLabel(service?.unitCode ?? detail?.unitCode ?? "")}`}
                step={2}
                editable={editable}
                go={setCurrentStep}
              />
            )}
          </div>
        )}
      </div>
    </OperationsModal>
  );
}

function ReviewRow({
  editable,
  go,
  label,
  step,
  value,
}: {
  editable: boolean;
  go: (step: number) => void;
  label: string;
  step: number;
  value: string;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <strong className="block">{label}</strong>
        <span className="text-muted-foreground">{value}</span>
      </span>
      {editable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Editar ${label}`}
          onClick={() => go(step)}
        >
          <Pencil />
        </Button>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Check, Loader2, Shovel } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";
import { formatLoadCapacity } from "@/features/machines/capacity-format";

import { saveProjectProductionAction } from "../productions.actions";
import { calculateTruckPreview } from "../production-preview";
import { productionServiceLabel, productionUnitLabel } from "../production-labels";
import type {
  ProjectProductionCommand,
  ProjectProductionDetail,
  ProjectProductionOptions,
} from "../productions.types";
import { LegacyProductionWizard } from "./project-production-wizard";

type Context = {
  productionDate: string;
  shift: "day" | "night";
  responsibleEmploymentId: string;
};

type Draft = {
  productionDate: string;
  shift: "day" | "night";
  responsibleEmploymentId: string;
  workFrontId: string;
  workFrontServiceId: string;
  location: string;
  materialName: string;
  selectedMachineIds: string[];
  trips: Record<string, string>;
  dmtKm: string;
  fillMode: "direct" | "trucks";
  directQuantity: string;
  swellFactor: string;
};

const fieldClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold";

function initialDraft(
  options: ProjectProductionOptions,
  detail: ProjectProductionDetail | null,
  contextualEntry?: Context,
): Draft {
  const front = options.workFronts.find((item) => item.id === detail?.workFrontId)
    ?? options.workFronts[0];
  return {
    productionDate: contextualEntry?.productionDate ?? detail?.productionDate ?? options.defaults.productionDate,
    shift: contextualEntry?.shift ?? detail?.shift ?? options.defaults.shift,
    responsibleEmploymentId: contextualEntry?.responsibleEmploymentId ?? detail?.responsible?.employmentId ?? options.responsibleOptions[0]?.id ?? "",
    workFrontId: front?.id ?? "",
    workFrontServiceId: detail?.workFrontServiceId ?? front?.services[0]?.id ?? "",
    location: detail?.location ?? front?.location ?? "",
    materialName: detail?.materialName ?? "",
    selectedMachineIds: detail?.equipment.map((item) => item.machineId) ?? [],
    trips: Object.fromEntries(detail?.truckSummaries.map((item) => [item.machineId, String(item.acceptedTrips)]) ?? []),
    dmtKm: detail?.dmtKm ?? "",
    fillMode: detail?.entryMode === "direct_total" ? "direct" : "trucks",
    directQuantity: detail?.entryMode === "direct_total" ? detail.directQuantity ?? "" : "",
    swellFactor: detail?.conversionFactor ?? "",
  };
}

function canonical(value: string) {
  return value.trim().replace(",", ".");
}

function validPositive(value: string) {
  const normalized = canonical(value);
  return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(normalized) && Number(normalized) > 0;
}

function capacityM3(value: string, unit: string) {
  const multiplier = unit === "LITER" ? 0.001 : unit === "CUBIC_YARD" ? 0.764555 : 1;
  return (Number(value) * multiplier).toFixed(3);
}

function scaled(value: string, digits: number) {
  const [whole, fraction = ""] = canonical(value).split(".");
  return BigInt(whole || "0") * BigInt(10 ** digits) + BigInt((fraction + "0".repeat(digits)).slice(0, digits));
}

function decimalFromScaled(value: bigint, digits: number) {
  const divisor = BigInt(10 ** digits);
  return `${value / divisor}.${(value % divisor).toString().padStart(digits, "0")}`;
}

function displayDecimal(value: string) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(Number(canonical(value)));
}

function earthworkTrucks(front: ProjectProductionOptions["workFronts"][number] | undefined) {
  return (front?.trucks ?? []).filter((truck) => truck.capacityUnitCode !== "LITER");
}

function preview(draft: Draft, front: ProjectProductionOptions["workFronts"][number] | undefined, isFill: boolean, usesTrucks: boolean) {
  if (!usesTrucks) return { looseVolume: null, quantity: validPositive(draft.directQuantity) ? canonical(draft.directQuantity) : null, moment: null, tripCount: 0 };
  const selected = earthworkTrucks(front).filter((truck) => Number(draft.trips[truck.id]) > 0);
  const tripCount = selected.reduce((sum, truck) => sum + Number(draft.trips[truck.id]), 0);
  const loose = selected.reduce((sum, truck) => sum + scaled(calculateTruckPreview({
    capacity: capacityM3(truck.effectiveCapacity, truck.capacityUnitCode),
    acceptedTrips: Number(draft.trips[truck.id]),
    partialTripCount: 0,
    partialVolume: "0",
    loadFactor: "1",
    actualWeightT: null,
  }), 3), BigInt(0));
  const factor = validPositive(draft.swellFactor) ? scaled(draft.swellFactor, 6) : BigInt(0);
  const quantity = isFill && factor > BigInt(0)
    ? decimalFromScaled((loose * BigInt(1_000_000) + factor / BigInt(2)) / factor, 3)
    : decimalFromScaled(loose, 3);
  const dmt = validPositive(draft.dmtKm) ? scaled(draft.dmtKm, 3) : BigInt(0);
  const moment = dmt > BigInt(0)
    ? decimalFromScaled((loose * dmt + BigInt(500)) / BigInt(1000), 3)
    : null;
  return { looseVolume: decimalFromScaled(loose, 3), quantity, moment, tripCount };
}

export function ProjectProductionWizard(props: {
  contextualEntry?: Context;
  detail: ProjectProductionDetail | null;
  onContextChange: (productionDate: string, shift: "day" | "night") => Promise<ProjectProductionOptions>;
  onOpenChange: (open: boolean) => void;
  onSaved: (production: ProjectProductionDetail) => void;
  open: boolean;
  options: ProjectProductionOptions;
  projectId: string;
  workflowActions?: React.ReactNode;
}) {
  const { contextualEntry, detail, onContextChange, onOpenChange, onSaved, open, options, projectId, workflowActions } = props;
  const isLegacy = detail && (detail.kind === "material_movement" || detail.evidence.length > 0 || detail.qualityChecks.length > 0 || detail.trips.length > 0 || detail.individualActivity?.quantityMethod !== "manual");
  const [draft, setDraft] = React.useState(() => initialDraft(options, detail, contextualEntry));
  const [review, setReview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (!open) { initialized.current = false; return; }
    if (initialized.current) return;
    initialized.current = true;
    setDraft(initialDraft(options, detail, contextualEntry));
    setReview(false);
    setError("");
  }, [open, options, detail, contextualEntry]);

  if (isLegacy) return <LegacyProductionWizard {...props} />;

  const front = options.workFronts.find((item) => item.id === draft.workFrontId);
  const service = front?.services.find((item) => item.id === draft.workFrontServiceId);
  const isFill = service?.serviceCode === "fill" || service?.serviceCode === "replacement_fill";
  const isVolumetric = Boolean(service && /^M3(?:_|$)/u.test(service.unitCode));
  const usesTrucks = isVolumetric && (!isFill || draft.fillMode === "trucks");
  const totals = preview(draft, front, isFill, usesTrucks);
  const editable = !detail || detail.status === "draft";
  const machines = front?.equipment ?? [];

  function update(patch: Partial<Draft>) { setDraft((current) => ({ ...current, ...patch })); setError(""); }

  function validate() {
    if (!front || !service) return "Selecione uma frente ativa e uma atividade.";
    if (!draft.responsibleEmploymentId) return "Selecione o responsável pelo registro.";
    if (usesTrucks) {
      if (!totals.tripCount) return "Selecione caminhões e informe as viagens.";
      if (!validPositive(draft.dmtKm)) return "Informe o DMT médio em km.";
      if (isFill && (!validPositive(draft.swellFactor) || Number(canonical(draft.swellFactor)) <= 1)) return "Informe um fator de empolamento maior que 1.";
    } else if (!validPositive(draft.directQuantity)) return "Informe uma quantidade positiva.";
    return "";
  }

  async function changeContext(date: string, shift: "day" | "night") {
    if (!window.confirm("Trocar data ou turno descarta os campos deste lançamento. Continuar?")) return;
    setBusy(true);
    try {
      const next = await onContextChange(date, shift);
      setDraft(initialDraft(next, null, contextualEntry));
      setReview(false);
    } catch { setError("Não foi possível carregar as opções deste turno."); }
    finally { setBusy(false); }
  }

  async function save(submitNow: boolean) {
    const issue = validate();
    if (issue) { setError(issue); setReview(false); return; }
    setBusy(true);
    try {
      const command: ProjectProductionCommand = {
        kind: "individual_activity",
        entryMode: usesTrucks ? "truck_summary" : "direct_total",
        productionDate: draft.productionDate,
        shift: draft.shift,
        responsibleEmploymentId: draft.responsibleEmploymentId,
        expectedRevision: detail?.revision,
        submitNow,
        equipment: draft.selectedMachineIds.map((machineId) => ({ machineId, role: "support" })),
        truckSummaries: usesTrucks ? earthworkTrucks(front).filter((truck) => Number(draft.trips[truck.id]) > 0).map((truck) => ({ machineId: truck.id, acceptedTrips: Number(draft.trips[truck.id]) })) : [],
        individualActivity: {
          workFrontId: draft.workFrontId,
          workFrontServiceId: draft.workFrontServiceId,
          quantityMethod: "manual",
          location: draft.location || null,
          materialName: draft.materialName || null,
          volumeCondition: isFill ? "compacted" : isVolumetric ? "bank" : null,
          operationalQuantity: usesTrucks ? null : canonical(draft.directQuantity),
          dmtKm: usesTrucks ? canonical(draft.dmtKm) : null,
          swellFactor: isFill && usesTrucks ? canonical(draft.swellFactor) : null,
        },
      };
      const result = await saveProjectProductionAction({ projectId, productionId: detail?.id, command });
      if (result.kind === "failure") { setError(result.message); return; }
      onSaved(result.production);
      toast.success(submitNow ? "Produção confirmada." : "Rascunho salvo.");
      onOpenChange(false);
    } catch { setError("Não foi possível salvar a produção."); }
    finally { setBusy(false); }
  }

  return <OperationsModal
    open={open}
    onOpenChange={onOpenChange}
    size="xl"
    icon={Shovel}
    title={detail ? "Produção de terraplanagem" : "Nova produção"}
    description="Registre a atividade e confira o volume calculado antes de confirmar."
    footer={<div className="flex w-full flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Fechar</Button>
      {editable && (review ? <>
        <Button type="button" variant="outline" onClick={() => setReview(false)} disabled={busy}>Voltar</Button>
        <Button type="button" variant="outline" onClick={() => void save(false)} disabled={busy}>Salvar rascunho</Button>
        <Button type="button" onClick={() => void save(true)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Check />} Confirmar produção</Button>
      </> : <Button type="button" onClick={() => { const issue = validate(); if (issue) setError(issue); else setReview(true); }} disabled={busy || !options.workFronts.length}>Revisar produção</Button>)}
      {!editable && workflowActions}
    </div>}
  >
    <div className="grid gap-5">
      {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm font-semibold text-destructive">{error}</p>}
      {!options.workFronts.length && <p role="alert">Inicie uma frente de serviço antes de registrar produção.</p>}
      {review || !editable ? <div className="grid gap-3 rounded-lg border p-4 text-sm">
        <p><strong>Atividade:</strong> {productionServiceLabel(service?.serviceCode ?? detail?.serviceCode ?? "—")} · {front?.name ?? "—"}</p>
        <p><strong>Local:</strong> {draft.location || "Não informado"} · <strong>Material:</strong> {draft.materialName || "Não informado"}</p>
        <p><strong>Caminhões:</strong> {Object.values(draft.trips).filter((value) => Number(value) > 0).length} · <strong>Viagens:</strong> {totals.tripCount}</p>
        {totals.looseVolume && <p><strong>Volume das carradas:</strong> {displayDecimal(totals.looseVolume)} m³</p>}
        {isFill && usesTrucks && <p><strong>Empolamento:</strong> {displayDecimal(draft.swellFactor)}</p>}
        <p><strong>Quantidade da produção:</strong> {detail && !editable ? displayDecimal(detail.metrics.officialQuantity) : totals.quantity ? displayDecimal(totals.quantity) : "—"} {productionUnitLabel(service?.unitCode ?? detail?.unitCode ?? "")}</p>
        {usesTrucks && <p><strong>DMT médio:</strong> {displayDecimal(draft.dmtKm)} km · <strong>Momento:</strong> {totals.moment ? displayDecimal(totals.moment) : "—"} m³·km</p>}
        <p><strong>Máquinas selecionadas:</strong> {draft.selectedMachineIds.length}</p>
      </div> : <>
        {!contextualEntry && <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">Data<Input type="date" min={options.dateLimits.minimum} max={options.dateLimits.maximum} value={draft.productionDate} onChange={(event) => void changeContext(event.target.value, draft.shift)} /></label>
          <label className="grid gap-1 text-sm font-semibold">Turno<select className={fieldClass} value={draft.shift} onChange={(event) => void changeContext(draft.productionDate, event.target.value as "day" | "night")}><option value="day">Diurno</option><option value="night">Noturno</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">Responsável<select className={fieldClass} value={draft.responsibleEmploymentId} onChange={(event) => update({ responsibleEmploymentId: event.target.value })}><option value="">Selecione</option>{options.responsibleOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Frente<select className={fieldClass} value={draft.workFrontId} onChange={(event) => { const next = options.workFronts.find((item) => item.id === event.target.value); update({ workFrontId: event.target.value, workFrontServiceId: next?.services[0]?.id ?? "", location: next?.location ?? "", trips: {}, selectedMachineIds: [] }); }}>{options.workFronts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Atividade<select className={fieldClass} value={draft.workFrontServiceId} onChange={(event) => update({ workFrontServiceId: event.target.value, trips: {}, directQuantity: "" })}>{front?.services.map((item) => <option key={item.id} value={item.id}>{productionServiceLabel(item.serviceCode)} · {productionUnitLabel(item.unitCode)}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Local<Input value={draft.location} onChange={(event) => update({ location: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">Material<Input value={draft.materialName} onChange={(event) => update({ materialName: event.target.value })} /></label>
        </div>
        {isFill && <fieldset className="grid gap-2"><legend className="text-sm font-bold">Quantidade do aterro</legend><label className="flex gap-2"><input type="radio" checked={draft.fillMode === "direct"} onChange={() => update({ fillMode: "direct" })} />Volume direto</label><label className="flex gap-2"><input type="radio" checked={draft.fillMode === "trucks"} onChange={() => update({ fillMode: "trucks" })} />Carradas e empolamento</label></fieldset>}
        {!usesTrucks ? <label className="grid gap-1 text-sm font-semibold">Quantidade {productionUnitLabel(service?.unitCode ?? "")}<Input inputMode="decimal" value={draft.directQuantity} onChange={(event) => update({ directQuantity: event.target.value })} /></label> : <>
          <div className="grid gap-3"><p className="text-sm font-bold">Caminhões e viagens</p>{earthworkTrucks(front).length ? earthworkTrucks(front).map((truck) => <label key={truck.id} className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[1fr_9rem] sm:items-center"><span><strong>{truck.name}</strong> · {formatLoadCapacity(truck.effectiveCapacity, truck.capacityUnitCode)} por viagem</span><Input aria-label={`Viagens de ${truck.name}`} type="number" min={0} max={10000} step={1} value={draft.trips[truck.id] ?? ""} onChange={(event) => update({ trips: { ...draft.trips, [truck.id]: event.target.value } })} /></label>) : <p>Nenhum caminhão basculante disponível na obra para este turno.</p>}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">DMT médio (km)<Input inputMode="decimal" value={draft.dmtKm} onChange={(event) => update({ dmtKm: event.target.value })} /></label>{isFill && <label className="grid gap-1 text-sm font-semibold">Fator de empolamento<Input inputMode="decimal" value={draft.swellFactor} onChange={(event) => update({ swellFactor: event.target.value })} /></label>}</div>
          <p className="rounded-md bg-secondary p-3 text-sm">{totals.tripCount} viagem(ns) · {displayDecimal(totals.looseVolume ?? "0.000")} m³ · DMT {draft.dmtKm ? displayDecimal(draft.dmtKm) : "—"} km · {totals.moment ? displayDecimal(totals.moment) : "—"} m³·km</p>
        </>}
        <fieldset className="grid gap-2"><legend className="text-sm font-bold">Outras máquinas da obra (opcional)</legend><div className="grid gap-2 sm:grid-cols-2">{machines.filter((machine) => !front?.trucks.some((truck) => truck.id === machine.id)).map((machine) => <label key={machine.id} className="flex gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={draft.selectedMachineIds.includes(machine.id)} onChange={(event) => update({ selectedMachineIds: event.target.checked ? [...draft.selectedMachineIds, machine.id] : draft.selectedMachineIds.filter((id) => id !== machine.id) })} />{machine.name}</label>)}</div></fieldset>
      </>}
    </div>
  </OperationsModal>;
}

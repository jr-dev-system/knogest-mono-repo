"use client";

import * as React from "react";
import {
  Check,
  ClipboardCheck,
  Gauge,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Shovel,
  Truck,
  Unlock,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  getMoreProjectProductionsAction,
  getProjectProductionAction,
  getProjectProductionOptionsAction,
  recordProjectProductionQualityAction,
  rejectProjectProductionAction,
  reopenProjectProductionAction,
  transitionProjectProductionAction,
} from "../productions.actions";
import type {
  ProjectProductionDetail,
  ProjectProductionOptions,
  ProjectProductionsPage,
} from "../productions.types";
import { ProjectProductionWizard } from "./project-production-wizard";

const statusLabels: Record<ProjectProductionDetail["status"], string> = {
  draft: "Rascunho",
  submitted: "Enviada",
  field_checked: "Conferida em campo",
  awaiting_technical: "Aguardando técnica",
  approved: "Aprovada",
  rejected: "Rejeitada",
  released: "Liberada",
  measured: "Medida",
};

export function ProjectProductions({
  initialPage,
  projectId,
}: {
  initialPage: ProjectProductionsPage;
  projectId: string;
}) {
  const [productions, setProductions] = React.useState(initialPage.data);
  const [pageInfo, setPageInfo] = React.useState(initialPage.pageInfo);
  const [options, setOptions] = React.useState<ProjectProductionOptions | null>(
    null,
  );
  const [detail, setDetail] = React.useState<ProjectProductionDetail | null>(
    null,
  );
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reason, setReason] = React.useState("");

  async function openNew() {
    setBusy(true);
    try {
      const resolved = await resolveOptions(todayInSaoPaulo(), "day");
      setDetail(null);
      setOptions(resolved);
      setReason("");
      setOpen(true);
    } catch {
      toast.error("Não foi possível carregar o contexto de produção.");
    } finally {
      setBusy(false);
    }
  }

  async function openExisting(id: string) {
    setBusy(true);
    try {
      const loaded = await getProjectProductionAction(projectId, id);
      const resolved = await resolveOptions(
        loaded.productionDate,
        loaded.shift,
      );
      setDetail(loaded);
      setOptions(resolved);
      setReason("");
      setOpen(true);
    } catch {
      toast.error("Não foi possível abrir este lançamento.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveOptions(
    productionDate: string,
    shift: "day" | "night",
  ) {
    const resolved = await getProjectProductionOptionsAction({
      projectId,
      productionDate,
      shift,
    });
    setOptions(resolved);
    return resolved;
  }

  function upsert(production: ProjectProductionDetail) {
    setDetail(production);
    const summary = summaryFromDetail(production);
    setProductions((current) => [
      summary,
      ...current.filter((item) => item.id !== summary.id),
    ]);
  }

  async function transition(
    target: "submit" | "check" | "approve" | "release",
  ) {
    if (!detail) return;
    setBusy(true);
    const result = await transitionProjectProductionAction({
      projectId,
      productionId: detail.id,
      expectedRevision: detail.revision,
      transition: target,
      reason: reason || undefined,
    });
    setBusy(false);
    if (result.kind === "failure") {
      toast.error(result.message);
      return;
    }
    upsert(result.production);
    toast.success(
      `Produção ${statusLabels[result.production.status].toLowerCase()}.`,
    );
  }

  async function reject() {
    if (!detail || reason.trim().length < 3) {
      toast.error("Informe o motivo da rejeição.");
      return;
    }
    setBusy(true);
    const result = await rejectProjectProductionAction({
      projectId,
      productionId: detail.id,
      expectedRevision: detail.revision,
      reason,
    });
    setBusy(false);
    if (result.kind === "failure") {
      toast.error(result.message);
      return;
    }
    upsert(result.production);
    toast.success("Produção rejeitada com registro de auditoria.");
  }

  async function reopen() {
    if (!detail || reason.trim().length < 3) {
      toast.error("Informe o motivo da reabertura.");
      return;
    }
    setBusy(true);
    const result = await reopenProjectProductionAction({
      projectId,
      productionId: detail.id,
      expectedRevision: detail.revision,
      reason,
    });
    setBusy(false);
    if (result.kind === "failure") {
      toast.error(result.message);
      return;
    }
    upsert(result.production);
    toast.success(
      "Produção reaberta; o RDO exigirá reconfirmação operacional.",
    );
  }

  async function acceptQuality() {
    if (!detail) return;
    setBusy(true);
    const type =
      detail.productionProfile === "compaction"
        ? "compaction"
        : detail.productionProfile === "grading"
          ? "finishing"
          : "field_inspection";
    const result = await recordProjectProductionQualityAction({
      projectId,
      productionId: detail.id,
      expectedRevision: detail.revision,
      type,
      status: "accepted",
      notes: reason || "Conferência registrada pelo administrador.",
    });
    setBusy(false);
    if (result.kind === "failure") {
      toast.error(result.message);
      return;
    }
    upsert(result.production);
    toast.success("Verificação de qualidade registrada.");
  }

  async function loadMore() {
    if (!pageInfo.nextCursor) return;
    setBusy(true);
    try {
      const page = await getMoreProjectProductionsAction(
        projectId,
        pageInfo.nextCursor,
      );
      setProductions((current) => [
        ...current,
        ...page.data.filter(
          (item) => !current.some((existing) => existing.id === item.id),
        ),
      ]);
      setPageInfo(page.pageInfo);
    } catch {
      toast.error("Não foi possível carregar mais produções.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold">Produção de terraplanagem</h3>
          <p className="text-sm text-muted-foreground">
            Lance atividades e movimentações em um assistente guiado.
          </p>
        </div>
        <Button
          onClick={() => void openNew()}
          disabled={busy || !initialPage.capabilities.createDraft}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
          produção
        </Button>
      </div>

      {productions.length ? (
        <div className="grid gap-2">
          {productions.map((production) => (
            <button
              key={production.id}
              type="button"
              onClick={() => void openExisting(production.id)}
              className="grid min-h-20 gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="flex min-w-0 items-start gap-3">
                {production.kind === "material_movement" ? (
                  <Truck className="mt-0.5 size-5 shrink-0 text-primary" />
                ) : (
                  <Shovel className="mt-0.5 size-5 shrink-0 text-primary" />
                )}
                <span className="min-w-0">
                  <span className="block font-bold">
                    {production.kind === "material_movement"
                      ? "Movimentação de material"
                      : serviceLabel(production.serviceCode)}{" "}
                    · {formatDate(production.productionDate)}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {formatQuantity(production.officialQuantity)}{" "}
                    {production.unitCode} · {production.tripCount} viagem(ns) ·{" "}
                    {production.equipmentCount} equipamento(s)
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                {production.rdo.stale && (
                  <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-700">
                    RDO desatualizado
                  </span>
                )}
                <StatusBadge status={production.status} />
              </span>
            </button>
          ))}
          {pageInfo.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => void loadMore()}
              disabled={busy}
            >
              Carregar mais
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-8 text-center">
          <Gauge className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-bold">Nenhuma produção lançada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Comece pelo primeiro lançamento guiado do turno.
          </p>
        </div>
      )}

      {options && (
        <ProjectProductionWizard
          open={open}
          onOpenChange={setOpen}
          projectId={projectId}
          options={options}
          detail={detail}
          onContextChange={resolveOptions}
          onSaved={upsert}
          workflowActions={
            detail ? (
              <WorkflowActions
                detail={detail}
                busy={busy}
                reason={reason}
                setReason={setReason}
                transition={transition}
                reject={reject}
                reopen={reopen}
                acceptQuality={acceptQuality}
              />
            ) : null
          }
        />
      )}
    </div>
  );
}

function WorkflowActions({
  detail,
  busy,
  reason,
  setReason,
  transition,
  reject,
  reopen,
  acceptQuality,
}: {
  detail: ProjectProductionDetail;
  busy: boolean;
  reason: string;
  setReason: (value: string) => void;
  transition: (
    value: "submit" | "check" | "approve" | "release",
  ) => Promise<void>;
  reject: () => Promise<void>;
  reopen: () => Promise<void>;
  acceptQuality: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {[
        "submitted",
        "field_checked",
        "awaiting_technical",
        "approved",
        "rejected",
        "released",
      ].includes(detail.status) && (
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo/observação"
          maxLength={500}
          className="sm:w-56"
        />
      )}
      {detail.status === "submitted" && (
        <>
          <Button
            type="button"
            onClick={() => void transition("check")}
            disabled={busy}
          >
            <ClipboardCheck /> Conferir
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void reject()}
            disabled={busy}
          >
            <X /> Rejeitar
          </Button>
        </>
      )}
      {detail.status === "field_checked" && (
        <Button
          type="button"
          onClick={() => void acceptQuality()}
          disabled={busy}
        >
          <Check /> Registrar qualidade
        </Button>
      )}
      {detail.status === "awaiting_technical" && (
        <>
          <Button
            type="button"
            onClick={() => void transition("approve")}
            disabled={busy}
          >
            <Check /> Aprovar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void reject()}
            disabled={busy}
          >
            <X /> Rejeitar
          </Button>
        </>
      )}
      {detail.status === "approved" && (
        <Button
          type="button"
          onClick={() => void transition("release")}
          disabled={busy}
        >
          <Unlock /> Liberar
        </Button>
      )}
      {["rejected", "approved", "released"].includes(detail.status) && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void reopen()}
          disabled={busy}
        >
          <RotateCcw /> Reabrir
        </Button>
      )}
      {detail.status === "draft" && (
        <Button type="button" disabled>
          <Send /> Envie pela revisão
        </Button>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ProjectProductionDetail["status"];
}) {
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
      {statusLabels[status]}
    </span>
  );
}

function summaryFromDetail(
  detail: ProjectProductionDetail,
): ProjectProductionsPage["data"][number] {
  return {
    id: detail.id,
    kind: detail.kind,
    serviceCode: detail.serviceCode,
    unitCode: detail.unitCode,
    productionDate: detail.productionDate,
    shift: detail.shift,
    status: detail.status,
    revision: detail.revision,
    operationalRevision: detail.operationalRevision,
    location: detail.location,
    route:
      detail.origin || detail.destination
        ? { origin: detail.origin, destination: detail.destination }
        : null,
    dmtKm: detail.dmtKm,
    volumeCondition: detail.volumeCondition,
    officialQuantity: detail.metrics.officialQuantity,
    operationalVolumeM3: detail.metrics.operationalVolumeM3,
    tripCount: detail.metrics.tripCount,
    equipmentCount: detail.equipment.length,
    needsApproval: !["approved", "released", "measured"].includes(
      detail.status,
    ),
    rdo: detail.rdo,
    updatedAt: detail.updatedAt,
  };
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}
function formatQuantity(value: string) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));
}
function serviceLabel(code: string) {
  return (
    (
      {
        cut: "Corte",
        fill: "Aterro",
        finishing: "Acabamento",
        top_soil: "Top soil",
        unsuitable_soil_removal: "Remoção de solo impróprio",
        replacement_fill: "Aterro de substituição",
      } as Record<string, string>
    )[code] ?? code
  );
}

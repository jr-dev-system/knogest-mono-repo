"use client";

import * as React from "react";
import {
  AlertCircle,
  Cog,
  Loader2,
  Pencil,
  Search,
  Truck,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncer } from "@/hooks/useDebouncer";
import {
  formatMeterReading,
  type MeterType,
} from "@/features/machines/meter-format";
import { cn } from "@/lib/utils";
import { getProjectMachineMobilizationMembersAction } from "../projects.actions";
import type {
  ProjectMachineMobilizationMember,
  ProjectMachineMobilizationMembersPage,
} from "../projects.types";
import { ProjectResourceCard } from "./project-resource-card";

const machineTypeLabel = (type: ProjectMachineMobilizationMember["type"]) =>
  type === "YELLOW_LINE" ? "Linha amarela" : "Linha branca";

const machineTypeTone = (type: ProjectMachineMobilizationMember["type"]) =>
  type === "YELLOW_LINE"
    ? {
        badge: "bg-amber-950 text-amber-50",
        card: "border-l-amber-400",
        icon: "bg-amber-950 text-amber-50",
      }
    : {
        badge:
          "bg-slate-800 text-slate-50 dark:bg-slate-200 dark:text-slate-950",
        card: "border-l-slate-800 dark:border-l-slate-500",
        icon: "bg-slate-800 text-slate-50 dark:bg-slate-200 dark:text-slate-950",
      };

const identifiersLabel = (machine: ProjectMachineMobilizationMember) =>
  machine.identifiers
    .map(
      (identifier) =>
        `${identifier.kind === "PLATE" ? "Placa" : "Patrimônio"}: ${identifier.value}`,
    )
    .join(" · ");

const readingLabel = (machine: ProjectMachineMobilizationMember) =>
  machine.startMeterReading
    ? formatMeterReading(
        machine.startMeterReading.value,
        machine.meterType as MeterType,
      )
    : "Não informada";

function MachineSpecifications({
  machine,
}: {
  machine: ProjectMachineMobilizationMember;
}) {
  return (
    <section
      aria-label={`Dados da máquina ${machine.name}`}
      className="bg-card p-4"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        <Truck className="size-4 text-primary" />
        Dados da máquina
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-foreground/15 pt-3 text-xs sm:grid-cols-3 sm:gap-x-3">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="font-semibold text-muted-foreground">Modelo</dt>
          <dd
            title={machine.model || "Não informado"}
            className="mt-0.5 truncate text-sm font-bold text-foreground"
          >
            {machine.model || "Não informado"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-muted-foreground">Versão</dt>
          <dd
            title={machine.version || "Não informada"}
            className="mt-0.5 truncate text-sm font-bold text-foreground"
          >
            {machine.version || "Não informada"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-muted-foreground">Fabricante</dt>
          <dd
            title={machine.manufacturer || "Não informado"}
            className="mt-0.5 truncate text-sm font-bold text-foreground"
          >
            {machine.manufacturer || "Não informado"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function MachineOperators({
  machine,
}: {
  machine: ProjectMachineMobilizationMember;
}) {
  return (
    <section
      aria-label={`Operadores de ${machine.name}`}
      className="h-full bg-secondary/75 p-4"
    >
      <h4 className="flex items-center gap-2 text-sm font-bold text-secondary-foreground">
        <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <UsersRound className="size-4" />
        </span>
        Operadores
      </h4>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2 min-w-0">
          <dt className="sr-only">Operadores por turno</dt>
          <dd className="grid gap-2 font-bold text-foreground">
            {machine.requiresOperator
              ? machine.operatorAssignments.length
                ? machine.operatorAssignments.map((assignment) => (
                    <span
                      key={assignment.shift}
                      className="flex min-w-0 flex-wrap items-baseline gap-2 break-words"
                    >
                      <span className="inline-flex min-h-6 items-center rounded-md bg-background px-2 text-xs font-extrabold text-foreground">
                        {assignment.shift === "day" ? "Diurno" : "Noturno"}
                      </span>
                      {assignment.operator?.name ?? "Não informado"}
                    </span>
                  ))
                : "Não informado"
              : "Não exige operador"}
          </dd>
        </div>
        {machine.requiresOperator && (
          <div className="col-span-2 min-w-0 border-t border-foreground/15 pt-3">
            <dt className="text-xs font-semibold text-muted-foreground">
              Função exigida
            </dt>
            <dd className="mt-0.5 truncate font-bold text-foreground">
              {machine.acceptsAnyJobRole
                ? "Qualquer função"
                : (machine.requiredJobRoleName ?? "Não informada")}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function ProjectMachineView({
  canEdit,
  onEditMachine,
  projectId,
  reloadKey,
}: {
  canEdit: boolean;
  onEditMachine: (machine: ProjectMachineMobilizationMember) => void;
  projectId: string;
  reloadKey?: number;
}) {
  const [pages, setPages] = React.useState<
    ProjectMachineMobilizationMembersPage[]
  >([]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncer(search, 300);
  const requestId = React.useRef(0);

  const loadPage = React.useCallback(
    async (cursor?: string | null, append = false) => {
      const currentRequestId = requestId.current + 1;
      requestId.current = currentRequestId;
      setLoading(true);
      setError(null);
      try {
        const page = await getProjectMachineMobilizationMembersAction({
          projectId,
          cursor,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        });
        if (requestId.current !== currentRequestId) return false;
        setPages((current) => (append ? [...current, page] : [page]));
        return true;
      } catch {
        if (requestId.current === currentRequestId)
          setError("Não foi possível carregar as máquinas mobilizadas.");
        return false;
      } finally {
        if (requestId.current === currentRequestId) setLoading(false);
      }
    },
    [debouncedSearch, projectId],
  );

  React.useEffect(() => {
    let active = true;
    requestId.current += 1;
    void Promise.resolve().then(() => {
      if (!active) return;
      setPageIndex(0);
      void loadPage();
    });
    return () => {
      active = false;
    };
  }, [loadPage, reloadKey]);

  const page = pages[pageIndex];
  const hasFilters = Boolean(search.trim());
  const isWaitingForSearch = search.trim() !== debouncedSearch.trim();
  const isSearchUpdating =
    Boolean(search.trim()) && (isWaitingForSearch || loading);

  const goNext = async () => {
    const cached = pages[pageIndex + 1];
    if (cached) {
      setPageIndex((current) => current + 1);
      return;
    }
    if (!page?.pageInfo.nextCursor) return;
    const loaded = await loadPage(page.pageInfo.nextCursor, true);
    if (loaded) setPageIndex((current) => current + 1);
  };

  return (
    <div className="grid gap-5">
      <section
        aria-label="Filtros de máquinas mobilizadas"
        className="grid gap-2 rounded-xl border border-border bg-muted/30 p-4 sm:p-5"
      >
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>Buscar máquina</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 bg-background pl-9 pr-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, modelo, placa ou patrimônio"
            />
            <Loader2
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
                isSearchUpdating ? "animate-spin opacity-100" : "opacity-0",
              )}
            />
            <span className="sr-only" aria-live="polite">
              {isSearchUpdating ? "Atualizando resultados" : ""}
            </span>
          </span>
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          A busca encontra nome, modelo, placa e patrimônio. O resultado é
          atualizado quando você para de digitar.
        </p>
      </section>

      {loading && !page ? (
        <div role="status" className="grid gap-3" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {hasFilters ? "Atualizando resultados…" : "Carregando máquinas…"}
          </div>
          <div className="grid gap-3" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="overflow-hidden rounded-2xl border border-l-[6px] border-input border-l-muted-foreground/25 bg-background"
              >
                <div className="grid animate-pulse gap-2 border-b border-border bg-muted/30 p-4">
                  <span className="h-5 w-44 rounded bg-muted-foreground/20" />
                  <span className="h-3 w-3/5 rounded bg-muted-foreground/20" />
                </div>
                <div className="grid min-h-28 animate-pulse sm:grid-cols-[minmax(0,1.5fr)_minmax(13rem,0.8fr)_auto]">
                  <span className="m-4 h-12 rounded bg-muted" />
                  <span className="m-4 h-12 rounded bg-muted" />
                  <span className="m-4 h-10 w-20 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error && !page ? (
        <div className="grid min-h-40 place-items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertCircle className="size-4" />
            {error}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadPage()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : page?.data.length ? (
        <div className="grid gap-3">
          <div className="grid gap-3">
            {page.data.map((machine) => (
              <ProjectResourceCard
                key={machine.id}
                titleId={`machine-${machine.id}-name`}
                title={machine.name}
                subtitle={
                  <>
                    <span>Leitura {readingLabel(machine)}</span>
                    {identifiersLabel(machine) ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{identifiersLabel(machine)}</span>
                      </>
                    ) : null}
                  </>
                }
                subtitleClassName="flex flex-wrap gap-x-2 gap-y-1"
                icon={Truck}
                iconClassName={machineTypeTone(machine.type).icon}
                badge={machineTypeLabel(machine.type)}
                badgeClassName={machineTypeTone(machine.type).badge}
                accentClassName={machineTypeTone(machine.type).card}
                bodyClassName="sm:grid-cols-[minmax(0,1.5fr)_minmax(13rem,0.8fr)_auto]"
                data-machine-type={machine.type}
                actionsLabel={`Ações para ${machine.name}`}
                actions={
                  canEdit ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        className="bg-background"
                        aria-label={`Editar operadores de ${machine.name}`}
                        title={
                          machine.requiresOperator
                            ? undefined
                            : "Esta máquina não exige operador"
                        }
                        disabled={!machine.requiresOperator}
                        onClick={() => onEditMachine(machine)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        className="bg-background"
                        aria-label={`Configurações de ${machine.name}`}
                        onClick={() => undefined}
                      >
                        <Cog className="size-4" />
                      </Button>
                    </>
                  ) : undefined
                }
              >
                <MachineSpecifications machine={machine} />
                <div className="border-t border-border sm:border-l sm:border-t-0">
                  <MachineOperators machine={machine} />
                </div>
              </ProjectResourceCard>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-muted-foreground">
              Página {pageIndex + 1} · até 15 máquinas
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pageIndex === 0 || loading}
                onClick={() =>
                  setPageIndex((current) => Math.max(0, current - 1))
                }
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!page.pageInfo.hasNextPage || loading}
                onClick={() => void goNext()}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Próxima
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
          <div>
            <Truck className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="font-bold">
              {hasFilters
                ? "Nenhuma máquina encontrada"
                : "Nenhuma máquina mobilizada"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters
                ? "Ajuste a busca para ver outras máquinas mobilizadas."
                : "Adicione uma máquina para montar a frota operacional da obra."}
            </p>
            {hasFilters ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => setSearch("")}
              >
                Limpar busca
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

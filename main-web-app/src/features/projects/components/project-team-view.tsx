"use client";

import * as React from "react";
import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldHelpPopover } from "@/components/ui/field-help-popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  OperationTabPanel,
  OperationTabs,
} from "@/components/ui/operation-tabs";
import { useDebouncer } from "@/hooks/useDebouncer";
import { getProjectTeamMembersAction } from "../projects.actions";
import type {
  CompensationMode,
  ProjectTeamMember,
  ProjectTeamMembersPage,
} from "../projects.types";

type Shift = "day" | "night";

const compensationLabels: Record<CompensationMode, string> = {
  daily: "Diária",
  fortnightly: "Quinzenal",
  hourly: "Por hora",
  monthly: "Mensal",
  weekly: "Semanal",
};

const emptyPages = (): Record<Shift, ProjectTeamMembersPage[]> => ({
  day: [],
  night: [],
});

const emptyJobRoles = (): Record<Shift, string[]> => ({
  day: [],
  night: [],
});

const formatCurrency = (value: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));

export function ProjectTeamView({
  canEdit,
  counts,
  initialShift = "day",
  nightEnabled = true,
  onAddShift,
  onActiveShiftChange,
  onEditMember,
  onEditShift,
  onRemoveMember,
  projectId,
  reloadKey,
}: {
  canEdit: boolean;
  counts: Record<Shift, number>;
  initialShift?: Shift;
  nightEnabled?: boolean;
  onAddShift: (shift: Shift) => void;
  onActiveShiftChange?: (shift: Shift) => void;
  onEditMember: (member: ProjectTeamMember) => void;
  onEditShift: (shift: Shift) => void;
  onRemoveMember: (member: ProjectTeamMember) => void;
  projectId: string;
  reloadKey?: number;
}) {
  const [activeShift, setActiveShift] = React.useState<Shift>(
    initialShift === "night" && !nightEnabled ? "day" : initialShift,
  );
  const [pages, setPages] =
    React.useState<Record<Shift, ProjectTeamMembersPage[]>>(emptyPages);
  const [pageIndexes, setPageIndexes] = React.useState<Record<Shift, number>>({
    day: 0,
    night: 0,
  });
  const [loadingShift, setLoadingShift] = React.useState<Shift | null>(null);
  const [errors, setErrors] = React.useState<Record<Shift, string | null>>({
    day: null,
    night: null,
  });
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncer(search, 300);
  const [jobRole, setJobRole] = React.useState("");
  const [jobRolesByShift, setJobRolesByShift] =
    React.useState<Record<Shift, string[]>>(emptyJobRoles);
  const requestId = React.useRef(0);

  const loadPage = React.useCallback(
    async (cursor?: string | null, append = false) => {
      if (activeShift === "night" && !nightEnabled) return false;
      const currentRequestId = requestId.current + 1;
      requestId.current = currentRequestId;
      setLoadingShift(activeShift);
      setErrors((current) => ({ ...current, [activeShift]: null }));
      try {
        const page = await getProjectTeamMembersAction({
          projectId,
          shift: activeShift,
          cursor,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
          ...(jobRole ? { jobRole } : {}),
        });
        if (requestId.current !== currentRequestId) return false;
        setPages((current) => ({
          ...current,
          [activeShift]: append ? [...current[activeShift], page] : [page],
        }));
        setJobRolesByShift((current) => ({
          ...current,
          [activeShift]: page.jobRoles ?? [],
        }));
        return true;
      } catch {
        if (requestId.current === currentRequestId)
          setErrors((current) => ({
            ...current,
            [activeShift]: "Não foi possível carregar este turno.",
          }));
        return false;
      } finally {
        if (requestId.current === currentRequestId)
          setLoadingShift((current) =>
            current === activeShift ? null : current,
          );
      }
    },
    [activeShift, debouncedSearch, jobRole, nightEnabled, projectId],
  );

  React.useEffect(() => {
    let active = true;
    requestId.current += 1;
    void Promise.resolve().then(() => {
      if (!active) return;
      setPageIndexes((current) => ({ ...current, [activeShift]: 0 }));
      void loadPage();
    });
    return () => {
      active = false;
    };
  }, [activeShift, loadPage, reloadKey]);

  const pageIndex = pageIndexes[activeShift];
  const page = pages[activeShift][pageIndex];
  const isLoading = loadingShift === activeShift;
  const hasFilters = Boolean(search.trim() || jobRole);
  const isWaitingForSearch = search.trim() !== debouncedSearch.trim();
  const isSearchUpdating =
    Boolean(search.trim()) && (isWaitingForSearch || isLoading);
  const jobRoles = jobRolesByShift[activeShift];

  const selectShift = (shift: Shift) => {
    if (shift === "night" && !nightEnabled) return;
    setActiveShift(shift);
    setJobRole("");
    onActiveShiftChange?.(shift);
  };

  const goNext = async () => {
    const cached = pages[activeShift][pageIndex + 1];
    if (cached) {
      setPageIndexes((current) => ({
        ...current,
        [activeShift]: pageIndex + 1,
      }));
      return;
    }
    if (!page?.pageInfo.nextCursor) return;
    const loaded = await loadPage(page.pageInfo.nextCursor, true);
    if (!loaded) return;
    setPageIndexes((current) => ({
      ...current,
      [activeShift]: pageIndex + 1,
    }));
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <OperationTabs
          ariaLabel="Turno da equipe"
          idPrefix="project-team-shift"
          value={activeShift}
          onValueChange={selectShift}
          tabs={[
            { value: "day", label: `Diurno (${counts.day})` },
            {
              value: "night",
              label: `Noturno (${counts.night})${nightEnabled ? "" : " · desativado"}`,
              disabled: !nightEnabled,
            },
          ]}
        />
        {canEdit && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => onEditShift(activeShift)}
            >
              <Pencil className="size-4" />
              Editar turno
            </Button>
            <Button
              type="button"
              className="min-h-10"
              onClick={() => onAddShift(activeShift)}
            >
              <Plus className="size-4" />
              Adicionar funcionários
            </Button>
            {!nightEnabled && (
              <Button
                type="button"
                variant="outline"
                className="min-h-10"
                onClick={() => onEditShift("night")}
              >
                <Pencil className="size-4" />
                Editar turno noturno
              </Button>
            )}
          </div>
        )}
      </div>

      <section
        aria-label="Filtros da equipe"
        className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>Buscar por nome ou cargo</span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 bg-background pl-9 pr-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome ou cargo"
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
          <div className="grid gap-1.5 text-sm font-semibold">
            <div className="flex items-center gap-1.5">
              <label htmlFor="project-team-job-role">Cargo</label>
              <FieldHelpPopover
                compact
                title="Cargos disponíveis"
                description="A lista mostra apenas cargos que possuem funcionários no turno selecionado desta obra."
              />
            </div>
            <select
              id="project-team-job-role"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              value={jobRole}
              onChange={(event) => setJobRole(event.target.value)}
              disabled={!jobRoles.length && isLoading}
            >
              <option value="">Todos os cargos</option>
              {jobRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          A busca encontra nomes e cargos. O resultado é atualizado quando você
          para de digitar.
        </p>
      </section>

      {(["day", "night"] as const).map((shift) => (
        <OperationTabPanel
          key={shift}
          activeValue={activeShift}
          idPrefix="project-team-shift"
          value={shift}
          className="min-h-40"
        >
          {isLoading && !page ? (
            <div role="status" className="grid gap-3" aria-live="polite">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {hasFilters ? "Atualizando resultados…" : "Carregando equipe…"}
              </div>
              <div className="grid gap-2" aria-hidden="true">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="grid min-h-28 animate-pulse gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[minmax(11rem,1fr)_auto_auto] sm:items-center"
                  >
                    <div className="grid gap-2">
                      <span className="h-5 w-44 rounded bg-muted" />
                      <span className="h-4 w-28 rounded bg-muted" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <span className="h-9 w-16 rounded bg-muted" />
                      <span className="h-9 w-16 rounded bg-muted" />
                      <span className="h-9 w-16 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : errors[shift] && !page ? (
            <div className="grid min-h-40 place-items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertCircle className="size-4" />
                {errors[shift]}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void loadPage();
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : page?.data.length ? (
            <div className="grid gap-3">
              <div className="grid gap-2">
                {page.data.map((member) => (
                  <article
                    key={member.id}
                    className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[minmax(11rem,1fr)_auto_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold">{member.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {member.jobRole}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-3 sm:text-right">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Carga mensal
                        </dt>
                        <dd className="font-bold">
                          {member.monthlyWorkloadHours} h
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Modalidade
                        </dt>
                        <dd className="font-bold">
                          {compensationLabels[member.compensationMode]}
                        </dd>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Hora extra
                        </dt>
                        <dd className="font-bold">
                          {member.overtimeEnabled
                            ? formatCurrency(member.overtimeRate)
                            : "Desabilitada"}
                        </dd>
                      </div>
                    </dl>
                    {canEdit && (
                      <div
                        role="group"
                        aria-label={`Ações para ${member.name}`}
                        className="flex items-center gap-1 border-t border-border pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Editar ${member.name}`}
                          onClick={() => onEditMember(member)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remover ${member.name}`}
                          onClick={() => onRemoveMember(member)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Página {pageIndex + 1} · até 15 funcionários
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pageIndex === 0 || isLoading}
                    onClick={() =>
                      setPageIndexes((current) => ({
                        ...current,
                        [activeShift]: Math.max(0, pageIndex - 1),
                      }))
                    }
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!page.pageInfo.hasNextPage || isLoading}
                    onClick={() => void goNext()}
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Próxima
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
              <div>
                <UsersRound className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="font-bold">
                  {hasFilters
                    ? "Nenhum funcionário encontrado"
                    : "Nenhum funcionário neste turno"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasFilters
                    ? "Ajuste a busca ou o cargo selecionado para ver outros funcionários."
                    : "Use “Editar turno” para montar esta equipe."}
                </p>
                {hasFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setSearch("");
                      setJobRole("");
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </OperationTabPanel>
      ))}
    </div>
  );
}

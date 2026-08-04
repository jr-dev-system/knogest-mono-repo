"use client";

import * as React from "react";
import { AlertCircle, Loader2, Pencil, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  OperationTabPanel,
  OperationTabs,
} from "@/components/ui/operation-tabs";
import { getProjectTeamMembersAction } from "../projects.actions";
import type {
  CompensationMode,
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

const formatCurrency = (value: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));

export function ProjectTeamView({
  canEdit,
  counts,
  onEditShift,
  projectId,
}: {
  canEdit: boolean;
  counts: Record<Shift, number>;
  onEditShift: (shift: Shift) => void;
  projectId: string;
}) {
  const [activeShift, setActiveShift] = React.useState<Shift>("day");
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

  const loadPage = React.useCallback(
    async (shift: Shift, cursor?: string | null) => {
      setLoadingShift(shift);
      setErrors((current) => ({ ...current, [shift]: null }));
      try {
        return await getProjectTeamMembersAction({ projectId, shift, cursor });
      } catch {
        setErrors((current) => ({
          ...current,
          [shift]: "Não foi possível carregar este turno.",
        }));
        return null;
      } finally {
        setLoadingShift((current) => (current === shift ? null : current));
      }
    },
    [projectId],
  );

  React.useEffect(() => {
    if (pages[activeShift].length) return;
    let active = true;
    // A mudança de turno é o gatilho externo que carrega a página inicial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage(activeShift).then((page) => {
      if (!active || !page) return;
      setPages((current) => ({ ...current, [activeShift]: [page] }));
    });
    return () => {
      active = false;
    };
  }, [activeShift, loadPage, pages]);

  const pageIndex = pageIndexes[activeShift];
  const page = pages[activeShift][pageIndex];
  const isLoading = loadingShift === activeShift;

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
    const next = await loadPage(activeShift, page.pageInfo.nextCursor);
    if (!next) return;
    setPages((current) => ({
      ...current,
      [activeShift]: [...current[activeShift], next],
    }));
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
          onValueChange={setActiveShift}
          tabs={[
            { value: "day", label: `Diurno (${counts.day})` },
            { value: "night", label: `Noturno (${counts.night})` },
          ]}
        />
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 shrink-0"
            onClick={() => onEditShift(activeShift)}
          >
            <Pencil className="size-4" />
            Editar turno
          </Button>
        )}
      </div>

      {(["day", "night"] as const).map((shift) => (
        <OperationTabPanel
          key={shift}
          activeValue={activeShift}
          idPrefix="project-team-shift"
          value={shift}
          className="min-h-40"
        >
          {isLoading && !page ? (
            <div
              role="status"
              className="flex min-h-40 items-center justify-center gap-2 rounded-lg border border-dashed text-sm font-semibold text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Carregando equipe…
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
                  void loadPage(shift).then((loaded) => {
                    if (loaded) {
                      setPages((current) => ({
                        ...current,
                        [shift]: [loaded],
                      }));
                    }
                  });
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
                    className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
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
                          {formatCurrency(member.overtimeRate)}
                        </dd>
                      </div>
                    </dl>
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
                <p className="font-bold">Nenhum funcionário neste turno</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use “Editar turno” para montar esta equipe.
                </p>
              </div>
            </div>
          )}
        </OperationTabPanel>
      ))}
    </div>
  );
}

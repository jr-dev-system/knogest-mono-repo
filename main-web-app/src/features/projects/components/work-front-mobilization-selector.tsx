"use client";

import * as React from "react";
import { AlertCircle, Loader2, Search, Truck, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OperationTabPanel,
  OperationTabs,
} from "@/components/ui/operation-tabs";
import { useDebouncer } from "@/hooks/useDebouncer";
import { cn } from "@/lib/utils";
import { getProjectWorkFrontMobilizationOptionsAction } from "../projects.actions";
import type { ProjectWorkFrontMobilizationOptionsPage } from "../projects.types";

type ResourceType = "employee" | "machine";
type CachedPage = {
  pages: ProjectWorkFrontMobilizationOptionsPage[];
  index: number;
};

export function WorkFrontMobilizationSelector({
  disabled,
  frontId,
  onSelectedEmploymentIdsChange,
  onSelectedMachineKeysChange,
  projectId,
  selectedEmploymentIds,
  selectedMachineKeys,
}: {
  disabled: boolean;
  frontId: string;
  onSelectedEmploymentIdsChange: (ids: string[]) => void;
  onSelectedMachineKeysChange: (keys: string[]) => void;
  projectId: string;
  selectedEmploymentIds: string[];
  selectedMachineKeys: string[];
}) {
  const [resourceType, setResourceType] =
    React.useState<ResourceType>("employee");
  const [searches, setSearches] = React.useState<Record<ResourceType, string>>({
    employee: "",
    machine: "",
  });
  const debouncedSearch = useDebouncer(searches[resourceType], 300);
  const [cache, setCache] = React.useState<Record<string, CachedPage>>({});
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const requestId = React.useRef(0);
  const cacheKey = `${projectId}:${frontId}:${resourceType}:${debouncedSearch.trim()}`;
  const cached = cache[cacheKey];
  const page = cached?.pages[cached.index];

  const loadPage = React.useCallback(
    async (cursor?: string | null, append = false) => {
      const currentRequest = requestId.current + 1;
      requestId.current = currentRequest;
      setLoadingKey(cacheKey);
      setErrors((current) => {
        const next = { ...current };
        delete next[cacheKey];
        return next;
      });
      try {
        const loaded = await getProjectWorkFrontMobilizationOptionsAction({
          projectId,
          frontId,
          resourceType,
          search: debouncedSearch,
          cursor,
        });
        if (requestId.current !== currentRequest) return;
        setCache((current) => {
          const existing = current[cacheKey];
          return {
            ...current,
            [cacheKey]: append
              ? {
                  pages: [...(existing?.pages ?? []), loaded],
                  index: existing?.pages.length ?? 0,
                }
              : { pages: [loaded], index: 0 },
          };
        });
      } catch {
        if (requestId.current !== currentRequest) return;
        setErrors((current) => ({
          ...current,
          [cacheKey]: "Não foi possível consultar os recursos agora.",
        }));
      } finally {
        if (requestId.current === currentRequest) setLoadingKey(null);
      }
    },
    [cacheKey, debouncedSearch, frontId, projectId, resourceType],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- Changing tab or debounced filter starts a bound cursor query. */
  React.useEffect(() => {
    if (!cached) void loadPage();
  }, [cached, loadPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isLoading = loadingKey === cacheKey;
  const toggle = (current: string[], value: string, checked: boolean) =>
    checked
      ? current.includes(value)
        ? current
        : [...current, value]
      : current.filter((item) => item !== value);

  const content = (
    <div className="grid gap-3">
      <label className="relative block">
        <span className="sr-only">
          {resourceType === "employee"
            ? "Buscar funcionário por nome ou função"
            : "Buscar máquina por nome, fabricante, modelo, placa ou patrimônio"}
        </span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          value={searches[resourceType]}
          placeholder={
            resourceType === "employee"
              ? "Buscar por nome ou função"
              : "Buscar nome, fabricante, modelo, placa…"
          }
          onChange={(event) =>
            setSearches((current) => ({
              ...current,
              [resourceType]: event.target.value,
            }))
          }
        />
      </label>

      {isLoading && !page ? (
        <div
          role="status"
          className="flex min-h-40 items-center justify-center gap-2 rounded-lg border border-dashed text-sm font-semibold text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          Carregando recursos…
        </div>
      ) : errors[cacheKey] && !page ? (
        <div className="grid min-h-40 place-items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertCircle className="size-4" />
            {errors[cacheKey]}
          </p>
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
          <div className="grid gap-2">
            {page.data.map((option) => {
              const value =
                option.resourceType === "employee"
                  ? option.id
                  : option.selectionKey;
              const checked =
                option.resourceType === "employee"
                  ? selectedEmploymentIds.includes(value)
                  : selectedMachineKeys.includes(value);
              const identifier =
                option.resourceType === "machine" && option.identifier
                  ? ` · ${option.identifier.value}`
                  : "";
              return (
                <label
                  key={`${option.resourceType}:${value}`}
                  className={cn(
                    "flex min-h-14 items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm transition-colors",
                    checked && "border-primary/50 bg-primary/5",
                    option.disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={checked}
                    disabled={disabled || option.disabled}
                    onChange={(event) => {
                      if (option.resourceType === "employee") {
                        onSelectedEmploymentIdsChange(
                          toggle(
                            selectedEmploymentIds,
                            value,
                            event.target.checked,
                          ),
                        );
                      } else {
                        onSelectedMachineKeysChange(
                          toggle(
                            selectedMachineKeys,
                            value,
                            event.target.checked,
                          ),
                        );
                      }
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">{option.name}</strong>
                    <span className="block text-muted-foreground">
                      {option.resourceType === "employee"
                        ? `${option.jobRole} · ${option.shift === "day" ? "Diurno" : "Noturno"}`
                        : `${option.manufacturer} ${option.model}${identifier} · ${option.shift === "day" ? "Diurno" : "Noturno"}`}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                      {option.resourceType === "machine"
                        ? `Operador: ${option.operator?.name ?? "não informado"}${option.occupyingFront ? ` · ${option.selected ? "Nesta frente" : `Ocupada em ${option.occupyingFront.name}`}` : " · Disponível"}`
                        : option.occupyingFront
                          ? option.selected
                            ? "Nesta frente"
                            : `Ocupado em ${option.occupyingFront.name}`
                          : "Disponível para esta frente"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Página {(cached?.index ?? 0) + 1} · até 15 recursos
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!cached?.index || isLoading}
                onClick={() =>
                  setCache((current) => ({
                    ...current,
                    [cacheKey]: {
                      ...current[cacheKey],
                      index: Math.max(0, current[cacheKey].index - 1),
                    },
                  }))
                }
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!page.pageInfo.hasNextPage || isLoading}
                onClick={() => {
                  const nextIndex = (cached?.index ?? 0) + 1;
                  if (cached?.pages[nextIndex]) {
                    setCache((current) => ({
                      ...current,
                      [cacheKey]: { ...current[cacheKey], index: nextIndex },
                    }));
                  } else {
                    void loadPage(page.pageInfo.nextCursor, true);
                  }
                }}
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                Próxima
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-lg border border-dashed bg-muted/30 p-5 text-center">
          <div>
            {resourceType === "employee" ? (
              <UsersRound className="mx-auto mb-2 size-6 text-muted-foreground" />
            ) : (
              <Truck className="mx-auto mb-2 size-6 text-muted-foreground" />
            )}
            <p className="font-bold">Nenhum recurso encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste a busca ou confira a mobilização geral da obra.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-4">
      <div>
        <OperationTabs
          ariaLabel="Tipo de recurso da frente"
          idPrefix="front-mobilization-resource"
          value={resourceType}
          onValueChange={setResourceType}
          tabs={[
            { value: "employee", label: "Funcionários" },
            { value: "machine", label: "Máquinas" },
          ]}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Operadores não aparecem na seleção de funcionários: entram
          automaticamente ao selecionar máquina e turno.
        </p>
      </div>
      <OperationTabPanel
        activeValue={resourceType}
        idPrefix="front-mobilization-resource"
        value="employee"
      >
        {content}
      </OperationTabPanel>
      <OperationTabPanel
        activeValue={resourceType}
        idPrefix="front-mobilization-resource"
        value="machine"
      >
        {content}
      </OperationTabPanel>
    </div>
  );
}

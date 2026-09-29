"use client";

import Link from "next/link";
import {
  ChevronRight,
  FileSearch,
  Search,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { FieldHelpPopover } from "@/components/ui/field-help-popover";
import { Input } from "@/components/ui/input";
import type { MachineActionState } from "../machines-action-state";
import type {
  MachineAllocationProjectContextResult,
  MachineAllocationProjectsResult,
} from "../machine-allocation.types";
import type {
  MachineUnitBatchActionResult,
  MachineUnitBatchDraft,
} from "../machine-unit-batch.types";
import type {
  MachineModelListItem,
  MachinesListQuery,
} from "../machines.server";
import { MachineModelCreationWizard } from "./machine-model-creation-wizard";

type MachineAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;

export function MachinesPageView({
  action,
  batchAction,
  loadProjectAction,
  pageInfo,
  query,
  rows,
  jobRoles = [],
  searchProjectsAction,
}: {
  action: MachineAction;
  batchAction: (
    machineModelId: string,
    input: MachineUnitBatchDraft,
  ) => Promise<MachineUnitBatchActionResult>;
  loadProjectAction: (
    projectId: string,
  ) => Promise<MachineAllocationProjectContextResult>;
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  query: MachinesListQuery;
  rows: MachineModelListItem[];
  jobRoles?: { id: string; name: string }[];
  searchProjectsAction: (input?: {
    cursor?: string | null;
    search?: string;
  }) => Promise<MachineAllocationProjectsResult>;
}) {
  const hasFilters = Boolean(query.search || query.type);
  const nextParams = new URLSearchParams();
  if (query.search) nextParams.set("search", query.search);
  if (query.type) nextParams.set("type", query.type);
  if (query.sortBy) nextParams.set("sortBy", query.sortBy);
  if (query.sortDirection) nextParams.set("sortDirection", query.sortDirection);
  if (pageInfo.nextCursor) nextParams.set("cursor", pageInfo.nextCursor);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/60 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              action="/home/maquinas"
              className="grid gap-2 md:grid-cols-[minmax(220px,360px)_150px_150px_auto]"
            >
              <label className="relative block">
                <span className="sr-only">Buscar máquina</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={query.search}
                  placeholder="Buscar por nome, placa ou patrimônio"
                  className="h-10 bg-background pl-9"
                />
              </label>
              <select
                name="type"
                defaultValue={query.type ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold"
              >
                <option value="">Todos</option>
                <option value="YELLOW_LINE">Linha amarela</option>
                <option value="WHITE_LINE">Linha branca</option>
              </select>
              <select
                name="sortBy"
                defaultValue={query.sortBy ?? "createdAt"}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold"
              >
                <option value="createdAt">Mais recentes</option>
                <option value="name">Nome</option>
              </select>
              <Button type="submit" variant="outline">
                <FileSearch className="size-4" />
                Filtrar
              </Button>
            </form>

            <MachineModelCreationWizard
              action={action}
              batchAction={batchAction}
              jobRoles={jobRoles}
              loadProjectAction={loadProjectAction}
              searchProjectsAction={searchProjectsAction}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <TableHead icon={Truck} label="Modelo / versão" />
                <TableHead icon={Tag} label="Unidades" />
                <TableHead label="Tipo" />
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-4 py-3 font-bold">
                      <Link
                        href={`/home/maquinas/modelos/${row.id}`}
                        className="block hover:underline"
                      >
                        <span className="block max-w-[24ch] truncate">
                          {row.model}
                          {row.version ? ` — ${row.version}` : ""}
                        </span>
                        <span className="block text-xs font-semibold tracking-wide text-muted-foreground">
                          {row.manufacturer}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.unitCount}{" "}
                      {row.unitCount === 1 ? "unidade" : "unidades"}
                      {row.units.length > 0 && (
                        <span className="ml-2 inline-flex align-middle">
                          <FieldHelpPopover
                            compact
                            title="Unidades ativas"
                            description="Identificação e situação atual das unidades deste modelo."
                            footer=""
                            items={row.units.map((unit) => {
                              const identifier =
                                unit.identifiers.plate?.value ??
                                unit.identifiers.companyTag?.value ??
                                unit.name;
                              const state =
                                unit.availability.state === "available"
                                  ? "Disponível"
                                  : "Indisponível";
                              return `${identifier} — ${state}`;
                            })}
                          />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {typeLabel(row.type)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-14 text-center">
                    <p className="text-base font-bold">
                      Nenhuma máquina encontrada
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      Modelos cadastrados aparecem aqui com suas unidades e a
                      regra de operador.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 bg-secondary/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-muted-foreground">
            {rows.length} modelos nesta página
            {hasFilters ? " · filtros ativos" : ""}
          </p>
          {pageInfo.nextCursor ? (
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={`/home/maquinas?${nextParams.toString()}`}
            >
              Próxima
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <Button disabled size="sm" variant="outline">
              Próxima
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function typeLabel(type: MachineModelListItem["type"]) {
  return type === "YELLOW_LINE" ? "Linha amarela" : "Linha branca";
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </article>
  );
}

function TableHead({
  icon: Icon,
  label,
}: {
  icon?: LucideIcon;
  label: string;
}) {
  return (
    <th className="px-4 py-3 text-xs font-bold text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
    </th>
  );
}

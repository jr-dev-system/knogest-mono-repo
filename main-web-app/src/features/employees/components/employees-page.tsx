"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarArrowDown,
  ChevronRight,
  Eye,
  FileSearch,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeCreationWizard } from "./employee-creation-wizard";
import type { EmployeeActionState } from "../employees-action-state";
import type { EmployeeListItem, EmployeesListQuery } from "../employees.server";

type EmployeeAction = (
  state: EmployeeActionState,
  formData: FormData,
) => Promise<EmployeeActionState>;

export function EmployeesPageView({
  action,
  pageInfo,
  query,
  rows,
  jobRoles,
}: {
  action: EmployeeAction;
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  query: EmployeesListQuery;
  rows: EmployeeListItem[];
  jobRoles: Array<{ id: string; name: string; isActive: boolean }>;
}) {
  const hasFilters = Boolean(query.search || query.availability || query.state);
  const nextParams = new URLSearchParams();
  if (query.search) nextParams.set("search", query.search);
  if (query.state) nextParams.set("state", query.state);
  if (query.availability) nextParams.set("availability", query.availability);
  if (query.sortBy) nextParams.set("sortBy", query.sortBy);
  if (query.sortDirection) nextParams.set("sortDirection", query.sortDirection);
  if (pageInfo.nextCursor) nextParams.set("cursor", pageInfo.nextCursor);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3" aria-label="Resumo">
        <Summary label="Vínculos ativos" value={String(rows.length)} />
        <Summary
          label="Disponíveis"
          value={String(
            rows.filter((row) => row.availability.state === "available").length,
          )}
        />
        <Summary
          label="Sem alocação"
          value={String(
            rows.filter((row) => !row.availability.hasOpenAllocation).length,
          )}
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/60 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              action="/home/funcionarios"
              className="grid gap-2 md:grid-cols-[minmax(220px,360px)_150px_150px_auto]"
            >
              <label className="relative block">
                <span className="sr-only">Buscar funcionário</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={query.search}
                  placeholder="Buscar por nome ou matrícula"
                  className="h-10 bg-background pl-9"
                />
              </label>
              <select
                name="state"
                defaultValue={query.state ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold"
              >
                <option value="">Todos</option>
                <option value="active">Ativos</option>
                <option value="terminated">Encerrados</option>
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

            <EmployeeCreationWizard
              action={action}
              initialRoles={jobRoles}
              onCreated={() => toast.success("Funcionário cadastrado.")}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <TableHead icon={UserRound} label="Nome" />
                <TableHead
                  icon={FileSearch}
                  label="CPF"
                  className="hidden lg:table-cell"
                />
                <TableHead label="Matrícula" className="hidden lg:table-cell" />
                <TableHead label="Função" />
                <TableHead label="Disponibilidade" />
                <TableHead
                  icon={CalendarArrowDown}
                  label="Admissão"
                  className="hidden xl:table-cell"
                />
                <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">
                  Detalhe
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-4 py-3 font-bold">
                      <span className="block max-w-[28ch] truncate">
                        {row.person.fullName}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 font-semibold lg:table-cell">
                      {row.person.document.maskedDocument}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {row.employment.companyRegistrationNumber}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.employment.jobRole?.name ?? (
                        <span className="font-semibold text-destructive">
                          Função pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {row.availability.state === "available"
                        ? "Disponível"
                        : "Indisponível"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                      {row.employment.admissionDate
                        ? new Intl.DateTimeFormat("pt-BR", {
                            timeZone: "UTC",
                          }).format(new Date(row.employment.admissionDate))
                        : "Sem período atual"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/home/funcionarios/${row.id}`}
                        className={buttonVariants({
                          size: "sm",
                          variant: "outline",
                        })}
                      >
                        <Eye className="size-4" />
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <p className="text-base font-bold">
                      Nenhum funcionário encontrado
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      Cadastre o primeiro funcionário com matrícula, função e
                      informações de admissão para começar a montar sua equipe.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 bg-secondary/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-muted-foreground">
            {rows.length} vínculos nesta página
            {hasFilters ? " · filtros ativos" : ""}
          </p>
          {pageInfo.nextCursor ? (
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={`/home/funcionarios?${nextParams.toString()}`}
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
  className,
}: {
  icon?: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-bold text-muted-foreground ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
    </th>
  );
}

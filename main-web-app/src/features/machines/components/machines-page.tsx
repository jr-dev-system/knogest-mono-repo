"use client";

import * as React from "react";
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronRight,
  Eye,
  FileSearch,
  Gauge,
  Plus,
  Search,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/ui/form-section";
import { OperationsModal } from "@/components/ui/operations-modal";
import type { MachineActionState } from "../machines-action-state";
import type { MachineListItem, MachinesListQuery } from "../machines.server";
import {
  formatMeterReading,
  meterTypeLabel,
  meterUnit,
  type MeterType,
} from "../meter-format";

type MachineAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;

function SubmitButton({
  formId,
  pending,
}: {
  formId?: string;
  pending: boolean;
}) {
  return (
    <Button form={formId} type="submit" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Salvando" : "Cadastrar máquina"}
    </Button>
  );
}

function Field({
  defaultValue,
  label,
  name,
  inputMode,
  placeholder,
  required = false,
  type = "text",
}: {
  defaultValue?: string;
  label: string;
  name: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <Input
        name={name}
        required={required}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="h-11"
      />
    </label>
  );
}

export function MachinesPageView({
  action,
  initialState,
  pageInfo,
  query,
  rows,
}: {
  action: MachineAction;
  initialState: MachineActionState;
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  query: MachinesListQuery;
  rows: MachineListItem[];
}) {
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const [meterType, setMeterType] = useState<MeterType>("HOUR_METER");
  const [machineDraft, setMachineDraft] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const hasFilters = Boolean(query.search || query.availability || query.type);
  const nextParams = new URLSearchParams();
  if (query.search) nextParams.set("search", query.search);
  if (query.type) nextParams.set("type", query.type);
  if (query.availability) nextParams.set("availability", query.availability);
  if (query.sortBy) nextParams.set("sortBy", query.sortBy);
  if (query.sortDirection) nextParams.set("sortDirection", query.sortDirection);
  if (pageInfo.nextCursor) nextParams.set("cursor", pageInfo.nextCursor);

  function resetMachineForm() {
    formRef.current?.reset();
    setMeterType("HOUR_METER");
    setMachineDraft({});
  }

  function handleMachineModalChange(open: boolean) {
    setIsMachineModalOpen(open);
  }

  async function createMachine(
    previousState: MachineActionState,
    formData: FormData,
  ) {
    const nextState = await action(previousState, formData);
    if (nextState.ok) {
      resetMachineForm();
      setIsMachineModalOpen(false);
      if (nextState.message) toast.success(nextState.message);
    }
    return nextState;
  }

  const [state, formAction, isPending] = useActionState(
    createMachine,
    initialState,
  );

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3" aria-label="Resumo">
        <Summary label="Máquinas nesta página" value={String(rows.length)} />
        <Summary
          label="Disponíveis"
          value={String(
            rows.filter((row) => row.availability.state === "available").length,
          )}
        />
        <Summary
          label="Com leitura confirmada"
          value={String(rows.filter((row) => row.latestMeterReading).length)}
        />
      </section>

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

            <OperationsModal
              icon={Truck}
              open={isMachineModalOpen}
              onOpenChange={handleMachineModalChange}
              size="lg"
              title="Cadastrar máquina"
              description="Registre a identificação, as características e a leitura que acompanhará a máquina durante toda a operação."
              footer={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetMachineForm();
                      setIsMachineModalOpen(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <SubmitButton
                    formId="machine-create-form"
                    pending={isPending}
                  />
                </>
              }
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Nova máquina
                </Button>
              }
            >
              <form
                ref={formRef}
                id="machine-create-form"
                action={formAction}
                className="grid gap-4"
                onChange={(event) => {
                  const target = event.target;
                  if (
                    target instanceof HTMLInputElement ||
                    target instanceof HTMLSelectElement
                  ) {
                    setMachineDraft((draft) => ({
                      ...draft,
                      [target.name]: target.value,
                    }));
                  }
                }}
              >
                <FormSection
                  title="Identificação"
                  description="Informe a placa, o patrimônio ou ambos. Pelo menos um identificador é obrigatório."
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field
                      defaultValue={machineDraft.name}
                      label="Nome"
                      name="name"
                      required
                    />
                    <Field
                      defaultValue={machineDraft.plate}
                      label="Placa"
                      name="plate"
                    />
                    <Field
                      defaultValue={machineDraft.companyTag}
                      label="Patrimônio"
                      name="companyTag"
                    />
                  </div>
                </FormSection>

                <FormSection title="Características">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-semibold">
                      <span>Tipo</span>
                      <select
                        name="type"
                        required
                        defaultValue={machineDraft.type ?? "YELLOW_LINE"}
                        className="min-h-11 rounded-md border border-input bg-background px-3 text-sm font-semibold"
                      >
                        <option value="YELLOW_LINE">Linha amarela</option>
                        <option value="WHITE_LINE">Linha branca</option>
                      </select>
                    </label>
                    <Field
                      defaultValue={machineDraft.manufacturer}
                      label="Fabricante"
                      name="manufacturer"
                      required
                    />
                    <Field
                      defaultValue={machineDraft.model}
                      label="Modelo"
                      name="model"
                      required
                    />
                    <Field
                      defaultValue={machineDraft.description}
                      label="Descrição"
                      name="description"
                    />
                  </div>
                </FormSection>

                {(machineDraft.type ?? "YELLOW_LINE") === "WHITE_LINE" && (
                  <FormSection
                    title="Capacidade de carga"
                    description="Campos opcionais. O volume será usado como capacidade padrão nos lançamentos de produção."
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        defaultValue={machineDraft.loadVolumeM3}
                        label="Volume de carga (m³)"
                        name="loadVolumeM3"
                        inputMode="decimal"
                        placeholder="Ex.: 12,500"
                      />
                      <Field
                        defaultValue={machineDraft.maxSupportedWeightT}
                        label="Peso máximo suportado (t)"
                        name="maxSupportedWeightT"
                        inputMode="decimal"
                        placeholder="Ex.: 20,000"
                      />
                    </div>
                  </FormSection>
                )}

                <FormSection
                  title="Medição inicial"
                  description="Escolha a unidade que será usada nas leituras futuras. Essa escolha não poderá ser alterada depois do cadastro."
                >
                  <div
                    className="grid gap-2 sm:grid-cols-2"
                    role="group"
                    aria-label="Tipo de leitura"
                  >
                    {(["HOUR_METER", "ODOMETER"] as const).map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant={meterType === option ? "default" : "outline"}
                        aria-pressed={meterType === option}
                        className="min-h-11 justify-start font-bold"
                        onClick={() => setMeterType(option)}
                      >
                        {meterTypeLabel(option)} ({meterUnit(option)})
                      </Button>
                    ))}
                  </div>
                  <input type="hidden" name="meterType" value={meterType} />
                  <label className="grid gap-1.5 text-sm font-semibold">
                    <span>Leitura inicial ({meterUnit(meterType)})</span>
                    <Input
                      name="initialMeterReading"
                      required
                      defaultValue={machineDraft.initialMeterReading}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-describedby="meter-reading-help"
                      className="h-11"
                    />
                  </label>
                  <p
                    id="meter-reading-help"
                    className="text-sm text-muted-foreground"
                  >
                    Use um valor igual ou maior que zero. Aceita vírgula ou
                    ponto decimal.
                  </p>
                </FormSection>

                {!state.ok && state.message && (
                  <FormErrorDeclaration
                    title="Não foi possível cadastrar a máquina."
                    description="O servidor recusou o envio. Revise o formulário antes de tentar novamente."
                    issues={[
                      {
                        location: "API",
                        message: state.message,
                      },
                    ]}
                  />
                )}
              </form>
            </OperationsModal>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <TableHead icon={Truck} label="Máquina" />
                <TableHead icon={Tag} label="Identificadores" />
                <TableHead label="Tipo" />
                <TableHead label="Fabricante / modelo" />
                <TableHead label="Capacidade de carga" />
                <TableHead icon={Gauge} label="Leitura atual" />
                <TableHead label="Disponibilidade" />
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
                      <span className="block max-w-[24ch] truncate">
                        {row.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {identifierLabel(row)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {typeLabel(row.type)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.manufacturer} / {row.model}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.type === "WHITE_LINE" ? (
                        <>
                          <span className="block font-semibold text-foreground">
                            {row.loadVolumeM3
                              ? `${row.loadVolumeM3.replace(".", ",")} m³`
                              : "Volume não informado"}
                          </span>
                          <span className="block text-xs">
                            {row.maxSupportedWeightT
                              ? `${row.maxSupportedWeightT.replace(".", ",")} t máx.`
                              : "Peso não informado"}
                          </span>
                        </>
                      ) : (
                        "Não aplicável"
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {row.latestMeterReading
                        ? formatMeterReading(
                            row.latestMeterReading.value,
                            row.meterType,
                          )
                        : "Sem leitura"}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {row.availability.state === "available"
                        ? "Disponível"
                        : "Indisponível"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/home/maquinas/${row.id}`}
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
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <p className="text-base font-bold">
                      Nenhuma máquina encontrada
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      Máquinas cadastradas aparecem aqui com identificadores,
                      leitura atual e disponibilidade derivada do backend.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 bg-secondary/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-muted-foreground">
            {rows.length} máquinas nesta página
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

function identifierLabel(row: MachineListItem) {
  const plate = row.identifiers.plate?.value;
  const tag = row.identifiers.companyTag?.value;
  if (plate && tag) return `${plate} · ${tag}`;
  return plate ?? tag ?? "Sem identificador";
}

function typeLabel(type: MachineListItem["type"]) {
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

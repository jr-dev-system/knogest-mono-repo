"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  Eye,
  Gauge,
  Loader2,
  Tag,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OperationsTable } from "@/components/ui/operations-table";
import { cn } from "@/lib/utils";
import type {
  MachineAllocationProjectContextResult,
  MachineAllocationProjectsResult,
} from "../machine-allocation.types";
import type { MachineActionState } from "../machines-action-state";
import type { MachineModelDetail } from "../machines.server";
import { formatLoadCapacity } from "../capacity-format";
import { formatMeterReading, meterTypeLabel } from "../meter-format";
import { MachineUnitCreationWizard } from "./machine-unit-creation-wizard";
import { MachineModelEditWizard } from "./machine-model-creation-wizard";

type MachineAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;
type MachineUnit = MachineModelDetail["units"][number];
type DeleteModelAction = () => Promise<MachineActionState>;
type AvailabilityFilter = "" | MachineUnit["availability"]["state"];
type MeterFilter = "" | MachineUnit["meterType"];

const controlClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export function MachineModelDetailPage({
  model,
  action,
  loadProjectAction,
  searchProjectsAction,
  deleteAction,
  jobRoles,
  updateAction,
}: {
  model: MachineModelDetail;
  action: MachineAction;
  loadProjectAction: (
    projectId: string,
  ) => Promise<MachineAllocationProjectContextResult>;
  searchProjectsAction: (input?: {
    cursor?: string | null;
    search?: string;
  }) => Promise<MachineAllocationProjectsResult>;
  deleteAction: DeleteModelAction;
  jobRoles: { id: string; name: string }[];
  updateAction: MachineAction;
}) {
  const [search, setSearch] = React.useState("");
  const [availability, setAvailability] =
    React.useState<AvailabilityFilter>("");
  const [meterType, setMeterType] = React.useState<MeterFilter>("");
  const hasFilters = Boolean(search || availability || meterType);

  const rows = React.useMemo(() => {
    const term = normalize(search);
    return model.units.filter((unit) => {
      const matchesSearch =
        !term ||
        [
          unit.name,
          unit.identifiers.plate?.value,
          unit.identifiers.companyTag?.value,
        ].some((value) => value && normalize(value).includes(term));
      const matchesAvailability =
        !availability || unit.availability.state === availability;
      const matchesMeter = !meterType || unit.meterType === meterType;
      return matchesSearch && matchesAvailability && matchesMeter;
    });
  }, [availability, meterType, model.units, search]);

  const columns = React.useMemo<ColumnDef<MachineUnit>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Unidade",
        cell: ({ row }) => (
          <div>
            <span className="block font-bold text-foreground">
              {row.original.name}
            </span>
            <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
              Cadastrada em {formatDate(row.original.createdAt)}
            </span>
          </div>
        ),
      },
      {
        id: "identifiers",
        accessorFn: (unit) => identifierLabel(unit),
        header: "Identificadores",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {identifierLabel(row.original)}
          </span>
        ),
      },
      {
        id: "latestMeterReading",
        accessorFn: (unit) => unit.latestMeterReading?.value ?? "",
        header: "Última leitura",
        cell: ({ row }) => (
          <div>
            <span className="block font-semibold text-foreground">
              {row.original.latestMeterReading
                ? formatMeterReading(
                    row.original.latestMeterReading.value,
                    row.original.meterType,
                  )
                : "Sem leitura"}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {meterTypeLabel(row.original.meterType)}
            </span>
          </div>
        ),
      },
      {
        id: "availability",
        accessorFn: (unit) => availabilityLabel(unit.availability.state),
        header: "Disponibilidade",
        cell: ({ row }) => (
          <AvailabilityBadge state={row.original.availability.state} />
        ),
      },
      {
        id: "detail",
        enableSorting: false,
        header: "Detalhe",
        cell: ({ row }) => (
          <Link
            href={`/home/maquinas/${row.original.id}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
            aria-label={`Ver unidade ${row.original.name}`}
          >
            <Eye className="size-4" />
            Ver
          </Link>
        ),
      },
    ],
    [],
  );

  const displayName = `${model.model}${model.version ? ` — ${model.version}` : ""}`;

  return (
    <div className="space-y-4">
      <Link
        href="/home/maquinas"
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        <ArrowLeft className="size-4" />
        Voltar para máquinas
      </Link>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/60 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground">
                {model.manufacturer}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-balance">
                {displayName}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground text-pretty">
                {model.description ?? "Nenhuma descrição informada."}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <span className="inline-flex min-h-9 items-center rounded-full border border-border bg-background px-3 text-sm font-bold text-foreground">
                {model.requiresOperator
                  ? `Exige ${model.requiredJobRole?.name ?? "operador"}`
                  : "Dispensa operador"}
              </span>
              <div className="flex flex-wrap gap-2">
                <MachineModelEditWizard
                  action={updateAction}
                  jobRoles={jobRoles}
                  model={model}
                />
                <MachineModelDeleteControl
                  action={deleteAction}
                  modelName={displayName}
                  unitCount={model.unitCount}
                />
              </div>
            </div>
          </div>
        </div>

        <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
          <ModelFact icon={Truck} label="Tipo" value={typeLabel(model.type)} />
          <ModelFact
            icon={Gauge}
            label="Capacidade"
            value={capacityLabel(model)}
          />
          <ModelFact
            icon={Tag}
            label="Regra de operador"
            value={
              model.requiresOperator
                ? (model.requiredJobRole?.name ?? "Qualquer operador")
                : "Não exige operador"
            }
          />
          <ModelFact
            icon={Truck}
            label="Unidades ativas"
            value={`${model.unitCount} ${model.unitCount === 1 ? "unidade" : "unidades"}`}
          />
        </dl>
      </section>

      <OperationsTable
        title="Unidades cadastradas"
        columns={columns}
        data={rows}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nome, placa ou patrimônio"
        emptyTitle={
          hasFilters
            ? "Nenhuma unidade corresponde aos filtros"
            : "Nenhuma unidade cadastrada"
        }
        emptyDescription={
          hasFilters
            ? "Ajuste a busca ou limpe os filtros para visualizar outras unidades."
            : "Crie a primeira unidade física deste modelo para iniciar o controle operacional."
        }
        getRowLabel={(unit) => unit.name}
        filters={
          <>
            <label>
              <span className="sr-only">Filtrar por disponibilidade</span>
              <select
                aria-label="Disponibilidade"
                className={controlClass}
                value={availability}
                onChange={(event) =>
                  setAvailability(event.target.value as AvailabilityFilter)
                }
              >
                <option value="">Todas as situações</option>
                <option value="available">Disponíveis</option>
                <option value="unavailable">Indisponíveis</option>
                <option value="without_rental">Sem locação vigente</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrar por medidor</span>
              <select
                aria-label="Tipo de medidor"
                className={controlClass}
                value={meterType}
                onChange={(event) =>
                  setMeterType(event.target.value as MeterFilter)
                }
              >
                <option value="">Todos os medidores</option>
                <option value="HOUR_METER">Horímetro</option>
                <option value="ODOMETER">Odômetro</option>
              </select>
            </label>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setAvailability("");
                  setMeterType("");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </>
        }
        actions={
          <MachineUnitCreationWizard
            action={action}
            loadProjectAction={loadProjectAction}
            modelName={displayName}
            modelRule={{
              requiresOperator: model.requiresOperator,
              requiredJobRoleId: model.requiredJobRole?.id ?? null,
              requiredJobRoleName: model.requiredJobRole?.name ?? null,
            }}
            searchProjectsAction={searchProjectsAction}
          />
        }
      />
    </div>
  );
}

function MachineModelDeleteControl({
  action,
  modelName,
  unitCount,
}: {
  action: DeleteModelAction;
  modelName: string;
  unitCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const blocked = unitCount > 0;

  const remove = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    toast.success(result.message);
    router.push("/home/maquinas");
    router.refresh();
  };

  return (
    <div className="grid justify-items-start gap-1 lg:justify-items-end">
      <Button
        type="button"
        variant="destructive"
        disabled={blocked}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" />
        Excluir modelo
      </Button>
      {blocked && (
        <p className="max-w-64 text-xs text-muted-foreground lg:text-right">
          Exclua as {unitCount} unidades ativas antes de excluir o modelo.
        </p>
      )}
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o modelo {modelName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Não há unidades ativas neste modelo. O modelo será arquivado e
              deixará de aparecer no catálogo; unidades inativas e todo o
              histórico operacional serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Confirmar exclusão
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ModelFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
      <dt className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1.5 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function AvailabilityBadge({
  state,
}: {
  state: MachineUnit["availability"]["state"];
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold",
        state === "available" && "bg-primary text-primary-foreground",
        state === "unavailable" &&
          "border border-border bg-muted text-muted-foreground",
        state === "without_rental" && "bg-accent text-accent-foreground",
      )}
    >
      {availabilityLabel(state)}
    </span>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function identifierLabel(unit: MachineUnit) {
  const identifiers = [
    unit.identifiers.plate?.value,
    unit.identifiers.companyTag?.value,
  ].filter(Boolean);
  return identifiers.length > 0 ? identifiers.join(" · ") : "Sem identificador";
}

function availabilityLabel(state: MachineUnit["availability"]["state"]) {
  if (state === "available") return "Disponível";
  if (state === "without_rental") return "Sem locação vigente";
  return "Indisponível";
}

function typeLabel(type: MachineModelDetail["type"]) {
  return type === "YELLOW_LINE" ? "Linha amarela" : "Linha branca";
}

function capacityLabel(model: MachineModelDetail) {
  if (model.type !== "WHITE_LINE") return "Não aplicável";
  const capacity = [
    formatLoadCapacity(model.loadCapacity, model.loadCapacityUnitCode),
    model.maxSupportedWeightT
      ? `${model.maxSupportedWeightT.replace(".", ",")} t`
      : null,
  ].filter(Boolean);
  return capacity.length > 0 ? capacity.join(" · ") : "Não informada";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(value),
  );
}

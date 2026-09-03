"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Gauge, Save, Scale, Tag, Truck } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionNotification } from "@/hooks/useActionNotification";
import type { MachineActionState } from "../machines-action-state";
import type { MachineDetail } from "../machines.server";
import { formatMeterReading, meterTypeLabel } from "../meter-format";

type LoadSpecificationAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;

export function MachineDetailPage({
  action,
  machine,
}: {
  action: LoadSpecificationAction;
  machine: MachineDetail;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {
    ok: false,
    message: "",
  });

  useActionNotification(state);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <div className="space-y-4">
      <Link
        href="/home/maquinas"
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        <ArrowLeft className="size-4" />
        Voltar
      </Link>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/60 px-4 py-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-muted-foreground">
              {typeLabel(machine.type)}
            </p>
            <h2 className="text-2xl font-bold">{machine.name}</h2>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <DetailBlock
            icon={Truck}
            label="Fabricante / modelo"
            value={`${machine.manufacturer} / ${machine.model}`}
          />
          <DetailBlock
            icon={Tag}
            label="Identificadores"
            value={identifierLabel(machine)}
          />
          <DetailBlock
            icon={Gauge}
            label={meterTypeLabel(machine.meterType)}
            value={
              machine.latestMeterReading
                ? formatMeterReading(
                    machine.latestMeterReading.value,
                    machine.meterType,
                  )
                : "Sem leitura"
            }
          />
        </div>

        <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-2">
          <Info label="Disponibilidade">
            {machine.availability.state === "available"
              ? "Disponível"
              : "Indisponível"}
          </Info>
          <Info label="Alocação aberta">
            {machine.availability.hasOpenAllocation ? "Sim" : "Não"}
          </Info>
          <Info label="Leitura registrada em">
            {machine.latestMeterReading
              ? formatDateTime(machine.latestMeterReading.recordedAt)
              : "Sem leitura"}
          </Info>
          <Info label="Tipo de leitura">
            {meterTypeLabel(machine.meterType)} ({" "}
            {machine.meterType === "HOUR_METER" ? "h" : "km"})
          </Info>
          <Info label="Propriedade atual">
            {machine.ownership
              ? `Desde ${formatDateTime(machine.ownership.effectiveFrom)}`
              : "Sem propriedade atual"}
          </Info>
          <Info label="Descrição">
            {machine.description ?? "Sem descrição"}
          </Info>
          <Info label="Operador">
            {machine.machineModel.requiresOperator
              ? `Exige ${machine.machineModel.requiredJobRole?.name ?? "operador"}`
              : "Não exige operador"}
          </Info>
        </div>

        {machine.type === "WHITE_LINE" && (
          <form
            action={formAction}
            className="grid gap-4 border-t border-border bg-secondary/20 p-4"
          >
            <div>
              <h3 className="font-bold">Capacidade de carga</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                O volume positivo torna a máquina elegível para lançamentos de
                produção quando ela estiver mobilizada na frente e no turno. O
                peso máximo é apenas informativo nesta versão.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Truck className="size-4" /> Volume de carga (m³)
                </span>
                <Input
                  name="loadVolumeM3"
                  inputMode="decimal"
                  defaultValue={machine.loadVolumeM3?.replace(".", ",") ?? ""}
                  placeholder="Ex.: 12,500"
                  disabled={pending}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Scale className="size-4" /> Peso máximo suportado (t)
                </span>
                <Input
                  name="maxSupportedWeightT"
                  inputMode="decimal"
                  defaultValue={
                    machine.maxSupportedWeightT?.replace(".", ",") ?? ""
                  }
                  placeholder="Ex.: 20,000"
                  disabled={pending}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                <Save className="size-4" />
                {pending ? "Salvando..." : "Salvar capacidade"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function DetailBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </article>
  );
}

function Info({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold">{children}</p>
    </div>
  );
}

function identifierLabel(machine: MachineDetail) {
  const plate = machine.identifiers.plate?.value;
  const tag = machine.identifiers.companyTag?.value;
  if (plate && tag) return `${plate} · ${tag}`;
  return plate ?? tag ?? "Sem identificador";
}

function typeLabel(type: MachineDetail["type"]) {
  return type === "YELLOW_LINE" ? "Linha amarela" : "Linha branca";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

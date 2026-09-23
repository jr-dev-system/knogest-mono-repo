"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, Plus, Truck } from "lucide-react";
import { toast } from "sonner";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MachineActionState } from "../machines-action-state";
import type { MachineModelDetail } from "../machines.server";

type AddUnitsAction = (
  state: MachineActionState,
  formData: FormData,
) => Promise<MachineActionState>;

export function MachineModelDetailPage({
  model,
  action,
}: {
  model: MachineModelDetail;
  action: AddUnitsAction;
}) {
  const [unitCount, setUnitCount] = useState(1);
  const [state, formAction, pending] = useActionState(
    async (previousState: MachineActionState, formData: FormData) => {
      const result = await action(previousState, formData);
      if (result.ok) {
        toast.success(result.message);
      }
      return result;
    },
    { ok: false, message: "" },
  );
  const unit = model.meterType === "HOUR_METER" ? "h" : "km";

  return (
    <div className="space-y-4">
      <Link
        href="/home/maquinas"
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              Modelo de máquina
            </p>
            <h2 className="text-2xl font-bold">
              {model.manufacturer} / {model.model}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {model.description ?? "Sem descrição"}
            </p>
          </div>
          <div className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold">
            {model.requiresOperator
              ? `Exige: ${model.requiredJobRole?.name ?? "operador"}`
              : "Não exige operador"}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info
            label="Tipo"
            value={
              model.type === "WHITE_LINE" ? "Linha branca" : "Linha amarela"
            }
          />
          <Info
            label="Medidor"
            value={model.meterType === "HOUR_METER" ? "Horímetro" : "Odômetro"}
          />
          <Info label="Unidades" value={String(model.unitCount)} />
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-bold">Unidades cadastradas</h3>
        <div className="mt-3 grid gap-2">
          {model.units.map((machine) => (
            <Link
              key={machine.id}
              href={`/home/maquinas/${machine.id}`}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-secondary/50"
            >
              <span className="font-semibold">{machine.name}</span>
              <span className="text-sm text-muted-foreground">
                {machine.identifiers.plate?.value ??
                  machine.identifiers.companyTag?.value ??
                  "Sem identificador"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <form
        action={formAction}
        aria-busy={pending}
        className="rounded-lg border border-border bg-card p-4"
      >
        <h3 className="font-bold">Adicionar unidades</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada nova unidade terá sua própria identificação e leitura inicial.
        </p>
        <div className="mt-4 grid gap-3">
          {Array.from({ length: unitCount }, (_, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              <Field
                name="unitName"
                label={`Nome da unidade ${index + 1}`}
                required
                disabled={pending}
              />
              <Field name="unitPlate" label="Placa" disabled={pending} />
              <Field
                name="unitCompanyTag"
                label="Patrimônio"
                disabled={pending}
              />
              <Field
                name="unitInitialMeterReading"
                label={`Leitura inicial (${unit})`}
                required
                disabled={pending}
              />
            </div>
          ))}
        </div>
        {!state.ok && state.message && (
          <FormErrorDeclaration
            className="mt-4"
            title="Não foi possível adicionar as unidades."
            issues={[{ message: state.message }]}
          />
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setUnitCount((count) => count + 1)}
          >
            <Plus className="size-4" /> Outra unidade
          </Button>
          <Button type="submit" disabled={pending}>
            <Truck className="size-4" />{" "}
            {pending ? "Salvando" : "Adicionar unidades"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required = false,
  disabled = false,
}: {
  label: string;
  name: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <Input
        name={name}
        required={required}
        disabled={disabled}
        className="h-11"
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}

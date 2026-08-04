"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  CalendarDays,
  FileSearch,
  RotateCcw,
  UserRound,
  BriefcaseBusiness,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmployeeActionState } from "../employees-action-state";
import type { EmployeeDetail } from "../employees.server";

type EmployeeAction = (
  state: EmployeeActionState,
  formData: FormData,
) => Promise<EmployeeActionState>;

const initialState: EmployeeActionState = { ok: false, message: "" };

export function EmployeeDetailPage({
  action,
  allocateAction,
  jobRoleAction,
  releaseAction,
  termsAction,
  reallocateAction,
  terminateAction,
  jobRoles,
  projects,
  destinations,
  companyId,
  record,
}: {
  action: EmployeeAction;
  allocateAction: EmployeeAction;
  jobRoleAction: EmployeeAction;
  releaseAction: EmployeeAction;
  termsAction: EmployeeAction;
  reallocateAction: EmployeeAction;
  terminateAction: EmployeeAction;
  jobRoles: Array<{ id: string; name: string; isActive: boolean }>;
  projects: Array<{ id: string; name: string }>;
  destinations: Array<{
    id: string;
    name: string;
    projects: Array<{ id: string; name: string; status: string }>;
  }>;
  companyId: string;
  record: EmployeeDetail;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [jobRoleState, jobRoleFormAction] = useActionState(
    jobRoleAction,
    initialState,
  );
  const canRehire = record.employment.state === "terminated";
  const [terminationState, terminateFormAction] = useActionState(
    terminateAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/home/funcionarios"
          className={buttonVariants({ variant: "outline" })}
        >
          <ArrowLeft className="size-4" />
          Funcionários
        </Link>

        {canRehire && (
          <form
            action={formAction}
            className="flex flex-col gap-2 sm:items-end"
          >
            <input type="hidden" name="employmentId" value={record.id} />
            <RehireButton />
            {state.message && (
              <p
                role="status"
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  state.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-red-200 bg-red-50 text-red-950"
                }`}
              >
                {state.message}
              </p>
            )}
          </form>
        )}
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/60 px-4 py-3">
          <h1 className="text-xl font-bold">{record.person.fullName}</h1>
          <p className="text-sm font-semibold text-muted-foreground">
            Matrícula {record.employment.companyRegistrationNumber}
          </p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <DetailGroup icon={UserRound} title="Pessoa">
            <Detail label="Nome" value={record.person.fullName} />
            <Detail
              label="CPF autorizado"
              value={record.person.document.plaintextDocument}
            />
            <Detail
              label="CPF mascarado"
              value={record.person.document.maskedDocument}
            />
          </DetailGroup>
          <DetailGroup icon={FileSearch} title="Vínculo">
            <Detail
              label="Estado"
              value={
                record.employment.state === "active" ? "Ativo" : "Encerrado"
              }
            />
            <Detail
              label="Disponibilidade"
              value={
                record.availability.state === "available"
                  ? "Disponível"
                  : "Indisponível"
              }
            />
            <Detail
              label="Alocação aberta"
              value={record.availability.hasOpenAllocation ? "Sim" : "Não"}
            />
            <Detail
              label="Função atual"
              value={record.employment.jobRole?.name ?? "Função pendente"}
            />
            {record.availability.functionPending && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                Função pendente: defina uma função antes de alocar este
                funcionário.
              </p>
            )}
          </DetailGroup>
          <DetailGroup icon={UserRound} title="Histórico de funções">
            {record.jobRolePeriods.length ? (
              record.jobRolePeriods.map((period) => (
                <div key={period.id} className="rounded-md bg-muted p-3">
                  <Detail label="Função" value={period.jobRole.name} />
                  <Detail
                    label="Estado"
                    value={period.state === "current" ? "Atual" : "Encerrada"}
                  />
                  <Detail
                    label="Início"
                    value={formatDate(period.effectiveFrom)}
                  />
                  {period.reason && (
                    <Detail label="Motivo" value={period.reason} />
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma função registrada neste vínculo.
              </p>
            )}
          </DetailGroup>
          <DetailGroup icon={CalendarDays} title="Histórico de períodos">
            {record.periods.map((period) => (
              <div key={period.id} className="rounded-md bg-muted p-3">
                <Detail
                  label="Estado"
                  value={period.state === "current" ? "Atual" : "Encerrado"}
                />
                <Detail
                  label="Admissão"
                  value={formatDate(period.admissionDate)}
                />
                <Detail
                  label="Início efetivo"
                  value={formatDate(period.effectiveFrom)}
                />
                <Detail
                  label="Fim efetivo"
                  value={
                    period.effectiveTo
                      ? formatDate(period.effectiveTo)
                      : "Aberto"
                  }
                />
                {period.terminationReason && (
                  <Detail label="Motivo" value={period.terminationReason} />
                )}
              </div>
            ))}
          </DetailGroup>
        </div>
        {record.employment.state === "active" && (
          <form
            action={jobRoleFormAction}
            className="grid gap-3 border-t bg-secondary/20 p-4 sm:grid-cols-3"
          >
            <div className="sm:col-span-3">
              <h2 className="text-sm font-bold">Alterar função</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A mudança cria um novo período no histórico. Obras com alocação
                aberta poderão exigir reconfirmação.
              </p>
            </div>
            <input type="hidden" name="employmentId" value={record.id} />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Nova função</span>
              <select
                name="jobRoleId"
                required
                defaultValue=""
                className="min-h-11 rounded-md border border-input bg-background px-3"
              >
                <option value="">Selecione a função</option>
                {jobRoles
                  .filter(
                    (role) =>
                      role.isActive &&
                      role.id !== record.employment.jobRole?.id,
                  )
                  .map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Motivo</span>
              <Input
                name="reason"
                required
                maxLength={240}
                placeholder="Ex.: promoção"
                className="min-h-11"
              />
            </label>
            <div className="flex items-end">
              <JobRoleSubmit />
            </div>
            {jobRoleState.message && (
              <p
                role="status"
                className={
                  jobRoleState.ok
                    ? "text-sm font-medium text-emerald-700 sm:col-span-3"
                    : "text-sm font-medium text-destructive sm:col-span-3"
                }
              >
                {jobRoleState.message}
              </p>
            )}
          </form>
        )}
      </section>
      {record.employment.state === "active" && (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="text-sm font-bold">Encerrar vínculo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta ação encerra imediatamente o vínculo e a alocação operacional aberta, se houver.
          </p>
          <form action={terminateFormAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="employmentId" value={record.id} />
            <label className="grid flex-1 gap-1.5 text-sm font-semibold">
              <span>Motivo</span>
              <Input name="reason" required maxLength={240} placeholder="Ex.: desligamento solicitado" />
            </label>
            <TerminateSubmit />
          </form>
          {terminationState.message && (
            <p role="status" className={terminationState.ok ? "mt-2 text-sm font-medium text-emerald-700" : "mt-2 text-sm font-medium text-destructive"}>
              {terminationState.message}
            </p>
          )}
        </section>
      )}
      <AllocationPanel
        record={record}
        projects={projects}
        destinations={destinations}
        companyId={companyId}
        allocateAction={allocateAction}
        releaseAction={releaseAction}
        termsAction={termsAction}
        reallocateAction={reallocateAction}
      />
    </div>
  );
}

function AllocationPanel({
  record,
  projects,
  destinations,
  companyId,
  allocateAction,
  releaseAction,
  termsAction,
  reallocateAction,
}: {
  record: EmployeeDetail;
  projects: Array<{ id: string; name: string }>;
  destinations: Array<{
    id: string;
    name: string;
    projects: Array<{ id: string; name: string; status: string }>;
  }>;
  companyId: string;
  allocateAction: EmployeeAction;
  releaseAction: EmployeeAction;
  termsAction: EmployeeAction;
  reallocateAction: EmployeeAction;
}) {
  const [allocateState, allocateFormAction] = useActionState(
    allocateAction,
    initialState,
  );
  const [releaseState, releaseFormAction] = useActionState(
    releaseAction,
    initialState,
  );
  const [termsState, termsFormAction] = useActionState(
    termsAction,
    initialState,
  );
  const [reallocateState, reallocateFormAction] = useActionState(
    reallocateAction,
    initialState,
  );
  const allocation = record.currentAllocation;
  const [destinationCompanyId, setDestinationCompanyId] = useState(companyId);
  if (!allocation)
    return record.employment.state === "active" ? (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="inline-flex items-center gap-2 text-base font-bold">
          <BriefcaseBusiness className="size-4" />
          Alocação operacional
        </h2>
        <form
          action={allocateFormAction}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="employmentId" value={record.id} />
          <label className="grid gap-1 text-sm font-semibold">
            Obra
            <select
              name="projectId"
              required
              className="min-h-11 rounded-md border bg-background px-3"
            >
              <option value="">Selecione</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <TermsFields />
          <div className="md:col-span-2">
            <AllocationSubmit label="Alocar funcionário" />
          </div>
          {allocateState.message && (
            <p
              role="status"
              className={
                allocateState.ok
                  ? "text-sm text-emerald-700"
                  : "text-sm text-destructive"
              }
            >
              {allocateState.message}
            </p>
          )}
        </form>
      </section>
    ) : null;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="inline-flex items-center gap-2 text-base font-bold">
        <BriefcaseBusiness className="size-4" />
        Alocação atual
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {allocation.project.name} · {allocation.jobRole} ·{" "}
        {allocation.monthlyWorkloadHours} h/mês
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <form
          action={releaseFormAction}
          className="grid gap-2 rounded-md border p-3"
        >
          <input type="hidden" name="employmentId" value={record.id} />
          <input type="hidden" name="allocationId" value={allocation.id} />
          <label className="grid gap-1 text-sm font-semibold">
            Motivo da liberação
            <Input name="reason" required maxLength={500} />
          </label>
          <AllocationSubmit label="Liberar agora" />
          {releaseState.message && (
            <p role="status" className="text-sm">
              {releaseState.message}
            </p>
          )}
        </form>
        <form
          action={termsFormAction}
          className="grid gap-2 rounded-md border p-3"
        >
          <input type="hidden" name="employmentId" value={record.id} />
          <input type="hidden" name="allocationId" value={allocation.id} />
          <TermsFields defaults={allocation} includeReason />
          <AllocationSubmit label="Atualizar termos" />
          {termsState.message && (
            <p role="status" className="text-sm">
              {termsState.message}
            </p>
          )}
        </form>
        <form
          action={reallocateFormAction}
          className="grid gap-2 rounded-md border p-3"
        >
          <input type="hidden" name="employmentId" value={record.id} />
          <input type="hidden" name="allocationId" value={allocation.id} />
          <label className="grid gap-1 text-sm font-semibold">
            Empresa destino
            <select
              name="destinationCompanyId"
              required
              value={destinationCompanyId}
              onChange={(event) => setDestinationCompanyId(event.target.value)}
              className="min-h-11 rounded-md border bg-background px-3"
            >
              {destinations.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Obra destino
            <select
              name="destinationProjectId"
              required
              className="min-h-11 rounded-md border bg-background px-3"
            >
              <option value="">Selecione</option>
              {(
                destinations.find(
                  (company) => company.id === destinationCompanyId,
                )?.projects ?? []
              )
                .filter((project) => project.id !== allocation.project.id)
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </label>
          <TermsFields defaults={allocation} includeReason />
          <AllocationSubmit label="Realocar" />
          {reallocateState.message && (
            <p role="status" className="text-sm">
              {reallocateState.message}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function TermsFields({
  defaults,
  includeReason = false,
}: {
  defaults?: NonNullable<EmployeeDetail["currentAllocation"]>;
  includeReason?: boolean;
}) {
  return (
    <>
      <label className="grid gap-1 text-sm font-semibold">
        Função
        <Input
          name="jobRole"
          required
          maxLength={120}
          defaultValue={defaults?.jobRole}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Carga mensal (h)
        <Input
          name="monthlyWorkloadHours"
          type="number"
          min="1"
          max="744"
          required
          defaultValue={defaults?.monthlyWorkloadHours}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Modalidade
        <select
          name="compensationMode"
          required
          defaultValue={defaults?.compensationMode ?? "daily"}
          className="min-h-11 rounded-md border bg-background px-3"
        >
          <option value="daily">Diária</option>
          <option value="hourly">Hora</option>
          <option value="weekly">Semanal</option>
          <option value="fortnightly">Quinzenal</option>
          <option value="monthly">Mensal</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Remuneração
        <Input
          name="compensationValue"
          required
          pattern="^(?:0|[1-9][0-9]*)\\.[0-9]{2}$"
          defaultValue={defaults?.compensationValue}
          placeholder="0.00"
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Hora extra
        <Input
          name="overtimeRate"
          required
          pattern="^(?:0|[1-9][0-9]*)\\.[0-9]{2}$"
          defaultValue={defaults?.overtimeRate}
          placeholder="0.00"
        />
      </label>
      {includeReason && (
        <label className="grid gap-1 text-sm font-semibold">
          Motivo
          <Input name="reason" required maxLength={500} />
        </label>
      )}
    </>
  );
}

function AllocationSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

function RehireButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <RotateCcw className="size-4" />
      {pending ? "Recontratando" : "Recontratar funcionário"}
    </Button>
  );
}

function JobRoleSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-h-11">
      {pending ? "Salvando…" : "Salvar função"}
    </Button>
  );
}

function TerminateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Encerrando…" : "Confirmar encerramento"}
    </Button>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(value),
  );
}

function DetailGroup({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <article className="space-y-3">
      <h2 className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <Icon className="size-4" />
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

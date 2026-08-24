"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionNotification } from "@/hooks/useActionNotification";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { createJobRoleAction, deactivateJobRoleAction, renameJobRoleAction, type JobRoleActionState } from "./job-roles.actions";

const initialState: JobRoleActionState = { ok: false, message: "" };
type Role = { id: string; name: string; isActive: boolean };

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Salvando…" : children}</Button>;
}

function Feedback({ state }: { state: JobRoleActionState }) {
  useActionNotification(state);
  return null;
}

function RoleRow({ role }: { role: Role }) {
  const [state, action] = useActionState(renameJobRoleAction, initialState);
  const [deactivation, deactivate] = useActionState(deactivateJobRoleAction, initialState);
  return <li className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <form action={action} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="jobRoleId" value={role.id} />
      <Input aria-label={`Nome da função ${role.name}`} name="name" defaultValue={role.name} disabled={!role.isActive} maxLength={120} className="min-h-11" />
      <Button type="submit" variant="outline" disabled={!role.isActive} className="min-h-11"><Pencil className="size-4" />Renomear</Button>
      <Feedback state={state} />
    </form>
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      {role.isActive ? <AlertDialog><AlertDialogTrigger render={<Button variant="outline" className="min-h-11 text-destructive hover:text-destructive" />}><Power className="size-4" />Desativar</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Desativar {role.name}?</AlertDialogTitle><AlertDialogDescription>Ela deixará de estar disponível para novos vínculos e alocações. Os históricos existentes serão preservados.</AlertDialogDescription></AlertDialogHeader><form action={deactivate}><input type="hidden" name="jobRoleId" value={role.id} /><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><DeactivateSubmit /></AlertDialogFooter></form></AlertDialogContent></AlertDialog> : <span className="inline-flex h-8 items-center text-sm font-medium text-muted-foreground">Inativa</span>}
      <Feedback state={deactivation} />
    </div>
  </li>;
}

function DeactivateSubmit() {
  const { pending } = useFormStatus();
  return <AlertDialogAction variant="destructive" type="submit" disabled={pending}>{pending ? "Desativando…" : "Desativar função"}</AlertDialogAction>;
}

export function JobRolesSettings({ roles }: { roles: Role[] }) {
  const [state, action] = useActionState(createJobRoleAction, initialState);
  const active = roles.filter((role) => role.isActive).length;
  return <section className="rounded-lg border border-border bg-card" aria-labelledby="job-roles-title">
    <header className="border-b border-border bg-secondary/40 px-5 py-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="job-roles-title" className="text-lg font-bold">Funções da empresa</h2><span className="text-sm font-semibold text-muted-foreground">{active} {active === 1 ? "função ativa" : "funções ativas"}</span></div><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">A função é definida no vínculo do funcionário e confirmada ao alocá-lo na obra.</p></header>
    <div className="p-5"><form action={action} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1.5 text-sm font-semibold"><span>Nova função</span><Input name="name" required maxLength={120} placeholder="Ex.: Operador de máquina" className="min-h-11" /></label><Submit><Plus className="size-4" />Adicionar função</Submit></form><div className="mt-2"><Feedback state={state} /></div></div>
    {roles.length ? <ul className="divide-y divide-border border-t border-border">{roles.map((role) => <RoleRow key={role.id} role={role} />)}</ul> : <div className="px-5 py-12 text-center"><p className="font-bold">Nenhuma função cadastrada</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Crie a primeira função para poder registrar funcionários e confirmar a equipe nas obras.</p></div>}
  </section>;
}

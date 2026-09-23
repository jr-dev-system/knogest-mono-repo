import { Building2, ShieldCheck } from "lucide-react";

export function WorkspaceSelection({ companyName }: { companyName: string }) {
  return (
    <div className="space-y-4">
      <section
        className="rounded-lg border border-border bg-card px-4 py-4 lg:px-5"
        aria-labelledby="workspace-title"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
            <p className="font-bold">{companyName}</p>
            <p className="mt-1 text-muted-foreground">
              Company selecionada · sessão protegida
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-lg border border-border bg-card px-5 py-8"
        aria-label="Workspace ativo"
      >
        <span className="flex size-11 items-center justify-center rounded-md bg-accent text-primary">
          <Building2 className="size-5" />
        </span>
        <h3 className="mt-4 text-lg font-bold">{companyName}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Listas de projetos, máquinas, equipes e fornecedores serão carregadas
          por histórias futuras a partir deste escopo. Nenhum dado operacional
          mockado é usado como autoridade de Company.
        </p>
      </section>
    </div>
  );
}

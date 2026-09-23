import { Building2 } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";

export function CompanySelectionEmpty() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center rounded-lg border border-border bg-card px-6 py-10">
        <span className="flex size-12 items-center justify-center rounded-md bg-accent text-primary">
          <Building2 className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">
          Nenhuma empresa ativa disponível
        </h1>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}

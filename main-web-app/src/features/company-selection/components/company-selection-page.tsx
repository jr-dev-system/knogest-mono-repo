import { Building2 } from "lucide-react";

import { selectCompanyAction } from "../actions/select-company.action";
import type { CompanyOption } from "../types";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";

export function CompanySelectionPage({
  companies,
}: {
  companies: CompanyOption[];
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto max-w-3xl rounded-lg border border-border bg-card px-6 py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="flex size-11 items-center justify-center rounded-md bg-accent text-primary">
              <Building2 className="size-5" />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              Escolha a empresa de trabalho
            </h1>
          </div>
          <SignOutButton />
        </div>

        <div className="mt-7 space-y-3">
          {companies.map((company) => (
            <form key={company.id} action={selectCompanyAction}>
              <input type="hidden" name="companyId" value={company.id} />
              <Button
                type="submit"
                variant="outline"
                className="h-auto w-full justify-start px-4 py-4 text-left"
              >
                <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-primary">
                  <Building2 className="size-4" />
                </span>
                <span className="ml-3 min-w-0">
                  <span className="block truncate font-semibold">
                    {company.name}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Entrar neste workspace
                  </span>
                </span>
              </Button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}

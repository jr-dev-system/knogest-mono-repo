"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  Fuel,
  Gauge,
  LayoutDashboard,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  SunMedium,
  Truck,
  UsersRound,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { cn } from "@/lib/utils";
import { selectCompanyAction } from "@/features/company-selection/actions/select-company.action";
import type { CompanyOption } from "@/features/company-selection/types";

export type AppArea =
  | "dashboard"
  | "clients"
  | "employees"
  | "machines"
  | "works"
  | "suppliers"
  | "settings";

type AppShellNavigation = {
  mainNavigationExpanded: boolean;
  setMainNavigationExpanded: (expanded: boolean) => void;
};

const AppShellNavigationContext = createContext<AppShellNavigation | null>(
  null,
);

export function useAppShellNavigation() {
  return useContext(AppShellNavigationContext);
}

const areaMeta: Record<
  AppArea,
  { label?: string; title: string; subtitle?: string }
> = {
  dashboard: {
    label: "Visão geral",
    title: "Workspace ativo",
  },
  employees: {
    title: "Funcionários",
  },
  clients: {
    title: "Clientes",
  },
  machines: {
    title: "Máquinas",
  },
  works: {
    title: "Obras",
  },
  suppliers: {
    title: "Fornecedores",
  },
  settings: {
    title: "Configurações",
  },
};

const navItems = [
  {
    href: "/home",
    label: "Visão geral",
    icon: LayoutDashboard,
    area: "dashboard",
  },
  {
    href: "/home/funcionarios",
    label: "Funcionários",
    icon: UsersRound,
    area: "employees",
  },
  {
    href: "/home/clientes",
    label: "Clientes",
    icon: Building2,
    area: "clients",
  },
  {
    href: "/home/maquinas",
    label: "Máquinas",
    icon: Truck,
    area: "machines",
  },
  { href: "/home/obras", label: "Obras", icon: Map, area: "works" },
  {
    href: "/home/fornecedores",
    label: "Fornecedores",
    icon: Fuel,
    area: "suppliers",
  },
  {
    href: "/home/configuracoes",
    label: "Configurações",
    icon: Settings,
    area: "settings",
  },
] satisfies Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  area: AppArea;
}>;

export function AppShell({
  children,
  companies,
  navigationMode = "default",
  userId,
  selectedCompany,
  currentArea = "dashboard",
}: {
  children: ReactNode;
  companies: CompanyOption[];
  navigationMode?: "default" | "project";
  userId: string;
  selectedCompany: CompanyOption;
  currentArea?: AppArea;
}) {
  const meta = areaMeta[currentArea];
  const isProjectNavigation = navigationMode === "project";
  const [mainNavigationExpanded, setMainNavigationExpanded] = useState(
    !isProjectNavigation,
  );
  const mainSidebarExpanded =
    !isProjectNavigation || mainNavigationExpanded;

  return (
    <AppShellNavigationContext.Provider
      value={{ mainNavigationExpanded, setMainNavigationExpanded }}
    >
      <div className="min-h-screen bg-background text-foreground">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border bg-sidebar py-5 transition-[width,padding] duration-200 ease-out motion-reduce:transition-none md:flex md:flex-col",
            mainSidebarExpanded ? "w-64 px-4" : "w-14 px-2",
          )}
        >
          <div
            className={cn(
              "flex items-center",
              mainSidebarExpanded ? "justify-between gap-2 px-2" : "justify-center",
            )}
          >
            <Link
              href="/home"
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                mainSidebarExpanded ? "px-0" : "justify-center",
              )}
              aria-label="Ir para visão geral"
              title={mainSidebarExpanded ? undefined : "KnoGest"}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                KG
              </span>
              {mainSidebarExpanded && (
                <span className="min-w-0">
                  <span className="block text-sm font-bold">KnoGest</span>
                  <span className="block text-xs font-medium text-muted-foreground">
                    Operação de campo
                  </span>
                </span>
              )}
            </Link>
            {isProjectNavigation && mainSidebarExpanded && (
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                aria-label="Recolher navegação principal"
                title="Recolher navegação principal"
                onClick={() => setMainNavigationExpanded(false)}
              >
                <PanelLeftClose className="size-4" />
              </button>
            )}
          </div>

          {isProjectNavigation && !mainSidebarExpanded && (
            <button
              type="button"
              className="mt-5 inline-flex size-10 self-center items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              aria-label="Expandir navegação principal"
              title="Expandir navegação principal"
              onClick={() => setMainNavigationExpanded(true)}
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}

          <nav
            className={cn(
              "space-y-1",
              mainSidebarExpanded || !isProjectNavigation ? "mt-6" : "mt-4",
            )}
            aria-label="Navegação principal"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.area === currentArea;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                    mainSidebarExpanded || !isProjectNavigation
                      ? "gap-2 px-3"
                      : "justify-center px-0",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={
                    mainSidebarExpanded || !isProjectNavigation
                      ? undefined
                      : item.label
                  }
                  title={
                    mainSidebarExpanded || !isProjectNavigation
                      ? undefined
                      : item.label
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  {(mainSidebarExpanded || !isProjectNavigation) && item.label}
                </Link>
              );
            })}
          </nav>

          {!isProjectNavigation && (
            <>
              <div className="mt-6 rounded-lg border border-border bg-card px-3 py-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <SunMedium className="size-4 text-primary" />
                  Escopo confiável
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  As rotas operacionais usam somente a Company persistida na
                  sessão.
                </p>
              </div>

              <div className="mt-auto rounded-lg border border-sidebar-border bg-accent px-3 py-3 text-xs text-accent-foreground">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="size-4" />
                  Sessão corporativa
                </div>
                <p className="mt-2 break-all text-primary">{userId}</p>
              </div>
            </>
          )}
        </aside>

        <div
          className={cn(
            "transition-[padding] duration-200 ease-out motion-reduce:transition-none",
            mainSidebarExpanded ? "md:pl-64" : "md:pl-14",
          )}
        >
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
              <div className="min-w-0">
                {meta.label && (
                  <p className="text-xs font-semibold text-muted-foreground">
                    {meta.label}
                  </p>
                )}
                <h1 className="truncate text-lg font-bold leading-tight">
                  {currentArea === "dashboard"
                    ? selectedCompany.name
                    : meta.title}
                </h1>
                {meta.subtitle && (
                  <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">
                    {meta.subtitle}
                  </p>
                )}
              </div>

              <div className="flex min-w-0 items-center gap-2">
                <CompanySelector
                  companies={companies}
                  selectedCompany={selectedCompany}
                  compact
                  className="w-[min(16rem,48vw)]"
                />
                <SignOutButton />
              </div>
            </div>

            <nav
              className="grid grid-cols-3 gap-2 border-t border-border px-3 py-2 sm:grid-cols-6 md:hidden"
              aria-label="Navegação principal"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.area === currentArea;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="size-4" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="px-3 py-4 sm:px-5 md:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
      </div>
    </AppShellNavigationContext.Provider>
  );
}

function CompanySelector({
  className,
  compact = false,
  companies,
  selectedCompany,
}: {
  className?: string;
  compact?: boolean;
  companies: CompanyOption[];
  selectedCompany: CompanyOption;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  return (
    <details ref={detailsRef} className={cn("group relative", className)}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-sidebar-border bg-card text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
          compact ? "px-3 py-2" : "px-3 py-3",
        )}
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium text-muted-foreground">
            Seletor de empresas
          </span>
          <span className="mt-1 block truncate text-sm font-semibold">
            {selectedCompany.name}
          </span>
          {!compact && (
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              Workspace ativo da sessão
            </span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="absolute left-0 right-0 z-30 mt-2 rounded-lg border border-border bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10">
        {companies.map((company) => (
          <form key={company.name} action={selectCompanyAction}>
            <input type="hidden" name="companyId" value={company.id} />
            <button
              type="submit"
              onClick={() => detailsRef.current?.removeAttribute("open")}
              className={cn(
                "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                company.id === selectedCompany.id && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
                  company.id === selectedCompany.id
                    ? "border-primary/30 bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <Building2 className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {company.name}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {company.id === selectedCompany.id
                    ? "Workspace atual"
                    : "Trocar para esta empresa"}
                </span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}

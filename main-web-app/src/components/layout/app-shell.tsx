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
  Check,
  ChevronDown,
  Fuel,
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
  const [mainNavigationExpanded, setMainNavigationExpanded] =
    useState(!isProjectNavigation);
  const mainSidebarExpanded = !isProjectNavigation || mainNavigationExpanded;

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
              mainSidebarExpanded
                ? "justify-between gap-2 px-2"
                : "justify-center",
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
                  className="w-[min(18rem,calc(100vw-6.5rem))] sm:w-72"
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
        aria-label={`Empresa atual: ${selectedCompany.name}. Trocar empresa`}
        title="Trocar empresa"
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-md border border-input bg-background px-2.5 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
          !compact && "px-3",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
          <Building2 aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {selectedCompany.name}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
          strokeWidth={2.5}
        />
      </summary>

      <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md">
        <p className="px-3 py-2 text-xs font-semibold text-muted-foreground">
          Trocar empresa
        </p>
        <div className="max-h-[min(20rem,calc(100vh-6rem))] overflow-y-auto px-1">
          {companies.map((company) => {
            const isSelected = company.id === selectedCompany.id;

            return (
              <form key={company.id} action={selectCompanyAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <button
                  type="submit"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => detailsRef.current?.removeAttribute("open")}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                    isSelected &&
                      "bg-accent font-semibold text-accent-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {isSelected ? (
                      <Check
                        aria-hidden="true"
                        className="size-4"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <Building2 aria-hidden="true" className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {company.name}
                  </span>
                  {isSelected && <span className="sr-only">Empresa atual</span>}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </details>
  );
}

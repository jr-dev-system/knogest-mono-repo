"use client";

import {
  createContext,
  useContext,
  useEffect,
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
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Truck,
  UsersRound,
  X,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

function AppBrand({
  expanded = true,
  onNavigate,
}: {
  expanded?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/home"
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        !expanded && "justify-center",
      )}
      aria-label="Ir para visão geral"
      title={expanded ? undefined : "KnoGest"}
      onClick={onNavigate}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        KG
      </span>
      {expanded && (
        <span className="min-w-0">
          <span className="block text-sm font-bold">KnoGest</span>
          <span className="block text-xs font-medium text-muted-foreground">
            Operação de campo
          </span>
        </span>
      )}
    </Link>
  );
}

function NavigationLinks({
  className,
  collapsed = false,
  currentArea,
  onNavigate,
}: {
  className?: string;
  collapsed?: boolean;
  currentArea: AppArea;
  onNavigate?: () => void;
}) {
  return (
    <nav
      className={cn("space-y-1", className)}
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
              "flex min-h-11 items-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              collapsed ? "justify-center px-0" : "gap-2 px-3",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            onClick={onNavigate}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  className,
  collapsed = false,
  companies,
  companyMenuMode,
  selectedCompany,
}: {
  className?: string;
  collapsed?: boolean;
  companies: CompanyOption[];
  companyMenuMode: "above" | "flow";
  selectedCompany: CompanyOption;
}) {
  return (
    <div
      className={cn("space-y-2 border-t border-sidebar-border pt-4", className)}
    >
      <CompanySelector
        companies={companies}
        selectedCompany={selectedCompany}
        collapsed={collapsed}
        menuMode={companyMenuMode}
        className="w-full"
      />
      <SignOutButton
        compact={collapsed}
        className={cn(
          "min-h-11",
          collapsed ? "w-full" : "w-full justify-start px-3",
        )}
      />
    </div>
  );
}

export function AppShell({
  children,
  companies,
  navigationMode = "default",
  selectedCompany,
  currentArea = "dashboard",
}: {
  children: ReactNode;
  companies: CompanyOption[];
  navigationMode?: "default" | "project";
  selectedCompany: CompanyOption;
  currentArea?: AppArea;
}) {
  const meta = areaMeta[currentArea];
  const isProjectNavigation = navigationMode === "project";
  const [mainNavigationExpanded, setMainNavigationExpanded] =
    useState(!isProjectNavigation);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mainSidebarExpanded = !isProjectNavigation || mainNavigationExpanded;

  useEffect(() => {
    if (!window.matchMedia) return;

    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileNavigationOpen(false);
    };

    desktop.addEventListener("change", closeDrawerOnDesktop);
    return () => desktop.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  return (
    <AppShellNavigationContext.Provider
      value={{ mainNavigationExpanded, setMainNavigationExpanded }}
    >
      <div className="min-h-screen bg-background text-foreground">
        <Dialog
          open={mobileNavigationOpen}
          onOpenChange={setMobileNavigationOpen}
        >
          <DialogContent
            variant="drawer-left"
            showCloseButton={false}
            className="lg:hidden"
            data-testid="mobile-navigation-drawer"
          >
            <DialogTitle className="sr-only">Menu principal</DialogTitle>
            <DialogDescription className="sr-only">
              Navegação global, troca de empresa e encerramento da sessão.
            </DialogDescription>

            <div className="flex min-h-full flex-col overflow-y-auto px-4 py-5">
              <div className="flex items-center justify-between gap-3 px-2">
                <AppBrand onNavigate={() => setMobileNavigationOpen(false)} />
                <DialogClose
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Fechar menu principal"
                    />
                  }
                >
                  <X className="size-5" />
                </DialogClose>
              </div>

              <NavigationLinks
                currentArea={currentArea}
                className="mt-6"
                onNavigate={() => setMobileNavigationOpen(false)}
              />

              <SidebarFooter
                companies={companies}
                selectedCompany={selectedCompany}
                companyMenuMode="flow"
                className="mt-auto pt-6"
              />
            </div>
          </DialogContent>

          <aside
            data-testid="desktop-navigation-sidebar"
            className={cn(
              "fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border bg-sidebar py-5 transition-[width,padding] duration-200 ease-out motion-reduce:transition-none lg:flex lg:flex-col",
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
              <AppBrand expanded={mainSidebarExpanded} />
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

            <NavigationLinks
              collapsed={!mainSidebarExpanded}
              currentArea={currentArea}
              className={cn(
                mainSidebarExpanded || !isProjectNavigation ? "mt-6" : "mt-4",
              )}
            />

            <SidebarFooter
              collapsed={!mainSidebarExpanded}
              companies={companies}
              selectedCompany={selectedCompany}
              companyMenuMode="above"
              className="mt-auto"
            />
          </aside>

          <div
            className={cn(
              "pt-16 transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:pt-0",
              mainSidebarExpanded ? "lg:pl-64" : "lg:pl-14",
            )}
          >
            <header className="fixed inset-x-0 top-0 z-20 border-b border-border bg-background/95 backdrop-blur lg:sticky lg:inset-x-auto">
              <div className="flex h-16 items-center gap-3 px-3 sm:px-5 md:px-6 lg:px-8">
                <DialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      className="lg:hidden"
                      aria-label="Abrir menu principal"
                    />
                  }
                >
                  <Menu className="size-5" />
                </DialogTrigger>

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
              </div>
            </header>

            <main className="px-3 py-4 sm:px-5 md:px-6 lg:px-8">
              <div className="mx-auto w-full max-w-[1500px]">{children}</div>
            </main>
          </div>
        </Dialog>
      </div>
    </AppShellNavigationContext.Provider>
  );
}

function CompanySelector({
  className,
  collapsed = false,
  companies,
  menuMode,
  selectedCompany,
}: {
  className?: string;
  collapsed?: boolean;
  companies: CompanyOption[];
  menuMode: "above" | "flow";
  selectedCompany: CompanyOption;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  return (
    <details
      ref={detailsRef}
      className={cn("group relative", className)}
      data-testid="company-selector"
    >
      <summary
        aria-label={`Empresa atual: ${selectedCompany.name}. Trocar empresa`}
        title="Trocar empresa"
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-md border border-input bg-background px-2.5 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
          collapsed ? "justify-center px-0" : "px-3",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
          <Building2 aria-hidden="true" className="size-4" />
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {selectedCompany.name}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
              strokeWidth={2.5}
            />
          </>
        )}
      </summary>

      <div
        className={cn(
          "z-40 w-full min-w-0 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md",
          menuMode === "flow" && "mt-2",
          menuMode === "above" &&
            "absolute bottom-full left-0 mb-2 w-[min(22rem,calc(100vw-2rem))]",
        )}
      >
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

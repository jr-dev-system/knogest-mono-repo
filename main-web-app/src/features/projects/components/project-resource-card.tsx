import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ProjectResourceCardProps = Omit<
  ComponentPropsWithoutRef<"article">,
  "children" | "title"
> & {
  accentClassName: string;
  actions?: ReactNode;
  actionsLabel?: string;
  badge: ReactNode;
  badgeClassName: string;
  bodyClassName?: string;
  children: ReactNode;
  icon: LucideIcon;
  iconClassName: string;
  subtitle: ReactNode;
  subtitleClassName?: string;
  title: ReactNode;
  titleId: string;
};

export function ProjectResourceCard({
  accentClassName,
  actions,
  actionsLabel,
  badge,
  badgeClassName,
  bodyClassName,
  children,
  className,
  icon: Icon,
  iconClassName,
  subtitle,
  subtitleClassName,
  title,
  titleId,
  ...articleProps
}: ProjectResourceCardProps) {
  return (
    <article
      {...articleProps}
      aria-labelledby={titleId}
      className={cn(
        "overflow-hidden rounded-2xl border border-l-[6px] border-input bg-background",
        accentClassName,
        className,
      )}
    >
      <header className="border-b border-border bg-muted/30 px-4 py-3.5 text-foreground sm:px-5">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-md",
              iconClassName,
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id={titleId}
              className="break-words text-lg font-extrabold leading-tight sm:text-xl"
            >
              {title}
            </h3>
            <div
              className={cn(
                "mt-1 break-words text-sm font-semibold text-muted-foreground",
                subtitleClassName,
              )}
            >
              {subtitle}
            </div>
          </div>
          <span
            className={cn(
              "inline-flex min-h-7 shrink-0 items-center rounded-md px-2.5 text-xs font-extrabold",
              badgeClassName,
            )}
          >
            {badge}
          </span>
        </div>
      </header>
      <div className={cn("grid sm:items-stretch", bodyClassName)}>
        {children}
        {actions ? (
          <div
            role="group"
            aria-label={actionsLabel}
            className="flex items-center justify-end gap-2 border-t border-border bg-muted/80 p-3 sm:justify-center sm:border-l sm:border-t-0"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}

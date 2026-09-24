"use client";

import type { ReactElement, ReactNode } from "react";
import { LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type OperationsModalSize = "md" | "lg" | "xl";

const modalSizeClasses: Record<OperationsModalSize, string> = {
  md: "sm:max-w-xl",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
};

/**
 * Modal operacional do KnoGest.
 *
 * Use este componente para criação/edição de entidades administrativas.
 * Ele mantém cabeçalho forte, corpo rolável, foco via Base UI Dialog e
 * dimensões previsíveis para uso em desktop, tablet e celular em campo.
 */
export function OperationsModal({
  bodyClassName,
  children,
  className,
  description,
  footer,
  icon: Icon,
  onOpenChange,
  open,
  size = "lg",
  title,
  trigger,
}: {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  footer?: ReactNode;
  icon?: LucideIcon;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  size?: OperationsModalSize;
  title: string;
  trigger?: ReactElement;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        className={cn(
          "max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-lg border border-border bg-popover p-0 text-popover-foreground ring-1 ring-foreground/10",
          "flex flex-col gap-0",
          modalSizeClasses[size],
          className,
        )}
      >
        <DialogHeader className="relative z-30 shrink-0 border-b border-border bg-secondary/70 px-5 py-4">
          <div className="flex items-start gap-3 pr-8">
            {Icon && (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold leading-tight">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="mt-1 leading-5">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <footer className="relative z-30 flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-popover px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {footer}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

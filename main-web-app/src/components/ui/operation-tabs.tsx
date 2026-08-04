"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type OperationTabOption<TValue extends string> = {
  value: TValue;
  label: React.ReactNode;
};

export function OperationTabs<TValue extends string>({
  ariaLabel,
  className,
  idPrefix,
  onValueChange,
  value,
  tabs,
}: {
  ariaLabel?: string;
  className?: string;
  idPrefix?: string;
  onValueChange: (value: TValue) => void;
  value: TValue;
  tabs: OperationTabOption<TValue>[];
}) {
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectAt = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    onValueChange(tab.value);
    buttons.current[index]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel ?? "Seções"}
      className={cn(
        "flex max-w-full snap-x items-center gap-1 overflow-x-auto rounded-md border border-border bg-muted p-1",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.value}` : undefined}
            aria-controls={
              idPrefix ? `${idPrefix}-panel-${tab.value}` : undefined
            }
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            className={cn(
              "min-h-9 rounded-[min(var(--radius-md),8px)] px-3 text-sm font-semibold text-muted-foreground transition-colors outline-none",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
              selected && "bg-background text-foreground ring-1 ring-border",
            )}
            onClick={() => onValueChange(tab.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const direction = event.key === "ArrowRight" ? 1 : -1;
                selectAt((index + direction + tabs.length) % tabs.length);
              }
              if (event.key === "Home") {
                event.preventDefault();
                selectAt(0);
              }
              if (event.key === "End") {
                event.preventDefault();
                selectAt(tabs.length - 1);
              }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function OperationTabPanel({
  activeValue,
  children,
  className,
  idPrefix,
  value,
}: {
  activeValue: string;
  children: React.ReactNode;
  className?: string;
  idPrefix?: string;
  value: string;
}) {
  if (activeValue !== value) return null;
  return (
    <div
      role="tabpanel"
      id={idPrefix ? `${idPrefix}-panel-${value}` : undefined}
      aria-labelledby={idPrefix ? `${idPrefix}-tab-${value}` : undefined}
      tabIndex={0}
      className={cn("outline-none", className)}
    >
      {children}
    </div>
  );
}

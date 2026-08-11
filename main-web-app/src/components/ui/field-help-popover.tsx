"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";

export function FieldHelpPopover({
  description,
  example,
  formula,
  title,
}: {
  description: string;
  example: string;
  formula: string;
  title: string;
}) {
  const [open, setOpen] = React.useState(false);
  const focusTimerRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (focusTimerRef.current !== null)
        window.clearTimeout(focusTimerRef.current);
    },
    [],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        openOnHover
        delay={150}
        closeDelay={120}
        aria-label={`Ajuda sobre ${title}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-input bg-background text-sm font-black text-muted-foreground outline-none transition-colors duration-150 hover:border-ring hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 data-popup-open:border-ring data-popup-open:bg-muted data-popup-open:text-foreground"
        onFocus={() => {
          focusTimerRef.current = window.setTimeout(() => setOpen(true), 0);
        }}
        onBlur={() => {
          if (focusTimerRef.current !== null) {
            window.clearTimeout(focusTimerRef.current);
            focusTimerRef.current = null;
          }
          setOpen(false);
        }}
      >
        <span aria-hidden="true">?</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 outline-none"
        >
          <Popover.Popup
            initialFocus={false}
            className="origin-[var(--transform-origin)] w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none transition-[opacity,transform] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <Popover.Title className="text-sm font-bold leading-5">
              {title}
            </Popover.Title>
            <Popover.Description className="mt-1 text-sm leading-5 text-muted-foreground">
              {description}
            </Popover.Description>
            <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm font-bold leading-5">
              {formula}
            </p>
            <p className="mt-2 text-sm leading-5">
              <span className="font-bold">Exemplo:</span> {example}
            </p>
            <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              A conversão gera uma estimativa e não substitui a quantidade
              tecnicamente aceita ou medida.
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

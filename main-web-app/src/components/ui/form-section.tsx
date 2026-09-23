import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Agrupa campos relacionados dentro de formulários operacionais.
 * Use-o dentro de OperationsModal para preservar uma anatomia previsível.
 */
function FormSection({
  children,
  className,
  description,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string | null;
  title?: string | null;
}) {
  return (
    <fieldset
      className={cn(
        "grid gap-3 rounded-md border border-border bg-secondary/20 p-4",
        className,
      )}
    >
      {title && <legend className="px-1 text-sm font-bold">{title}</legend>}
      {description && (
        <p className="-mt-1 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </fieldset>
  );
}

export { FormSection };

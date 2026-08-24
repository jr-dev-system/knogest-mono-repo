"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import {
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormReturn,
  useForm,
} from "react-hook-form";
import { z } from "zod";

import {
  FormErrorDeclaration,
  type FormIssue,
} from "@/components/forms/form-error-declaration";
import { Button } from "@/components/ui/button";
import { FormWizardProgress } from "@/components/ui/form-wizard-progress";
import {
  OperationsModal,
  type OperationsModalSize,
} from "@/components/ui/operations-modal";
import { configureZodPortugueseErrors } from "@/lib/zod-locale";

export interface BaseFormModalRenderHelpers {
  closeModal: () => void;
  currentStep: number;
  goToStep: (step: number) => void;
}

export interface WizardStep<TData extends FieldValues> {
  title: string;
  fields: Path<TData>[];
  fieldLabels?: Partial<Record<Path<TData>, string>>;
  component: (
    form: UseFormReturn<TData>,
    helpers: BaseFormModalRenderHelpers,
  ) => React.ReactNode;
}

interface BaseFormModalProps<TData extends FieldValues> {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  icon?: LucideIcon;
  schema: z.ZodType<TData>;
  size?: OperationsModalSize;
  defaultValues?: DefaultValues<TData>;
  onSubmit: (data: TData) => Promise<void | boolean>;
  confirmClose?: (dirty: boolean) => boolean | Promise<boolean>;
  onSessionStart?: () => void;
  notice?: React.ReactNode;
  fieldLabels?: Partial<Record<Path<TData>, string>>;
  submitLabel?: string;
  children?: (
    form: UseFormReturn<TData>,
    helpers: BaseFormModalRenderHelpers,
  ) => React.ReactNode;
  steps?: WizardStep<TData>[];
}

export function BaseFormModal<TData extends FieldValues>({
  children,
  defaultValues,
  description,
  icon,
  confirmClose,
  onSessionStart,
  onSubmit,
  notice,
  fieldLabels,
  schema,
  size = "lg",
  steps,
  submitLabel = "Salvar",
  title,
  trigger,
}: BaseFormModalProps<TData>) {
  configureZodPortugueseErrors();

  const [open, setOpen] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [isAdvancing, setIsAdvancing] = React.useState(false);
  const [errorIssues, setErrorIssues] = React.useState<FormIssue[]>([]);
  const advancingRef = React.useRef(false);
  const errorSummaryRef = React.useRef<HTMLDivElement>(null);
  const stepHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const form = useForm<TData>({
    resolver: zodResolver(schema as any),
    defaultValues,
  });

  const isWizard = Boolean(steps?.length);
  const activeStep = isWizard ? steps?.[currentStep] : undefined;
  const isLastStep = isWizard ? currentStep === (steps?.length ?? 1) - 1 : true;
  const isSubmitting = form.formState.isSubmitting;
  const navigationDisabled = isSubmitting || isAdvancing;

  React.useEffect(() => {
    if (open && isWizard) {
      stepHeadingRef.current?.focus();
    }
  }, [currentStep, isWizard, open]);

  React.useEffect(() => {
    if (errorIssues.length > 0) errorSummaryRef.current?.focus();
  }, [errorIssues]);

  const goToStep = (step: number) => {
    if (!steps || navigationDisabled || step < 0 || step >= steps.length)
      return;
    setCurrentStep(step);
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    if (isSubmitting && !nextOpen) return;

    if (!nextOpen && form.formState.isDirty && confirmClose) {
      const confirmed = await confirmClose(true);
      if (!confirmed) return;
    }

    if (nextOpen) {
      onSessionStart?.();
      form.reset(defaultValues);
      setCurrentStep(0);
      advancingRef.current = false;
      setIsAdvancing(false);
      setErrorIssues([]);
    }

    setOpen(nextOpen);
  };

  const helpers: BaseFormModalRenderHelpers = {
    closeModal: () => {
      if (!isSubmitting) setOpen(false);
    },
    currentStep,
    goToStep,
  };

  const handleSubmitWrapper = async (data: TData) => {
    try {
      setErrorIssues([]);
      const shouldClose = await onSubmit(data);
      if (shouldClose === false) return;
      setOpen(false);
      form.reset(defaultValues);
      setCurrentStep(0);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar.";
      setErrorIssues([
        {
          location: "API",
          message,
        },
      ]);
    }
  };

  const allFieldLabels = React.useMemo(() => {
    const labels: Record<string, string> = {};
    if (fieldLabels) {
      for (const [field, label] of Object.entries(fieldLabels)) {
        if (typeof label === "string") labels[field] = label;
      }
    }
    for (const step of steps ?? []) {
      for (const [field, label] of Object.entries(step.fieldLabels ?? {})) {
        if (typeof label === "string") labels[field] = label;
      }
    }
    return labels;
  }, [fieldLabels, steps]);

  const buildIssues = React.useCallback(
    (errors: FieldErrors<TData>, fields?: Path<TData>[]) =>
      collectFormIssues(errors, {
        fieldLabels: allFieldLabels,
        fields: fields?.map(String),
        steps: steps?.map((step) => ({
          title: step.title,
          fields: step.fields.map(String),
        })),
      }),
    [allFieldLabels, steps],
  );

  const showIssues = React.useCallback((issues: FormIssue[]) => {
    setErrorIssues(issues);
  }, []);

  const handleInvalidSubmit = React.useCallback(
    (errors: FieldErrors<TData>) => {
      showIssues(buildIssues(errors));
    },
    [buildIssues, showIssues],
  );

  const handleNextStep = async () => {
    if (!steps || navigationDisabled || advancingRef.current) return;

    advancingRef.current = true;
    setIsAdvancing(true);

    try {
      const isStepValid = await form.trigger(steps[currentStep].fields, {
        shouldFocus: true,
      });

      if (isStepValid) {
        setErrorIssues([]);
        setCurrentStep((previous) => Math.min(previous + 1, steps.length - 1));
      } else {
        showIssues(
          buildIssues(form.formState.errors, steps[currentStep].fields),
        );
      }
    } finally {
      advancingRef.current = false;
      setIsAdvancing(false);
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (isWizard) {
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const isExplicitFinalAction =
        submitter instanceof HTMLElement &&
        submitter.dataset.wizardSubmit === "true";

      if (!isLastStep) {
        event.preventDefault();
        void handleNextStep();
        return;
      }

      if (!isExplicitFinalAction) {
        event.preventDefault();
        return;
      }
    }

    void form.handleSubmit(handleSubmitWrapper, handleInvalidSubmit)(event);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key === "Enter" &&
      !event.nativeEvent.isComposing &&
      isWizard &&
      !isLastStep &&
      (event.target as HTMLElement).tagName === "INPUT"
    ) {
      event.preventDefault();
      void handleNextStep();
    }
  };

  return (
    <OperationsModal
      bodyClassName="overflow-hidden p-0"
      description={description}
      icon={icon}
      onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}
      open={open}
      size={size}
      title={title}
      trigger={trigger}
    >
      <form
        className="flex max-h-[calc(100vh-9rem)] min-h-0 flex-col"
        onKeyDown={handleKeyDown}
        onSubmit={handleFormSubmit}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isWizard && steps && activeStep ? (
            <>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
                Etapa {currentStep + 1} de {steps.length}: {activeStep.title}
              </h2>
              <FormWizardProgress steps={steps} currentStep={currentStep} />
              <div className="mt-5 min-h-52 space-y-4">
                <div
                  ref={errorSummaryRef}
                  tabIndex={-1}
                  className="outline-none"
                >
                  <FormErrorDeclaration
                    issues={errorIssues}
                    title="Há erros nesta etapa do formulário."
                    description="Confira onde está o erro, ajuste os dados e tente novamente."
                  />
                </div>
                {activeStep.component(form, helpers)}
                {notice}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div ref={errorSummaryRef} tabIndex={-1} className="outline-none">
                <FormErrorDeclaration
                  issues={errorIssues}
                  title="Há erros no formulário."
                  description="Confira onde está o erro, ajuste os dados e tente salvar novamente."
                />
              </div>
              {children?.(form, helpers)}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-popover px-5 py-4">
          {isWizard ? (
            <>
              {currentStep === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11"
                  onClick={() => void handleOpenChange(false)}
                  disabled={navigationDisabled}
                >
                  Cancelar
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11"
                  onClick={() => goToStep(currentStep - 1)}
                  disabled={navigationDisabled}
                >
                  <ChevronLeft className="size-4" />
                  Voltar
                </Button>
              )}

              {!isLastStep ? (
                <Button
                  type="button"
                  size="lg"
                  className="min-h-11"
                  onClick={() => void handleNextStep()}
                  disabled={navigationDisabled}
                >
                  Avançar
                  <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  data-wizard-submit="true"
                  size="lg"
                  className="min-h-11"
                  disabled={navigationDisabled}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {submitLabel}
                </Button>
              )}
            </>
          ) : (
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                )}
                {submitLabel}
              </Button>
            </div>
          )}
        </footer>
      </form>
    </OperationsModal>
  );
}

function collectFormIssues<TData extends FieldValues>(
  errors: FieldErrors<TData>,
  options: {
    fieldLabels: Record<string, string>;
    fields?: string[];
    steps?: Array<{ title: string; fields: string[] }>;
  },
) {
  const fieldFilter = options.fields ? new Set(options.fields) : null;
  const issues: FormIssue[] = [];

  const visit = (value: unknown, path: string[]) => {
    if (!value || typeof value !== "object") return;

    const maybeError = value as { message?: unknown; root?: unknown };
    const fieldPath = path.join(".");
    const isIncluded =
      !fieldFilter ||
      [...fieldFilter].some(
        (field) => fieldPath === field || fieldPath.startsWith(`${field}.`),
      );

    if (typeof maybeError.message === "string" && isIncluded) {
      issues.push({
        field: findFieldLabel(fieldPath, options.fieldLabels),
        location: findStepTitle(fieldPath, options.steps),
        message: normalizeValidationMessage(maybeError.message),
      });
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key === "ref" ||
        key === "types" ||
        key === "message" ||
        key === "type"
      )
        continue;
      if (key === "root") {
        visit(child, path);
        continue;
      }
      visit(child, [...path, key]);
    }
  };

  visit(errors, []);

  return issues.length > 0
    ? issues
    : [
        {
          location: "Formulário",
          message: "Revise os campos destacados antes de continuar.",
        },
      ];
}

function findStepTitle(
  fieldPath: string,
  steps?: Array<{ title: string; fields: string[] }>,
) {
  return steps?.find((step) =>
    step.fields.some(
      (field) => fieldPath === field || fieldPath.startsWith(`${field}.`),
    ),
  )?.title;
}

function findFieldLabel(fieldPath: string, labels: Record<string, string>) {
  if (labels[fieldPath]) return labels[fieldPath];

  const matchingParent = Object.keys(labels)
    .filter((field) => fieldPath.startsWith(`${field}.`))
    .sort((left, right) => right.length - left.length)[0];
  if (matchingParent) return labels[matchingParent];

  const matchingChild = Object.keys(labels)
    .filter((field) => field.endsWith(`.${fieldPath}`))
    .sort((left, right) => right.length - left.length)[0];
  if (matchingChild) return labels[matchingChild];

  return humanizeFieldPath(fieldPath);
}

function normalizeValidationMessage(message: string) {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.includes("muito pequeno") ||
    lower.includes("too small") ||
    lower.includes("expected string") ||
    lower.includes("invalid string") ||
    lower.includes("expected that string")
  ) {
    return "Preencha este campo.";
  }

  if (
    lower.includes("uuid") ||
    lower.includes("invalid input") ||
    lower.includes("entrada inválida")
  ) {
    return "Selecione uma opção válida.";
  }

  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function humanizeFieldPath(fieldPath: string) {
  if (!fieldPath) return "Campo";
  return fieldPath
    .split(".")
    .filter((segment) => Number.isNaN(Number(segment)))
    .map((segment) =>
      segment
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll("_", " ")
        .toLowerCase(),
    )
    .join(" / ");
}

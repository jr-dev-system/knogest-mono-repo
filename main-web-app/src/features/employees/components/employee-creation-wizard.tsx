"use client";

import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Plus, UserRound } from "lucide-react";

import {
  BaseFormModal,
  type BaseFormModalRenderHelpers,
  type WizardStep,
} from "@/components/modals/BaseFormModal";
import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { createJobRoleForEmployee } from "@/features/job-roles/job-roles.actions";
import { formatCpf } from "../cpf-mask";
import type { EmployeeActionState } from "../employees-action-state";

type JobRole = { id: string; name: string; isActive: boolean };
type RoleFailure = { message: string; requestId?: string };
type EmployeeAction = (
  state: EmployeeActionState,
  formData: FormData,
) => Promise<EmployeeActionState>;

const employeeSchema = z.object({
  admissionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de admissão."),
  companyRegistrationNumber: z
    .string()
    .trim()
    .min(1, "Informe a matrícula.")
    .max(80, "A matrícula deve ter no máximo 80 caracteres."),
  document: z
    .string()
    .refine(
      (value) => value.replace(/\D/g, "").length === 11,
      "Informe um CPF com 11 dígitos.",
    ),
  fullName: z
    .string()
    .trim()
    .min(3, "Informe o nome completo.")
    .max(180, "O nome deve ter no máximo 180 caracteres."),
  jobRoleId: z.string().uuid("Selecione uma função válida."),
});

type EmployeeValues = z.infer<typeof employeeSchema>;

const defaultValues: EmployeeValues = {
  admissionDate: "",
  companyRegistrationNumber: "",
  document: "",
  fullName: "",
  jobRoleId: "",
};

const fieldLabels = {
  admissionDate: "Data de admissão",
  companyRegistrationNumber: "Matrícula",
  document: "CPF",
  fullName: "Nome completo",
  jobRoleId: "Função",
};

const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  form,
  label,
  maxLength,
  name,
  type = "text",
  inputMode,
  onChange,
}: {
  form: UseFormReturn<EmployeeValues>;
  label: string;
  maxLength?: number;
  name: "companyRegistrationNumber" | "fullName" | "document" | "admissionDate";
  type?: React.HTMLInputTypeAttribute;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const id = `employee-${name}`;
  const registered = form.register(name);
  const error = form.formState.errors[name];

  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>
      <span>{label}</span>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        className="h-11"
        aria-invalid={Boolean(error)}
        {...registered}
        onChange={(event) => {
          onChange?.(event);
          registered.onChange(event);
        }}
      />
    </label>
  );
}

function ReviewRow({
  label,
  onEdit,
  value,
}: {
  label: string;
  onEdit: () => void;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-foreground">
          {value || "Não informado"}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        Editar
      </Button>
    </div>
  );
}

function RoleStep({
  form,
  onCreateRole,
  roleFailure,
  roles,
}: {
  form: UseFormReturn<EmployeeValues>;
  onCreateRole: (name: string) => Promise<JobRole | null>;
  roleFailure: RoleFailure | null;
  roles: JobRole[];
}) {
  const [isCreating, setIsCreating] = React.useState(false);
  const [isRoleFormOpen, setIsRoleFormOpen] = React.useState(false);
  const [newRoleName, setNewRoleName] = React.useState("");
  const error = form.formState.errors.jobRoleId;
  const activeRoles = roles.filter((role) => role.isActive);
  const selectedRoleId = form.watch("jobRoleId");

  return (
    <div className="space-y-4">
      {roleFailure && (
        <FormErrorDeclaration
          title="Não foi possível criar a função."
          description="Revise o nome e tente novamente."
          issues={[
            { location: "Função", message: roleFailure.message },
            ...(roleFailure.requestId
              ? [
                  {
                    location: "Código de atendimento",
                    message: roleFailure.requestId,
                  },
                ]
              : []),
          ]}
        />
      )}
      <FormSection
        title="Defina a função"
        description="Ela será registrada no vínculo e usada na montagem das equipes."
      >
        <label
          className="grid gap-1.5 text-sm font-semibold"
          htmlFor="employee-job-role"
        >
          <span>Função</span>
          <select
            id="employee-job-role"
            className={controlClass}
            aria-invalid={Boolean(error)}
            value={selectedRoleId}
            {...form.register("jobRoleId")}
          >
            <option value="">Selecione a função</option>
            {activeRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>

        {isRoleFormOpen ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              placeholder="Ex.: Operador de escavadeira"
              maxLength={120}
              className="min-h-11"
              aria-label="Nome da nova função"
            />
            <Button
              type="button"
              disabled={!newRoleName.trim() || isCreating}
              onClick={async () => {
                setIsCreating(true);
                try {
                  const role = await onCreateRole(newRoleName);
                  if (!role) return;
                  setNewRoleName("");
                  setIsRoleFormOpen(false);
                } finally {
                  setIsCreating(false);
                }
              }}
            >
              {isCreating ? "Criando…" : "Criar e selecionar"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={() => setIsRoleFormOpen(true)}
          >
            <Plus className="size-4" />
            Criar nova função
          </Button>
        )}
      </FormSection>
    </div>
  );
}

function RegistrationStep({ form }: { form: UseFormReturn<EmployeeValues> }) {
  return (
    <FormSection
      title="Dados cadastrais"
      description="Confirme a identificação civil do funcionário."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          form={form}
          label="CPF"
          name="document"
          inputMode="numeric"
          maxLength={14}
          onChange={(event) => {
            event.currentTarget.value = formatCpf(event.currentTarget.value);
          }}
        />
        <Field
          form={form}
          label="Nome completo"
          name="fullName"
          maxLength={180}
        />
      </div>
    </FormSection>
  );
}

function EmploymentStep({ form }: { form: UseFormReturn<EmployeeValues> }) {
  return (
    <FormSection
      title="Vínculo com a empresa"
      description="Esses dados iniciam o histórico do vínculo atual."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          form={form}
          label="Matrícula"
          name="companyRegistrationNumber"
          maxLength={80}
        />
        <Field form={form} label="Admissão" name="admissionDate" type="date" />
      </div>
    </FormSection>
  );
}

function ReviewStep({
  form,
  helpers,
  roles,
}: {
  form: UseFormReturn<EmployeeValues>;
  helpers: BaseFormModalRenderHelpers;
  roles: JobRole[];
}) {
  const values = form.watch();
  const role = roles.find((item) => item.id === values.jobRoleId);
  const admissionDate = values.admissionDate
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${values.admissionDate}T00:00:00.000Z`),
      )
    : "";

  return (
    <section aria-label="Revisão do cadastro" className="space-y-1">
      <p className="text-sm leading-6 text-muted-foreground">
        Revise antes de cadastrar. Você poderá alterar cada grupo sem perder o
        preenchimento.
      </p>
      <ReviewRow
        label="Função"
        value={role?.name ?? "Não selecionada"}
        onEdit={() => helpers.goToStep(0)}
      />
      <ReviewRow
        label="CPF"
        value={values.document}
        onEdit={() => helpers.goToStep(1)}
      />
      <ReviewRow
        label="Nome completo"
        value={values.fullName}
        onEdit={() => helpers.goToStep(1)}
      />
      <ReviewRow
        label="Matrícula"
        value={values.companyRegistrationNumber}
        onEdit={() => helpers.goToStep(2)}
      />
      <ReviewRow
        label="Admissão"
        value={admissionDate}
        onEdit={() => helpers.goToStep(2)}
      />
    </section>
  );
}

export function EmployeeCreationWizard({
  action,
  initialRoles,
  onCreated,
}: {
  action: EmployeeAction;
  initialRoles: JobRole[];
  onCreated: () => void;
}) {
  const [roles, setRoles] = React.useState(initialRoles);
  const [roleFailure, setRoleFailure] = React.useState<RoleFailure | null>(
    null,
  );

  const createRole = async (name: string) => {
    setRoleFailure(null);
    const data = new FormData();
    data.set("name", name.trim());
    try {
      const result = await createJobRoleForEmployee(data);
      if (!result.ok) {
        setRoleFailure({
          message: result.message,
          requestId: result.requestId,
        });
        return null;
      }

      const role = result.data;
      setRoles((current) => [...current, role]);
      return role;
    } catch {
      setRoleFailure({
        message:
          "Não foi possível criar a função agora. Tente novamente em instantes.",
      });
      return null;
    }
  };

  const steps = React.useMemo<WizardStep<EmployeeValues>[]>(
    () => [
      {
        title: "Função",
        fields: ["jobRoleId"],
        fieldLabels,
        component: (form) => (
          <RoleStep
            form={form}
            roles={roles}
            roleFailure={roleFailure}
            onCreateRole={async (name) => {
              const role = await createRole(name);
              if (!role) return null;
              form.setValue("jobRoleId", role.id, {
                shouldDirty: true,
                shouldValidate: true,
              });
              form.clearErrors("jobRoleId");
              return role;
            }}
          />
        ),
      },
      {
        title: "Dados cadastrais",
        fields: ["document", "fullName"],
        fieldLabels,
        component: (form) => <RegistrationStep form={form} />,
      },
      {
        title: "Vínculo",
        fields: ["companyRegistrationNumber", "admissionDate"],
        fieldLabels,
        component: (form) => <EmploymentStep form={form} />,
      },
      {
        title: "Revisão",
        fields: [],
        component: (form, helpers) => (
          <ReviewStep form={form} helpers={helpers} roles={roles} />
        ),
      },
    ],
    [roleFailure, roles],
  );

  return (
    <BaseFormModal<EmployeeValues>
      title="Cadastrar funcionário"
      description="Conclua quatro etapas curtas para iniciar um vínculo com segurança."
      icon={UserRound}
      size="lg"
      schema={employeeSchema}
      defaultValues={defaultValues}
      fieldLabels={fieldLabels}
      steps={steps}
      submitLabel="Cadastrar funcionário"
      onSessionStart={() => setRoleFailure(null)}
      onSubmit={async (values) => {
        const formData = new FormData();
        formData.set("jobRoleId", values.jobRoleId);
        formData.set("document", values.document.replace(/\D/g, ""));
        formData.set("fullName", values.fullName.trim());
        formData.set(
          "companyRegistrationNumber",
          values.companyRegistrationNumber.trim(),
        );
        formData.set("admissionDate", values.admissionDate);

        const result = await action({ ok: false, message: "" }, formData);
        if (!result.ok) throw new Error(result.message);
        onCreated();
      }}
      trigger={
        <Button type="button">
          <Plus className="size-4" />
          Novo funcionário
        </Button>
      }
    />
  );
}

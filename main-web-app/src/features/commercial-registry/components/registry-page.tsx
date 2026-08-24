"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  Building2,
  CalendarArrowDown,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileSearch,
  ListPlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";
import { useActionNotification } from "@/hooks/useActionNotification";
import {
  formatBrazilianPhone,
  formatCep,
  formatCnpj,
  formatCpf,
} from "@/lib/brazilian-input-mask";
import type { RegistryActionState } from "../commercial-registry-action-state";
import type {
  RegistryListItem,
  RegistryListQuery,
} from "../commercial-registry.server";

type RegistryCopy = {
  basePath: string;
  createLabel: string;
  detailBasePath: string;
  emptyDescription: string;
  emptyTitle: string;
  newTitle: string;
  removeLabel: string;
  searchPlaceholder: string;
};

type RegistryAction = (
  state: RegistryActionState,
  formData: FormData,
) => Promise<RegistryActionState>;

type RemoveAction = RegistryAction;

type RegistryCepLookupResult =
  | {
      kind: "success";
      address: {
        street: string;
        neighborhood: string;
        city: string;
        state: string;
      };
    }
  | { kind: "failure"; message: string };

type RegistryCepLookupAction = (
  postalCode: string,
) => Promise<RegistryCepLookupResult>;

function SubmitButton({ formId, label }: { formId?: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button form={formId} type="submit" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Salvando" : label}
    </Button>
  );
}

function RemoveSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      size="sm"
      variant="outline"
      className="border-red-200 text-red-900 hover:bg-red-50"
    >
      <Trash2 className="size-4" />
      {pending ? "Removendo" : label}
    </Button>
  );
}

function Field({
  label,
  name,
  required = false,
  type = "text",
  value,
  onChange,
  className,
  ...inputProps
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  className?: string;
} & Omit<
  React.ComponentProps<typeof Input>,
  "className" | "name" | "onChange" | "required" | "type" | "value"
>) {
  const id = `registry-${name}`;
  return (
    <div
      className={`grid min-w-0 gap-1.5 text-sm font-semibold ${className ?? ""}`}
    >
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        name={name}
        required={required}
        type={type}
        value={value}
        onChange={onChange}
        className="min-h-11"
        {...inputProps}
      />
    </div>
  );
}

type IndividualDraft = { document: string; fullName: string };
type LegalEntityDraft = {
  document: string;
  legalName: string;
  tradeName: string;
};
type SharedDraft = {
  phone: string;
  email: string;
  addressLine: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  city: string;
  state: string;
  postalCode: string;
};

type AddressAutofillState = {
  status: "locked" | "manual" | "partial";
  filled: Set<string>;
};

const emptyIndividualDraft: IndividualDraft = { document: "", fullName: "" };
const emptyLegalEntityDraft: LegalEntityDraft = {
  document: "",
  legalName: "",
  tradeName: "",
};
const emptySharedDraft: SharedDraft = {
  phone: "",
  email: "",
  addressLine: "",
  addressStreet: "",
  addressNumber: "",
  addressComplement: "",
  addressNeighborhood: "",
  city: "",
  state: "",
  postalCode: "",
};

export function RegistryPage({
  action,
  copy,
  initialState,
  lookupAddressByCep,
  pageInfo,
  persistentParams = {},
  query,
  removeAction,
  rows,
}: {
  action: RegistryAction;
  copy: RegistryCopy;
  initialState: RegistryActionState;
  lookupAddressByCep?: RegistryCepLookupAction;
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  persistentParams?: Record<string, string>;
  query: RegistryListQuery;
  removeAction: RemoveAction;
  rows: RegistryListItem[];
}) {
  const router = useRouter();
  const [entityType, setEntityType] = React.useState<
    "individual" | "legal_entity"
  >("individual");
  const [individualDraft, setIndividualDraft] =
    React.useState<IndividualDraft>(emptyIndividualDraft);
  const [legalEntityDraft, setLegalEntityDraft] =
    React.useState<LegalEntityDraft>(emptyLegalEntityDraft);
  const [sharedDraft, setSharedDraft] =
    React.useState<SharedDraft>(emptySharedDraft);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isNextStepOpen, setIsNextStepOpen] = React.useState(false);
  const [createdSupplierId, setCreatedSupplierId] = React.useState("");
  const [isCepLoading, setIsCepLoading] = React.useState(false);
  const [addressAutofill, setAddressAutofill] =
    React.useState<AddressAutofillState>({
      status: "locked",
      filled: new Set(),
    });
  const lastLookupRef = React.useRef("");
  const [removeState, removeFormAction] = useActionState(
    removeAction,
    initialState,
  );
  const hasFilters = Boolean(query.search || query.entityType);
  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(persistentParams)) {
    nextParams.set(key, value);
  }
  if (query.search) nextParams.set("search", query.search);
  if (query.entityType) nextParams.set("entityType", query.entityType);
  if (query.sortBy) nextParams.set("sortBy", query.sortBy);
  if (query.sortDirection) nextParams.set("sortDirection", query.sortDirection);
  if (pageInfo.nextCursor) nextParams.set("cursor", pageInfo.nextCursor);
  const detailQuery = new URLSearchParams(persistentParams).toString();
  const detailSuffix = detailQuery ? `?${detailQuery}` : "";

  const setIndividual = (key: keyof IndividualDraft, value: string) =>
    setIndividualDraft((draft) => ({ ...draft, [key]: value }));
  const setLegalEntity = (key: keyof LegalEntityDraft, value: string) =>
    setLegalEntityDraft((draft) => ({ ...draft, [key]: value }));
  const setShared = (key: keyof SharedDraft, value: string) =>
    setSharedDraft((draft) => ({ ...draft, [key]: value }));
  const addressIsLocked = addressAutofill.status === "locked" || isCepLoading;
  const fieldIsDisabled = (name: keyof SharedDraft) =>
    addressIsLocked || addressAutofill.filled.has(name);
  const resetCreateForm = React.useCallback(() => {
    setEntityType("individual");
    setIndividualDraft(emptyIndividualDraft);
    setLegalEntityDraft(emptyLegalEntityDraft);
    setSharedDraft(emptySharedDraft);
    setAddressAutofill({ status: "locked", filled: new Set() });
    lastLookupRef.current = "";
  }, []);
  const handleCreateModalChange = React.useCallback(
    (open: boolean) => {
      setIsCreateModalOpen(open);
      if (!open) resetCreateForm();
    },
    [resetCreateForm],
  );
  const lookupCep = async (digits: string) => {
    if (lastLookupRef.current === digits || isCepLoading) return;
    lastLookupRef.current = digits;
    setIsCepLoading(true);
    setAddressAutofill({ status: "locked", filled: new Set() });
    try {
      const result = lookupAddressByCep
        ? await lookupAddressByCep(digits)
        : {
            kind: "failure" as const,
            message: "Consulta de CEP indisponível.",
          };
      if (result.kind === "failure") {
        setAddressAutofill({ status: "manual", filled: new Set() });
        return;
      }
      const filled = new Set<string>();
      const fill = (name: keyof SharedDraft, value: string | undefined) => {
        if (!value) return;
        setShared(name, value);
        filled.add(name);
      };
      fill("addressStreet", result.address.street);
      fill("addressNeighborhood", result.address.neighborhood);
      fill("city", result.address.city);
      fill("state", result.address.state);
      setAddressAutofill({ status: "partial", filled });
    } catch {
      setAddressAutofill({ status: "manual", filled: new Set() });
    } finally {
      setIsCepLoading(false);
    }
  };
  const updateCep = (value: string) => {
    const formatted = formatCep(value);
    const digits = formatted.replace(/\D/g, "");
    if (digits !== sharedDraft.postalCode.replace(/\D/g, "")) {
      setSharedDraft((draft) => ({
        ...draft,
        postalCode: formatted,
        addressLine: "",
        addressStreet: "",
        addressNumber: "",
        addressComplement: "",
        addressNeighborhood: "",
        city: "",
        state: "",
      }));
      setAddressAutofill({ status: "locked", filled: new Set() });
    } else {
      setShared("postalCode", formatted);
    }
    if (digits.length !== 8) lastLookupRef.current = "";
    if (digits.length === 8) void lookupCep(digits);
  };

  const [state, formAction] = useActionState(
    async (previousState: RegistryActionState, formData: FormData) => {
      const result = await action(previousState, formData);
      if (result.ok) {
        resetCreateForm();
        setIsCreateModalOpen(false);
        if (result.createdId) {
          setCreatedSupplierId(result.createdId);
          setIsNextStepOpen(true);
        }
      }
      return result;
    },
    initialState,
  );

  useActionNotification(state, { notifyOnError: false });
  useActionNotification(removeState);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3" aria-label="Resumo">
        <Summary label="Registros ativos" value={String(rows.length)} />
        <Summary
          label="Pessoa física"
          value={String(
            rows.filter((row) => row.entityType === "individual").length,
          )}
        />
        <Summary
          label="Pessoa jurídica"
          value={String(
            rows.filter((row) => row.entityType === "legal_entity").length,
          )}
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/60 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              action={copy.basePath}
              className="grid gap-2 md:grid-cols-[minmax(220px,360px)_150px_150px_auto]"
            >
              {Object.entries(persistentParams).map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
              <label className="relative block">
                <span className="sr-only">{copy.searchPlaceholder}</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={query.search}
                  placeholder={copy.searchPlaceholder}
                  className="h-10 bg-background pl-9"
                />
              </label>
              <select
                name="entityType"
                defaultValue={query.entityType ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold"
              >
                <option value="">Todos</option>
                <option value="individual">Pessoa física</option>
                <option value="legal_entity">Pessoa jurídica</option>
              </select>
              <select
                name="sortBy"
                defaultValue={query.sortBy ?? "createdAt"}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold"
              >
                <option value="createdAt">Mais recentes</option>
                <option value="name">Nome</option>
              </select>
              <Button type="submit" variant="outline">
                <FileSearch className="size-4" />
                Filtrar
              </Button>
            </form>

            <OperationsModal
              icon={Building2}
              open={isCreateModalOpen}
              onOpenChange={handleCreateModalChange}
              size="lg"
              title={copy.newTitle}
              description="O documento completo aparece somente no detalhe autorizado."
              footer={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCreateModalChange(false)}
                  >
                    Cancelar
                  </Button>
                  <SubmitButton
                    formId="commercial-registry-create-form"
                    label={copy.createLabel}
                  />
                </>
              }
              trigger={
                <Button>
                  <Plus className="size-4" />
                  {copy.createLabel}
                </Button>
              }
            >
              <form
                id="commercial-registry-create-form"
                action={formAction}
                className="grid gap-4"
              >
                <input name="entityType" type="hidden" value={entityType} />
                {!state.ok && state.message && (
                  <FormErrorDeclaration
                    title={`Não foi possível ${copy.createLabel.toLowerCase()}.`}
                    description="Corrija os pontos indicados e tente novamente."
                    issues={[
                      {
                        location: "API",
                        message: state.message,
                      },
                    ]}
                  />
                )}
                <FormSection
                  title="Tipo de pessoa"
                  description="Escolha como este cadastro será identificado. Seus dados ficam preservados ao alternar."
                >
                  <div
                    className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1"
                    role="group"
                    aria-label="Tipo de pessoa"
                  >
                    <Button
                      type="button"
                      variant={
                        entityType === "individual" ? "default" : "outline"
                      }
                      className="min-h-11 font-bold"
                      aria-pressed={entityType === "individual"}
                      onClick={() => setEntityType("individual")}
                    >
                      Pessoa física
                    </Button>
                    <Button
                      type="button"
                      variant={
                        entityType === "legal_entity" ? "default" : "outline"
                      }
                      className="min-h-11 font-bold"
                      aria-pressed={entityType === "legal_entity"}
                      onClick={() => setEntityType("legal_entity")}
                    >
                      Pessoa jurídica
                    </Button>
                  </div>
                </FormSection>

                <FormSection title="Identificação">
                  <div className="grid gap-3 md:grid-cols-2">
                    {entityType === "individual" ? (
                      <>
                        <Field
                          label="CPF"
                          name="document"
                          required
                          value={individualDraft.document}
                          onChange={(event) =>
                            setIndividual(
                              "document",
                              formatCpf(event.target.value),
                            )
                          }
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="000.000.000-00"
                          maxLength={14}
                          aria-describedby="registry-document-help"
                        />
                        <Field
                          label="Nome completo"
                          name="fullName"
                          required
                          value={individualDraft.fullName}
                          onChange={(event) =>
                            setIndividual("fullName", event.target.value)
                          }
                          autoComplete="name"
                        />
                      </>
                    ) : (
                      <>
                        <Field
                          label="CNPJ"
                          name="document"
                          required
                          value={legalEntityDraft.document}
                          onChange={(event) =>
                            setLegalEntity(
                              "document",
                              formatCnpj(event.target.value),
                            )
                          }
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="00.000.000/0000-00"
                          maxLength={18}
                          aria-describedby="registry-document-help"
                        />
                        <Field
                          label="Razão social"
                          name="legalName"
                          required
                          value={legalEntityDraft.legalName}
                          onChange={(event) =>
                            setLegalEntity("legalName", event.target.value)
                          }
                          autoComplete="organization"
                        />
                        <Field
                          label="Nome fantasia"
                          name="tradeName"
                          value={legalEntityDraft.tradeName}
                          onChange={(event) =>
                            setLegalEntity("tradeName", event.target.value)
                          }
                          className="md:col-span-2"
                        />
                      </>
                    )}
                  </div>
                </FormSection>

                <FormSection title="Contato">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field
                      label="Telefone"
                      name="phone"
                      value={sharedDraft.phone}
                      onChange={(event) =>
                        setShared(
                          "phone",
                          formatBrazilianPhone(event.target.value),
                        )
                      }
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                    />
                    <Field
                      label="E-mail"
                      name="email"
                      type="email"
                      value={sharedDraft.email}
                      onChange={(event) =>
                        setShared("email", event.target.value)
                      }
                      autoComplete="email"
                    />
                  </div>
                </FormSection>

                <FormSection title="Endereço">
                  <input
                    type="hidden"
                    name="addressLine"
                    value={
                      sharedDraft.addressLine ||
                      [sharedDraft.addressStreet, sharedDraft.addressNumber]
                        .filter(Boolean)
                        .join(", ")
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-8">
                    <Field
                      label="CEP"
                      name="postalCode"
                      value={sharedDraft.postalCode}
                      onChange={(event) => updateCep(event.target.value)}
                      onBlur={(event) => updateCep(event.target.value)}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      className="sm:col-span-2 lg:col-span-2"
                    />
                    <Field
                      label="Logradouro"
                      name="addressStreet"
                      value={sharedDraft.addressStreet}
                      onChange={(event) =>
                        setShared("addressStreet", event.target.value)
                      }
                      disabled={fieldIsDisabled("addressStreet")}
                      autoComplete="street-address"
                      className="sm:col-span-2 lg:col-span-6"
                    />
                    {isCepLoading && (
                      <p className="-mt-1 text-sm font-medium text-muted-foreground sm:col-span-2 lg:col-span-8">
                        Buscando endereço...
                      </p>
                    )}
                    <Field
                      label="Número"
                      name="addressNumber"
                      value={sharedDraft.addressNumber}
                      onChange={(event) =>
                        setShared("addressNumber", event.target.value)
                      }
                      disabled={addressIsLocked}
                      className="lg:col-span-2"
                    />
                    <Field
                      label="Complemento"
                      name="addressComplement"
                      value={sharedDraft.addressComplement}
                      onChange={(event) =>
                        setShared("addressComplement", event.target.value)
                      }
                      disabled={addressIsLocked}
                      className="lg:col-span-3"
                    />
                    <Field
                      label="Bairro"
                      name="addressNeighborhood"
                      value={sharedDraft.addressNeighborhood}
                      onChange={(event) =>
                        setShared("addressNeighborhood", event.target.value)
                      }
                      disabled={fieldIsDisabled("addressNeighborhood")}
                      className="sm:col-span-2 lg:col-span-3"
                    />
                    <Field
                      label="Cidade"
                      name="city"
                      value={sharedDraft.city}
                      onChange={(event) =>
                        setShared("city", event.target.value)
                      }
                      disabled={fieldIsDisabled("city")}
                      autoComplete="address-level2"
                      className="sm:col-span-2 lg:col-span-6"
                    />
                    <Field
                      label="UF"
                      name="state"
                      value={sharedDraft.state}
                      onChange={(event) =>
                        setShared("state", event.target.value.toUpperCase())
                      }
                      disabled={fieldIsDisabled("state")}
                      autoComplete="address-level1"
                      maxLength={2}
                      className="lg:col-span-2"
                    />
                  </div>
                </FormSection>
              </form>
            </OperationsModal>

            <OperationsModal
              icon={CheckCircle2}
              open={isNextStepOpen}
              onOpenChange={setIsNextStepOpen}
              size="md"
              title="Fornecedor cadastrado"
              description="Escolha o próximo passo para continuar o cadastro operacional."
              footer={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsNextStepOpen(false);
                    setCreatedSupplierId("");
                    setIsCreateModalOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Criar outro fornecedor
                </Button>
              }
            >
              <div className="grid gap-3">
                <button
                  type="button"
                  className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  onClick={() => {
                    if (!createdSupplierId) return;
                    router.push(
                      `${copy.detailBasePath}/${createdSupplierId}${detailSuffix}`,
                    );
                  }}
                >
                  <Eye className="size-5 text-primary" />
                  <span>
                    <span className="block font-bold">
                      Ir para a página do fornecedor
                    </span>
                    <span className="block text-muted-foreground">
                      Conferir identificação, contato e endereço.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  onClick={() => {
                    if (!createdSupplierId) return;
                    router.push(
                      `${copy.detailBasePath}/${createdSupplierId}?catalog=new${detailQuery ? `&${detailQuery}` : ""}`,
                    );
                  }}
                >
                  <ListPlus className="size-5 text-primary" />
                  <span>
                    <span className="block font-bold">
                      Criar catálogo de itens
                    </span>
                    <span className="block text-muted-foreground">
                      Registrar itens, unidades, quantidade e preço.
                    </span>
                  </span>
                </button>
              </div>
            </OperationsModal>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <TableHead icon={ArrowDownAZ} label="Nome" />
                <TableHead icon={FileSearch} label="Documento" />
                <TableHead label="Tipo" />
                <TableHead label="Contato" />
                <TableHead icon={CalendarArrowDown} label="Cadastro" />
                <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-4 py-3 font-bold">
                      <span className="block max-w-[28ch] truncate">
                        {row.name}
                      </span>
                      {row.tradeName && (
                        <span className="block max-w-[28ch] truncate text-xs font-semibold text-muted-foreground">
                          {row.tradeName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {row.document.maskedDocument}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {row.entityType === "individual"
                        ? "Pessoa física"
                        : "Pessoa jurídica"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.email ?? row.phone ?? "Sem contato"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR").format(
                        new Date(row.createdAt),
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`${copy.detailBasePath}/${row.id}${detailSuffix}`}
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                        >
                          <Eye className="size-4" />
                          Ver
                        </Link>
                        <form
                          action={removeFormAction}
                          onSubmit={(event) => {
                            if (
                              !window.confirm(
                                "Esta ação remove o registro do uso operacional e não oferece restauração no MVP.",
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="id" value={row.id} />
                          <RemoveSubmitButton label={copy.removeLabel} />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <p className="text-base font-bold">{copy.emptyTitle}</p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      {copy.emptyDescription}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 bg-secondary/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-muted-foreground">
              {rows.length} registros nesta página
              {hasFilters ? " · filtros ativos" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pageInfo.nextCursor ? (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`${copy.basePath}?${nextParams.toString()}`}
              >
                Próxima
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <Button disabled size="sm" variant="outline">
                Próxima
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </article>
  );
}

function TableHead({
  icon: Icon,
  label,
}: {
  icon?: typeof ArrowDownAZ;
  label: string;
}) {
  return (
    <th className="px-4 py-3 text-xs font-bold text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
    </th>
  );
}

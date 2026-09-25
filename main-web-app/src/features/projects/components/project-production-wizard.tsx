"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Shovel,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button } from "@/components/ui/button";
import { FieldHelpPopover } from "@/components/ui/field-help-popover";
import { FormSection } from "@/components/ui/form-section";
import { FormWizardProgress } from "@/components/ui/form-wizard-progress";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";

import {
  createEarthworkMaterialAction,
  createHaulRouteAction,
  getEarthworkCatalogOptionsAction,
  saveProjectProductionAction,
} from "../productions.actions";
import type {
  EarthworkMaterialOption,
  HaulRouteOption,
  ProjectProductionCommand,
  ProjectProductionDetail,
  ProjectProductionEquipmentRole,
  ProjectProductionOptions,
} from "../productions.types";
import { calculateMovementPreview } from "../production-preview";

const decimal = /^(?:0|[1-9]\d{0,11})(?:[.,]\d{1,6})?$/u;
const wizardSchema = z.object({
  kind: z.enum(["individual_activity", "material_movement"]),
  productionDate: z.string().date(),
  shift: z.enum(["day", "night"]),
  responsibleEmploymentId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workFrontId: z.string(),
  workFrontServiceId: z.string(),
  destinationWorkFrontId: z.string(),
  destinationWorkFrontServiceId: z.string(),
  location: z.string(),
  startStation: z.string(),
  endStation: z.string(),
  layer: z.string(),
  elevation: z.string(),
  materialId: z.string(),
  materialName: z.string(),
  materialCategory: z.string(),
  topsoilSubtype: z.enum(["removal", "placement"]),
  volumeCondition: z.enum(["bank", "loose", "compacted", "placed"]),
  operationalQuantity: z.string(),
  origin: z.string(),
  destination: z.string(),
  routeId: z.string(),
  dmtKm: z.string(),
  contractualDmtKm: z.string(),
  contractualBand: z.string(),
  densityTPerM3: z.string(),
  swellFactor: z.string(),
  looseToCompactedFactor: z.string(),
  layerThicknessCm: z.string(),
  compactionPasses: z.string(),
  moistureCondition: z.string(),
  selectedEquipmentIds: z.array(z.string()),
  equipmentRoles: z.record(z.string(), z.string()),
  selectedTruckIds: z.array(z.string()),
  truckAcceptedTrips: z.record(z.string(), z.string()),
  truckRejectedTrips: z.record(z.string(), z.string()),
  truckPartialTrips: z.record(z.string(), z.string()),
  truckPartialVolume: z.record(z.string(), z.string()),
  truckActualWeightT: z.record(z.string(), z.string()),
  truckLoadFactor: z.record(z.string(), z.string()),
  truckCycleMinutes: z.record(z.string(), z.string()),
  truckOccurrences: z.record(z.string(), z.string()),
  photoUrls: z.string(),
  ticketUrls: z.string(),
  attachmentUrls: z.string(),
  notes: z.string(),
  newMaterialCode: z.string(),
  newRouteCode: z.string(),
});

type WizardValues = z.infer<typeof wizardSchema>;
type WizardIssue = { field?: string; location?: string; message: string };

const activitySteps = [
  { title: "Tipo e turno" },
  { title: "Frente e serviço" },
  { title: "Local e quantidade" },
  { title: "Equipamentos" },
  { title: "Qualidade" },
  { title: "Revisão" },
];
const movementSteps = [
  { title: "Tipo e turno" },
  { title: "Origem e material" },
  { title: "Composição e rota" },
  { title: "Caminhões" },
  { title: "Equipamentos" },
  { title: "Recebimento" },
  { title: "Revisão" },
];

const roleLabels: Record<ProjectProductionEquipmentRole, string> = {
  excavation: "Escavação",
  loading: "Carga",
  transport: "Transporte",
  spreading: "Espalhamento",
  grading: "Regularização",
  compaction: "Compactação",
  watering: "Umectação",
  support: "Apoio",
};

const controlClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60";

export function ProjectProductionWizard({
  contextLocked = false,
  detail,
  onContextChange,
  onOpenChange,
  onSaved,
  open,
  options,
  projectId,
  workflowActions,
}: {
  contextLocked?: boolean;
  detail: ProjectProductionDetail | null;
  onContextChange: (
    productionDate: string,
    shift: "day" | "night",
  ) => Promise<ProjectProductionOptions>;
  onOpenChange: (open: boolean) => void;
  onSaved: (production: ProjectProductionDetail) => void;
  open: boolean;
  options: ProjectProductionOptions;
  projectId: string;
  workflowActions?: React.ReactNode;
}) {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [issues, setIssues] = React.useState<WizardIssue[]>([]);
  const [materials, setMaterials] = React.useState<EarthworkMaterialOption[]>(
    [],
  );
  const [routes, setRoutes] = React.useState<HaulRouteOption[]>([]);
  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: valuesFrom(detail, options),
  });
  // React Hook Form owns the subscription and returns the complete initialized snapshot.
  // eslint-disable-next-line react-hooks/incompatible-library
  const values = form.watch();
  const steps =
    values.kind === "material_movement" ? movementSteps : activitySteps;
  const selectedFront = options.workFronts.find(
    (front) => front.id === values.workFrontId,
  );
  const destinationFront = options.workFronts.find(
    (front) => front.id === values.destinationWorkFrontId,
  );
  const selectedService = selectedFront?.services.find(
    (service) => service.id === values.workFrontServiceId,
  );
  const editable = !detail || detail.status === "draft";

  React.useEffect(() => {
    if (!open) return;
    form.reset(valuesFrom(detail, options));
    setCurrentStep(0);
    setIssues([]);
    void getEarthworkCatalogOptionsAction({ projectId })
      .then((catalogs) => {
        setMaterials(catalogs.materials.data);
        setRoutes(catalogs.routes.data);
        const material = catalogs.materials.data.find(
          (item) =>
            item.revision?.id === detail?.materialMovement?.materialRevisionId,
        );
        const route = catalogs.routes.data.find(
          (item) =>
            item.revision?.id === detail?.materialMovement?.routeRevisionId,
        );
        if (material)
          form.setValue("materialId", material.id, { shouldDirty: false });
        if (route) form.setValue("routeId", route.id, { shouldDirty: false });
      })
      .catch(() => {
        setMaterials([]);
        setRoutes([]);
      });
  }, [detail, form, open, options, projectId]);

  function requestClose() {
    if (
      editable &&
      form.formState.isDirty &&
      !window.confirm("Descartar as alterações não salvas deste lançamento?")
    )
      return;
    onOpenChange(false);
  }

  async function changeContext(productionDate: string, shift: "day" | "night") {
    if (
      form.formState.isDirty &&
      !window.confirm(
        "Trocar data ou turno recarrega frentes, pessoas e máquinas. Continuar?",
      )
    )
      return;
    setBusy(true);
    try {
      const next = await onContextChange(productionDate, shift);
      form.reset(valuesFrom(null, next));
      setCurrentStep(0);
    } catch {
      toast.error("O contexto operacional não está disponível.");
    } finally {
      setBusy(false);
    }
  }

  function changeKind(kind: WizardValues["kind"]) {
    if (
      form.formState.isDirty &&
      values.kind !== kind &&
      !window.confirm(
        "Trocar o tipo limpa os dados específicos já preenchidos. Continuar?",
      )
    )
      return;
    form.reset({ ...valuesFrom(null, options), kind });
    setCurrentStep(0);
  }

  async function next() {
    const stepIssues = editable ? validateStep(values, currentStep) : [];
    if (stepIssues.length) {
      setIssues(stepIssues);
      return;
    }
    setIssues([]);
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  }

  async function save(submitNow: boolean) {
    const allIssues = validateReview(values);
    if (allIssues.length) {
      setIssues(allIssues);
      return;
    }
    const createAnotherBatch = movementIdentityChanged(
      detail,
      values,
      materials,
      routes,
    );
    if (
      createAnotherBatch &&
      !window.confirm(
        "Material, rota, origem, destino, camada ou composição mudou. Salvar como um novo lote?",
      )
    )
      return;
    setBusy(true);
    try {
      const catalogIds = await persistInlineCatalogs(values);
      const command = toCommand(
        values,
        options,
        createAnotherBatch ? undefined : detail?.revision,
        submitNow,
        catalogIds,
      );
      const result = await saveProjectProductionAction({
        projectId,
        productionId: createAnotherBatch ? undefined : detail?.id,
        command,
      });
      if (result.kind === "failure") {
        setIssues([{ message: translateError(result.code) }]);
        return;
      }
      form.reset(valuesFrom(result.production, options));
      onSaved(result.production);
      toast.success(submitNow ? "Produção enviada." : "Rascunho salvo.");
      onOpenChange(false);
    } catch {
      setIssues([
        {
          message:
            "Não foi possível cadastrar o material/rota ou salvar a produção.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function persistInlineCatalogs(values: WizardValues) {
    if (values.kind !== "material_movement")
      return { materialRevisionId: null, routeRevisionId: null };
    let material = materials.find((item) => item.id === values.materialId);
    let route = routes.find((item) => item.id === values.routeId);
    const effectiveFrom = `${values.productionDate}T03:00:00.000Z`;
    if (!material && values.newMaterialCode)
      material = await createEarthworkMaterialAction({
        projectId,
        code: values.newMaterialCode,
        name: values.materialName,
        category: blank(values.materialCategory),
        densityTPerM3: canonical(values.densityTPerM3),
        swellFactor: canonical(values.swellFactor),
        looseToCompactedFactor: canonical(values.looseToCompactedFactor),
        effectiveFrom,
      });
    if (!route && values.newRouteCode)
      route = await createHaulRouteAction({
        projectId,
        code: values.newRouteCode,
        name: `${values.origin} → ${values.destination}`,
        origin: values.origin,
        destination: values.destination,
        loadedDistanceKm: canonical(values.dmtKm)!,
        contractualDmtKm: canonical(values.contractualDmtKm),
        contractualBand: blank(values.contractualBand),
        effectiveFrom,
      });
    return {
      materialRevisionId: material?.revision?.id ?? null,
      routeRevisionId: route?.revision?.id ?? null,
    };
  }

  return (
    <OperationsModal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      size="xl"
      icon={Shovel}
      title={detail ? "Produção de terraplanagem" : "Nova produção"}
      description="Assistente guiado para atividade individual ou movimentação de material."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={busy}
          >
            Fechar
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep((step) => step - 1)}
                disabled={busy}
              >
                <ChevronLeft /> Voltar
              </Button>
            )}
            {editable && currentStep === steps.length - 1 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void save(false)}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Save />}{" "}
                  Salvar rascunho
                </Button>
                <Button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}{" "}
                  Enviar produção
                </Button>
              </>
            )}
            {currentStep < steps.length - 1 && (
              <Button type="button" onClick={() => void next()} disabled={busy}>
                Avançar <ChevronRight />
              </Button>
            )}
            {!editable && workflowActions}
          </div>
        </>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => event.preventDefault()}
        aria-busy={busy}
      >
        <FormWizardProgress currentStep={currentStep} steps={steps} />
        <FormErrorDeclaration
          issues={issues}
          title="Revise os dados desta etapa."
        />
        {currentStep === 0 && (
          <ContextStep
            contextLocked={contextLocked}
            values={values}
            editable={editable}
            options={options}
            form={form}
            changeContext={changeContext}
            changeKind={changeKind}
          />
        )}
        {values.kind === "individual_activity" ? (
          <>
            {currentStep === 1 && (
              <ServiceStep
                form={form}
                options={options}
                selectedFront={selectedFront}
                editable={editable}
              />
            )}
            {currentStep === 2 && (
              <IndividualQuantityStep
                form={form}
                service={selectedService}
                editable={editable}
              />
            )}
            {currentStep === 3 && (
              <EquipmentStep
                form={form}
                front={selectedFront}
                editable={editable}
              />
            )}
            {currentStep === 4 && (
              <QualityStep form={form} editable={editable} />
            )}
            {currentStep === 5 && (
              <ReviewStep
                values={values}
                options={options}
                materials={materials}
                routes={routes}
                onEdit={setCurrentStep}
              />
            )}
          </>
        ) : (
          <>
            {currentStep === 1 && (
              <MovementMaterialStep
                form={form}
                materials={materials}
                editable={editable}
              />
            )}
            {currentStep === 2 && (
              <MovementRouteStep
                form={form}
                options={options}
                selectedFront={selectedFront}
                destinationFront={destinationFront}
                routes={routes}
                editable={editable}
              />
            )}
            {currentStep === 3 && (
              <TruckStep
                form={form}
                front={selectedFront}
                editable={editable}
              />
            )}
            {currentStep === 4 && (
              <EquipmentStep
                form={form}
                front={selectedFront}
                editable={editable}
              />
            )}
            {currentStep === 5 && (
              <QualityStep form={form} editable={editable} movement />
            )}
            {currentStep === 6 && (
              <ReviewStep
                values={values}
                options={options}
                materials={materials}
                routes={routes}
                onEdit={setCurrentStep}
              />
            )}
          </>
        )}
      </form>
    </OperationsModal>
  );
}

type FormApi = ReturnType<typeof useForm<WizardValues>>;

function ContextStep({
  contextLocked,
  values,
  editable,
  options,
  form,
  changeContext,
  changeKind,
}: {
  contextLocked: boolean;
  values: WizardValues;
  editable: boolean;
  options: ProjectProductionOptions;
  form: FormApi;
  changeContext: (date: string, shift: "day" | "night") => Promise<void>;
  changeKind: (kind: WizardValues["kind"]) => void;
}) {
  return (
    <FormSection
      title="Tipo, data e turno"
      description={`Janela autorizada pela API: ${options.dateLimits.minimum} a ${options.dateLimits.maximum} (${options.dateLimits.timeZone}).`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de lançamento">
          <select
            className={controlClass}
            value={values.kind}
            disabled={!editable}
            onChange={(event) =>
              changeKind(event.target.value as WizardValues["kind"])
            }
          >
            <option value="individual_activity">Atividade individual</option>
            <option value="material_movement">Movimentação de material</option>
          </select>
        </Field>
        <Field label="Responsável">
          <select
            className={controlClass}
            disabled={!editable}
            {...form.register("responsibleEmploymentId")}
          >
            <option value="">Selecione</option>
            {options.responsibleOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.jobRole}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data">
          <Input
            type="date"
            min={options.dateLimits.minimum}
            max={options.dateLimits.maximum}
            value={values.productionDate}
            disabled={!editable || contextLocked}
            onChange={(event) =>
              void changeContext(event.target.value, values.shift)
            }
          />
        </Field>
        <Field label="Turno">
          <select
            className={controlClass}
            value={values.shift}
            disabled={!editable || contextLocked}
            onChange={(event) =>
              void changeContext(
                values.productionDate,
                event.target.value as "day" | "night",
              )
            }
          >
            <option value="day">Diurno</option>
            <option value="night">Noturno</option>
          </select>
        </Field>
        <Field label="Início">
          <Input
            type="time"
            disabled={!editable}
            {...form.register("startTime")}
          />
        </Field>
        <Field label="Fim">
          <Input
            type="time"
            disabled={!editable}
            {...form.register("endTime")}
          />
        </Field>
      </div>
    </FormSection>
  );
}

function ServiceStep({
  form,
  options,
  selectedFront,
  editable,
}: {
  form: FormApi;
  options: ProjectProductionOptions;
  selectedFront: ProjectProductionOptions["workFronts"][number] | undefined;
  editable: boolean;
}) {
  return (
    <FormSection
      title="Frente e serviço"
      description="Selecione o serviço que define unidade e campos técnicos."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Frente">
          <select
            className={controlClass}
            disabled={!editable}
            {...form.register("workFrontId", {
              onChange: (event) => {
                const front = options.workFronts.find(
                  (item) => item.id === event.target.value,
                );
                form.setValue(
                  "workFrontServiceId",
                  front?.services[0]?.id ?? "",
                  { shouldDirty: true },
                );
                form.setValue("location", front?.location ?? "", {
                  shouldDirty: true,
                });
                form.setValue(
                  "volumeCondition",
                  volumeConditionForService(front?.services[0]),
                  { shouldDirty: true },
                );
              },
            })}
          >
            {options.workFronts.map((front) => (
              <option key={front.id} value={front.id}>
                {front.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Serviço">
          <select
            className={controlClass}
            disabled={!editable}
            {...form.register("workFrontServiceId", {
              onChange: (event) => {
                const service = selectedFront?.services.find(
                  (item) => item.id === event.target.value,
                );
                form.setValue(
                  "volumeCondition",
                  volumeConditionForService(service),
                  { shouldDirty: true },
                );
              },
            })}
          >
            {selectedFront?.services.map((service) => (
              <option key={service.id} value={service.id}>
                {serviceLabel(service.serviceCode)} ·{" "}
                {explicitUnit(
                  service.unitCode,
                  form.getValues("volumeCondition"),
                )}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </FormSection>
  );
}

function IndividualQuantityStep({
  form,
  service,
  editable,
}: {
  form: FormApi;
  service:
    | ProjectProductionOptions["workFronts"][number]["services"][number]
    | undefined;
  editable: boolean;
}) {
  return (
    <div className="grid gap-4">
      <FormSection title="Local e material">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Local">
            <Input disabled={!editable} {...form.register("location")} />
          </Field>
          <Field label="Material">
            <Input disabled={!editable} {...form.register("materialName")} />
          </Field>
          {service?.serviceCode === "top_soil" && (
            <Field label="Subtipo de topsoil">
              <select
                className={controlClass}
                disabled={!editable}
                {...form.register("topsoilSubtype", {
                  onChange: (event) =>
                    form.setValue(
                      "volumeCondition",
                      event.target.value === "placement" ? "placed" : "bank",
                      { shouldDirty: true },
                    ),
                })}
              >
                <option value="removal">Remoção / decapagem</option>
                <option value="placement">Espalhamento / aplicação</option>
              </select>
            </Field>
          )}
          <Field label="Estaca inicial">
            <Input disabled={!editable} {...form.register("startStation")} />
          </Field>
          <Field label="Estaca final">
            <Input disabled={!editable} {...form.register("endStation")} />
          </Field>
          <Field label="Camada">
            <Input disabled={!editable} {...form.register("layer")} />
          </Field>
          <Field label="Cota">
            <Input disabled={!editable} {...form.register("elevation")} />
          </Field>
        </div>
      </FormSection>
      <FormSection
        title="Quantidade operacional"
        description="Quantidade estimada ou tecnicamente aceita será exibida separadamente."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Condição">
            <select
              className={controlClass}
              disabled={!editable}
              {...form.register("volumeCondition")}
            >
              <option value="bank">Corte / in situ</option>
              <option value="loose">Solto</option>
              <option value="compacted">Compactado</option>
              <option value="placed">Aplicado</option>
            </select>
          </Field>
          <Field label="Quantidade">
            <Input
              inputMode="decimal"
              disabled={!editable}
              {...form.register("operationalQuantity")}
            />
          </Field>
        </div>
      </FormSection>
    </div>
  );
}

function MovementMaterialStep({
  form,
  materials,
  editable,
}: {
  form: FormApi;
  materials: EarthworkMaterialOption[];
  editable: boolean;
}) {
  return (
    <div className="grid gap-4">
      <FormSection title="Origem, destino e material">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Origem">
            <Input disabled={!editable} {...form.register("origin")} />
          </Field>
          <Field label="Destino">
            <Input disabled={!editable} {...form.register("destination")} />
          </Field>
          <Field label="Material cadastrado">
            <select
              className={controlClass}
              disabled={!editable}
              {...form.register("materialId", {
                onChange: (event) => {
                  const material = materials.find(
                    (item) => item.id === event.target.value,
                  );
                  if (!material) return;
                  form.setValue("materialName", material.name);
                  form.setValue("materialCategory", material.category ?? "");
                  form.setValue(
                    "densityTPerM3",
                    material.revision?.densityTPerM3 ?? "",
                  );
                  form.setValue(
                    "swellFactor",
                    material.revision?.swellFactor ?? "",
                  );
                  form.setValue(
                    "looseToCompactedFactor",
                    material.revision?.looseToCompactedFactor ?? "",
                  );
                },
              })}
            >
              <option value="">Cadastrar/usar avulso</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.code} · {material.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome do material">
            <Input
              disabled={!editable || Boolean(form.watch("materialId"))}
              {...form.register("materialName")}
            />
          </Field>
          <Field label="Código para cadastro inline">
            <Input
              placeholder="Ex.: solo-1 (opcional)"
              disabled={!editable || Boolean(form.watch("materialId"))}
              {...form.register("newMaterialCode")}
            />
          </Field>
          <Field label="Categoria">
            <Input
              disabled={!editable}
              {...form.register("materialCategory")}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Fatores vigentes">
        <div className="grid gap-3 sm:grid-cols-3">
          <ProductionFactorField
            description="Relaciona a massa e o volume do material. Quando existe peso real de balança, permite estimar o volume correspondente."
            disabled={!editable}
            example="18 t ÷ 1,8 t/m³ = 10 m³."
            form={form}
            formula="Volume estimado = peso ÷ densidade"
            label="Densidade t/m³"
            name="densityTPerM3"
          />
          <ProductionFactorField
            description="Representa o aumento de volume depois que o material é escavado e fica solto."
            disabled={!editable}
            example="fator 1,25 indica que 1 m³ no corte gera 1,25 m³ solto."
            form={form}
            formula="Volume em banco = volume solto ÷ empolamento"
            label="Empolamento"
            name="swellFactor"
          />
          <ProductionFactorField
            description="Representa a parcela do volume solto que permanece depois da compactação."
            disabled={!editable}
            example="fator 0,80 indica que 10 m³ soltos resultam em 8 m³ compactados."
            form={form}
            formula="Volume compactado = volume solto × fator"
            label="Solto → compactado"
            name="looseToCompactedFactor"
          />
        </div>
      </FormSection>
    </div>
  );
}

function MovementRouteStep({
  form,
  options,
  selectedFront,
  destinationFront,
  routes,
  editable,
}: {
  form: FormApi;
  options: ProjectProductionOptions;
  selectedFront: ProjectProductionOptions["workFronts"][number] | undefined;
  destinationFront: ProjectProductionOptions["workFronts"][number] | undefined;
  routes: HaulRouteOption[];
  editable: boolean;
}) {
  return (
    <div className="grid gap-4">
      <FormSection title="Composição">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Frente de origem">
            <select
              className={controlClass}
              disabled={!editable}
              {...form.register("workFrontId", {
                onChange: (event) => {
                  const front = options.workFronts.find(
                    (item) => item.id === event.target.value,
                  );
                  form.setValue(
                    "workFrontServiceId",
                    front?.services[0]?.id ?? "",
                  );
                },
              })}
            >
              {options.workFronts.map((front) => (
                <option key={front.id} value={front.id}>
                  {front.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Serviço de origem">
            <select
              className={controlClass}
              disabled={!editable}
              {...form.register("workFrontServiceId")}
            >
              {selectedFront?.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {serviceLabel(service.serviceCode)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Frente de destino">
            <select
              className={controlClass}
              disabled={!editable}
              {...form.register("destinationWorkFrontId", {
                onChange: (event) => {
                  const front = options.workFronts.find(
                    (item) => item.id === event.target.value,
                  );
                  form.setValue(
                    "destinationWorkFrontServiceId",
                    front?.services[0]?.id ?? "",
                  );
                },
              })}
            >
              {options.workFronts.map((front) => (
                <option key={front.id} value={front.id}>
                  {front.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Serviço de destino">
            <select
              className={controlClass}
              disabled={!editable}
              {...form.register("destinationWorkFrontServiceId")}
            >
              {destinationFront?.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {serviceLabel(service.serviceCode)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>
      <FormSection title="Rota e DMT">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rota cadastrada">
            <select
              className={controlClass}
              disabled={!editable}
              {...form.register("routeId", {
                onChange: (event) => {
                  const route = routes.find(
                    (item) => item.id === event.target.value,
                  );
                  if (!route) return;
                  form.setValue("origin", route.origin);
                  form.setValue("destination", route.destination);
                  form.setValue(
                    "dmtKm",
                    route.revision?.loadedDistanceKm ?? "",
                  );
                  form.setValue(
                    "contractualDmtKm",
                    route.revision?.contractualDmtKm ?? "",
                  );
                  form.setValue(
                    "contractualBand",
                    route.revision?.contractualBand ?? "",
                  );
                },
              })}
            >
              <option value="">Cadastrar/usar avulsa</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.code} · {route.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Código para cadastro inline">
            <Input
              placeholder="Ex.: jazida-a-aterro-1"
              disabled={!editable || Boolean(form.watch("routeId"))}
              {...form.register("newRouteCode")}
            />
          </Field>
          <Field label="Distância carregada (km)">
            <Input
              inputMode="decimal"
              disabled={!editable}
              {...form.register("dmtKm")}
            />
          </Field>
          <Field label="DMT contratual (km)">
            <Input
              inputMode="decimal"
              disabled={!editable}
              {...form.register("contractualDmtKm")}
            />
          </Field>
          <Field label="Faixa contratual">
            <Input disabled={!editable} {...form.register("contractualBand")} />
          </Field>
        </div>
      </FormSection>
    </div>
  );
}

function TruckStep({
  form,
  front,
  editable,
}: {
  form: FormApi;
  front: ProjectProductionOptions["workFronts"][number] | undefined;
  editable: boolean;
}) {
  const selected = form.watch("selectedTruckIds");
  const preview = movementPreview(form, front);
  return (
    <FormSection
      title="Resumo por caminhão"
      description="A capacidade efetiva é somente leitura; rejeitadas não entram no volume."
    >
      <div className="grid gap-3">
        {front?.trucks.length ? (
          front.trucks.map((truck) => {
            const checked = selected.includes(truck.id);
            return (
              <div key={truck.id} className="rounded-md border p-3">
                <label className="flex items-center gap-2 font-bold">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!editable}
                    onChange={(event) =>
                      form.setValue(
                        "selectedTruckIds",
                        event.target.checked
                          ? [...selected, truck.id]
                          : selected.filter((id) => id !== truck.id),
                        { shouldDirty: true },
                      )
                    }
                  />
                  {truck.name} · {truck.identifier ?? "sem identificação"} ·{" "}
                  {truck.effectiveCapacity} {truck.capacityUnitCode}
                </label>
                {checked && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <Field label="Aceitas">
                      <Input
                        type="number"
                        min={0}
                        disabled={!editable}
                        {...form.register(`truckAcceptedTrips.${truck.id}`)}
                      />
                    </Field>
                    <Field label="Rejeitadas">
                      <Input
                        type="number"
                        min={0}
                        disabled={!editable}
                        {...form.register(`truckRejectedTrips.${truck.id}`)}
                      />
                    </Field>
                    <Field label="Parciais">
                      <Input
                        type="number"
                        min={0}
                        disabled={!editable}
                        {...form.register(`truckPartialTrips.${truck.id}`)}
                      />
                    </Field>
                    <Field label="Volume parcial">
                      <Input
                        inputMode="decimal"
                        disabled={!editable}
                        {...form.register(`truckPartialVolume.${truck.id}`)}
                      />
                    </Field>
                    <Field label="Peso real (t)">
                      <Input
                        inputMode="decimal"
                        disabled={!editable}
                        {...form.register(`truckActualWeightT.${truck.id}`)}
                      />
                    </Field>
                    <Field label="Fator de carga">
                      <Input
                        inputMode="decimal"
                        disabled={!editable}
                        {...form.register(`truckLoadFactor.${truck.id}`)}
                      />
                    </Field>
                    <Field label="Ciclo médio (min)">
                      <Input
                        type="number"
                        min={0}
                        disabled={!editable}
                        {...form.register(`truckCycleMinutes.${truck.id}`)}
                      />
                    </Field>
                    <Field label="Ocorrência">
                      <Input
                        disabled={!editable}
                        {...form.register(`truckOccurrences.${truck.id}`)}
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum caminhão com especificação de transporte está mobilizado
            nesta frente.
          </p>
        )}
        {preview && (
          <div className="grid gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm sm:grid-cols-3">
            <PreviewValue
              label="Volume solto"
              value={`${preview.looseVolumeM3} m³`}
            />
            <PreviewValue
              label={
                preview.actualWeightT
                  ? "Peso de balança"
                  : "Volume estimado em corte"
              }
              value={
                preview.actualWeightT
                  ? `${preview.actualWeightT} t`
                  : `${preview.estimatedBankVolumeM3 ?? "—"} m³`
              }
            />
            <PreviewValue
              label="Momento de transporte"
              value={
                preview.transportMoment
                  ? `${preview.transportMoment} ${preview.transportMomentUnit}`
                  : "—"
              }
            />
          </div>
        )}
      </div>
    </FormSection>
  );
}

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function movementPreview(
  form: FormApi,
  front: ProjectProductionOptions["workFronts"][number] | undefined,
) {
  try {
    const values = form.getValues();
    return calculateMovementPreview({
      trucks: values.selectedTruckIds.map((machineId) => {
        const truck = front?.trucks.find((item) => item.id === machineId);
        if (!truck) throw new Error("Unknown truck");
        return {
          capacity: truck.effectiveCapacity,
          acceptedTrips: Number.parseInt(
            values.truckAcceptedTrips[machineId] || "0",
            10,
          ),
          partialTripCount: Number.parseInt(
            values.truckPartialTrips[machineId] || "0",
            10,
          ),
          partialVolume: canonical(
            values.truckPartialVolume[machineId] || "0",
          )!,
          loadFactor: canonical(values.truckLoadFactor[machineId] || "1")!,
          actualWeightT:
            canonical(values.truckActualWeightT[machineId] || "") ?? null,
        };
      }),
      densityTPerM3: canonical(values.densityTPerM3) ?? null,
      swellFactor: canonical(values.swellFactor) ?? null,
      looseToCompactedFactor: canonical(values.looseToCompactedFactor) ?? null,
      contractualDmtKm: canonical(values.contractualDmtKm) ?? null,
    });
  } catch {
    return null;
  }
}

function EquipmentStep({
  form,
  front,
  editable,
}: {
  form: FormApi;
  front: ProjectProductionOptions["workFronts"][number] | undefined;
  editable: boolean;
}) {
  const selected = form.watch("selectedEquipmentIds");
  return (
    <FormSection
      title="Equipamentos e ocorrências"
      description="Inclui linha amarela e equipamentos de apoio mobilizados no turno."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {front?.equipment.map((machine) => {
          const checked = selected.includes(machine.id);
          return (
            <div key={machine.id} className="rounded-md border p-3">
              <label className="flex items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!editable}
                  onChange={(event) =>
                    form.setValue(
                      "selectedEquipmentIds",
                      event.target.checked
                        ? [...selected, machine.id]
                        : selected.filter((id) => id !== machine.id),
                      { shouldDirty: true },
                    )
                  }
                />
                {machine.name} · {machine.identifier ?? machine.model}
              </label>
              {checked && (
                <select
                  aria-label={`Função de ${machine.name}`}
                  className={`${controlClass} mt-2`}
                  disabled={!editable}
                  {...form.register(`equipmentRoles.${machine.id}`)}
                >
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </FormSection>
  );
}

function QualityStep({
  form,
  editable,
  movement = false,
}: {
  form: FormApi;
  editable: boolean;
  movement?: boolean;
}) {
  return (
    <div className="grid gap-4">
      <FormSection
        title={
          movement
            ? "Recebimento, qualidade e acabamento"
            : "Qualidade e evidências"
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Camada">
            <Input disabled={!editable} {...form.register("layer")} />
          </Field>
          <Field label="Espessura (cm)">
            <Input
              inputMode="decimal"
              disabled={!editable}
              {...form.register("layerThicknessCm")}
            />
          </Field>
          <Field label="Passadas de compactação">
            <Input
              type="number"
              min={0}
              disabled={!editable}
              {...form.register("compactionPasses")}
            />
          </Field>
          <Field label="Condição de umidade">
            <Input
              disabled={!editable}
              {...form.register("moistureCondition")}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection
        title="Evidências por URL"
        description="Uma URL por linha; upload binário permanece fora desta entrega."
      >
        <div className="grid gap-3">
          <TextAreaField
            label="Fotos"
            disabled={!editable}
            registration={form.register("photoUrls")}
          />
          <TextAreaField
            label="Tickets"
            disabled={!editable}
            registration={form.register("ticketUrls")}
          />
          <TextAreaField
            label="Anexos"
            disabled={!editable}
            registration={form.register("attachmentUrls")}
          />
          <TextAreaField
            label="Observações"
            disabled={!editable}
            registration={form.register("notes")}
          />
        </div>
      </FormSection>
    </div>
  );
}

function ReviewStep({
  values,
  options,
  materials,
  routes,
  onEdit,
}: {
  values: WizardValues;
  options: ProjectProductionOptions;
  materials: EarthworkMaterialOption[];
  routes: HaulRouteOption[];
  onEdit: (step: number) => void;
}) {
  const front = options.workFronts.find(
    (item) => item.id === values.workFrontId,
  );
  const service = front?.services.find(
    (item) => item.id === values.workFrontServiceId,
  );
  const rows =
    values.kind === "individual_activity"
      ? [
          [
            "Contexto",
            `${values.productionDate} · ${values.shift === "day" ? "Diurno" : "Noturno"}`,
            0,
          ],
          [
            "Serviço",
            `${front?.name ?? "—"} · ${serviceLabel(service?.serviceCode ?? "")}`,
            1,
          ],
          [
            "Quantidade",
            `${values.operationalQuantity || "0"} ${explicitUnit(service?.unitCode ?? "", values.volumeCondition)}`,
            2,
          ],
          [
            "Equipamentos",
            `${values.selectedEquipmentIds.length} selecionado(s)`,
            3,
          ],
          ["Qualidade", values.layer || "Sem camada informada", 4],
        ]
      : [
          [
            "Contexto",
            `${values.productionDate} · ${values.shift === "day" ? "Diurno" : "Noturno"}`,
            0,
          ],
          [
            "Material",
            materials.find((item) => item.id === values.materialId)?.name ??
              values.materialName,
            1,
          ],
          [
            "Rota",
            routes.find((item) => item.id === values.routeId)?.name ??
              `${values.origin} → ${values.destination}`,
            2,
          ],
          ["Caminhões", `${values.selectedTruckIds.length} selecionado(s)`, 3],
          [
            "Equipamentos",
            `${values.selectedEquipmentIds.length} selecionado(s)`,
            4,
          ],
          ["Recebimento", values.layer || "Sem camada informada", 5],
        ];
  return (
    <FormSection
      title="Revisão do lançamento"
      description="Quantidades operacionais, estimadas e aceitas permanecerão separadas."
    >
      <div className="grid gap-2">
        {rows.map(([label, value, step]) => (
          <div
            key={String(label)}
            className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3"
          >
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">
                {label}
              </p>
              <p className="font-semibold">{value}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEdit(Number(step))}
            >
              Editar
            </Button>
          </div>
        ))}
      </div>
    </FormSection>
  );
}

function valuesFrom(
  detail: ProjectProductionDetail | null,
  options: ProjectProductionOptions,
): WizardValues {
  const front =
    options.workFronts.find((item) => item.id === detail?.workFrontId) ??
    options.workFronts[0];
  const destinationFront =
    options.workFronts.find(
      (item) => item.id === detail?.components.at(-1)?.workFrontId,
    ) ?? options.workFronts[0];
  const initialService =
    front?.services.find((item) => item.id === detail?.workFrontServiceId) ??
    front?.services[0];
  const equipmentRoles = Object.fromEntries(
    detail?.equipment.map((item) => [item.machineId, item.role]) ?? [],
  );
  const truckMap = <T,>(
    select: (truck: ProjectProductionDetail["truckSummaries"][number]) => T,
  ) =>
    Object.fromEntries(
      detail?.truckSummaries.map((truck) => [truck.machineId, select(truck)]) ??
        [],
    );
  return {
    kind: detail?.kind ?? "individual_activity",
    productionDate: detail?.productionDate ?? options.defaults.productionDate,
    shift: detail?.shift ?? options.defaults.shift,
    responsibleEmploymentId:
      detail?.responsible?.employmentId ??
      options.responsibleOptions[0]?.id ??
      "",
    startTime: detail?.startTime ?? "07:00",
    endTime: detail?.endTime ?? "17:00",
    workFrontId: front?.id ?? "",
    workFrontServiceId:
      detail?.workFrontServiceId ?? front?.services[0]?.id ?? "",
    destinationWorkFrontId: destinationFront?.id ?? "",
    destinationWorkFrontServiceId:
      detail?.components.at(-1)?.workFrontServiceId ??
      destinationFront?.services[0]?.id ??
      "",
    location: detail?.location ?? front?.location ?? "",
    startStation: detail?.startStation ?? "",
    endStation: detail?.endStation ?? "",
    layer: detail?.layer ?? "",
    elevation: detail?.elevation ?? "",
    materialId: "",
    materialName: detail?.materialName ?? "",
    materialCategory: detail?.materialCategory ?? "",
    topsoilSubtype:
      detail?.materialCategory === "topsoil_placement"
        ? "placement"
        : "removal",
    volumeCondition:
      detail?.volumeCondition ?? volumeConditionForService(initialService),
    operationalQuantity: detail?.directQuantity ?? "",
    origin: detail?.origin ?? "",
    destination: detail?.destination ?? "",
    routeId: "",
    dmtKm: detail?.dmtKm ?? "",
    contractualDmtKm: snapshotString(
      detail?.materialMovement?.routeSnapshot,
      "contractualDmtKm",
    ),
    contractualBand: snapshotString(
      detail?.materialMovement?.routeSnapshot,
      "contractualBand",
    ),
    densityTPerM3: snapshotString(
      detail?.materialMovement?.materialSnapshot,
      "densityTPerM3",
    ),
    swellFactor: snapshotString(
      detail?.materialMovement?.materialSnapshot,
      "swellFactor",
    ),
    looseToCompactedFactor: snapshotString(
      detail?.materialMovement?.materialSnapshot,
      "looseToCompactedFactor",
    ),
    layerThicknessCm: detail?.layerThicknessCm ?? "",
    compactionPasses: detail?.compactionPasses?.toString() ?? "",
    moistureCondition: detail?.moistureCondition ?? "",
    selectedEquipmentIds: detail?.equipment.map((item) => item.machineId) ?? [],
    equipmentRoles,
    selectedTruckIds:
      detail?.truckSummaries.map((item) => item.machineId) ?? [],
    truckAcceptedTrips: truckMap((truck) => truck.acceptedTrips.toString()),
    truckRejectedTrips: truckMap((truck) => truck.rejectedTrips.toString()),
    truckPartialTrips: truckMap((truck) => truck.partialTripCount.toString()),
    truckPartialVolume: truckMap((truck) => truck.partialVolume),
    truckActualWeightT: truckMap((truck) => truck.actualWeightT ?? ""),
    truckLoadFactor: truckMap((truck) => truck.loadFactor),
    truckCycleMinutes: truckMap(
      (truck) => truck.averageCycleMinutes?.toString() ?? "",
    ),
    truckOccurrences: truckMap((truck) => truck.occurrenceNotes ?? ""),
    photoUrls: evidenceLines(detail, "photo"),
    ticketUrls: evidenceLines(detail, "ticket"),
    attachmentUrls: evidenceLines(detail, "attachment"),
    notes: detail?.notes ?? "",
    newMaterialCode: "",
    newRouteCode: "",
  };
}

function validateStep(values: WizardValues, step: number): WizardIssue[] {
  const issues: WizardIssue[] = [];
  if (step === 0) {
    if (!values.responsibleEmploymentId)
      issues.push({
        field: "Responsável",
        message: "Selecione o responsável.",
      });
    if (!values.startTime || !values.endTime)
      issues.push({ field: "Horário", message: "Informe início e fim." });
  }
  if (values.kind === "individual_activity") {
    if (step === 1 && (!values.workFrontId || !values.workFrontServiceId))
      issues.push({ field: "Serviço", message: "Selecione frente e serviço." });
    if (
      step === 2 &&
      (!values.operationalQuantity || !decimal.test(values.operationalQuantity))
    )
      issues.push({
        field: "Quantidade",
        message: "Informe uma quantidade decimal válida.",
      });
    if (step === 3 && !values.selectedEquipmentIds.length)
      issues.push({
        field: "Equipamentos",
        message: "Selecione ao menos um equipamento.",
      });
    if (step === 4) issues.push(...urlIssues(values));
  } else {
    if (
      step === 1 &&
      (!values.origin || !values.destination || !values.materialName)
    )
      issues.push({
        field: "Movimentação",
        message: "Informe origem, destino e material.",
      });
    if (step === 1 && !values.materialId && !values.newMaterialCode)
      issues.push({
        field: "Material",
        message:
          "Selecione um material técnico ou informe um código para cadastrá-lo nesta etapa.",
      });
    if (step === 1) {
      const factors = [
        ["Densidade t/m³", values.densityTPerM3],
        ["Empolamento", values.swellFactor],
        ["Solto → compactado", values.looseToCompactedFactor],
      ] as const;
      for (const [field, value] of factors) {
        if (value && (!decimal.test(value) || !/[1-9]/u.test(value)))
          issues.push({
            field,
            message: "Informe um decimal positivo com até 6 casas.",
          });
      }
    }
    if (
      step === 1 &&
      values.origin.trim().toLowerCase() ===
        values.destination.trim().toLowerCase()
    )
      issues.push({
        field: "Destino",
        message: "Origem e destino devem ser diferentes.",
      });
    if (
      step === 2 &&
      (!values.workFrontId ||
        !values.destinationWorkFrontId ||
        !values.dmtKm ||
        !decimal.test(values.dmtKm))
    )
      issues.push({
        field: "Composição/rota",
        message: "Selecione as frentes e informe a DMT.",
      });
    if (step === 2 && !values.routeId && !values.newRouteCode)
      issues.push({
        field: "Rota",
        message:
          "Selecione uma rota ou informe um código para cadastrá-la nesta etapa.",
      });
    if (step === 3 && !values.selectedTruckIds.length)
      issues.push({
        field: "Caminhões",
        message: "Selecione ao menos um caminhão.",
      });
    if (
      step === 3 &&
      values.selectedTruckIds.every(
        (id) => Number(values.truckAcceptedTrips[id] || 0) === 0,
      )
    )
      issues.push({
        field: "Viagens",
        message: "Informe ao menos uma viagem aceita.",
      });
    if (step === 4 && !values.selectedEquipmentIds.length)
      issues.push({
        field: "Equipamentos",
        message: "Selecione ao menos um equipamento operacional.",
      });
    if (step === 5) issues.push(...urlIssues(values));
  }
  return issues;
}

function validateReview(values: WizardValues) {
  return Array.from(
    { length: values.kind === "individual_activity" ? 5 : 6 },
    (_, step) => validateStep(values, step),
  ).flat();
}

function toCommand(
  values: WizardValues,
  options: ProjectProductionOptions,
  expectedRevision: number | undefined,
  submitNow: boolean,
  catalogs: {
    materialRevisionId: string | null;
    routeRevisionId: string | null;
  },
): ProjectProductionCommand {
  const front = options.workFronts.find(
    (item) => item.id === values.workFrontId,
  )!;
  const destinationFront =
    options.workFronts.find(
      (item) => item.id === values.destinationWorkFrontId,
    ) ?? front;
  const common = {
    expectedRevision,
    submitNow,
    productionDate: values.productionDate,
    shift: values.shift,
    startTime: blank(values.startTime),
    endTime: blank(values.endTime),
    endDayOffset: 0,
    responsibleEmploymentId: blank(values.responsibleEmploymentId),
    evidence: evidenceFrom(values),
    notes: blank(values.notes),
    equipment: values.selectedEquipmentIds.map((machineId) => {
      const machine = front.equipment.find((item) => item.id === machineId)!;
      return {
        machineId,
        role: (values.equipmentRoles[machineId] ||
          "support") as ProjectProductionEquipmentRole,
        operatorEmploymentId: machine.operator.id,
        initialMeterValue: null,
        finalMeterValue: null,
        workedMinutes: null,
        productiveMinutes: null,
        waitingMinutes: null,
        stoppedMinutes: null,
        defaultTripCapacityM3: null,
        stops: [],
      };
    }),
  };
  if (values.kind === "individual_activity") {
    const individualService = front.services.find(
      (item) => item.id === values.workFrontServiceId,
    )!;
    return {
      ...common,
      kind: "individual_activity",
      entryMode: "direct_total",
      truckSummaries: [],
      individualActivity: {
        workFrontId: values.workFrontId,
        workFrontServiceId: values.workFrontServiceId,
        quantityMethod: "manual",
        location: blank(values.location),
        startStation: blank(values.startStation),
        endStation: blank(values.endStation),
        layer: blank(values.layer),
        elevation: blank(values.elevation),
        materialName: blank(values.materialName),
        materialCategory:
          sourceServiceCode(values, options) === "top_soil"
            ? `topsoil_${values.topsoilSubtype}`
            : blank(values.materialCategory),
        volumeCondition:
          individualService.unitCode.toUpperCase() === "M3"
            ? values.volumeCondition
            : null,
        operationalQuantity: canonical(values.operationalQuantity),
        conversionFactor: null,
        layerThicknessCm: canonical(values.layerThicknessCm),
        compactionPasses: integerOrNull(values.compactionPasses),
        moistureCondition: blank(values.moistureCondition),
        exceptionalFromMovement: false,
        exceptionReason: null,
      },
    };
  }
  const sourceService = front.services.find(
    (item) => item.id === values.workFrontServiceId,
  )!;
  const destinationService =
    destinationFront.services.find(
      (item) => item.id === values.destinationWorkFrontServiceId,
    ) ?? sourceService;
  return {
    ...common,
    kind: "material_movement",
    entryMode: "truck_summary",
    materialMovement: {
      workFrontId: values.workFrontId,
      workFrontServiceId: values.workFrontServiceId,
      materialRevisionId: catalogs.materialRevisionId,
      routeRevisionId: catalogs.routeRevisionId,
      materialName: values.materialName,
      materialCategory: blank(values.materialCategory),
      densityTPerM3: canonical(values.densityTPerM3),
      swellFactor: canonical(values.swellFactor),
      looseToCompactedFactor: canonical(values.looseToCompactedFactor),
      origin: values.origin,
      destination: values.destination,
      dmtKm: canonical(values.dmtKm)!,
      contractualDmtKm: canonical(values.contractualDmtKm),
      contractualBand: blank(values.contractualBand),
      layer: blank(values.layer),
      volumeCondition: "loose",
      layerThicknessCm: canonical(values.layerThicknessCm),
      compactionPasses: integerOrNull(values.compactionPasses),
      moistureCondition: blank(values.moistureCondition),
      components: [
        {
          workFrontId: values.workFrontId,
          workFrontServiceId: values.workFrontServiceId,
          type: componentType(sourceService.serviceCode, "cut"),
          operationalQuantity: null,
          unitCode: explicitUnit(sourceService.unitCode, "bank"),
          volumeCondition: "bank",
        },
        {
          workFrontId: values.workFrontId,
          workFrontServiceId: values.workFrontServiceId,
          type: "transport",
          operationalQuantity: null,
          unitCode: "M3_LOOSE",
          volumeCondition: "loose",
        },
        {
          workFrontId: destinationFront.id,
          workFrontServiceId: destinationService.id,
          type: componentType(destinationService.serviceCode, "fill"),
          operationalQuantity: null,
          unitCode: explicitUnit(destinationService.unitCode, "compacted"),
          volumeCondition: "compacted",
        },
      ],
    },
    truckSummaries: values.selectedTruckIds.map((machineId) => {
      const truck = front.trucks.find((item) => item.id === machineId)!;
      return {
        machineId,
        driverEmploymentId: truck.driver.id,
        acceptedTrips: Number(values.truckAcceptedTrips[machineId] || 0),
        rejectedTrips: Number(values.truckRejectedTrips[machineId] || 0),
        partialTripCount: Number(values.truckPartialTrips[machineId] || 0),
        partialVolume: canonical(values.truckPartialVolume[machineId] || "0")!,
        actualWeightT: canonical(values.truckActualWeightT[machineId] || ""),
        loadFactor: canonical(values.truckLoadFactor[machineId] || "1")!,
        averageCycleMinutes: integerOrNull(
          values.truckCycleMinutes[machineId] || "",
        ),
        occurrenceNotes: blank(values.truckOccurrences[machineId] || ""),
      };
    }),
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-bold">
      <span>{label}</span>
      {children}
    </label>
  );
}

type ProductionFactorName =
  | "densityTPerM3"
  | "swellFactor"
  | "looseToCompactedFactor";

function ProductionFactorField({
  description,
  disabled,
  example,
  form,
  formula,
  label,
  name,
}: {
  description: string;
  disabled: boolean;
  example: string;
  form: FormApi;
  formula: string;
  label: string;
  name: ProductionFactorName;
}) {
  const inputId = React.useId();
  const registration = form.register(name);

  return (
    <div className="grid gap-1.5 text-sm font-bold">
      <div className="flex min-h-8 items-center gap-1.5">
        <label htmlFor={inputId}>{label}</label>
        <FieldHelpPopover
          description={description}
          example={example}
          formula={formula}
          title={label}
        />
      </div>
      <Input
        {...registration}
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        maxLength={19}
        pattern="[0-9]+([.,][0-9]{1,6})?"
        disabled={disabled}
        onBeforeInput={(event) => {
          const inserted = (event.nativeEvent as InputEvent).data;
          if (inserted?.length === 1 && !/[0-9.,]/u.test(inserted))
            event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key.length === 1 &&
            !/[0-9.,]/u.test(event.key)
          )
            event.preventDefault();
        }}
        onChange={(event) => {
          event.currentTarget.value = sanitizeProductionFactor(
            event.currentTarget.value,
          );
          void registration.onChange(event);
        }}
      />
    </div>
  );
}

function sanitizeProductionFactor(value: string) {
  const permitted = value.replace(/[^0-9.,]/gu, "");
  const separatorIndex = permitted.search(/[.,]/u);
  if (separatorIndex < 0) return permitted.slice(0, 12);

  const separator = permitted[separatorIndex];
  const whole =
    permitted.slice(0, separatorIndex).replace(/[.,]/gu, "").slice(0, 12) ||
    "0";
  const fraction = permitted
    .slice(separatorIndex + 1)
    .replace(/[.,]/gu, "")
    .slice(0, 6);
  return `${whole}${separator}${fraction}`;
}

function TextAreaField({
  label,
  disabled,
  registration,
}: {
  label: string;
  disabled: boolean;
  registration: ReturnType<FormApi["register"]>;
}) {
  return (
    <Field label={label}>
      <textarea
        className="min-h-20 rounded-md border border-input bg-background p-3 text-sm"
        disabled={disabled}
        {...registration}
      />
    </Field>
  );
}
function evidenceLines(
  detail: ProjectProductionDetail | null,
  kind: "photo" | "ticket" | "attachment",
) {
  return (
    detail?.evidence
      .filter((item) => item.kind === kind)
      .map((item) => item.url)
      .join("\n") ?? ""
  );
}
function snapshotString(
  snapshot: Record<string, unknown> | undefined,
  key: string,
) {
  const value = snapshot?.[key];
  return typeof value === "string" ? value : "";
}
function movementIdentityChanged(
  detail: ProjectProductionDetail | null,
  values: WizardValues,
  materials: EarthworkMaterialOption[],
  routes: HaulRouteOption[],
) {
  if (!detail?.materialMovement || values.kind !== "material_movement")
    return false;
  const selectedMaterialRevisionId =
    materials.find((item) => item.id === values.materialId)?.revision?.id ??
    null;
  const selectedRouteRevisionId =
    routes.find((item) => item.id === values.routeId)?.revision?.id ?? null;
  const destinationComponent = detail.components.at(-1);
  return (
    detail.materialMovement.materialRevisionId !== selectedMaterialRevisionId ||
    detail.materialMovement.routeRevisionId !== selectedRouteRevisionId ||
    detail.materialMovement.origin !== values.origin ||
    detail.materialMovement.destination !== values.destination ||
    (detail.materialMovement.layer ?? "") !== values.layer ||
    detail.workFrontId !== values.workFrontId ||
    detail.workFrontServiceId !== values.workFrontServiceId ||
    destinationComponent?.workFrontId !== values.destinationWorkFrontId ||
    destinationComponent?.workFrontServiceId !==
      values.destinationWorkFrontServiceId
  );
}
function evidenceFrom(values: WizardValues) {
  return (
    [
      ["photo", values.photoUrls],
      ["ticket", values.ticketUrls],
      ["attachment", values.attachmentUrls],
    ] as const
  ).flatMap(([kind, text]) =>
    text
      .split(/\r?\n/u)
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url, index) => ({
        kind,
        name: `${kind}-${index + 1}`,
        url,
        notes: null,
      })),
  );
}
function urlIssues(values: WizardValues) {
  return [values.photoUrls, values.ticketUrls, values.attachmentUrls].flatMap(
    (text) =>
      text
        .split(/\r?\n/u)
        .filter(Boolean)
        .flatMap((url) => {
          try {
            new URL(url.trim());
            return [];
          } catch {
            return [
              { field: "Evidências", message: `URL inválida: ${url.trim()}` },
            ];
          }
        }),
  );
}
function blank(value: string) {
  return value.trim() || undefined;
}
function canonical(value: string) {
  return value.trim() ? value.trim().replace(",", ".") : undefined;
}
function integerOrNull(value: string) {
  return value.trim() ? Number(value) : null;
}
function explicitUnit(unit: string, condition: string) {
  return unit.toUpperCase() === "M3" ? `M3_${condition.toUpperCase()}` : unit;
}
function sourceServiceCode(
  values: WizardValues,
  options: ProjectProductionOptions,
) {
  return options.workFronts
    .find((front) => front.id === values.workFrontId)
    ?.services.find((service) => service.id === values.workFrontServiceId)
    ?.serviceCode;
}
function volumeConditionForService(
  service:
    | ProjectProductionOptions["workFronts"][number]["services"][number]
    | undefined,
): WizardValues["volumeCondition"] {
  if (!service) return "bank";
  if (
    service.serviceCode === "fill" ||
    service.serviceCode === "replacement_fill" ||
    service.productionProfile === "compaction"
  )
    return "compacted";
  return service.serviceCode === "top_soil" ? "bank" : "bank";
}
function componentType(serviceCode: string, fallback: "cut" | "fill") {
  return serviceCode === "finishing"
    ? ("finishing" as const)
    : serviceCode === "fill" || serviceCode === "replacement_fill"
      ? ("fill" as const)
      : serviceCode === "top_soil"
        ? ("spreading" as const)
        : fallback;
}
function serviceLabel(code: string) {
  return (
    ((
      {
        cut: "Corte",
        fill: "Aterro",
        finishing: "Acabamento",
        top_soil: "Top soil",
        unsuitable_soil_removal: "Remoção de solo impróprio",
        replacement_fill: "Aterro de substituição",
      } as Record<string, string>
    )[code] ??
      code) ||
    "Serviço"
  );
}
function translateError(code: string) {
  return (
    (
      {
        PRODUCTION_DATE_OUT_OF_RANGE: "A data está fora da janela permitida.",
        PRODUCTION_DUPLICATE_BATCH:
          "Já existe um lote equivalente; altere rota, material, camada ou composição.",
        PRODUCTION_BATCH_IDENTITY_IMMUTABLE:
          "Mudanças na identidade da movimentação devem ser salvas como um novo lote.",
        PRODUCTION_APPROVAL_INCOMPLETE:
          "Preencha os campos obrigatórios antes de enviar.",
        PRODUCTION_REVISION_CONFLICT:
          "O lançamento foi alterado em outra sessão. Reabra e tente novamente.",
      } as Record<string, string>
    )[code] ?? "Não foi possível salvar a produção."
  );
}

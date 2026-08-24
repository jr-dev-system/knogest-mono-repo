"use client";

import * as React from "react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, useFormStatus } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FolderPlus,
  LockKeyhole,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { FormErrorDeclaration } from "@/components/forms/form-error-declaration";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { OperationsModal } from "@/components/ui/operations-modal";
import { useActionNotification } from "@/hooks/useActionNotification";
import {
  canonicalDecimalToBrazilian,
  decimalInputToCanonicalFixed,
  formatBrazilianDecimalInput,
} from "@/lib/brazilian-input-mask";
import type { RegistryActionState } from "../commercial-registry-action-state";
import type {
  MeasurementUnitOption,
  SupplierSelectorOption,
  SuppliedItemOfferDetail,
  SuppliedItemOffersPage,
  SuppliedItemCatalogItem,
  SuppliedItemCategory,
  SuppliedItemOption,
} from "../commercial-registry.server";

type RegistryAction = (
  state: RegistryActionState,
  formData: FormData,
) => Promise<RegistryActionState>;

type SupplierLookupAction = (
  search: string,
) => Promise<SupplierSelectorOption[]>;

type ItemOffersLookupAction = (input: {
  cursor?: string | null;
  itemId: string;
}) => Promise<SuppliedItemOffersPage>;

type ItemOfferSupplierIdsLookupAction = (itemId: string) => Promise<string[]>;

type CatalogOptions = {
  units: MeasurementUnitOption[];
  items: SuppliedItemOption[];
  categories?: SuppliedItemCategory[];
  catalogItems?: SuppliedItemCatalogItem[];
};

type ItemDraft = {
  id: string;
  name: string;
  categoryId: string;
  baseUnitId: string;
  basePrice: string;
  useValueUnit: boolean;
  valueUnitQuantity: string;
};

type CategoryDraft = {
  id: string;
  name: string;
  parentId: string;
};

type ItemSupplierDraft = {
  excludedSupplierIds: string[];
  item: SuppliedItemCatalogItem | null;
  search: string;
  suppliers: SupplierSelectorOption[];
  selectedSupplier: SupplierSelectorOption | null;
  price: string;
  conversionToBase: string;
  useConversion: boolean;
};

type ItemOfferDraft = {
  conversionToBase: string;
  offerId: string;
  price: string;
  supplierId: string;
  useConversion: boolean;
};

type FormAction = NonNullable<React.ComponentProps<"form">["action"]>;

const emptyItemDraft: ItemDraft = {
  id: "",
  name: "",
  categoryId: "",
  baseUnitId: "",
  basePrice: "",
  useValueUnit: false,
  valueUnitQuantity: "1,000000",
};

function preferredItemUnitId(units: MeasurementUnitOption[]) {
  const liter = units.find(
    (unit) => unit.code.trim().toLocaleLowerCase("pt-BR") === "l",
  );
  return liter?.id ?? units[0]?.id ?? "";
}

function isCategoryDescendantOf(
  categories: SuppliedItemCategory[],
  categoryId: string,
  possibleAncestorId: string,
) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const seen = new Set<string>();
  let currentId: string | null = categoryId;
  while (currentId) {
    if (currentId === possibleAncestorId) return true;
    if (seen.has(currentId)) return false;
    seen.add(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return false;
}

function itemDraftFromFormData(
  formData: FormData,
  fallback: ItemDraft,
): ItemDraft {
  const value = (key: string) => {
    const field = formData.get(key);
    return typeof field === "string" ? field : "";
  };
  return {
    ...fallback,
    id: value("itemId") || fallback.id,
    name: value("name"),
    categoryId: value("categoryId"),
    baseUnitId: value("baseUnitId") || fallback.baseUnitId,
    basePrice: value("basePrice"),
    useValueUnit: formData.get("useValueUnit") !== null,
    valueUnitQuantity: value("valueUnitQuantity") || fallback.valueUnitQuantity,
  };
}

const emptyCategoryDraft: CategoryDraft = {
  id: "",
  name: "",
  parentId: "",
};

const emptyItemSupplierDraft: ItemSupplierDraft = {
  excludedSupplierIds: [],
  item: null,
  search: "",
  suppliers: [],
  selectedSupplier: null,
  price: "",
  conversionToBase: "1,00000",
  useConversion: false,
};

const emptyItemOfferDraft: ItemOfferDraft = {
  conversionToBase: "1,00000",
  offerId: "",
  price: "",
  supplierId: "",
  useConversion: false,
};

const noopAction: RegistryAction = async (state) => state;

export function SuppliedItemsCatalog({
  addSupplierToSuppliedItemAction,
  catalog,
  initialState,
  lookupFuelSupplierOptionsAction,
  lookupSuppliedItemOfferSupplierIdsAction,
  lookupSuppliedItemOffersAction,
  removeSuppliedItemAction,
  removeSuppliedItemCategoryAction,
  saveSupplierOfferAction,
  saveSuppliedItemAction,
  saveSuppliedItemCategoryAction,
}: {
  addSupplierToSuppliedItemAction: RegistryAction;
  catalog: CatalogOptions;
  initialState: RegistryActionState;
  lookupFuelSupplierOptionsAction: SupplierLookupAction;
  lookupSuppliedItemOfferSupplierIdsAction: ItemOfferSupplierIdsLookupAction;
  lookupSuppliedItemOffersAction: ItemOffersLookupAction;
  removeSuppliedItemAction: RegistryAction;
  removeSuppliedItemCategoryAction: RegistryAction;
  saveSupplierOfferAction: RegistryAction;
  saveSuppliedItemAction: RegistryAction;
  saveSuppliedItemCategoryAction: RegistryAction;
}) {
  const catalogItems = useMemo(
    () =>
      catalog.catalogItems ??
      catalog.items.map(
        (item): SuppliedItemCatalogItem => ({
          id: item.id,
          name: item.name,
          categoryId: item.categoryId ?? null,
          baseUnitId: item.baseUnitId,
          baseUnit:
            catalog.units.find((unit) => unit.id === item.baseUnitId) ?? null,
          valueUnitQuantity: item.valueUnitQuantity ?? "1.000000",
          basePrice: item.basePrice ?? "0.0000",
          isActive: true,
          effectiveActive: true,
          kind: "material",
          activeSupplierCount: 0,
          spentQuantity: null,
          lastSpentAt: null,
          updatedAt: "",
        }),
      ),
    [catalog.catalogItems, catalog.items, catalog.units],
  );
  const categories = catalog.categories ?? [];
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<"active" | "inactive">(
    "active",
  );
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isItemSupplierModalOpen, setIsItemSupplierModalOpen] = useState(false);
  const [isItemOffersModalOpen, setIsItemOffersModalOpen] = useState(false);
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [itemActionId, setItemActionId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft>({
    ...emptyItemDraft,
    baseUnitId: preferredItemUnitId(catalog.units),
  });
  const [categoryDraft, setCategoryDraft] =
    useState<CategoryDraft>(emptyCategoryDraft);
  const [itemSupplierDraft, setItemSupplierDraft] = useState<ItemSupplierDraft>(
    emptyItemSupplierDraft,
  );
  const [itemOffersTarget, setItemOffersTarget] =
    useState<SuppliedItemCatalogItem | null>(null);
  const [itemOffers, setItemOffers] = useState<SuppliedItemOfferDetail[]>([]);
  const [itemOffersPageInfo, setItemOffersPageInfo] = useState<{
    hasNextPage: boolean;
    nextCursor: string | null;
  } | null>(null);
  const [itemOfferDraft, setItemOfferDraft] =
    useState<ItemOfferDraft>(emptyItemOfferDraft);
  const [isPropagationModalOpen, setIsPropagationModalOpen] = useState(false);
  const [pendingItemFields, setPendingItemFields] = useState<
    [string, string][]
  >([]);
  const [otherOfferCount, setOtherOfferCount] = useState(0);
  const [isSupplierEligibilityPending, setIsSupplierEligibilityPending] =
    useState(false);
  const [isSupplierSearchPending, startSupplierSearch] = React.useTransition();
  const [isOffersPending, startOffersTransition] = React.useTransition();

  const handleSaveItemAction = useCallback<RegistryAction>(
    async (state, formData) => {
      const submittedDraft = itemDraftFromFormData(formData, itemDraft);
      const result = await saveSuppliedItemAction(state, formData);
      if (result.ok && result.message) {
        setIsItemModalOpen(false);
        setIsPropagationModalOpen(false);
        setPendingItemFields([]);
        setOtherOfferCount(0);
      } else {
        setItemDraft(submittedDraft);
      }
      return result;
    },
    [itemDraft, saveSuppliedItemAction],
  );
  const handleSaveCategoryAction = useCallback<RegistryAction>(
    async (state, formData) => {
      const result = await saveSuppliedItemCategoryAction(state, formData);
      if (result.ok && result.message) setIsCategoryModalOpen(false);
      return result;
    },
    [saveSuppliedItemCategoryAction],
  );
  const handleAddSupplierAction = useCallback<RegistryAction>(
    async (state, formData) => {
      const result = await addSupplierToSuppliedItemAction(state, formData);
      if (result.ok && result.message) {
        setIsItemSupplierModalOpen(false);
        setItemSupplierDraft(emptyItemSupplierDraft);
      }
      return result;
    },
    [addSupplierToSuppliedItemAction],
  );
  const loadItemOffers = useCallback(
    async (itemId: string, cursor?: string | null) => {
      const page = await lookupSuppliedItemOffersAction({ cursor, itemId });
      setItemOffers((current) =>
        cursor ? [...current, ...page.data] : page.data,
      );
      setItemOffersPageInfo(page.pageInfo);
    },
    [lookupSuppliedItemOffersAction],
  );
  const handleSaveItemOfferAction = useCallback<RegistryAction>(
    async (state, formData) => {
      const result = await saveSupplierOfferAction(state, formData);
      if (result.ok && result.message) {
        setItemOfferDraft(emptyItemOfferDraft);
        if (itemOffersTarget) await loadItemOffers(itemOffersTarget.id);
      }
      return result;
    },
    [itemOffersTarget, loadItemOffers, saveSupplierOfferAction],
  );
  const [saveItemState, saveItemFormAction] = useActionState(
    handleSaveItemAction,
    initialState,
  );
  const [removeItemState, removeItemFormAction] = useActionState(
    removeSuppliedItemAction ?? noopAction,
    initialState,
  );
  const [saveCategoryState, saveCategoryFormAction] = useActionState(
    handleSaveCategoryAction,
    initialState,
  );
  const [removeCategoryState, removeCategoryFormAction] = useActionState(
    removeSuppliedItemCategoryAction ?? noopAction,
    initialState,
  );
  const [addSupplierState, addSupplierFormAction] = useActionState(
    handleAddSupplierAction,
    initialState,
  );
  const [saveItemOfferState, saveItemOfferFormAction] = useActionState(
    handleSaveItemOfferAction,
    initialState,
  );
  useActionNotification(saveItemState);
  useActionNotification(removeItemState);
  useActionNotification(saveCategoryState);
  useActionNotification(removeCategoryState);
  useActionNotification(addSupplierState);
  useActionNotification(saveItemOfferState);

  const searchSuppliers = useCallback(
    (search: string, excludedSupplierIds?: string[]) => {
      startSupplierSearch(() => {
        void lookupFuelSupplierOptionsAction(search).then((suppliers) => {
          setItemSupplierDraft((current) => ({
            ...current,
            suppliers: suppliers.filter(
              (supplier) =>
                !(excludedSupplierIds ?? current.excludedSupplierIds).includes(
                  supplier.id,
                ),
            ),
          }));
        });
      });
    },
    [lookupFuelSupplierOptionsAction],
  );

  const openItemModal = useCallback(
    (item: SuppliedItemCatalogItem | null, categoryId = "") => {
      setItemActionId(null);
      setItemDraft(
        item
          ? {
              id: item.id,
              name: item.name,
              categoryId: item.categoryId ?? "",
              baseUnitId: item.baseUnitId,
              basePrice: canonicalDecimalToBrazilian(item.basePrice, 4),
              useValueUnit: item.valueUnitQuantity !== "1.000000",
              valueUnitQuantity: canonicalDecimalToBrazilian(
                item.valueUnitQuantity,
                6,
              ),
            }
          : {
              ...emptyItemDraft,
              categoryId,
              baseUnitId: preferredItemUnitId(catalog.units),
            },
      );
      setIsItemModalOpen(true);
    },
    [catalog.units],
  );

  const openCategoryModal = useCallback(
    (category: SuppliedItemCategory | null, parentId = "") => {
      setCategoryDraft(
        category
          ? {
              id: category.id,
              name: category.name,
              parentId: category.parentId ?? "",
            }
          : {
              ...emptyCategoryDraft,
              parentId,
            },
      );
      setIsCategoryModalOpen(true);
    },
    [],
  );

  const openItemSupplierModal = useCallback(
    (item: SuppliedItemCatalogItem) => {
      setItemActionId(null);
      setItemSupplierDraft({
        ...emptyItemSupplierDraft,
        item,
        price: canonicalDecimalToBrazilian(item.basePrice, 4),
        conversionToBase: canonicalDecimalToBrazilian(
          item.valueUnitQuantity,
          5,
        ),
        useConversion: false,
      });
      setIsItemSupplierModalOpen(true);
      setIsSupplierEligibilityPending(true);
      void lookupSuppliedItemOfferSupplierIdsAction(item.id)
        .then((excludedSupplierIds) => {
          setItemSupplierDraft((current) => {
            if (current.item?.id !== item.id) return current;
            return {
              ...current,
              excludedSupplierIds,
              suppliers: current.suppliers.filter(
                (supplier) => !excludedSupplierIds.includes(supplier.id),
              ),
            };
          });
          searchSuppliers("", excludedSupplierIds);
        })
        .catch(() => {
          toast.error(
            "Não foi possível verificar fornecedores já vinculados ao item.",
          );
          searchSuppliers("");
        })
        .finally(() => {
          setIsSupplierEligibilityPending(false);
        });
    },
    [lookupSuppliedItemOfferSupplierIdsAction, searchSuppliers],
  );

  const openItemOffersModal = useCallback(
    (item: SuppliedItemCatalogItem) => {
      setItemActionId(null);
      setItemOffersTarget(item);
      setItemOffers([]);
      setItemOffersPageInfo(null);
      setItemOfferDraft(emptyItemOfferDraft);
      setIsItemOffersModalOpen(true);
      startOffersTransition(() => {
        void loadItemOffers(item.id).catch(() => {
          toast.error("Não foi possível carregar as ofertas deste item.");
        });
      });
    },
    [loadItemOffers],
  );

  const editItemOffer = (offer: SuppliedItemOfferDetail) => {
    setItemOfferDraft({
      conversionToBase: canonicalDecimalToBrazilian(offer.conversionToBase, 5),
      offerId: offer.id,
      price: offer.currentPrice
        ? canonicalDecimalToBrazilian(offer.currentPrice.price, 4)
        : "",
      supplierId: offer.supplier.id,
      useConversion: offer.conversionToBase !== "1.000000",
    });
  };

  const stringFieldsFromForm = (formData: FormData): [string, string][] => {
    return Array.from(formData.entries())
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .map(([key, value]) => [key, value]);
  };

  const hasChangedItemMirrorValues = (
    item: SuppliedItemCatalogItem,
    draft: ItemDraft,
  ) => {
    const nextBasePrice = decimalInputToCanonicalFixed(draft.basePrice, 4, 4);
    const nextValueUnitQuantity = draft.useValueUnit
      ? decimalInputToCanonicalFixed(draft.valueUnitQuantity, 6, 6)
      : "1.000000";
    if (!nextBasePrice || !nextValueUnitQuantity) return false;
    return (
      nextBasePrice !== item.basePrice ||
      nextValueUnitQuantity !== item.valueUnitQuantity
    );
  };

  const handleItemSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    const formData = new FormData(event.currentTarget);
    const submittedDraft = itemDraftFromFormData(formData, itemDraft);
    setItemDraft(submittedDraft);
    const item = catalogItems.find(
      (catalogItem) => catalogItem.id === submittedDraft.id,
    );
    if (
      !item ||
      item.activeSupplierCount === 0 ||
      !hasChangedItemMirrorValues(item, submittedDraft)
    ) {
      return;
    }
    event.preventDefault();
    setOtherOfferCount(item.activeSupplierCount);
    setPendingItemFields(stringFieldsFromForm(formData));
    setIsPropagationModalOpen(true);
  };

  const loadMoreItemOffers = () => {
    if (!itemOffersTarget || !itemOffersPageInfo?.nextCursor) return;
    startOffersTransition(() => {
      void loadItemOffers(
        itemOffersTarget.id,
        itemOffersPageInfo.nextCursor,
      ).catch(() => {
        toast.error("Não foi possível carregar mais ofertas deste item.");
      });
    });
  };

  const toggleCategory = (categoryId: string) => {
    setOpenCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
        if (activeCategoryId === categoryId) setActiveCategoryId(null);
      } else {
        next.add(categoryId);
        setActiveCategoryId(categoryId);
      }
      return next;
    });
  };

  const isEditingItemOffer = Boolean(itemOfferDraft.offerId);
  const visibleItemOffers = isEditingItemOffer
    ? itemOffers.filter((offer) => offer.id === itemOfferDraft.offerId)
    : itemOffers;
  const visibleCatalogItems = catalogItems.filter((item) =>
    catalogStatus === "active" ? item.effectiveActive : !item.effectiveActive,
  );
  const visibleCategories =
    catalogStatus === "active"
      ? categories.filter((category) => category.effectiveActive)
      : categories;

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-secondary/60 px-5 py-4">
        <h2 className="text-lg font-bold">Itens fornecidos</h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Organize o catálogo global de itens e vincule fornecedores às ofertas.
        </p>
      </div>

      <div className="grid gap-4 px-5 py-4">
        <div className="flex justify-end gap-2" aria-label="Filtrar catálogo">
          <Button
            type="button"
            size="sm"
            variant={catalogStatus === "active" ? "default" : "outline"}
            onClick={() => setCatalogStatus("active")}
          >
            Ativos
          </Button>
          <Button
            type="button"
            size="sm"
            variant={catalogStatus === "inactive" ? "default" : "outline"}
            onClick={() => setCatalogStatus("inactive")}
          >
            Inativos
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-primary/35 bg-primary/[0.035] p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold">Ações da raiz</p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Para criar dentro de uma categoria, abra o card dela e use as
              ações internas.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => openItemModal(null, "")}>
              <Plus className="size-4" />
              Criar item
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openCategoryModal(null, "")}
            >
              <FolderPlus className="size-4" />
              Criar categoria
            </Button>
          </div>
        </div>

        {visibleCatalogItems.length > 0 || visibleCategories.length > 0 ? (
          <CatalogTree
            activeCategoryId={activeCategoryId}
            categories={visibleCategories}
            items={visibleCatalogItems}
            itemActionId={itemActionId}
            onAddSupplier={openItemSupplierModal}
            onCreateItem={(categoryId) => openItemModal(null, categoryId)}
            onCreateSubcategory={(parentId) =>
              openCategoryModal(null, parentId)
            }
            onEditCategory={openCategoryModal}
            onEditItem={openItemModal}
            onItemActionChange={setItemActionId}
            onRemoveCategory={removeCategoryFormAction}
            onRemoveItem={removeItemFormAction}
            onViewOffers={openItemOffersModal}
            onToggleCategory={toggleCategory}
            openCategoryIds={openCategoryIds}
          />
        ) : (
          <div className="rounded-md border border-dashed border-border px-5 py-10 text-center">
            <PackagePlus className="mx-auto size-9 text-primary" />
            <p className="mt-3 text-base font-bold">
              Nenhum item fornecido cadastrado
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Crie itens na raiz ou organize por categorias antes de vincular
              ofertas de fornecedores.
            </p>
          </div>
        )}
      </div>

      <OperationsModal
        icon={PackagePlus}
        open={isItemModalOpen}
        onOpenChange={setIsItemModalOpen}
        size="lg"
        title={itemDraft.id ? "Editar item" : "Novo item"}
        description="Cadastre o item global da empresa com unidade de medida e preço base."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsItemModalOpen(false)}
            >
              Cancelar
            </Button>
            <SaveItemButton formId="supplied-item-form" />
          </>
        }
      >
        <form
          id="supplied-item-form"
          action={saveItemFormAction}
          onSubmit={handleItemSubmit}
          className="grid gap-4"
        >
          {itemDraft.id && (
            <input type="hidden" name="itemId" value={itemDraft.id} />
          )}
          <FormSection
            title="Dados do item"
            description="O item fica disponível para as ofertas de todos os fornecedores desta empresa."
          >
            <Field
              label="Nome"
              name="name"
              required
              value={itemDraft.name}
              onChange={(event) =>
                setItemDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              maxLength={160}
              placeholder="Ex.: Diesel S10"
            />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Categoria</span>
              <select
                name="categoryId"
                value={itemDraft.categoryId}
                onChange={(event) =>
                  setItemDraft((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <option value="">Sem categoria</option>
                {categories
                  .filter((category) => category.effectiveActive)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.kind === "fuel" ? "Combustíveis / " : ""}
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold">
                <span>Unidade de medida</span>
                <select
                  name="baseUnitId"
                  value={itemDraft.baseUnitId}
                  ref={(element) => {
                    if (!element) return;
                    for (const option of element.options) {
                      option.defaultSelected =
                        option.value === itemDraft.baseUnitId;
                    }
                  }}
                  required
                  onChange={(event) =>
                    setItemDraft((current) => ({
                      ...current,
                      baseUnitId: event.target.value,
                    }))
                  }
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  {catalog.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} - {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                <span>Preço base</span>
                <Input
                  name="basePrice"
                  value={itemDraft.basePrice}
                  inputMode="numeric"
                  onChange={(event) =>
                    setItemDraft((current) => ({
                      ...current,
                      basePrice: formatBrazilianDecimalInput(
                        event.target.value,
                        4,
                      ),
                    }))
                  }
                  placeholder="0,0000"
                  className="min-h-11"
                />
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm font-semibold">
              <input
                type="checkbox"
                name="useValueUnit"
                checked={itemDraft.useValueUnit}
                onChange={(event) =>
                  setItemDraft((current) => ({
                    ...current,
                    useValueUnit: event.target.checked,
                  }))
                }
                className="size-4 accent-primary"
              />
              Informar unidade de valor
            </label>
            {itemDraft.useValueUnit && (
              <label className="grid gap-1.5 text-sm font-semibold">
                <span>Unidade de valor</span>
                <Input
                  name="valueUnitQuantity"
                  value={itemDraft.valueUnitQuantity}
                  inputMode="numeric"
                  onChange={(event) =>
                    setItemDraft((current) => ({
                      ...current,
                      valueUnitQuantity: formatBrazilianDecimalInput(
                        event.target.value,
                        6,
                      ),
                    }))
                  }
                  placeholder="1,000000"
                  className="min-h-11"
                />
              </label>
            )}
          </FormSection>

          {!saveItemState.ok && saveItemState.message && (
            <FormErrorDeclaration
              title="Não foi possível salvar o item."
              description="Revise nome, unidade de medida e valores antes de tentar novamente."
              issues={[{ location: "API", message: saveItemState.message }]}
            />
          )}
        </form>
      </OperationsModal>

      <OperationsModal
        icon={FolderPlus}
        open={isCategoryModalOpen}
        onOpenChange={setIsCategoryModalOpen}
        size="md"
        title={categoryDraft.id ? "Editar categoria" : "Nova categoria"}
        description="Organize os itens em categorias e subcategorias com até 3 níveis."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCategoryModalOpen(false)}
            >
              Cancelar
            </Button>
            <SaveCategoryButton formId="supplied-item-category-form" />
          </>
        }
      >
        <form
          id="supplied-item-category-form"
          action={saveCategoryFormAction}
          className="grid gap-4"
        >
          {categoryDraft.id && (
            <input type="hidden" name="categoryId" value={categoryDraft.id} />
          )}
          <FormSection title="Categoria">
            <Field
              label="Nome"
              name="name"
              required
              value={categoryDraft.name}
              onChange={(event) =>
                setCategoryDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              maxLength={120}
              placeholder="Ex.: Combustíveis"
            />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Categoria pai</span>
              <select
                name="parentId"
                value={categoryDraft.parentId}
                onChange={(event) =>
                  setCategoryDraft((current) => ({
                    ...current,
                    parentId: event.target.value,
                  }))
                }
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <option value="">Categoria raiz</option>
                {categories
                  .filter(
                    (category) =>
                      category.effectiveActive &&
                      category.id !== categoryDraft.id &&
                      (!categoryDraft.id ||
                        !isCategoryDescendantOf(
                          categories,
                          category.id,
                          categoryDraft.id,
                        )),
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.kind === "fuel" ? "Combustíveis / " : ""}
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
          </FormSection>

          {!saveCategoryState.ok && saveCategoryState.message && (
            <FormErrorDeclaration
              title="Não foi possível salvar a categoria."
              description="Revise o nome e a profundidade da categoria."
              issues={[{ location: "API", message: saveCategoryState.message }]}
            />
          )}
        </form>
      </OperationsModal>

      <OperationsModal
        icon={PackagePlus}
        open={isItemSupplierModalOpen}
        onOpenChange={(open) => {
          setIsItemSupplierModalOpen(open);
          if (!open) setItemSupplierDraft(emptyItemSupplierDraft);
        }}
        size="lg"
        title="Adicionar fornecedor"
        description="Escolha um fornecedor ativo e confirme a oferta deste item."
        footer={
          itemSupplierDraft.selectedSupplier ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setItemSupplierDraft((current) => ({
                    ...current,
                    selectedSupplier: null,
                  }))
                }
              >
                Voltar
              </Button>
              <SaveItemSupplierButton formId="supplied-item-supplier-form" />
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsItemSupplierModalOpen(false)}
            >
              Cancelar
            </Button>
          )
        }
      >
        {itemSupplierDraft.selectedSupplier && itemSupplierDraft.item ? (
          <form
            id="supplied-item-supplier-form"
            action={addSupplierFormAction}
            className="grid gap-4"
          >
            <input
              type="hidden"
              name="itemId"
              value={itemSupplierDraft.item.id}
            />
            <input
              type="hidden"
              name="supplierId"
              value={itemSupplierDraft.selectedSupplier.id}
            />
            <FormSection
              title="Confirmar oferta"
              description="Os valores iniciam pelo item e podem ser ajustados só para esta oferta."
            >
              <div className="grid gap-3 rounded-md border border-primary/35 bg-primary/[0.035] p-3 text-sm font-semibold">
                <p>{itemSupplierDraft.item.name}</p>
                <p className="text-muted-foreground">
                  {itemSupplierDraft.selectedSupplier.name}
                </p>
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-sm font-semibold">
                  <span>Preço vigente</span>
                  <Input
                    name="price"
                    value={itemSupplierDraft.price}
                    inputMode="numeric"
                    onChange={(event) =>
                      setItemSupplierDraft((current) => ({
                        ...current,
                        price: formatBrazilianDecimalInput(
                          event.target.value,
                          4,
                        ),
                      }))
                    }
                    placeholder="0,0000"
                    className="min-h-11"
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={itemSupplierDraft.useConversion}
                    onChange={(event) =>
                      setItemSupplierDraft((current) => ({
                        ...current,
                        useConversion: event.target.checked,
                      }))
                    }
                    className="size-4 accent-primary"
                  />
                  Informar quantidade
                </label>
                {!itemSupplierDraft.useConversion && (
                  <input
                    type="hidden"
                    name="conversionToBase"
                    value={itemSupplierDraft.conversionToBase}
                  />
                )}
                {itemSupplierDraft.useConversion && (
                  <label className="grid gap-1.5 text-sm font-semibold">
                    <span>Quantidade</span>
                    <Input
                      name="conversionToBase"
                      value={itemSupplierDraft.conversionToBase}
                      inputMode="numeric"
                      onChange={(event) =>
                        setItemSupplierDraft((current) => ({
                          ...current,
                          conversionToBase: formatBrazilianDecimalInput(
                            event.target.value,
                            5,
                          ),
                        }))
                      }
                      placeholder="1,00000"
                      className="min-h-11"
                    />
                  </label>
                )}
              </div>
            </FormSection>

            {!addSupplierState.ok && addSupplierState.message && (
              <FormErrorDeclaration
                title="Não foi possível vincular o fornecedor."
                description="Revise o fornecedor e os valores antes de tentar novamente."
                issues={[
                  { location: "API", message: addSupplierState.message },
                ]}
              />
            )}
          </form>
        ) : (
          <div className="grid gap-4">
            <FormSection
              title="Selecionar fornecedor"
              description="Busque fornecedores ativos desta empresa por nome."
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="grid gap-1.5 text-sm font-semibold">
                  <span>Fornecedor</span>
                  <Input
                    value={itemSupplierDraft.search}
                    onChange={(event) =>
                      setItemSupplierDraft((current) => ({
                        ...current,
                        search: event.target.value,
                      }))
                    }
                    placeholder="Buscar por nome do fornecedor"
                    className="min-h-11"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="self-end"
                  disabled={
                    isSupplierEligibilityPending || isSupplierSearchPending
                  }
                  onClick={() => searchSuppliers(itemSupplierDraft.search)}
                >
                  <Search className="size-4" />
                  {isSupplierEligibilityPending || isSupplierSearchPending
                    ? "Buscando"
                    : "Buscar"}
                </Button>
              </div>
              <div className="grid gap-2">
                {itemSupplierDraft.suppliers.map((supplier) => (
                  <button
                    key={supplier.id}
                    type="button"
                    className="rounded-md border border-border bg-background px-3 py-3 text-left outline-none transition-colors hover:border-primary/50 hover:bg-primary/[0.035] focus-visible:ring-3 focus-visible:ring-ring/30"
                    onClick={() =>
                      setItemSupplierDraft((current) => ({
                        ...current,
                        selectedSupplier: supplier,
                      }))
                    }
                  >
                    <span className="block text-sm font-bold">
                      {supplier.name}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                      {supplier.tradeName ? `${supplier.tradeName} · ` : ""}
                      {supplier.document.documentType}{" "}
                      {supplier.document.maskedDocument}
                    </span>
                  </button>
                ))}
                {itemSupplierDraft.suppliers.length === 0 && (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm font-semibold text-muted-foreground">
                    {isSupplierEligibilityPending || isSupplierSearchPending
                      ? "Buscando fornecedores..."
                      : "Nenhum fornecedor ativo encontrado."}
                  </p>
                )}
              </div>
            </FormSection>
          </div>
        )}
      </OperationsModal>

      <OperationsModal
        icon={Eye}
        open={isItemOffersModalOpen}
        onOpenChange={setIsItemOffersModalOpen}
        size="xl"
        title="Ofertas do item"
        description={
          itemOffersTarget
            ? `Fornecedores ativos que oferecem ${itemOffersTarget.name}.`
            : "Fornecedores ativos vinculados ao item."
        }
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsItemOffersModalOpen(false)}
          >
            Fechar
          </Button>
        }
      >
        <div className="grid gap-3">
          {isOffersPending && !itemOffersPageInfo ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm font-semibold text-muted-foreground">
              Carregando ofertas...
            </div>
          ) : itemOffers.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
              <PackagePlus className="mx-auto size-8 text-primary" />
              <p className="mt-3 text-sm font-bold">
                Nenhuma oferta ativa para este item
              </p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Use Adicionar fornecedor para criar a primeira oferta.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {visibleItemOffers.map((offer) => {
                const isEditing = itemOfferDraft.offerId === offer.id;
                return (
                  <div
                    key={offer.id}
                    className="rounded-md border border-border bg-background"
                  >
                    <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(8rem,0.7fr))_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {offer.supplier.name}
                        </p>
                        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                          {offer.supplier.tradeName
                            ? `${offer.supplier.tradeName} · `
                            : ""}
                          {offer.supplier.document.documentType}{" "}
                          {offer.supplier.document.maskedDocument}
                        </p>
                      </div>
                      <Metric
                        label="Unidade"
                        value={
                          offer.baseUnit
                            ? `${offer.baseUnit.code} - ${offer.baseUnit.name}`
                            : "Não informada"
                        }
                      />
                      <Metric
                        label="Quantidade"
                        value={canonicalDecimalToBrazilian(
                          offer.conversionToBase,
                          5,
                        )}
                      />
                      <Metric
                        label="Preço vigente"
                        value={
                          offer.currentPrice
                            ? formatCurrency(offer.currentPrice.price)
                            : "Sem preço"
                        }
                      />
                      {isEditing ? (
                        <span className="text-right text-xs font-bold text-muted-foreground">
                          Em edição
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => editItemOffer(offer)}
                        >
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                      )}
                    </div>
                    {isEditing && (
                      <form
                        action={saveItemOfferFormAction}
                        className="grid gap-3 border-t border-border bg-secondary/30 px-3 py-3"
                      >
                        <input
                          type="hidden"
                          name="supplierId"
                          value={itemOfferDraft.supplierId}
                        />
                        <input
                          type="hidden"
                          name="offerId"
                          value={itemOfferDraft.offerId}
                        />
                        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                          <label className="grid gap-1.5 text-sm font-semibold">
                            <span>Preço vigente</span>
                            <Input
                              name="price"
                              value={itemOfferDraft.price}
                              inputMode="numeric"
                              onChange={(event) =>
                                setItemOfferDraft((current) => ({
                                  ...current,
                                  price: formatBrazilianDecimalInput(
                                    event.target.value,
                                    4,
                                  ),
                                }))
                              }
                              placeholder="0,0000"
                              className="min-h-11"
                            />
                          </label>
                          <Button type="submit">
                            <PackagePlus className="size-4" />
                            Salvar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setItemOfferDraft(emptyItemOfferDraft)
                            }
                          >
                            Cancelar
                          </Button>
                        </div>
                        <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={itemOfferDraft.useConversion}
                            onChange={(event) =>
                              setItemOfferDraft((current) => ({
                                ...current,
                                useConversion: event.target.checked,
                                conversionToBase: event.target.checked
                                  ? current.conversionToBase
                                  : "1,00000",
                              }))
                            }
                            className="size-4 accent-primary"
                          />
                          Informar quantidade
                        </label>
                        {!itemOfferDraft.useConversion && (
                          <input
                            type="hidden"
                            name="conversionToBase"
                            value="1,00000"
                          />
                        )}
                        {itemOfferDraft.useConversion && (
                          <label className="grid gap-1.5 text-sm font-semibold">
                            <span>Quantidade</span>
                            <Input
                              name="conversionToBase"
                              value={itemOfferDraft.conversionToBase}
                              inputMode="numeric"
                              onChange={(event) =>
                                setItemOfferDraft((current) => ({
                                  ...current,
                                  conversionToBase: formatBrazilianDecimalInput(
                                    event.target.value,
                                    5,
                                  ),
                                }))
                              }
                              placeholder="1,00000"
                              className="min-h-11"
                            />
                          </label>
                        )}
                        {!saveItemOfferState.ok &&
                          saveItemOfferState.message && (
                            <FormErrorDeclaration
                              title="Não foi possível salvar a oferta."
                              description="Revise preço e quantidade antes de tentar novamente."
                              issues={[
                                {
                                  location: "API",
                                  message: saveItemOfferState.message,
                                },
                              ]}
                            />
                          )}
                      </form>
                    )}
                  </div>
                );
              })}
              {!isEditingItemOffer && itemOffersPageInfo?.nextCursor && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isOffersPending}
                  onClick={loadMoreItemOffers}
                >
                  {isOffersPending ? "Carregando" : "Carregar mais ofertas"}
                </Button>
              )}
            </div>
          )}
        </div>
      </OperationsModal>

      <OperationsModal
        icon={PackagePlus}
        open={isPropagationModalOpen}
        onOpenChange={setIsPropagationModalOpen}
        size="md"
        title="Propagar valores do item?"
        description={`Este item possui ${otherOfferCount} oferta${otherOfferCount === 1 ? "" : "s"} ativa${otherOfferCount === 1 ? "" : "s"}.`}
        footer={
          <>
            <form action={saveItemFormAction}>
              {pendingItemFields.map(([key, value], index) => (
                <input
                  key={`${key}-${index}`}
                  type="hidden"
                  name={key}
                  value={value}
                />
              ))}
              <Button type="submit" variant="outline">
                Salvar só o item
              </Button>
            </form>
            <form action={saveItemFormAction}>
              {pendingItemFields.map(([key, value], index) => (
                <input
                  key={`${key}-${index}`}
                  type="hidden"
                  name={key}
                  value={value}
                />
              ))}
              <input
                type="hidden"
                name="propagateMirrorToExistingOffers"
                value="on"
              />
              <Button type="submit">Propagar para ofertas</Button>
            </form>
          </>
        }
      >
        <p className="text-sm font-medium text-muted-foreground">
          Escolha se preço base e unidade de valor devem atualizar também as
          ofertas ativas deste item, ou apenas os valores espelho do item.
        </p>
      </OperationsModal>
    </section>
  );
}

function CatalogTree({
  activeCategoryId,
  categories,
  items,
  itemActionId,
  onAddSupplier,
  onCreateItem,
  onCreateSubcategory,
  onEditCategory,
  onEditItem,
  onItemActionChange,
  onRemoveCategory,
  onRemoveItem,
  onToggleCategory,
  onViewOffers,
  openCategoryIds,
}: {
  activeCategoryId: string | null;
  categories: SuppliedItemCategory[];
  items: SuppliedItemCatalogItem[];
  itemActionId: string | null;
  onAddSupplier: (item: SuppliedItemCatalogItem) => void;
  onCreateItem: (categoryId: string) => void;
  onCreateSubcategory: (parentId: string) => void;
  onEditCategory: (category: SuppliedItemCategory) => void;
  onEditItem: (item: SuppliedItemCatalogItem) => void;
  onItemActionChange: (itemId: string | null) => void;
  onRemoveCategory: FormAction;
  onRemoveItem: FormAction;
  onToggleCategory: (categoryId: string) => void;
  onViewOffers: (item: SuppliedItemCatalogItem) => void;
  openCategoryIds: Set<string>;
}) {
  return (
    <div className="grid gap-2">
      <CatalogLevel
        activeCategoryId={activeCategoryId}
        categories={categories}
        depth={0}
        itemActionId={itemActionId}
        items={items}
        onAddSupplier={onAddSupplier}
        onCreateItem={onCreateItem}
        onCreateSubcategory={onCreateSubcategory}
        onEditCategory={onEditCategory}
        onEditItem={onEditItem}
        onItemActionChange={onItemActionChange}
        onRemoveCategory={onRemoveCategory}
        onRemoveItem={onRemoveItem}
        onToggleCategory={onToggleCategory}
        onViewOffers={onViewOffers}
        openCategoryIds={openCategoryIds}
        parentId={null}
      />
    </div>
  );
}

function CatalogLevel({
  activeCategoryId,
  categories,
  depth,
  itemActionId,
  items,
  onAddSupplier,
  onCreateItem,
  onCreateSubcategory,
  onEditCategory,
  onEditItem,
  onItemActionChange,
  onRemoveCategory,
  onRemoveItem,
  onToggleCategory,
  onViewOffers,
  openCategoryIds,
  parentId,
}: {
  activeCategoryId: string | null;
  categories: SuppliedItemCategory[];
  depth: number;
  itemActionId: string | null;
  items: SuppliedItemCatalogItem[];
  onAddSupplier: (item: SuppliedItemCatalogItem) => void;
  onCreateItem: (categoryId: string) => void;
  onCreateSubcategory: (parentId: string) => void;
  onEditCategory: (category: SuppliedItemCategory) => void;
  onEditItem: (item: SuppliedItemCatalogItem) => void;
  onItemActionChange: (itemId: string | null) => void;
  onRemoveCategory: FormAction;
  onRemoveItem: FormAction;
  onToggleCategory: (categoryId: string) => void;
  onViewOffers: (item: SuppliedItemCatalogItem) => void;
  openCategoryIds: Set<string>;
  parentId: string | null;
}) {
  const childCategories = categories.filter(
    (category) => category.parentId === parentId,
  );
  const levelItems = items.filter((item) => item.categoryId === parentId);

  return (
    <div className="grid gap-2">
      {childCategories.map((category) => {
        const isOpen = openCategoryIds.has(category.id);
        const isActive = activeCategoryId === category.id;
        const canCreateSubcategory = depth < 3;
        return (
          <div
            key={category.id}
            className={
              isActive
                ? "rounded-md border border-primary/35 bg-primary/[0.035]"
                : "rounded-md border border-border bg-background"
            }
          >
            <div className="flex min-h-11 items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                onClick={() => onToggleCategory(category.id)}
              >
                {isOpen ? (
                  <ChevronDown className="size-4 shrink-0 text-primary" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-primary" />
                )}
                <span className="truncate">{category.name}</span>
              </button>
              {category.systemKey === "fuel" && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  <LockKeyhole className="size-3" />
                  Categoria fixa
                </span>
              )}
              {!category.effectiveActive && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                  Inativa
                </span>
              )}
              {category.systemKey !== "fuel" && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onEditCategory(category)}
                  >
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                  {(category.isActive || !category.effectiveActive) &&
                    !(category.isActive && !category.effectiveActive) && (
                      <form action={onRemoveCategory}>
                        <input
                          type="hidden"
                          name="categoryId"
                          value={category.id}
                        />
                        <input
                          type="hidden"
                          name="isActive"
                          value={category.isActive ? "false" : "true"}
                        />
                        <RemoveCategoryButton activate={!category.isActive} />
                      </form>
                    )}
                </>
              )}
            </div>
            {isOpen && (
              <div className="grid gap-2 border-t border-border px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!category.effectiveActive}
                    onClick={() => onCreateItem(category.id)}
                  >
                    <Plus className="size-4" />
                    Adicionar item
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !canCreateSubcategory || !category.effectiveActive
                    }
                    onClick={() => onCreateSubcategory(category.id)}
                  >
                    <FolderPlus className="size-4" />
                    Criar subcategoria
                  </Button>
                </div>
                <CatalogLevel
                  activeCategoryId={activeCategoryId}
                  categories={categories}
                  depth={depth + 1}
                  itemActionId={itemActionId}
                  items={items}
                  onAddSupplier={onAddSupplier}
                  onCreateItem={onCreateItem}
                  onCreateSubcategory={onCreateSubcategory}
                  onEditCategory={onEditCategory}
                  onEditItem={onEditItem}
                  onItemActionChange={onItemActionChange}
                  onRemoveCategory={onRemoveCategory}
                  onRemoveItem={onRemoveItem}
                  onToggleCategory={onToggleCategory}
                  onViewOffers={onViewOffers}
                  openCategoryIds={openCategoryIds}
                  parentId={category.id}
                />
              </div>
            )}
          </div>
        );
      })}

      {levelItems.map((item) => (
        <CatalogItemRow
          key={item.id}
          item={item}
          isActionOpen={itemActionId === item.id}
          onActionChange={onItemActionChange}
          onAddSupplier={onAddSupplier}
          onEditItem={onEditItem}
          onRemoveItem={onRemoveItem}
          onViewOffers={onViewOffers}
        />
      ))}

      {childCategories.length === 0 && levelItems.length === 0 && depth > 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm font-medium text-muted-foreground">
          Nenhum item nesta categoria.
        </p>
      )}
    </div>
  );
}

function CatalogItemRow({
  isActionOpen,
  item,
  onActionChange,
  onAddSupplier,
  onEditItem,
  onRemoveItem,
  onViewOffers,
}: {
  isActionOpen: boolean;
  item: SuppliedItemCatalogItem;
  onActionChange: (itemId: string | null) => void;
  onAddSupplier: (item: SuppliedItemCatalogItem) => void;
  onEditItem: (item: SuppliedItemCatalogItem) => void;
  onRemoveItem: FormAction;
  onViewOffers: (item: SuppliedItemCatalogItem) => void;
}) {
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(8rem,0.75fr))_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{item.name}</p>
            {!item.effectiveActive && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                Inativo
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {item.baseUnit
              ? `${item.baseUnit.code} - ${item.baseUnit.name}`
              : "Unidade não encontrada"}{" "}
            · Base {formatCurrency(item.basePrice)}
          </p>
        </div>
        <Metric
          label="Fornecedores ativos"
          value={`${item.activeSupplierCount}`}
        />
        <Metric
          label="Quantidade gasta"
          value={item.spentQuantity ?? "Sem consumo"}
        />
        <Metric
          label="Último gasto"
          value={
            item.lastSpentAt ? formatDate(item.lastSpentAt) : "Sem registro"
          }
        />
        <Button
          ref={actionButtonRef}
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Ações de ${item.name}`}
          aria-expanded={isActionOpen}
          aria-haspopup="menu"
          onClick={() => onActionChange(isActionOpen ? null : item.id)}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>
      {isActionOpen && (
        <FloatingItemActionMenu
          anchorRef={actionButtonRef}
          item={item}
          onAddSupplier={onAddSupplier}
          onClose={() => onActionChange(null)}
          onEditItem={onEditItem}
          onRemoveItem={onRemoveItem}
          onViewOffers={onViewOffers}
        />
      )}
    </div>
  );
}

function FloatingItemActionMenu({
  anchorRef,
  item,
  onAddSupplier,
  onClose,
  onEditItem,
  onRemoveItem,
  onViewOffers,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  item: SuppliedItemCatalogItem;
  onAddSupplier: (item: SuppliedItemCatalogItem) => void;
  onClose: () => void;
  onEditItem: (item: SuppliedItemCatalogItem) => void;
  onRemoveItem: FormAction;
  onViewOffers: (item: SuppliedItemCatalogItem) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    placement: "above" | "below";
    top: number;
  } | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 224;
    const estimatedMenuHeight = 196;
    const gutter = 12;
    const belowTop = rect.bottom + 8;
    const opensAbove =
      belowTop + estimatedMenuHeight > window.innerHeight &&
      rect.top > estimatedMenuHeight;

    setPosition({
      left: Math.min(
        window.innerWidth - menuWidth - gutter,
        Math.max(gutter, rect.right - menuWidth),
      ),
      placement: opensAbove ? "above" : "below",
      top: opensAbove ? rect.top - 8 : belowTop,
    });
  }, [anchorRef]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  if (!position) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Ações de ${item.name}`}
      className="fixed z-40 grid w-56 gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-sm ring-1 ring-foreground/10"
      style={{
        left: position.left,
        top: position.top,
        transform:
          position.placement === "above" ? "translateY(-100%)" : undefined,
      }}
    >
      {item.effectiveActive && (
        <>
          <button
            type="button"
            role="menuitem"
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
            onClick={() => {
              onClose();
              onViewOffers(item);
            }}
          >
            <Eye className="size-4 text-primary" />
            Ver ofertas
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
            onClick={() => {
              onClose();
              onAddSupplier(item);
            }}
          >
            <PackagePlus className="size-4 text-primary" />
            Adicionar fornecedor
          </button>
        </>
      )}
      <button
        type="button"
        role="menuitem"
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
        onClick={() => {
          onClose();
          onEditItem(item);
        }}
      >
        <Pencil className="size-4 text-primary" />
        Editar
      </button>
      {!(item.isActive && !item.effectiveActive) && (
        <form action={onRemoveItem}>
          <input type="hidden" name="itemId" value={item.id} />
          <input
            type="hidden"
            name="isActive"
            value={item.isActive ? "false" : "true"}
          />
          <RemoveItemButton
            activate={!item.isActive}
            className="w-full justify-start border-transparent shadow-none hover:bg-red-50"
          />
        </form>
      )}
    </div>,
    document.body,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
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
  const id = `supplied-item-${name}`;
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

function SaveItemButton({ formId }: { formId: string }) {
  const { pending } = useFormStatus();
  return (
    <Button form={formId} type="submit" disabled={pending}>
      <PackagePlus className="size-4" />
      {pending ? "Salvando" : "Salvar item"}
    </Button>
  );
}

function SaveCategoryButton({ formId }: { formId: string }) {
  const { pending } = useFormStatus();
  return (
    <Button form={formId} type="submit" disabled={pending}>
      <FolderPlus className="size-4" />
      {pending ? "Salvando" : "Salvar categoria"}
    </Button>
  );
}

function SaveItemSupplierButton({ formId }: { formId: string }) {
  const { pending } = useFormStatus();
  return (
    <Button form={formId} type="submit" disabled={pending}>
      <PackagePlus className="size-4" />
      {pending ? "Confirmando" : "Confirmar oferta"}
    </Button>
  );
}

function RemoveItemButton({
  activate,
  className,
}: {
  activate: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      disabled={pending}
      role="menuitem"
      className={`${activate ? "border-primary/25 text-primary hover:bg-primary/5" : "border-red-200 text-red-900 hover:bg-red-50"} ${className ?? ""}`}
    >
      {activate ? (
        <RotateCcw className="size-4" />
      ) : (
        <Trash2 className="size-4" />
      )}
      {pending
        ? activate
          ? "Reativando"
          : "Desativando"
        : activate
          ? "Reativar item"
          : "Desativar item"}
    </Button>
  );
}

function RemoveCategoryButton({ activate }: { activate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      disabled={pending}
      className={
        activate
          ? "border-primary/25 text-primary hover:bg-primary/5"
          : "border-red-200 text-red-900 hover:bg-red-50"
      }
    >
      {activate ? (
        <RotateCcw className="size-4" />
      ) : (
        <Trash2 className="size-4" />
      )}
      {pending
        ? activate
          ? "Reativando"
          : "Desativando"
        : activate
          ? "Reativar"
          : "Desativar"}
    </Button>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function formatCurrency(value: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

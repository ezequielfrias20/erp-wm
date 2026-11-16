"use server";

// Acciones de Configuración → Catálogo (plan 3b). Firmas fijas: la interfaz las consume.
// TODO(plan 3b, Task 2): implementar.

import type {
  AttributeInput,
  AttributeValueInput,
  BrandInput,
  CategoryInput,
  ColorInput,
  LineInput,
  MasterResult,
  OptionTypeInput,
  OptionValueInput,
} from "@/lib/catalog/admin-types";

const pending = async (): Promise<MasterResult> => ({ error: "Pendiente de implementar." });

export async function saveColor(_input: ColorInput): Promise<MasterResult> { return pending(); }
export async function deleteColor(_id: string): Promise<MasterResult> { return pending(); }

export async function saveOptionType(_input: OptionTypeInput): Promise<MasterResult> { return pending(); }
export async function deleteOptionType(_id: string): Promise<MasterResult> { return pending(); }
export async function saveOptionValue(_input: OptionValueInput): Promise<MasterResult> { return pending(); }
export async function deleteOptionValue(_id: string): Promise<MasterResult> { return pending(); }
export async function reorderOptionValues(_optionTypeId: string, _orderedIds: string[]): Promise<MasterResult> { return pending(); }

export async function saveAttribute(_input: AttributeInput): Promise<MasterResult> { return pending(); }
export async function deleteAttribute(_id: string): Promise<MasterResult> { return pending(); }
export async function saveAttributeValue(_input: AttributeValueInput): Promise<MasterResult> { return pending(); }
export async function deleteAttributeValue(_id: string): Promise<MasterResult> { return pending(); }
export async function reorderAttributeValues(_attributeId: string, _orderedIds: string[]): Promise<MasterResult> { return pending(); }

export async function saveCategory(_input: CategoryInput): Promise<MasterResult> { return pending(); }
export async function deleteCategory(_id: string): Promise<MasterResult> { return pending(); }
/** parentId null = ordenar departamentos. */
export async function reorderCategories(_parentId: string | null, _orderedIds: string[]): Promise<MasterResult> { return pending(); }

export async function saveBrand(_input: BrandInput): Promise<MasterResult> { return pending(); }
export async function deleteBrand(_id: string): Promise<MasterResult> { return pending(); }
export async function saveLine(_input: LineInput): Promise<MasterResult> { return pending(); }
export async function deleteLine(_id: string): Promise<MasterResult> { return pending(); }
export async function reorderLines(_brandId: string, _orderedIds: string[]): Promise<MasterResult> { return pending(); }

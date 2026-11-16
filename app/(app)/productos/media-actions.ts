"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { mediaFileStillUsed, mediaPath, validateMediaFile } from "@/lib/catalog/media";
import { canEdit } from "@/lib/permissions";
import { isProductImagePath, mediaPublicUrl } from "@/lib/product-images";
import type { ProductMediaItem } from "@/lib/queries/catalog";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./actions";

async function requireProductsEdit(): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canEdit(session.permissions, "Productos")) {
    return { error: "No tienes permiso para editar productos." };
  }
  return null;
}

/** Nombre del producto para el registro de auditoría (cae al id si no se puede leer). */
async function productLabel(supabase: Awaited<ReturnType<typeof createClient>>, productId: string): Promise<string> {
  const { data } = await supabase.from("products").select("name").eq("id", productId).maybeSingle();
  return data?.name ?? productId;
}

function revalidateProductMedia(productId: string): void {
  revalidatePath(`/productos/${productId}`);
  revalidatePath("/productos");
  revalidatePath("/inventario");
  revalidatePath("/ventas");
}

export async function uploadProductMedia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState & { media?: ProductMediaItem }> {
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;

  const productId = String(formData.get("product_id") ?? "").trim();
  const colorId = String(formData.get("color_id") ?? "").trim() || null;
  const file = formData.get("file");
  if (!productId) return { error: "El producto es obligatorio." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona una foto." };
  }
  const fileError = validateMediaFile(file);
  if (fileError) return { error: fileError };

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return { error: "No se pudo comprobar el producto." };
  if (!product) return { error: "Producto no encontrado." };

  if (colorId) {
    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .eq("color_id", colorId)
      .limit(1)
      .maybeSingle();
    if (variantError) return { error: "No se pudo comprobar el color del producto." };
    if (!variant) return { error: "El color no pertenece a ninguna variante del producto." };
  }

  const lastQuery = supabase
    .from("product_media")
    .select("sort_order")
    .eq("product_id", productId);
  const { data: lastPhoto, error: orderError } = await (colorId
    ? lastQuery.eq("color_id", colorId)
    : lastQuery.is("color_id", null)
  ).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (orderError) return { error: "No se pudo calcular el orden de las fotos." };

  const mediaId = crypto.randomUUID();
  const path = mediaPath(productId, mediaId, file.type);
  const { error: uploadError } = await supabase.storage
    .from("wm-public")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) return { error: "No se pudo subir la foto. Inténtalo de nuevo." };

  const sortOrder = lastPhoto ? lastPhoto.sort_order + 1 : 0;
  let inserted = false;
  try {
    const { error } = await supabase.from("product_media").insert({
      id: mediaId,
      product_id: productId,
      color_id: colorId,
      path,
      sort_order: sortOrder,
    });
    inserted = !error;
  } catch {
    inserted = false;
  }
  if (!inserted) {
    let removed = false;
    try {
      if (isProductImagePath(path)) {
        const { error } = await supabase.storage.from("wm-public").remove([path]);
        removed = !error;
      }
    } catch {
      removed = false;
    }
    return {
      error: removed
        ? "No se pudo guardar la foto. Inténtalo de nuevo."
        : "No se pudo guardar la foto ni retirar el archivo subido. Contacta a soporte.",
    };
  }

  await audit(`Subió una foto del producto ${product.name}`, "Productos");
  revalidateProductMedia(productId);
  return {
    ok: true,
    media: {
      id: mediaId,
      colorId,
      path,
      url: mediaPublicUrl(path) ?? "",
      sortOrder,
    },
  };
}

export async function reorderProductMedia(
  productId: string,
  colorId: string | null,
  orderedIds: string[],
): Promise<FormState> {
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;
  if (!productId) return { error: "El producto es obligatorio." };
  if (colorId === "" || !Array.isArray(orderedIds)) {
    return { error: "El orden de las fotos no es válido." };
  }

  const supabase = await createClient();
  const mediaQuery = supabase
    .from("product_media")
    .select("id", { count: "exact" })
    .eq("product_id", productId);
  const { data: media, count, error: listError } = await (colorId
    ? mediaQuery.eq("color_id", colorId)
    : mediaQuery.is("color_id", null)
  );
  if (listError || !media || count === null) {
    return { error: "No se pudieron consultar las fotos." };
  }

  const expectedIds = new Set(media.map((photo) => photo.id));
  if (
    orderedIds.length !== count ||
    orderedIds.length !== expectedIds.size ||
    orderedIds.some((id) => !expectedIds.has(id)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return { error: "El orden debe incluir exactamente las fotos de este color." };
  }

  for (const [index, id] of orderedIds.entries()) {
    const updateQuery = supabase
      .from("product_media")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("product_id", productId);
    const { data: updated, error: updateError } = await (colorId
      ? updateQuery.eq("color_id", colorId)
      : updateQuery.is("color_id", null)
    ).select("id").maybeSingle();
    if (updateError || !updated) {
      revalidateProductMedia(productId);
      return { error: "No se pudo completar el orden de las fotos." };
    }
  }

  await audit(`Ordenó las fotos del producto ${await productLabel(supabase, productId)}`, "Productos");
  revalidateProductMedia(productId);
  return { ok: true };
}

export async function deleteProductMedia(mediaId: string): Promise<FormState> {
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;
  if (!mediaId) return { error: "La foto es obligatoria." };

  const supabase = await createClient();
  const { data: media, error: readError } = await supabase
    .from("product_media")
    .select("id, product_id, path")
    .eq("id", mediaId)
    .maybeSingle();
  if (readError) return { error: "No se pudo consultar la foto." };
  if (!media) return { error: "Foto no encontrada." };

  const { data: deleted, error: deleteError } = await supabase
    .from("product_media")
    .delete()
    .eq("id", mediaId)
    .select("id")
    .maybeSingle();
  if (deleteError || !deleted) return { error: "No se pudo borrar la foto." };

  await audit(`Eliminó una foto del producto ${await productLabel(supabase, media.product_id)}`, "Productos", "warn");
  revalidateProductMedia(media.product_id);

  if (!isProductImagePath(media.path)) {
    return { error: "La foto se quitó del producto, pero no se pudo borrar el archivo." };
  }

  let otherPaths: string[];
  try {
    const { data: otherMedia, error } = await supabase
      .from("product_media")
      .select("path")
      .eq("path", media.path);
    if (error || !otherMedia) {
      return { error: "La foto se quitó del producto, pero no se pudo comprobar si el archivo sigue en uso." };
    }
    otherPaths = otherMedia.map((photo) => photo.path);
  } catch {
    return { error: "La foto se quitó del producto, pero no se pudo comprobar si el archivo sigue en uso." };
  }

  if (!mediaFileStillUsed(media.path, otherPaths)) {
    try {
      const { error } = await supabase.storage.from("wm-public").remove([media.path]);
      if (error) return { error: "La foto se quitó del producto, pero no se pudo borrar el archivo." };
    } catch {
      return { error: "La foto se quitó del producto, pero no se pudo borrar el archivo." };
    }
  }

  return { ok: true };
}

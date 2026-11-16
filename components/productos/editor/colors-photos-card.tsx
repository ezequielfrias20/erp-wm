"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, JSX } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, ImageIcon, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { deleteProductMedia, reorderProductMedia, uploadProductMedia } from "@/app/(app)/productos/media-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MEDIA_MAX_BYTES, validateMediaFile } from "@/lib/catalog/media";
import type { CatalogMasters, EditorVariant, ProductMediaItem } from "@/lib/queries/catalog";

type Props = {
  productId: string;
  media: ProductMediaItem[];
  variants: EditorVariant[];
  colors: CatalogMasters["colors"];
  canEdit: boolean;
};

type UploadItem = {
  id: number;
  name: string;
  colorName: string;
  status: "en cola" | "subiendo" | "listo" | "error";
  error?: string;
};

function colorIdsInOrder(variants: EditorVariant[], media: ProductMediaItem[]): string[] {
  const ids = new Set<string>();
  for (const variant of [...variants].sort((a, b) => a.sku.localeCompare(b.sku, "es-VE"))) {
    if (variant.colorId) ids.add(variant.colorId);
  }
  for (const photo of media) {
    if (photo.colorId) ids.add(photo.colorId);
  }
  return [...ids];
}

function photosForColor(media: ProductMediaItem[], colorId: string | null): ProductMediaItem[] {
  return media
    .filter((photo) => photo.colorId === colorId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function ColorsPhotosCard({ productId, media, variants, colors, canEdit }: Props): JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextUploadId = useRef(0);
  const mutationLock = useRef(false);
  const [addedPhotos, setAddedPhotos] = useState<ProductMediaItem[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const serverIds = new Set(media.map((photo) => photo.id));
  const removedIds = new Set(removedPhotoIds);
  const photos = [...media, ...addedPhotos.filter((photo) => !serverIds.has(photo.id))]
    .filter((photo) => !removedIds.has(photo.id))
    .map((photo) => {
      const position = orders[photo.colorId ?? "general"]?.indexOf(photo.id) ?? -1;
      return position < 0 ? photo : { ...photo, sortOrder: position };
    });
  const colorIds = colorIdsInOrder(variants, photos);
  const colorsById = new Map(colors.map((color) => [color.id, color]));
  const activeColorIds = new Set(variants.filter((variant) => variant.isActive && variant.colorId).map((variant) => variant.colorId!));
  const oneColorWithGeneralPhoto = activeColorIds.size === 1 && photos.some((photo) => photo.colorId === null);
  const hasWarning = (colorId: string) => activeColorIds.has(colorId)
    && !oneColorWithGeneralPhoto
    && !photos.some((photo) => photo.colorId === colorId);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(() => colorIds.find((id) => hasWarning(id)) ?? null);
  const selected = selectedColorId && colorIds.includes(selectedColorId) ? selectedColorId : null;
  const selectedName = selected ? (colorsById.get(selected)?.name ?? "Color sin maestro") : "General";
  const selectedPhotos = photosForColor(photos, selected);
  const selectedHasVariant = selected === null || variants.some((variant) => variant.colorId === selected);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<ProductMediaItem | null>(null);
  const deleteColorName = photoToDelete?.colorId
    ? (colorsById.get(photoToDelete.colorId)?.name ?? "Color sin maestro")
    : "General";

  async function commitOrder(ordered: ProductMediaItem[]) {
    if (!canEdit || mutationLock.current) return;
    mutationLock.current = true;
    setMutating(true);
    const orderKey = selected ?? "general";
    const before = orders[orderKey];
    setOrders((current) => ({ ...current, [orderKey]: ordered.map((photo) => photo.id) }));
    try {
      const result = await reorderProductMedia(productId, selected, ordered.map((photo) => photo.id));
      if (result?.error || !result?.ok) {
        setOrders((current) => {
          const next = { ...current };
          if (before) next[orderKey] = before;
          else delete next[orderKey];
          return next;
        });
        toast.error(result?.error ?? "No se pudo ordenar las fotos.");
      } else {
        router.refresh();
      }
    } catch {
      setOrders((current) => {
        const next = { ...current };
        if (before) next[orderKey] = before;
        else delete next[orderKey];
        return next;
      });
      toast.error("No se pudo ordenar las fotos. Inténtalo de nuevo.");
    } finally {
      mutationLock.current = false;
      setMutating(false);
    }
  }

  function movePhoto(index: number, target: number) {
    if (target < 0 || target >= selectedPhotos.length || target === index) return;
    const reordered = [...selectedPhotos];
    const [photo] = reordered.splice(index, 1);
    reordered.splice(target, 0, photo);
    void commitOrder(reordered);
  }

  async function confirmDelete() {
    if (!photoToDelete || !canEdit || mutationLock.current) return;
    mutationLock.current = true;
    setMutating(true);
    try {
      const result = await deleteProductMedia(photoToDelete.id);
      if (result?.error || !result?.ok) {
        toast.error(result?.error ?? "No se pudo borrar la foto.");
      } else {
        setRemovedPhotoIds((current) => [...current, photoToDelete.id]);
        toast.success("Foto borrada.");
      }
      setPhotoToDelete(null);
      router.refresh();
    } catch {
      toast.error("No se pudo borrar la foto. Inténtalo de nuevo.");
    } finally {
      mutationLock.current = false;
      setMutating(false);
    }
  }

  async function uploadFiles(files: File[]) {
    if (!canEdit || !selectedHasVariant || mutationLock.current || files.length === 0) return;
    mutationLock.current = true;
    setUploading(true);
    const batch = files.map((file) => {
      const error = validateMediaFile(file);
      return { file, item: { id: nextUploadId.current++, name: file.name, colorName: selectedName,
        status: error ? "error" : "en cola", error } as UploadItem };
    });
    setUploads(batch.map(({ item }) => item));
    const valid = batch.filter(({ item }) => !item.error);
    try {
      for (const { file, item } of valid) {
        setUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "subiendo" } : entry));
        try {
          const formData = new FormData();
          formData.set("product_id", productId);
          formData.set("color_id", selected ?? "");
          formData.set("file", file);
          const result = await uploadProductMedia(null, formData);
          if (result?.error || !result?.media) {
            setUploads((current) => current.map((entry) => entry.id === item.id
              ? { ...entry, status: "error", error: result?.error ?? "No se pudo subir la foto." }
              : entry));
            continue;
          }
          setAddedPhotos((current) => [...current.filter((photo) => photo.id !== result.media!.id), result.media!]);
          setUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "listo" } : entry));
        } catch {
          setUploads((current) => current.map((entry) => entry.id === item.id
            ? { ...entry, status: "error", error: "Error de red. Inténtalo de nuevo." }
            : entry));
        }
      }
    } finally {
      mutationLock.current = false;
      setUploading(false);
      if (valid.length > 0) router.refresh();
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadFiles(files);
  }

  function onFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingFiles(false);
    if (!event.dataTransfer.files.length) return;
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div id="galeria-producto" className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
      <div className="mb-4 text-[14px] font-bold tracking-tight text-foreground">Colores y fotos</div>

      <div role="group" aria-label="Colores del producto" className="mb-4 flex min-w-0 gap-2 overflow-x-auto pb-2">
        {[null, ...colorIds].map((colorId) => {
          const name = colorId ? (colorsById.get(colorId)?.name ?? "Color sin maestro") : "General";
          const count = photos.filter((photo) => photo.colorId === colorId).length;
          const warning = colorId ? hasWarning(colorId) : false;
          const isSelected = selected === colorId;
          return (
            <button key={colorId ?? "general"} type="button" aria-pressed={isSelected}
              onClick={() => setSelectedColorId(colorId)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${isSelected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface-2 text-text-2 hover:border-primary/50"}`}>
              <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full border border-border bg-surface-2"
                style={colorId && colorsById.get(colorId)?.hex ? { backgroundColor: colorsById.get(colorId)?.hex ?? undefined } : undefined} />
              <span>{name}</span>
              <span className="text-text-3">{count}</span>
              {warning && <AlertTriangle className="size-3.5 text-warning" aria-label={`Falta foto de ${name}`} />}
            </button>
          );
        })}
      </div>

      {selectedPhotos.length === 0 ? (
        <div className="mb-4 flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-2 p-4 text-center text-[12px] text-text-3">
          <ImageIcon className="size-6" />
          <span>Sin fotos en {selectedName}.</span>
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {selectedPhotos.map((photo, index) => (
            <div key={photo.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-2">
              <div className="relative aspect-square overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={`Foto ${index + 1} de ${selectedName}`} loading="lazy" className="h-full w-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-card/90 px-1.5 py-1 text-[10px] font-semibold text-foreground shadow-sm">
                    <Star className="size-3 fill-warning text-warning" /> Principal
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center justify-center gap-0.5 p-1">
                  <Button type="button" variant="ghost" size="icon-xs" title="Mover a la izquierda" aria-label={`Mover foto ${index + 1} a la izquierda`}
                    disabled={mutating || uploading || index === 0} onClick={() => movePhoto(index, index - 1)}><ArrowLeft className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" title="Mover a la derecha" aria-label={`Mover foto ${index + 1} a la derecha`}
                    disabled={mutating || uploading || index === selectedPhotos.length - 1} onClick={() => movePhoto(index, index + 1)}><ArrowRight className="size-3.5" /></Button>
                  {index !== 0 && <Button type="button" variant="ghost" size="xs" title="Hacer principal" aria-label={`Hacer principal la foto ${index + 1}`}
                    disabled={mutating || uploading} onClick={() => movePhoto(index, 0)}><Star className="size-3.5" /> Principal</Button>}
                  <Button type="button" variant="ghost" size="icon-xs" title="Borrar foto" aria-label={`Borrar foto ${index + 1}`}
                    className="text-danger" disabled={mutating || uploading} onClick={() => setPhotoToDelete(photo)}><Trash2 className="size-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
            aria-label={`Seleccionar fotos para ${selectedName}`} onChange={onFileChange} disabled={uploading || mutating || !selectedHasVariant} />
          <div onDragOver={(event) => { event.preventDefault(); if (selectedHasVariant && !uploading && !mutating) setDraggingFiles(true); }}
            onDragLeave={() => setDraggingFiles(false)} onDrop={onFileDrop}
            className={`rounded-xl border border-dashed p-4 text-center ${draggingFiles ? "border-primary bg-primary/5" : "border-border bg-surface-2"}`}>
            <Button type="button" variant="outline" size="sm" disabled={uploading || mutating || !selectedHasVariant}
              onClick={() => inputRef.current?.click()}><Upload className="size-4" /> Subir fotos</Button>
            <p className="mt-2 text-[11.5px] text-text-3">
              {selectedHasVariant
                ? `Arrastra varias fotos aquí. JPG, PNG o WebP; máximo ${MEDIA_MAX_BYTES / 1024 / 1024} MB por foto.`
                : "Agrega una variante de este color para subir fotos."}
            </p>
          </div>
          {uploads.length > 0 && (
            <div className="mt-3 space-y-1.5" aria-live="polite">
              <div className="text-[12px] font-semibold text-text-2">Subidas a {uploads[0].colorName}</div>
              {uploads.map((item) => (
                <div key={item.id} className="rounded-lg border border-border px-2.5 py-1.5 text-[11.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-text-2" title={item.name}>{item.name}</span>
                    <span className={item.status === "error" ? "shrink-0 text-danger" : item.status === "listo" ? "shrink-0 text-success" : "shrink-0 text-text-3"}>{item.status}</span>
                  </div>
                  <div role="progressbar" aria-label={`Subida de ${item.name}`} aria-valuemin={0} aria-valuemax={100}
                    aria-valuenow={item.status === "subiendo" ? undefined : item.status === "listo" ? 100 : 0} aria-valuetext={item.status}
                    className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full rounded-full ${item.status === "error" ? "bg-danger" : item.status === "listo" ? "w-full bg-success" : item.status === "subiendo" ? "w-1/2 animate-pulse bg-primary" : "bg-primary"}`} />
                  </div>
                  {item.error && <p className="mt-1 text-danger">{item.error}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={photoToDelete !== null} onOpenChange={(open) => { if (!open && !mutating) setPhotoToDelete(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Borrar foto</DialogTitle>
            <DialogDescription>¿Seguro que quieres borrar esta foto de {deleteColorName}? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutating} onClick={() => setPhotoToDelete(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={mutating} onClick={confirmDelete}>Borrar foto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

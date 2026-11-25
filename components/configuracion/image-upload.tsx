"use client";

import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Uploads an image to the `wm-public` storage bucket and returns its public URL. */
export function ImageUpload({
  folder,
  onUploaded,
  label = "Subir imagen",
  className,
  maxMb = 2,
  accept = "image/png,image/jpeg,image/webp,image/svg+xml",
}: {
  folder: string;
  onUploaded: (url: string) => void | Promise<void>;
  label?: ReactNode;
  className?: string;
  maxMb?: number;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    // `accept` sólo filtra el diálogo: soltar o elegir «Todos los archivos» lo evita.
    if (!accept.split(",").includes(file.type)) {
      toast.error("Formato de imagen no admitido.");
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`La imagen supera los ${maxMb} MB.`);
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("wm-public")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("wm-public").getPublicUrl(path);
      await onUploaded(data.publicUrl);
      toast.success("Imagen actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "iconbtn inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2 text-[12.5px] font-medium text-foreground disabled:opacity-60",
          className,
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4 text-text-3" />}
        {label}
      </button>
    </>
  );
}

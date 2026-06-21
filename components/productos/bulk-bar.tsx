"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  buildWorkbookBlob,
  downloadBlob,
  parseSheet,
  type SheetColumn,
} from "@/lib/excel";
import {
  importProducts,
  getProductsExport,
  type ImportProductsResult,
} from "@/app/(app)/productos/actions";

type Lists = {
  categories: string[];
  brands: string[];
  sizes: string[];
  colors: string[];
};

function productCols(lists: Lists): SheetColumn[] {
  return [
    { header: "Nombre", key: "name", width: 34 },
    { header: "Categoría", key: "category", width: 20, list: lists.categories },
    { header: "Marca", key: "brand", width: 20, list: lists.brands },
    { header: "% IVA", key: "tax_rate", width: 10 },
    { header: "Visible en catálogo", key: "visible", width: 18, list: ["Sí", "No"] },
    { header: "Descripción", key: "description", width: 42 },
  ];
}

function variantCols(lists: Lists): SheetColumn[] {
  return [
    { header: "Producto", key: "product", width: 34 },
    { header: "Talla", key: "size", width: 12, list: lists.sizes },
    { header: "Color", key: "color", width: 16, list: lists.colors },
    { header: "Precio (USD)", key: "price", width: 12 },
    { header: "Costo (USD)", key: "cost", width: 12 },
    { header: "SKU (opcional)", key: "sku", width: 18 },
    { header: "Código de barras", key: "barcode", width: 18 },
  ];
}

export function ProductsBulkBar({ lists }: { lists: Lists }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportProductsResult | null>(null);
  const [busy, startBusy] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const blob = await buildWorkbookBlob([
        { name: "Productos", columns: productCols(lists) },
        { name: "Variantes", columns: variantCols(lists) },
      ]);
      downloadBlob(blob, "plantilla-productos-world-medics.xlsx");
    } catch (e) {
      toast.error("No se pudo generar la plantilla.");
      console.error(e);
    } finally {
      setDownloading(false);
    }
  }

  async function exportAll() {
    setDownloading(true);
    try {
      const data = await getProductsExport();
      const blob = await buildWorkbookBlob([
        { name: "Productos", columns: productCols(lists), rows: data.products },
        { name: "Variantes", columns: variantCols(lists), rows: data.variants },
      ]);
      downloadBlob(blob, "productos-world-medics.xlsx");
    } catch (e) {
      toast.error("No se pudo exportar.");
      console.error(e);
    } finally {
      setDownloading(false);
    }
  }

  function runImport() {
    if (!file) return;
    startBusy(async () => {
      try {
        const [productsRaw, variantsRaw] = await Promise.all([
          parseSheet(file, "Productos"),
          parseSheet(file, "Variantes"),
        ]);
        const products = productsRaw.map((r) => ({
          name: r["Nombre"],
          category: r["Categoría"],
          brand: r["Marca"],
          tax_rate: r["% IVA"],
          visible: r["Visible en catálogo"],
          description: r["Descripción"],
        }));
        const variants = variantsRaw.map((r) => ({
          product: r["Producto"],
          size: r["Talla"],
          color: r["Color"],
          price: r["Precio (USD)"],
          cost: r["Costo (USD)"],
          sku: r["SKU (opcional)"],
          barcode: r["Código de barras"],
        }));
        if (products.length === 0 && variants.length === 0) {
          toast.error("El archivo no tiene filas en 'Productos' ni 'Variantes'.");
          return;
        }
        const res = await importProducts({ products, variants });
        setResult(res);
        toast.success(
          `${res.productsCreated} producto(s) y ${res.variantsCreated} variante(s) creadas` +
            (res.productsUpdated || res.variantsUpdated
              ? ` · ${res.productsUpdated + res.variantsUpdated} actualizadas`
              : ""),
        );
        router.refresh();
      } catch (e) {
        toast.error("No se pudo leer el archivo. ¿Es la plantilla .xlsx?");
        console.error(e);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={downloadTemplate}
        disabled={downloading}
        className="h-[38px] gap-2 text-[13px]"
      >
        <Download className="size-4" /> Plantilla
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setResult(null);
          setFile(null);
          setOpen(true);
        }}
        className="h-[38px] gap-2 text-[13px]"
      >
        <Upload className="size-4" /> Importar
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={exportAll}
        disabled={downloading}
        className="h-[38px] gap-2 text-[13px]"
      >
        <FileSpreadsheet className="size-4" /> Exportar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Importar productos</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-text-2">
              Descarga la plantilla, llena las hojas <strong>Productos</strong> y{" "}
              <strong>Variantes</strong> (las columnas con lista evitan errores) y súbela
              aquí. El SKU es opcional: si lo dejas vacío se genera automáticamente.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="block w-full rounded-[10px] border border-border bg-surface-2 p-2 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white"
            />
            {result && result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg bg-warning-soft px-3 py-2 text-[12px] text-warning">
                <div className="mb-1 font-semibold">
                  {result.errors.length} aviso(s):
                </div>
                <ul className="list-disc pl-4">
                  {result.errors.slice(0, 30).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {result && (
              <div className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] text-success">
                Productos: {result.productsCreated} nuevos, {result.productsUpdated}{" "}
                actualizados · Variantes: {result.variantsCreated} nuevas,{" "}
                {result.variantsUpdated} actualizadas
                {result.skipped ? ` · ${result.skipped} omitidas` : ""}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            <Button type="button" onClick={runImport} disabled={!file || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

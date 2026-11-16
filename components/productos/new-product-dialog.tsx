"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { createProduct, type FormState } from "@/app/(app)/productos/actions";
import type { CatalogMasters } from "@/lib/queries/catalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

type NewProductMasters = Pick<CatalogMasters, "departments" | "categories" | "brands">;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Crear y editar
    </Button>
  );
}

export function NewProductDialog({ open, onOpenChange, masters }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masters: NewProductMasters;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<FormState, FormData>(createProduct, null);

  useEffect(() => {
    if (state?.ok && state.id) {
      onOpenChange(false);
      router.push(`/productos/${state.id}`);
    }
  }, [state, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[520px] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo producto</DialogTitle></DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-product-name">Nombre del producto</Label>
            <Input id="new-product-name" name="name" placeholder="Ej. Gorro quirúrgico" required />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-product-category">Categoría</Label>
              <Select name="category_id" required>
                <SelectTrigger id="new-product-category" className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {masters.departments.map((department) => {
                    const categories = masters.categories.filter((category) => category.departmentId === department.id);
                    if (!categories.length) return null;
                    return (
                      <SelectGroup key={department.id}>
                        <SelectLabel>{department.name}</SelectLabel>
                        {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-product-brand">Marca</Label>
              <Select name="brand_id" required>
                <SelectTrigger id="new-product-brand" className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {masters.brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {state?.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

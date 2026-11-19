"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildWhatsAppUrl, renderTemplate, templateVars, type TemplateKey } from "@/lib/online-orders/whatsapp";
import type { BranchGroup, OnlineOrderView } from "@/lib/online-orders/types";

const OPTIONS: { key: TemplateKey; label: string }[] = [
  { key: "recibida", label: "Solicitud recibida" },
  { key: "aceptada", label: "Pedido aceptado" },
  { key: "rechazada", label: "Pedido rechazado" },
  { key: "no_disponible", label: "Producto no disponible" },
  { key: "por_vencer", label: "Pedido por vencer" },
];

export function WhatsAppMenu({ order, groups, templates }: {
  order: OnlineOrderView;
  groups: BranchGroup[];
  templates: Record<TemplateKey, string>;
}) {
  if (!buildWhatsAppUrl(order.customerPhone, "")) return null;
  const vars = templateVars(order, groups, new Date());

  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="outline"><MessageCircle /> WhatsApp</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {OPTIONS.map(({ key, label }) => {
        const url = buildWhatsAppUrl(order.customerPhone, renderTemplate(templates[key], vars));
        if (!url) return null;
        return <DropdownMenuItem key={key} asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">{label}</a>
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}

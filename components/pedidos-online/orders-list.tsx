"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTimeCaracas, fmtDual, fmtRelative } from "@/lib/format";
import { groupByBranch, timeLeftLabel } from "@/lib/online-orders/rules";
import type { OnlineOrderStatus, OnlineOrderView } from "@/lib/online-orders/types";
import { StatusBadge } from "./status-badge";

type StatusFilter = OnlineOrderStatus | "activas" | "todas";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "activas", label: "Activas" },
  { value: "solicitada", label: "Nuevas" },
  { value: "aceptada", label: "Aceptadas" },
  { value: "completada", label: "Completadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "cancelada", label: "Canceladas" },
  { value: "vencida", label: "Vencidas" },
  { value: "todas", label: "Todas" },
];

export function OrdersList({ orders, status, q, rate, now }: {
  orders: OnlineOrderView[];
  status: StatusFilter;
  q: string;
  rate: number;
  now: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [applying, startApply] = useTransition();

  function pushFilters(nextStatus: StatusFilter, nextSearch = search) {
    const params = new URLSearchParams();
    params.set("estado", nextStatus);
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    startApply(() => router.push(`/pedidos-online?${params.toString()}`));
  }

  return <div className="mx-auto max-w-[1560px] px-4 pt-4 pb-8 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px] lg:pb-12">
    <div className="mb-[18px]">
      <h1 className="text-[25px] font-bold tracking-tight text-foreground">Pedidos online</h1>
      <p className="mt-1 text-[13.5px] text-text-2">Solicitudes de la tienda online · {orders.length} pedido{orders.length === 1 ? "" : "s"}</p>
    </div>

    <div className="mb-[18px] flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-card-sm">
      <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
        {FILTERS.map((filter) => <button
          type="button"
          key={filter.value}
          onClick={() => pushFilters(filter.value)}
          aria-pressed={status === filter.value}
          disabled={applying}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-text-2 transition data-[active=true]:bg-brand-soft data-[active=true]:text-brand disabled:opacity-60"
          data-active={status === filter.value}
        >{filter.label}</button>)}
      </div>
      <form className="flex max-w-[440px] gap-2" onSubmit={(event) => { event.preventDefault(); pushFilters(status); }}>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input aria-label="Buscar pedidos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número, cliente o teléfono" className="pl-9" />
        </div>
        <Button type="submit" disabled={applying}>Buscar</Button>
      </form>
    </div>

    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
      <Table>
        <TableHeader className="bg-surface-2">
          <TableRow>
            <TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>Sucursales</TableHead>
            <TableHead>Total</TableHead><TableHead>Estado</TableHead><TableHead>Vence</TableHead><TableHead>Creado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => <TableRow
            key={order.id}
            className="tr-row cursor-pointer"
            tabIndex={0}
            role="link"
            aria-label={`Ver pedido ${order.number}`}
            onClick={() => router.push(`/pedidos-online/${order.id}`)}
            onKeyDown={(event) => { if (event.key === "Enter") router.push(`/pedidos-online/${order.id}`); }}
          >
            <TableCell className="font-semibold text-foreground">{order.number}</TableCell>
            <TableCell><div className="font-medium text-foreground">{order.customerName}</div><div className="text-xs text-text-3">{order.customerPhone}</div></TableCell>
            <TableCell><div className="flex flex-wrap gap-1">{groupByBranch(order.items).map((group) => <Badge key={group.branchId} variant="outline" className="bg-surface-2 text-text-2">{group.branchName}</Badge>)}</div></TableCell>
            <TableCell className="font-medium text-foreground">{fmtDual(order.total, rate)}</TableCell>
            <TableCell><StatusBadge status={order.status} /></TableCell>
            <TableCell className={order.status === "vencida" ? "text-danger" : "text-text-2"}>{timeLeftLabel(order.expiresAt, new Date(now))}</TableCell>
            <TableCell className="text-text-2"><span title={fmtDateTimeCaracas(order.createdAt)}>{fmtRelative(order.createdAt, now)}</span></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      {orders.length === 0 && <div className="px-5 py-12 text-center text-[13px] text-text-3">No hay pedidos online con este filtro</div>}
    </div>
  </div>;
}

import { describe, expect, it } from "vitest";
import { STATUS_LABEL, STATUS_TONE, availableActions, canConvertGroup, groupByBranch, timeLeftLabel } from "./rules";
import type { BranchGroup, OnlineOrderItemView } from "./types";

const itemA1: OnlineOrderItemView = {
  id: "a1", variantId: "v1", branchId: "A", branchName: "Caracas Centro",
  quantity: 2, unitPrice: 31.25, productName: "Bata", variantLabel: "Azul",
  sku: "SKU-1", saleId: null, invoiceNumber: null, releasedAt: null,
};
const itemA2 = { ...itemA1, id: "a2", quantity: 1, unitPrice: 12.1 };
const itemB1 = { ...itemA1, id: "b1", branchId: "B", branchName: "Valencia" };
const pendingGroupA: BranchGroup = {
  branchId: "A", branchName: "Caracas Centro", items: [itemA1], subtotal: 62.5, state: "pendiente",
};

describe("groupByBranch", () => {
  it("agrupa y ordena por nombre de sucursal", () => {
    expect(groupByBranch([itemB1, itemA1, itemA2]).map((group) => group.branchName)).toEqual(["Caracas Centro", "Valencia"]);
    expect(groupByBranch([itemB1, itemA1, itemA2])[0].items.map((item) => item.id)).toEqual(["a1", "a2"]);
  });

  it("marca vendido si hay venta y no quedan líneas pendientes", () => {
    expect(groupByBranch([{ ...itemA1, saleId: "s1" }])[0].state).toBe("vendido");
    expect(groupByBranch([{ ...itemA1, saleId: "s1" }, { ...itemA2, releasedAt: "2026-11-19T10:00:00Z" }])[0].state).toBe("vendido");
    expect(groupByBranch([{ ...itemA1, saleId: "s1" }, itemA2])[0].state).toBe("pendiente");
  });

  it("marca liberado sólo si todas las líneas se liberaron sin venta", () => {
    expect(groupByBranch([{ ...itemA1, releasedAt: "2026-11-19T10:00:00Z" }])[0].state).toBe("liberado");
    expect(groupByBranch([{ ...itemA1, releasedAt: "2026-11-19T10:00:00Z" }, itemA2])[0].state).toBe("pendiente");
  });

  it("redondea el subtotal del grupo a dos decimales", () => {
    expect(groupByBranch([itemA1])[0].subtotal).toBe(62.5);
    expect(groupByBranch([{ ...itemA1, quantity: 3, unitPrice: 0.335 }])[0].subtotal).toBe(1.01);
  });
});

describe("estados y acciones", () => {
  it("expone las etiquetas y tonos acordados", () => {
    expect(STATUS_LABEL).toEqual({ solicitada: "Nueva", aceptada: "Aceptada", completada: "Completada", rechazada: "Rechazada", cancelada: "Cancelada", vencida: "Vencida" });
    expect(STATUS_TONE).toEqual({ solicitada: "brand", aceptada: "warning", completada: "success", rechazada: "muted", cancelada: "muted", vencida: "danger" });
  });

  it("permite aceptar o rechazar una solicitud incluso vencida", () => {
    expect(availableActions({ status: "vencida", storedStatus: "solicitada" }, true)).toEqual(["aceptar", "rechazar"]);
  });

  it("permite gestionar una aceptación incluso vencida", () => {
    expect(availableActions({ status: "vencida", storedStatus: "aceptada" }, true)).toEqual(["convertir", "extender", "cancelar"]);
  });

  it("no ofrece acciones para estados cerrados o sin permiso", () => {
    expect(availableActions({ status: "completada", storedStatus: "completada" }, true)).toEqual([]);
    expect(availableActions({ status: "solicitada", storedStatus: "solicitada" }, false)).toEqual([]);
  });
});

describe("canConvertGroup", () => {
  it("acepta un grupo pendiente dentro del alcance", () => {
    expect(canConvertGroup(pendingGroupA, { assignedBranchId: "A" })).toEqual({ ok: true });
    expect(canConvertGroup(pendingGroupA, { assignedBranchId: null })).toEqual({ ok: true });
  });

  it("rechaza una sucursal diferente", () => {
    expect(canConvertGroup(pendingGroupA, { assignedBranchId: "B" })).toEqual({ ok: false, reason: "Sólo puedes vender en tu sucursal" });
  });

  it("rechaza grupos sin líneas pendientes", () => {
    expect(canConvertGroup({ ...pendingGroupA, state: "vendido" }, { assignedBranchId: null })).toEqual({ ok: false, reason: "Este grupo ya no tiene productos pendientes" });
  });
});

describe("timeLeftLabel", () => {
  const now = new Date("2026-11-19T10:00:00Z");

  it("muestra raya si no hay vencimiento", () => {
    expect(timeLeftLabel(null, now)).toBe("—");
  });

  it("muestra minutos cuando falta menos de una hora", () => {
    expect(timeLeftLabel("2026-11-19T10:30:00Z", now)).toBe("Vence en 30 min");
    expect(timeLeftLabel("2026-11-19T10:59:59Z", now)).toBe("Vence en 59 min");
    expect(timeLeftLabel("2026-11-19T10:00:01Z", now)).toBe("Vence en 1 min");
  });

  it("muestra horas y minutos desde una hora", () => {
    expect(timeLeftLabel("2026-11-19T11:00:00Z", now)).toBe("Vence en 1 h 0 min");
    expect(timeLeftLabel("2026-11-19T12:15:00Z", now)).toBe("Vence en 2 h 15 min");
  });

  it("marca el vencimiento al llegar a la hora límite", () => {
    expect(timeLeftLabel("2026-11-19T09:00:00Z", now)).toBe("Vencido");
    expect(timeLeftLabel("2026-11-19T10:00:00Z", now)).toBe("Vencido");
  });
});

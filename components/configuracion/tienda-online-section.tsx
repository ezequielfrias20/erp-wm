"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  loadOnlineStoreConfig, saveOnlineSettings, setBranchOnline,
  type OnlineStoreConfig,
} from "@/app/(app)/configuracion/online-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { reportActionError } from "@/lib/action-error";
import { DEFAULT_TEMPLATES, type TemplateKey } from "@/lib/online-orders/whatsapp";

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  recibida: "Solicitud recibida",
  aceptada: "Pedido aceptado",
  rechazada: "Solicitud rechazada",
  no_disponible: "Producto no disponible",
  por_vencer: "Pedido por vencer",
};
const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES) as TemplateKey[];
const VARIABLES = "{nombre} {numero} {lineas} {total} {sucursales} {vence} {motivo}";

export function TiendaOnlineSection() {
  const [data, setData] = useState<OnlineStoreConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [softMinutes, setSoftMinutes] = useState("");
  const [firmHours, setFirmHours] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [templates, setTemplates] = useState<Partial<Record<TemplateKey, string>>>({});
  const [saving, startSave] = useTransition();
  const [changingBranch, startBranchChange] = useTransition();
  const requestId = useRef(0);

  const applyData = useCallback((config: OnlineStoreConfig) => {
    setData(config);
    setSoftMinutes(String(config.settings.softHoldMinutes));
    setFirmHours(String(config.settings.firmHoldHours));
    setWhatsapp(config.settings.storeWhatsapp ?? "");
    setTemplates(config.templateOverrides);
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const result = await loadOnlineStoreConfig();
      if (current !== requestId.current) return;
      if (result.data) applyData(result.data);
      else setError(result.error ?? "No se pudo cargar la tienda online.");
    } catch (cause) {
      if (current === requestId.current) {
        setError("No se pudo cargar la tienda online.");
        reportActionError(cause, "No se pudo cargar la tienda online.");
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    const current = ++requestId.current;
    void loadOnlineStoreConfig().then((result) => {
      if (cancelled || current !== requestId.current) return;
      if (result.data) applyData(result.data);
      else setError(result.error ?? "No se pudo cargar la tienda online.");
    }).catch((cause) => {
      if (!cancelled && current === requestId.current) {
        setError("No se pudo cargar la tienda online.");
        reportActionError(cause, "No se pudo cargar la tienda online.");
      }
    }).finally(() => {
      if (!cancelled && current === requestId.current) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [applyData]);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.canEditSettings || saving) return;
    startSave(async () => {
      try {
        const result = await saveOnlineSettings({
          softHoldMinutes: Number(softMinutes),
          firmHoldHours: Number(firmHours),
          storeWhatsapp: whatsapp.trim() || null,
          templates,
        });
        if (result.error) { toast.error(result.error); return; }
        toast.success("Configuración de la tienda guardada.");
      } catch (cause) {
        reportActionError(cause, "No se pudo guardar la tienda online.");
      }
    });
  }

  function toggleBranch(branchId: string, enabled: boolean) {
    if (!data?.canEditBranches || changingBranch) return;
    startBranchChange(async () => {
      try {
        const result = await setBranchOnline(branchId, enabled);
        if (result.error) { toast.error(result.error); return; }
        setData((current) => current ? {
          ...current,
          branches: current.branches.map((branch) => branch.id === branchId
            ? { ...branch, onlineEnabled: enabled } : branch),
        } : current);
        toast.success(enabled ? "Sucursal activada para venta online." : "Venta online desactivada en la sucursal.");
      } catch (cause) {
        reportActionError(cause, "No se pudo actualizar la sucursal.");
      }
    });
  }

  return <div className="min-w-0 space-y-4">
    {loading && !data && <div className="rounded-2xl border border-border bg-card p-5 text-[13px] text-text-2" role="status">Cargando tienda online…</div>}
    {error && <div className="rounded-2xl border border-border bg-card p-5">
      <p className="mb-3 text-[13px] text-danger">{error}</p>
      <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>Reintentar</Button>
    </div>}
    {data && !error && <>
      <Card className="gap-4 shadow-card-sm">
        <CardHeader><CardTitle className="text-[15px]">Apartados y mensajes</CardTitle>
          <p className="text-[12px] text-text-3">Define cuánto dura cada apartado y personaliza los mensajes de WhatsApp.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="soft-hold-minutes">Apartado corto (minutos)</Label>
                <Input id="soft-hold-minutes" type="number" min={5} max={240} step={1} value={softMinutes}
                  onChange={(event) => setSoftMinutes(event.target.value)} disabled={!data.canEditSettings || saving} />
                <p className="text-[11px] text-text-3">Entre 5 y 240 minutos, mientras se revisa la solicitud.</p>
              </div>
              <div className="space-y-1.5"><Label htmlFor="firm-hold-hours">Apartado firme (horas)</Label>
                <Input id="firm-hold-hours" type="number" min={1} max={168} step={1} value={firmHours}
                  onChange={(event) => setFirmHours(event.target.value)} disabled={!data.canEditSettings || saving} />
                <p className="text-[11px] text-text-3">Entre 1 y 168 horas, después de aceptar el pedido.</p>
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="store-whatsapp">WhatsApp de la tienda</Label>
              <Input id="store-whatsapp" type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="+584141234567" disabled={!data.canEditSettings || saving} />
              <p className="text-[11px] text-text-3">Usa el formato internacional +58… o deja el campo vacío.</p>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="text-[13px] font-semibold text-foreground">Plantillas de WhatsApp</h3>
              <p className="mt-1 text-[12px] text-text-3">Variables disponibles: <span className="break-words font-mono">{VARIABLES}</span></p>
              <div className="mt-4 space-y-5">
                {TEMPLATE_KEYS.map((key) => <div key={key} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor={`template-${key}`}>{TEMPLATE_LABELS[key]}</Label>
                    <Button type="button" size="sm" variant="outline" disabled={!data.canEditSettings || saving || !templates[key]}
                      onClick={() => setTemplates((current) => ({ ...current, [key]: "" }))}>Restaurar predeterminada</Button>
                  </div>
                  <Textarea id={`template-${key}`} value={templates[key] ?? ""} maxLength={1000}
                    onChange={(event) => setTemplates((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder={DEFAULT_TEMPLATES[key]} disabled={!data.canEditSettings || saving} rows={3} />
                  <p className="text-[11px] text-text-3">{templates[key]?.length ?? 0}/1000 caracteres. Si queda vacía, se usará: {DEFAULT_TEMPLATES[key]}</p>
                </div>)}
              </div>
            </div>
            {data.canEditSettings && <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button></div>}
          </form>
        </CardContent>
      </Card>
      <Card className="gap-4 shadow-card-sm">
        <CardHeader><CardTitle className="text-[15px]">Sucursales</CardTitle>
          <p className="text-[12px] text-text-3">Activa «Vende online» para que la sucursal aparezca en la tienda.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.branches.length === 0 && <p className="text-[13px] text-text-3">No hay sucursales.</p>}
          {data.branches.map((branch) => <div key={branch.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
            <div className="min-w-0"><p className="text-[13px] font-semibold text-foreground">{branch.name}</p>
              <p className="text-[11px] text-text-3">{branch.city}{!branch.isActive && " · Inactiva"}</p></div>
            <div className="flex shrink-0 items-center gap-2"><Label htmlFor={`online-${branch.id}`} className="text-[12px]">Vende online</Label>
              <Switch id={`online-${branch.id}`} checked={branch.onlineEnabled} onCheckedChange={(enabled) => toggleBranch(branch.id, enabled)}
                disabled={!data.canEditBranches || (!branch.isActive && !branch.onlineEnabled) || changingBranch} aria-label={`Vende online: ${branch.name}`} /></div>
          </div>)}
        </CardContent>
      </Card>
    </>}
  </div>;
}

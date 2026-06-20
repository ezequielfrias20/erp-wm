"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  User,
  Building2,
  Palette,
  SunMoon,
  ShoppingCart,
  Boxes,
  Shield,
  Bell,
  ScrollText,
  Loader2,
  Check,
  Plus,
  Trash2,
  Sun,
  Moon,
} from "lucide-react";
import {
  updateMyProfile,
  updateCompany,
  updateSales,
  updateColors,
  updateAvatar,
  updateBrandAsset,
  updateNotifications,
  togglePaymentMethod,
  addMaster,
  deleteMaster,
  type FormState,
} from "@/app/(app)/configuracion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AvatarBubble } from "@/components/shell/avatar-bubble";
import { ImageUpload } from "@/components/configuracion/image-upload";
import { fmtVES, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AuditLog,
  Category,
  ColorRow,
  PaymentMethod,
  Profile,
  Settings,
  Size,
} from "@/lib/database.types";

const SWATCHES = ["#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6"];

const SECTIONS = [
  { id: "perfil", label: "Mi perfil", icon: User },
  { id: "empresa", label: "Empresa", icon: Building2 },
  { id: "marca", label: "Marca", icon: Palette },
  { id: "apariencia", label: "Apariencia", icon: SunMoon },
  { id: "ventas", label: "Ventas", icon: ShoppingCart },
  { id: "inventario", label: "Inventario", icon: Boxes },
  { id: "usuarios", label: "Usuarios", icon: Shield },
  { id: "notif", label: "Notificaciones", icon: Bell },
  { id: "auditoria", label: "Auditoría", icon: ScrollText },
] as const;

type Data = {
  profile: Profile;
  settings: Settings;
  paymentMethods: PaymentMethod[];
  categories: Category[];
  sizes: Size[];
  colors: ColorRow[];
  audit: (AuditLog & { branch?: string })[];
  rate: number;
  canEdit: boolean;
};

export function ConfiguracionView(props: Data) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("perfil");

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-5">
        <h1 className="text-[25px] font-bold tracking-tight text-foreground">
          Configuración
        </h1>
        <p className="mt-1 text-[13.5px] text-text-2">
          Administra tu cuenta, la empresa y los parámetros del sistema
        </p>
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[240px_1fr]">
        <div className="fadeup flex h-max flex-col gap-0.5 rounded-2xl border border-border bg-card p-2 shadow-card-sm">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              data-active={section === s.id}
              className="nav-item flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-text-2"
            >
              <s.icon className="size-[18px]" /> {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-[18px]">
          {section === "perfil" && <PerfilSection {...props} />}
          {section === "empresa" && <EmpresaSection {...props} />}
          {section === "marca" && <ColorsSection {...props} which="primary" />}
          {section === "apariencia" && <AparienciaSection {...props} />}
          {section === "ventas" && <VentasSection {...props} />}
          {section === "inventario" && <InventarioSection {...props} />}
          {section === "usuarios" && <UsuariosSection />}
          {section === "notif" && <NotifSection {...props} />}
          {section === "auditoria" && <AuditoriaSection {...props} />}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
      <div className="mb-4 text-[15px] font-bold tracking-tight text-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function SaveBtn({ label = "Guardar cambios" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      {label}
    </Button>
  );
}

function useToastState(state: FormState) {
  useEffect(() => {
    if (state?.ok) toast.success("Guardado");
    else if (state?.error) toast.error(state.error);
  }, [state]);
}

function Fld({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}

function PerfilSection({ profile, canEdit }: Data) {
  const [state, action] = useActionState<FormState, FormData>(updateMyProfile, null);
  const [avatar, setAvatar] = useState(profile.avatar_url);
  useToastState(state);
  return (
    <Card title="Información personal">
      <form action={action} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <AvatarBubble name={profile.full_name} url={avatar} size={56} />
          <div className="flex flex-col gap-1.5">
            {canEdit && (
              <ImageUpload
                folder="avatars"
                label="Cambiar foto"
                onUploaded={async (url) => {
                  setAvatar(url);
                  const r = await updateAvatar(url);
                  if (r?.error) toast.error(r.error);
                }}
              />
            )}
            <div className="text-[12px] text-text-3">JPG o PNG. Máximo 2 MB.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Nombre completo" name="full_name" defaultValue={profile.full_name} disabled={!canEdit} />
          <Fld label="Cargo" name="role" defaultValue={profile.role} disabled />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Correo" name="email" defaultValue={profile.email} disabled />
          <Fld label="Teléfono" name="phone" defaultValue={profile.phone ?? ""} disabled={!canEdit} />
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <SaveBtn />
          </div>
        )}
      </form>
    </Card>
  );
}

function EmpresaSection({ settings, canEdit }: Data) {
  const [state, action] = useActionState<FormState, FormData>(updateCompany, null);
  const [retention, setRetention] = useState(settings.iva_retention);
  useToastState(state);
  return (
    <Card title="Información de la empresa">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="iva_retention" value={retention ? "true" : "false"} />
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Razón social" name="company_name" defaultValue={settings.company_name ?? ""} disabled={!canEdit} />
          <Fld label="RIF" name="rif" defaultValue={settings.rif ?? ""} disabled={!canEdit} />
        </div>
        <Fld label="Dirección fiscal" name="fiscal_address" defaultValue={settings.fiscal_address ?? ""} disabled={!canEdit} />
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Teléfono" name="phone" defaultValue={settings.phone ?? ""} disabled={!canEdit} />
          <Fld label="Tipo de contribuyente" name="taxpayer_type" defaultValue={settings.taxpayer_type ?? ""} disabled={!canEdit} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3">
          <div>
            <div className="text-[13px] font-semibold text-foreground">Retención de IVA</div>
            <div className="text-[12px] text-text-3">Aplicar retención del 75% en facturas</div>
          </div>
          <Switch checked={retention} onCheckedChange={setRetention} disabled={!canEdit} />
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <SaveBtn />
          </div>
        )}
      </form>
    </Card>
  );
}

function ColorsSection({ settings, canEdit }: Data & { which: "primary" }) {
  const [primary, setPrimary] = useState(settings.primary_color ?? "#0EA5E9");
  const [accent] = useState(settings.accent_color ?? "#0EA5E9");
  const [logo, setLogo] = useState(settings.logo_url);
  const [favicon, setFavicon] = useState(settings.favicon_url);
  const [, start] = useTransition();
  function save(p: string, a: string) {
    start(async () => {
      const res = await updateColors(p, a);
      if (res?.error) toast.error(res.error);
      else toast.success("Marca actualizada");
    });
  }
  return (
    <Card title="Logotipo y marca">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Logotipo</Label>
          <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border p-2 text-[12px] text-text-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="logo" className="max-h-full max-w-full object-contain" />
            ) : (
              "Sube tu logotipo"
            )}
          </div>
          {canEdit && (
            <ImageUpload
              folder="brand"
              label="Subir logotipo"
              onUploaded={async (url) => {
                setLogo(url);
                const r = await updateBrandAsset("logo", url);
                if (r?.error) toast.error(r.error);
              }}
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Favicon</Label>
          <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border p-2 text-[12px] text-text-3">
            {favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={favicon} alt="favicon" className="size-12 object-contain" />
            ) : (
              "PNG 64×64 px"
            )}
          </div>
          {canEdit && (
            <ImageUpload
              folder="brand"
              label="Subir favicon"
              onUploaded={async (url) => {
                setFavicon(url);
                const r = await updateBrandAsset("favicon", url);
                if (r?.error) toast.error(r.error);
              }}
            />
          )}
        </div>
      </div>
      <div className="mt-4 text-[12.5px] font-semibold text-foreground">
        Color primario de marca
      </div>
      <Swatches
        value={primary}
        onChange={(c) => {
          setPrimary(c);
          if (canEdit) save(c, accent);
        }}
        disabled={!canEdit}
      />
    </Card>
  );
}

function AparienciaSection({ settings, canEdit }: Data) {
  const { theme, setTheme } = useTheme();
  const [accent, setAccent] = useState(settings.accent_color ?? "#0EA5E9");
  const [, start] = useTransition();
  return (
    <>
      <Card title="Tema de la interfaz">
        <p className="-mt-2 mb-3 text-[12.5px] text-text-3">
          Cambia entre modo claro y oscuro. Se aplica al instante.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: "light", label: "Claro", icon: Sun },
            { id: "dark", label: "Oscuro", icon: Moon },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "hoverlift flex items-center justify-between rounded-xl border-2 px-4 py-3.5",
                theme === t.id ? "border-brand" : "border-border",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <t.icon className="size-4" /> {t.label}
              </span>
              {theme === t.id && (
                <span className="rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-bold text-white">
                  Activo
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>
      <Card title="Color de acento">
        <Swatches
          value={accent}
          onChange={(c) => {
            setAccent(c);
            if (canEdit)
              start(async () => {
                const res = await updateColors(settings.primary_color ?? c, c);
                if (res?.error) toast.error(res.error);
              });
          }}
          disabled={!canEdit}
        />
      </Card>
    </>
  );
}

function VentasSection({ settings, paymentMethods, rate, canEdit }: Data) {
  const [state, action] = useActionState<FormState, FormData>(updateSales, null);
  const [autoRate, setAutoRate] = useState(settings.auto_update_rate);
  const [, start] = useTransition();
  useToastState(state);
  return (
    <>
      <Card title="Impuestos y moneda">
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="auto_update_rate" value={autoRate ? "true" : "false"} />
          <div className="grid grid-cols-2 gap-3">
            <Fld label="IVA general (%)" name="iva_general" type="number" defaultValue={settings.iva_general} disabled={!canEdit} />
            <Fld label="Moneda principal" name="currency" defaultValue={settings.currency} disabled={!canEdit} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">
                Tasa de cambio · {fmtVES(rate)} por USD
              </div>
              <div className="text-[12px] text-text-3">Fuente: BCV (dolarapi) · en vivo</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-2">Auto diaria</span>
              <Switch checked={autoRate} onCheckedChange={setAutoRate} disabled={!canEdit} />
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <SaveBtn />
            </div>
          )}
        </form>
      </Card>
      <Card title="Métodos de pago">
        <div className="flex flex-wrap gap-2">
          {paymentMethods.map((m) => (
            <button
              key={m.id}
              disabled={!canEdit}
              onClick={() =>
                start(async () => {
                  const res = await togglePaymentMethod(m.id, !m.enabled);
                  if (res?.error) toast.error(res.error);
                })
              }
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition",
                m.enabled
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border bg-card text-text-3",
              )}
            >
              {m.enabled && <Check className="size-3.5" />}
              {m.name}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

function InventarioSection({ categories, sizes, colors, canEdit }: Data) {
  return (
    <>
      <MasterCard title="Categorías" table="categories" items={categories.map((c) => ({ id: c.id, label: c.name, hex: c.color }))} canEdit={canEdit} />
      <MasterCard title="Tallas" table="sizes" items={sizes.map((s) => ({ id: s.id, label: s.label }))} canEdit={canEdit} />
      <MasterCard title="Colores" table="colors" items={colors.map((c) => ({ id: c.id, label: c.name, hex: c.hex }))} canEdit={canEdit} />
    </>
  );
}

function MasterCard({
  title,
  table,
  items,
  canEdit,
}: {
  title: string;
  table: "categories" | "sizes" | "colors";
  items: { id: string; label: string; hex?: string | null }[];
  canEdit: boolean;
}) {
  const [value, setValue] = useState("");
  const [, start] = useTransition();
  return (
    <Card title={title}>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <span
            key={it.id}
            className="group flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-text-2"
          >
            {it.hex && (
              <span className="size-2.5 rounded-full border border-border" style={{ background: it.hex }} />
            )}
            {it.label}
            {canEdit && (
              <button
                onClick={() =>
                  start(async () => {
                    const res = await deleteMaster(table, it.id);
                    if (res?.error) toast.error(res.error);
                  })
                }
                className="text-text-3 hover:text-danger"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Nueva ${title.toLowerCase().slice(0, -1)}…`}
            className="h-9"
          />
          <Button
            onClick={() =>
              start(async () => {
                const res = await addMaster(table, value);
                if (res?.error) toast.error(res.error);
                else setValue("");
              })
            }
            disabled={!value.trim()}
          >
            <Plus className="size-4" /> Agregar
          </Button>
        </div>
      )}
    </Card>
  );
}

function UsuariosSection() {
  return (
    <Card title="Usuarios y control de acceso">
      <p className="-mt-2 mb-4 text-[13px] text-text-2">
        Gestiona usuarios, roles y la matriz de permisos por módulo desde el módulo
        dedicado.
      </p>
      <Link
        href="/usuarios"
        className="hoverlift inline-flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white"
      >
        <Shield className="size-4" /> Abrir módulo de usuarios
      </Link>
    </Card>
  );
}

function NotifSection({ settings, canEdit }: Data) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    low_stock: settings.notifications?.low_stock ?? true,
    daily_sales_email: settings.notifications?.daily_sales_email ?? true,
    realtime_sales: settings.notifications?.realtime_sales ?? true,
    security_events: settings.notifications?.security_events ?? true,
  });
  const [, start] = useTransition();
  const ITEMS = [
    { key: "low_stock", title: "Alertas de stock bajo", desc: "Notificar cuando un producto baje del mínimo" },
    { key: "daily_sales_email", title: "Resumen de ventas por correo", desc: "Reporte diario a las 8:00 p.m." },
    { key: "realtime_sales", title: "Nuevas ventas en tiempo real", desc: "Alertas dentro del sistema" },
    { key: "security_events", title: "Eventos de seguridad", desc: "Inicios de sesión desde nuevos dispositivos" },
  ];
  function toggle(key: string, v: boolean) {
    const next = { ...prefs, [key]: v };
    setPrefs(next);
    start(async () => {
      const res = await updateNotifications(next);
      if (res?.error) toast.error(res.error);
    });
  }
  return (
    <Card title="Preferencias de notificación">
      <div className="flex flex-col gap-2.5">
        {ITEMS.map((it) => (
          <div key={it.key} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">{it.title}</div>
              <div className="text-[12px] text-text-3">{it.desc}</div>
            </div>
            <Switch
              checked={prefs[it.key]}
              onCheckedChange={(v) => toggle(it.key, v)}
              disabled={!canEdit}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function AuditoriaSection({ audit }: Data) {
  return (
    <Card title="Registro de auditoría">
      <div className="grid grid-cols-[1.2fr_2fr_1fr_1.2fr] border-b border-border pb-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
        <span>Usuario</span>
        <span>Acción</span>
        <span>Módulo</span>
        <span>Fecha</span>
      </div>
      {audit.map((a) => (
        <div key={a.id} className="tr-row grid grid-cols-[1.2fr_2fr_1fr_1.2fr] items-center border-b border-border py-2.5 text-[12.5px]">
          <span className="font-medium text-foreground">{a.who ?? "Sistema"}</span>
          <span className="text-text-2">{a.action}</span>
          <span className="text-text-2">{a.module ?? "—"}</span>
          <span className="text-text-3">{fmtDateTime(a.created_at)}</span>
        </div>
      ))}
      {audit.length === 0 && (
        <div className="py-8 text-center text-[12.5px] text-text-3">Sin eventos.</div>
      )}
    </Card>
  );
}

function Swatches({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (c: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 flex gap-2.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={cn(
            "size-8 rounded-full border-2 transition",
            value.toLowerCase() === c.toLowerCase() ? "border-foreground" : "border-transparent",
          )}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

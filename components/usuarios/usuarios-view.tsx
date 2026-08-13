"use client";

import { useMemo, useState, useActionState, useEffect, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Plus, Search, Check, Loader2, Trash2, Mail, Phone, Store, Send, KeyRound, Percent } from "lucide-react";
import {
  saveUser,
  deleteUser,
  resendUserInvite,
  regenerateSellerCode,
  setPermission,
  type FormState,
} from "@/app/(app)/usuarios/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtRelative, initials } from "@/lib/format";
import { permissionLabel } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { Profile, RolePermission } from "@/lib/database.types";

type UserRow = Profile & { branch_city: string | null };
type Branch = { id: string; city: string };

const ROLE_COLOR: Record<string, string> = {
  "Super Admin": "var(--brand)",
  Administrador: "#6366F1",
  Gerente: "var(--success)",
  Vendedor: "var(--warning)",
  Inventario: "#0891B2",
  Cajero: "var(--text-2)",
};

export function UsuariosView({
  users,
  roles,
  modules,
  permissions,
  branches,
  canEdit,
  currentUserId,
  currentRole,
}: {
  users: UserRow[];
  roles: string[];
  modules: string[];
  permissions: RolePermission[];
  branches: Branch[];
  canEdit: boolean;
  currentUserId: string;
  currentRole: string;
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [drawerUser, setDrawerUser] = useState<UserRow | null>(null);
  const [matrixState, setMatrixState] = useState({
    source: permissions,
    value: permissions,
  });
  const [isPending, startTransition] = useTransition();
  const matrix = matrixState.source === permissions ? matrixState.value : permissions;
  const isSuperAdmin = currentRole === "Super Admin";
  const rolesForForm = isSuperAdmin
    ? roles
    : roles.filter((role) => role !== "Super Admin");

  const filtered = useMemo(() => {
    let list = users;
    const q = query.toLowerCase().trim();
    if (q)
      list = list.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q),
      );
    if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    if (branchFilter) list = list.filter((u) => u.branch_city === branchFilter);
    return list;
  }, [users, query, roleFilter, branchFilter]);

  function levelOf(role: string, module: string) {
    return matrix.find((p) => p.role === role && p.module === module)?.level ?? 0;
  }
  function cycle(role: string, module: string) {
    if (!canEdit) return;
    const cur = levelOf(role, module);
    const next = (cur + 1) % 3;
    setMatrixState((state) => {
      const current = state.source === permissions ? state.value : permissions;
      return {
        source: permissions,
        value: current.map((p) =>
          p.role === role && p.module === module ? { ...p, level: next } : p,
        ),
      };
    });
    startTransition(async () => {
      const res = await setPermission(role, module, next);
      if (res?.error) toast.error(res.error);
    });
  }

  function onDelete(u: UserRow) {
    if (!isSuperAdmin) {
      toast.error("Solo un Super Admin puede eliminar usuarios.");
      return;
    }
    if (u.role === "Super Admin" || u.id === currentUserId) {
      toast.error("No se puede eliminar este usuario.");
      return;
    }
    if (!confirm(`¿Eliminar a ${u.full_name}? Se eliminará su acceso al sistema.`)) return;
    startTransition(async () => {
      const res = await deleteUser(u.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(res?.message ?? "Usuario eliminado");
        setFormOpen(false);
        setDrawerUser(null);
      }
    });
  }

  function onResendInvite(u: UserRow) {
    startTransition(async () => {
      const res = await resendUserInvite(u.id);
      if (res?.error) toast.error(res.error);
      else toast.success(res?.message ?? "Invitación enviada");
    });
  }

  function onRegenerateSellerCode(u: UserRow) {
    if (u.role !== "Vendedor") return;
    if (!confirm(`¿Regenerar el código secreto de ${u.full_name}? El código anterior dejará de servir.`)) return;
    startTransition(async () => {
      const res = await regenerateSellerCode(u.id);
      if (res?.error) toast.error(res.error);
      else {
        if (res?.employeeCode) {
          setDrawerUser((current) =>
            current?.id === u.id
              ? { ...current, employee_code: res.employeeCode ?? current.employee_code }
              : current,
          );
        }
        toast.success(res?.message ?? "Código regenerado");
      }
    });
  }

  function canEditUser(u: UserRow) {
    return canEdit && (isSuperAdmin || u.role !== "Super Admin");
  }

  function canDeleteUser(u: UserRow | null) {
    return Boolean(u && isSuperAdmin && u.role !== "Super Admin" && u.id !== currentUserId);
  }

  return (
    <div className="mx-auto max-w-[1560px] px-4 pt-4 pb-8 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px] lg:pb-12">
      <div className="fadeup mb-[18px] flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Usuarios y permisos
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            {users.length} usuarios · {roles.length} roles · control de acceso por módulo
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="hoverlift flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white sm:h-[38px]"
          >
            <Plus className="size-4" /> Nuevo perfil
          </button>
        )}
      </div>

      {/* Users table */}
      <div className="fadeup mb-[18px] overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-text-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuario…"
              className="h-11 w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-9 text-[16px] outline-none sm:h-[38px] sm:text-[13px]"
            />
          </div>
          <Filter value={roleFilter} onChange={setRoleFilter} label="Cargo" options={roles} />
          <Filter value={branchFilter} onChange={setBranchFilter} label="Sucursal" options={branches.map((b) => b.city)} />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[940px]">
            <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_0.9fr_0.9fr_1fr_auto] border-b border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
              <span>Usuario</span>
              <span>Teléfono</span>
              <span>Cargo</span>
              <span>Sucursal</span>
              <span>Estado</span>
              <span>Acceso</span>
              <span>Último acceso</span>
              <span />
            </div>
            {filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => setDrawerUser(u)}
                className="tr-row grid w-full grid-cols-[2fr_1.1fr_1fr_1fr_0.9fr_0.9fr_1fr_auto] items-center border-b border-border px-5 py-3 text-left"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-9 flex-none items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-text-2">
                    {initials(u.full_name)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-foreground">
                      {u.full_name}
                    </div>
                    <div className="truncate text-[11px] text-text-3">
                      {u.email ?? "Sin correo"}
                    </div>
                  </div>
                </div>
                <span className="text-[12px] text-text-2">{u.phone ?? "—"}</span>
                <span>
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: "color-mix(in srgb, " + (ROLE_COLOR[u.role] ?? "var(--text-2)") + " 14%, transparent)",
                      color: ROLE_COLOR[u.role] ?? "var(--text-2)",
                    }}
                  >
                    {u.role}
                  </span>
                </span>
                <span className="text-[12px] text-text-2">{u.branch_city ?? "Todas"}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-text-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: u.status === "Activo" ? "var(--success)" : "var(--text-3)" }}
                  />
                  {u.status}
                </span>
                <span className="text-[12px] text-text-2">
                  {u.system_access ? "Sistema" : "Comisión"}
                </span>
                <span className="text-[12px] text-text-3">{fmtRelative(u.last_sign_in_at)}</span>
                <span />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Permission matrix */}
      <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-[15px] font-bold tracking-tight text-foreground">
              Matriz de permisos
            </div>
            <div className="text-[12.5px] text-text-3">
              Acceso por módulo y rol{canEdit ? " · toca una celda para cambiar" : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-text-2">
            <span className="flex items-center gap-1.5">
              <span className="flex size-4 items-center justify-center rounded bg-brand text-white">
                <Check className="size-3" />
              </span>
              Control total
            </span>
            <span className="flex items-center gap-1.5">
              <span className="rounded bg-surface-2 px-1.5 text-[10px] font-semibold text-text-2">Ver</span>
              Solo lectura
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-text-3">—</span> Sin acceso
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className="grid border-b border-border px-5 py-2.5 text-[11px] font-bold text-text-3"
              style={{ gridTemplateColumns: `1.4fr repeat(${roles.length}, 1fr)` }}
            >
              <span>Módulo</span>
              {roles.map((r) => (
                <span key={r} className="text-center">
                  <span style={{ color: ROLE_COLOR[r] ?? "var(--text-2)" }}>{r}</span>
                </span>
              ))}
            </div>
            {modules.map((m) => (
              <div
                key={m}
                className="tr-row grid items-center border-b border-border px-5 py-2.5"
                style={{ gridTemplateColumns: `1.4fr repeat(${roles.length}, 1fr)` }}
              >
                <span className="text-[12.5px] font-medium text-foreground">{m}</span>
                {roles.map((r) => {
                  const lvl = levelOf(r, m);
                  return (
                    <div key={r} className="flex justify-center">
                      <button
                        onClick={() => cycle(r, m)}
                        disabled={!canEdit}
                        className={cn(
                          "flex h-6 min-w-[34px] items-center justify-center rounded-md text-[10px] font-semibold transition",
                          canEdit && "hover:opacity-80",
                          !canEdit && "cursor-default",
                        )}
                        style={
                          lvl === 2
                            ? { background: "var(--brand)", color: "#fff" }
                            : lvl === 1
                              ? { background: "var(--surface-2)", color: "var(--text-2)" }
                              : { color: "var(--text-3)" }
                        }
                      >
                        {lvl === 2 ? <Check className="size-3.5" /> : lvl === 1 ? "Ver" : "—"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {canEdit && formOpen && (
        <UserForm
          open={formOpen}
          onOpenChange={setFormOpen}
          user={editing}
          roles={rolesForForm}
          branches={branches}
          onDelete={canDeleteUser(editing) ? () => onDelete(editing!) : undefined}
        />
      )}

      {/* User drawer */}
      <Sheet open={!!drawerUser} onOpenChange={(v) => !v && setDrawerUser(null)}>
        <SheetContent className="w-[380px] sm:max-w-[380px]">
          <SheetHeader>
            <SheetTitle>Detalle de usuario</SheetTitle>
          </SheetHeader>
          {drawerUser && (
            <div className="flex flex-col gap-4 px-4">
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-[15px] font-bold text-text-2">
                  {initials(drawerUser.full_name)}
                </span>
                <div>
                  <div className="text-[15px] font-bold text-foreground">
                    {drawerUser.full_name}
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: "color-mix(in srgb, " + (ROLE_COLOR[drawerUser.role] ?? "var(--text-2)") + " 14%, transparent)",
                      color: ROLE_COLOR[drawerUser.role] ?? "var(--text-2)",
                    }}
                  >
                    {drawerUser.role}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-[12.5px] text-text-2">
                <span className="flex items-center gap-2"><Mail className="size-4 text-text-3" />{drawerUser.email ?? "Sin correo"}</span>
                <span className="flex items-center gap-2"><Phone className="size-4 text-text-3" />{drawerUser.phone ?? "—"}</span>
                <span className="flex items-center gap-2"><Store className="size-4 text-text-3" />Sucursal: {drawerUser.branch_city ?? "Todas"}</span>
                <span>Acceso: {drawerUser.system_access ? "Puede iniciar sesión" : "Solo comisiones"}</span>
                {drawerUser.role === "Vendedor" && (
                  <div className="grid gap-2">
                    <span className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2">
                      <span className="flex items-center gap-2">
                        <KeyRound className="size-4 text-text-3" />
                        Código de comisión
                      </span>
                      <span className="font-mono text-[14px] font-bold tracking-[0.18em] text-foreground">
                        {drawerUser.employee_code ?? "----"}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Percent className="size-4 text-text-3" />
                        Comisión
                      </span>
                      <span className="text-[14px] font-bold text-foreground">
                        {Number(drawerUser.commission_pct).toFixed(2)}%
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[12px] font-semibold tracking-wide text-text-3 uppercase">
                Permisos por módulo
              </div>
              <div className="flex flex-col gap-1.5">
                {modules.map((m) => {
                  const lvl = levelOf(drawerUser.role, m);
                  return (
                    <div key={m} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-text-2">{m}</span>
                      <span
                        className="font-medium"
                        style={{
                          color:
                            lvl === 2 ? "var(--brand)" : lvl === 1 ? "var(--text-2)" : "var(--text-3)",
                        }}
                      >
                        {permissionLabel(lvl)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {canEdit && (
                <div className="mt-2 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onResendInvite(drawerUser)}
                    disabled={
                      isPending ||
                      drawerUser.status !== "Activo" ||
                      !drawerUser.system_access ||
                      !drawerUser.email
                    }
                    className="font-semibold"
                  >
                    <Send className="size-4" /> Reenviar acceso
                  </Button>
                  {canEditUser(drawerUser) && (
                    <Button
                      onClick={() => {
                        setEditing(drawerUser);
                        setDrawerUser(null);
                        setFormOpen(true);
                      }}
                      className="font-semibold"
                    >
                      Editar usuario
                    </Button>
                  )}
                  {canEditUser(drawerUser) && drawerUser.role === "Vendedor" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="font-semibold"
                      onClick={() => onRegenerateSellerCode(drawerUser)}
                      disabled={isPending}
                    >
                      <KeyRound className="size-4" /> Regenerar código
                    </Button>
                  )}
                  {canDeleteUser(drawerUser) && (
                    <Button
                      type="button"
                      variant="outline"
                      className="font-semibold text-danger"
                      onClick={() => onDelete(drawerUser)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-4" /> Eliminar usuario
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Filter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-[16px] text-foreground outline-none sm:h-[38px] sm:w-auto sm:text-[12.5px]"
    >
      <option value="">{label}: todos</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Guardar
    </Button>
  );
}

function UserForm({
  open,
  onOpenChange,
  user,
  roles,
  branches,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: UserRow | null;
  roles: string[];
  branches: Branch[];
  onDelete?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(saveUser, null);
  const [systemAccess, setSystemAccess] = useState(user?.system_access ?? false);
  const [role, setRole] = useState(user?.role ?? "Vendedor");

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.ok) {
      toast.success(state.message ?? "Usuario guardado");
      if (state.warning) toast.warning(state.warning);
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{user ? "Editar perfil" : "Crear perfil"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          {user && <input type="hidden" name="id" value={user.id} />}
          {systemAccess && <input type="hidden" name="system_access" value="on" />}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Nombre completo" name="full_name" defaultValue={user?.full_name} required />
            <Fld label="Teléfono" name="phone" defaultValue={user?.phone ?? ""} />
          </div>
          <Fld
            label="Correo"
            name="email"
            type="email"
            defaultValue={user?.email ?? ""}
            required={systemAccess}
            placeholder={systemAccess ? "correo@empresa.com" : "Opcional"}
          />
          {role === "Vendedor" && !user && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12px] text-warning">
              El sistema generará un código secreto de 4 dígitos al guardar.
            </p>
          )}
          {role === "Vendedor" && (
            <Fld
              label="Comisión (%)"
              name="commission_pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={user?.commission_pct ?? 2}
              required
            />
          )}
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
            <div>
              <div className="text-[12.5px] font-semibold text-foreground">
                Acceso al sistema
              </div>
              <div className="text-[11.5px] text-text-3">
                Actívalo solo si este perfil iniciará sesión con correo.
              </div>
            </div>
            <Switch checked={systemAccess} onCheckedChange={setSystemAccess} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Cargo</Label>
              <Select name="role" value={role} onValueChange={(value) => setRole(value as UserRow["role"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sucursal</Label>
              <Select name="branch_id" defaultValue={user?.branch_id ?? "none"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Todas</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Estado</Label>
            <Select name="status" defaultValue={user?.status ?? "Activo"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!user && (
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-[12px] text-brand">
              {systemAccess
                ? "Se creará el perfil y se enviará un correo con el enlace de activación."
                : "Se creará un perfil interno para comisiones, sin correo ni acceso al ERP."}
            </p>
          )}
          {state?.warning && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              {state.warning}
            </p>
          )}
          {state?.error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {state.error}
            </p>
          )}
          <DialogFooter className="justify-between sm:justify-between">
            {onDelete ? (
              <Button type="button" variant="outline" className="text-danger" onClick={onDelete}>
                <Trash2 className="size-4" /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <SubmitButton />
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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

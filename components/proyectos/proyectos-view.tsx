"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  useActionState,
  useTransition,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Eye,
  ExternalLink,
  FileCheck2,
  Keyboard,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  deleteProject,
  deleteRegistration,
  saveProject,
  saveRegistration,
  scanProjectTicket,
  type FormState,
  type TicketScanResult,
} from "@/app/(app)/proyectos/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtByCurrency, fmtDate, fmtUSD, fmtVES, initials } from "@/lib/format";
import { buildProjectTicketEmailHtml } from "@/lib/project-ticket-email";
import { cn } from "@/lib/utils";
import type {
  Project,
  ProjectPaymentMethod,
  ProjectRegistration,
  ProjectRegistrationStatus,
  ProjectTicketStatus,
  ProjectStatus,
} from "@/lib/database.types";

const PROJECT_STATUSES: ProjectStatus[] = ["Borrador", "Abierto", "Cerrado", "Cancelado"];
const REGISTRATION_STATUSES: ProjectRegistrationStatus[] = [
  "Por validar",
  "Confirmado",
  "Cancelado",
];
const PAYMENT_METHODS: ProjectPaymentMethod[] = [
  "Pago móvil",
  "Efectivo USD",
  "Zelle/Zinli",
  "Binance",
  "Cashea",
];

const PROJECT_STATUS_STYLE: Record<ProjectStatus, { bg: string; color: string }> = {
  Borrador: { bg: "var(--surface-2)", color: "var(--text-2)" },
  Abierto: { bg: "var(--success-soft)", color: "var(--success)" },
  Cerrado: { bg: "var(--brand-soft)", color: "var(--brand)" },
  Cancelado: { bg: "var(--danger-soft)", color: "var(--danger)" },
};

const REG_STATUS_STYLE: Record<ProjectRegistrationStatus, { bg: string; color: string }> = {
  "Por validar": { bg: "var(--warning-soft)", color: "var(--warning)" },
  Confirmado: { bg: "var(--success-soft)", color: "var(--success)" },
  Cancelado: { bg: "var(--danger-soft)", color: "var(--danger)" },
};

const TICKET_STATUS_STYLE: Record<ProjectTicketStatus, { bg: string; color: string }> = {
  "No emitido": { bg: "var(--surface-2)", color: "var(--text-3)" },
  Disponible: { bg: "var(--success-soft)", color: "var(--success)" },
  Usado: { bg: "var(--brand-soft)", color: "var(--brand)" },
  Anulado: { bg: "var(--danger-soft)", color: "var(--danger)" },
};

const SCAN_RESULT_STYLE: Record<TicketScanResult["status"], { bg: string; color: string }> = {
  valid: { bg: "var(--success-soft)", color: "var(--success)" },
  used: { bg: "var(--warning-soft)", color: "var(--warning)" },
  cancelled: { bg: "var(--danger-soft)", color: "var(--danger)" },
  not_ready: { bg: "var(--surface-2)", color: "var(--text-2)" },
  invalid: { bg: "var(--danger-soft)", color: "var(--danger)" },
};

export function ProyectosView({
  projects,
  registrations,
  rate,
  canEdit,
}: {
  projects: Project[];
  registrations: ProjectRegistration[];
  rate: number;
  canEdit: boolean;
}) {
  const [projectQuery, setProjectQuery] = useState("");
  const [projectStatus, setProjectStatus] = useState("");
  const [registrationQuery, setRegistrationQuery] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(projects[0]?.id ?? null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [registrationFormOpen, setRegistrationFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingRegistration, setEditingRegistration] =
    useState<ProjectRegistration | null>(null);
  const [previewRegistration, setPreviewRegistration] =
    useState<ProjectRegistration | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const filteredProjects = useMemo(() => {
    const q = projectQuery.toLowerCase().trim();
    return projects.filter((project) => {
      const matchesQuery =
        !q ||
        project.name.toLowerCase().includes(q) ||
        project.location?.toLowerCase().includes(q) ||
        project.description?.toLowerCase().includes(q);
      const matchesStatus = !projectStatus || project.status === projectStatus;
      return matchesQuery && matchesStatus;
    });
  }, [projects, projectQuery, projectStatus]);

  const selected =
    projects.find((project) => project.id === selectedId) ??
    filteredProjects[0] ??
    projects[0] ??
    null;

  const selectedRegistrations = useMemo(() => {
    if (!selected) return [];
    const q = registrationQuery.toLowerCase().trim();
    return registrations.filter((registration) => {
      if (registration.project_id !== selected.id) return false;
      if (registrationStatus && registration.status !== registrationStatus) return false;
      if (!q) return true;
      return [
        registration.first_name,
        registration.last_name,
        registration.document,
        registration.email,
        registration.phone,
        registration.payment_reference ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [registrations, selected, registrationQuery, registrationStatus]);

  const projectCounts = useMemo(() => {
    const byProject = new Map<string, number>();
    for (const registration of registrations) {
      byProject.set(
        registration.project_id,
        (byProject.get(registration.project_id) ?? 0) + 1,
      );
    }
    return byProject;
  }, [registrations]);

  const selectedStats = useMemo(() => {
    const all = selected ? registrations.filter((r) => r.project_id === selected.id) : [];
    const confirmed = all.filter((r) => r.status === "Confirmado").length;
    const pending = all.filter((r) => r.status === "Por validar").length;
    const total = all.reduce((acc, r) => acc + Number(r.amount_usd ?? 0), 0);
    const byMethod = PAYMENT_METHODS.map((method) => ({
      method,
      count: all.filter((r) => r.payment_method === method).length,
    })).filter((item) => item.count > 0);
    return {
      totalCount: all.length,
      confirmed,
      pending,
      cancelled: all.filter((r) => r.status === "Cancelado").length,
      receipts: all.filter((r) => Boolean(r.receipt_url)).length,
      tickets: all.filter((r) => Boolean(r.ticket_hash)).length,
      total,
      byMethod,
    };
  }, [registrations, selected]);

  const globalStats = useMemo(
    () => ({
      open: projects.filter((project) => project.status === "Abierto").length,
      registrations: registrations.length,
      pending: registrations.filter((r) => r.status === "Por validar").length,
      confirmed: registrations.filter((r) => r.status === "Confirmado").length,
    }),
    [projects, registrations],
  );

  function openNewProject() {
    setEditingProject(null);
    setProjectFormOpen(true);
  }

  function openNewRegistration() {
    setEditingRegistration(null);
    setRegistrationFormOpen(true);
  }

  function onDeleteProject(project: Project) {
    if (!confirm(`¿Eliminar el proyecto ${project.name}? También se eliminarán sus inscritos.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteProject(project.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Proyecto eliminado");
        setSelectedId(projects.find((p) => p.id !== project.id)?.id ?? null);
      }
    });
  }

  function onDeleteRegistration(registration: ProjectRegistration) {
    if (!confirm(`¿Eliminar a ${fullName(registration)} de este proyecto?`)) return;
    startTransition(async () => {
      const res = await deleteRegistration(registration.id);
      if (res?.error) toast.error(res.error);
      else toast.success("Inscrito eliminado");
    });
  }

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Proyectos
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            Conferencias, eventos puntuales e inscritos por proyecto
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openNewProject}
            className="hoverlift flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white"
          >
            <Plus className="size-4" /> Nuevo proyecto
          </button>
        )}
      </div>

      <div className="fadeup mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={FileCheck2} label="Proyectos abiertos" value={String(globalStats.open)} />
        <Kpi icon={Users} label="Inscritos totales" value={String(globalStats.registrations)} />
        <Kpi icon={CheckCircle2} label="Confirmados" value={String(globalStats.confirmed)} />
        <Kpi icon={ReceiptText} label="Por validar" value={String(globalStats.pending)} />
      </div>

      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[360px_1fr]">
        <div className="fadeup flex max-h-[780px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-text-3" />
              <input
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="Buscar proyecto…"
                className="h-[36px] w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-9 text-[13px] text-foreground outline-none"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <FilterPill active={!projectStatus} onClick={() => setProjectStatus("")}>
                Todos
              </FilterPill>
              {PROJECT_STATUSES.map((status) => (
                <FilterPill
                  key={status}
                  active={projectStatus === status}
                  onClick={() => setProjectStatus(status)}
                >
                  {status}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedId(project.id)}
                data-active={project.id === selected?.id}
                className="tr-row flex w-full gap-3 border-b border-border px-3 py-3 text-left data-[active=true]:bg-brand-soft"
              >
                <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-xl bg-surface-2 text-[12px] font-bold text-text-2">
                  {initials(project.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-foreground">
                    {project.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-text-3">
                    <span>{fmtDate(project.event_date)}</span>
                    {project.location ? <span>{project.location}</span> : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusBadge status={project.status} />
                    <span className="text-[11.5px] font-medium text-text-2">
                      {projectCounts.get(project.id) ?? 0} inscritos
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {filteredProjects.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="text-[13px] font-semibold text-foreground">
                  Sin proyectos
                </div>
                <div className="mt-1 text-[12px] text-text-3">
                  Crea una conferencia para empezar a registrar inscritos.
                </div>
                {canEdit && (
                  <Button onClick={openNewProject} size="sm" className="mt-4 font-semibold">
                    <Plus className="size-4" /> Crear proyecto
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {selected ? (
          <div className="flex min-w-0 flex-col gap-[18px]">
            <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  {selected.logo_url ? (
                    <span
                      className="mt-0.5 block size-12 flex-none rounded-xl border border-border bg-white bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url("${selected.logo_url}")` }}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[18px] font-bold tracking-tight text-foreground">
                        {selected.name}
                      </h2>
                      <StatusBadge status={selected.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-text-2">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-4 text-text-3" />
                        {fmtDate(selected.event_date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-4 text-text-3" />
                        {selected.location ?? "Sin ubicación"}
                      </span>
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setScannerOpen(true)}
                    >
                      <ScanLine className="size-3.5" /> Escanear QR
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingProject(selected);
                        setProjectFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button size="sm" onClick={openNewRegistration} className="font-semibold">
                      <Plus className="size-3.5" /> Agregar inscrito
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Stat label="Inscritos" value={String(selectedStats.totalCount)} />
                <Stat label="Confirmados" value={String(selectedStats.confirmed)} />
                <Stat label="Por validar" value={String(selectedStats.pending)} />
                <Stat label="Tickets QR" value={String(selectedStats.tickets)} />
                <Stat label="Recaudado" value={fmtUSD(selectedStats.total)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1fr_300px]">
              <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
                <div className="text-[14px] font-bold tracking-tight text-foreground">
                  Resumen
                </div>
                <p className="mt-2 text-[12.5px] leading-5 text-text-2">
                  {selected.description || "Sin descripción registrada."}
                </p>
                {selected.notes ? (
                  <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] leading-5 text-text-2">
                    {selected.notes}
                  </p>
                ) : null}
              </div>

              <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-bold tracking-tight text-foreground">
                  <Wallet className="size-4 text-brand" /> Pagos
                </div>
                <div className="flex flex-col gap-2">
                  {selectedStats.byMethod.map((item) => (
                    <div key={item.method} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-text-2">{item.method}</span>
                      <span className="font-semibold text-foreground">{item.count}</span>
                    </div>
                  ))}
                  {selectedStats.byMethod.length === 0 && (
                    <div className="text-[12px] text-text-3">Sin pagos registrados.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <div className="relative min-w-[240px] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-text-3" />
                  <input
                    value={registrationQuery}
                    onChange={(e) => setRegistrationQuery(e.target.value)}
                    placeholder="Buscar inscrito, cédula o referencia…"
                    className="h-[38px] w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-9 text-[13px] text-foreground outline-none"
                  />
                </div>
                <select
                  value={registrationStatus}
                  onChange={(e) => setRegistrationStatus(e.target.value)}
                  className="h-[38px] rounded-[10px] border border-border bg-card px-3 text-[12.5px] text-foreground outline-none"
                >
                  <option value="">Estado: todos</option>
                  {REGISTRATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1240px]">
                  <div className="grid grid-cols-[1.5fr_0.8fr_1.1fr_1fr_1fr_1.1fr_0.8fr_0.9fr_0.65fr] border-b border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
                    <span>Inscrito</span>
                    <span>Cédula</span>
                    <span>Contacto</span>
                    <span>Pago</span>
                    <span>Referencia</span>
                    <span>Monto</span>
                    <span>Estado</span>
                    <span>Entrada</span>
                    <span />
                  </div>
                  {selectedRegistrations.map((registration) => (
                    <div
                      key={registration.id}
                      className="tr-row grid grid-cols-[1.5fr_0.8fr_1.1fr_1fr_1fr_1.1fr_0.8fr_0.9fr_0.65fr] items-center border-b border-border px-5 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-text-2">
                          {initials(fullName(registration))}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-medium text-foreground">
                            {fullName(registration)}
                          </div>
                          <div className="truncate text-[11px] text-text-3">
                            {registration.email}
                          </div>
                        </div>
                      </div>
                      <span className="text-[12px] text-text-2">{registration.document}</span>
                      <span className="text-[12px] text-text-2">{registration.phone}</span>
                      <span className="text-[12px] font-medium text-foreground">
                        {registration.payment_method}
                      </span>
                      <span className="truncate text-[12px] text-text-2">
                        {registration.payment_reference ?? "—"}
                      </span>
                      <span className="text-[12px] text-text-2">
                        {formatPaymentAmount(registration)}
                      </span>
                      <span>
                        <RegistrationStatusBadge status={registration.status} />
                      </span>
                      <span className="flex items-center gap-1.5">
                        <TicketStatusBadge status={registration.ticket_status} />
                        {registration.ticket_qr_url ? (
                          <button
                            type="button"
                            onClick={() => setPreviewRegistration(registration)}
                            className="iconbtn flex size-7 items-center justify-center rounded-lg text-text-2"
                            title="Ver entrada enviada"
                          >
                            <Eye className="size-4" />
                          </button>
                        ) : null}
                        {registration.ticket_qr_url ? (
                          <a
                            href={registration.ticket_qr_url}
                            target="_blank"
                            rel="noreferrer"
                            className="iconbtn flex size-7 items-center justify-center rounded-lg text-text-2"
                            title="Ver QR de entrada"
                          >
                            <QrCode className="size-4" />
                          </a>
                        ) : null}
                      </span>
                      <span className="flex items-center justify-end gap-1">
                        {registration.receipt_url ? (
                          <a
                            href={registration.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="iconbtn flex size-8 items-center justify-center rounded-lg text-text-2"
                            title="Ver comprobante"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRegistration(registration);
                              setRegistrationFormOpen(true);
                            }}
                            className="iconbtn flex size-8 items-center justify-center rounded-lg text-text-2"
                            title="Editar inscrito"
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  {selectedRegistrations.length === 0 && (
                    <div className="px-5 py-10 text-center text-[12.5px] text-text-3">
                      Sin inscritos para los filtros actuales.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="fadeup rounded-2xl border border-border bg-card p-8 text-center shadow-card-sm">
            <div className="text-[15px] font-bold text-foreground">No hay proyectos todavía</div>
            <p className="mx-auto mt-2 max-w-[420px] text-[12.5px] leading-5 text-text-2">
              Crea el primer proyecto para registrar inscritos de conferencias o eventos puntuales.
            </p>
            {canEdit && (
              <Button onClick={openNewProject} className="mt-5 font-semibold">
                <Plus className="size-4" /> Crear proyecto
              </Button>
            )}
          </div>
        )}
      </div>

      {canEdit && (
        <>
          <ProjectForm
            open={projectFormOpen}
            onOpenChange={setProjectFormOpen}
            project={editingProject}
            onDelete={editingProject ? () => onDeleteProject(editingProject) : undefined}
          />
          <RegistrationForm
            key={editingRegistration?.id ?? selected?.id ?? "registration-form"}
            open={registrationFormOpen}
            onOpenChange={setRegistrationFormOpen}
            project={selected}
            registration={editingRegistration}
            rate={rate}
            onDelete={
              editingRegistration ? () => onDeleteRegistration(editingRegistration) : undefined
            }
          />
        </>
      )}
      <TicketPreviewDialog
        open={Boolean(previewRegistration)}
        onOpenChange={(open) => {
          if (!open) setPreviewRegistration(null);
        }}
        project={selected}
        registration={previewRegistration}
      />
      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onValidated={() => router.refresh()}
      />
    </div>
  );
}

function fullName(registration: ProjectRegistration) {
  return `${registration.first_name} ${registration.last_name}`.trim();
}

function formatPaymentAmount(registration: ProjectRegistration) {
  if (registration.amount == null) return "—";
  if (registration.currency === "VES") {
    return fmtByCurrency(
      registration.amount,
      "VES",
      Number(registration.exchange_rate ?? 0),
    );
  }
  const usd = fmtUSD(registration.amount);
  return registration.exchange_rate
    ? `${usd} · ${fmtVES(Number(registration.amount) * Number(registration.exchange_rate))}`
    : usd;
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-2.5 py-1 text-[12px] font-medium transition",
        active ? "bg-brand-soft text-brand" : "text-text-2 hover:bg-[var(--hover)]",
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const style = PROJECT_STATUS_STYLE[status];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      {status}
    </span>
  );
}

function RegistrationStatusBadge({ status }: { status: ProjectRegistrationStatus }) {
  const style = REG_STATUS_STYLE[status];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      {status}
    </span>
  );
}

function TicketStatusBadge({ status }: { status: ProjectTicketStatus }) {
  const style = TICKET_STATUS_STYLE[status];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      {status}
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="hoverlift flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] text-text-3">{label}</div>
        <div className="text-[18px] font-bold tracking-tight text-foreground">{value}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="text-[11px] text-text-3">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]>;
};
type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

function QrScannerDialog({
  open,
  onOpenChange,
  onValidated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onValidated: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const [manualValue, setManualValue] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<TicketScanResult | null>(null);
  const [pending, startTransition] = useTransition();

  const releaseCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(() => {
    releaseCamera();
    setScanning(false);
  }, [releaseCamera]);

  const validateCode = useCallback(
    (rawValue: string) => {
      const value = rawValue.trim();
      if (!value || processingRef.current) return;
      processingRef.current = true;
      stopCamera();
      startTransition(async () => {
        let res: TicketScanResult;
        try {
          res = await scanProjectTicket(value);
        } catch {
          res = {
            ok: false,
            status: "invalid",
            title: "No se pudo validar",
            message: "Revisa tu conexión o vuelve a iniciar sesión.",
          };
        }
        setResult(res);
        processingRef.current = false;
        if (res.ok) {
          toast.success(res.title);
          onValidated();
        } else {
          toast.error(res.title);
        }
      });
    },
    [onValidated, stopCamera],
  );

  const startCamera = useCallback(async () => {
    setCameraError("");
    setResult(null);
    processingRef.current = false;

    const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!Detector) {
      setCameraError("Este navegador no tiene lector QR nativo. Usa el campo manual.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("No se pudo acceder a la cámara en este navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector = new Detector({ formats: ["qr_code"] });

      const tick = async () => {
        if (!videoRef.current || processingRef.current) return;
        try {
          if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const codes = await detector.detect(videoRef.current);
            const code = codes.find((item) => item.rawValue)?.rawValue;
            if (code) {
              validateCode(code);
              return;
            }
          }
        } catch {
          setCameraError("No se pudo leer el video de la cámara.");
          stopCamera();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraError("Permite el acceso a la cámara para escanear la entrada.");
      stopCamera();
    }
  }, [stopCamera, validateCode]);

  useEffect(() => () => releaseCamera(), [releaseCamera]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      stopCamera();
      setManualValue("");
      setCameraError("");
      setResult(null);
      processingRef.current = false;
    }
    onOpenChange(nextOpen);
  }

  const style = result ? SCAN_RESULT_STYLE[result.status] : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-4 text-brand" /> Lector de entradas
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <div className="relative aspect-[4/3]">
              <video
                ref={videoRef}
                muted
                playsInline
                className="size-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[58%] w-[58%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
              </div>
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-[13px] font-medium text-white">
                  {pending ? "Validando entrada..." : "Cámara en espera"}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                <Camera className="size-4 text-brand" /> Cámara
              </div>
              {cameraError ? (
                <p className="mt-2 text-[12.5px] leading-5 text-danger">{cameraError}</p>
              ) : (
                <p className="mt-2 text-[12.5px] leading-5 text-text-2">
                  Apunta al QR de la entrada hasta que el sistema lo detecte.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startCamera}
                disabled={pending || scanning}
                className="mt-3"
              >
                <Camera className="size-4" /> Activar cámara
              </Button>
            </div>

            <form
              className="rounded-xl border border-border bg-card p-3"
              onSubmit={(event) => {
                event.preventDefault();
                validateCode(manualValue);
              }}
            >
              <Label htmlFor="manual-ticket-code" className="flex items-center gap-2">
                <Keyboard className="size-4 text-text-3" /> Código manual
              </Label>
              <Input
                id="manual-ticket-code"
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                placeholder="WMERP:TICKET:..."
                className="mt-2"
              />
              <Button
                type="submit"
                size="sm"
                disabled={pending || !manualValue.trim()}
                className="mt-3"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Validar entrada
              </Button>
            </form>

            {result ? (
              <div
                className="rounded-xl border border-border p-3"
                style={{ background: style?.bg, color: style?.color }}
              >
                <div className="flex items-center gap-2 text-[13px] font-bold">
                  {result.ok ? <ShieldCheck className="size-4" /> : <XCircle className="size-4" />}
                  {result.title}
                </div>
                <p className="mt-1 text-[12.5px] leading-5">{result.message}</p>
                {result.registration ? (
                  <div className="mt-3 rounded-lg bg-white/70 p-2 text-[12px] text-foreground">
                    <div className="font-semibold">{result.registration.fullName}</div>
                    <div className="mt-1 text-text-2">
                      CI {result.registration.document}
                      {result.project ? ` · ${result.project.name}` : ""}
                    </div>
                    {result.registration.usedAt ? (
                      <div className="mt-1 text-text-3">
                        Leído: {fmtDate(result.registration.usedAt)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setResult(null);
              setManualValue("");
              void startCamera();
            }}
            disabled={pending}
          >
            <RotateCcw className="size-4" /> Escanear otro
          </Button>
          <Button type="button" onClick={() => handleOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketPreviewDialog({
  open,
  onOpenChange,
  project,
  registration,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project | null;
  registration: ProjectRegistration | null;
}) {
  const html = useMemo(() => {
    if (!project || !registration) return "";
    return buildProjectTicketEmailHtml({
      project,
      registration,
      qrSrc: registration.ticket_qr_url ?? "",
      code: registration.ticket_hash ?? "",
    });
  }, [project, registration]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-brand" /> Entrada enviada
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
          <iframe
            title="Vista previa del correo de entrada"
            srcDoc={html}
            className="h-[640px] w-full bg-white"
          />
        </div>
        <DialogFooter>
          {registration?.ticket_qr_url ? (
            <Button asChild variant="outline">
              <a href={registration.ticket_qr_url} target="_blank" rel="noreferrer">
                <QrCode className="size-4" /> Abrir QR
              </a>
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton({ label = "Guardar" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      {label}
    </Button>
  );
}

function ProjectForm({
  open,
  onOpenChange,
  project,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project | null;
  onDelete?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(saveProject, null);

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} encType="multipart/form-data" className="flex flex-col gap-3">
          {project && <input type="hidden" name="id" value={project.id} />}
          <input type="hidden" name="existing_logo_url" value={project?.logo_url ?? ""} />
          <Fld label="Nombre del proyecto" name="name" defaultValue={project?.name} required />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fld
              label="Fecha del evento"
              name="event_date"
              type="date"
              defaultValue={project?.event_date ?? ""}
            />
            <Fld label="Ubicación" name="location" defaultValue={project?.location ?? ""} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Estado</Label>
              <Select name="status" defaultValue={project?.status ?? "Abierto"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Fld
              label="Meta de inscritos"
              name="goal"
              type="number"
              min="0"
              defaultValue={project?.goal ?? ""}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="logo">Logo de la conferencia</Label>
              <input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="h-[38px] rounded-[10px] border border-border bg-card px-3 py-1.5 text-[12.5px] text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-[12px] file:font-medium file:text-foreground"
              />
              {project?.logo_url ? (
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-2">
                  <a
                    href={project.logo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> Ver logo actual
                  </a>
                  <label className="inline-flex items-center gap-1.5">
                    <input name="remove_logo" type="checkbox" className="size-3.5" />
                    Quitar logo
                  </label>
                </div>
              ) : null}
            </div>
            <Fld
              label="Color de acento"
              name="ticket_accent_color"
              type="color"
              defaultValue={project?.ticket_accent_color ?? "#0ea5e9"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Resumen</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={project?.description ?? ""}
            />
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="mb-3 text-[13px] font-bold text-foreground">
              Entrada y correo
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fld
                label="Título de la entrada"
                name="ticket_title"
                defaultValue={project?.ticket_title ?? ""}
                placeholder={project?.name ?? "Nombre del evento"}
              />
              <Fld
                label="Organizador"
                name="organizer_name"
                defaultValue={project?.organizer_name ?? ""}
              />
              <Fld
                label="Correo de contacto"
                name="organizer_email"
                type="email"
                defaultValue={project?.organizer_email ?? ""}
              />
              <Fld
                label="Teléfono de contacto"
                name="organizer_phone"
                defaultValue={project?.organizer_phone ?? ""}
              />
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="ticket_subtitle">Subtítulo visible</Label>
              <Textarea
                id="ticket_subtitle"
                name="ticket_subtitle"
                rows={2}
                defaultValue={project?.ticket_subtitle ?? ""}
              />
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="ticket_details">Información de la entrada</Label>
              <Textarea
                id="ticket_details"
                name="ticket_details"
                rows={3}
                defaultValue={project?.ticket_details ?? ""}
              />
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="ticket_instructions">Indicaciones para el asistente</Label>
              <Textarea
                id="ticket_instructions"
                name="ticket_instructions"
                rows={3}
                defaultValue={project?.ticket_instructions ?? ""}
              />
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="ticket_footer">Pie del correo</Label>
              <Textarea
                id="ticket_footer"
                name="ticket_footer"
                rows={2}
                defaultValue={project?.ticket_footer ?? ""}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas internas</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={project?.notes ?? ""} />
          </div>
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

function RegistrationForm({
  open,
  onOpenChange,
  project,
  registration,
  rate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project | null;
  registration: ProjectRegistration | null;
  rate: number;
  onDelete?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveRegistration,
    null,
  );
  const [method, setMethod] = useState<ProjectPaymentMethod>(
    registration?.payment_method ?? "Pago móvil",
  );
  const requiresReceipt = method !== "Efectivo USD";
  const currency = method === "Pago móvil" ? "VES" : "USD";

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{registration ? "Editar inscrito" : "Agregar inscrito"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} encType="multipart/form-data" className="flex flex-col gap-3">
          {registration && <input type="hidden" name="id" value={registration.id} />}
          <input type="hidden" name="project_id" value={project?.id ?? ""} />
          <input
            type="hidden"
            name="existing_receipt_url"
            value={registration?.receipt_url ?? ""}
          />

          <div className="rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
            Proyecto: <span className="font-semibold text-foreground">{project?.name ?? "—"}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fld
              label="Nombre"
              name="first_name"
              defaultValue={registration?.first_name}
              required
            />
            <Fld
              label="Apellido"
              name="last_name"
              defaultValue={registration?.last_name}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Fld label="Cédula" name="document" defaultValue={registration?.document} required />
            <Fld
              label="Correo"
              name="email"
              type="email"
              defaultValue={registration?.email}
              required
            />
            <Fld label="Teléfono" name="phone" defaultValue={registration?.phone} required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Método de pago</Label>
              <Select
                name="payment_method"
                value={method}
                onValueChange={(value) => setMethod(value as ProjectPaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((paymentMethod) => (
                    <SelectItem key={paymentMethod} value={paymentMethod}>
                      {paymentMethod}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Fld
              label={currency === "VES" ? "Monto Bs." : "Monto USD"}
              name="amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={registration?.amount ?? ""}
              required
            />
            <div className="flex flex-col gap-1.5">
              <Label>Estado</Label>
              <Select name="status" defaultValue={registration?.status ?? "Por validar"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGISTRATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fld
              label={currency === "VES" ? "Tasa BCV usada" : "Tasa BCV del día"}
              name="exchange_rate"
              type="number"
              min="0"
              step="0.0001"
              defaultValue={registration?.exchange_rate ?? rate}
              required={currency === "VES"}
            />
            <Fld
              label="Fecha de pago"
              name="paid_at"
              type="date"
              defaultValue={
                registration?.paid_at ?? new Date().toISOString().slice(0, 10)
              }
              required
            />
          </div>

          {requiresReceipt && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fld
                label="Número de referencia"
                name="payment_reference"
                defaultValue={registration?.payment_reference ?? ""}
                required
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="receipt">Comprobante</Label>
                <input
                  id="receipt"
                  name="receipt"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="h-[38px] rounded-[10px] border border-border bg-card px-3 py-1.5 text-[12.5px] text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-[12px] file:font-medium file:text-foreground"
                />
                {registration?.receipt_url ? (
                  <a
                    href={registration.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> Ver comprobante actual
                  </a>
                ) : (
                  <span className="text-[11.5px] text-text-3">PNG, JPG, WebP o PDF.</span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registration-notes">Notas</Label>
            <Textarea
              id="registration-notes"
              name="notes"
              rows={2}
              defaultValue={registration?.notes ?? ""}
            />
          </div>

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
              <SubmitButton label={registration ? "Guardar" : "Agregar"} />
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
}: { label: string } & ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}

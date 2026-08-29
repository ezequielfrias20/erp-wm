"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
} from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { reportActionError } from "@/lib/action-error";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ScanLine,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  deleteProjectCheckin,
  deleteProjectGroup,
  deleteProjectSession,
  saveProjectGroup,
  saveProjectSession,
  scanCourseSessionTicket,
  type CourseFormState,
} from "@/app/(app)/proyectos/course-actions";
import { CourseQrScanner } from "@/components/proyectos/course-qr-scanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  Project,
  ProjectCheckin,
  ProjectGroup,
  ProjectOrder,
  ProjectRegistrationView,
  ProjectSession,
  ProjectStatus,
} from "@/lib/database.types";

const STATUSES: ProjectStatus[] = ["Borrador", "Abierto", "Cerrado", "Cancelado"];

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Caracas",
  }).format(new Date(value));
}

function inputDateTime(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Caracas",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function CourseSchedulePanel({
  project,
  groups,
  sessions,
  registrations,
  checkins,
  orders,
  canEdit,
  onAddRegistration,
}: {
  project: Project;
  groups: ProjectGroup[];
  sessions: ProjectSession[];
  registrations: ProjectRegistrationView[];
  checkins: ProjectCheckin[];
  orders: ProjectOrder[];
  canEdit: boolean;
  onAddRegistration?: (group: ProjectGroup) => void;
}) {
  const [groupDialog, setGroupDialog] = useState<ProjectGroup | "new" | null>(null);
  const [sessionDialog, setSessionDialog] = useState<{
    group: ProjectGroup;
    session: ProjectSession | null;
  } | null>(null);
  const [scanSession, setScanSession] = useState<ProjectSession | null>(null);
  const [, startTransition] = useTransition();

  const groupIds = useMemo(() => new Set(groups.map((group) => group.id)), [groups]);
  const courseRegistrations = registrations.filter(
    (registration) => registration.group_id && groupIds.has(registration.group_id),
  );

  const scanAction = useCallback(
    (rawValue: string) => scanCourseSessionTicket(rawValue, scanSession?.id ?? ""),
    [scanSession],
  );

  function removeGroup(group: ProjectGroup) {
    if (!confirm(`Eliminar el grupo ${group.name}?`)) return;
    startTransition(async () => {
      try {
        const result = await deleteProjectGroup(group.id);
        if (result?.error) toast.error(result.error);
        else toast.success("Grupo eliminado");
      } catch (error) {
        reportActionError(error, "No se pudo eliminar el grupo.");
      }
    });
  }

  function removeSession(session: ProjectSession) {
    if (!confirm("Eliminar esta jornada y sus registros de asistencia?")) return;
    startTransition(async () => {
      try {
        const result = await deleteProjectSession(session.id);
        if (result?.error) toast.error(result.error);
        else toast.success("Jornada eliminada");
      } catch (error) {
        reportActionError(error, "No se pudo eliminar la jornada.");
      }
    });
  }

  function removeCheckin(checkin: ProjectCheckin) {
    if (!confirm("Revertir esta asistencia?")) return;
    startTransition(async () => {
      try {
        const result = await deleteProjectCheckin(checkin.id);
        if (result?.error) toast.error(result.error);
        else toast.success("Asistencia revertida");
      } catch (error) {
        reportActionError(error, "No se pudo revertir la asistencia.");
      }
    });
  }

  return (
    <section className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-bold text-foreground">
            <CalendarClock className="size-4 text-brand" /> Programacion del curso
          </div>
          <p className="mt-1 text-[12px] text-text-3">
            Horarios, jornadas, cupos y asistencia independiente por cada fecha.
          </p>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setGroupDialog("new")}>
            <Plus className="size-4" /> Nuevo horario
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 border-b border-border bg-surface-2 px-5 py-3 text-center">
        <div><div className="text-[11px] text-text-3">Horarios</div><div className="text-[14px] font-bold text-foreground">{groups.length}</div></div>
        <div><div className="text-[11px] text-text-3">Ordenes pendientes</div><div className="text-[14px] font-bold text-foreground">{orders.filter((order) => order.status === "Por validar").length}</div></div>
        <div><div className="text-[11px] text-text-3">Jornadas</div><div className="text-[14px] font-bold text-foreground">{sessions.length}</div></div>
      </div>

      {project.public_registration_enabled && project.public_slug ? (
        <div className="border-b border-border bg-brand-soft px-5 py-3 text-[12.5px] text-brand">
          <a href={`/cursos/${project.public_slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold hover:underline">
            <ExternalLink className="size-3.5" /> Abrir inscripcion publica
          </a>
        </div>
      ) : null}

      <div className="divide-y divide-border">
        {groups.map((group) => {
          const groupSessions = sessions.filter((session) => session.group_id === group.id);
          const groupRegistrations = courseRegistrations.filter(
            (registration) => registration.group_id === group.id,
          );
          const reserved = groupRegistrations.filter(
            (registration) => registration.status !== "Cancelado",
          ).length;

          return (
            <div key={group.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-bold text-foreground">{group.name}</h3>
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-text-2">
                      {group.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-2">
                    <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" /> {reserved}/{group.capacity} cupos</span>
                    <span>${Number(group.price_usd).toFixed(2)} por estudiante</span>
                    {group.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" /> {group.location}</span> : null}
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setGroupDialog(group)}>
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onAddRegistration?.(group)}>
                      <Plus className="size-3.5" /> Agregar inscrito
                    </Button>
                    <Button variant="outline" size="icon-sm" title="Eliminar grupo" onClick={() => removeGroup(group)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                {groupSessions.map((session) => {
                  const sessionCheckins = checkins.filter((checkin) => checkin.session_id === session.id);
                  return (
                    <div key={session.id} className="border-b border-border px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold text-foreground">
                            {session.title || "Jornada del curso"}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-2">
                            <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" /> {dateTime(session.starts_at)} - {dateTime(session.ends_at).split(", ").at(-1)}</span>
                            <span className="inline-flex items-center gap-1.5"><UserRoundCheck className="size-3.5" /> {sessionCheckins.length} asistencias</span>
                            {session.instructor ? <span>{session.instructor}</span> : null}
                          </div>
                        </div>
                        {canEdit ? (
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" onClick={() => setScanSession(session)}>
                              <ScanLine className="size-3.5" /> Pasar asistencia
                            </Button>
                            <Button variant="outline" size="icon-sm" title="Editar jornada" onClick={() => setSessionDialog({ group, session })}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="icon-sm" title="Eliminar jornada" onClick={() => removeSession(session)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {sessionCheckins.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {sessionCheckins.map((checkin) => {
                            const registration = registrations.find(
                              (item) => item.id === checkin.registration_id,
                            );
                            return (
                              <span key={checkin.id} className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-2 py-1 text-[11px] font-medium text-success">
                                <CheckCircle2 className="size-3" />
                                {registration ? `${registration.first_name} ${registration.last_name}` : "Estudiante"}
                                {canEdit ? (
                                  <button type="button" onClick={() => removeCheckin(checkin)} className="ml-1 text-current opacity-70 hover:opacity-100" title="Revertir asistencia">x</button>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {groupSessions.length === 0 ? (
                  <div className="px-3 py-5 text-center text-[12px] text-text-3">
                    Todavia no hay jornadas para este horario.
                  </div>
                ) : null}
              </div>

              {canEdit ? (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setSessionDialog({ group, session: null })}>
                  <Plus className="size-3.5" /> Agregar jornada
                </Button>
              ) : null}
            </div>
          );
        })}

        {groups.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12.5px] text-text-3">
            Crea el primer horario para definir cupos, precio y jornadas del curso.
          </div>
        ) : null}
      </div>

      <GroupDialog
        key={groupDialog === "new" ? "new" : groupDialog?.id ?? "closed"}
        open={Boolean(groupDialog)}
        onOpenChange={(open) => !open && setGroupDialog(null)}
        project={project}
        group={groupDialog === "new" ? null : groupDialog}
      />
      <SessionDialog
        key={sessionDialog?.session?.id ?? sessionDialog?.group.id ?? "closed"}
        open={Boolean(sessionDialog)}
        onOpenChange={(open) => !open && setSessionDialog(null)}
        group={sessionDialog?.group ?? null}
        session={sessionDialog?.session ?? null}
      />
      <CourseQrScanner
        open={Boolean(scanSession)}
        onOpenChange={(open) => !open && setScanSession(null)}
        scanAction={scanAction}
        title={scanSession ? `Asistencia · ${scanSession.title || "Jornada"}` : "Asistencia"}
      />
    </section>
  );
}

function GroupDialog({
  open,
  onOpenChange,
  project,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  group: ProjectGroup | null;
}) {
  const [state, action] = useActionState<CourseFormState, FormData>(saveProjectGroup, null);
  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[660px]">
        <DialogHeader><DialogTitle>{group ? "Editar horario" : "Nuevo horario"}</DialogTitle></DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          {group ? <input type="hidden" name="id" value={group.id} /> : null}
          <input type="hidden" name="project_id" value={project.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre del horario" name="name" defaultValue={group?.name ?? ""} required />
            <Field label="Enlace corto" name="slug" defaultValue={group?.slug ?? ""} placeholder="grupo-agosto" />
            <Field label="Capacidad" name="capacity" type="number" min="1" step="1" defaultValue={group?.capacity ?? 20} required />
            <Field label="Precio USD" name="price_usd" type="number" min="0.01" step="0.01" defaultValue={group?.price_usd ?? project.default_price_usd ?? ""} required />
            <div className="flex flex-col gap-1.5">
              <Label>Estado</Label>
              <Select name="status" defaultValue={group?.status ?? "Borrador"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Field label="Lugar" name="location" defaultValue={group?.location ?? project.location ?? ""} />
            <Field label="Inscripciones desde" name="registration_opens_at" type="datetime-local" defaultValue={inputDateTime(group?.registration_opens_at ?? project.registration_opens_at)} />
            <Field label="Inscripciones hasta" name="registration_closes_at" type="datetime-local" defaultValue={inputDateTime(group?.registration_closes_at ?? project.registration_closes_at)} />
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="group-notes">Notas</Label><Textarea id="group-notes" name="notes" rows={2} defaultValue={group?.notes ?? ""} /></div>
          {state?.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{state.error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><ActionSubmit /></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SessionDialog({
  open,
  onOpenChange,
  group,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ProjectGroup | null;
  session: ProjectSession | null;
}) {
  const [state, action] = useActionState<CourseFormState, FormData>(saveProjectSession, null);
  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader><DialogTitle>{session ? "Editar jornada" : "Nueva jornada"}</DialogTitle></DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          {session ? <input type="hidden" name="id" value={session.id} /> : null}
          <input type="hidden" name="group_id" value={group?.id ?? ""} />
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">Horario: <strong className="text-foreground">{group?.name}</strong></div>
          <Field label="Nombre de la jornada" name="title" defaultValue={session?.title ?? ""} placeholder="Dia 1" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Inicio" name="starts_at" type="datetime-local" defaultValue={inputDateTime(session?.starts_at ?? null)} required />
            <Field label="Cierre" name="ends_at" type="datetime-local" defaultValue={inputDateTime(session?.ends_at ?? null)} required />
            <Field label="Lugar" name="location" defaultValue={session?.location ?? group?.location ?? ""} />
            <Field label="Instructor" name="instructor" defaultValue={session?.instructor ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="session-notes">Notas</Label><Textarea id="session-notes" name="notes" rows={2} defaultValue={session?.notes ?? ""} /></div>
          {state?.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{state.error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><ActionSubmit /></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof Input>) {
  return <div className="flex flex-col gap-1.5"><Label htmlFor={props.name}>{label}</Label><Input id={props.name} {...props} /></div>;
}

function ActionSubmit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}Guardar</Button>;
}

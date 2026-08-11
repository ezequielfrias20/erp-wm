"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/database.types";

export type CourseFormState = { error?: string; ok?: boolean } | null;
export type CourseScanResult = {
  ok: boolean;
  status: "valid" | "used" | "cancelled" | "not_ready" | "invalid";
  title: string;
  message: string;
  checkinId?: string;
  registration?: {
    id: string;
    fullName: string;
    document: string;
    email: string;
  };
  session?: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
  };
};

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberField(formData: FormData, key: string) {
  const value = Number(field(formData, key));
  return Number.isFinite(value) ? value : null;
}

function dateTimeField(formData: FormData, key: string) {
  const value = field(formData, key);
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00-04:00`;
  return value;
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function ticketHashFromQr(rawValue: string) {
  const value = rawValue.trim();
  const prefixed = value.match(/WMERP:TICKET:([a-fA-F0-9]{32})/);
  if (prefixed?.[1]) return prefixed[1].toLowerCase();
  return /^[a-fA-F0-9]{32}$/.test(value) ? value.toLowerCase() : null;
}

async function requireProjectsEdit() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Debes iniciar sesion." };
  if (!canEdit(session.permissions, "Proyectos")) {
    return { ok: false as const, error: "No tienes permiso para editar proyectos." };
  }
  return { ok: true as const, session };
}

export async function saveProjectGroup(
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const guard = await requireProjectsEdit();
  if (!guard.ok) return { error: guard.error };

  const id = field(formData, "id");
  const projectId = field(formData, "project_id");
  const name = field(formData, "name");
  const capacity = numberField(formData, "capacity");
  const priceUsd = numberField(formData, "price_usd");
  if (!projectId || !name) return { error: "El curso y el nombre del grupo son obligatorios." };
  if (!capacity || !Number.isInteger(capacity) || capacity < 1) {
    return { error: "La capacidad debe ser un numero entero mayor que cero." };
  }
  if (!priceUsd || priceUsd <= 0) return { error: "El precio debe ser mayor que cero." };

  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_type")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { error: projectError.message };
  if (!project || project.project_type !== "Curso") {
    return { error: "Los grupos solo pueden agregarse a proyectos de tipo Curso." };
  }

  if (id) {
    const { count, error: countError } = await supabase
      .from("project_registrations")
      .select("id", { count: "exact", head: true })
      .eq("group_id", id)
      .in("status", ["Por validar", "Confirmado"]);
    if (countError) return { error: countError.message };
    if ((count ?? 0) > capacity) {
      return { error: `La capacidad no puede ser menor que los ${count} cupos ya reservados.` };
    }
  }

  const values = {
    project_id: projectId,
    name,
    slug: slug(field(formData, "slug") || name),
    capacity,
    price_usd: priceUsd,
    status: (field(formData, "status") || "Borrador") as ProjectStatus,
    registration_opens_at: dateTimeField(formData, "registration_opens_at"),
    registration_closes_at: dateTimeField(formData, "registration_closes_at"),
    location: field(formData, "location") || null,
    notes: field(formData, "notes") || null,
  };

  const result = id
    ? await supabase.from("project_groups").update(values).eq("id", id)
    : await supabase.from("project_groups").insert(values);
  if (result.error) {
    if (result.error.code === "23505") return { error: "Ya existe un grupo con ese enlace." };
    return { error: result.error.message };
  }

  await audit(`${id ? "Edito" : "Creo"} el grupo ${name}`, "Proyectos");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function deleteProjectGroup(id: string): Promise<CourseFormState> {
  const guard = await requireProjectsEdit();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();
  const { count } = await supabase
    .from("project_registrations")
    .select("id", { count: "exact", head: true })
    .eq("group_id", id);
  if ((count ?? 0) > 0) {
    return { error: "No puedes eliminar un grupo que ya tiene estudiantes inscritos. Cierralo en su lugar." };
  }
  const { error } = await supabase.from("project_groups").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Elimino un grupo de curso", "Proyectos", "warn");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function saveProjectSession(
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const guard = await requireProjectsEdit();
  if (!guard.ok) return { error: guard.error };
  const id = field(formData, "id");
  const groupId = field(formData, "group_id");
  const startsAt = dateTimeField(formData, "starts_at");
  const endsAt = dateTimeField(formData, "ends_at");
  if (!groupId || !startsAt || !endsAt) {
    return { error: "El grupo, la fecha de inicio y la fecha de cierre son obligatorios." };
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return { error: "La hora de cierre debe ser posterior a la hora de inicio." };
  }

  const supabase = await createClient();
  const values = {
    group_id: groupId,
    title: field(formData, "title") || null,
    starts_at: startsAt,
    ends_at: endsAt,
    location: field(formData, "location") || null,
    instructor: field(formData, "instructor") || null,
    notes: field(formData, "notes") || null,
    sort_order: numberField(formData, "sort_order") ?? 0,
  };
  const result = id
    ? await supabase.from("project_sessions").update(values).eq("id", id)
    : await supabase.from("project_sessions").insert(values);
  if (result.error) return { error: result.error.message };
  await audit(`${id ? "Edito" : "Creo"} una jornada de curso`, "Proyectos");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function deleteProjectSession(id: string): Promise<CourseFormState> {
  const guard = await requireProjectsEdit();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("project_sessions").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Elimino una jornada de curso", "Proyectos", "warn");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function scanCourseSessionTicket(
  rawValue: string,
  sessionId: string,
): Promise<CourseScanResult> {
  const guard = await requireProjectsEdit();
  if (!guard.ok) {
    return { ok: false, status: "invalid", title: "Sin permiso", message: guard.error };
  }
  const hash = ticketHashFromQr(rawValue);
  if (!hash || !sessionId) {
    return {
      ok: false,
      status: "invalid",
      title: "QR no reconocido",
      message: "Selecciona una jornada y escanea un QR emitido por el ERP.",
    };
  }

  const supabase = await createClient();
  const { data: courseSession, error: sessionError } = await supabase
    .from("project_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !courseSession) {
    return { ok: false, status: "invalid", title: "Jornada no encontrada", message: "La jornada seleccionada no existe." };
  }
  const { data: group } = await supabase
    .from("project_groups")
    .select("id")
    .eq("id", courseSession.group_id)
    .maybeSingle();
  if (!group) {
    return { ok: false, status: "invalid", title: "Grupo no encontrado", message: "La jornada no pertenece a un grupo valido." };
  }

  const { data: registration, error: registrationError } = await supabase
    .from("project_registrations")
    .select("id, group_id, first_name, last_name, document, email, status, ticket_status")
    .eq("ticket_hash", hash)
    .maybeSingle();
  if (registrationError || !registration || registration.group_id !== group.id) {
    return { ok: false, status: "invalid", title: "Inscripcion no encontrada", message: "Este QR no corresponde al grupo de la jornada seleccionada." };
  }
  const scanSession = {
    id: courseSession.id,
    title: courseSession.title || "Jornada del curso",
    startsAt: courseSession.starts_at,
    endsAt: courseSession.ends_at,
  };
  const scanRegistration = {
    id: registration.id,
    fullName: `${registration.first_name} ${registration.last_name}`.trim(),
    document: registration.document,
    email: registration.email,
  };
  if (registration.status === "Cancelado" || registration.ticket_status === "Anulado") {
    return { ok: false, status: "cancelled", title: "Inscripcion anulada", message: "No debe permitirse el acceso.", registration: scanRegistration, session: scanSession };
  }
  if (registration.status !== "Confirmado" || registration.ticket_status !== "Disponible") {
    return { ok: false, status: "not_ready", title: "Entrada no disponible", message: "El pago aun no esta confirmado.", registration: scanRegistration, session: scanSession };
  }

  const { data: checkin, error: checkinError } = await supabase
    .from("project_checkins")
    .insert({
      registration_id: registration.id,
      session_id: sessionId,
      checked_in_by: guard.session.profile.id,
    })
    .select("id")
    .single();
  if (checkinError?.code === "23505") {
    return { ok: false, status: "used", title: "Asistencia ya registrada", message: "Este estudiante ya ingreso a esta jornada.", registration: scanRegistration, session: scanSession };
  }
  if (checkinError) {
    return { ok: false, status: "invalid", title: "No se pudo validar", message: checkinError.message };
  }

  await audit(`Registro asistencia de ${scanRegistration.fullName}`, "Proyectos");
  revalidatePath("/proyectos");
  return {
    ok: true,
    status: "valid",
    title: "Asistencia registrada",
    message: "Puede permitir el acceso a esta jornada.",
    checkinId: checkin.id,
    registration: scanRegistration,
    session: scanSession,
  };
}

export async function deleteProjectCheckin(id: string): Promise<CourseFormState> {
  const guard = await requireProjectsEdit();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("project_checkins").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Revirtio una asistencia de curso", "Proyectos", "warn");
  revalidatePath("/proyectos");
  return { ok: true };
}

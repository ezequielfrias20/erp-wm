"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/queries/session";
import { canEdit } from "@/lib/permissions";
import { storagePathFromPublicUrl } from "@/lib/storage-path";
import {
  buildProjectPaymentRejectedEmailHtml,
  buildProjectPaymentRejectedEmailText,
  buildProjectTicketEmailHtml,
  buildProjectTicketEmailText,
} from "@/lib/project-ticket-email";
import type {
  Project,
  ProjectGroup,
  ProjectPaymentMethod,
  ProjectRegistration,
  ProjectRegistrationStatus,
  ProjectSession,
  ProjectStatus,
  ProjectType,
} from "@/lib/database.types";

export type FormState = { error?: string; ok?: boolean } | null;
export type TicketScanResult = {
  ok: boolean;
  status: "valid" | "used" | "cancelled" | "not_ready" | "invalid";
  title: string;
  message: string;
  registration?: {
    id: string;
    fullName: string;
    document: string;
    email: string;
    phone: string;
    ticketStatus: string;
    usedAt: string | null;
  };
  project?: {
    id: string;
    name: string;
    eventDate: string | null;
    location: string | null;
  };
};
type Supabase = Awaited<ReturnType<typeof createClient>>;

const NON_CASH_METHODS = new Set<ProjectPaymentMethod>([
  "Pago móvil",
  "Zelle/Zinli",
  "Binance",
  "Cashea",
]);
const PAYMENT_REFERENCE_RE = /^[A-Za-z0-9._-]{1,120}$/;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberOrNull(value: string) {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function caracasDateTime(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00-04:00`;
  return value;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function currencyFor(method: ProjectPaymentMethod): "USD" | "VES" {
  return method === "Pago móvil" ? "VES" : "USD";
}

function cleanHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#0ea5e9";
}

function publicSlug(value: string) {
  if (!value) return null;
  const slug = value.toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

function ticketHash() {
  return crypto.randomUUID().replaceAll("-", "");
}

function ticketPayload(hash: string) {
  return `WMERP:TICKET:${hash}`;
}

function normalizeComparable(value: string) {
  return value.trim().toLowerCase();
}

function referencesConflict(stored: string, requested: string) {
  const storedRef = normalizeComparable(stored);
  const requestedRef = normalizeComparable(requested);
  return storedRef === requestedRef || storedRef.startsWith(`${requestedRef}-`);
}

function whatsappLink(project: Project, registration: ProjectRegistration) {
  const raw = process.env.CONFERENCES_WHATSAPP || project.organizer_phone || "584222069785";
  let phone = raw.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = `58${phone.slice(1)}`;
  const message = encodeURIComponent(
    `Hola, mi pago de ${project.name} no fue aprobado. Soy ${registration.first_name} ${registration.last_name}, cédula ${registration.document}. Referencia: ${registration.payment_reference || "N/A"}.`,
  );
  return `https://wa.me/${phone}?text=${message}`;
}

function ticketHashFromQr(rawValue: string) {
  const value = rawValue.trim();
  const prefixed = value.match(/WMERP:TICKET:([a-fA-F0-9]{32})/);
  if (prefixed?.[1]) return prefixed[1].toLowerCase();
  const direct = value.match(/^[a-fA-F0-9]{32}$/);
  if (direct) return value.toLowerCase();
  return null;
}

function scanResultFromRegistration(
  registration: Pick<
    ProjectRegistration,
    | "id"
    | "first_name"
    | "last_name"
    | "document"
    | "email"
    | "phone"
    | "ticket_status"
    | "ticket_used_at"
  >,
  project: Pick<Project, "id" | "name" | "event_date" | "location"> | null,
  overrides: Pick<TicketScanResult, "ok" | "status" | "title" | "message">,
): TicketScanResult {
  return {
    ...overrides,
    registration: {
      id: registration.id,
      fullName: `${registration.first_name} ${registration.last_name}`.trim(),
      document: registration.document,
      email: registration.email,
      phone: registration.phone,
      ticketStatus: registration.ticket_status,
      usedAt: registration.ticket_used_at,
    },
    project: project
      ? {
          id: project.id,
          name: project.name,
          eventDate: project.event_date,
          location: project.location,
        }
      : undefined,
  };
}

function fileFrom(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

async function uploadReceipt(file: File, projectId: string) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("El comprobante supera los 5 MB.");
  }

  const allowed = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
  ]);
  if (file.type && !allowed.has(file.type)) {
    throw new Error("El comprobante debe ser una imagen PNG/JPG/WebP o PDF.");
  }

  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `projects/${projectId}/receipts/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("wm-public")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("wm-public").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadProjectLogo(file: File, projectId: string) {
  if (file.size > 3 * 1024 * 1024) {
    throw new Error("El logo supera los 3 MB.");
  }

  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (file.type && !allowed.has(file.type)) {
    throw new Error("El logo debe ser PNG, JPG o WebP.");
  }

  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `projects/${projectId}/brand/logo.${ext}`;
  const { error } = await supabase.storage
    .from("wm-public")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "image/png",
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabase.storage.from("wm-public").getPublicUrl(path);
  return data.publicUrl;
}

async function createQr(publicPayload: string) {
  const dataUrl = await QRCode.toDataURL(publicPayload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  return dataUrl.split(",")[1] ?? "";
}

async function uploadTicketQr(
  supabase: Supabase,
  projectId: string,
  hash: string,
  qrBase64: string,
) {
  const path = `projects/${projectId}/tickets/${hash}.png`;
  const { error } = await supabase.storage
    .from("wm-public")
    .upload(path, Buffer.from(qrBase64, "base64"), {
      cacheControl: "3600",
      contentType: "image/png",
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabase.storage.from("wm-public").getPublicUrl(path);
  return data.publicUrl;
}

async function getRegistration(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from("project_registrations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function getProject(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function sendTicketEmail({
  to,
  projectName,
  project,
  registration,
  hash,
  qrBase64,
  courseGroup,
  courseSessions,
}: {
  to: string;
  projectName: string;
  project: Project;
  registration: ProjectRegistration;
  hash: string;
  qrBase64: string;
  courseGroup?: ProjectGroup | null;
  courseSessions?: ProjectSession[];
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("Configura RESEND_API_KEY y RESEND_FROM para enviar entradas.");
  }

  const html = buildProjectTicketEmailHtml({
    project,
    registration,
    qrSrc: "cid:ticket-qr",
    code: hash,
    courseGroup,
    courseSessions,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // Sin plazo, un Resend que no responda deja la acción colgada indefinidamente.
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Entrada confirmada · ${projectName}`,
      html,
      text: buildProjectTicketEmailText({
        project,
        registration,
        code: hash,
        courseGroup,
        courseSessions,
      }),
      attachments: [
        {
          content: qrBase64,
          filename: "entrada-qr.png",
          content_id: "ticket-qr",
        },
      ],
      tags: [
        { name: "module", value: "proyectos" },
        { name: "type", value: "ticket" },
      ],
    }),
  });

  const payload = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok) {
    throw new Error(payload?.message ?? `Resend respondió ${res.status}.`);
  }
  return payload?.id ?? null;
}

async function sendPaymentRejectedEmail({
  to,
  project,
  registration,
}: {
  to: string;
  project: Project;
  registration: ProjectRegistration;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("Configura RESEND_API_KEY y RESEND_FROM para enviar correos.");
  }

  const contactUrl = whatsappLink(project, registration);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // Sin plazo, un Resend que no responda deja la acción colgada indefinidamente.
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Pago no aprobado · ${project.name}`,
      html: buildProjectPaymentRejectedEmailHtml({
        project,
        registration,
        whatsappUrl: contactUrl,
      }),
      text: buildProjectPaymentRejectedEmailText({
        project,
        registration,
        whatsappUrl: contactUrl,
      }),
      tags: [
        { name: "module", value: "proyectos" },
        { name: "type", value: "payment_rejected" },
      ],
    }),
  });

  const payload = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) {
    throw new Error(payload?.message ?? `Resend respondió ${res.status}.`);
  }
}

async function issueAndSendTicket(
  supabase: Supabase,
  registrationId: string,
  opts: { forceEmail?: boolean } = {},
): Promise<FormState> {
  let registration = await getRegistration(supabase, registrationId);
  if (registration.status !== "Confirmado") return { ok: true };

  const hash = registration.ticket_hash ?? ticketHash();
  const payload = registration.ticket_payload ?? ticketPayload(hash);
  const qrBase64 = await createQr(payload);
  const qrUrl =
    registration.ticket_qr_url ??
    (await uploadTicketQr(supabase, registration.project_id, hash, qrBase64));

  const { error: ticketError } = await supabase
    .from("project_registrations")
    .update({
      ticket_hash: hash,
      ticket_payload: payload,
      ticket_qr_url: qrUrl,
      ticket_status: registration.ticket_status === "Usado" ? "Usado" : "Disponible",
      ticket_issued_at: registration.ticket_issued_at ?? new Date().toISOString(),
    })
    .eq("id", registration.id);
  if (ticketError) return { error: ticketError.message };

  registration = {
    ...registration,
    ticket_hash: hash,
    ticket_payload: payload,
    ticket_qr_url: qrUrl,
  };

  if (registration.ticket_email_sent_at && !opts.forceEmail) return { ok: true };

  const project = await getProject(supabase, registration.project_id);
  if (!project) return { error: "No se encontró el proyecto para enviar la entrada." };
  let courseGroup: ProjectGroup | null = null;
  let courseSessions: ProjectSession[] = [];
  if (registration.group_id) {
    const [groupResult, sessionsResult] = await Promise.all([
      supabase.from("project_groups").select("*").eq("id", registration.group_id).maybeSingle(),
      supabase
        .from("project_sessions")
        .select("*")
        .eq("group_id", registration.group_id)
        .order("starts_at", { ascending: true }),
    ]);
    courseGroup = groupResult.data;
    courseSessions = sessionsResult.data ?? [];
  }
  try {
    const emailId = await sendTicketEmail({
      to: registration.email,
      projectName: project.name,
      project,
      registration: {
        ...registration,
        ticket_hash: hash,
        ticket_payload: payload,
        ticket_qr_url: qrUrl,
        ticket_status: registration.ticket_status === "Usado" ? "Usado" : "Disponible",
      },
      hash,
      qrBase64,
      courseGroup,
      courseSessions,
    });
    const { error } = await supabase
      .from("project_registrations")
      .update({
        ticket_email_sent_at: new Date().toISOString(),
        ticket_email_id: emailId,
      })
      .eq("id", registration.id);
    if (error) return { error: error.message };
  } catch (e) {
    return {
      error:
        "Pago confirmado y QR generado, pero no se pudo enviar el correo: " +
        (e instanceof Error ? e.message : "error desconocido."),
    };
  }

  return { ok: true };
}

async function sendRejectedPaymentNotice(
  supabase: Supabase,
  registrationId: string,
): Promise<FormState> {
  const registration = await getRegistration(supabase, registrationId);
  const project = await getProject(supabase, registration.project_id);
  if (!project) return { error: "No se encontró el proyecto para enviar el correo." };

  try {
    await sendPaymentRejectedEmail({
      to: registration.email,
      project,
      registration,
    });
  } catch (e) {
    return {
      error:
        "Inscripción cancelada, pero no se pudo enviar el correo: " +
        (e instanceof Error ? e.message : "error desconocido."),
    };
  }

  return { ok: true };
}

export async function saveProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  const projectId = id || crypto.randomUUID();
  const name = text(formData, "name");
  const existingLogoUrl = text(formData, "existing_logo_url") || null;
  const logoFile = fileFrom(formData, "logo");
  const removeLogo = text(formData, "remove_logo") === "on";
  const projectType = (text(formData, "project_type") || "Evento") as ProjectType;
  const requestedPublicSlug = text(formData, "public_slug");
  const normalizedPublicSlug = publicSlug(requestedPublicSlug);
  const publicRegistrationEnabled = text(formData, "public_registration_enabled") === "on";
  if (!name) return { error: "El nombre del proyecto es obligatorio." };
  if (requestedPublicSlug && !normalizedPublicSlug) {
    return { error: "El enlace publico solo puede usar letras minusculas, numeros y guiones." };
  }
  if (projectType === "Curso" && publicRegistrationEnabled && !normalizedPublicSlug) {
    return { error: "Define un enlace publico para habilitar las inscripciones del curso." };
  }

  let logoUrl = removeLogo ? null : existingLogoUrl;
  try {
    if (logoFile) logoUrl = await uploadProjectLogo(logoFile, projectId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo subir el logo." };
  }

  const values = {
    name,
    description: text(formData, "description") || null,
    event_date: text(formData, "event_date") || null,
    location: text(formData, "location") || null,
    logo_url: logoUrl,
    ticket_title: text(formData, "ticket_title") || null,
    ticket_subtitle: text(formData, "ticket_subtitle") || null,
    ticket_details: text(formData, "ticket_details") || null,
    ticket_instructions: text(formData, "ticket_instructions") || null,
    ticket_footer: text(formData, "ticket_footer") || null,
    ticket_accent_color: cleanHexColor(text(formData, "ticket_accent_color") || "#0ea5e9"),
    organizer_name: text(formData, "organizer_name") || null,
    organizer_email: text(formData, "organizer_email") || null,
    organizer_phone: text(formData, "organizer_phone") || null,
    project_type: projectType,
    public_slug: projectType === "Curso" ? normalizedPublicSlug : null,
    public_registration_enabled:
      projectType === "Curso" ? publicRegistrationEnabled : false,
    registration_opens_at:
      projectType === "Curso" ? caracasDateTime(text(formData, "registration_opens_at")) : null,
    registration_closes_at:
      projectType === "Curso" ? caracasDateTime(text(formData, "registration_closes_at")) : null,
    default_price_usd:
      projectType === "Curso" ? numberOrNull(text(formData, "default_price_usd")) : null,
    registration_payment_instructions:
      projectType === "Curso" ? text(formData, "registration_payment_instructions") || null : null,
    timezone: projectType === "Curso" ? text(formData, "timezone") || "America/Caracas" : "America/Caracas",
    status: (text(formData, "status") || "Abierto") as ProjectStatus,
    goal: numberOrNull(text(formData, "goal")),
    notes: text(formData, "notes") || null,
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("projects").update(values).eq("id", id);
    if (error) return { error: error.message };
    const oldPath = existingLogoUrl ? storagePathFromPublicUrl(existingLogoUrl, "wm-public") : null;
    const shouldRemoveOldLogo = (removeLogo || logoFile) && oldPath && existingLogoUrl !== logoUrl;
    if (shouldRemoveOldLogo) {
      try {
        await supabase.storage.from("wm-public").remove([oldPath]);
      } catch {
        // El proyecto se guardó; la limpieza del logo anterior es best-effort.
      }
    }
    await audit(`Editó el proyecto ${name}`, "Proyectos");
  } else {
    const { error } = await supabase.from("projects").insert({ id: projectId, ...values });
    if (error) return { error: error.message };
    await audit(`Creó el proyecto ${name}`, "Proyectos");
  }

  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteProject(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("logo_url")
    .eq("id", id)
    .maybeSingle();
  const { data: files } = await supabase
    .from("project_registrations")
    .select("receipt_url, receipt_storage_path, ticket_qr_url")
    .eq("project_id", id);

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: error.message };

  const paths =
    [
      project?.logo_url ? storagePathFromPublicUrl(project.logo_url, "wm-public") : null,
      ...(files?.flatMap((r) => [
        r.receipt_url ? storagePathFromPublicUrl(r.receipt_url, "wm-public") : null,
        r.ticket_qr_url ? storagePathFromPublicUrl(r.ticket_qr_url, "wm-public") : null,
      ]) ?? []),
    ]
      .filter((p): p is string => Boolean(p)) ?? [];
  if (paths.length) {
    try {
      await supabase.storage.from("wm-public").remove(paths);
    } catch {
      // El proyecto ya fue eliminado; la limpieza de archivos es best-effort.
    }
  }
  const privatePaths = [
    ...new Set(
      (files ?? [])
        .map((registration) => registration.receipt_storage_path)
        .filter((path): path is string => Boolean(path)),
    ),
  ];
  if (privatePaths.length) {
    try {
      await supabase.storage.from("wm-private").remove(privatePaths);
    } catch {
      // El proyecto ya fue eliminado; la limpieza privada es best-effort.
    }
  }

  await audit("Eliminó un proyecto", "Proyectos", "warn");
  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveRegistration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  const projectId = text(formData, "project_id");
  const requestedGroupId = text(formData, "group_id") || null;
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  const document = text(formData, "document");
  const email = text(formData, "email");
  const phone = text(formData, "phone");
  const paymentMethod = (text(formData, "payment_method") || "Pago móvil") as ProjectPaymentMethod;
  const paymentReference = text(formData, "payment_reference") || null;
  const existingReceiptUrl = text(formData, "existing_receipt_url") || null;
  const existingReceiptStoragePath =
    text(formData, "existing_receipt_storage_path") || null;
  const receiptFile = fileFrom(formData, "receipt");
  const currency = currencyFor(paymentMethod);
  const amount = numberOrNull(text(formData, "amount"));
  const exchangeRate = numberOrNull(text(formData, "exchange_rate"));
  const paidAt = text(formData, "paid_at") || new Date().toISOString().slice(0, 10);

  if (!projectId) return { error: "Selecciona un proyecto." };
  if (!firstName || !lastName || !document || !email || !phone) {
    return { error: "Nombre, apellido, cédula, correo y teléfono son obligatorios." };
  }
  if (amount == null || amount <= 0) {
    return { error: "Ingresa el monto pagado." };
  }
  if (currency === "VES" && (!exchangeRate || exchangeRate <= 0)) {
    return { error: "Ingresa la tasa BCV usada para este pago en bolívares." };
  }
  if (NON_CASH_METHODS.has(paymentMethod) && !paymentReference) {
    return { error: "La referencia es obligatoria para este método de pago." };
  }
  if (NON_CASH_METHODS.has(paymentMethod) && paymentReference && !PAYMENT_REFERENCE_RE.test(paymentReference)) {
    return { error: "Introduce una referencia de pago válida." };
  }
  if (
    NON_CASH_METHODS.has(paymentMethod) &&
    !receiptFile &&
    !existingReceiptUrl &&
    !existingReceiptStoragePath
  ) {
    return { error: "El comprobante es obligatorio para este método de pago." };
  }

  const supabase = await createClient();
  const existing = id ? await getRegistration(supabase, id).catch(() => null) : null;
  const project = await getProject(supabase, projectId);
  if (!project) return { error: "No se encontro el proyecto." };

  const groupId = requestedGroupId ?? existing?.group_id ?? null;
  if (project.project_type === "Curso" && !groupId) {
    return { error: "Selecciona el grupo u horario del curso." };
  }
  if (groupId) {
    const { data: group, error: groupError } = await supabase
      .from("project_groups")
      .select("id")
      .eq("id", groupId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (groupError) return { error: groupError.message };
    if (!group) return { error: "El grupo seleccionado no pertenece a este curso." };
  }
  if (paymentReference) {
    let duplicateQuery = supabase
      .from("project_registrations")
      .select("id, payment_reference")
      .ilike("payment_reference", `${paymentReference}%`)
      .limit(20);
    if (id) duplicateQuery = duplicateQuery.neq("id", id);
    const { data: duplicated, error: duplicateError } = await duplicateQuery;
    if (duplicateError) return { error: duplicateError.message };
    if ((duplicated ?? []).some((row) => row.payment_reference && referencesConflict(row.payment_reference, paymentReference))) {
      return { error: "Ese número de referencia ya existe." };
    }
  }

  let duplicateDocument = supabase
    .from("project_registrations")
    .select("id")
    .eq("project_id", projectId)
    .ilike("document", document)
    .limit(1);
  if (id) duplicateDocument = duplicateDocument.neq("id", id);
  const { data: sameDocument, error: documentError } = await duplicateDocument.maybeSingle();
  if (documentError) return { error: documentError.message };
  if (sameDocument) {
    return { error: "Ya existe una inscripción con esa cédula o documento." };
  }

  let duplicateEmail = supabase
    .from("project_registrations")
    .select("id")
    .eq("project_id", projectId)
    .ilike("email", email)
    .limit(1);
  if (id) duplicateEmail = duplicateEmail.neq("id", id);
  const { data: sameEmail, error: emailError } = await duplicateEmail.maybeSingle();
  if (emailError) return { error: emailError.message };
  if (sameEmail) {
    return { error: "Ya existe una inscripción con ese correo." };
  }

  let receiptUrl = existingReceiptUrl;
  let receiptStoragePath = existingReceiptStoragePath;
  try {
    if (receiptFile) {
      receiptUrl = await uploadReceipt(receiptFile, projectId);
      receiptStoragePath = null;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo subir el comprobante." };
  }

  const values = {
    project_id: projectId,
    group_id: groupId,
    order_id: existing?.order_id ?? null,
    first_name: firstName,
    last_name: lastName,
    document,
    email,
    phone,
    payment_method: paymentMethod,
    currency,
    amount,
    amount_usd: currency === "VES" ? round2(amount / (exchangeRate || 1)) : amount,
    exchange_rate: exchangeRate,
    paid_at: paidAt,
    payment_reference: paymentMethod === "Efectivo USD" ? null : paymentReference,
    receipt_url: paymentMethod === "Efectivo USD" ? null : receiptUrl,
    receipt_storage_path:
      paymentMethod === "Efectivo USD" ? null : receiptStoragePath,
    status: (text(formData, "status") || "Por validar") as ProjectRegistrationStatus,
    notes: text(formData, "notes") || null,
  };

  let savedId = id;
  if (id) {
    const { data, error } = await supabase
      .from("project_registrations")
      .update(values)
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { error: "Ya existe una inscripción con esa cédula, correo o referencia." };
      }
      return { error: error.message };
    }
    savedId = data.id;
    await audit(`Editó inscrito ${firstName} ${lastName}`, "Proyectos");
  } else {
    const { data, error } = await supabase
      .from("project_registrations")
      .insert(values)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { error: "Ya existe una inscripción con esa cédula, correo o referencia." };
      }
      return { error: error.message };
    }
    savedId = data.id;
    await audit(`Registró inscrito ${firstName} ${lastName}`, "Proyectos");
  }

  if (values.status === "Cancelado") {
    await supabase
      .from("project_registrations")
      .update({ ticket_status: "Anulado" })
      .eq("id", savedId);

    if (existing?.status !== "Cancelado") {
      const notice = await sendRejectedPaymentNotice(supabase, savedId);
      if (notice?.error) {
        revalidatePath("/proyectos");
        return notice;
      }
    }
  }

  if (values.status === "Confirmado") {
    const ticket = await issueAndSendTicket(supabase, savedId, {
      forceEmail: existing?.status === "Cancelado",
    });
    if (ticket?.error) {
      revalidatePath("/proyectos");
      return ticket;
    }
  }

  if (existing?.order_id) {
    const { data: orderRegistrations } = await supabase
      .from("project_registrations")
      .select("status")
      .eq("order_id", existing.order_id);
    const statuses = orderRegistrations?.map((registration) => registration.status) ?? [];
    const orderStatus =
      statuses.length > 0 && statuses.every((status) => status === "Confirmado")
        ? "Confirmado"
        : statuses.length > 0 && statuses.every((status) => status === "Cancelado")
          ? "Cancelado"
          : "Por validar";
    await supabase
      .from("project_orders")
      .update({ status: orderStatus })
      .eq("id", existing.order_id);
  }

  revalidatePath("/proyectos");
  return { ok: true };
}

export async function confirmProjectOrder(orderId: string): Promise<FormState> {
  const id = String(orderId ?? "").trim();
  if (!id) return { error: "Orden inválida." };

  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canEdit(session.permissions, "Proyectos")) {
    return { error: "No tienes permiso para confirmar pagos." };
  }

  const supabase = await createClient();
  const { data: registrations, error: registrationsError } = await supabase
    .from("project_registrations")
    .select("id, first_name, last_name, status")
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  if (registrationsError) return { error: registrationsError.message };
  if (!registrations?.length) return { error: "No hay inscritos asociados a esta orden." };

  const { error: updateError } = await supabase
    .from("project_registrations")
    .update({ status: "Confirmado" })
    .eq("order_id", id)
    .neq("status", "Cancelado");
  if (updateError) return { error: updateError.message };

  const { error: orderError } = await supabase
    .from("project_orders")
    .update({ status: "Confirmado" })
    .eq("id", id);
  if (orderError) return { error: orderError.message };

  for (const registration of registrations) {
    if (registration.status === "Cancelado") continue;
    const ticket = await issueAndSendTicket(supabase, registration.id);
    if (ticket?.error) {
      revalidatePath("/proyectos");
      return ticket;
    }
  }

  await audit(`Confirmó orden de curso con ${registrations.length} inscrito(s)`, "Proyectos");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function deleteRegistration(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("project_registrations")
    .select("receipt_url, receipt_storage_path, order_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("project_registrations")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  const path = current?.receipt_url
    ? storagePathFromPublicUrl(current.receipt_url, "wm-public")
    : null;
  if (path) {
    try {
      await supabase.storage.from("wm-public").remove([path]);
    } catch {
      // Best-effort: la inscripción ya fue eliminada.
    }
  }
  let removePrivateReceipt = Boolean(current?.receipt_storage_path);
  if (current?.order_id) {
    const { count } = await supabase
      .from("project_registrations")
      .select("id", { count: "exact", head: true })
      .eq("order_id", current.order_id);
    removePrivateReceipt = (count ?? 0) === 0;
    if (removePrivateReceipt) {
      await supabase.from("project_orders").delete().eq("id", current.order_id);
    }
  }
  if (current?.receipt_storage_path && removePrivateReceipt) {
    try {
      await supabase.storage.from("wm-private").remove([current.receipt_storage_path]);
    } catch {
      // Best-effort: la inscripcion ya fue eliminada.
    }
  }

  await audit("Eliminó un inscrito de proyecto", "Proyectos", "warn");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function scanProjectTicket(rawValue: string): Promise<TicketScanResult> {
  const hash = ticketHashFromQr(rawValue);
  if (!hash) {
    return {
      ok: false,
      status: "invalid",
      title: "QR no reconocido",
      message: "Este código no pertenece a una entrada emitida por el sistema.",
    };
  }

  const supabase = await createClient();
  const usedAt = new Date().toISOString();
  const { data: redeemed, error: redeemError } = await supabase
    .from("project_registrations")
    .update({
      ticket_status: "Usado",
      ticket_used_at: usedAt,
    })
    .eq("ticket_hash", hash)
    .eq("ticket_status", "Disponible")
    .select(
      "id, project_id, first_name, last_name, document, email, phone, ticket_status, ticket_used_at",
    )
    .maybeSingle();

  if (redeemError) {
    return {
      ok: false,
      status: "invalid",
      title: "No se pudo validar",
      message: redeemError.message,
    };
  }

  if (redeemed) {
    const project = await getProject(supabase, redeemed.project_id);
    await audit(`Validó entrada QR de ${redeemed.first_name} ${redeemed.last_name}`, "Proyectos");
    revalidatePath("/proyectos");
    return scanResultFromRegistration(redeemed, project, {
      ok: true,
      status: "valid",
      title: "Entrada válida",
      message: "Entrada marcada como usada. Puede permitir el acceso.",
    });
  }

  const { data: current, error: currentError } = await supabase
    .from("project_registrations")
    .select(
      "id, project_id, first_name, last_name, document, email, phone, ticket_status, ticket_used_at",
    )
    .eq("ticket_hash", hash)
    .maybeSingle();

  if (currentError || !current) {
    return {
      ok: false,
      status: "invalid",
      title: "Entrada no encontrada",
      message: "No existe una entrada asociada a este QR.",
    };
  }

  const project = await getProject(supabase, current.project_id);
  if (current.ticket_status === "Usado") {
    return scanResultFromRegistration(current, project, {
      ok: false,
      status: "used",
      title: "Entrada ya usada",
      message: "Este QR ya fue leído anteriormente y no puede volver a usarse.",
    });
  }
  if (current.ticket_status === "Anulado") {
    return scanResultFromRegistration(current, project, {
      ok: false,
      status: "cancelled",
      title: "Entrada anulada",
      message: "Esta entrada fue anulada y no debe permitir acceso.",
    });
  }

  return scanResultFromRegistration(current, project, {
    ok: false,
    status: "not_ready",
    title: "Entrada no disponible",
    message: "El QR existe, pero la entrada aún no está disponible para ingresar.",
  });
}

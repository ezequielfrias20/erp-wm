import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import {
  conferenceAmount,
  conferenceCurrency,
  conferenceMethodRequiresReceipt,
  conferenceOrderCode,
  conferenceReference,
  validateConferenceReceipt,
  validateConferenceRegistration,
} from "@/lib/conference-public";
import type { CleanConferenceAttendee } from "@/lib/conference-public";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}

function unauthorized() {
  return json(401, { ok: false, error: "No autorizado." });
}

function requireServerSecret(request: Request) {
  const expected = process.env.CONFERENCES_API_SECRET;
  if (!expected) throw new Error("La integración pública del ERP no está configurada.");

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token.length > 0 && token === expected;
}

function projectId() {
  const id = process.env.CONFERENCES_PROJECT_ID;
  if (!id) throw new Error("La integración pública del ERP no está configurada.");
  return id;
}

function ticketPriceUsd() {
  const value = Number(process.env.CONFERENCES_TICKET_PRICE_USD ?? 39);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("La integración pública del ERP no está configurada.");
  }
  return value;
}

function fileFrom(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

async function uploadReceipt(file: File, projectIdValue: string, orderCode: string) {
  const ext = file.name.split(".").pop()?.toLowerCase() || extensionFromType(file.type);
  const path = `projects/${projectIdValue}/receipts/${orderCode.toLowerCase()}-${crypto.randomUUID()}.${ext}`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from("wm-public").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error("No se pudo guardar el comprobante en el ERP.");

  const { data } = supabase.storage.from("wm-public").getPublicUrl(path);
  return data.publicUrl;
}

function extensionFromType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  return "jpg";
}

function comparable(value: string) {
  return value.trim().toLowerCase();
}

function sameReference(stored: string, requested: string) {
  const storedRef = comparable(stored);
  const requestedRef = comparable(requested);
  return storedRef === requestedRef || storedRef.startsWith(`${requestedRef}-`);
}

async function ensureNoDuplicatePaymentReference(
  supabase: ReturnType<typeof createAdminClient>,
  reference: string | null,
) {
  if (!reference) return;
  const { data, error } = await supabase
    .from("project_registrations")
    .select("id, payment_reference")
    .ilike("payment_reference", `${reference}%`)
    .limit(20);
  if (error) throw error;
  if ((data ?? []).some((row) => row.payment_reference && sameReference(row.payment_reference, reference))) {
    throw new Error("Ya existe una inscripción con esa referencia de pago.");
  }
}

async function ensureNoDuplicateAttendees(
  supabase: ReturnType<typeof createAdminClient>,
  projectIdValue: string,
  attendees: CleanConferenceAttendee[],
) {
  for (const attendee of attendees) {
    const { data: sameDocument, error: documentError } = await supabase
      .from("project_registrations")
      .select("id")
      .eq("project_id", projectIdValue)
      .ilike("document", attendee.document)
      .limit(1)
      .maybeSingle();
    if (documentError) throw documentError;
    if (sameDocument) {
      throw new Error("Ya existe una inscripción con esa cédula o documento.");
    }

    const { data: sameEmail, error: emailError } = await supabase
      .from("project_registrations")
      .select("id")
      .eq("project_id", projectIdValue)
      .ilike("email", attendee.email)
      .limit(1)
      .maybeSingle();
    if (emailError) throw emailError;
    if (sameEmail) {
      throw new Error("Ya existe una inscripción con ese correo.");
    }
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    if (!requireServerSecret(request)) return unauthorized();

    const formData = await request.formData();
    const attendees = JSON.parse(String(formData.get("asistentes") ?? "[]"));
    const registration = validateConferenceRegistration({
      cantidad: formData.get("cantidad"),
      metodoPago: formData.get("metodoPago"),
      referencia: formData.get("referencia"),
      asistentes: attendees,
    });

    const receipt = fileFrom(formData, "comprobante");
    validateConferenceReceipt(
      receipt,
      conferenceMethodRequiresReceipt(registration.paymentMethod),
    );

    const supabase = createAdminClient();
    const targetProjectId = projectId();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, status")
      .eq("id", targetProjectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project || project.status !== "Abierto") {
      return json(409, { ok: false, error: "El proyecto no está abierto para inscripciones." });
    }

    await ensureNoDuplicatePaymentReference(supabase, registration.reference);
    await ensureNoDuplicateAttendees(supabase, targetProjectId, registration.attendees);

    const orderCode = conferenceOrderCode();
    const unitUsd = ticketPriceUsd();
    const rate = await fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    }));
    const currency = conferenceCurrency(registration.paymentMethod);
    const amount = conferenceAmount({
      method: registration.paymentMethod,
      unitUsd,
      bcvRate: rate.rate,
    });
    const receiptUrl = receipt
      ? await uploadReceipt(receipt, targetProjectId, orderCode)
      : null;
    const today = new Date().toISOString().slice(0, 10);

    const rows = registration.attendees.map((attendee, index) => ({
      project_id: targetProjectId,
      first_name: attendee.firstName,
      last_name: attendee.lastName,
      document: attendee.document,
      email: attendee.email,
      phone: attendee.phone,
      payment_method: registration.paymentMethod,
      currency,
      amount,
      amount_usd: unitUsd,
      exchange_rate: rate.rate,
      paid_at: today,
      payment_reference: conferenceReference({
        method: registration.paymentMethod,
        reference: registration.reference,
        orderCode,
        quantity: registration.quantity,
        index,
      }),
      receipt_url: receiptUrl,
      status: "Por validar" as const,
      notes: [
        `Landing CIM10`,
        `Orden ${orderCode}`,
      ].filter(Boolean).join(" · "),
    }));

    const { data, error } = await supabase
      .from("project_registrations")
      .insert(rows)
      .select("id, first_name, last_name, status");
    if (error) {
      if (error.code === "23505") {
        return json(409, {
          ok: false,
          error: "Ya existe una inscripción con esa cédula, correo o referencia.",
        });
      }
      throw error;
    }

    return json(200, {
      ok: true,
      orden: {
        codigo: orderCode,
        estado: "Por validar",
        cantidad: registration.quantity,
        total_usd: unitUsd * registration.quantity,
        creado_en: new Date().toISOString(),
        asistentes: (data ?? []).map((row) => ({
          id: row.id,
          nombre: row.first_name,
          apellido: row.last_name,
          estado: row.status,
        })),
      },
    });
  } catch (error) {
    return json(400, {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo registrar la inscripción.",
    });
  }
}

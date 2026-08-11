import "server-only";

import { BCV_FALLBACK, fetchBcvRate } from "@/lib/bcv";
import {
  courseAmount,
  courseCurrency,
  courseMethodRequiresReceipt,
  courseOrderCode,
  validateCourseReceipt,
  validateCourseRegistration,
} from "@/lib/course-public";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function projectBySlug(slug: string) {
  if (!PUBLIC_SLUG.test(slug)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("project_type", "Curso")
    .eq("public_registration_enabled", true)
    .ilike("public_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPublicCourseCatalog(slug: string) {
  const project = await projectBySlug(slug);
  if (!project || project.status !== "Abierto") return null;
  const now = Date.now();
  if (project.registration_opens_at && new Date(project.registration_opens_at).getTime() > now) {
    return null;
  }
  if (project.registration_closes_at && new Date(project.registration_closes_at).getTime() < now) {
    return null;
  }

  const supabase = createAdminClient();
  const { data: groups, error: groupsError } = await supabase
    .from("project_groups")
    .select("*")
    .eq("project_id", project.id)
    .eq("status", "Abierto")
    .order("created_at", { ascending: true });
  if (groupsError) throw groupsError;
  const groupIds = (groups ?? []).map((group) => group.id);
  const [sessionsResult, registrationsResult, ordersResult] = await Promise.all([
    groupIds.length
      ? supabase.from("project_sessions").select("*").in("group_id", groupIds).order("starts_at")
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase.from("project_registrations").select("group_id, order_id, status").in("group_id", groupIds).in("status", ["Por validar", "Confirmado"])
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase.from("project_orders").select("id, status, reservation_expires_at").in("group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (registrationsResult.error) throw registrationsResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const orders = new Map((ordersResult.data ?? []).map((order) => [order.id, order]));
  const reservedByGroup = new Map<string, number>();
  for (const registration of registrationsResult.data ?? []) {
    if (!registration.group_id) continue;
    const order = registration.order_id ? orders.get(registration.order_id) : null;
    const active = !order || order.status === "Confirmado" || (
      order.status === "Por validar" &&
      (!order.reservation_expires_at || new Date(order.reservation_expires_at).getTime() > now)
    );
    if (active) {
      reservedByGroup.set(registration.group_id, (reservedByGroup.get(registration.group_id) ?? 0) + 1);
    }
  }

  return {
    slug: project.public_slug ?? slug,
    name: project.name,
    description: project.description,
    location: project.location,
    logoUrl: project.logo_url,
    organizerName: project.organizer_name,
    organizerEmail: project.organizer_email,
    organizerPhone: project.organizer_phone,
    paymentInstructions: project.registration_payment_instructions,
    timezone: project.timezone,
    groups: (groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      capacity: group.capacity,
      available: Math.max(0, group.capacity - (reservedByGroup.get(group.id) ?? 0)),
      priceUsd: Number(group.price_usd),
      location: group.location,
      sessions: (sessionsResult.data ?? [])
        .filter((session) => session.group_id === group.id)
        .map((session) => ({
          id: session.id,
          title: session.title,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
          location: session.location,
          instructor: session.instructor,
        })),
    })),
  };
}

function fileFrom(formData: FormData) {
  const value = formData.get("comprobante");
  return value instanceof File && value.size > 0 ? value : null;
}

function extension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "application/pdf") return "pdf";
  return "jpg";
}

export async function registerPublicCourse(slug: string, formData: FormData) {
  let uploadedPath: string | null = null;
  const supabase = createAdminClient();
  try {
    const project = await projectBySlug(slug);
    if (!project || project.status !== "Abierto") throw new Error("Curso no encontrado.");
    const registration = validateCourseRegistration({
      groupId: formData.get("groupId"),
      cantidad: formData.get("cantidad"),
      metodoPago: formData.get("metodoPago"),
      referencia: formData.get("referencia"),
      asistentes: JSON.parse(String(formData.get("asistentes") ?? "[]")),
    });
    const receipt = fileFrom(formData);
    validateCourseReceipt(receipt, courseMethodRequiresReceipt(registration.paymentMethod));

    const { data: group, error: groupError } = await supabase
      .from("project_groups")
      .select("id, price_usd, status")
      .eq("id", registration.groupId)
      .eq("project_id", project.id)
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group || group.status !== "Abierto") throw new Error("El horario seleccionado no esta disponible.");

    const code = courseOrderCode();
    if (receipt) {
      uploadedPath = `projects/${project.id}/course-receipts/${code.toLowerCase()}-${crypto.randomUUID()}.${extension(receipt)}`;
      const { error } = await supabase.storage.from("wm-private").upload(uploadedPath, receipt, {
        cacheControl: "3600",
        contentType: receipt.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw new Error("No se pudo guardar el comprobante.");
    }

    const bcv = await fetchBcvRate().catch(() => ({ rate: BCV_FALLBACK, updatedAt: "", source: "BCV" }));
    const currency = courseCurrency(registration.paymentMethod);
    const unitUsd = Number(group.price_usd);
    const unitAmount = courseAmount({ method: registration.paymentMethod, unitUsd, bcvRate: bcv.rate });
    const { data: order, error } = await supabase.rpc("create_course_order", {
      p_project_id: project.id,
      p_group_id: group.id,
      p_code: code,
      p_currency: currency,
      p_amount: unitAmount,
      p_amount_usd: unitUsd,
      p_exchange_rate: currency === "VES" ? bcv.rate : null,
      p_payment_method: registration.paymentMethod,
      p_payment_reference: registration.reference,
      p_receipt_storage_path: uploadedPath,
      p_attendees: registration.attendees,
      p_notes: `Inscripcion publica · ${project.name}`,
    });
    if (error) throw error;
    return order;
  } catch (error) {
    if (uploadedPath) await supabase.storage.from("wm-private").remove([uploadedPath]);
    throw error;
  }
}

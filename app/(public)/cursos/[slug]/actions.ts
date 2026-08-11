"use server";

import { registerPublicCourse } from "@/lib/course-registration-service";

export type PublicCourseFormState = {
  ok?: boolean;
  error?: string;
  code?: string;
} | null;

export async function registerForCourse(
  slug: string,
  _previous: PublicCourseFormState,
  formData: FormData,
): Promise<PublicCourseFormState> {
  if (String(formData.get("website") ?? "").trim()) {
    return { error: "No se pudo procesar la inscripcion." };
  }

  formData.set("cantidad", "1");
  formData.set("asistentes", JSON.stringify([{
    nombre: String(formData.get("firstName") ?? ""),
    apellido: String(formData.get("lastName") ?? ""),
    documento: String(formData.get("document") ?? ""),
    email: String(formData.get("email") ?? ""),
    telefono: String(formData.get("phone") ?? ""),
  }]));

  try {
    const order = await registerPublicCourse(slug, formData);
    return { ok: true, code: order.code };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo registrar la inscripcion.",
    };
  }
}

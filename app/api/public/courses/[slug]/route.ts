import { NextResponse } from "next/server";
import {
  getPublicCourseCatalog,
  registerPublicCourse,
} from "@/lib/course-registration-service";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

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

function authorized(request: Request) {
  const expected = process.env.COURSES_API_SECRET;
  if (!expected) throw new Error("La integracion publica de cursos no esta configurada.");
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") && authorization.slice(7) === expected;
}

export async function GET(request: Request, context: Context) {
  try {
    if (!authorized(request)) return json(401, { ok: false, error: "No autorizado." });
    const { slug } = await context.params;
    const course = await getPublicCourseCatalog(slug);
    if (!course) return json(404, { ok: false, error: "Curso no encontrado." });
    return json(200, { ok: true, course });
  } catch (error) {
    return json(400, {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo consultar el curso.",
    });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    if (!authorized(request)) return json(401, { ok: false, error: "No autorizado." });
    const { slug } = await context.params;
    const order = await registerPublicCourse(slug, await request.formData());
    return json(200, { ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar la inscripcion.";
    return json(/cupo|existe|duplicate|unique/i.test(message) ? 409 : 400, {
      ok: false,
      error: message,
    });
  }
}

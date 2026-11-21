import { NextResponse, type NextRequest } from "next/server";

import { isKeepAliveAuthorized } from "@/lib/keep-alive";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Latido diario para que Supabase no pause el proyecto gratuito del negocio
 * (Vercel Cron, ver vercel.json). Escribe en wm.heartbeat vía wm.keep_alive(), que limita la
 * escritura a una por hora. Nunca devuelve detalles: sólo si funcionó y la hora del latido.
 * Diseño: docs/superpowers/specs/2026-11-21-keep-alive-supabase-design.md
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { ok: boolean; lastBeatAt: string | null };

function json(status: number, body: Body) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function GET(request: NextRequest) {
  if (!isKeepAliveAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return json(401, { ok: false, lastBeatAt: null });
  }

  try {
    const { data, error } = await createAdminClient().rpc("keep_alive");
    if (error) throw error;
    return json(200, { ok: true, lastBeatAt: data ?? null });
  } catch {
    console.error("[keep-alive] no se pudo registrar el latido (¿falta supabase/keep_alive.sql o la llave secreta?)");
    return json(500, { ok: false, lastBeatAt: null });
  }
}

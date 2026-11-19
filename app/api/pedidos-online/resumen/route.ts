import { NextResponse } from "next/server";

import { getActiveBranchId } from "@/lib/branch";
import { canView } from "@/lib/permissions";
import { countNewOnlineOrders } from "@/lib/queries/online-orders";
import { getSession } from "@/lib/queries/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: { count: number; latestNumber: string | null; latestAt: string | null } | { error: string }) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return json(401, { error: "Debes iniciar sesión." });
  if (!canView(session.permissions, "Ventas")) {
    return json(403, { error: "No tienes permiso para ver pedidos online." });
  }

  const branchId = await getActiveBranchId(session.profile.branch_id, session.profile.role);
  const summary = await countNewOnlineOrders(branchId);
  return json(200, summary);
}

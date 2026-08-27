import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuditSeverity, ModuleName } from "@/lib/database.types";
import { getSession } from "@/lib/queries/session";
import { rpcOrFallback } from "@/lib/db-capabilities";

/**
 * Entrada de auditoría del usuario actual. Nunca lanza.
 *
 * `wm.write_audit` lo hace en un solo viaje. Si la función no está en el esquema,
 * `rpcOrFallback` lo recuerda y a partir de ahí inserta directo sin intentarla —
 * antes cada auditoría gastaba una RPC fallida más un `claim_profile` extra.
 */
export async function audit(
  action: string,
  module: ModuleName,
  severity: AuditSeverity = "edit",
  actor?: { id: string; full_name: string | null },
) {
  try {
    const supabase = await createClient();

    const insertDirectly = async () => {
      const profile = actor ?? (await getSession())?.profile ?? null;
      await supabase.from("audit_log").insert({
        user_id: profile?.id ?? null,
        who: profile?.full_name ?? "Sistema",
        action,
        module,
        severity,
      });
      return null;
    };

    if (actor) {
      await insertDirectly();
      return;
    }

    await rpcOrFallback<null>(
      "write_audit",
      async () => {
        const { error } = await supabase.rpc("write_audit", {
          p_action: action,
          p_module: module,
          p_severity: severity,
        });
        return { data: null, error };
      },
      insertDirectly,
    );
  } catch {
    // la auditoría nunca debe bloquear la acción principal
  }
}

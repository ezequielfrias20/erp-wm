import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuditSeverity, ModuleName } from "@/lib/database.types";

/** Best-effort audit trail entry for the current user. Never throws. */
export async function audit(
  action: string,
  module: ModuleName,
  severity: AuditSeverity = "edit",
) {
  try {
    const supabase = await createClient();
    const { data: profile } = await supabase.rpc("claim_profile");
    await supabase.from("audit_log").insert({
      user_id: profile?.id ?? null,
      who: profile?.full_name ?? "Sistema",
      action,
      module,
      severity,
    });
  } catch {
    // auditing must never block the primary action
  }
}

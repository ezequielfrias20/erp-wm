import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuditSeverity, ModuleName } from "@/lib/database.types";

/** Best-effort audit trail entry for the current user. Never throws. */
export async function audit(
  action: string,
  module: ModuleName,
  severity: AuditSeverity = "edit",
  actor?: { id: string; full_name: string | null },
) {
  try {
    const supabase = await createClient();
    if (!actor) {
      const { error } = await supabase.rpc("write_audit", {
        p_action: action,
        p_module: module,
        p_severity: severity,
      });
      if (!error) return;
    }
    const { data: claimedProfile } = actor
      ? { data: null }
      : await supabase.rpc("claim_profile");
    const profile = actor ?? claimedProfile;
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

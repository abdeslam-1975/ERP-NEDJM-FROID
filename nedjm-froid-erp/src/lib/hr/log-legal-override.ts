import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createServiceClient } from "@/lib/supabase/service";

/** Append-only journal entry. Service role bypasses the session pin on sys_audit_write. */
export async function logLegalOverride(target: string, legal: unknown, proposed: unknown) {
  const profile = await getWorkspaceProfile();
  const service = createServiceClient();
  const { error } = await service.rpc("sys_audit_write", {
    p_user_id: profile?.id ?? null,
    p_action: "UPDATE",
    p_table_name: "hr_legal_override",
    p_target_id: target.slice(0, 180),
    p_old: { legal },
    p_new: { decision: "AUTORISER_DEPASSEMENT", proposed },
    p_ip: null,
    p_user_agent: null,
    p_request_id: null,
  });
  return error?.message ?? null;
}

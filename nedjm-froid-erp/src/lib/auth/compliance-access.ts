import { createClient } from "@/lib/supabase/server";

export type ComplianceAccess = { canRead: boolean; canWrite: boolean };

const DENIED =
  "Unité 05 (conformité fiscale & sociale) : modification réservée à SUPER_ADMIN, ADMIN_RH et ADMIN_FINANCE. · التعديل محصور في SUPER_ADMIN و ADMIN_RH و ADMIN_FINANCE.";

/** Reads the `hr_compliance` rights from the matrix (same helpers as the RLS policies). */
export async function getComplianceAccess(): Promise<ComplianceAccess> {
  const supabase = await createClient();
  const [write, read] = await Promise.all([
    supabase.rpc("erp_can_write_hr_compliance"),
    supabase.rpc("erp_can_read_hr_compliance"),
  ]);
  const canWrite = write.data === true;
  return { canWrite, canRead: canWrite || read.data === true };
}

export async function requireComplianceWrite(): Promise<{ ok: true; data: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const { data, error } = await supabase.rpc("erp_can_write_hr_compliance");
  if (error) return { ok: false, error: error.message };
  return data === true ? { ok: true, data: true } : { ok: false, error: DENIED };
}

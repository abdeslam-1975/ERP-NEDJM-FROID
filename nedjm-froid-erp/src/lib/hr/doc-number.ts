import type { SupabaseClient } from "@supabase/supabase-js";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Next "NNNNNN/YY" number of a register with its own yearly counter (transfer batches, interim
 * statements). The number is reserved when returned: two simultaneous creations never share it.
 */
export async function nextRegisterNumber(
  supabase: SupabaseClient,
  register: "VIR" | "ITM",
): Promise<ActionResult<string>> {
  const { data, error } = await supabase.rpc("hr_next_register_number", { p_register: register });
  if (error || typeof data !== "string") return { ok: false, error: error?.message ?? "Numérotation impossible." };
  return { ok: true, data };
}

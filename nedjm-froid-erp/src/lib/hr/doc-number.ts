import type { SupabaseClient } from "@supabase/supabase-js";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const NUMBER_RE = /^(\d+)\/(\d{2})$/;

/**
 * Next "NNNNNN/YY" number for a register that has its own unique column. hr_next_doc_number only counts
 * correspondences, so its value alone can repeat a number already used in that register.
 */
export async function nextRegisterNumber(
  supabase: SupabaseClient,
  table: "hr_payroll_transfer_batches" | "hr_interim_statements",
  column: "batch_no" | "statement_no",
  prefix: string,
): Promise<ActionResult<string>> {
  const { data: base, error } = await supabase.rpc("hr_next_doc_number", { p_prefix: prefix });
  if (error || typeof base !== "string") return { ok: false, error: error?.message ?? "Numérotation impossible." };
  const parsed = NUMBER_RE.exec(base);
  if (!parsed) return { ok: true, data: base };
  const [, digits, yy] = parsed;
  const { data: last, error: lastErr } = await supabase
    .from(table)
    .select(column)
    .like(column, `%/${yy}`)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) return { ok: false, error: lastErr.message };
  const used = NUMBER_RE.exec(String((last as Record<string, unknown> | null)?.[column] ?? ""));
  const next = Math.max(Number(digits), used ? Number(used[1]) + 1 : 0);
  return { ok: true, data: `${String(next).padStart(digits.length, "0")}/${yy}` };
}

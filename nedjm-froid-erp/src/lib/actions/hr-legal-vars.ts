"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireComplianceWrite } from "@/lib/auth/compliance-access";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_KEYS } from "@/lib/hr/compliance-keys";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type LegalVarRow = {
  id: string;
  key: string;
  label_fr: string;
  label_ar: string | null;
  unit: string | null;
  value_type: string;
  current_numeric: number | null;
  current_text: string | null;
  effective_from: string | null;
  group: "cnas" | "cacobatph" | "irg" | "other";
};

function groupOf(key: string): LegalVarRow["group"] {
  if (key.startsWith("CNAS_")) return "cnas";
  if (key.startsWith("CACOBATPH_")) return "cacobatph";
  if (key.startsWith("IRG_")) return "irg";
  return "other";
}

function revalidateLegal() {
  revalidatePath("/rh");
  revalidatePath("/rh/legal");
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/irg");
  revalidatePath("/rh/paie/social");
  revalidatePath("/referentiels/variables");
  revalidatePath("/referentiels/irg");
}

export async function listLegalVars(): Promise<ActionResult<LegalVarRow[]>> {
  const supabase = await createClient();
  const { data: vars, error } = await supabase
    .from("ref_global_vars")
    .select("id, key, label_fr, label_ar, unit, value_type")
    .in("key", [...LEGAL_KEYS])
    .order("key");
  if (error) return { ok: false, error: error.message };
  const today = new Date().toISOString().slice(0, 10);
  const rows: LegalVarRow[] = [];
  for (const v of vars ?? []) {
    const { data: ver } = await supabase
      .from("ref_global_var_versions")
      .select("value_numeric, value_text, effective_from")
      .eq("var_id", v.id)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    rows.push({
      id: v.id,
      key: v.key,
      label_fr: v.label_fr,
      label_ar: v.label_ar,
      unit: v.unit,
      value_type: v.value_type,
      current_numeric: ver?.value_numeric == null ? null : Number(ver.value_numeric),
      current_text: ver?.value_text ?? null,
      effective_from: ver?.effective_from ?? null,
      group: groupOf(v.key),
    });
  }
  return { ok: true, data: rows };
}

const addVersionSchema = z.object({
  var_id: z.string().uuid(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value_pct: z.coerce.number().min(0).max(100).optional(),
  value_numeric: z.coerce.number().min(0).max(99_999_999).optional(),
  value_text: z.string().trim().max(80).optional().nullable(),
  as_percent: z.boolean().default(false),
});

export async function addLegalVarVersion(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = addVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data: legalVar } = await supabase.from("ref_global_vars").select("key").eq("id", p.var_id).maybeSingle();
  if (!legalVar || !(LEGAL_KEYS as readonly string[]).includes(legalVar.key)) {
    return { ok: false, error: "Variable hors unité 05." };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let value_numeric: number | null = null;
  if (p.as_percent) {
    if (p.value_pct == null) return { ok: false, error: "Pourcentage requis." };
    value_numeric = Math.round((p.value_pct / 100) * 1_000_000) / 1_000_000;
  } else if (p.value_numeric != null) {
    value_numeric = p.value_numeric;
  }

  const dayBefore = new Date(p.effective_from);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const closeTo = dayBefore.toISOString().slice(0, 10);

  const { error: closeErr } = await supabase
    .from("ref_global_var_versions")
    .update({ effective_to: closeTo })
    .eq("var_id", p.var_id)
    .is("effective_to", null)
    .lt("effective_from", p.effective_from);
  if (closeErr) return { ok: false, error: closeErr.message };

  const { data, error } = await supabase
    .from("ref_global_var_versions")
    .insert({
      var_id: p.var_id,
      value_numeric,
      value_text: p.value_text ?? null,
      effective_from: p.effective_from,
      effective_to: null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateLegal();
  return { ok: true, data: { id: data.id } };
}

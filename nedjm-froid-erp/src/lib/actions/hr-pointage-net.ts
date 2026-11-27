"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  POINTAGE_NET_EFFECTS,
  type PointageNetEffect,
  type PointageNetRule,
} from "@/lib/hr/pointage-net";
import { pointageNetRulesSchema } from "@/lib/validations/hr";

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type PointageFormulaLegend = {
  code: string;
  label_fr: string;
  label_ar: string | null;
};

export type PointageNetFormula = {
  /** Null when the settings table is not installed yet: the screen shows the built-in formula. */
  rules: PointageNetRule[] | null;
  legends: PointageFormulaLegend[];
  canEdit: boolean;
};

function missingRulesTable(message: string) {
  return /hr_pointage_net_rules|42P01|PGRST205/i.test(message);
}

function mapRule(row: { code: string; effect: string }): PointageNetRule | null {
  const code = row.code.trim().toUpperCase();
  if (!code || !POINTAGE_NET_EFFECTS.includes(row.effect as PointageNetEffect)) return null;
  return { code, effect: row.effect as PointageNetEffect };
}

export async function loadPointageNetRules(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ActionResult<PointageNetRule[] | null>> {
  const { data, error } = await supabase
    .from("hr_pointage_net_rules")
    .select("code, effect, sort_order")
    .order("sort_order")
    .order("code");
  if (error) {
    if (missingRulesTable(error.message)) return { ok: true, data: null };
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    data: ((data ?? []) as { code: string; effect: string }[]).flatMap((row) => {
      const rule = mapRule(row);
      return rule ? [rule] : [];
    }),
  };
}

export async function loadPointageNetFormula(): Promise<ActionResult<PointageNetFormula>> {
  const supabase = await createClient();
  const workspace = await getWorkspaceProfile();
  const [rules, legends, perm] = await Promise.all([
    loadPointageNetRules(supabase),
    supabase.from("ref_legendes").select("code, label_fr, label_ar, is_active").eq("is_active", true).order("code"),
    supabase.rpc("erp_has_perm", { p_screen: "hr_settings", p_action: "update" }),
  ]);
  if (!rules.ok) return rules;
  if (legends.error) return { ok: false, error: legends.error.message };
  const seen = new Set<string>();
  const list: PointageFormulaLegend[] = [];
  for (const row of (legends.data ?? []) as { code: string; label_fr: string | null; label_ar: string | null }[]) {
    const code = String(row.code ?? "").trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    list.push({ code, label_fr: row.label_fr?.trim() || code, label_ar: row.label_ar });
  }
  for (const rule of rules.data ?? []) {
    if (seen.has(rule.code)) continue;
    seen.add(rule.code);
    list.push({ code: rule.code, label_fr: rule.code, label_ar: null });
  }
  return {
    ok: true,
    data: {
      rules: rules.data,
      legends: list,
      canEdit: workspace?.isSuperAdmin === true || perm.data === true,
    },
  };
}

export async function savePointageNetFormula(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = pointageNetRulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const seen = new Set<string>();
  const rules: PointageNetRule[] = [];
  for (const rule of parsed.data.rules) {
    if (seen.has(rule.code)) return { ok: false, error: `Code en double : ${rule.code}.` };
    seen.add(rule.code);
    rules.push(rule);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_pointage_net_rules_save", { p_rules: rules });
  if (error) {
    if (missingRulesTable(error.message)) {
      return {
        ok: false,
        error: "La formule n'est pas encore installée dans la base. Appliquez la migration puis réessayez.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/rh/presence");
  revalidatePath("/parametres/rh/presence");
  return { ok: true, data: { count: Number(data ?? rules.length) } };
}

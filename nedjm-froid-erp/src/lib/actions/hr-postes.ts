"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { posteCodeFromLabel } from "@/lib/hr/postes";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PosteCategory = "EXECUTION" | "MAITRISE" | "CADRE" | "DIRECTION";

export type GridRow = {
  id: string;
  poste_id: string;
  grade: string;
  base_monthly: number;
  net_ref_monthly: number | null;
  effective_from: string;
  notes: string | null;
};

export type PosteRow = {
  id: string;
  code: string;
  label_fr: string;
  label_ar: string | null;
  category: PosteCategory;
  qualification_code: string | null;
  is_active: boolean;
  sort_order: number;
  contracts: number;
  grid: GridRow[];
};

const posteSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "Code : 2 à 20 caractères A-Z, 0-9, _ ou -"),
  label_fr: z.string().trim().min(2, "Libellé requis · التسمية مطلوبة").max(160),
  label_ar: z.string().trim().max(160).optional().nullable(),
  category: z.enum(["EXECUTION", "MAITRISE", "CADRE", "DIRECTION"]),
  qualification_code: z.string().trim().max(40).optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
});

const gridSchema = z.object({
  poste_id: z.string().uuid(),
  grade: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, "Grade : 1 à 6 caractères (A, B, 1, 2…)"),
  base_monthly: z.coerce.number().positive("Salaire de base requis"),
  net_ref_monthly: z.coerce.number().positive().optional().nullable(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  notes: z.string().trim().max(300).optional().nullable(),
});

function revalidatePostes() {
  revalidatePath("/rh/postes");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/parametres");
}

export async function listPostes(): Promise<ActionResult<PosteRow[]>> {
  const supabase = await createClient();
  const [postes, grid, contracts] = await Promise.all([
    supabase
      .from("hr_postes")
      .select("id, code, label_fr, label_ar, category, qualification_code, is_active, sort_order")
      .order("sort_order")
      .order("code"),
    supabase
      .from("hr_salary_grid")
      .select("id, poste_id, grade, base_monthly, net_ref_monthly, effective_from, notes")
      .order("grade")
      .order("effective_from", { ascending: false }),
    supabase.from("hr_contracts").select("poste_id").not("poste_id", "is", null),
  ]);
  if (postes.error) return { ok: false, error: postes.error.message };
  const gridRows = grid.error ? [] : grid.data ?? [];
  const counts = new Map<string, number>();
  for (const c of contracts.data ?? []) {
    if (c.poste_id) counts.set(c.poste_id, (counts.get(c.poste_id) ?? 0) + 1);
  }
  return {
    ok: true,
    data: (postes.data ?? []).map((p) => ({
      ...p,
      category: p.category as PosteCategory,
      contracts: counts.get(p.id) ?? 0,
      grid: gridRows
        .filter((g) => g.poste_id === p.id)
        .map((g) => ({
          ...g,
          base_monthly: Number(g.base_monthly),
          net_ref_monthly: g.net_ref_monthly == null ? null : Number(g.net_ref_monthly),
          effective_from: String(g.effective_from).slice(0, 10),
        })),
    })),
  };
}

export async function savePoste(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = posteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { id, ...p } = parsed.data;
  const row = { ...p, label_ar: p.label_ar || null, qualification_code: p.qualification_code || null };
  const supabase = await createClient();
  const q = id
    ? supabase.from("hr_postes").update(row).eq("id", id).select("id").maybeSingle()
    : supabase.from("hr_postes").insert(row).select("id").maybeSingle();
  const { data, error } = await q;
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Le code ${p.code} existe déjà.` };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  if (id) {
    await supabase
      .from("hr_contracts")
      .update({ poste_fr: p.label_fr, ...(p.label_ar ? { poste_ar: p.label_ar } : {}) })
      .eq("poste_id", id)
      .in("status", ["DRAFT", "ACTIVE", "SUSPENDED"]);
  }
  revalidatePostes();
  return { ok: true, data: { id: data.id } };
}

export async function deletePoste(id: string): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { count } = await supabase
    .from("hr_contracts")
    .select("id", { count: "exact", head: true })
    .eq("poste_id", id);
  if (count) return { ok: false, error: `Poste utilisé par ${count} contrat(s) : désactivez-le plutôt.` };
  const { data, error } = await supabase.from("hr_postes").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidatePostes();
  return { ok: true, data: undefined };
}

export async function saveGridRow(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = gridSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_grid")
    .upsert(
      { ...p, net_ref_monthly: p.net_ref_monthly ?? null, notes: p.notes || null },
      { onConflict: "poste_id,grade,effective_from" },
    )
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidatePostes();
  return { ok: true, data: { id: data.id } };
}

export async function deleteGridRow(id: string): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_salary_grid").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidatePostes();
  return { ok: true, data: undefined };
}

/** Creates a poste for every distinct contract job title without one and links the contracts. */
export async function importPostesFromContracts(): Promise<ActionResult<{ created: number; linked: number }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const [{ data: contracts, error }, { data: postes, error: pErr }] = await Promise.all([
    supabase.from("hr_contracts").select("id, poste_fr, poste_ar").is("poste_id", null),
    supabase.from("hr_postes").select("id, code, label_fr"),
  ]);
  if (error) return { ok: false, error: error.message };
  if (pErr) return { ok: false, error: pErr.message };
  const byLabel = new Map((postes ?? []).map((p) => [p.label_fr.trim().toLowerCase(), p.id]));
  const codes = new Set((postes ?? []).map((p) => p.code));
  let created = 0;
  let linked = 0;
  for (const c of contracts ?? []) {
    const label = (c.poste_fr ?? "").trim();
    if (label.length < 2) continue;
    const key = label.toLowerCase();
    let posteId = byLabel.get(key);
    if (!posteId) {
      const code = posteCodeFromLabel(label, codes);
      const { data, error: insErr } = await supabase
        .from("hr_postes")
        .insert({ code, label_fr: label, label_ar: c.poste_ar || null })
        .select("id")
        .maybeSingle();
      if (insErr || !data) return { ok: false, error: insErr?.message ?? "Création refusée (droits)." };
      codes.add(code);
      byLabel.set(key, data.id);
      posteId = data.id;
      created += 1;
    }
    const { error: upErr } = await supabase.from("hr_contracts").update({ poste_id: posteId }).eq("id", c.id);
    if (!upErr) linked += 1;
  }
  revalidatePostes();
  return { ok: true, data: { created, linked } };
}

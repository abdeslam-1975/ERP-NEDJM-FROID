"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";
import { salaryClassFlags } from "@/lib/hr/payroll-calc";
import {
  salaryAssignmentSchema,
  salaryRubriqueSchema,
} from "@/lib/validations/hr";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SalaryRubrique = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string;
  nature: "indemnite" | "prime" | "rappel" | "remboursement" | "retenue";
  unit: "day" | "month" | "percent" | "presence_day";
  category: "1" | "2" | "3" | "4";
  cotisable: boolean;
  taxable: boolean;
  apply_scope: "employee" | "site" | "contract";
  default_amount: number;
  sort_order: number;
  is_active: boolean;
};

export type SalaryAssignment = {
  id: string;
  rubrique_id: string;
  employee_id: string | null;
  site_id: string | null;
  contract_id: string | null;
  amount: number;
  unit: SalaryRubrique["unit"] | null;
  is_active: boolean;
};

function revalidateSalary() {
  revalidatePath("/rh");
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/employes");
}

async function requireSuperAdmin(): Promise<ActionResult<true>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };
  if (!workspace.isSuperAdmin) {
    return { ok: false, error: "Contrôle des rubriques réservé à SUPER_ADMIN. · التحكم في بنود الأجر محصور في SUPER_ADMIN." };
  }
  return { ok: true, data: true };
}

export async function listSalaryRubriques(): Promise<ActionResult<SalaryRubrique[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_rubriques")
    .select(
      "id, code, label_ar, label_fr, nature, unit, category, cotisable, taxable, apply_scope, default_amount, sort_order, is_active",
    )
    .order("sort_order");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      ...row,
      default_amount: Number(row.default_amount),
    })) as SalaryRubrique[],
  };
}

export async function listSalaryAssignments(): Promise<ActionResult<SalaryAssignment[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_assignments")
    .select("id, rubrique_id, employee_id, site_id, contract_id, amount, unit, is_active")
    .order("created_at");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      ...row,
      amount: Number(row.amount),
      unit: (row.unit as SalaryAssignment["unit"]) ?? null,
    })) as SalaryAssignment[],
  };
}

export async function upsertSalaryRubrique(
  input: unknown,
): Promise<ActionResult<{ id: string; cleared_assignments: boolean }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const parsed = salaryRubriqueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  let cleared = false;
  if (p.id) {
    const { data: prev } = await supabase
      .from("hr_salary_rubriques")
      .select("apply_scope")
      .eq("id", p.id)
      .maybeSingle();
    if (prev && prev.apply_scope !== p.apply_scope) {
      const { error: delErr } = await supabase
        .from("hr_salary_assignments")
        .delete()
        .eq("rubrique_id", p.id);
      if (delErr) return { ok: false, error: delErr.message };
      cleared = true;
    }
  }
  const flags = salaryClassFlags(p.category);
  const payload = {
    code: p.code,
    label_ar: p.label_ar,
    label_fr: p.label_fr,
    nature: p.nature,
    unit: p.unit,
    category: p.category,
    cotisable: flags.cotisable,
    taxable: flags.taxable,
    apply_scope: p.apply_scope,
    default_amount: p.default_amount,
    sort_order: p.sort_order,
    is_active: p.is_active,
  };
  const q = p.id
    ? supabase.from("hr_salary_rubriques").update(payload).eq("id", p.id)
    : supabase.from("hr_salary_rubriques").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateSalary();
  return { ok: true, data: { id: data.id, cleared_assignments: cleared } };
}

export async function setSalaryRubriqueActive(input: {
  id: string;
  is_active: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_rubriques")
    .update({ is_active: input.is_active })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée." };
  revalidateSalary();
  return { ok: true, data: { id: data.id } };
}

export async function deleteSalaryRubrique(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_rubriques")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidateSalary();
  return { ok: true, data: { id } };
}

export async function upsertSalaryAssignment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = salaryAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data: rub, error: rErr } = await supabase
    .from("hr_salary_rubriques")
    .select("id, apply_scope")
    .eq("id", p.rubrique_id)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!rub) return { ok: false, error: "Rubrique introuvable. · البند غير موجود." };

  const payload = {
    rubrique_id: p.rubrique_id,
    employee_id: rub.apply_scope === "employee" ? p.target_id : null,
    site_id: rub.apply_scope === "site" ? p.target_id : null,
    contract_id: rub.apply_scope === "contract" ? p.target_id : null,
    amount: p.amount,
    unit: p.unit ?? null,
    is_active: p.is_active,
  };

  const q = p.id
    ? supabase.from("hr_salary_assignments").update(payload).eq("id", p.id)
    : supabase.from("hr_salary_assignments").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Cette valeur existe déjà pour cette cible. · هذه القيمة موجودة مسبقاً لهذا الهدف." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  await refreshDraftPayroll({
    employeeId: payload.employee_id ?? undefined,
    contractId: payload.contract_id ?? undefined,
    siteId: payload.site_id ?? undefined,
  });
  revalidateSalary();
  return { ok: true, data: { id: data.id } };
}

export async function deleteSalaryAssignment(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_assignments")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidateSalary();
  return { ok: true, data: { id } };
}

export async function replaceContractSalaryLines(input: {
  contract_id: string;
  employee_id: string;
  lines: { rubrique_id: string; amount: number; unit?: SalaryRubrique["unit"] }[];
}): Promise<ActionResult<{ count: number }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const ids = [...new Set(input.lines.map((l) => l.rubrique_id))];
  const { data: rubs, error: rErr } = await supabase
    .from("hr_salary_rubriques")
    .select("id, apply_scope, is_active, unit");
  if (rErr) return { ok: false, error: rErr.message };
  const byId = new Map((rubs ?? []).map((r) => [r.id, r]));
  type Line = { rubrique_id: string; amount: number; unit?: SalaryRubrique["unit"] };
  const contractLines: Line[] = [];
  const employeeLines: Line[] = [];
  for (const id of ids) {
    const rub = byId.get(id);
    if (!rub || !rub.is_active) {
      return { ok: false, error: "Rubrique introuvable. · البند غير موجود." };
    }
    if (rub.apply_scope === "site") {
      return {
        ok: false,
        error:
          "Les rubriques chantier restent héritées, elles ne se posent pas sur le contrat. · بنود الورشة موروثة ولا تُثبت على العقد.",
      };
    }
  }
  for (const line of input.lines) {
    const rub = byId.get(line.rubrique_id);
    if (!rub) continue;
    if (rub.apply_scope === "contract") contractLines.push(line);
    if (rub.apply_scope === "employee") employeeLines.push(line);
  }
  const { error: delCtr } = await supabase
    .from("hr_salary_assignments")
    .delete()
    .eq("contract_id", input.contract_id);
  if (delCtr) return { ok: false, error: delCtr.message };
  const { error: delEmp } = await supabase
    .from("hr_salary_assignments")
    .delete()
    .eq("employee_id", input.employee_id);
  if (delEmp) return { ok: false, error: delEmp.message };

  const rows = [
    ...contractLines.map((line) => ({
      rubrique_id: line.rubrique_id,
      employee_id: null,
      site_id: null,
      contract_id: input.contract_id,
      amount: line.amount,
      unit: line.unit ?? byId.get(line.rubrique_id)?.unit ?? null,
      is_active: true,
    })),
    ...employeeLines.map((line) => ({
      rubrique_id: line.rubrique_id,
      employee_id: input.employee_id,
      site_id: null,
      contract_id: null,
      amount: line.amount,
      unit: line.unit ?? byId.get(line.rubrique_id)?.unit ?? null,
      is_active: true,
    })),
  ];
  if (rows.length) {
    const { error } = await supabase.from("hr_salary_assignments").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  revalidateSalary();
  return { ok: true, data: { count: rows.length } };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";
import { salaryExceptionSchema } from "@/lib/validations/hr";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SalaryExceptionRow = {
  id: string;
  employee_id: string;
  rubrique_id: string;
  amount: number;
  unit: "day" | "month" | "percent" | "presence_day" | null;
  period_year: number;
  period_month: number;
  duration_mode: "once" | "until";
  until_year: number | null;
  until_month: number | null;
  reason: string;
  status_code: "DRAFT" | "APPROVED" | "CANCELLED";
  is_active: boolean;
  granted_by: string | null;
  grantor_name: string | null;
  employee_label: string;
  rubrique_code: string;
  rubrique_label_ar: string;
  rubrique_label_fr: string;
  category: "1" | "2" | "3" | "4";
};

function revalidateExceptions() {
  revalidatePath("/rh");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/exceptions");
  revalidatePath("/rh/contrats");
}

export async function listSalaryExceptions(): Promise<ActionResult<SalaryExceptionRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_exceptions")
    .select(
      `
      id, employee_id, rubrique_id, amount, unit, period_year, period_month, duration_mode,
      until_year, until_month, reason, status_code, is_active, granted_by,
      employee:hr_employees ( matricule, last_name, first_name ),
      rubrique:hr_salary_rubriques ( code, label_ar, label_fr, category ),
      grantor:sys_users!granted_by ( full_name )
    `,
    )
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee;
      const rub = Array.isArray(row.rubrique) ? row.rubrique[0] : row.rubrique;
      const grantor = Array.isArray(row.grantor) ? row.grantor[0] : row.grantor;
      return {
        id: row.id,
        employee_id: row.employee_id,
        rubrique_id: row.rubrique_id,
        amount: Number(row.amount),
        unit: (row.unit as SalaryExceptionRow["unit"]) ?? null,
        period_year: row.period_year,
        period_month: row.period_month,
        duration_mode: row.duration_mode,
        until_year: row.until_year,
        until_month: row.until_month,
        reason: row.reason,
        status_code: row.status_code,
        is_active: row.is_active,
        granted_by: row.granted_by,
        grantor_name: grantor?.full_name ?? null,
        employee_label: `${emp?.matricule ?? ""} · ${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
        rubrique_code: rub?.code ?? "",
        rubrique_label_ar: rub?.label_ar ?? "",
        rubrique_label_fr: rub?.label_fr ?? "",
        category: (rub?.category ?? "4") as SalaryExceptionRow["category"],
      };
    }),
  };
}

export async function upsertSalaryException(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = salaryExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const payload = {
    employee_id: p.employee_id,
    rubrique_id: p.rubrique_id,
    amount: p.amount,
    unit: p.unit ?? null,
    period_year: p.period_year,
    period_month: p.period_month,
    duration_mode: p.duration_mode,
    until_year: p.duration_mode === "until" ? p.until_year ?? null : null,
    until_month: p.duration_mode === "until" ? p.until_month ?? null : null,
    reason: p.reason,
    status_code: p.status_code,
    granted_by: gate.workspace.id,
    is_active: true,
  };
  const q = p.id
    ? supabase.from("hr_salary_exceptions").update(payload).eq("id", p.id)
    : supabase.from("hr_salary_exceptions").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  if (p.status_code === "APPROVED") {
    await refreshDraftPayroll({
      employeeId: p.employee_id,
      year: p.period_year,
      month: p.period_month,
    });
  }
  revalidateExceptions();
  return { ok: true, data: { id: data.id } };
}

export async function setSalaryExceptionStatus(input: {
  id: string;
  status_code: "DRAFT" | "APPROVED" | "CANCELLED";
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_exceptions")
    .update({ status_code: input.status_code })
    .eq("id", input.id)
    .select("id, employee_id, period_year, period_month")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée." };
  await refreshDraftPayroll({
    employeeId: data.employee_id,
    year: data.period_year,
    month: data.period_month,
  });
  revalidateExceptions();
  return { ok: true, data: { id: data.id } };
}

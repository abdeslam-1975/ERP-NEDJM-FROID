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
  created_by: string | null;
  creator_name: string | null;
  approved_by: string | null;
  approver_name: string | null;
  approved_at: string | null;
  decided_note: string | null;
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
      created_by, approved_by, approved_at, decided_note,
      employee:hr_employees ( matricule, last_name, first_name ),
      rubrique:hr_salary_rubriques ( code, label_ar, label_fr, category ),
      grantor:sys_users!granted_by ( full_name ),
      creator:sys_users!created_by ( full_name ),
      approver:sys_users!approved_by ( full_name )
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
      const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
      const approver = Array.isArray(row.approver) ? row.approver[0] : row.approver;
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
        created_by: row.created_by ?? null,
        creator_name: creator?.full_name ?? null,
        approved_by: row.approved_by ?? null,
        approver_name: approver?.full_name ?? null,
        approved_at: row.approved_at ?? null,
        decided_note: row.decided_note ?? null,
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
    is_active: true,
  };
  // Always saved as DRAFT; approval goes through hr_salary_exception_decide (four-eyes).
  const q = p.id
    ? supabase.from("hr_salary_exceptions").update(payload).eq("id", p.id).eq("status_code", "DRAFT")
    : supabase.from("hr_salary_exceptions").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: p.id
        ? "Seul un brouillon est modifiable : annulez l'exception puis recréez-la."
        : "Enregistrement refusé (droits).",
    };
  }
  revalidateExceptions();
  return { ok: true, data: { id: data.id } };
}

export async function deleteSalaryException(id: string): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_exceptions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidateExceptions();
  return { ok: true, data: undefined };
}

export async function setSalaryExceptionStatus(input: {
  id: string;
  status_code: "APPROVED" | "CANCELLED";
  note?: string;
}): Promise<ActionResult<{ id: string; result: "APPROVED" | "CANCELLED" | "SHORTENED" }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("hr_salary_exception_decide", {
    p_id: input.id,
    p_status: input.status_code,
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  const { data: row } = await supabase
    .from("hr_salary_exceptions")
    .select("id, employee_id, period_year, period_month")
    .eq("id", input.id)
    .maybeSingle();
  if (row) {
    await refreshDraftPayroll({
      employeeId: row.employee_id,
      year: row.period_year,
      month: row.period_month,
    });
  }
  revalidateExceptions();
  return {
    ok: true,
    data: { id: input.id, result: result as "APPROVED" | "CANCELLED" | "SHORTENED" },
  };
}

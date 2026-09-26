"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AdvanceRow = {
  id: string;
  employee_id: string;
  employee_label: string;
  kind: "ADVANCE" | "LOAN";
  principal_amount: number;
  installment_amount: number;
  start_year: number;
  start_month: number;
  granted_on: string;
  reason: string;
  status: "ACTIVE" | "CANCELLED";
  /** Sum of the retenues already on payslips (all runs). */
  deducted: number;
  remaining: number;
  author_name: string | null;
};

const advanceSchema = z
  .object({
    employee_id: z.string().uuid("Employé requis · اختر العامل"),
    kind: z.enum(["ADVANCE", "LOAN"]),
    principal_amount: z.coerce.number().positive("Montant requis · المبلغ مطلوب"),
    installment_amount: z.coerce.number().positive("Mensualité requise · القسط مطلوب"),
    start_year: z.coerce.number().int().min(2000).max(2100),
    start_month: z.coerce.number().int().min(1).max(12),
    granted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    reason: z.string().trim().min(3, "Motif requis (3 caractères min.) · السبب مطلوب"),
  })
  .refine((v) => v.installment_amount <= v.principal_amount, {
    message: "La mensualité dépasse le montant. · القسط أكبر من المبلغ",
    path: ["installment_amount"],
  });

function revalidateAdvances() {
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/avances");
  revalidatePath("/rh/paie/bulletins");
}

export async function listAdvances(): Promise<ActionResult<AdvanceRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_advances")
    .select(
      `id, employee_id, kind, principal_amount, installment_amount, start_year, start_month, granted_on,
       reason, status, employee:hr_employees ( matricule, last_name, first_name ),
       author:sys_users!created_by ( full_name )`,
    )
    .order("granted_on", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const ids = (data ?? []).map((r) => r.id);
  const deducted = new Map<string, number>();
  if (ids.length) {
    const { data: lines, error: lErr } = await supabase
      .from("hr_payroll_slip_lines")
      .select("advance_id, amount")
      .in("advance_id", ids);
    if (lErr) return { ok: false, error: lErr.message };
    for (const l of lines ?? []) {
      if (!l.advance_id) continue;
      deducted.set(l.advance_id, (deducted.get(l.advance_id) ?? 0) + Math.abs(Number(l.amount)));
    }
  }
  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee;
      const author = Array.isArray(row.author) ? row.author[0] : row.author;
      const principal = Number(row.principal_amount);
      const done = Math.round((deducted.get(row.id) ?? 0) * 100) / 100;
      return {
        id: row.id,
        employee_id: row.employee_id,
        employee_label: `${emp?.matricule ?? ""} · ${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
        kind: row.kind,
        principal_amount: principal,
        installment_amount: Number(row.installment_amount),
        start_year: row.start_year,
        start_month: row.start_month,
        granted_on: String(row.granted_on).slice(0, 10),
        reason: row.reason,
        status: row.status,
        deducted: done,
        remaining: Math.max(0, Math.round((principal - done) * 100) / 100),
        author_name: author?.full_name ?? null,
      };
    }),
  };
}

export async function createAdvance(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_advances")
    .insert({ ...p, status: "ACTIVE" })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  await refreshDraftPayroll({ employeeId: p.employee_id });
  revalidateAdvances();
  return { ok: true, data: { id: data.id } };
}

export async function cancelAdvance(id: string): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_advances")
    .update({ status: "CANCELLED" })
    .eq("id", id)
    .select("employee_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée." };
  await refreshDraftPayroll({ employeeId: data.employee_id });
  revalidateAdvances();
  return { ok: true, data: undefined };
}

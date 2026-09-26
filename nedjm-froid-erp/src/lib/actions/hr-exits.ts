"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";
import { listLeaveBalances } from "@/lib/actions/hr-leave";
import { normalizeSettlementLines, suggestSettlement, type SettlementLine } from "@/lib/hr/leave";
import { salaryAsOf, type SalaryVersion } from "@/lib/hr/payroll-calc";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ExitRow = {
  id: string;
  employee_id: string;
  employee_label: string;
  contract_id: string | null;
  exit_date: string;
  reason_code: string;
  notes: string | null;
  leave_balance_days: number | null;
  settlement_lines: SettlementLine[];
  total: number;
  status: "DRAFT" | "VALIDATED" | "CANCELLED";
  validated_at: string | null;
  validated_by_name: string | null;
  created_by_name: string | null;
};

export type ExitSuggestion = {
  contract_id: string | null;
  leave_balance_days: number;
  base_monthly: number;
  lines: SettlementLine[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const lineSchema = z.object({
  code: z.string().trim().min(1).max(20),
  label_fr: z.string().trim().min(1, "Libellé requis · التسمية مطلوبة").max(200),
  label_ar: z.string().trim().max(200),
  category: z.enum(["1", "2", "3", "4"]),
  amount: z.coerce.number().refine((v) => v !== 0, "Montant non nul · المبلغ مطلوب"),
});

const exitSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  employee_id: z.string().uuid("Employé requis · اختر العامل"),
  contract_id: z.string().uuid().optional().nullable(),
  exit_date: z.string().regex(DATE, "Date de sortie invalide"),
  reason_code: z.enum(["END_CDD", "RESIGNATION", "DISMISSAL", "ABANDON", "MUTUAL", "TRIAL_END", "RETIREMENT", "DEATH", "OTHER"]),
  notes: z.string().trim().max(1000).optional().nullable(),
  leave_balance_days: z.coerce.number().min(-400).max(400).optional().nullable(),
  settlement_lines: z.array(lineSchema).max(30),
});

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function revalidateExits() {
  revalidatePath("/rh/sorties");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/employes");
  revalidatePath("/rh/paie");
}

export async function listExits(): Promise<ActionResult<ExitRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_exits")
    .select(
      `id, employee_id, contract_id, exit_date, reason_code, notes, leave_balance_days, settlement_lines, status, validated_at,
       employee:hr_employees ( matricule, last_name, first_name ),
       validator:sys_users!validated_by ( full_name ),
       author:sys_users!created_by ( full_name )`,
    )
    .order("exit_date", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => {
      const emp = one(r.employee);
      const lines = normalizeSettlementLines(r.settlement_lines);
      return {
        id: r.id,
        employee_id: r.employee_id,
        employee_label: `${emp?.matricule ?? ""} · ${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
        contract_id: r.contract_id,
        exit_date: String(r.exit_date).slice(0, 10),
        reason_code: r.reason_code,
        notes: r.notes,
        leave_balance_days: r.leave_balance_days == null ? null : Number(r.leave_balance_days),
        settlement_lines: lines,
        total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
        status: r.status,
        validated_at: r.validated_at,
        validated_by_name: one(r.validator)?.full_name ?? null,
        created_by_name: one(r.author)?.full_name ?? null,
      };
    }),
  };
}

/** Principal contract at the exit date, leave balance and the matching compensatory indemnity. */
export async function suggestExit(input: {
  employee_id: string;
  exit_date: string;
}): Promise<ActionResult<ExitSuggestion>> {
  if (!z.string().uuid().safeParse(input.employee_id).success) return { ok: false, error: "Employé invalide." };
  if (!DATE.test(input.exit_date)) return { ok: false, error: "Date invalide." };
  const supabase = await createClient();
  const { data: contracts, error } = await supabase
    .from("hr_contracts")
    .select("id, start_date, end_date, status, affectation_principale, salaire_base_monthly, salaire_net_ref_monthly")
    .eq("employee_id", input.employee_id)
    .eq("affectation_principale", true)
    .lte("start_date", input.exit_date)
    .order("start_date", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const ctr = (contracts ?? [])[0] ?? null;
  let base = 0;
  if (ctr) {
    const { data: versions } = await supabase
      .from("hr_contract_salary_history")
      .select("contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly")
      .eq("contract_id", ctr.id);
    base = salaryAsOf((versions ?? []) as SalaryVersion[], ctr.id, input.exit_date, {
      base: Number(ctr.salaire_base_monthly ?? 0),
      net: Number(ctr.salaire_net_ref_monthly ?? 0),
    }).base;
  }
  const bal = await listLeaveBalances({ employeeId: input.employee_id, asOf: input.exit_date });
  if (!bal.ok) return bal;
  const days = bal.data[0]?.balance ?? 0;
  return {
    ok: true,
    data: {
      contract_id: ctr?.id ?? null,
      leave_balance_days: days,
      base_monthly: base,
      lines: suggestSettlement({ leaveBalanceDays: days, baseMonthly: base }),
    },
  };
}

export async function saveExit(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = exitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { id, ...p } = parsed.data;
  const row = {
    ...p,
    contract_id: p.contract_id || null,
    notes: p.notes || null,
    leave_balance_days: p.leave_balance_days ?? null,
    settlement_lines: p.settlement_lines.map((l) => ({ ...l, code: l.code.toUpperCase() })),
    status: "DRAFT" as const,
  };
  const supabase = await createClient();
  const query = id
    ? supabase.from("hr_employee_exits").update(row).eq("id", id).select("id").maybeSingle()
    : supabase.from("hr_employee_exits").insert(row).select("id").maybeSingle();
  const { data, error } = await query;
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Une sortie est déjà ouverte pour cet employé. · توجد وضعية خروج مفتوحة لهذا العامل" };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Modification refusée (sortie validée ou droits insuffisants)." };
  revalidateExits();
  return { ok: true, data: { id: data.id } };
}

export async function deleteExit(id: string): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_employee_exits").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Seul un brouillon peut être supprimé." };
  revalidateExits();
  return { ok: true, data: undefined };
}

export async function setExitStatus(input: {
  id: string;
  status: "VALIDATED" | "CANCELLED";
}): Promise<ActionResult> {
  if (input.status !== "VALIDATED" && input.status !== "CANCELLED") return { ok: false, error: "Statut invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_exit_set_status", { p_id: input.id, p_status: input.status });
  if (error) return { ok: false, error: error.message };
  const { data } = await supabase
    .from("hr_employee_exits")
    .select("employee_id, exit_date")
    .eq("id", input.id)
    .maybeSingle();
  if (data) {
    const d = String(data.exit_date);
    await refreshDraftPayroll({
      employeeId: data.employee_id,
      year: Number(d.slice(0, 4)),
      month: Number(d.slice(5, 7)),
    });
  }
  revalidateExits();
  return { ok: true, data: undefined };
}

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listPayrollSlips, loadPayrollIrgScales } from "@/lib/actions/hr-ops";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { renderBulletinHtml, slipToBulletin } from "@/components/rh/bulletin-print";
import { bulletinRatesFromVars } from "@/lib/hr/bulletin-settings";
import { requestOrigin } from "@/lib/pdf/print-archive";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PayslipRegisterRow = {
  id: string;
  employee_id: string;
  period_year: number;
  period_month: number;
  site_name: string;
  matricule: string;
  employee_name: string;
  days_paid: number;
  net_payable: number;
  status_code: string;
};

type One<T> = T | T[] | null;
const one = <T,>(value: One<T>) => (Array.isArray(value) ? value[0] ?? null : value);

/** Every payslip already produced, newest period first. */
export async function listPayslipRegister(): Promise<ActionResult<PayslipRegisterRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_slips")
    .select(
      "id, employee_id, days_paid, net_payable, status_code, run:hr_payroll_runs ( period_year, period_month, site:ref_sites ( name_fr ) ), employee:hr_employees ( matricule, last_name, first_name )",
    )
    .limit(5000);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []).map((row) => {
    const run = one(row.run as One<{ period_year: number; period_month: number; site: One<{ name_fr: string }> }>);
    const emp = one(row.employee as One<{ matricule: string; last_name: string; first_name: string }>);
    return {
      id: row.id,
      employee_id: row.employee_id,
      period_year: run?.period_year ?? 0,
      period_month: run?.period_month ?? 0,
      site_name: one(run?.site ?? null)?.name_fr ?? "",
      matricule: emp?.matricule ?? "",
      employee_name: `${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
      days_paid: Number(row.days_paid ?? 0),
      net_payable: Number(row.net_payable ?? 0),
      status_code: row.status_code,
    };
  });
  rows.sort(
    (a, b) =>
      b.period_year - a.period_year ||
      b.period_month - a.period_month ||
      a.site_name.localeCompare(b.site_name) ||
      a.matricule.localeCompare(b.matricule, undefined, { numeric: true }),
  );
  return { ok: true, data: rows };
}

/** The payslip exactly as « Imprimer » prints it on the payroll screen. */
export async function getPayslipBulletinHtml(input: {
  slip_id: string;
  year: number;
  month: number;
}): Promise<ActionResult<{ html: string }>> {
  if (!z.string().uuid().safeParse(input.slip_id).success) return { ok: false, error: "Bulletin invalide." };
  const [slips, irg, context, origin] = await Promise.all([
    listPayrollSlips({ year: input.year, month: input.month }),
    loadPayrollIrgScales({ year: input.year, month: input.month }),
    loadPayrollBulletinContext(),
    requestOrigin(),
  ]);
  if (!slips.ok) return slips;
  const slip = slips.data.find((s) => s.id === input.slip_id);
  if (!slip) return { ok: false, error: "Bulletin introuvable." };
  const settings = context.bulletin;
  const model = slipToBulletin(slip, settings, bulletinRatesFromVars(slip.legal_vars, settings), irg.ok ? irg.data : null);
  return { ok: true, data: { html: renderBulletinHtml(context.template, [model], origin) } };
}

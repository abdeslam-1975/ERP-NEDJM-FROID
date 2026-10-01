"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hrContractSchema } from "@/lib/validations/hr";
import { replaceContractSalaryLines } from "@/lib/actions/hr-salary";
import { signalPayrollInputChange } from "@/lib/hr/payroll-input-signal";
import { payrollSignalNotice } from "@/lib/decisions/catalog";
import { isFirstOfMonth } from "@/lib/hr/assignments";
import {
  isPrincipalExclusionError,
  planPrincipalClose,
} from "@/lib/hr/principal-contract";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type HrContractRow = {
  id: string;
  employee_id: string;
  site_id: string;
  activity_code_id: string;
  contract_type_code: string | null;
  work_regime_code: string | null;
  cnas_regime_code: string | null;
  poste_ar: string | null;
  poste_fr: string | null;
  qualification_code: string | null;
  poste_id: string | null;
  grade: string | null;
  agency_id: string | null;
  interim_daily_rate: number | null;
  affectation_principale: boolean;
  salaire_base_monthly: number;
  salaire_net_ref_monthly: number;
  salaire_net_recup_monthly: number | null;
  start_date: string;
  end_date: string | null;
  status: string;
  last_name: string;
  first_name: string;
  employee_name: string;
  matricule: string;
  site_name: string;
};

function revalidate() {
  revalidatePath("/rh");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/employes");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/social");
  revalidatePath("/rh/paie/fiscal");
}

export async function listHrContracts(): Promise<ActionResult<HrContractRow[]>> {
  const supabase = await createClient();
  // Dated assignment changes whose month has come: the displayed site follows (failures only delay the display).
  await supabase.rpc("hr_contract_assignments_refresh_due");
  const { data, error } = await supabase
    .from("hr_contracts")
    .select(
      `
      id, employee_id, site_id, activity_code_id, contract_type_code, work_regime_code, cnas_regime_code,
      poste_ar, poste_fr, qualification_code, poste_id, grade, agency_id, interim_daily_rate, affectation_principale,
      salaire_base_monthly, salaire_net_ref_monthly, salaire_net_recup_monthly,
      start_date, end_date, status,
      employee:hr_employees ( matricule, last_name, first_name ),
      site:ref_sites ( name_fr )
    `,
    )
    .order("start_date", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee;
      const site = Array.isArray(row.site) ? row.site[0] : row.site;
      return {
        id: row.id,
        employee_id: row.employee_id,
        site_id: row.site_id,
        activity_code_id: row.activity_code_id,
        contract_type_code: row.contract_type_code,
        work_regime_code: row.work_regime_code,
        cnas_regime_code: row.cnas_regime_code ?? null,
        poste_ar: row.poste_ar,
        poste_fr: row.poste_fr,
        qualification_code: row.qualification_code,
        poste_id: row.poste_id ?? null,
        grade: row.grade ?? null,
        agency_id: row.agency_id ?? null,
        interim_daily_rate: row.interim_daily_rate == null ? null : Number(row.interim_daily_rate),
        affectation_principale: row.affectation_principale,
        salaire_base_monthly: Number(row.salaire_base_monthly),
        salaire_net_ref_monthly: Number(row.salaire_net_ref_monthly),
        salaire_net_recup_monthly:
          row.salaire_net_recup_monthly == null
            ? null
            : Number(row.salaire_net_recup_monthly),
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.status,
        last_name: emp?.last_name ?? "",
        first_name: emp?.first_name ?? "",
        employee_name: `${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
        matricule: emp?.matricule ?? "",
        site_name: site?.name_fr ?? "",
      };
    }),
  };
}

export async function upsertHrContract(
  input: unknown,
): Promise<
  ActionResult<{ id: string; closed_previous: number; payroll_notice: string | null; warning: string | null }>
> {
  const parsed = hrContractSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  if (p.contract_type_code === "INTERIM" && !p.agency_id) {
    return { ok: false, error: "Contrat d'intérim : choisissez l'agence." };
  }
  if (!p.id && !isFirstOfMonth(p.start_date)) {
    return {
      ok: false,
      error:
        "Un contrat commence le 1er du mois : aucun contrat ne débute en milieu de mois. · يبدأ العقد في اليوم الأول من الشهر.",
    };
  }
  const supabase = await createClient();
  let closePlan: { id: string; end_date: string }[] = [];
  if (p.affectation_principale) {
    const { data: existing, error: existingErr } = await supabase
      .from("hr_contracts")
      .select("id, start_date, end_date, status")
      .eq("employee_id", p.employee_id)
      .eq("affectation_principale", true);
    if (existingErr) return { ok: false, error: existingErr.message };
    const plan = planPrincipalClose(
      (existing ?? []).map((row) => ({
        id: row.id,
        start_date: String(row.start_date).slice(0, 10),
        end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
        status: row.status,
      })),
      {
        id: p.id,
        start_date: p.start_date,
        end_date: p.end_date,
        status: p.status,
      },
    );
    if (!plan.ok) return plan;
    closePlan = plan.close;
  }
  const payload = {
    employee_id: p.employee_id,
    site_id: p.site_id,
    activity_code_id: p.activity_code_id,
    contract_type_code: p.contract_type_code,
    work_regime_code: p.work_regime_code,
    cnas_regime_code: p.cnas_regime_code,
    poste_ar: p.poste_ar,
    poste_fr: p.poste_fr,
    qualification_code: p.qualification_code,
    poste_id: p.poste_id,
    grade: p.grade ? p.grade.toUpperCase() : null,
    agency_id: p.contract_type_code === "INTERIM" ? p.agency_id : null,
    interim_daily_rate: p.contract_type_code === "INTERIM" ? p.interim_daily_rate ?? null : null,
    affectation_principale: p.affectation_principale,
    salaire_base_monthly: p.salaire_base_monthly,
    salaire_net_ref_monthly: p.salaire_net_ref_monthly,
    salaire_net_recup_monthly: p.salaire_net_recup_monthly ?? null,
    start_date: p.start_date,
    end_date: p.end_date,
    status: p.status,
    currency: "DZD",
  };
  // After creation the site mirrors the dated assignment in force; it changes only through assignments.
  const updatePayload: Partial<typeof payload> = { ...payload };
  delete updatePayload.site_id;
  const { data: savedId, error } = await supabase.rpc("hr_contract_save", {
    p_close: closePlan,
    p_id: p.id ?? null,
    p_payload: p.id ? updatePayload : payload,
  });
  const data = typeof savedId === "string" ? { id: savedId } : null;
  if (error) {
    if (isPrincipalExclusionError(error.message)) {
      return {
        ok: false,
        error:
          "Un seul contrat principal ouvert par employé sur une même période. Terminez l'ancien ou décochez le principal. · عقد رئيسي واحد مفتوح للعامل في نفس الفترة. أنهِ السابق أو ألغِ خانة التعيين الرئيسي.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Enregistrement refusé (droits ou overlap)." };
  // The contract row is saved from here on: later failures are reported as warnings with its id,
  // otherwise a retry from the form would try to insert a second principal contract.
  let warning: string | null = null;
  if (p.salary_lines) {
    const lines = await replaceContractSalaryLines({
      contract_id: data.id,
      employee_id: p.employee_id,
      lines: p.salary_lines,
    });
    if (!lines.ok) {
      warning = `Contrat enregistré, mais les rubriques de salaire ne l'ont pas été : ${lines.error}`;
    }
  }
  const signal = await signalPayrollInputChange(supabase, {
    source: "CONTRACT",
    employeeId: p.employee_id,
    contractIds: [data.id],
    siteId: p.site_id,
  });
  if (!signal.ok) {
    const failed = `Paie brouillon non signalée : ${signal.error}`;
    warning = warning ? `${warning}\n${failed}` : failed;
  }
  revalidate();
  return {
    ok: true,
    data: {
      id: data.id,
      closed_previous: closePlan.length,
      payroll_notice: signal.ok ? payrollSignalNotice(signal.data) : null,
      warning,
    },
  };
}

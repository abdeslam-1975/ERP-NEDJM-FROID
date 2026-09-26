"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hrContractSchema } from "@/lib/validations/hr";
import { replaceContractSalaryLines } from "@/lib/actions/hr-salary";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";
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
  poste_ar: string | null;
  poste_fr: string | null;
  qualification_code: string | null;
  poste_id: string | null;
  grade: string | null;
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
  const { data, error } = await supabase
    .from("hr_contracts")
    .select(
      `
      id, employee_id, site_id, activity_code_id, contract_type_code, work_regime_code,
      poste_ar, poste_fr, qualification_code, poste_id, grade, affectation_principale,
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
        poste_ar: row.poste_ar,
        poste_fr: row.poste_fr,
        qualification_code: row.qualification_code,
        poste_id: row.poste_id ?? null,
        grade: row.grade ?? null,
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
): Promise<ActionResult<{ id: string; closed_previous: number; refreshed_slips: number }>> {
  const parsed = hrContractSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  let closedPrevious = 0;
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
    for (const close of plan.close) {
      const { error: closeErr } = await supabase
        .from("hr_contracts")
        .update({
          end_date: close.end_date,
          status: "ENDED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", close.id);
      if (closeErr) return { ok: false, error: closeErr.message };
      closedPrevious += 1;
    }
  }
  const payload = {
    employee_id: p.employee_id,
    site_id: p.site_id,
    activity_code_id: p.activity_code_id,
    contract_type_code: p.contract_type_code,
    work_regime_code: p.work_regime_code,
    poste_ar: p.poste_ar,
    poste_fr: p.poste_fr,
    qualification_code: p.qualification_code,
    poste_id: p.poste_id,
    grade: p.grade ? p.grade.toUpperCase() : null,
    affectation_principale: p.affectation_principale,
    salaire_base_monthly: p.salaire_base_monthly,
    salaire_net_ref_monthly: p.salaire_net_ref_monthly,
    salaire_net_recup_monthly: p.salaire_net_recup_monthly ?? null,
    start_date: p.start_date,
    end_date: p.end_date,
    status: p.status,
    currency: "DZD",
  };
  const q = p.id
    ? supabase.from("hr_contracts").update(payload).eq("id", p.id)
    : supabase.from("hr_contracts").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
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
  if (p.salary_lines) {
    const lines = await replaceContractSalaryLines({
      contract_id: data.id,
      employee_id: p.employee_id,
      lines: p.salary_lines,
    });
    if (!lines.ok) return lines;
  }
  const refreshed = await refreshDraftPayroll({
    employeeId: p.employee_id,
    contractId: data.id,
  });
  revalidate();
  return {
    ok: true,
    data: {
      id: data.id,
      closed_previous: closedPrevious,
      refreshed_slips: refreshed.ok ? refreshed.data.count : 0,
    },
  };
}

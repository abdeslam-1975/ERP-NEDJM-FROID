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
import { contractAttributesSchema } from "@/lib/contracts/attributes-schema";
import { withdrawContractArchive } from "@/lib/hr/contract-archive";
import {
  absenceForPoste,
  absenceRules,
  asStoredClientTerms,
  citationsFromExtraction,
  citePenaltyRules,
  clientTermsKey,
  describedPenalties,
  laborPostes,
  posteMatchesLabor,
  storedClientTerms,
  storedFromWorkerTerms,
  transferableClauses,
  workerTerms,
  type StoredClientTerms,
  type WorkerTerm,
} from "@/lib/hr/client-contract-terms";

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
  client_contract_id: string | null;
  client_terms: StoredClientTerms | null;
};

function asStoredTerms(value: unknown): StoredClientTerms | null {
  return asStoredClientTerms(value);
}

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
      start_date, end_date, status, client_contract_id, client_terms,
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
        client_contract_id: row.client_contract_id ?? null,
        client_terms: asStoredTerms(row.client_terms),
      };
    }),
  };
}

export type OpenClientContract = {
  id: string;
  contract_number: string;
  client_name: string;
  site_id: string;
  labor: { id: string; designation: string; unit: string }[];
  absence: { id: string; label: string; detail: string; fixedAmount: number | null }[];
  penalties: {
    id: string;
    label: string;
    detail: string;
    fixedAmount: number | null;
    absence: boolean;
    grace: string;
    articleRef: string;
    statement: string;
  }[];
  clauses: { id: string; article_ref: string; title: string; content: string }[];
};

async function penaltyCitations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractIds: string[],
) {
  const byContract = new Map<string, ReturnType<typeof citationsFromExtraction>>();
  if (!contractIds.length) return byContract;
  const { data, error } = await supabase
    .from("contract_extractions")
    .select("contract_id, result, created_at")
    .in("contract_id", contractIds)
    .in("status", ["APPLIED", "DONE"])
    .order("created_at", { ascending: false });
  if (error || !data) return byContract;
  for (const row of data) {
    if (typeof row.contract_id !== "string" || byContract.has(row.contract_id)) continue;
    byContract.set(row.contract_id, citationsFromExtraction(row.result));
  }
  return byContract;
}

type ClientTermInput = {
  site_id: string;
  poste_fr: string | null;
  poste_ar: string | null;
  client_contract_id: string | null;
  clause_ids?: string[];
  /** Terms shown in the form. When present, their edited values replace the contract text. */
  terms?: WorkerTerm[];
  /** An existing contract can be edited before a client contract is linked. */
  allowMissing?: boolean;
};

export async function clientTermsForContract(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: ClientTermInput,
): Promise<ActionResult<StoredClientTerms | null>> {
  const { data, error } = await supabase
    .from("ref_contracts")
    .select(
      "id, contract_number, client_name, site_id, status, attributes, items:contract_items(id, item_type, designation, unit)",
    )
    .eq("site_id", input.site_id)
    .in("status", ["VALIDE", "EN_COURS"]);
  if (error) return { ok: false, error: error.message };
  const open = (data ?? []).filter(
    (row) => typeof row.contract_number === "string" && typeof row.client_name === "string" && row.site_id === input.site_id,
  );
  if (!input.client_contract_id) {
    if (open.length && !input.allowMissing) {
      return {
        ok: false,
        error: "Choisissez le contrat client de cette affectation. · اختاروا عقد العميل لهذا التعيين.",
      };
    }
    return { ok: true, data: null };
  }
  const chosen = open.find((row) => row.id === input.client_contract_id);
  if (!chosen) {
    return { ok: false, error: "Le contrat client choisi n'est pas ouvert sur cette affectation." };
  }
  const parsed = contractAttributesSchema.safeParse(chosen.attributes ?? {});
  const attrs = parsed.success ? parsed.data : contractAttributesSchema.parse({});
  const citations = (await penaltyCitations(supabase, [chosen.id])).get(chosen.id) ?? [];
  const labor = laborPostes((chosen.items ?? []) as { id: string; item_type: string; designation: string; unit?: string }[]);
  const poste = posteMatchesLabor(input.poste_fr || input.poste_ar || "", labor);
  if (!poste) {
    const names = labor.map((item) => item.designation).join(", ") || "aucun poste";
    return {
      ok: false,
      error: `Le poste doit être l'un des postes du contrat client : ${names}. · المنصب يجب أن يكون مذكوراً في عقد العميل.`,
    };
  }
  const rules = describedPenalties(citePenaltyRules([...attrs.penalties.presets, ...attrs.penalties.custom], citations));
  const clauses = transferableClauses(attrs.clauses.items);
  if (input.terms) {
    const drafted = workerTerms({ poste: poste.designation, labor, penalties: rules, clauses });
    const edited = new Map(input.terms.map((term) => [term.id, term]));
    const overlay = (term: WorkerTerm, edit: WorkerTerm | undefined): WorkerTerm[] => {
      const value = (edit ? edit.value : term.value).trim();
      const title = (edit?.title ?? term.title).trim();
      const penalties = (edit?.penalties ?? term.penalties).flatMap((row) => {
        const name = row.name.trim();
        const rate = row.value.trim();
        const amount = (row.amount ?? "").trim();
        if (!name && !rate && !amount) return [];
        return [{ id: row.id, name, value: rate, amount }];
      });
      if ((!value || !title) && !penalties.length) return [];
      return [{ ...term, title, value, articleRef: edit?.articleRef || term.articleRef, penalties }];
    };
    const merged = drafted.flatMap((term) => overlay(term, edited.get(term.id)));
    for (const edit of input.terms) {
      if (drafted.some((term) => term.id === edit.id)) continue;
      merged.push(...overlay(edit, edit));
    }
    return {
      ok: true,
      data: storedFromWorkerTerms({
        clientContractId: chosen.id,
        contractNumber: chosen.contract_number,
        poste: poste.designation,
        terms: merged,
        absenceIds: new Set(rules.filter((rule) => rule.absence).map((rule) => rule.id)),
      }),
    };
  }
  const matched = absenceForPoste(poste.designation, rules.filter((rule) => rule.absence));
  return {
    ok: true,
    data: storedClientTerms({
      clientContractId: chosen.id,
      contractNumber: chosen.contract_number,
      poste: poste.designation,
      rules: matched ? [matched] : [],
      clauses,
      confirmedIds: input.clause_ids ?? [],
    }),
  };
}

/** Open client contracts an HR user can apply to a work contract. */
export async function listOpenClientContracts(): Promise<ActionResult<OpenClientContract[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_contracts")
    .select(
      "id, contract_number, client_name, site_id, status, attributes, items:contract_items(id, item_type, designation, unit)",
    )
    .in("status", ["VALIDE", "EN_COURS"])
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []).filter(
    (row) => typeof row.contract_number === "string" && typeof row.client_name === "string",
  );
  const citations = await penaltyCitations(
    supabase,
    rows.map((row) => row.id),
  );
  return {
    ok: true,
    data: rows.map((row) => {
        const parsed = contractAttributesSchema.safeParse(row.attributes ?? {});
        const attrs = parsed.success ? parsed.data : contractAttributesSchema.parse({});
        const rules = citePenaltyRules(
          [...attrs.penalties.presets, ...attrs.penalties.custom],
          citations.get(row.id) ?? [],
        );
        return {
          id: row.id,
          contract_number: row.contract_number,
          client_name: row.client_name,
          site_id: row.site_id,
          labor: laborPostes((row.items ?? []) as { id: string; item_type: string; designation: string; unit?: string }[]),
          absence: absenceRules(rules),
          penalties: describedPenalties(rules),
          clauses: transferableClauses(attrs.clauses.items),
        };
      }),
  };
}

export async function upsertHrContract(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    closed_previous: number;
    payroll_notice: string | null;
    warning: string | null;
    reissue_notice: string | null;
  }>
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
  let previousKey = "";
  if (p.id) {
    const previous = await supabase
      .from("hr_contracts")
      .select("client_terms")
      .eq("id", p.id)
      .maybeSingle();
    if (previous.error) return { ok: false, error: previous.error.message };
    previousKey = clientTermsKey(asStoredTerms(previous.data?.client_terms));
  }
  const linked = await clientTermsForContract(supabase, { ...p, allowMissing: Boolean(p.id) });
  if (!linked.ok) return linked;
  const payload = {
    employee_id: p.employee_id,
    site_id: p.site_id,
    activity_code_id: p.activity_code_id,
    contract_type_code: p.contract_type_code,
    work_regime_code: p.work_regime_code,
    cnas_regime_code: p.cnas_regime_code,
    poste_ar: p.poste_ar,
    poste_fr: linked.data?.poste_label || p.poste_fr,
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
    client_contract_id: linked.data?.client_contract_id ?? null,
    client_terms: linked.data,
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
  let reissueNotice: string | null = null;
  if (p.id && clientTermsKey(linked.data) !== previousKey) {
    const withdrawn = await withdrawContractArchive(supabase, data.id);
    if (!withdrawn.ok) {
      warning = `Contrat enregistré, mais l'archive signée n'a pas été retirée : ${withdrawn.error}`;
    } else if (withdrawn.removed) {
      reissueNotice =
        "Conditions du contrat client modifiées : l'archive signée est retirée. Réimprimez et refaites signer. · تغيّرت شروط عقد العميل: سُحبت النسخة الموقّعة. أعيدوا الطباعة والتوقيع.";
    }
  }
  if (p.salary_lines) {
    const lines = await replaceContractSalaryLines({
      contract_id: data.id,
      employee_id: p.employee_id,
      lines: p.salary_lines,
    });
    if (!lines.ok) {
      const failed = `Contrat enregistré, mais les rubriques de salaire ne l'ont pas été : ${lines.error}`;
      warning = warning ? `${warning}\n${failed}` : failed;
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
      reissue_notice: reissueNotice,
    },
  };
}

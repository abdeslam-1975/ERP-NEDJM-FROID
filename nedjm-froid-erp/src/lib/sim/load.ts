import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { getContractPrintContext } from "@/lib/actions/hr-contract-print";
import { getHrEmployeeFiche } from "@/lib/actions/hr-employees";
import { suggestExit } from "@/lib/actions/hr-exits";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { getLetterContext } from "@/lib/actions/hr-letters";
import { legalVarsAsOf } from "@/lib/hr/legal-vars-as-of";
import { normalizeSettlementLines } from "@/lib/hr/leave";
import {
  OM_DONNEUR,
  OM_FAIT_A,
  OM_LIEU_DEPART,
  pickMissionContract,
  todayIsoAlgiers,
} from "@/lib/hr/mission-order";
import { loadPayrollSimulator } from "@/lib/hr/payroll-simulator-load";
import type { createClient } from "@/lib/supabase/server";
import { OM_FIELD_KEYS, type OmFieldKey, type OmSimData } from "@/lib/sim/documents";
import { kindLabel, type LeaveSimData } from "@/lib/sim/leave";
import type { SimRefOption, SimTargetId } from "@/lib/sim/targets-meta";
import type { SimTargetData } from "@/lib/sim/targets";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type SimLoaded = { data: SimTargetData | null; refs: SimRefOption[]; ref: string | null; notice: string | null };

function day(v: unknown) {
  return v ? String(v).slice(0, 10) : null;
}

function frDate(iso: string | null) {
  if (!iso) return "…";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function loadSimTarget(
  supabase: Supabase,
  input: { target: SimTargetId; employeeId: string | null; year: number; month: number; ref: string | null },
): Promise<Result<SimLoaded>> {
  try {
    return await load(supabase, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Chargement de l'élément impossible." };
  }
}

async function load(
  supabase: Supabase,
  input: { target: SimTargetId; employeeId: string | null; year: number; month: number; ref: string | null },
): Promise<Result<SimLoaded>> {
  const { target, employeeId, year, month } = input;
  const empty = (notice: string): Result<SimLoaded> => ({ ok: true, data: { data: null, refs: [], ref: null, notice } });

  if (target === "paie" || target === "pointage") {
    if (target === "pointage" && !employeeId) return empty("Choisissez un salarié.");
    const sim = await loadPayrollSimulator(supabase, { year, month, employeeId });
    if (!sim.ok) return sim;
    if (target === "pointage") {
      if (!sim.data.subject) return empty(sim.data.notice ?? "Aucun contrat pour ce salarié.");
      return { ok: true, data: { data: { target, sim: sim.data }, refs: [], ref: null, notice: sim.data.notice } };
    }
    const { bulletin, template, error } = await loadPayrollBulletinContext();
    if (!template) return { ok: false, error: error ?? "Modèle du bulletin introuvable." };
    return {
      ok: true,
      data: { data: { target, sim: sim.data, bulletin, template }, refs: [], ref: null, notice: sim.data.notice },
    };
  }

  if (!employeeId) return empty("Choisissez un salarié.");
  const today = todayIsoAlgiers();

  if (target === "solde_conge") {
    return { ok: true, data: { data: { target, leave: await loadLeave(supabase, employeeId, today) }, refs: [], ref: null, notice: null } };
  }

  if (target === "titre_conge") {
    const leave = await loadLeave(supabase, employeeId, today);
    const approved = leave.requests.filter((r) => r.status === "APPROVED");
    const refs = approved.map((r) => ({
      value: r.id,
      label: `${kindLabel(r.kind)} du ${frDate(r.start_date)} au ${frDate(r.end_date)} (${r.days} j)`,
    }));
    const request = approved.find((r) => r.id === input.ref) ?? null;
    const ctx = await getLetterContext({
      employee_id: employeeId,
      kind: request ? "LEAVE" : "ATTEST",
      leave_request_id: request?.id ?? null,
    });
    if (!ctx.ok) return ctx;
    return {
      ok: true,
      data: {
        data: {
          target,
          leave,
          letter: { ...ctx.data.values, kind: "LEAVE" },
          letterhead_url: ctx.data.letterhead_url,
          request: request
            ? { id: request.id, kind: request.kind, start_date: request.start_date, end_date: request.end_date, days: request.days }
            : null,
        },
        refs,
        ref: request?.id ?? null,
        notice: request ? null : "Nouveau titre de congé simulé (aucune demande choisie).",
      },
    };
  }

  if (target === "stc") {
    const { data: exitRow, error } = await supabase
      .from("hr_employee_exits")
      .select("exit_date, status, settlement_lines")
      .eq("employee_id", employeeId)
      .in("status", ["VALIDATED", "DRAFT"])
      .order("exit_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const exitDate = day(exitRow?.exit_date) ?? today;
    const [leave, letter, suggestion] = await Promise.all([
      loadLeave(supabase, employeeId, exitDate),
      getLetterContext({ employee_id: employeeId, kind: "STC" }),
      suggestExit({ employee_id: employeeId, exit_date: exitDate }),
    ]);
    if (!letter.ok) return letter;
    if (!suggestion.ok) return suggestion;
    const paie = await loadPayrollSimulator(supabase, {
      year: Number(exitDate.slice(0, 4)),
      month: Number(exitDate.slice(5, 7)),
      employeeId,
    });
    return {
      ok: true,
      data: {
        data: {
          target,
          leave,
          letter: letter.data.values,
          letterhead_url: letter.data.letterhead_url,
          exit: exitRow
            ? { date: exitDate, status: String(exitRow.status), lines: normalizeSettlementLines(exitRow.settlement_lines) }
            : null,
          base_monthly: suggestion.data.base_monthly,
          paie: paie.ok && paie.data.subject ? paie.data : null,
        },
        refs: [],
        ref: null,
        notice: exitRow ? null : "Aucune sortie enregistrée : sortie simulée à la date du jour.",
      },
    };
  }

  if (target === "ordre_mission") return loadMission(supabase, employeeId, input.ref, today);
  return loadContractDoc(supabase, employeeId, input.ref);
}

async function loadLeave(supabase: Supabase, employeeId: string, asOf: string): Promise<LeaveSimData> {
  const [emp, ctrs, reqs, adjs, vars] = await Promise.all([
    supabase.from("hr_employees").select("id, matricule, last_name, first_name").eq("id", employeeId).maybeSingle(),
    supabase
      .from("hr_contracts")
      .select("id, contract_number, start_date, end_date, affectation_principale, status")
      .eq("employee_id", employeeId)
      .order("start_date"),
    supabase
      .from("hr_leave_requests")
      .select("id, kind, status, days, start_date, end_date")
      .eq("employee_id", employeeId)
      .order("start_date"),
    supabase.from("hr_leave_adjustments").select("id, days, as_of, reason").eq("employee_id", employeeId).order("as_of"),
    legalVarsAsOf(supabase, asOf),
  ]);
  for (const r of [emp, ctrs, reqs, adjs]) {
    if (r.error) throw new Error(r.error.message);
  }
  if (!emp.data) throw new Error("Salarié introuvable.");
  return {
    employee: { id: emp.data.id, matricule: emp.data.matricule, name: `${emp.data.last_name} ${emp.data.first_name}`.trim() },
    as_of: asOf,
    rate: vars.CONGE_JOURS_MOIS ?? 2.5,
    contracts: (ctrs.data ?? [])
      .filter((c) => c.status !== "DRAFT" && c.status !== "CANCELLED")
      .map((c) => ({
        id: c.id,
        number: c.contract_number ?? null,
        start_date: String(c.start_date).slice(0, 10),
        end_date: day(c.end_date),
        affectation_principale: c.affectation_principale !== false,
        status: String(c.status),
      })),
    requests: (reqs.data ?? []).map((r) => ({
      id: r.id,
      kind: String(r.kind),
      status: String(r.status),
      days: Number(r.days),
      start_date: String(r.start_date).slice(0, 10),
      end_date: String(r.end_date).slice(0, 10),
    })),
    adjustments: (adjs.data ?? []).map((a) => ({
      id: a.id,
      days: Number(a.days),
      as_of: String(a.as_of).slice(0, 10),
      reason: String(a.reason ?? ""),
    })),
  };
}

async function loadMission(
  supabase: Supabase,
  employeeId: string,
  ref: string | null,
  today: string,
): Promise<Result<SimLoaded>> {
  const [orders, settings] = await Promise.all([
    supabase
      .from("hr_correspondences")
      .select("id, number, start_date, end_date, payload, status_code")
      .eq("employee_id", employeeId)
      .eq("type_code", "OM")
      .order("created_at", { ascending: false })
      .limit(50),
    getHrFicheSettings(),
  ]);
  if (orders.error) return { ok: false, error: orders.error.message };
  const rows = orders.data ?? [];
  const refs = rows.map((o) => ({
    value: o.id,
    label: `${o.number ?? "—"} · ${frDate(day(o.start_date))} → ${frDate(day(o.end_date))}${o.status_code === "CANCELLED" ? " (annulé)" : ""}`,
  }));
  const letterhead = settings.ok ? settings.data.letterhead_url : null;
  const blank = Object.fromEntries(OM_FIELD_KEYS.map((k) => [k, ""])) as Record<OmFieldKey, string>;
  const picked = rows.find((o) => o.id === ref);

  let om: OmSimData;
  if (picked) {
    const payload = (picked.payload ?? {}) as Record<string, unknown>;
    const fields = { ...blank };
    for (const k of OM_FIELD_KEYS) {
      const v = payload[k];
      if (typeof v === "string" || typeof v === "number") fields[k] = String(v);
    }
    om = {
      fields,
      numero: picked.number ?? "",
      letterhead_url: letterhead,
      today,
      original: { dateDepart: day(picked.start_date), dateRetour: day(picked.end_date) },
    };
  } else {
    const [fiche, contracts, catalogs] = await Promise.all([
      getHrEmployeeFiche(employeeId),
      supabase
        .from("hr_contracts")
        .select("employee_id, site_id, poste_fr, poste_ar, affectation_principale, status, start_date")
        .eq("employee_id", employeeId),
      supabase.from("hr_catalogs").select("code, label_fr").eq("kind", "id_type"),
    ]);
    if (!fiche.ok) return fiche;
    if (contracts.error) return { ok: false, error: contracts.error.message };
    const emp = fiche.data;
    const contract = pickMissionContract(
      (contracts.data ?? []).map((c) => ({ ...c, start_date: String(c.start_date).slice(0, 10) })),
      employeeId,
    );
    const site = contract?.site_id
      ? (await supabase.from("ref_sites").select("name_fr").eq("id", contract.site_id).maybeSingle()).data
      : null;
    const poste = contract?.poste_fr || emp.fiche_poste || "";
    const idType = (catalogs.data ?? []).find((c) => c.code === emp.id_type_code);
    om = {
      fields: {
        ...blank,
        matricule: emp.matricule,
        nom: emp.last_name,
        prenom: emp.first_name,
        affectation: site?.name_fr || emp.fiche_affectation || "",
        poste,
        lieuDepart: OM_LIEU_DEPART,
        pieceType: idType?.label_fr || emp.id_type_code || "",
        pieceNum: emp.id_number || "",
        pieceDelivre: (emp.id_issued_on || "").slice(0, 10),
        pieceFonction: poste,
        pieceLieu: emp.id_issued_by || "",
        donneur: OM_DONNEUR,
        faitA: OM_FAIT_A,
        dateDoc: today,
      },
      numero: "",
      letterhead_url: letterhead,
      today,
      original: null,
    };
  }
  return {
    ok: true,
    data: {
      data: { target: "ordre_mission", om },
      refs,
      ref: picked?.id ?? null,
      notice: picked ? null : "Nouvel ordre de mission simulé à partir de la fiche du salarié.",
    },
  };
}

async function loadContractDoc(supabase: Supabase, employeeId: string, ref: string | null): Promise<Result<SimLoaded>> {
  const { data: rows, error } = await supabase
    .from("hr_contracts")
    .select(
      "id, employee_id, site_id, contract_number, start_date, end_date, status, affectation_principale, poste_fr, poste_ar, salaire_net_ref_monthly, salaire_net_recup_monthly, print_data",
    )
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const list = (rows ?? []).map((c) => ({ ...c, start_date: String(c.start_date).slice(0, 10) }));
  if (!list.length) return { ok: true, data: { data: null, refs: [], ref: null, notice: "Aucun contrat de travail pour ce salarié." } };
  const refs = list.map((c) => ({
    value: c.id,
    label: `${c.contract_number ?? "—"} · ${frDate(c.start_date)} → ${frDate(day(c.end_date))} · ${c.status}`,
  }));
  const chosen = list.find((c) => c.id === ref) ?? pickMissionContract(list, employeeId) ?? list[0];
  const ctx = await getContractPrintContext(chosen.id);
  if (!ctx.ok) return ctx;
  const saved = (chosen.print_data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      data: {
        target: "contrat_travail",
        doc: {
          contract: {
            id: chosen.id,
            number: chosen.contract_number ?? null,
            start_date: chosen.start_date,
            end_date: day(chosen.end_date),
            net_ref: chosen.salaire_net_ref_monthly == null ? null : Number(chosen.salaire_net_ref_monthly),
            net_recup: chosen.salaire_net_recup_monthly == null ? null : Number(chosen.salaire_net_recup_monthly),
          },
          saved_keys: Object.keys(saved).filter((k) => typeof saved[k] === "string" && String(saved[k]).trim() !== ""),
          values: ctx.data.values,
          template: ctx.data.template,
        },
      },
      refs,
      ref: chosen.id,
      notice: null,
    },
  };
}

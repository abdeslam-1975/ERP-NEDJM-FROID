import {
  legacyRuleCount,
  parseLegacyRules,
  parseRuleBlockers,
  type LegacyRules,
  type RuleBlocker,
} from "@/lib/decisions/catalog";
import { parseSimulationTotals, type SimulationTotals } from "@/lib/hr/payroll-simulation";

/** Month preparation dashboard (hr_payroll_month_preparation). Reading it never changes anything. */
export type MonthPreparation = {
  period: {
    year: number;
    month: number;
    label: string;
    nature: string;
    site_id: string | null;
    site_name: string;
    closed: boolean;
    period_status: string | null;
    first_open_month: string | null;
    chain_required: boolean;
  };
  run: { id: string; status: string; slips: number; pending_changes: number } | null;
  previous: { label: string; nature: string; status: string | null };
  blockers: RuleBlocker[];
  legacy: LegacyRules;
  coefficients: {
    pending: { decision_id: string; code: string; coefficient: number; month: string }[];
    changes: { code: string; coefficient: number; previous: number; decision_id: string | null }[];
  };
  attendance: {
    validated: number;
    proposed: number;
    imports: { id: string; batch_no: string; status: string }[];
    without_attendance: number;
    without_attendance_sample: string[];
  };
  quality: { contract_start: number; sites_without_wilaya: string[] };
  decisions: { id: string; type_code: string; status: string; label: string }[];
  simulations: {
    id: string;
    decision_id: string;
    created_at: string;
    slip_count: number;
    totals: SimulationTotals;
    blockers: number;
  }[];
  can: { request: boolean; read_salary: boolean };
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const rows = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);

export function parseMonthPreparation(raw: unknown): MonthPreparation {
  const c = obj(raw);
  const period = obj(c.period);
  const run = c.run && typeof c.run === "object" ? obj(c.run) : null;
  const previous = obj(c.previous);
  const rules = obj(c.rules);
  const coef = obj(c.coefficients);
  const att = obj(c.attendance);
  const missing = obj(att.contracts_without_attendance);
  const quality = obj(c.quality);
  const can = obj(c.can);
  const open = str(period.first_open_month)?.slice(0, 10) ?? null;
  return {
    period: {
      year: num(period.year),
      month: num(period.month),
      label: str(period.label) ?? "",
      nature: str(period.nature) ?? "",
      site_id: str(period.site_id),
      site_name: str(period.site_name) ?? "",
      closed: period.closed === true,
      period_status: str(period.period_status),
      first_open_month: open && open > "1900-01-01" ? open : null,
      chain_required: period.chain_required === true,
    },
    run: run
      ? {
          id: str(run.id) ?? "",
          status: str(run.status) ?? "",
          slips: num(run.slips),
          pending_changes: num(run.pending_changes),
        }
      : null,
    previous: { label: str(previous.label) ?? "", nature: str(previous.nature) ?? "", status: str(previous.status) },
    blockers: parseRuleBlockers(rules.blockers),
    legacy: parseLegacyRules(rules.legacy),
    coefficients: {
      pending: rows(coef.pending).map((p) => ({
        decision_id: str(p.decision_id) ?? "",
        code: str(p.code) ?? "",
        coefficient: num(p.coefficient),
        month: (str(p.month) ?? "").slice(0, 10),
      })),
      changes: rows(coef.changes).map((p) => ({
        code: str(p.code) ?? "",
        coefficient: num(p.coefficient),
        previous: num(p.previous),
        decision_id: str(p.decision_id),
      })),
    },
    attendance: {
      validated: num(att.validated),
      proposed: num(att.proposed),
      imports: rows(att.imports).map((b) => ({
        id: str(b.id) ?? "",
        batch_no: str(b.batch_no) ?? "",
        status: str(b.status) ?? "",
      })),
      without_attendance: num(missing.count),
      without_attendance_sample: Array.isArray(missing.sample) ? missing.sample.map(String) : [],
    },
    quality: {
      contract_start: num(quality.contract_start),
      sites_without_wilaya: Array.isArray(quality.sites_without_wilaya) ? quality.sites_without_wilaya.map(String) : [],
    },
    decisions: rows(c.decisions).map((d) => ({
      id: str(d.id) ?? "",
      type_code: str(d.type_code) ?? "",
      status: str(d.status) ?? "",
      label: str(d.label) ?? "",
    })),
    simulations: rows(c.simulations).map((s) => ({
      id: str(s.id) ?? "",
      decision_id: str(s.decision_id) ?? "",
      created_at: str(s.created_at) ?? "",
      slip_count: num(s.slip_count),
      totals: parseSimulationTotals(s.totals),
      blockers: num(s.blockers),
    })),
    can: { request: can.request === true, read_salary: can.read_salary === true },
  };
}

export type PreparationLevel = "ok" | "info" | "warning" | "blocking";

export type PreparationCheck = {
  key: string;
  title: string;
  level: PreparationLevel;
  detail: string;
  href?: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Checklist of the month. Only pending rules block (D1); everything else informs, the launch stays manual. */
export function preparationChecks(p: MonthPreparation): PreparationCheck[] {
  const out: PreparationCheck[] = [];
  const legacy = legacyRuleCount(p.legacy);
  if (p.blockers.length) {
    out.push({
      key: "rules",
      title: "Règles légales",
      level: "blocking",
      detail: `${plural(p.blockers.length, "règle attend", "règles attendent")} son approbation ou sa date d'application : génération et validation de la paie bloquées (décision D1). Une simulation non validable peut être demandée.`,
      href: "/rh/legal/propositions",
    });
  } else {
    out.push({
      key: "rules",
      title: "Règles légales",
      level: legacy ? "warning" : "ok",
      detail: legacy
        ? `Aucune règle en attente. ${plural(legacy, "valeur en vigueur héritée", "valeurs en vigueur héritées")} sans proposition approuvée : avertissement seulement.`
        : "Aucune règle en attente ; toutes les valeurs en vigueur sont vérifiées.",
      href: legacy ? "/parametres/rh/cotisations" : undefined,
    });
  }

  if (p.coefficients.pending.length) {
    out.push({
      key: "coefficients",
      title: "Coefficients de présence",
      level: "warning",
      detail: `${plural(p.coefficients.pending.length, "demande de coefficient attend", "demandes de coefficient attendent")} la décision D14 : sans décision, l'ancien coefficient s'applique.`,
      href: "/decisions?type=D14",
    });
  } else {
    out.push({
      key: "coefficients",
      title: "Coefficients de présence",
      level: p.coefficients.changes.length ? "info" : "ok",
      detail: p.coefficients.changes.length
        ? `Changement(s) en vigueur à partir de ce mois : ${p.coefficients.changes.map((c) => `${c.code} ${c.previous} → ${c.coefficient}`).join(", ")}.`
        : "Aucun changement de coefficient en attente.",
    });
  }

  const attIssues: string[] = [];
  if (p.attendance.proposed) attIssues.push(`${plural(p.attendance.proposed, "présence proposée", "présences proposées")} non validée(s), ignorée(s) par la paie`);
  if (p.attendance.imports.length) attIssues.push(`${plural(p.attendance.imports.length, "import", "imports")} de présences en cours`);
  if (p.attendance.without_attendance) {
    attIssues.push(`${plural(p.attendance.without_attendance, "contrat", "contrats")} sans aucune présence validée`);
  }
  out.push({
    key: "attendance",
    title: "Présences",
    level: attIssues.length || !p.attendance.validated ? "warning" : "ok",
    detail: attIssues.length
      ? `${attIssues.join(" ; ")}.`
      : p.attendance.validated
        ? `${plural(p.attendance.validated, "présence validée", "présences validées")}.`
        : "Aucune présence validée pour ce mois.",
    href: "/rh/presence",
  });

  const quality: string[] = [];
  if (p.quality.contract_start) quality.push(`${plural(p.quality.contract_start, "contrat", "contrats")} ne commençant pas le 1er (D13)`);
  if (p.quality.sites_without_wilaya.length) {
    quality.push(`chantier(s) sans wilaya : ${p.quality.sites_without_wilaya.join(", ")}`);
  }
  out.push({
    key: "quality",
    title: "Qualité des données",
    level: quality.length ? "warning" : "ok",
    detail: quality.length ? `${quality.join(" ; ")}.` : "Contrats et chantiers conformes.",
    href: quality.length ? "/rh/qualite-donnees" : undefined,
  });

  out.push({
    key: "decisions",
    title: "Décisions du mois",
    level: p.decisions.length ? "warning" : "ok",
    detail: p.decisions.length
      ? `${plural(p.decisions.length, "décision ouverte", "décisions ouvertes")} : ${[...new Set(p.decisions.map((d) => d.type_code))].join(", ")}.`
      : "Aucune décision en attente pour ce mois.",
    href: p.decisions.length ? "/decisions" : undefined,
  });

  const prevDone = p.previous.status === "VALIDATED" || p.previous.status === "LOCKED";
  out.push({
    key: "previous",
    title: `Mois précédent (${p.previous.label})`,
    level: p.previous.nature === "EXTERNAL" ? "info" : prevDone ? "ok" : "warning",
    detail:
      p.previous.nature === "EXTERNAL"
        ? "Mois de reprise : payé et déclaré hors de l'application. L'absence de paie ici ne prouve rien."
        : prevDone
          ? "Paie validée."
          : "Paie du mois précédent ni validée ni clôturée.",
  });
  return out;
}

export type GenerationPath =
  | { kind: "CLOSED"; message: string }
  | { kind: "DRAFT"; message: string }
  | { kind: "D1"; message: string }
  | { kind: "D4"; message: string };

/** What « demander la génération » would open; the database decides again at request time. */
export function generationPath(p: MonthPreparation): GenerationPath {
  if (p.period.period_status) {
    return { kind: "CLOSED", message: "Paie de ce mois validée ou clôturée : aucune génération possible." };
  }
  if (p.run) {
    return { kind: "DRAFT", message: "Une paie brouillon existe : recalcul depuis l'écran Paie (décision D3)." };
  }
  if (p.blockers.length) {
    return {
      kind: "D1",
      message: "Règles en attente : la génération réelle est bloquée. Demandez la décision D1 (attendre ou simulation non validable).",
    };
  }
  return { kind: "D4", message: "Aucun blocage : la génération peut être demandée (décision D4)." };
}

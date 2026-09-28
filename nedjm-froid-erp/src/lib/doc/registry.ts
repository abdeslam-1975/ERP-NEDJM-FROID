import type { DocData } from "@/lib/doc/engine";

export type DocField = {
  path: string;
  label: string;
  group: string;
  format?: string;
  /** Only meaningful inside the element repeated for this list. */
  within?: string;
};

export type DocList = { path: string; label: string; within?: string };

export type DocTypeMeta = {
  id: DocTypeId;
  label: string;
  labelAr: string;
  /** Scope the fields are relative to (the element repeated for every printed page). */
  pageList: string;
  fields: DocField[];
  lists: DocList[];
};

export const DOC_TYPE_IDS = ["bulletin_paie"] as const;
export type DocTypeId = (typeof DOC_TYPE_IDS)[number];

export function isDocType(value: unknown): value is DocTypeId {
  return typeof value === "string" && (DOC_TYPE_IDS as readonly string[]).includes(value);
}

/** What a simulation hands to the document editor: the template type and the data it is rendered with. */
export type DocRender = { type: DocTypeId; data: DocData };

const money = (path: string, label: string, group: string): DocField => ({ path, label, group, format: "da" });
const days = (path: string, label: string): DocField => ({ path, label, group: "Jours", format: "da0" });
const pct = (path: string, label: string): DocField => ({ path, label, group: "Taux", format: "num" });

const BULLETIN: DocTypeMeta = {
  id: "bulletin_paie",
  label: "Bulletin de paie",
  labelAr: "كشف الأجر",
  pageList: "pages",
  lists: [
    { path: "lines", label: "Lignes de rubriques" },
    { path: "irg.brackets", label: "Tranches du barème IRG" },
  ],
  fields: [
    { path: "values.employee_name", label: "Nom de l'employé", group: "Employé" },
    { path: "values.fonction", label: "Fonction", group: "Employé" },
    { path: "values.affectation", label: "Affectation", group: "Employé" },
    { path: "values.hired_at", label: "Date d'entrée", group: "Employé" },
    { path: "values.nss", label: "N° sécurité sociale", group: "Employé" },
    { path: "values.birth_date", label: "Date de naissance", group: "Employé" },
    { path: "values.marital_code", label: "Situation familiale", group: "Employé" },
    { path: "values.residence", label: "Résidence", group: "Employé" },
    { path: "values.category", label: "Catégorie", group: "Employé" },
    { path: "matricule", label: "Matricule", group: "Employé" },
    { path: "period_text", label: "Période (mois / année)", group: "Employé" },
    { path: "employer.name", label: "Raison sociale", group: "Employeur" },
    { path: "employer.address", label: "Adresse", group: "Employeur" },
    { path: "employer.nif", label: "NIF", group: "Employeur" },
    { path: "employer.nis", label: "NIS", group: "Employeur" },
    { path: "employer.cnas_no", label: "N° CNAS", group: "Employeur" },
    { path: "employer.cacobatph_no", label: "N° CACOBATPH", group: "Employeur" },
    money("total_gain", "Total gains", "Totaux"),
    money("total_retenue", "Total retenues", "Totaux"),
    money("net_payable", "Net à payer", "Totaux"),
    money("base_cotisable", "Base cotisable", "Cotisations"),
    money("employee_ss", "CNAS salariale", "Cotisations"),
    money("employer_ss", "CNAS patronale", "Cotisations"),
    money("fos_amount", "FOS", "Cotisations"),
    money("cacobatph", "Congés annuels (CACOBATPH)", "Cotisations"),
    money("intemperies_employee", "Intempéries salariales", "Cotisations"),
    money("intemperies_employer", "Intempéries patronales", "Cotisations"),
    money("charges_salariales", "Charges salariales", "Cotisations"),
    money("charges_patronales", "Charges patronales", "Cotisations"),
    money("charges_totales", "Charges totales", "Cotisations"),
    money("cout_global", "Coût global", "Cotisations"),
    money("irg_base", "Base IRG", "IRG"),
    money("irg_amount", "IRG", "IRG"),
    money("irg.raw", "IRG barème (avant abattement)", "IRG"),
    money("irg.abatement_amount", "Abattement IRG", "IRG"),
    { path: "irg.fixed_rate_pct", label: "Taux libératoire %", group: "IRG", format: "num" },
    { path: "irg.zone_tax_pct", label: "Réduction de zone %", group: "IRG", format: "num" },
    { path: "compliance.irg", label: "Régime IRG", group: "Régimes" },
    { path: "compliance.cnas", label: "Régime CNAS", group: "Régimes" },
    { path: "compliance.cacobatph", label: "Régime CACOBATPH", group: "Régimes" },
    days("days_worked", "Jours travaillés"),
    days("days_weekend", "Week-ends et fériés"),
    days("days_rappel", "Rappel"),
    days("days_abandon", "Abandon de poste"),
    days("days_leave", "Congés"),
    days("days_absence", "Absences"),
    pct("rates.ss_pct", "Taux CNAS salarial"),
    pct("rates.pat_pct", "Taux CNAS patronal"),
    pct("rates.fos_pct", "Taux FOS"),
    pct("rates.caco_pct", "Taux congés annuels"),
    pct("rates.intemp_sal_pct", "Taux intempéries sal."),
    pct("rates.intemp_pat_pct", "Taux intempéries pat."),
    { path: "payment_mode", label: "Mode de paiement", group: "Paiement" },
    { path: "payment_date", label: "Date de paiement", group: "Paiement" },
    { path: "account_no", label: "N° de compte", group: "Paiement" },
    { path: "units.da", label: "Unité monétaire (« DA »)", group: "Unités" },
    { path: "units.percent", label: "Unité pourcentage", group: "Unités" },
    { path: "units.day", label: "Unité par jour", group: "Unités" },
    { path: "code", label: "Code rubrique", group: "Ligne de rubrique", within: "lines" },
    { path: "label", label: "Intitulé", group: "Ligne de rubrique", within: "lines" },
    { path: "nombre", label: "Nombre / base", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "taux", label: "Taux", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "taux_suffix", label: "Unité du taux", group: "Ligne de rubrique", within: "lines" },
    { path: "gain", label: "Gain", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "retenue", label: "Retenue", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "from", label: "De (annuel)", group: "Tranche IRG", format: "da", within: "irg.brackets" },
    { path: "to", label: "À (annuel)", group: "Tranche IRG", format: "da", within: "irg.brackets" },
    { path: "rate_pct", label: "Taux %", group: "Tranche IRG", format: "num", within: "irg.brackets" },
  ],
};

export const DOC_TYPES: Record<DocTypeId, DocTypeMeta> = {
  bulletin_paie: BULLETIN,
};

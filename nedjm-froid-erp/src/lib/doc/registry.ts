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
  /** Where the document is listed in Paramètres RH › Documents. */
  family: "paie" | "lettres" | "fiches" | "contrats";
  /** Scope the fields are relative to (the element repeated for every printed page). */
  pageList?: string;
  fields: DocField[];
  lists: DocList[];
};

/** What the editor needs to know about a document (built-in or created from the interface). */
export type DocMeta = Pick<DocTypeMeta, "label" | "labelAr" | "pageList" | "fields" | "lists">;

export const HR_DOC_TYPE_IDS = ["ordre_mission", "titre_conge", "fiche_renseignements", "contrat_cdd"] as const;

export const DOC_TYPE_IDS = ["bulletin_paie", ...HR_DOC_TYPE_IDS] as const;
export type DocTypeId = (typeof DOC_TYPE_IDS)[number];

export function isDocType(value: unknown): value is DocTypeId {
  return typeof value === "string" && (DOC_TYPE_IDS as readonly string[]).includes(value);
}

/** What a simulation hands to the document editor: the template type and the data it is rendered with. */
export type DocRender = { type: DocTypeId; data: DocData };

const money = (path: string, label: string, group: string): DocField => ({ path, label, group, format: "da" });
const days = (path: string, label: string): DocField => ({ path, label, group: "Jours", format: "da0" });
const pct = (path: string, label: string): DocField => ({ path, label, group: "Taux", format: "num" });
const byCode = (code: string, label: string): DocField => ({
  path: `comptes.${code}`,
  label: `${label} (${code})`,
  group: "Jours par code de pointage",
  format: "days",
});

const BULLETIN: DocTypeMeta = {
  id: "bulletin_paie",
  label: "Bulletin de paie",
  labelAr: "كشف الأجر",
  family: "paie",
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
    { path: "period_from", label: "Période du (1er jour du mois)", group: "Employé", format: "date_slash" },
    { path: "period_to", label: "Période au (dernier jour du mois)", group: "Employé", format: "date_slash" },
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
    byCode("P", "Présent"),
    byCode("MS", "Mission"),
    byCode("CRP", "Récupération"),
    byCode("CA", "Congé annuel"),
    byCode("CM", "Congé maladie"),
    byCode("CSS", "Congé sans solde"),
    byCode("AOP", "Absence autorisée payée"),
    byCode("AJ", "Absence justifiée"),
    byCode("AN", "Absence non justifiée"),
    byCode("W", "Week-end"),
    byCode("JF", "Jour férié"),
    byCode("AP", "Abandon de poste"),
    pct("rates.ss_pct", "Taux CNAS salarial"),
    pct("rates.pat_pct", "Taux CNAS patronal"),
    pct("rates.fos_pct", "Taux FOS"),
    pct("rates.caco_pct", "Taux congés annuels"),
    pct("rates.intemp_sal_pct", "Taux intempéries sal."),
    pct("rates.intemp_pat_pct", "Taux intempéries pat."),
    { path: "payment_mode", label: "Mode de paiement", group: "Paiement" },
    { path: "payment_date", label: "Date de paiement", group: "Paiement" },
    { path: "account_no", label: "N° de compte", group: "Paiement" },
    { path: "account_key", label: "Clé du compte", group: "Paiement" },
    { path: "units.da", label: "Unité monétaire (« DA »)", group: "Unités" },
    { path: "units.percent", label: "Unité pourcentage", group: "Unités" },
    { path: "units.day", label: "Unité par jour", group: "Unités" },
    { path: "code", label: "Code rubrique", group: "Ligne de rubrique", within: "lines" },
    { path: "label", label: "Intitulé", group: "Ligne de rubrique", within: "lines" },
    { path: "nombre", label: "Nombre / base", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "taux", label: "Taux", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "taux_suffix", label: "Unité du taux", group: "Ligne de rubrique", within: "lines" },
    { path: "nbr", label: "Nbr (jours / quantité)", group: "Ligne de rubrique", format: "da0", within: "lines" },
    { path: "base", label: "Base (montant de référence)", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "rate", label: "Taux (journalier ou %)", group: "Ligne de rubrique", format: "rate", within: "lines" },
    { path: "rate_suffix", label: "Unité du taux (colonne Taux)", group: "Ligne de rubrique", within: "lines" },
    { path: "gain", label: "Gain", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "retenue", label: "Retenue", group: "Ligne de rubrique", format: "da", within: "lines" },
    { path: "from", label: "De (annuel)", group: "Tranche IRG", format: "da", within: "irg.brackets" },
    { path: "to", label: "À (annuel)", group: "Tranche IRG", format: "da", within: "irg.brackets" },
    { path: "rate_pct", label: "Taux %", group: "Tranche IRG", format: "num", within: "irg.brackets" },
  ],
};

const text = (group: string) => (path: string, label: string): DocField => ({ path, label, group });

const company = text("Entreprise");
const COMPANY_FIELDS: DocField[] = [
  company("letterhead", "Papier à en-tête (adresse de l'image)"),
  company("company.name_fr", "Raison sociale (FR)"),
  company("company.name_ar", "Raison sociale (AR)"),
  company("company.short_name", "Nom court"),
  company("company.address_fr", "Adresse du siège (FR)"),
  company("company.address_ar", "Adresse du siège (AR)"),
  company("company.city_fr", "Ville de signature (FR)"),
  company("company.city_ar", "Ville de signature (AR)"),
  company("company.city_short", "Ville abrégée"),
  company("company.manager_name_fr", "Nom du gérant (FR)"),
  company("company.manager_name_ar", "Nom du gérant (AR)"),
  company("company.manager_title_fr", "Titre du signataire (FR)"),
  company("company.manager_title_ar", "Titre du signataire (AR)"),
  company("company.hr_service", "Service émetteur"),
  company("company.doc_prefix", "Préfixe des références"),
  company("company.phone", "Téléphone"),
  company("company.email", "Email"),
  company("company.nif", "NIF"),
  company("company.nis", "NIS"),
  company("company.rc", "Registre du commerce"),
  company("company.ai", "Article d'imposition"),
  company("company.bank", "Banque / RIB"),
];

const sheet = text("Document");
const SHEET_FIELDS: DocField[] = [
  sheet("numero", "N°"),
  sheet("reference", "Référence (NF/OM/0001/26)"),
  sheet("doc_title", "Titre de l'onglet / du PDF"),
  sheet("matricule", "Matricule"),
  sheet("nom_complet", "Nom et prénom"),
  sheet("affectation", "Affectation"),
  sheet("code_affectation", "Code affectation"),
  sheet("poste", "Fonction"),
  sheet("moyen", "Moyen de transport"),
  sheet("mode_tous", "✓ si tous moyens de transport"),
  sheet("mode_service", "✓ si véhicule de service"),
  sheet("modele", "Modèle du véhicule"),
  sheet("immat", "Immatriculation"),
  sheet("km_depart", "Kilométrage au départ"),
  sheet("km_retour", "Kilométrage au retour"),
  sheet("piece_type", "Pièce d'identité"),
  sheet("piece_num", "N° de la pièce"),
  sheet("piece_fonction", "Fonction (validation)"),
  sheet("donneur", "Établi par"),
  sheet("fait_a", "Fait à"),
  sheet("date_doc", "Date du document"),
];
const MISSION_FIELDS: DocField[] = [
  ...SHEET_FIELDS,
  sheet("dest1", "1ère destination"),
  sheet("dest2", "2ème destination"),
  sheet("destinations", "Destinations (1 — 2)"),
  sheet("depart", "Départ (lieu — date)"),
  sheet("retour", "Retour (lieu — date)"),
  sheet("depart_heure", "Départ (lieu — date — heure)"),
  sheet("retour_heure", "Retour (lieu — date — heure)"),
  sheet("motif", "Objet de la mission"),
  sheet("piece_delivre", "Pièce délivrée le"),
  sheet("piece_lieu", "Pièce délivrée à"),
  ...COMPANY_FIELDS,
];
const LEAVE_TITLE_FIELDS: DocField[] = [
  ...SHEET_FIELDS,
  sheet("nature", "Nature du congé"),
  sheet("nature_ar", "Nature du congé (AR)"),
  sheet("date_debut", "Du"),
  sheet("date_fin", "Au"),
  sheet("periode", "Période (Du … au …)"),
  sheet("jours", "Nombre de jours"),
  sheet("reprise", "Date de reprise"),
  ...COMPANY_FIELDS,
];

const fiche = text("Fiche");
const FICHE_FIELDS: DocField[] = [
  fiche("doc_title", "Titre de l'onglet / du PDF"),
  fiche("title_fr", "Titre (FR)"),
  fiche("matricule_label", "Libellé du matricule"),
  fiche("matricule", "Matricule"),
  fiche("photo", "Photo (adresse de l'image)"),
  fiche("identity_style", "Hauteur relative du bloc identité"),
  fiche("sign_left_heading", "Titre du bloc employé"),
  fiche("sign_left_sub", "Mention de l'employé"),
  fiche("sign_right_heading", "Titre du bloc administration"),
  fiche("sig_right_line1", "Administration — ligne 1"),
  fiche("sig_right_line2", "Administration — ligne 2"),
  fiche("today", "Date du jour"),
  { path: "$item", label: "Lettre du titre", group: "Titre espacé", within: "title_letters" },
  { path: "heading", label: "Titre de la section", group: "Section", within: "sections" },
  { path: "title_ar", label: "Titre arabe de la section", group: "Section", within: "sections" },
  { path: "style", label: "Hauteur relative de la section", group: "Section", within: "sections" },
  { path: "css", label: "Classe de la ligne (nombre de colonnes)", group: "Ligne", within: "rows" },
  { path: "label_fr", label: "Libellé (FR)", group: "Case", within: "cells" },
  { path: "value", label: "Valeur", group: "Case", within: "cells" },
  { path: "label_ar", label: "Libellé (AR)", group: "Case", within: "cells" },
  ...COMPANY_FIELDS,
];
const FICHE_LISTS: DocList[] = [
  { path: "identity_rows", label: "Lignes du bloc identité" },
  { path: "sections", label: "Sections (Paramètres › Fiche)" },
  { path: "rows", label: "Lignes de la section", within: "sections" },
  { path: "cells", label: "Cases de la ligne" },
  { path: "title_letters", label: "Lettres du titre" },
];

const contract = text("Contrat");
const CONTRACT_FIELDS: DocField[] = [
  contract("numero", "N° du contrat"),
  contract("nom", "Nom et prénom"),
  contract("matricule", "Matricule"),
  contract("birth_date", "Date de naissance (28 ديسمبر 1991)"),
  contract("birth_place", "Lieu de naissance"),
  contract("father", "Prénom du père"),
  contract("mother", "Nom de la mère"),
  contract("marital", "Situation familiale"),
  contract("id_piece", "Pièce d'identité"),
  contract("id_number", "N° de la pièce"),
  contract("id_issued_on", "Pièce délivrée le"),
  contract("id_issued_by", "Autorité de délivrance"),
  contract("address", "Adresse"),
  contract("poste", "Poste"),
  contract("start_date", "Début du contrat"),
  contract("end_date", "Fin du contrat"),
  contract("cdd_reason", "Motif du CDD (n°)"),
  contract("essai", "Période d'essai"),
  contract("preavis", "Préavis"),
  contract("net", "Net mensuel"),
  contract("net_words", "Net en lettres"),
  contract("recup", "Indemnité de récupération"),
  contract("recup_words", "Récupération en lettres"),
  contract("retenue", "Retenue / jour d'absence"),
  contract("retenue_words", "Retenue en lettres"),
  ...COMPANY_FIELDS,
];

const hr = (
  id: DocTypeId,
  label: string,
  labelAr: string,
  family: DocTypeMeta["family"],
  fields: DocField[],
  lists: DocList[] = [],
): DocTypeMeta => ({ id, label, labelAr, family, fields, lists });

export const DOC_TYPES: Record<DocTypeId, DocTypeMeta> = {
  bulletin_paie: BULLETIN,
  ordre_mission: hr("ordre_mission", "Ordre de mission", "أمر بمهمة", "fiches", MISSION_FIELDS),
  titre_conge: hr("titre_conge", "Titre de congé", "إجازة", "fiches", LEAVE_TITLE_FIELDS),
  fiche_renseignements: hr("fiche_renseignements", "Fiche de renseignements", "بطاقة المعلومات", "fiches", FICHE_FIELDS, FICHE_LISTS),
  contrat_cdd: hr("contrat_cdd", "Contrat de travail à durée déterminée", "عقد عمل محدد المدة", "contrats", CONTRACT_FIELDS),
};

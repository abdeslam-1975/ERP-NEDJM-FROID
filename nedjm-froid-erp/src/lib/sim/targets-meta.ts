/** Catalogue of ERP elements that can be simulated (safe for client and server). */

export type SimTargetId =
  | "paie"
  | "pointage"
  | "solde_conge"
  | "titre_conge"
  | "stc"
  | "ordre_mission"
  | "contrat_travail";

export type SimTargetMeta = {
  id: SimTargetId;
  label: string;
  labelAr: string;
  module: string;
  keywords: string;
  employee: "required" | "optional";
  period: boolean;
  /** Label of the record picker (existing leave request, ordre, contract…). */
  ref?: string;
};

export const SIM_TARGETS: readonly SimTargetMeta[] = [
  { id: "paie", label: "Fiche de paie", labelAr: "كشف الأجر", module: "RH · Paie", keywords: "bulletin salaire paie irg cnas rubrique net brut", employee: "optional", period: true },
  { id: "pointage", label: "Pointage mensuel", labelAr: "الحضور الشهري", module: "RH · Présence", keywords: "presence attendance jours mouvements legende", employee: "required", period: true },
  { id: "solde_conge", label: "Solde de congé", labelAr: "رصيد العطلة", module: "RH · Congés", keywords: "conge solde acquis anciennete", employee: "required", period: false },
  { id: "titre_conge", label: "Titre de congé", labelAr: "سند العطلة", module: "RH · Congés", keywords: "titre conge leave reprise", employee: "required", period: false, ref: "Demande de congé" },
  { id: "stc", label: "Solde de tout compte (STC)", labelAr: "تصفية كل الحسابات", module: "RH · Sorties", keywords: "sortie depart icp indemnite stc", employee: "required", period: false },
  { id: "ordre_mission", label: "Ordre de mission", labelAr: "أمر بمهمة", module: "RH · Documents", keywords: "om mission deplacement vehicule", employee: "required", period: false, ref: "Ordre de mission" },
  { id: "contrat_travail", label: "Contrat de travail", labelAr: "عقد العمل", module: "RH · Contrats", keywords: "contrat cdd cdi articles impression", employee: "required", period: false, ref: "Contrat" },
];

export function simTargetMeta(id: string | null | undefined) {
  return SIM_TARGETS.find((t) => t.id === id) ?? null;
}

export type SimRefOption = { value: string; label: string };

import { printFromKit, type PrintKit } from "@/lib/doc/print-kit";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import {
  missionDateIssue,
  missionDocData,
  missionOrderFieldsSchema,
  type MissionOrderFields,
} from "@/lib/hr/mission-order";
import {
  CONTRACT_DOC_TYPE,
  CONTRACT_PRINT_KEYS,
  contractDocData,
  contractPrintError,
  type ContractPrintValues,
} from "@/lib/hr/work-contract";
import type { SimContext, SimEnv, SimOutput, SimVarDef } from "@/lib/sim/core";

export const A4_PAGE_WIDTH = 800;

// ---------------------------------------------------------------------------
// Ordre de mission
// ---------------------------------------------------------------------------

export type OmFieldKey = Exclude<keyof MissionOrderFields, never>;

export type OmSimData = {
  fields: Record<OmFieldKey, string>;
  numero: string;
  letterhead_url: string | null;
  kit: PrintKit;
  today: string;
  /** Dates stored on an existing ordre (not re-checked against today). */
  original: { dateDepart: string | null; dateRetour: string | null } | null;
};

const OM_FIELDS: { key: OmFieldKey; label: string; kind?: SimVarDef["kind"] }[] = [
  { key: "matricule", label: "Matricule" },
  { key: "nom", label: "Nom" },
  { key: "prenom", label: "Prénom" },
  { key: "affectation", label: "Affectation" },
  { key: "codeAffectation", label: "Code affectation" },
  { key: "poste", label: "Poste" },
  { key: "dest1", label: "Destination 1" },
  { key: "dest2", label: "Destination 2" },
  { key: "lieuDepart", label: "Lieu de départ" },
  { key: "dateDepart", label: "Date de départ", kind: "date" },
  { key: "heureDepart", label: "Heure de départ" },
  { key: "lieuRetour", label: "Lieu de retour" },
  { key: "dateRetour", label: "Date de retour", kind: "date" },
  { key: "heureRetour", label: "Heure de retour" },
  { key: "motif", label: "Motif", kind: "longtext" },
  { key: "moyen", label: "Moyen de transport" },
  { key: "modele", label: "Modèle du véhicule" },
  { key: "immat", label: "Immatriculation" },
  { key: "kmDepart", label: "Km au départ" },
  { key: "kmRetour", label: "Km au retour" },
  { key: "pieceType", label: "Pièce d'identité · type" },
  { key: "pieceNum", label: "Pièce d'identité · numéro" },
  { key: "pieceDelivre", label: "Pièce d'identité · délivrée le", kind: "date" },
  { key: "pieceFonction", label: "Fonction du donneur d'ordre" },
  { key: "pieceLieu", label: "Pièce d'identité · lieu" },
  { key: "donneur", label: "Donneur d'ordre" },
  { key: "faitA", label: "Fait à" },
  { key: "dateDoc", label: "Date du document", kind: "date" },
];

export const OM_FIELD_KEYS = OM_FIELDS.map((f) => f.key);

const G_OM = "Ordre de mission";
const G_OM_CHECK = "Contrôles";

export function omVariables(d: OmSimData): SimVarDef[] {
  return [
    { id: "om.numero", label: "Numéro de l'ordre", group: G_OM, kind: "text", base: d.numero },
    ...OM_FIELDS.map((f): SimVarDef => ({ id: `om.${f.key}`, label: f.label, group: G_OM, kind: f.kind ?? "text", base: d.fields[f.key] ?? "" })),
    { id: "om.aujourdhui", label: "Date du jour (pour les contrôles)", group: G_OM_CHECK, kind: "date", base: d.today, hint: "départ ≥ aujourd'hui, retour > aujourd'hui" },
  ];
}

export function omOutput(d: OmSimData, ctx: SimContext, env: SimEnv): SimOutput {
  const raw = Object.fromEntries(OM_FIELDS.map((f) => [f.key, ctx.str(`om.${f.key}`, d.fields[f.key] ?? "")])) as Record<OmFieldKey, string>;
  const fields = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v.trim() ? v : null]),
  ) as unknown as MissionOrderFields;
  const warnings: string[] = [];
  const parsed = missionOrderFieldsSchema.safeParse(raw);
  if (!parsed.success) warnings.push(...new Set(parsed.error.issues.map((i) => i.message)));
  const issue = missionDateIssue(fields, ctx.str("om.aujourdhui", d.today), d.original);
  if (issue) warnings.push(issue.message);
  const type = "ordre_mission";
  const data = missionDocData(
    { ...fields, matricule: raw.matricule, nom: raw.nom, numero: ctx.str("om.numero", d.numero) },
    d.kit.company,
    companyLetterheadUrl(d.letterhead_url, env.origin),
    d.kit.lists,
  );
  const printed = printFromKit(d.kit, type, data, env.origin);
  if (!printed.ok) warnings.push(printed.error);
  const duration =
    fields.dateDepart && fields.dateRetour
      ? Math.round((Date.parse(fields.dateRetour) - Date.parse(fields.dateDepart)) / 86_400_000)
      : 0;
  return {
    html: printed.ok ? printed.data : null,
    doc: { type, data },
    pageWidth: A4_PAGE_WIDTH,
    figures: [
      { key: "duration", label: "Durée de la mission", value: duration, format: "days", emphasis: true },
      { key: "issues", label: "Contrôles en échec", value: warnings.length, format: "number" },
    ],
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Contrat de travail
// ---------------------------------------------------------------------------

export type ContractDocSimData = {
  contract: {
    id: string;
    number: string | null;
    start_date: string;
    end_date: string | null;
    net_ref: number | null;
    net_recup: number | null;
  };
  /** Print values keys saved on the contract (they win over the contract fields). */
  saved_keys: string[];
  values: ContractPrintValues;
  kit: PrintKit;
};

const PRINT_LABELS: Record<(typeof CONTRACT_PRINT_KEYS)[number], string> = {
  nom: "Nom et prénom",
  matricule: "Matricule",
  birth_date: "Date de naissance",
  birth_place: "Lieu de naissance",
  father: "Prénom du père",
  mother: "Nom et prénom de la mère",
  marital: "Situation familiale",
  id_piece: "Pièce d'identité",
  id_number: "N° de pièce",
  id_issued_on: "Délivrée le",
  id_issued_by: "Délivrée par",
  address: "Adresse",
  poste: "Poste",
  essai: "Période d'essai",
  preavis: "Préavis",
  net: "Net à payer (impression)",
  recup: "Indemnité de récupération (impression)",
  retenue: "Retenue par jour d'absence",
};

const G_PRINT = "Contrat · valeurs imprimées";
const G_CONTRACT = "Contrat de travail";

function amountText(n: number) {
  return Number.isFinite(n) && n !== 0 ? String(n) : "";
}

export function contractDocVariables(d: ContractDocSimData): SimVarDef[] {
  const k = d.contract.id;
  const v = d.values;
  const defs: SimVarDef[] = [
    { id: `contrat.${k}.date_debut`, label: "Date de début du contrat", group: G_CONTRACT, kind: "date", base: d.contract.start_date },
    { id: `contrat.${k}.date_fin`, label: "Date de fin du contrat", group: G_CONTRACT, kind: "date", base: d.contract.end_date ?? "" },
    { id: `contrat.${k}.net_reference`, label: "Net de référence du contrat", group: G_CONTRACT, kind: "money", base: d.contract.net_ref ?? 0 },
    { id: `contrat.${k}.net_recup`, label: "Net de récupération du contrat", group: G_CONTRACT, kind: "money", base: d.contract.net_recup ?? 0 },
    { id: "impression.numero", label: "Numéro du contrat", group: G_PRINT, kind: "text", base: v.numero },
    { id: "impression.cdd_reason", label: "Motif du CDD coché (n°)", group: G_PRINT, kind: "number", base: v.cdd_reason },
  ];
  for (const key of CONTRACT_PRINT_KEYS) {
    const linked = (key === "net" || key === "recup") && !d.saved_keys.includes(key);
    defs.push({
      id: `impression.${key}`,
      label: PRINT_LABELS[key],
      group: G_PRINT,
      kind: key === "birth_date" || key === "id_issued_on" ? "date" : "text",
      base: v[key],
      derived: linked,
      hint: linked ? "repris du contrat" : undefined,
    });
  }
  return defs;
}

export function contractDocOutput(d: ContractDocSimData, ctx: SimContext, env: SimEnv): SimOutput {
  const k = d.contract.id;
  const v0 = d.values;
  const values: ContractPrintValues = {
    ...v0,
    numero: ctx.str("impression.numero", v0.numero),
    cdd_reason: Math.max(1, Math.round(ctx.num("impression.cdd_reason", v0.cdd_reason))),
    start_date: ctx.str(`contrat.${k}.date_debut`, v0.start_date),
    end_date: ctx.str(`contrat.${k}.date_fin`, v0.end_date),
  };
  for (const key of CONTRACT_PRINT_KEYS) {
    if (key === "net" && !d.saved_keys.includes(key)) {
      values.net = ctx.deriveStr("impression.net", () => amountText(ctx.num(`contrat.${k}.net_reference`)));
    } else if (key === "recup" && !d.saved_keys.includes(key)) {
      values.recup = ctx.deriveStr("impression.recup", () => amountText(ctx.num(`contrat.${k}.net_recup`)));
    } else {
      values[key] = ctx.str(`impression.${key}`, v0[key]);
    }
  }

  const warnings: string[] = [];
  if (!values.is_cdi && !values.end_date) warnings.push("CDD sans date de fin.");
  if (values.end_date && values.start_date && values.end_date < values.start_date) {
    warnings.push("La date de fin précède la date de début.");
  }
  for (const key of ["nom", "poste", "net"] as const) {
    if (!values[key].trim()) warnings.push(`Champ vide sur le contrat imprimé : ${PRINT_LABELS[key]}.`);
  }
  const data = contractDocData(values, d.kit.company);
  const blocked = contractPrintError(values);
  const printed = blocked ? { ok: false as const, error: blocked } : printFromKit(d.kit, CONTRACT_DOC_TYPE, data, env.origin);
  if (!printed.ok) warnings.push(printed.error);
  return {
    html: printed.ok ? printed.data : null,
    doc: { type: CONTRACT_DOC_TYPE, data },
    pageWidth: A4_PAGE_WIDTH,
    figures: [{ key: "net", label: "Net imprimé", value: Number(values.net) || 0, format: "money", emphasis: true }],
    warnings,
  };
}


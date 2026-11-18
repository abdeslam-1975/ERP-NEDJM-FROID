/** Hiring cycle: identity pieces, then a signed fiche, then a signed contract. */

export const SS_DOCUMENT = "SS_REGISTRATION";
export const FICHE_DOCUMENT = "FICHE_RENSEIGNEMENTS";
export const CONTRACT_DOCUMENT = "CONTRACT";

export const CYCLE_STEPS = ["IDENTITY", "FICHE", "CONTRACT", "PROMOTED"] as const;
export type CycleStep = (typeof CYCLE_STEPS)[number];

export const DOC_STATUSES = [
  "MISSING",
  "UPLOADED",
  "REJECTED",
  "VALIDATED",
  "GENERATED",
  "PENDING_REVIEW",
  "ARCHIVED",
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export type CycleDocument = {
  doc_code: string;
  family: "INCOMING" | "PRODUCED";
  is_current: boolean;
  status: DocStatus;
};

export type IdentityCatalogItem = {
  kind?: string;
  code: string;
  label_fr?: string | null;
  label_ar?: string | null;
  is_active?: boolean;
  extra?: Record<string, unknown> | null;
  sort_order?: number;
};

export type IdentitySlot = { code: string; label_fr: string; label_ar: string };

const FALLBACK_IDENTITY: (IdentitySlot & { sort_order: number })[] = [
  { code: "CNI", label_fr: "Carte nationale d'identité", label_ar: "بطاقة التعريف الوطنية", sort_order: 10 },
  { code: "BIRTH", label_fr: "Acte de naissance", label_ar: "شهادة الميلاد", sort_order: 20 },
];

function asSlot(item: IdentityCatalogItem | IdentitySlot): IdentitySlot {
  return {
    code: item.code,
    label_fr: item.label_fr?.trim() || item.code,
    label_ar: item.label_ar?.trim() || "",
  };
}

/** Identity pieces that close the first step. The CNAS attestation stays after the hire. */
export function identityRequirements(catalogs: IdentityCatalogItem[]): IdentitySlot[] {
  const docs = catalogs.filter((item) => item.kind === "document_type" && item.is_active !== false);
  const uploads = docs.filter(
    (item) =>
      item.extra?.upload_slot === true &&
      item.extra?.auto_generated !== true &&
      item.code !== SS_DOCUMENT,
  );
  const required = uploads.filter((item) => item.extra?.required_for_save === true);
  const chosen = required.length
    ? required
    : uploads.filter((item) => item.code === "CNI" || item.code === "BIRTH");
  const rows = (chosen.length ? chosen : FALLBACK_IDENTITY)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code));
  return rows.map(asSlot);
}

export function currentDocument(docs: readonly CycleDocument[], code: string): CycleDocument | null {
  return docs.find((doc) => doc.is_current && doc.doc_code === code) ?? null;
}

export function identityClosed(docs: readonly CycleDocument[], required: readonly { code: string }[]): boolean {
  if (!required.length) return false;
  return required.every((slot) => currentDocument(docs, slot.code)?.status === "VALIDATED");
}

export function producedArchived(docs: readonly CycleDocument[], code: string): boolean {
  return currentDocument(docs, code)?.status === "ARCHIVED";
}

export function cycleStep(input: {
  promoted: boolean;
  docs: readonly CycleDocument[];
  requiredIdentity: readonly { code: string }[];
}): CycleStep {
  if (input.promoted) return "PROMOTED";
  if (!identityClosed(input.docs, input.requiredIdentity)) return "IDENTITY";
  if (!producedArchived(input.docs, FICHE_DOCUMENT)) return "FICHE";
  return "CONTRACT";
}

export function canPromote(input: {
  promoted: boolean;
  docs: readonly CycleDocument[];
  requiredIdentity: readonly { code: string }[];
}): boolean {
  return (
    !input.promoted &&
    identityClosed(input.docs, input.requiredIdentity) &&
    producedArchived(input.docs, FICHE_DOCUMENT) &&
    producedArchived(input.docs, CONTRACT_DOCUMENT)
  );
}

export type IdentityFields = {
  last_name: string;
  first_name: string;
  last_name_ar?: string | null;
  first_name_ar?: string | null;
  nin?: string | null;
  birth_date?: string | null;
};

export type ContractTerms = {
  site_id?: string | null;
  activity_code_id?: string | null;
  contract_type_code?: string | null;
  poste_fr?: string | null;
  salaire_base_monthly?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** A change of a field printed on the fiche voids the signed fiche and the contract. */
export function identityChanged(before: IdentityFields, after: IdentityFields): boolean {
  return (
    clean(before.last_name) !== clean(after.last_name) ||
    clean(before.first_name) !== clean(after.first_name) ||
    clean(before.last_name_ar) !== clean(after.last_name_ar) ||
    clean(before.first_name_ar) !== clean(after.first_name_ar) ||
    clean(before.nin) !== clean(after.nin) ||
    clean(before.birth_date).slice(0, 10) !== clean(after.birth_date).slice(0, 10)
  );
}

/** A change of a term printed on the contract voids the signed contract. */
export function contractTermsChanged(before: ContractTerms, after: ContractTerms): boolean {
  const money = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? "" : String(value));
  return (
    clean(before.site_id) !== clean(after.site_id) ||
    clean(before.activity_code_id) !== clean(after.activity_code_id) ||
    clean(before.contract_type_code) !== clean(after.contract_type_code) ||
    clean(before.poste_fr) !== clean(after.poste_fr) ||
    money(before.salaire_base_monthly) !== money(after.salaire_base_monthly) ||
    clean(before.contract_start).slice(0, 10) !== clean(after.contract_start).slice(0, 10) ||
    clean(before.contract_end).slice(0, 10) !== clean(after.contract_end).slice(0, 10)
  );
}

const NSS_LENGTH = 12;

/** The attestation opens attendance from the date it carries, once the NSS has 12 digits. */
export function affiliationReady(nss: string, workStart: string): string | null {
  const digits = nss.replace(/\D/g, "");
  if (digits.length !== NSS_LENGTH) return "Le numéro de sécurité sociale comporte 12 chiffres. · رقم الضمان 12 رقماً.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workStart)) return "Date de début de travail requise. · تاريخ بداية العمل مطلوب.";
  return null;
}

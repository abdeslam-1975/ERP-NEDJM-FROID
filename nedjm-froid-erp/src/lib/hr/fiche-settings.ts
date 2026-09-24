export type FicheSection = {
  id: string;
  title: string;
  rows: string[][];
};

export type HrFicheSettings = {
  id: string;
  title: string;
  matricule_label: string;
  letterhead_url: string | null;
  phone_prefix: string;
  phone_codes: string[];
  uppercase_codes: string[];
  suffixes: Record<string, string>;
  identity_left: string[];
  identity_right: string[];
  photo_field: string;
  sections: FicheSection[];
  sig_left_title: string;
  sig_left_sub: string;
  sig_right_title: string;
  sig_right_line1: string;
  sig_right_line2: string;
};

export const FICHE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export const DEFAULT_FICHE_SETTINGS: HrFicheSettings = {
  id: FICHE_SETTINGS_ID,
  title: "FICHE DE RENSEIGNEMENTS",
  matricule_label: "Matricule N°:",
  letterhead_url: null,
  phone_prefix: "+213",
  phone_codes: ["phone", "whatsapp"],
  uppercase_codes: ["last_name"],
  suffixes: { experience_years: " Ans" },
  identity_left: [
    "last_name",
    "birth_date",
    "commune_birth",
    "nationality",
    "marital_code",
  ],
  identity_right: [
    "first_name",
    "birth_place_fr",
    "birth_act_no",
    "sex_code",
    "blood_code",
  ],
  photo_field: "photo_url",
  sections: [
    {
      id: "affiliation",
      title: "AFFILIATION & ADRESSE",
      rows: [
        ["father_name"],
        ["mother_name"],
        ["commune", "wilaya_code", "postal_code"],
        ["address_fr"],
      ],
    },
    {
      id: "identite",
      title: "IDENTITÉ & ADMINISTRATIVE",
      rows: [
        ["id_type_code", "id_number"],
        ["id_issued_on", "id_expires_on"],
        ["id_issued_by"],
        ["nin", "nss"],
        ["account_no"],
      ],
    },
    {
      id: "pro",
      title: "SITUATION PROFESSIONNELLE & ÉTUDES",
      rows: [
        ["poste"],
        ["affectation"],
        ["hired_at", "declaration_date"],
        ["level_code", "diploma_fr"],
        ["experience_years", "languages"],
      ],
    },
    {
      id: "contacts",
      title: "CONTACTS",
      rows: [
        ["phone", "whatsapp"],
        ["email"],
      ],
    },
  ],
  sig_left_title: "L'Employé(e)",
  sig_left_sub: "Lu et approuvé",
  sig_right_title: "L'Administration",
  sig_right_line1: "Service RH",
  sig_right_line2: "Administration",
};

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export function asSections(value: unknown): FicheSection[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const row = raw as Record<string, unknown>;
    const rows = Array.isArray(row.rows)
      ? row.rows.map((line) =>
          Array.isArray(line) ? line.map((code) => String(code)).filter(Boolean) : [],
        )
      : [];
    return {
      id: String(row.id || `sec_${index + 1}`),
      title: String(row.title || ""),
      rows,
    };
  });
}

export function asSuffixes(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim()) out[key] = item;
  }
  return out;
}

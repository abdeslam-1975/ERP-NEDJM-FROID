import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import type { DocData } from "@/lib/doc/engine";
import { printFromKit, type PrintKit } from "@/lib/doc/print-kit";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import { formatOmDate, todayIsoAlgiers } from "@/lib/hr/mission-order";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function roman(n: number) {
  return ROMAN[n - 1] ?? String(n);
}

function catalogFr(catalogs: CatalogItem[], kind: string, code: string) {
  if (!code) return "";
  const opt = catalogs.find((c) => c.kind === kind && c.code === code);
  return opt?.label_fr ?? code;
}

function printValue(
  code: string,
  raw: string,
  field: HrEmployeeField | undefined,
  catalogs: CatalogItem[],
  settings: HrFicheSettings,
) {
  let value = raw.trim();
  if (field?.value_type === "catalog" && field.catalog_kind) {
    value = catalogFr(catalogs, field.catalog_kind, value);
  }
  if (field?.value_type === "date") value = formatOmDate(value);
  if (settings.uppercase_codes.includes(code)) value = value.toUpperCase();
  if (value && settings.phone_codes.includes(code) && settings.phone_prefix) {
    if (!value.startsWith("+")) value = `${settings.phone_prefix} ${value}`;
  }
  const suffix = settings.suffixes[code];
  if (value && suffix && !value.toLowerCase().includes(suffix.trim().toLowerCase())) {
    value = `${value}${suffix}`;
  }
  return value;
}

function withColon(label: string) {
  const bare = label.trim().replace(/\s*:\s*$/, "");
  return bare ? `${bare} :` : "";
}

type FicheCell = { label_fr: string; value: string; label_ar: string };
type FicheLine = { css: string; cells: FicheCell[] };

/** Values printed by the fiche de renseignements template; the layout (lines, sections) comes from the fiche settings. */
export function ficheDocData(
  values: Record<string, string>,
  catalogs: CatalogItem[],
  fields: HrEmployeeField[],
  settings: HrFicheSettings,
  company: HrCompanyProfile,
  letterheadUrl: string,
): DocData {
  const map = new Map(fields.map((f) => [f.code, f]));
  const v = (code: string) => (values[code] ?? "").trim();
  const cell = (code: string): FicheCell => {
    const field = map.get(code);
    return {
      label_fr: withColon(field?.label_fr || code),
      value: printValue(code, v(code), field, catalogs, settings),
      label_ar: withColon(field?.label_ar && field.label_ar !== field.label_fr ? field.label_ar : ""),
    };
  };
  const line = (codes: string[]): FicheLine | null => {
    const used = codes.filter((code) => code && code !== settings.photo_field);
    if (!used.length) return null;
    return { css: `fx-line cols-${Math.min(used.length, 4)}`, cells: used.map(cell) };
  };
  const lines = (rows: string[][]) => rows.map(line).filter((l): l is FicheLine => l !== null);
  const flex = (count: number) => `flex: ${Math.max(count, 1)} 1 0`;

  const identityCount = Math.max(settings.identity_left.length, settings.identity_right.length);
  const identity = lines(
    Array.from({ length: identityCount }, (_, i) => [settings.identity_left[i] ?? "", settings.identity_right[i] ?? ""]),
  );
  const sections = settings.sections
    .map((section) => ({ section, rows: lines(section.rows) }))
    .filter((s) => s.rows.length > 0)
    .map(({ section, rows }, index) => ({
      style: flex(rows.length),
      heading: `${roman(index + 2)}. ${section.title.toUpperCase()}`,
      title_ar: section.title_ar,
      rows,
    }));
  const signNo = sections.length + 2;
  const matricule = v("matricule");
  const titleFr = settings.title || "FICHE DE RENSEIGNEMENTS";

  return {
    letterhead: letterheadUrl,
    company,
    doc_title: `${titleFr} ${matricule}`.trim(),
    title_fr: titleFr,
    title_letters: Array.from(titleFr).map((c) => (c === " " ? "\u00a0" : c)),
    matricule_label: withColon(settings.matricule_label || "Matricule"),
    matricule,
    identity_style: flex(identity.length + 1),
    identity_rows: identity,
    photo: v(settings.photo_field),
    sections,
    sign_left_heading: `${roman(signNo)}. ${(settings.sig_left_title || "L'Employé(e)").toUpperCase()}`,
    sign_left_sub: settings.sig_left_sub,
    sign_right_heading: `${roman(signNo + 1)}. ${(settings.sig_right_title || "L'Administration").toUpperCase()}`,
    sig_right_line1: settings.sig_right_line1,
    sig_right_line2: settings.sig_right_line2,
    today: formatOmDate(todayIsoAlgiers()),
  };
}

export const FICHE_DOC_TYPES = ["fiche_renseignements"] as const;

/** The fiche as printed by its approved template. */
export function ficheHtml(
  kit: PrintKit,
  values: Record<string, string>,
  catalogs: CatalogItem[],
  fields: HrEmployeeField[],
  settings: HrFicheSettings,
  origin: string,
) {
  const letterhead = companyLetterheadUrl(settings.letterhead_url, origin);
  const data = ficheDocData(values, catalogs, fields, settings, kit.company, letterhead);
  return printFromKit(kit, "fiche_renseignements", data, origin);
}

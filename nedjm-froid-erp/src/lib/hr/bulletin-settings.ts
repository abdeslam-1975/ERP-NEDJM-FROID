import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";

export type BulletinLegalRates = {
  ss_pct: number | null;
  pat_pct: number | null;
  caco_pct: number | null;
  intemp_sal_pct?: number | null;
  intemp_pat_pct?: number | null;
};

export const BULLETIN_SETTINGS_ID = "00000000-0000-0000-0000-000000000002";

export type BulletinIdentityLine = {
  label: string;
  field: string;
};

export type HrBulletinSettings = {
  title: string;
  matricule_label: string;
  period_label: string;
  letterhead_url: string;
  pad_top_mm: number;
  pad_right_mm: number;
  pad_bottom_mm: number;
  pad_left_mm: number;
  hide_zero_lines: boolean;
  unit_da: string;
  unit_percent: string;
  unit_day: string;
  identity_left: BulletinIdentityLine[];
  identity_right: BulletinIdentityLine[];
  col_code: string;
  col_intitule: string;
  col_nombre: string;
  col_taux: string;
  col_gain: string;
  col_retenue: string;
  totaux_label: string;
  net_label: string;
  movements_title: string;
  charges_title: string;
  label_worked: string;
  label_rappel: string;
  label_weekend: string;
  label_abandon: string;
  label_leave: string;
  label_absence: string;
  label_salariales: string;
  label_patronales: string;
  label_totales: string;
  label_cout: string;
  footer_base: string;
  footer_css_sal: string;
  footer_css_pat: string;
  footer_caco: string;
  footer_intemp_sal: string;
  footer_intemp_pat: string;
  footer_irg_base: string;
  footer_irg: string;
  payment_label: string;
  payment_date_label: string;
  account_label: string;
  default_payment: string;
  base_code: string;
  base_label: string;
  ss_code: string;
  ss_label: string;
  irg_code: string;
  irg_label: string;
  intemp_code: string;
  intemp_label: string;
  ss_var_key: string;
  pat_var_key: string;
  fos_var_key: string;
  caco_var_key: string;
  intemp_sal_var_key: string;
  intemp_emp_var_key: string;
  months: string[];
};

export const BULLETIN_VALUE_FIELDS = [
  { code: "employee_name", label_fr: "Employé (nom complet)", label_ar: "اسم العامل" },
  { code: "fonction", label_fr: "Fonction (poste contrat)", label_ar: "المنصب" },
  { code: "affectation", label_fr: "Affectation (chantier)", label_ar: "التعيين / الورشة" },
  { code: "hired_at", label_fr: "Date d'entrée", label_ar: "تاريخ الدخول" },
  { code: "nss", label_fr: "N°SS", label_ar: "رقم الضمان" },
  { code: "birth_date", label_fr: "Date de naissance", label_ar: "تاريخ الميلاد" },
  { code: "marital_code", label_fr: "Situation familiale", label_ar: "الحالة العائلية" },
  { code: "residence", label_fr: "Résidence", label_ar: "الإقامة" },
  { code: "category", label_fr: "Catégorie", label_ar: "الفئة" },
  { code: "matricule", label_fr: "Matricule", label_ar: "الرقم" },
  { code: "account_no", label_fr: "C.C.P / compte", label_ar: "رقم الحساب" },
];

export const DEFAULT_BULLETIN_SETTINGS: HrBulletinSettings = {
  title: "BULLETIN DE PAIE",
  matricule_label: "Matricule :",
  period_label: "Période :",
  letterhead_url: "",
  pad_top_mm: 32.5,
  pad_right_mm: 16,
  pad_bottom_mm: 28,
  pad_left_mm: 16,
  hide_zero_lines: true,
  unit_da: " DA",
  unit_percent: " %",
  unit_day: " DA/j",
  identity_left: [
    { label: "Employé :", field: "employee_name" },
    { label: "Fonction :", field: "fonction" },
    { label: "Affectation :", field: "affectation" },
    { label: "Date d'entrée :", field: "hired_at" },
    { label: "N°SS :", field: "nss" },
  ],
  identity_right: [
    { label: "Date de Naissance :", field: "birth_date" },
    { label: "Situation Familiale :", field: "marital_code" },
    { label: "Résidence :", field: "residence" },
    { label: "Catégorie :", field: "category" },
  ],
  col_code: "Code",
  col_intitule: "Intitulé",
  col_nombre: "Nombre / Base",
  col_taux: "Taux",
  col_gain: "Gain",
  col_retenue: "Retenue",
  totaux_label: "Totaux",
  net_label: "Net à Payer",
  movements_title: 'Mouvements du Mois "Nombre Jours"',
  charges_title: "Charges",
  label_worked: "Travaillés",
  label_rappel: "Rappel Salaire",
  label_weekend: "Week-End et Fériés du Mois",
  label_abandon: "Abandonnement de Poste",
  label_leave: "Congés",
  label_absence: "Absences",
  label_salariales: "Salariales",
  label_patronales: "Patronales",
  label_totales: "Totales",
  label_cout: "Coût Global",
  footer_base: "Base Cotisable",
  footer_css_sal: "C.S.S. Salariale {pct}%",
  footer_css_pat: "C.S.S. Patronale {pct}%",
  footer_caco: "Congés Annuels {pct}%",
  footer_intemp_sal: "Intempéries sal. {pct}%",
  footer_intemp_pat: "Intempéries pat. {pct}%",
  footer_irg_base: "Base IRG",
  footer_irg: "IRG",
  payment_label: "Paiement",
  payment_date_label: "Le",
  account_label: "C.C.P N°",
  default_payment: "Virement",
  base_code: "100",
  base_label: "SALAIRE DE BASE",
  ss_code: "990",
  ss_label: "RET.SECURITE SOCIALE",
  irg_code: "995",
  irg_label: "RET. I.R.G.",
  intemp_code: "991",
  intemp_label: "RET. INTEMPERIES",
  ss_var_key: "CNAS_EMPLOYEE",
  pat_var_key: "CNAS_EMPLOYER_BASE",
  fos_var_key: "CNAS_FOS",
  caco_var_key: "CACOBATPH_CONGES",
  intemp_sal_var_key: "CACOBATPH_INTEMPERIES_SAL",
  intemp_emp_var_key: "CACOBATPH_INTEMPERIES_EMP",
  months: [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ],
};

function asIdentity(value: unknown, fallback: BulletinIdentityLine[]): BulletinIdentityLine[] {
  if (!Array.isArray(value) || !value.length) return fallback;
  return value.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      label: String(row.label ?? ""),
      field: String(row.field ?? ""),
    };
  });
}

function asMonths(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const months = value.map((item) => String(item ?? "").trim());
  if (months.length !== 12 || months.some((m) => !m)) return fallback;
  return months;
}

function asMm(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 80) return fallback;
  return n;
}

export function resolveBulletinLetterhead(settings: HrBulletinSettings, origin = "") {
  return companyLetterheadUrl(settings.letterhead_url, origin);
}

export function parseBulletinLayout(raw: unknown): HrBulletinSettings {
  const row = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const d = DEFAULT_BULLETIN_SETTINGS;
  const text = (key: keyof HrBulletinSettings) => {
    const v = row[key];
    return typeof v === "string" && v.trim() ? v : (d[key] as string);
  };
  return {
    title: text("title"),
    matricule_label: text("matricule_label"),
    period_label: text("period_label"),
    letterhead_url: typeof row.letterhead_url === "string" ? row.letterhead_url.trim() : d.letterhead_url,
    pad_top_mm: asMm(row.pad_top_mm, d.pad_top_mm),
    pad_right_mm: asMm(row.pad_right_mm, d.pad_right_mm),
    pad_bottom_mm: asMm(row.pad_bottom_mm, d.pad_bottom_mm),
    pad_left_mm: asMm(row.pad_left_mm, d.pad_left_mm),
    hide_zero_lines: typeof row.hide_zero_lines === "boolean" ? row.hide_zero_lines : d.hide_zero_lines,
    unit_da: typeof row.unit_da === "string" && row.unit_da.trim() ? row.unit_da : d.unit_da,
    unit_percent:
      typeof row.unit_percent === "string" && row.unit_percent.trim() ? row.unit_percent : d.unit_percent,
    unit_day: typeof row.unit_day === "string" && row.unit_day.trim() ? row.unit_day : d.unit_day,
    identity_left: asIdentity(row.identity_left, d.identity_left),
    identity_right: asIdentity(row.identity_right, d.identity_right),
    col_code: text("col_code"),
    col_intitule: text("col_intitule"),
    col_nombre: text("col_nombre"),
    col_taux: text("col_taux"),
    col_gain: text("col_gain"),
    col_retenue: text("col_retenue"),
    totaux_label: text("totaux_label"),
    net_label: text("net_label"),
    movements_title: text("movements_title"),
    charges_title: text("charges_title"),
    label_worked: text("label_worked"),
    label_rappel: text("label_rappel"),
    label_weekend: text("label_weekend"),
    label_abandon: text("label_abandon"),
    label_leave: text("label_leave"),
    label_absence: text("label_absence"),
    label_salariales: text("label_salariales"),
    label_patronales: text("label_patronales"),
    label_totales: text("label_totales"),
    label_cout: text("label_cout"),
    footer_base: text("footer_base"),
    footer_css_sal: text("footer_css_sal"),
    footer_css_pat: text("footer_css_pat"),
    footer_caco: text("footer_caco"),
    footer_intemp_sal: text("footer_intemp_sal"),
    footer_intemp_pat: text("footer_intemp_pat"),
    footer_irg_base: text("footer_irg_base"),
    footer_irg: text("footer_irg"),
    payment_label: text("payment_label"),
    payment_date_label: text("payment_date_label"),
    account_label: text("account_label"),
    default_payment: text("default_payment"),
    base_code: text("base_code"),
    base_label: text("base_label"),
    ss_code: text("ss_code"),
    ss_label: text("ss_label"),
    irg_code: text("irg_code"),
    irg_label: text("irg_label"),
    intemp_code: text("intemp_code"),
    intemp_label: text("intemp_label"),
    ss_var_key: text("ss_var_key"),
    pat_var_key: text("pat_var_key"),
    fos_var_key: text("fos_var_key"),
    caco_var_key: text("caco_var_key"),
    intemp_sal_var_key: text("intemp_sal_var_key"),
    intemp_emp_var_key: text("intemp_emp_var_key"),
    months: asMonths(row.months, d.months),
  };
}

export function withPct(template: string, pct: number | null | undefined) {
  const n = pct == null || !Number.isFinite(pct) ? "" : String(pct);
  return template.replace("{pct}", n);
}

export function tauxUnitSuffix(unit: string, settings: HrBulletinSettings) {
  if (unit === "percent") return settings.unit_percent;
  if (unit === "day" || unit === "presence_day") return settings.unit_day;
  if (unit === "month") return settings.unit_da;
  return "";
}

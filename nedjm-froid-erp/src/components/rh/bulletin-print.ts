import {
  DEFAULT_BULLETIN_SETTINGS,
  resolveBulletinLetterhead,
  type BulletinLegalRates,
  type HrBulletinSettings,
} from "@/lib/hr/bulletin-settings";
import { formatDa, renderTemplate } from "@/lib/doc/engine";
import { movementCounts } from "@/lib/doc/movement-labels";
import {
  PAYSLIP_CNAS_SECTION,
  PAYSLIP_IRG_SECTION,
  RETENUE_CATEGORY,
  roundMoney,
  sortForPayslip,
} from "@/lib/hr/payroll-calc";
import { baseDailyTaux, daysInMonth } from "@/lib/hr/attendance-movements";
import { explainMonthlyIrg, type IrgBracket, type IrgRule } from "@/lib/hr/irg-calc";

export type BulletinLine = {
  code: string;
  label: string;
  category: string;
  unit: string;
  source_code?: string;
  nombre: number;
  taux: number;
  tauxSuffix: string;
  gain: number | null;
  retenue: number | null;
  /** IRG is a barème, not a single rate. */
  hideTaux?: boolean;
  /** Separate Nbr / Base / Taux columns (null = empty cell): count, amount the rate applies to, unit rate. */
  nbr: number | null;
  base: number | null;
  rate: number | null;
  rateSuffix: string;
};

export type BulletinModel = {
  values: Record<string, string>;
  matricule: string;
  period_text: string;
  /** First and last day of the pay month (ISO). */
  period_from: string;
  period_to: string;
  lines: BulletinLine[];
  total_gain: number;
  total_retenue: number;
  net_payable: number;
  days_worked: number;
  days_weekend: number;
  days_rappel: number;
  days_abandon: number;
  days_leave: number;
  days_absence: number;
  days_by_code: Record<string, number>;
  employee_ss: number;
  employer_ss: number;
  /** Employer FOS (0.5 %), split out of employer_ss for its own box. */
  fos_amount: number;
  charges_salariales: number;
  charges_patronales: number;
  charges_totales: number;
  cout_global: number;
  base_cotisable: number;
  cacobatph: number;
  intemperies_employee: number;
  intemperies_employer: number;
  irg_base: number;
  irg_amount: number;
  payment_mode: string;
  payment_date: string;
  account_no: string;
  account_key: string;
  layout: HrBulletinSettings;
  rates: BulletinLegalRates;
  /** Applied IRG / CNAS / CACOBATPH regime labels. */
  compliance: { irg: string; cnas: string; cacobatph: string } | null;
  /** Principal barème, the two secondary IRG scales and how the amount was reached. */
  irg: BulletinIrgData | null;
};

export type BulletinIrgData = {
  brackets: { from: number; to: number | null; rate_pct: number }[];
  abatement: { rate_pct: number; min: number; max: number } | null;
  exempt_max: number | null;
  lissage: { min: number; max: number } | null;
  mode: "EXEMPT" | "FIXED" | "BAREME";
  fixed_rate_pct: number | null;
  base: number;
  raw: number;
  abatement_amount: number;
  lissage_applied: boolean;
  zone_tax_pct: number;
  exempt: boolean;
  amount: number;
};

export { formatDa };

export function formatDateDot(iso: string | null | undefined) {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export function periodLabel(year: number, month: number, months: string[]) {
  return `${months[month - 1] ?? month} / ${year}`;
}

function periodBounds(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return {
    period_from: `${year}-${mm}-01`,
    period_to: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
  };
}

type SourceLine = {
  code: string;
  label_fr: string;
  nature: string;
  unit: string;
  category?: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  cotisable?: boolean;
  taxable?: boolean;
};

function mapBaseCode(code: string, settings: HrBulletinSettings) {
  if (code === "BASE") return settings.base_code;
  return code;
}

function mapBaseLabel(code: string, label: string, settings: HrBulletinSettings) {
  if (code === "BASE") return settings.base_label;
  return label.toUpperCase();
}

export function buildBulletinLines(input: {
  lines: SourceLine[];
  daysPaid: number;
  periodYear: number;
  periodMonth: number;
  grossCotisable: number;
  employeeSs: number;
  irgBase: number;
  irgAmount: number;
  ssRatePct: number;
  intemperiesEmployee?: number;
  intemperiesRatePct?: number;
  /** Employee share of the user-defined contributions (unit 05). */
  extraEmployee?: { code: string; label: string; base: number; ratePct: number; amount: number; group?: string }[];
  settings?: HrBulletinSettings;
}): BulletinLine[] {
  const settings = input.settings ?? DEFAULT_BULLETIN_SETTINGS;
  const rateCols = (base: number, ratePct: number) => ({
    nbr: null,
    base,
    rate: ratePct,
    rateSuffix: settings.unit_percent,
  });
  const keepCodes = new Set([
    settings.base_code,
    settings.ss_code,
    settings.irg_code,
    settings.intemp_code,
  ]);
  const rows: BulletinLine[] = input.lines
    .filter((line) => {
      if (!settings.hide_zero_lines) return true;
      if (keepCodes.has(mapBaseCode(line.code, settings))) return true;
      return Math.abs(line.amount) > 0;
    })
    .map((line) => {
    const abs = Math.abs(line.amount);
    const classRetenue = line.category === RETENUE_CATEGORY;
    const isRetenue = classRetenue || line.nature === "retenue" || line.amount < 0;
    const mapped = mapBaseCode(line.code, settings);
    const isBase = line.code === "BASE" || mapped === settings.base_code;
    let nombre = 0;
    let taux = 0;
    let tauxSuffix = settings.unit_da;
    let cols: Pick<BulletinLine, "nbr" | "base" | "rate">;
    if (line.unit === "percent") {
      taux = line.unit_amount;
      nombre = taux !== 0 ? abs / (taux / 100) : 0;
      tauxSuffix = settings.unit_percent;
      cols = { nbr: null, base: nombre, rate: taux };
    } else if (line.unit === "month_days") {
      nombre = line.quantity;
      taux = baseDailyTaux(Math.abs(line.unit_amount), input.periodYear, input.periodMonth);
      tauxSuffix = settings.unit_day;
      cols = { nbr: nombre, base: Math.abs(line.unit_amount), rate: taux };
    } else if (line.unit === "day" || line.unit === "presence_day") {
      nombre = line.quantity;
      taux = line.unit_amount;
      tauxSuffix = settings.unit_day;
      cols = { nbr: nombre, base: null, rate: taux };
    } else if (isBase) {
      nombre = input.daysPaid;
      taux = baseDailyTaux(line.unit_amount, input.periodYear, input.periodMonth);
      tauxSuffix = settings.unit_day;
      cols = { nbr: nombre, base: line.unit_amount, rate: taux };
    } else {
      nombre = line.quantity;
      taux = line.unit_amount;
      tauxSuffix = settings.unit_da;
      cols = { nbr: nombre, base: taux, rate: null };
    }
    return {
      code: mapped,
      label: mapBaseLabel(line.code, line.label_fr, settings),
      category: isBase ? "1" : (line.category ?? "1"),
      unit: line.unit,
      source_code: isBase ? "base" : "",
      nombre,
      taux,
      tauxSuffix,
      gain: isRetenue ? null : abs,
      retenue: isRetenue ? (classRetenue ? Math.abs(line.amount) : abs) : null,
      ...cols,
      rateSuffix: cols.rate == null ? "" : tauxSuffix,
    };
    });

  const hideZero = settings.hide_zero_lines;
  const statutory = (code: string) => {
    const at = rows.findIndex((r) => r.code === code);
    return at >= 0 ? rows.splice(at, 1)[0] : null;
  };
  const ssRow = statutory(settings.ss_code);
  if (ssRow) {
    rows.push({ ...ssRow, category: PAYSLIP_CNAS_SECTION });
  } else if (!hideZero || input.employeeSs > 0) {
    rows.push({
      code: settings.ss_code,
      label: settings.ss_label,
      category: PAYSLIP_CNAS_SECTION,
      unit: "percent",
      nombre: input.grossCotisable,
      taux: input.ssRatePct,
      tauxSuffix: settings.unit_percent,
      gain: null,
      retenue: input.employeeSs,
      ...rateCols(input.grossCotisable, input.ssRatePct),
    });
  }
  const intempAmount = input.intemperiesEmployee ?? 0;
  const intempRow = statutory(settings.intemp_code);
  if (intempRow) {
    rows.push({ ...intempRow, category: PAYSLIP_CNAS_SECTION });
  } else if (intempAmount > 0) {
    rows.push({
      code: settings.intemp_code,
      label: settings.intemp_label,
      category: PAYSLIP_CNAS_SECTION,
      unit: "percent",
      nombre: input.grossCotisable,
      taux: input.intemperiesRatePct ?? 0,
      tauxSuffix: settings.unit_percent,
      gain: null,
      retenue: intempAmount,
      ...rateCols(input.grossCotisable, input.intemperiesRatePct ?? 0),
    });
  }
  const extraRow = (extra: NonNullable<typeof input.extraEmployee>[number]): BulletinLine => ({
    code: extra.code,
    label: extra.label.toUpperCase(),
    category: extra.group === "irg" ? PAYSLIP_IRG_SECTION : PAYSLIP_CNAS_SECTION,
    unit: "percent",
    nombre: extra.base,
    taux: extra.ratePct,
    tauxSuffix: settings.unit_percent,
    gain: null,
    retenue: extra.amount,
    ...rateCols(extra.base, extra.ratePct),
  });
  const extras = (input.extraEmployee ?? []).filter((e) => e.amount > 0);
  for (const extra of extras.filter((e) => e.group !== "irg")) rows.push(extraRow(extra));
  const irgRow = statutory(settings.irg_code);
  const irgLine: BulletinLine = {
    code: settings.irg_code,
    label: settings.irg_label,
    category: PAYSLIP_IRG_SECTION,
    unit: "month",
    nombre: input.irgBase,
    taux: 0,
    tauxSuffix: "",
    hideTaux: true,
    gain: null,
    retenue: input.irgAmount,
    nbr: null,
    base: input.irgBase,
    rate: null,
    rateSuffix: "",
  };
  if (irgRow || !hideZero || input.irgAmount > 0) {
    rows.push(irgLine);
  }
  for (const extra of extras.filter((e) => e.group === "irg")) rows.push(extraRow(extra));
  return sortForPayslip(rows);
}

export type BulletinSlipInput = {
  employee_name: string;
  poste_fr?: string | null;
  site_name?: string | null;
  hired_at?: string | null;
  birth_date?: string | null;
  marital_code?: string | null;
  address_fr?: string | null;
  commune?: string | null;
  nss?: string | null;
  qualification_code?: string | null;
  matricule: string;
  period_year: number;
  period_month: number;
  days_worked: number;
  days_paid: number;
  days_leave?: number;
  days_absence?: number;
  days_weekend?: number;
  days_abandon?: number;
  days_rappel?: number;
  /** Days pointed with each legend code (CA, CRP, CM…). */
  days_by_code?: Record<string, number> | null;
  gross_amount: number;
  employee_ss: number;
  employer_ss: number;
  cacobatph: number;
  intemperies_employee?: number;
  intemperies_employer?: number;
  extra_employee?: number;
  extra_employer?: number;
  extra_contributions?: {
    code: string;
    label_fr: string;
    part: string;
    rate: number;
    base_amount: number;
    amount: number;
    group?: string;
  }[];
  irg_base?: number;
  irg_amount: number;
  net_payable: number;
  payment_mode_code?: string | null;
  account_no?: string | null;
  account_key?: string | null;
  compliance?: {
    labels: { irg: string; cnas: string; cacobatph: string };
    irg?: {
      option?: string;
      category?: string;
      zone_rate?: number;
      zone_applies_to?: string;
      fixed_rate?: number | null;
    };
  } | null;
  lines: SourceLine[];
};

export type PayrollIrgScales = {
  brackets: IrgBracket[];
  rulesByCategory: Record<string, IrgRule[]>;
};

function ruleOf(rules: IrgRule[], kind: string) {
  return rules.find((r) => r.kind === kind);
}

function numRule(rule: IrgRule | undefined, key: string) {
  const v = rule?.params[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const pct100 = (rate: number) => Math.round(rate * 10000) / 100;

function irgData(slip: BulletinSlipInput, scales: PayrollIrgScales | null | undefined): BulletinIrgData | null {
  if (!scales?.brackets.length) return null;
  const category = slip.compliance?.irg?.category || "STANDARD";
  const rules = scales.rulesByCategory[category] ?? scales.rulesByCategory.STANDARD ?? [];
  const irg = slip.compliance?.irg;
  const exempt = ruleOf(rules, "EXEMPTION_THRESHOLD");
  const abatement = ruleOf(rules, "ABATEMENT_ON_TAX");
  const lissage = ruleOf(rules, "LISSAGE");
  const data: BulletinIrgData = {
    brackets: [...scales.brackets]
      .sort((a, b) => a.min_annual - b.min_annual)
      .map((b) => ({ from: b.min_annual, to: b.max_annual ?? null, rate_pct: pct100(b.rate) })),
    abatement: abatement
      ? {
          rate_pct: pct100(numRule(abatement, "rate")),
          min: numRule(abatement, "min_monthly"),
          max: numRule(abatement, "max_monthly"),
        }
      : null,
    exempt_max: exempt ? numRule(exempt, "monthly_max") : null,
    lissage: lissage ? { min: numRule(lissage, "monthly_min"), max: numRule(lissage, "monthly_max") } : null,
    mode: irg?.option === "EXEMPT" ? "EXEMPT" : irg?.fixed_rate != null ? "FIXED" : "BAREME",
    fixed_rate_pct: irg?.fixed_rate != null ? pct100(irg.fixed_rate) : null,
    base: slip.irg_base ?? 0,
    raw: 0,
    abatement_amount: 0,
    lissage_applied: false,
    zone_tax_pct: irg?.zone_applies_to === "TAX" && (irg.zone_rate ?? 0) > 0 ? pct100(irg.zone_rate ?? 0) : 0,
    exempt: false,
    amount: slip.irg_amount,
  };
  if (data.mode === "BAREME") {
    let base = slip.irg_base ?? 0;
    if (irg?.zone_applies_to === "BASE" && (irg.zone_rate ?? 0) > 0) {
      base = roundMoney(base * (1 - (irg.zone_rate ?? 0)));
    }
    const steps = explainMonthlyIrg({ irgBaseMonthly: base, brackets: scales.brackets, rules });
    data.raw = steps.rawMonthly;
    data.abatement_amount = steps.abatement;
    data.lissage_applied = steps.lissageApplied;
    data.exempt = steps.exempt;
  }
  return data;
}

export function slipToBulletin(
  slip: BulletinSlipInput,
  settings: HrBulletinSettings = DEFAULT_BULLETIN_SETTINGS,
  rates: BulletinLegalRates = { ss_pct: null, pat_pct: null, caco_pct: null, intemp_sal_pct: null, intemp_pat_pct: null },
  irgScales: PayrollIrgScales | null = null,
): BulletinModel {
  const taxable = slip.lines.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0);
  const irgBase = slip.irg_base ?? Math.max(0, taxable - slip.employee_ss);
  const intempSal = slip.intemperies_employee ?? 0;
  const intempPat = slip.intemperies_employer ?? 0;
  const lines = buildBulletinLines({
    lines: slip.lines,
    daysPaid: slip.days_paid,
    periodYear: slip.period_year,
    periodMonth: slip.period_month,
    grossCotisable: slip.gross_amount,
    employeeSs: slip.employee_ss,
    irgBase,
    irgAmount: slip.irg_amount,
    ssRatePct: rates.ss_pct ?? 0,
    intemperiesEmployee: intempSal,
    intemperiesRatePct: rates.intemp_sal_pct ?? 0,
    extraEmployee: (slip.extra_contributions ?? [])
      .filter((c) => c.part === "EMPLOYEE")
      .map((c) => ({
        code: c.code,
        label: c.label_fr,
        base: c.base_amount,
        ratePct: Math.round(c.rate * 1_000_000) / 10_000,
        amount: c.amount,
        group: c.group,
      })),
    settings,
  });
  const totalGain = lines.reduce((s, l) => s + (l.gain ?? 0), 0);
  const totalRetenue = lines.reduce((s, l) => s + (l.retenue ?? 0), 0);
  const fosPct = rates.fos_pct ?? null;
  const fosAmount =
    fosPct != null && fosPct > 0 ? Math.round(slip.gross_amount * (fosPct / 100) * 100) / 100 : 0;
  const fosInEmployer = fosAmount > 0 && fosAmount <= slip.employer_ss + 0.001;
  const employerWithoutFos = fosInEmployer
    ? Math.round((slip.employer_ss - fosAmount) * 100) / 100
    : slip.employer_ss;
  const chargesSalariales = slip.employee_ss + intempSal + (slip.extra_employee ?? 0);
  const chargesPatronales = slip.employer_ss + slip.cacobatph + intempPat + (slip.extra_employer ?? 0);
  const charges = chargesSalariales + chargesPatronales;
  const residence = [slip.address_fr, slip.commune].filter(Boolean).join(" ").trim();
  const values: Record<string, string> = {
    employee_name: slip.employee_name.toUpperCase(),
    fonction: (slip.poste_fr ?? "").toUpperCase(),
    affectation: (slip.site_name ?? "").toUpperCase(),
    hired_at: formatDateDot(slip.hired_at),
    birth_date: formatDateDot(slip.birth_date),
    marital_code: (slip.marital_code ?? "").toUpperCase(),
    residence: residence.toUpperCase(),
    nss: slip.nss ?? "",
    category: slip.qualification_code ?? "",
    matricule: slip.matricule,
    account_no: slip.account_no ?? "",
  };
  return {
    values,
    matricule: slip.matricule,
    period_text: periodLabel(slip.period_year, slip.period_month, settings.months),
    ...periodBounds(slip.period_year, slip.period_month),
    lines,
    total_gain: totalGain,
    total_retenue: totalRetenue,
    net_payable: slip.net_payable,
    days_worked: slip.days_worked,
    days_weekend: slip.days_weekend ?? 0,
    days_rappel: slip.days_rappel ?? 0,
    days_abandon: slip.days_abandon ?? 0,
    days_leave: slip.days_leave ?? 0,
    days_absence: slip.days_absence ?? 0,
    days_by_code: { ...(slip.days_by_code ?? {}) },
    employee_ss: slip.employee_ss,
    employer_ss: employerWithoutFos,
    fos_amount: fosInEmployer ? fosAmount : 0,
    charges_salariales: chargesSalariales,
    charges_patronales: chargesPatronales,
    charges_totales: charges,
    cout_global: slip.net_payable + charges,
    base_cotisable: slip.gross_amount,
    cacobatph: slip.cacobatph,
    intemperies_employee: intempSal,
    intemperies_employer: intempPat,
    irg_base: irgBase,
    irg_amount: slip.irg_amount,
    payment_mode: (slip.payment_mode_code || settings.default_payment).replace(/_/g, " "),
    payment_date: "",
    account_no: slip.account_no ?? "",
    account_key: slip.account_key ?? "",
    layout: settings,
    rates,
    compliance: slip.compliance ? { ...slip.compliance.labels } : null,
    irg: irgData({ ...slip, irg_base: irgBase }, irgScales),
  };
}

/** Everything a bulletin template can print, one entry per page. */
export function bulletinDocData(models: BulletinModel[], origin = "") {
  return {
    pages: models.map((m) => {
      const s = m.layout;
      return {
        letterhead: resolveBulletinLetterhead(s, origin),
        matricule: m.matricule,
        period_text: m.period_text,
        period_from: m.period_from,
        period_to: m.period_to,
        values: m.values,
        units: { da: s.unit_da, percent: s.unit_percent, day: s.unit_day },
        lines: m.lines.map((l) => ({
          code: l.code,
          label: l.label,
          category: l.category,
          unit: l.unit,
          nombre: l.nombre,
          taux: l.taux,
          taux_suffix: l.tauxSuffix,
          hide_taux: Boolean(l.hideTaux),
          gain: l.gain,
          retenue: l.retenue,
          nbr: l.nbr,
          base: l.base,
          rate: l.rate,
          rate_suffix: l.rateSuffix,
        })),
        total_gain: m.total_gain,
        total_retenue: m.total_retenue,
        net_payable: m.net_payable,
        days_worked: m.days_worked,
        days_weekend: m.days_weekend,
        days_rappel: m.days_rappel,
        days_abandon: m.days_abandon,
        days_leave: m.days_leave,
        days_absence: m.days_absence,
        jours: m.days_by_code,
        comptes: movementCounts(m),
        employee_ss: m.employee_ss,
        employer_ss: m.employer_ss,
        fos_amount: m.fos_amount,
        charges_salariales: m.charges_salariales,
        charges_patronales: m.charges_patronales,
        charges_totales: m.charges_totales,
        cout_global: m.cout_global,
        base_cotisable: m.base_cotisable,
        cacobatph: m.cacobatph,
        intemperies_employee: m.intemperies_employee,
        intemperies_employer: m.intemperies_employer,
        irg_base: m.irg_base,
        irg_amount: m.irg_amount,
        rates: m.rates,
        payment_mode: m.payment_mode,
        payment_date: m.payment_date,
        account_no: m.account_no,
        account_key: m.account_key,
        compliance: m.compliance,
        irg: m.irg,
        employer: {
          name: s.employer_name,
          address: s.employer_address,
          nif: s.employer_nif,
          nis: s.employer_nis,
          cnas_no: s.employer_cnas_no,
          cacobatph_no: s.employer_cacobatph_no,
        },
      };
    }),
  };
}

/** Prints bulletins with a document template (the approved one, or a draft being edited). */
export function renderBulletinHtml(template: string, models: BulletinModel[], origin = "") {
  return renderTemplate(template, bulletinDocData(models, origin));
}

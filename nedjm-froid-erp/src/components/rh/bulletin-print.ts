import {
  DEFAULT_BULLETIN_SETTINGS,
  resolveBulletinLetterhead,
  withPct,
  type BulletinLegalRates,
  type HrBulletinSettings,
} from "@/lib/hr/bulletin-settings";
import { sortBySalaryClass } from "@/lib/hr/payroll-calc";
import { baseDailyTaux } from "@/lib/hr/attendance-movements";

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
};

export type BulletinModel = {
  values: Record<string, string>;
  matricule: string;
  period_text: string;
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
  employee_ss: number;
  employer_ss: number;
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
  layout: HrBulletinSettings;
  rates: BulletinLegalRates;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDa(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const [int, dec] = abs.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped},${dec}`;
}

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
  settings?: HrBulletinSettings;
}): BulletinLine[] {
  const settings = input.settings ?? DEFAULT_BULLETIN_SETTINGS;
  const keepCodes = new Set([
    settings.base_code,
    settings.ss_code,
    settings.irg_code,
    settings.intemp_code,
  ]);
  const rows: BulletinLine[] = sortBySalaryClass(
    input.lines
    .filter((line) => {
      if (!settings.hide_zero_lines) return true;
      if (keepCodes.has(mapBaseCode(line.code, settings))) return true;
      return Math.abs(line.amount) > 0;
    })
    .map((line) => {
    const abs = Math.abs(line.amount);
    const isRetenue = line.nature === "retenue" || line.amount < 0;
    const mapped = mapBaseCode(line.code, settings);
    const isBase = line.code === "BASE" || mapped === settings.base_code;
    let nombre = 0;
    let taux = 0;
    let tauxSuffix = settings.unit_da;
    if (line.unit === "percent") {
      taux = line.unit_amount;
      nombre = taux !== 0 ? abs / (taux / 100) : 0;
      tauxSuffix = settings.unit_percent;
    } else if (line.unit === "day" || line.unit === "presence_day") {
      nombre = line.quantity;
      taux = line.unit_amount;
      tauxSuffix = settings.unit_day;
    } else if (isBase) {
      nombre = input.daysPaid;
      taux = baseDailyTaux(line.unit_amount, input.periodYear, input.periodMonth);
      tauxSuffix = settings.unit_day;
    } else {
      nombre = line.quantity;
      taux = line.unit_amount;
      tauxSuffix = settings.unit_da;
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
      retenue: isRetenue ? abs : null,
    };
    }),
  );

  const hideZero = settings.hide_zero_lines;
  if (!rows.some((r) => r.code === settings.ss_code) && (!hideZero || input.employeeSs > 0)) {
    rows.push({
      code: settings.ss_code,
      label: settings.ss_label,
      category: "4",
      unit: "percent",
      nombre: input.grossCotisable,
      taux: input.ssRatePct,
      tauxSuffix: settings.unit_percent,
      gain: null,
      retenue: input.employeeSs,
    });
  }
  const intempAmount = input.intemperiesEmployee ?? 0;
  if (!rows.some((r) => r.code === settings.intemp_code) && intempAmount > 0) {
    rows.push({
      code: settings.intemp_code,
      label: settings.intemp_label,
      category: "4",
      unit: "percent",
      nombre: input.grossCotisable,
      taux: input.intemperiesRatePct ?? 0,
      tauxSuffix: settings.unit_percent,
      gain: null,
      retenue: intempAmount,
    });
  }
  if (!rows.some((r) => r.code === settings.irg_code) && (!hideZero || input.irgAmount > 0)) {
    const irgTaux =
      input.irgBase > 0 && input.irgAmount > 0
        ? Math.round((input.irgAmount / input.irgBase) * 10000) / 100
        : 0;
    rows.push({
      code: settings.irg_code,
      label: settings.irg_label,
      category: "4",
      unit: "percent",
      nombre: input.irgBase,
      taux: irgTaux,
      tauxSuffix: settings.unit_percent,
      gain: null,
      retenue: input.irgAmount,
    });
  }
  return rows;
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
  gross_amount: number;
  employee_ss: number;
  employer_ss: number;
  cacobatph: number;
  intemperies_employee?: number;
  intemperies_employer?: number;
  irg_base?: number;
  irg_amount: number;
  net_payable: number;
  payment_mode_code?: string | null;
  account_no?: string | null;
  lines: SourceLine[];
};

export function slipToBulletin(
  slip: BulletinSlipInput,
  settings: HrBulletinSettings = DEFAULT_BULLETIN_SETTINGS,
  rates: BulletinLegalRates = { ss_pct: null, pat_pct: null, caco_pct: null, intemp_sal_pct: null, intemp_pat_pct: null },
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
    settings,
  });
  const totalGain = lines.reduce((s, l) => s + (l.gain ?? 0), 0);
  const totalRetenue = lines.reduce((s, l) => s + (l.retenue ?? 0), 0);
  const chargesSalariales = slip.employee_ss + intempSal;
  const chargesPatronales = slip.employer_ss + slip.cacobatph + intempPat;
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
    employee_ss: slip.employee_ss,
    employer_ss: slip.employer_ss,
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
    layout: settings,
    rates,
  };
}

function identityRows(lines: { label: string; field: string }[], values: Record<string, string>) {
  return lines
    .map(
      (line) =>
        `<div class="row"><span class="k">${escapeHtml(line.label)}</span> <span class="v">${escapeHtml(
          values[line.field] ?? "",
        )}</span></div>`,
    )
    .join("");
}

export function buildBulletinHtml(models: BulletinModel[], origin = "") {
  const title = models[0]?.layout.title ?? DEFAULT_BULLETIN_SETTINGS.title;
  const pages = models.map((m) => bulletinPage(m, origin)).join("");
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    .page {
      width: 210mm;
      min-height: 297mm;
      position: relative;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .letterhead-img {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      z-index: 0;
      object-fit: fill;
    }
    .sheet { position: relative; z-index: 1; }
    @media print {
      html, body, .letterhead-img {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    h1 {
      display: inline-block;
      font-family: "Times New Roman", Times, serif;
      font-size: 22px;
      font-style: italic;
      font-weight: 800;
      margin: 2mm 16mm 5mm 0;
    }
    .mat { display: inline-block; font-size: 12px; vertical-align: 7px; }
    .mat b { font-size: 13px; }
    .boxes { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 5mm; }
    .box { border: 1px solid #000; border-radius: 11px; padding: 2mm 3.2mm 2.4mm; min-height: 28mm; }
    .box .row { margin: 0.55mm 0; line-height: 1.35; }
    .box .k { display: inline-block; min-width: 36mm; }
    .box .v { font-weight: 700; }
    .period { margin: 3.2mm 0 2mm; font-size: 12px; }
    table.lines { width: 100%; border-collapse: collapse; }
    table.lines th, table.lines td { border: 1px solid #000; padding: 1.1mm 1.4mm; }
    table.lines th { font-weight: 700; text-align: left; }
    table.lines td.num, table.lines th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    table.lines td.code { width: 11mm; }
    table.lines .gain, table.lines .ret { width: 24mm; }
    .net-row { margin: 3mm 0 4mm; text-align: right; font-weight: 700; }
    .net-amt {
      display: inline-block;
      border: 1px solid #000;
      border-radius: 14px;
      padding: 1.1mm 6mm;
      min-width: 34mm;
      text-align: center;
      font-size: 13px;
      margin-left: 4mm;
    }
    table.mv, table.foot, table.pay { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
    table.mv th, table.mv td, table.foot th, table.foot td, table.pay th, table.pay td {
      border: 1px solid #000; padding: 1.15mm 1.6mm;
    }
    table.mv th, table.foot th { text-align: center; font-weight: 700; }
    table.pay { width: 78%; }
    table.pay th { text-align: left; width: 28mm; font-weight: 700; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>${pages}</body>
</html>`;
}

function bulletinPage(m: BulletinModel, origin = "") {
  const s = m.layout;
  const letterhead = resolveBulletinLetterhead(s, origin);
  const lineRows = m.lines
    .map(
      (l) => `<tr>
        <td class="code">${escapeHtml(l.code)}</td>
        <td>${escapeHtml(l.label)}</td>
        <td class="num">${formatDa(l.nombre)}</td>
        <td class="num">${formatDa(l.taux)}${escapeHtml(l.tauxSuffix)}</td>
        <td class="num gain">${l.gain == null ? "" : `${formatDa(l.gain)}${escapeHtml(s.unit_da)}`}</td>
        <td class="num ret">${l.retenue == null ? "" : `${formatDa(l.retenue)}${escapeHtml(s.unit_da)}`}</td>
      </tr>`,
    )
    .join("");
  return `<div class="page">
    <img class="letterhead-img" src="${escapeHtml(letterhead)}" alt="">
    <div class="sheet" style="padding:${s.pad_top_mm}mm ${s.pad_right_mm}mm ${s.pad_bottom_mm}mm ${s.pad_left_mm}mm">
    <h1>${escapeHtml(s.title)}</h1>
    <span class="mat">${escapeHtml(s.matricule_label)} <b>${escapeHtml(m.matricule)}</b></span>
    <div class="boxes">
      <div class="box">${identityRows(s.identity_left, m.values)}</div>
      <div class="box">${identityRows(s.identity_right, m.values)}</div>
    </div>
    <div class="period">${escapeHtml(s.period_label)} <b>${escapeHtml(m.period_text)}</b></div>
    <table class="lines">
      <thead>
        <tr>
          <th>${escapeHtml(s.col_code)}</th>
          <th>${escapeHtml(s.col_intitule)}</th>
          <th class="num">${escapeHtml(s.col_nombre)}</th>
          <th class="num">${escapeHtml(s.col_taux)}</th>
          <th class="num">${escapeHtml(s.col_gain)}</th>
          <th class="num">${escapeHtml(s.col_retenue)}</th>
        </tr>
      </thead>
      <tbody>${lineRows}
        <tr>
          <td colspan="4" class="num"><b>${escapeHtml(s.totaux_label)}</b></td>
          <td class="num"><b>${formatDa(m.total_gain)}${escapeHtml(s.unit_da)}</b></td>
          <td class="num"><b>${formatDa(m.total_retenue)}${escapeHtml(s.unit_da)}</b></td>
        </tr>
      </tbody>
    </table>
    <div class="net-row">${escapeHtml(s.net_label)} <span class="net-amt">${formatDa(m.net_payable)}${escapeHtml(s.unit_da)}</span></div>
    <table class="mv">
      <thead>
        <tr>
          <th colspan="4">${escapeHtml(s.movements_title)}</th>
          <th colspan="2">${escapeHtml(s.charges_title)}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(s.label_worked)}</td><td class="num">${formatDa(m.days_worked).replace(",00", "")}</td>
          <td>${escapeHtml(s.label_abandon)}</td><td class="num">${formatDa(m.days_abandon).replace(",00", "")}</td>
          <td>${escapeHtml(s.label_salariales)}</td><td class="num">${formatDa(m.employee_ss + m.intemperies_employee)}</td>
        </tr>
        <tr>
          <td>${escapeHtml(s.label_rappel)}</td><td class="num">${formatDa(m.days_rappel).replace(",00", "")}</td>
          <td>${escapeHtml(s.label_leave)}</td><td class="num">${formatDa(m.days_leave).replace(",00", "")}</td>
          <td>${escapeHtml(s.label_patronales)}</td><td class="num">${formatDa(m.employer_ss + m.cacobatph + m.intemperies_employer)}</td>
        </tr>
        <tr>
          <td>${escapeHtml(s.label_weekend)}</td><td class="num">${formatDa(m.days_weekend).replace(",00", "")}</td>
          <td>${escapeHtml(s.label_absence)}</td><td class="num">${formatDa(m.days_absence).replace(",00", "")}</td>
          <td>${escapeHtml(s.label_totales)}</td><td class="num">${formatDa(m.charges_totales)}</td>
        </tr>
        <tr>
          <td colspan="4"></td>
          <td>${escapeHtml(s.label_cout)}</td><td class="num">${formatDa(m.cout_global)}</td>
        </tr>
      </tbody>
    </table>
    <table class="foot">
      <thead>
        <tr>
          <th>${escapeHtml(s.footer_base)}</th>
          <th>${escapeHtml(withPct(s.footer_css_sal, m.rates.ss_pct))}</th>
          <th>${escapeHtml(withPct(s.footer_css_pat, m.rates.pat_pct))}</th>
          <th>${escapeHtml(withPct(s.footer_caco, m.rates.caco_pct))}</th>
          <th>${escapeHtml(withPct(s.footer_intemp_sal, m.rates.intemp_sal_pct))}</th>
          <th>${escapeHtml(withPct(s.footer_intemp_pat, m.rates.intemp_pat_pct))}</th>
          <th>${escapeHtml(s.footer_irg_base)}</th>
          <th>${escapeHtml(s.footer_irg)}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${formatDa(m.base_cotisable)}</td>
          <td>${formatDa(m.employee_ss)}</td>
          <td>${formatDa(m.employer_ss)}</td>
          <td>${m.cacobatph ? formatDa(m.cacobatph) : ""}</td>
          <td>${m.intemperies_employee ? formatDa(m.intemperies_employee) : ""}</td>
          <td>${m.intemperies_employer ? formatDa(m.intemperies_employer) : ""}</td>
          <td>${formatDa(m.irg_base)}</td>
          <td>${formatDa(m.irg_amount)}</td>
        </tr>
      </tbody>
    </table>
    <table class="pay">
      <tr>
        <th>${escapeHtml(s.payment_label)}</th><td>${escapeHtml(m.payment_mode)}</td>
        <th>${escapeHtml(s.payment_date_label)}</th><td>${escapeHtml(m.payment_date)}</td>
      </tr>
      <tr><th>${escapeHtml(s.account_label)}</th><td colspan="3">${escapeHtml(m.account_no)}</td></tr>
    </table>
    </div>
  </div>`;
}

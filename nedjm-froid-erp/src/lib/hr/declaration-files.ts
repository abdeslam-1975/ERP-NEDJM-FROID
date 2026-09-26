import {
  irgG50Line,
  summarizeAnnualDas,
  summarizeMonthlyDeclarations,
  type DeclarationSlip,
  type DeclarationStatus,
} from "./payroll-declarations";

export type DeclarationEmployer = {
  name: string;
  address: string;
  nif: string;
  nis: string;
  cnas_no: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const amount = (n: number) => round2(n).toFixed(2);

/** Upper-case ASCII without separators, as accepted by CNAS / DGI electronic imports. */
function ascii(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[;\r\n"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function dmy(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function names(s: Pick<DeclarationSlip, "last_name" | "first_name" | "employee_name">) {
  if (s.last_name || s.first_name) return { last: ascii(s.last_name), first: ascii(s.first_name) };
  const [last = "", ...rest] = s.employee_name.trim().split(/\s+/);
  return { last: ascii(last), first: ascii(rest.join(" ")) };
}

const nssOf = (nss: string | null | undefined) => (nss ?? "").replace(/\s/g, "");

function toFile(rows: string[][]) {
  return rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

/**
 * CNAS monthly contributions file (CSV ';', CRLF, ASCII upper-case names, amounts with dot).
 * Line 1: E;employer CNAS no;NIF;period MMYYYY;employees;total assiette;total cotisations
 * Line 2: column titles, then one line per insured employee.
 */
export function buildCnasMonthlyFile(input: {
  employer: DeclarationEmployer;
  year: number;
  month: number;
  slips: readonly DeclarationSlip[];
}) {
  const decl = summarizeMonthlyDeclarations(input.slips);
  const bySlip = new Map(input.slips.map((s) => [s.matricule, s]));
  const period = `${String(input.month).padStart(2, "0")}${input.year}`;
  const rows: string[][] = [
    [
      "E",
      ascii(input.employer.cnas_no),
      ascii(input.employer.nif),
      period,
      String(decl.cnas.rows.length),
      amount(decl.cnas.totals.assiette),
      amount(decl.cnas.totals.total),
    ],
    ["NSS", "NOM", "PRENOM", "DATE_NAISSANCE", "MATRICULE", "JOURS", "ASSIETTE", "PART_SALARIALE", "PART_PATRONALE", "TOTAL"],
    ...decl.cnas.rows.map((r) => {
      const s = bySlip.get(r.matricule);
      const n = s ? names(s) : { last: ascii(r.employee_name), first: "" };
      return [
        nssOf(r.nss),
        n.last,
        n.first,
        dmy(s?.birth_date),
        ascii(r.matricule),
        String(round2(r.days_paid)),
        amount(r.assiette),
        amount(r.part_salariale),
        amount(r.part_patronale),
        amount(r.total),
      ];
    }),
  ];
  return {
    content: toFile(rows),
    fileName: `CNAS_COTISATIONS_${input.year}_${String(input.month).padStart(2, "0")}.csv`,
    missing_nss: decl.cnas.missing_nss,
    totals: decl.cnas.totals,
  };
}

/**
 * Annual DAS file (CSV ';'): E;employer CNAS no;NIF;year;employees;total assiette
 * then NSS;NOM;PRENOM;DATE_NAISSANCE;DATE_ENTREE;PREMIER_MOIS;DERNIER_MOIS;T1_JOURS;T1_ASSIETTE;…;T4_ASSIETTE;TOTAL_ASSIETTE
 */
export function buildDasFile(input: {
  employer: DeclarationEmployer;
  year: number;
  slips: readonly DeclarationSlip[];
}) {
  const das = summarizeAnnualDas(input.slips);
  const latest = new Map<string, DeclarationSlip>();
  for (const s of input.slips) {
    const prev = latest.get(s.matricule);
    if (!prev || s.period_month > prev.period_month) latest.set(s.matricule, s);
  }
  const rows: string[][] = [
    ["E", ascii(input.employer.cnas_no), ascii(input.employer.nif), String(input.year), String(das.rows.length), amount(das.totals.assiette)],
    [
      "NSS",
      "NOM",
      "PRENOM",
      "DATE_NAISSANCE",
      "DATE_ENTREE",
      "PREMIER_MOIS",
      "DERNIER_MOIS",
      ...[1, 2, 3, 4].flatMap((q) => [`T${q}_JOURS`, `T${q}_ASSIETTE`]),
      "TOTAL_ASSIETTE",
    ],
    ...das.rows.map((r) => {
      const s = latest.get(r.matricule);
      const n = s ? names(s) : { last: ascii(r.employee_name), first: "" };
      return [
        nssOf(r.nss),
        n.last,
        n.first,
        dmy(r.birth_date),
        dmy(r.hired_at),
        String(r.first_month).padStart(2, "0"),
        String(r.last_month).padStart(2, "0"),
        ...r.quarters.flatMap((q) => [String(round2(q.days)), amount(q.assiette)]),
        amount(r.assiette_total),
      ];
    }),
  ];
  return {
    content: toFile(rows),
    fileName: `CNAS_DAS_${input.year}.csv`,
    missing_nss: das.missing_nss,
    totals: das.totals,
  };
}

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n)
    .replace(/\u202f|\u00a0/g, " ");
}

/** Printable IRG-salaires statement to carry over to the monthly G50. */
export function buildG50Html(input: {
  employer: DeclarationEmployer;
  year: number;
  month: number;
  status: DeclarationStatus;
  scopeLabel: string;
  slips: readonly DeclarationSlip[];
}) {
  const decl = summarizeMonthlyDeclarations(input.slips);
  const period = `${MONTHS_FR[input.month - 1]} ${input.year}`;
  const lines = decl.irg.by_line.length
    ? decl.irg.by_line
    : [{ line: irgG50Line({ compliance: null }), employees: 0, irg_base: 0, irg_amount: 0 }];
  const rows = lines
    .map(
      (l) => `<tr><td>${esc(l.line)}</td><td class="n">${l.employees}</td><td class="n">${money(l.irg_base)}</td><td class="n">${money(l.irg_amount)}</td></tr>`,
    )
    .join("");
  const ident = [
    ["Raison sociale", input.employer.name],
    ["Adresse", input.employer.address],
    ["NIF", input.employer.nif],
    ["NIS", input.employer.nis],
  ]
    .map(([k, v]) => `<tr><th>${k}</th><td>${esc(v || "—")}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>G50 IRG salaires ${period}</title>
<style>
@page{size:A4;margin:14mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#111}
h1{font-size:15pt;margin:0 0 2mm}
.sub{color:#555;margin-bottom:6mm}
table{border-collapse:collapse;width:100%;margin-bottom:6mm}
th,td{border:1px solid #999;padding:2mm 3mm;text-align:left;vertical-align:top}
th{background:#f1f1f1;width:34%}
.grid th{width:auto}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tot td{font-weight:bold;background:#fafafa}
.warn{border:1px solid #d97706;background:#fff7ed;padding:3mm;margin-bottom:5mm}
.sign{display:flex;justify-content:space-between;margin-top:14mm}
.note{font-size:9pt;color:#555}
</style></head><body>
<h1>État IRG sur salaires — report sur G50</h1>
<div class="sub">Période : <b>${period}</b> · ${esc(input.scopeLabel)} · ${input.status === "FINAL" ? "Paie validée" : "PROVISOIRE (paie non validée)"}</div>
${input.status === "FINAL" ? "" : '<div class="warn">Paie non validée : montants susceptibles de changer. Ne pas déposer.</div>'}
<table>${ident}</table>
<table class="grid"><thead><tr><th>Ligne G50 — IRG / Salaires</th><th class="n">Salariés</th><th class="n">Assiette imposable (DA)</th><th class="n">IRG retenu (DA)</th></tr></thead>
<tbody>${rows}<tr class="tot"><td>Total IRG salaires à reporter</td><td class="n">${decl.irg.totals.taxed_employees}</td><td class="n">${money(decl.irg.totals.irg_base)}</td><td class="n">${money(decl.irg.totals.irg_amount)}</td></tr></tbody></table>
<table class="grid"><thead><tr><th>Rappel des charges du mois</th><th class="n">Montant (DA)</th></tr></thead><tbody>
<tr><td>Masse salariale brute</td><td class="n">${money(decl.journal.gross_total)}</td></tr>
<tr><td>Cotisations CNAS (salarié + employeur)</td><td class="n">${money(decl.cnas.totals.total)}</td></tr>
<tr><td>CACOBATPH (congés + intempéries)</td><td class="n">${money(decl.cacobatph.totals.total)}</td></tr>
<tr><td>Net à payer</td><td class="n">${money(decl.journal.net_payable)}</td></tr>
</tbody></table>
<p class="note">Seule la rubrique IRG / Salaires est calculée par l'application ; les autres impôts du bordereau G50 (TAP, TVA, IBS…) sont à compléter par la comptabilité.</p>
<div class="sign"><div>Établi le ${new Date().toLocaleDateString("fr-FR")}</div><div>Cachet et signature</div></div>
</body></html>`;
}

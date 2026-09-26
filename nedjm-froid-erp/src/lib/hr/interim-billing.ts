import { accumulateAttendanceMovements, type AttendanceLegend } from "./attendance-movements";

export type InterimContract = {
  contract_id: string;
  employee_id: string;
  matricule: string;
  employee_name: string;
  site_id: string;
  site_name: string;
  start_date: string;
  end_date: string | null;
  daily_rate: number | null;
  poste: string | null;
};

export type InterimCell = { employee_id: string; site_id: string; work_date: string; legend_code: string };

export type InterimAgencyTerms = { default_daily_rate: number; markup_pct: number; vat_pct: number };

export type InterimLine = {
  contract_id: string;
  employee_id: string;
  matricule: string;
  employee_name: string;
  site_name: string;
  poste: string | null;
  days_worked: number;
  days_billed: number;
  daily_rate: number;
  amount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Billing = presence quantity (legend coefficient, e.g. P/2 = 0.5) × daily rate of the assignment
 * (agency default when the contract has none), + agency markup, + VAT.
 */
export function buildInterimStatement(input: {
  contracts: readonly InterimContract[];
  cells: readonly InterimCell[];
  legends: AttendanceLegend[];
  terms: InterimAgencyTerms;
}) {
  const lines: InterimLine[] = [];
  const missingRate: string[] = [];
  for (const c of input.contracts) {
    const cells = input.cells.filter(
      (x) =>
        x.employee_id === c.employee_id &&
        x.site_id === c.site_id &&
        x.work_date >= c.start_date &&
        (!c.end_date || x.work_date <= c.end_date),
    );
    const mv = accumulateAttendanceMovements(cells, input.legends).get(c.employee_id);
    const billed = round2(mv?.days_presence_qty ?? 0);
    if (!billed) continue;
    const rate = c.daily_rate ?? input.terms.default_daily_rate;
    if (!rate) missingRate.push(`${c.matricule} ${c.employee_name}`.trim());
    lines.push({
      contract_id: c.contract_id,
      employee_id: c.employee_id,
      matricule: c.matricule,
      employee_name: c.employee_name,
      site_name: c.site_name,
      poste: c.poste,
      days_worked: mv?.days_worked ?? 0,
      days_billed: billed,
      daily_rate: rate,
      amount: round2(billed * rate),
    });
  }
  lines.sort((a, b) => a.matricule.localeCompare(b.matricule, "fr", { numeric: true }));
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const markup = round2((subtotal * input.terms.markup_pct) / 100);
  const ht = round2(subtotal + markup);
  const vat = round2((ht * input.terms.vat_pct) / 100);
  return {
    lines,
    missingRate,
    days_total: round2(lines.reduce((s, l) => s + l.days_billed, 0)),
    subtotal,
    markup,
    amount_ht: ht,
    amount_vat: vat,
    amount_ttc: round2(ht + vat),
  };
}

export type InterimStatement = ReturnType<typeof buildInterimStatement>;

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n)
    .replace(/\u202f|\u00a0/g, " ");
}

export function buildInterimStatementHtml(input: {
  statementNo: string;
  period: string;
  employerName: string;
  agency: { name: string; nif?: string | null; rc?: string | null; address?: string | null };
  terms: InterimAgencyTerms;
  statement: Pick<InterimStatement, "lines" | "days_total" | "subtotal" | "markup" | "amount_ht" | "amount_vat" | "amount_ttc">;
}) {
  const s = input.statement;
  const rows = s.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.matricule)}</td><td>${esc(l.employee_name)}</td><td>${esc(l.poste ?? "")}</td><td>${esc(l.site_name)}</td><td class="n">${l.days_billed}</td><td class="n">${money(l.daily_rate)}</td><td class="n">${money(l.amount)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Relevé intérim ${esc(input.statementNo)}</title>
<style>
@page{size:A4;margin:12mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111}
h1{font-size:14pt;margin:0}
.head{display:flex;justify-content:space-between;margin-bottom:6mm}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #999;padding:1.5mm 2mm;text-align:left}
th{background:#f1f1f1}
.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tot{width:45%;margin-left:auto;margin-top:4mm}
.tot td:first-child{font-weight:bold}
.sign{display:flex;justify-content:space-between;margin-top:14mm}
</style></head><body>
<div class="head"><div><h1>Relevé de prestations d'intérim</h1><div>N° ${esc(input.statementNo)} · ${esc(input.period)}</div><div>Client : ${esc(input.employerName)}</div></div>
<div><b>${esc(input.agency.name)}</b><br>${esc(input.agency.address ?? "")}<br>NIF ${esc(input.agency.nif ?? "—")} · RC ${esc(input.agency.rc ?? "—")}</div></div>
<table><thead><tr><th>Matricule</th><th>Intérimaire</th><th>Poste</th><th>Chantier</th><th class="n">Jours</th><th class="n">Taux jour (DA)</th><th class="n">Montant (DA)</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7">Aucune présence validée.</td></tr>'}</tbody></table>
<table class="tot">
<tr><td>Jours facturables</td><td class="n">${s.days_total}</td></tr>
<tr><td>Sous-total</td><td class="n">${money(s.subtotal)}</td></tr>
<tr><td>Coefficient agence (${input.terms.markup_pct} %)</td><td class="n">${money(s.markup)}</td></tr>
<tr><td>Total HT</td><td class="n">${money(s.amount_ht)}</td></tr>
<tr><td>TVA (${input.terms.vat_pct} %)</td><td class="n">${money(s.amount_vat)}</td></tr>
<tr><td>Total TTC</td><td class="n">${money(s.amount_ttc)}</td></tr>
</table>
<p style="font-size:8.5pt;color:#555">Établi à partir du pointage validé. À rapprocher de la facture de l'agence.</p>
<div class="sign"><div>Visa chef de chantier</div><div>Visa RH</div><div>Visa agence</div></div>
</body></html>`;
}

import { computeLeaveBalance, LEAVE_KINDS, monthsWorked, type LeaveBalance } from "@/lib/hr/leave";
import type { SimContext, SimOption, SimOutput, SimVarDef } from "@/lib/sim/core";

export type LeaveSimData = {
  employee: { id: string; matricule: string; name: string };
  /** Reference date of the balance (today by default). */
  as_of: string;
  /** Legal CONGE_JOURS_MOIS (days accrued per month worked). */
  rate: number;
  contracts: {
    id: string;
    number: string | null;
    start_date: string;
    end_date: string | null;
    affectation_principale: boolean;
    status: string;
  }[];
  requests: { id: string; kind: string; status: string; days: number; start_date: string; end_date: string }[];
  adjustments: { id: string; days: number; as_of: string; reason: string }[];
};

const G = {
  legal: "Variables légales",
  contracts: "Contrats (ancienneté)",
  requests: "Demandes de congé",
  adjustments: "Ajustements de solde",
};

export const LEAVE_RATE_ID = "legal.CONGE_JOURS_MOIS";

const STATUS_OPTIONS: SimOption[] = [
  { value: "APPROVED", label: "Approuvée" },
  { value: "SUBMITTED", label: "En attente" },
  { value: "REJECTED", label: "Refusée" },
  { value: "CANCELLED", label: "Annulée" },
];

export const LEAVE_KIND_OPTIONS: SimOption[] = LEAVE_KINDS.map((k) => ({ value: k.code, label: k.fr }));

function frDate(iso: string | null) {
  if (!iso) return "…";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function kindLabel(code: string) {
  return LEAVE_KINDS.find((k) => k.code === code)?.fr ?? code;
}

/** Variables of the annual leave balance: rate, contract spans, requests and adjustments. */
export function leaveVariables(d: LeaveSimData): SimVarDef[] {
  const defs: SimVarDef[] = [
    { id: LEAVE_RATE_ID, label: "Congé acquis par mois (jours)", group: G.legal, kind: "number", base: d.rate, official: true, keywords: "CONGE_JOURS_MOIS taux acquisition" },
  ];
  for (const c of d.contracts) {
    const name = `Contrat ${c.number ?? c.id.slice(0, 8)}`;
    defs.push(
      { id: `contrat.${c.id}.date_debut`, label: `${name} · début`, group: G.contracts, kind: "date", base: c.start_date },
      { id: `contrat.${c.id}.date_fin`, label: `${name} · fin`, group: G.contracts, kind: "date", base: c.end_date ?? "", hint: "vide = en cours" },
      { id: `contrat.${c.id}.principal`, label: `${name} · affectation principale`, group: G.contracts, kind: "toggle", base: c.affectation_principale },
    );
  }
  for (const r of d.requests) {
    const name = `${kindLabel(r.kind)} du ${frDate(r.start_date)} au ${frDate(r.end_date)}`;
    defs.push(
      { id: `conge.demande.${r.id}.jours`, label: `${name} · jours`, group: G.requests, kind: "days", base: r.days },
      { id: `conge.demande.${r.id}.statut`, label: `${name} · statut`, group: G.requests, kind: "select", base: r.status, options: STATUS_OPTIONS },
      { id: `conge.demande.${r.id}.type`, label: `${name} · type`, group: G.requests, kind: "select", base: r.kind, options: LEAVE_KIND_OPTIONS },
    );
  }
  for (const a of d.adjustments) {
    defs.push({
      id: `conge.ajustement.${a.id}`,
      label: `Ajustement du ${frDate(a.as_of)} (${a.reason})`,
      group: G.adjustments,
      kind: "days",
      base: a.days,
    });
  }
  return defs;
}

/**
 * Balance at `asOf` exactly as listLeaveBalances computes it (requests started and adjustments
 * dated on or before `asOf`), with an optional request replaced by a simulated one.
 */
export function leaveBalanceFromCtx(
  ctx: SimContext,
  d: LeaveSimData,
  asOf: string,
  opts: { exclude?: string | null; extra?: { kind: string; status: string; days: number; start_date: string } | null } = {},
): LeaveBalance {
  const employeeId = d.employee.id;
  const contracts = d.contracts.map((c) => ({
    employee_id: employeeId,
    start_date: ctx.str(`contrat.${c.id}.date_debut`, c.start_date),
    end_date: ctx.str(`contrat.${c.id}.date_fin`) || null,
    affectation_principale: ctx.bool(`contrat.${c.id}.principal`, c.affectation_principale),
  }));
  const requests = d.requests
    .filter((r) => r.id !== opts.exclude && r.start_date <= asOf)
    .map((r) => ({
      employee_id: employeeId,
      kind: ctx.str(`conge.demande.${r.id}.type`, r.kind),
      status: ctx.str(`conge.demande.${r.id}.statut`, r.status),
      days: ctx.num(`conge.demande.${r.id}.jours`, r.days),
    }));
  if (opts.extra && opts.extra.start_date <= asOf) {
    requests.push({ employee_id: employeeId, kind: opts.extra.kind, status: opts.extra.status, days: opts.extra.days });
  }
  const adjustments = d.adjustments
    .filter((a) => a.as_of <= asOf)
    .map((a) => ({ employee_id: employeeId, days: ctx.num(`conge.ajustement.${a.id}`, a.days) }));
  return computeLeaveBalance({
    employeeId,
    contracts,
    requests,
    adjustments,
    asOf,
    ratePerMonth: ctx.num(LEAVE_RATE_ID, 2.5),
  });
}

// ---------------------------------------------------------------------------
// Solde de congé (element)
// ---------------------------------------------------------------------------

const AS_OF_ID = "conge.date_calcul";

export function soldeVariables(d: LeaveSimData): SimVarDef[] {
  return [
    { id: AS_OF_ID, label: "Date du calcul", group: "Solde de congé", kind: "date", base: d.as_of },
    { id: "conge.solde", label: "Solde de congé", group: "Solde de congé", kind: "days", base: 0, derived: true },
    ...leaveVariables(d),
  ];
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function soldeOutput(d: LeaveSimData, ctx: SimContext): SimOutput {
  const asOf = ctx.str(AS_OF_ID, d.as_of);
  let detail: LeaveBalance | null = null;
  const balance = ctx.deriveNum("conge.solde", () => {
    detail = leaveBalanceFromCtx(ctx, d, asOf);
    return detail.balance;
  });
  const b: LeaveBalance = detail ?? leaveBalanceFromCtx(ctx, d, asOf);
  const rate = ctx.num(LEAVE_RATE_ID, 2.5);

  const contractRows = d.contracts
    .map((c) => {
      const start = ctx.str(`contrat.${c.id}.date_debut`, c.start_date);
      const end = ctx.str(`contrat.${c.id}.date_fin`) || null;
      const principal = ctx.bool(`contrat.${c.id}.principal`, c.affectation_principale);
      const months = principal ? monthsWorked([{ employee_id: "x", start_date: start, end_date: end }], asOf) : 0;
      return `<tr><td>${esc(c.number ?? "—")}</td><td>${frDate(start)}</td><td>${end ? frDate(end) : "en cours"}</td><td>${principal ? "Oui" : "Non"}</td><td class="n">${months}</td></tr>`;
    })
    .join("");
  const requestRows = d.requests
    .filter((r) => r.start_date <= asOf)
    .map((r) => {
      const kind = ctx.str(`conge.demande.${r.id}.type`, r.kind);
      const status = ctx.str(`conge.demande.${r.id}.statut`, r.status);
      const days = ctx.num(`conge.demande.${r.id}.jours`, r.days);
      const counted = kind === "ANNUAL" && status === "APPROVED";
      return `<tr class="${counted ? "" : "muted"}"><td>${esc(kindLabel(kind))}</td><td>${frDate(r.start_date)} → ${frDate(r.end_date)}</td><td>${esc(STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status)}</td><td class="n">${days}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{margin:0;font-family:Arial,Tahoma,sans-serif;color:#111;background:#fff}.page{padding:30px 34px}
    h1{font-size:18px;margin:0}.sub{color:#555;font-size:12px;margin:2px 0 16px}
    .calc{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px}
    .box{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}.box b{display:block;font-size:18px;margin-top:2px}
    .box span{font-size:11px;color:#64748b}.total{background:#ecfdf5;border-color:#a7f3d0}
    h2{font-size:13px;margin:16px 0 6px;color:#334155}
    table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;padding:4px 6px}
    td{border-bottom:1px solid #f1f5f9;padding:4px 6px}td.n{text-align:right}tr.muted td{color:#94a3b8}
    .f{font-size:11px;color:#64748b;margin-top:10px}
  </style></head><body><div class="page">
    <h1>Solde de congé annuel</h1>
    <div class="sub">${esc(`${d.employee.matricule} · ${d.employee.name}`)} · au ${frDate(asOf)}</div>
    <div class="calc">
      <div class="box"><span>Mois travaillés</span><b>${b.months}</b></div>
      <div class="box"><span>Acquis (${rate} j / mois)</span><b>${b.accrued}</b></div>
      <div class="box"><span>Ajustements</span><b>${b.adjustments}</b></div>
      <div class="box"><span>Congés annuels pris</span><b>${b.taken}</b></div>
      <div class="box"><span>En attente d'approbation</span><b>${b.pending}</b></div>
      <div class="box total"><span>Solde</span><b>${balance}</b></div>
    </div>
    <div class="f">Solde = ajustements + acquis (mois travaillés × taux, arrondi à 0,1) − congés annuels approuvés.</div>
    <h2>Contrats pris en compte</h2>
    <table><thead><tr><th>N°</th><th>Début</th><th>Fin</th><th>Principal</th><th>Mois</th></tr></thead><tbody>${contractRows || `<tr><td colspan="5">Aucun contrat</td></tr>`}</tbody></table>
    <h2>Demandes de congé jusqu'au ${frDate(asOf)}</h2>
    <table><thead><tr><th>Type</th><th>Période</th><th>Statut</th><th>Jours</th></tr></thead><tbody>${requestRows || `<tr><td colspan="4">Aucune demande</td></tr>`}</tbody></table>
  </div></body></html>`;

  return {
    html,
    pageWidth: 800,
    figures: [
      { key: "months", label: "Mois travaillés", value: b.months, format: "number" },
      { key: "accrued", label: "Acquis", value: b.accrued, format: "days" },
      { key: "adjustments", label: "Ajustements", value: b.adjustments, format: "days" },
      { key: "taken", label: "Pris", value: b.taken, format: "days" },
      { key: "pending", label: "En attente", value: b.pending, format: "days" },
      { key: "balance", label: "Solde", value: balance, format: "days", emphasis: true, goodWhenUp: true },
    ],
    warnings: balance < 0 ? [`Solde négatif : ${balance} j.`] : [],
  };
}

export type CostSlip = {
  id: string;
  employee_id: string;
  site_id: string | null;
  employee_ss: number;
  employer_ss: number;
  cacobatph: number;
  intemperies_employee: number;
  intemperies_employer: number;
  irg_amount: number;
  net_payable: number;
  lines: { nature: string; source_code: string; amount: number }[];
};

export type CostSite = { id: string; code: string; name_fr: string };

export type CostContract = {
  id: string;
  site_id: string;
  reference: string;
  client_name: string;
  start_date: string;
  end_date: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function slipCost(s: CostSlip) {
  const brut = round2(s.lines.filter((l) => l.nature !== "retenue").reduce((a, l) => a + l.amount, 0));
  const advances = round2(
    s.lines.filter((l) => l.nature === "retenue" && l.source_code === "advance").reduce((a, l) => a + l.amount, 0),
  );
  const otherDeductions = round2(
    s.lines.filter((l) => l.nature === "retenue" && l.source_code !== "advance").reduce((a, l) => a + l.amount, 0),
  );
  const charges = round2(s.employer_ss + s.cacobatph + s.intemperies_employer);
  return { brut, charges, cost: round2(brut + charges), advances, otherDeductions };
}

function overlapDays(start: string, end: string | null, from: string, to: string) {
  const a = start > from ? start : from;
  const b = end && end < to ? end : to;
  if (a > b) return 0;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
}

export type SiteCost = {
  site_id: string | null;
  site_code: string;
  site_name: string;
  headcount: number;
  brut: number;
  charges: number;
  cost: number;
};

export type ContractCost = {
  contract_id: string | null;
  reference: string;
  client_name: string;
  site_name: string;
  share: number;
  cost: number;
};

/**
 * Payroll cost per site (site of the payroll run), then split between the client contracts of the site
 * pro rata of their active days in the month. A site without an active contract stays "non affecté".
 */
export function allocatePayrollCosts(input: {
  year: number;
  month: number;
  slips: readonly CostSlip[];
  sites: readonly CostSite[];
  contracts: readonly CostContract[];
}) {
  const from = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
  const to = `${input.year}-${String(input.month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const siteMap = new Map(input.sites.map((s) => [s.id, s]));

  const bySite = new Map<string, SiteCost & { employees: Set<string> }>();
  for (const slip of input.slips) {
    const key = slip.site_id ?? "";
    const site = slip.site_id ? siteMap.get(slip.site_id) : undefined;
    const row =
      bySite.get(key) ??
      {
        site_id: slip.site_id,
        site_code: site?.code ?? "SANS",
        site_name: site?.name_fr ?? "Sans chantier",
        headcount: 0,
        brut: 0,
        charges: 0,
        cost: 0,
        employees: new Set<string>(),
      };
    const c = slipCost(slip);
    row.employees.add(slip.employee_id);
    row.brut = round2(row.brut + c.brut);
    row.charges = round2(row.charges + c.charges);
    row.cost = round2(row.cost + c.cost);
    bySite.set(key, row);
  }
  const sites: SiteCost[] = [...bySite.values()]
    .map(({ employees, ...r }) => ({ ...r, headcount: employees.size }))
    .sort((a, b) => b.cost - a.cost);

  const contracts: ContractCost[] = [];
  for (const site of sites) {
    const active = site.site_id
      ? input.contracts
          .filter((c) => c.site_id === site.site_id)
          .map((c) => ({ c, days: overlapDays(c.start_date, c.end_date, from, to) }))
          .filter((x) => x.days > 0)
      : [];
    const totalDays = active.reduce((a, x) => a + x.days, 0);
    if (!totalDays) {
      contracts.push({ contract_id: null, reference: "Non affecté", client_name: "—", site_name: site.site_name, share: 1, cost: site.cost });
      continue;
    }
    let allocated = 0;
    active.forEach((x, i) => {
      const share = x.days / totalDays;
      const cost = i === active.length - 1 ? round2(site.cost - allocated) : round2(site.cost * share);
      allocated = round2(allocated + cost);
      contracts.push({
        contract_id: x.c.id,
        reference: x.c.reference,
        client_name: x.c.client_name,
        site_name: site.site_name,
        share: Math.round(share * 10000) / 10000,
        cost,
      });
    });
  }
  contracts.sort((a, b) => b.cost - a.cost);
  const total = round2(sites.reduce((a, s) => a + s.cost, 0));
  return { sites, contracts, total };
}

export const ACCOUNT_KEYS = [
  "salaires",
  "charges_sociales",
  "cnas",
  "cacobatph",
  "irg",
  "avances",
  "retenues",
  "net",
] as const;
export type AccountKey = (typeof ACCOUNT_KEYS)[number];

export const DEFAULT_ACCOUNTS: Record<AccountKey, { account: string; label: string }> = {
  salaires: { account: "631", label: "Rémunérations du personnel" },
  charges_sociales: { account: "635", label: "Cotisations aux organismes sociaux" },
  cnas: { account: "431", label: "CNAS (parts salariale et patronale)" },
  cacobatph: { account: "4318", label: "CACOBATPH (congés et intempéries)" },
  irg: { account: "442", label: "État, IRG retenu à la source" },
  avances: { account: "425", label: "Personnel, avances et acomptes" },
  retenues: { account: "427", label: "Personnel, oppositions et autres retenues" },
  net: { account: "421", label: "Personnel, rémunérations dues" },
};

export function resolveAccounts(raw: unknown): Record<AccountKey, { account: string; label: string }> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_ACCOUNTS };
  for (const k of ACCOUNT_KEYS) {
    const v = src[k];
    if (v && typeof v === "object") {
      const account = String((v as Record<string, unknown>).account ?? "").trim();
      const label = String((v as Record<string, unknown>).label ?? "").trim();
      if (/^\d{2,10}$/.test(account)) out[k] = { account, label: label || DEFAULT_ACCOUNTS[k].label };
    }
  }
  return out;
}

export type JournalLine = { account: string; label: string; analytic: string; debit: number; credit: number };

/** Monthly payroll entry: expenses by site (analytic), liabilities aggregated. Balanced by construction. */
export function buildPayrollJournal(input: {
  slips: readonly CostSlip[];
  sites: readonly CostSite[];
  accounts: Record<AccountKey, { account: string; label: string }>;
}) {
  const siteMap = new Map(input.sites.map((s) => [s.id, s]));
  const debits = new Map<string, JournalLine>();
  const totals = { cnas: 0, caco: 0, irg: 0, advances: 0, other: 0, net: 0 };
  for (const s of input.slips) {
    const c = slipCost(s);
    const analytic = s.site_id ? siteMap.get(s.site_id)?.code ?? "SANS" : "SANS";
    const add = (key: AccountKey, amount: number) => {
      if (!amount) return;
      const a = input.accounts[key];
      const k = `${a.account}|${analytic}`;
      const row = debits.get(k) ?? { account: a.account, label: a.label, analytic, debit: 0, credit: 0 };
      row.debit = round2(row.debit + amount);
      debits.set(k, row);
    };
    add("salaires", c.brut);
    add("charges_sociales", c.charges);
    totals.cnas = round2(totals.cnas + s.employee_ss + s.employer_ss);
    totals.caco = round2(totals.caco + s.cacobatph + s.intemperies_employee + s.intemperies_employer);
    totals.irg = round2(totals.irg + s.irg_amount);
    totals.advances = round2(totals.advances + c.advances);
    totals.other = round2(totals.other + c.otherDeductions);
    totals.net = round2(totals.net + s.net_payable);
  }
  const credit = (key: AccountKey, amount: number): JournalLine[] =>
    amount ? [{ account: input.accounts[key].account, label: input.accounts[key].label, analytic: "", debit: 0, credit: amount }] : [];
  const lines: JournalLine[] = [
    ...[...debits.values()].sort((a, b) => a.account.localeCompare(b.account) || a.analytic.localeCompare(b.analytic)),
    ...credit("cnas", totals.cnas),
    ...credit("cacobatph", totals.caco),
    ...credit("irg", totals.irg),
    ...credit("avances", totals.advances),
    ...credit("retenues", totals.other),
    ...credit("net", totals.net),
  ];
  const debit = round2(lines.reduce((a, l) => a + l.debit, 0));
  const creditTotal = round2(lines.reduce((a, l) => a + l.credit, 0));
  return { lines, debit, credit: creditTotal, balanced: Math.abs(debit - creditTotal) < 0.01 };
}

function csvCell(v: string) {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function journalCsv(input: { journalCode: string; date: string; piece: string; label: string; lines: readonly JournalLine[] }) {
  const rows = [
    ["Journal", "Date", "Piece", "Compte", "Libelle", "Analytique", "Debit", "Credit"],
    ...input.lines.map((l) => [
      input.journalCode,
      input.date,
      input.piece,
      l.account,
      `${input.label} - ${l.label}`,
      l.analytic,
      l.debit ? l.debit.toFixed(2) : "",
      l.credit ? l.credit.toFixed(2) : "",
    ]),
  ];
  return rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

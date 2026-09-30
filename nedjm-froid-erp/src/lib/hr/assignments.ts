export type AssignmentRow = {
  id: string;
  contract_id: string;
  site_id: string;
  effective_from: string;
  /** D8 decision that corrected the start of this assignment. */
  corrected_by_decision?: string | null;
};

export type SiteWilayaRow = {
  site_id: string;
  effective_from: string;
  wilaya_code: string;
};

type ContractSpan = {
  id: string;
  site_id: string;
  start_date: string;
  end_date: string | null;
};

/** Assignment of the contract in force on `asOf` (latest effective_from ≤ asOf). */
export function assignmentAt(rows: readonly AssignmentRow[], contractId: string, asOf: string): AssignmentRow | null {
  let best: AssignmentRow | null = null;
  for (const r of rows) {
    if (r.contract_id !== contractId || r.effective_from.slice(0, 10) > asOf) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best;
}

export type MonthAssignment = {
  contractId: string;
  siteId: string;
  /** Null for a contract without assignment history (site of the contract used as is). */
  assignmentId: string | null;
};

/**
 * Assignment that determines the month (payroll site, wilaya, IRG zone): the one in force on the 1st for the
 * contract covering that day. A contract starting later in the month (documented historical exception) uses
 * its assignment at its start.
 */
export function monthAssignment(
  contracts: readonly ContractSpan[],
  rows: readonly AssignmentRow[],
  periodStart: string,
): MonthAssignment | null {
  if (!contracts.length) return null;
  const covering = contracts.find(
    (c) => c.start_date.slice(0, 10) <= periodStart && (!c.end_date || c.end_date.slice(0, 10) >= periodStart),
  );
  const ctr = covering ?? [...contracts].sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const asOf = covering ? periodStart : ctr.start_date.slice(0, 10);
  const a = assignmentAt(rows, ctr.id, asOf);
  return { contractId: ctr.id, siteId: a?.site_id ?? ctr.site_id, assignmentId: a?.id ?? null };
}

/** Month assignment of each employee among their payable principal contracts. */
export function monthAssignmentsByEmployee(
  contracts: readonly {
    id: string;
    employee_id: string;
    site_id: string;
    start_date: string | Date;
    end_date: string | Date | null;
  }[],
  rows: readonly AssignmentRow[],
  periodStart: string,
): Map<string, MonthAssignment> {
  const byEmp = new Map<string, ContractSpan[]>();
  for (const c of contracts) {
    const list = byEmp.get(c.employee_id) ?? [];
    list.push({
      id: c.id,
      site_id: c.site_id,
      start_date: String(c.start_date).slice(0, 10),
      end_date: c.end_date ? String(c.end_date).slice(0, 10) : null,
    });
    byEmp.set(c.employee_id, list);
  }
  const out = new Map<string, MonthAssignment>();
  for (const [empId, list] of byEmp) {
    const m = monthAssignment(list, rows, periodStart);
    if (m) out.set(empId, m);
  }
  return out;
}

/** Coded wilaya of the site in force on `asOf`, null when the site has no confirmed wilaya yet. */
export function siteWilayaAt(rows: readonly SiteWilayaRow[], siteId: string, asOf: string): string | null {
  let best: SiteWilayaRow | null = null;
  for (const r of rows) {
    if (r.site_id !== siteId || r.effective_from.slice(0, 10) > asOf) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best?.wilaya_code ?? null;
}

export function isFirstOfMonth(date: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(date.slice(0, 10));
}

export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

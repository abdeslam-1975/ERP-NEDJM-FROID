/** D1 simulation rows: computed like a payslip, stored apart (hr_payroll_simulation_slips), never a payslip. */
export type SimulationSlipRow = {
  employee_id: string;
  contract_id: string | null;
  site_id: string | null;
  days_paid: number;
  gross_amount: number;
  employee_ss: number;
  employer_ss: number;
  irg_amount: number;
  net_payable: number;
  detail: {
    matricule: string | null;
    days_by_code: Record<string, number>;
    net_target: number;
    irg_base: number;
    cacobatph: number;
    lines: { code: string; label_fr: string; category: string; quantity: number; unit_amount: number; amount: number }[];
  };
};

type ComputedSlip = {
  employee_id: string;
  row: Record<string, unknown>;
  lines: readonly {
    code: string;
    label_fr: string;
    category: string;
    quantity: number;
    unit_amount: number;
    amount: number;
  }[];
};

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
};

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function toSimulationSlip(slip: ComputedSlip, matricule: string | null): SimulationSlipRow {
  const r = slip.row;
  const assignment = rec(rec(r.legal_snapshot).assignment);
  const days: Record<string, number> = {};
  for (const [code, qty] of Object.entries(rec(r.days_by_code))) {
    const q = Number(qty);
    if (Number.isFinite(q)) days[code] = q;
  }
  return {
    employee_id: slip.employee_id,
    contract_id: typeof r.hr_contract_id === "string" ? r.hr_contract_id : null,
    site_id: typeof assignment.site_id === "string" ? assignment.site_id : null,
    days_paid: n(r.days_paid),
    gross_amount: n(r.gross_amount),
    employee_ss: n(r.employee_ss),
    employer_ss: n(r.employer_ss),
    irg_amount: n(r.irg_amount),
    net_payable: n(r.net_payable),
    detail: {
      matricule,
      days_by_code: days,
      net_target: n(r.net_target),
      irg_base: n(r.irg_base),
      cacobatph: n(r.cacobatph),
      lines: slip.lines.map((l) => ({
        code: l.code,
        label_fr: l.label_fr,
        category: l.category,
        quantity: n(l.quantity),
        unit_amount: n(l.unit_amount),
        amount: n(l.amount),
      })),
    },
  };
}

export type SimulationTotals = { gross: number; employee_ss: number; employer_ss: number; irg: number; net: number };

export function parseSimulationTotals(raw: unknown): SimulationTotals {
  const t = rec(raw);
  return { gross: n(t.gross), employee_ss: n(t.employee_ss), employer_ss: n(t.employer_ss), irg: n(t.irg), net: n(t.net) };
}

/** Warnings kept with the simulation: distinct, bounded (the database refuses more than 2000). */
export function simulationWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings.map((w) => w.trim()).filter(Boolean))].slice(0, 500).map((w) => w.slice(0, 500));
}

export type DeclarationSlip = {
  employee_id: string;
  period_year: number;
  period_month: number;
  site_name: string | null;
  matricule: string;
  employee_name: string;
  nss: string | null;
  birth_date: string | null;
  hired_at: string | null;
  days_worked: number;
  days_paid: number;
  gross_amount: number;
  employee_ss: number;
  employer_ss: number;
  cacobatph: number;
  intemperies_employee: number;
  intemperies_employer: number;
  irg_base: number;
  irg_amount: number;
  net_payable: number;
  status_code: string;
  payment_mode_code: string | null;
  account_no: string | null;
  account_key?: string | null;
  /** Frozen regime (slips generated since Module 05). */
  compliance?: { irg: { fixed_rate: number | null }; labels: { irg: string } } | null;
  lines: { nature: string; amount: number }[];
};

/** G50 line of a slip: progressive barème, or one line per fixed rate. */
export function irgG50Line(slip: Pick<DeclarationSlip, "compliance">) {
  const rate = slip.compliance?.irg.fixed_rate;
  return rate != null ? `IRG taux libératoire ${Math.round(rate * 10000) / 100} %` : "IRG salaires (barème)";
}

export type PaymentMode = "CCP" | "BANK" | "CASH" | "NONE";

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CCP: "CCP",
  BANK: "Banque",
  CASH: "Caisse",
  NONE: "Non renseigné",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(rows: readonly T[], pick: (row: T) => number) => round2(rows.reduce((s, r) => s + pick(r), 0));

export function slipGrossTotal(slip: Pick<DeclarationSlip, "lines">) {
  return sum(
    slip.lines.filter((l) => l.nature !== "retenue"),
    (l) => l.amount,
  );
}

export function normalizePaymentMode(code: string | null | undefined): PaymentMode {
  const c = (code ?? "").trim().toUpperCase();
  return c === "CCP" || c === "BANK" || c === "CASH" ? c : "NONE";
}

const byMatricule = (a: DeclarationSlip, b: DeclarationSlip) =>
  a.matricule.localeCompare(b.matricule, "fr", { numeric: true });

export type CnasRow = {
  matricule: string;
  employee_name: string;
  nss: string;
  days_paid: number;
  assiette: number;
  part_salariale: number;
  part_patronale: number;
  total: number;
};

export type MonthlyDeclarations = {
  employees: number;
  journal: {
    gross_total: number;
    assiette_cnas: number;
    employee_ss: number;
    employer_ss: number;
    irg_base: number;
    irg_amount: number;
    cacobatph: number;
    intemperies_employee: number;
    intemperies_employer: number;
    net_payable: number;
    employer_cost: number;
  };
  cnas: {
    rows: CnasRow[];
    missing_nss: string[];
    totals: { assiette: number; part_salariale: number; part_patronale: number; total: number };
  };
  irg: {
    rows: { matricule: string; employee_name: string; regime: string; irg_base: number; irg_amount: number }[];
    totals: { taxed_employees: number; irg_base: number; irg_amount: number };
    by_line: { line: string; employees: number; irg_base: number; irg_amount: number }[];
  };
  cacobatph: {
    rows: {
      matricule: string;
      employee_name: string;
      assiette: number;
      conges: number;
      intemperies_employee: number;
      intemperies_employer: number;
    }[];
    totals: { assiette: number; conges: number; intemperies_employee: number; intemperies_employer: number; total: number };
  };
  transfers: {
    groups: {
      mode: PaymentMode;
      rows: { matricule: string; employee_name: string; account: string; net: number }[];
      total: number;
    }[];
    missing_account: string[];
    total: number;
  };
};

function account(slip: DeclarationSlip) {
  const no = (slip.account_no ?? "").trim();
  const key = (slip.account_key ?? "").trim();
  return no && key ? `${no} clé ${key}` : no;
}

export function summarizeMonthlyDeclarations(slips: readonly DeclarationSlip[]): MonthlyDeclarations {
  const rows = [...slips].sort(byMatricule);
  const label = (s: DeclarationSlip) => `${s.matricule} ${s.employee_name}`.trim();

  const cnasRows: CnasRow[] = rows
    .filter((s) => s.gross_amount > 0 || s.employee_ss > 0)
    .map((s) => ({
      matricule: s.matricule,
      employee_name: s.employee_name,
      nss: (s.nss ?? "").trim(),
      days_paid: s.days_paid,
      assiette: s.gross_amount,
      part_salariale: s.employee_ss,
      part_patronale: s.employer_ss,
      total: round2(s.employee_ss + s.employer_ss),
    }));

  const cacoRows = rows
    .filter((s) => s.cacobatph > 0 || s.intemperies_employee > 0 || s.intemperies_employer > 0)
    .map((s) => ({
      matricule: s.matricule,
      employee_name: s.employee_name,
      assiette: s.gross_amount,
      conges: s.cacobatph,
      intemperies_employee: s.intemperies_employee,
      intemperies_employer: s.intemperies_employer,
    }));

  const modes: PaymentMode[] = ["CCP", "BANK", "CASH", "NONE"];
  const groups = modes
    .map((mode) => {
      const list = rows.filter((s) => normalizePaymentMode(s.payment_mode_code) === mode && s.net_payable > 0);
      return {
        mode,
        rows: list.map((s) => ({
          matricule: s.matricule,
          employee_name: s.employee_name,
          account: account(s),
          net: s.net_payable,
        })),
        total: sum(list, (s) => s.net_payable),
      };
    })
    .filter((g) => g.rows.length > 0);

  const cacoTotals = {
    assiette: sum(cacoRows, (r) => r.assiette),
    conges: sum(cacoRows, (r) => r.conges),
    intemperies_employee: sum(cacoRows, (r) => r.intemperies_employee),
    intemperies_employer: sum(cacoRows, (r) => r.intemperies_employer),
  };

  const employerSs = sum(rows, (s) => s.employer_ss);
  const cacobatph = sum(rows, (s) => s.cacobatph);
  const intempEmployer = sum(rows, (s) => s.intemperies_employer);
  const net = sum(rows, (s) => s.net_payable);
  const employeeSs = sum(rows, (s) => s.employee_ss);
  const intempEmployee = sum(rows, (s) => s.intemperies_employee);
  const irgAmount = sum(rows, (s) => s.irg_amount);
  const irgRows = rows.filter((s) => s.irg_base > 0 || s.irg_amount > 0);
  const g50Lines = [...new Set(irgRows.map(irgG50Line))].sort();

  return {
    employees: rows.length,
    journal: {
      gross_total: sum(rows, slipGrossTotal),
      assiette_cnas: sum(rows, (s) => s.gross_amount),
      employee_ss: employeeSs,
      employer_ss: employerSs,
      irg_base: sum(rows, (s) => s.irg_base),
      irg_amount: irgAmount,
      cacobatph,
      intemperies_employee: intempEmployee,
      intemperies_employer: intempEmployer,
      net_payable: net,
      employer_cost: round2(net + employeeSs + intempEmployee + irgAmount + employerSs + cacobatph + intempEmployer),
    },
    cnas: {
      rows: cnasRows,
      missing_nss: cnasRows.filter((r) => !r.nss).map((r) => `${r.matricule} ${r.employee_name}`.trim()),
      totals: {
        assiette: sum(cnasRows, (r) => r.assiette),
        part_salariale: sum(cnasRows, (r) => r.part_salariale),
        part_patronale: sum(cnasRows, (r) => r.part_patronale),
        total: sum(cnasRows, (r) => r.total),
      },
    },
    irg: {
      rows: irgRows.map((s) => ({
        matricule: s.matricule,
        employee_name: s.employee_name,
        regime: s.compliance?.labels.irg ?? "",
        irg_base: s.irg_base,
        irg_amount: s.irg_amount,
      })),
      totals: {
        taxed_employees: rows.filter((s) => s.irg_amount > 0).length,
        irg_base: sum(rows, (s) => s.irg_base),
        irg_amount: irgAmount,
      },
      by_line: g50Lines.map((line) => {
        const group = irgRows.filter((s) => irgG50Line(s) === line);
        return {
          line,
          employees: group.length,
          irg_base: sum(group, (s) => s.irg_base),
          irg_amount: sum(group, (s) => s.irg_amount),
        };
      }),
    },
    cacobatph: {
      rows: cacoRows,
      totals: {
        ...cacoTotals,
        total: round2(cacoTotals.conges + cacoTotals.intemperies_employee + cacoTotals.intemperies_employer),
      },
    },
    transfers: {
      groups,
      missing_account: rows
        .filter((s) => {
          const mode = normalizePaymentMode(s.payment_mode_code);
          return s.net_payable > 0 && (mode === "NONE" || (mode !== "CASH" && !(s.account_no ?? "").trim()));
        })
        .map(label),
      total: net,
    },
  };
}

export type DasRow = {
  matricule: string;
  employee_name: string;
  nss: string;
  birth_date: string | null;
  hired_at: string | null;
  first_month: number;
  last_month: number;
  quarters: { days: number; assiette: number }[];
  days_total: number;
  assiette_total: number;
  employee_ss: number;
  employer_ss: number;
};

/** Déclaration annuelle des salaires (CNAS): one row per employee, assiette per quarter. */
export function summarizeAnnualDas(slips: readonly DeclarationSlip[]) {
  const byEmployee = new Map<string, DeclarationSlip[]>();
  for (const s of slips) {
    const list = byEmployee.get(s.employee_id) ?? [];
    list.push(s);
    byEmployee.set(s.employee_id, list);
  }
  const rows: DasRow[] = [...byEmployee.values()].map((list) => {
    const latest = [...list].sort((a, b) => b.period_month - a.period_month)[0];
    const quarters = [0, 1, 2, 3].map((q) => {
      const inQ = list.filter((s) => Math.floor((s.period_month - 1) / 3) === q);
      return { days: sum(inQ, (s) => s.days_paid), assiette: sum(inQ, (s) => s.gross_amount) };
    });
    const months = list.map((s) => s.period_month);
    return {
      matricule: latest.matricule,
      employee_name: latest.employee_name,
      nss: (list.find((s) => (s.nss ?? "").trim())?.nss ?? "").trim(),
      birth_date: latest.birth_date,
      hired_at: latest.hired_at,
      first_month: Math.min(...months),
      last_month: Math.max(...months),
      quarters,
      days_total: sum(quarters, (q) => q.days),
      assiette_total: sum(quarters, (q) => q.assiette),
      employee_ss: sum(list, (s) => s.employee_ss),
      employer_ss: sum(list, (s) => s.employer_ss),
    };
  });
  rows.sort((a, b) => a.matricule.localeCompare(b.matricule, "fr", { numeric: true }));
  return {
    rows,
    missing_nss: rows.filter((r) => !r.nss).map((r) => `${r.matricule} ${r.employee_name}`.trim()),
    totals: {
      quarters: [0, 1, 2, 3].map((q) => sum(rows, (r) => r.quarters[q].assiette)),
      assiette: sum(rows, (r) => r.assiette_total),
      employee_ss: sum(rows, (r) => r.employee_ss),
      employer_ss: sum(rows, (r) => r.employer_ss),
    },
  };
}

export type DeclarationStatus = "FINAL" | "PROVISIONAL";

/** A declaration is final only when every run of the period is validated or closed. */
export function declarationStatus(runStatuses: readonly string[]): DeclarationStatus {
  return runStatuses.length > 0 && runStatuses.every((s) => s === "VALIDATED" || s === "LOCKED")
    ? "FINAL"
    : "PROVISIONAL";
}

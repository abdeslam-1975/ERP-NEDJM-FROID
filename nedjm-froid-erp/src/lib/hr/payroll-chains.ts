/** Closing policy decided by D6 (hr_payroll_chain_state). UNDECIDED and FROZEN share one chronological chain. */
export type PayrollChainMode = "UNDECIDED" | "FROZEN" | "SEPARATE";

export type PayrollChainState = {
  mode: PayrollChainMode;
  decisionId: string | null;
  /** First month after the latest validated / closed run, all months together (null = none validated). */
  globalOpen: string | null;
  /** Reprise chain (January–August 2026), used only when the chains are separated. */
  externalOpen: string | null;
  /** Operational chain, never before September 2026. */
  operationalOpen: string;
  operationalStart: string;
};

export const OPERATIONAL_START = "2026-09-01";

const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const openDay = (v: unknown) => {
  const d = day(v);
  return d && d > "1900-01-01" ? d : null;
};

export function parseChainState(raw: unknown): PayrollChainState {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mode = r.mode === "FROZEN" || r.mode === "SEPARATE" ? r.mode : "UNDECIDED";
  const start = day(r.operational_start) ?? OPERATIONAL_START;
  const op = day(r.operational_open);
  return {
    mode,
    decisionId: typeof r.decision_id === "string" ? r.decision_id : null,
    globalOpen: openDay(r.global_open),
    externalOpen: openDay(r.external_open),
    operationalOpen: op && op > start ? op : start,
    operationalStart: start,
  };
}

/** Mirrors hr_first_open_month_for: first open month of the chain the month belongs to. */
export function firstOpenFor(state: PayrollChainState, month: string): string | null {
  if (state.mode !== "SEPARATE") return state.globalOpen;
  if (month < state.operationalStart) return state.externalOpen;
  return state.operationalOpen;
}

/** Mirrors hr_month_is_closed. */
export function isMonthClosed(state: PayrollChainState, month: string): boolean {
  const open = firstOpenFor(state, month);
  return open != null && month < open;
}

/** Earliest month a rule change may still apply from (reprise months first when the chains are separated). */
export function earliestOpen(state: PayrollChainState): string | null {
  if (state.mode !== "SEPARATE") return state.globalOpen;
  const ext = state.externalOpen;
  if (ext == null || ext < state.operationalStart) return ext;
  return state.operationalOpen;
}

/** Mirrors hr_payroll_chain_required: validating an operational month while reprise months are still open. */
export function chainDecisionRequired(state: PayrollChainState, month: string): boolean {
  return (
    state.mode === "UNDECIDED" &&
    month >= state.operationalStart &&
    (state.globalOpen == null || state.globalOpen < state.operationalStart)
  );
}

export function chainModeLabel(mode: PayrollChainMode): string {
  if (mode === "FROZEN") return "Clôture chronologique (mois de reprise figés)";
  if (mode === "SEPARATE") return "Chaînes séparées : reprise (janvier–août 2026) et paie opérationnelle";
  return "Non décidée (décision D6 demandée à la première validation d'un mois opérationnel)";
}

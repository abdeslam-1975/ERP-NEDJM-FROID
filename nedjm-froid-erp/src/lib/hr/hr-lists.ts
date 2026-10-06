/**
 * HR lists edited in Paramètres RH › Listes et codes (`hr_catalogs`): leave kinds, exit reasons,
 * transport modes and the print defaults of each contract type. Behaviour flags live in `extra`.
 */

export type HrListItem = {
  kind: string;
  code: string;
  label_fr: string;
  label_ar: string;
  extra?: Record<string, unknown> | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export const LEAVE_KIND_LIST = "leave_kind";
export const EXIT_REASON_LIST = "exit_reason";
export const TRANSPORT_MODE_LIST = "transport_mode";
export const CONTRACT_TYPE_LIST = "contract_type";
export const HR_LIST_KINDS = [LEAVE_KIND_LIST, EXIT_REASON_LIST, TRANSPORT_MODE_LIST, CONTRACT_TYPE_LIST] as const;

type ListOption = { code: string; fr: string; ar: string; active: boolean };
/** `legend`: attendance code written for the approved leave; `annual`: counted in the annual balance. */
export type LeaveKindOption = ListOption & { legend: string; annual: boolean };
/** `notice`: the two mises en demeure are sent before this exit. */
export type ExitReasonOption = ListOption & { notice: boolean };
/** `vehicle`: ticks « véhicule de service » on the sheets (otherwise « tous moyens »). */
export type TransportModeOption = ListOption & { vehicle: boolean };

export type ContractTypeDefaults = { cdi: boolean; essai: string; preavis: string; cdd_reason: number };

/** Lists the printed sheets (ordre de mission, titre de congé) read. */
export type PrintLists = { leaveKinds: LeaveKindOption[]; transportModes: TransportModeOption[] };
export const EMPTY_PRINT_LISTS: PrintLists = { leaveKinds: [], transportModes: [] };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const flag = (v: unknown) => v === true || v === "true";

function rowsOf(items: readonly HrListItem[], kind: string) {
  return items
    .filter((i) => i.kind === kind)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label_fr.localeCompare(b.label_fr, "fr"));
}

function option(i: HrListItem): ListOption {
  return { code: i.code, fr: i.label_fr || i.code, ar: i.label_ar || i.label_fr || i.code, active: i.is_active !== false };
}

export function leaveKindOptions(items: readonly HrListItem[]): LeaveKindOption[] {
  return rowsOf(items, LEAVE_KIND_LIST).map((i) => ({
    ...option(i),
    legend: text(i.extra?.legend).toUpperCase(),
    annual: flag(i.extra?.annual),
  }));
}

export function exitReasonOptions(items: readonly HrListItem[]): ExitReasonOption[] {
  return rowsOf(items, EXIT_REASON_LIST).map((i) => ({ ...option(i), notice: flag(i.extra?.mise_en_demeure) }));
}

export function transportModeOptions(items: readonly HrListItem[]): TransportModeOption[] {
  return rowsOf(items, TRANSPORT_MODE_LIST).map((i) => ({ ...option(i), vehicle: flag(i.extra?.vehicle) }));
}

export function printListsFrom(items: readonly HrListItem[]): PrintLists {
  return { leaveKinds: leaveKindOptions(items), transportModes: transportModeOptions(items) };
}

/** Choices offered in forms; archived values stay readable through `listLabel`. */
export function activeOptions<T extends ListOption>(list: readonly T[]): T[] {
  return list.filter((o) => o.active);
}

export function listLabel(list: readonly ListOption[], code: string): { fr: string; ar: string } {
  const found = list.find((o) => o.code === code);
  return found ? { fr: found.fr, ar: found.ar } : { fr: code, ar: code };
}

export function annualLeaveCodes(kinds: readonly LeaveKindOption[]): string[] {
  return kinds.filter((k) => k.annual).map((k) => k.code);
}

export function isAnnualLeave(kinds: readonly LeaveKindOption[], code: string) {
  return kinds.some((k) => k.annual && k.code === code);
}

/** Box ticked on the sheets for the stored transport text (label or code); unknown texts print as « tous moyens ». */
export function transportBox(modes: readonly TransportModeOption[], moyen: string | null | undefined): "service" | "tous" | null {
  const value = (moyen ?? "").trim().toLowerCase();
  if (!value) return null;
  const mode = modes.find((m) => m.fr.trim().toLowerCase() === value || m.code.toLowerCase() === value);
  return mode?.vehicle ? "service" : "tous";
}

export function contractTypeDefaults(items: readonly HrListItem[], code: string | null | undefined): ContractTypeDefaults {
  const wanted = (code ?? "").trim().toUpperCase();
  const item = wanted ? items.find((i) => i.kind === CONTRACT_TYPE_LIST && i.code.toUpperCase() === wanted) : undefined;
  const extra = item?.extra ?? {};
  const reason = Number(extra.cdd_reason);
  return {
    cdi: flag(extra.cdi),
    essai: text(extra.essai),
    preavis: text(extra.preavis),
    cdd_reason: Number.isInteger(reason) && reason >= 1 ? reason : 1,
  };
}

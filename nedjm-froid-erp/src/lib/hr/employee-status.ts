/** Activity statuses live in the catalog kind `employee_status` (edited by the super admin). */

export type StatusChoice = {
  kind?: string;
  code: string;
  label_fr?: string;
  label_ar?: string;
  is_active?: boolean;
  extra?: Record<string, unknown> | null;
};

export function employeeStatusItems(catalogs: StatusChoice[]): StatusChoice[] {
  return catalogs.filter((item) => item.kind === "employee_status" && item.is_active !== false);
}

const FALLBACK_STATUS_OPTIONS = [
  { code: "ACTIVE", label: "Actif" },
  { code: "INACTIVE", label: "Inactif" },
  { code: "SUSPENDED", label: "Suspendu" },
  { code: "DISABLED", label: "Désactivé" },
];

/** Choices shown on the employee table. The list is not edited from Paramètres. */
export function activityStatusOptions(catalogs: StatusChoice[]): { code: string; label: string }[] {
  const items = employeeStatusItems(catalogs);
  if (!items.length) return FALLBACK_STATUS_OPTIONS;
  return items.map((item) => ({ code: item.code, label: item.label_fr || item.code }));
}

/** Codes that count as "active". Falls back to ACTIVE when the list has no working flag. */
export function workingStatusCodes(catalogs: StatusChoice[]): Set<string> {
  const items = employeeStatusItems(catalogs);
  const working = items.filter((item) => item.extra?.working === true).map((item) => item.code);
  return new Set(working.length ? working : ["ACTIVE"]);
}

export function defaultEmployeeStatus(catalogs: StatusChoice[]): string {
  const items = employeeStatusItems(catalogs);
  return (
    items.find((item) => item.extra?.default === true)?.code ??
    items.find((item) => item.extra?.working === true)?.code ??
    "ACTIVE"
  );
}

export function nextActivityStatus(current: string, catalogs: StatusChoice[]): string {
  const items = employeeStatusItems(catalogs);
  const working = workingStatusCodes(catalogs);
  if (working.has(current)) {
    return items.find((item) => !working.has(item.code))?.code ?? "INACTIVE";
  }
  return items.find((item) => working.has(item.code))?.code ?? "ACTIVE";
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Match an Excel cell to a catalog code (code, French label or Arabic label). */
export function matchEmployeeStatus(raw: string, catalogs: StatusChoice[]): string | null {
  const items = employeeStatusItems(catalogs);
  if (!items.length) return null;
  const folded = norm(raw);
  const upper = raw.trim().toUpperCase();
  const hit = items.find(
    (item) => item.code === upper || norm(item.label_fr ?? "") === folded || norm(item.label_ar ?? "") === folded,
  );
  return hit?.code ?? null;
}

/** Figures of the HR overview, computed from contracts, employees and attendance rows. */

export type DashboardContract = {
  employee_id: string;
  contract_type_code: string | null;
  salaire_base_monthly: number;
  start_date: string;
  end_date: string | null;
  status: string;
  poste_fr: string | null;
  site_name: string;
  affectation_principale: boolean;
  employee_name: string;
};

export type AttendanceMark = { employee_id: string; work_date: string; legend_code: string };

export type AttendanceLegend = { code: string; label_fr: string; counts_as_presence: boolean };

export type AttendanceKind = "present" | "absent" | "leave" | "mission";

export type AttendanceSnapshot = {
  date: string | null;
  present: number;
  absent: number;
  leave: number;
  mission: number;
};

const OPEN_STATUSES = new Set(["ACTIVE", "DRAFT", "SUSPENDED"]);

const MIX_COLORS = ["#3b6ef5", "#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899", "#0ea5e9", "#94a3b8"];

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOpenContract(c: Pick<DashboardContract, "status">) {
  return OPEN_STATUSES.has(c.status);
}

/** True when the contract was in force on `day` (YYYY-MM-DD). An ended contract without end date is never counted. */
export function contractInForce(c: Pick<DashboardContract, "status" | "start_date" | "end_date">, day: string) {
  if (c.status === "DRAFT") return false;
  if (c.start_date.slice(0, 10) > day) return false;
  if (c.end_date) return c.end_date.slice(0, 10) >= day;
  return c.status !== "ENDED";
}

/** Distinct employees under contract at the end of each of the last `months` months (today for the current one). */
export function headcountByMonth(contracts: DashboardContract[], now: Date, months = 12) {
  const points: { key: string; label: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ref = i === 0 ? now : new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const day = isoDay(ref);
    const employees = new Set(contracts.filter((c) => contractInForce(c, day)).map((c) => c.employee_id));
    points.push({
      key: day.slice(0, 7),
      label: first.toLocaleDateString("fr-FR", { month: "short" }),
      count: employees.size,
    });
  }
  return points;
}

/** Open contracts by type, largest first, with a colour each. */
export function contractMix(contracts: DashboardContract[], labels: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const c of contracts) {
    if (!isOpenContract(c)) continue;
    const code = c.contract_type_code || "AUTRE";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count], i) => ({
      code,
      label: labels[code] ?? (code === "AUTRE" ? "Non renseigné" : code),
      count,
      color: MIX_COLORS[Math.min(i, MIX_COLORS.length - 1)],
    }));
}

export function attendanceKind(legend: AttendanceLegend | undefined, code: string): AttendanceKind | null {
  const label = (legend?.label_fr ?? "").toLowerCase();
  if (code === "MS" || label.startsWith("mission")) return "mission";
  if (label.startsWith("congé") || label.startsWith("conge")) return "leave";
  if (label.startsWith("absence") || label.startsWith("abandon")) return "absent";
  if (legend?.counts_as_presence) return "present";
  return null;
}

/** Counts of the most recent day carrying at least one present / absent / leave / mission mark. */
export function attendanceSnapshot(marks: AttendanceMark[], legends: AttendanceLegend[]): AttendanceSnapshot {
  const byCode = new Map(legends.map((l) => [l.code, l]));
  const byDay = new Map<string, Map<string, AttendanceKind>>();
  for (const m of marks) {
    const kind = attendanceKind(byCode.get(m.legend_code), m.legend_code);
    if (!kind) continue;
    const day = byDay.get(m.work_date) ?? new Map<string, AttendanceKind>();
    day.set(m.employee_id, kind);
    byDay.set(m.work_date, day);
  }
  const date = [...byDay.keys()].sort().at(-1) ?? null;
  const snapshot: AttendanceSnapshot = { date, present: 0, absent: 0, leave: 0, mission: 0 };
  if (!date) return snapshot;
  for (const kind of byDay.get(date)!.values()) snapshot[kind] += 1;
  return snapshot;
}

export type ContractAlert = {
  key: "ending" | "draft" | "uncovered";
  count: number;
  detail: string;
  when: string;
};

/** Contracts ending within 30 days, drafts to finalise, active employees without an open contract. */
export function contractAlerts(
  contracts: DashboardContract[],
  activeEmployees: { id: string; name: string }[],
  now: Date,
): ContractAlert[] {
  const today = isoDay(now);
  const horizon = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  const ending = contracts
    .filter((c) => c.status === "ACTIVE" && c.end_date && c.end_date.slice(0, 10) >= today && c.end_date.slice(0, 10) <= horizon)
    .sort((a, b) => a.end_date!.localeCompare(b.end_date!));
  const drafts = contracts.filter((c) => c.status === "DRAFT");
  const covered = new Set(contracts.filter(isOpenContract).map((c) => c.employee_id));
  const uncovered = activeEmployees.filter((e) => !covered.has(e.id));

  const alerts: ContractAlert[] = [];
  if (ending.length) {
    const days = Math.round((new Date(`${ending[0].end_date!.slice(0, 10)}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
    alerts.push({
      key: "ending",
      count: ending.length,
      detail: ending.length === 1 ? ending[0].employee_name : `${ending[0].employee_name} et ${ending.length - 1} autre(s)`,
      when: days === 0 ? "Aujourd’hui" : `Dans ${days} jour${days > 1 ? "s" : ""}`,
    });
  }
  if (drafts.length) {
    alerts.push({
      key: "draft",
      count: drafts.length,
      detail: `${drafts.length} contrat${drafts.length > 1 ? "s" : ""} en brouillon`,
      when: "À finaliser",
    });
  }
  if (uncovered.length) {
    alerts.push({
      key: "uncovered",
      count: uncovered.length,
      detail: uncovered.length === 1 ? uncovered[0].name : `${uncovered.length} employés actifs`,
      when: "À régulariser",
    });
  }
  return alerts;
}

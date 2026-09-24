export type AttendanceLegend = {
  code: string;
  label_fr: string;
  label_ar?: string | null;
  coefficient: number;
  counts_as_presence: boolean;
};

export type MovementBucket =
  | "worked"
  | "leave"
  | "absence"
  | "weekend"
  | "abandon"
  | "rappel"
  | "other";

export type AttendanceMovements = {
  days_worked: number;
  days_presence_qty: number;
  days_paid: number;
  days_leave: number;
  days_absence: number;
  days_weekend: number;
  days_abandon: number;
  days_rappel: number;
};

/** Classifie une légende vers un compartiment Mouvements (libellés + code système). */
export function legendMovementBucket(legend: AttendanceLegend): MovementBucket {
  const code = String(legend.code ?? "").trim().toUpperCase();
  const text = `${legend.label_fr} ${legend.label_ar ?? ""} ${code}`.toLowerCase();
  if (code === "AP" || /abandon|تخلي/.test(text)) return "abandon";
  if (
    code === "W" ||
    code === "JF" ||
    /week[\s-]?end|f[eé]ri[eé]|نهاية\s*أسبوع|عيد\s*رسمي/.test(text)
  ) {
    return "weekend";
  }
  if (/rappel\s*salaire|^rappel$/.test(text)) return "rappel";
  if (
    code === "AN" ||
    code === "AJ" ||
    code === "AOP" ||
    /absence|غياب/.test(text)
  ) {
    return "absence";
  }
  if (
    code === "CA" ||
    code === "CM" ||
    code === "CSS" ||
    /cong[eé]|عطلة|عطله/.test(text)
  ) {
    return "leave";
  }
  if (code === "P" || code === "P/2" || code === "MS" || code === "CRP" || legend.counts_as_presence) {
    return "worked";
  }
  return "other";
}

export function emptyMovements(): AttendanceMovements {
  return {
    days_worked: 0,
    days_presence_qty: 0,
    days_paid: 0,
    days_leave: 0,
    days_absence: 0,
    days_weekend: 0,
    days_abandon: 0,
    days_rappel: 0,
  };
}

export function accumulateAttendanceMovements(
  cells: Array<{ employee_id: string; legend_code: string; site_id?: string | null }>,
  legends: AttendanceLegend[],
  options?: { siteId?: string | null },
): Map<string, AttendanceMovements> {
  const byCode = new Map(
    legends.map((l) => [l.code.toUpperCase(), l] as const),
  );
  const out = new Map<string, AttendanceMovements>();
  for (const cell of cells) {
    if (options?.siteId && cell.site_id && cell.site_id !== options.siteId) continue;
    const legend = byCode.get(String(cell.legend_code ?? "").trim().toUpperCase());
    const coef = Number(legend?.coefficient ?? 0);
    const current = out.get(cell.employee_id) ?? emptyMovements();
    current.days_paid += coef;
    const bucket = legend
      ? legendMovementBucket(legend)
      : ("other" as MovementBucket);
    if (bucket === "worked") {
      current.days_worked += 1;
      current.days_presence_qty += coef;
    } else if (bucket === "leave") {
      current.days_leave += 1;
    } else if (bucket === "absence") {
      current.days_absence += 1;
    } else if (bucket === "weekend") {
      current.days_weekend += 1;
    } else if (bucket === "abandon") {
      current.days_abandon += 1;
    } else if (bucket === "rappel") {
      current.days_rappel += 1;
    }
    out.set(cell.employee_id, current);
  }
  return out;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function baseDailyTaux(baseMonthly: number, year: number, month: number) {
  const days = daysInMonth(year, month);
  if (days <= 0 || baseMonthly <= 0) return 0;
  return Math.round((baseMonthly / days + Number.EPSILON) * 100) / 100;
}

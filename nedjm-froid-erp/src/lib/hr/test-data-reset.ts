export const RESET_CONFIRM_WORD = "SUPPRIMER";

export type ResetRpcResult = {
  counts: Record<string, number>;
  files: Record<string, string[]>;
  employee_ids: string[];
};

/** Storage prefixes to purge after the SQL reset: per-employee folders plus the files the rows pointed to. */
export function resetStorageTargets(result: Pick<ResetRpcResult, "files" | "employee_ids">) {
  const folders = result.employee_ids.map((id) => id.replace(/[^a-zA-Z0-9-]/g, "")).filter(Boolean);
  const targets: Record<string, { folders: string[]; files: string[] }> = {
    "hr-docs": { folders, files: [] },
    "hr-photos": { folders: [...folders, "draft"], files: [] },
  };
  for (const [bucket, paths] of Object.entries(result.files)) {
    const entry = (targets[bucket] ??= { folders: [], files: [] });
    for (const path of paths) {
      if (path && !entry.files.includes(path)) entry.files.push(path);
    }
  }
  return targets;
}

const COUNT_LABELS: Record<string, string> = {
  hr_employees: "Employés",
  hr_contracts: "Contrats",
  hr_employee_files: "Documents archivés",
  hr_correspondences: "Ordres de mission / titres de congé",
  hr_attendance: "Présences",
  hr_leave_requests: "Demandes de congé",
  hr_payroll_runs: "Paies (chantier × mois)",
  hr_payroll_slips: "Bulletins de paie",
  hr_salary_assignments: "Affectations de rubriques",
  sys_decisions: "Décisions",
  sys_notifications: "Notifications",
};

export function resetSummary(counts: Record<string, number>) {
  return Object.entries(COUNT_LABELS).map(([key, label]) => ({ key, label, count: counts[key] ?? 0 }));
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { CircleCheck, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import {
  importEmployeeRows,
  readEmployeeImportFile,
  type EmployeeImportResult,
} from "@/lib/actions/hr-employee-import";
import {
  buildImportRows,
  findHeaderRow,
  guessMapping,
  importTargets,
  type ExistingEmployee,
  type ImportRowStatus,
} from "@/lib/hr/employee-import";
import { RhAlert, RhModal, rhInput } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BATCH = 25;
const SHOWN = 300;

const STATUS: Record<ImportRowStatus, { label: string; tone: string }> = {
  new: { label: "À importer", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  exists: { label: "Déjà présent", tone: "bg-slate-500/10 text-foreground/60" },
  duplicate: { label: "Doublon", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  invalid: { label: "Incomplet", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

type Step = "file" | "preview" | "running" | "done";

/** Import of the old staff base: new employees only, each saved with the same checks as the fiche. */
export function EmployeeImportDialog({
  fields,
  catalogs,
  existing,
  onClose,
  onImported,
}: {
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  existing: ExistingEmployee[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<EmployeeImportResult[]>([]);
  const [pending, start] = useTransition();

  const targets = useMemo(() => importTargets(fields), [fields]);
  const width = useMemo(
    () => Math.max(0, ...matrix.slice(headerRow, headerRow + 60).map((r) => r.length)),
    [matrix, headerRow],
  );
  const rows = useMemo(
    () =>
      matrix.length
        ? buildImportRows({ matrix, headerRow, mapping, fields, catalogs, existing })
        : [],
    [matrix, headerRow, mapping, fields, catalogs, existing],
  );
  const counts = useMemo(() => {
    const c: Record<ImportRowStatus, number> = { new: 0, exists: 0, duplicate: 0, invalid: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  function read() {
    if (!file) return;
    setError(null);
    start(async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await readEmployeeImportFile(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const header = findHeaderRow(res.data.matrix, fields);
      setMatrix(res.data.matrix);
      setHeaderRow(header);
      setMapping(guessMapping(res.data.matrix[header] ?? [], fields));
      setStep("preview");
    });
  }

  function changeHeaderRow(index: number) {
    setHeaderRow(index);
    setMapping(guessMapping(matrix[index] ?? [], fields));
  }

  function changeMapping(col: number, code: string) {
    setMapping((prev) => {
      const next = Array.from({ length: Math.max(prev.length, col + 1) }, (_, i) => prev[i] ?? null);
      const value = code || null;
      if (value) {
        for (let i = 0; i < next.length; i += 1) if (next[i] === value) next[i] = null;
      }
      next[col] = value;
      return next;
    });
  }

  function run() {
    const todo = rows.filter((r) => r.status === "new");
    if (!todo.length) return;
    setError(null);
    setStep("running");
    setProgress({ done: 0, total: todo.length });
    start(async () => {
      const all: EmployeeImportResult[] = [];
      for (let i = 0; i < todo.length; i += BATCH) {
        const chunk = todo.slice(i, i + BATCH);
        const res = await importEmployeeRows({
          rows: chunk.map((r) => ({ line: r.line, values: r.values, excelNo: r.excelNo })),
        });
        if (!res.ok) {
          all.push(...chunk.map((r) => ({ line: r.line, ok: false, error: res.error })));
        } else all.push(...res.data);
        setProgress({ done: Math.min(todo.length, i + BATCH), total: todo.length });
      }
      setResults(all);
      setStep("done");
      if (all.some((r) => r.ok)) onImported();
    });
  }

  const created = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const unmatchedRequired = fields.filter(
    (f) => f.is_active && f.is_required && f.code !== "matricule" && f.code !== "status" && !mapping.includes(f.code),
  );

  return (
    <RhModal
      size="xl"
      title="Importer l'ancienne base"
      subtitle="Excel (.xlsx) ou CSV. Les employés déjà présents (même matricule ou NIN) ne sont jamais modifiés."
      onClose={onClose}
      footer={
        step === "file" ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button disabled={!file || pending} onClick={read}>
              <FileSpreadsheet aria-hidden />
              {pending ? "Lecture…" : "Lire le fichier"}
            </Button>
          </>
        ) : step === "preview" ? (
          <>
            <Button variant="secondary" onClick={() => setStep("file")}>
              Retour
            </Button>
            <Button disabled={!counts.new || pending} onClick={run}>
              <Upload aria-hidden />
              Importer {counts.new} employé{counts.new > 1 ? "s" : ""}
            </Button>
          </>
        ) : step === "done" ? (
          <Button onClick={onClose}>Fermer</Button>
        ) : null
      }
    >
      <div className="mx-auto max-w-[110rem] space-y-4 p-2">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}

        {step === "file" ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-16 text-center transition hover:border-brand/60 hover:bg-brand/[0.03]">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted text-brand">
              <FileSpreadsheet className="h-7 w-7" strokeWidth={1.6} aria-hidden />
            </span>
            <span className="text-base font-semibold text-foreground">
              {file ? file.name : "Choisir le fichier de l'ancienne base"}
            </span>
            <span className="max-w-lg text-sm text-foreground/55">
              Une ligne par employé, avec une ligne d&apos;en-tête (Matricule, Nom, Prénom…). Depuis Google Sheets :
              Fichier → Télécharger → Microsoft Excel (.xlsx).
            </span>
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}

        {step === "preview" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(STATUS) as ImportRowStatus[]).map((s) => (
                <span key={s} className={cn("rounded-full px-3 py-1 text-sm font-medium", STATUS[s].tone)}>
                  {STATUS[s].label} : {counts[s]}
                </span>
              ))}
              <label className="ms-auto flex items-center gap-2 text-sm text-foreground/60">
                Ligne d&apos;en-tête
                <select
                  className={cn(rhInput, "mt-0 h-9 w-24")}
                  value={headerRow}
                  onChange={(e) => changeHeaderRow(Number(e.target.value))}
                >
                  {matrix.slice(0, 15).map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {unmatchedRequired.length ? (
              <RhAlert tone="warning">
                Colonnes obligatoires non trouvées : {unmatchedRequired.map((f) => f.label_fr || f.code).join(", ")}.
                Choisissez-les ci-dessous.
              </RhAlert>
            ) : null}

            <section className="rounded-2xl border border-border/70 bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Correspondance des colonnes</h3>
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: width }, (_, col) => {
                  const header = matrix[headerRow]?.[col] || `Colonne ${col + 1}`;
                  const sample = matrix.slice(headerRow + 1).find((r) => r[col]?.trim())?.[col] ?? "";
                  return (
                    <label key={col} className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-foreground" title={header}>
                          {header}
                        </span>
                        <span className="truncate text-foreground/40" title={sample}>
                          {sample}
                        </span>
                      </span>
                      <select
                        className={cn(rhInput, "mt-1 h-9", mapping[col] ? "border-brand/50" : "text-foreground/45")}
                        value={mapping[col] ?? ""}
                        onChange={(e) => changeMapping(col, e.target.value)}
                      >
                        <option value="">— Ignorer —</option>
                        {targets.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border/70 bg-surface">
              <div className="max-h-[50vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-muted text-left text-xs text-foreground/55">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ligne</th>
                      <th className="px-3 py-2 font-medium">Matricule</th>
                      <th className="px-3 py-2 font-medium">Nom</th>
                      <th className="px-3 py-2 font-medium">État</th>
                      <th className="px-3 py-2 font-medium">Remarques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, SHOWN).map((r) => (
                      <tr key={r.line} className="border-t border-border/50 align-top">
                        <td className="px-3 py-2 tabular-nums text-foreground/50">{r.line}</td>
                        <td className="px-3 py-2 tabular-nums">{r.matricule || "auto"}</td>
                        <td className="px-3 py-2 font-medium">{r.name || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS[r.status].tone)}>
                            {STATUS[r.status].label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground/60">
                          {[...r.issues, ...r.warnings].join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > SHOWN ? (
                <p className="border-t border-border/50 px-3 py-2 text-xs text-foreground/50">
                  {SHOWN} premières lignes affichées sur {rows.length}.
                </p>
              ) : null}
            </section>
          </>
        ) : null}

        {step === "running" ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <p className="mb-3 text-sm font-medium text-foreground">
              Import en cours… {progress.done} / {progress.total}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CircleCheck className="h-4 w-4" aria-hidden />
                {created} employé{created > 1 ? "s" : ""} créé{created > 1 ? "s" : ""}
              </span>
              {failed.length ? (
                <span className="inline-flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  <TriangleAlert className="h-4 w-4" aria-hidden />
                  {failed.length} refusé{failed.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            {failed.length ? (
              <ul className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-surface text-sm">
                {failed.map((r) => (
                  <li key={r.line} className="flex gap-3 px-4 py-2.5">
                    <span className="w-16 shrink-0 tabular-nums text-foreground/50">Ligne {r.line}</span>
                    <span className="text-foreground/75">{r.error}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </RhModal>
  );
}

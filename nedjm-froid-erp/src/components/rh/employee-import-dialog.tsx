"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
  type ImportLinkChoice,
  type ImportRowStatus,
} from "@/lib/hr/employee-import";
import { RhAlert, RhModal, rhInput } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BATCH = 25;

const STATUS: Record<ImportRowStatus, { label: string; tone: string }> = {
  new: { label: "À créer", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  exists: { label: "Mise à jour", tone: "bg-sky-500/10 text-sky-800 dark:text-sky-200" },
  duplicate: { label: "Doublon", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  invalid: { label: "Incomplet", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  confirm: { label: "À confirmer", tone: "bg-amber-500/10 text-amber-800 dark:text-amber-200" },
  mismatch: { label: "Matricule", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  conflict: { label: "Conflit", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

const EMPTY_COUNTS: Record<ImportRowStatus, number> = {
  new: 0,
  exists: 0,
  duplicate: 0,
  invalid: 0,
  confirm: 0,
  mismatch: 0,
  conflict: 0,
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
  const [links, setLinks] = useState<Record<number, ImportLinkChoice>>({});
  const [fixes, setFixes] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState<ImportRowStatus | null>(null);
  const [pending, start] = useTransition();
  const reportRef = useRef<HTMLElement>(null);

  const targets = useMemo(() => importTargets(fields), [fields]);
  const width = useMemo(
    () => Math.max(0, ...matrix.slice(headerRow, headerRow + 60).map((r) => r.length)),
    [matrix, headerRow],
  );
  const rows = useMemo(
    () =>
      matrix.length
        ? buildImportRows({ matrix, headerRow, mapping, fields, catalogs, existing, links, fixes })
        : [],
    [matrix, headerRow, mapping, fields, catalogs, existing, links, fixes],
  );
  const counts = useMemo(() => {
    const c = { ...EMPTY_COUNTS };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  const shown = useMemo(
    () => (statusFilter ? rows.filter((row) => row.status === statusFilter) : rows),
    [rows, statusFilter],
  );
  const ready = useMemo(
    () =>
      rows
        .filter((r) => r.status === "new" || (r.status === "exists" && (r.employeeId || r.leadLine)))
        .slice()
        .sort(
          (a, b) =>
            (a.values.hired_at || "9999-99-99").localeCompare(b.values.hired_at || "9999-99-99") ||
            a.line - b.line,
        ),
    [rows],
  );

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
      setLinks({});
      setFixes({});
      setStatusFilter(null);
      setStep("preview");
    });
  }

  function changeHeaderRow(index: number) {
    setHeaderRow(index);
    setMapping(guessMapping(matrix[index] ?? [], fields));
    setLinks({});
    setFixes({});
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
    const todo = ready;
    if (!todo.length) return;
    setError(null);
    setStep("running");
    setProgress({ done: 0, total: todo.length });
    start(async () => {
      const all: EmployeeImportResult[] = [];
      const createdIds = new Map<number, string>();
      let left = todo.slice();
      while (left.length) {
        const batch: typeof left = [];
        const later: typeof left = [];
        for (const row of left) {
          const waiting = Boolean(row.leadLine && !row.employeeId && !createdIds.has(row.leadLine));
          if (waiting || batch.length >= BATCH) later.push(row);
          else batch.push(row);
        }
        if (!batch.length) {
          all.push(
            ...later.map((row) => ({
              line: row.line,
              ok: false,
              error: "La première ligne de cet employé n'a pas été importée.",
            })),
          );
          break;
        }
        const res = await importEmployeeRows({
          rows: batch.map((r) => ({
            line: r.line,
            values: r.values,
            excelNo: r.excelNo,
            employeeId: r.employeeId || (r.leadLine ? createdIds.get(r.leadLine) : undefined),
          })),
        });
        if (!res.ok) {
          all.push(...batch.map((r) => ({ line: r.line, ok: false, error: res.error })));
        } else {
          all.push(...res.data);
          for (const item of res.data) {
            if (item.ok && item.id) createdIds.set(item.line, item.id);
          }
        }
        left = later;
        setProgress({ done: all.length, total: todo.length });
      }
      setResults(all);
      setStep("done");
      if (all.some((r) => r.ok)) onImported();
    });
  }

  const created = results.filter((r) => r.ok).length;
  const notes = results.filter((r) => r.ok && r.note);
  const failed = results.filter((r) => !r.ok);
  const unmatchedRequired = fields.filter(
    (f) => f.is_active && f.is_required && f.code !== "matricule" && f.code !== "status" && !mapping.includes(f.code),
  );

  return (
    <RhModal
      size="xl"
      title="Importer l'ancienne base"
      subtitle="Excel (.xlsx) ou CSV. Même NSS ou NIN : le matricule existant est conservé et la fiche est mise à jour. L'ancienne fiche PDF reste archivée."
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
            <Button disabled={!ready.length || pending} onClick={run}>
              <Upload aria-hidden />
              Importer {ready.length} ligne{ready.length > 1 ? "s" : ""}
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
                <button
                  key={s}
                  type="button"
                  disabled={counts[s] === 0}
                  aria-pressed={statusFilter === s}
                  onClick={() => {
                    setStatusFilter((current) => (current === s ? null : s));
                    reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium disabled:cursor-default disabled:opacity-40",
                    STATUS[s].tone,
                    statusFilter === s && "ring-2 ring-current",
                  )}
                >
                  {STATUS[s].label} : {counts[s]}
                </button>
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

            {counts.mismatch || counts.conflict ? (
              <RhAlert tone="danger">
                Le numéro écrit dans le fichier est importé tel quel. L&apos;application ne
                propose pas un autre matricule. Seuls les doublons de numéro entre deux personnes
                distinctes restent exclus.
              </RhAlert>
            ) : counts.confirm ? (
              <RhAlert tone="warning">
                Des noms se ressemblent. Confirmez chaque ligne : même personne, ou personne différente.
              </RhAlert>
            ) : counts.duplicate ? (
              <RhAlert tone="warning">
                Un même matricule est porté par deux personnes. Ces lignes ne sont pas importées.
              </RhAlert>
            ) : rows.some((r) => r.warnings.some((w) => w.includes("ordre non vérifié"))) ? (
              <RhAlert tone="warning">
                Les matricules présents sont conservés. Les lignes sans date d&apos;embauche n&apos;ont pas été
                réordonnées.
              </RhAlert>
            ) : rows.length ? (
              <RhAlert tone="success">Les matricules du fichier sont corrects.</RhAlert>
            ) : null}

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

            <section ref={reportRef} className="overflow-hidden rounded-2xl border border-border/70 bg-surface">
              <div>
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
                    {shown.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-foreground/50">
                          Aucune ligne dans cet état.
                        </td>
                      </tr>
                    ) : null}
                    {shown.map((r) => (
                      <tr key={r.line} className="border-t border-border/50 align-top">
                        <td className="px-3 py-2 tabular-nums text-foreground/50">{r.line}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.matricule || "auto"}
                          {r.expectedMatricule && r.expectedMatricule !== r.matricule ? (
                            <span className="mt-1 block text-xs text-foreground/55">attendu {r.expectedMatricule}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.name || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS[r.status].tone)}>
                            {STATUS[r.status].label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground/60">
                          <div>{[...r.issues, ...r.warnings].join(" · ") || "—"}</div>
                          {r.status === "confirm" && r.candidate ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Button
                                type="button"
                                className="h-7 px-2 text-xs"
                                onClick={() => setLinks((prev) => ({ ...prev, [r.line]: "same" }))}
                              >
                                Même personne
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-7 px-2 text-xs"
                                onClick={() => setLinks((prev) => ({ ...prev, [r.line]: "other" }))}
                              >
                                Personne différente
                              </Button>
                            </div>
                          ) : null}
                          {(r.status === "mismatch" || r.status === "duplicate") && r.expectedMatricule && r.expectedMatricule !== r.matricule ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="mt-1 h-7 px-2 text-xs"
                              onClick={() => setFixes((prev) => ({ ...prev, [r.line]: r.expectedMatricule }))}
                            >
                              Utiliser {r.expectedMatricule}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border/50 px-3 py-2 text-xs text-foreground/50">
                {statusFilter
                  ? `${STATUS[statusFilter].label} : ${shown.length} ligne${shown.length > 1 ? "s" : ""}.`
                  : `Rapport complet : ${rows.length} ligne${rows.length > 1 ? "s" : ""}.`}
                {statusFilter ? (
                  <button type="button" className="ms-2 underline" onClick={() => setStatusFilter(null)}>
                    Tout le tableau
                  </button>
                ) : null}
              </p>
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
                {created} ligne{created > 1 ? "s" : ""} enregistrée{created > 1 ? "s" : ""}
              </span>
              {failed.length ? (
                <span className="inline-flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  <TriangleAlert className="h-4 w-4" aria-hidden />
                  {failed.length} refusé{failed.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            {notes.length ? (
              <ul className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-surface text-sm">
                {notes.map((r) => (
                  <li key={r.line} className="flex gap-3 px-4 py-2.5">
                    <span className="w-16 shrink-0 tabular-nums text-foreground/50">Ligne {r.line}</span>
                    <span className="text-foreground/75">{r.note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
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

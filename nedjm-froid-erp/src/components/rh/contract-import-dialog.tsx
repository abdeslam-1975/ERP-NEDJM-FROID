"use client";

import { useMemo, useState, useTransition } from "react";
import { CircleCheck, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import {
  importContractRows,
  readContractImportFile,
  type ContractImportResult,
} from "@/lib/actions/hr-contract-import";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrContractRow } from "@/lib/actions/hr-contracts";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import {
  CONTRACT_IMPORT_TARGETS,
  buildContractImportRows,
  findContractHeaderRow,
  guessContractMapping,
  matriculeKey,
  type ContractImportDefaults,
  type ContractImportStatus,
  type ContractImportTarget,
  type ImportSite,
} from "@/lib/hr/contract-import";
import { RhAlert, RhField, RhModal, rhInput } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

const BATCH = 20;
const SHOWN = 400;

const STATUS: Record<ContractImportStatus, { label: string; tone: string }> = {
  ready: { label: "À importer", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  unmatched: { label: "Employé à choisir", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  exists: { label: "Déjà sous contrat", tone: "bg-slate-500/10 text-foreground/60" },
  duplicate: { label: "Doublon", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  invalid: { label: "Incomplet", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

type Step = "file" | "preview" | "running" | "done";

/** Import of existing work contracts from a sheet: new contracts only, each saved like the contract form. */
export function ContractImportDialog({
  employees,
  sites,
  activities,
  catalogs,
  contracts,
  onClose,
  onImported,
}: {
  employees: HrEmployeeRow[];
  sites: readonly ImportSite[];
  activities: readonly { id: string; code: string; label_fr: string }[];
  catalogs: CatalogItem[];
  contracts: HrContractRow[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<(ContractImportTarget | null)[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const contractTypes = useMemo(() => catalogs.filter((c) => c.kind === "contract_type" && c.is_active), [catalogs]);
  const regimes = useMemo(() => catalogs.filter((c) => c.kind === "work_regime" && c.is_active), [catalogs]);
  const [defaults, setDefaults] = useState<ContractImportDefaults>(() => ({
    match_by: "MATRICULE",
    site_id: sites.length === 1 ? sites[0].id : "",
    activity_code_id: activities.length === 1 ? activities[0].id : "",
    contract_type_code: contractTypes.some((t) => t.code === "CDD") ? "CDD" : (contractTypes[0]?.code ?? ""),
    work_regime_code: "",
    status: "ACTIVE",
  }));
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ContractImportResult[]>([]);
  const [pending, start] = useTransition();

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
        keywords: `${e.first_name} ${e.last_name}`,
      })),
    [employees],
  );
  const width = useMemo(
    () => Math.max(0, ...matrix.slice(headerRow, headerRow + 60).map((r) => r.length)),
    [matrix, headerRow],
  );
  const rows = useMemo(
    () =>
      matrix.length
        ? buildContractImportRows({
            matrix,
            headerRow,
            mapping,
            defaults,
            employees,
            sites,
            contractTypes,
            existing: contracts,
            overrides,
          })
        : [],
    [matrix, headerRow, mapping, defaults, employees, sites, contractTypes, contracts, overrides],
  );
  const counts = useMemo(() => {
    const c: Record<ContractImportStatus, number> = { ready: 0, unmatched: 0, exists: 0, duplicate: 0, invalid: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  function setDefault<K extends keyof ContractImportDefaults>(k: K, v: ContractImportDefaults[K]) {
    setDefaults((d) => ({ ...d, [k]: v }));
  }

  function applyMatrix(next: string[][]) {
    const header = findContractHeaderRow(next);
    const guessed = guessContractMapping(next[header] ?? []);
    setMatrix(next);
    setHeaderRow(header);
    setMapping(guessed);
    setOverrides({});
    // MAT is often a plain order number in old sheets: match by matricule only when its values are real matricules.
    const matCol = guessed.indexOf("matricule");
    const known = new Set(employees.map((e) => matriculeKey(e.matricule)));
    const hits = matCol < 0 ? 0 : next.slice(header + 1).filter((r) => known.has(matriculeKey(r[matCol]))).length;
    const hasName = guessed.includes("last_name") || guessed.includes("full_name");
    setDefault("match_by", hasName && hits < Math.max(1, (next.length - header - 1) / 2) ? "NAME" : "MATRICULE");
  }

  function read(sheetName = "") {
    if (!file) return;
    setError(null);
    start(async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("sheet", sheetName);
      const res = await readContractImportFile(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSheets(res.data.sheets);
      setSheet(res.data.sheet);
      applyMatrix(res.data.matrix);
      setStep("preview");
    });
  }

  function changeHeaderRow(index: number) {
    setHeaderRow(index);
    setMapping(guessContractMapping(matrix[index] ?? []));
  }

  function changeMapping(col: number, code: string) {
    setMapping((prev) => {
      const next = Array.from({ length: Math.max(prev.length, col + 1) }, (_, i) => prev[i] ?? null);
      const value = (code || null) as ContractImportTarget | null;
      if (value) for (let i = 0; i < next.length; i += 1) if (next[i] === value) next[i] = null;
      next[col] = value;
      return next;
    });
  }

  function run() {
    const todo = rows.filter((r) => r.status === "ready" && r.payload);
    if (!todo.length) return;
    setError(null);
    setStep("running");
    setProgress({ done: 0, total: todo.length });
    start(async () => {
      const all: ContractImportResult[] = [];
      for (let i = 0; i < todo.length; i += BATCH) {
        const chunk = todo.slice(i, i + BATCH);
        const res = await importContractRows({ rows: chunk.map((r) => ({ line: r.line, payload: r.payload })) });
        if (!res.ok) all.push(...chunk.map((r) => ({ line: r.line, ok: false, error: res.error })));
        else all.push(...res.data);
        setProgress({ done: Math.min(todo.length, i + BATCH), total: todo.length });
      }
      setResults(all);
      setStep("done");
      if (all.some((r) => r.ok)) onImported();
    });
  }

  const created = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const notes = results.filter((r) => r.ok && r.error);
  const noIdentity = matrix.length > 0 && !mapping.some((m) => m === "matricule" || m === "last_name" || m === "full_name");

  return (
    <RhModal
      size="xl"
      title="Importer des contrats de travail"
      subtitle="Excel (.xlsx) ou CSV, une ligne par contrat. Les contrats déjà enregistrés ne sont jamais modifiés."
      onClose={onClose}
      footer={
        step === "file" ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button disabled={!file || pending} onClick={() => read()}>
              <FileSpreadsheet aria-hidden />
              {pending ? "Lecture…" : "Lire le fichier"}
            </Button>
          </>
        ) : step === "preview" ? (
          <>
            <Button variant="secondary" onClick={() => setStep("file")}>
              Retour
            </Button>
            <Button disabled={!counts.ready || pending} onClick={run}>
              <Upload aria-hidden />
              Importer {counts.ready} contrat{counts.ready > 1 ? "s" : ""}
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
            <span className="text-base font-semibold text-foreground">{file ? file.name : "Choisir le fichier des contrats"}</span>
            <span className="max-w-xl text-sm text-foreground/55">
              Colonnes reconnues : Matricule ou Nom / Prénom, Chantier, Poste, Type, Date de début, Date de fin, Salaire de
              base, Salaire net. Ce qui manque est complété par les valeurs par défaut (début = date d&apos;embauche de la
              fiche). Une feuille de pointage convient aussi.
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
              {(Object.keys(STATUS) as ContractImportStatus[]).map((s) => (
                <span key={s} className={cn("rounded-full px-3 py-1 text-sm font-medium", STATUS[s].tone)}>
                  {STATUS[s].label} : {counts[s]}
                </span>
              ))}
              {sheets.length > 1 ? (
                <label className="ms-auto flex items-center gap-2 text-sm text-foreground/60">
                  Feuille
                  <select
                    className={cn(rhInput, "mt-0 h-9 w-48")}
                    value={sheet}
                    disabled={pending}
                    onChange={(e) => read(e.target.value)}
                  >
                    {sheets.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={cn("flex items-center gap-2 text-sm text-foreground/60", sheets.length > 1 ? "" : "ms-auto")}>
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

            {noIdentity ? (
              <RhAlert tone="warning">Aucune colonne Matricule, Nom ou « Nom et prénom » : choisissez-la ci-dessous.</RhAlert>
            ) : null}

            <section className="rounded-2xl border border-border/70 bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Valeurs par défaut (colonne absente ou vide)</h3>
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                <RhField label="Rapprochement des employés">
                  <select
                    className={cn(rhInput, "h-9")}
                    value={defaults.match_by}
                    onChange={(e) => setDefault("match_by", e.target.value as ContractImportDefaults["match_by"])}
                  >
                    <option value="MATRICULE">Par matricule</option>
                    <option value="NAME">Par nom et prénom</option>
                  </select>
                </RhField>
                <RhField label="Chantier">
                  <select className={cn(rhInput, "h-9")} value={defaults.site_id} onChange={(e) => setDefault("site_id", e.target.value)}>
                    <option value="">—</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name_fr}
                      </option>
                    ))}
                  </select>
                </RhField>
                <RhField label="Activité" hint="Si le chantier n'en porte pas.">
                  <select
                    className={cn(rhInput, "h-9")}
                    value={defaults.activity_code_id}
                    onChange={(e) => setDefault("activity_code_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.label_fr}
                      </option>
                    ))}
                  </select>
                </RhField>
                <RhField label="Type de contrat">
                  <select
                    className={cn(rhInput, "h-9")}
                    value={defaults.contract_type_code}
                    onChange={(e) => setDefault("contract_type_code", e.target.value)}
                  >
                    <option value="">—</option>
                    {contractTypes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label_fr}
                      </option>
                    ))}
                  </select>
                </RhField>
                <RhField label="Régime de travail">
                  <select
                    className={cn(rhInput, "h-9")}
                    value={defaults.work_regime_code}
                    onChange={(e) => setDefault("work_regime_code", e.target.value)}
                  >
                    <option value="">—</option>
                    {regimes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label_fr}
                      </option>
                    ))}
                  </select>
                </RhField>
                <RhField label="Statut" hint="Un contrat dont la fin est passée est clôturé.">
                  <select
                    className={cn(rhInput, "h-9")}
                    value={defaults.status}
                    onChange={(e) => setDefault("status", e.target.value as ContractImportDefaults["status"])}
                  >
                    <option value="ACTIVE">Actif</option>
                    <option value="DRAFT">Brouillon</option>
                  </select>
                </RhField>
              </div>
            </section>

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
                        {CONTRACT_IMPORT_TARGETS.map((t) => (
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
                  <thead className="sticky top-0 z-10 bg-surface-muted text-left text-xs text-foreground/55">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ligne</th>
                      <th className="px-3 py-2 font-medium">Dans le fichier</th>
                      <th className="px-3 py-2 font-medium">Employé dans l&apos;application</th>
                      <th className="px-3 py-2 font-medium">Contrat</th>
                      <th className="px-3 py-2 font-medium">État</th>
                      <th className="px-3 py-2 font-medium">Remarques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, SHOWN).map((r) => {
                      const p = r.payload;
                      const site = p ? sites.find((s) => s.id === p.site_id)?.name_fr : null;
                      return (
                        <tr key={r.line} className="border-t border-border/50 align-top">
                          <td className="px-3 py-2 tabular-nums text-foreground/50">{r.line}</td>
                          <td className="px-3 py-2">
                            <span className="font-medium">{r.name || "—"}</span>
                            {r.matricule ? <div className="text-xs tabular-nums text-foreground/50">{r.matricule}</div> : null}
                          </td>
                          <td className="min-w-64 px-3 py-2">
                            <Combobox
                              options={
                                r.candidates.length
                                  ? employeeOptions.filter((o) => r.candidates.includes(o.value))
                                  : employeeOptions
                              }
                              value={r.employee_id ?? ""}
                              onChange={(v) => setOverrides((o) => ({ ...o, [r.line]: v }))}
                              placeholder="Choisir l'employé…"
                              searchPlaceholder="Matricule, nom ou prénom…"
                              emptyText="Aucun employé trouvé"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {p ? (
                              <>
                                {site} · {p.contract_type_code ?? "—"}
                                <div className="text-foreground/55">
                                  {p.start_date.split("-").reverse().join("/")} →{" "}
                                  {p.end_date ? p.end_date.split("-").reverse().join("/") : "…"}
                                  {p.poste_fr ? ` · ${p.poste_fr}` : ""}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS[r.status].tone)}>
                              {STATUS[r.status].label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-foreground/60">{[...r.issues, ...r.warnings].join(" · ") || "—"}</td>
                        </tr>
                      );
                    })}
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
                {created} contrat{created > 1 ? "s" : ""} créé{created > 1 ? "s" : ""}
              </span>
              {failed.length ? (
                <span className="inline-flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  <TriangleAlert className="h-4 w-4" aria-hidden />
                  {failed.length} refusé{failed.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            {failed.length || notes.length ? (
              <ul className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-surface text-sm">
                {[...failed, ...notes].map((r) => (
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

"use client";

import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { importHrWorkerRegister, type WorkerRegisterRow } from "@/lib/actions/hr-worker-register";
import {
  REGISTER_COLUMNS,
  buildRegisterReport,
  buildRegisterWorkbook,
  formatRegisterDate,
  readRegisterWorkbook,
  registerStatusLabel,
  type RegisterColumnKey,
  type WorkerRegisterWrite,
} from "@/lib/hr/worker-register-sheet";
import { printHtml } from "@/components/rh/print-frame";
import { RhAlert, RhModal } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function download(buffer: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function todayStamp() {
  const date = new Date();
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function registerPrintHtml(rows: WorkerRegisterRow[], keys: RegisterColumnKey[]) {
  const columns = REGISTER_COLUMNS.filter((column) => keys.includes(column.key));
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns.map((column) => {
        const value =
          column.key === "lineNo"
            ? String(row.lineNo)
            : column.key === "status"
              ? registerStatusLabel(row.status)
              : column.key === "birthDate" || column.key === "hiredAt" || column.key === "endedAt"
                ? formatRegisterDate(row[column.key])
                : (row[column.key] ?? "");
        return `<td>${escapeHtml(value)}</td>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  return `<h1>Base des travailleurs</h1><p>${rows.length} période${rows.length > 1 ? "s" : ""} · ${todayStamp()}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Download or print the worker register, in full or only the rows currently on screen. */
export function WorkerRegisterExportDialog({
  rows,
  visible,
  filtered,
  onClose,
}: {
  rows: WorkerRegisterRow[];
  visible: WorkerRegisterRow[];
  filtered: boolean;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"all" | "visible">(filtered ? "visible" : "all");
  const [keys, setKeys] = useState<Set<RegisterColumnKey>>(() => new Set(REGISTER_COLUMNS.map((column) => column.key)));
  const [busy, setBusy] = useState<"excel" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = scope === "all" ? rows : visible;
  const selected = REGISTER_COLUMNS.filter((column) => keys.has(column.key)).map((column) => column.key);
  const ready = chosen.length > 0 && selected.length > 0 && !busy;

  function toggle(key: RegisterColumnKey) {
    setKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function excel() {
    setError(null);
    setBusy("excel");
    try {
      download(await buildRegisterWorkbook(chosen, selected), `registre-travailleurs-${todayStamp()}.xlsx`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <RhModal
      title="Télécharger ou imprimer la base"
      subtitle="Toute la base, ou seulement les périodes affichées par le filtre."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={!ready} onClick={() => printHtml(registerPrintHtml(chosen, selected), "hr-register-print")}>
            <Printer aria-hidden />
            Imprimer
          </Button>
          <Button type="button" disabled={!ready} onClick={() => void excel()}>
            <FileDown aria-hidden />
            {busy === "excel" ? "Préparation…" : "Télécharger Excel"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-2">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn("rounded-xl px-3 py-2 text-sm font-medium", scope === "all" ? "bg-brand text-white" : "bg-surface-muted text-foreground/70")}
            onClick={() => setScope("all")}
          >
            Toute la base ({rows.length})
          </button>
          <button
            type="button"
            className={cn("rounded-xl px-3 py-2 text-sm font-medium", scope === "visible" ? "bg-brand text-white" : "bg-surface-muted text-foreground/70")}
            onClick={() => setScope("visible")}
          >
            Selon le filtre ({visible.length})
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {REGISTER_COLUMNS.map((column) => (
            <label key={column.key} className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-3 py-1.5 text-sm">
              <input type="checkbox" checked={keys.has(column.key)} onChange={() => toggle(column.key)} />
              {column.label}
            </label>
          ))}
        </div>
      </div>
    </RhModal>
  );
}

/** Counts and the conflicts that still need a decision in the worker register. */
export function WorkerRegisterReportDialog({
  rows,
  visible,
  filtered,
  onClose,
}: {
  rows: WorkerRegisterRow[];
  visible: WorkerRegisterRow[];
  filtered: boolean;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"all" | "visible">(filtered ? "visible" : "all");
  const source = scope === "all" ? rows : visible;
  const report = useMemo(() => buildRegisterReport(source), [source]);
  return (
    <RhModal
      size="xl"
      title="Rapport de la base"
      subtitle={`${report.periods} période${report.periods > 1 ? "s" : ""} · ${report.matricules} matricule${report.matricules > 1 ? "s" : ""} · ${report.active} active${report.active > 1 ? "s" : ""}`}
      onClose={onClose}
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-4 p-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn("rounded-xl px-3 py-2 text-sm font-medium", scope === "all" ? "bg-brand text-white" : "bg-surface-muted text-foreground/70")}
            onClick={() => setScope("all")}
          >
            Toute la base ({rows.length})
          </button>
          <button
            type="button"
            className={cn("rounded-xl px-3 py-2 text-sm font-medium", scope === "visible" ? "bg-brand text-white" : "bg-surface-muted text-foreground/70")}
            onClick={() => setScope("visible")}
          >
            Selon le filtre ({visible.length})
          </button>
        </div>
        {report.sharedNss.length || report.splitNss.length ? (
          <RhAlert tone="warning">
            {report.sharedNss.length + report.splitNss.length} conflit{report.sharedNss.length + report.splitNss.length > 1 ? "s" : ""} de NSS à revoir.
          </RhAlert>
        ) : (
          <RhAlert tone="success">Aucun NSS n&apos;est partagé par deux matricules.</RhAlert>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 px-4 py-3 text-sm">
            <div className="text-foreground/50">Sans NSS</div>
            <div className="text-lg font-semibold">{report.missingNss}</div>
          </div>
          <div className="rounded-2xl border border-border/70 px-4 py-3 text-sm">
            <div className="text-foreground/50">NSS de moins de 12 chiffres</div>
            <div className="text-lg font-semibold">{report.shortNss.length}</div>
          </div>
          <div className="rounded-2xl border border-border/70 px-4 py-3 text-sm">
            <div className="text-foreground/50">Inactifs sans date de sortie</div>
            <div className="text-lg font-semibold">{report.noExit}</div>
          </div>
        </div>
        <div className="max-h-64 overflow-auto rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-foreground/50">
              <tr>
                <th className="px-3 py-2 font-medium">Année d&apos;entrée</th>
                <th className="px-3 py-2 font-medium">Périodes</th>
                <th className="px-3 py-2 font-medium">Actives</th>
              </tr>
            </thead>
            <tbody>
              {report.years.map((year) => (
                <tr key={year.year} className="border-t border-border/50">
                  <td className="px-3 py-2 tabular-nums">{year.year}</td>
                  <td className="px-3 py-2 tabular-nums">{year.periods}</td>
                  <td className="px-3 py-2 tabular-nums">{year.active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.activeWithExit.length ? (
          <RhAlert tone="warning">
            {report.activeWithExit.length} période{report.activeWithExit.length > 1 ? "s" : ""} active{report.activeWithExit.length > 1 ? "s" : ""} avec une date de sortie
            {" : "}
            {report.activeWithExit.map((row) => `${row.name} (${row.matricule})`).join(", ")}.
          </RhAlert>
        ) : null}
        {report.sharedNss.map((item) => (
          <RhAlert key={item.nss} tone="warning">
            NSS {item.nss} est porté par {item.people.join(" et ")}.
          </RhAlert>
        ))}
        {report.splitNss.map((item) => (
          <RhAlert key={item.matricule} tone="warning">
            {item.name} ({item.matricule}) a plusieurs NSS : {item.values.join(", ")}.
          </RhAlert>
        ))}
      </div>
    </RhModal>
  );
}

/** Upload a new worker database. The file replaces every period currently stored. */
export function WorkerRegisterImportDialog({
  currentCount,
  onClose,
  onImported,
}: {
  currentCount: number;
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<WorkerRegisterWrite[]>([]);
  const [issues, setIssues] = useState<{ line: number; message: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      const parsed = await readRegisterWorkbook(await file.arrayBuffer());
      setRows(parsed.rows);
      setIssues(parsed.issues);
    } catch (cause) {
      setRows([]);
      setIssues([]);
      setError(cause instanceof Error ? cause.message : "Fichier illisible.");
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    const result = await importHrWorkerRegister(rows);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onImported(`La base a été remplacée : ${result.data.inserted} période${result.data.inserted > 1 ? "s" : ""}.`);
  }

  return (
    <RhModal
      title="Importer une nouvelle base"
      subtitle="Le fichier Excel devient la base. Les périodes actuelles sont remplacées."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" disabled={!rows.length || busy} onClick={() => void commit()}>
            <FileSpreadsheet aria-hidden />
            {busy ? "Remplacement…" : `Remplacer par ${rows.length} période${rows.length > 1 ? "s" : ""}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-2">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-foreground/70">
          <FileSpreadsheet className="h-6 w-6 text-brand" aria-hidden />
          {fileName || "Choisir un fichier Excel"}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void read(file);
            }}
          />
        </label>
        {fileName ? (
          <RhAlert tone="warning">
            {rows.length} période{rows.length > 1 ? "s" : ""} lisible{rows.length > 1 ? "s" : ""}
            {issues.length ? `, ${issues.length} ligne${issues.length > 1 ? "s" : ""} ignorée${issues.length > 1 ? "s" : ""}` : ""}.
            {rows.length ? ` Elles remplaceront les ${currentCount} périodes actuelles.` : ""}
          </RhAlert>
        ) : null}
        {issues.length ? (
          <ul className="max-h-48 space-y-1 overflow-auto text-sm text-foreground/70">
            {issues.slice(0, 30).map((issue) => (
              <li key={`${issue.line}-${issue.message}`}>Ligne {issue.line} — {issue.message}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </RhModal>
  );
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FileDown, Printer, Search } from "lucide-react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeFiche, HrEmployeeField } from "@/lib/actions/hr-employees";
import { buildEmployeeExport, employeeExportHtml, exportColumns } from "@/lib/hr/employee-export";
import { buildEmployeeWorkbook } from "@/lib/hr/employee-export-file";
import { printHtml } from "@/components/rh/print-frame";
import { RhModal, rhInput } from "@/components/rh/rh-ui";
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
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Download or print the employee base: the whole table, or the employees and columns the user ticks. */
export function EmployeeExportDialog({
  rows,
  fields,
  catalogs,
  onClose,
}: {
  rows: HrEmployeeFiche[];
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  onClose: () => void;
}) {
  const columns = useMemo(() => exportColumns(fields), [fields]);
  const [scope, setScope] = useState<"all" | "part">("all");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [columnMode, setColumnMode] = useState<"all" | "pick">("all");
  const [pickedColumns, setPickedColumns] = useState<Set<string>>(() => new Set(columns.map((c) => c.code)));
  const [busy, setBusy] = useState<"excel" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeOnly && r.status !== "ACTIVE") return false;
      if (!q) return true;
      return `${r.matricule} ${r.last_name} ${r.first_name} ${r.last_name_ar ?? ""} ${r.first_name_ar ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, activeOnly]);

  const chosenRows = scope === "all" ? rows : rows.filter((r) => picked.has(r.id));
  const chosenCodes = columnMode === "all" ? undefined : pickedColumns;
  const columnCount = columnMode === "all" ? columns.length : columns.filter((c) => pickedColumns.has(c.code)).length;
  const ready = chosenRows.length > 0 && columnCount > 0 && !busy;

  function togglePerson(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColumn(code: string) {
    setPickedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function table() {
    return buildEmployeeExport(rows, fields, catalogs, {
      employeeIds: scope === "part" ? picked : undefined,
      fieldCodes: chosenCodes,
    });
  }

  async function excel() {
    setError(null);
    setBusy("excel");
    try {
      const grid = table();
      download(await buildEmployeeWorkbook(grid), `base-employes-${todayStamp()}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setBusy(null);
    }
  }

  function print() {
    setError(null);
    const grid = table();
    const subtitle = `${grid.rows.length} employé${grid.rows.length > 1 ? "s" : ""} · ${grid.columns.length} colonne${grid.columns.length > 1 ? "s" : ""} · ${todayStamp()}`;
    printHtml(employeeExportHtml(grid, { title: "Base employés", subtitle }), "hr-base-print");
  }

  return (
    <RhModal
      title="Télécharger ou imprimer la base"
      subtitle="Toute la base, ou seulement les employés et les colonnes que vous cochez. Le fichier Excel reprend exactement ce tableau."
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground/60">
            {chosenRows.length} employé{chosenRows.length > 1 ? "s" : ""} · {columnCount} colonne{columnCount > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!ready} onClick={print}>
              <Printer aria-hidden />
              Imprimer
            </Button>
            <Button disabled={!ready} onClick={() => void excel()}>
              <FileDown aria-hidden />
              {busy === "excel" ? "Préparation…" : "Télécharger Excel"}
            </Button>
          </div>
        </div>
      }
    >
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Employés</legend>
        <div className="flex flex-wrap gap-2">
          <Choice on={scope === "all"} onClick={() => setScope("all")}>
            Toute la base ({rows.length})
          </Choice>
          <Choice on={scope === "part"} onClick={() => setScope("part")}>
            Une partie
          </Choice>
        </div>
        {scope === "part" ? (
          <div className="rounded-2xl border border-border/80 bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/40" aria-hidden />
                <input
                  type="search"
                  aria-label="Filtrer les employés"
                  placeholder="Nom ou matricule…"
                  className={cn(rhInput, "mt-0 pl-9")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button type="button" variant={activeOnly ? "primary" : "secondary"} onClick={() => setActiveOnly((v) => !v)}>
                Actifs seulement
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPicked((prev) => new Set([...prev, ...people.map((r) => r.id)]))}
              >
                Cocher ces {people.length}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPicked(new Set())}>
                Tout décocher
              </Button>
            </div>
            <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto">
              {people.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-brand/5">
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => togglePerson(r.id)} />
                    <span className="font-medium tabular-nums text-foreground/55">{r.matricule}</span>
                    <span>
                      {r.last_name} {r.first_name}
                    </span>
                  </label>
                </li>
              ))}
              {people.length === 0 ? <li className="px-2 py-3 text-sm text-foreground/50">Aucun employé.</li> : null}
            </ul>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-semibold">Colonnes</legend>
        <div className="flex flex-wrap gap-2">
          <Choice on={columnMode === "all"} onClick={() => setColumnMode("all")}>
            Toutes les colonnes ({columns.length})
          </Choice>
          <Choice on={columnMode === "pick"} onClick={() => setColumnMode("pick")}>
            Choisir les colonnes
          </Choice>
        </div>
        {columnMode === "pick" ? (
          <div className="max-h-48 overflow-y-auto rounded-2xl border border-border/80 bg-surface p-3">
            <div className="mb-2 flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setPickedColumns(new Set(columns.map((c) => c.code)))}>
                Tout cocher
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPickedColumns(new Set())}>
                Tout décocher
              </Button>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {columns.map((c) => (
                <li key={c.code}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-brand/5">
                    <input type="checkbox" checked={pickedColumns.has(c.code)} onChange={() => toggleColumn(c.code)} />
                    <span>{c.labelFr}</span>
                    {c.labelAr ? (
                      <span className="text-foreground/45" dir="rtl">
                        {c.labelAr}
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </fieldset>
    </RhModal>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium",
        on ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-foreground/70 hover:border-brand/40",
      )}
    >
      {children}
    </button>
  );
}

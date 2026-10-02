"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Power,
  Search,
  SearchX,
  Table2,
} from "lucide-react";
import type { HrEmployeeFiche } from "@/lib/actions/hr-employees";
import { Avatar, Segmented } from "@/components/rh/rh-hub";
import { RH_CARD } from "@/components/rh/rh-ui";
import { cn } from "@/lib/utils";

export type EmployeeView = "list" | "cards" | "table";

export type EmployeeAssignment = {
  employee_id: string;
  contract_type: string | null;
  site: string | null;
  poste: string | null;
};

const STATUS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Actif", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
  INVITED: { label: "Invité", className: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" },
  SUSPENDED: { label: "Suspendu", className: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
  INACTIVE: { label: "Inactif", className: "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300" },
  DISABLED: { label: "Désactivé", className: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" },
};

const PAGE_SIZE = 12;

function StatusPill({ status }: { status: string }) {
  const meta = STATUS[status] ?? { label: status, className: "bg-surface-muted text-foreground/70" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", meta.className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition",
        on
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface text-foreground/65 hover:border-brand/35 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function EmployeeViewSwitch({ value, onChange }: { value: EmployeeView; onChange: (v: EmployeeView) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "list", label: <List className="h-4 w-4" aria-hidden />, title: "Liste" },
        { value: "cards", label: <LayoutGrid className="h-4 w-4" aria-hidden />, title: "Cartes" },
        { value: "table", label: <Table2 className="h-4 w-4" aria-hidden />, title: "Tableau complet (toutes les colonnes)" },
      ]}
    />
  );
}

export function EmployeesList({
  rows,
  assignments,
  fallback,
  initialQuery,
  view,
  onViewChange,
  pending,
  onOpen,
  onEdit,
  onDossier,
  onToggle,
}: {
  rows: HrEmployeeFiche[];
  assignments: EmployeeAssignment[];
  /** Site and job title from the employee file, when no open contract gives them. */
  fallback: (row: HrEmployeeFiche, code: "fiche_affectation" | "fiche_poste") => string;
  initialQuery: string;
  view: Exclude<EmployeeView, "table">;
  onViewChange: (v: EmployeeView) => void;
  pending: boolean;
  /** Shows the printable card. */
  onOpen: (row: HrEmployeeFiche) => void;
  onEdit: (row: HrEmployeeFiche) => void;
  onDossier: (row: HrEmployeeFiche) => void;
  onToggle: (row: HrEmployeeFiche) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [site, setSite] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const people = useMemo(() => {
    const byEmployee = new Map(assignments.map((a) => [a.employee_id, a]));
    return rows.map((row) => {
      const a = byEmployee.get(row.id);
      return {
        row,
        name: `${row.last_name} ${row.first_name}`.trim(),
        poste: a?.poste || fallback(row, "fiche_poste") || "",
        site: a?.site || fallback(row, "fiche_affectation") || "",
        contract: a?.contract_type ?? "",
      };
    });
  }, [rows, assignments, fallback]);

  const sites = useMemo(() => [...new Set(people.map((p) => p.site).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [people]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))], [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        (!site || p.site === site) &&
        (!status || p.row.status === status) &&
        (!q || `${p.name} ${p.row.first_name} ${p.row.last_name} ${p.row.matricule} ${p.poste} ${p.row.nss ?? ""}`.toLowerCase().includes(q)),
    );
  }, [people, query, site, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  function reset() {
    setQuery("");
    setSite(null);
    setStatus(null);
    setPage(0);
  }

  const actions = (row: HrEmployeeFiche) => (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title="Modifier la fiche"
        aria-label="Modifier la fiche"
        disabled={pending}
        onClick={() => onEdit(row)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-brand/[0.08] hover:text-brand disabled:opacity-50"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        title="Dossier administratif"
        aria-label="Dossier administratif"
        disabled={pending}
        onClick={() => onDossier(row)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-brand/[0.08] hover:text-brand disabled:opacity-50"
      >
        <FolderOpen className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        title={row.status === "ACTIVE" ? "Désactiver" : "Activer"}
        aria-label={row.status === "ACTIVE" ? "Désactiver" : "Activer"}
        disabled={pending}
        onClick={() => onToggle(row)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-brand/[0.08] hover:text-brand disabled:opacity-50"
      >
        <Power className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-foreground/40" aria-hidden />
          <input
            type="search"
            aria-label="Rechercher un employé"
            placeholder="Nom, matricule ou poste…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="h-[42px] w-full rounded-xl border border-border/80 bg-surface pr-3.5 pl-10 text-sm text-foreground outline-none transition placeholder:text-foreground/40 focus:border-brand focus:ring-4 focus:ring-brand/10"
          />
        </div>
        <div className="ml-auto">
          <EmployeeViewSwitch value={view} onChange={onViewChange} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip
          on={site === null}
          onClick={() => {
            setSite(null);
            setPage(0);
          }}
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Tous les chantiers
        </Chip>
        {sites.map((s) => (
          <Chip
            key={s}
            on={site === s}
            onClick={() => {
              setSite(s);
              setPage(0);
            }}
          >
            {s}
          </Chip>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <Chip
          on={status === null}
          onClick={() => {
            setStatus(null);
            setPage(0);
          }}
        >
          Tous statuts
        </Chip>
        {statuses.map((s) => (
          <Chip
            key={s}
            on={status === s}
            onClick={() => {
              setStatus(s);
              setPage(0);
            }}
          >
            {STATUS[s]?.label ?? s}
          </Chip>
        ))}
      </div>

      {!filtered.length ? (
        <div className={cn(RH_CARD, "flex flex-col items-center p-12 text-center")}>
          <span className="flex h-12 w-12 items-center justify-center rounded-[0.8rem] bg-brand-muted text-brand">
            <SearchX className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-4 font-medium text-foreground">Aucun employé trouvé</p>
          <button type="button" onClick={reset} className="mt-3 text-sm font-medium text-brand hover:underline">
            Réinitialiser les filtres
          </button>
        </div>
      ) : view === "list" ? (
        <div className={cn(RH_CARD, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-foreground/50">
                  <th className="px-6 py-4 font-medium">Employé</th>
                  <th className="px-3 py-4 font-medium">Matricule</th>
                  <th className="px-3 py-4 font-medium">Chantier</th>
                  <th className="px-3 py-4 font-medium">Contrat</th>
                  <th className="px-3 py-4 font-medium">Date d’entrée</th>
                  <th className="px-3 py-4 font-medium">Statut</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr
                    key={p.row.id}
                    onClick={() => onOpen(p.row)}
                    className="group cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-brand/[0.04]"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} photo={p.row.photo_url} size={38} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{p.name}</div>
                          {p.poste ? <div className="truncate text-xs text-foreground/50">{p.poste}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 tabular-nums text-foreground/55">{p.row.matricule}</td>
                    <td className="px-3 py-3.5">
                      {p.site ? (
                        <span className="inline-flex items-center gap-1.5 text-foreground/55">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {p.site}
                        </span>
                      ) : (
                        <span className="text-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-foreground/55">{p.contract || <span className="text-foreground/30">—</span>}</td>
                    <td className="px-3 py-3.5 tabular-nums text-foreground/55">
                      {p.row.hired_at ? new Date(p.row.hired_at).toLocaleDateString("fr-FR") : <span className="text-foreground/30">—</span>}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusPill status={p.row.status} />
                    </td>
                    <td className="pr-5">
                      <div className="flex items-center justify-end gap-1">
                        <div className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">{actions(p.row)}</div>
                        <ChevronRight className="h-4 w-4 text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={filtered.length} all={rows.length} page={current} pages={pages} onPage={setPage} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((p) => (
              <div
                key={p.row.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p.row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(p.row);
                }}
                className={cn(RH_CARD, "ui-lift group cursor-pointer p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/50")}
              >
                <div className="flex items-start justify-between">
                  <Avatar name={p.name} photo={p.row.photo_url} size={52} />
                  <StatusPill status={p.row.status} />
                </div>
                <div className="mt-4 truncate font-semibold text-foreground">{p.name}</div>
                <div className="truncate text-sm text-foreground/50">{p.poste || p.contract || "—"}</div>
                <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-4 text-xs text-foreground/50">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{p.site || "—"}</span>
                  </span>
                  <span className="tabular-nums">{p.row.matricule}</span>
                </div>
              </div>
            ))}
          </div>
          {pages > 1 ? (
            <div className={cn(RH_CARD, "overflow-hidden")}>
              <Pager total={filtered.length} all={rows.length} page={current} pages={pages} onPage={setPage} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Pager({
  total,
  all,
  page,
  pages,
  onPage,
}: {
  total: number;
  all: number;
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between border-t border-border/70 px-6 py-3.5 text-sm text-foreground/50">
      <span>
        {pages > 1 ? `${from}–${to} sur ${total}` : `${total} sur ${all}`}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label="Page précédente"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-brand/[0.08] hover:text-brand disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Page suivante"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-brand/[0.08] hover:text-brand disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileText, Plus, Printer } from "lucide-react";
import { getPayslipBulletinHtml, type PayslipRegisterRow } from "@/lib/actions/hr-bulletin-register";
import { requestPayrollCalculation } from "@/lib/actions/hr-ops";
import { runStatusLabel } from "@/lib/hr/payroll-run-status";
import { bulletinArchiveKey } from "@/lib/hr/bulletin-archive-key";
import { printHtml } from "@/components/rh/print-frame";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhModal, RhPageHeader, RhTableWrap, bi, rhInput } from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };

const PAGE = 50;

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(n);
}

function periodLabel(year: number, month: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function statusTone(status: string) {
  return status === "LOCKED" ? "danger" : status === "VALIDATED" ? "success" : "neutral";
}

/** Payslips already produced, with « Nouveau bulletin » (the generation still goes through a decision). */
export function BulletinsRegisterView({
  rows,
  sites,
  archives,
  loadError,
}: {
  rows: PayslipRegisterRow[];
  sites: readonly SiteOpt[];
  /** Archived bulletin PDFs, by `bulletinArchiveKey`. */
  archives: Record<string, string>;
  loadError?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [viewing, setViewing] = useState<{ row: PayslipRegisterRow; html: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();

  const periods = useMemo(
    () => [...new Set(rows.map((r) => `${r.period_year}-${String(r.period_month).padStart(2, "0")}`))],
    [rows],
  );
  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (period && `${r.period_year}-${String(r.period_month).padStart(2, "0")}` !== period) return false;
      const hay = `${r.matricule} ${r.employee_name} ${r.site_name}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, query, period]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE, safePage * PAGE + PAGE);

  function withHtml(row: PayslipRegisterRow, then: (html: string) => void) {
    setError(null);
    start(async () => {
      const r = await getPayslipBulletinHtml({ slip_id: row.id, year: row.period_year, month: row.period_month });
      if (r.ok) then(r.data.html);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Bulletins de paie"
        description="Bulletins déjà établis, tous mois confondus. Un nouveau bulletin est calculé pour un chantier et un mois après décision au Centre de décisions."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Nouveau bulletin de paie
          </Button>
        }
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className={`${rhInput} mt-0 max-w-md`}
          placeholder="Rechercher (matricule, nom, chantier)…"
          aria-label="Rechercher un bulletin"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          className={`${rhInput} mt-0 w-auto`}
          aria-label="Période"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Toutes les périodes</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {periodLabel(Number(p.slice(0, 4)), Number(p.slice(5)))}
            </option>
          ))}
        </select>
        <span className="text-xs text-foreground/60">
          {visible.length} bulletin{visible.length > 1 ? "s" : ""}
        </span>
      </div>

      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80 text-xs text-foreground/60">
            <tr>
              <th className="px-3.5 py-3 text-left">Période</th>
              <th className="px-3.5 py-3 text-left">Employé</th>
              <th className="px-3.5 py-3 text-left">Chantier</th>
              <th className="px-3.5 py-3 text-right">Jours</th>
              <th className="px-3.5 py-3 text-right">Net à payer</th>
              <th className="px-3.5 py-3 text-left">Statut</th>
              <th className="px-3.5 py-3" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3.5 py-6 text-center text-foreground/55">
                  {rows.length ? "Aucun bulletin ne correspond à la recherche." : "Aucun bulletin établi pour le moment."}
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const archive = archives[bulletinArchiveKey(r.employee_id, r.period_year, r.period_month)];
                return (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs">
                      {periodLabel(r.period_year, r.period_month)}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="font-mono text-xs">{r.matricule}</span> {r.employee_name}
                    </td>
                    <td className="px-3.5 py-3">{r.site_name || "—"}</td>
                    <td className="px-3.5 py-3 text-right">{r.days_paid}</td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right">{money(r.net_payable)} DA</td>
                    <td className="px-3.5 py-3">
                      <RhChip tone={statusTone(r.status_code)}>{runStatusLabel(r.status_code).fr}</RhChip>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() => withHtml(r, (html) => setViewing({ row: r, html }))}
                        >
                          <Eye aria-hidden />
                          Afficher
                        </Button>
                        <Button variant="ghost" disabled={pending} onClick={() => withHtml(r, printHtml)}>
                          <Printer aria-hidden />
                          Imprimer
                        </Button>
                        {r.status_code !== "DRAFT" && archive ? (
                          <Button variant="ghost" onClick={() => window.open(archive, "_blank", "noopener,noreferrer")}>
                            <FileText aria-hidden />
                            PDF archivé
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </RhTableWrap>
      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant="secondary" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Précédent
          </Button>
          <span className="text-foreground/70">
            {safePage * PAGE + 1}–{Math.min(visible.length, (safePage + 1) * PAGE)} / {visible.length}
          </span>
          <Button variant="secondary" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
            Suivant
          </Button>
        </div>
      ) : null}

      {viewing ? (
        <RhModal
          size="lg"
          title={`Bulletin de paie ${periodLabel(viewing.row.period_year, viewing.row.period_month)}`}
          subtitle={`${viewing.row.matricule} · ${viewing.row.employee_name}`}
          onClose={() => setViewing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setViewing(null)}>
                Fermer
              </Button>
              <Button onClick={() => printHtml(viewing.html)}>
                <Printer aria-hidden />
                Imprimer
              </Button>
            </>
          }
        >
          <div className="h-[calc(100dvh-12rem)] min-h-[24rem] overflow-hidden rounded-xl bg-surface-muted/70 p-3">
            <iframe
              title="Bulletin de paie"
              srcDoc={viewing.html}
              className="h-full w-full rounded-lg bg-white shadow-md ring-1 ring-black/5"
            />
          </div>
        </RhModal>
      ) : null}

      {creating ? (
        <NewBulletinDialog
          sites={sites}
          onClose={() => setCreating(false)}
          onRequested={(decisionId) => router.push(`/decisions/${decisionId}`)}
        />
      ) : null}
    </div>
  );
}

function NewBulletinDialog({
  sites,
  onClose,
  onRequested,
}: {
  sites: readonly SiteOpt[];
  onClose: () => void;
  onRequested: (decisionId: string) => void;
}) {
  const now = new Date();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valid = Boolean(siteId) && month >= 1 && month <= 12 && year >= 2000 && year <= 2100;

  function submit() {
    setError(null);
    start(async () => {
      const r = await requestPayrollCalculation({ period_year: year, period_month: month, site_id: siteId });
      if (r.ok) onRequested(r.data.decision_id);
      else setError(r.error);
    });
  }

  return (
    <RhModal
      title="Nouveau bulletin de paie"
      subtitle="Les bulletins d'un chantier pour un mois sont calculés après décision au Centre de décisions."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={pending || !valid} onClick={submit}>
            Demander la génération
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        <RhField label="Chantier">
          <select className={rhInput} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_fr}
              </option>
            ))}
          </select>
        </RhField>
        <div className="grid gap-3 sm:grid-cols-2">
          <RhField label="Mois">
            <select className={rhInput} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </RhField>
          <RhField label="Année">
            <input
              className={rhInput}
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </RhField>
        </div>
        <p className="text-xs text-foreground/60">
          {bi(
            "Si la paie de ce mois existe déjà en brouillon, la demande devient un recalcul. Une paie validée ou clôturée ne peut plus être recalculée.",
          )}
        </p>
      </div>
    </RhModal>
  );
}

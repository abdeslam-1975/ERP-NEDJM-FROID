import Link from "next/link";
import type { ReactNode } from "react";
import { RhChip } from "@/components/rh/rh-ui";
import {
  INDICATORS_NOTICE,
  NO_TRACE_NOTICE,
  declarationExportPeriod,
  declarationKindLabel,
  documentIndicatorText,
  externalIndicators,
  externalKindLabel,
  externalPeriodLabel,
  externalSourceLabel,
  externalStatusLabel,
  externalSubtypeLabel,
  monthsLabel,
  type DeclarationExport,
  type ExternalOperation,
  type IndicatorTone,
} from "@/lib/hr/external-operations";

const CHIP_TONE: Record<IndicatorTone, "neutral" | "brand" | "success" | "warning"> = {
  neutral: "neutral",
  info: "brand",
  success: "success",
  warning: "warning",
};

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" });
}

function frDay(iso: string | null) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

function money(n: number) {
  return n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Read-only view of external entries with their three independent indicators. */
export function ExternalOperationsList({
  operations,
  emptyLabel,
  actions,
}: {
  operations: ExternalOperation[];
  emptyLabel?: string;
  actions?: (op: ExternalOperation) => ReactNode;
}) {
  if (!operations.length) {
    return (
      <p className="text-sm text-foreground/60">
        {emptyLabel ?? "Aucune opération externe enregistrée."} {NO_TRACE_NOTICE}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {operations.map((op) => (
          <li
            key={op.id}
            className={`rounded-xl border px-3 py-2.5 text-sm ${
              op.status === "ACTIVE" ? "border-border/70" : "border-dashed border-border/70 opacity-80"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {externalKindLabel(op.kind)} · {externalSubtypeLabel(op.subtype)}
              </span>
              <span className="text-foreground/70">{externalPeriodLabel(op)}</span>
              <span className="text-foreground/60">{op.sites ? op.sites.join(", ") : "Tous les chantiers"}</span>
              <span className="text-foreground/60">
                {op.employee_count ? `${op.employee_count} salarié(s)` : "Tous les salariés"}
              </span>
              {op.version_no > 1 ? <RhChip>Version {op.version_no}</RhChip> : null}
              {op.status !== "ACTIVE" ? (
                <RhChip tone="neutral">{externalStatusLabel(op.status)} · compte toujours pour le blocage</RhChip>
              ) : null}
            </div>
            <p className="mt-1 text-foreground/80">{op.description}</p>
            <p className="mt-1 text-xs text-foreground/60">
              {[
                op.operation_date ? `Date : ${frDay(op.operation_date)}` : null,
                op.reference ? `Référence : ${op.reference}` : null,
                op.organism ? `Organisme : ${op.organism}` : null,
                op.total_amount !== null ? `Montant : ${money(op.total_amount)} DA` : null,
                `Origine : ${externalSourceLabel(op.source)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {op.status === "WITHDRAWN" && op.withdrawn_reason ? (
              <p className="mt-1 text-xs text-foreground/60">
                Retirée le {dateTime(op.withdrawn_at)} : {op.withdrawn_reason}
              </p>
            ) : null}
            <ul className="mt-2 space-y-1">
              {externalIndicators(op).map((ind) => (
                <li key={ind.key} className="flex flex-wrap items-start gap-2 text-xs">
                  <RhChip tone={CHIP_TONE[ind.tone]}>{ind.label}</RhChip>
                  <span className="text-foreground/70">{ind.text}</span>
                </li>
              ))}
            </ul>
            {op.documents.length ? (
              <ul className="mt-2 space-y-0.5 text-xs text-foreground/70">
                {op.documents.map((doc) => (
                  <li key={doc.id} className={doc.is_current ? "" : "line-through opacity-70"}>
                    {doc.file_name} · sha256 {doc.sha256.slice(0, 12)}… · {documentIndicatorText(doc)}
                    {doc.examination_note ? ` (« ${doc.examination_note} »)` : ""}
                    {doc.is_current ? "" : " · remplacée"}
                  </li>
                ))}
              </ul>
            ) : null}
            {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions(op)}</div> : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground/55">{INDICATORS_NOTICE}</p>
    </div>
  );
}

export function DeclarationExportsTable({
  exports,
  emptyLabel,
}: {
  exports: DeclarationExport[];
  emptyLabel?: string;
}) {
  if (!exports.length) {
    return (
      <p className="text-sm text-foreground/60">
        {emptyLabel ?? "Aucun export de déclaration enregistré."} {NO_TRACE_NOTICE}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-foreground/55">
          <tr>
            <th className="py-1 pr-4">Type</th>
            <th className="py-1 pr-4">Période</th>
            <th className="py-1 pr-4">Chantier</th>
            <th className="py-1 pr-4">Nature</th>
            <th className="py-1 pr-4">Mois inclus</th>
            <th className="py-1 pr-4">Fichier</th>
            <th className="py-1">Produit</th>
          </tr>
        </thead>
        <tbody>
          {exports.map((e) => (
            <tr key={e.id} className="border-t border-border/60 align-top">
              <td className="py-1 pr-4">{declarationKindLabel(e.kind)}</td>
              <td className="py-1 pr-4">{declarationExportPeriod(e)}</td>
              <td className="py-1 pr-4">{e.site_name}</td>
              <td className="py-1 pr-4">
                <div className="flex flex-wrap gap-1">
                  {e.nature === "CONTROL" ? <RhChip>État de contrôle</RhChip> : <RhChip tone="brand">Officiel</RhChip>}
                  {e.double_declaration_risk ? <RhChip tone="danger">Risque de double déclaration</RhChip> : null}
                  {e.payroll_status === "PROVISIONAL" ? <RhChip tone="warning">Paie non validée</RhChip> : null}
                </div>
              </td>
              <td className="py-1 pr-4">
                {monthsLabel(e.period_year, e.months)}
                {e.excluded_months.length ? (
                  <span className="block text-xs text-foreground/55">
                    Exclus : {monthsLabel(e.period_year, e.excluded_months)}
                  </span>
                ) : null}
              </td>
              <td className="py-1 pr-4">
                {e.file_name}
                <span className="block font-mono text-[11px] text-foreground/50">sha256 {e.sha256.slice(0, 16)}…</span>
              </td>
              <td className="py-1">
                {dateTime(e.created_at)}
                {e.created_by ? ` · ${e.created_by}` : ""}
                {e.decision_id ? (
                  <Link href={`/decisions/${e.decision_id}`} className="block text-xs font-semibold text-brand hover:underline">
                    Décision D10
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

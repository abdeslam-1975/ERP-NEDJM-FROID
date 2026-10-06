"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert } from "@/components/rh/rh-ui";
import { PROPOSALS_PATH, QuickDialog, VerifiedChip } from "@/components/rules/rule-ui";
import {
  unverifiedRules,
  type PayrollSlipTrace,
  type RuleTraceFamily,
  type SlipRuleRef,
} from "@/lib/hr/legal-vars-as-of";

const FAMILY_LABEL: Record<RuleTraceFamily, string> = {
  LEGAL_VAR: "Variable légale",
  CNAS_RATES: "Taux CNAS du régime",
  IRG_BAREME: "Barème IRG",
  IRG_RULES: "Règles IRG",
  IRG_ZONE_SCOPE: "Périmètre de zone IRG (D16)",
};

const shortId = (id: string) => id.slice(0, 8);

function DecisionLink({ id }: { id: string | null }) {
  if (!id) return <span className="text-foreground/45">—</span>;
  return (
    <Link href={`/decisions/${id}`} className="font-mono text-xs text-brand hover:underline">
      {shortId(id)}
    </Link>
  );
}

const col = dataColumns<SlipRuleRef>();

const ruleColumns = [
  col.accessor("key", {
    header: "Règle",
    cell: ({ row }) => (
      <>
        <span className="block text-xs text-foreground/55">{FAMILY_LABEL[row.original.family]}</span>
        <span className="font-mono text-xs">{row.original.key}</span>
      </>
    ),
  }),
  col.accessor("id", {
    header: "Version",
    cell: (info) => <span className="font-mono text-xs">{shortId(info.getValue())}</span>,
  }),
  col.accessor((r) => (r.proposal_id ? 1 : 0), {
    id: "verified",
    header: "Statut",
    cell: ({ row }) => (
      <>
        <VerifiedChip verified={Boolean(row.original.proposal_id)} />
        {row.original.proposal_id ? (
          <Link
            href={`${PROPOSALS_PATH}?id=${row.original.proposal_id}&tout=1`}
            className="ml-1 text-xs text-brand hover:underline"
          >
            proposition
          </Link>
        ) : null}
      </>
    ),
  }),
  col.accessor((r) => r.decision_id ?? "", {
    id: "decision",
    header: "Décision D2",
    cell: ({ row }) => <DecisionLink id={row.original.decision_id} />,
  }),
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 py-1.5 text-sm last:border-0">
      <span className="text-foreground/60">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function SlipTraceDialog({
  title,
  trace,
  onClose,
}: {
  title: string;
  trace: PayrollSlipTrace;
  onClose: () => void;
}) {
  const unverified = unverifiedRules(trace);
  return (
    <QuickDialog
      title="Traçabilité du bulletin"
      subtitle={title}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {unverified.length ? (
        <RhAlert tone="warning">
          {unverified.length} règle(s) appliquée(s) sont des valeurs reprises jamais vérifiées. Faites-les approuver
          depuis{" "}
          <Link href="/parametres/rh/cotisations" className="underline">
            Cotisations &amp; impôts
          </Link>{" "}
          avant de vous y fier.
        </RhAlert>
      ) : null}
      <div>
        <Row label="Décision de paie (D4 / D3)">
          <DecisionLink id={trace.payroll_decision_id} />
        </Row>
        <Row label="Contrat">
          <span className="font-mono text-xs">{shortId(trace.contract.id)}</span>
          {trace.contract.start_exception_decision ? (
            <span className="ml-2 text-xs">
              exception de début (D13) <DecisionLink id={trace.contract.start_exception_decision} />
            </span>
          ) : null}
        </Row>
        <Row label="Affectation du mois">
          {trace.assignment.id ? (
            <span className="font-mono text-xs">{shortId(trace.assignment.id)}</span>
          ) : (
            <span className="text-xs text-foreground/55">chantier de la fiche contrat</span>
          )}
          {trace.assignment.corrected_by_decision ? (
            <span className="ml-2 text-xs">
              corrigée (D8) <DecisionLink id={trace.assignment.corrected_by_decision} />
            </span>
          ) : null}
        </Row>
        <Row label="Version de salaire">
          {trace.salary_version_id ? (
            <span className="font-mono text-xs">{shortId(trace.salary_version_id)}</span>
          ) : (
            <span className="text-xs text-foreground/55">salaire de la fiche contrat</span>
          )}
        </Row>
      </div>
      <DataTable
        data={trace.rules}
        columns={ruleColumns}
        getRowId={(r) => `${r.family}:${r.key}:${r.id}`}
        searchable={false}
        pageSize={0}
        columnToggle={false}
        emptyTitle="Aucune règle tracée"
      />
    </QuickDialog>
  );
}

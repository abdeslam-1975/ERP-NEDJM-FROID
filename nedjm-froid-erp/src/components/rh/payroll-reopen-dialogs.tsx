"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listPayrollSlipVersions,
  requestPayrollReopen,
  type PayrollSlipVersionRow,
} from "@/lib/actions/hr-ops";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhField, rhInput } from "@/components/rh/rh-ui";
import { QuickDialog } from "@/components/rules/rule-ui";
import { runStatusLabel } from "@/lib/hr/payroll-run-status";

const REASON_MIN = 10;
const REASON_MAX = 500;

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function dateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" });
}

/** D7 request: nothing is reopened here, the SUPER_ADMIN decides with the full context (transfers, documents…). */
export function ReopenRequestDialog({
  runId,
  label,
  status,
  onClose,
}: {
  runId: string;
  label: string;
  status: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const len = reason.trim().length;

  function submit() {
    setError(null);
    start(async () => {
      const r = await requestPayrollReopen({ run_id: runId, reason });
      if (!r.ok) return setError(r.error);
      router.push(`/decisions/${r.data.decision_id}`);
    });
  }

  return (
    <QuickDialog
      title={`Demander la réouverture — ${label}`}
      subtitle={`Paie ${runStatusLabel(status).fr.toLowerCase()} · décision D7 du SUPER_ADMIN`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={pending || len < REASON_MIN || len > REASON_MAX} onClick={submit}>
            Envoyer la demande
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="warning">
        La paie reste {runStatusLabel(status).fr.toLowerCase()} tant que le SUPER_ADMIN n&apos;a pas décidé. S&apos;il
        accepte, une copie figée de chaque bulletin est conservée avant le retour en brouillon, et chaque modification
        ultérieure est tracée. Virements exécutés, déclarations et certificats déjà produits ne sont pas annulés.
      </RhAlert>
      <RhField label="Motif de la réouverture" required hint={`${REASON_MIN} à ${REASON_MAX} caractères, visible du décideur.`}>
        <textarea
          className={`${rhInput} min-h-24`}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </RhField>
    </QuickDialog>
  );
}

const versionCol = dataColumns<PayrollSlipVersionRow>();

const versionColumns = [
  versionCol.accessor("employee", { header: "Salarié" }),
  versionCol.accessor("version_no", { header: "V." }),
  versionCol.accessor((v) => runStatusLabel(v.run_status).fr, {
    id: "status",
    header: "Statut",
    cell: (info) => <RhChip>{info.getValue()}</RhChip>,
  }),
  versionCol.accessor("gross_amount", {
    header: "Brut",
    meta: { align: "right", className: "tabular-nums" },
    cell: (info) => money(info.getValue()),
  }),
  versionCol.accessor("irg_amount", {
    header: "IRG",
    meta: { align: "right", className: "tabular-nums" },
    cell: (info) => money(info.getValue()),
  }),
  versionCol.accessor("net_payable", {
    header: "Net",
    meta: { align: "right", className: "tabular-nums" },
    cell: (info) => money(info.getValue()),
  }),
  versionCol.accessor("captured_at", {
    header: "Figée le",
    cell: ({ row }) => (
      <>
        {dateTime(row.original.captured_at)}
        {row.original.decision_id ? (
          <Link href={`/decisions/${row.original.decision_id}`} className="ml-1 text-brand hover:underline">
            D7
          </Link>
        ) : null}
      </>
    ),
  }),
];

/** Frozen copies taken before each reopening; read-only, never restored automatically. */
export function SlipVersionsDialog({ runId, label, onClose }: { runId: string; label: string; onClose: () => void }) {
  const [rows, setRows] = useState<PayrollSlipVersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPayrollSlipVersions(runId).then((r) => {
      if (cancelled) return;
      if (r.ok) setRows(r.data);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <QuickDialog
      title={`Historique des bulletins — ${label}`}
      subtitle="Copies figées conservées avant chaque réouverture (D7)"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {!rows && !error ? <p className="text-sm text-foreground/60">Chargement…</p> : null}
      {rows ? (
        <DataTable
          data={rows}
          columns={versionColumns}
          getRowId={(v) => v.id}
          searchPlaceholder="Rechercher un salarié…"
          searchText={(v) => v.employee}
          pageSize={0}
          columnToggle={false}
          emptyTitle="Aucune copie figée pour cette paie."
        />
      ) : null}
    </QuickDialog>
  );
}

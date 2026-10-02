"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ToolbarSlot } from "@/components/layout/arrange";
import {
  createTransferBatch,
  listTransferLines,
  previewTransferBatch,
  produceTransferReconciliation,
  requestTransferDecision,
  setTransferBatchStatus,
  type TransferBatchRow,
  type TransferBatchStatus,
  type TransferDecisionRow,
  type TransferPreview,
} from "@/lib/actions/hr-transfers";
import { TRANSFER_FORMATS, type TransferLine, type TransferMode } from "@/lib/hr/payroll-transfers";
import { decisionStatusLabel, decisionStatusTone } from "@/lib/decisions/catalog";
import { NO_TRACE_NOTICE, periodNatureOf, repriseBanner, transferReasonLabel } from "@/lib/hr/external-operations";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhField, RhModal, RhPageHeader, RhToolbar, bi, rhInput } from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };

const STATUS: Record<TransferBatchStatus, { label: string; tone: "neutral" | "brand" | "success" | "danger" }> = {
  GENERATED: { label: "Généré", tone: "neutral" },
  DEPOSITED: { label: "Déposé", tone: "brand" },
  EXECUTED: { label: "Exécuté", tone: "success" },
  CANCELLED: { label: "Annulé", tone: "danger" },
};

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const today = () => new Date().toISOString().slice(0, 10);

const D9_OPTIONS: Record<string, string> = {
  NONE: "Aucun virement",
  RECONCILIATION: "État de rapprochement non bancaire",
  REAL_BATCH: "Lot réel — risque de double paiement",
};

const batchCol = dataColumns<TransferBatchRow>();

const lineCol = dataColumns<TransferLine>();

const lineColumns = [
  lineCol.accessor("matricule", { header: "Matricule" }),
  lineCol.accessor("employee_name", { header: "Bénéficiaire" }),
  lineCol.accessor("account", { header: "Compte", meta: { className: "font-mono" } }),
  lineCol.accessor("amount", {
    header: "Montant (DA)",
    meta: { align: "right", className: "font-mono" },
    cell: (i) => money(i.getValue()),
  }),
];

function download(fileName: string, content: string) {
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function TransfersManager({
  initialBatches,
  initialDecisions,
  highlightDecision,
  sites,
  year,
  month,
  canEdit,
  loadError,
}: {
  initialBatches: TransferBatchRow[];
  initialDecisions: TransferDecisionRow[];
  highlightDecision?: string | null;
  sites: SiteOpt[];
  year: number;
  month: number;
  canEdit: boolean;
  loadError?: string;
}) {
  const [batches, setBatches] = useState(initialBatches);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [d9Reason, setD9Reason] = useState("");
  const [d9Created, setD9Created] = useState<string | null>(null);
  const reprise = periodNatureOf(year, month) === "EXTERNAL";
  const siteName = (id: string | null) => (id ? (sites.find((s) => s.id === id)?.name_fr ?? "—") : "Tous");
  const [mode, setMode] = useState<TransferMode>("CCP");
  const [siteId, setSiteId] = useState("");
  const [debit, setDebit] = useState("");
  const [valueDate, setValueDate] = useState(today());
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [lines, setLines] = useState<{ batch: TransferBatchRow; rows: TransferLine[] } | null>(null);
  const [deposit, setDeposit] = useState<{ batch: TransferBatchRow; ref: string; date: string } | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function goPeriod(y: number, m: number) {
    window.location.search = `?year=${y}&month=${m}`;
  }

  function runPreview() {
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await previewTransferBatch({ year, month, mode, site_id: siteId || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(r.data);
      setSelected(new Set(r.data.blocked.map((l) => l.slip_id)));
      setD9Created(null);
    });
  }

  function requestD9() {
    if (!preview || !selected.size) return;
    setError(null);
    start(async () => {
      const r = await requestTransferDecision({
        year,
        month,
        mode,
        site_id: siteId || null,
        slip_ids: [...selected],
        reason: d9Reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setD9Created(r.data.id);
      setInfo("Décision D9 demandée : aucun virement tant qu'elle n'est pas tranchée par un décideur habilité.");
    });
  }

  function generateD9(d: TransferDecisionRow) {
    if (
      !window.confirm(
        `Générer le lot réel de la décision D9 (${d.slip_count} bulletin(s), ${money(d.net_total)} DA) ?\n` +
          "RISQUE DE DOUBLE PAIEMENT : ces salaires ont peut-être déjà été versés. La décision sera consommée.",
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const r = await createTransferBatch({
        year,
        month,
        mode: d.mode === "BANK" ? "BANK" : "CCP",
        site_id: d.site_id,
        debit_account: debit,
        value_date: valueDate,
        decision_id: d.id,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.location.reload();
    });
  }

  function reconciliation(d: TransferDecisionRow) {
    if (!window.confirm("Produire l'état de rapprochement (une seule fois) ? Ce n'est pas un ordre de paiement.")) return;
    setError(null);
    start(async () => {
      const r = await produceTransferReconciliation(d.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      download(r.data.fileName, r.data.content);
      window.location.reload();
    });
  }

  function generate() {
    if (!preview?.lines.length) return;
    if (
      !window.confirm(
        `Générer le lot ${mode} : ${preview.lines.length} virement(s), total ${money(preview.total)} DA ?\n` +
          "Les bulletins inclus ne pourront plus être réouverts tant que le lot n'est pas annulé.",
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const r = await createTransferBatch({
        year,
        month,
        mode,
        site_id: siteId || null,
        debit_account: debit,
        value_date: valueDate,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(null);
      setInfo(`Lot ${r.data.batch_no} généré : ${r.data.count} virement(s), ${money(r.data.total)} DA.`);
      window.location.reload();
    });
  }

  function setStatus(batch: TransferBatchRow, status: TransferBatchStatus, extra: { deposit_ref?: string; deposit_date?: string; reason?: string } = {}) {
    setError(null);
    start(async () => {
      const r = await setTransferBatchStatus({ id: batch.id, status, ...extra });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDeposit(null);
      setBatches((prev) =>
        prev.map((b) =>
          b.id === batch.id
            ? {
                ...b,
                status_code: status,
                deposit_ref: status === "DEPOSITED" ? extra.deposit_ref ?? null : status === "GENERATED" ? null : b.deposit_ref,
                deposit_date: status === "DEPOSITED" ? extra.deposit_date ?? today() : status === "GENERATED" ? null : b.deposit_date,
                executed_at: status === "EXECUTED" ? new Date().toISOString() : b.executed_at,
                cancelled_reason: status === "CANCELLED" ? extra.reason ?? null : b.cancelled_reason,
              }
            : b,
        ),
      );
    });
  }

  function cancel(batch: TransferBatchRow) {
    const reason = window.prompt("Motif de l'annulation (obligatoire) :", "");
    if (!reason?.trim()) return;
    setStatus(batch, "CANCELLED", { reason });
  }

  function showLines(batch: TransferBatchRow) {
    start(async () => {
      const r = await listTransferLines(batch.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLines({ batch, rows: r.data });
    });
  }

  const live = batches.filter((b) => b.status_code !== "CANCELLED");
  const liveTotal = live.reduce((s, b) => s + b.total_amount, 0);

  const batchColumns = [
    batchCol.accessor("batch_no", {
      header: "Lot",
      cell: ({ row }) => {
        const b = row.original;
        return (
          <>
            <span className="font-mono font-semibold">{b.batch_no}</span>
            <span className="block text-[11px] text-foreground/55">
              {new Date(b.created_at).toLocaleString("fr-FR")} · {b.creator_name ?? "—"}
            </span>
            <span className="block font-mono text-[10px] text-foreground/40" title={b.sha256}>
              SHA-256 {b.sha256.slice(0, 16)}…
            </span>
            {b.double_payment_risk ? (
              <span className="mt-1 flex flex-wrap items-center gap-1">
                <RhChip tone="danger">Risque de double paiement</RhChip>
                {b.decision_id ? (
                  <Link href={`/decisions/${b.decision_id}`} className="text-[11px] font-semibold text-brand hover:underline">
                    Décision D9
                  </Link>
                ) : null}
              </span>
            ) : null}
          </>
        );
      },
    }),
    batchCol.accessor("mode", {
      header: "Mode",
      cell: ({ row }) => (
        <>
          {row.original.mode}
          <span className="block text-[11px] text-foreground/55">{row.original.file_format}</span>
        </>
      ),
    }),
    batchCol.accessor((b) => b.site_name ?? "Tous", { id: "site", header: "Chantier" }),
    batchCol.accessor("line_count", { header: "Virements", meta: { className: "tabular-nums" } }),
    batchCol.accessor("total_amount", {
      header: "Total (DA)",
      meta: { align: "right", className: "font-mono" },
      cell: (i) => money(i.getValue()),
    }),
    batchCol.accessor((b) => STATUS[b.status_code].label, {
      id: "status",
      header: "Statut / dépôt",
      cell: ({ row }) => {
        const b = row.original;
        return (
          <>
            <RhChip tone={STATUS[b.status_code].tone}>{STATUS[b.status_code].label}</RhChip>
            {b.deposit_ref ? (
              <span className="mt-1 block text-[11px] text-foreground/60">
                Réf. {b.deposit_ref} · {b.deposit_date} {b.depositor_name ? `· ${b.depositor_name}` : ""}
              </span>
            ) : null}
            {b.executed_at ? (
              <span className="block text-[11px] text-foreground/60">
                Exécuté le {new Date(b.executed_at).toLocaleDateString("fr-FR")}
              </span>
            ) : null}
            {b.cancelled_reason ? (
              <span className="block text-[11px] italic text-foreground/60">{b.cancelled_reason}</span>
            ) : null}
          </>
        );
      },
    }),
    batchCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" disabled={pending} onClick={() => showLines(b)}>
              Détail
            </Button>
            {b.status_code !== "CANCELLED" ? (
              <a
                className="inline-flex items-center rounded-xl border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-surface-muted"
                href={`/api/rh/virements?batch=${b.id}`}
              >
                Fichier
              </a>
            ) : null}
            {canEdit && b.status_code === "GENERATED" ? (
              <Button variant="secondary" disabled={pending} onClick={() => setDeposit({ batch: b, ref: "", date: today() })}>
                Déposé
              </Button>
            ) : null}
            {canEdit && b.status_code === "DEPOSITED" ? (
              <>
                <Button disabled={pending} onClick={() => setStatus(b, "EXECUTED")}>
                  Exécuté
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setStatus(b, "GENERATED")}>
                  Annuler le dépôt
                </Button>
              </>
            ) : null}
            {canEdit && (b.status_code === "GENERATED" || b.status_code === "DEPOSITED") ? (
              <Button variant="ghost" disabled={pending} onClick={() => cancel(b)}>
                Annuler le lot
              </Button>
            ) : null}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Virements des salaires", "تحويلات الأجور")}
        description={bi(
          "Fichiers CCP / banque générés depuis les bulletins validés ou clôturés, avec journal de dépôt (référence, date, exécution). Un bulletin ne peut figurer que dans un seul lot actif. Format générique : faites valider la structure du fichier par votre banque / Algérie Poste avant le premier dépôt.",
          "",
        )}
        actionsTabset="btn_rh_transfers"
        actions={
          <>
            <ToolbarSlot id="external_ops">
              <Link
                className="rounded-xl border border-border/70 bg-surface px-3.5 py-2 text-sm font-semibold text-foreground/75 transition hover:bg-surface-muted"
                href="/rh/paie/operations-externes"
              >
                {bi("Opérations externes", "العمليات الخارجية")}
              </Link>
            </ToolbarSlot>
            <ToolbarSlot id="bulletins">
              <Link
                className="rounded-xl border border-border/70 bg-surface px-3.5 py-2 text-sm font-semibold text-foreground/75 transition hover:bg-surface-muted"
                href={`/rh/paie/bulletins?year=${year}&month=${month}`}
              >
                {bi("Bulletins", "الكشوف")}
              </Link>
            </ToolbarSlot>
          </>
        }
      />
      {reprise ? <RhAlert tone="warning">{repriseBanner("transfer")}</RhAlert> : null}
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? (
        <RhAlert tone="success">
          {info}
          {d9Created ? (
            <Link href={`/decisions/${d9Created}`} className="ml-2 font-semibold underline">
              Ouvrir la décision
            </Link>
          ) : null}
        </RhAlert>
      ) : null}

      <RhToolbar>
        <RhField label={bi("Année", "السنة")}>
          <input className={rhInput} type="number" defaultValue={year} onBlur={(e) => Number(e.target.value) !== year && goPeriod(Number(e.target.value), month)} />
        </RhField>
        <RhField label={bi("Mois", "الشهر")}>
          <select className={rhInput} value={month} onChange={(e) => goPeriod(year, Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label={bi("Mode", "الطريقة")}>
          <select className={rhInput} value={mode} onChange={(e) => { setMode(e.target.value as TransferMode); setPreview(null); }}>
            <option value="CCP">{TRANSFER_FORMATS.CCP.label}</option>
            <option value="BANK">{TRANSFER_FORMATS.BANK.label}</option>
          </select>
        </RhField>
        <RhField label={bi("Chantier", "الورشة")}>
          <select className={rhInput} value={siteId} onChange={(e) => { setSiteId(e.target.value); setPreview(null); }}>
            <option value="">Tous les chantiers</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_fr}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label={bi("Compte donneur d'ordre", "حساب الآمر")}>
          <input className={rhInput} value={debit} onChange={(e) => setDebit(e.target.value)} placeholder="CCP / RIB entreprise" />
        </RhField>
        <RhField label={bi("Date de valeur", "تاريخ القيمة")}>
          <input className={rhInput} type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)} />
        </RhField>
        {canEdit ? (
          <Button variant="secondary" disabled={pending} onClick={runPreview}>
            {bi("Préparer le lot", "تحضير")}
          </Button>
        ) : null}
      </RhToolbar>

      {preview ? (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {preview.lines.length} virement(s) · {money(preview.total)} DA
            </span>
            {preview.skippedDraft ? <RhChip tone="warning">{preview.skippedDraft} bulletin(s) brouillon exclus</RhChip> : null}
            {preview.skippedBatched ? <RhChip>{preview.skippedBatched} déjà dans un lot</RhChip> : null}
            {preview.issues.length ? <RhChip tone="danger">{preview.issues.length} compte(s) à corriger</RhChip> : null}
            <div className="ml-auto">
              <Button disabled={pending || !preview.lines.length} onClick={generate}>
                {bi("Générer le fichier", "توليد الملف")}
              </Button>
            </div>
          </div>
          {preview.issues.length ? (
            <ul className="space-y-0.5 text-xs text-red-700">
              {preview.issues.map((i) => (
                <li key={i.matricule}>
                  {i.matricule} {i.employee_name} — {i.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.blocked.length || preview.blockedIssues.length ? (
            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="font-semibold">
                {preview.blocked.length} bulletin(s) bloqué(s) · {money(preview.blockedTotal)} DA — aucun virement sans décision D9
              </p>
              <p className="text-xs text-foreground/65">
                Bloqués en base : paie de reprise, salaire du mois déjà viré par un lot exécuté, ou paiement externe enregistré
                (même retiré ou non confirmé). {NO_TRACE_NOTICE}
              </p>
              {preview.blocked.length ? (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {preview.blocked.map((l) => (
                    <li key={l.slip_id} className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(l.slip_id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(l.slip_id);
                            else next.delete(l.slip_id);
                            return next;
                          })
                        }
                      />
                      <span>
                        {l.matricule} {l.employee_name} · {money(l.amount)} DA
                      </span>
                      {l.reasons.map((r) => (
                        <RhChip key={r} tone="warning">
                          {transferReasonLabel(r)}
                        </RhChip>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : null}
              {preview.blockedIssues.length ? (
                <ul className="space-y-0.5 text-xs text-red-700">
                  {preview.blockedIssues.map((i) => (
                    <li key={i.matricule}>
                      {i.matricule} {i.employee_name} — {i.reason} (bloqué D9)
                    </li>
                  ))}
                </ul>
              ) : null}
              {canEdit && preview.blocked.length ? (
                <div className="flex flex-wrap items-end gap-2">
                  <RhField label="Motif de la demande D9" hint="10 à 500 caractères">
                    <input
                      className={`${rhInput} min-w-80`}
                      value={d9Reason}
                      maxLength={500}
                      onChange={(e) => setD9Reason(e.target.value)}
                    />
                  </RhField>
                  <Button
                    variant="secondary"
                    disabled={pending || !selected.size || d9Reason.trim().length < 10}
                    onClick={requestD9}
                  >
                    Demander la décision D9 ({selected.size})
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {initialDecisions.length ? (
        <div className="space-y-2 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm">
          <p className="font-semibold">Décisions D9 du mois</p>
          <ul className="space-y-1.5">
            {initialDecisions.map((d) => (
              <li
                key={d.id}
                className={`flex flex-wrap items-center gap-2 rounded-xl px-2 py-1 ${
                  highlightDecision === d.id ? "bg-brand-muted" : ""
                }`}
              >
                <Link href={`/decisions/${d.id}`} className="font-semibold text-brand hover:underline">
                  D9 · {new Date(d.requested_at).toLocaleDateString("fr-FR")}
                </Link>
                <RhChip tone={decisionStatusTone(d.status)}>{decisionStatusLabel(d.status)}</RhChip>
                {d.chosen_option ? (
                  <RhChip tone={d.chosen_option === "REAL_BATCH" ? "danger" : "neutral"}>
                    {D9_OPTIONS[d.chosen_option] ?? d.chosen_option}
                  </RhChip>
                ) : null}
                <span className="text-foreground/65">
                  {d.mode} · {siteName(d.site_id)} · {d.slip_count} bulletin(s) · {money(d.net_total)} DA
                </span>
                {d.closed_reason ? <span className="text-xs italic text-foreground/55">{d.closed_reason}</span> : null}
                {canEdit && d.status === "DECIDED" && d.chosen_option === "REAL_BATCH" ? (
                  <Button disabled={pending} onClick={() => generateD9(d)}>
                    Générer le lot (D9)
                  </Button>
                ) : null}
                {canEdit && d.status === "DECIDED" && d.chosen_option === "RECONCILIATION" ? (
                  <Button variant="secondary" disabled={pending} onClick={() => reconciliation(d)}>
                    Produire l&apos;état de rapprochement
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm">
        <RhChip tone="brand">
          {live.length} lot(s) actif(s) · {money(liveTotal)} DA
        </RhChip>
      </div>

      <DataTable
        data={batches}
        columns={batchColumns}
        getRowId={(b) => b.id}
        searchPlaceholder="Rechercher un lot, un chantier, une référence…"
        searchText={(b) => [b.batch_no, b.mode, b.site_name ?? "Tous", b.deposit_ref, b.creator_name].filter(Boolean).join(" ")}
        emptyTitle={`Aucun lot pour ${String(month).padStart(2, "0")}/${year}.`}
      />

      {deposit ? (
        <RhModal
          title={`Dépôt du lot ${deposit.batch.batch_no}`}
          onClose={() => setDeposit(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeposit(null)}>
                Fermer
              </Button>
              <Button
                disabled={pending || !deposit.ref.trim()}
                onClick={() =>
                  setStatus(deposit.batch, "DEPOSITED", { deposit_ref: deposit.ref, deposit_date: deposit.date })
                }
              >
                Enregistrer le dépôt
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Référence du bordereau / accusé" hint="Obligatoire">
              <input className={rhInput} value={deposit.ref} onChange={(e) => setDeposit({ ...deposit, ref: e.target.value })} />
            </RhField>
            <RhField label="Date de dépôt">
              <input
                className={rhInput}
                type="date"
                value={deposit.date}
                onChange={(e) => setDeposit({ ...deposit, date: e.target.value })}
              />
            </RhField>
          </div>
        </RhModal>
      ) : null}

      {lines ? (
        <RhModal title={`Lot ${lines.batch.batch_no} · ${lines.rows.length} virement(s)`} onClose={() => setLines(null)} size="lg">
          <DataTable
            data={lines.rows}
            columns={lineColumns}
            getRowId={(l) => l.slip_id}
            searchPlaceholder="Rechercher un matricule ou un bénéficiaire…"
            searchText={(l) => `${l.matricule} ${l.employee_name}`}
            pageSize={0}
            columnToggle={false}
            emptyTitle="Aucun virement"
          />
        </RhModal>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createTransferBatch,
  listTransferLines,
  previewTransferBatch,
  setTransferBatchStatus,
  type TransferBatchRow,
  type TransferBatchStatus,
  type TransferPreview,
} from "@/lib/actions/hr-transfers";
import { TRANSFER_FORMATS, type TransferLine, type TransferMode } from "@/lib/hr/payroll-transfers";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhField,
  RhModal,
  RhPageHeader,
  RhTableWrap,
  RhToolbar,
  bi,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

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

export function TransfersManager({
  initialBatches,
  sites,
  year,
  month,
  canEdit,
  loadError,
}: {
  initialBatches: TransferBatchRow[];
  sites: SiteOpt[];
  year: number;
  month: number;
  canEdit: boolean;
  loadError?: string;
}) {
  const [batches, setBatches] = useState(initialBatches);
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

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Virements des salaires", "تحويلات الأجور")}
        description={bi(
          "Fichiers CCP / banque générés depuis les bulletins validés ou clôturés, avec journal de dépôt (référence, date, exécution). Un bulletin ne peut figurer que dans un seul lot actif. Format générique : faites valider la structure du fichier par votre banque / Algérie Poste avant le premier dépôt.",
          "",
        )}
        actions={
          <Link
            className="rounded-xl border border-border/70 bg-surface px-3.5 py-2 text-sm font-semibold text-foreground/75 transition hover:bg-surface-muted"
            href={`/rh/paie/bulletins?year=${year}&month=${month}`}
          >
            {bi("Bulletins", "الكشوف")}
          </Link>
        }
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

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
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm">
        <RhChip tone="brand">
          {live.length} lot(s) actif(s) · {money(liveTotal)} DA
        </RhChip>
      </div>

      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              <th className={rhTh()}>Lot</th>
              <th className={rhTh()}>Mode</th>
              <th className={rhTh()}>Chantier</th>
              <th className={rhTh()}>Virements</th>
              <th className={rhTh()}>Total (DA)</th>
              <th className={rhTh()}>Statut / dépôt</th>
              <th className={rhTh()} />
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr>
                <td className={`${rhTd()} py-6 text-center text-foreground/55`} colSpan={7}>
                  Aucun lot pour {String(month).padStart(2, "0")}/{year}.
                </td>
              </tr>
            ) : (
              batches.map((b) => (
                <tr key={b.id} className="border-b border-border/60 align-top">
                  <td className={rhTd()}>
                    <span className="font-mono font-semibold">{b.batch_no}</span>
                    <span className="block text-[11px] text-foreground/55">
                      {new Date(b.created_at).toLocaleString("fr-FR")} · {b.creator_name ?? "—"}
                    </span>
                    <span className="block font-mono text-[10px] text-foreground/40" title={b.sha256}>
                      SHA-256 {b.sha256.slice(0, 16)}…
                    </span>
                  </td>
                  <td className={rhTd()}>
                    {b.mode}
                    <span className="block text-[11px] text-foreground/55">{b.file_format}</span>
                  </td>
                  <td className={rhTd()}>{b.site_name ?? "Tous"}</td>
                  <td className={`${rhTd()} tabular-nums`}>{b.line_count}</td>
                  <td className={`${rhTd()} font-mono`}>{money(b.total_amount)}</td>
                  <td className={rhTd()}>
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
                  </td>
                  <td className={rhTd()}>
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
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() => setDeposit({ batch: b, ref: "", date: today() })}
                        >
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </RhTableWrap>

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
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={rhTh()}>Matricule</th>
                <th className={rhTh()}>Bénéficiaire</th>
                <th className={rhTh()}>Compte</th>
                <th className={rhTh()}>Montant (DA)</th>
              </tr>
            </thead>
            <tbody>
              {lines.rows.map((l) => (
                <tr key={l.slip_id} className="border-b border-border/60">
                  <td className={rhTd()}>{l.matricule}</td>
                  <td className={rhTd()}>{l.employee_name}</td>
                  <td className={`${rhTd()} font-mono`}>{l.account}</td>
                  <td className={`${rhTd()} font-mono`}>{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RhModal>
      ) : null}
    </div>
  );
}

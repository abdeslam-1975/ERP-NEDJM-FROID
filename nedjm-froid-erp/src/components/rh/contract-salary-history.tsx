"use client";

import { useEffect, useState, useTransition } from "react";
import {
  deleteSalaryVersion,
  listSalaryHistory,
  saveSalaryAvenant,
  type SalaryHistoryRow,
} from "@/lib/actions/hr-salary-history";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, bi, rhInput } from "@/components/rh/rh-ui";

function money(n: number) {
  return n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function firstOfNextMonth() {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

function inForce(rows: SalaryHistoryRow[], asOf: string) {
  return rows.find((r) => r.effective_from <= asOf) ?? null;
}

export function ContractSalaryHistory({
  contractId,
  canEdit,
  onCurrentSalary,
}: {
  contractId: string;
  canEdit: boolean;
  /** Keeps the contract form in sync with the version in force today. */
  onCurrentSalary?: (salary: { base: number; net: number }) => void;
}) {
  const [rows, setRows] = useState<SalaryHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ effective_from: firstOfNextMonth(), base: "", net: "", reason: "" });
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    listSalaryHistory(contractId).then((r) => {
      if (cancelled) return;
      if (r.ok) setRows(r.data);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  async function reload() {
    const r = await listSalaryHistory(contractId);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setRows(r.data);
    const current = inForce(r.data, new Date().toISOString().slice(0, 10));
    if (current) onCurrentSalary?.({ base: current.salaire_base_monthly, net: current.salaire_net_ref_monthly });
  }

  function submit() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await saveSalaryAvenant({
        contract_id: contractId,
        effective_from: draft.effective_from,
        salaire_base_monthly: draft.base,
        salaire_net_ref_monthly: draft.net || 0,
        reason: draft.reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft({ effective_from: firstOfNextMonth(), base: "", net: "", reason: "" });
      setNotice(bi("Avenant enregistré, paies brouillon recalculées.", "تم حفظ الملحق وإعادة حساب الأجور غير المعتمدة."));
      await reload();
    });
  }

  function remove(row: SalaryHistoryRow) {
    if (!window.confirm(bi(`Supprimer la version du ${row.effective_from} ?`, "حذف هذه النسخة؟"))) return;
    setError(null);
    start(async () => {
      const r = await deleteSalaryVersion({ id: row.id, contract_id: contractId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await reload();
    });
  }

  if (error && !rows) return <RhAlert tone="danger">{error}</RhAlert>;
  if (!rows) return <p className="text-sm text-foreground/55">{bi("Chargement…", "جارٍ التحميل…")}</p>;

  const current = inForce(rows, today);
  const initialId = rows.length ? rows[rows.length - 1].id : null;

  return (
    <div className="space-y-4">
      <RhAlert tone="info">
        {bi(
          "Chaque paie utilise le salaire en vigueur au dernier jour du mois. Un avenant ne modifie pas les mois déjà clôturés.",
          "كل كشف أجر يستعمل الأجر الساري في آخر يوم من الشهر. الملحق لا يغيّر الأشهر المقفلة.",
        )}
      </RhAlert>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice ? <RhAlert tone="success">{notice}</RhAlert> : null}

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2 text-left">{bi("Date d'effet", "تاريخ السريان")}</th>
              <th className="px-3 py-2 text-right">{bi("Salaire de base", "الأجر الأساسي")}</th>
              <th className="px-3 py-2 text-right">{bi("Net chantier", "صافي الميدان")}</th>
              <th className="px-3 py-2 text-left">{bi("Motif", "السبب")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {row.effective_from}{" "}
                  {current?.id === row.id ? <RhChip tone="success">{bi("En vigueur", "ساري")}</RhChip> : null}
                  {row.effective_from > today ? <RhChip tone="warning">{bi("À venir", "قادم")}</RhChip> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(row.salaire_base_monthly)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(row.salaire_net_ref_monthly)}</td>
                <td className="px-3 py-2">
                  {row.reason}
                  {row.author_name ? <span className="text-xs text-foreground/50"> · {row.author_name}</span> : null}
                </td>
                <td className="px-3 py-2 text-right">
                  {canEdit && row.id !== initialId ? (
                    <Button variant="secondary" disabled={pending} onClick={() => remove(row)}>
                      {bi("Supprimer", "حذف")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="rounded border border-border p-3">
          <p className="mb-3 text-sm font-semibold">{bi("Nouvel avenant", "ملحق جديد")}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <RhField label={bi("Date d'effet", "تاريخ السريان")}>
              <input
                type="date"
                className={rhInput}
                value={draft.effective_from}
                onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Salaire de base", "الأجر الأساسي")}>
              <input
                inputMode="decimal"
                className={rhInput}
                value={draft.base}
                onChange={(e) => setDraft({ ...draft, base: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Net chantier", "صافي الميدان")}>
              <input
                inputMode="decimal"
                className={rhInput}
                value={draft.net}
                onChange={(e) => setDraft({ ...draft, net: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Motif", "السبب")}>
              <input
                className={rhInput}
                value={draft.reason}
                placeholder={bi("Augmentation, promotion…", "زيادة، ترقية…")}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </RhField>
          </div>
          <div className="mt-3 flex justify-end">
            <Button disabled={pending || !draft.base || draft.reason.trim().length < 3} onClick={submit}>
              {bi("Enregistrer l'avenant", "حفظ الملحق")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

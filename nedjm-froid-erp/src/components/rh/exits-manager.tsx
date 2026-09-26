"use client";

import { useState, useTransition } from "react";
import {
  deleteExit,
  listExits,
  saveExit,
  setExitStatus,
  suggestExit,
  type ExitRow,
} from "@/lib/actions/hr-exits";
import type { LeaveEmployee } from "@/lib/actions/hr-leave";
import { EXIT_REASONS, exitReasonLabel, type SettlementLine } from "@/lib/hr/leave";
import { slashDateIso, type LetterKind } from "@/lib/hr/hr-letters";
import { HrLetterDialog } from "@/components/rh/hr-letter-dialog";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhModal, bi, rhInput } from "@/components/rh/rh-ui";

function money(n: number) {
  return n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CATEGORIES: { code: SettlementLine["category"]; label: string }[] = [
  { code: "1", label: "1 · Cotisable + imposable" },
  { code: "2", label: "2 · Cotisable, non imposable" },
  { code: "3", label: "3 · Imposable, non cotisable" },
  { code: "4", label: "4 · Ni cotisable ni imposable" },
];

const STATUS: Record<ExitRow["status"], { label: string; tone: "warning" | "success" | "neutral" }> = {
  DRAFT: { label: "Brouillon · مسودة", tone: "warning" },
  VALIDATED: { label: "Validée · مصادق عليها", tone: "success" },
  CANCELLED: { label: "Annulée · ملغاة", tone: "neutral" },
};

type Draft = {
  id: string | null;
  employee_id: string;
  contract_id: string | null;
  exit_date: string;
  reason_code: string;
  notes: string;
  leave_balance_days: string;
  settlement_lines: SettlementLine[];
  base_monthly: number | null;
};

const emptyDraft = (): Draft => ({
  id: null,
  employee_id: "",
  contract_id: null,
  exit_date: "",
  reason_code: "END_CDD",
  notes: "",
  leave_balance_days: "",
  settlement_lines: [],
  base_monthly: null,
});

export function ExitsManager({
  initialRows,
  employees,
  canEdit,
  loadError,
}: {
  initialRows: ExitRow[];
  employees: LeaveEmployee[];
  canEdit: boolean;
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [letter, setLetter] = useState<{ employeeId: string; kind: LetterKind } | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function reload() {
    const r = await listExits();
    if (r.ok) setRows(r.data);
    else setError(r.error);
  }

  function edit(row: ExitRow) {
    setFormError(null);
    setDraft({
      id: row.id,
      employee_id: row.employee_id,
      contract_id: row.contract_id,
      exit_date: row.exit_date,
      reason_code: row.reason_code,
      notes: row.notes ?? "",
      leave_balance_days: row.leave_balance_days == null ? "" : String(row.leave_balance_days),
      settlement_lines: row.settlement_lines,
      base_monthly: null,
    });
  }

  function compute() {
    if (!draft?.employee_id || !draft.exit_date) return;
    setFormError(null);
    start(async () => {
      const r = await suggestExit({ employee_id: draft.employee_id, exit_date: draft.exit_date });
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      const others = draft.settlement_lines.filter((l) => l.code !== "ICP");
      setDraft({
        ...draft,
        contract_id: r.data.contract_id,
        leave_balance_days: String(r.data.leave_balance_days),
        settlement_lines: [...r.data.lines, ...others],
        base_monthly: r.data.base_monthly,
      });
    });
  }

  function save() {
    if (!draft) return;
    setFormError(null);
    start(async () => {
      const r = await saveExit({
        ...draft,
        leave_balance_days: draft.leave_balance_days === "" ? null : draft.leave_balance_days,
      });
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      setDraft(null);
      setNotice(bi("Sortie enregistrée (brouillon). Validez-la pour clôturer les contrats.", "تم الحفظ."));
      await reload();
    });
  }

  function changeStatus(row: ExitRow, status: "VALIDATED" | "CANCELLED") {
    const msg =
      status === "VALIDATED"
        ? `Valider la sortie de ${row.employee_label} au ${slashDateIso(row.exit_date)} ? Ses contrats seront clôturés (ENDED) et le solde (${money(row.total)} DA) sera ajouté à la paie du mois de sortie, avec retenue du reste des avances.`
        : `Annuler la sortie de ${row.employee_label} ?${row.status === "VALIDATED" ? " L'employé redevient actif ; les contrats clôturés restent à rouvrir manuellement." : ""}`;
    if (!window.confirm(msg)) return;
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await setExitStatus({ id: row.id, status });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice(status === "VALIDATED" ? bi("Sortie validée.", "تمت المصادقة.") : bi("Sortie annulée.", "تم الإلغاء."));
      await reload();
    });
  }

  function remove(row: ExitRow) {
    if (!window.confirm(bi("Supprimer ce brouillon ?", "حذف المسودة؟"))) return;
    start(async () => {
      const r = await deleteExit(row.id);
      if (!r.ok) setError(r.error);
      await reload();
    });
  }

  const setLine = (i: number, patch: Partial<SettlementLine>) =>
    draft &&
    setDraft({ ...draft, settlement_lines: draft.settlement_lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const total = draft ? draft.settlement_lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) : 0;

  return (
    <div className="space-y-5">
      <RhAlert tone="info">
        {bi(
          "Fin de relation de travail : le solde de tout compte (indemnité compensatrice de congé, primes, retenues…) est versé sur le bulletin du mois de sortie ; les avances restantes y sont retenues en totalité. Le certificat de travail et le reçu pour solde de tout compte s'impriment depuis cette page.",
          "",
        )}
      </RhAlert>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice ? <RhAlert tone="success">{notice}</RhAlert> : null}

      {canEdit ? (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setFormError(null);
              setDraft(emptyDraft());
            }}
          >
            {bi("Nouvelle sortie", "خروج جديد")}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2 text-left">{bi("Employé", "العامل")}</th>
              <th className="px-3 py-2 text-left">{bi("Date de sortie", "تاريخ الخروج")}</th>
              <th className="px-3 py-2 text-left">{bi("Motif", "السبب")}</th>
              <th className="px-3 py-2 text-right">{bi("Reliquat congé", "رصيد العطلة")}</th>
              <th className="px-3 py-2 text-right">{bi("Solde (DA)", "التصفية")}</th>
              <th className="px-3 py-2 text-left">{bi("Statut", "الحالة")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-foreground/50">
                  {bi("Aucune sortie.", "لا توجد حالات خروج.")}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const st = STATUS[row.status];
                const reason = exitReasonLabel(row.reason_code);
                return (
                  <tr key={row.id} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2">
                      {row.employee_label}
                      {row.notes ? <div className="text-xs text-foreground/55">{row.notes}</div> : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{slashDateIso(row.exit_date)}</td>
                    <td className="px-3 py-2">
                      {reason.fr} <span className="text-xs text-foreground/50">· {reason.ar}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.leave_balance_days ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(row.total)}</td>
                    <td className="px-3 py-2">
                      <RhChip tone={st.tone}>{st.label}</RhChip>
                      {row.validated_by_name ? (
                        <div className="text-xs text-foreground/50">{row.validated_by_name}</div>
                      ) : null}
                    </td>
                    <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                      {canEdit && row.status === "DRAFT" ? (
                        <>
                          <Button variant="secondary" disabled={pending} onClick={() => edit(row)}>
                            {bi("Modifier", "تعديل")}
                          </Button>
                          <Button disabled={pending} onClick={() => changeStatus(row, "VALIDATED")}>
                            {bi("Valider", "مصادقة")}
                          </Button>
                          <Button variant="secondary" disabled={pending} onClick={() => remove(row)}>
                            {bi("Supprimer", "حذف")}
                          </Button>
                        </>
                      ) : null}
                      {row.status === "VALIDATED" ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => setLetter({ employeeId: row.employee_id, kind: "CERTIF" })}
                          >
                            {bi("Certificat de travail", "شهادة عمل")}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setLetter({ employeeId: row.employee_id, kind: "STC" })}
                          >
                            {bi("Solde de tout compte", "وصل التصفية")}
                          </Button>
                          {canEdit ? (
                            <Button variant="secondary" disabled={pending} onClick={() => changeStatus(row, "CANCELLED")}>
                              {bi("Annuler", "إلغاء")}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {draft ? (
        <RhModal
          size="lg"
          title={draft.id ? bi("Modifier la sortie", "تعديل الخروج") : bi("Nouvelle sortie", "خروج جديد")}
          onClose={() => setDraft(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                {bi("Annuler", "إلغاء")}
              </Button>
              <Button disabled={pending || !draft.employee_id || !draft.exit_date} onClick={save}>
                {bi("Enregistrer le brouillon", "حفظ")}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {formError ? <RhAlert tone="danger">{formError}</RhAlert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <RhField label={bi("Employé", "العامل")}>
                <select
                  className={rhInput}
                  value={draft.employee_id}
                  disabled={Boolean(draft.id)}
                  onChange={(e) => setDraft({ ...draft, employee_id: e.target.value, contract_id: null })}
                >
                  <option value="">—</option>
                  {employees
                    .filter((e) => e.employment_status !== "EXITED" || e.id === draft.employee_id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                </select>
              </RhField>
              <RhField label={bi("Date de sortie (dernier jour travaillé)", "تاريخ الخروج")}>
                <input
                  type="date"
                  className={rhInput}
                  value={draft.exit_date}
                  onChange={(e) => setDraft({ ...draft, exit_date: e.target.value })}
                />
              </RhField>
              <RhField label={bi("Motif", "السبب")}>
                <select
                  className={rhInput}
                  value={draft.reason_code}
                  onChange={(e) => setDraft({ ...draft, reason_code: e.target.value })}
                >
                  {EXIT_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.fr} · {r.ar}
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label={bi("Reliquat de congé (jours)", "رصيد العطلة")}>
                <input
                  inputMode="decimal"
                  className={rhInput}
                  value={draft.leave_balance_days}
                  onChange={(e) => setDraft({ ...draft, leave_balance_days: e.target.value })}
                />
              </RhField>
              <div className="sm:col-span-2">
                <RhField label={bi("Observations", "ملاحظات")}>
                  <input
                    className={rhInput}
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </RhField>
              </div>
            </div>
            {draft.reason_code === "ABANDON" && draft.employee_id ? (
              <RhAlert tone="warning">
                <span className="mr-2">
                  {bi("Abandon de poste : envoyer d'abord deux mises en demeure.", "إهمال المنصب: يجب إرسال إعذارين.")}
                </span>
                <Button variant="secondary" onClick={() => setLetter({ employeeId: draft.employee_id, kind: "MED1" })}>
                  {bi("1ère mise en demeure", "الإعذار الأول")}
                </Button>{" "}
                <Button variant="secondary" onClick={() => setLetter({ employeeId: draft.employee_id, kind: "MED2" })}>
                  {bi("2ème mise en demeure", "الإعذار الثاني")}
                </Button>
              </RhAlert>
            ) : null}

            <div className="space-y-2 rounded-xl border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{bi("Éléments du solde de tout compte", "عناصر التصفية")}</p>
                <Button
                  variant="secondary"
                  disabled={pending || !draft.employee_id || !draft.exit_date}
                  onClick={compute}
                >
                  {bi("Calculer le reliquat de congé", "حساب رصيد العطلة")}
                </Button>
              </div>
              {draft.base_monthly != null ? (
                <p className="text-xs text-foreground/60">
                  {bi(`Salaire de base à la date de sortie : ${money(draft.base_monthly)} DA (indemnité = base / 30 × jours).`, "")}
                </p>
              ) : null}
              {draft.settlement_lines.map((l, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[6rem_1fr_1fr_12rem_8rem_auto]">
                  <input
                    className={`${rhInput} mt-0`}
                    value={l.code}
                    placeholder="Code"
                    onChange={(e) => setLine(i, { code: e.target.value })}
                  />
                  <input
                    className={`${rhInput} mt-0`}
                    value={l.label_fr}
                    placeholder="Libellé"
                    onChange={(e) => setLine(i, { label_fr: e.target.value })}
                  />
                  <input
                    dir="rtl"
                    className={`${rhInput} mt-0`}
                    value={l.label_ar}
                    placeholder="التسمية"
                    onChange={(e) => setLine(i, { label_ar: e.target.value })}
                  />
                  <select
                    className={`${rhInput} mt-0`}
                    value={l.category}
                    onChange={(e) => setLine(i, { category: e.target.value as SettlementLine["category"] })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="decimal"
                    className={`${rhInput} mt-0 text-right`}
                    value={String(l.amount)}
                    onChange={(e) => setLine(i, { amount: Number(e.target.value.replace(",", ".")) || 0 })}
                  />
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() =>
                      setDraft({ ...draft, settlement_lines: draft.settlement_lines.filter((_, j) => j !== i) })
                    }
                  >
                    {bi("Retirer", "حذف")}
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      settlement_lines: [
                        ...draft.settlement_lines,
                        { code: "AUTRE", label_fr: "", label_ar: "", category: "1", amount: 0 },
                      ],
                    })
                  }
                >
                  {bi("Ajouter un élément", "إضافة عنصر")}
                </Button>
                <p className="text-sm">
                  {bi("Total", "المجموع")} : <strong className="tabular-nums">{money(total)} DA</strong>
                </p>
              </div>
              <p className="text-xs text-foreground/55">
                {bi(
                  "Montant négatif = retenue. Classe 1 : soumis aux cotisations et à l'IRG ; classe 4 : versé tel quel (ex. indemnité de licenciement).",
                  "",
                )}
              </p>
            </div>
          </div>
        </RhModal>
      ) : null}

      {letter ? (
        <HrLetterDialog employeeId={letter.employeeId} kind={letter.kind} onClose={() => setLetter(null)} />
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ToolbarSlot } from "@/components/layout/arrange";
import {
  deleteSalaryException,
  setSalaryExceptionStatus,
  upsertSalaryException,
  type SalaryExceptionRow,
} from "@/lib/actions/hr-exceptions";
import type { SalaryRubrique } from "@/lib/actions/hr-salary";
import { RETENUE_CATEGORY, sortBySalaryClass, type SalaryCategory } from "@/lib/hr/payroll-calc";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import {
  RhAlert,
  RhChip,
  RhField,
  RhModal,
  RhPageHeader,
  bi,
  rhInput,
} from "@/components/rh/rh-ui";
import { SALARY_CLASSES, classTitle } from "@/components/rh/contract-salary-fields";
import {
  VALUE_MODES,
  applyValueMode,
  valueModeLabel,
  valueModeSelectValue,
  valueSuffix,
  type SalaryUnit,
} from "@/lib/hr/salary-value-mode";

type Emp = { id: string; label: string };

const col = dataColumns<SalaryExceptionRow>();

function statusLabel(status: SalaryExceptionRow["status_code"]) {
  return status === "APPROVED"
    ? bi("Approuvée", "معتمدة")
    : status === "CANCELLED"
      ? bi("Annulée", "ملغاة")
      : bi("Brouillon", "مسودة");
}

type FormState = {
  id?: string;
  employee_id: string;
  category: SalaryCategory;
  rubrique_id: string;
  amount: string;
  unit: SalaryUnit;
  period_year: number;
  period_month: number;
  duration_mode: "once" | "until";
  until_year: string;
  until_month: string;
  reason: string;
  status_code: "DRAFT" | "APPROVED" | "CANCELLED";
};

function emptyForm(year: number, month: number): FormState {
  return {
    employee_id: "",
    category: "1",
    rubrique_id: "",
    amount: "",
    unit: "month",
    period_year: year,
    period_month: month,
    duration_mode: "once",
    until_year: "",
    until_month: "",
    reason: "",
    status_code: "DRAFT",
  };
}

export function ExceptionsManager({
  initialRows,
  employees,
  rubriques,
  canEdit,
  currentUserId = null,
  canApproveOwn = false,
  year,
  month,
  loadError,
}: {
  initialRows: SalaryExceptionRow[];
  employees: Emp[];
  rubriques: SalaryRubrique[];
  canEdit: boolean;
  currentUserId?: string | null;
  canApproveOwn?: boolean;
  year: number;
  month: number;
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(year, month));
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const classRubriques = useMemo(
    () =>
      sortBySalaryClass(
        rubriques.filter((r) => r.is_active && r.category === form.category),
      ),
    [rubriques, form.category],
  );

  function openNew() {
    setForm(emptyForm(year, month));
    setError(null);
    setOpen(true);
  }

  function decide(row: SalaryExceptionRow, status: "APPROVED" | "CANCELLED") {
    let note: string | undefined;
    if (status === "CANCELLED") {
      const answer = window.prompt(bi("Motif de l'annulation (facultatif)", "سبب الإلغاء (اختياري)"), "");
      if (answer === null) return;
      note = answer;
    }
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await setSalaryExceptionStatus({ id: row.id, status_code: status, note });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data.result === "SHORTENED") {
        setInfo(
          bi(
            "Mois déjà validés conservés : l'exception est arrêtée au dernier mois figé.",
            "الأشهر المعتمدة محفوظة: أوقف الاستثناء عند آخر شهر مجمّد.",
          ),
        );
        window.location.reload();
        return;
      }
      setRows((prev) =>
        prev.map((x) =>
          x.id === row.id
            ? {
                ...x,
                status_code: r.data.result === "APPROVED" ? "APPROVED" : "CANCELLED",
                approved_by: status === "APPROVED" ? currentUserId : x.approved_by,
                approved_at: status === "APPROVED" ? new Date().toISOString() : x.approved_at,
                approver_name: status === "APPROVED" ? bi("vous", "أنت") : x.approver_name,
                decided_note: note?.trim() || x.decided_note,
              }
            : x,
        ),
      );
    });
  }

  function remove(row: SalaryExceptionRow) {
    if (!window.confirm(bi("Supprimer ce brouillon ?", "حذف هذه المسودة؟"))) return;
    setError(null);
    start(async () => {
      const r = await deleteSalaryException(row.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRows((prev) => prev.filter((x) => x.id !== row.id));
    });
  }

  function submit() {
    setError(null);
    if (!form.employee_id) {
      setError(bi("Choisissez l'employé.", "اختر العامل."));
      return;
    }
    if (!form.rubrique_id) {
      setError(bi("Choisissez la rubrique.", "اختر البند."));
      return;
    }
    if (!form.reason.trim() || form.reason.trim().length < 8) {
      setError(bi("Motif obligatoire (8 caractères).", "السبب إلزامي (8 أحرف)."));
      return;
    }
    start(async () => {
      const result = await upsertSalaryException({
        id: form.id,
        employee_id: form.employee_id,
        rubrique_id: form.rubrique_id,
        amount: Number(form.amount || 0),
        unit: form.unit,
        period_year: form.period_year,
        period_month: form.period_month,
        duration_mode: form.duration_mode,
        until_year: form.duration_mode === "until" ? Number(form.until_year || 0) : null,
        until_month: form.duration_mode === "until" ? Number(form.until_month || 0) : null,
        reason: form.reason,
        status_code: form.status_code,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setInfo(bi("Brouillon enregistré : il doit être approuvé pour entrer en paie.", "حُفظت المسودة: يجب اعتمادها لتدخل الأجر."));
      window.location.reload();
    });
  }

  function rowUnit(row: SalaryExceptionRow) {
    return row.unit ?? rubriques.find((r) => r.id === row.rubrique_id)?.unit ?? "month";
  }

  const columns = [
    col.accessor("employee_label", { header: bi("Employé", "العامل") }),
    col.accessor((r) => `${r.rubrique_code} · ${r.rubrique_label_fr}`, {
      id: "rubrique",
      header: bi("Rubrique", "البند"),
      cell: ({ row: { original: row } }) => (
        <>
          {row.rubrique_code} · {row.rubrique_label_fr}
          <span className="mt-0.5 block text-xs" dir="rtl">
            {row.rubrique_label_ar}
          </span>
          <span className="text-[11px] text-foreground/55">{classTitle(row.category)}</span>
        </>
      ),
    }),
    col.accessor((r) => r.period_year * 100 + r.period_month, {
      id: "period",
      header: bi("Période", "الفترة"),
      cell: ({ row: { original: row } }) => (
        <>
          {String(row.period_month).padStart(2, "0")}/{row.period_year}
          {row.duration_mode === "until" && row.until_year
            ? ` → ${String(row.until_month).padStart(2, "0")}/${row.until_year}`
            : ` · ${bi("une fois", "مرة واحدة")}`}
          <span className="mt-0.5 block text-xs text-foreground/60">{row.reason}</span>
        </>
      ),
    }),
    col.accessor("amount", {
      header: bi("Montant", "المبلغ"),
      meta: { className: "font-mono" },
      cell: ({ row: { original: row } }) => (
        <>
          {row.amount} {valueSuffix(rowUnit(row))}
          <span className="mt-0.5 block text-[11px] font-sans text-foreground/55">{valueModeLabel(rowUnit(row), bi)}</span>
        </>
      ),
    }),
    col.accessor((r) => statusLabel(r.status_code), {
      id: "status",
      header: bi("Statut", "الحالة"),
      cell: ({ row: { original: row } }) => (
        <>
          <RhChip
            tone={row.status_code === "APPROVED" ? "success" : row.status_code === "CANCELLED" ? "danger" : "warning"}
          >
            {statusLabel(row.status_code)}
          </RhChip>
          <span className="mt-1 block text-[11px] text-foreground/55">
            {bi("Saisie", "أدخلها")} : {row.creator_name ?? "—"}
          </span>
          {row.approved_at ? (
            <span className="block text-[11px] text-foreground/55">
              {bi("Approuvée par", "اعتمدها")} {row.approver_name ?? row.grantor_name ?? "—"} ·{" "}
              {new Date(row.approved_at).toLocaleDateString("fr-FR")}
            </span>
          ) : null}
          {row.decided_note ? (
            <span className="block text-[11px] italic text-foreground/55">{row.decided_note}</span>
          ) : null}
        </>
      ),
    }),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: row } }) =>
        canEdit ? (
          <div className="flex flex-wrap gap-1">
            {row.status_code === "DRAFT" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setForm({
                    id: row.id,
                    employee_id: row.employee_id,
                    category: row.category,
                    rubrique_id: row.rubrique_id,
                    amount: String(row.amount),
                    unit: rowUnit(row),
                    period_year: row.period_year,
                    period_month: row.period_month,
                    duration_mode: row.duration_mode,
                    until_year: row.until_year ? String(row.until_year) : "",
                    until_month: row.until_month ? String(row.until_month) : "",
                    reason: row.reason,
                    status_code: row.status_code,
                  });
                  setOpen(true);
                }}
              >
                {bi("Modifier", "تعديل")}
              </Button>
            ) : null}
            {row.status_code === "DRAFT" ? (
              row.created_by === currentUserId && !canApproveOwn ? (
                <span className="self-center text-[11px] text-foreground/55">
                  {bi("À approuver par un autre responsable", "ينتظر اعتماد مسؤول آخر")}
                </span>
              ) : (
                <Button disabled={pending} onClick={() => decide(row, "APPROVED")}>
                  {bi("Approuver", "اعتماد")}
                </Button>
              )
            ) : null}
            {row.status_code === "DRAFT" ? (
              <Button variant="ghost" disabled={pending} onClick={() => remove(row)}>
                {bi("Supprimer", "حذف")}
              </Button>
            ) : null}
            {row.status_code === "APPROVED" ? (
              <Button variant="secondary" disabled={pending} onClick={() => decide(row, "CANCELLED")}>
                {bi("Annuler", "إلغاء")}
              </Button>
            ) : null}
          </div>
        ) : (
          "—"
        ),
    }),
  ];

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Rubriques exceptionnelles", "بنود الأجر الاستثنائية")}
        description={bi(
          "Hors contrat permanent. Motif et période obligatoires. Saisie en brouillon puis approbation par une autre personne (Gérant / Super admin peuvent approuver leurs propres saisies). Seules les lignes approuvées alimentent le bulletin ; un mois validé ou clôturé ne peut plus être modifié.",
          "خارج العقد الدائم. السبب والفترة إلزاميان. المعتمد فقط يدخل الكشف.",
        )}
        actionsTabset="btn_rh_exceptions"
        actions={
          <>
            <ToolbarSlot id="payroll">
              <Button asChild variant="secondary">
                <Link href="/rh/paie">{bi("Paie", "الأجور")}</Link>
              </Button>
            </ToolbarSlot>
            {canEdit ? (
              <ToolbarSlot id="new">
                <Button onClick={openNew}>{bi("Nouvelle exception", "استثناء جديد")}</Button>
              </ToolbarSlot>
            ) : null}
          </>
        }
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchPlaceholder="Employé, rubrique, motif…"
        searchText={(r) =>
          [r.employee_label, r.rubrique_code, r.rubrique_label_fr, r.rubrique_label_ar, r.reason, statusLabel(r.status_code)]
            .filter(Boolean)
            .join(" ")
        }
        emptyTitle={bi("Aucune exception", "لا استثناءات")}
      />

      {open ? (
        <RhModal
          title={bi("Exception salariale", "استثناء أجري")}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {bi("Fermer", "إغلاق")}
              </Button>
              <Button disabled={pending || !canEdit} onClick={submit}>
                {bi("Enregistrer", "حفظ")}
              </Button>
            </>
          }
        >
          {error ? (
            <div className="mb-3">
              <RhAlert tone="danger">{error}</RhAlert>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label={bi("Employé", "العامل")}>
              <select
                className={rhInput}
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              >
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label={bi("Classe", "الصنف")}>
              <select
                className={rhInput}
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as FormState["category"],
                    rubrique_id: "",
                  })
                }
              >
                {SALARY_CLASSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classTitle(c.id)}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label={bi("Rubrique", "البند")}>
              <select
                className={rhInput}
                value={form.rubrique_id}
                onChange={(e) => {
                  const rub = classRubriques.find((r) => r.id === e.target.value);
                  setForm({
                    ...form,
                    rubrique_id: e.target.value,
                    amount: rub ? String(rub.default_amount || form.amount) : form.amount,
                    unit: rub?.unit ?? form.unit,
                  });
                }}
              >
                <option value="">—</option>
                {classRubriques.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.label_fr} · {r.label_ar}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label={bi("Mode", "الضبط")}>
              <select
                className={rhInput}
                value={valueModeSelectValue(form.unit)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    unit: applyValueMode(
                      e.target.value as "percent" | "month" | "day",
                      form.unit,
                    ),
                  })
                }
              >
                {VALUE_MODES.map((m) => (
                  <option key={m.unit} value={m.unit}>
                    {m.fr} · {m.ar}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField
              label={`${bi("Valeur", "القيمة")} (${valueSuffix(form.unit)})${
                form.category === RETENUE_CATEGORY ? " · " + bi("retenue", "اقتطاع") : ""
              }`}
            >
              <input
                className={rhInput}
                title={
                  form.category === RETENUE_CATEGORY
                    ? "Montant positif, déduit du net sur le bulletin · مبلغ موجب يُقتطع من الصافي في الكشف"
                    : undefined
                }
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Année", "السنة")}>
              <input
                type="number"
                className={rhInput}
                value={form.period_year}
                onChange={(e) => setForm({ ...form, period_year: Number(e.target.value) })}
              />
            </RhField>
            <RhField label={bi("Mois", "الشهر")}>
              <input
                type="number"
                min={1}
                max={12}
                className={rhInput}
                value={form.period_month}
                onChange={(e) => setForm({ ...form, period_month: Number(e.target.value) })}
              />
            </RhField>
            <RhField label={bi("Durée", "المدة")}>
              <select
                className={rhInput}
                value={form.duration_mode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    duration_mode: e.target.value as FormState["duration_mode"],
                  })
                }
              >
                <option value="once">{bi("Une fois ce mois", "مرة واحدة هذا الشهر")}</option>
                <option value="until">{bi("Jusqu'au mois", "حتى الشهر")}</option>
              </select>
            </RhField>
            {form.duration_mode === "until" ? (
              <>
                <RhField label={bi("Fin année", "سنة النهاية")}>
                  <input
                    type="number"
                    className={rhInput}
                    value={form.until_year}
                    onChange={(e) => setForm({ ...form, until_year: e.target.value })}
                  />
                </RhField>
                <RhField label={bi("Fin mois", "شهر النهاية")}>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className={rhInput}
                    value={form.until_month}
                    onChange={(e) => setForm({ ...form, until_month: e.target.value })}
                  />
                </RhField>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <RhField label={bi("Motif obligatoire", "السبب إلزامي")}>
                <textarea
                  className={`${rhInput} h-24 py-2`}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </RhField>
            </div>
          </div>
        </RhModal>
      ) : null}
    </div>
  );
}

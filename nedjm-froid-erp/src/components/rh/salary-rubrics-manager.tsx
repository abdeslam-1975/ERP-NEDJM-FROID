"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteSalaryAssignment,
  deleteSalaryRubrique,
  setSalaryRubriqueActive,
  upsertSalaryAssignment,
  upsertSalaryRubrique,
  type SalaryAssignment,
  type SalaryRubrique,
} from "@/lib/actions/hr-salary";
import {
  applySalaryRubriquesImport,
  downloadSalaryRubriquesTemplate,
  previewSalaryRubriquesFile,
  previewSalaryRubriquesUrl,
} from "@/lib/actions/hr-salary-import";
import {
  previewRubriqueImport,
  type RubriqueDraft,
  type RubriqueImportPreview,
} from "@/lib/hr/salary-rubrique-import";
import {
  RETENUE_CATEGORY,
  salaryClassFlags,
  sortBySalaryClass,
  suggestSalaryClass,
} from "@/lib/hr/payroll-calc";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhField, RhPageHeader, RhPanel, RhTabs, RhToolbar, bi, rhInput } from "@/components/rh/rh-ui";

type Scope = SalaryRubrique["apply_scope"];

export type SalaryTarget = { id: string; label: string };

const emptyRubrique = (): Omit<SalaryRubrique, "id"> & { id: string } => ({
  id: "",
  code: "",
  label_fr: "",
  label_ar: "",
  nature: "indemnite",
  unit: "day",
  category: "1",
  cotisable: true,
  taxable: true,
  apply_scope: "site",
  default_amount: 0,
  sort_order: 10,
  is_active: true,
});

function classPatch(
  category: SalaryRubrique["category"],
  nature: SalaryRubrique["nature"],
): Pick<SalaryRubrique, "category" | "cotisable" | "taxable" | "nature"> {
  return {
    category,
    ...salaryClassFlags(category),
    nature: category === RETENUE_CATEGORY ? "retenue" : nature,
  };
}

function scopeLabel(scope: Scope) {
  if (scope === "employee") return bi("Employé", "العامل");
  if (scope === "site") return bi("Chantier", "الورشة");
  if (scope === "poste") return bi("Poste", "المنصب");
  return bi("Contrat", "العقد");
}

function levelOf(row: SalaryAssignment): Scope {
  if (row.employee_id) return "employee";
  if (row.contract_id) return "contract";
  if (row.poste_id) return "poste";
  return "site";
}

function unitLabel(unit: SalaryRubrique["unit"]) {
  if (unit === "percent") return bi("Pourcentage *%", "نسبة");
  if (unit === "month") return bi("Montant /F", "مبلغ");
  if (unit === "presence_day") return bi("Journalier présence", "برام حضور");
  return bi("Journalier *J", "برام");
}

function importStatusLabel(status: RubriqueImportPreview["status"]) {
  if (status === "new") return bi("Nouveau", "جديد");
  if (status === "update") return bi("Mise à jour", "تحديث");
  if (status === "unchanged") return bi("Inchangé", "دون تغيير");
  return bi("Rejeté", "مرفوض");
}

const rubriqueCol = dataColumns<SalaryRubrique>();

const assignmentCol = dataColumns<SalaryAssignment>();

const importCol = dataColumns<RubriqueImportPreview>();

const importColumns = [
  importCol.accessor((row) => importStatusLabel(row.status), { id: "status", header: bi("Statut", "الحالة") }),
  importCol.accessor("code", { header: "Code", meta: { className: "font-mono text-xs" } }),
  importCol.accessor((row) => row.incoming?.label_fr ?? "—", { id: "label_fr", header: "FR" }),
  importCol.accessor((row) => row.incoming?.label_ar ?? "—", {
    id: "label_ar",
    header: "AR",
    cell: (i) => <span dir="rtl">{i.getValue()}</span>,
  }),
  importCol.accessor((row) => (row.incoming ? scopeLabel(row.incoming.apply_scope) : "—"), {
    id: "apply_scope",
    header: bi("Application", "التطبيق"),
    cell: ({ row }) => (
      <>
        {row.original.incoming ? scopeLabel(row.original.incoming.apply_scope) : "—"}
        {row.original.keep_scope ? ` (${bi("conservé", "محفوظ")})` : ""}
      </>
    ),
  }),
  importCol.accessor((row) => row.reason ?? "", {
    id: "reason",
    header: bi("Note", "ملاحظة"),
    meta: { className: "text-foreground/70" },
  }),
];

function SearchSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: SalaryTarget[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle)).slice(0, 300);
  }, [options, q]);
  const selected = options.find((o) => o.id === value);
  return (
    <div className="space-y-1">
      <input
        className={rhInput}
        disabled={disabled}
        placeholder={bi("Rechercher", "بحث")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className={rhInput}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {selected && !filtered.some((o) => o.id === selected.id) ? (
          <option value={selected.id}>{selected.label}</option>
        ) : null}
        {filtered.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SalaryRubricsManager({
  isSuperAdmin,
  canEditValues = false,
  rubriques,
  assignments,
  employees,
  sites,
  contracts,
  postes = [],
}: {
  isSuperAdmin: boolean;
  canEditValues?: boolean;
  rubriques: SalaryRubrique[];
  assignments: SalaryAssignment[];
  employees: SalaryTarget[];
  sites: SalaryTarget[];
  contracts: SalaryTarget[];
  postes?: SalaryTarget[];
}) {
  const [panel, setPanel] = useState<"dict" | "values" | "import">("dict");
  const [rows, setRows] = useState(rubriques);
  const [values, setValues] = useState(assignments);
  const [form, setForm] = useState(emptyRubrique());
  const [asg, setAsg] = useState<{ id: string; rubrique_id: string; target_id: string; amount: string; level?: Scope }>({
    id: "",
    rubrique_id: "",
    target_id: "",
    amount: "0",
  });
  const [importUrl, setImportUrl] = useState("");
  const [replaceScope, setReplaceScope] = useState(false);
  const [importDrafts, setImportDrafts] = useState<RubriqueDraft[]>([]);
  const [importPreview, setImportPreview] = useState<RubriqueImportPreview[]>([]);
  const [importCounts, setImportCounts] = useState({
    new: 0,
    update: 0,
    unchanged: 0,
    rejected: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canEdit = isSuperAdmin;
  const canValues = isSuperAdmin || canEditValues;

  const sorted = useMemo(
    () => sortBySalaryClass(rows),
    [rows],
  );
  const currentRubrique = rows.find((r) => r.id === asg.rubrique_id) ?? null;
  const optionsFor = (level: Scope) =>
    level === "employee" ? employees : level === "site" ? sites : level === "poste" ? postes : contracts;
  const asgLevel: Scope = asg.level ?? currentRubrique?.apply_scope ?? "site";
  const targetOptions = optionsFor(asgLevel);

  function targetName(row: SalaryAssignment) {
    const id = row.employee_id ?? row.site_id ?? row.contract_id ?? row.poste_id;
    if (!id) return "—";
    return optionsFor(levelOf(row)).find((x) => x.id === id)?.label ?? id;
  }

  const visibleAssignments = useMemo(
    () =>
      values.filter((v) => !asg.rubrique_id || v.rubrique_id === asg.rubrique_id),
    [values, asg.rubrique_id],
  );

  function rubriqueName(row: SalaryAssignment) {
    const rub = rows.find((r) => r.id === row.rubrique_id);
    return rub ? `${rub.code} · ${rub.label_fr} — ${rub.label_ar}` : row.rubrique_id;
  }

  const rubriqueColumns = [
    rubriqueCol.accessor("code", { header: "Code", meta: { className: "font-mono text-xs" } }),
    rubriqueCol.accessor("label_fr", { header: "FR" }),
    rubriqueCol.accessor("label_ar", { header: "AR", cell: (i) => <span dir="rtl">{i.getValue()}</span> }),
    rubriqueCol.accessor((row) => scopeLabel(row.apply_scope), { id: "apply_scope", header: bi("Application", "التطبيق") }),
    rubriqueCol.accessor((row) => unitLabel(row.unit), { id: "unit", header: bi("Unité", "الوحدة") }),
    rubriqueCol.accessor("category", { header: bi("Classe", "الصنف") }),
    rubriqueCol.accessor("default_amount", { header: bi("Défaut", "افتراضي"), meta: { className: "tabular-nums" } }),
    rubriqueCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: row } }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setForm({ ...row });
              setAsg({
                id: "",
                rubrique_id: row.id,
                target_id: "",
                amount: String(row.default_amount || 0),
              });
            }}
          >
            Modifier
          </Button>
          {canEdit ? (
            <>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  start(async () => {
                    const r = await setSalaryRubriqueActive({
                      id: row.id,
                      is_active: !row.is_active,
                    });
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: !x.is_active } : x)));
                  });
                }}
              >
                {row.is_active ? bi("Masquer", "إخفاء") : bi("Afficher", "إظهار")}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (
                    !window.confirm(
                      bi(`Supprimer ${row.label_fr} / ${row.label_ar} et ses valeurs ?`, `حذف ${row.label_ar} وكل قيمه؟`),
                    )
                  )
                    return;
                  start(async () => {
                    const r = await deleteSalaryRubrique(row.id);
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    setRows((prev) => prev.filter((x) => x.id !== row.id));
                    setValues((prev) => prev.filter((x) => x.rubrique_id !== row.id));
                    if (form.id === row.id) setForm(emptyRubrique());
                    setInfo(bi("Rubrique supprimée.", "تم حذف البند."));
                  });
                }}
              >
                {bi("Supprimer", "حذف")}
              </Button>
            </>
          ) : null}
        </div>
      ),
    }),
  ];

  const assignmentColumns = [
    assignmentCol.accessor((row) => rubriqueName(row), { id: "rubrique", header: bi("Rubrique", "البند") }),
    assignmentCol.accessor((row) => scopeLabel(levelOf(row)), { id: "level", header: bi("Application", "التطبيق") }),
    assignmentCol.accessor((row) => targetName(row), { id: "target", header: bi("Cible", "الهدف") }),
    assignmentCol.accessor("amount", { header: bi("Montant", "القيمة"), meta: { className: "tabular-nums" } }),
    assignmentCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: row } }) =>
        canValues ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setAsg({
                  id: row.id,
                  rubrique_id: row.rubrique_id,
                  target_id: row.employee_id ?? row.site_id ?? row.contract_id ?? row.poste_id ?? "",
                  amount: String(row.amount),
                  level: levelOf(row),
                })
              }
            >
              Modifier
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(bi("Supprimer cette valeur ?", "حذف هذه القيمة؟"))) return;
                start(async () => {
                  const r = await deleteSalaryAssignment(row.id);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setValues((prev) => prev.filter((x) => x.id !== row.id));
                  if (asg.id === row.id) {
                    setAsg({ ...asg, id: "", target_id: "", amount: "0" });
                  }
                  setInfo(bi("Valeur supprimée.", "تم حذف القيمة."));
                });
              }}
            >
              {bi("Supprimer", "حذف")}
            </Button>
          </div>
        ) : null,
    }),
  ];

  function saveRubrique() {
    setError(null);
    if (!canEdit) return;
    if (!form.code.trim() || !form.label_fr.trim() || !form.label_ar.trim()) {
      setError(bi("Saisissez le code et les deux libellés.", "أدخل الرمز والتسميتين."));
      return;
    }
    start(async () => {
      const result = await upsertSalaryRubrique({
        id: form.id || undefined,
        code: form.code,
        label_ar: form.label_ar,
        label_fr: form.label_fr,
        nature: form.nature,
        unit: form.unit,
        category: form.category,
        cotisable: form.cotisable,
        taxable: form.taxable,
        apply_scope: form.apply_scope,
        default_amount: Number(form.default_amount || 0),
        sort_order: form.sort_order,
        is_active: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next: SalaryRubrique = {
        ...form,
        id: result.data.id,
        code: form.code.trim().toUpperCase(),
        is_active: true,
      };
      setRows((prev) => [...prev.filter((x) => x.id !== result.data.id), next]);
      if (result.data.cleared_assignments) {
        setValues((prev) => prev.filter((v) => v.rubrique_id !== result.data.id));
        setInfo(
          bi(
            "Rubrique enregistrée. Les anciennes valeurs ont été effacées car le niveau d'application a changé.",
            "تم حفظ البند ومُسحت القيم القديمة لأن مستوى التطبيق تغيّر.",
          ),
        );
      } else {
        setInfo(bi("Rubrique enregistrée.", "تم حفظ البند."));
      }
      setForm(emptyRubrique());
    });
  }

  function saveAssignment() {
    setError(null);
    if (!canValues) return;
    if (!asg.rubrique_id || !asg.target_id) {
      setError(
        bi(
          "Choisissez la rubrique et la cible (employé, chantier ou contrat).",
          "اختر البند والهدف (عامل أو ورشة أو عقد).",
        ),
      );
      return;
    }
    start(async () => {
      const result = await upsertSalaryAssignment({
        id: asg.id || undefined,
        rubrique_id: asg.rubrique_id,
        target_id: asg.target_id,
        target_kind: asgLevel,
        amount: Number(asg.amount || 0),
        is_active: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const rub = rows.find((r) => r.id === asg.rubrique_id);
      const next: SalaryAssignment = {
        id: result.data.id,
        rubrique_id: asg.rubrique_id,
        employee_id: asgLevel === "employee" ? asg.target_id : null,
        site_id: asgLevel === "site" ? asg.target_id : null,
        contract_id: asgLevel === "contract" ? asg.target_id : null,
        poste_id: asgLevel === "poste" ? asg.target_id : null,
        amount: Number(asg.amount || 0),
        unit: rub?.unit ?? null,
        is_active: true,
      };
      setValues((prev) => [...prev.filter((x) => x.id !== result.data.id), next]);
      setAsg({ id: "", rubrique_id: asg.rubrique_id, target_id: "", amount: "0", level: asg.level });
      setInfo(bi("Valeur enregistrée.", "تم حفظ القيمة."));
    });
  }

  function acceptPreview(result: {
    rows: RubriqueImportPreview[];
    drafts: RubriqueDraft[];
    counts: { new: number; update: number; unchanged: number; rejected: number };
  }) {
    setImportDrafts(result.drafts);
    setImportPreview(result.rows);
    setImportCounts(result.counts);
  }

  function toggleReplaceScope(next: boolean) {
    setReplaceScope(next);
    if (!importDrafts.length) return;
    const rejected = importPreview
      .filter((r) => r.status === "rejected")
      .map((r) => ({ code: r.code, error: r.reason ?? "" }));
    const rowsPreview = previewRubriqueImport(importDrafts, rejected, rows, next);
    setImportPreview(rowsPreview);
    setImportCounts({
      new: rowsPreview.filter((r) => r.status === "new").length,
      update: rowsPreview.filter((r) => r.status === "update").length,
      unchanged: rowsPreview.filter((r) => r.status === "unchanged").length,
      rejected: rowsPreview.filter((r) => r.status === "rejected").length,
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Rubriques de salaire", "بنود الأجر")}
        description={
          <>
            SUPER_ADMIN définit si la rubrique s&apos;applique au contrat, au chantier ou à
            l&apos;employé, puis gère le dictionnaire et les valeurs (ajout, modification,
            suppression).
            <span className="mt-1 block" dir="rtl">
              يحدد المشرف إن كان البند يُطبَّق على العقد أو الورشة أو العامل، ثم يضبط القاموس والقيم
              إضافةً وتعديلاً وحذفاً.
            </span>
          </>
        }
      />
      {!canEdit && !canValues ? (
        <RhAlert tone="warning">{bi("Consultation uniquement.", "العرض فقط.")}</RhAlert>
      ) : !canEdit ? (
        <RhAlert tone="warning">
          {bi(
            "Le dictionnaire reste SUPER_ADMIN. Vous pouvez saisir les montants (contrat / chantier / employé).",
            "القاموس يبقى لـ SUPER_ADMIN. يمكنك إدخال المبالغ (عقد / ورشة / عامل).",
          )}
        </RhAlert>
      ) : null}
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

      <RhTabs
        uiKey="salary_rubrics"
        items={[
          { id: "dict", label: bi("Dictionnaire", "القاموس") },
          { id: "values", label: bi("Valeurs", "القيم والمدخلات") },
          ...(canEdit ? [{ id: "import", label: bi("Import", "استيراد") }] : []),
        ]}
        value={panel}
        onChange={(id) => setPanel(id as typeof panel)}
      />

      {panel === "import" ? (
        <>
          <RhPanel className="space-y-4">
            <p className="text-sm text-foreground/60">
              Importez un Excel téléchargé depuis le site de la CNAS ou des impôts, ou collez
              l&apos;URL d&apos;un fichier public. Prévisualisation puis confirmation. Aucune
              rubrique absente du fichier n&apos;est supprimée. Le niveau d&apos;application ne
              change que si vous cochez l&apos;option.
              <span className="mt-1 block" dir="rtl">
                رفع إكسل نزّلتموه من موقع الصندوق أو الضرائب، أو لصق رابط ملف عام. المعاينة ثم
                التأكيد. لا يُحذف بند غائب عن الملف، ومستوى التطبيق لا يتغيّر إلا إذا فعّلتم الخانة.
              </span>
            </p>
            <RhToolbar>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  start(async () => {
                    const result = await downloadSalaryRubriquesTemplate();
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    const bin = atob(result.data.base64);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
                    const blob = new Blob([bytes], {
                      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = result.data.filename;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    setInfo(bi("Modèle téléchargé.", "تم تنزيل القالب."));
                  });
                }}
              >
                Télécharger le modèle
              </Button>
              <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-border/70 bg-surface px-4 text-sm font-semibold transition hover:bg-surface-muted">
                Charger Excel
                <input
                  type="file"
                  accept=".xlsx,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const data = new FormData();
                    data.set("file", file);
                    data.set("replace_scope", String(replaceScope));
                    start(async () => {
                      setError(null);
                      const result = await previewSalaryRubriquesFile(data);
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      acceptPreview(result.data);
                      setInfo(
                        bi(
                          `Aperçu : ${result.data.counts.new} nouveau(x), ${result.data.counts.update} mise(s) à jour, ${result.data.counts.unchanged} inchangé(s), ${result.data.counts.rejected} rejeté(s).`,
                          `معاينة: ${result.data.counts.new} جديد، ${result.data.counts.update} تحديث، ${result.data.counts.unchanged} دون تغيير، ${result.data.counts.rejected} مرفوض.`,
                        ),
                      );
                    });
                  }}
                />
              </label>
            </RhToolbar>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <RhField label={bi("URL d'un fichier public", "رابط ملف عام")}>
                <input
                  className={rhInput}
                  dir="ltr"
                  placeholder="https://…"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                />
              </RhField>
              <div className="flex items-end">
                <Button
                  disabled={pending}
                  onClick={() => {
                    if (!importUrl.trim()) {
                      setError(bi("Saisissez l'URL.", "أدخل الرابط."));
                      return;
                    }
                    start(async () => {
                      setError(null);
                      const result = await previewSalaryRubriquesUrl({
                        url: importUrl,
                        replace_scope: replaceScope,
                      });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      acceptPreview(result.data);
                      setInfo(
                        bi(
                          `Aperçu : ${result.data.counts.new} nouveau(x), ${result.data.counts.update} mise(s) à jour, ${result.data.counts.unchanged} inchangé(s), ${result.data.counts.rejected} rejeté(s).`,
                          `معاينة: ${result.data.counts.new} جديد، ${result.data.counts.update} تحديث، ${result.data.counts.unchanged} دون تغيير، ${result.data.counts.rejected} مرفوض.`,
                        ),
                      );
                    });
                  }}
                >
                  Importer depuis l&apos;URL
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceScope}
                onChange={(e) => toggleReplaceScope(e.target.checked)}
              />
              {bi(
                "Remplacer le niveau d'application (chantier / contrat / employé) s'il figure dans le fichier",
                "استبدال مستوى التطبيق (ورشة / عقد / عامل) إن وُجد في الملف",
              )}
            </label>
            {importPreview.length ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending || importCounts.new + importCounts.update === 0}
                  onClick={() => {
                    start(async () => {
                      const result = await applySalaryRubriquesImport({
                        replace_scope: replaceScope,
                        drafts: importDrafts,
                      });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      if (result.data.items.length) setRows(result.data.items);
                      setImportPreview([]);
                      setImportDrafts([]);
                      setInfo(
                        bi(
                          `Import terminé : ${result.data.inserted} créé(s), ${result.data.updated} mis à jour.`,
                          `تم الاستيراد: ${result.data.inserted} جديد، ${result.data.updated} محدَّث.`,
                        ) +
                          (result.data.cleared_assignments
                            ? ` ${bi(
                                `Valeurs effacées pour ${result.data.cleared_assignments} rubrique(s) (changement de niveau).`,
                                `أُفرغت قيم ${result.data.cleared_assignments} بنداً لتغيّر مستوى التطبيق.`,
                              )}`
                            : ""),
                      );
                    });
                  }}
                >
                  Confirmer l&apos;import
                </Button>
                <p className="self-center text-xs text-foreground/60">
                  {importCounts.new} {bi("nouveau", "جديد")} · {importCounts.update}{" "}
                  {bi("maj", "تحديث")} · {importCounts.unchanged} {bi("inchangé", "دون تغيير")} ·{" "}
                  {importCounts.rejected} {bi("rejeté", "مرفوض")}
                </p>
              </div>
            ) : null}
          </RhPanel>
          {importPreview.length ? (
            <DataTable
              data={importPreview}
              columns={importColumns}
              getRowId={(row) => `${row.status}-${row.code}`}
              searchPlaceholder={bi("Rechercher une rubrique…", "بحث")}
              searchText={(row) => [row.code, row.incoming?.label_fr, row.incoming?.label_ar, row.reason].filter(Boolean).join(" ")}
            />
          ) : null}
        </>
      ) : panel === "dict" ? (
        <>
          <RhPanel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RhField label="Code">
                <input
                  className={rhInput}
                  disabled={!canEdit}
                  value={form.code}
                  placeholder="302"
                  onChange={(e) => {
                    const code = e.target.value;
                    const suggested = form.id ? null : suggestSalaryClass(code);
                    setForm({
                      ...form,
                      code,
                      ...(suggested ? classPatch(suggested, form.nature) : {}),
                    });
                  }}
                />
              </RhField>
              <RhField label={bi("Libellé FR", "التسمية الفرنسية")}>
                <input
                  className={rhInput}
                  disabled={!canEdit}
                  value={form.label_fr}
                  onChange={(e) => setForm({ ...form, label_fr: e.target.value })}
                />
              </RhField>
              <RhField label={bi("Libellé AR", "التسمية العربية")}>
                <input
                  dir="rtl"
                  className={rhInput}
                  disabled={!canEdit}
                  value={form.label_ar}
                  onChange={(e) => setForm({ ...form, label_ar: e.target.value })}
                />
              </RhField>
              <RhField label={bi("S'applique à", "يُطبَّق على")}>
                <select
                  className={rhInput}
                  disabled={!canEdit}
                  value={form.apply_scope}
                  onChange={(e) =>
                    setForm({ ...form, apply_scope: e.target.value as Scope })
                  }
                >
                  <option value="site">{bi("Chantier", "الورشة")}</option>
                  <option value="contract">{bi("Contrat", "العقد")}</option>
                  <option value="employee">{bi("Employé", "العامل")}</option>
                  <option value="poste">{bi("Poste", "المنصب")}</option>
                </select>
              </RhField>
              <RhField label={bi("Nature", "النوع")}>
                <select
                  className={rhInput}
                  disabled={!canEdit}
                  value={form.nature}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      nature: e.target.value as SalaryRubrique["nature"],
                    })
                  }
                >
                  <option value="indemnite">{bi("Indemnité", "تعويض")}</option>
                  <option value="prime">{bi("Prime", "منحة")}</option>
                  <option value="rappel">{bi("Rappel", "تدارك")}</option>
                  <option value="remboursement">{bi("Remboursement", "استرجاع")}</option>
                  <option value="retenue">{bi("Retenue", "اقتطاع")}</option>
                </select>
              </RhField>
              <RhField label={bi("Mode (نسبة / مبلغ / برام)", "الضبط")}>
                <select
                  className={rhInput}
                  disabled={!canEdit}
                  value={form.unit === "presence_day" ? "presence_day" : form.unit}
                  onChange={(e) =>
                    setForm({ ...form, unit: e.target.value as SalaryRubrique["unit"] })
                  }
                >
                  <option value="percent">{bi("Pourcentage *%", "نسبة")}</option>
                  <option value="month">{bi("Montant /F", "مبلغ")}</option>
                  <option value="day">{bi("Journalier *J", "برام")}</option>
                  <option value="presence_day">{bi("Journalier présence", "برام حضور")}</option>
                </select>
              </RhField>
              <RhField label={bi("Classe fiscale", "الصنف الضريبي")}>
                <select
                  className={rhInput}
                  disabled={!canEdit}
                  value={form.category}
                  onChange={(e) => {
                    const category = e.target.value as SalaryRubrique["category"];
                    setForm({ ...form, ...classPatch(category, form.nature) });
                  }}
                >
                  <option value="1">1 · CNAS + IRG</option>
                  <option value="2">2 · CNAS</option>
                  <option value="3">3 · IRG</option>
                  <option value="4">4 · {bi("Ni CNAS ni IRG", "لا ضمان ولا ضريبة")}</option>
                  <option value="5">5 · {bi("Retenues", "الاقتطاعات")}</option>
                </select>
              </RhField>
              <RhField
                label={
                  form.category === RETENUE_CATEGORY
                    ? bi("Montant positif (retenu du net)", "مبلغ موجب (يُقتطع من الصافي)")
                    : bi("Montant par défaut", "قيمة افتراضية")
                }
              >
                <input
                  className={rhInput}
                  disabled={!canEdit}
                  type="number"
                  value={form.default_amount}
                  onChange={(e) =>
                    setForm({ ...form, default_amount: Number(e.target.value || 0) })
                  }
                />
              </RhField>
              <label className="mt-6 flex items-center gap-2 text-sm text-foreground/70">
                <input type="checkbox" disabled checked={form.cotisable} readOnly />
                {bi("Cotisable CNAS (classe)", "خاضع للضمان حسب الصنف")}
              </label>
              <label className="mt-6 flex items-center gap-2 text-sm text-foreground/70">
                <input type="checkbox" disabled checked={form.taxable} readOnly />
                {bi("Imposable IRG (classe)", "خاضع للضريبة حسب الصنف")}
              </label>
            </div>
            {canEdit ? (
              <div className="mt-4 flex gap-2">
                <Button disabled={pending} onClick={saveRubrique}>
                  {form.id
                    ? bi("Modifier la rubrique", "تعديل البند")
                    : bi("Ajouter une rubrique", "إضافة بند")}
                </Button>
                {form.id ? (
                  <Button variant="secondary" onClick={() => setForm(emptyRubrique())}>
                    {bi("Nouveau", "جديد")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </RhPanel>

          <DataTable
            data={sorted}
            columns={rubriqueColumns}
            getRowId={(row) => row.id}
            searchPlaceholder={bi("Rechercher une rubrique…", "بحث")}
            searchText={(row) => [row.code, row.label_fr, row.label_ar].join(" ")}
            rowClassName={(row) => (row.is_active ? undefined : "opacity-50")}
            emptyTitle={bi("Aucune rubrique pour le moment.", "لا توجد بنود بعد.")}
          />
        </>
      ) : (
        <>
          <RhPanel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RhField label={bi("Rubrique", "البند")}>
                <select
                  className={rhInput}
                  disabled={!canValues}
                  value={asg.rubrique_id}
                  onChange={(e) =>
                    setAsg({
                      id: "",
                      rubrique_id: e.target.value,
                      target_id: "",
                      amount: String(
                        rows.find((r) => r.id === e.target.value)?.default_amount ?? 0,
                      ),
                    })
                  }
                >
                  <option value="">—</option>
                  {sorted
                    .filter((r) => r.is_active)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {r.label_fr} — {r.label_ar} · {scopeLabel(r.apply_scope)}
                      </option>
                    ))}
                </select>
              </RhField>
              <RhField label={bi("Niveau", "المستوى")} hint="Priorité : employé > contrat > poste > chantier">
                <select
                  className={rhInput}
                  disabled={!canValues || !currentRubrique}
                  value={asgLevel}
                  onChange={(e) => setAsg({ ...asg, level: e.target.value as Scope, target_id: "" })}
                >
                  <option value="site">{bi("Chantier", "الورشة")}</option>
                  {postes.length ? <option value="poste">{bi("Poste", "المنصب")}</option> : null}
                  <option value="contract">{bi("Contrat", "العقد")}</option>
                  <option value="employee">{bi("Employé", "العامل")}</option>
                </select>
              </RhField>
              <RhField label={`${bi("Cible", "الهدف")} (${scopeLabel(asgLevel)})`}>
                <SearchSelect
                  options={targetOptions}
                  value={asg.target_id}
                  disabled={!canValues || !currentRubrique}
                  onChange={(id) => setAsg({ ...asg, target_id: id })}
                />
              </RhField>
              <RhField label={bi("Montant", "القيمة")}>
                <input
                  className={rhInput}
                  disabled={!canValues}
                  type="number"
                  value={asg.amount}
                  onChange={(e) => setAsg({ ...asg, amount: e.target.value })}
                />
              </RhField>
            </div>
            {canValues ? (
              <div className="mt-4 flex gap-2">
                <Button disabled={pending} onClick={saveAssignment}>
                  {asg.id
                    ? bi("Modifier la valeur", "تعديل القيمة")
                    : bi("Ajouter une valeur", "إضافة قيمة")}
                </Button>
                {asg.id ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setAsg({
                        id: "",
                        rubrique_id: asg.rubrique_id,
                        target_id: "",
                        amount: "0",
                      })
                    }
                  >
                    {bi("Nouveau", "جديد")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </RhPanel>

          <DataTable
            data={visibleAssignments}
            columns={assignmentColumns}
            getRowId={(row) => row.id}
            searchPlaceholder={bi("Rechercher une rubrique ou une cible…", "بحث")}
            searchText={(row) => `${rubriqueName(row)} ${targetName(row)}`}
            emptyTitle={bi("Aucune valeur.", "لا توجد قيم بعد.")}
            emptyBody={bi(
              "Ajoutez un montant pour l'employé, le chantier ou le contrat selon la rubrique.",
              "أضف قيمة للعامل أو الورشة أو العقد حسب ضبط البند.",
            )}
          />
        </>
      )}
    </div>
  );
}

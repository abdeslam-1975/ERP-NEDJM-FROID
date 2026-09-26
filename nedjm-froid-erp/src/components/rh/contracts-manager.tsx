"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  upsertHrContract,
  type HrContractRow,
} from "@/lib/actions/hr-contracts";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import type { SalaryAssignment, SalaryRubrique } from "@/lib/actions/hr-salary";
import type { LegalVarRow } from "@/lib/actions/hr-legal-vars";
import type { IrgCatalog } from "@/lib/actions/hr-irg";
import { Button } from "@/components/ui/button";
import {
  CatalogSelect,
  RhAlert,
  RhField,
  RhModal,
  RhPageHeader,
  RhTableWrap,
  RhTabs,
  bi,
  catalogOptions,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";
import { ContractSalaryFields, type SelectedSalaryLine } from "@/components/rh/contract-salary-fields";
import { LegalSettings } from "@/components/rh/legal-settings";
import { ContractComplianceCards } from "@/components/rh/contract-compliance-cards";
import {
  SalaryRubricsManager,
  type SalaryTarget,
} from "@/components/rh/salary-rubrics-manager";

type SiteOpt = {
  id: string;
  name_fr: string;
  is_active: boolean;
  activity_code_id?: string | null;
};
type ActivityOpt = { id: string; code: string; label_fr: string };

type FormState = {
  id?: string;
  employee_id: string;
  site_id: string;
  activity_code_id: string;
  contract_type_code: string;
  work_regime_code: string;
  qualification_code: string;
  poste_fr: string;
  poste_ar: string;
  affectation_principale: boolean;
  salaire_base_monthly: string;
  salaire_net_ref_monthly: string;
  salaire_net_recup_monthly: string;
  start_date: string;
  end_date: string;
  status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ENDED";
};

const emptyForm = (): FormState => ({
  employee_id: "",
  site_id: "",
  activity_code_id: "",
  contract_type_code: "",
  work_regime_code: "",
  qualification_code: "",
  poste_fr: "",
  poste_ar: "",
  affectation_principale: true,
  salaire_base_monthly: "",
  salaire_net_ref_monthly: "",
  salaire_net_recup_monthly: "",
  start_date: "",
  end_date: "",
  status: "DRAFT",
});

export function ContractsManager({
  initialContracts,
  employees,
  sites,
  activities,
  catalogs,
  rubriques,
  assignments,
  salaryEmployees = [],
  salarySites = [],
  salaryContracts = [],
  legalVars = [],
  irgCatalog = { versions: [], brackets: [], ruleSets: [], rules: [] },
  isSuperAdmin = false,
  canEditSalaryValues = false,
  legalError,
  loadError,
}: {
  initialContracts: HrContractRow[];
  employees: HrEmployeeRow[];
  sites: readonly SiteOpt[];
  activities: readonly ActivityOpt[];
  catalogs: CatalogItem[];
  rubriques: SalaryRubrique[];
  assignments: SalaryAssignment[];
  salaryEmployees?: SalaryTarget[];
  salarySites?: SalaryTarget[];
  salaryContracts?: SalaryTarget[];
  legalVars?: LegalVarRow[];
  irgCatalog?: IrgCatalog;
  isSuperAdmin?: boolean;
  canEditSalaryValues?: boolean;
  legalError?: string;
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialContracts);
  const [asgRows, setAsgRows] = useState(assignments);
  const [open, setOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"contrat" | "rubriques" | "legal">("contrat");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selectedLines, setSelectedLines] = useState<Record<string, SelectedSalaryLine>>({});
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const jobs = useMemo(() => catalogOptions(catalogs, "job_title"), [catalogs]);

  function openModal(next: FormState, lines: Record<string, SelectedSalaryLine>) {
    setForm(next);
    setSelectedLines(lines);
    setModalTab("contrat");
    setOpen(true);
  }

  function defaultContractLines() {
    const next: Record<string, SelectedSalaryLine> = {};
    for (const r of rubriques) {
      if (r.is_active && r.apply_scope !== "site" && r.default_amount > 0) {
        next[r.id] = { amount: String(r.default_amount), unit: r.unit };
      }
    }
    return next;
  }

  function linesForContract(contractId: string, employeeId: string) {
    const next: Record<string, SelectedSalaryLine> = {};
    for (const a of asgRows) {
      if (!a.is_active) continue;
      if (a.contract_id === contractId || a.employee_id === employeeId) {
        const rub = rubriques.find((r) => r.id === a.rubrique_id);
        next[a.rubrique_id] = {
          amount: String(a.amount),
          unit: a.unit ?? rub?.unit ?? "month",
        };
      }
    }
    return next;
  }

  function submit() {
    setError(null);
    if (!form.employee_id) {
      setError(bi("Choisissez l'employé.", "اختر العامل."));
      return;
    }
    if (!form.site_id) {
      setError(bi("Choisissez le chantier.", "اختر الورشة."));
      return;
    }
    if (!form.activity_code_id) {
      setError(
        bi(
          "Activité vide. Choisissez-la, ou renseignez-la sur la fiche chantier.",
          "حقل النشاط فارغ. اختر النشاط، أو راجع بطاقة الورشة في المراجع وعيّن لها نشاطاً.",
        ),
      );
      return;
    }
    if (!form.start_date) {
      setError(bi("Date de début obligatoire.", "أدخل تاريخ بداية العقد."));
      return;
    }
    start(async () => {
      const salary_lines = Object.entries(selectedLines).map(([rubrique_id, line]) => ({
        rubrique_id,
        amount: Number(line.amount || 0),
        unit: line.unit,
      }));
      const result = await upsertHrContract({
        ...form,
        salaire_base_monthly: Number(form.salaire_base_monthly || 0),
        salaire_net_ref_monthly: Number(form.salaire_net_ref_monthly || 0),
        salaire_net_recup_monthly: form.salaire_net_recup_monthly
          ? Number(form.salaire_net_recup_monthly)
          : null,
        end_date: form.end_date || null,
        salary_lines,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const emp = employees.find((e) => e.id === form.employee_id);
      const site = sites.find((s) => s.id === form.site_id);
      const next: HrContractRow = {
        id: result.data.id,
        employee_id: form.employee_id,
        site_id: form.site_id,
        activity_code_id: form.activity_code_id,
        contract_type_code: form.contract_type_code || null,
        work_regime_code: form.work_regime_code || null,
        poste_ar: form.poste_ar || null,
        poste_fr: form.poste_fr || null,
        qualification_code: form.qualification_code || null,
        affectation_principale: form.affectation_principale,
        salaire_base_monthly: Number(form.salaire_base_monthly || 0),
        salaire_net_ref_monthly: Number(form.salaire_net_ref_monthly || 0),
        salaire_net_recup_monthly: form.salaire_net_recup_monthly
          ? Number(form.salaire_net_recup_monthly)
          : null,
        start_date: form.start_date,
        end_date: form.end_date || null,
        status: form.status,
        last_name: emp?.last_name ?? "",
        first_name: emp?.first_name ?? "",
        matricule: emp?.matricule ?? "",
        employee_name: emp ? `${emp.last_name} ${emp.first_name}` : "",
        site_name: site?.name_fr ?? "",
      };
      setRows((prev) => {
        const ended = result.data.closed_previous
          ? prev.map((r) =>
              r.employee_id === form.employee_id &&
              r.id !== next.id &&
              r.affectation_principale &&
              r.status !== "ENDED"
                ? { ...r, status: "ENDED" }
                : r,
            )
          : prev;
        return [next, ...ended.filter((r) => r.id !== next.id)];
      });
      setAsgRows((prev) => {
        const kept = prev.filter(
          (a) => a.contract_id !== next.id && a.employee_id !== form.employee_id,
        );
        const added = salary_lines.flatMap((line) => {
          const rub = rubriques.find((r) => r.id === line.rubrique_id);
          if (!rub || rub.apply_scope === "site") return [];
          return [
            {
              id: `${next.id}-${line.rubrique_id}`,
              rubrique_id: line.rubrique_id,
              employee_id: rub.apply_scope === "employee" ? form.employee_id : null,
              site_id: null,
              contract_id: rub.apply_scope === "contract" ? next.id : null,
              amount: line.amount,
              unit: line.unit ?? rub.unit,
              is_active: true,
            },
          ];
        });
        return [...kept, ...added];
      });
      setOpen(false);
      const saved = result.data.closed_previous
        ? bi(
            "Contrat enregistré. L'ancien contrat principal a été clôturé la veille.",
            "تم حفظ العقد. أُغلق العقد الرئيسي السابق في اليوم السابق.",
          )
        : bi("Contrat enregistré.", "تم حفظ العقد.");
      setInfo(
        result.data.refreshed_slips
          ? `${saved} ${bi(
              "Les bulletins brouillon ont été recalculés avec les nouveaux items.",
              "كشوف المسودة أُعيد حسابها بالبنود الجديدة.",
            )}`
          : `${saved} ${bi(
              "Ouvrez Paie et générez le bulletin pour voir les items.",
              "افتح الأجور وولّد الكشف لرؤية البنود.",
            )}`,
      );
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Contrats de travail", "عقود العمل")}
        description={bi(
          "Le chantier porte l'activité et le CACOBATPH. Les quatre classes de rubriques se règlent dans la fiche contrat. Un contrat brouillon entre aussi dans la paie.",
          "الورشة تحمل النشاط وCACOBATPH. الأصناف الأربعة تُضبط داخل بطاقة العقد. العقد المسودة يدخل أيضاً في كشف الأجر.",
        )}
        actions={
          <>
            <Link
              className="rounded-xl border border-border/70 bg-surface px-3.5 py-2 text-sm font-semibold text-foreground/75 transition hover:bg-surface-muted hover:text-foreground"
              href="/rh/paie/exceptions"
            >
              {bi("Exceptions", "استثناءات")}
            </Link>
            <Button
              onClick={() => {
                openModal(emptyForm(), defaultContractLines());
              }}
            >
              {bi("Nouveau contrat", "عقد جديد")}
            </Button>
          </>
        }
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}
      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              <th className={rhTh()}>{bi("Employé", "العامل")}</th>
              <th className={rhTh()}>{bi("Chantier", "الورشة")}</th>
              <th className={rhTh()}>{bi("Type", "النوع")}</th>
              <th className={rhTh()}>{bi("Net chantier", "صافي الميدان")}</th>
              <th className={rhTh()}>{bi("Statut", "الحالة")}</th>
              <th className={rhTh()} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60">
                <td className={rhTd()}>
                  <span className="font-mono text-xs">{row.matricule}</span>{" "}
                  {row.employee_name}
                </td>
                <td className={rhTd()}>{row.site_name}</td>
                <td className={rhTd()}>{row.contract_type_code ?? "—"}</td>
                <td className={rhTd()}>{row.salaire_net_ref_monthly}</td>
                <td className={rhTd()}>{row.status}</td>
                <td className={rhTd()}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      openModal(
                        {
                          id: row.id,
                          employee_id: row.employee_id,
                          site_id: row.site_id,
                          activity_code_id: row.activity_code_id,
                          contract_type_code: row.contract_type_code ?? "",
                          work_regime_code: row.work_regime_code ?? "",
                          qualification_code: row.qualification_code ?? "",
                          poste_fr: row.poste_fr ?? "",
                          poste_ar: row.poste_ar ?? "",
                          affectation_principale: row.affectation_principale,
                          salaire_base_monthly: String(row.salaire_base_monthly),
                          salaire_net_ref_monthly: String(row.salaire_net_ref_monthly),
                          salaire_net_recup_monthly:
                            row.salaire_net_recup_monthly == null
                              ? ""
                              : String(row.salaire_net_recup_monthly),
                          start_date: row.start_date,
                          end_date: row.end_date ?? "",
                          status: row.status as FormState["status"],
                        },
                        linesForContract(row.id, row.employee_id),
                      );
                    }}
                  >
                    {bi("Modifier", "تعديل")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RhTableWrap>

      {open ? (
        <RhModal
          wide
          title={bi("Contrat de travail", "عقد عمل")}
          onClose={() => setOpen(false)}
          tabs={
            <RhTabs
              items={[
                { id: "contrat", label: bi("Contrat de travail", "عقد العمل") },
                { id: "rubriques", label: bi("Rubriques de salaire", "بنود الأجر") },
                { id: "legal", label: bi("Cotisations & impôts", "الاشتراكات والضرائب") },
              ]}
              value={modalTab}
              onChange={(id) => setModalTab(id as typeof modalTab)}
            />
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {bi("Annuler", "إلغاء")}
              </Button>
              <Button disabled={pending} onClick={submit}>
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

          {modalTab === "contrat" ? (
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
                      {e.matricule} · {e.last_name} {e.first_name}
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label={bi("Chantier", "الورشة")}>
                <select
                  className={rhInput}
                  value={form.site_id}
                  onChange={(e) => {
                    const nextSite = sites.find((s) => s.id === e.target.value);
                    setForm({
                      ...form,
                      site_id: e.target.value,
                      activity_code_id:
                        nextSite?.activity_code_id || form.activity_code_id,
                    });
                  }}
                >
                  <option value="">—</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_fr}
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label={bi("Activité *", "النشاط *")}>
                <select
                  className={rhInput}
                  value={form.activity_code_id}
                  onChange={(e) =>
                    setForm({ ...form, activity_code_id: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.label_fr}
                    </option>
                  ))}
                </select>
                {activities.length === 0 ? (
                  <span className="mt-1 block text-[11px] text-alert-critical">
                    لا توجد رموز نشاط. أضفها من المراجع → Codes d&apos;activité.
                  </span>
                ) : null}
              </RhField>
              <RhField label={bi("Type de contrat", "نوع العقد")}>
                <CatalogSelect
                  items={catalogs}
                  kind="contract_type"
                  value={form.contract_type_code}
                  onChange={(v) => setForm({ ...form, contract_type_code: v })}
                />
              </RhField>
              <RhField label={bi("Régime", "نظام العمل")}>
                <CatalogSelect
                  items={catalogs}
                  kind="work_regime"
                  value={form.work_regime_code}
                  onChange={(v) => setForm({ ...form, work_regime_code: v })}
                />
              </RhField>
              <RhField label={bi("Poste (liste)", "المنصب (قائمة)")}>
                <select
                  className={rhInput}
                  value={form.qualification_code}
                  onChange={(e) => {
                    const job = jobs.find((j) => j.code === e.target.value);
                    setForm({
                      ...form,
                      qualification_code: e.target.value,
                      poste_fr: job?.label_fr ?? form.poste_fr,
                      poste_ar: job?.label_ar ?? form.poste_ar,
                    });
                  }}
                >
                  <option value="">—</option>
                  {jobs.map((j) => (
                    <option key={j.code} value={j.code}>
                      {j.label_fr === j.label_ar
                        ? j.label_fr
                        : `${j.label_fr} — ${j.label_ar}`}
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label={bi("Poste FR", "المنصب FR")}>
                <input
                  className={rhInput}
                  value={form.poste_fr}
                  onChange={(e) => setForm({ ...form, poste_fr: e.target.value })}
                />
              </RhField>
              <RhField label={bi("Poste AR", "المنصب")}>
                <input
                  dir="rtl"
                  className={rhInput}
                  value={form.poste_ar}
                  onChange={(e) => setForm({ ...form, poste_ar: e.target.value })}
                />
              </RhField>
              <RhField label={bi("Salaire de base", "الأجر الأساسي")}>
                <input
                  className={rhInput}
                  value={form.salaire_base_monthly}
                  onChange={(e) =>
                    setForm({ ...form, salaire_base_monthly: e.target.value })
                  }
                />
              </RhField>
              <RhField label={bi("Net chantier", "صافي الميدان")}>
                <input
                  className={rhInput}
                  value={form.salaire_net_ref_monthly}
                  onChange={(e) =>
                    setForm({ ...form, salaire_net_ref_monthly: e.target.value })
                  }
                />
              </RhField>
              <RhField label={bi("Net récupération", "صافي الراحة")}>
                <input
                  className={rhInput}
                  value={form.salaire_net_recup_monthly}
                  onChange={(e) =>
                    setForm({ ...form, salaire_net_recup_monthly: e.target.value })
                  }
                />
              </RhField>
              <RhField label={bi("Début", "البداية")}>
                <input
                  type="date"
                  className={rhInput}
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </RhField>
              <RhField label={bi("Fin", "النهاية")}>
                <input
                  type="date"
                  className={rhInput}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </RhField>
              <RhField label={bi("Statut", "الحالة")}>
                <select
                  className={rhInput}
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as FormState["status"],
                    })
                  }
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="ENDED">ENDED</option>
                </select>
              </RhField>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.affectation_principale}
                  onChange={(e) =>
                    setForm({ ...form, affectation_principale: e.target.checked })
                  }
                />
                {bi("Affectation principale", "التعيين الرئيسي")}
              </label>
            </div>
          ) : null}

          {modalTab === "rubriques" ? (
            <div className="space-y-6">
              <ContractSalaryFields
                rubriques={rubriques}
                assignments={asgRows}
                siteId={form.site_id}
                selected={selectedLines}
                onToggle={(id, line, checked) => {
                  setSelectedLines((prev) => {
                    const next = { ...prev };
                    if (checked) next[id] = line;
                    else delete next[id];
                    return next;
                  });
                }}
                onChange={(id, line) => {
                  setSelectedLines((prev) => ({ ...prev, [id]: line }));
                }}
              />
              <SalaryRubricsManager
                isSuperAdmin={isSuperAdmin}
                canEditValues={canEditSalaryValues}
                rubriques={rubriques}
                assignments={asgRows}
                employees={salaryEmployees}
                sites={salarySites}
                contracts={salaryContracts}
              />
            </div>
          ) : null}

          {modalTab === "legal" ? (
            <div className="space-y-6">
              {form.id ? (
                <ContractComplianceCards contractId={form.id} canEdit={canEditSalaryValues} />
              ) : (
                <RhAlert tone="info">
                  {bi(
                    "Enregistrez d'abord le contrat : le régime IRG / CNAS / CACOBATPH se règle ensuite ici.",
                    "احفظ العقد أولاً، ثم اضبط نظام IRG / CNAS / CACOBATPH هنا.",
                  )}
                </RhAlert>
              )}
              <LegalSettings
                vars={legalVars}
                irgCatalog={irgCatalog}
                isSuperAdmin={isSuperAdmin}
                loadError={legalError}
              />
            </div>
          ) : null}
        </RhModal>
      ) : null}
    </div>
  );
}

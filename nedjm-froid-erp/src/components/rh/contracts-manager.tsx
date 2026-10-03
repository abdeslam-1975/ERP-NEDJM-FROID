"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  Eye,
  EyeOff,
  FileSignature,
  FileText,
  Landmark,
  ListChecks,
  MapPin,
  Printer,
  Save,
  ScanText,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ContractImportDialog } from "@/components/rh/contract-import-dialog";
import { ContractPdfDialog, type ContractPdfScan } from "@/components/rh/contract-pdf-dialog";
import { ToolbarSlot } from "@/components/layout/arrange";
import { attachContractPdf } from "@/lib/actions/hr-contract-pdf";
import { contractFormFromPdf, matchPdfEmployee } from "@/lib/hr/contract-pdf";
import {
  upsertHrContract,
  type HrContractRow,
} from "@/lib/actions/hr-contracts";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import { getContractCompliance, type ContractComplianceOptions } from "@/lib/actions/hr-compliance";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import type { SalaryAssignment, SalaryRubrique } from "@/lib/actions/hr-salary";
import type { PosteRow } from "@/lib/actions/hr-postes";
import {
  getContractPreviewContext,
  saveContractRetenue,
  type ContractPreviewContext,
} from "@/lib/actions/hr-contract-print";
import { contractTypeAllowsFixedIrg } from "@/lib/hr/compliance";
import { contractPrintDefaults, type ContractPrintSource } from "@/lib/hr/work-contract";
import { buildWorkContractHtml } from "@/components/rh/work-contract-print";
import { gridAsOf } from "@/lib/hr/payroll-calc";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import {
  CatalogSelect,
  RhAlert,
  RhChip,
  RhField,
  RhModal,
  RhPageHeader,
  bi,
  catalogOptions,
  rhInput,
} from "@/components/rh/rh-ui";
import { ContractPrintDialog } from "@/components/rh/contract-print-dialog";
import { ContractViewDialog } from "@/components/rh/contract-view-dialog";
import { WorkRegimeField } from "@/components/rh/work-regime-field";
import { ContractRubriquesField } from "@/components/rh/contract-rubriques-field";
import type { SelectedSalaryLine } from "@/components/rh/contract-salary-fields";
import {
  ContractLegalFields,
  emptyLegalChoice,
  legalChoiceFromCompliance,
  saveLegalChoice,
  type LegalChoice,
  type LegalOverrides,
} from "@/components/rh/contract-legal-fields";

function firstOfMonth() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Brouillon", dot: "bg-slate-400", tone: "neutral" },
  { value: "ACTIVE", label: "Actif", dot: "bg-emerald-500", tone: "success" },
  { value: "SUSPENDED", label: "Suspendu", dot: "bg-amber-500", tone: "warning" },
  { value: "ENDED", label: "Clôturé", dot: "bg-red-500", tone: "danger" },
] as const;

const EMPTY_PRINT_EMPLOYEE: ContractPrintSource["employee"] = {
  matricule: "",
  last_name: "",
  first_name: "",
  last_name_ar: null,
  first_name_ar: null,
  birth_date: null,
  birth_place_ar: null,
  birth_place_fr: null,
  father_name: null,
  mother_name: null,
  marital_label_ar: null,
  id_type_code: null,
  id_number: null,
  id_issued_on: null,
  id_issued_by: null,
  address_ar: null,
  address_fr: null,
};

const NO_ARCHIVES: Record<string, string> = {};

const RETENUE_PATTERN = /^\d{1,9}([.,]\d{1,2})?$/;

function statusOption(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] sm:p-5">
      <header className="mb-4 flex items-start gap-3 border-b border-border/50 pb-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand">
          <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/65">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        className={`${rhInput} pr-11 text-right tabular-nums`}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="pointer-events-none absolute right-3.5 bottom-0 flex h-10 items-center text-xs font-medium text-foreground/40">
        DA
      </span>
    </div>
  );
}

type SiteOpt = {
  id: string;
  code?: string | null;
  name_fr: string;
  is_active: boolean;
  activity_code_id?: string | null;
};
type ActivityOpt = { id: string; code: string; label_fr: string };

const col = dataColumns<HrContractRow>();

type ContractLines = {
  work: Record<string, SelectedSalaryLine>;
  crp: Record<string, SelectedSalaryLine>;
};

type FormState = {
  id?: string;
  employee_id: string;
  site_id: string;
  activity_code_id: string;
  contract_type_code: string;
  work_regime_code: string;
  cnas_regime_code: string;
  qualification_code: string;
  poste_id: string;
  grade: string;
  agency_id: string;
  interim_daily_rate: string;
  poste_fr: string;
  poste_ar: string;
  affectation_principale: boolean;
  salaire_base_monthly: string;
  salaire_net_ref_monthly: string;
  salaire_net_recup_monthly: string;
  start_date: string;
  end_date: string;
  status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ENDED";
  /** Daily deduction for an unjustified absence, printed in the contract. */
  retenue: string;
};

const emptyForm = (): FormState => ({
  employee_id: "",
  site_id: "",
  activity_code_id: "",
  contract_type_code: "",
  work_regime_code: "",
  cnas_regime_code: "",
  qualification_code: "",
  poste_id: "",
  grade: "",
  agency_id: "",
  interim_daily_rate: "",
  poste_fr: "",
  poste_ar: "",
  affectation_principale: true,
  salaire_base_monthly: "",
  salaire_net_ref_monthly: "",
  salaire_net_recup_monthly: "",
  start_date: "",
  end_date: "",
  status: "DRAFT",
  retenue: "",
});

export function ContractsManager({
  initialContracts,
  employees,
  sites,
  activities,
  catalogs: initialCatalogs,
  rubriques,
  assignments,
  complianceOptions,
  isSuperAdmin = false,
  canEditSalaryValues = false,
  canEditCompliance = false,
  postes = [],
  agencies = [],
  contractArchives = NO_ARCHIVES,
  loadError,
}: {
  contractArchives?: Record<string, string>;
  postes?: PosteRow[];
  agencies?: { id: string; label: string; default_daily_rate: number }[];
  initialContracts: HrContractRow[];
  employees: HrEmployeeRow[];
  sites: readonly SiteOpt[];
  activities: readonly ActivityOpt[];
  catalogs: CatalogItem[];
  rubriques: SalaryRubrique[];
  assignments: SalaryAssignment[];
  complianceOptions: ContractComplianceOptions;
  isSuperAdmin?: boolean;
  canEditSalaryValues?: boolean;
  canEditCompliance?: boolean;
  loadError?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialContracts);
  const [seenContracts, setSeenContracts] = useState(initialContracts);
  if (seenContracts !== initialContracts) {
    setSeenContracts(initialContracts);
    setRows(initialContracts);
  }
  const [importOpen, setImportOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  /** Scanned contract read by the AI for the form being filled; archived once the contract is saved. */
  const [scan, setScan] = useState<(ContractPdfScan & { warnings: string[]; matched: boolean }) | null>(null);
  const [asgRows, setAsgRows] = useState(assignments);
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selectedLines, setSelectedLines] = useState<Record<string, SelectedSalaryLine>>({});
  /** Rubriques paid only on récupération (CRP) days. */
  const [crpLines, setCrpLines] = useState<Record<string, SelectedSalaryLine>>({});
  const [legal, setLegal] = useState<LegalChoice>(emptyLegalChoice());
  /** What the contract had when the form opened; null while it loads. */
  const [legalBase, setLegalBase] = useState<{ choice: LegalChoice; overrides: LegalOverrides } | null>(null);
  const openedId = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [printId, setPrintId] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<HrContractRow | null>(null);
  const [archives, setArchives] = useState(contractArchives);
  const [seenArchives, setSeenArchives] = useState(contractArchives);
  if (seenArchives !== contractArchives) {
    setSeenArchives(contractArchives);
    setArchives(contractArchives);
  }
  const [showPreview, setShowPreview] = useState(true);
  const [preview, setPreview] = useState<(ContractPreviewContext & { key: string }) | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  /** Retenue saved on the contract; null until it is known for an existing contract. */
  const [retenueBase, setRetenueBase] = useState<string | null>("");
  const jobs = useMemo(() => catalogOptions(catalogs, "job_title"), [catalogs]);

  const previewEmployee = open ? form.employee_id : "";
  const previewContract = open ? (form.id ?? "") : "";
  const previewKey = `${previewEmployee}|${previewContract}`;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getContractPreviewContext({
      employee_id: previewEmployee || null,
      contract_id: previewContract || null,
    }).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setPreviewError(r.error);
        return;
      }
      setPreviewError(null);
      setPreview({ ...r.data, key: `${previewEmployee}|${previewContract}` });
      if (previewContract) {
        const saved = typeof r.data.print_data.retenue === "string" ? r.data.print_data.retenue : "";
        setRetenueBase(saved);
        setForm((f) => (f.id === previewContract && !f.retenue ? { ...f, retenue: saved } : f));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, previewEmployee, previewContract]);

  const previewHtml = useMemo(() => {
    if (!open || !preview) return "";
    const current = preview.key === previewKey;
    const values = contractPrintDefaults({
      contract_number: current ? preview.contract_number : null,
      contract_type_code: form.contract_type_code || null,
      poste_ar: form.poste_ar || null,
      poste_fr: form.poste_fr || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      salaire_net_ref_monthly: form.salaire_net_ref_monthly ? Number(form.salaire_net_ref_monthly) : null,
      salaire_net_recup_monthly: form.salaire_net_recup_monthly ? Number(form.salaire_net_recup_monthly) : null,
      print_data: { ...(current ? preview.print_data : {}), retenue: form.retenue.trim() },
      employee: (current && preview.employee) || EMPTY_PRINT_EMPLOYEE,
    });
    return buildWorkContractHtml(values, preview.template).replace(
      "</head>",
      "<style>@media screen { body { padding: 28px 34px; } }</style></head>",
    );
  }, [open, preview, previewKey, form]);
  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
        keywords: `${e.first_name} ${e.last_name}`,
      })),
    [employees],
  );
  const gridSuggestion = useMemo(() => {
    const p = postes.find((x) => x.id === form.poste_id);
    if (!p) return null;
    return gridAsOf(
      p.grid.map((g) => ({ ...g, poste_id: p.id })),
      p.id,
      form.grade,
      form.start_date || new Date().toISOString().slice(0, 10),
    );
  }, [postes, form.poste_id, form.grade, form.start_date]);

  function openModal(next: FormState, lines: ContractLines, nextScan: typeof scan = null) {
    setScan(nextScan);
    setForm(next);
    setSelectedLines(lines.work);
    setCrpLines(lines.crp);
    setLegal(emptyLegalChoice());
    setLegalBase(next.id ? null : { choice: emptyLegalChoice(), overrides: { IRG: null, CACOBATPH: null } });
    setRetenueBase(next.id ? null : "");
    setError(null);
    setOpen(true);
    openedId.current = next.id;
    if (next.id) {
      const contractId = next.id;
      getContractCompliance(contractId).then((r) => {
        if (openedId.current !== contractId) return;
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const base = legalChoiceFromCompliance(r.data);
        setLegal(base.choice);
        setLegalBase(base);
      });
    }
  }

  function defaultContractLines(): ContractLines {
    const work: Record<string, SelectedSalaryLine> = {};
    for (const r of rubriques) {
      if (r.is_active && r.apply_scope !== "site" && r.default_amount > 0) {
        work[r.id] = { amount: String(r.default_amount), unit: r.unit };
      }
    }
    return { work, crp: {} };
  }

  function linesForContract(contractId: string, employeeId: string): ContractLines {
    const lines: ContractLines = { work: {}, crp: {} };
    for (const a of asgRows) {
      if (!a.is_active) continue;
      if (a.contract_id === contractId || a.employee_id === employeeId) {
        const rub = rubriques.find((r) => r.id === a.rubrique_id);
        const target = a.period_scope === "CRP" ? lines.crp : lines.work;
        target[a.rubrique_id] = { amount: String(a.amount), unit: a.unit ?? rub?.unit ?? "month" };
      }
    }
    return lines;
  }

  function openScan(read: ContractPdfScan) {
    setPdfOpen(false);
    const { form: values, warnings } = contractFormFromPdf(read.read);
    const match = matchPdfEmployee(read.read, employees, read.file_name);
    const hint = (read.read.site ?? "").toLowerCase();
    const site = hint
      ? sites.find(
          (s) =>
            s.is_active &&
            (hint.includes(s.name_fr.toLowerCase()) || (s.code ? hint.includes(s.code.toLowerCase()) : false)),
        )
      : undefined;
    if (!match.employee_id) {
      const near = match.candidates
        .map((id) => employees.find((e) => e.id === id))
        .filter((e) => e !== undefined)
        .map((e) => `${e.matricule} ${e.last_name} ${e.first_name}`);
      warnings.unshift(
        near.length
          ? `Employé non identifié avec certitude : choisissez-le (proches : ${near.join(", ")}).`
          : "Employé introuvable : créez d'abord sa fiche, puis choisissez-le.",
      );
    }
    if (values.retenue) warnings.push("Vérifiez la retenue / jour d'absence lue dans le contrat.");
    openModal(
      {
        ...emptyForm(),
        ...values,
        employee_id: match.employee_id ?? "",
        site_id: site?.id ?? "",
        activity_code_id: site?.activity_code_id ?? "",
        status: "ACTIVE",
      },
      defaultContractLines(),
      { ...read, warnings, matched: Boolean(match.employee_id) },
    );
  }

  function openRow(row: HrContractRow) {
    openModal(
      {
        id: row.id,
        employee_id: row.employee_id,
        site_id: row.site_id,
        activity_code_id: row.activity_code_id,
        contract_type_code: row.contract_type_code ?? "",
        work_regime_code: row.work_regime_code ?? "",
        cnas_regime_code: row.cnas_regime_code ?? "",
        qualification_code: row.qualification_code ?? "",
        poste_id: row.poste_id ?? "",
        grade: row.grade ?? "",
        agency_id: row.agency_id ?? "",
        interim_daily_rate: row.interim_daily_rate == null ? "" : String(row.interim_daily_rate),
        poste_fr: row.poste_fr ?? "",
        poste_ar: row.poste_ar ?? "",
        affectation_principale: row.affectation_principale,
        salaire_base_monthly: String(row.salaire_base_monthly),
        salaire_net_ref_monthly: String(row.salaire_net_ref_monthly),
        salaire_net_recup_monthly:
          row.salaire_net_recup_monthly == null ? "" : String(row.salaire_net_recup_monthly),
        start_date: row.start_date,
        end_date: row.end_date ?? "",
        status: row.status as FormState["status"],
        retenue: "",
      },
      linesForContract(row.id, row.employee_id),
    );
  }

  const openPrincipal =
    !form.id && form.employee_id
      ? rows.find(
          (r) => r.employee_id === form.employee_id && r.affectation_principale && r.status !== "ENDED",
        ) ?? null
      : null;

  const showCacobatph = Boolean(complianceOptions.activity_cacobatph[form.activity_code_id]?.conges);
  const selectedEmployee = employees.find((e) => e.id === form.employee_id);
  const selectedSite = sites.find((s) => s.id === form.site_id);

  function submit(thenPrint = false) {
    setError(null);
    if (!form.employee_id) {
      setError(bi("Choisissez l'employé.", "اختر العامل."));
      return;
    }
    if (!form.site_id) {
      setError(bi("Choisissez l'affectation.", "اختر التعيين."));
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
    if (form.retenue.trim() && !RETENUE_PATTERN.test(form.retenue.trim())) {
      setError("Retenue / jour d'absence : saisissez un montant en DA.");
      return;
    }
    if (form.id && !legalBase) {
      setError("Chargement des choix IRG / CACOBATPH en cours, réessayez dans un instant.");
      return;
    }
    start(async () => {
      const toLines = (lines: Record<string, SelectedSalaryLine>, period_scope: "WORK" | "CRP") =>
        Object.entries(lines).map(([rubrique_id, line]) => ({
          rubrique_id,
          amount: Number(line.amount || 0),
          unit: line.unit,
          period_scope,
        }));
      const salary_lines = [...toLines(selectedLines, "WORK"), ...toLines(crpLines, "CRP")];
      let result: Awaited<ReturnType<typeof upsertHrContract>>;
      try {
        result = await upsertHrContract({
          ...form,
          salaire_base_monthly: Number(form.salaire_base_monthly || 0),
          salaire_net_ref_monthly: Number(form.salaire_net_ref_monthly || 0),
          salaire_net_recup_monthly: form.salaire_net_recup_monthly
            ? Number(form.salaire_net_recup_monthly)
            : null,
          end_date: form.end_date || null,
          interim_daily_rate: form.interim_daily_rate.trim() ? Number(form.interim_daily_rate) : null,
          salary_lines,
        });
      } catch {
        setError(
          bi(
            "Le serveur n'a pas répondu. Rechargez la page : le contrat a peut-être été enregistré, vérifiez la liste avant de réessayer.",
            "لم يستجب الخادم. أعد تحميل الصفحة: ربما حُفظ العقد، تحقق من القائمة قبل إعادة المحاولة.",
          ),
        );
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const done = result.data;
      let scanNote = "";
      if (scan && !form.id) {
        const attached = await attachContractPdf({ contract_id: done.id, path: scan.path, file_name: scan.file_name });
        if (attached.ok) setArchives((a) => ({ ...a, [done.id]: attached.data.archive_url }));
        else scanNote = ` Le PDF importé n'a pas été archivé : ${attached.error}`;
        setScan(null);
      }
      const emp = employees.find((e) => e.id === form.employee_id);
      const site = sites.find((s) => s.id === form.site_id);
      const next: HrContractRow = {
        id: done.id,
        employee_id: form.employee_id,
        site_id: form.site_id,
        activity_code_id: form.activity_code_id,
        contract_type_code: form.contract_type_code || null,
        work_regime_code: form.work_regime_code || null,
        cnas_regime_code: form.cnas_regime_code || null,
        poste_ar: form.poste_ar || null,
        poste_fr: form.poste_fr || null,
        qualification_code: form.qualification_code || null,
        poste_id: form.poste_id || null,
        grade: form.grade ? form.grade.toUpperCase() : null,
        agency_id: form.contract_type_code === "INTERIM" ? form.agency_id || null : null,
        interim_daily_rate:
          form.contract_type_code === "INTERIM" && form.interim_daily_rate ? Number(form.interim_daily_rate) : null,
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
        const ended = done.closed_previous
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
      if (done.warning) {
        setForm((f) => ({ ...f, id: done.id }));
        setError(done.warning + scanNote);
        return;
      }
      setAsgRows((prev) => {
        const kept = prev.filter((a) => a.contract_id !== next.id && a.employee_id !== form.employee_id);
        const added = salary_lines.flatMap((line) => {
          const rub = rubriques.find((r) => r.id === line.rubrique_id);
          if (!rub || rub.apply_scope === "site") return [];
          return [
            {
              id: `${next.id}-${line.rubrique_id}-${line.period_scope}`,
              rubrique_id: line.rubrique_id,
              employee_id: rub.apply_scope === "employee" ? form.employee_id : null,
              site_id: null,
              contract_id: rub.apply_scope === "employee" ? null : next.id,
              poste_id: null,
              amount: line.amount,
              unit: line.unit ?? rub.unit,
              is_active: true,
              period_scope: line.period_scope,
            },
          ];
        });
        return [...kept, ...added];
      });
      const retenue = form.retenue.trim();
      if (retenueBase === null ? retenue !== "" : retenue !== retenueBase) {
        const saved = await saveContractRetenue({ contract_id: done.id, retenue });
        if (!saved.ok) {
          setForm((f) => ({ ...f, id: done.id }));
          openedId.current = done.id;
          setError(`Contrat enregistré, mais la retenue / jour d'absence ne l'a pas été : ${saved.error}`);
          return;
        }
        setRetenueBase(retenue);
      }
      if (canEditCompliance && legalBase) {
        const thisMonth = firstOfMonth();
        const legalErrors = await saveLegalChoice({
          contractId: done.id,
          effectiveFrom: !form.id || form.start_date > thisMonth ? form.start_date : thisMonth,
          initial: legalBase.choice,
          next: legal,
          overrides: legalBase.overrides,
          includeCacobatph: showCacobatph,
        });
        if (legalErrors.length) {
          setForm((f) => ({ ...f, id: done.id }));
          openedId.current = done.id;
          const fresh = await getContractCompliance(done.id);
          if (fresh.ok) setLegalBase(legalChoiceFromCompliance(fresh.data));
          setError(`Contrat enregistré, mais IRG / CACOBATPH non appliqué : ${legalErrors.join(" · ")}`);
          return;
        }
      }
      setOpen(false);
      if (thenPrint) setPrintId(done.id);
      const saved = done.closed_previous
        ? bi(
            "Contrat enregistré. L'ancien contrat principal a été clôturé la veille.",
            "تم حفظ العقد. أُغلق العقد الرئيسي السابق في اليوم السابق.",
          )
        : bi("Contrat enregistré.", "تم حفظ العقد.");
      setInfo(
        (done.payroll_notice
          ? `${saved} ${done.payroll_notice}`
          : `${saved} ${bi(
              "Les bulletins seront calculés à la génération de la paie, sur décision.",
              "تُحسب الكشوف عند توليد الأجور، بقرار.",
            )}`) + scanNote,
      );
    });
  }

  const columns = [
    col.accessor((r) => `${r.matricule} ${r.employee_name}`, {
      id: "employee",
      header: bi("Employé", "العامل"),
      cell: ({ row }) => (
        <>
          <span className="font-mono text-xs">{row.original.matricule}</span> {row.original.employee_name}
        </>
      ),
    }),
    col.accessor("site_name", { header: bi("Affectation", "التعيين") }),
    col.accessor((r) => r.contract_type_code ?? "", {
      id: "type",
      header: bi("Type", "النوع"),
      cell: (info) => info.getValue() || "—",
    }),
    col.accessor("salaire_net_ref_monthly", { header: bi("Net chantier", "صافي الميدان") }),
    col.accessor("status", {
      header: bi("Statut", "الحالة"),
      cell: (info) => {
        const s = statusOption(info.getValue());
        return <RhChip tone={s.tone}>{s.label}</RhChip>;
      },
    }),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <>
          <Button variant="secondary" onClick={() => setViewRow(row.original)}>
            {bi("Afficher", "عرض")}
          </Button>{" "}
          <Button variant="secondary" onClick={() => openRow(row.original)}>
            {bi("Modifier", "تعديل")}
          </Button>{" "}
          <Button variant="secondary" onClick={() => setPrintId(row.original.id)}>
            {bi("Imprimer", "طباعة")}
          </Button>
          {archives[row.original.id] ? (
            <>
              {" "}
              <Button
                variant="secondary"
                onClick={() => window.open(archives[row.original.id], "_blank", "noopener,noreferrer")}
              >
                <FileText aria-hidden />
                {bi("PDF archivé", "PDF مؤرشف")}
              </Button>
            </>
          ) : null}
        </>
      ),
    }),
  ];

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Contrats de travail", "عقود العمل")}
        description={bi(
          "Le chantier porte l'activité et le CACOBATPH. Les cinq classes de rubriques (dont la retenue de garantie) se règlent dans la fiche contrat. Un contrat brouillon entre aussi dans la paie.",
          "الورشة تحمل النشاط وCACOBATPH. الأصناف الخمسة (ومنها اقتطاع الضمان) تُضبط داخل بطاقة العقد. العقد المسودة يدخل أيضاً في كشف الأجر.",
        )}
        actionsTabset="btn_rh_contracts"
        actions={
          <>
            <ToolbarSlot id="exceptions">
              <Button asChild variant="secondary">
                <Link href="/rh/paie/exceptions">{bi("Exceptions", "استثناءات")}</Link>
              </Button>
            </ToolbarSlot>
            <ToolbarSlot id="import">
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload aria-hidden />
                {bi("Importer des contrats", "استيراد العقود")}
              </Button>
            </ToolbarSlot>
            <ToolbarSlot id="import_pdf">
              <Button variant="secondary" onClick={() => setPdfOpen(true)}>
                <ScanText aria-hidden />
                {bi("Contrat PDF", "عقد PDF")}
              </Button>
            </ToolbarSlot>
            <ToolbarSlot id="new">
              <Button
                onClick={() => {
                  openModal(emptyForm(), defaultContractLines());
                }}
              >
                {bi("Nouveau contrat", "عقد جديد")}
              </Button>
            </ToolbarSlot>
          </>
        }
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}
      {importOpen ? (
        <ContractImportDialog
          employees={employees}
          sites={sites}
          activities={activities}
          catalogs={catalogs}
          contracts={rows}
          onClose={() => setImportOpen(false)}
          onImported={() => router.refresh()}
        />
      ) : null}
      {pdfOpen ? <ContractPdfDialog onClose={() => setPdfOpen(false)} onRead={openScan} /> : null}
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchPlaceholder="Employé, matricule, affectation…"
        searchText={(r) =>
          [r.matricule, r.employee_name, r.site_name, r.contract_type_code, r.status].filter(Boolean).join(" ")
        }
        emptyTitle="Aucun contrat"
      />

      {open ? (
        <RhModal
          wide
          title={form.id ? bi("Contrat de travail", "عقد عمل") : bi("Nouveau contrat de travail", "عقد عمل جديد")}
          subtitle={
            selectedEmployee ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-foreground/65">
                  {selectedEmployee.matricule}
                </span>
                <span className="font-medium text-foreground/80">
                  {selectedEmployee.last_name} {selectedEmployee.first_name}
                </span>
                {selectedSite ? <span className="text-foreground/45">· {selectedSite.name_fr}</span> : null}
                <RhChip tone={statusOption(form.status).tone}>{statusOption(form.status).label}</RhChip>
              </span>
            ) : (
              "Remplissez les sections puis enregistrez."
            )
          }
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button
                variant="ghost"
                className="hidden lg:inline-flex"
                onClick={() => setShowPreview((v) => !v)}
              >
                {showPreview ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {showPreview ? "Masquer l'aperçu" : "Afficher l'aperçu"}
              </Button>
              {error ? (
                <span role="alert" className="mr-auto max-w-xl text-xs font-semibold text-alert-critical">
                  {error}
                </span>
              ) : (
                <span className="mr-auto" />
              )}
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {bi("Annuler", "إلغاء")}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                title="Enregistre le contrat puis ouvre l'aperçu d'impression"
                onClick={() => submit(true)}
              >
                <Printer aria-hidden />
                {bi("Aperçu et impression", "معاينة وطباعة")}
              </Button>
              <Button disabled={pending} onClick={() => submit()}>
                <Save aria-hidden />
                {pending ? bi("Enregistrement…", "جارٍ الحفظ…") : bi("Enregistrer", "حفظ")}
              </Button>
            </>
          }
        >
          {scan ? (
            <div className="p-1 pb-3 sm:px-2">
              <RhAlert tone={scan.warnings.length ? "warning" : "info"}>
                <p className="font-semibold">
                  {bi(`Lu par l'IA depuis « ${scan.file_name} »`, "قُرئ بالذكاء الاصطناعي")} — vérifiez chaque champ avant
                  d&apos;enregistrer.
                </p>
                <p className="mt-1">
                  {[
                    scan.read.contract_number ? `N° ${scan.read.contract_number}` : null,
                    [scan.read.last_name_ar, scan.read.first_name_ar].filter(Boolean).join(" ") || null,
                    [scan.read.last_name_latin, scan.read.first_name_latin].filter(Boolean).join(" ") || null,
                    scan.read.birth_date ? `né le ${scan.read.birth_date.split("-").reverse().join("/")}` : null,
                    scan.read.serial_number ? `réf. ${scan.read.serial_number}` : null,
                    scan.read.site ? `chantier : ${scan.read.site}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {scan.warnings.length ? (
                  <ul className="mt-1 list-disc ps-5">
                    {scan.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-1 text-xs opacity-75">Le fichier sera archivé avec le contrat à l&apos;enregistrement.</p>
              </RhAlert>
            </div>
          ) : null}
          <div
            className={`grid gap-4 p-1 sm:p-2 ${showPreview ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start" : ""}`}
          >
            <div className={showPreview ? "space-y-4" : "grid gap-4 lg:grid-cols-2 lg:items-start"}>
              <div className="space-y-4">
                <FormSection
                  icon={MapPin}
                  title="Employé, affectation et poste"
                  description="Qui, où, pour quelle activité et à quel poste."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <RhField label={bi("Employé", "العامل")} required>
                        <Combobox
                          options={employeeOptions}
                          value={form.employee_id}
                          onChange={(v) => setForm({ ...form, employee_id: v })}
                          placeholder="Choisir l'employé…"
                          searchPlaceholder="Matricule, nom ou prénom…"
                          emptyText="Aucun employé trouvé"
                        />
                      </RhField>
                      {openPrincipal ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
                          {bi(
                            `Contrat principal déjà ouvert (début ${openPrincipal.start_date.split("-").reverse().join("/")}).`,
                            "لهذا العامل عقد رئيسي مفتوح.",
                          )}
                          <button
                            type="button"
                            className="font-semibold text-brand underline"
                            onClick={() => openRow(openPrincipal)}
                          >
                            {bi("Ouvrir ce contrat", "فتح هذا العقد")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <RhField
                      label={bi("Affectation", "التعيين")}
                      required
                      hint={form.id ? "Affectation en vigueur : elle ne se modifie pas depuis le contrat." : undefined}
                    >
                      <select
                        className={rhInput}
                        value={form.site_id}
                        disabled={Boolean(form.id)}
                        onChange={(e) => {
                          const nextSite = sites.find((s) => s.id === e.target.value);
                          setForm({
                            ...form,
                            site_id: e.target.value,
                            activity_code_id: nextSite?.activity_code_id || form.activity_code_id,
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
                    <RhField
                      label={bi("Activité", "النشاط")}
                      required
                      hint={
                        activities.length === 0
                          ? "Aucun code d'activité : ajoutez-en dans Référentiels › Codes d'activité."
                          : undefined
                      }
                    >
                      <select
                        className={rhInput}
                        value={form.activity_code_id}
                        onChange={(e) => setForm({ ...form, activity_code_id: e.target.value })}
                      >
                        <option value="">—</option>
                        {activities.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.label_fr}
                          </option>
                        ))}
                      </select>
                    </RhField>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-muted/40 px-3.5 py-2.5 sm:col-span-2">
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          {bi("Affectation principale", "التعيين الرئيسي")}
                        </span>
                        <span className="block text-xs text-foreground/65">
                          Un seul contrat principal ouvert par employé.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={form.affectation_principale}
                        onChange={(e) => setForm({ ...form, affectation_principale: e.target.checked })}
                      />
                      <span className="relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40" />
                    </label>
                  </div>
                  <div className="mt-6 mb-4 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-foreground/80 uppercase">
                    <Briefcase className="size-4 text-brand" aria-hidden />
                    Poste
                    <span className="h-px flex-1 bg-border/70" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                            {j.label_fr === j.label_ar ? j.label_fr : `${j.label_fr} — ${j.label_ar}`}
                          </option>
                        ))}
                      </select>
                    </RhField>
                    {postes.length ? (
                      <>
                        <RhField label={bi("Poste (référentiel)", "المنصب (المرجع)")}>
                          <select
                            className={rhInput}
                            value={form.poste_id}
                            onChange={(e) => {
                              const p = postes.find((x) => x.id === e.target.value);
                              setForm({
                                ...form,
                                poste_id: e.target.value,
                                poste_fr: p?.label_fr ?? form.poste_fr,
                                poste_ar: p?.label_ar ?? form.poste_ar,
                                grade: form.grade || (p?.grid[0]?.grade ?? ""),
                              });
                            }}
                          >
                            <option value="">—</option>
                            {postes
                              .filter((p) => p.is_active || p.id === form.poste_id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.code} · {p.label_fr}
                                </option>
                              ))}
                          </select>
                        </RhField>
                        <RhField
                          label={bi("Grade / échelon", "الدرجة")}
                          hint={
                            gridSuggestion
                              ? `Grille : ${gridSuggestion.base_monthly.toLocaleString("fr-DZ")} DA`
                              : form.poste_id
                                ? "Pas de grille pour ce grade"
                                : undefined
                          }
                        >
                          <div className="flex gap-2">
                            <input
                              className={rhInput}
                              value={form.grade}
                              onChange={(e) => setForm({ ...form, grade: e.target.value.toUpperCase() })}
                            />
                            {gridSuggestion && Number(form.salaire_base_monthly) !== gridSuggestion.base_monthly ? (
                              <Button
                                variant="secondary"
                                className="mt-1.5 shrink-0"
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    salaire_base_monthly: String(gridSuggestion.base_monthly),
                                    salaire_net_ref_monthly:
                                      gridSuggestion.net_ref_monthly != null
                                        ? String(gridSuggestion.net_ref_monthly)
                                        : form.salaire_net_ref_monthly,
                                  })
                                }
                              >
                                {bi("Appliquer", "تطبيق")}
                              </Button>
                            ) : null}
                          </div>
                        </RhField>
                      </>
                    ) : null}
                    <RhField label={bi("Intitulé (français)", "المنصب FR")}>
                      <input
                        className={rhInput}
                        value={form.poste_fr}
                        onChange={(e) => setForm({ ...form, poste_fr: e.target.value })}
                      />
                    </RhField>
                    <RhField label={bi("Intitulé (arabe)", "المنصب")}>
                      <input
                        dir="rtl"
                        className={rhInput}
                        value={form.poste_ar}
                        onChange={(e) => setForm({ ...form, poste_ar: e.target.value })}
                      />
                    </RhField>
                  </div>
                </FormSection>

                <FormSection icon={FileSignature} title="Contrat" description="Type, régime de travail, période et statut.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <RhField label={bi("Type de contrat", "نوع العقد")}>
                      <CatalogSelect
                        items={catalogs}
                        kind="contract_type"
                        value={form.contract_type_code}
                        onChange={(v) => setForm({ ...form, contract_type_code: v })}
                      />
                    </RhField>
                    <WorkRegimeField
                      catalogs={catalogs}
                      value={form.work_regime_code}
                      onChange={(v) => setForm((f) => ({ ...f, work_regime_code: v }))}
                      onCatalogsChange={setCatalogs}
                      canManage={isSuperAdmin}
                    />
                    {form.contract_type_code === "INTERIM" ? (
                      <>
                        <RhField
                          label="Agence d'intérim"
                          hint="Intérimaire : présent au pointage, hors paie, facturé par l'agence"
                        >
                          <select
                            className={rhInput}
                            value={form.agency_id}
                            onChange={(e) => setForm({ ...form, agency_id: e.target.value })}
                          >
                            <option value="">—</option>
                            {agencies.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </RhField>
                        <RhField
                          label="Taux journalier facturé"
                          hint={`Vide = taux de l'agence (${agencies.find((a) => a.id === form.agency_id)?.default_daily_rate ?? 0} DA)`}
                        >
                          <MoneyInput
                            value={form.interim_daily_rate}
                            onChange={(v) => setForm({ ...form, interim_daily_rate: v })}
                          />
                        </RhField>
                      </>
                    ) : null}
                    <RhField label={bi("Début (1er du mois)", "البداية (أول الشهر)")} required>
                      <input
                        type="date"
                        className={rhInput}
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      />
                    </RhField>
                    <RhField label={bi("Fin", "النهاية")} hint="Vide = durée indéterminée">
                      <input
                        type="date"
                        className={rhInput}
                        value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                      />
                    </RhField>
                    <div className="sm:col-span-2">
                      <span className="text-[13px] font-semibold text-foreground/85">{bi("Statut", "الحالة")}</span>
                      <div
                        role="radiogroup"
                        aria-label="Statut"
                        className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-surface-muted/60 p-1 sm:grid-cols-4"
                      >
                        {STATUS_OPTIONS.map((s) => {
                          const active = form.status === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setForm({ ...form, status: s.value })}
                              className={`flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition ${
                                active
                                  ? "bg-surface text-foreground shadow-sm ring-1 ring-border/70"
                                  : "text-foreground/70 hover:text-foreground"
                              }`}
                            >
                              <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </FormSection>
              </div>

              <div className="space-y-4">
                <FormSection icon={Wallet} title="Rémunération" description="Montants mensuels et retenue d'absence.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <RhField label={bi("Salaire de base", "الأجر الأساسي")}>
                      <MoneyInput
                        value={form.salaire_base_monthly}
                        onChange={(v) => setForm({ ...form, salaire_base_monthly: v })}
                      />
                    </RhField>
                    <RhField label={bi("Net chantier", "صافي الميدان")}>
                      <MoneyInput
                        value={form.salaire_net_ref_monthly}
                        onChange={(v) => setForm({ ...form, salaire_net_ref_monthly: v })}
                      />
                    </RhField>
                    <RhField label={bi("Net récupération", "صافي الراحة")}>
                      <MoneyInput
                        value={form.salaire_net_recup_monthly}
                        onChange={(v) => setForm({ ...form, salaire_net_recup_monthly: v })}
                      />
                    </RhField>
                    <RhField
                      label={bi("Retenue / jour d'absence", "اقتطاع الغياب")}
                      hint={
                        form.id && retenueBase === null
                          ? "Chargement…"
                          : "Par jour d'absence non justifiée, imprimée dans le contrat"
                      }
                    >
                      <MoneyInput value={form.retenue} onChange={(v) => setForm({ ...form, retenue: v })} />
                    </RhField>
                  </div>
                </FormSection>

                <FormSection
                  icon={Landmark}
                  title="Cotisations et impôts"
                  description="Chaque option affiche ses taux ; les cadres sous chaque champ montrent les taux appliqués."
                >
                  <ContractLegalFields
                    options={complianceOptions}
                    cnasCode={form.cnas_regime_code}
                    onCnasChange={(v) => setForm((f) => ({ ...f, cnas_regime_code: v }))}
                    choice={legal}
                    onChoiceChange={setLegal}
                    employeeId={form.employee_id}
                    employeeIrgCategory={selectedEmployee?.irg_category ?? null}
                    siteId={form.site_id}
                    activityId={form.activity_code_id}
                    showCacobatph={showCacobatph}
                    allowsFixedIrg={contractTypeAllowsFixedIrg(catalogs, form.contract_type_code)}
                    canEdit={canEditCompliance}
                    loading={!legalBase}
                  />
                </FormSection>

                <FormSection
                  icon={ListChecks}
                  title="Rubriques de salaire"
                  description="Choisissez par classe, puis réglez le mode et la valeur de chaque rubrique."
                >
                  <ContractRubriquesField rubriques={rubriques} selected={selectedLines} onChange={setSelectedLines} />
                </FormSection>

                <FormSection
                  icon={CalendarClock}
                  title="Rubriques de récupération (CRP) · بنود العطلة التعويضية"
                  description="Payées seulement sur les jours pointés CRP. Le salaire de base reste dû ; les rubriques ci-dessus ne s'appliquent pas à ces jours."
                >
                  <ContractRubriquesField
                    rubriques={rubriques}
                    selected={crpLines}
                    onChange={setCrpLines}
                    scope="CRP"
                  />
                </FormSection>
              </div>
            </div>
            {showPreview ? (
              <aside className="hidden lg:block">
                <div className="sticky top-0 flex h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface-muted/70 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-surface px-4 py-3">
                    <span className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
                      <FileText className="size-[18px] text-brand" strokeWidth={1.8} aria-hidden />
                      Aperçu du contrat
                    </span>
                    <span className="text-xs text-foreground/60">
                      {form.employee_id ? "Mis à jour pendant la saisie" : "Choisissez l'employé pour compléter le document"}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 p-3">
                    {previewHtml ? (
                      <iframe
                        title="Aperçu du contrat"
                        srcDoc={previewHtml}
                        className="h-full w-full rounded-lg bg-white shadow-md ring-1 ring-black/5"
                      />
                    ) : (
                      <p className="p-6 text-center text-sm text-foreground/60">
                        {previewError ?? "Chargement de l'aperçu…"}
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        </RhModal>
      ) : null}
      {viewRow ? (
        <ContractViewDialog
          contractId={viewRow.id}
          title={`${viewRow.matricule} · ${viewRow.employee_name}`.trim()}
          subtitle={[viewRow.site_name, viewRow.contract_type_code, statusOption(viewRow.status).label]
            .filter(Boolean)
            .join(" · ")}
          onClose={() => setViewRow(null)}
          onEdit={() => {
            setViewRow(null);
            openRow(viewRow);
          }}
          onPrint={() => {
            setViewRow(null);
            setPrintId(viewRow.id);
          }}
        />
      ) : null}
      {printId ? (
        <ContractPrintDialog
          contractId={printId}
          canEditTemplate={canEditSalaryValues}
          onClose={() => setPrintId(null)}
          onArchived={(url) => setArchives((prev) => ({ ...prev, [printId]: url }))}
        />
      ) : null}
    </div>
  );
}

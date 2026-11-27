"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Columns3, ClipboardList, DatabaseZap, FileDown, UserCheck, UserPlus } from "lucide-react";
import { ToolbarSlot } from "@/components/layout/arrange";
import {
  deleteHrEmployeeField,
  getHrEmployeeFiche,
  listHrEmployeeFiches,
  setHrEmployeeFieldActive,
  setHrEmployeeStatus,
  upsertHrEmployeeField,
  type HrEmployeeFiche,
  type HrEmployeeField,
} from "@/lib/actions/hr-employees";
import {
  checkFicheValues,
  emptyFicheValues as emptyValues,
  saveEmployeeFiche,
  valuesFromFiche,
} from "@/components/rh/employee-fiche-save";
import type { CatalogItem, CatalogKind } from "@/lib/actions/hr-catalogs";
import { activityStatusOptions, workingStatusCodes } from "@/lib/hr/employee-status";
import { confirmFicheIdentity } from "@/components/rh/employee-identity";
import { matriculeKey } from "@/lib/hr/contract-import";
import { keepsFirstEmploymentNumber, nextMatriculeForHire } from "@/lib/hr/employee-matricule";
import type { FilterRow } from "@/lib/hr/screen-filter";
import type { WorkerRegisterRow } from "@/lib/actions/hr-worker-register";
import { useScreenFilter } from "@/components/rh/screen-filter-bar";
import type { SiteRow } from "@/lib/actions/sites";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns, type DataColumn } from "@/components/ui/data-table";
import {
  RhAlert,
  RhField,
  RhModal,
  RhPage,
  RhPageHeader,
  RhTabs,
  catalogOptionLabel,
  rhInput,
} from "@/components/rh/rh-ui";
import { EmployeeFicheDialog } from "@/components/rh/employee-fiche";
import {
  EmployeesList,
  EmployeeViewSwitch,
  type EmployeeAssignment,
  type EmployeeView,
} from "@/components/rh/employees-list";
import { EmployeeAdminDossierDialog } from "@/components/rh/employee-admin-dossier";
import { EmployeeCardPreview } from "@/components/rh/employee-card-preview";
import { EmployeeImportDialog } from "@/components/rh/employee-import-dialog";
import { EmployeeTableReport } from "@/components/rh/employee-table-report";
import { EmployeeExportDialog } from "@/components/rh/employee-export-dialog";
import { DEFAULT_FICHE_SETTINGS, type HrFicheSettings } from "@/lib/hr/fiche-settings";
import { findEmployeeForFicheSearch } from "@/lib/hr/employee-fiche-search";
import { mergeAffectationCatalog } from "@/lib/hr/affectation-options";
import { sortEmployees } from "@/lib/hr/employee-order";
import {
  assessFicheCompletion,
  COMPLETION_LABELS,
  formatFicheDoneAt,
} from "@/lib/hr/fiche-completion";

const col = dataColumns<HrEmployeeFiche>();
const fieldCol = dataColumns<HrEmployeeField>();
const regCol = dataColumns<WorkerRegisterRow>();

function periodDate(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}

function rawValue(row: HrEmployeeFiche, field: HrEmployeeField): unknown {
  if (field.storage_group === "extra") return row.attrs?.[field.code];
  return (row as unknown as Record<string, unknown>)[field.code];
}

function asText(value: unknown) {
  if (value == null || value === "") return "";
  return String(value);
}

function slugify(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return slug || `col_${Date.now().toString().slice(-6)}`;
}

export function EmployeesManager({
  initialEmployees,
  fields: initialFields,
  catalogs,
  kinds,
  sites = [],
  assignments = [],
  fiche = DEFAULT_FICHE_SETTINGS,
  register = null,
  registerError,
  loadError,
}: {
  initialEmployees: HrEmployeeFiche[];
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  kinds: CatalogKind[];
  sites?: Pick<SiteRow, "id" | "name_fr" | "name_ar">[];
  assignments?: EmployeeAssignment[];
  fiche?: HrFicheSettings;
  /** Worker register. Null when the register could not be loaded. */
  register?: WorkerRegisterRow[] | null;
  registerError?: string;
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialEmployees);
  const [fields, setFields] = useState(initialFields);
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [startNew] = useState(() => searchParams.get("nouveau") === "1");
  const [view, setView] = useState<EmployeeView>("list");
  const [panel, setPanel] = useState("fiches");
  const showBase = panel === "base";
  const selectPanel = useCallback((id: string) => {
    setPanel(id === "base" ? "base" : "fiches");
  }, []);
  const [open, setOpen] = useState(startNew);
  const [dossierEmployee, setDossierEmployee] = useState<HrEmployeeFiche | null>(null);
  const [preview, setPreview] = useState<HrEmployeeFiche | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const working = useMemo(() => workingStatusCodes(catalogs), [catalogs]);
  const statusOptions = useMemo(() => activityStatusOptions(catalogs), [catalogs]);
  const ficheCount = rows.filter((row) => row.fiche_done_at).length;
  const shownRows = useMemo(() => {
    const completed = rows.filter((row) => row.fiche_done_at);
    return activeOnly ? completed.filter((r) => working.has(r.status)) : completed;
  }, [rows, activeOnly, working]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    startNew ? emptyValues(initialFields.filter((f) => f.is_active)) : {},
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [registerDetail, setRegisterDetail] = useState<WorkerRegisterRow | null>(null);
  const autoMatricule = useRef("");
  const previousHire = useRef("");
  const newEntryRef = useRef(false);
  const [newEntry, setNewEntry] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const [newCol, setNewCol] = useState({
    label_ar: "",
    label_fr: "",
    value_type: "text" as HrEmployeeField["value_type"],
    catalog_kind: "",
    section_ar: "إضافي",
    section_fr: "Extra",
  });

  const ficheCatalogs = useMemo(
    () => mergeAffectationCatalog(catalogs, sites),
    [catalogs, sites],
  );

  const activeFields = useMemo(
    () =>
      fields
        .filter((f) => f.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  function display(row: HrEmployeeFiche, field: HrEmployeeField) {
    const raw = rawValue(row, field);
    if (field.code === "status") {
      const code = String(raw || "ACTIVE");
      const options = statusOptions.some((item) => item.code === code)
        ? statusOptions
        : [{ code, label: code }, ...statusOptions];
      return (
        <select
          className="h-8 max-w-[9rem] rounded-lg border border-border/70 bg-surface px-2 text-xs"
          value={code}
          disabled={pending}
          aria-label="État d'activité"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => changeStatus(row, event.target.value)}
        >
          {options.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      );
    }
    if (raw == null || raw === "") return "—";
    if (field.value_type === "catalog" && field.catalog_kind) {
      const opt = ficheCatalogs.find(
        (c) => c.kind === field.catalog_kind && c.code === String(raw),
      );
      return opt ? catalogOptionLabel(opt) : String(raw);
    }
    if (field.code === "photo_url") {
      return raw ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={String(raw)} alt="" className="h-10 w-8 object-cover" />
      ) : (
        "—"
      );
    }
    return String(raw);
  }

  const hireMatricule = useMemo(
    () =>
      nextMatriculeForHire(
        values.hired_at || "",
        rows.filter((row) => row.id !== values.id).map((row) => row.matricule),
      ),
    [values.hired_at, values.id, rows],
  );

  useEffect(() => {
    if (values.id) return;
    setValues((current) => {
      const typed = current.matricule || "";
      if (typed && typed !== autoMatricule.current) return current;
      if (typed === hireMatricule) return current;
      autoMatricule.current = hireMatricule;
      return { ...current, matricule: hireMatricule };
    });
  }, [hireMatricule, values.id]);

  const fallbackText = useCallback(
    (row: HrEmployeeFiche, code: "fiche_affectation" | "fiche_poste") => {
      const raw = row[code];
      if (!raw) return "";
      const field = fields.find((f) => f.code === code);
      if (field?.value_type === "catalog" && field.catalog_kind) {
        const opt = ficheCatalogs.find((c) => c.kind === field.catalog_kind && c.code === raw);
        if (opt) return opt.label_fr || opt.label_ar || raw;
      }
      return raw;
    },
    [fields, ficheCatalogs],
  );

  const describeEmployee = useCallback((row: HrEmployeeFiche): FilterRow => {
    const statusLabel = statusOptions.find((item) => item.code === row.status)?.label ?? row.status;
    const assignment = assignments.find((item) => item.employee_id === row.id);
    const site = assignment?.site || fallbackText(row, "fiche_affectation");
    const year = (row.hired_at ?? "").slice(0, 4);
    const facets: FilterRow["facets"] = [{ field: "statut", value: row.status, label: `Statut : ${statusLabel}` }];
    if (/^\d{4}$/.test(year)) facets.push({ field: "annee", value: year, label: `Année d'embauche : ${year}` });
    if (site) facets.push({ field: "chantier", value: site, label: `Chantier : ${site}` });
    if (!row.nss) facets.push({ field: "manque", value: "nss", label: "Sans NSS" });
    if (!row.nin) facets.push({ field: "manque", value: "nin", label: "Sans NIN" });
    if (!assignment) facets.push({ field: "manque", value: "contrat", label: "Sans contrat" });
    if (keepsFirstEmploymentNumber(row)) {
      facets.push({ field: "retour", value: "1", label: "Retour après une sortie" });
    }
    const completion = assessFicheCompletion({
      values: valuesFromFiche(row, fields),
      fields,
      catalogs,
      uploadedDocTypeCodes: row.uploaded_doc_codes ?? [],
    });
    facets.push({
      field: "documents",
      value: completion.documents,
      label: COMPLETION_LABELS.documents[completion.documents].ar,
    });
    facets.push({
      field: "champs",
      value: completion.fields,
      label: COMPLETION_LABELS.fields[completion.fields].ar,
    });
    return {
      text: [
        row.matricule,
        row.last_name,
        row.first_name,
        row.nss,
        row.nin,
        site,
        formatFicheDoneAt(row.fiche_done_at),
        COMPLETION_LABELS.documents[completion.documents].fr,
        COMPLETION_LABELS.documents[completion.documents].ar,
        COMPLETION_LABELS.fields[completion.fields].fr,
        COMPLETION_LABELS.fields[completion.fields].ar,
        ...fields.map((field) => asText(rawValue(row, field))),
      ]
        .filter(Boolean)
        .join(" "),
      matricule: row.matricule,
      facets,
      periods: row.card_periods,
    };
  }, [assignments, catalogs, fallbackText, fields, statusOptions]);
  const staffFilter = useScreenFilter({
    screen: "rh.employes",
    rows: shownRows,
    describe: describeEmployee,
    initialText: urlQuery,
  });
  const registerBase = useMemo(
    () =>
      (register ?? [])
        .filter((row) => (activeOnly ? row.status === "ACTIVE" : true))
        .sort((a, b) => b.hiredAt.localeCompare(a.hiredAt) || b.lineNo - a.lineNo),
    [register, activeOnly],
  );
  const describeRegister = useCallback((row: WorkerRegisterRow): FilterRow => {
    const year = row.hiredAt.slice(0, 4);
    const statusLabel = row.status === "ACTIVE" ? "Actif" : "Inactif";
    const facets: FilterRow["facets"] = [
      { field: "statut", value: row.status, label: `Statut : ${statusLabel}` },
    ];
    if (/^\d{4}$/.test(year)) facets.push({ field: "annee", value: year, label: `Année d'embauche : ${year}` });
    if (!row.nss) facets.push({ field: "manque", value: "nss", label: "Sans NSS" });
    if (!row.endedAt && row.status !== "ACTIVE") {
      facets.push({ field: "manque", value: "sortie", label: "Sans date de sortie" });
    }
    return {
      text: [row.matricule, row.lastName, row.firstName, row.nss, row.poste, row.birthPlace].filter(Boolean).join(" "),
      matricule: row.matricule,
      facets,
    };
  }, []);
  const registerFilter = useScreenFilter({
    screen: "rh.employes.registre",
    rows: registerBase,
    describe: describeRegister,
    initialText: urlQuery,
  });
  const registerColumns = useMemo(
    () => [
      regCol.accessor("matricule", { header: "Matricule" }),
      regCol.accessor((row) => `${row.lastName} ${row.firstName}`.trim(), { id: "nom", header: "Employé" }),
      regCol.accessor((row) => row.poste ?? "", { id: "poste", header: "Poste", cell: ({ getValue }) => getValue() || "—" }),
      regCol.accessor("hiredAt", {
        header: "Date d'entrée",
        cell: ({ row }) => periodDate(row.original.hiredAt),
      }),
      regCol.accessor("endedAt", {
        header: "Date de sortie",
        cell: ({ row }) => periodDate(row.original.endedAt) || "—",
      }),
      regCol.accessor((row) => row.nss ?? "", { id: "nss", header: "NSS", cell: ({ getValue }) => getValue() || "—" }),
      regCol.accessor("status", {
        header: "Statut",
        cell: ({ row }) => (row.original.status === "ACTIVE" ? "Actif" : "Inactif"),
      }),
    ],
    [],
  );

  function openCreate() {
    newEntryRef.current = false;
    setNewEntry(false);
    previousHire.current = "";
    autoMatricule.current = "";
    setValues(emptyValues(activeFields));
    setFormError(null);
    setSaveNotice(null);
    setSaved(false);
    setOpen(true);
  }

  function openEdit(row: HrEmployeeFiche) {
    newEntryRef.current = false;
    setNewEntry(false);
    previousHire.current = "";
    setFormError(null);
    setSaveNotice(null);
    setSaved(false);
    setValues(valuesFromFiche(row, fields));
    setOpen(true);
    startTransition(async () => {
      const result = await getHrEmployeeFiche(row.id);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      if (newEntryRef.current) return;
      setValues(valuesFromFiche(result.data, fields));
    });
  }

  function openNewEntry() {
    if (!values.id || newEntryRef.current) return;
    previousHire.current = (values.hired_at || "").slice(0, 10);
    newEntryRef.current = true;
    setNewEntry(true);
    setValues((current) => ({
      ...current,
      hired_at: "",
      declaration_date: "",
    }));
    setFormError(null);
    setSaved(false);
    setSaveNotice(null);
  }

  function submit() {
    if (savingRef.current) return;
    setFormError(null);
    setInfo(null);
    const manual = Boolean(values.matricule && values.matricule !== autoMatricule.current);
    const decision = confirmFicheIdentity(values, existingIds, manual, {
      newEntry,
      previousHiredAt: previousHire.current,
    });
    if (!decision.ok) {
      setFormError(decision.error);
      return;
    }
    const { normalized, error } = checkFicheValues(decision.values, activeFields);
    setValues(normalized);
    if (error) {
      setFormError(error);
      return;
    }
    const taken = rows.some(
      (row) => row.id !== normalized.id && matriculeKey(row.matricule) === matriculeKey(normalized.matricule ?? ""),
    );
    if (taken) {
      setFormError("Ce matricule est déjà utilisé.");
      return;
    }
    savingRef.current = true;
    setBusy(true);
    setSaved(false);
    setSaveNotice("جاري الحفظ…");
    startTransition(async () => {
      try {
        const result = await saveEmployeeFiche(
          normalized,
          activeFields,
          ficheCatalogs,
          () => {
            setSaved(true);
            setSaveNotice("تم الحفظ");
          },
          { newEntry },
        );
        if (!result.ok) {
          setFormError(result.error);
          setSaveNotice(null);
          setSaved(false);
          return;
        }
        const savedFiche = result.fiche;
        if (savedFiche) {
          setRows((prev) => {
            const without = prev.filter((r) => r.id !== savedFiche.id);
            return sortEmployees([...without, savedFiche]);
          });
          setValues(valuesFromFiche(savedFiche, fields));
        }
        newEntryRef.current = false;
        setNewEntry(false);
        setSaved(true);
        setSaveNotice("تم الحفظ");
        setInfo([decision.note, result.info].filter(Boolean).join(" "));
      } finally {
        savingRef.current = false;
        setBusy(false);
      }
    });
  }

  const existingIds = rows.map((r) => ({
    id: r.id,
    matricule: r.matricule,
    nin: r.nin,
    nss: r.nss,
    last_name: r.last_name,
    first_name: r.first_name,
    birth_date: r.birth_date,
    hired_at: r.hired_at,
  }));

  function refreshRows() {
    startTransition(async () => {
      const result = await listHrEmployeeFiches();
      if (result.ok) setRows(result.data);
    });
  }

  function changeStatus(row: HrEmployeeFiche, status: string) {
    if (!status || status === row.status) return;
    startTransition(async () => {
      const result = await setHrEmployeeStatus({ id: row.id, status });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setRows((prev) =>
        sortEmployees(prev.map((r) => (r.id === row.id ? { ...r, status: result.data.status } : r))),
      );
    });
  }

  function searchFromFiche(q: string) {
    const found = findEmployeeForFicheSearch(rows, q);
    if (!found.ok) {
      setFormError(found.error);
      return;
    }
    const row = rows.find((r) => r.id === found.employee.id);
    if (row) openEdit(row);
  }

  const columns: DataColumn<HrEmployeeFiche>[] = [
    col.accessor((row) => formatFicheDoneAt(row.fiche_done_at), {
      id: "fiche_done_at",
      header: () => (
        <span className="flex flex-col items-start">
          <span>Réalisée le</span>
          <span className="font-normal normal-case tracking-normal" dir="rtl">
            تاريخ الإنجاز
          </span>
        </span>
      ),
      meta: { label: "Réalisée le", className: "whitespace-nowrap" },
      cell: ({ row }) => formatFicheDoneAt(row.original.fiche_done_at) || "—",
    }),
    col.display({
      id: "fiche_state",
      header: () => (
        <span className="flex flex-col items-start">
          <span>État</span>
          <span className="font-normal normal-case tracking-normal" dir="rtl">
            الحالة
          </span>
        </span>
      ),
      enableSorting: false,
      meta: { label: "État", className: "whitespace-nowrap" },
      cell: ({ row }) => {
        const completion = assessFicheCompletion({
          values: valuesFromFiche(row.original, fields),
          fields,
          catalogs,
          uploadedDocTypeCodes: row.original.uploaded_doc_codes ?? [],
        });
        return (
          <div className="flex min-w-[14rem] flex-col gap-0.5 text-xs leading-snug">
            <span>
              {COMPLETION_LABELS.documents[completion.documents].fr} — {COMPLETION_LABELS.documents[completion.documents].ar}
            </span>
            <span>
              {COMPLETION_LABELS.fields[completion.fields].fr} — {COMPLETION_LABELS.fields[completion.fields].ar}
            </span>
          </div>
        );
      },
    }),
    ...activeFields.map((field) =>
      col.accessor((row) => asText(rawValue(row, field)), {
        id: field.code,
        header: () => (
          <span className="flex flex-col items-start">
            <span>{field.label_fr}</span>
            <span className="font-normal normal-case tracking-normal" dir="rtl">
              {field.label_ar}
            </span>
          </span>
        ),
        meta: { label: field.label_fr || field.label_ar || field.code, className: "whitespace-nowrap" },
        cell: ({ row }) => display(row.original, field),
      }),
    ),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { className: "sticky right-0 bg-surface", headerClassName: "sticky right-0 bg-surface-muted" },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setPreview(row.original)}>
            Ouvrir
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => openEdit(row.original)}>
            Modifier
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setDossierEmployee(row.original)}>
            Dossier
          </Button>
        </div>
      ),
    }),
  ];

  const fieldColumns = [
    fieldCol.accessor((f) => `${f.label_fr} — ${f.label_ar}`, {
      id: "label",
      header: "Colonne",
      cell: ({ row }) => (
        <>
          {row.original.label_fr} — {row.original.label_ar}
          {!row.original.is_active ? <span className="ms-2 text-xs text-foreground/45">Masqué</span> : null}
        </>
      ),
    }),
    fieldCol.accessor("value_type", { header: "Type", meta: { className: "text-xs" } }),
    fieldCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const field = row.original;
        return (
          <div className="flex gap-2">
            {field.is_active ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteHrEmployeeField(field.id);
                    if (!result.ok) {
                      setFormError(result.error);
                      return;
                    }
                    setFields((prev) =>
                      field.is_system
                        ? prev.map((f) => (f.id === field.id ? { ...f, is_active: false } : f))
                        : prev.filter((f) => f.id !== field.id),
                    );
                  });
                }}
              >
                Supprimer
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await setHrEmployeeFieldActive({
                      id: field.id,
                      is_active: true,
                    });
                    if (!result.ok) {
                      setFormError(result.error);
                      return;
                    }
                    setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, is_active: true } : f)));
                  });
                }}
              >
                Afficher
              </Button>
            )}
          </div>
        );
      },
    }),
  ];

  return (
    <RhPage>
      <RhPageHeader
        eyebrow={
          showBase
            ? `${register?.length ?? 0} période${(register?.length ?? 0) > 1 ? "s" : ""}`
            : `${ficheCount} fiche${ficheCount > 1 ? "s" : ""} réalisée${ficheCount > 1 ? "s" : ""}`
        }
        title="Personnel"
        actionsTabset="btn_rh_employees"
        actions={
          showBase ? null : (
            <>
              <ToolbarSlot id="columns">
                <Button type="button" variant="secondary" onClick={() => setColumnsOpen(true)}>
                  <Columns3 aria-hidden />
                  Colonnes
                </Button>
              </ToolbarSlot>
              <ToolbarSlot id="new">
                <Button type="button" disabled={pending} onClick={openCreate}>
                  <UserPlus aria-hidden />
                  Nouvel employé
                </Button>
              </ToolbarSlot>
            </>
          )
        }
      />

      {loadError || formError ? (
        <RhAlert tone="danger">{loadError || formError}</RhAlert>
      ) : null}
      {info && !loadError && !formError ? (
        <RhAlert tone="success">{info}</RhAlert>
      ) : null}
      {showBase && registerError ? <RhAlert tone="danger">{registerError}</RhAlert> : null}

      <RhTabs
        uiKey="hr_employees"
        items={[
          { id: "fiches", label: "Fiches", count: ficheCount },
          { id: "base", label: "Base de données", count: register?.length },
        ]}
        value={showBase ? "base" : "fiches"}
        onChange={selectPanel}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {showBase ? null : (
            <>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setImportOpen(true)}>
                <DatabaseZap aria-hidden />
                Importer l&apos;ancienne base
              </Button>
              <Button type="button" variant="secondary" onClick={() => setReportOpen(true)}>
                <ClipboardList aria-hidden />
                RAPPORT
              </Button>
              <Button type="button" variant="secondary" onClick={() => setExportOpen(true)}>
                <FileDown aria-hidden />
                Télécharger / Imprimer
              </Button>
            </>
          )}
          <Button
            type="button"
            variant={activeOnly ? "primary" : "secondary"}
            aria-pressed={activeOnly}
            onClick={() => setActiveOnly((on) => !on)}
          >
            <UserCheck aria-hidden />
            Actifs seulement
            {activeOnly ? ` (${showBase ? registerBase.length : shownRows.length})` : ""}
          </Button>
        </div>
        {view === "table" ? <EmployeeViewSwitch value={view} onChange={setView} /> : null}
      </div>

      {showBase ? registerFilter.bar : staffFilter.bar}

      {view === "table" ? (
        showBase ? (
          <DataTable
            data={registerFilter.rows}
            columns={registerColumns}
            getRowId={(r) => String(r.id)}
            searchable={false}
            columnToggle={false}
            pageSize={0}
            maxHeight="70vh"
            emptyTitle="Aucune période"
            emptyBody={registerFilter.emptyHint ?? undefined}
            onRowClick={setRegisterDetail}
          />
        ) : (
          <DataTable
            data={staffFilter.rows}
            columns={columns}
            getRowId={(r) => r.id}
            searchable={false}
            columnToggle={false}
            pageSize={0}
            maxHeight="70vh"
            emptyTitle="Aucun employé"
            emptyBody={staffFilter.emptyHint ?? undefined}
          />
        )
      ) : (
        <EmployeesList
          rows={staffFilter.rows}
          assignments={assignments}
          fallback={fallbackText}
          initialQuery=""
          hideFilters
          emptyHint={showBase ? registerFilter.emptyHint : staffFilter.emptyHint}
          view={view}
          onViewChange={setView}
          pending={pending}
          onOpen={setPreview}
          onEdit={openEdit}
          onDossier={setDossierEmployee}
          onStatus={changeStatus}
          statusOptions={statusOptions}
          registerRows={showBase ? registerFilter.rows : undefined}
          registerTotal={showBase ? registerBase.length : undefined}
          onOpenRegister={setRegisterDetail}
        />
      )}

      {columnsOpen ? (
        <RhModal
          title="Colonnes base employés"
          subtitle="Ajoutez une colonne ici. Masquer une colonne système la cache sans effacer les données."
          onClose={() => setColumnsOpen(false)}
          footer={
            <Button variant="secondary" onClick={() => setColumnsOpen(false)}>
              Fermer
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Libellé AR">
              <input
                dir="rtl"
                className={rhInput}
                value={newCol.label_ar}
                onChange={(e) => setNewCol({ ...newCol, label_ar: e.target.value })}
              />
            </RhField>
            <RhField label="Libellé">
              <input
                className={rhInput}
                value={newCol.label_fr}
                onChange={(e) => setNewCol({ ...newCol, label_fr: e.target.value })}
              />
            </RhField>
            <RhField label="Type">
              <select
                className={rhInput}
                value={newCol.value_type}
                onChange={(e) =>
                  setNewCol({
                    ...newCol,
                    value_type: e.target.value as HrEmployeeField["value_type"],
                  })
                }
              >
                <option value="text">Texte</option>
                <option value="date">Date</option>
                <option value="number">Nombre</option>
                <option value="catalog">Liste</option>
              </select>
            </RhField>
            {newCol.value_type === "catalog" ? (
              <RhField label="Liste">
                <select
                  className={rhInput}
                  value={newCol.catalog_kind}
                  onChange={(e) =>
                    setNewCol({ ...newCol, catalog_kind: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {kinds.map((k) => (
                    <option key={k.code} value={k.code}>
                      {k.label_fr} — {k.label_ar}
                    </option>
                  ))}
                </select>
              </RhField>
            ) : null}
          </div>
          <div className="mt-3">
            <Button
              disabled={pending}
              onClick={() => {
                setFormError(null);
                startTransition(async () => {
                  const result = await upsertHrEmployeeField({
                    code: slugify(newCol.label_fr || newCol.label_ar),
                    label_ar: newCol.label_ar,
                    label_fr: newCol.label_fr,
                    value_type: newCol.value_type,
                    catalog_kind: newCol.catalog_kind || null,
                    section_ar: newCol.section_ar,
                    section_fr: newCol.section_fr,
                  });
                  if (!result.ok) {
                    setFormError(result.error);
                    return;
                  }
                  setFields((prev) => [
                    ...prev,
                    {
                      id: result.data.id,
                      code: slugify(newCol.label_fr || newCol.label_ar),
                      label_ar: newCol.label_ar,
                      label_fr: newCol.label_fr,
                      value_type: newCol.value_type,
                      catalog_kind: newCol.catalog_kind || null,
                      storage_group: "extra",
                      section_ar: newCol.section_ar,
                      section_fr: newCol.section_fr,
                      sort_order: 800,
                      is_system: false,
                      is_active: true,
                      is_required: false,
                    },
                  ]);
                  setNewCol({
                    label_ar: "",
                    label_fr: "",
                    value_type: "text",
                    catalog_kind: "",
                    section_ar: "إضافي",
                    section_fr: "Extra",
                  });
                  setInfo("Colonne ajoutée.");
                });
              }}
            >
              Ajouter une colonne
            </Button>
          </div>
          <DataTable
            className="mt-4"
            data={fields.slice().sort((a, b) => a.sort_order - b.sort_order)}
            columns={fieldColumns}
            getRowId={(f) => f.id}
            searchPlaceholder="Rechercher une colonne…"
            searchText={(f) => [f.label_fr, f.label_ar, f.code, f.value_type].filter(Boolean).join(" ")}
            pageSize={0}
            columnToggle={false}
            emptyTitle="Aucune colonne"
          />
        </RhModal>
      ) : null}

      {dossierEmployee ? (
        <EmployeeAdminDossierDialog
          employeeId={dossierEmployee.id}
          employeeLabel={[
            dossierEmployee.matricule,
            dossierEmployee.last_name,
            dossierEmployee.first_name,
          ]
            .filter(Boolean)
            .join(" · ")}
          catalogs={ficheCatalogs}
          onClose={() => setDossierEmployee(null)}
          onOpenFiche={() => openEdit(dossierEmployee)}
        />
      ) : null}

      {registerDetail ? (
        <RhModal
          title={`${registerDetail.lastName} ${registerDetail.firstName}`.trim()}
          subtitle={registerDetail.matricule}
          onClose={() => setRegisterDetail(null)}
          footer={
            <>
              {(() => {
                const card = rows.find((item) => matriculeKey(item.matricule) === matriculeKey(registerDetail.matricule));
                return card ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setRegisterDetail(null);
                      setPreview(card);
                    }}
                  >
                    Ouvrir la fiche
                  </Button>
                ) : null;
              })()}
              <Button type="button" variant="secondary" onClick={() => setRegisterDetail(null)}>
                Fermer
              </Button>
            </>
          }
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {(
              [
                ["Poste", registerDetail.poste],
                ["NSS", registerDetail.nss],
                ["Date de naissance", periodDate(registerDetail.birthDate) || null],
                ["Lieu de naissance", registerDetail.birthPlace],
                ["Sexe", registerDetail.sex],
                ["Date d'entrée", periodDate(registerDetail.hiredAt)],
                ["Date de sortie", periodDate(registerDetail.endedAt) || null],
                ["Statut", registerDetail.status === "ACTIVE" ? "Actif" : "Inactif"],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-foreground/50">{label}</dt>
                <dd className="mt-0.5 font-medium text-foreground">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </RhModal>
      ) : null}

      {preview ? (
        <EmployeeCardPreview
          employee={rows.find((r) => r.id === preview.id) ?? preview}
          fields={fields}
          catalogs={ficheCatalogs}
          fiche={fiche}
          onClose={() => setPreview(null)}
          onEdit={() => {
            const row = preview;
            setPreview(null);
            openEdit(row);
          }}
        />
      ) : null}

      {reportOpen ? (
        <EmployeeTableReport
          people={staffFilter.rows.map((r) => ({
            id: r.id,
            matricule: r.matricule,
            nin: r.nin,
            nss: r.nss,
            last_name: r.last_name,
            first_name: r.first_name,
            birth_date: r.birth_date,
            hired_at: r.hired_at,
          }))}
          filtered={staffFilter.active}
          onClose={() => setReportOpen(false)}
          onOpen={(id) => {
            const row = rows.find((item) => item.id === id);
            setReportOpen(false);
            if (row) openEdit(row);
          }}
        />
      ) : null}

      {importOpen ? (
        <EmployeeImportDialog
          fields={fields}
          catalogs={ficheCatalogs}
          existing={existingIds}
          onClose={() => setImportOpen(false)}
          onImported={refreshRows}
        />
      ) : null}

      {exportOpen ? (
        <EmployeeExportDialog
          rows={staffFilter.rows}
          fields={fields}
          catalogs={ficheCatalogs}
          onClose={() => setExportOpen(false)}
        />
      ) : null}

      {open ? (
        <EmployeeFicheDialog
          values={values}
          setValues={setValues}
          fields={fields}
          catalogs={ficheCatalogs}
          fiche={fiche}
          pending={busy || pending}
          formError={formError}
          saveNotice={saveNotice}
          saved={saved}
          onEdit={() => {
            if (savingRef.current) return;
            setSaveNotice(null);
            setSaved(false);
          }}
          onClose={() => setOpen(false)}
          onSubmit={submit}
          onNew={openCreate}
          onNewEntry={openNewEntry}
          newEntry={newEntry}
          onSearch={searchFromFiche}
          takenMatricules={rows.filter((row) => row.id !== values.id).map((row) => row.matricule)}
        />
      ) : null}
    </RhPage>
  );
}

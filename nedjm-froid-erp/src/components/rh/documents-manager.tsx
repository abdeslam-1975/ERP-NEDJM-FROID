"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveLeaveTitle,
  upsertHrCorrespondence,
  upsertHrFile,
  type HrCorrespondenceRow,
  type HrFileRow,
} from "@/lib/actions/hr-documents";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import {
  OM_DONNEUR,
  OM_FAIT_A,
  formatEstablishmentDate,
  formatOmDate,
  missionOrderFieldsSchema,
  missionPayload,
  missionPointageHref,
  pickMissionContract,
  type MissionContractHint,
} from "@/lib/hr/mission-order";
import {
  LEAVE_TITLE_FIELD_KEYS,
  leaveDaysLabel,
  leaveNature,
  leaveOfCorrespondence,
  leaveTitleFieldsSchema,
} from "@/lib/hr/leave-title";
import {
  MissionOrderDialog,
  emptyMissionDraft,
  missionDraftDateIssue,
  type MissionDraft,
} from "@/components/rh/mission-order-dialog";
import { LeaveTitleDialog, type LeaveTitleDraft } from "@/components/rh/leave-title-dialog";
import { buildLeaveTitleHtml, leaveTitleReference } from "@/components/rh/leave-title-print";
import { buildMissionOrderHtml } from "@/components/rh/mission-order-print";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import {
  CatalogSelect,
  RhAlert,
  RhChip,
  RhField,
  RhPageHeader,
  RhPanel,
  RhTabs,
  bi,
  catalogOptions,
  rhInput,
} from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };

const corrCol = dataColumns<HrCorrespondenceRow>();
const fileCol = dataColumns<HrFileRow>();

const otherCorrColumns = [
  corrCol.accessor("number", { header: "N°" }),
  corrCol.accessor("type_code", { header: "Type" }),
  corrCol.accessor((r) => `${r.matricule} ${r.employee_name}`, { id: "employee", header: "Employé" }),
  corrCol.accessor((r) => `${r.start_date ?? "—"} → ${r.end_date ?? "—"}`, { id: "period", header: "Période" }),
  corrCol.accessor("status_code", { header: "Statut" }),
];

const fileColumns = [
  fileCol.accessor((r) => `${r.matricule} ${r.employee_name}`, { id: "employee", header: "Employé" }),
  fileCol.accessor("doc_type_code", { header: "Type" }),
  fileCol.accessor((r) => r.issued_on ?? "—", { id: "issued_on", header: "Émis" }),
  fileCol.accessor((r) => r.expires_on ?? "—", { id: "expires_on", header: "Expire" }),
];

function textPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function printHtml(html: string) {
  const existing = document.getElementById("hr-print-frame");
  existing?.remove();
  const frame = document.createElement("iframe");
  frame.id = "hr-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "794px";
  frame.style.height = "1123px";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => frame.remove();
  win.addEventListener("afterprint", cleanup);
  const run = () => {
    win.focus();
    win.print();
    window.setTimeout(cleanup, 2000);
  };
  const images = Array.from(doc.images);
  if (images.length === 0) {
    run();
    return;
  }
  let pending = images.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) run();
  };
  for (const image of images) {
    if (image.complete) done();
    else {
      image.addEventListener("load", done);
      image.addEventListener("error", done);
    }
  }
}

export type DocumentsTab = "files" | "corr" | "conges";

export function DocumentsManager({
  files,
  correspondences,
  employees,
  sites,
  catalogs,
  contracts,
  letterheadUrl = null,
  openMission = false,
  initialTab = "corr",
  openTitleId,
  loadError,
}: {
  files: HrFileRow[];
  correspondences: HrCorrespondenceRow[];
  employees: HrEmployeeRow[];
  sites: readonly SiteOpt[];
  catalogs: CatalogItem[];
  contracts: MissionContractHint[];
  letterheadUrl?: string | null;
  openMission?: boolean;
  initialTab?: DocumentsTab;
  /** LEAVE correspondence whose titre de congé opens on arrival. */
  openTitleId?: string;
  loadError?: string;
}) {
  const router = useRouter();
  const titleOnArrival = openTitleId
    ? correspondences.find((row) => row.id === openTitleId && row.type_code === "LEAVE")
    : undefined;
  const [tab, setTab] = useState<DocumentsTab>(titleOnArrival ? "conges" : initialTab);
  const [missionOpen, setMissionOpen] = useState(openMission);
  const [missionForm, setMissionForm] = useState<MissionDraft>(emptyMissionDraft);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [titleForm, setTitleForm] = useState<LeaveTitleDraft | null>(() =>
    titleOnArrival ? titleDraftFromRow(titleOnArrival) : null,
  );
  const [titleError, setTitleError] = useState<string | null>(null);
  const [fileRows, setFileRows] = useState(files);
  const [corrRows, setCorrRows] = useState(correspondences);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pointageHref, setPointageHref] = useState<string | null>(null);
  const [fileForm, setFileForm] = useState({
    employee_id: "",
    doc_type_code: "",
    file_url: "",
    issued_on: "",
    expires_on: "",
    notes: "",
  });
  const [corrForm, setCorrForm] = useState({
    employee_id: "",
    site_id: "",
    type_code: "",
    status_code: "DRAFT",
    start_date: "",
    end_date: "",
  });

  const selectedType = catalogs.find(
    (t) => t.kind === "correspondence_type" && t.code === corrForm.type_code,
  );
  const legendHint =
    selectedType && typeof selectedType.extra?.generates_legend === "string"
      ? String(selectedType.extra.generates_legend)
      : "";
  const otherTypes = catalogs.filter(
    (item) => item.kind !== "correspondence_type" || item.code !== "OM",
  );

  function closeMission() {
    setMissionOpen(false);
    setMissionForm(emptyMissionDraft());
    setMissionError(null);
    if (openMission) router.replace("/rh/documents");
  }

  function draftFromRow(row: HrCorrespondenceRow): MissionDraft {
    const emp = employees.find((item) => item.id === row.employee_id);
    const [fallbackNom, ...rest] = (row.employee_name || "").split(" ");
    const legacyMoyen =
      textPayload(row.payload, "moyen") ||
      (textPayload(row.payload, "transport_mode") === "TRAIN"
        ? "Train"
        : textPayload(row.payload, "transport_mode") === "TAXI"
          ? "Taxi"
          : textPayload(row.payload, "transport_mode") === "PLANE" ||
              textPayload(row.payload, "transport_mode") === "AVION"
            ? "Avion"
            : "");
    return {
      ...emptyMissionDraft(),
      id: row.id,
      numero: row.number,
      employee_id: row.employee_id,
      site_id: row.site_id ?? "",
      matricule: textPayload(row.payload, "matricule") || row.matricule,
      nom: textPayload(row.payload, "nom") || emp?.last_name || fallbackNom || "",
      prenom: textPayload(row.payload, "prenom") || emp?.first_name || rest.join(" "),
      affectation: textPayload(row.payload, "affectation"),
      codeAffectation: textPayload(row.payload, "codeAffectation"),
      poste: textPayload(row.payload, "poste") || textPayload(row.payload, "fonction"),
      dest1: textPayload(row.payload, "dest1") || textPayload(row.payload, "destination_1") || textPayload(row.payload, "destination"),
      dest2: textPayload(row.payload, "dest2") || textPayload(row.payload, "destination_2"),
      lieuDepart: textPayload(row.payload, "lieuDepart") || textPayload(row.payload, "depart_lieu"),
      dateDepart: textPayload(row.payload, "dateDepart") || textPayload(row.payload, "depart_date") || row.start_date || "",
      heureDepart: textPayload(row.payload, "heureDepart") || textPayload(row.payload, "depart_heure"),
      lieuRetour: textPayload(row.payload, "lieuRetour") || textPayload(row.payload, "retour_lieu"),
      dateRetour: textPayload(row.payload, "dateRetour") || textPayload(row.payload, "retour_date") || row.end_date || "",
      heureRetour: textPayload(row.payload, "heureRetour") || textPayload(row.payload, "retour_heure"),
      motif: textPayload(row.payload, "motif") || textPayload(row.payload, "object"),
      moyen: legacyMoyen,
      modele: textPayload(row.payload, "modele") || textPayload(row.payload, "vehicle_model"),
      immat: textPayload(row.payload, "immat") || textPayload(row.payload, "vehicle_plate"),
      kmDepart: textPayload(row.payload, "kmDepart") || textPayload(row.payload, "km_depart"),
      kmRetour: textPayload(row.payload, "kmRetour") || textPayload(row.payload, "km_retour"),
      pieceType: textPayload(row.payload, "pieceType"),
      pieceNum: textPayload(row.payload, "pieceNum") || textPayload(row.payload, "id_number"),
      pieceDelivre: textPayload(row.payload, "pieceDelivre") || textPayload(row.payload, "id_issued_on"),
      pieceFonction: textPayload(row.payload, "pieceFonction") || textPayload(row.payload, "issuer_fonction"),
      pieceLieu: textPayload(row.payload, "pieceLieu") || textPayload(row.payload, "id_issued_place"),
      donneur: textPayload(row.payload, "donneur") || textPayload(row.payload, "issuer_service") || emptyMissionDraft().donneur,
      faitA: textPayload(row.payload, "faitA") || textPayload(row.payload, "done_at") || emptyMissionDraft().faitA,
      dateDoc: textPayload(row.payload, "dateDoc") || textPayload(row.payload, "done_on") || emptyMissionDraft().dateDoc,
      gabarit: textPayload(row.payload, "gabarit"),
      savedDateDepart: row.start_date ?? "",
      savedDateRetour: row.end_date ?? "",
    };
  }

  function printMission(draft: MissionDraft) {
    const checked = missionOrderFieldsSchema.safeParse({
      ...draft,
      matricule: draft.matricule || "—",
      nom: draft.nom || "—",
    });
    if (!checked.success) {
      setMissionError(checked.error.issues[0]?.message ?? "Données invalides");
      return;
    }
    printHtml(
      buildMissionOrderHtml(
        { ...checked.data, numero: draft.numero },
        companyLetterheadUrl(letterheadUrl, window.location.origin),
        window.location.origin,
      ),
    );
  }

  function openMissionRow(row: HrCorrespondenceRow) {
    setTab("corr");
    setMissionError(null);
    setMissionForm(draftFromRow(row));
    setMissionOpen(true);
  }

  function saveMission() {
    setMissionError(null);
    if (!missionForm.employee_id) {
      setMissionError("Employé requis. · العامل مطلوب.");
      return;
    }
    const checked = missionOrderFieldsSchema.safeParse(missionForm);
    if (!checked.success) {
      setMissionError(checked.error.issues[0]?.message ?? "Données invalides");
      return;
    }
    const dateIssue = missionDraftDateIssue(missionForm);
    if (dateIssue) {
      setMissionError(dateIssue.message);
      return;
    }
    start(async () => {
      const r = await upsertHrCorrespondence({
        id: missionForm.id,
        employee_id: missionForm.employee_id,
        site_id: missionForm.site_id || null,
        type_code: "OM",
        status_code: "ISSUED",
        start_date: checked.data.dateDepart,
        end_date: checked.data.dateRetour,
        payload: missionPayload(checked.data),
      });
      if (!r.ok) {
        setMissionError(r.error);
        return;
      }
      const saved: HrCorrespondenceRow = {
        id: r.data.id,
        employee_id: missionForm.employee_id,
        site_id: r.data.site_id,
        type_code: "OM",
        number: r.data.number,
        status_code: "ISSUED",
        start_date: checked.data.dateDepart,
        end_date: checked.data.dateRetour,
        payload: {
          ...missionPayload(checked.data),
          ...(r.data.archive_url ? { archive_url: r.data.archive_url } : {}),
        },
        created_at: new Date().toISOString(),
        created_by: null,
        created_by_name: "—",
        last_name: checked.data.nom,
        first_name: checked.data.prenom ?? "",
        matricule: checked.data.matricule,
        employee_name: `${checked.data.nom} ${checked.data.prenom ?? ""}`.trim(),
        archive_url: r.data.archive_url,
      };
      setCorrRows((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
      setInfo(
        `${
          r.data.archive_url
            ? `Ordre ${r.data.number} enregistré et archivé.`
            : `Ordre de mission ${r.data.number} enregistré.`
        }${r.data.archive_error ? ` Archive non créée : ${r.data.archive_error}` : ""} Jours MS proposés dans le pointage, à valider. · أيام المهمة مقترحة في جدول الحضور وتنتظر الاعتماد.`,
      );
      setPointageHref(
        missionPointageHref({
          employeeId: missionForm.employee_id,
          siteId: r.data.site_id,
          dateDepart: checked.data.dateDepart,
        }),
      );
      setError(null);
      closeMission();
    });
  }

  function consultMission(row: HrCorrespondenceRow) {
    const url = row.archive_url || textPayload(row.payload, "archive_url");
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    printMission(draftFromRow(row));
  }

  function titleDraftFromRow(row: HrCorrespondenceRow): LeaveTitleDraft {
    const emp = employees.find((item) => item.id === row.employee_id);
    const contract = pickMissionContract(contracts, row.employee_id);
    const site = sites.find((item) => item.id === contract?.site_id);
    const idType = catalogOptions(catalogs, "id_type").find((item) => item.code === emp?.id_type_code);
    const saved = (row.payload.titre ?? {}) as Record<string, unknown>;
    const defaults: Record<string, string> = {
      matricule: row.matricule || emp?.matricule || "",
      nom: row.last_name || emp?.last_name || "",
      prenom: row.first_name || emp?.first_name || "",
      affectation: site?.name_fr || emp?.fiche_affectation || "",
      poste: contract?.poste_fr || emp?.fiche_poste || "",
      pieceType: idType?.label_fr || emp?.id_type_code || "",
      pieceNum: emp?.id_number || "",
      donneur: OM_DONNEUR,
      faitA: OM_FAIT_A,
      dateDoc: (row.created_at ?? "").slice(0, 10),
    };
    const fields = Object.fromEntries(
      LEAVE_TITLE_FIELD_KEYS.map((key) => [
        key,
        typeof saved[key] === "string" ? (saved[key] as string) : (defaults[key] ?? ""),
      ]),
    ) as Record<(typeof LEAVE_TITLE_FIELD_KEYS)[number], string>;
    return {
      ...fields,
      id: row.id,
      numero: row.number,
      employee_id: row.employee_id,
      status_code: row.status_code,
      leave: leaveOfCorrespondence(row),
    };
  }

  function openTitle(row: HrCorrespondenceRow) {
    setTitleError(null);
    setTitleForm(titleDraftFromRow(row));
  }

  function printTitle(draft: LeaveTitleDraft) {
    const checked = leaveTitleFieldsSchema.safeParse({
      ...draft,
      matricule: draft.matricule || "—",
      nom: draft.nom || "—",
    });
    if (!checked.success) {
      setTitleError(checked.error.issues[0]?.message ?? "Données invalides");
      return;
    }
    printHtml(
      buildLeaveTitleHtml(
        checked.data,
        draft.leave,
        draft.numero,
        companyLetterheadUrl(letterheadUrl, window.location.origin),
        window.location.origin,
      ),
    );
  }

  function saveTitle() {
    if (!titleForm) return;
    setTitleError(null);
    const draft = titleForm;
    start(async () => {
      const r = await saveLeaveTitle({ id: draft.id, fields: draft });
      if (!r.ok) {
        setTitleError(r.error);
        return;
      }
      setCorrRows((prev) =>
        prev.map((row) => (row.id === draft.id ? { ...row, payload: { ...row.payload, titre: r.data.titre } } : row)),
      );
      setPointageHref(null);
      setError(null);
      setInfo(`Titre de congé ${leaveTitleReference(draft.numero)} enregistré. · تم حفظ سند الإجازة.`);
      setTitleForm(null);
    });
  }

  const omRows = corrRows.filter((row) => row.type_code === "OM");
  const leaveRows = corrRows.filter((row) => row.type_code === "LEAVE");
  const otherCorrRows = corrRows.filter((row) => row.type_code !== "OM" && row.type_code !== "LEAVE");

  const leaveColumns = [
    corrCol.accessor((r) => leaveTitleReference(r.number), {
      id: "reference",
      header: "Référence — الرقم المرجعي",
      cell: ({ row: { original: r } }) => (
        <>
          <div className="font-mono font-semibold text-brand">{leaveTitleReference(r.number)}</div>
          <div className="mt-0.5 text-[10px] text-foreground/40">{r.number}</div>
        </>
      ),
    }),
    corrCol.accessor((r) => r.matricule || "—", {
      id: "matricule",
      header: "Matricule — الرقم التسلسلي",
      meta: { className: "font-mono" },
    }),
    corrCol.accessor((r) => `${r.last_name} ${r.first_name}`.trim() || "—", {
      id: "employee",
      header: "Nom et prénom — الاسم واللقب",
    }),
    corrCol.accessor((r) => leaveNature(leaveOfCorrespondence(r).kind).fr, {
      id: "nature",
      header: "Nature — طبيعة الإجازة",
    }),
    corrCol.accessor((r) => r.start_date ?? "", {
      id: "period",
      header: "Période — الفترة",
      cell: ({ row: { original: r } }) => {
        const leave = leaveOfCorrespondence(r);
        return (
          <span className="whitespace-nowrap tabular-nums">
            {formatOmDate(leave.dateDebut)} → {formatOmDate(leave.dateFin)}
          </span>
        );
      },
    }),
    corrCol.accessor((r) => leaveOfCorrespondence(r).jours, {
      id: "jours",
      header: "Jours — الأيام",
      cell: (info) => <span className="tabular-nums">{leaveDaysLabel(info.getValue())}</span>,
    }),
    corrCol.display({
      id: "actions",
      header: "Titre — السند",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: r } }) =>
        r.status_code === "CANCELLED" ? (
          <RhChip tone="danger">{bi("Annulé", "ملغى")}</RhChip>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="secondary" onClick={() => openTitle(r)}>
              {bi("Ouvrir le titre", "فتح السند")}
            </Button>
            <Button variant="secondary" onClick={() => printTitle(titleDraftFromRow(r))}>
              {bi("Imprimer", "طباعة")}
            </Button>
            {r.payload.titre ? null : <RhChip tone="warning">{bi("À compléter", "للإكمال")}</RhChip>}
          </div>
        ),
    }),
  ];

  const omColumns = [
    corrCol.accessor("number", {
      header: "Référence unique — الرقم المرجعي",
      cell: ({ row: { original: r } }) => (
        <>
          <div className="font-mono font-semibold text-brand">{r.number}</div>
          <div className="mt-0.5 text-[10px] text-foreground/40">{r.id}</div>
        </>
      ),
    }),
    corrCol.accessor((r) => r.matricule || "—", {
      id: "matricule",
      header: "Matricule — الرقم التسلسلي",
      meta: { className: "font-mono" },
    }),
    corrCol.accessor((r) => r.last_name || "—", { id: "last_name", header: "Nom — لقب العامل" }),
    corrCol.accessor((r) => r.first_name || "—", { id: "first_name", header: "Prénom — اسم العامل" }),
    corrCol.accessor((r) => r.created_by_name || "—", { id: "created_by", header: "Établi par — منشئ أمر المهمة" }),
    corrCol.accessor("created_at", {
      header: "Date d'établissement — تاريخ الإنشاء",
      cell: (info) => formatEstablishmentDate(info.getValue()),
    }),
    corrCol.display({
      id: "actions",
      header: "Consulter — عرض",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: r } }) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="secondary" onClick={() => consultMission(r)}>
            Consulter l&apos;ordre de mission — عرض أمر المهمة
          </Button>
          <Button variant="secondary" onClick={() => openMissionRow(r)}>
            {bi("Modifier", "تعديل")}
          </Button>
          {r.start_date ? (
            <Button
              variant="secondary"
              onClick={() =>
                router.push(
                  missionPointageHref({
                    employeeId: r.employee_id,
                    siteId: r.site_id,
                    dateDepart: r.start_date,
                  }),
                )
              }
            >
              {bi("Pointage", "الحضور")}
            </Button>
          ) : null}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="الوثائق الإدارية — Documents RH"
        description="سجل إلكتروني مركزي لأوامر المهمة وسندات الإجازات. كل وثيقة تحصل على رقم مرجعي لا يُعاد استخدامه. · Registre central des ordres de mission et titres de congé : numéro de référence non réutilisable."
      />
      <RhTabs
        uiKey="hr_documents"
        items={[
          { id: "corr", label: "أوامر المهمة — Ordres de mission" },
          { id: "conges", label: "سندات الإجازات — Titres de congé" },
          { id: "files", label: "الوثائق الرسمية — Pièces officielles" },
        ]}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? (
        <RhAlert tone="success">
          {info}
          {pointageHref ? (
            <>
              {" "}
              <Link href={pointageHref} className="font-semibold underline">
                Ouvrir le pointage — فتح جدول الحضور
              </Link>
            </>
          ) : null}
        </RhAlert>
      ) : null}

      {tab === "corr" ? (
        <>
          <RhPanel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  أرشيف وتتبع أوامر المهمة — Archivage et suivi des ordres de mission
                </h3>
                <p className="mt-1 text-sm text-foreground/60">
                  سجل إلكتروني مركزي. يمكن الرجوع إلى النسخة المؤرشفة في أي وقت. · Registre
                  électronique central. Consultez la copie archivée à tout moment.
                </p>
              </div>
              <Button
                onClick={() => {
                  setMissionError(null);
                  setMissionForm(emptyMissionDraft());
                  setMissionOpen(true);
                }}
              >
                أمر بمهمة جديد — Nouvel ordre de mission
              </Button>
            </div>
          </RhPanel>

          <DataTable
            data={omRows}
            columns={omColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="Référence, matricule, nom…"
            searchText={(r) =>
              [r.number, r.id, r.matricule, r.last_name, r.first_name, r.created_by_name].filter(Boolean).join(" ")
            }
            emptyTitle={bi("Aucun ordre de mission archivé", "لا توجد أوامر مهمة في الأرشيف")}
          />

          <RhPanel>
            <h3 className="mb-3 text-sm font-semibold text-foreground/80">
              {bi("Autres correspondances", "مراسلات أخرى")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <RhField label="Employé">
                <select
                  className={rhInput}
                  value={corrForm.employee_id}
                  onChange={(e) =>
                    setCorrForm({ ...corrForm, employee_id: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.matricule} · {e.last_name} {e.first_name}
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label="Chantier">
                <select
                  className={rhInput}
                  value={corrForm.site_id}
                  onChange={(e) =>
                    setCorrForm({ ...corrForm, site_id: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_fr}
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label="Type">
                <CatalogSelect
                  items={otherTypes}
                  kind="correspondence_type"
                  value={corrForm.type_code}
                  onChange={(v) => setCorrForm({ ...corrForm, type_code: v })}
                  allowEmpty={false}
                />
              </RhField>
              <RhField label="Statut">
                <CatalogSelect
                  items={catalogs}
                  kind="correspondence_status"
                  value={corrForm.status_code}
                  onChange={(v) => setCorrForm({ ...corrForm, status_code: v })}
                  allowEmpty={false}
                />
              </RhField>
              <RhField label="Du">
                <input
                  type="date"
                  className={rhInput}
                  value={corrForm.start_date}
                  onChange={(e) =>
                    setCorrForm({ ...corrForm, start_date: e.target.value })
                  }
                />
              </RhField>
              <RhField label="Au">
                <input
                  type="date"
                  className={rhInput}
                  value={corrForm.end_date}
                  onChange={(e) =>
                    setCorrForm({ ...corrForm, end_date: e.target.value })
                  }
                />
              </RhField>
              {legendHint ? (
                <p className="sm:col-span-3 text-xs text-foreground/60">
                  هذا النوع يكتب رمز الحضور: {legendHint}
                </p>
              ) : null}
              <div className="sm:col-span-3">
                <Button
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    start(async () => {
                      const r = await upsertHrCorrespondence({
                        ...corrForm,
                        site_id: corrForm.site_id || null,
                      });
                      if (!r.ok) {
                        setError(r.error);
                        return;
                      }
                      const emp = employees.find((e) => e.id === corrForm.employee_id);
                      setCorrRows((prev) => [
                        {
                          id: r.data.id,
                          employee_id: corrForm.employee_id,
                          site_id: corrForm.site_id || null,
                          type_code: corrForm.type_code,
                          number: r.data.number,
                          status_code: corrForm.status_code,
                          start_date: corrForm.start_date || null,
                          end_date: corrForm.end_date || null,
                          payload: {},
                          created_at: new Date().toISOString(),
                          created_by: null,
                          created_by_name: "—",
                          last_name: emp?.last_name ?? "",
                          first_name: emp?.first_name ?? "",
                          matricule: emp?.matricule ?? "",
                          employee_name: emp
                            ? `${emp.last_name} ${emp.first_name}`
                            : "",
                          archive_url: null,
                        },
                        ...prev,
                      ]);
                      setPointageHref(null);
                      setInfo(`Document ${r.data.number} enregistré.`);
                    });
                  }}
                >
                  Émettre la correspondance
                </Button>
              </div>
            </div>
          </RhPanel>
          <DataTable
            data={otherCorrRows}
            columns={otherCorrColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="N°, type, employé…"
            emptyTitle="لا توجد سجلات"
          />
          {missionOpen ? (
            <MissionOrderDialog
              pending={pending}
              error={missionError}
              employees={employees}
              sites={sites}
              catalogs={catalogs}
              contracts={contracts}
              orders={omRows}
              value={missionForm}
              onChange={setMissionForm}
              onClose={closeMission}
              onSubmit={saveMission}
              onPrint={() => printMission(missionForm)}
              onReset={() => {
                setMissionError(null);
                setMissionForm(emptyMissionDraft());
              }}
              onOpenOrder={openMissionRow}
            />
          ) : null}
        </>
      ) : tab === "conges" ? (
        <>
          <RhPanel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  سندات الإجازات — Titres de congé
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-foreground/60">
                  Chaque congé approuvé reçoit un titre numéroté (NF/CNG). Complétez le transport, la pièce
                  d&apos;identité et la validation, puis imprimez. · كل إجازة معتمدة تحصل على سند مرقّم. أكمل
                  البيانات ثم اطبع.
                </p>
              </div>
              <Button variant="secondary" onClick={() => router.push("/rh/conges")}>
                {bi("Demandes de congé", "طلبات الإجازات")}
              </Button>
            </div>
          </RhPanel>

          <DataTable
            data={leaveRows}
            columns={leaveColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="Référence, matricule, nom…"
            searchText={(r) =>
              [r.number, leaveTitleReference(r.number), r.matricule, r.last_name, r.first_name]
                .filter(Boolean)
                .join(" ")
            }
            emptyTitle={bi("Aucun titre de congé — approuvez une demande de congé", "لا توجد سندات إجازات")}
          />
          {titleForm ? (
            <LeaveTitleDialog
              pending={pending}
              error={titleError}
              sites={sites}
              catalogs={catalogs}
              value={titleForm}
              onChange={setTitleForm}
              onClose={() => {
                setTitleForm(null);
                setTitleError(null);
              }}
              onSubmit={saveTitle}
              onPrint={() => printTitle(titleForm)}
            />
          ) : null}
        </>
      ) : (
        <>
          <RhPanel>
            <div className="grid gap-3 sm:grid-cols-3">
              <RhField label="Employé">
                <select
                  className={rhInput}
                  value={fileForm.employee_id}
                  onChange={(e) =>
                    setFileForm({ ...fileForm, employee_id: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.matricule} · {e.last_name} {e.first_name}
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label="Type de pièce">
                <CatalogSelect
                  items={catalogs}
                  kind="document_type"
                  value={fileForm.doc_type_code}
                  onChange={(v) => setFileForm({ ...fileForm, doc_type_code: v })}
                  allowEmpty={false}
                />
              </RhField>
              <RhField label="Lien fichier">
                <input
                  className={rhInput}
                  value={fileForm.file_url}
                  onChange={(e) =>
                    setFileForm({ ...fileForm, file_url: e.target.value })
                  }
                />
              </RhField>
              <RhField label="Émis le">
                <input
                  type="date"
                  className={rhInput}
                  value={fileForm.issued_on}
                  onChange={(e) =>
                    setFileForm({ ...fileForm, issued_on: e.target.value })
                  }
                />
              </RhField>
              <RhField label="Expire le">
                <input
                  type="date"
                  className={rhInput}
                  value={fileForm.expires_on}
                  onChange={(e) =>
                    setFileForm({ ...fileForm, expires_on: e.target.value })
                  }
                />
              </RhField>
              <RhField label="Notes">
                <input
                  className={rhInput}
                  value={fileForm.notes}
                  onChange={(e) =>
                    setFileForm({ ...fileForm, notes: e.target.value })
                  }
                />
              </RhField>
              <div>
                <Button
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    start(async () => {
                      const r = await upsertHrFile(fileForm);
                      if (!r.ok) {
                        setError(r.error);
                        return;
                      }
                      const emp = employees.find((e) => e.id === fileForm.employee_id);
                      setFileRows((prev) => [
                        {
                          id: r.data.id,
                          employee_id: fileForm.employee_id,
                          doc_type_code: fileForm.doc_type_code,
                          file_url: fileForm.file_url || null,
                          file_name: null,
                          storage_path: null,
                          issued_on: fileForm.issued_on || null,
                          expires_on: fileForm.expires_on || null,
                          notes: fileForm.notes || null,
                          matricule: emp?.matricule ?? "",
                          employee_name: emp
                            ? `${emp.last_name} ${emp.first_name}`
                            : "",
                        },
                        ...prev,
                      ]);
                      setPointageHref(null);
                      setInfo("Pièce enregistrée.");
                    });
                  }}
                >
                  Enregistrer le document
                </Button>
              </div>
            </div>
          </RhPanel>
          <DataTable
            data={fileRows}
            columns={fileColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="Employé, type…"
            emptyTitle="لا توجد سجلات"
          />
        </>
      )}
    </div>
  );
}

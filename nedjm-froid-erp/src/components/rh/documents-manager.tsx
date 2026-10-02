"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CalendarDays,
  Eye,
  ExternalLink,
  FileStack,
  Mail,
  Pencil,
  Plane,
  Plus,
  Printer,
  type LucideIcon,
} from "lucide-react";
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
import { buildMissionOrderHtml, missionReference } from "@/components/rh/mission-order-print";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CatalogSelect,
  RhAlert,
  RhChip,
  RhField,
  RhPanel,
  RhTabs,
  catalogOptions,
  rhInput,
} from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };

const corrCol = dataColumns<HrCorrespondenceRow>();
const fileCol = dataColumns<HrFileRow>();

function ReferenceCell({ reference, sub }: { reference: string; sub?: string }) {
  return (
    <div className="whitespace-nowrap">
      <div className="font-mono text-[13px] font-semibold tracking-tight text-brand">{reference || "—"}</div>
      {sub ? <div className="mt-0.5 text-xs text-foreground/45">{sub}</div> : null}
    </div>
  );
}

function PersonCell({ name, matricule }: { name: string; matricule?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">{name || "—"}</div>
      {matricule ? <div className="font-mono text-xs text-foreground/45">{matricule}</div> : null}
    </div>
  );
}

function RowAction({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 rounded-lg text-foreground/55 hover:text-brand"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="size-4" strokeWidth={1.9} />
    </Button>
  );
}

function RegisterSection({
  icon: Icon,
  color,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <RhPanel padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: `${color}17`, color }}
          >
            <Icon className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="text-sm text-foreground/55">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </RhPanel>
  );
}

function periodLabel(start: string | null | undefined, end: string | null | undefined) {
  const from = formatOmDate(start);
  const to = formatOmDate(end);
  if (from && to) return from === to ? from : `${from} → ${to}`;
  return from || to || "—";
}

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

export type DocumentsTab = "corr" | "conges" | "autres" | "files";

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
  const [corrOpen, setCorrOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
      setMissionError("Employé requis.");
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
        }${r.data.archive_error ? ` Archive non créée : ${r.data.archive_error}` : ""} Jours MS proposés dans le pointage, à valider.`,
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
      setInfo(`Titre de congé ${leaveTitleReference(draft.numero)} enregistré.`);
      setTitleForm(null);
    });
  }

  const omRows = corrRows.filter((row) => row.type_code === "OM");
  const leaveRows = corrRows.filter((row) => row.type_code === "LEAVE");
  const otherCorrRows = corrRows.filter((row) => row.type_code !== "OM" && row.type_code !== "LEAVE");


  const typeLabel = (kind: string, code: string | null | undefined) =>
    catalogs.find((item) => item.kind === kind && item.code === code)?.label_fr || code || "—";
  const today = new Date().toISOString().slice(0, 10);

  const employeeColumn = corrCol.accessor((r) => `${r.last_name} ${r.first_name}`.trim() || r.employee_name, {
    id: "employee",
    header: "Employé",
    cell: (info) => <PersonCell name={info.getValue()} matricule={info.row.original.matricule} />,
  });

  const omColumns = [
    corrCol.accessor((r) => missionReference(r.number), {
      id: "reference",
      header: "Référence",
      cell: ({ row: { original: r } }) => (
        <ReferenceCell reference={missionReference(r.number)} sub={`Établi le ${formatEstablishmentDate(r.created_at)}`} />
      ),
    }),
    employeeColumn,
    corrCol.accessor((r) => textPayload(r.payload, "dest1") || textPayload(r.payload, "destination"), {
      id: "mission",
      header: "Mission",
      cell: (info) => (
        <div className="min-w-0">
          <div className="truncate text-foreground/85">{info.getValue() || "—"}</div>
          <div className="whitespace-nowrap text-xs tabular-nums text-foreground/45">
            {periodLabel(info.row.original.start_date, info.row.original.end_date)}
          </div>
        </div>
      ),
    }),
    corrCol.accessor((r) => r.created_by_name || "—", {
      id: "created_by",
      header: "Établi par",
      cell: (info) => <span className="text-foreground/65">{info.getValue()}</span>,
    }),
    corrCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end gap-0.5">
          <RowAction label="Consulter" icon={Eye} onClick={() => consultMission(r)} />
          <RowAction label="Modifier" icon={Pencil} onClick={() => openMissionRow(r)} />
          {r.start_date ? (
            <RowAction
              label="Voir le pointage"
              icon={CalendarDays}
              onClick={() =>
                router.push(
                  missionPointageHref({ employeeId: r.employee_id, siteId: r.site_id, dateDepart: r.start_date }),
                )
              }
            />
          ) : null}
        </div>
      ),
    }),
  ];

  const leaveColumns = [
    corrCol.accessor((r) => leaveTitleReference(r.number), {
      id: "reference",
      header: "Référence",
      cell: ({ row: { original: r } }) => (
        <ReferenceCell reference={leaveTitleReference(r.number)} sub={`Émis le ${formatEstablishmentDate(r.created_at)}`} />
      ),
    }),
    employeeColumn,
    corrCol.accessor((r) => leaveNature(leaveOfCorrespondence(r).kind).fr, {
      id: "nature",
      header: "Nature",
      cell: (info) => <RhChip tone="brand">{info.getValue()}</RhChip>,
    }),
    corrCol.accessor((r) => r.start_date ?? "", {
      id: "period",
      header: "Période",
      cell: ({ row: { original: r } }) => {
        const leave = leaveOfCorrespondence(r);
        return (
          <div className="whitespace-nowrap">
            <div className="tabular-nums text-foreground/85">{periodLabel(leave.dateDebut, leave.dateFin)}</div>
            <div className="text-xs text-foreground/45">{leaveDaysLabel(leave.jours)}</div>
          </div>
        );
      },
    }),
    corrCol.accessor((r) => (r.status_code === "CANCELLED" ? 2 : r.payload.titre ? 0 : 1), {
      id: "state",
      header: "État",
      cell: ({ row: { original: r } }) =>
        r.status_code === "CANCELLED" ? (
          <RhChip tone="danger">Annulé</RhChip>
        ) : r.payload.titre ? (
          <RhChip tone="success">Complété</RhChip>
        ) : (
          <RhChip tone="warning">À compléter</RhChip>
        ),
    }),
    corrCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row: { original: r } }) =>
        r.status_code === "CANCELLED" ? null : (
          <div className="flex justify-end gap-0.5">
            <RowAction label="Ouvrir le titre" icon={Pencil} onClick={() => openTitle(r)} />
            <RowAction label="Imprimer" icon={Printer} onClick={() => printTitle(titleDraftFromRow(r))} />
          </div>
        ),
    }),
  ];

  const otherColumns = [
    corrCol.accessor((r) => r.number ?? "", {
      id: "reference",
      header: "Référence",
      cell: ({ row: { original: r } }) => (
        <ReferenceCell reference={r.number ?? ""} sub={`Émis le ${formatEstablishmentDate(r.created_at)}`} />
      ),
    }),
    corrCol.accessor((r) => typeLabel("correspondence_type", r.type_code), {
      id: "type",
      header: "Type",
      cell: (info) => <RhChip>{info.getValue()}</RhChip>,
    }),
    employeeColumn,
    corrCol.accessor((r) => r.start_date ?? "", {
      id: "period",
      header: "Période",
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap tabular-nums text-foreground/85">{periodLabel(r.start_date, r.end_date)}</span>
      ),
    }),
    corrCol.accessor((r) => typeLabel("correspondence_status", r.status_code), {
      id: "status",
      header: "Statut",
      cell: (info) => {
        const code = info.row.original.status_code;
        const tone = code === "CANCELLED" ? "danger" : code === "DRAFT" ? "neutral" : "success";
        return <RhChip tone={tone}>{info.getValue()}</RhChip>;
      },
    }),
  ];

  const fileColumns = [
    fileCol.accessor((r) => r.employee_name, {
      id: "employee",
      header: "Employé",
      cell: (info) => <PersonCell name={info.getValue()} matricule={info.row.original.matricule} />,
    }),
    fileCol.accessor((r) => typeLabel("document_type", r.doc_type_code), {
      id: "type",
      header: "Pièce",
      cell: (info) => <span className="font-medium text-foreground/85">{info.getValue()}</span>,
    }),
    fileCol.accessor((r) => r.issued_on ?? "", {
      id: "issued_on",
      header: "Émise le",
      cell: (info) => <span className="tabular-nums text-foreground/75">{formatOmDate(info.getValue()) || "—"}</span>,
    }),
    fileCol.accessor((r) => r.expires_on ?? "", {
      id: "expires_on",
      header: "Expire le",
      cell: (info) => {
        const value = info.getValue();
        if (!value) return <span className="text-foreground/40">—</span>;
        return value < today ? (
          <RhChip tone="danger">Expirée · {formatOmDate(value)}</RhChip>
        ) : (
          <span className="tabular-nums text-foreground/75">{formatOmDate(value)}</span>
        );
      },
    }),
    fileCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row: { original: r } }) =>
        r.file_url ? (
          <div className="flex justify-end">
            <RowAction
              label="Ouvrir le fichier"
              icon={ExternalLink}
              onClick={() => window.open(r.file_url ?? "", "_blank", "noopener,noreferrer")}
            />
          </div>
        ) : null,
    }),
  ];

  function newMission() {
    setMissionError(null);
    setMissionForm(emptyMissionDraft());
    setMissionOpen(true);
  }

  function saveCorrespondence() {
    setFormError(null);
    start(async () => {
      const r = await upsertHrCorrespondence({ ...corrForm, site_id: corrForm.site_id || null });
      if (!r.ok) {
        setFormError(r.error);
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
          employee_name: emp ? `${emp.last_name} ${emp.first_name}` : "",
          archive_url: null,
        },
        ...prev,
      ]);
      setPointageHref(null);
      setError(null);
      setInfo(`Correspondance ${r.data.number} enregistrée.`);
      setCorrOpen(false);
      setCorrForm((f) => ({ ...f, employee_id: "", start_date: "", end_date: "" }));
    });
  }

  function saveFile() {
    setFormError(null);
    start(async () => {
      const r = await upsertHrFile(fileForm);
      if (!r.ok) {
        setFormError(r.error);
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
          employee_name: emp ? `${emp.last_name} ${emp.first_name}` : "",
        },
        ...prev,
      ]);
      setPointageHref(null);
      setError(null);
      setInfo("Pièce enregistrée.");
      setFileOpen(false);
      setFileForm((f) => ({ ...f, employee_id: "", file_url: "", issued_on: "", expires_on: "", notes: "" }));
    });
  }

  const employeeSelect = (value: string, onChange: (id: string) => void) => (
    <select className={rhInput} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choisir un employé…</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.matricule} · {e.last_name} {e.first_name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Registre des documents</h2>
        <p className="mt-0.5 text-sm text-foreground/55">
          Chaque document reçoit une référence unique, jamais réutilisée.
        </p>
      </div>
      <RhTabs
        uiKey="hr_documents"
        items={[
          { id: "corr", label: "Ordres de mission", count: omRows.length },
          { id: "conges", label: "Titres de congé", count: leaveRows.length },
          { id: "autres", label: "Correspondances", count: otherCorrRows.length },
          { id: "files", label: "Pièces officielles", count: fileRows.length },
        ]}
        value={tab}
        onChange={(id) => setTab(id as DocumentsTab)}
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? (
        <RhAlert tone="success">
          {info}
          {pointageHref ? (
            <>
              {" "}
              <Link href={pointageHref} className="font-semibold underline">
                Ouvrir le pointage
              </Link>
            </>
          ) : null}
        </RhAlert>
      ) : null}

      {tab === "corr" ? (
        <RegisterSection
          icon={Plane}
          color="#0ea5e9"
          title="Ordres de mission"
          description="Archivés à l'enregistrement et consultables à tout moment."
          action={
            <Button onClick={newMission}>
              <Plus aria-hidden />
              Nouvel ordre de mission
            </Button>
          }
        >
          <DataTable
            data={omRows}
            columns={omColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="Référence, matricule, nom…"
            searchText={(r) =>
              [r.number, missionReference(r.number), r.matricule, r.last_name, r.first_name, r.created_by_name]
                .filter(Boolean)
                .join(" ")
            }
            emptyTitle="Aucun ordre de mission"
            emptyBody="Créez le premier avec « Nouvel ordre de mission »."
          />
        </RegisterSection>
      ) : tab === "conges" ? (
        <RegisterSection
          icon={CalendarCheck}
          color="#22a06b"
          title="Titres de congé"
          description="Un titre numéroté par congé approuvé : complétez-le, puis imprimez."
          action={
            <Button variant="secondary" onClick={() => router.push("/rh/conges")}>
              <CalendarCheck aria-hidden />
              Demandes de congé
            </Button>
          }
        >
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
            emptyTitle="Aucun titre de congé"
            emptyBody="Les titres apparaissent ici dès qu'une demande de congé est approuvée."
          />
        </RegisterSection>
      ) : tab === "autres" ? (
        <RegisterSection
          icon={Mail}
          color="#ec4899"
          title="Correspondances"
          description="Autres courriers RH numérotés, avec leur période et leur statut."
          action={
            <Button
              onClick={() => {
                setFormError(null);
                setCorrOpen(true);
              }}
            >
              <Plus aria-hidden />
              Nouvelle correspondance
            </Button>
          }
        >
          <DataTable
            data={otherCorrRows}
            columns={otherColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="Référence, type, employé…"
            searchText={(r) =>
              [r.number, typeLabel("correspondence_type", r.type_code), r.matricule, r.employee_name]
                .filter(Boolean)
                .join(" ")
            }
            emptyTitle="Aucune correspondance"
          />
        </RegisterSection>
      ) : (
        <RegisterSection
          icon={FileStack}
          color="#64748b"
          title="Pièces officielles"
          description="Pièces d'identité, diplômes et documents remis par les employés."
          action={
            <Button
              onClick={() => {
                setFormError(null);
                setFileOpen(true);
              }}
            >
              <Plus aria-hidden />
              Ajouter une pièce
            </Button>
          }
        >
          <DataTable
            data={fileRows}
            columns={fileColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="Employé, pièce…"
            searchText={(r) =>
              [r.matricule, r.employee_name, typeLabel("document_type", r.doc_type_code), r.notes]
                .filter(Boolean)
                .join(" ")
            }
            emptyTitle="Aucune pièce enregistrée"
          />
        </RegisterSection>
      )}

      <Dialog open={corrOpen} onOpenChange={setCorrOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nouvelle correspondance</DialogTitle>
            <DialogDescription>Une référence unique lui est attribuée à l&apos;enregistrement.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <RhField label="Employé" required>
                {employeeSelect(corrForm.employee_id, (id) => setCorrForm({ ...corrForm, employee_id: id }))}
              </RhField>
            </div>
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
            <div className="sm:col-span-2">
              <RhField label="Chantier">
                <select
                  className={rhInput}
                  value={corrForm.site_id}
                  onChange={(e) => setCorrForm({ ...corrForm, site_id: e.target.value })}
                >
                  <option value="">—</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_fr}
                    </option>
                  ))}
                </select>
              </RhField>
            </div>
            <RhField label="Du">
              <input
                type="date"
                className={rhInput}
                value={corrForm.start_date}
                onChange={(e) => setCorrForm({ ...corrForm, start_date: e.target.value })}
              />
            </RhField>
            <RhField label="Au">
              <input
                type="date"
                className={rhInput}
                value={corrForm.end_date}
                onChange={(e) => setCorrForm({ ...corrForm, end_date: e.target.value })}
              />
            </RhField>
          </div>
          {legendHint ? (
            <RhAlert tone="info">Ce type inscrit le code de présence « {legendHint} » dans le pointage.</RhAlert>
          ) : null}
          {formError ? <RhAlert tone="danger">{formError}</RhAlert> : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCorrOpen(false)}>
              Annuler
            </Button>
            <Button disabled={pending || !corrForm.employee_id} onClick={saveCorrespondence}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fileOpen} onOpenChange={setFileOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajouter une pièce officielle</DialogTitle>
            <DialogDescription>Rattachez la pièce à l&apos;employé, avec ses dates de validité.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <RhField label="Employé" required>
                {employeeSelect(fileForm.employee_id, (id) => setFileForm({ ...fileForm, employee_id: id }))}
              </RhField>
            </div>
            <RhField label="Type de pièce">
              <CatalogSelect
                items={catalogs}
                kind="document_type"
                value={fileForm.doc_type_code}
                onChange={(v) => setFileForm({ ...fileForm, doc_type_code: v })}
                allowEmpty={false}
              />
            </RhField>
            <RhField label="Lien du fichier">
              <input
                className={rhInput}
                placeholder="https://…"
                value={fileForm.file_url}
                onChange={(e) => setFileForm({ ...fileForm, file_url: e.target.value })}
              />
            </RhField>
            <RhField label="Émise le">
              <input
                type="date"
                className={rhInput}
                value={fileForm.issued_on}
                onChange={(e) => setFileForm({ ...fileForm, issued_on: e.target.value })}
              />
            </RhField>
            <RhField label="Expire le">
              <input
                type="date"
                className={rhInput}
                value={fileForm.expires_on}
                onChange={(e) => setFileForm({ ...fileForm, expires_on: e.target.value })}
              />
            </RhField>
            <div className="sm:col-span-2">
              <RhField label="Notes">
                <input
                  className={rhInput}
                  value={fileForm.notes}
                  onChange={(e) => setFileForm({ ...fileForm, notes: e.target.value })}
                />
              </RhField>
            </div>
          </div>
          {formError ? <RhAlert tone="danger">{formError}</RhAlert> : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setFileOpen(false)}>
              Annuler
            </Button>
            <Button disabled={pending || !fileForm.employee_id} onClick={saveFile}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

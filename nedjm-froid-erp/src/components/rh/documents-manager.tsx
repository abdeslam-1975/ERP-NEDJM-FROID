"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Eye,
  ExternalLink,
  FilePenLine,
  Pencil,
  Plane,
  Plus,
  Printer,
  Loader2,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  saveLeaveTitle,
  upsertHrCorrespondence,
  type HrCorrespondenceRow,
  type HrFileRow,
} from "@/lib/actions/hr-documents";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import {
  getHrEmployeeFiche,
  type HrEmployeeFiche,
  type HrEmployeeField,
  type HrEmployeeRow,
} from "@/lib/actions/hr-employees";
import { valuesFromFicheRecord } from "@/lib/hr/employee-field-utils";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import { buildOfficialFicheHtml } from "@/components/rh/employee-fiche-print";
import { EmployeeCardPreview } from "@/components/rh/employee-card-preview";
import { EmployeeFicheWindow, ficheWindowValues } from "@/components/rh/employee-fiche-window";
import { printHtml as printFrame } from "@/components/rh/print-frame";
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
import { DocumentTypeCards } from "@/components/rh/document-type-cards";
import { buildLeaveTitleHtml, leaveTitleReference } from "@/components/rh/leave-title-print";
import { buildMissionOrderHtml, missionReference } from "@/components/rh/mission-order-print";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhPanel, catalogOptions } from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };

const corrCol = dataColumns<HrCorrespondenceRow>();
const empCol = dataColumns<HrEmployeeRow>();

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

export type DocumentsTab = "fiches" | "contrats" | "missions" | "conges" | "bulletins";

/** Registers rendered by the page (server data), not by this component. */
function isPageRegister(tab: DocumentsTab) {
  return tab === "contrats" || tab === "bulletins";
}

function countLabel(count: number | null, singular: string, plural: string) {
  if (count === null) return "—";
  if (count === 0) return `Aucun ${singular}`;
  return `${count.toLocaleString("fr-FR")} ${count > 1 ? plural : singular}`;
}

export function DocumentsManager({
  files,
  correspondences,
  employees,
  sites,
  catalogs,
  contracts,
  contractCount,
  letterheadUrl = null,
  employeeFields,
  ficheCatalogs,
  ficheSettings,
  openMission = false,
  initialTab = "missions",
  register = null,
  openTitleId,
  loadError,
}: {
  files: HrFileRow[];
  correspondences: HrCorrespondenceRow[];
  employees: HrEmployeeRow[];
  sites: readonly SiteOpt[];
  catalogs: CatalogItem[];
  contracts: MissionContractHint[];
  contractCount: number | null;
  letterheadUrl?: string | null;
  employeeFields: HrEmployeeField[];
  /** Catalogues of the employee card (sites merged into the affectations). */
  ficheCatalogs: CatalogItem[];
  ficheSettings: HrFicheSettings;
  openMission?: boolean;
  initialTab?: DocumentsTab;
  /** Contracts or payslips register of `initialTab`, rendered by the page. */
  register?: ReactNode;
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
  const [corrRows, setCorrRows] = useState(correspondences);
  const [pending, start] = useTransition();
  const [cardPreview, setCardPreview] = useState<HrEmployeeFiche | null>(null);
  const [ficheWindow, setFicheWindow] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pointageHref, setPointageHref] = useState<string | null>(null);
  const [, startNavigation] = useTransition();

  function selectTab(next: DocumentsTab) {
    if (next === tab) return;
    setTab(next);
    if (isPageRegister(next) || isPageRegister(initialTab)) {
      startNavigation(() => router.push(`/rh/documents?onglet=${next}`, { scroll: false }));
    }
  }

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
    setTab("missions");
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
      saved: Object.keys(saved).length > 0,
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
      const { titre, archive_url, archive_path, archive_error } = r.data;
      setCorrRows((prev) =>
        prev.map((row) =>
          row.id !== draft.id
            ? row
            : archive_url
              ? { ...row, archive_url, payload: { ...row.payload, titre, archive_url, archive_path } }
              : { ...row, payload: { ...row.payload, titre } },
        ),
      );
      setPointageHref(null);
      setError(null);
      setInfo(
        `Titre de congé ${leaveTitleReference(draft.numero)} enregistré${archive_url ? " et archivé en PDF" : ""}.${
          archive_error ? ` Archive non créée : ${archive_error}` : ""
        }`,
      );
      setTitleForm(null);
    });
  }

  const omRows = corrRows.filter((row) => row.type_code === "OM");
  const leaveRows = corrRows.filter((row) => row.type_code === "LEAVE");
  const archiveOf = new Map(
    files.filter((row) => row.doc_type_code === "FICHE_RENSEIGNEMENTS").map((row) => [row.employee_id, row]),
  );

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
            {r.archive_url ? (
              <RowAction
                label="Ouvrir le PDF archivé"
                icon={ExternalLink}
                onClick={() => window.open(r.archive_url ?? "", "_blank", "noopener,noreferrer")}
              />
            ) : null}
            <RowAction label="Ouvrir le titre" icon={Pencil} onClick={() => openTitle(r)} />
            <RowAction label="Imprimer" icon={Printer} onClick={() => printTitle(titleDraftFromRow(r))} />
          </div>
        ),
    }),
  ];

  const ficheColumns = [
    empCol.accessor((r) => `${r.last_name} ${r.first_name}`.trim(), {
      id: "employee",
      header: "Employé",
      cell: (info) => <PersonCell name={info.getValue()} matricule={info.row.original.matricule} />,
    }),
    empCol.accessor((r) => (archiveOf.get(r.id)?.file_url ? 1 : 0), {
      id: "archive",
      header: "PDF archivé",
      cell: ({ row: { original: r } }) => {
        const archive = archiveOf.get(r.id);
        return archive?.file_url ? (
          <a
            href={archive.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Ouvrir le PDF
          </a>
        ) : (
          <span className="text-sm text-foreground/40">Pas encore archivée</span>
        );
      },
    }),
    empCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end gap-0.5">
          <RowAction label="Afficher la fiche" icon={Eye} onClick={() => showCard(r.id)} />
          <RowAction label="Imprimer la fiche" icon={Printer} onClick={() => printCard(r.id)} />
          <RowAction label="Modifier la fiche" icon={Pencil} onClick={() => openFicheWindow(r.id)} />
        </div>
      ),
    }),
  ];

  function loadCard(employeeId: string, then: (card: HrEmployeeFiche) => void) {
    start(async () => {
      const result = await getHrEmployeeFiche(employeeId);
      if (result.ok) then(result.data);
      else setError(result.error);
    });
  }

  function showCard(employeeId: string) {
    loadCard(employeeId, setCardPreview);
  }

  function printCard(employeeId: string) {
    loadCard(employeeId, (card) =>
      printFrame(
        buildOfficialFicheHtml(
          valuesFromFicheRecord(card, employeeFields),
          ficheCatalogs,
          employeeFields,
          ficheSettings,
          window.location.origin,
        ),
        "hr-fiche-print-frame",
      ),
    );
  }

  function openFicheWindow(employeeId: string | null) {
    setCardPreview(null);
    start(async () => {
      const result = await ficheWindowValues(employeeId, employeeFields);
      if (result.ok) setFicheWindow(result.values);
      else setError(result.error);
    });
  }

  function newMission() {
    setMissionError(null);
    setMissionForm(emptyMissionDraft());
    setMissionOpen(true);
  }

  return (
    <div className="space-y-5">
      <DocumentTypeCards
        cards={[
          {
            key: "fiches",
            title: "Fiche de renseignements",
            icon: ClipboardList,
            color: "#6366f1",
            summary: countLabel(employees.length, "fiche", "fiches"),
            selected: tab === "fiches",
            onSelect: () => selectTab("fiches"),
          },
          {
            key: "contrat",
            title: "Contrat de travail",
            icon: FilePenLine,
            color: "#14b8a6",
            summary: countLabel(contractCount, "contrat", "contrats"),
            selected: tab === "contrats",
            onSelect: () => selectTab("contrats"),
          },
          {
            key: "missions",
            title: "Ordre de mission",
            icon: Plane,
            color: "#0ea5e9",
            summary: countLabel(omRows.length, "ordre", "ordres"),
            selected: tab === "missions",
            onSelect: () => selectTab("missions"),
          },
          {
            key: "conges",
            title: "Titre de congé",
            icon: CalendarCheck,
            color: "#22a06b",
            summary: countLabel(leaveRows.length, "titre", "titres"),
            selected: tab === "conges",
            onSelect: () => selectTab("conges"),
          },
          {
            key: "bulletin",
            title: "Bulletin de paie",
            icon: Receipt,
            color: "#f59e0b",
            summary: "Par période de paie",
            selected: tab === "bulletins",
            onSelect: () => selectTab("bulletins"),
          },
        ]}
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

      {isPageRegister(tab) ? (
        tab === initialTab && register ? (
          register
        ) : (
          <div
            role="status"
            className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-surface px-4 py-16 text-sm text-foreground/55"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Chargement du registre…
          </div>
        )
      ) : tab === "missions" ? (
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
      ) : (
        <RegisterSection
          icon={ClipboardList}
          color="#6366f1"
          title="Fiches de renseignements"
          description="Une fiche par employé : affichez-la, imprimez-la ou complétez-la."
          action={
            <Button disabled={pending} onClick={() => openFicheWindow(null)}>
              <Users aria-hidden />
              Fiche employé
            </Button>
          }
        >
          <DataTable
            data={employees}
            columns={ficheColumns}
            getRowId={(r) => r.id}
            searchPlaceholder="Matricule, nom, NSS, NIN…"
            searchText={(r) =>
              [r.matricule, r.last_name, r.first_name, r.last_name_ar, r.first_name_ar, r.nss, r.nin]
                .filter(Boolean)
                .join(" ")
            }
            emptyTitle="Aucun employé"
            emptyBody="Créez la première fiche avec « Fiche employé »."
          />
        </RegisterSection>
      )}

      {cardPreview ? (
        <EmployeeCardPreview
          employee={cardPreview}
          fields={employeeFields}
          catalogs={ficheCatalogs}
          fiche={ficheSettings}
          onClose={() => setCardPreview(null)}
          onEdit={() => openFicheWindow(cardPreview.id)}
        />
      ) : null}
      {ficheWindow ? (
        <EmployeeFicheWindow
          employees={employees}
          initialValues={ficheWindow}
          fields={employeeFields}
          catalogs={ficheCatalogs}
          fiche={ficheSettings}
          onClose={() => setFicheWindow(null)}
          onSaved={(_, message) => {
            setPointageHref(null);
            setError(null);
            setInfo(message);
            router.refresh();
          }}
        />
      ) : null}

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
          titles={leaveRows}
          value={titleForm}
          onChange={setTitleForm}
          onClose={() => {
            setTitleForm(null);
            setTitleError(null);
          }}
          onSubmit={saveTitle}
          onPrint={() => printTitle(titleForm)}
          onNew={() => router.push("/rh/conges")}
          onOpenTitle={openTitle}
        />
      ) : null}
    </div>
  );
}

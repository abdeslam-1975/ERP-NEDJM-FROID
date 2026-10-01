"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  analyzeArchiveBatch,
  cancelArchiveBatch,
  commitArchiveBatch,
  confirmCodeMapping,
  getArchiveFileUrl,
  listArchiveLines,
  listUnknownCodes,
  prepareArchivePieceUpload,
  prepareArchiveUpload,
  registerArchiveBatch,
  registerArchivePiece,
  requestArchiveMapping,
  requestImportPolicy,
  resolveArchiveConflicts,
  revokeCodeMapping,
  validateArchiveBatch,
  type ActionResult,
  type ArchiveAccess,
  type ArchiveBatch,
  type ArchiveDetail,
  type ArchiveLineRow,
  type CodeMapping,
} from "@/lib/actions/hr-attendance-archive";
import {
  ARCHIVE_BUCKET,
  ARCHIVE_NOTICE,
  ARCHIVE_PIECE_MAX_BYTES,
  ARCHIVE_PIECE_MIME,
  ARCHIVE_SOURCE_MAX_BYTES,
  CSV_MIME,
  HOURS_NOTICE,
  PROVENANCE_KINDS,
  XLSX_MIME,
  anomalyLabel,
  archiveFormatLabel,
  archiveMetaSchema,
  batchActions,
  batchStatusLabel,
  batchStatusTone,
  batchWarningText,
  conflictLabel,
  emptyArchiveMeta,
  existingValueText,
  lineStatusLabel,
  lineStatusTone,
  natureLabel,
  periodNature,
  provenanceLabel,
  selfValidationBlocker,
  sourceExtOf,
  type ArchiveMeta,
  type ArchivePieceMime,
} from "@/lib/hr/attendance-archive";
import { QuickDialog } from "@/components/rules/rule-ui";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhField,
  RhPageHeader,
  RhPanel,
  RhStat,
  RhTabs,
  RhTableWrap,
  RhToolbar,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

type SiteOption = { id: string; code: string; name: string };
type LegendOption = { code: string; label: string };
type View = "lots" | "validation" | "codes" | "politique";

type Dialog =
  | { kind: "deposit" }
  | { kind: "commit" }
  | { kind: "close" }
  | { kind: "mapping" }
  | { kind: "piece" }
  | { kind: "policy" }
  | { kind: "revoke"; mapping: CodeMapping }
  | null;

const PATH = "/rh/presence/imports";

function storage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(ARCHIVE_BUCKET);
}

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

const frDay = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const periodText = (b: Pick<ArchiveBatch, "period_from" | "period_to">) =>
  b.period_from === b.period_to ? monthLabel(b.period_from) : `${monthLabel(b.period_from)} → ${monthLabel(b.period_to)}`;
const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

export function AttendanceImportsManager({
  access,
  batches,
  detail,
  detailError,
  mappings,
  sites,
  legends,
  view,
  focusDecision,
}: {
  access: ArchiveAccess;
  batches: ArchiveBatch[];
  detail: ArchiveDetail | null;
  detailError: string | null;
  mappings: CodeMapping[];
  sites: SiteOption[];
  legends: LegendOption[];
  view: View;
  focusDecision: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [info, setInfo] = useState<string | null>(null);

  function go(params: { lot?: string | null; vue?: View }) {
    const q = new URLSearchParams();
    const v = params.vue ?? view;
    if (v !== "lots") q.set("vue", v);
    if (params.lot) q.set("lot", params.lot);
    router.push(q.size ? `${PATH}?${q}` : PATH);
  }

  function done(text: string, lot?: string) {
    setDialog(null);
    setInfo(text);
    if (lot && lot !== detail?.batch.id) go({ lot });
    else router.refresh();
  }

  const shown = view === "validation" ? batches.filter((b) => b.status === "IMPORTED") : batches;
  const pendingMappings = mappings.filter((m) => m.status === "PENDING_CONFIRMATION").length;
  const canRequestPolicy = access.isSuperAdmin || access.cancel || access.validate;

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Imports d'archives de présence"
        description="Reprise des présences tenues hors de l'application (registres, logiciels, fichiers transmis). Chaque fichier devient un lot contrôlé : rien n'est enregistré avant votre confirmation, rien n'est remplacé sans décision, et les présences importées restent proposées jusqu'à leur validation."
        actions={
          <>
            <a href="/api/rh/presence/imports/modele" className="text-sm font-semibold text-brand hover:underline">
              Modèle « une ligne par jour »
            </a>
            {access.create ? <Button onClick={() => setDialog({ kind: "deposit" })}>Déposer un fichier</Button> : null}
          </>
        }
      />
      <RhAlert tone="info">{ARCHIVE_NOTICE}</RhAlert>
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}
      {detailError ? <RhAlert tone="danger">{detailError}</RhAlert> : null}

      <RhTabs
        uiKey="att_imports"
        value={view}
        onChange={(id) => go({ vue: id as View, lot: detail?.batch.id ?? null })}
        items={[
          { id: "lots", label: `Lots (${batches.length})` },
          { id: "validation", label: `À valider (${batches.filter((b) => b.status === "IMPORTED").length})` },
          { id: "codes", label: `Correspondances de codes${pendingMappings ? ` (${pendingMappings} à confirmer)` : ""}` },
          { id: "politique", label: "Politique de validation" },
        ]}
      />

      {view === "codes" ? (
        <MappingsPanel mappings={mappings} access={access} onRevoke={(m) => setDialog({ kind: "revoke", mapping: m })} onDone={done} />
      ) : view === "politique" ? (
        <PolicyPanel access={access} canRequest={canRequestPolicy} onRequest={() => setDialog({ kind: "policy" })} />
      ) : (
        <>
          <BatchList batches={shown} selected={detail?.batch.id ?? null} onOpen={(id) => go({ lot: id })} view={view} />
          {detail ? (
            <BatchDetail
              key={detail.batch.id}
              detail={detail}
              access={access}
              focusDecision={focusDecision}
              onDialog={setDialog}
              onDone={done}
            />
          ) : null}
        </>
      )}

      {dialog?.kind === "deposit" ? (
        <DepositDialog sites={sites} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "commit" && detail ? (
        <CommitDialog batch={detail.batch} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "close" && detail ? (
        <CloseDialog batch={detail.batch} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "mapping" && detail ? (
        <MappingDialog batch={detail.batch} legends={legends} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "piece" && detail ? (
        <PieceDialog batch={detail.batch} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "policy" ? <PolicyDialog onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "revoke" ? (
        <RevokeDialog mapping={dialog.mapping} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
function BatchList({
  batches,
  selected,
  onOpen,
  view,
}: {
  batches: ArchiveBatch[];
  selected: string | null;
  onOpen: (id: string) => void;
  view: View;
}) {
  if (!batches.length) {
    return (
      <RhAlert tone="info">
        {view === "validation" ? "Aucun lot importé en attente de validation." : "Aucun lot d'import pour le moment."}
      </RhAlert>
    );
  }
  return (
    <RhTableWrap>
      <table className="w-full min-w-[900px]">
        <thead className="border-b border-border/60">
          <tr>
            <th className={rhTh()}>Lot</th>
            <th className={rhTh()}>Période</th>
            <th className={rhTh()}>Chantier(s)</th>
            <th className={rhTh()}>Provenance</th>
            <th className={rhTh()}>Lignes</th>
            <th className={rhTh()}>Statut</th>
            <th className={rhTh()}>Déposé</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr
              key={b.id}
              onClick={() => onOpen(b.id)}
              className={`cursor-pointer border-b border-border/40 hover:bg-brand-muted/40 ${b.id === selected ? "bg-brand-muted/60" : ""}`}
            >
              <td className={rhTd()}>
                <span className="font-semibold">{b.batch_no}</span>
                <div className="text-xs text-foreground/55">{b.format === "GRID" ? "Grille" : "Lignes"}</div>
              </td>
              <td className={rhTd()}>
                {periodText(b)}
                <div className="text-xs text-foreground/55">{b.nature === "OPERATIONAL" ? "Opérationnel" : b.nature === "REPRISE" ? "Reprise" : "Reprise et opérationnel"}</div>
              </td>
              <td className={rhTd()}>{b.site_names.join(", ")}</td>
              <td className={rhTd()}>
                <span className="text-xs">{provenanceLabel(b.provenance_kind)}</span>
              </td>
              <td className={`${rhTd()} tabular-nums text-xs`}>
                {b.lines_read} lues · {b.analysis.counts.ok} acceptées · {b.lines_rejected} rejetées
                {b.analysis.counts.conflict ? ` · ${b.analysis.counts.conflict} en conflit` : ""}
              </td>
              <td className={rhTd()}>
                <RhChip tone={batchStatusTone(b.status)}>{batchStatusLabel(b.status)}</RhChip>
              </td>
              <td className={`${rhTd()} text-xs`}>
                {b.created_by_name ?? "?"}
                <div className="text-foreground/55">{dateTime(b.created_at)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RhTableWrap>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-foreground/55">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function BatchDetail({
  detail,
  access,
  focusDecision,
  onDialog,
  onDone,
}: {
  detail: ArchiveDetail;
  access: ArchiveAccess;
  focusDecision: string | null;
  onDialog: (d: Dialog) => void;
  onDone: (text: string, lot?: string) => void;
}) {
  const b = detail.batch;
  const a = b.analysis;
  const can = batchActions(b.status, b.sealed);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const openD5 = detail.decisions.find((d) => d.type_code === "D5" && (d.status === "PENDING" || d.status === "DECIDED"));
  const lineByLine = detail.decisions.find(
    (d) => d.type_code === "D5" && d.status === "DECIDED" && d.chosen_option === "LINE_BY_LINE",
  );
  const openD11 = detail.decisions.find((d) => d.type_code === "D11" && d.status === "PENDING");
  const validationBlocker = selfValidationBlocker({
    createdBy: b.created_by,
    userId: access.userId,
    isSuperAdmin: access.isSuperAdmin,
    importerMayValidate: access.importerMayValidate,
  });
  const unknownCodes = a.errors_by_code.UNKNOWN_CODE ?? 0;

  function run<T>(fn: () => Promise<ActionResult<T>>, text: (d: T) => string) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      onDone(text(r.data));
    });
  }

  async function openFile(documentId: string | null) {
    setError(null);
    const r = await getArchiveFileUrl({ batchId: b.id, documentId });
    if (!r.ok) return setError(r.error);
    window.open(r.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <RhPanel>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <RhChip tone={batchStatusTone(b.status)}>{batchStatusLabel(b.status)}</RhChip>
              <RhChip tone="brand">{archiveFormatLabel(b.format)}</RhChip>
              {b.nature !== "OPERATIONAL" ? <RhChip tone="warning">Reprise</RhChip> : null}
            </div>
            <h3 className="mt-1.5 font-display text-lg font-semibold">
              Lot {b.batch_no} · {periodText(b)}
            </h3>
            <p className="text-sm text-foreground/65">{b.site_names.join(", ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/rh/presence/imports/rapport?lot=${b.id}`} className="inline-flex h-10 items-center rounded-xl border border-border/80 px-4 text-sm font-semibold hover:bg-brand-muted/70">
              Rapport complet (Excel)
            </a>
            <Button variant="secondary" onClick={() => openFile(null)}>
              Fichier source
            </Button>
          </div>
        </div>

        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}

        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Année de référence">{b.reference_year}</Fact>
          <Fact label="Nature">{natureLabel(b.nature)}</Fact>
          <Fact label="Provenance">
            {provenanceLabel(b.provenance_kind)} — {b.provenance_detail}
          </Fact>
          <Fact label="Date du document source">{frDay(b.source_produced_on)}</Fact>
          <Fact label="Fichier">
            {b.file_name} · {sizeText(b.size_bytes)}
          </Fact>
          <Fact label="Empreinte SHA-256">
            <span className="font-mono text-xs" title={b.sha256}>
              {b.sha256.slice(0, 16)}…
            </span>
          </Fact>
          <Fact label="Déposé par">
            {b.created_by_name ?? "?"} · {dateTime(b.created_at)}
          </Fact>
          <Fact label="Totaux de contrôle déclarés">
            {b.control_lines ?? "—"} présence(s) · {b.control_employees ?? "—"} salarié(s)
          </Fact>
          {b.imported_at ? (
            <Fact label="Importé par">
              {b.imported_by_name ?? "?"} · {dateTime(b.imported_at)}
            </Fact>
          ) : null}
          {b.validated_at ? (
            <Fact label="Validé par">
              {b.validated_by_name ?? "?"} · {dateTime(b.validated_at)}
            </Fact>
          ) : null}
          {b.closed_at ? (
            <Fact label={b.status === "REJECTED" ? "Rejeté par" : "Annulé par"}>
              {b.closed_by_name ?? "?"} · {dateTime(b.closed_at)} — {b.close_reason}
            </Fact>
          ) : null}
          {Object.keys(b.code_map).length ? (
            <Fact label="Correspondances de codes (ce lot)">
              {Object.entries(b.code_map)
                .map(([k, v]) => `${k} → ${v}`)
                .join(", ")}
            </Fact>
          ) : null}
        </dl>
        {b.comment ? <p className="text-sm text-foreground/75">{b.comment}</p> : null}
        {!b.sealed ? (
          <RhAlert tone="warning">
            Toutes les lignes du fichier n&apos;ont pas été transmises ({b.lines_read} sur {b.lines_expected}). Le lot ne
            peut pas être analysé : rejetez-le et déposez le fichier à nouveau.
          </RhAlert>
        ) : null}

        {b.analyzed_at ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <RhStat label="Lues" value={a.counts.read} />
              <RhStat label="Acceptées" value={a.counts.ok} />
              <RhStat label="Rejetées" value={a.counts.error} />
              <RhStat label="Identiques" value={a.counts.same} />
              <RhStat label="Doublons" value={a.counts.duplicate} />
              <RhStat label="En conflit" value={a.counts.conflict} />
              <RhStat label="Importables" value={a.counts.importable} />
            </div>
            <p className="text-xs text-foreground/60">
              {a.employees} salarié(s) · {a.day_lines} présence(s) journalière(s) · analyse du {dateTime(b.analyzed_at)}.
              {a.counts.hours_lines ? ` ${a.counts.hours_lines} ligne(s) d'heures supplémentaires acceptée(s). ${HOURS_NOTICE}` : ""}
            </p>
            {a.warnings.map((w, i) => (
              <RhAlert key={i} tone="warning">
                {batchWarningText(w)}
              </RhAlert>
            ))}
            {Object.keys(a.errors_by_code).length || Object.keys(a.warnings_by_code).length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <CodeCounts title="Motifs de rejet" counts={a.errors_by_code} tone="danger" />
                <CodeCounts title="Avertissements" counts={a.warnings_by_code} tone="warning" />
              </div>
            ) : null}
            {a.counts.conflict ? (
              <RhAlert tone={a.counts.unresolved ? "warning" : "info"}>
                {a.counts.conflict} ligne(s) en conflit avec des présences déjà enregistrées (
                {Object.entries(a.conflicts_by_kind)
                  .map(([k, n]) => `${conflictLabel(k)} : ${n}`)
                  .join(" ; ")}
                ).{" "}
                {a.counts.unresolved
                  ? "Rien n'a été remplacé : le lot attend la décision du SUPER_ADMIN."
                  : `Tranché : ${a.counts.take_import} import(s) retenu(s), ${a.counts.keep_existing} valeur(s) existante(s) conservée(s).`}
              </RhAlert>
            ) : null}
          </div>
        ) : null}

        {openD5 ? (
          <RhAlert tone="warning">
            Décision D5 « conflit d&apos;import » {openD5.status === "PENDING" ? "en attente" : "décidée, à terminer"} —{" "}
            <Link href={`/decisions/${openD5.id}`} className="font-semibold underline">
              ouvrir la décision
            </Link>
            .
          </RhAlert>
        ) : null}
        {openD11 ? (
          <RhAlert tone="info">
            Correspondance de codes demandée (D11), en attente de décision —{" "}
            <Link href={`/decisions/${openD11.id}`} className="font-semibold underline">
              ouvrir la décision
            </Link>
            .
          </RhAlert>
        ) : null}
        {lineByLine && b.status === "PENDING_DECISION" ? (
          access.isSuperAdmin ? (
            <ConflictResolver batch={b} decisionId={lineByLine.id} focused={focusDecision === lineByLine.id} onDone={onDone} />
          ) : (
            <RhAlert tone="info">Le SUPER_ADMIN tranche les conflits ligne par ligne depuis cet écran.</RhAlert>
          )
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {can.analyze && access.create ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => analyzeArchiveBatch(b.id), () => `Lot ${b.batch_no} analysé à nouveau avec les données actuelles.`)}
            >
              Analyser à nouveau
            </Button>
          ) : null}
          {can.mapping && access.create && unknownCodes > 0 ? (
            <Button variant="secondary" disabled={pending} onClick={() => onDialog({ kind: "mapping" })}>
              Codes inconnus : demander une correspondance
            </Button>
          ) : null}
          {can.pieces && access.create ? (
            <Button variant="secondary" disabled={pending} onClick={() => onDialog({ kind: "piece" })}>
              Joindre une pièce
            </Button>
          ) : null}
          {can.reject && access.cancel ? (
            <Button variant="danger" disabled={pending} onClick={() => onDialog({ kind: "close" })}>
              Rejeter le lot
            </Button>
          ) : null}
          {can.cancel && access.cancel ? (
            <Button variant="danger" disabled={pending} onClick={() => onDialog({ kind: "close" })}>
              Annuler l&apos;import
            </Button>
          ) : null}
          {can.commit && access.create ? (
            <Button disabled={pending || a.counts.importable === 0} onClick={() => onDialog({ kind: "commit" })}>
              Importer les présences acceptées
            </Button>
          ) : null}
          {can.validate && access.validate ? (
            <Button
              disabled={pending || Boolean(validationBlocker)}
              title={validationBlocker ?? undefined}
              onClick={() =>
                run(
                  () => validateArchiveBatch(b.id),
                  (d) =>
                    `${d.validated} présence(s) validée(s)${d.modified ? ` ; ${d.modified} modifiée(s) depuis l'import ne l'ont pas été` : ""}. ` +
                    `Aucune paie n'a été créée${d.generationRequests ? ` ; ${d.generationRequests} demande(s) de génération (D4) ouverte(s)` : ""}` +
                    `${d.flaggedRuns ? ` ; ${d.flaggedRuns} paie(s) brouillon signalée(s) à recalculer (D3)` : ""}.`,
                )
              }
            >
              Valider les présences importées
            </Button>
          ) : null}
        </div>
        {can.validate && access.validate && validationBlocker ? <RhAlert tone="info">{validationBlocker}</RhAlert> : null}

        <PiecesList documents={detail.documents} onOpen={(id) => openFile(id)} />
        <LinesTable batchId={b.id} counts={a.counts} />
      </div>
    </RhPanel>
  );
}

function CodeCounts({ title, counts, tone }: { title: string; counts: Record<string, number>; tone: "danger" | "warning" }) {
  const entries = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  if (!entries.length) return <div />;
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <p className="text-xs font-semibold text-foreground/70">{title}</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {entries.map(([code, n]) => (
          <li key={code} className="flex items-center justify-between gap-2">
            <span>{anomalyLabel(code)}</span>
            <RhChip tone={tone}>{n}</RhChip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PiecesList({ documents, onOpen }: { documents: ArchiveDetail["documents"]; onOpen: (id: string) => void }) {
  return (
    <div>
      <p className="text-sm font-semibold">Pièces justificatives ({documents.length})</p>
      <p className="text-xs text-foreground/60">
        Scans du registre papier ou documents de la source, conservés comme preuve. Ils ne sont jamais lus
        automatiquement.
      </p>
      {documents.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onOpen(d.id)}>
                {d.file_name}
              </button>
              <span className="text-xs text-foreground/60">
                {sizeText(d.size_bytes)} · {d.uploaded_by_name ?? "?"} · {dateTime(d.uploaded_at)}
                {d.description ? ` · ${d.description}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const LINE_FILTERS = ["ALL", "ERROR", "CONFLICT", "WARNING", "OK", "SAME", "DUPLICATE"] as const;

function LinesTable({ batchId, counts }: { batchId: string; counts: ArchiveBatch["analysis"]["counts"] }) {
  const [status, setStatus] = useState<(typeof LINE_FILTERS)[number]>("ALL");
  const [page, setPage] = useState(0);
  const [state, setState] = useState<{ key: string; rows: ArchiveLineRow[]; total: number; size: number; error: string | null }>({
    key: "",
    rows: [],
    total: 0,
    size: 200,
    error: null,
  });
  const key = `${batchId}|${status}|${page}`;

  useEffect(() => {
    let alive = true;
    listArchiveLines({ id: batchId, status, page }).then((r) => {
      if (!alive) return;
      setState(
        r.ok
          ? { key, rows: r.data.rows, total: r.data.total, size: r.data.pageSize, error: null }
          : { key, rows: [], total: 0, size: 200, error: r.error },
      );
    });
    return () => {
      alive = false;
    };
  }, [batchId, status, page, key]);

  const loading = state.key !== key;
  const pages = Math.max(1, Math.ceil(state.total / state.size));
  const countOf: Record<string, number> = {
    ALL: counts.read,
    ERROR: counts.error,
    CONFLICT: counts.conflict,
    WARNING: counts.warning,
    OK: counts.ok - counts.warning,
    SAME: counts.same,
    DUPLICATE: counts.duplicate,
  };

  return (
    <div className="space-y-2">
      <RhToolbar>
        <span className="text-sm font-semibold">Lignes du fichier</span>
        <select
          className={`${rhInput} mt-0 w-auto`}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as (typeof LINE_FILTERS)[number]);
            setPage(0);
          }}
        >
          {LINE_FILTERS.map((f) => (
            <option key={f} value={f}>
              {f === "ALL" ? "Toutes" : lineStatusLabel(f)} ({Math.max(0, countOf[f] ?? 0)})
            </option>
          ))}
        </select>
        <span className="text-xs text-foreground/60">
          {loading ? "Chargement…" : `${state.total} ligne(s) · page ${page + 1}/${pages}`}
        </span>
        <Button variant="ghost" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
          Précédente
        </Button>
        <Button variant="ghost" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>
          Suivante
        </Button>
      </RhToolbar>
      {state.error ? <RhAlert tone="danger">{state.error}</RhAlert> : null}
      <RhTableWrap>
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-border/60">
            <tr>
              <th className={rhTh()}>Ligne</th>
              <th className={rhTh()}>Salarié</th>
              <th className={rhTh()}>Date</th>
              <th className={rhTh()}>Chantier</th>
              <th className={rhTh()}>Code</th>
              <th className={rhTh()}>Statut</th>
              <th className={rhTh()}>Détail</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((l) => (
              <tr key={l.id} className="border-b border-border/40 align-top">
                <td className={`${rhTd()} text-xs`}>{l.source_ref}</td>
                <td className={rhTd()}>
                  {l.employee_name ?? <span className="text-foreground/55">{[l.last_name, l.first_name].filter(Boolean).join(" ") || "—"}</span>}
                  <div className="text-xs text-foreground/55">Mat. {l.matricule || "—"}</div>
                </td>
                <td className={rhTd()}>
                  {l.kind === "HOURS" ? monthLabel(l.work_date ?? "0000-00") : frDay(l.work_date)}
                  {l.raw_date && !l.work_date ? <div className="text-xs text-foreground/55">« {l.raw_date} »</div> : null}
                </td>
                <td className={rhTd()}>{l.site_name ?? l.site_code ?? "—"}</td>
                <td className={rhTd()}>
                  {l.kind === "HOURS"
                    ? Object.entries(l.hours)
                        .map(([k, v]) => `${k} ${v} h`)
                        .join(" · ") || "—"
                    : (l.legend_code ?? l.source_code ?? "—")}
                  {l.kind === "DAY" && l.source_code && l.legend_code && l.source_code !== l.legend_code ? (
                    <div className="text-xs text-foreground/55">fichier : {l.source_code}</div>
                  ) : null}
                </td>
                <td className={rhTd()}>
                  <RhChip tone={lineStatusTone(l.status)}>{lineStatusLabel(l.status)}</RhChip>
                  {l.resolution ? (
                    <div className="mt-1 text-xs text-foreground/60">
                      {l.resolution === "IMPORT" ? "Import retenu" : "Existant conservé"}
                    </div>
                  ) : null}
                </td>
                <td className={`${rhTd()} text-xs`}>
                  {[...l.errors, ...l.warnings].map((c) => (
                    <div key={c}>{anomalyLabel(c)}</div>
                  ))}
                  {l.conflict_kinds.map((c) => (
                    <div key={c} className="text-amber-700 dark:text-amber-300">
                      {conflictLabel(c)}
                    </div>
                  ))}
                  {l.existing.length ? (
                    <div className="text-foreground/60">
                      Déjà enregistré : {l.existing.map((e) => existingValueText(e, e.site_name ?? undefined)).join(" ; ")}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!loading && !state.rows.length ? (
              <tr>
                <td colSpan={7} className={`${rhTd()} text-center text-foreground/55`}>
                  Aucune ligne.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </RhTableWrap>
    </div>
  );
}

// ---------------------------------------------------------------------------
// D5 « trancher ligne par ligne » (SUPER_ADMIN)
// ---------------------------------------------------------------------------
function ConflictResolver({
  batch,
  decisionId,
  focused,
  onDone,
}: {
  batch: ArchiveBatch;
  decisionId: string;
  focused: boolean;
  onDone: (text: string) => void;
}) {
  const [rows, setRows] = useState<ArchiveLineRow[] | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [choice, setChoice] = useState<Record<string, "IMPORT" | "KEEP">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    listArchiveLines({ id: batch.id, status: "CONFLICT", page }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setError(r.error);
        setRows([]);
        return;
      }
      setRows(r.data.rows);
      setTotal(r.data.total);
    });
    return () => {
      alive = false;
    };
  }, [batch.id, page]);

  const open = (rows ?? []).filter((r) => !r.resolution);
  const chosen = Object.entries(choice).filter(([id]) => open.some((r) => r.id === id));

  function setAll(v: "IMPORT" | "KEEP") {
    setChoice((c) => ({ ...c, ...Object.fromEntries(open.map((r) => [r.id, v])) }));
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await resolveArchiveConflicts({
        decisionId,
        lines: chosen.map(([id, resolution]) => ({ id, resolution })),
      });
      if (!r.ok) return setError(r.error);
      onDone(
        r.data.remaining
          ? `${r.data.updated} ligne(s) tranchée(s) ; ${r.data.remaining} restent à trancher. Le lot reste en attente.`
          : `${r.data.updated} ligne(s) tranchée(s). Toutes les lignes en conflit sont tranchées : le lot peut être importé.`,
      );
    });
  }

  return (
    <div className={`space-y-3 rounded-xl border p-3 ${focused ? "border-brand" : "border-border/60"}`}>
      <div>
        <p className="font-semibold">Trancher les conflits ligne par ligne (décision D5)</p>
        <p className="text-xs text-foreground/60">
          Pour chaque ligne, conservez la valeur déjà enregistrée ou retenez la valeur importée. Rien n&apos;est remplacé
          maintenant : les valeurs retenues le seront à l&apos;import du lot, en attente de validation, et les valeurs
          remplacées restent consignées pour être restaurées en cas d&apos;annulation. Votre choix est enregistré dans
          l&apos;audit.
        </p>
      </div>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {rows === null ? <p className="text-sm text-foreground/60">Chargement…</p> : null}
      {rows && open.length ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setAll("KEEP")}>
              Tout conserver (cette page)
            </Button>
            <Button variant="ghost" onClick={() => setAll("IMPORT")}>
              Tout retenir (cette page)
            </Button>
          </div>
          <ul className="divide-y divide-border/40 text-sm">
            {open.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {l.employee_name ?? l.matricule} · {frDay(l.work_date)}
                  </p>
                  <p className="text-xs text-foreground/65">
                    Import : <b>{l.legend_code}</b> ({l.site_name ?? "?"}) — déjà enregistré :{" "}
                    {l.existing.map((e) => existingValueText(e, e.site_name ?? undefined)).join(" ; ") || "congé approuvé"}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">{l.conflict_kinds.map(conflictLabel).join(" ; ")}</p>
                </div>
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`r-${l.id}`}
                      checked={choice[l.id] === "KEEP"}
                      onChange={() => setChoice((c) => ({ ...c, [l.id]: "KEEP" }))}
                    />
                    Conserver l&apos;existant
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`r-${l.id}`}
                      checked={choice[l.id] === "IMPORT"}
                      onChange={() => setChoice((c) => ({ ...c, [l.id]: "IMPORT" }))}
                    />
                    Retenir l&apos;import
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : rows ? (
        <p className="text-sm text-foreground/60">Aucune ligne non tranchée sur cette page.</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-foreground/60">
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Précédente
          </Button>
          page {page + 1}/{Math.max(1, Math.ceil(total / 200))} · {batch.analysis.counts.unresolved} non tranchée(s) au total
          <Button variant="ghost" disabled={(page + 1) * 200 >= total} onClick={() => setPage((p) => p + 1)}>
            Suivante
          </Button>
        </div>
        <Button disabled={pending || !chosen.length} onClick={submit}>
          Enregistrer {chosen.length} choix
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// D11 correspondences and D12 policy
// ---------------------------------------------------------------------------
function MappingsPanel({
  mappings,
  access,
  onRevoke,
  onDone,
}: {
  mappings: CodeMapping[];
  access: ArchiveAccess;
  onRevoke: (m: CodeMapping) => void;
  onDone: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm(m: CodeMapping) {
    setError(null);
    start(async () => {
      const r = await confirmCodeMapping(m.id);
      if (!r.ok) return setError(r.error);
      onDone(`Correspondance ${m.source_code} → ${m.legend_code} confirmée : elle s'appliquera aux prochaines analyses.`);
    });
  }

  const statusText: Record<string, string> = {
    PENDING_CONFIRMATION: "À confirmer",
    ACTIVE: "Active",
    REVOKED: "Révoquée",
  };

  return (
    <RhPanel>
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold">Correspondances de codes conservées comme politique (D11)</h3>
          <p className="text-xs text-foreground/60">
            Une correspondance décidée « comme politique » ne s&apos;applique aux prochains lots qu&apos;après une seconde
            confirmation ici. Elle reste révocable ; la révocation ne modifie pas les lots déjà importés.
            {access.mappingDecider ? "" : " Seule une personne détenant le droit de décision D11 peut confirmer ou révoquer."}
          </p>
        </div>
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        {!mappings.length ? <RhAlert tone="info">Aucune correspondance conservée.</RhAlert> : null}
        {mappings.length ? (
          <RhTableWrap>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border/60">
                <tr>
                  <th className={rhTh()}>Code du fichier</th>
                  <th className={rhTh()}>Code retenu</th>
                  <th className={rhTh()}>Statut</th>
                  <th className={rhTh()}>Origine</th>
                  <th className={rhTh()}>Suivi</th>
                  <th className={rhTh()} />
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-b border-border/40">
                    <td className={`${rhTd()} font-mono`}>{m.source_code}</td>
                    <td className={`${rhTd()} font-mono`}>{m.legend_code}</td>
                    <td className={rhTd()}>
                      <RhChip tone={m.status === "ACTIVE" ? "success" : m.status === "REVOKED" ? "danger" : "warning"}>
                        {statusText[m.status] ?? m.status}
                      </RhChip>
                    </td>
                    <td className={`${rhTd()} text-xs`}>
                      <Link href={`/decisions/${m.decision_id}`} className="text-brand hover:underline">
                        Décision
                      </Link>
                      {m.batch_no ? ` · lot ${m.batch_no}` : ""} · {dateTime(m.created_at)}
                    </td>
                    <td className={`${rhTd()} text-xs`}>
                      {m.confirmed_at ? `Confirmée par ${m.confirmed_by_name ?? "?"} le ${dateTime(m.confirmed_at)}` : ""}
                      {m.revoked_at ? ` Révoquée le ${dateTime(m.revoked_at)} : ${m.revoke_reason}` : ""}
                    </td>
                    <td className={`${rhTd()} text-right`}>
                      {access.mappingDecider && m.status === "PENDING_CONFIRMATION" ? (
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" disabled={pending} onClick={() => confirm(m)}>
                            Confirmer
                          </Button>
                          <Button variant="ghost" disabled={pending} onClick={() => onRevoke(m)}>
                            Refuser
                          </Button>
                        </div>
                      ) : access.mappingDecider && m.status === "ACTIVE" ? (
                        <Button variant="ghost" disabled={pending} onClick={() => onRevoke(m)}>
                          Révoquer
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RhTableWrap>
        ) : null}
      </div>
    </RhPanel>
  );
}

function PolicyPanel({ access, canRequest, onRequest }: { access: ArchiveAccess; canRequest: boolean; onRequest: () => void }) {
  const state =
    access.importerMayValidate === null
      ? "Jamais décidée : par défaut, la personne qui importe un lot ne peut pas le valider."
      : access.importerMayValidate
        ? "L'auteur d'un import peut valider son propre lot."
        : "L'auteur d'un import ne peut pas valider son propre lot (choix confirmé).";
  return (
    <RhPanel>
      <div className="space-y-3">
        <h3 className="font-semibold">Validation d&apos;un lot par son auteur (D12)</h3>
        <RhAlert tone={access.importerMayValidate ? "warning" : "info"}>
          {state}
          {access.policyDecidedAt ? ` Décidé le ${dateTime(access.policyDecidedAt)}.` : ""}
        </RhAlert>
        <p className="text-sm text-foreground/70">
          Le SUPER_ADMIN peut toujours valider. Les droits d&apos;importer et de valider sont attribués séparément depuis
          l&apos;administration des rôles (écrans « Imports de présences » et « Validation des imports de présences ») et
          sont vérifiés par le serveur et la base de données. Changer cette politique demande une décision explicite du
          SUPER_ADMIN, révocable à tout moment.
        </p>
        {canRequest ? (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onRequest}>
              Demander une décision sur cette politique
            </Button>
          </div>
        ) : null}
      </div>
    </RhPanel>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
function DepositDialog({
  sites,
  onClose,
  onDone,
}: {
  sites: SiteOption[];
  onClose: () => void;
  onDone: (text: string, lot?: string) => void;
}) {
  const [pending, start] = useTransition();
  const [meta, setMeta] = useState<ArchiveMeta>(emptyArchiveMeta);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const set = <K extends keyof ArchiveMeta>(k: K, v: ArchiveMeta[K]) => setMeta((m) => ({ ...m, [k]: v }));
  const nature = meta.period_from && meta.period_to ? periodNature(meta.period_from, meta.period_to) : null;
  const grid = meta.format === "GRID";

  function setFormat(format: ArchiveMeta["format"]) {
    setMeta((m) => ({
      ...m,
      format,
      period_to: format === "GRID" ? m.period_from : m.period_to,
      site_ids: format === "GRID" ? m.site_ids.slice(0, 1) : m.site_ids,
    }));
  }

  function toggleSite(id: string) {
    setMeta((m) =>
      grid
        ? { ...m, site_ids: [id] }
        : { ...m, site_ids: m.site_ids.includes(id) ? m.site_ids.filter((s) => s !== id) : [...m.site_ids, id] },
    );
  }

  function submit() {
    if (!file) return setError("Choisissez le fichier à importer.");
    const ext = sourceExtOf(file.name);
    if (!ext) return setError("Format accepté : classeur Excel .xlsx ou fichier CSV (UTF-8).");
    if (file.size > ARCHIVE_SOURCE_MAX_BYTES) return setError("Fichier trop volumineux (10 Mo maximum).");
    const parsed = archiveMetaSchema.safeParse(meta);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Informations du lot incomplètes.");
    setError(null);
    start(async () => {
      setStep("Envoi du fichier…");
      const prepared = await prepareArchiveUpload({ ext, size: file.size });
      if (!prepared.ok) {
        setStep(null);
        return setError(prepared.error);
      }
      const { error: upErr } = await storage().uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
        contentType: ext === "csv" ? CSV_MIME : XLSX_MIME,
      });
      if (upErr) {
        setStep(null);
        return setError(`Envoi du fichier impossible : ${upErr.message}`);
      }
      setStep("Lecture et contrôle des lignes…");
      const r = await registerArchiveBatch({ path: prepared.data.path, file_name: file.name, meta: parsed.data });
      setStep(null);
      if (!r.ok) return setError(r.error);
      const c = r.data.analysis?.counts;
      onDone(
        r.data.warning ??
          `Fichier déposé et analysé : ${c?.read ?? 0} ligne(s) lue(s), ${c?.ok ?? 0} acceptée(s), ${c?.error ?? 0} rejetée(s)` +
            `${c?.conflict ? `, ${c.conflict} en conflit (décision du SUPER_ADMIN demandée)` : ""}. Rien n'est encore enregistré dans le pointage.`,
        r.data.id,
      );
    });
  }

  return (
    <QuickDialog
      title="Déposer un fichier d'archives de présence"
      subtitle="Le fichier est conservé tel quel avec son empreinte ; il ne pourra pas être remplacé."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !file} onClick={submit}>
            {step ?? "Déposer et analyser"}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <div className="space-y-4">
        <RhField label="Format du fichier" required>
          <select className={rhInput} value={meta.format} onChange={(e) => setFormat(e.target.value as ArchiveMeta["format"])}>
            <option value="GRID">{archiveFormatLabel("GRID")}</option>
            <option value="ROWS">{archiveFormatLabel("ROWS")}</option>
          </select>
        </RhField>
        <RhField
          label="Fichier"
          required
          hint={
            grid
              ? "Classeur .xlsx ou CSV UTF-8 : colonnes Matricule, Nom, Prénom, jours 1 à 31, HS50/HS75/HS100 (même disposition que la grille de pointage)."
              : "Classeur .xlsx ou CSV UTF-8 : colonnes Matricule, Nom, Prénom, Date, Code, Chantier, HS50/HS75/HS100 facultatives."
          }
        >
          <input type="file" className={rhInput} accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </RhField>
        <div className="grid gap-4 sm:grid-cols-3">
          <RhField label={grid ? "Mois" : "Premier mois"} required>
            <input
              className={rhInput}
              type="month"
              value={meta.period_from}
              onChange={(e) =>
                setMeta((m) => ({
                  ...m,
                  period_from: e.target.value,
                  period_to: grid || m.period_to < e.target.value ? e.target.value : m.period_to,
                  reference_year: Number(e.target.value.slice(0, 4)) || m.reference_year,
                }))
              }
            />
          </RhField>
          {grid ? null : (
            <RhField label="Dernier mois" required hint="12 mois au plus.">
              <input className={rhInput} type="month" value={meta.period_to} onChange={(e) => set("period_to", e.target.value)} />
            </RhField>
          )}
          <RhField label="Année de référence" required>
            <input
              className={rhInput}
              type="number"
              min={2000}
              max={2100}
              value={meta.reference_year}
              onChange={(e) => set("reference_year", Number(e.target.value))}
            />
          </RhField>
        </div>
        {nature ? (
          <RhAlert tone={nature === "OPERATIONAL" ? "info" : "warning"}>
            {natureLabel(nature)}.{" "}
            {nature !== "OPERATIONAL"
              ? "Les présences reprises servent à reconstituer l'historique : elles n'attestent ni un paiement ni une déclaration, et ne créent aucune paie."
              : ""}
          </RhAlert>
        ) : null}
        <RhField label={grid ? "Chantier" : "Chantiers couverts par le fichier"} required>
          <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-2 normal-case tracking-normal">
            {sites.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm font-normal text-foreground">
                <input
                  type={grid ? "radio" : "checkbox"}
                  name="archive-site"
                  checked={meta.site_ids.includes(s.id)}
                  onChange={() => toggleSite(s.id)}
                />
                <span className="font-mono text-xs">{s.code}</span> {s.name}
              </label>
            ))}
            {!sites.length ? <p className="text-sm text-foreground/60">Aucun chantier visible.</p> : null}
          </div>
        </RhField>
        {grid && meta.site_ids[0] && meta.period_from ? (
          <a
            className="text-sm font-semibold text-brand hover:underline"
            href={`/api/rh/presence/modele?site=${meta.site_ids[0]}&year=${meta.period_from.slice(0, 4)}&month=${Number(meta.period_from.slice(5, 7))}`}
          >
            Télécharger la grille de ce chantier pour ce mois
          </a>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <RhField label="Provenance" required>
            <select
              className={rhInput}
              value={meta.provenance_kind}
              onChange={(e) => set("provenance_kind", e.target.value as ArchiveMeta["provenance_kind"])}
            >
              {PROVENANCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {provenanceLabel(k)}
                </option>
              ))}
            </select>
          </RhField>
          <RhField label="Date du document source" hint="Date d'établissement du registre ou d'export du fichier.">
            <input
              className={rhInput}
              type="date"
              value={meta.source_produced_on}
              onChange={(e) => set("source_produced_on", e.target.value)}
            />
          </RhField>
        </div>
        <RhField label="Précision sur la provenance" required hint="Registre de quel chantier, logiciel utilisé, personne ou service qui a transmis le fichier.">
          <input
            className={rhInput}
            value={meta.provenance_detail}
            maxLength={300}
            onChange={(e) => set("provenance_detail", e.target.value)}
          />
        </RhField>
        <div className="grid gap-4 sm:grid-cols-2">
          <RhField label="Total de contrôle : présences" hint="Nombre de présences attendu (facultatif), comparé à l'analyse.">
            <input
              className={rhInput}
              type="number"
              min={0}
              value={meta.control_lines ?? ""}
              onChange={(e) => set("control_lines", e.target.value === "" ? null : Number(e.target.value))}
            />
          </RhField>
          <RhField label="Total de contrôle : salariés" hint="Nombre de salariés attendu (facultatif).">
            <input
              className={rhInput}
              type="number"
              min={0}
              value={meta.control_employees ?? ""}
              onChange={(e) => set("control_employees", e.target.value === "" ? null : Number(e.target.value))}
            />
          </RhField>
        </div>
        <RhField label="Commentaire">
          <textarea className={`${rhInput} min-h-16`} value={meta.comment} maxLength={1000} onChange={(e) => set("comment", e.target.value)} />
        </RhField>
        <p className="text-xs text-foreground/60">{HOURS_NOTICE}</p>
      </div>
    </QuickDialog>
  );
}

function CommitDialog({ batch, onClose, onDone }: { batch: ArchiveBatch; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = batch.analysis.counts;

  function submit() {
    setError(null);
    start(async () => {
      const r = await commitArchiveBatch({ id: batch.id, ackRejected: ack });
      if (!r.ok) return setError(r.error);
      if (!r.data.imported) {
        return onDone(
          `Import non effectué : la nouvelle analyse a trouvé ${r.data.unresolved} conflit(s) non tranché(s). Le lot attend la décision du SUPER_ADMIN.`,
        );
      }
      onDone(
        `${r.data.count} présence(s) importée(s) en attente de validation${r.data.replaced ? `, dont ${r.data.replaced} en remplacement (valeurs précédentes consignées dans le lot)` : ""}. Aucune paie n'a été créée ni recalculée.`,
      );
    });
  }

  return (
    <QuickDialog
      title={`Importer le lot ${batch.batch_no}`}
      subtitle={`${periodText(batch)} · ${batch.site_names.join(", ")}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || (c.error > 0 && !ack)} onClick={submit}>
            Importer {c.importable} présence(s)
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">
        Le lot est analysé à nouveau avec les données actuelles juste avant l&apos;import. Les présences importées sont
        enregistrées comme <b>proposées</b> : elles ne comptent pour aucune paie tant qu&apos;elles ne sont pas validées
        depuis l&apos;écran de validation. Aucune paie n&apos;est créée ni recalculée.
      </RhAlert>
      <ul className="space-y-1 text-sm">
        <li>{c.importable} présence(s) seront importées.</li>
        {c.take_import ? <li>{c.take_import} présence(s) existante(s) seront remplacées (décision D5), et restaurées si le lot est annulé.</li> : null}
        {c.keep_existing ? <li>{c.keep_existing} ligne(s) en conflit ne seront pas importées (existant conservé).</li> : null}
        {c.same ? <li>{c.same} ligne(s) déjà enregistrée(s) à l&apos;identique seront ignorées.</li> : null}
        {c.duplicate ? <li>{c.duplicate} doublon(s) seront ignorés.</li> : null}
        {c.hours_lines ? <li>{HOURS_NOTICE}</li> : null}
      </ul>
      {c.error ? (
        <label className="flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            {c.error} ligne(s) rejetée(s) ne seront pas importées (détail dans le rapport). J&apos;en prends acte et
            j&apos;importe le reste du lot.
          </span>
        </label>
      ) : null}
    </QuickDialog>
  );
}

function CloseDialog({ batch, onClose, onDone }: { batch: ArchiveBatch; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const imported = batch.status === "IMPORTED" || batch.status === "VALIDATED";

  function submit() {
    setError(null);
    start(async () => {
      const r = await cancelArchiveBatch({ id: batch.id, reason });
      if (!r.ok) return setError(r.error);
      onDone(
        r.data.status === "REJECTED"
          ? `Lot ${batch.batch_no} rejeté. Aucune présence n'a été importée ; le fichier et son rapport restent conservés.`
          : `Import ${batch.batch_no} annulé : ${r.data.removed} présence(s) importée(s) retirée(s), ${r.data.restored} valeur(s) précédente(s) restaurée(s).`,
      );
    });
  }

  return (
    <QuickDialog
      title={imported ? `Annuler l'import ${batch.batch_no}` : `Rejeter le lot ${batch.batch_no}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 10} onClick={submit}>
            {imported ? "Annuler l'import" : "Rejeter le lot"}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="warning">
        {imported
          ? "Les présences importées par ce lot sont retirées du pointage et les valeurs qu'elles avaient remplacées sont restaurées si le jour est libre. Refusé si la paie d'un des mois a été validée ou clôturée depuis (réouverture D7 nécessaire). Une paie brouillon concernée est signalée à recalculer ; rien n'est recalculé automatiquement."
          : "Aucune présence n'est importée. Le lot, son fichier et son rapport restent conservés pour l'audit ; les décisions en attente sur ce lot sont closes."}
      </RhAlert>
      <RhField label="Motif" required hint="10 à 500 caractères.">
        <textarea className={`${rhInput} min-h-20`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function MappingDialog({
  batch,
  legends,
  onClose,
  onDone,
}: {
  batch: ArchiveBatch;
  legends: LegendOption[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [codes, setCodes] = useState<{ code: string; lines: number }[] | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listUnknownCodes(batch.id).then((r) => {
      if (!alive) return;
      if (r.ok) setCodes(r.data);
      else {
        setCodes([]);
        setError(r.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [batch.id]);

  const chosen = useMemo(() => Object.fromEntries(Object.entries(map).filter(([, v]) => v)), [map]);

  function submit() {
    setError(null);
    start(async () => {
      const r = await requestArchiveMapping({ id: batch.id, map: chosen, reason });
      if (!r.ok) return setError(r.error);
      onDone(
        "Correspondance demandée (décision D11). Les lignes concernées restent rejetées jusqu'à la décision ; le lot sera analysé à nouveau dès qu'elle sera prise.",
      );
    });
  }

  return (
    <QuickDialog
      title="Codes inconnus : demander une correspondance"
      subtitle={`Lot ${batch.batch_no}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !Object.keys(chosen).length || reason.trim().length < 10} onClick={submit}>
            Demander la décision
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">
        Les codes des archives sont normalement ceux du référentiel. Pour un code différent, indiquez le code du
        référentiel qui lui correspond : la personne qui décide choisit de l&apos;appliquer à ce lot seulement ou de le
        conserver comme politique (seconde confirmation requise). Rien n&apos;est converti avant la décision.
      </RhAlert>
      {codes === null ? <p className="text-sm text-foreground/60">Chargement…</p> : null}
      <ul className="space-y-2">
        {(codes ?? []).map((c) => (
          <li key={c.code} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="w-24 font-mono font-semibold">{c.code}</span>
            <span className="w-24 text-xs text-foreground/60">{c.lines} ligne(s)</span>
            <select
              className={`${rhInput} mt-0 w-auto`}
              value={map[c.code] ?? ""}
              onChange={(e) => setMap((m) => ({ ...m, [c.code]: e.target.value }))}
            >
              <option value="">Ne pas convertir</option>
              {legends.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} — {l.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <RhField label="Motif" required hint="Pourquoi ce code correspond à celui du référentiel (10 à 500 caractères).">
        <textarea className={`${rhInput} min-h-16`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function PieceDialog({ batch, onClose, onDone }: { batch: ArchiveBatch; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!file) return setError("Choisissez la pièce.");
    const mime = file.type as ArchivePieceMime;
    if (!(ARCHIVE_PIECE_MIME as readonly string[]).includes(mime)) return setError("Format accepté : PDF, JPEG, PNG ou WebP.");
    if (file.size > ARCHIVE_PIECE_MAX_BYTES) return setError("Pièce trop volumineuse (20 Mo maximum).");
    setError(null);
    start(async () => {
      const prepared = await prepareArchivePieceUpload({ batchId: batch.id, mime, size: file.size });
      if (!prepared.ok) return setError(prepared.error);
      const { error: upErr } = await storage().uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: mime });
      if (upErr) return setError(`Envoi impossible : ${upErr.message}`);
      const r = await registerArchivePiece({ batchId: batch.id, path: prepared.data.path, file_name: file.name, mime, description });
      if (!r.ok) return setError(r.error);
      onDone(`Pièce « ${file.name} » jointe au lot ${batch.batch_no}.`);
    });
  }

  return (
    <QuickDialog
      title="Joindre une pièce justificative"
      subtitle={`Lot ${batch.batch_no}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !file} onClick={submit}>
            Joindre
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">
        Scan du registre papier, export du logiciel source ou courrier de transmission. La pièce est conservée comme
        preuve avec son empreinte ; elle n&apos;est pas lue automatiquement et ne pourra pas être remplacée.
      </RhAlert>
      <RhField label="Fichier" required hint="PDF, JPEG, PNG ou WebP, 20 Mo maximum.">
        <input type="file" className={rhInput} accept={ARCHIVE_PIECE_MIME.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </RhField>
      <RhField label="Description">
        <input className={rhInput} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function PolicyDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await requestImportPolicy({ reason });
      if (!r.ok) return setError(r.error);
      onDone("Décision D12 demandée au SUPER_ADMIN. La règle actuelle s'applique jusqu'à sa décision.");
    });
  }

  return (
    <QuickDialog
      title="Politique de validation des imports (D12)"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || reason.trim().length < 10} onClick={submit}>
            Demander la décision
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhField label="Motif de la demande" required hint="10 à 500 caractères.">
        <textarea className={`${rhInput} min-h-20`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function RevokeDialog({ mapping, onClose, onDone }: { mapping: CodeMapping; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refusing = mapping.status === "PENDING_CONFIRMATION";

  function submit() {
    setError(null);
    start(async () => {
      const r = await revokeCodeMapping({ id: mapping.id, reason });
      if (!r.ok) return setError(r.error);
      onDone(`Correspondance ${mapping.source_code} → ${mapping.legend_code} ${refusing ? "refusée" : "révoquée"}.`);
    });
  }

  return (
    <QuickDialog
      title={`${refusing ? "Refuser" : "Révoquer"} la correspondance ${mapping.source_code} → ${mapping.legend_code}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 10} onClick={submit}>
            {refusing ? "Refuser" : "Révoquer"}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">
        Les prochaines analyses ne l&apos;appliqueront plus. Les lots déjà importés ne sont pas modifiés.
      </RhAlert>
      <RhField label="Motif" required hint="10 à 500 caractères.">
        <textarea className={`${rhInput} min-h-16`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

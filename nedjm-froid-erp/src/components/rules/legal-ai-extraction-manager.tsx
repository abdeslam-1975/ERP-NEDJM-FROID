"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  analyzeLegalDocument,
  convertLegalAiSuggestion,
  dismissLegalAiSuggestion,
  requestEntryPathDecision,
  type LegalAiAccess,
  type LegalAiDocument,
  type LegalAiWorkspace,
} from "@/lib/actions/legal-ai-extraction";
import {
  AI_CONFIDENCE_LABEL,
  AI_ISSUE_LABEL,
  AI_KIND_LABEL,
  AI_NOTICE,
  PERSONAL_DATA_CONFIRMATION,
  aiConfidenceTone,
  aiPathCanAnalyze,
  aiPathLabel,
  aiPathTone,
  payloadInExcerpt,
  suggestionValueText,
  type AiSuggestionView,
  type AiTargets,
} from "@/lib/rules/ai-extraction";
import { applicationPeriodLabel, legalDocShortLabel, legalDocTypeLabel } from "@/lib/rules/legal-documents";
import { applicationMonthError, frDay, frMonth, monthStartOf } from "@/lib/rules/proposals";
import { QuickDialog, PROPOSALS_PATH } from "@/components/rules/rule-ui";
import { useLegalDocumentOpener } from "@/components/rules/legal-citations";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhField, RhPageHeader, RhPanel, RhSectionTitle, rhInput } from "@/components/rh/rh-ui";

const PATH = "/rh/legal/extraction-ia";

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const numText = (n: number) => String(round6(n)).replace(".", ",");
const parseNum = (v: string) => {
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const D15_CHOICE: Record<string, string> = { MANUAL: "saisie manuelle", AI: "extraction IA possible" };

export function LegalAiExtractionManager({ workspace: w, access }: { workspace: LegalAiWorkspace; access: LegalAiAccess }) {
  const router = useRouter();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();
  const [convert, setConvert] = useState<AiSuggestionView | null>(null);
  const [dismiss, setDismiss] = useState<AiSuggestionView | null>(null);
  const opener = useLegalDocumentOpener();
  const doc = w.selected;
  const wilayaNames = useMemo(() => new Map(w.targets.wilayas.map((x) => [x.code, x.name_fr])), [w.targets.wilayas]);
  const canUsePath = aiPathCanAnalyze(doc?.ai_path);

  function pick(id: string) {
    setInfo(null);
    setError(null);
    setConfirmed(false);
    router.push(id ? `${PATH}?document=${id}` : PATH);
  }

  function requestD15() {
    if (!doc) return;
    setError(null);
    start(async () => {
      const r = await requestEntryPathDecision(doc.id);
      if (!r.ok) return setError(r.error);
      setInfo("Décision D15 demandée : aucune analyse n'est possible avant la décision.");
      router.refresh();
    });
  }

  function analyze() {
    if (!doc) return;
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await analyzeLegalDocument({ document_id: doc.id, confirmed });
      if (!r.ok) return setError(r.error);
      setConfirmed(false);
      setInfo(
        `Analyse terminée : ${r.data.count} suggestion(s). Rien n'est appliqué : relisez chaque suggestion avec son extrait avant de créer une proposition.`,
      );
      router.refresh();
    });
  }

  function done(text: string) {
    setConvert(null);
    setDismiss(null);
    setInfo(text);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Extraction IA des documents juridiques"
        description="Lecture assistée des textes officiels appliqués à partir de 2026 : variables légales, taux CNAS et CACOBATPH, wilayas d'une zone IRG. Les tranches d'un barème IRG sont affichées pour une saisie manuelle."
      />
      <RhAlert tone="info">{AI_NOTICE}</RhAlert>
      {!access.configured ? (
        <RhAlert tone="warning">L&apos;analyse IA n&apos;est pas configurée sur le serveur (clé Gemini absente).</RhAlert>
      ) : null}
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}
      {opener.error ? <RhAlert tone="danger">{opener.error}</RhAlert> : null}

      <RhPanel>
        <RhField label="Document du registre (version en vigueur)">
          <select className={rhInput} value={doc?.id ?? ""} onChange={(e) => pick(e.target.value)}>
            <option value="">— Choisir un document —</option>
            {w.documents.map((d) => (
              <option key={d.id} value={d.id}>
                {aiPathCanAnalyze(d.ai_path) ? "● " : "○ "}
                {legalDocShortLabel(d)}
              </option>
            ))}
          </select>
        </RhField>
        <p className="mt-2 text-xs text-foreground/55">
          ● analyse possible · ○ saisie manuelle, décision D15 à prendre ou type de texte exclu. Les documents se
          déposent dans le{" "}
          <Link href="/rh/legal/documents" className="text-brand hover:underline">
            registre des documents juridiques
          </Link>
          .
        </p>
      </RhPanel>

      {doc ? (
        <DocumentPanel
          doc={doc}
          access={access}
          pending={pending}
          opening={opener.pending}
          onOpen={() => opener.open(doc.id)}
          onRequestD15={requestD15}
        />
      ) : null}

      {doc && canUsePath && access.analyze ? (
        <RhPanel>
          <RhSectionTitle>Lancer une analyse</RhSectionTitle>
          <div className="space-y-3 text-sm">
            <p className="text-foreground/70">
              Le fichier est envoyé au service Gemini ({access.model}) pour lecture. Une nouvelle analyse remplace la
              précédente : ses suggestions encore ouvertes sont écartées (celles déjà transformées restent).
            </p>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>{PERSONAL_DATA_CONFIRMATION}</span>
            </label>
            <div className="flex justify-end">
              <Button disabled={pending || !confirmed || !access.configured} onClick={analyze}>
                {pending ? "Analyse en cours…" : "Analyser le document"}
              </Button>
            </div>
          </div>
        </RhPanel>
      ) : null}

      {doc && w.extraction ? (
        <RhPanel>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <RhSectionTitle>
              Analyse du {dateTime(w.extraction.created_at)}
              {w.extraction.created_by_name ? ` · ${w.extraction.created_by_name}` : ""}
            </RhSectionTitle>
            <div className="flex flex-wrap gap-1.5">
              <RhChip tone={w.extraction.status === "OPEN" ? "brand" : "neutral"}>
                {w.extraction.status === "OPEN" ? "Analyse en cours de relecture" : "Analyse close"}
              </RhChip>
              <RhChip>Modèle {w.extraction.model}</RhChip>
            </div>
          </div>
          {w.extraction.document_id !== doc.id ? (
            <RhAlert tone="warning">
              Cette analyse porte sur une version précédente des informations du document : relancez une analyse pour
              travailler sur la version en vigueur.
            </RhAlert>
          ) : null}
          <DocumentInfo info={w.extraction.document_info} />
          {w.extraction.issues.length ? (
            <div className="mt-3">
              <p className="text-sm font-semibold">Points d&apos;attention signalés par la lecture ({w.extraction.issues.length})</p>
              <ul className="mt-1 space-y-1 text-sm">
                {w.extraction.issues.map((i, k) => (
                  <li key={k} className="flex flex-wrap items-start gap-2">
                    <RhChip tone={i.kind === "OTHER" ? "neutral" : "warning"}>{AI_ISSUE_LABEL[i.kind]}</RhChip>
                    <span className="text-foreground/80">{i.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!w.extraction.suggestions.length ? (
            <p className="mt-3 text-sm text-foreground/60">Aucune valeur relevée dans ce document.</p>
          ) : null}
          <div className="mt-4 space-y-3">
            {w.extraction.suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                s={s}
                targets={w.targets}
                wilayaNames={wilayaNames}
                canConvert={access.convert && canUsePath && w.extraction?.status === "OPEN"}
                canDismiss={access.dismiss}
                onConvert={() => setConvert(s)}
                onDismiss={() => setDismiss(s)}
              />
            ))}
          </div>
        </RhPanel>
      ) : doc && canUsePath ? (
        <RhAlert tone="info">Aucune analyse pour ce document.</RhAlert>
      ) : null}

      {doc && w.history.length > 1 ? (
        <RhPanel>
          <RhSectionTitle>Analyses précédentes</RhSectionTitle>
          <ul className="space-y-1 text-sm">
            {w.history.slice(1).map((h) => (
              <li key={h.id} className="text-foreground/70">
                {dateTime(h.created_at)} · {h.suggestion_count} suggestion(s) · {h.model} ·{" "}
                {h.status === "OPEN" ? "ouverte" : "close"}
              </li>
            ))}
          </ul>
        </RhPanel>
      ) : null}

      {convert && doc ? (
        <ConvertDialog
          s={convert}
          doc={doc}
          targets={w.targets}
          wilayaNames={wilayaNames}
          firstOpenMonth={w.firstOpenMonth}
          onClose={() => setConvert(null)}
          onDone={done}
        />
      ) : null}
      {dismiss ? <DismissDialog s={dismiss} onClose={() => setDismiss(null)} onDone={done} /> : null}
    </div>
  );
}

function DocumentPanel({
  doc,
  access,
  pending,
  opening,
  onOpen,
  onRequestD15,
}: {
  doc: LegalAiDocument;
  access: LegalAiAccess;
  pending: boolean;
  opening: boolean;
  onOpen: () => void;
  onRequestD15: () => void;
}) {
  return (
    <RhPanel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <RhChip tone="brand">{legalDocTypeLabel(doc.doc_type)}</RhChip>
            <RhChip tone={aiPathTone(doc.ai_path)}>{aiPathLabel(doc.ai_path ?? "")}</RhChip>
          </div>
          <h3 className="mt-1.5 font-semibold">{doc.title}</h3>
          <p className="text-sm text-foreground/70">
            {doc.reference} · application {applicationPeriodLabel(doc.applies_from, doc.applies_to)}
          </p>
        </div>
        <Button variant="secondary" disabled={opening} onClick={onOpen}>
          Voir le document
        </Button>
      </div>
      {doc.d15_open ? (
        <RhAlert tone="warning">
          Décision D15 en attente.{" "}
          <Link href={`/decisions/${doc.d15_open.id}`} className="font-semibold underline">
            Ouvrir la demande
          </Link>
        </RhAlert>
      ) : null}
      {doc.d15_last && !doc.d15_open ? (
        <p className="mt-3 text-sm text-foreground/70">
          Décision D15 : {D15_CHOICE[doc.d15_last.chosen_option ?? ""] ?? doc.d15_last.chosen_option}.{" "}
          <Link href={`/decisions/${doc.d15_last.id}`} className="text-brand hover:underline">
            Voir la décision
          </Link>
          {access.requestD15 ? " · Une nouvelle demande peut être faite pour changer de voie." : ""}
        </p>
      ) : null}
      {doc.ai_path === "D15_UNDECIDED" || ((doc.ai_path === "D15_MANUAL" || doc.ai_path === "D15_AI") && !doc.d15_open) ? (
        access.requestD15 ? (
          <div className="mt-3 flex justify-end">
            <Button variant={doc.ai_path === "D15_UNDECIDED" ? "primary" : "secondary"} disabled={pending} onClick={onRequestD15}>
              {doc.ai_path === "D15_UNDECIDED" ? "Demander la décision D15" : "Demander une nouvelle décision D15"}
            </Button>
          </div>
        ) : doc.ai_path === "D15_UNDECIDED" ? (
          <p className="mt-3 text-sm text-foreground/60">La demande D15 est réservée aux personnes autorisées.</p>
        ) : null
      ) : null}
    </RhPanel>
  );
}

function DocumentInfo({ info }: { info: Record<string, unknown> }) {
  const s = (k: string) => (typeof info[k] === "string" && info[k] ? String(info[k]) : null);
  const facts: [string, string | null][] = [
    ["Référence lue", s("reference")],
    ["Intitulé lu", s("title")],
    ["Publication lue", s("publication_date")],
    ["Date d'effet lue", s("effective_date")],
  ];
  return (
    <div className="mt-3 space-y-2">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([label, v]) => (
          <div key={label}>
            <dt className="text-xs text-foreground/55">{label}</dt>
            <dd>{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {info.readable === false ? <RhAlert tone="warning">Document jugé difficilement lisible par la lecture.</RhAlert> : null}
      {s("quality_notes") ? <p className="text-xs text-foreground/60">Qualité : {s("quality_notes")}</p> : null}
    </div>
  );
}

function targetText(s: AiSuggestionView, t: AiTargets): string {
  if (s.kind === "LEGAL_VAR") return t.vars.find((v) => v.id === s.target_id)?.label ?? s.target_label ?? s.target_code ?? "Cible non reconnue";
  if (s.kind === "CNAS_RATES") return t.regimes.find((r) => r.id === s.target_id)?.label ?? s.target_label ?? s.target_code ?? "Régime non reconnu";
  if (s.kind === "IRG_ZONE_SCOPE") return s.target_label ? `${s.target_key} — ${s.target_label}` : (s.target_code ?? "Zone non reconnue");
  return "Barème IRG";
}

const bracketCol = dataColumns<Record<string, unknown>>();
const bracketColumns = [
  bracketCol.display({
    id: "from",
    header: "De",
    meta: { className: "tabular-nums" },
    cell: ({ row }) => (typeof row.original.from === "number" ? numText(row.original.from) : "—"),
  }),
  bracketCol.display({
    id: "to",
    header: "À",
    meta: { className: "tabular-nums" },
    cell: ({ row }) => (typeof row.original.to === "number" ? numText(row.original.to) : "et plus"),
  }),
  bracketCol.display({
    id: "rate",
    header: "Taux",
    meta: { className: "tabular-nums" },
    cell: ({ row }) => (typeof row.original.rate === "number" ? `${numText(row.original.rate)} %` : "—"),
  }),
];

function SuggestionCard({
  s,
  targets,
  wilayaNames,
  canConvert,
  canDismiss,
  onConvert,
  onDismiss,
}: {
  s: AiSuggestionView;
  targets: AiTargets;
  wilayaNames: ReadonlyMap<string, string>;
  canConvert: boolean;
  canDismiss: boolean;
  onConvert: () => void;
  onDismiss: () => void;
}) {
  const fraction = s.kind === "LEGAL_VAR" && targets.vars.find((v) => v.id === s.target_id)?.fraction === true;
  const brackets = s.kind === "IRG_BAREME" && Array.isArray(s.payload.brackets) ? (s.payload.brackets as Record<string, unknown>[]) : [];
  const wilayaLabels =
    s.kind === "IRG_ZONE_SCOPE" && Array.isArray(s.payload.wilayas)
      ? s.payload.wilayas.map((c) => `${c} ${wilayaNames.get(String(c)) ?? ""}`.trim())
      : [];
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-foreground/50">#{s.seq}</span>
            <RhChip tone="brand">{AI_KIND_LABEL[s.kind]}</RhChip>
            <RhChip tone={aiConfidenceTone(s.confidence)}>{AI_CONFIDENCE_LABEL[s.confidence]}</RhChip>
            {s.kind !== "IRG_BAREME" ? (
              <RhChip tone={s.excerpt_match ? "success" : "danger"}>
                {s.excerpt_match ? "Valeur trouvée dans l'extrait" : "Valeur absente de l'extrait : transformation bloquée"}
              </RhChip>
            ) : null}
            {s.status === "CONVERTED" ? <RhChip tone="success">Proposition créée</RhChip> : null}
            {s.status === "DISMISSED" ? <RhChip>Écartée</RhChip> : null}
          </div>
          <p className="mt-1.5 font-semibold">{targetText(s, targets)}</p>
          <p className="text-sm">
            {suggestionValueText(s, fraction)}
            {s.value_as_written ? <span className="text-foreground/60"> · écrit « {s.value_as_written} »</span> : null}
          </p>
          {wilayaLabels.length ? <p className="text-xs text-foreground/60">{wilayaLabels.join(" · ")}</p> : null}
        </div>
        <div className="text-right text-xs text-foreground/60">
          <p>{s.article ?? "Article non indiqué"}{s.page ? ` · p. ${s.page}` : ""}</p>
          <p>Date d&apos;effet lue : {s.effective_date ? frDay(s.effective_date) : "non indiquée"}</p>
        </div>
      </div>

      {s.excerpt ? (
        <blockquote className="mt-2 whitespace-pre-wrap rounded-lg border-l-4 border-brand/40 bg-surface-muted/60 px-3 py-2 text-sm text-foreground/80">
          {s.excerpt}
        </blockquote>
      ) : (
        <p className="mt-2 text-sm text-foreground/60">Aucun extrait cité.</p>
      )}

      {brackets.length ? (
        <DataTable
          className="mt-2"
          data={brackets}
          columns={bracketColumns}
          getRowId={(_, i) => String(i)}
          searchable={false}
          columnToggle={false}
          pageSize={0}
        />
      ) : null}

      {s.kind === "IRG_BAREME" ? (
        <p className="mt-2 text-xs text-foreground/60">
          Lecture seule : un barème IRG se saisit à la main dans un brouillon de barème (
          <Link href="/rh/legal" className="text-brand hover:underline">
            Cotisations &amp; impôts
          </Link>
          ), puis suit l&apos;approbation habituelle.
        </p>
      ) : null}

      {s.warnings.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
          {s.warnings.map((x, i) => (
            <li key={i}>⚠ {x}</li>
          ))}
        </ul>
      ) : null}
      {s.notes ? <p className="mt-1 text-xs text-foreground/60">Note de lecture : {s.notes}</p> : null}
      {s.status === "DISMISSED" && s.dismiss_reason ? (
        <p className="mt-1 text-xs text-foreground/60">Motif : {s.dismiss_reason}</p>
      ) : null}
      {s.status === "CONVERTED" && s.proposal_id ? (
        <p className="mt-1 text-xs">
          <Link href={`${PROPOSALS_PATH}?id=${s.proposal_id}`} className="text-brand hover:underline">
            Ouvrir la proposition
          </Link>
          {s.final?.payload_edited === true || s.final?.excerpt_edited === true ? (
            <span className="text-foreground/60"> · corrigée par un humain avant création</span>
          ) : null}
        </p>
      ) : null}

      {s.status === "OPEN" ? (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {canDismiss ? (
            <Button variant="secondary" onClick={onDismiss}>
              Écarter
            </Button>
          ) : null}
          {canConvert && s.kind !== "IRG_BAREME" ? <Button onClick={onConvert}>Relire et créer la proposition</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

function ConvertDialog({
  s,
  doc,
  targets,
  wilayaNames,
  firstOpenMonth,
  onClose,
  onDone,
}: {
  s: AiSuggestionView;
  doc: LegalAiDocument;
  targets: AiTargets;
  wilayaNames: ReadonlyMap<string, string>;
  firstOpenMonth: string | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const p = s.payload;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const [targetId, setTargetId] = useState(s.target_id ?? "");
  const [zone, setZone] = useState(s.target_key ?? "");
  const variable = targets.vars.find((v) => v.id === targetId) ?? null;
  const fraction = variable?.fraction === true;
  const initialValue = num(p.value);
  const [valueText, setValueText] = useState(
    initialValue == null ? "" : numText(s.kind === "LEGAL_VAR" && targets.vars.find((v) => v.id === s.target_id)?.fraction ? initialValue * 100 : initialValue),
  );
  const [rates, setRates] = useState({
    employee_pct: num(p.employee_pct) == null ? "" : numText(num(p.employee_pct)!),
    employer_pct: num(p.employer_pct) == null ? "" : numText(num(p.employer_pct)!),
    fos_pct: num(p.fos_pct) == null ? "" : numText(num(p.fos_pct)!),
  });
  const [wilayas, setWilayas] = useState<string[]>(Array.isArray(p.wilayas) ? p.wilayas.map(String) : []);
  const effective = s.effective_date ?? doc.applies_from;
  const defaultMonth = (() => {
    const m = monthStartOf(effective);
    return firstOpenMonth && firstOpenMonth > m ? firstOpenMonth : m;
  })();
  const [textEffective, setTextEffective] = useState(effective);
  const [month, setMonth] = useState(defaultMonth.slice(0, 7));
  const [article, setArticle] = useState(s.article ?? "");
  const [page, setPage] = useState(String(s.page ?? 1));
  const [excerpt, setExcerpt] = useState(s.excerpt ?? "");
  const [sourceRef, setSourceRef] = useState(`${doc.reference}${s.article ? `, ${s.article}` : ""}`.slice(0, 500));
  const [submit, setSubmit] = useState(true);

  const value = parseNum(valueText);
  const storedValue = value == null || Number.isNaN(value) ? null : fraction ? round6(value / 100) : value;
  const parsedRates = {
    employee_pct: parseNum(rates.employee_pct),
    employer_pct: parseNum(rates.employer_pct),
    fos_pct: parseNum(rates.fos_pct),
  };
  const ratesValid = Object.values(parsedRates).every((r) => r === null || (!Number.isNaN(r) && r >= 0 && r <= 100));
  const payload: Record<string, unknown> =
    s.kind === "LEGAL_VAR"
      ? { value: storedValue }
      : s.kind === "CNAS_RATES"
        ? parsedRates
        : { wilayas: [...wilayas].sort() };
  const match = payloadInExcerpt(s.kind, payload, excerpt, wilayaNames);
  const monthIso = `${month}-01`;
  const monthError = month ? applicationMonthError({ month: monthIso, firstOpen: firstOpenMonth }) : "Choisissez le mois d'application.";

  const regime = targets.regimes.find((r) => r.id === targetId);
  const pctLabel = (v: number | null) => (v == null ? "légal" : `${numText(v)} %`);
  const autoTitle =
    s.kind === "LEGAL_VAR"
      ? `${variable?.label ?? "Variable"} : ${storedValue == null ? "—" : fraction ? `${numText(storedValue * 100)} %` : numText(storedValue)} à partir de ${frMonth(monthIso)}`
      : s.kind === "CNAS_RATES"
        ? `Régime CNAS ${regime?.code ?? ""} : ${pctLabel(parsedRates.employee_pct)} / ${pctLabel(parsedRates.employer_pct)} / FOS ${pctLabel(parsedRates.fos_pct)} à partir de ${frMonth(monthIso)}`
        : `Zone IRG ${zone} : ${wilayas.length} wilaya(s) à partir de ${frMonth(monthIso)}`;
  const [title, setTitle] = useState<string | null>(null);

  function toggleWilaya(code: string) {
    setWilayas((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
  }

  function save() {
    setError(null);
    if (!match) return setError("Contrôle bloquant : la valeur ne figure pas dans l'extrait cité.");
    if (s.kind === "LEGAL_VAR" && storedValue == null) return setError("Valeur numérique requise.");
    if (s.kind === "CNAS_RATES" && !ratesValid) return setError("Taux invalides (0 à 100 %).");
    if (monthError) return setError(monthError);
    start(async () => {
      const r = await convertLegalAiSuggestion({
        id: s.id,
        kind: s.kind,
        target_id: s.kind === "IRG_ZONE_SCOPE" ? null : targetId || null,
        target_key: s.kind === "IRG_ZONE_SCOPE" ? zone || null : null,
        value: storedValue,
        employee_pct: parsedRates.employee_pct,
        employer_pct: parsedRates.employer_pct,
        fos_pct: parsedRates.fos_pct,
        wilayas,
        title: (title ?? autoTitle).slice(0, 200),
        source_ref: sourceRef,
        text_effective_date: textEffective,
        requested_month: monthIso,
        article,
        page: Number(page),
        excerpt,
        submit,
        first_open: firstOpenMonth,
      });
      if (!r.ok) return setError(r.error);
      onDone(
        submit
          ? "Proposition créée (origine IA) et envoyée pour approbation : aucun effet sur la paie avant l'approbation par une autre personne, puis la décision D2."
          : "Proposition créée en brouillon (origine IA) : complétez-la puis soumettez-la depuis l'écran des propositions.",
      );
    });
  }

  return (
    <QuickDialog
      title="Relire la suggestion et créer la proposition"
      subtitle={`${AI_KIND_LABEL[s.kind]} · ${doc.reference}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !match} onClick={save}>
            Créer la proposition
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">
        Vérifiez la valeur dans le document lui-même et corrigez-la si besoin. La valeur doit figurer dans l&apos;extrait
        cité ; la proposition suit ensuite l&apos;approbation habituelle (une autre personne) et la décision D2.
      </RhAlert>

      {s.kind === "LEGAL_VAR" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <RhField label="Variable légale" required>
            <select className={rhInput} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">—</option>
              {targets.vars.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.key} — {v.label}
                </option>
              ))}
            </select>
          </RhField>
          <RhField
            label={fraction ? "Taux (%)" : "Valeur"}
            required
            hint={
              variable?.current != null
                ? `En vigueur : ${fraction ? `${numText(variable.current * 100)} %` : numText(variable.current)}`
                : undefined
            }
          >
            <input className={rhInput} inputMode="decimal" value={valueText} onChange={(e) => setValueText(e.target.value)} />
          </RhField>
        </div>
      ) : null}

      {s.kind === "CNAS_RATES" ? (
        <>
          <RhField label="Régime CNAS" required>
            <select className={rhInput} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">—</option>
              {targets.regimes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.label}
                </option>
              ))}
            </select>
          </RhField>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["employee_pct", "employer_pct", "fos_pct"] as const).map((k) => (
              <RhField
                key={k}
                label={k === "employee_pct" ? "Salarié (%)" : k === "employer_pct" ? "Employeur (%)" : "FOS (%)"}
                hint={regime ? `En vigueur : ${pctLabel(regime[k])}` : "Vide = taux légal"}
              >
                <input
                  className={rhInput}
                  inputMode="decimal"
                  value={rates[k]}
                  onChange={(e) => setRates({ ...rates, [k]: e.target.value })}
                />
              </RhField>
            ))}
          </div>
        </>
      ) : null}

      {s.kind === "IRG_ZONE_SCOPE" ? (
        <>
          <RhField label="Zone IRG" required>
            <select className={rhInput} value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">—</option>
              {targets.zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.code} — {z.label}
                </option>
              ))}
            </select>
          </RhField>
          <div>
            <p className="text-xs font-medium text-foreground/75">Wilayas ({wilayas.length})</p>
            <div className="mt-1 grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-border/60 p-2 text-sm sm:grid-cols-3">
              {targets.wilayas.map((x) => (
                <label key={x.code} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={wilayas.includes(x.code)} onChange={() => toggleWilaya(x.code)} />
                  {x.code} {x.name_fr}
                </label>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <RhField label="Extrait du texte" required hint="Recopié du document ; la valeur proposée doit y figurer (10 à 2000 caractères).">
        <textarea className={`${rhInput} min-h-24 py-2`} value={excerpt} maxLength={2000} onChange={(e) => setExcerpt(e.target.value)} />
      </RhField>
      <p className={`text-xs font-semibold ${match ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
        {match ? "✓ Valeur trouvée dans l'extrait." : "✗ Valeur absente de l'extrait : création bloquée."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Article" required>
          <input className={rhInput} value={article} maxLength={120} onChange={(e) => setArticle(e.target.value)} />
        </RhField>
        <RhField label="Page" required>
          <input className={rhInput} inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} />
        </RhField>
      </div>
      <RhField label="Source légale" required hint="Texte, article, date de publication.">
        <input className={rhInput} value={sourceRef} maxLength={500} onChange={(e) => setSourceRef(e.target.value)} />
      </RhField>
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Date d'effet prévue par le texte" required>
          <input className={rhInput} type="date" value={textEffective} onChange={(e) => setTextEffective(e.target.value)} />
        </RhField>
        <RhField label="Mois d'application souhaité" required hint="Fixé définitivement par la décision D2.">
          <input className={rhInput} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </RhField>
      </div>
      {monthError && month ? <p className="text-xs text-red-700 dark:text-red-300">{monthError}</p> : null}
      <RhField label="Intitulé de la proposition" required>
        <input className={rhInput} value={title ?? autoTitle} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </RhField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={submit} onChange={(e) => setSubmit(e.target.checked)} />
        Soumettre directement pour approbation
      </label>
    </QuickDialog>
  );
}

function DismissDialog({ s, onClose, onDone }: { s: AiSuggestionView; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  function save() {
    setError(null);
    start(async () => {
      const r = await dismissLegalAiSuggestion({ id: s.id, reason });
      if (!r.ok) return setError(r.error);
      onDone("Suggestion écartée : le motif est conservé dans l'historique.");
    });
  }
  return (
    <QuickDialog
      title="Écarter la suggestion"
      subtitle={`#${s.seq} · ${AI_KIND_LABEL[s.kind]}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 5} onClick={save}>
            Écarter
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhField label="Motif" required hint="5 à 500 caractères, par exemple « valeur mal lue » ou « hors sujet paie ».">
        <textarea className={`${rhInput} min-h-20 py-2`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

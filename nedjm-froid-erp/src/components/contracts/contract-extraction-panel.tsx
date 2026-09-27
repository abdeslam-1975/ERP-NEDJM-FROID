"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ContractDocumentRow } from "@/lib/actions/contract-documents";
import {
  analyzeContractDocuments,
  applyContractExtraction,
  discardContractExtraction,
  type ContractExtractionRow,
} from "@/lib/actions/contract-extractions";
import type { ContractAttributes, PenaltyRule } from "@/lib/contracts/attributes-schema";
import { isAnalysable } from "@/lib/contracts/document-files";
import {
  EXTRACTION_TARGETS,
  HEADER_FIELDS,
  type ExtractedPenalty,
  type ExtractionSource,
  type ExtractionTarget,
  type HeaderKey,
} from "@/lib/contracts/extraction-schema";

const CONFIDENT = 0.7;

type HeaderValues = {
  start_date: string;
  end_date: string;
  ods_date: string | null;
  total_amount_ht: number;
  caution_rate: number;
};

function pct(rate: number | null | undefined) {
  return rate == null ? "—" : `${Math.round(rate * 10000) / 100} %`;
}

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(n) + " DA";
}

function describePenalty(p: Pick<PenaltyRule, "mode" | "rate" | "fixed_amount" | "grace_hours" | "grace_days" | "brackets">) {
  const value =
    p.mode === "FIXED"
      ? p.fixed_amount != null
        ? money(p.fixed_amount)
        : "—"
      : p.mode === "PROGRESSIVE"
        ? (p.brackets ?? []).map((b) => `${pct(b.rate)} dès le jour ${b.from_day}`).join(", ") || "—"
        : `${pct(p.rate)}${p.mode === "PCT_ITEM" ? " de l'article" : " du taux journalier"}`;
  const grace =
    p.grace_hours != null ? ` · grâce ${p.grace_hours} h` : p.grace_days != null ? ` · grâce ${p.grace_days} j` : "";
  return value + grace;
}

function describeExtractedPenalty(p: ExtractedPenalty) {
  return describePenalty({
    mode: p.mode,
    rate: p.rate ?? undefined,
    fixed_amount: p.fixed_amount ?? undefined,
    grace_hours: p.grace_hours ?? undefined,
    grace_days: p.grace_days ?? undefined,
    brackets: p.brackets,
  });
}

function currentHeader(key: HeaderKey, header: HeaderValues) {
  if (key === "total_amount_ht") return money(header.total_amount_ht);
  if (key === "caution_rate") return pct(header.caution_rate);
  return header[key] ?? "—";
}

export function ContractExtractionPanel({
  contractId,
  documents,
  canWrite,
  aiConfigured,
  model,
  extraction,
  attrs,
  header,
}: {
  contractId: string;
  documents: ContractDocumentRow[];
  canWrite: boolean;
  aiConfigured: boolean;
  model: string;
  extraction: ContractExtractionRow | null;
  attrs: ContractAttributes;
  header: HeaderValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [docIds, setDocIds] = useState<string[]>([]);
  const [targets, setTargets] = useState<ExtractionTarget[]>(["PENALTIES", "TERMINATION"]);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ applied: string[]; skipped: string[] } | null>(null);

  const docLabel = useMemo(() => {
    const byId = new Map(documents.map((doc) => [doc.id, doc.title || doc.file_name]));
    return (source: ExtractionSource) => {
      if (source.document === 0) return "Texte collé";
      const id = extraction?.document_ids[source.document - 1];
      return (id && byId.get(id)) || `Document ${source.document}`;
    };
  }, [documents, extraction]);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function analyze() {
    setError(null);
    setReport(null);
    startTransition(async () => {
      const result = await analyzeContractDocuments({
        contract_id: contractId,
        document_ids: docIds,
        targets,
        pasted_text: pasted,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPasted("");
      router.refresh();
    });
  }

  if (!canWrite) return null;

  return (
    <div className="space-y-4 rounded-md border border-brand/30 bg-brand-muted/20 p-3">
      <div>
        <h3 className="font-semibold">Analyse IA des extraits</h3>
        <p className="mt-1 text-xs text-foreground/65">
          Les documents cochés et le texte collé sont envoyés à Google Gemini ({model}). Rien n&apos;est
          modifié dans le contrat avant votre validation. Excel reste importé par l&apos;onglet Canva.
        </p>
      </div>

      {!aiConfigured ? (
        <p className="rounded-md border border-alert-warning/40 bg-alert-warning/10 px-3 py-2 text-sm">
          L&apos;analyse IA n&apos;est pas encore configurée sur le serveur (clé GEMINI_API_KEY absente).
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-3 py-2 text-sm text-alert-critical">
          {error}
        </p>
      ) : null}

      {report ? (
        <div className="rounded-md border border-brand/30 bg-surface px-3 py-2 text-sm">
          <p className="font-medium">Appliqué : {report.applied.join(" · ")}</p>
          {report.skipped.length ? (
            <ul className="mt-1 list-disc ps-5 text-foreground/70">
              {report.skipped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!extraction ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Documents à analyser</legend>
            {documents.length === 0 ? (
              <p className="text-foreground/60">Ajoutez d&apos;abord un extrait ci-dessus.</p>
            ) : null}
            {documents.map((doc) => {
              const ok = isAnalysable(doc.file_name);
              return (
                <label key={doc.id} className={`flex items-center gap-2 ${ok ? "" : "opacity-50"}`}>
                  <input
                    type="checkbox"
                    disabled={!ok || pending}
                    checked={docIds.includes(doc.id)}
                    onChange={() => setDocIds((list) => toggle(list, doc.id))}
                  />
                  {doc.title || doc.file_name}
                  {!ok ? <span className="text-xs">(non analysable)</span> : null}
                </label>
              );
            })}
          </fieldset>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Rubriques à extraire</legend>
            {EXTRACTION_TARGETS.map((target) => (
              <label key={target.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={targets.includes(target.value)}
                  onChange={() => setTargets((list) => toggle(list, target.value))}
                />
                {target.label}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-medium sm:col-span-2">
            Ou collez le texte d&apos;un article (facultatif)
            <textarea
              rows={4}
              className={inputClass}
              value={pasted}
              disabled={pending}
              onChange={(e) => setPasted(e.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            <Button
              onClick={analyze}
              disabled={
                pending || !aiConfigured || !targets.length || (!docIds.length && !pasted.trim())
              }
            >
              {pending ? "Analyse en cours…" : "Analyser avec Gemini"}
            </Button>
          </div>
        </div>
      ) : (
        <ExtractionReview
          key={extraction.id}
          extraction={extraction}
          attrs={attrs}
          header={header}
          docLabel={docLabel}
          onDone={(done) => {
            setReport(done);
            router.refresh();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function ExtractionReview({
  extraction,
  attrs,
  header,
  docLabel,
  onDone,
  onError,
}: {
  extraction: ContractExtractionRow;
  attrs: ContractAttributes;
  header: HeaderValues;
  docLabel: (source: ExtractionSource) => string;
  onDone: (report: { applied: string[]; skipped: string[] }) => void;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const r = extraction.result;
  const confident = (source: ExtractionSource) => source.confidence >= CONFIDENT;

  const [headerKeys, setHeaderKeys] = useState<HeaderKey[]>(
    HEADER_FIELDS.filter((f) => {
      const field = r.header?.[f.key];
      return field && confident(field.source) && f.key !== "total_amount_ht";
    }).map((f) => f.key),
  );
  const [penalties, setPenalties] = useState<number[]>(
    r.penalties.flatMap((p, i) => (confident(p.source) ? [i] : [])),
  );
  const [cap, setCap] = useState(Boolean(r.penalty_cap && confident(r.penalty_cap.source)));
  const [termination, setTermination] = useState(
    Boolean(r.termination && confident(r.termination.source)),
  );
  const [clauses, setClauses] = useState<number[]>(
    r.clauses.flatMap((c, i) => (confident(c.source) ? [i] : [])),
  );

  const allRules = [...attrs.penalties.presets, ...attrs.penalties.custom];
  const headerRows = HEADER_FIELDS.filter((f) => r.header?.[f.key]);
  const empty =
    !headerRows.length && !r.penalties.length && !r.penalty_cap && !r.termination && !r.clauses.length;
  const selectedCount =
    headerKeys.length + penalties.length + (cap ? 1 : 0) + (termination ? 1 : 0) + clauses.length;

  function flip(list: number[], i: number) {
    return list.includes(i) ? list.filter((n) => n !== i) : [...list, i];
  }

  function apply() {
    onError(null);
    startTransition(async () => {
      const result = await applyContractExtraction({
        extraction_id: extraction.id,
        header: headerKeys,
        penalties,
        penalty_cap: cap,
        termination,
        clauses,
      });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onDone(result.data);
    });
  }

  function discard() {
    onError(null);
    startTransition(async () => {
      const result = await discardContractExtraction(extraction.id);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onDone({ applied: ["aucune proposition (analyse abandonnée)"], skipped: [] });
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Analyse du {extraction.created_at.slice(0, 16).replace("T", " ")} · {extraction.model}. Cochez ce
        que vous acceptez. Les propositions à confiance faible (&lt; 70 %) ne sont pas cochées.
      </p>

      {r.warnings.length ? (
        <ul className="list-disc rounded-md border border-alert-warning/40 bg-alert-warning/10 px-3 py-2 ps-7 text-sm">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {empty ? <p className="text-sm">Aucune donnée trouvée dans les extraits pour les rubriques demandées.</p> : null}

      {headerRows.length ? (
        <Section title="Montants et dates">
          {headerRows.map((f) => {
            const field = r.header![f.key]!;
            const auto = f.key === "total_amount_ht" && attrs.financial.total_mode !== "MANUAL";
            return (
              <Proposal
                key={f.key}
                checked={headerKeys.includes(f.key)}
                disabled={auto}
                onToggle={() =>
                  setHeaderKeys((list) =>
                    list.includes(f.key) ? list.filter((k) => k !== f.key) : [...list, f.key],
                  )
                }
                title={f.label}
                current={currentHeader(f.key, header)}
                proposed={field.value}
                note={auto ? "Non applicable : total calculé à partir des lignes (mode AUTO)." : undefined}
                source={field.source}
                docLabel={docLabel}
              />
            );
          })}
        </Section>
      ) : null}

      {r.penalties.length || r.penalty_cap ? (
        <Section title="Pénalités">
          {r.penalties.map((p, i) => {
            const match = p.preset_code ? allRules.find((rule) => rule.code === p.preset_code) : undefined;
            return (
              <Proposal
                key={i}
                checked={penalties.includes(i)}
                onToggle={() => setPenalties((list) => flip(list, i))}
                title={match ? `${p.label} → ${match.label}` : `${p.label} (nouvelle pénalité)`}
                current={match ? describePenalty(match) : "—"}
                proposed={describeExtractedPenalty(p)}
                source={p.source}
                docLabel={docLabel}
              />
            );
          })}
          {r.penalty_cap ? (
            <Proposal
              checked={cap}
              onToggle={() => setCap((v) => !v)}
              title="Plafond global des pénalités"
              current={attrs.penalties.max_cap_enabled ? pct(attrs.penalties.max_cap_rate) : "désactivé"}
              proposed={pct(r.penalty_cap.rate)}
              source={r.penalty_cap.source}
              docLabel={docLabel}
            />
          ) : null}
        </Section>
      ) : null}

      {r.termination ? (
        <Section title="Résiliation">
          <Proposal
            checked={termination}
            onToggle={() => setTermination((v) => !v)}
            title={`Résiliation ${r.termination.article_ref ?? r.termination.source.article ?? ""}`.trim()}
            current={[
              attrs.clauses.termination.notice_days != null ? `préavis ${attrs.clauses.termination.notice_days} j` : null,
              attrs.clauses.termination.cure_days != null ? `mise en demeure ${attrs.clauses.termination.cure_days} j` : null,
              attrs.clauses.termination.grounds.length ? `${attrs.clauses.termination.grounds.length} motif(s)` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
            proposed={[
              r.termination.notice_days != null ? `préavis ${r.termination.notice_days} j` : null,
              r.termination.cure_days != null ? `mise en demeure ${r.termination.cure_days} j` : null,
              r.termination.client_convenience ? "résiliation unilatérale du client" : null,
              r.termination.caution_effect ? `caution : ${r.termination.caution_effect.toLowerCase()}` : null,
              ...r.termination.grounds.map((g) => `motif : ${g}`),
              r.termination.financial_consequences,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
            source={r.termination.source}
            docLabel={docLabel}
          />
        </Section>
      ) : null}

      {r.clauses.length ? (
        <Section title="Autres clauses">
          {r.clauses.map((c, i) => (
            <Proposal
              key={i}
              checked={clauses.includes(i)}
              onToggle={() => setClauses((list) => flip(list, i))}
              title={`${c.title}${c.article_ref ? ` (${c.article_ref})` : ""}`}
              current="—"
              proposed={c.content || "—"}
              source={c.source}
              docLabel={docLabel}
            />
          ))}
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={apply} disabled={pending || selectedCount === 0}>
          {pending ? "Application…" : `Appliquer la sélection (${selectedCount})`}
        </Button>
        <Button variant="secondary" onClick={discard} disabled={pending}>
          Abandonner cette analyse
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}

function Proposal({
  checked,
  disabled,
  onToggle,
  title,
  current,
  proposed,
  note,
  source,
  docLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  title: string;
  current: string;
  proposed: string;
  note?: string;
  source: ExtractionSource;
  docLabel: (source: ExtractionSource) => string;
}) {
  const low = source.confidence < CONFIDENT;
  return (
    <label className={`block rounded-md border bg-surface p-3 text-sm ${low ? "border-alert-warning/60" : "border-border"}`}>
      <span className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="flex-1 space-y-1">
          <span className="block font-medium">{title}</span>
          <span className="grid gap-1 sm:grid-cols-2">
            <span>
              <span className="text-xs text-foreground/55">Actuel · </span>
              {current}
            </span>
            <span>
              <span className="text-xs text-foreground/55">Proposé · </span>
              <strong>{proposed}</strong>
            </span>
          </span>
          {note ? <span className="block text-xs text-foreground/60">{note}</span> : null}
          <span className="block text-xs text-foreground/60">
            {docLabel(source)}
            {source.page ? ` · p. ${source.page}` : ""}
            {source.article ? ` · ${source.article}` : ""} · confiance {Math.round(source.confidence * 100)} %
          </span>
          {source.excerpt ? (
            <span className="block border-s-2 border-border ps-2 text-xs italic text-foreground/70">
              « {source.excerpt} »
            </span>
          ) : null}
        </span>
      </span>
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

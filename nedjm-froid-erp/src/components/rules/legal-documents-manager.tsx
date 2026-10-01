"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  correctLegalDocument,
  prepareLegalDocumentUpload,
  registerLegalDocument,
  withdrawLegalDocument,
  type LegalDocAccess,
} from "@/lib/actions/legal-documents";
import {
  IMPORT_NOTICE,
  LEGAL_DOC_BUCKET,
  LEGAL_DOC_LANGUAGES,
  LEGAL_DOC_MAX_BYTES,
  LEGAL_DOC_MIME,
  LEGAL_DOC_TYPES,
  applicationPeriodLabel,
  emptyLegalDocMeta,
  entryPathLabel,
  entryPathOf,
  fileSizeLabel,
  groupLegalDocuments,
  legalDocLanguageLabel,
  legalDocStatusLabel,
  legalDocTypeLabel,
  metaOf,
  monthlyCoverage,
  type LegalDocMeta,
  type LegalDocMime,
  type LegalDocument,
  type LegalDocumentGroup,
} from "@/lib/rules/legal-documents";
import { FAMILY_LABEL, ruleStatusLabel, ruleStatusTone, type RuleFamily } from "@/lib/rules/proposals";
import { QuickDialog, PROPOSALS_PATH } from "@/components/rules/rule-ui";
import { useLegalDocumentOpener } from "@/components/rules/legal-citations";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhPageHeader, RhPanel, RhToolbar, rhInput } from "@/components/rh/rh-ui";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

type Dialog =
  | { kind: "import" }
  | { kind: "correct"; doc: LegalDocument }
  | { kind: "withdraw"; doc: LegalDocument }
  | null;

function storage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(LEGAL_DOC_BUCKET);
}

const frDay = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function LegalDocumentsManager({
  documents,
  access,
  year,
}: {
  documents: LegalDocument[];
  access: LegalDocAccess;
  year: number | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const opener = useLegalDocumentOpener();

  const groups = useMemo(() => groupLegalDocuments(documents), [documents]);
  const shown = groups.filter((g) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    const d = g.current;
    return [d.title, d.reference, d.jo_number ?? "", legalDocTypeLabel(d.doc_type)].some((s) => s.toLowerCase().includes(q));
  });
  const coverageYear = year ?? new Date().getFullYear();
  const coverage = useMemo(() => monthlyCoverage(documents, coverageYear), [documents, coverageYear]);
  const thisYear = new Date().getFullYear();

  function goYear(v: string) {
    router.push(v ? `/rh/legal/documents?annee=${v}` : "/rh/legal/documents?annee=tout");
  }

  function done(text: string) {
    setDialog(null);
    setInfo(text);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Registre des documents juridiques"
        description="Lois de finances, décrets, circulaires… classés par période d'application. Chaque valeur légale proposée cite au moins un de ces documents (article, page, extrait) avant d'être approuvée par une autre personne."
        actions={
          access.create ? <Button onClick={() => setDialog({ kind: "import" })}>Importer un document</Button> : null
        }
      />
      <RhAlert tone="info">{IMPORT_NOTICE}</RhAlert>
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}
      {opener.error ? <RhAlert tone="danger">{opener.error}</RhAlert> : null}

      <RhToolbar>
        <label className="flex items-center gap-2 text-sm">
          Période d&apos;application
          <select className={`${rhInput} w-auto`} value={year ?? ""} onChange={(e) => goYear(e.target.value)}>
            <option value="">Toutes les années</option>
            {Array.from({ length: thisYear + 2 - 2000 }, (_, i) => thisYear + 1 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <input
          className={`${rhInput} max-w-xs`}
          placeholder="Rechercher (intitulé, référence, JO)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </RhToolbar>

      <RhPanel>
        <h3 className="text-sm font-semibold">Couverture du registre en {coverageYear}</h3>
        <p className="mt-0.5 text-xs text-foreground/60">
          Nombre de documents en vigueur au registre dont la période d&apos;application couvre chaque mois. Un mois
          sans document signale un texte manquant au registre ; il ne prouve rien sur la loi applicable.
        </p>
        <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {coverage.map((n, i) => (
            <div
              key={i}
              className={`rounded-lg px-1 py-1.5 text-center text-xs ${
                n ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
              }`}
            >
              <div className="font-semibold">{MONTHS[i]}</div>
              <div>{n ? `${n} doc.` : "aucun"}</div>
            </div>
          ))}
        </div>
      </RhPanel>

      {!shown.length ? (
        <RhAlert tone="info">
          {groups.length ? "Aucun document ne correspond à la recherche." : "Aucun document au registre pour cette période."}
        </RhAlert>
      ) : null}

      {shown.map((g) => (
        <DocumentCard
          key={g.current.root_id}
          group={g}
          access={access}
          opening={opener.pending}
          onOpen={opener.open}
          onCorrect={(doc) => setDialog({ kind: "correct", doc })}
          onWithdraw={(doc) => setDialog({ kind: "withdraw", doc })}
        />
      ))}

      {dialog?.kind === "import" ? <ImportDialog onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "correct" ? (
        <CorrectDialog doc={dialog.doc} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "withdraw" ? (
        <WithdrawDialog doc={dialog.doc} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
    </div>
  );
}

function DocumentCard({
  group,
  access,
  opening,
  onOpen,
  onCorrect,
  onWithdraw,
}: {
  group: LegalDocumentGroup;
  access: LegalDocAccess;
  opening: boolean;
  onOpen: (id: string) => void;
  onCorrect: (doc: LegalDocument) => void;
  onWithdraw: (doc: LegalDocument) => void;
}) {
  const d = group.current;
  const citations = [group.current, ...group.history].flatMap((v) => v.citations.map((c) => ({ ...c, version: v.version_no })));
  return (
    <RhPanel>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <RhChip tone="brand">{legalDocTypeLabel(d.doc_type)}</RhChip>
              <RhChip tone={d.status === "ACTIVE" ? "success" : d.status === "WITHDRAWN" ? "danger" : "warning"}>
                {legalDocStatusLabel(d.status)}
              </RhChip>
              {d.version_no > 1 ? <RhChip>Version {d.version_no}</RhChip> : null}
              <RhChip>{legalDocLanguageLabel(d.language)}</RhChip>
            </div>
            <h3 className="mt-1.5 font-semibold">{d.title}</h3>
            <p className="text-sm text-foreground/70">
              {d.reference}
              {d.jo_number ? ` · JO n° ${d.jo_number}${d.jo_date ? ` du ${frDay(d.jo_date)}` : ""}` : ""}
            </p>
          </div>
          <div className="text-right text-xs text-foreground/60">
            <p>Importé le {dateTime(d.created_at)}</p>
            <p>
              {d.file_name} · {fileSizeLabel(d.size_bytes)}
            </p>
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-foreground/55">Période d&apos;application</dt>
            <dd>{applicationPeriodLabel(d.applies_from, d.applies_to)}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/55">Publication</dt>
            <dd>{frDay(d.publication_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/55">Provenance</dt>
            <dd>
              {d.origin}
              {d.source_url ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    lien
                  </a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/55">Empreinte SHA-256</dt>
            <dd className="truncate font-mono text-xs" title={d.sha256}>
              {d.sha256.slice(0, 16)}…
            </dd>
          </div>
        </dl>
        <p className="text-xs text-foreground/60">Voie de saisie : {entryPathLabel(d.entry_path)}</p>
        {d.notes ? <p className="text-sm text-foreground/75">{d.notes}</p> : null}
        {d.status === "WITHDRAWN" ? (
          <RhAlert tone="warning">
            Retiré le {dateTime(d.withdrawn_at)} : {d.withdrawn_reason}. Il ne peut plus être cité ; les propositions qui le
            citent l&apos;affichent en avertissement.
          </RhAlert>
        ) : null}

        {citations.length ? (
          <div>
            <p className="text-xs font-semibold text-foreground/70">Cité par {citations.length} proposition(s)</p>
            <ul className="mt-1 space-y-1 text-xs">
              {citations.map((c, i) => (
                <li key={`${c.proposal_id}-${i}`} className="flex flex-wrap items-center gap-1.5">
                  <RhChip tone={ruleStatusTone(c.status)}>{ruleStatusLabel(c.status)}</RhChip>
                  <Link href={`${PROPOSALS_PATH}?id=${c.proposal_id}`} className="text-brand hover:underline">
                    {c.title}
                  </Link>
                  <span className="text-foreground/60">
                    {FAMILY_LABEL[c.family as RuleFamily] ?? c.family} · {c.article} · p. {c.page}
                    {c.version > 1 || group.history.length ? ` · v${c.version}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {group.history.length ? (
          <details className="rounded-xl border border-border/60 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-foreground/70">Versions précédentes ({group.history.length})</summary>
            <ul className="mt-2 space-y-2">
              {group.history.map((v) => (
                <li key={v.id} className="border-t border-border/40 pt-2">
                  <p>
                    <b>Version {v.version_no}</b> · {v.reference} — {v.title} · application{" "}
                    {applicationPeriodLabel(v.applies_from, v.applies_to)}
                  </p>
                  <p className="text-xs text-foreground/60">
                    {legalDocStatusLabel(v.status)} · enregistrée le {dateTime(v.created_at)}
                    {v.correction_reason ? ` · motif de correction : ${v.correction_reason}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {d.correction_reason ? (
          <p className="text-xs text-foreground/60">Dernière correction : {d.correction_reason}</p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={opening} onClick={() => onOpen(d.id)}>
            Voir le document
          </Button>
          {d.status === "ACTIVE" && d.entry_path !== "MANUAL" ? (
            <Link
              href={`/rh/legal/extraction-ia?document=${d.id}`}
              className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground/80 hover:bg-surface-muted"
            >
              Extraction IA
            </Link>
          ) : null}
          {d.status === "ACTIVE" && access.create ? (
            <Button variant="secondary" onClick={() => onCorrect(d)}>
              Corriger les informations
            </Button>
          ) : null}
          {d.status === "ACTIVE" && access.withdraw ? (
            <Button variant="danger" onClick={() => onWithdraw(d)}>
              Retirer
            </Button>
          ) : null}
        </div>
      </div>
    </RhPanel>
  );
}

export function MetaFields({ value, onChange }: { value: LegalDocMeta; onChange: (v: LegalDocMeta) => void }) {
  const set = <K extends keyof LegalDocMeta>(k: K, v: LegalDocMeta[K]) => onChange({ ...value, [k]: v });
  const path = value.applies_from ? entryPathOf(value.applies_from, value.applies_to || null) : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Type de texte" required>
          <select className={rhInput} value={value.doc_type} onChange={(e) => set("doc_type", e.target.value as LegalDocMeta["doc_type"])}>
            {LEGAL_DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {legalDocTypeLabel(t)}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label="Langue" required>
          <select className={rhInput} value={value.language} onChange={(e) => set("language", e.target.value as LegalDocMeta["language"])}>
            {LEGAL_DOC_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {legalDocLanguageLabel(l)}
              </option>
            ))}
          </select>
        </RhField>
      </div>
      <RhField label="Intitulé" required>
        <input className={rhInput} value={value.title} maxLength={300} onChange={(e) => set("title", e.target.value)} />
      </RhField>
      <RhField label="Référence" required hint="Numéro et date du texte, ex. loi n° 25-xx du 24 décembre 2025.">
        <input className={rhInput} value={value.reference} maxLength={200} onChange={(e) => set("reference", e.target.value)} />
      </RhField>
      <div className="grid gap-4 sm:grid-cols-3">
        <RhField label="N° du Journal officiel">
          <input className={rhInput} value={value.jo_number} maxLength={40} onChange={(e) => set("jo_number", e.target.value)} />
        </RhField>
        <RhField label="Date du JO">
          <input className={rhInput} type="date" value={value.jo_date} onChange={(e) => set("jo_date", e.target.value)} />
        </RhField>
        <RhField label="Date de publication">
          <input
            className={rhInput}
            type="date"
            value={value.publication_date}
            onChange={(e) => set("publication_date", e.target.value)}
          />
        </RhField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Applicable à partir du" required>
          <input className={rhInput} type="date" value={value.applies_from} onChange={(e) => set("applies_from", e.target.value)} />
        </RhField>
        <RhField label="Applicable jusqu'au" hint="Laisser vide si la fin n'est pas fixée.">
          <input className={rhInput} type="date" value={value.applies_to} onChange={(e) => set("applies_to", e.target.value)} />
        </RhField>
      </div>
      {path ? <p className="text-xs text-foreground/60">Voie de saisie : {entryPathLabel(path)}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <RhField label="Provenance" required hint="Organisme, site officiel ou transmission reçue.">
          <input className={rhInput} value={value.origin} maxLength={200} onChange={(e) => set("origin", e.target.value)} />
        </RhField>
        <RhField label="Lien de la source" hint="Adresse https:// (facultatif).">
          <input className={rhInput} value={value.source_url} maxLength={500} onChange={(e) => set("source_url", e.target.value)} />
        </RhField>
      </div>
      <RhField label="Notes">
        <textarea className={`${rhInput} min-h-16`} value={value.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} />
      </RhField>
    </div>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [meta, setMeta] = useState<LegalDocMeta>(emptyLegalDocMeta);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!file) return setError("Choisissez le fichier du texte.");
    const mime = file.type as LegalDocMime;
    if (!(LEGAL_DOC_MIME as readonly string[]).includes(mime)) return setError("Format refusé : PDF, JPEG, PNG ou WebP.");
    if (file.size > LEGAL_DOC_MAX_BYTES) return setError("Fichier trop volumineux (25 Mo maximum).");
    setError(null);
    start(async () => {
      const prepared = await prepareLegalDocumentUpload({ mime, size: file.size });
      if (!prepared.ok) return setError(prepared.error);
      const { error: upErr } = await storage().uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
        contentType: mime,
      });
      if (upErr) return setError(`Envoi du fichier impossible : ${upErr.message}`);
      const r = await registerLegalDocument({ path: prepared.data.path, file_name: file.name, mime, meta });
      if (!r.ok) return setError(r.error);
      onDone(`« ${meta.title} » ajouté au registre. ${IMPORT_NOTICE}`);
    });
  }

  return (
    <QuickDialog
      title="Importer un document juridique"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !file} onClick={submit}>
            Importer
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">{IMPORT_NOTICE}</RhAlert>
      <RhField label="Fichier du texte" required hint="PDF, JPEG, PNG ou WebP, 25 Mo maximum. Le fichier ne pourra plus être remplacé.">
        <input
          type="file"
          className={rhInput}
          accept={LEGAL_DOC_MIME.join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </RhField>
      <MetaFields value={meta} onChange={setMeta} />
    </QuickDialog>
  );
}

function CorrectDialog({ doc, onClose, onDone }: { doc: LegalDocument; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [meta, setMeta] = useState<LegalDocMeta>(() => metaOf(doc));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await correctLegalDocument({ id: doc.id, meta, reason });
      if (!r.ok) return setError(r.error);
      onDone(`« ${meta.title} » corrigé : version ${doc.version_no + 1} enregistrée, la précédente reste consultable.`);
    });
  }

  return (
    <QuickDialog
      title="Corriger les informations du document"
      subtitle={`${doc.reference} — version ${doc.version_no}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || reason.trim().length < 10} onClick={submit}>
            Enregistrer la correction
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">
        La correction crée une nouvelle version des informations ; le fichier ne change pas. Les propositions déjà
        rédigées gardent la version qu&apos;elles citent et l&apos;approbateur voit qu&apos;une version plus récente
        existe.
      </RhAlert>
      <MetaFields value={meta} onChange={setMeta} />
      <RhField label="Motif de la correction" required hint="10 caractères minimum.">
        <textarea className={`${rhInput} min-h-16`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function WithdrawDialog({ doc, onClose, onDone }: { doc: LegalDocument; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await withdrawLegalDocument({ id: doc.id, reason });
      if (!r.ok) return setError(r.error);
      onDone(`« ${doc.title} » retiré du registre.`);
    });
  }

  return (
    <QuickDialog
      title="Retirer le document"
      subtitle={`${doc.reference} — ${doc.title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 10} onClick={submit}>
            Retirer
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="warning">
        Le document reste consultable mais ne peut plus être cité. Une proposition qui ne cite que lui ne pourra plus
        être soumise ni approuvée ; celles déjà approuvées ou appliquées ne changent pas et affichent un avertissement.
        Rien ne change sur la paie.
      </RhAlert>
      <RhField label="Motif du retrait" required hint="10 à 500 caractères.">
        <textarea className={`${rhInput} min-h-20`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

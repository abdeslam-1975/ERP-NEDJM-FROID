"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RhAlert, RhEmpty, RhField, rhInput, rhSelect } from "@/components/rh/rh-ui";
import {
  CONTRACT_DOCUMENT,
  FICHE_DOCUMENT,
  canPromote,
  cycleStep,
  type CycleStep,
} from "@/lib/hr/candidate-cycle";
import {
  createCandidate,
  generateCandidateDocument,
  promoteCandidate,
  reviewCandidateDocument,
  saveCandidateContract,
  saveCandidateIdentity,
  uploadCandidateFile,
  type CandidateCycleData,
  type CandidateDocumentRow,
  type CandidateRow,
} from "@/lib/actions/hr-candidates";
import type { OpenClientContract } from "@/lib/actions/hr-contracts";

const STEPS: { id: CycleStep; fr: string; ar: string }[] = [
  { id: "IDENTITY", fr: "Pièces d'identité", ar: "وثائق الهوية" },
  { id: "FICHE", fr: "Fiche signée", ar: "بطاقة موقعة" },
  { id: "CONTRACT", fr: "Contrat signé", ar: "عقد موقع" },
  { id: "PROMOTED", fr: "Dans la base", ar: "في القاعدة" },
];

type Option = { id: string; label: string };

function currentDoc(docs: CandidateDocumentRow[], candidateId: string, code: string) {
  return docs.find((doc) => doc.candidate_id === candidateId && doc.is_current && doc.doc_code === code) ?? null;
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "UPLOADED":
      return "Téléversée · à valider";
    case "VALIDATED":
      return "Validée";
    case "REJECTED":
      return "Rejetée";
    case "GENERATED":
      return "À imprimer et signer";
    case "PENDING_REVIEW":
      return "Scan reçu · à confirmer";
    case "ARCHIVED":
      return "Archivée";
    default:
      return "Manquante";
  }
}

export function CandidatesManager({
  initial,
  sites,
  activities,
  contractTypes,
  clientContracts,
  loadError,
}: {
  initial: CandidateCycleData;
  sites: Option[];
  activities: Option[];
  contractTypes: Option[];
  clientContracts: OpenClientContract[];
  loadError?: string;
}) {
  const [data, setData] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.candidates[0]?.id ?? null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = data.candidates.find((row) => row.id === selectedId) ?? null;
  const docs = useMemo(
    () => data.documents.filter((doc) => doc.candidate_id === selected?.id),
    [data.documents, selected?.id],
  );

  function apply(result: { ok: true; data: CandidateCycleData } | { ok: false; error: string }, keepId?: string) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setNotice(result.data.notice);
    setData(result.data);
    const id = keepId && result.data.candidates.some((row) => row.id === keepId)
      ? keepId
      : result.data.candidates[0]?.id ?? null;
    setSelectedId(id);
  }

  function run(task: () => Promise<{ ok: true; data: CandidateCycleData } | { ok: false; error: string }>, keepId?: string) {
    start(async () => {
      apply(await task(), keepId ?? selectedId ?? undefined);
    });
  }

  const step = selected
    ? cycleStep({
        promoted: Boolean(selected.employee_id),
        docs,
        requiredIdentity: data.identitySlots,
      })
    : "IDENTITY";
  const ready = selected
    ? canPromote({ promoted: Boolean(selected.employee_id), docs, requiredIdentity: data.identitySlots })
    : false;

  return (
    <div className="space-y-4">
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice ? <RhAlert tone="info">{notice}</RhAlert> : null}

      <form
        className="grid gap-3 rounded-2xl border border-border/70 bg-surface p-4 md:grid-cols-4"
        action={(formData) => {
          run(() =>
            createCandidate({
              last_name: String(formData.get("last_name") || ""),
              first_name: String(formData.get("first_name") || ""),
              phone: String(formData.get("phone") || ""),
            }),
          );
        }}
      >
        <RhField label="Nom" required>
          <input name="last_name" className={rhInput} required />
        </RhField>
        <RhField label="Prénom" required>
          <input name="first_name" className={rhInput} required />
        </RhField>
        <RhField label="Téléphone">
          <input name="phone" className={rhInput} />
        </RhField>
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            Ouvrir un cycle
          </Button>
        </div>
      </form>

      {!data.candidates.length ? (
        <RhEmpty title="Aucun candidat" body="Le cycle commence ici. Le salarié n'entre dans la base qu'après le contrat signé." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <ul className="space-y-1">
            {data.candidates.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    row.id === selectedId ? "border-brand bg-brand/5" : "border-border/60"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {row.last_name} {row.first_name}
                  </span>
                  <span className="text-xs text-foreground/55">
                    {STEPS.find((item) => item.id === row.cycle_step)?.fr}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <CandidateDossier
              key={selected.id}
              candidate={selected}
              docs={docs}
              slots={data.identitySlots}
              sites={sites}
              activities={activities}
              contractTypes={contractTypes}
              clientContracts={clientContracts}
              step={step}
              ready={ready}
              pending={pending}
              onIdentity={(values) => run(() => saveCandidateIdentity({ id: selected.id, ...values }), selected.id)}
              onUpload={(formData) => {
                formData.set("candidate_id", selected.id);
                run(() => uploadCandidateFile(formData), selected.id);
              }}
              onReview={(docCode, decision, reason) =>
                run(
                  () => reviewCandidateDocument({ candidate_id: selected.id, doc_code: docCode, decision, reason }),
                  selected.id,
                )
              }
              onContract={(values) => run(() => saveCandidateContract({ id: selected.id, ...values }), selected.id)}
              onGenerate={(kind) => run(() => generateCandidateDocument({ id: selected.id, kind }), selected.id)}
              onPromote={() => run(() => promoteCandidate(selected.id), selected.id)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function CandidateDossier({
  candidate,
  docs,
  slots,
  sites,
  activities,
  contractTypes,
  clientContracts,
  step,
  ready,
  pending,
  onIdentity,
  onUpload,
  onReview,
  onContract,
  onGenerate,
  onPromote,
}: {
  candidate: CandidateRow;
  docs: CandidateDocumentRow[];
  slots: CandidateCycleData["identitySlots"];
  sites: Option[];
  activities: Option[];
  contractTypes: Option[];
  clientContracts: OpenClientContract[];
  step: CycleStep;
  ready: boolean;
  pending: boolean;
  onIdentity: (values: {
    last_name: string;
    first_name: string;
    last_name_ar?: string;
    first_name_ar?: string;
    nin?: string;
    birth_date?: string;
    phone?: string;
  }) => void;
  onUpload: (formData: FormData) => void;
  onReview: (docCode: string, decision: "VALIDATED" | "REJECTED" | "ARCHIVED", reason?: string) => void;
  onContract: (values: {
    site_id: string;
    activity_code_id: string;
    contract_type_code?: string;
    poste_fr?: string;
    salaire_base_monthly: number;
    contract_start: string;
    contract_end?: string;
    client_contract_id?: string;
    clause_ids?: string[];
  }) => void;
  onGenerate: (kind: "FICHE" | "CONTRACT") => void;
  onPromote: () => void;
}) {
  const locked = Boolean(candidate.employee_id);
  const [siteId, setSiteId] = useState(candidate.site_id ?? "");
  const [clientId, setClientId] = useState(candidate.client_contract_id ?? "");
  const [poste, setPoste] = useState(candidate.poste_fr ?? "");
  const [clauseIds, setClauseIds] = useState(candidate.client_terms?.clauses.map((clause) => clause.id) ?? []);
  const onSite = clientContracts.filter((contract) => contract.site_id === siteId);
  const chosen = onSite.find((contract) => contract.id === clientId) ?? null;

  function chooseSite(nextSite: string) {
    const available = clientContracts.filter((contract) => contract.site_id === nextSite);
    const only = available.length === 1 ? available[0] : null;
    setSiteId(nextSite);
    setClientId(only?.id ?? (available.some((contract) => contract.id === clientId) ? clientId : ""));
    setClauseIds([]);
    if (only?.labor.length === 1) setPoste(only.labor[0].designation);
    else if (only && !only.labor.some((item) => item.designation === poste)) setPoste("");
  }

  function chooseClient(nextId: string) {
    const contract = onSite.find((item) => item.id === nextId) ?? null;
    setClientId(nextId);
    setClauseIds([]);
    if (contract?.labor.length === 1) setPoste(contract.labor[0].designation);
    else if (contract && !contract.labor.some((item) => item.designation === poste)) setPoste("");
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((item, index) => {
          const reached = STEPS.findIndex((stepItem) => stepItem.id === step) >= index;
          return (
            <li
              key={item.id}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                item.id === step ? "bg-brand text-white" : reached ? "bg-emerald-50 text-emerald-800" : "bg-surface-muted text-foreground/50"
              }`}
            >
              {index + 1}. {item.fr}
              <span className="ml-1 font-normal" dir="rtl">
                {item.ar}
              </span>
            </li>
          );
        })}
      </ol>

      <form
        className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-3"
        action={(formData) =>
          onIdentity({
            last_name: String(formData.get("last_name") || ""),
            first_name: String(formData.get("first_name") || ""),
            last_name_ar: String(formData.get("last_name_ar") || ""),
            first_name_ar: String(formData.get("first_name_ar") || ""),
            nin: String(formData.get("nin") || ""),
            birth_date: String(formData.get("birth_date") || ""),
            phone: String(formData.get("phone") || ""),
          })
        }
      >
        <RhField label="Nom" required>
          <input name="last_name" defaultValue={candidate.last_name} className={rhInput} disabled={locked} />
        </RhField>
        <RhField label="Prénom" required>
          <input name="first_name" defaultValue={candidate.first_name} className={rhInput} disabled={locked} />
        </RhField>
        <RhField label="Date de naissance">
          <input name="birth_date" type="date" defaultValue={candidate.birth_date ?? ""} className={rhInput} disabled={locked} />
        </RhField>
        <RhField label="اللقب">
          <input name="last_name_ar" defaultValue={candidate.last_name_ar ?? ""} className={rhInput} dir="rtl" disabled={locked} />
        </RhField>
        <RhField label="الاسم">
          <input name="first_name_ar" defaultValue={candidate.first_name_ar ?? ""} className={rhInput} dir="rtl" disabled={locked} />
        </RhField>
        <RhField label="NIN">
          <input name="nin" defaultValue={candidate.nin ?? ""} className={rhInput} disabled={locked} />
        </RhField>
        <RhField label="Téléphone">
          <input name="phone" defaultValue={candidate.phone ?? ""} className={rhInput} disabled={locked} />
        </RhField>
        {locked ? null : (
          <div className="flex items-end">
            <Button type="submit" variant="secondary" disabled={pending}>
              Enregistrer l&apos;identité
            </Button>
          </div>
        )}
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Pièces reçues</h2>
        {slots.map((slot) => {
          const doc = currentDoc(docs, candidate.id, slot.code);
          return (
            <article key={slot.code} className="rounded-xl border border-border/60 px-3 py-2">
              <p className="text-sm font-semibold">
                {slot.label_fr}
                {slot.label_ar ? (
                  <span className="ml-2 text-xs font-normal text-foreground/50" dir="rtl">
                    {slot.label_ar}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-foreground/55">{statusLabel(doc?.status)}</p>
              {doc?.reject_reason ? <p className="text-xs text-red-800">{doc.reject_reason}</p> : null}
              {doc?.file_url ? (
                <a className="text-xs font-semibold text-brand underline" href={doc.file_url} target="_blank" rel="noreferrer">
                  {doc.file_name || "Voir"}
                </a>
              ) : null}
              {locked ? null : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <form action={onUpload} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="doc_code" value={slot.code} />
                    <input type="hidden" name="role" value="incoming" />
                    <input name="file" type="file" accept="application/pdf,image/*" className="text-xs" required />
                    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                      Téléverser
                    </Button>
                  </form>
                  <Button type="button" size="sm" disabled={pending || doc?.status !== "UPLOADED"} onClick={() => onReview(slot.code, "VALIDATED")}>
                    Valider
                  </Button>
                  <RejectButton disabled={pending || doc?.status !== "UPLOADED"} onReject={(reason) => onReview(slot.code, "REJECTED", reason)} />
                </div>
              )}
            </article>
          );
        })}
      </section>

      <ProducedBlock
        title="Fiche de renseignements"
        hint="Le PDF est la version à imprimer. L'archive est le scan signé de cette version."
        doc={currentDoc(docs, candidate.id, FICHE_DOCUMENT)}
        locked={locked}
        pending={pending}
        canGenerate={step !== "IDENTITY"}
        onGenerate={() => onGenerate("FICHE")}
        onUpload={onUpload}
        onReview={onReview}
      />

      <form
        className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-3"
        action={(formData) =>
          onContract({
            site_id: siteId,
            activity_code_id: String(formData.get("activity_code_id") || ""),
            contract_type_code: String(formData.get("contract_type_code") || ""),
            poste_fr: poste,
            salaire_base_monthly: Number(formData.get("salaire_base_monthly") || 0),
            contract_start: String(formData.get("contract_start") || ""),
            contract_end: String(formData.get("contract_end") || ""),
            client_contract_id: clientId,
            clause_ids: clauseIds,
          })
        }
      >
        <h2 className="md:col-span-3 text-sm font-semibold">Termes du contrat</h2>
        <RhField label="Site" required>
          <select name="site_id" value={siteId} className={rhSelect} disabled={locked} onChange={(event) => chooseSite(event.target.value)}>
            <option value="">—</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.label}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label="Activité" required>
          <select name="activity_code_id" defaultValue={candidate.activity_code_id ?? ""} className={rhSelect} disabled={locked}>
            <option value="">—</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.label}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label="Type">
          <select name="contract_type_code" defaultValue={candidate.contract_type_code ?? ""} className={rhSelect} disabled={locked}>
            <option value="">—</option>
            {contractTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </RhField>
        {chosen?.labor.length ? (
          <RhField label="Poste du contrat client" required>
            <select
              className={rhSelect}
              value={chosen.labor.find((item) => item.designation === poste)?.id ?? ""}
              disabled={locked}
              onChange={(event) => {
                const labor = chosen.labor.find((item) => item.id === event.target.value);
                setPoste(labor?.designation ?? "");
              }}
            >
              <option value="">—</option>
              {chosen.labor.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.designation}
                  {item.unit ? ` · ${item.unit}` : ""}
                </option>
              ))}
            </select>
          </RhField>
        ) : (
          <RhField label="Poste">
            <input value={poste} onChange={(event) => setPoste(event.target.value)} className={rhInput} disabled={locked} />
          </RhField>
        )}
        <div className="space-y-2 md:col-span-3">
          <RhField
            label="Contrat client"
            hint="Ses postes, la pénalité d'absence et les clauses confirmées entrent dans le contrat. · مناصبه وعقوبة الغياب والبنود المؤكدة تدخل في العقد."
          >
            <select className={rhSelect} value={clientId} disabled={locked} onChange={(event) => chooseClient(event.target.value)}>
              <option value="">—</option>
              {onSite.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.contract_number} · {contract.client_name}
                </option>
              ))}
            </select>
          </RhField>
          {chosen?.absence.length ? (
            <p className="text-xs text-foreground/70">
              Absence · الغياب : {chosen.absence.map((rule) => `${rule.label} (${rule.detail})`).join(" · ")}
            </p>
          ) : null}
          {chosen?.clauses.length ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold">Clauses à reporter · بنود تُنقل إلى عقد العمل</p>
              {chosen.clauses.map((clause) => (
                <label key={clause.id} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={clauseIds.includes(clause.id)}
                    disabled={locked}
                    onChange={(event) =>
                      setClauseIds((current) =>
                        event.target.checked ? [...current, clause.id] : current.filter((id) => id !== clause.id),
                      )
                    }
                  />
                  <span>
                    <span className="font-semibold">{clause.title}</span>
                    {clause.article_ref ? ` · ${clause.article_ref}` : ""}
                    {clause.content ? <span className="block text-foreground/65">{clause.content}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <RhField label="Salaire de base" required>
          <input name="salaire_base_monthly" type="number" min={0} step="0.01" defaultValue={candidate.salaire_base_monthly ?? ""} className={rhInput} disabled={locked} />
        </RhField>
        <RhField label="Début (1er du mois)" required>
          <input name="contract_start" type="date" defaultValue={candidate.contract_start ?? ""} className={rhInput} disabled={locked} />
        </RhField>
        <RhField label="Fin">
          <input name="contract_end" type="date" defaultValue={candidate.contract_end ?? ""} className={rhInput} disabled={locked} />
        </RhField>
        {locked ? null : (
          <div className="flex items-end">
            <Button type="submit" variant="secondary" disabled={pending}>
              Enregistrer les termes
            </Button>
          </div>
        )}
      </form>

      <ProducedBlock
        title="Contrat de travail"
        hint="Imprimer, faire signer, scanner la même version, puis confirmer l'archive. Le transfert crée le matricule."
        doc={currentDoc(docs, candidate.id, CONTRACT_DOCUMENT)}
        locked={locked}
        pending={pending}
        canGenerate={step === "CONTRACT" || step === "PROMOTED"}
        onGenerate={() => onGenerate("CONTRACT")}
        onUpload={onUpload}
        onReview={onReview}
      />

      {locked ? (
        <RhAlert tone="success">
          Transféré dans la base des salariés. Le pointage s&apos;ouvre depuis le fichier administratif, après l&apos;attestation CNAS.
        </RhAlert>
      ) : (
        <Button type="button" disabled={pending || !ready} onClick={onPromote}>
          Transférer dans la base des salariés
        </Button>
      )}
    </div>
  );
}

function ProducedBlock({
  title,
  hint,
  doc,
  locked,
  pending,
  canGenerate,
  onGenerate,
  onUpload,
  onReview,
}: {
  title: string;
  hint: string;
  doc: CandidateDocumentRow | null;
  locked: boolean;
  pending: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onUpload: (formData: FormData) => void;
  onReview: (docCode: string, decision: "VALIDATED" | "REJECTED" | "ARCHIVED", reason?: string) => void;
}) {
  const code = title.startsWith("Fiche") ? FICHE_DOCUMENT : CONTRACT_DOCUMENT;
  return (
    <section className="rounded-2xl border border-border/70 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-foreground/55">{hint}</p>
      <p className="mt-2 text-xs font-semibold">{statusLabel(doc?.status)}{doc ? ` · version ${doc.version_no}` : ""}</p>
      {doc?.reject_reason ? <p className="text-xs text-red-800">{doc.reject_reason}</p> : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {doc?.specimen_url ? (
          <a className="font-semibold text-brand underline" href={doc.specimen_url} target="_blank" rel="noreferrer">
            Version à imprimer
          </a>
        ) : null}
        {doc?.file_url ? (
          <a className="font-semibold text-brand underline" href={doc.file_url} target="_blank" rel="noreferrer">
            Scan signé
          </a>
        ) : null}
      </div>
      {locked ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={pending || !canGenerate} onClick={onGenerate}>
            Produire la version
          </Button>
          <form action={onUpload} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="doc_code" value={code} />
            <input type="hidden" name="role" value="scan" />
            <input name="file" type="file" accept="application/pdf,image/*" className="text-xs" required />
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              Téléverser le scan
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            disabled={pending || doc?.status !== "PENDING_REVIEW"}
            onClick={() => onReview(code, "ARCHIVED")}
          >
            Confirmer l&apos;archive
          </Button>
          <RejectButton
            disabled={pending || doc?.status !== "PENDING_REVIEW"}
            onReject={(reason) => onReview(code, "REJECTED", reason)}
          />
        </div>
      )}
    </section>
  );
}

function RejectButton({ disabled, onReject }: { disabled: boolean; onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>
        Rejeter
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif" className={`${rhInput} mt-0 h-8 w-48`} />
      <Button
        type="button"
        size="sm"
        variant="danger"
        disabled={disabled || !reason.trim()}
        onClick={() => {
          onReject(reason.trim());
          setReason("");
          setOpen(false);
        }}
      >
        Confirmer le rejet
      </Button>
    </span>
  );
}

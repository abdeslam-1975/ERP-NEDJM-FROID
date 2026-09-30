"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, RhPageHeader, RhToolbar, bi, rhInput } from "@/components/rh/rh-ui";
import { ExternalOperationsList } from "@/components/rh/external-registers";
import {
  confirmExternalOperation,
  examineExternalDocument,
  getExternalDocumentUrl,
  prepareExternalDocumentUpload,
  registerExternalDocument,
  saveExternalOperation,
  withdrawExternalOperation,
  type ExternalAccess,
} from "@/lib/actions/hr-external-ops";
import {
  EXTERNAL_DOC_BUCKET,
  EXTERNAL_DOC_MAX_BYTES,
  EXTERNAL_DOC_MIME,
  EXTERNAL_SUBTYPES,
  NO_TRACE_NOTICE,
  externalKindLabel,
  externalSubtypeLabel,
  type ExternalKind,
  type ExternalOperation,
} from "@/lib/hr/external-operations";

type SiteOpt = { id: string; name_fr: string };
type EmployeeOpt = { id: string; label: string };

type Form = {
  supersedes: string | null;
  kind: ExternalKind;
  subtype: string;
  period_from: string;
  period_to: string;
  allSites: boolean;
  site_ids: string[];
  allEmployees: boolean;
  employee_ids: string[];
  operation_date: string;
  reference: string;
  organism: string;
  total_amount: string;
  source: "DECLARATIVE" | "DOCUMENT";
  description: string;
  correction_reason: string;
};

function storage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(EXTERNAL_DOC_BUCKET);
}

function emptyForm(year: number): Form {
  return {
    supersedes: null,
    kind: "PAYMENT",
    subtype: "SALARY",
    period_from: `${year}-01`,
    period_to: `${year}-01`,
    allSites: true,
    site_ids: [],
    allEmployees: true,
    employee_ids: [],
    operation_date: "",
    reference: "",
    organism: "",
    total_amount: "",
    source: "DECLARATIVE",
    description: "",
    correction_reason: "",
  };
}

function formFrom(op: ExternalOperation): Form {
  return {
    supersedes: op.id,
    kind: op.kind === "DECLARATION" ? "DECLARATION" : "PAYMENT",
    subtype: op.subtype,
    period_from: op.period_from.slice(0, 7),
    period_to: op.period_to.slice(0, 7),
    allSites: !op.site_ids,
    site_ids: op.site_ids ?? [],
    allEmployees: !op.employee_ids,
    employee_ids: op.employee_ids ?? [],
    operation_date: op.operation_date ?? "",
    reference: op.reference ?? "",
    organism: op.organism ?? "",
    total_amount: op.total_amount === null ? "" : String(op.total_amount),
    source: op.source === "DOCUMENT" ? "DOCUMENT" : "DECLARATIVE",
    description: op.description,
    correction_reason: "",
  };
}

function FilePick({ label, onPick }: { label: string; onPick: (f: File) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center rounded-xl border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-surface-muted">
      {label}
      <input
        type="file"
        className="hidden"
        accept={EXTERNAL_DOC_MIME.join(",")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
    </label>
  );
}

export function ExternalOperationsManager({
  operations,
  access,
  sites,
  employees,
  year,
  loadError,
}: {
  operations: ExternalOperation[];
  access: ExternalAccess;
  sites: SiteOpt[];
  employees: EmployeeOpt[];
  year: number;
  loadError?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [empQuery, setEmpQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | ExternalKind>("");

  const shown = operations.filter((o) => !kindFilter || o.kind === kindFilter);
  const empMatches = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return [];
    return employees.filter((e) => e.label.toLowerCase().includes(q)).slice(0, 30);
  }, [empQuery, employees]);
  const empLabel = (id: string) => employees.find((e) => e.id === id)?.label ?? id;

  function done(message: string) {
    setInfo(message);
    router.refresh();
  }

  function save() {
    if (!form) return;
    setError(null);
    start(async () => {
      const r = await saveExternalOperation({
        supersedes: form.supersedes,
        kind: form.kind,
        subtype: form.subtype,
        period_from: form.period_from,
        period_to: form.period_to,
        site_ids: form.allSites ? null : form.site_ids,
        employee_ids: form.allEmployees ? null : form.employee_ids,
        operation_date: form.operation_date || null,
        reference: form.reference,
        organism: form.organism,
        total_amount: form.total_amount.trim() ? Number(form.total_amount.replace(",", ".")) : null,
        source: form.source,
        description: form.description,
        correction_reason: form.correction_reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setForm(null);
      done(form.supersedes ? "Correction enregistrée : nouvelle version créée, l'ancienne est conservée." : "Opération externe enregistrée.");
    });
  }

  function confirm(op: ExternalOperation) {
    if (
      !window.confirm(
        "Confirmer l'enregistrement ?\nVous attestez que l'entrée est correctement saisie ; l'application ne vérifie pas la réalité du paiement ou de la déclaration.",
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const r = await confirmExternalOperation(op.id);
      if (!r.ok) setError(r.error);
      else done("Enregistrement confirmé.");
    });
  }

  function withdraw(op: ExternalOperation) {
    const reason = window.prompt("Motif du retrait (obligatoire, 10 caractères minimum). L'entrée reste conservée et compte toujours pour les blocages :", "");
    if (!reason?.trim()) return;
    setError(null);
    start(async () => {
      const r = await withdrawExternalOperation({ id: op.id, reason });
      if (!r.ok) setError(r.error);
      else done("Opération retirée (conservée dans le registre).");
    });
  }

  function upload(op: ExternalOperation, file: File, replaces: string | null) {
    const mime = file.type as (typeof EXTERNAL_DOC_MIME)[number];
    if (!(EXTERNAL_DOC_MIME as readonly string[]).includes(mime)) {
      setError("Pièce refusée : PDF, JPEG, PNG ou WebP uniquement.");
      return;
    }
    if (file.size > EXTERNAL_DOC_MAX_BYTES) {
      setError("Pièce trop volumineuse (15 Mo maximum).");
      return;
    }
    setError(null);
    start(async () => {
      const prepared = await prepareExternalDocumentUpload({
        operation_id: op.id,
        root_id: op.root_id,
        mime,
        size: file.size,
      });
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      const { error: upErr } = await storage().uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
        contentType: mime,
      });
      if (upErr) {
        setError(`Envoi de la pièce échoué : ${upErr.message}`);
        return;
      }
      const saved = await registerExternalDocument({
        operation_id: op.id,
        path: prepared.data.path,
        file_name: file.name,
        mime,
        replaces,
      });
      if (!saved.ok) setError(saved.error);
      else done(replaces ? "Pièce remplacée : la nouvelle pièce n'est pas examinée." : "Pièce jointe, non examinée.");
    });
  }

  function examine(docId: string) {
    const note = window.prompt(
      "Observation d'examen (obligatoire, 10 caractères minimum). L'examen n'atteste pas l'authenticité du document :",
      "",
    );
    if (!note?.trim()) return;
    setError(null);
    start(async () => {
      const r = await examineExternalDocument({ id: docId, note });
      if (!r.ok) setError(r.error);
      else done("Pièce examinée.");
    });
  }

  function view(docId: string) {
    start(async () => {
      const r = await getExternalDocumentUrl(docId);
      if (!r.ok) setError(r.error);
      else window.open(r.data.url, "_blank", "noopener");
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Opérations externes (paiements et déclarations)", "العمليات الخارجية")}
        description={
          <>
            Paiements et déclarations faits hors de l&apos;application (notamment janvier à août 2026), conservés comme donnée
            historique distincte des exports de l&apos;application. Chaque entrée, même retirée, remplacée ou non confirmée,
            maintient le blocage des virements (D9) et des déclarations (D10) de sa période. {NO_TRACE_NOTICE}
          </>
        }
        actions={
          access.enter ? (
            <Button onClick={() => setForm(emptyForm(year))} disabled={pending}>
              Nouvelle opération externe
            </Button>
          ) : null
        }
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

      <RhToolbar>
        <RhField label={bi("Année", "السنة")}>
          <input
            className={rhInput}
            type="number"
            defaultValue={year}
            onBlur={(e) => Number(e.target.value) !== year && (window.location.search = `?year=${Number(e.target.value)}`)}
          />
        </RhField>
        <RhField label="Type">
          <select className={rhInput} value={kindFilter} onChange={(e) => setKindFilter(e.target.value as "" | ExternalKind)}>
            <option value="">Tous</option>
            <option value="PAYMENT">Paiements</option>
            <option value="DECLARATION">Déclarations</option>
          </select>
        </RhField>
      </RhToolbar>

      <ExternalOperationsList
        operations={shown}
        emptyLabel={`Aucune opération externe enregistrée pour ${year}.`}
        actions={(op) =>
          op.status !== "ACTIVE" ? null : (
            <>
              {access.enter ? (
                <Button variant="ghost" disabled={pending} onClick={() => setForm(formFrom(op))}>
                  Corriger
                </Button>
              ) : null}
              {access.confirm && !op.confirmed_by ? (
                <Button variant="secondary" disabled={pending} onClick={() => confirm(op)}>
                  Confirmer l&apos;enregistrement
                </Button>
              ) : null}
              {access.enter ? <FilePick label="Joindre une pièce" onPick={(f) => upload(op, f, null)} /> : null}
              {op.documents
                .filter((d) => d.is_current)
                .map((d) => (
                  <span key={d.id} className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted/60 px-2 py-1 text-xs">
                    {d.file_name}
                    <Button variant="ghost" disabled={pending} onClick={() => view(d.id)}>
                      Voir
                    </Button>
                    {access.examine && !d.examined_by ? (
                      <Button variant="ghost" disabled={pending} onClick={() => examine(d.id)}>
                        Examiner
                      </Button>
                    ) : null}
                    {access.enter ? <FilePick label="Remplacer" onPick={(f) => upload(op, f, d.id)} /> : null}
                  </span>
                ))}
              {access.withdraw ? (
                <Button variant="ghost" disabled={pending} onClick={() => withdraw(op)}>
                  Retirer
                </Button>
              ) : null}
            </>
          )
        }
      />
      <p className="text-xs text-foreground/55">
        Séparation des tâches : la personne qui a saisi, corrigé ou joint une pièce ne peut ni confirmer l&apos;enregistrement
        ni examiner la pièce (SUPER_ADMIN excepté). Remplacer une pièce annule son examen. Les pièces restent dans un stockage
        privé et ne sont jamais transmises à un service d&apos;IA.
      </p>

      {form ? (
        <RhModal
          title={form.supersedes ? "Corriger l'opération externe (nouvelle version)" : "Nouvelle opération externe"}
          subtitle="Information déclarée : l'application n'en vérifie pas la réalité."
          onClose={() => setForm(null)}
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setForm(null)}>
                Fermer
              </Button>
              <Button disabled={pending} onClick={save}>
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="grid gap-3 p-2 sm:grid-cols-2">
            <RhField label="Type">
              <select
                className={rhInput}
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as ExternalKind;
                  setForm({ ...form, kind, subtype: EXTERNAL_SUBTYPES[kind][0] });
                }}
              >
                {(["PAYMENT", "DECLARATION"] as const).map((k) => (
                  <option key={k} value={k}>
                    {externalKindLabel(k)}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label="Sous-type">
              <select className={rhInput} value={form.subtype} onChange={(e) => setForm({ ...form, subtype: e.target.value })}>
                {EXTERNAL_SUBTYPES[form.kind].map((s) => (
                  <option key={s} value={s}>
                    {externalSubtypeLabel(s)}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label="Période : du mois">
              <input className={rhInput} type="month" value={form.period_from} onChange={(e) => setForm({ ...form, period_from: e.target.value })} />
            </RhField>
            <RhField label="au mois" hint="12 mois au plus">
              <input className={rhInput} type="month" value={form.period_to} onChange={(e) => setForm({ ...form, period_to: e.target.value })} />
            </RhField>
            <RhField label="Chantiers">
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.allSites} onChange={(e) => setForm({ ...form, allSites: e.target.checked })} />
                  Tous les chantiers
                </label>
                {!form.allSites ? (
                  <select
                    multiple
                    className={`${rhInput} h-28`}
                    value={form.site_ids}
                    onChange={(e) => setForm({ ...form, site_ids: [...e.target.selectedOptions].map((o) => o.value) })}
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name_fr}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </RhField>
            <RhField label="Salariés">
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allEmployees}
                    onChange={(e) => setForm({ ...form, allEmployees: e.target.checked })}
                  />
                  Tous les salariés
                </label>
                {!form.allEmployees ? (
                  <>
                    <input className={rhInput} placeholder="Rechercher (matricule, nom)" value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} />
                    <ul className="max-h-28 overflow-y-auto text-sm">
                      {empMatches.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() =>
                              !form.employee_ids.includes(e.id) && setForm({ ...form, employee_ids: [...form.employee_ids, e.id] })
                            }
                          >
                            + {e.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <ul className="flex flex-wrap gap-1 text-xs">
                      {form.employee_ids.map((id) => (
                        <li key={id}>
                          <button
                            type="button"
                            className="rounded-lg bg-surface-muted px-2 py-0.5"
                            onClick={() => setForm({ ...form, employee_ids: form.employee_ids.filter((x) => x !== id) })}
                          >
                            {empLabel(id)} ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </RhField>
            <RhField label="Date de l'opération" hint="Facultatif">
              <input className={rhInput} type="date" value={form.operation_date} onChange={(e) => setForm({ ...form, operation_date: e.target.value })} />
            </RhField>
            <RhField label="Référence" hint="Facultatif (bordereau, accusé…)">
              <input className={rhInput} value={form.reference} maxLength={120} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </RhField>
            <RhField label="Organisme" hint="Facultatif (banque, CCP, CNAS, impôts…)">
              <input className={rhInput} value={form.organism} maxLength={120} onChange={(e) => setForm({ ...form, organism: e.target.value })} />
            </RhField>
            <RhField label="Montant (DA)" hint="Facultatif">
              <input className={rhInput} inputMode="decimal" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
            </RhField>
            <RhField label="Origine de l'information">
              <select
                className={rhInput}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as Form["source"] })}
              >
                <option value="DECLARATIVE">Déclaratif (sans pièce)</option>
                <option value="DOCUMENT">Sur pièce (à joindre ensuite)</option>
              </select>
            </RhField>
            <div className="sm:col-span-2">
              <RhField label="Description" hint="10 à 1000 caractères">
                <textarea
                  className={`${rhInput} min-h-20`}
                  value={form.description}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </RhField>
            </div>
            {form.supersedes ? (
              <div className="sm:col-span-2">
                <RhField label="Motif de la correction" hint="Obligatoire, 10 à 500 caractères">
                  <input
                    className={rhInput}
                    value={form.correction_reason}
                    maxLength={500}
                    onChange={(e) => setForm({ ...form, correction_reason: e.target.value })}
                  />
                </RhField>
                <p className="mt-1 text-xs text-foreground/60">
                  La correction crée une nouvelle version ; l&apos;ancienne reste au registre. Les pièces actuelles sont
                  reprises sans leur examen, la confirmation de l&apos;enregistrement est à refaire.
                </p>
              </div>
            ) : null}
          </div>
        </RhModal>
      ) : null}
    </div>
  );
}

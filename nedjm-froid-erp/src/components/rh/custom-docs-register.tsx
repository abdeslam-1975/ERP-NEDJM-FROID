"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ExternalLink, FileStack, Loader2, Plus, Printer } from "lucide-react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import {
  cancelIssuedCustomDoc,
  issueCustomDoc,
  listCustomSourceRecords,
  previewCustomDoc,
  type CustomDocRow,
  type CustomSourceOption,
  type IssuedCustomDoc,
} from "@/lib/actions/hr-custom-docs";
import { CUSTOM_DOC_FAMILIES, CUSTOM_DOC_SOURCES, type CustomDocDef } from "@/lib/doc/custom-docs";
import { pageWidthPx } from "@/lib/doc/page-setup";
import { DocFrame } from "@/components/sim/doc-frame";
import { printHtml } from "@/components/rh/print-frame";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { RhAlert, RhChip, RhField, RhModal, RhPanel, rhInput } from "@/components/rh/rh-ui";

const col = dataColumns<IssuedCustomDoc>();
const RECORD_LABEL: Record<CustomDocDef["source"], string> = {
  employee: "",
  contract: "Contrat",
  leave: "Congé",
  mission: "Ordre de mission",
  exit: "Sortie",
  free: "",
};

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

function initialInputs(def: CustomDocDef | undefined) {
  return Object.fromEntries(
    (def?.inputs ?? []).map((i) => [i.key, i.type === "bool" ? (i.default_value === "true" ? "true" : "false") : (i.default_value ?? "")]),
  );
}

function IssueDialog({
  defs,
  employees,
  catalogs,
  onClose,
  onIssued,
}: {
  defs: CustomDocRow[];
  employees: HrEmployeeRow[];
  catalogs: CatalogItem[];
  onClose: () => void;
  onIssued: (message: string) => void;
}) {
  const [defId, setDefId] = useState(defs[0]?.id ?? "");
  const def = defs.find((d) => d.id === defId);
  const [employeeId, setEmployeeId] = useState("");
  const [records, setRecords] = useState<CustomSourceOption[] | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>(() => initialInputs(defs[0]));
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pending, start] = useTransition();
  const needsEmployee = def ? def.source !== "free" : false;
  const needsRecord = def ? Boolean(RECORD_LABEL[def.source]) : false;
  const sortedEmployees = useMemo(
    () => employees.slice().sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr")),
    [employees],
  );

  function pickDef(id: string) {
    setDefId(id);
    setSourceId("");
    setRecords(null);
    setInputs(initialInputs(defs.find((d) => d.id === id)));
  }

  useEffect(() => {
    if (!def || !needsRecord || !employeeId) return;
    let alive = true;
    listCustomSourceRecords(def.id, employeeId).then((r) => {
      if (!alive) return;
      const list = r.ok ? r.data : [];
      setRecords(list);
      setSourceId((current) => (list.some((o) => o.id === current) ? current : (list[0]?.id ?? "")));
      if (!r.ok) setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [def, needsRecord, employeeId]);

  const ready = Boolean(def) && (!needsEmployee || Boolean(employeeId)) && (!needsRecord || Boolean(sourceId));
  const selection = useMemo(
    () => ({ defId, employeeId: employeeId || null, sourceId: sourceId || null, inputs }),
    [defId, employeeId, sourceId, inputs],
  );

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoadingPreview(true);
      previewCustomDoc(selection).then((r) => {
        if (!alive) return;
        setLoadingPreview(false);
        if (r.ok) {
          setPreview(r.data);
          setPreviewError(null);
        } else setPreviewError(r.error);
      });
    }, 450);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [ready, selection]);

  function listOptions(kind: string) {
    return catalogs.filter((c) => c.kind === kind && c.is_active !== false);
  }

  function issue() {
    if (!ready) return setError(needsEmployee && !employeeId ? "Choisissez l'employé." : `Choisissez : ${RECORD_LABEL[def?.source ?? "free"]}.`);
    setError(null);
    start(async () => {
      const r = await issueCustomDoc(selection);
      if (!r.ok) return setError(r.error);
      printHtml(r.data.html, "hr-custom-doc-print-frame");
      const name = def?.name_fr ?? "Document";
      onIssued(
        [`« ${name} »${r.data.reference ? ` ${r.data.reference}` : ""} imprimé et enregistré.`, r.data.warning].filter(Boolean).join(" "),
      );
    });
  }

  const families = CUSTOM_DOC_FAMILIES.map((f) => ({ ...f, items: defs.filter((d) => d.family === f.id) })).filter((f) => f.items.length);

  return (
    <RhModal
      title="Nouveau document"
      subtitle={def ? `${def.name_fr}${def.name_ar ? ` · ${def.name_ar}` : ""}` : undefined}
      size="xl"
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !ready} onClick={issue}>
            <Printer aria-hidden />
            {pending ? "Enregistrement…" : "Imprimer et archiver"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
          <RhField label="Document" required>
            <select className={rhInput} value={defId} onChange={(e) => pickDef(e.target.value)}>
              {families.map((f) => (
                <optgroup key={f.id} label={f.fr}>
                  {f.items.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name_fr}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </RhField>
          {def ? (
            <p className="text-xs text-foreground/55">
              Données : {CUSTOM_DOC_SOURCES.find((s) => s.id === def.source)?.hint}
            </p>
          ) : null}
          {needsEmployee ? (
            <RhField label="Employé" required>
              <select
                className={rhInput}
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setRecords(null);
                  setSourceId("");
                }}
              >
                <option value="">Choisir un employé…</option>
                {sortedEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.matricule} · {e.last_name} {e.first_name}
                  </option>
                ))}
              </select>
            </RhField>
          ) : null}
          {needsRecord && employeeId ? (
            <RhField label={RECORD_LABEL[def!.source]} required>
              {records === null ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-foreground/55">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement…
                </p>
              ) : records.length ? (
                <select className={rhInput} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                      {r.sub ? ` — ${r.sub}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-2 text-sm text-alert-critical">Aucun enregistrement pour cet employé.</p>
              )}
            </RhField>
          ) : null}
          {def?.inputs.length ? (
            <div className="space-y-3 border-t border-border/60 pt-3">
              <p className="text-[13px] font-semibold text-foreground/85">À compléter</p>
              {def.inputs.map((i) => {
                const value = inputs[i.key] ?? "";
                const set = (v: string) => setInputs((prev) => ({ ...prev, [i.key]: v }));
                const labelText = i.label_ar ? `${i.label_fr} · ${i.label_ar}` : i.label_fr;
                if (i.type === "bool") {
                  return (
                    <label key={i.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={value === "true"} onChange={(e) => set(e.target.checked ? "true" : "false")} />
                      {labelText}
                    </label>
                  );
                }
                return (
                  <RhField key={i.key} label={labelText} required={i.required}>
                    {i.type === "textarea" ? (
                      <textarea className={`${rhInput} h-28 py-2`} value={value} maxLength={4000} onChange={(e) => set(e.target.value)} />
                    ) : i.type === "list" ? (
                      <select className={rhInput} value={value} onChange={(e) => set(e.target.value)}>
                        <option value="">—</option>
                        {listOptions(i.list_kind).map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label_fr}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={rhInput}
                        type={i.type === "date" ? "date" : i.type === "number" || i.type === "amount" ? "number" : "text"}
                        step={i.type === "amount" ? "0.01" : undefined}
                        value={value}
                        maxLength={4000}
                        onChange={(e) => set(e.target.value)}
                      />
                    )}
                  </RhField>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex min-h-[38rem] flex-col">
          <p className="mb-1.5 flex items-center gap-2 text-xs text-foreground/55">
            Aperçu — la référence est attribuée à l’impression.
            {loadingPreview ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          </p>
          {previewError ? <RhAlert tone="warning">{previewError}</RhAlert> : null}
          {ready && preview ? (
            <DocFrame html={preview} pageWidth={def ? pageWidthPx(def.page) : 794} title="Aperçu du document" />
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/70 text-sm text-foreground/50">
              {needsEmployee && !employeeId ? "Choisissez l'employé pour voir l'aperçu." : "Aperçu en préparation…"}
            </div>
          )}
        </div>
      </div>
    </RhModal>
  );
}

export function CustomDocsRegister({
  defs,
  issued,
  employees,
  catalogs,
  error,
}: {
  /** Active documents with an approved template. */
  defs: CustomDocRow[];
  issued: IssuedCustomDoc[];
  employees: HrEmployeeRow[];
  catalogs: CatalogItem[];
  error?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function cancel(row: IssuedCustomDoc) {
    if (!window.confirm(`Annuler « ${row.doc_name} » ${row.reference ?? ""} ? La référence ne sera pas réutilisée.`)) return;
    setProblem(null);
    start(async () => {
      const r = await cancelIssuedCustomDoc(row.id);
      if (!r.ok) return setProblem(r.error);
      setInfo("Document annulé.");
      router.refresh();
    });
  }

  const columns = [
    col.accessor((r) => r.reference ?? "", {
      id: "reference",
      header: "Référence",
      cell: ({ row: { original: r } }) => (
        <div className="whitespace-nowrap">
          <div className="font-mono text-[13px] font-semibold tracking-tight text-brand">{r.reference || "—"}</div>
          <div className="mt-0.5 text-xs text-foreground/45">{dateTime(r.created_at)}</div>
        </div>
      ),
    }),
    col.accessor("doc_name", { header: "Document" }),
    col.accessor((r) => r.employee_name, {
      id: "employee",
      header: "Employé",
      cell: ({ row: { original: r } }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.employee_name || "—"}</div>
          {r.matricule ? <div className="font-mono text-xs text-foreground/45">{r.matricule}</div> : null}
        </div>
      ),
    }),
    col.accessor("created_by_name", { header: "Établi par" }),
    col.accessor("status", {
      header: "Statut",
      cell: (info) =>
        info.getValue() === "CANCELLED" ? <RhChip tone="danger">Annulé</RhChip> : <RhChip tone="success">Émis</RhChip>,
    }),
    col.display({
      id: "actions",
      header: "",
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end gap-1">
          {r.archive_url ? (
            <Button asChild variant="ghost" size="icon" className="size-8" title="Ouvrir l'archive PDF">
              <a href={r.archive_url} target="_blank" rel="noreferrer" aria-label="Ouvrir l'archive PDF">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
          {r.status === "ISSUED" ? (
            <Button variant="ghost" size="icon" className="size-8" title="Annuler" aria-label="Annuler" disabled={pending} onClick={() => cancel(r)}>
              <Ban className="size-4" />
            </Button>
          ) : null}
        </div>
      ),
    }),
  ];

  return (
    <RhPanel padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#8b5cf617", color: "#8b5cf6" }}>
            <FileStack className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold tracking-tight text-foreground">Autres documents</h3>
            <p className="text-sm text-foreground/55">Documents créés dans Paramètres RH › Documents : numérotés, imprimés et archivés en PDF.</p>
          </div>
        </div>
        <Button disabled={!defs.length} onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          Nouveau document
        </Button>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        {problem ? <RhAlert tone="danger">{problem}</RhAlert> : null}
        {info ? <RhAlert tone="success">{info}</RhAlert> : null}
        {!defs.length && !error ? (
          <RhAlert tone="info">
            Aucun document prêt à imprimer. Créez-en un et approuvez son modèle dans{" "}
            <Link href="/rh/parametres?tab=documents" className="font-semibold underline">
              Paramètres RH › Documents
            </Link>
            .
          </RhAlert>
        ) : null}
        <DataTable
          data={issued}
          columns={columns}
          getRowId={(r) => r.id}
          searchPlaceholder="Référence, document, matricule, nom…"
          searchText={(r) => [r.reference, r.doc_name, r.matricule, r.employee_name, r.created_by_name].filter(Boolean).join(" ")}
          emptyTitle="Aucun document émis"
          emptyBody="Les documents imprimés avec « Nouveau document » apparaissent ici."
        />
      </div>
      {open ? (
        <IssueDialog
          defs={defs}
          employees={employees}
          catalogs={catalogs}
          onClose={() => setOpen(false)}
          onIssued={(message) => {
            setOpen(false);
            setInfo(message);
            router.refresh();
          }}
        />
      ) : null}
    </RhPanel>
  );
}

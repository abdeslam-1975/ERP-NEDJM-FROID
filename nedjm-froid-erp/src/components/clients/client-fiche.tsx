"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SortableStrip } from "@/components/layout/arrange";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { useUiTabs } from "@/components/layout/ui-layout-context";
import {
  upsertClient,
  type ClientContractLink,
  type ClientRow,
} from "@/lib/actions/clients";
import { WILAYAS, communesOf } from "@/lib/referentiels/wilayas";

type Tab = "identite" | "contrats" | "penalites" | "correspondances";
const CLIENT_TABS: { id: Tab; label: string }[] = [
  { id: "identite", label: "Identité" },
  { id: "contrats", label: "Contrats" },
  { id: "penalites", label: "Pénalités" },
  { id: "correspondances", label: "Correspondances" },
];

type Draft = {
  code_client: string;
  nom_fr: string;
  nom_ar: string;
  code_activite: string;
  nif: string;
  nis: string;
  rc: string;
  article_imposition: string;
  adresse: string;
  wilaya: string;
  commune: string;
  telephone: string;
  email: string;
  site_web: string;
  banque_nom: string;
  banque_compte: string;
  banque_rib: string;
  responsable_nom: string;
  responsable_telephone: string;
  responsable_email: string;
};

const emptyDraft = (): Draft => ({
  code_client: "",
  nom_fr: "",
  nom_ar: "",
  code_activite: "",
  nif: "",
  nis: "",
  rc: "",
  article_imposition: "",
  adresse: "",
  wilaya: "",
  commune: "",
  telephone: "",
  email: "",
  site_web: "",
  banque_nom: "",
  banque_compte: "",
  banque_rib: "",
  responsable_nom: "",
  responsable_telephone: "",
  responsable_email: "",
});

function fromClient(client: ClientRow): Draft {
  return {
    code_client: client.code_client ?? "",
    nom_fr: client.nom_fr,
    nom_ar: client.nom_ar ?? "",
    code_activite: client.code_activite ?? "",
    nif: client.nif ?? "",
    nis: client.nis ?? "",
    rc: client.rc ?? "",
    article_imposition: client.article_imposition ?? "",
    adresse: client.adresse ?? "",
    wilaya: client.wilaya ?? "",
    commune: client.commune ?? "",
    telephone: client.telephone ?? "",
    email: client.email ?? "",
    site_web: client.site_web ?? "",
    banque_nom: client.banque_nom ?? "",
    banque_compte: client.banque_compte ?? "",
    banque_rib: client.banque_rib ?? "",
    responsable_nom: client.responsable_nom ?? "",
    responsable_telephone: client.responsable_telephone ?? "",
    responsable_email: client.responsable_email ?? "",
  };
}

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

const col = dataColumns<ClientContractLink>();

const contractColumns = [
  col.accessor("contract_number", {
    header: "N°",
    cell: (info) => (
      <Link href={`/referentiels/contrats/${info.row.original.id}`} className="font-semibold text-brand hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  col.accessor((contract) => contract.site_name ?? "", {
    id: "site",
    header: "Site",
    cell: (info) => info.getValue() || "—",
  }),
  col.accessor("status", { header: "Statut" }),
  col.accessor((contract) => contract.ods_date ?? "", {
    id: "ods",
    header: "ODS",
    cell: (info) => info.getValue() || "—",
  }),
];

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function ClientFiche({
  client,
  contracts,
  canWrite,
}: {
  client: ClientRow | null;
  contracts: ClientContractLink[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("identite");
  const tabs = useUiTabs("client_fiche", CLIENT_TABS, tab, setTab);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(client ? fromClient(client) : emptyDraft());
  const [baseline] = useState(() => JSON.stringify(client ? fromClient(client) : emptyDraft()));
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function cancel() {
    if (dirty && !window.confirm("Des modifications ne sont pas enregistrées. Quitter la fiche ?")) {
      return;
    }
    router.push("/referentiels/clients");
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await upsertClient({
        id: client?.id,
        ...draft,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/referentiels/clients");
      router.refresh();
    });
  }

  function onFile(selected: File | undefined) {
    setFileError(null);
    if (!selected) return;
    const ext = selected.name.split(".").pop()?.toLowerCase() ?? "";
    const okExt = ["pdf", "jpg", "jpeg", "png"].includes(ext);
    if (!okExt || (selected.type && !ACCEPTED.includes(selected.type))) {
      setFileError("Formats acceptés : PDF, JPG, JPEG, PNG.");
      return;
    }
    if (selected.size > MAX_BYTES) {
      setFileError("Fichier trop volumineux (10 Mo maximum).");
      return;
    }
    setFile({ name: selected.name, size: selected.size });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/referentiels/clients"
            className="text-sm font-medium text-brand hover:underline"
          >
            ← Clients
          </Link>
          <h2 className="mt-2 font-display text-2xl font-semibold">
            {client ? client.nom_fr : "Nouveau client"}
          </h2>
          <p className="mt-1 text-sm text-foreground/70">
            Fiche de référence. Les contrats pointent vers ce client.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={cancel} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={save} disabled={pending || !canWrite}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-4 py-3 text-sm text-alert-critical"
        >
          {error}
        </div>
      ) : null}

      <section className="rounded-lg border border-dashed border-border bg-surface px-4 py-4">
        <p className="text-sm font-medium">Import du document client</p>
        <p className="mt-1 text-sm text-foreground/70">
          L&apos;extraction automatique des données client sera disponible ultérieurement.
        </p>
        <p className="text-sm text-foreground/70" dir="rtl">
          الاستخراج الآلي لبيانات العميل سيكون متاحًا لاحقًا
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {file ? (
            <span className="text-sm">
              {file.name} · {fileSize(file.size)}
              <button
                type="button"
                className="ms-2 font-semibold text-brand hover:underline"
                onClick={() => setFile(null)}
              >
                Retirer
              </button>
            </span>
          ) : null}
        </div>
        {fileError ? (
          <p className="mt-2 text-sm text-alert-critical">{fileError}</p>
        ) : null}
      </section>

      <SortableStrip tabset="client_fiche" ids={tabs.map((t) => t.id)} className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </TabButton>
        ))}
      </SortableStrip>

      {tab === "identite" ? (
        <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
          <Field label="Code">
            <input className={inputClass} value={draft.code_client} onChange={(e) => set("code_client", e.target.value)} />
          </Field>
          <Field label="Nom français *">
            <input className={inputClass} value={draft.nom_fr} onChange={(e) => set("nom_fr", e.target.value)} />
          </Field>
          <Field label="Nom arabe">
            <input
              className={inputClass}
              dir="rtl"
              value={draft.nom_ar}
              onChange={(e) => set("nom_ar", e.target.value)}
            />
          </Field>
          <Field label="Code activité">
            <input className={inputClass} value={draft.code_activite} onChange={(e) => set("code_activite", e.target.value)} />
          </Field>
          <Field label="NIF">
            <input className={inputClass} inputMode="numeric" value={draft.nif} onChange={(e) => set("nif", e.target.value)} />
          </Field>
          <Field label="NIS">
            <input className={inputClass} inputMode="numeric" value={draft.nis} onChange={(e) => set("nis", e.target.value)} />
          </Field>
          <Field label="RC">
            <input className={inputClass} value={draft.rc} onChange={(e) => set("rc", e.target.value)} />
          </Field>
          <Field label="Article d'imposition">
            <input className={inputClass} value={draft.article_imposition} onChange={(e) => set("article_imposition", e.target.value)} />
          </Field>
          <Field label="Wilaya">
            <select
              className={inputClass}
              value={draft.wilaya}
              onChange={(e) => {
                const wilaya = e.target.value;
                setDraft((current) => ({
                  ...current,
                  wilaya,
                  commune: communesOf(wilaya).includes(current.commune)
                    ? current.commune
                    : "",
                }));
              }}
            >
              <option value="">—</option>
              {draft.wilaya && !WILAYAS.some((item) => item.name === draft.wilaya) ? (
                <option value={draft.wilaya}>{draft.wilaya}</option>
              ) : null}
              {WILAYAS.map((wilaya) => (
                <option key={wilaya.code} value={wilaya.name}>
                  {wilaya.code} — {wilaya.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Commune">
            <select
              className={inputClass}
              value={draft.commune}
              disabled={!draft.wilaya}
              onChange={(e) => set("commune", e.target.value)}
            >
              <option value="">
                {draft.wilaya ? "—" : "Choisissez d'abord la wilaya"}
              </option>
              {communesOf(draft.wilaya).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Adresse" wide>
            <input className={inputClass} value={draft.adresse} onChange={(e) => set("adresse", e.target.value)} />
          </Field>
          <Field label="Téléphone">
            <input className={inputClass} value={draft.telephone} onChange={(e) => set("telephone", e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className={inputClass} value={draft.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Site web">
            <input className={inputClass} value={draft.site_web} onChange={(e) => set("site_web", e.target.value)} />
          </Field>
          <Field label="Banque">
            <input className={inputClass} value={draft.banque_nom} onChange={(e) => set("banque_nom", e.target.value)} />
          </Field>
          <Field label="N° de compte">
            <input className={inputClass} value={draft.banque_compte} onChange={(e) => set("banque_compte", e.target.value)} />
          </Field>
          <Field label="RIB">
            <input className={inputClass} inputMode="numeric" value={draft.banque_rib} onChange={(e) => set("banque_rib", e.target.value)} />
          </Field>
          <Field label="Responsable">
            <input className={inputClass} value={draft.responsable_nom} onChange={(e) => set("responsable_nom", e.target.value)} />
          </Field>
          <Field label="Tél. responsable">
            <input className={inputClass} value={draft.responsable_telephone} onChange={(e) => set("responsable_telephone", e.target.value)} />
          </Field>
          <Field label="E-mail responsable">
            <input className={inputClass} value={draft.responsable_email} onChange={(e) => set("responsable_email", e.target.value)} />
          </Field>
        </div>
      ) : null}

      {tab === "contrats" ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground/70">
              L&apos;ordre de service (ODS) est la date portée sur le contrat.
            </p>
            {client ? (
              <Link
                href={`/referentiels/contrats?client=${client.id}`}
                className="text-sm font-semibold text-brand hover:underline"
              >
                Ouvrir les contrats
              </Link>
            ) : (
              <span className="text-sm text-foreground/55">
                Enregistrez le client pour lui rattacher un contrat.
              </span>
            )}
          </div>
          <DataTable
            className="mt-4"
            data={contracts}
            columns={contractColumns}
            getRowId={(contract) => contract.id}
            searchable={false}
            columnToggle={false}
            pageSize={0}
            emptyTitle="Aucun contrat lié."
          />
        </section>
      ) : null}

      {tab === "penalites" ? <Soon label="Pénalités" /> : null}
      {tab === "correspondances" ? <Soon label="Correspondances" /> : null}
    </div>
  );
}

function Soon({ label }: { label: string }) {
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-sm text-foreground/70">Bientôt disponible. · قريبًا</p>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        active ? "bg-brand text-white" : "border border-border bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm font-medium ${wide ? "md:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-60";

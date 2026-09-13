"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  deleteContractItem,
  importFullCanva,
  replaceContractAttributes,
  upsertContract,
  upsertContractItem,
  type ContractDetail,
  type ContractItem,
} from "@/lib/actions/contracts";
import type {
  ContreLine,
  ContractAttributes,
  PenaltyRule,
} from "@/lib/contracts/attributes-schema";
import { parseFullCanvaFile } from "@/lib/contracts/canva-excel";
import {
  cautionFromRate,
  contractDurationDays,
  sumItemsHt,
} from "@/lib/contracts/financial";
import { AlertBadge } from "@/components/castle/alert-badge";
import { Button } from "@/components/ui/button";

type Tab =
  | "header"
  | "contre"
  | "labor"
  | "spares"
  | "penalties"
  | "margin"
  | "rh"
  | "canva";

type SiteOpt = { id: string; code: string; name_fr: string };

const STATUS_OPTIONS = [
  { value: "BROUILLON", label: "Brouillon" },
  { value: "VALIDE", label: "Validé" },
  { value: "EN_COURS", label: "En cours" },
  { value: "CLOTURE", label: "Clôturé" },
  { value: "ANNULE", label: "Annulé" },
] as const;

const PAGE_SIZE = 40;

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    maximumFractionDigits: 2,
  }).format(n);
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ContractWorkspace({
  contract,
  sites,
}: {
  contract: ContractDetail;
  sites: SiteOpt[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("header");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [attrs, setAttrs] = useState<ContractAttributes>(contract.attributes);

  const labor = useMemo(
    () => contract.items.filter((i) => i.item_type === "LABOR"),
    [contract.items],
  );
  const spares = useMemo(
    () => contract.items.filter((i) => i.item_type === "SPARE_PART"),
    [contract.items],
  );
  const laborHt = sumItemsHt(labor);
  const spareHt = sumItemsHt(spares);
  const duration = contractDurationDays(contract.start_date, contract.end_date);

  const tabs: { id: Tab; label: string }[] = [
    { id: "header", label: "En-tête & financier" },
    { id: "contre", label: "Contre-facturation" },
    { id: "labor", label: `Main-d'œuvre (${labor.length})` },
    { id: "spares", label: `Pièces (${spares.length})` },
    { id: "penalties", label: "Pénalités" },
    { id: "margin", label: "Gardes de marge" },
    { id: "rh", label: "RH / AN" },
    { id: "canva", label: "Canva Excel" },
  ];

  function run(fn: () => Promise<void>) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  function saveAttributes(next: ContractAttributes, message?: string) {
    setAttrs(next);
    run(async () => {
      const result = await replaceContractAttributes({
        contract_id: contract.id,
        attributes: next,
      });
      if (!result.ok) throw new Error(result.error);
      setInfo(message ?? "Configuration enregistrée.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/referentiels/contrats"
            className="text-sm font-medium text-brand hover:underline"
          >
            ← Contrats
          </Link>
          <h2 className="mt-2 font-display text-2xl font-semibold">
            {contract.contract_number}
          </h2>
          <p className="text-foreground/70">{contract.client_name}</p>
          <p className="mt-1 text-xs text-foreground/55">
            Durée {duration} j · HT {money(contract.total_amount_ht)} · Caution{" "}
            {money(contract.caution_amount)} · Mode{" "}
            {attrs.financial.total_mode} / caution{" "}
            {attrs.financial.caution_sync}
          </p>
        </div>
        <AlertBadge label={contract.status} tone="info" />
      </div>

      {(error || info) && (
        <div
          role="alert"
          className={`rounded-md border px-4 py-3 text-sm ${
            error
              ? "border-alert-critical/40 bg-alert-critical/10 text-alert-critical"
              : "border-alert-success/40 bg-alert-success/10 text-alert-success"
          }`}
        >
          {error || info}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setError(null);
              setInfo(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === t.id
                ? "bg-brand text-white"
                : "bg-surface-muted text-foreground hover:bg-brand-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "header" && (
        <HeaderTab
          contract={contract}
          sites={sites}
          attrs={attrs}
          laborHt={laborHt}
          spareHt={spareHt}
          duration={duration}
          pending={pending}
          onSave={(payload) =>
            run(async () => {
              const result = await upsertContract(payload);
              if (!result.ok) throw new Error(result.error);
              setInfo("En-tête enregistré (HT & caution recalculés si AUTO).");
            })
          }
        />
      )}

      {tab === "contre" && (
        <ContreTab
          lines={attrs.contre_facturation.lines}
          pending={pending}
          onChange={(lines) =>
            saveAttributes(
              { ...attrs, contre_facturation: { lines } },
              "Contre-facturation enregistrée.",
            )
          }
        />
      )}

      {tab === "labor" && (
        <ItemsTab
          contractId={contract.id}
          itemType="LABOR"
          items={labor}
          pending={pending}
          onUpsert={(row) =>
            run(async () => {
              const result = await upsertContractItem(row);
              if (!result.ok) throw new Error(result.error);
              setInfo("Ligne main-d'œuvre enregistrée.");
            })
          }
          onDelete={(id) =>
            run(async () => {
              const result = await deleteContractItem({
                id,
                contract_id: contract.id,
              });
              if (!result.ok) throw new Error(result.error);
              setInfo("Ligne supprimée.");
            })
          }
        />
      )}

      {tab === "spares" && (
        <ItemsTab
          contractId={contract.id}
          itemType="SPARE_PART"
          items={spares}
          pending={pending}
          searchable
          onUpsert={(row) =>
            run(async () => {
              const result = await upsertContractItem(row);
              if (!result.ok) throw new Error(result.error);
              setInfo("Pièce enregistrée.");
            })
          }
          onDelete={(id) =>
            run(async () => {
              const result = await deleteContractItem({
                id,
                contract_id: contract.id,
              });
              if (!result.ok) throw new Error(result.error);
              setInfo("Pièce supprimée.");
            })
          }
        />
      )}

      {tab === "penalties" && (
        <PenaltiesTab
          attrs={attrs}
          pending={pending}
          onSave={(next) =>
            saveAttributes(next, "Pénalités enregistrées.")
          }
        />
      )}

      {tab === "margin" && (
        <MarginTab
          guards={attrs.margin_guards}
          pending={pending}
          onSave={(margin_guards) =>
            saveAttributes(
              { ...attrs, margin_guards },
              "Gardes de marge enregistrées.",
            )
          }
        />
      )}

      {tab === "rh" && (
        <RhAnTab
          rh={attrs.rh_an_workflow}
          pending={pending}
          onSave={(rh_an_workflow) =>
            saveAttributes(
              { ...attrs, rh_an_workflow },
              "Paramètres RH / AN enregistrés.",
            )
          }
        />
      )}

      {tab === "canva" && (
        <CanvaTab
          contractId={contract.id}
          pending={pending}
          onImport={(file) =>
            run(async () => {
              const parsed = await parseFullCanvaFile(file);
              const result = await importFullCanva({
                contract_id: contract.id,
                labor: parsed.labor,
                spares: parsed.spares,
              });
              if (!result.ok) throw new Error(result.error);
              setInfo(
                `Canva importé (REPLACE) : ${result.data.labor} MO · ${result.data.spares} pièces. HT/caution recalculés.`,
              );
            })
          }
        />
      )}
    </div>
  );
}

function HeaderTab({
  contract,
  sites,
  attrs,
  laborHt,
  spareHt,
  duration,
  pending,
  onSave,
}: {
  contract: ContractDetail;
  sites: SiteOpt[];
  attrs: ContractAttributes;
  laborHt: number;
  spareHt: number;
  duration: number;
  pending: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    contract_number: contract.contract_number,
    client_name: contract.client_name,
    site_id: contract.site_id,
    start_date: contract.start_date,
    end_date: contract.end_date,
    ods_date: contract.ods_date ?? "",
    status: contract.status,
    total_mode: attrs.financial.total_mode,
    caution_sync: attrs.financial.caution_sync,
    total_amount_ht: String(contract.total_amount_ht),
    caution_rate_pct: String(contract.caution_rate * 100),
    caution_amount: String(contract.caution_amount),
    tva_exempt: attrs.financial.tva_exempt,
    tva_articles: attrs.financial.tva_articles.join(","),
    tva_standard_rate_pct: String(attrs.financial.tva_standard_rate * 100),
  });

  const autoPreview = laborHt + spareHt;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Durée (j)" value={String(duration)} />
        <Stat label="Σ Main-d'œuvre" value={money(laborHt)} />
        <Stat label="Σ Pièces" value={money(spareHt)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="N° contrat">
          <input
            className={inputClass}
            value={form.contract_number}
            onChange={(e) =>
              setForm((f) => ({ ...f, contract_number: e.target.value }))
            }
          />
        </Field>
        <Field label="Client">
          <input
            className={inputClass}
            value={form.client_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, client_name: e.target.value }))
            }
          />
        </Field>
        <Field label="Site">
          <select
            className={inputClass}
            value={form.site_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, site_id: e.target.value }))
            }
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name_fr}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Statut">
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date début">
          <input
            type="date"
            className={inputClass}
            value={form.start_date}
            onChange={(e) =>
              setForm((f) => ({ ...f, start_date: e.target.value }))
            }
          />
        </Field>
        <Field label="Date fin">
          <input
            type="date"
            className={inputClass}
            value={form.end_date}
            onChange={(e) =>
              setForm((f) => ({ ...f, end_date: e.target.value }))
            }
          />
        </Field>
        <Field label="Date ODS">
          <input
            type="date"
            className={inputClass}
            value={form.ods_date}
            onChange={(e) =>
              setForm((f) => ({ ...f, ods_date: e.target.value }))
            }
          />
        </Field>
        <Field label="Mode total HT">
          <select
            className={inputClass}
            value={form.total_mode}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                total_mode: e.target.value as "AUTO" | "MANUAL",
              }))
            }
          >
            <option value="AUTO">AUTO — somme labor + pièces</option>
            <option value="MANUAL">MANUAL — saisie libre</option>
          </select>
        </Field>
        <Field
          label={
            form.total_mode === "AUTO"
              ? `Montant HT (AUTO ≈ ${money(autoPreview)})`
              : "Montant HT (MANUAL)"
          }
        >
          <input
            type="number"
            step="0.01"
            className={inputClass}
            disabled={form.total_mode === "AUTO"}
            value={
              form.total_mode === "AUTO"
                ? String(autoPreview)
                : form.total_amount_ht
            }
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => {
                const next = { ...f, total_amount_ht: v };
                if (f.caution_sync === "FROM_RATE") {
                  next.caution_amount = String(
                    cautionFromRate(Number(v), Number(f.caution_rate_pct) / 100),
                  );
                }
                return next;
              });
            }}
          />
        </Field>
        <Field label="Sync caution">
          <select
            className={inputClass}
            value={form.caution_sync}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                caution_sync: e.target
                  .value as ContractAttributes["financial"]["caution_sync"],
              }))
            }
          >
            <option value="FROM_RATE">FROM_RATE — % → DA</option>
            <option value="FROM_AMOUNT">FROM_AMOUNT — DA → %</option>
            <option value="MANUAL">MANUAL</option>
          </select>
        </Field>
        <Field label="Caution (%)">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.caution_rate_pct}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => {
                const total =
                  f.total_mode === "AUTO" ? autoPreview : Number(f.total_amount_ht);
                return {
                  ...f,
                  caution_rate_pct: v,
                  caution_amount:
                    f.caution_sync === "FROM_RATE"
                      ? String(cautionFromRate(total, Number(v) / 100))
                      : f.caution_amount,
                };
              });
            }}
          />
        </Field>
        <Field label="Caution (DA)">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.caution_amount}
            onChange={(e) =>
              setForm((f) => ({ ...f, caution_amount: e.target.value }))
            }
          />
        </Field>
        <Field label="Articles TVA">
          <input
            className={inputClass}
            value={form.tva_articles}
            onChange={(e) =>
              setForm((f) => ({ ...f, tva_articles: e.target.value }))
            }
          />
        </Field>
        <Field label="TVA standard (%)">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.tva_standard_rate_pct}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                tva_standard_rate_pct: e.target.value,
              }))
            }
          />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.tva_exempt}
            onChange={(e) =>
              setForm((f) => ({ ...f, tva_exempt: e.target.checked }))
            }
          />
          Exonération TVA
        </label>
      </div>
      <Button
        disabled={pending}
        onClick={() =>
          onSave({
            id: contract.id,
            contract_number: form.contract_number,
            client_name: form.client_name,
            site_id: form.site_id,
            start_date: form.start_date,
            end_date: form.end_date,
            ods_date: form.ods_date || null,
            status: form.status,
            total_mode: form.total_mode,
            caution_sync: form.caution_sync,
            total_amount_ht:
              form.total_mode === "AUTO"
                ? autoPreview
                : Number(form.total_amount_ht),
            caution_rate: Number(form.caution_rate_pct) / 100,
            caution_amount: Number(form.caution_amount),
            tva_exempt: form.tva_exempt,
            tva_articles: form.tva_articles,
            tva_standard_rate: Number(form.tva_standard_rate_pct) / 100,
          })
        }
      >
        {pending ? "Enregistrement…" : "Enregistrer l'en-tête"}
      </Button>
    </section>
  );
}

function ContreTab({
  lines,
  pending,
  onChange,
}: {
  lines: ContreLine[];
  pending: boolean;
  onChange: (lines: ContreLine[]) => void;
}) {
  const [draft, setDraft] = useState(lines);
  const [newLine, setNewLine] = useState({
    code: "",
    label: "",
    unit: "DA",
    rate: "0",
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Lignes modulaires de contre-facturation (hébergement, carburant, frais
        custom…).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Libellé</th>
              <th className="px-3 py-2">Unité</th>
              <th className="px-3 py-2">Taux</th>
              <th className="px-3 py-2">Actif</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {draft.map((line) => (
              <tr key={line.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{line.code}</td>
                <td className="px-3 py-2">
                  <input
                    className={inputClass}
                    value={line.label}
                    onChange={(e) =>
                      setDraft((rows) =>
                        rows.map((r) =>
                          r.id === line.id
                            ? { ...r, label: e.target.value }
                            : r,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className={inputClass}
                    value={line.unit}
                    onChange={(e) =>
                      setDraft((rows) =>
                        rows.map((r) =>
                          r.id === line.id ? { ...r, unit: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    className={inputClass}
                    value={line.rate}
                    onChange={(e) =>
                      setDraft((rows) =>
                        rows.map((r) =>
                          r.id === line.id
                            ? { ...r, rate: Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={line.enabled}
                    onChange={(e) =>
                      setDraft((rows) =>
                        rows.map((r) =>
                          r.id === line.id
                            ? { ...r, enabled: e.target.checked }
                            : r,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {!line.system && (
                    <button
                      type="button"
                      className="text-sm text-alert-critical"
                      onClick={() =>
                        setDraft((rows) => rows.filter((r) => r.id !== line.id))
                      }
                    >
                      Retirer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          className={inputClass}
          placeholder="CODE"
          value={newLine.code}
          onChange={(e) =>
            setNewLine((n) => ({ ...n, code: e.target.value.toUpperCase() }))
          }
        />
        <input
          className={inputClass}
          placeholder="Libellé"
          value={newLine.label}
          onChange={(e) => setNewLine((n) => ({ ...n, label: e.target.value }))}
        />
        <input
          className={inputClass}
          placeholder="Unité"
          value={newLine.unit}
          onChange={(e) => setNewLine((n) => ({ ...n, unit: e.target.value }))}
        />
        <input
          type="number"
          className={inputClass}
          placeholder="Taux"
          value={newLine.rate}
          onChange={(e) => setNewLine((n) => ({ ...n, rate: e.target.value }))}
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (!newLine.code || !newLine.label) return;
            setDraft((rows) => [
              ...rows,
              {
                id: uid(),
                code: newLine.code,
                label: newLine.label,
                unit: newLine.unit || "DA",
                rate: Number(newLine.rate) || 0,
                enabled: true,
                system: false,
              },
            ]);
            setNewLine({ code: "", label: "", unit: "DA", rate: "0" });
          }}
        >
          + Ajouter frais
        </Button>
      </div>
      <Button disabled={pending} onClick={() => onChange(draft)}>
        {pending ? "Enregistrement…" : "Enregistrer contre-facturation"}
      </Button>
    </section>
  );
}

function ItemsTab({
  contractId,
  itemType,
  items,
  pending,
  searchable,
  onUpsert,
  onDelete,
}: {
  contractId: string;
  itemType: "LABOR" | "SPARE_PART";
  items: ContractItem[];
  pending: boolean;
  searchable?: boolean;
  onUpsert: (row: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState({
    id: "" as string | undefined,
    item_code: "",
    designation: "",
    unit: itemType === "LABOR" ? "JOUR" : "U",
    quantity: "1",
    unit_price_ht: "0",
    sort_order: "0",
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.item_code.toLowerCase().includes(needle) ||
        i.designation.toLowerCase().includes(needle),
    );
  }, [items, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function edit(item: ContractItem) {
    setForm({
      id: item.id,
      item_code: item.item_code,
      designation: item.designation,
      unit: item.unit,
      quantity: String(item.quantity),
      unit_price_ht: String(item.unit_price_ht),
      sort_order: String(item.sort_order),
    });
  }

  function reset() {
    setForm({
      id: undefined,
      item_code: "",
      designation: "",
      unit: itemType === "LABOR" ? "JOUR" : "U",
      quantity: "1",
      unit_price_ht: "0",
      sort_order: "0",
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      {searchable && (
        <input
          className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Recherche code / désignation…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
      )}
      <div className="grid gap-2 sm:grid-cols-6">
        <input
          className={inputClass}
          placeholder="Code"
          value={form.item_code}
          onChange={(e) =>
            setForm((f) => ({ ...f, item_code: e.target.value }))
          }
        />
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Désignation"
          value={form.designation}
          onChange={(e) =>
            setForm((f) => ({ ...f, designation: e.target.value }))
          }
        />
        <input
          className={inputClass}
          placeholder="Unité"
          value={form.unit}
          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
        />
        <input
          type="number"
          className={inputClass}
          placeholder="Qté"
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
        />
        <input
          type="number"
          className={inputClass}
          placeholder="PU HT"
          value={form.unit_price_ht}
          onChange={(e) =>
            setForm((f) => ({ ...f, unit_price_ht: e.target.value }))
          }
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            onUpsert({
              id: form.id || undefined,
              contract_id: contractId,
              item_type: itemType,
              item_code: form.item_code,
              designation: form.designation,
              unit: form.unit,
              quantity: Number(form.quantity),
              unit_price_ht: Number(form.unit_price_ht),
              sort_order: Number(form.sort_order) || 0,
            })
          }
        >
          {form.id ? "Mettre à jour" : "Ajouter"}
        </Button>
        {form.id && (
          <Button variant="secondary" onClick={reset}>
            Annuler édition
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Désignation</th>
              <th className="px-3 py-2">Unité</th>
              <th className="px-3 py-2">Qté</th>
              <th className="px-3 py-2">PU HT</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{item.item_code}</td>
                <td className="px-3 py-2">{item.designation}</td>
                <td className="px-3 py-2">{item.unit}</td>
                <td className="px-3 py-2">{item.quantity}</td>
                <td className="px-3 py-2">{money(item.unit_price_ht)}</td>
                <td className="px-3 py-2">{money(item.total_price_ht)}</td>
                <td className="space-x-3 px-3 py-2 text-right">
                  <button
                    type="button"
                    className="text-sm font-semibold text-brand"
                    onClick={() => edit(item)}
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    className="text-sm text-alert-critical"
                    onClick={() => onDelete(item.id)}
                  >
                    Suppr.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Préc.
          </Button>
          <span>
            Page {page + 1} / {pageCount} ({filtered.length} lignes)
          </span>
          <Button
            variant="secondary"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Suiv.
          </Button>
        </div>
      )}
    </section>
  );
}

function PenaltiesTab({
  attrs,
  pending,
  onSave,
}: {
  attrs: ContractAttributes;
  pending: boolean;
  onSave: (attrs: ContractAttributes) => void;
}) {
  const [draft, setDraft] = useState(attrs);
  const [custom, setCustom] = useState({
    code: "",
    label: "",
    mode: "PCT_DAILY" as PenaltyRule["mode"],
    rate_pct: "5",
    fixed_amount: "0",
  });

  function updatePreset(id: string, patch: Partial<PenaltyRule>) {
    setDraft((d) => ({
      ...d,
      penalties: {
        ...d.penalties,
        presets: d.penalties.presets.map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        ),
      },
    }));
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plafond max (%)">
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={draft.penalties.max_cap_rate * 100}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                penalties: {
                  ...d.penalties,
                  max_cap_rate: Number(e.target.value) / 100,
                },
              }))
            }
          />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.penalties.max_cap_enabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                penalties: {
                  ...d.penalties,
                  max_cap_enabled: e.target.checked,
                },
              }))
            }
          />
          Activer le plafond
        </label>
      </div>

      <h3 className="font-semibold">Presets El Gassi</h3>
      <div className="space-y-3">
        {draft.penalties.presets.map((p) => (
          <div
            key={p.id}
            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="font-mono text-xs text-foreground/55">
                {p.code} · {p.mode}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={(e) =>
                  updatePreset(p.id, { enabled: e.target.checked })
                }
              />
              Actif
            </label>
            {p.mode !== "PROGRESSIVE" && p.mode !== "FIXED" && (
              <Field label="Taux (%)">
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={(p.rate ?? 0) * 100}
                  onChange={(e) =>
                    updatePreset(p.id, {
                      rate: Number(e.target.value) / 100,
                    })
                  }
                />
              </Field>
            )}
            {p.mode === "FIXED" && (
              <Field label="Montant fixe">
                <input
                  type="number"
                  className={inputClass}
                  value={p.fixed_amount ?? 0}
                  onChange={(e) =>
                    updatePreset(p.id, {
                      fixed_amount: Number(e.target.value),
                    })
                  }
                />
              </Field>
            )}
          </div>
        ))}
      </div>

      <h3 className="font-semibold">Règles custom</h3>
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          className={inputClass}
          placeholder="CODE"
          value={custom.code}
          onChange={(e) =>
            setCustom((c) => ({ ...c, code: e.target.value.toUpperCase() }))
          }
        />
        <input
          className={inputClass}
          placeholder="Libellé"
          value={custom.label}
          onChange={(e) => setCustom((c) => ({ ...c, label: e.target.value }))}
        />
        <select
          className={inputClass}
          value={custom.mode}
          onChange={(e) =>
            setCustom((c) => ({
              ...c,
              mode: e.target.value as PenaltyRule["mode"],
            }))
          }
        >
          <option value="FIXED">FIXED</option>
          <option value="PCT_DAILY">PCT_DAILY</option>
          <option value="PCT_ITEM">PCT_ITEM</option>
          <option value="PROGRESSIVE">PROGRESSIVE</option>
        </select>
        <input
          type="number"
          className={inputClass}
          placeholder="Taux %"
          value={custom.rate_pct}
          onChange={(e) =>
            setCustom((c) => ({ ...c, rate_pct: e.target.value }))
          }
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (!custom.code || !custom.label) return;
            const rule: PenaltyRule = {
              id: uid(),
              code: custom.code,
              label: custom.label,
              enabled: true,
              system: false,
              mode: custom.mode,
              rate: Number(custom.rate_pct) / 100,
              fixed_amount: Number(custom.fixed_amount) || 0,
            };
            setDraft((d) => ({
              ...d,
              penalties: {
                ...d.penalties,
                custom: [...d.penalties.custom, rule],
              },
            }));
            setCustom({
              code: "",
              label: "",
              mode: "PCT_DAILY",
              rate_pct: "5",
              fixed_amount: "0",
            });
          }}
        >
          + Ajouter règle
        </Button>
      </div>
      {draft.penalties.custom.length > 0 && (
        <ul className="space-y-2 text-sm">
          {draft.penalties.custom.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <span>
                {c.label}{" "}
                <span className="font-mono text-xs text-foreground/55">
                  {c.code} · {c.mode}
                </span>
              </span>
              <button
                type="button"
                className="text-alert-critical"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    penalties: {
                      ...d.penalties,
                      custom: d.penalties.custom.filter((x) => x.id !== c.id),
                    },
                  }))
                }
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button disabled={pending} onClick={() => onSave(draft)}>
        {pending ? "Enregistrement…" : "Enregistrer pénalités"}
      </Button>
    </section>
  );
}

function MarginTab({
  guards,
  pending,
  onSave,
}: {
  guards: ContractAttributes["margin_guards"];
  pending: boolean;
  onSave: (g: ContractAttributes["margin_guards"]) => void;
}) {
  const [form, setForm] = useState({
    green_above_pct: String(guards.green_above_pct * 100),
    yellow_min_pct: String(guards.yellow_min_pct * 100),
    yellow_max_pct: String(guards.yellow_max_pct * 100),
    red_blocks_without_approval: guards.red_blocks_without_approval,
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Seuils UI verts / jaunes / rouges pour le contrôle de marge opérationnelle.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Vert au-dessus de (%)">
          <input
            type="number"
            className={inputClass}
            value={form.green_above_pct}
            onChange={(e) =>
              setForm((f) => ({ ...f, green_above_pct: e.target.value }))
            }
          />
        </Field>
        <Field label="Jaune min (%)">
          <input
            type="number"
            className={inputClass}
            value={form.yellow_min_pct}
            onChange={(e) =>
              setForm((f) => ({ ...f, yellow_min_pct: e.target.value }))
            }
          />
        </Field>
        <Field label="Jaune max (%)">
          <input
            type="number"
            className={inputClass}
            value={form.yellow_max_pct}
            onChange={(e) =>
              setForm((f) => ({ ...f, yellow_max_pct: e.target.value }))
            }
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={form.red_blocks_without_approval}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              red_blocks_without_approval: e.target.checked,
            }))
          }
        />
        Rouge bloque sans approbation
      </label>
      <div className="flex gap-2 text-sm">
        <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-700">
          Vert &gt; {form.green_above_pct}%
        </span>
        <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-700">
          Jaune {form.yellow_min_pct}–{form.yellow_max_pct}%
        </span>
        <span className="rounded bg-red-500/15 px-2 py-1 text-red-700">
          Rouge &lt; {form.yellow_min_pct}%
        </span>
      </div>
      <Button
        disabled={pending}
        onClick={() =>
          onSave({
            green_above_pct: Number(form.green_above_pct) / 100,
            yellow_min_pct: Number(form.yellow_min_pct) / 100,
            yellow_max_pct: Number(form.yellow_max_pct) / 100,
            red_blocks_without_approval: form.red_blocks_without_approval,
          })
        }
      >
        {pending ? "Enregistrement…" : "Enregistrer gardes"}
      </Button>
    </section>
  );
}

function RhAnTab({
  rh,
  pending,
  onSave,
}: {
  rh: ContractAttributes["rh_an_workflow"];
  pending: boolean;
  onSave: (rh: ContractAttributes["rh_an_workflow"]) => void;
}) {
  const [form, setForm] = useState({
    enabled: rh.enabled,
    block_threshold_days: String(rh.block_threshold_days),
    auto_block_payroll: rh.auto_block_payroll,
    require_pv: rh.require_pv,
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Configuration workflow Absences Non Justifiées (AN) — sans modification
        du module RH.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) =>
            setForm((f) => ({ ...f, enabled: e.target.checked }))
          }
        />
        Activer le workflow AN sur ce contrat
      </label>
      <Field label="Seuil de blocage (jours)">
        <input
          type="number"
          min={1}
          className={inputClass}
          value={form.block_threshold_days}
          onChange={(e) =>
            setForm((f) => ({ ...f, block_threshold_days: e.target.value }))
          }
        />
      </Field>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={form.auto_block_payroll}
          onChange={(e) =>
            setForm((f) => ({ ...f, auto_block_payroll: e.target.checked }))
          }
        />
        Blocage paie automatique
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={form.require_pv}
          onChange={(e) =>
            setForm((f) => ({ ...f, require_pv: e.target.checked }))
          }
        />
        PV obligatoire pour déblocage
      </label>
      <Button
        disabled={pending}
        onClick={() =>
          onSave({
            ...rh,
            enabled: form.enabled,
            block_threshold_days: Number(form.block_threshold_days) || 1,
            auto_block_payroll: form.auto_block_payroll,
            require_pv: form.require_pv,
          })
        }
      >
        {pending ? "Enregistrement…" : "Enregistrer RH / AN"}
      </Button>
    </section>
  );
}

function CanvaTab({
  contractId,
  pending,
  onImport,
}: {
  contractId: string;
  pending: boolean;
  onImport: (file: File) => void;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Import Canva Excel en mode <strong>REPLACE</strong> : remplace
        intégralement les feuilles Main-d&apos;œuvre et Pièces, puis recalcule
        le HT (AUTO) et la caution (FROM_RATE).
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="/api/contracts/canva-template"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:bg-brand-muted"
        >
          Télécharger canva vide
        </a>
        <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover">
          {pending ? "Import…" : "Importer canva (REPLACE)"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-foreground/55">
        Contrat cible : {contractId}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-muted px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-foreground/55">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

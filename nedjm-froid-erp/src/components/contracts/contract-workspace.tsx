"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  applyPenalty,
  cancelInvoice,
  closeContract,
  createInvoiceDraft,
  deleteContractItem,
  getContractBalance,
  getContractStats,
  importFullCanva,
  issueInvoice,
  listConsumptionMovements,
  listContractInvoices,
  listContractPayments,
  listHrEmployees,
  listPenaltyEvents,
  postConsumption,
  postPayment,
  replaceContractAttributes,
  suggestNextInvoiceNumber,
  suggestPenaltyAmount,
  upsertContract,
  upsertContractItem,
  type ConsumptionMovement,
  type ContractBalance,
  type ContractDetail,
  type ContractInvoice,
  type ContractItem,
  type ContractPayment,
  type ContractPenaltyEvent,
  type ContractStats,
  type HrEmployeeOption,
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
  | "consumption"
  | "invoicing"
  | "balance"
  | "pilotage"
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
    { id: "consumption", label: "Consommation" },
    { id: "invoicing", label: "Facturation" },
    { id: "balance", label: "Solde" },
    { id: "pilotage", label: "Pilotage" },
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

      {tab === "consumption" && (
        <ConsumptionTab
          contract={contract}
          pending={pending}
          onPost={(payload) =>
            run(async () => {
              const result = await postConsumption(payload);
              if (!result.ok) throw new Error(result.error);
              setInfo(
                `Mouvement enregistré — consommé ${result.data.consumed_qty} / reste ${result.data.remaining_qty}.`,
              );
            })
          }
        />
      )}

      {tab === "invoicing" && (
        <InvoicingTab
          contract={contract}
          pending={pending}
          onCreate={(payload) =>
            run(async () => {
              const result = await createInvoiceDraft(payload);
              if (!result.ok) throw new Error(result.error);
              setInfo(
                `Brouillon ${result.data.invoice_number} — ${result.data.lines} ligne(s), HT ${money(result.data.total_ht)} / TTC ${money(result.data.total_ttc)}.`,
              );
            })
          }
          onIssue={(invoiceId) =>
            run(async () => {
              const result = await issueInvoice({
                invoice_id: invoiceId,
                contract_id: contract.id,
              });
              if (!result.ok) throw new Error(result.error);
              setInfo("Facture émise.");
            })
          }
          onCancel={(invoiceId) =>
            run(async () => {
              const result = await cancelInvoice({
                invoice_id: invoiceId,
                contract_id: contract.id,
              });
              if (!result.ok) throw new Error(result.error);
              setInfo("Facture annulée.");
            })
          }
        />
      )}

      {tab === "balance" && (
        <BalanceTab
          contract={contract}
          pending={pending}
          onPay={(payload) =>
            run(async () => {
              const result = await postPayment(payload);
              if (!result.ok) throw new Error(result.error);
              setInfo(
                result.data.balance.is_solded
                  ? "Paiement enregistré — contrat soldé."
                  : `Paiement OK — reste ${money(result.data.balance.remaining_ht)}.`,
              );
            })
          }
        />
      )}

      {tab === "pilotage" && (
        <PilotageTab
          contract={contract}
          pending={pending}
          onApplyPenalty={(payload) =>
            run(async () => {
              const result = await applyPenalty(payload);
              if (!result.ok) throw new Error(result.error);
              setInfo(`Pénalité appliquée : ${money(result.data.amount_ht)}.`);
            })
          }
          onClose={(force) =>
            run(async () => {
              const result = await closeContract({
                contract_id: contract.id,
                force,
              });
              if (!result.ok) throw new Error(result.error);
              setInfo("Contrat clôturé.");
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

function PilotageTab({
  contract,
  pending,
  onApplyPenalty,
  onClose,
}: {
  contract: ContractDetail;
  pending: boolean;
  onApplyPenalty: (payload: Record<string, unknown>) => void;
  onClose: (force: boolean) => void;
}) {
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [events, setEvents] = useState<ContractPenaltyEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const rules = [
    ...(contract.attributes.penalties?.presets ?? []),
    ...(contract.attributes.penalties?.custom ?? []),
  ].filter((r) => r.enabled !== false);
  const [form, setForm] = useState({
    rule_code: "",
    amount_ht: "",
    basis_days: "1",
    event_date: new Date().toISOString().slice(0, 10),
    note: "",
    hr_employee_id: "",
  });
  const [employees, setEmployees] = useState<HrEmployeeOption[]>([]);
  const [suggestHint, setSuggestHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, e, hr] = await Promise.all([
        getContractStats(contract.id),
        listPenaltyEvents(contract.id),
        listHrEmployees(),
      ]);
      if (cancelled) return;
      if (!s.ok) {
        setError(s.error);
        return;
      }
      if (!e.ok) {
        setError(e.error);
        return;
      }
      setStats(s.data);
      setEvents(e.data);
      if (hr.ok) setEmployees(hr.data);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [contract.id, contract.items, contract.status]);

  const selected = rules.find((r) => r.code === form.rule_code);

  async function onRuleChange(code: string) {
    setForm((f) => ({ ...f, rule_code: code }));
    setSuggestHint(null);
    if (!code) return;
    const days = Number(form.basis_days) || 1;
    const r = await suggestPenaltyAmount({
      contract_id: contract.id,
      rule_code: code,
      basis_days: days,
    });
    if (r.ok) {
      setForm((f) => ({
        ...f,
        rule_code: code,
        amount_ht: String(r.data.suggested_amount_ht),
      }));
      setSuggestHint(
        `Suggestion ${r.data.mode} : ${money(r.data.suggested_amount_ht)}`,
      );
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Vue A→Z : consommation, facturation, encaissement, pénalités appliquées
        (montant suggéré depuis la règle), clôture.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {stats && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="% Qté conso."
            value={
              stats.pct_qty_consumed == null
                ? "—"
                : `${stats.pct_qty_consumed}%`
            }
          />
          <Stat
            label="% HT conso."
            value={
              stats.pct_ht_consumed == null ? "—" : `${stats.pct_ht_consumed}%`
            }
          />
          <Stat
            label="% Facturé"
            value={stats.pct_invoiced == null ? "—" : `${stats.pct_invoiced}%`}
          />
          <Stat
            label="% Encaissé"
            value={
              stats.pct_collected == null ? "—" : `${stats.pct_collected}%`
            }
          />
          <Stat
            label="Pénalités"
            value={`${money(stats.penalties_ht)} (${stats.penalties_count})`}
          />
          <Stat
            label="État"
            value={stats.is_solded ? "Soldé" : stats.status}
          />
        </div>
      )}
      {stats && (
        <div className="grid gap-2 sm:grid-cols-4 text-sm">
          <Stat label="Conso. HT" value={money(stats.consumed_ht)} />
          <Stat label="MO conso." value={String(stats.labor_consumed_qty)} />
          <Stat label="Pièces conso." value={String(stats.spare_consumed_qty)} />
          <Stat
            label="Factures ouvertes"
            value={String(stats.open_invoices_count)}
          />
        </div>
      )}

      <h3 className="font-semibold">Appliquer une pénalité</h3>
      {suggestHint && (
        <p className="text-xs text-foreground/55">{suggestHint}</p>
      )}
      <div className="grid gap-2 sm:grid-cols-6">
        <select
          className={inputClass}
          value={form.rule_code}
          onChange={(e) => void onRuleChange(e.target.value)}
        >
          <option value="">Règle…</option>
          {rules.map((r) => (
            <option key={r.id} value={r.code}>
              {r.code} — {r.label} ({r.mode})
            </option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          className={inputClass}
          placeholder="Jours (base)"
          value={form.basis_days}
          onChange={(e) =>
            setForm((f) => ({ ...f, basis_days: e.target.value }))
          }
          onBlur={() => {
            if (form.rule_code) void onRuleChange(form.rule_code);
          }}
        />
        <input
          type="number"
          min="0"
          step="0.01"
          className={inputClass}
          placeholder="Montant HT"
          value={form.amount_ht}
          onChange={(e) => setForm((f) => ({ ...f, amount_ht: e.target.value }))}
        />
        <input
          type="date"
          className={inputClass}
          value={form.event_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, event_date: e.target.value }))
          }
        />
        <select
          className={inputClass}
          value={form.hr_employee_id}
          onChange={(e) =>
            setForm((f) => ({ ...f, hr_employee_id: e.target.value }))
          }
        >
          <option value="">Employé RH (opt.)</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.matricule} — {e.last_name} {e.first_name}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          placeholder="Note"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />
      </div>
      <Button
        type="button"
        disabled={pending || !form.rule_code || !form.amount_ht}
        onClick={() =>
          onApplyPenalty({
            contract_id: contract.id,
            rule_code: form.rule_code,
            rule_label: selected?.label ?? form.rule_code,
            amount_ht: form.amount_ht,
            event_date: form.event_date,
            note: form.note || undefined,
            basis_days: form.basis_days ? Number(form.basis_days) : null,
            rule_mode: selected?.mode ?? null,
            hr_employee_id: form.hr_employee_id || null,
          })
        }
      >
        Appliquer
      </Button>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-foreground/55">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Règle</th>
              <th className="px-2 py-2">Jours</th>
              <th className="px-2 py-2">Montant</th>
              <th className="px-2 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-foreground/55">
                  Aucune pénalité appliquée.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5">{e.event_date}</td>
                  <td className="px-2 py-1.5">
                    {e.rule_code} — {e.rule_label}
                    {e.rule_mode ? ` (${e.rule_mode})` : ""}
                  </td>
                  <td className="px-2 py-1.5">{e.basis_days ?? "—"}</td>
                  <td className="px-2 py-1.5">{money(e.amount_ht)}</td>
                  <td className="px-2 py-1.5">{e.note ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        <h3 className="font-semibold">Clôture</h3>
        <p className="mt-1 text-xs text-foreground/55">
          Checklist avant clôture. Refusée si bloqueurs (sauf forçage). Une
          snapshot est enregistrée dans attributes.closeout.
        </p>
        {stats && (
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              {stats.remaining_ht <= 0 ? "✅" : "⛔"} Reste à encaisser :{" "}
              {money(stats.remaining_ht)}
            </li>
            <li>
              {stats.draft_invoices_count === 0 ? "✅" : "⛔"} Factures
              brouillon : {stats.draft_invoices_count}
            </li>
            <li>
              {stats.open_invoices_count === 0 ? "✅" : "⚠️"} Factures ouvertes :{" "}
              {stats.open_invoices_count}
            </li>
            <li>
              {stats.can_close ? "✅" : "⛔"} Prêt à clôturer :{" "}
              {stats.can_close ? "oui" : "non"}
            </li>
          </ul>
        )}
        {stats && stats.close_blockers.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Bloqueurs : {stats.close_blockers.join(" · ")}
          </div>
        )}
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          Forcer la clôture
        </label>
        <div className="mt-2">
          <Button
            type="button"
            disabled={pending || contract.status === "CLOTURE"}
            onClick={() => onClose(force)}
          >
            Clôturer le contrat
          </Button>
        </div>
      </div>
    </section>
  );
}

function BalanceTab({
  contract,
  pending,
  onPay,
}: {
  contract: ContractDetail;
  pending: boolean;
  onPay: (payload: Record<string, unknown>) => void;
}) {
  const [balance, setBalance] = useState<ContractBalance | null>(null);
  const [payments, setPayments] = useState<ContractPayment[]>([]);
  const [invoices, setInvoices] = useState<ContractInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount_ht: "",
    payment_date: new Date().toISOString().slice(0, 10),
    method: "VIREMENT",
    invoice_id: "",
    reference: "",
    note: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, p, inv] = await Promise.all([
        getContractBalance(contract.id),
        listContractPayments(contract.id),
        listContractInvoices(contract.id),
      ]);
      if (cancelled) return;
      if (!b.ok) {
        setError(b.error);
        return;
      }
      if (!p.ok) {
        setError(p.error);
        return;
      }
      if (!inv.ok) {
        setError(inv.error);
        return;
      }
      setBalance(b.data);
      setPayments(p.data);
      setInvoices(inv.data.filter((i) => i.status === "EMISE"));
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [contract.id, contract.items]);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Solde = facturé (ÉMISE) − encaissé. Paiement plafonné au reste contrat et
        au reste de la facture liée. Soldé quand reste = 0 et facturé &gt; 0.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {balance && (
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat label="Facturé HT" value={money(balance.invoiced_ht)} />
          <Stat label="Encaissé HT" value={money(balance.paid_ht)} />
          <Stat label="Reste HT" value={money(balance.remaining_ht)} />
          <Stat
            label="État"
            value={balance.is_solded ? "Soldé" : "Ouvert"}
          />
        </div>
      )}

      {(balance?.open_invoices?.length ?? 0) > 0 && (
        <div className="overflow-x-auto">
          <h3 className="mb-2 font-semibold">Factures ouvertes</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-foreground/55">
              <tr>
                <th className="px-2 py-2">N°</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Payé</th>
                <th className="px-2 py-2">Reste</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {balance!.open_invoices!.map((inv) => (
                <tr key={inv.invoice_id} className="border-b border-border/60">
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {inv.invoice_number}
                  </td>
                  <td className="px-2 py-1.5">{money(inv.total_ht)}</td>
                  <td className="px-2 py-1.5">{money(inv.paid_ht)}</td>
                  <td className="px-2 py-1.5 font-semibold">
                    {money(inv.open_ht)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          invoice_id: inv.invoice_id,
                          amount_ht: String(inv.open_ht),
                        }))
                      }
                    >
                      Payer le reste
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-6">
        <input
          type="number"
          min="0"
          step="0.01"
          className={inputClass}
          placeholder="Montant HT"
          value={form.amount_ht}
          onChange={(e) => setForm((f) => ({ ...f, amount_ht: e.target.value }))}
        />
        <input
          type="date"
          className={inputClass}
          value={form.payment_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, payment_date: e.target.value }))
          }
        />
        <select
          className={inputClass}
          value={form.method}
          onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
        >
          <option value="VIREMENT">Virement</option>
          <option value="CHEQUE">Chèque</option>
          <option value="ESPECES">Espèces</option>
          <option value="AUTRE">Autre</option>
        </select>
        <select
          className={inputClass}
          value={form.invoice_id}
          onChange={(e) => {
            const id = e.target.value;
            const open = balance?.open_invoices?.find((i) => i.invoice_id === id);
            setForm((f) => ({
              ...f,
              invoice_id: id,
              amount_ht: open ? String(open.open_ht) : f.amount_ht,
            }));
          }}
        >
          <option value="">Facture (opt.)</option>
          {(balance?.open_invoices ?? invoices.map((i) => ({
            invoice_id: i.id,
            invoice_number: i.invoice_number,
            open_ht: i.total_ht,
          }))).map((i) => (
            <option key={i.invoice_id} value={i.invoice_id}>
              {i.invoice_number} · reste {money(i.open_ht)}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          placeholder="Réf. bancaire"
          value={form.reference}
          onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
        />
        <Button
          type="button"
          disabled={pending || !form.amount_ht || (balance?.remaining_ht ?? 0) <= 0}
          onClick={() =>
            onPay({
              contract_id: contract.id,
              amount_ht: form.amount_ht,
              payment_date: form.payment_date,
              method: form.method,
              invoice_id: form.invoice_id || null,
              reference: form.reference || undefined,
              note: form.note || undefined,
            })
          }
        >
          Enregistrer paiement
        </Button>
      </div>
      {balance && balance.remaining_ht > 0 && (
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            onPay({
              contract_id: contract.id,
              amount_ht: balance.remaining_ht,
              payment_date: form.payment_date,
              method: form.method,
              invoice_id: form.invoice_id || null,
              reference: form.reference || undefined,
              note: form.note || "Solde intégral contrat",
            })
          }
        >
          Encaisser tout le reste ({money(balance.remaining_ht)})
        </Button>
      )}

      <h3 className="font-semibold">Paiements</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-foreground/55">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Montant</th>
              <th className="px-2 py-2">Mode</th>
              <th className="px-2 py-2">Réf.</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-foreground/55">
                  Aucun paiement.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5">{p.payment_date}</td>
                  <td className="px-2 py-1.5">{money(p.amount_ht)}</td>
                  <td className="px-2 py-1.5">{p.method}</td>
                  <td className="px-2 py-1.5">{p.reference ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InvoicingTab({
  contract,
  pending,
  onCreate,
  onIssue,
  onCancel,
}: {
  contract: ContractDetail;
  pending: boolean;
  onCreate: (payload: Record<string, unknown>) => void;
  onIssue: (invoiceId: string) => void;
  onCancel: (invoiceId: string) => void;
}) {
  const [invoices, setInvoices] = useState<ContractInvoice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const billableItems = useMemo(
    () => contract.items.filter((i) => (i.billable_qty ?? 0) > 0),
    [contract.items],
  );
  const [form, setForm] = useState({
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    note: "",
    item_id: "",
    quantity: "",
  });
  const [draftLines, setDraftLines] = useState<
    { contract_item_id: string; code: string; quantity: number }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listContractInvoices(contract.id);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setInvoices(result.data);
      setLoadError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [contract.id, contract.items]);

  const canPost =
    contract.status === "VALIDE" || contract.status === "EN_COURS";

  function addLine() {
    const item = contract.items.find((i) => i.id === form.item_id);
    const qty = Number(form.quantity);
    if (!item || !(qty > 0)) return;
    const max = item.billable_qty ?? 0;
    if (qty > max) {
      return;
    }
    setDraftLines((lines) => [
      ...lines.filter((l) => l.contract_item_id !== item.id),
      {
        contract_item_id: item.id,
        code: item.item_code,
        quantity: qty,
      },
    ]);
    setForm((f) => ({ ...f, item_id: "", quantity: "" }));
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Facturation depuis la consommation : on ne facture que le{" "}
        <strong>facturable</strong> (consommé − déjà émis). N° vide = auto
        (FAC/…/YYYY/nnn). TVA depuis attributs financiers du contrat. Brouillon →
        Émise / Annulée.
      </p>
      {!canPost && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Statut « {contract.status} » — facturation bloquée.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-6">
        <div className="flex gap-1 sm:col-span-2">
          <input
            className={inputClass}
            placeholder="N° auto si vide"
            value={form.invoice_number}
            onChange={(e) =>
              setForm((f) => ({ ...f, invoice_number: e.target.value }))
            }
          />
          <Button
            type="button"
            disabled={pending}
            onClick={async () => {
              const r = await suggestNextInvoiceNumber(contract.id);
              if (r.ok) {
                setForm((f) => ({
                  ...f,
                  invoice_number: r.data.invoice_number,
                }));
              }
            }}
          >
            Auto
          </Button>
        </div>
        <input
          type="date"
          className={inputClass}
          value={form.invoice_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, invoice_date: e.target.value }))
          }
        />
        <select
          className={inputClass}
          value={form.item_id}
          onChange={(e) => setForm((f) => ({ ...f, item_id: e.target.value }))}
        >
          <option value="">Ligne facturable…</option>
          {billableItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.item_code} (max {i.billable_qty})
            </option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          step="0.0001"
          className={inputClass}
          placeholder="Qté"
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
        />
        <Button type="button" disabled={pending || !canPost} onClick={addLine}>
          Ajouter
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || !canPost || billableItems.length === 0}
          onClick={() =>
            setDraftLines(
              billableItems.map((i) => ({
                contract_item_id: i.id,
                code: i.item_code,
                quantity: i.billable_qty ?? 0,
              })),
            )
          }
        >
          Tout le facturable
        </Button>
      </div>
      <input
        className={`${inputClass} max-w-xl`}
        placeholder="Note (optionnel)"
        value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
      />

      {draftLines.length > 0 && (
        <ul className="text-sm">
          {draftLines.map((l) => (
            <li key={l.contract_item_id}>
              {l.code} × {l.quantity}{" "}
              <button
                type="button"
                className="text-brand underline"
                onClick={() =>
                  setDraftLines((rows) =>
                    rows.filter((r) => r.contract_item_id !== l.contract_item_id),
                  )
                }
              >
                retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        disabled={pending || !canPost || draftLines.length === 0}
        onClick={() =>
          onCreate({
            contract_id: contract.id,
            invoice_number: form.invoice_number,
            invoice_date: form.invoice_date,
            note: form.note || undefined,
            lines: draftLines.map(({ contract_item_id, quantity }) => ({
              contract_item_id,
              quantity,
            })),
          })
        }
      >
        Créer brouillon
      </Button>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-foreground/55">
            <tr>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Consommé</th>
              <th className="px-2 py-2">Facturé</th>
              <th className="px-2 py-2">Facturable</th>
            </tr>
          </thead>
          <tbody>
            {contract.items
              .filter((i) => (i.consumed_qty ?? 0) > 0 || (i.invoiced_qty ?? 0) > 0)
              .map((i) => (
                <tr key={i.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5 font-mono text-xs">{i.item_code}</td>
                  <td className="px-2 py-1.5">{i.consumed_qty ?? 0}</td>
                  <td className="px-2 py-1.5">{i.invoiced_qty ?? 0}</td>
                  <td className="px-2 py-1.5 font-semibold">
                    {i.billable_qty ?? 0}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h3 className="font-semibold">Factures / forts</h3>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      <div className="space-y-3">
        {invoices.length === 0 ? (
          <p className="text-sm text-foreground/55">Aucune facture.</p>
        ) : (
          invoices.map((inv) => (
            <div
              key={inv.id}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {inv.invoice_number}{" "}
                    <span className="text-xs font-normal text-foreground/55">
                      {inv.invoice_date} · {inv.status}
                    </span>
                  </p>
                  <p className="text-sm">
                    HT {money(inv.total_ht)}
                    {inv.tva_amount > 0
                      ? ` · TVA ${money(inv.tva_amount)} · TTC ${money(inv.total_ttc)}`
                      : " · exonéré TVA"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {inv.status === "BROUILLON" && (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => onIssue(inv.id)}
                    >
                      Émettre
                    </Button>
                  )}
                  {inv.status !== "ANNULEE" && (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => onCancel(inv.id)}
                    >
                      Annuler
                    </Button>
                  )}
                </div>
              </div>
              <ul className="mt-2 text-xs text-foreground/70">
                {(inv.lines ?? []).map((l) => (
                  <li key={l.id}>
                    {l.item_code} · {l.quantity} × {l.unit_price_ht} ={" "}
                    {l.total_price_ht}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ConsumptionTab({
  contract,
  pending,
  onPost,
}: {
  contract: ContractDetail;
  pending: boolean;
  onPost: (payload: Record<string, unknown>) => void;
}) {
  const [movements, setMovements] = useState<ConsumptionMovement[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    contract_item_id: "",
    direction: "CONSUME" as "CONSUME" | "REVERSE",
    quantity: "1",
    movement_date: new Date().toISOString().slice(0, 10),
    note: "",
    hr_employee_id: "",
  });
  const [employees, setEmployees] = useState<HrEmployeeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [result, hr] = await Promise.all([
        listConsumptionMovements(contract.id),
        listHrEmployees(),
      ]);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setMovements(result.data);
      setLoadError(null);
      if (hr.ok) setEmployees(hr.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [contract.id, contract.items]);

  const selectedItem = contract.items.find((i) => i.id === form.contract_item_id);
  const showHr = selectedItem?.item_type === "LABOR";

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const base = contract.items;
    if (!needle) return base;
    return base.filter(
      (i) =>
        i.item_code.toLowerCase().includes(needle) ||
        i.designation.toLowerCase().includes(needle),
    );
  }, [contract.items, filter]);

  const canPost =
    contract.status === "VALIDE" || contract.status === "EN_COURS";

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Suivi contractuel : quantité prévue, consommée, reste et %. Les
        mouvements sont append-only (annulation = REVERSE). Sur lignes MO, un
        employé RH peut être rattaché.
      </p>
      {!canPost && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Statut actuel « {contract.status} » — saisie bloquée.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-6">
        <select
          className={inputClass}
          value={form.contract_item_id}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              contract_item_id: e.target.value,
              hr_employee_id: "",
            }))
          }
        >
          <option value="">Ligne…</option>
          {contract.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.item_type === "LABOR" ? "MO" : "SP"} · {i.item_code} (reste{" "}
              {i.remaining_qty ?? i.quantity})
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={form.direction}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              direction: e.target.value as "CONSUME" | "REVERSE",
            }))
          }
        >
          <option value="CONSUME">Consommer</option>
          <option value="REVERSE">Annuler (REVERSE)</option>
        </select>
        <input
          type="number"
          min="0"
          step="0.0001"
          className={inputClass}
          placeholder="Qté"
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
        />
        <input
          type="date"
          className={inputClass}
          value={form.movement_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, movement_date: e.target.value }))
          }
        />
        {showHr ? (
          <select
            className={inputClass}
            value={form.hr_employee_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, hr_employee_id: e.target.value }))
            }
          >
            <option value="">Employé RH (opt.)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.matricule} — {e.last_name} {e.first_name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={inputClass}
            placeholder="Note (optionnel)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        )}
        <input
          className={inputClass}
          placeholder="Note (optionnel)"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />
      </div>
      <Button
        type="button"
        disabled={pending || !canPost || !form.contract_item_id}
        onClick={() =>
          onPost({
            contract_id: contract.id,
            contract_item_id: form.contract_item_id,
            direction: form.direction,
            quantity: form.quantity,
            movement_date: form.movement_date,
            note: form.note || undefined,
            hr_employee_id: showHr && form.hr_employee_id
              ? form.hr_employee_id
              : null,
          })
        }
      >
        Enregistrer le mouvement
      </Button>

      <input
        className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder="Filtrer soldes code / désignation…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-foreground/55">
            <tr>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Désignation</th>
              <th className="px-2 py-2">Unité</th>
              <th className="px-2 py-2">Contractuel</th>
              <th className="px-2 py-2">Consommé</th>
              <th className="px-2 py-2">Reste</th>
              <th className="px-2 py-2">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-border/60">
                <td className="px-2 py-1.5 font-mono text-xs">{i.item_code}</td>
                <td className="px-2 py-1.5">{i.designation}</td>
                <td className="px-2 py-1.5">{i.unit}</td>
                <td className="px-2 py-1.5">{i.quantity}</td>
                <td className="px-2 py-1.5">{i.consumed_qty ?? 0}</td>
                <td className="px-2 py-1.5 font-semibold">
                  {i.remaining_qty ?? i.quantity}
                </td>
                <td className="px-2 py-1.5">
                  {i.pct_consumed == null ? "—" : `${i.pct_consumed}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="font-semibold">Derniers mouvements</h3>
      {loadError && (
        <p className="text-sm text-red-600">{loadError}</p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-foreground/55">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Sens</th>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Qté</th>
              <th className="px-2 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-foreground/55" colSpan={5}>
                  Aucun mouvement.
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5">{m.movement_date}</td>
                  <td className="px-2 py-1.5">{m.direction}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {m.item_code}
                  </td>
                  <td className="px-2 py-1.5">{m.quantity}</td>
                  <td className="px-2 py-1.5">{m.note ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  upsertContract,
  type ContractFinanceOptions,
  type ContractListRow,
} from "@/lib/actions/contracts";
import { AlertBadge } from "@/components/castle/alert-badge";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = [
  { value: "BROUILLON", label: "Brouillon" },
  { value: "VALIDE", label: "Validé" },
  { value: "EN_COURS", label: "En cours" },
  { value: "CLOTURE", label: "Clôturé" },
  { value: "ANNULE", label: "Annulé" },
] as const;

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    maximumFractionDigits: 2,
  }).format(n);
}

type SiteOpt = { id: string; code: string; name_fr: string };

type FormState = {
  id?: string;
  contract_number: string;
  client_name: string;
  site_id: string;
  start_date: string;
  end_date: string;
  ods_date: string;
  total_amount_ht: string;
  caution_rate_pct: string;
  caution_amount: string;
  status: string;
  total_mode: "AUTO" | "MANUAL";
  caution_sync: "FROM_RATE" | "FROM_AMOUNT" | "MANUAL";
  tva_mode: "TAXABLE" | "EXEMPT" | "MIXED";
  tva_articles: string;
  default_tax_rate_code: string;
};

const emptyForm = (siteId: string, taxRateCode: string): FormState => ({
  contract_number: "",
  client_name: "",
  site_id: siteId,
  start_date: "",
  end_date: "",
  ods_date: "",
  total_amount_ht: "0",
  caution_rate_pct: "2",
  caution_amount: "0",
  status: "BROUILLON",
  total_mode: "AUTO",
  caution_sync: "FROM_RATE",
  tva_mode: "MIXED",
  tva_articles: "12,16",
  default_tax_rate_code: taxRateCode,
});

function fromContract(c: ContractListRow): FormState {
  const fin = c.attributes.financial;
  return {
    id: c.id,
    contract_number: c.contract_number,
    client_name: c.client_name,
    site_id: c.site_id,
    start_date: c.start_date,
    end_date: c.end_date,
    ods_date: c.ods_date ?? "",
    total_amount_ht: String(c.total_amount_ht),
    caution_rate_pct: String(c.caution_rate * 100),
    caution_amount: String(c.caution_amount),
    status: c.status,
    total_mode: fin.total_mode,
    caution_sync: fin.caution_sync,
    tva_mode: fin.tva_mode,
    tva_articles: fin.tva_articles.join(","),
    default_tax_rate_code: fin.default_tax_rate_code,
  };
}

export function ContractsManager({
  initialContracts,
  sites,
  taxRates,
  loadError,
}: {
  initialContracts: ContractListRow[];
  sites: SiteOpt[];
  taxRates: ContractFinanceOptions["tax_rates"];
  loadError?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [form, setForm] = useState<FormState>(
    emptyForm(
      sites[0]?.id ?? "",
      taxRates.find((rate) => rate.is_default)?.code ?? taxRates[0]?.code ?? "",
    ),
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return initialContracts;
    return initialContracts.filter(
      (c) =>
        c.contract_number.toLowerCase().includes(needle) ||
        c.client_name.toLowerCase().includes(needle) ||
        (c.site_name ?? "").toLowerCase().includes(needle),
    );
  }, [initialContracts, q]);

  function openCreate() {
    setForm(
      emptyForm(
        sites[0]?.id ?? "",
        taxRates.find((rate) => rate.is_default)?.code ??
          taxRates[0]?.code ??
          "",
      ),
    );
    setError(null);
    setOpen(true);
  }

  function openEdit(c: ContractListRow) {
    setForm(fromContract(c));
    setError(null);
    setOpen(true);
  }

  function syncCautionFromRate(total: string, pct: string) {
    const t = Number(total);
    const p = Number(pct) / 100;
    if (!Number.isFinite(t) || !Number.isFinite(p)) return;
    setForm((f) => ({
      ...f,
      caution_amount: String(Math.round(t * p * 100) / 100),
    }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const caution_rate = Number(form.caution_rate_pct) / 100;
      const result = await upsertContract({
        id: form.id,
        contract_number: form.contract_number,
        client_name: form.client_name,
        site_id: form.site_id,
        start_date: form.start_date,
        end_date: form.end_date,
        ods_date: form.ods_date || null,
        total_amount_ht: Number(form.total_amount_ht),
        caution_rate,
        caution_amount: Number(form.caution_amount),
        status: form.status,
        total_mode: form.total_mode,
        caution_sync: form.caution_sync,
        tva_mode: form.tva_mode,
        tva_exempt: form.tva_mode === "EXEMPT",
        tva_articles: form.tva_articles,
        default_tax_rate_code: form.default_tax_rate_code,
        tva_standard_rate:
          taxRates.find((rate) => rate.code === form.default_tax_rate_code)
            ?.rate ?? 0,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/referentiels/contrats/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">
            Référentiels · contracts
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold">
            Contrats clients
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/70">
            Module dynamique El Gassi — en-tête financier, canva Excel,
            contre-facturation, pénalités et gardes de marge (`ref_contracts`).
          </p>
        </div>
        <Button onClick={openCreate} disabled={!sites.length || pending}>
          Nouveau contrat
        </Button>
      </div>

      {(loadError || error) && (
        <div
          role="alert"
          className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-4 py-3 text-sm text-alert-critical"
        >
          {loadError || error}
        </div>
      )}

      <input
        className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm"
        placeholder="Rechercher n°, client, site…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted text-sm text-foreground/60">
          Aucun contrat trouvé.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-foreground/60">
              <tr>
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Montant HT</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Lignes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-brand">
                    {c.contract_number}
                  </td>
                  <td className="px-4 py-3">{c.client_name}</td>
                  <td className="px-4 py-3 text-foreground/75">
                    {c.site_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">{money(c.total_amount_ht)}</td>
                  <td className="px-4 py-3">
                    <AlertBadge
                      label={
                        STATUS_OPTIONS.find((s) => s.value === c.status)
                          ?.label ?? c.status
                      }
                      tone={
                        c.status === "EN_COURS"
                          ? "success"
                          : c.status === "ANNULE"
                            ? "critical"
                            : "info"
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground/65">
                    {c.labor_count} labor · {c.spare_count} pièces
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-semibold text-foreground/70 hover:text-brand"
                      onClick={() => openEdit(c)}
                    >
                      Éditer
                    </button>
                    <Link
                      href={`/referentiels/contrats/${c.id}`}
                      className="text-sm font-semibold text-brand hover:underline"
                    >
                      Workspace
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">
              {form.id ? "Modifier le contrat" : "Nouveau contrat"}
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="N° contrat *">
                <input
                  className={inputClass}
                  value={form.contract_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contract_number: e.target.value }))
                  }
                />
              </Field>
              <Field label="Client *">
                <input
                  className={inputClass}
                  value={form.client_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, client_name: e.target.value }))
                  }
                />
              </Field>
              <Field label="Site *">
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date début *">
                <input
                  type="date"
                  className={inputClass}
                  value={form.start_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, start_date: e.target.value }))
                  }
                />
              </Field>
              <Field label="Date fin *">
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
              <Field label="Mode montant HT">
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
                  <option value="AUTO">AUTO (somme canva)</option>
                  <option value="MANUAL">MANUAL</option>
                </select>
              </Field>
              <Field label="Montant total HT (DA)">
                <input
                  type="number"
                  step="0.01"
                  className={inputClass}
                  disabled={form.total_mode === "AUTO" && !form.id}
                  value={form.total_amount_ht}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, total_amount_ht: v }));
                    if (form.caution_sync === "FROM_RATE") {
                      syncCautionFromRate(v, form.caution_rate_pct);
                    }
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
                      caution_sync: e.target.value as FormState["caution_sync"],
                    }))
                  }
                >
                  <option value="FROM_RATE">FROM_RATE</option>
                  <option value="FROM_AMOUNT">FROM_AMOUNT</option>
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
                    setForm((f) => ({ ...f, caution_rate_pct: v }));
                    if (form.caution_sync === "FROM_RATE") {
                      syncCautionFromRate(form.total_amount_ht, v);
                    }
                  }}
                />
              </Field>
              <Field label="Montant caution (DA)">
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
              <Field label="Régime TVA">
                <select
                  className={inputClass}
                  value={form.tva_mode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tva_mode: e.target.value as FormState["tva_mode"],
                    }))
                  }
                >
                  <option value="TAXABLE">Soumis par défaut</option>
                  <option value="EXEMPT">Exonéré par défaut</option>
                  <option value="MIXED">Mixte / codes articles</option>
                </select>
              </Field>
              <Field label="Taux TVA par défaut">
                <select
                  className={inputClass}
                  value={form.default_tax_rate_code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      default_tax_rate_code: e.target.value,
                    }))
                  }
                >
                  {taxRates.map((rate) => (
                    <option key={rate.id} value={rate.code}>
                      {rate.label_fr} ({rate.rate * 100}%)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Codes articles taxables (ex: 12,16)">
                <input
                  className={inputClass}
                  value={form.tva_articles}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tva_articles: e.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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

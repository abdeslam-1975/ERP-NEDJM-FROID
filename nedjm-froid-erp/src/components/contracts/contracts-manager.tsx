"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertContract,
  type ContractListRow,
} from "@/lib/actions/contracts";
import { AlertBadge } from "@/components/castle/alert-badge";
import { Button } from "@/components/ui/button";

const statusLabel: Record<string, string> = {
  BROUILLON: "Brouillon",
  VALIDE: "Validé",
  EN_COURS: "En cours",
  CLOTURE: "Clôturé",
  ANNULE: "Annulé",
};

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function ContractsManager({
  initialContracts,
  sites,
  loadError,
}: {
  initialContracts: ContractListRow[];
  sites: { id: string; code: string; name_fr: string }[];
  loadError?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");

  const [form, setForm] = useState({
    contract_number: "",
    client_name: "",
    site_id: sites[0]?.id ?? "",
    start_date: "",
    end_date: "",
    ods_date: "",
    total_amount_ht: "0",
    caution_rate: "0.02",
    caution_amount: "0",
    status: "BROUILLON",
  });

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

  function submit() {
    setError(null);
    startTransition(async () => {
      const cautionRate = Number(form.caution_rate);
      const total = Number(form.total_amount_ht);
      const result = await upsertContract({
        contract_number: form.contract_number,
        client_name: form.client_name,
        site_id: form.site_id,
        start_date: form.start_date,
        end_date: form.end_date,
        ods_date: form.ods_date || null,
        total_amount_ht: total,
        caution_rate: cautionRate,
        caution_amount: Number(form.caution_amount) || total * cautionRate,
        status: form.status,
        attributes: {},
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
            Référentiels · العقود
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold">
            Contrats clients
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/70">
            Moteur contrats (`ref_contracts` / `contract_items`). Seed
            SONATRACH I/111/HMD-DEG/2024 : main-d&apos;œuvre + pénalités.
            Pièces détachées (203) en attente du bordereau source.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!sites.length}>
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
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-foreground/60">
              <tr>
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Montant HT</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Lignes</th>
                <th className="px-4 py-3 text-right">Détail</th>
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
                      label={statusLabel[c.status] ?? c.status}
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
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/referentiels/contrats/${c.id}`}
                      className="text-sm font-semibold text-brand hover:underline"
                    >
                      Ouvrir
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
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">
              Nouveau contrat
            </h3>
            <div className="mt-4 grid gap-3">
              {(
                [
                  ["contract_number", "N° contrat *"],
                  ["client_name", "Client *"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm font-medium">
                  {label}
                  <input
                    className={inputClass}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="block text-sm font-medium">
                Site *
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
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Début *
                  <input
                    type="date"
                    className={inputClass}
                    value={form.start_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, start_date: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm font-medium">
                  Fin *
                  <input
                    type="date"
                    className={inputClass}
                    value={form.end_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, end_date: e.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Montant HT
                <input
                  type="number"
                  className={inputClass}
                  value={form.total_amount_ht}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, total_amount_ht: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending ? "Enregistrement…" : "Créer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

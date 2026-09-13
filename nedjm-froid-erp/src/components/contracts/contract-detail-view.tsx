"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ContractDetail } from "@/lib/actions/contracts";
import { AlertBadge } from "@/components/castle/alert-badge";

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    maximumFractionDigits: 2,
  }).format(n);
}

type Tab = "general" | "labor" | "spares" | "penalties";

export function ContractDetailView({ contract }: { contract: ContractDetail }) {
  const [tab, setTab] = useState<Tab>("general");
  const [spareQ, setSpareQ] = useState("");

  const labor = contract.items.filter((i) => i.item_type === "LABOR");
  const spares = contract.items.filter((i) => i.item_type === "SPARE_PART");
  const filteredSpares = useMemo(() => {
    const n = spareQ.trim().toLowerCase();
    if (!n) return spares;
    return spares.filter(
      (i) =>
        i.designation.toLowerCase().includes(n) ||
        i.item_code.toLowerCase().includes(n),
    );
  }, [spares, spareQ]);

  const attrs = contract.attributes;
  const penalties = (attrs.penalties ?? {}) as Record<string, unknown>;
  const contre = (attrs.contre_facturation ?? {}) as Record<string, unknown>;
  const sparePending = attrs.spare_parts_seed_status === "PENDING_SCHEDULE_FILE";

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "Informations" },
    { id: "labor", label: `Main-d'œuvre (${labor.length})` },
    { id: "spares", label: `Pièces (${spares.length})` },
    { id: "penalties", label: "Pénalités & re-facturation" },
  ];

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
        </div>
        <AlertBadge label={contract.status} tone="info" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
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

      {tab === "general" && (
        <div className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2">
          <Info label="Site" value={contract.site_name ?? "—"} />
          <Info label="Période" value={`${contract.start_date} → ${contract.end_date}`} />
          <Info label="ODS" value={contract.ods_date ?? "—"} />
          <Info label="Montant HT" value={money(contract.total_amount_ht)} />
          <Info
            label="Caution"
            value={`${(contract.caution_rate * 100).toFixed(2)}% · ${money(contract.caution_amount)}`}
          />
          <Info
            label="TVA"
            value={attrs.tva_exempt ? "Exonéré (art. 12 & 16)" : "Soumis"}
          />
        </div>
      )}

      {tab === "labor" && (
        <ItemsTable
          rows={labor}
          empty="Aucune ligne main-d'œuvre."
        />
      )}

      {tab === "spares" && (
        <div className="space-y-3">
          {sparePending ? (
            <div className="rounded-md border border-alert-warning/40 bg-alert-warning/10 px-4 py-3 text-sm text-alert-warning">
              203 pièces détachées non importées : fichier bordereau absent du
              dépôt. Fournissez le CSV/Excel pour compléter le seed.
            </div>
          ) : null}
          <input
            className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm"
            placeholder="Filtrer désignation / code…"
            value={spareQ}
            onChange={(e) => setSpareQ(e.target.value)}
          />
          <ItemsTable
            rows={filteredSpares}
            empty="Aucune pièce détachée."
          />
        </div>
      )}

      {tab === "penalties" && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <h3 className="font-semibold">Contre-facturation</h3>
          <ul className="list-disc space-y-1 ps-5 text-sm text-foreground/80">
            <li>
              Hébergement / restauration :{" "}
              {String(contre.hebergement_restauration_da_per_day_agent ?? "—")}{" "}
              DA / jour / agent
            </li>
            <li>
              Carburant : {String(contre.carburant_da_per_liter ?? "—")} DA / L
            </li>
          </ul>
          <h3 className="font-semibold">Pénalités</h3>
          <ul className="list-disc space-y-1 ps-5 text-sm text-foreground/80">
            <li>
              Absence Chef :{" "}
              {JSON.stringify(penalties.chef_absence ?? {})}
            </li>
            <li>
              Absence Technicien :{" "}
              {JSON.stringify(penalties.technician_absence ?? {})}
            </li>
            <li>
              Retard salaires :{" "}
              {JSON.stringify(penalties.salary_delay ?? {})}
            </li>
            <li>
              Panne matériel / véhicule :{" "}
              {JSON.stringify(penalties.equipment_vehicle_failure ?? {})}
            </li>
            <li>
              Plafond : {String(penalties.max_cap_rate ?? "—")} du montant
              contrat
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-foreground/50">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function ItemsTable({
  rows,
  empty,
}: {
  rows: ContractDetail["items"];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-foreground/60">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Désignation</th>
            <th className="px-3 py-2">Qté</th>
            <th className="px-3 py-2">P.U. HT</th>
            <th className="px-3 py-2">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-xs">{r.item_code}</td>
              <td className="px-3 py-2">{r.designation}</td>
              <td className="px-3 py-2">
                {r.quantity} {r.unit}
              </td>
              <td className="px-3 py-2">{money(r.unit_price_ht)}</td>
              <td className="px-3 py-2">{money(r.total_price_ht)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

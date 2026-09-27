"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientRow } from "@/lib/actions/clients";

export function ClientsManager({
  clients,
  loadError,
  canWrite,
}: {
  clients: ClientRow[];
  loadError?: string;
  canWrite: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) =>
      [client.nom_fr, client.nom_ar, client.code_client, client.nif, client.wilaya]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [clients, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Référentiels · clients</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Clients</h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/70">
            Un client de référence. Les contrats le choisissent au lieu de ressaisir le nom.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/referentiels/clients/nouveau"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm shadow-brand/20 hover:bg-brand-hover"
          >
            Nouveau client
          </Link>
        ) : null}
      </div>

      {loadError ? (
        <div
          role="alert"
          className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-4 py-3 text-sm text-alert-critical"
        >
          {loadError}
        </div>
      ) : null}

      <input
        className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm"
        placeholder="Nom, code, NIF, wilaya"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-foreground/70">Aucun client.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-foreground/60">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Wilaya</th>
                <th className="px-4 py-3">NIF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="border-t border-border">
                  <td className="px-4 py-3">{client.code_client ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/referentiels/clients/${client.id}`}
                      className="font-semibold text-brand hover:underline"
                    >
                      {client.nom_fr}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{client.wilaya ?? "—"}</td>
                  <td className="px-4 py-3">{client.nif ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

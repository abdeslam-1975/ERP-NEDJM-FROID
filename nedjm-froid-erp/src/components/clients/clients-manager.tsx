"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import type { ClientRow } from "@/lib/actions/clients";

const col = dataColumns<ClientRow>();

export function ClientsManager({
  clients,
  loadError,
  canWrite,
}: {
  clients: ClientRow[];
  loadError?: string;
  canWrite: boolean;
}) {
  const columns = useMemo(
    () => [
      col.accessor((c) => c.code_client ?? "", { id: "code", header: "Code", cell: (info) => info.getValue() || "—" }),
      col.accessor("nom_fr", {
        header: "Nom",
        cell: (info) => (
          <Link href={`/referentiels/clients/${info.row.original.id}`} className="font-semibold text-brand hover:underline">
            {info.getValue()}
          </Link>
        ),
      }),
      col.accessor((c) => c.wilaya ?? "", { id: "wilaya", header: "Wilaya", cell: (info) => info.getValue() || "—" }),
      col.accessor((c) => c.nif ?? "", { id: "nif", header: "NIF", cell: (info) => info.getValue() || "—" }),
    ],
    [],
  );

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
          <Button asChild>
            <Link href="/referentiels/clients/nouveau">
              <Plus aria-hidden />
              Nouveau client
            </Link>
          </Button>
        ) : null}
      </div>

      {loadError ? <Alert tone="danger">{loadError}</Alert> : null}

      <DataTable
        data={clients}
        columns={columns}
        getRowId={(c) => c.id}
        searchPlaceholder="Nom, code, NIF, wilaya"
        searchText={(c) => [c.nom_fr, c.nom_ar, c.code_client, c.nif, c.wilaya].filter(Boolean).join(" ")}
        initialSorting={[{ id: "nom_fr", desc: false }]}
        emptyTitle="Aucun client"
      />
    </div>
  );
}

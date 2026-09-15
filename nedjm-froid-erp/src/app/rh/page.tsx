import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

export default function RhPage() {
  return (
    <AppShell title="Ressources Humaines">
      <div className="space-y-4 rounded-lg border border-border bg-surface p-8">
        <p className="text-sm font-medium text-brand">
          Module RH · الموارد البشرية
        </p>
        <h2 className="font-display text-2xl font-semibold">
          Espace Ressources Humaines
        </h2>
        <p className="max-w-2xl text-foreground/70">
          Gestion des fiches employés pour le hub contrats (consommation MO et
          pénalités). Les contrats RH salariaux restent un module séparé.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/rh/employes"
            className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Employés
          </Link>
          <Link
            href="/rh/contrats"
            className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:bg-brand-muted"
          >
            Contrats RH
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

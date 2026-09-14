import { AppShell } from "@/components/layout/app-shell";

export default function RhPage() {
  return (
    <AppShell title="Ressources Humaines">
      <div className="rounded-lg border border-border bg-surface p-8">
        <p className="text-sm font-medium text-brand">
          Module RH · الموارد البشرية
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">
          Espace Ressources Humaines
        </h2>
        <p className="mt-2 max-w-2xl text-foreground/70">
          Écran placeholder. Les fiches employés et contrats (`hr_employees`,
          `hr_contracts`) seront branchés ici. Le filtrage par site actif
          respectera l&apos;affectation principale du contrat.
        </p>
      </div>
    </AppShell>
  );
}

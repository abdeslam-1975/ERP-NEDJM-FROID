import { AppShell } from "@/components/layout/app-shell";

export default function ParametresPage() {
  return (
    <AppShell title="Paramètres">
      <div className="rounded-lg border border-border bg-surface p-8">
        <p className="text-sm font-medium text-brand">
          Paramètres · الإعدادات
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">
          Paramètres de l&apos;espace de travail
        </h2>
        <p className="mt-2 max-w-2xl text-foreground/70">
          Écran placeholder. Rôles, variables légales, barème IRG et clôture des
          périodes seront accessibles depuis ce module.
        </p>
        <ul className="mt-6 list-disc space-y-2 ps-5 text-sm text-foreground/75">
          <li>Utilisateurs &amp; invitations (`sys_users`)</li>
          <li>Rôles &amp; matrice (`sys_roles`, `sys_permissions`)</li>
          <li>Variables légales (`ref_global_vars`)</li>
        </ul>
      </div>
    </AppShell>
  );
}

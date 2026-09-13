import { AppShell } from "@/components/layout/app-shell";
import { AlertBadge } from "@/components/castle/alert-badge";
import { CompletenessKpis } from "@/components/castle/completeness-kpis";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");

  const kpis = [
    {
      label: "Rôle principal",
      value:
        workspace.roles.find((r) => r.siteId === null)?.roleCode ??
        workspace.roles[0]?.roleCode ??
        "—",
      hint: workspace.isSuperAdmin
        ? "Périmètre global SUPER_ADMIN"
        : "Périmètre selon affectations site",
      tone: "ok" as const,
    },
    {
      label: "Sites accessibles",
      value: String(workspace.accessibleSites.length),
      hint:
        workspace.accessibleSites.length === 0
          ? "Aucun chantier dans le périmètre"
          : workspace.accessibleSites.map((s) => s.nameFr).join(", "),
      tone:
        workspace.accessibleSites.length === 0
          ? ("warn" as const)
          : ("ok" as const),
    },
    {
      label: "Site actif",
      value: workspace.activeSite?.nameFr ?? "—",
      hint: workspace.activeSite?.nameAr
        ? workspace.activeSite.nameAr
        : "Sélectionnez un site dans la barre supérieure",
      tone: workspace.activeSite ? ("ok" as const) : ("warn" as const),
    },
    {
      label: "Statut compte",
      value: workspace.status,
      hint: workspace.email,
      tone: "ok" as const,
    },
  ];

  return (
    <AppShell title="Tableau de Bord">
      <div className="space-y-8">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand">
              Perspective Château · لوحة القيادة
            </p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">
              Bienvenue, {workspace.fullName}
            </h2>
            <p className="mt-2 text-base text-foreground/70">
              Espace de travail NEDJM FROID. Les données opérationnelles sont
              filtrées selon vos rôles (`sys_user_site_roles`) et le site actif
              sélectionné (référentiel `ref_sites`).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspace.isSuperAdmin ? (
              <AlertBadge label="SUPER_ADMIN" tone="info" />
            ) : (
              <AlertBadge label="Accès site" tone="warning" />
            )}
            {workspace.activeSite ? (
              <AlertBadge
                label={workspace.activeSite.nameFr}
                tone="success"
              />
            ) : (
              <AlertBadge label="Site non sélectionné" tone="critical" />
            )}
          </div>
        </section>

        <CompletenessKpis items={kpis} />

        <section className="rounded-lg border border-border bg-surface p-6">
          <h3 className="font-display text-lg font-semibold">
            Périmètre sites
            <span className="ml-2 text-sm font-normal text-foreground/55">
              نطاق المواقع
            </span>
          </h3>
          <p className="mt-1 text-sm text-foreground/65">
            Exemples cibles métier : Hassi Messaoud, Sétif, Istanbul — créez-les
            dans Gestion des Sites. Le site actif guide le filtrage applicatif ;
            PostgreSQL RLS reste la source de vérité.
          </p>

          {workspace.accessibleSites.length === 0 ? (
            <div className="mt-6 flex min-h-40 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted px-4 text-center text-sm text-foreground/60">
              Aucun chantier accessible. Créez un site ou vérifiez
              `sys_user_site_roles`.
            </div>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {workspace.accessibleSites.map((site) => {
                const isActive = workspace.activeSite?.id === site.id;
                return (
                  <li
                    key={site.id}
                    className={`rounded-lg border p-4 ${
                      isActive
                        ? "border-brand bg-brand-muted"
                        : "border-border bg-background"
                    }`}
                  >
                    <p className="font-semibold text-foreground">{site.nameFr}</p>
                    {site.nameAr ? (
                      <p className="text-sm text-foreground/60" dir="rtl">
                        {site.nameAr}
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono text-xs text-brand">{site.code}</p>
                    {site.wilaya ? (
                      <p className="mt-1 text-xs text-foreground/55">{site.wilaya}</p>
                    ) : null}
                    {isActive ? (
                      <p className="mt-2 text-xs font-semibold text-brand">
                        Site actif
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

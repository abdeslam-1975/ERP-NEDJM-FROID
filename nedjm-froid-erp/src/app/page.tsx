import { AppShell } from "@/components/layout/app-shell";
import { AlertBadge } from "@/components/castle/alert-badge";
import { CinematicHero } from "@/components/dashboard/cinematic-hero";
import { CompletenessKpis } from "@/components/castle/completeness-kpis";
import { loadDashboardScenes } from "@/lib/actions/dashboard-showcase";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const REDIRECT_NOTICES: Record<string, string> = {
  hidden:
    "Cette page n'est pas affichée pour votre rôle (Paramètres → Interface). · هذه الصفحة غير معروضة لدورك.",
  forbidden: "Accès refusé pour votre rôle. · الوصول مرفوض لدورك.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  const [{ error }, scenes] = await Promise.all([searchParams, loadDashboardScenes()]);
  const notice = error ? REDIRECT_NOTICES[error] : undefined;

  const kpis = [
    {
      labelAr: "الدور الرئيسي",
      label: "Rôle principal",
      value:
        workspace.roles.find((r) => r.siteId === null)?.roleCode ??
        workspace.roles[0]?.roleCode ??
        "—",
      hintAr: workspace.isSuperAdmin ? "نطاق عام" : "حسب مواقع التكليف",
      hint: workspace.isSuperAdmin ? "Périmètre global SUPER_ADMIN" : "Périmètre selon affectations site",
      tone: "ok" as const,
    },
    {
      labelAr: "المواقع المتاحة",
      label: "Sites accessibles",
      value: String(workspace.accessibleSites.length),
      hintAr: workspace.accessibleSites.length === 0 ? "لا توجد ورشة في النطاق" : undefined,
      hint:
        workspace.accessibleSites.length === 0
          ? "Aucun chantier dans le périmètre"
          : workspace.accessibleSites.map((s) => s.nameFr).join(", "),
      tone: workspace.accessibleSites.length === 0 ? ("warn" as const) : ("ok" as const),
    },
    {
      labelAr: "الموقع النشط",
      label: "Site actif",
      value: workspace.activeSite?.nameFr ?? "—",
      hintAr: workspace.activeSite?.nameAr ?? "اختر موقعاً من الشريط العلوي",
      hint: workspace.activeSite ? "Site sélectionné" : "Sélectionnez un site dans la barre supérieure",
      tone: workspace.activeSite ? ("ok" as const) : ("warn" as const),
    },
    {
      labelAr: "حالة الحساب",
      label: "Statut compte",
      value: workspace.status,
      hint: workspace.email,
      tone: "ok" as const,
    },
  ];

  return (
    <AppShell title="Tableau de Bord" fit>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {notice ? (
          <p className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {notice}
          </p>
        ) : null}
        {scenes.length > 0 ? (
          <CinematicHero
            canEdit={workspace.isSuperAdmin}
            scenes={scenes}
            kpis={kpis.map(({ labelAr, label, value, hintAr, hint }) => ({ labelAr, label, value, hintAr, hint }))}
          />
        ) : (
          <>
            <section className="flex shrink-0 flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p dir="rtl" className="text-sm font-medium text-brand">
                  لوحة القيادة
                </p>
                <p className="text-xs text-foreground/45">Perspective Château</p>
                <h2 dir="rtl" className="mt-2 font-display text-3xl font-semibold tracking-tight">
                  مرحباً، {workspace.fullName}
                </h2>
                <p className="text-sm text-foreground/55">Bienvenue, {workspace.fullName}</p>
                <p className="mt-2 text-base text-foreground/70">
                  Espace de travail NEDJM FROID. Les données opérationnelles sont filtrées selon vos rôles
                  (`sys_user_site_roles`) et le site actif sélectionné (référentiel `ref_sites`).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {workspace.isSuperAdmin ? <AlertBadge label="SUPER_ADMIN" tone="info" /> : <AlertBadge label="Accès site" tone="warning" />}
                {workspace.activeSite ? (
                  <AlertBadge label={workspace.activeSite.nameFr} tone="success" />
                ) : (
                  <AlertBadge label="Site non sélectionné" tone="critical" />
                )}
              </div>
            </section>
            <CompletenessKpis items={kpis} />
        <section className="min-h-0 flex-1 overflow-hidden rounded-[1.75rem] border border-border/70 bg-surface p-5 shadow-[var(--card-shadow)]">
          <h3 className="font-display text-lg font-semibold">
            <span className="flex items-center justify-end gap-2.5">
              <span dir="rtl">نطاق المواقع</span>
              <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
            </span>
            <span className="mt-0.5 block text-right text-sm font-normal text-foreground/45">Périmètre sites</span>
          </h3>
          <p dir="rtl" className="mt-3 text-right text-sm leading-relaxed text-foreground/70">
            المواقع المتاحة لهذا الحساب. الموقع النشط هو الذي يصفّي بيانات العمل.
          </p>
          <p className="mt-1 text-right text-sm text-foreground/50">
            Chantiers ouverts pour ce compte. Le site actif filtre les données de travail.
          </p>

          {workspace.accessibleSites.length === 0 ? (
            <div className="mt-6 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted px-4 text-center text-sm text-foreground/60">
              Aucun chantier accessible. Créez un site ou vérifiez
              `sys_user_site_roles`.
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-3">
              {workspace.accessibleSites.map((site) => {
                const isActive = workspace.activeSite?.id === site.id;
                return (
                  <li
                    key={site.id}
                    className={`rounded-2xl border p-4 text-right transition ${
                      isActive
                        ? "border-brand/40 bg-brand-muted shadow-[var(--card-shadow)]"
                        : "border-border/80 bg-background"
                    }`}
                  >
                    {site.nameAr ? (
                      <p className="font-semibold text-foreground" dir="rtl">
                        {site.nameAr}
                      </p>
                    ) : null}
                    <p className={site.nameAr ? "text-sm text-foreground/55" : "font-semibold text-foreground"} dir="ltr">
                      {site.nameFr}
                    </p>
                    <p className="mt-3 font-mono text-xs tracking-wide text-brand">{site.code}</p>
                    {site.wilaya ? (
                      <p className="mt-1 text-xs text-foreground/55">{site.wilaya}</p>
                    ) : null}
                    {isActive ? (
                      <p className="mt-3 inline-flex rounded-full bg-brand px-2.5 py-1 text-[0.7rem] font-semibold text-white">
                        <span dir="rtl">الموقع النشط</span>
                        <span className="mx-1.5 opacity-60" aria-hidden>
                          ·
                        </span>
                        Site actif
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

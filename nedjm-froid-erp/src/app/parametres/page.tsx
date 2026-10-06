import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RH_CARD, RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { SettingsGlyph } from "@/components/settings/settings-icons";
import { TestDataResetCard } from "@/components/settings/test-data-reset-card";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { getUiLayout } from "@/lib/ui/layout";
import { resolveSettingsGroups } from "@/lib/ui/settings-center";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ParametresPage() {
  const [workspace, layout] = await Promise.all([getWorkspaceProfile(), getUiLayout()]);
  const groups = workspace
    ? resolveSettingsGroups(layout, { isSuperAdmin: workspace.isSuperAdmin, roleCodes: workspace.roles.map((r) => r.roleCode) })
    : [];

  return (
    <AppShell title="Paramètres">
      <RhPage>
        <RhPageHeader
          eyebrow="Administration · الإدارة"
          title="Paramètres · الإعدادات"
          description="Chaque réglage a une seule place, ici. Les pages de travail y renvoient directement ; vous ne voyez que les sections ouvertes à votre rôle."
        />
        <div className="grid gap-5 2xl:grid-cols-2">
          {groups.map((group) => (
            <section key={group.key} className={cn(RH_CARD, "overflow-hidden")}>
              <header
                className="flex items-center gap-4 border-b border-border/60 p-5"
                style={{ background: `linear-gradient(135deg, ${group.color}1f, ${group.color}05 70%)` }}
              >
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
                  style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}b3)` }}
                >
                  <SettingsGlyph icon={group.icon} className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-baseline gap-x-2 font-display text-lg font-semibold text-foreground">
                    {group.titleFr}
                    <span className="text-sm font-normal text-foreground/50" dir="rtl">
                      {group.titleAr}
                    </span>
                  </h3>
                  <p className="text-sm text-foreground/60">{group.descriptionFr}</p>
                </div>
                <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-foreground/60 shadow-sm">
                  {group.sections.length}
                </span>
              </header>
              <ul className="grid gap-1 p-2.5 sm:grid-cols-2">
                {group.sections.map((s) => (
                  <li key={s.id}>
                    <Link href={s.href} className="group flex h-full items-start gap-3 rounded-2xl p-3 transition hover:bg-surface-muted">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                        style={{ background: `${group.color}17`, color: group.color }}
                      >
                        <SettingsGlyph icon={s.icon} className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{s.labelFr}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-foreground/55">{s.descriptionFr}</span>
                      </span>
                      <ChevronRight
                        className="mt-2 size-4 shrink-0 text-foreground/25 transition group-hover:translate-x-0.5 group-hover:text-brand"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {workspace?.isSuperAdmin ? <TestDataResetCard /> : null}
      </RhPage>
    </AppShell>
  );
}

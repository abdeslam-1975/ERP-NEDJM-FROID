import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { RhPageHeader } from "@/components/rh/rh-ui";
import { TestDataResetCard } from "@/components/settings/test-data-reset-card";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { getUiLayout } from "@/lib/ui/layout";
import { isPathBlocked, resolveTabset } from "@/lib/ui/resolve";

export const dynamic = "force-dynamic";

export default async function ParametresPage() {
  const [workspace, layout] = await Promise.all([getWorkspaceProfile(), getUiLayout()]);
  const cards = resolveTabset(layout, "settings").filter(
    (card) => card.href && (!card.superAdminOnly || workspace?.isSuperAdmin) && !isPathBlocked(layout, card.href),
  );

  return (
    <AppShell title="Paramètres">
      <div className="space-y-6">
        <RhPageHeader
          eyebrow="Administration · الإدارة"
          title="Paramètres · الإعدادات"
          description="Tous les réglages de l'application au même endroit. Chaque écran garde ses propres droits d'accès."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.key}
              href={card.href!}
              className="group rounded-2xl border border-border/80 bg-surface p-5 shadow-[var(--card-shadow)] transition hover:border-brand/50"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-lg font-semibold text-foreground group-hover:text-brand">{card.label}</p>
                {card.labelArShown ? (
                  <span className="text-sm text-foreground/55" dir="rtl">
                    {card.labelArShown}
                  </span>
                ) : null}
              </div>
              {card.descriptionFr ? <p className="mt-2 text-sm text-foreground/65">{card.descriptionFr}</p> : null}
            </Link>
          ))}
        </div>
        {workspace?.isSuperAdmin ? <TestDataResetCard /> : null}
      </div>
    </AppShell>
  );
}

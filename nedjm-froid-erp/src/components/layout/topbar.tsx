import { DisplayMenu } from "@/components/layout/display-menu";
import { SiteSwitcher } from "@/components/layout/site-switcher";
import { GlobalSearch } from "@/components/layout/global-search";
import { HistoryBackButton } from "@/components/rh/rh-back-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import type { WorkspaceProfile } from "@/lib/auth/types";
import type { NotificationRow } from "@/lib/actions/decisions";

export function Topbar({
  title,
  workspace,
  notifications = [],
}: {
  title: string;
  workspace: WorkspaceProfile;
  notifications?: NotificationRow[];
}) {
  const primaryRole =
    workspace.roles.find((r) => r.siteId === null) ??
    workspace.roles[0] ??
    null;

  const initials = workspace.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="flex min-h-[4.25rem] flex-wrap items-center justify-between gap-3 bg-transparent px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <HistoryBackButton />
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="truncate text-xs text-foreground/45">
            {new Date().toLocaleDateString("fr-DZ", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <GlobalSearch />

        <SiteSwitcher
          sites={workspace.accessibleSites}
          activeSiteId={workspace.activeSite?.id ?? null}
        />
        <DisplayMenu />
        <NotificationBell initial={notifications} />

        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface py-1.5 pl-1.5 pr-3 shadow-[var(--card-shadow)]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-xs font-bold text-white">
            {initials || "NF"}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-foreground">{workspace.fullName}</p>
            <p className="truncate text-[11px] text-foreground/45">
              {primaryRole?.roleLabelFr ?? "Utilisateur"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

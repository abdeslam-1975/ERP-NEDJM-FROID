import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SiteSwitcher } from "@/components/layout/site-switcher";
import { LogoutButton } from "@/components/layout/logout-button";
import type { WorkspaceProfile } from "@/lib/auth/types";

export function Topbar({
  title,
  workspace,
}: {
  title: string;
  workspace: WorkspaceProfile;
}) {
  const primaryRole =
    workspace.roles.find((r) => r.siteId === null) ??
    workspace.roles[0] ??
    null;

  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate font-display text-lg font-semibold text-foreground">
          {title}
        </h1>
        <p className="truncate text-xs text-foreground/55">
          {workspace.fullName}
          {primaryRole ? ` · ${primaryRole.roleLabelFr}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SiteSwitcher
          sites={workspace.accessibleSites}
          activeSiteId={workspace.activeSite?.id ?? null}
        />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}

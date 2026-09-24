import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SiteSwitcher } from "@/components/layout/site-switcher";
import { HistoryBackButton } from "@/components/rh/rh-back-button";
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
        <div className="hidden items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 shadow-[var(--card-shadow)] md:flex">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-foreground/35" aria-hidden>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            className="w-44 bg-transparent text-sm outline-none placeholder:text-foreground/35 lg:w-56"
            placeholder="Rechercher… · بحث"
            readOnly
            aria-label="Recherche"
          />
        </div>

        <SiteSwitcher
          sites={workspace.accessibleSites}
          activeSiteId={workspace.activeSite?.id ?? null}
        />
        <ThemeToggle />

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

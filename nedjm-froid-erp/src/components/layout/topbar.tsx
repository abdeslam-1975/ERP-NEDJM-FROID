import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { ArrangeButton } from "@/components/layout/arrange";
import { DisplayMenu } from "@/components/layout/display-menu";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationBell } from "@/components/layout/notification-bell";
import type { NotificationRow } from "@/lib/actions/decisions";

/** Glass bar on top of every page: module tabs (or the page title) on the left, tools on the right. */
export function Topbar({
  title,
  nav,
  subnav,
  notifications = [],
}: {
  title: string;
  nav?: ReactNode;
  subnav?: ReactNode;
  notifications?: NotificationRow[];
}) {
  const month = new Date().toLocaleDateString("fr-FR", { month: "short", year: "numeric" });

  return (
    <header className="sticky top-3 z-30 px-4 pt-3 sm:px-6 print:hidden">
      <div className="ui-glass rounded-2xl">
        <div className="flex items-center gap-2 p-1">
          {nav ?? (
            <h1 className="min-w-0 flex-1 truncate px-3 text-base font-semibold tracking-tight text-foreground">{title}</h1>
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            <GlobalSearch />
            <ArrangeButton />
            <DisplayMenu />
            <NotificationBell initial={notifications} />
            <span className="ml-1 hidden h-10 items-center gap-2 rounded-xl border border-border/80 bg-surface px-3.5 text-sm font-medium capitalize text-foreground/75 min-[1700px]:inline-flex">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {month}
            </span>
          </div>
        </div>
        {subnav}
      </div>
    </header>
  );
}

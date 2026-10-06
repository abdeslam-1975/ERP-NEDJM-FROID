import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppProviders, PageTransition } from "@/components/layout/app-providers";
import { ArrangeBar } from "@/components/layout/arrange";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UiLayoutProvider } from "@/components/layout/ui-layout-context";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { listMyNotifications } from "@/lib/actions/decisions";
import { PATHNAME_HEADER } from "@/lib/supabase/middleware";
import { designCss } from "@/lib/ui/design";
import { getUiLayout } from "@/lib/ui/layout";
import { isPathBlocked, themeCss } from "@/lib/ui/resolve";

export async function AppShell({
  title,
  nav,
  subnav,
  tools,
  children,
}: {
  title: string;
  /** Module tabs shown in the top bar in place of the title. */
  nav?: ReactNode;
  /** Second row of the top bar, under the module tabs. */
  subnav?: ReactNode;
  /** Module-specific buttons of the top bar. */
  tools?: ReactNode;
  children: ReactNode;
}) {
  const workspace = await getWorkspaceProfile();

  if (!workspace) {
    redirect("/login");
  }
  const [layout, requestHeaders] = await Promise.all([getUiLayout(), headers()]);
  const pathname = requestHeaders.get(PATHNAME_HEADER);
  if (pathname && isPathBlocked(layout, pathname)) {
    redirect("/?error=hidden");
  }
  const notifications = await listMyNotifications().catch(() => null);
  const css = designCss(layout.design, layout.prefs) + themeCss(layout.theme);
  const primaryRole = workspace.roles.find((r) => r.siteId === null) ?? workspace.roles[0] ?? null;
  const initials = workspace.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <UiLayoutProvider value={layout}>
      <style>{css}</style>
      <AppProviders
        animations={layout.design?.animations ?? true}
        userMode={layout.prefs.mode}
        defaultMode={layout.design?.default_mode ?? null}
      >
        <div className="relative isolate flex min-h-screen bg-background text-foreground">
          <div aria-hidden className="ui-app-glow pointer-events-none fixed inset-0 -z-10 print:hidden" />
          <Sidebar
            user={{
              name: workspace.fullName,
              role: primaryRole?.roleLabelFr ?? "Utilisateur",
              initials: initials || "NF",
            }}
            sites={workspace.accessibleSites}
            activeSiteId={workspace.activeSite?.id ?? null}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              title={title}
              nav={nav}
              subnav={subnav}
              tools={tools}
              notifications={notifications?.ok ? notifications.data.rows : []}
            />
            <main className="flex-1 px-4 pt-7 pb-8 sm:px-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
        <ArrangeBar />
      </AppProviders>
    </UiLayoutProvider>
  );
}

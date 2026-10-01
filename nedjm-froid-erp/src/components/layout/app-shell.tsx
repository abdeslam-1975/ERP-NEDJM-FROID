import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UiLayoutProvider } from "@/components/layout/ui-layout-context";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { listMyNotifications } from "@/lib/actions/decisions";
import { PATHNAME_HEADER } from "@/lib/supabase/middleware";
import { getUiLayout } from "@/lib/ui/layout";
import { isPathBlocked, themeCss } from "@/lib/ui/resolve";

export async function AppShell({
  title,
  children,
}: {
  title: string;
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
  const css = themeCss(layout.theme);

  return (
    <UiLayoutProvider value={layout}>
      {css ? <style>{css}</style> : null}
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title={title}
            workspace={workspace}
            notifications={notifications?.ok ? notifications.data.rows : []}
          />
          <main className="flex-1 px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
        </div>
      </div>
    </UiLayoutProvider>
  );
}

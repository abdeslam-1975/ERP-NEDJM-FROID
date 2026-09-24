import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";

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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} workspace={workspace} />
        <main className="flex-1 px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}

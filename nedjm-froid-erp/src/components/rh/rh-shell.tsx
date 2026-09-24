import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RhModuleNav } from "@/components/rh/rh-module-nav";

/** Shell RH : navigation interne du module (hors sidebar globale). */
export function RhShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <AppShell title={title}>
      <div className="space-y-4">
        <RhModuleNav />
        {children}
      </div>
    </AppShell>
  );
}

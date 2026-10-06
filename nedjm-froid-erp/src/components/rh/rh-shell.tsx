import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { HrAssistant } from "@/components/rh/hr-assistant";
import { RhSectionTabs, RhSubTabs } from "@/components/rh/rh-module-nav";

/** Shell RH : les sections du module remplacent le titre dans la barre du haut. */
export function RhShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <AppShell title={title} nav={<RhSectionTabs />} subnav={<RhSubTabs />} tools={<HrAssistant />}>
      {children}
    </AppShell>
  );
}

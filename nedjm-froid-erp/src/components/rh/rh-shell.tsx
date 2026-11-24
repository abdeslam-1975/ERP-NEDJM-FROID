import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { HrAssistant } from "@/components/rh/hr-assistant";
import { RhSenseBand } from "@/components/rh/rh-sense-band";
import { RhSectionTabs, RhSubTabs } from "@/components/rh/rh-module-nav";

/** Shell RH : les sections du module remplacent le titre dans la barre du haut. */
export async function RhShell({
  title,
  children,
  band = true,
}: {
  title: string;
  children: ReactNode;
  /** The overview draws the meaning cards under its own title. */
  band?: boolean;
}) {
  return (
    <AppShell title={title} nav={<RhSectionTabs />} subnav={<RhSubTabs />} tools={<HrAssistant />}>
      {band ? <RhSenseBand /> : null}
      {children}
    </AppShell>
  );
}

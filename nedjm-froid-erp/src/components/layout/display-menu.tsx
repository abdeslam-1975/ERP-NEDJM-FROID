"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Monitor, Moon, Rows3, Sun } from "lucide-react";
import { useUiLayout } from "@/components/layout/ui-layout-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { saveMyDisplayPrefs } from "@/lib/actions/ui-prefs";
import type { Density, DisplayMode } from "@/lib/ui/design";

function subscribe() {
  return () => {};
}

const DENSITY_LABELS: Record<Density, string> = { compact: "Compacte", normal: "Normale", comfortable: "Aérée" };

/** Personal display choices: light / dark mode and density, saved on the user's account. */
export function DisplayMenu() {
  const router = useRouter();
  const layout = useUiLayout();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [density, setDensity] = useState<Density | null>(layout.prefs.density);
  const [, startTransition] = useTransition();
  const mode = (mounted ? theme : null) as DisplayMode | null;

  function persist(next: { mode: DisplayMode | null; density: Density | null }, refresh: boolean) {
    startTransition(async () => {
      const res = await saveMyDisplayPrefs(next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (refresh) router.refresh();
    });
  }

  function chooseMode(value: string) {
    const next = value as DisplayMode;
    setTheme(next);
    persist({ mode: next, density }, false);
  }

  function chooseDensity(value: string) {
    const next = value === "default" ? null : (value as Density);
    setDensity(next);
    persist({ mode: mode ?? layout.prefs.mode, density: next }, true);
  }

  const Icon = !mounted ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-foreground/75 shadow-[var(--card-shadow)] transition hover:bg-brand-muted hover:text-foreground"
          aria-label="Affichage : mode clair / sombre et densité"
        >
          <Icon className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Mode · الوضع</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode ?? "system"} onValueChange={chooseMode}>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden /> Clair
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden /> Sombre
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden /> Selon l&apos;appareil
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Densité · الكثافة</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density ?? "default"} onValueChange={chooseDensity}>
          <DropdownMenuRadioItem value="default">
            <Rows3 aria-hidden /> Par défaut ({DENSITY_LABELS[layout.design.density]})
          </DropdownMenuRadioItem>
          {(Object.keys(DENSITY_LABELS) as Density[]).map((d) => (
            <DropdownMenuRadioItem key={d} value={d}>
              <Rows3 aria-hidden /> {DENSITY_LABELS[d]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

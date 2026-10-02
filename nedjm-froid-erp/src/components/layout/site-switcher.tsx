"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { setActiveSiteAction } from "@/lib/actions/auth";
import type { WorkspaceSite } from "@/lib/auth/types";

export function SiteSwitcher({
  sites,
  activeSiteId,
  variant = "default",
}: {
  sites: WorkspaceSite[];
  activeSiteId: string | null;
  variant?: "default" | "sidebar";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(value: string) {
    startTransition(async () => {
      const result = await setActiveSiteAction(value);
      if (result.ok) router.refresh();
    });
  }

  if (variant === "sidebar") {
    if (sites.length === 0) return null;
    return (
      <label className="relative flex items-center" title="Site actif · الموقع النشط">
        <span className="sr-only">Site actif</span>
        <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-white/60" aria-hidden />
        <select
          className="h-10 w-full cursor-pointer appearance-none truncate rounded-xl bg-white/[0.07] pr-8 pl-9 text-[13px] font-medium text-white ring-1 ring-white/10 outline-none ring-inset transition hover:bg-white/[0.12] focus:ring-white/30 disabled:opacity-60 [&>option]:bg-surface [&>option]:text-foreground"
          value={activeSiteId ?? ""}
          disabled={pending}
          onChange={(e) => change(e.target.value)}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.nameFr}
              {site.wilaya ? ` (${site.wilaya})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-white/60" aria-hidden />
      </label>
    );
  }

  if (sites.length === 0) {
    return (
      <span className="rounded-md border border-border bg-surface-muted px-2.5 py-1.5 text-xs text-foreground/60">
        Aucun site assigné
        <span className="block text-[10px] text-foreground/45">لا موقع مخصص</span>
      </span>
    );
  }

  return (
    <label className="flex flex-col text-xs text-foreground/60">
      <span className="mb-0.5 font-medium">
        Site actif <span className="text-foreground/40">· الموقع النشط</span>
      </span>
      <select
        className="h-9 min-w-[11rem] rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
        value={activeSiteId ?? ""}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
      >
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.nameFr}
            {site.nameAr ? ` — ${site.nameAr}` : ""}
            {site.wilaya ? ` (${site.wilaya})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

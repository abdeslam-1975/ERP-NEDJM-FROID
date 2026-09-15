"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveSiteAction } from "@/lib/actions/auth";
import type { WorkspaceSite } from "@/lib/auth/types";

export function SiteSwitcher({
  sites,
  activeSiteId,
}: {
  sites: WorkspaceSite[];
  activeSiteId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
        onChange={(e) => {
          const value = e.target.value;
          startTransition(async () => {
            const result = await setActiveSiteAction(value);
            if (result.ok) router.refresh();
          });
        }}
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

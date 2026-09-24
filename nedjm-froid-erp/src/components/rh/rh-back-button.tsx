"use client";

import { usePathname, useRouter } from "next/navigation";

export function HistoryBackButton({
  scope = "/rh",
  home = "/rh",
}: {
  scope?: string;
  home?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  if (!pathname?.startsWith(scope)) return null;
  if (pathname === home || pathname === `${home}/`) return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground hover:bg-surface-muted"
      aria-label="Retour à la page précédente"
    >
      <span aria-hidden>←</span>
      <span>Retour</span>
    </button>
  );
}

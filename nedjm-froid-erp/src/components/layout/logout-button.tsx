"use client";

import { logoutAction } from "@/lib/actions/auth";

export function LogoutButton({
  variant = "default",
}: {
  variant?: "default" | "sidebar";
}) {
  if (variant === "sidebar") {
    return (
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M10 7V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M4 12h11M8 8l-4 4 4 4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Déconnexion
        </button>
      </form>
    );
  }

  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
      >
        Déconnexion
      </button>
    </form>
  );
}

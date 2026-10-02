"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";

export function LogoutButton({
  variant = "default",
}: {
  variant?: "default" | "sidebar" | "icon";
}) {
  if (variant === "icon") {
    return (
      <form action={logoutAction}>
        <button
          type="submit"
          title="Déconnexion"
          aria-label="Déconnexion"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition hover:bg-white/[0.12] hover:text-white"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
      </form>
    );
  }

  if (variant === "sidebar") {
    return (
      <form action={logoutAction}>
        <button
          type="submit"
          className="group flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.07] text-sm font-semibold text-white ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.14]"
        >
          <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={1.8} aria-hidden />
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

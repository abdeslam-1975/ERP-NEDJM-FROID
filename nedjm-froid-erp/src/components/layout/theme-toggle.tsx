"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted) {
    return (
      <button
        type="button"
        className="h-9 w-9 rounded-md border border-border bg-surface"
        aria-label="Changer le thème"
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
      aria-label={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      {isDark ? "Clair" : "Sombre"}
    </button>
  );
}

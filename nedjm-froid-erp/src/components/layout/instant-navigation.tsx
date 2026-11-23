"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

function internalHref(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest("a[href]") : null;
  if (!(el instanceof HTMLAnchorElement)) return null;
  if (el.target && el.target !== "_self") return null;
  if (el.hasAttribute("download")) return null;
  const url = new URL(el.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const next = `${url.pathname}${url.search}`;
  const current = `${window.location.pathname}${window.location.search}`;
  return next === current ? null : next;
}

/** Warm a module as soon as the pointer reaches its name, and show the click at once. */
export function InstantNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    const warmed = new Set<string>();

    function warm(event: Event) {
      const href = internalHref(event.target);
      if (!href || warmed.has(href)) return;
      warmed.add(href);
      router.prefetch(href);
    }

    function start(event: MouseEvent) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (!internalHref(event.target)) return;
      setPending(true);
    }

    document.addEventListener("pointerover", warm);
    document.addEventListener("focusin", warm);
    document.addEventListener("click", start);
    return () => {
      document.removeEventListener("pointerover", warm);
      document.removeEventListener("focusin", warm);
      document.removeEventListener("click", start);
    };
  }, [router]);

  if (!pending) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden bg-brand/15" role="status" aria-label="Ouverture">
      <div className="h-full w-1/3 animate-pulse bg-brand" />
    </div>
  );
}

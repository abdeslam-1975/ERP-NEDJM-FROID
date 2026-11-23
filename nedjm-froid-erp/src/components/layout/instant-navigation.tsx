"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const AUTO_WARM_LIMIT = 24;

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

/** Prepare every visible link, and answer the press before the page arrives. */
export function InstantNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const started = `${window.location.pathname}${window.location.search}`;
    const stop = window.setTimeout(() => setPending(false), 8000);
    let frame = 0;
    const watch = () => {
      const now = `${window.location.pathname}${window.location.search}`;
      if (now !== started) {
        setPending(false);
        return;
      }
      frame = window.requestAnimationFrame(watch);
    };
    frame = window.requestAnimationFrame(watch);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(stop);
    };
  }, [pending]);

  useEffect(() => {
    const warmed = new Set<string>();
    let autoCount = 0;
    let alive = true;

    function warm(href: string) {
      if (!alive || warmed.has(href)) return;
      warmed.add(href);
      router.prefetch(href, { kind: "full" } as Parameters<typeof router.prefetch>[1]);
    }

    function fromPointer(event: Event) {
      const href = internalHref(event.target);
      if (href) warm(href);
    }

    function onPress(event: PointerEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = internalHref(event.target);
      if (!href) return;
      warm(href);
      setPending(true);
    }

    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || autoCount >= AUTO_WARM_LIMIT) continue;
        const href = internalHref(entry.target);
        observer.unobserve(entry.target);
        if (!href || warmed.has(href)) continue;
        autoCount += 1;
        warm(href);
      }
    }, { rootMargin: "160px" });

    function watch(root: ParentNode) {
      root.querySelectorAll("a[href]").forEach((node) => {
        if (!(node instanceof HTMLAnchorElement) || seen.has(node)) return;
        seen.add(node);
        observer.observe(node);
      });
    }

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLAnchorElement) watch(node.parentElement ?? document);
          else if (node instanceof Element) watch(node);
        });
      }
    });

    const start = window.setTimeout(() => {
      if (!alive) return;
      watch(document);
      mutations.observe(document.body, { childList: true, subtree: true });
    }, 250);

    document.addEventListener("pointerover", fromPointer, true);
    document.addEventListener("focusin", fromPointer, true);
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      alive = false;
      window.clearTimeout(start);
      observer.disconnect();
      mutations.disconnect();
      document.removeEventListener("pointerover", fromPointer, true);
      document.removeEventListener("focusin", fromPointer, true);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, [router, pathname]);

  if (!pending) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden bg-brand/15" role="status" aria-label="Ouverture">
      <div className="h-full w-1/3 animate-pulse bg-brand" />
    </div>
  );
}

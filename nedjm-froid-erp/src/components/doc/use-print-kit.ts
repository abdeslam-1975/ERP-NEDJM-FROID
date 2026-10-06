"use client";

import { useEffect, useState } from "react";
import { getPrintKit } from "@/lib/actions/doc-templates";
import type { PrintKit } from "@/lib/doc/print-kit";
import type { DocTypeId } from "@/lib/doc/registry";

type KitResult = { ok: true; data: PrintKit } | { ok: false; error: string };

/** Templates change rarely: a printed document may use a version approved up to this long ago. */
const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<KitResult> }>();

const keyOf = (docTypes: readonly DocTypeId[]) => [...new Set(docTypes)].sort().join(",");

export function fetchPrintKit(docTypes: readonly DocTypeId[]): Promise<KitResult> {
  const key = keyOf(docTypes);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = getPrintKit(key.split(",") as DocTypeId[]).then((r) => {
    if (!r.ok) cache.delete(key);
    return r;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** After a template or the company identity changed. */
export function clearPrintKitCache() {
  cache.clear();
}

export function usePrintKit(docTypes: readonly DocTypeId[]) {
  const key = keyOf(docTypes);
  const [state, setState] = useState<{ key: string; kit: PrintKit | null; error: string | null }>({
    key: "",
    kit: null,
    error: null,
  });
  useEffect(() => {
    let alive = true;
    fetchPrintKit(key.split(",") as DocTypeId[]).then((r) => {
      if (alive) setState({ key, kit: r.ok ? r.data : null, error: r.ok ? null : r.error });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  const current = state.key === key;
  return { kit: current ? state.kit : null, error: current ? state.error : null };
}

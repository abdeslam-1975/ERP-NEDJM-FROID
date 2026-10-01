"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { DEFAULT_LAYOUT, applyTabs, type UiLayoutData } from "@/lib/ui/resolve";

const UiLayoutContext = createContext<UiLayoutData>(DEFAULT_LAYOUT);

export function UiLayoutProvider({ value, children }: { value: UiLayoutData; children: ReactNode }) {
  return <UiLayoutContext.Provider value={value}>{children}</UiLayoutContext.Provider>;
}

export function useUiLayout(): UiLayoutData {
  return useContext(UiLayoutContext);
}

/**
 * Tabs of `tabset` as chosen in Paramètres → Interface. When the selected tab is hidden, the first visible
 * one is selected instead. Without `tabset` the items are returned unchanged.
 */
export function useUiTabs<T extends { id: string; label: string }>(
  tabset: string | undefined,
  items: T[],
  value?: string,
  onChange?: (id: T["id"]) => void,
): T[] {
  const data = useUiLayout();
  const shown = useMemo(() => (tabset ? applyTabs(data, tabset, items) : items), [data, tabset, items]);
  const fallback = shown[0]?.id;
  const selectedVisible = value === undefined || shown.some((item) => item.id === value);
  useEffect(() => {
    if (!selectedVisible && fallback !== undefined) onChange?.(fallback);
  }, [selectedVisible, fallback, onChange]);
  return shown;
}

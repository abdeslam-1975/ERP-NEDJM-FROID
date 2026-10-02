"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { resetArrangement, saveArrangement, type ArrangeList, type ArrangeTarget } from "@/lib/actions/ui-arrange";
import { NAV_GROUPS_TABSET, RH_SECTIONS_TABSET, findTabset, itemKey, keysOfTabset } from "@/lib/ui/registry";
import {
  DEFAULT_LAYOUT,
  applyTabs,
  resolveNav,
  resolveRhSections,
  resolveTabset,
  type UiLayoutData,
  type UiPersonalOrder,
} from "@/lib/ui/resolve";

const UiLayoutContext = createContext<UiLayoutData>(DEFAULT_LAYOUT);

/** A list currently on screen that can be rearranged (tabs or page buttons), with the labels it shows. */
export type ArrangeableList = { tabset: string; items: { id: string; label: string }[] };

type ArrangeApi = {
  active: boolean;
  canShare: boolean;
  target: ArrangeTarget;
  setTarget: (target: ArrangeTarget) => void;
  dirty: boolean;
  pending: boolean;
  error: string | null;
  lists: ArrangeableList[];
  start: () => void;
  cancel: () => void;
  save: () => void;
  reset: () => void;
  /** New order of a list of tabs or buttons (runtime ids, as rendered). */
  reorder: (tabset: string, ids: string[]) => void;
  /** New side menu: groups in order, and the modules of each group in order. */
  reorderNav: (groups: { key: string; items: string[] }[]) => void;
  register: (list: ArrangeableList) => () => void;
};

const noop = () => {};
const ArrangeContext = createContext<ArrangeApi>({
  active: false,
  canShare: false,
  target: "me",
  setTarget: noop,
  dirty: false,
  pending: false,
  error: null,
  lists: [],
  start: noop,
  cancel: noop,
  save: noop,
  reset: noop,
  reorder: noop,
  reorderNav: noop,
  register: () => noop,
});

function positions(keys: string[], group?: string | null): Record<string, UiPersonalOrder> {
  const out: Record<string, UiPersonalOrder> = {};
  keys.forEach((key, index) => {
    out[key] = { sort_order: (index + 1) * 10, group_key: group ?? null };
  });
  return out;
}

export function UiLayoutProvider({ value, children }: { value: UiLayoutData; children: ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [target, setTarget] = useState<ArrangeTarget>("me");
  const [draft, setDraft] = useState<Record<string, UiPersonalOrder>>({});
  const [touched, setTouched] = useState<string[]>([]);
  const [lists, setLists] = useState<ArrangeableList[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Fresh server data after a save: the draft has become the saved order.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if (!active) {
      setDraft({});
      setTouched([]);
    }
  }

  const layout = useMemo<UiLayoutData>(
    () => (Object.keys(draft).length ? { ...value, personal: { ...value.personal, ...draft } } : value),
    [value, draft],
  );

  const touch = useCallback((tabsets: string[]) => {
    setTouched((prev) => [...new Set([...prev, ...tabsets])]);
  }, []);

  const reorder = useCallback(
    (tabset: string, ids: string[]) => {
      setDraft((prev) => ({ ...prev, ...positions(ids.map((id) => itemKey(tabset, id))) }));
      touch([tabset]);
    },
    [touch],
  );

  const reorderNav = useCallback(
    (groups: { key: string; items: string[] }[]) => {
      setDraft((prev) => {
        const next = { ...prev, ...positions(groups.map((g) => g.key)) };
        let index = 0;
        for (const group of groups) {
          for (const key of group.items) {
            index += 1;
            next[key] = { sort_order: index * 10, group_key: group.key };
          }
        }
        return next;
      });
      touch(["nav", NAV_GROUPS_TABSET]);
    },
    [touch],
  );

  const register = useCallback((list: ArrangeableList) => {
    setLists((prev) => {
      const same = prev.find((l) => l.tabset === list.tabset);
      if (same && JSON.stringify(same.items) === JSON.stringify(list.items)) return prev;
      return [...prev.filter((l) => l.tabset !== list.tabset), list];
    });
    return () => setLists((prev) => prev.filter((l) => l.tabset !== list.tabset));
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    setError(null);
  }, []);

  const save = useCallback(() => {
    if (!touched.length) {
      finish();
      return;
    }
    const payload: ArrangeList[] = [];
    const nav = resolveNav(layout, { includeEmpty: true });
    for (const tabset of touched) {
      if (tabset === NAV_GROUPS_TABSET) {
        payload.push({ tabset, items: nav.map((g) => ({ key: g.key })) });
      } else if (tabset === "nav") {
        payload.push({ tabset, items: nav.flatMap((g) => g.items.map((i) => ({ key: i.key, group_key: g.key }))) });
      } else if (tabset === RH_SECTIONS_TABSET) {
        payload.push({ tabset, items: resolveRhSections(layout).map((s) => ({ key: itemKey(tabset, s.key) })) });
      } else if (findTabset(tabset)) {
        payload.push({ tabset, items: resolveTabset(layout, tabset).map((i) => ({ key: i.key })) });
      }
    }
    setError(null);
    startTransition(async () => {
      const res = await saveArrangement({ target, lists: payload });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      finish();
      router.refresh();
    });
  }, [touched, layout, target, finish, router]);

  const reset = useCallback(() => {
    const tabsets = ["nav", NAV_GROUPS_TABSET, ...lists.map((l) => l.tabset)];
    setError(null);
    startTransition(async () => {
      const res = await resetArrangement({ target, tabsets });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft({});
      setTouched([]);
      finish();
      router.refresh();
    });
  }, [lists, target, finish, router]);

  const arrange = useMemo<ArrangeApi>(
    () => ({
      active,
      canShare: value.unrestricted,
      target,
      setTarget,
      dirty: touched.length > 0,
      pending,
      error,
      lists,
      start: () => {
        setError(null);
        setActive(true);
      },
      cancel: () => {
        setDraft({});
        setTouched([]);
        finish();
      },
      save,
      reset,
      reorder,
      reorderNav,
      register,
    }),
    [active, value.unrestricted, target, touched.length, pending, error, lists, finish, save, reset, reorder, reorderNav, register],
  );

  return (
    <UiLayoutContext.Provider value={layout}>
      <ArrangeContext.Provider value={arrange}>{children}</ArrangeContext.Provider>
    </UiLayoutContext.Provider>
  );
}

export function useUiLayout(): UiLayoutData {
  return useContext(UiLayoutContext);
}

export function useArrange(): ArrangeApi {
  return useContext(ArrangeContext);
}

/** Declares a list shown on the page so the « Réorganiser » panel can list it. */
export function useArrangeableList(tabset: string | undefined, items: { id: string; label: string }[]) {
  const { register } = useArrange();
  const signature = JSON.stringify(items.map((i) => ({ id: i.id, label: i.label })));
  useEffect(() => {
    if (!tabset || !keysOfTabset(tabset)) return;
    return register({ tabset, items: JSON.parse(signature) as ArrangeableList["items"] });
  }, [tabset, signature, register]);
}

/**
 * Tabs of `tabset` as chosen in Paramètres → Interface (and by the user). When the selected tab is hidden, the
 * first visible one is selected instead. Without `tabset` the items are returned unchanged.
 */
export function useUiTabs<T extends { id: string; label: string }>(
  tabset: string | undefined,
  items: T[],
  value?: string,
  onChange?: (id: T["id"]) => void,
): T[] {
  const data = useUiLayout();
  const shown = useMemo(() => (tabset ? applyTabs(data, tabset, items) : items), [data, tabset, items]);
  useArrangeableList(tabset, shown);
  const fallback = shown[0]?.id;
  const selectedVisible = value === undefined || shown.some((item) => item.id === value);
  useEffect(() => {
    if (!selectedVisible && fallback !== undefined) onChange?.(fallback);
  }, [selectedVisible, fallback, onChange]);
  return shown;
}

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
import {
  NAV_GROUPS_TABSET,
  RH_CUSTOM_SECTIONS_MAX,
  RH_OTHERS_SECTION,
  RH_SECTIONS,
  RH_SECTIONS_TABSET,
  findTabset,
  itemKey,
  keysOfTabset,
  newRhSectionKey,
  rhSectionGroupKey,
} from "@/lib/ui/registry";
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
  /** New HR module bar: sections in order, and the tabs (keys) of each section in order. */
  reorderRh: (sections: { key: string; items: string[] }[]) => void;
  /** New, empty section of the HR bar (placed before « Autres »). */
  addRhSection: (label: string) => void;
  renameRhSection: (key: string, label: string) => void;
  /** Its tabs go to « Autres »; a section created by a user is deleted, a catalogue section just disappears once empty. */
  removeRhSection: (key: string) => void;
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
  reorderRh: noop,
  addRhSection: noop,
  renameRhSection: noop,
  removeRhSection: noop,
  register: () => noop,
});

const cleanName = (label: string) => label.trim().slice(0, 40);

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
  /** Sections created by a user and deleted in this session. */
  const [removed, setRemoved] = useState<string[]>([]);
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
      setRemoved([]);
    }
  }

  const layout = useMemo<UiLayoutData>(() => {
    if (!Object.keys(draft).length && !removed.length) return value;
    const drop = new Set(removed.map((key) => itemKey(RH_SECTIONS_TABSET, key)));
    const keep = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([key]) => !drop.has(key)));
    return { ...value, personal: keep({ ...value.personal, ...draft }), overrides: drop.size ? keep(value.overrides) : value.overrides };
  }, [value, draft, removed]);

  const touch = useCallback((tabsets: string[]) => {
    setTouched((prev) => [...new Set([...prev, ...tabsets])]);
  }, []);

  const reorder = useCallback(
    (tabset: string, ids: string[]) => {
      setDraft((prev) => {
        const next = { ...prev };
        ids.forEach((id, index) => {
          const key = itemKey(tabset, id);
          // Keeps the section / group the item was moved to.
          const group = prev[key]?.group_key ?? value.personal[key]?.group_key ?? null;
          next[key] = { sort_order: (index + 1) * 10, group_key: group };
        });
        return next;
      });
      touch([tabset]);
    },
    [touch, value.personal],
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

  /** Positions of the HR sections, keeping the names given to them (`names`: new names). */
  const sectionPositions = useCallback(
    (prev: Record<string, UiPersonalOrder>, keys: string[], names: Record<string, string | null> = {}) => {
      const next: Record<string, UiPersonalOrder> = {};
      keys.forEach((key, index) => {
        const k = itemKey(RH_SECTIONS_TABSET, key);
        const label = key in names ? names[key] : (prev[k]?.label_fr ?? value.personal[k]?.label_fr ?? null);
        next[k] = { sort_order: (index + 1) * 10, group_key: null, label_fr: label };
      });
      return next;
    },
    [value.personal],
  );

  const reorderRh = useCallback(
    (sections: { key: string; items: string[] }[]) => {
      setDraft((prev) => {
        const next = { ...prev, ...sectionPositions(prev, sections.map((s) => s.key)) };
        let index = 0;
        for (const section of sections) {
          for (const key of section.items) {
            index += 1;
            next[key] = { sort_order: index * 10, group_key: rhSectionGroupKey(section.key) };
          }
        }
        return next;
      });
      touch(["rh", RH_SECTIONS_TABSET]);
    },
    [touch, sectionPositions],
  );

  const addRhSection = useCallback(
    (label: string) => {
      const name = cleanName(label);
      if (!name) return;
      const sections = resolveRhSections(layout, { includeEmpty: true });
      if (sections.filter((s) => s.custom).length >= RH_CUSTOM_SECTIONS_MAX) {
        setError(`${RH_CUSTOM_SECTIONS_MAX} onglets créés au maximum.`);
        return;
      }
      const key = newRhSectionKey();
      const keys = sections.map((s) => s.key);
      const at = keys.indexOf(RH_OTHERS_SECTION);
      keys.splice(at < 0 ? keys.length : at, 0, key);
      setDraft((prev) => ({ ...prev, ...sectionPositions(prev, keys, { [key]: name }) }));
      touch([RH_SECTIONS_TABSET]);
    },
    [layout, sectionPositions, touch],
  );

  const renameRhSection = useCallback(
    (key: string, label: string) => {
      const sections = resolveRhSections(layout, { includeEmpty: true });
      const section = sections.find((s) => s.key === key);
      if (!section) return;
      const name = cleanName(label);
      // A created section only exists with a name; a catalogue section gets its default name back.
      if (!name && section.custom) return;
      const original = RH_SECTIONS.find((s) => s.key === key)?.titleFr;
      const names = { [key]: name && name !== original ? name : null };
      setDraft((prev) => ({ ...prev, ...sectionPositions(prev, sections.map((s) => s.key), names) }));
      touch([RH_SECTIONS_TABSET]);
    },
    [layout, sectionPositions, touch],
  );

  const removeRhSection = useCallback(
    (key: string) => {
      if (key === RH_OTHERS_SECTION) return;
      const sections = resolveRhSections(layout, { includeEmpty: true });
      const gone = sections.find((s) => s.key === key);
      if (!gone) return;
      // Users only delete their own sections; the super admin's ones are deleted with « Pour tout le monde ».
      const deletable = gone.custom && (target === "all" || !gone.shared);
      const moving = gone.items.map((i) => i.key);
      const next = sections
        .filter((s) => !(deletable && s.key === key))
        .map((s) => ({
          key: s.key,
          items: s.key === key ? [] : s.key === RH_OTHERS_SECTION ? [...s.items.map((i) => i.key), ...moving] : s.items.map((i) => i.key),
        }));
      reorderRh(next);
      if (deletable) setRemoved((prev) => [...new Set([...prev, key])]);
    },
    [layout, target, reorderRh],
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
    const rhSections = resolveRhSections(layout, { includeEmpty: true });
    /** Name sent for a section: only when it differs from the one the target would show anyway. */
    const sectionName = (s: (typeof rhSections)[number]) => {
      const original = RH_SECTIONS.find((d) => d.key === s.key)?.titleFr ?? null;
      const admin = value.overrides[itemKey(RH_SECTIONS_TABSET, s.key)]?.label_fr?.trim() || null;
      const base = target === "all" ? original : (admin ?? original);
      return s.titleFr !== base ? s.titleFr : null;
    };
    for (const tabset of touched) {
      if (tabset === NAV_GROUPS_TABSET) {
        payload.push({ tabset, items: nav.map((g) => ({ key: g.key })) });
      } else if (tabset === "nav") {
        payload.push({ tabset, items: nav.flatMap((g) => g.items.map((i) => ({ key: i.key, group_key: g.key }))) });
      } else if (tabset === RH_SECTIONS_TABSET) {
        payload.push({ tabset, items: rhSections.map((s) => ({ key: itemKey(tabset, s.key), label_fr: sectionName(s) })) });
      } else if (tabset === "rh") {
        payload.push({
          tabset,
          items: rhSections.flatMap((s) => s.items.map((i) => ({ key: i.key, group_key: rhSectionGroupKey(s.key) }))),
        });
      } else if (findTabset(tabset)) {
        payload.push({ tabset, items: resolveTabset(layout, tabset).map((i) => ({ key: i.key })) });
      }
    }
    setError(null);
    startTransition(async () => {
      const res = await saveArrangement({ target, lists: payload, removedSections: removed });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      finish();
      router.refresh();
    });
  }, [touched, layout, value.overrides, target, removed, finish, router]);

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
      setRemoved([]);
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
        setRemoved([]);
        finish();
      },
      save,
      reset,
      reorder,
      reorderNav,
      reorderRh,
      addRhSection,
      renameRhSection,
      removeRhSection,
      register,
    }),
    [
      active,
      value.unrestricted,
      target,
      touched.length,
      pending,
      error,
      lists,
      finish,
      save,
      reset,
      reorder,
      reorderNav,
      reorderRh,
      addRhSection,
      renameRhSection,
      removeRhSection,
      register,
    ],
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

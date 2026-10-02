import {
  RH_SECTIONS,
  UI_NAV_GROUPS,
  UI_TABSETS,
  findItem,
  findTabset,
  isGroupKey,
  itemKey,
  type UiIcon,
  type UiItemDef,
} from "@/lib/ui/registry";
import {
  EMPTY_USER_PREFS,
  scopeSelectors,
  type DesignSettings,
  type UserDisplayPrefs,
} from "@/lib/ui/design";

export type UiOverride = {
  sort_order: number | null;
  label_fr: string | null;
  label_ar: string | null;
  group_key: string | null;
};

/** Position chosen by the user for themselves (sys_ui_user_order), over the super admin's order. */
export type UiPersonalOrder = { sort_order: number; group_key: string | null };

export type UiTheme = {
  brand_color: string | null;
  sidebar_color: string | null;
  app_name: string | null;
  app_subtitle: string | null;
};

export type UiLayoutData = {
  /** Super admin: nothing is ever hidden. */
  unrestricted: boolean;
  hidden: string[];
  overrides: Record<string, UiOverride>;
  personal: Record<string, UiPersonalOrder>;
  theme: UiTheme;
  /** null: no look chosen yet, the original appearance stays. */
  design: DesignSettings | null;
  prefs: UserDisplayPrefs;
};

export const EMPTY_THEME: UiTheme = { brand_color: null, sidebar_color: null, app_name: null, app_subtitle: null };

export const DEFAULT_LAYOUT: UiLayoutData = {
  unrestricted: true,
  hidden: [],
  overrides: {},
  personal: {},
  theme: EMPTY_THEME,
  design: null,
  prefs: EMPTY_USER_PREFS,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** An item is hidden for a user only when every one of the user's roles hides it. */
export function hiddenKeysForRoles(rows: { role_id: string; item_key: string }[], roleIds: string[]): string[] {
  const roles = [...new Set(roleIds)];
  if (!roles.length) return [];
  const byKey = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!roles.includes(row.role_id)) continue;
    if (!byKey.has(row.item_key)) byKey.set(row.item_key, new Set());
    byKey.get(row.item_key)!.add(row.role_id);
  }
  return [...byKey.entries()].filter(([, set]) => set.size === roles.length).map(([key]) => key);
}

export function isKeyHidden(data: UiLayoutData, key: string): boolean {
  if (data.unrestricted) return false;
  if (findItem(key)?.item.locked) return false;
  return data.hidden.includes(key);
}

function sortValue(data: UiLayoutData, key: string, fallbackIndex: number): number {
  const order = data.personal[key]?.sort_order ?? data.overrides[key]?.sort_order;
  return typeof order === "number" ? order : (fallbackIndex + 1) * 10;
}

function cleanLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Keeps a dynamic suffix such as a counter: "Lots (3)" renamed "Séries" → "Séries (3)". */
export function relabel(runtime: string, base: string, override: string | null): string {
  if (!override) return runtime;
  const suffix = runtime.startsWith(base) ? runtime.slice(base.length) : "";
  return `${override}${suffix}`;
}

export type ResolvedItem = UiItemDef & {
  key: string;
  label: string;
  labelArShown: string | null;
};

export function resolveTabset(data: UiLayoutData, tabsetKey: string, opts: { includeHidden?: boolean } = {}): ResolvedItem[] {
  const tabset = findTabset(tabsetKey);
  if (!tabset) return [];
  return tabset.items
    .map((item, index) => {
      const key = itemKey(tabset.key, item.id);
      const o = data.overrides[key];
      return {
        ...item,
        key,
        label: cleanLabel(o?.label_fr) ?? item.labelFr,
        labelArShown: cleanLabel(o?.label_ar) ?? item.labelAr ?? null,
        sort: sortValue(data, key, index),
      };
    })
    .filter((item) => opts.includeHidden || !isKeyHidden(data, item.key))
    .sort((a, b) => a.sort - b.sort)
    .map(({ sort, ...item }) => {
      void sort;
      return item;
    });
}

/** Filters, orders and renames the tabs a component is about to render (ids unknown to the catalogue stay last). */
export function applyTabs<T extends { id: string; label: string }>(data: UiLayoutData, tabsetKey: string, items: T[]): T[] {
  const tabset = findTabset(tabsetKey);
  if (!tabset) return items;
  return items
    .map((item, runtimeIndex) => {
      const key = itemKey(tabsetKey, item.id);
      const def = findItem(key);
      const o = data.overrides[key];
      const label = def ? relabel(item.label, def.item.labelFr, cleanLabel(o?.label_fr)) : item.label;
      return {
        item: label === item.label ? item : { ...item, label },
        key,
        sort: def ? sortValue(data, key, def.index) : 1_000_000 + runtimeIndex,
      };
    })
    .filter((entry) => !isKeyHidden(data, entry.key))
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => entry.item);
}

function pathMatches(item: UiItemDef, pathname: string): boolean {
  if (!item.href) return false;
  if (item.exact || item.href === "/") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The item owning the route: the longest matching link, so /rh/paie/avances marks "Avances", not "Paie". */
export function activeItemKey(items: ResolvedItem[], pathname: string): string | null {
  let best: ResolvedItem | null = null;
  for (const item of items) {
    if (!pathMatches(item, pathname)) continue;
    if (!best || (item.href?.length ?? 0) > (best.href?.length ?? 0)) best = item;
  }
  return best?.key ?? null;
}

export type ResolvedSection = { key: string; titleFr: string; titleAr: string; items: ResolvedItem[] };

/** HR module bar: visible tabs grouped by section (catalogue order of the sections, tab order kept inside). */
export function resolveRhSections(data: UiLayoutData): ResolvedSection[] {
  const items = resolveTabset(data, "rh");
  const known = new Set(RH_SECTIONS.map((s) => s.key));
  const last = RH_SECTIONS[RH_SECTIONS.length - 1].key;
  return RH_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => {
      const wanted = data.overrides[item.key]?.group_key;
      const key = wanted && known.has(wanted) ? wanted : item.section && known.has(item.section) ? item.section : last;
      return key === section.key;
    }),
  })).filter((section) => section.items.length > 0);
}

const ALWAYS_OPEN = new Set(["/", "/parametres", "/parametres/interface"]);

/**
 * A route is blocked when, in any tabset, the most specific item that owns it is hidden
 * (aliases only link to a route and never block it).
 */
export function isPathBlocked(data: UiLayoutData, pathname: string): boolean {
  if (data.unrestricted || ALWAYS_OPEN.has(pathname)) return false;
  for (const tabset of UI_TABSETS) {
    let best: UiItemDef | null = null;
    for (const item of tabset.items) {
      if (item.alias || !pathMatches(item, pathname)) continue;
      if (!best || (item.href?.length ?? 0) > (best.href?.length ?? 0)) best = item;
    }
    if (best && isKeyHidden(data, itemKey(tabset.key, best.id))) return true;
  }
  return false;
}

/** Side menu group of a module: the user's choice, then the super admin's (default group when neither). */
export function navGroupOf(data: UiLayoutData, key: string): string | null {
  const mine = data.personal[key]?.group_key;
  if (mine && isGroupKey(mine)) return mine;
  return data.overrides[key]?.group_key ?? null;
}

export type ResolvedNavItem = {
  key: string;
  href: string;
  /** Prefix that marks the item active (its own route, even when the link goes to a sub-page). */
  activeHref: string;
  label: string;
  labelAr: string;
  icon: UiIcon;
};

export type ResolvedNavGroup = { key: string; titleFr: string; titleAr: string; items: ResolvedNavItem[] };

/** `includeEmpty`: also the groups left without a module (to drop one into them while rearranging). */
export function resolveNav(data: UiLayoutData, opts: { includeEmpty?: boolean } = {}): ResolvedNavGroup[] {
  const items = resolveTabset(data, "nav");
  const groups = UI_NAV_GROUPS.map((g, index) => {
    const o = data.overrides[g.key];
    return {
      key: g.key,
      titleFr: cleanLabel(o?.label_fr) ?? g.titleFr,
      titleAr: cleanLabel(o?.label_ar) ?? g.titleAr,
      sort: sortValue(data, g.key, index),
      items: [] as ResolvedNavItem[],
    };
  }).sort((a, b) => a.sort - b.sort);

  for (const item of items) {
    const wanted = navGroupOf(data, item.key) ?? item.group;
    const group = groups.find((g) => g.key === wanted) ?? groups.find((g) => g.key === item.group) ?? groups[0];
    let href = item.href ?? "/";
    if (item.childTabset && isPathBlocked(data, href)) {
      const first = resolveTabset(data, item.childTabset).find((child) => child.href && !isPathBlocked(data, child.href));
      if (!first?.href) continue;
      href = first.href;
    }
    group.items.push({
      key: item.key,
      href,
      activeHref: item.href ?? href,
      label: item.label,
      labelAr: item.labelArShown ?? "",
      icon: item.icon ?? "docs",
    });
  }
  return groups.filter((g) => opts.includeEmpty || g.items.length).map(({ sort, ...g }) => {
    void sort;
    return g;
  });
}

/** CSS variables for the chosen colours (values are validated hex codes, so the text is safe to inline). */
export function themeCss(theme: UiTheme, scope = ":root"): string {
  const sel = scopeSelectors(scope);
  const both = `${sel.light},${sel.dark}`;
  const rules: string[] = [];
  if (isHexColor(theme.brand_color)) {
    const c = theme.brand_color;
    rules.push(
      `${both}{--color-brand:${c};--color-brand-hover:color-mix(in srgb,${c} 85%,black);}`,
      `${sel.light}{--color-brand-muted:color-mix(in srgb,${c} 12%,white);}`,
      `${sel.dark}{--color-brand-muted:color-mix(in srgb,${c} 22%,#0b1224);}`,
    );
  }
  if (isHexColor(theme.sidebar_color)) {
    rules.push(`${both}{--sidebar:${theme.sidebar_color};}`);
  }
  return rules.join("");
}

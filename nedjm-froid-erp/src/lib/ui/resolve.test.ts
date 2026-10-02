import { describe, expect, it } from "vitest";
import { NAV_GROUPS_TABSET, RH_SECTIONS, UI_NAV_GROUPS, UI_TABSETS, findTabset, itemKey, keysOfTabset } from "@/lib/ui/registry";
import {
  DEFAULT_LAYOUT,
  activeItemKey,
  applyTabs,
  hiddenKeysForRoles,
  isPathBlocked,
  navGroupOf,
  relabel,
  resolveNav,
  resolveRhSections,
  resolveTabset,
  themeCss,
  type UiLayoutData,
} from "@/lib/ui/resolve";

const KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;

function layout(partial: Partial<UiLayoutData>): UiLayoutData {
  return { ...DEFAULT_LAYOUT, unrestricted: false, ...partial };
}

describe("registry", () => {
  it("uses unique keys accepted by the database", () => {
    const keys = UI_TABSETS.flatMap((t) => t.items.map((i) => itemKey(t.key, i.id)));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(KEY_PATTERN);
  });

  it("keeps page buttons reorderable only: never hidden, never renamed", () => {
    const toolbars = UI_TABSETS.filter((t) => t.kind === "toolbar");
    expect(toolbars.length).toBeGreaterThan(0);
    for (const t of toolbars) {
      expect(t.level).toBe("E");
      expect(t.items.length).toBeGreaterThan(1);
      for (const item of t.items) expect(item.locked).toBe(true);
    }
    expect(keysOfTabset("btn_rh_employees")).toEqual(["btn_rh_employees.columns", "btn_rh_employees.new"]);
    expect(keysOfTabset(NAV_GROUPS_TABSET)).toEqual(UI_NAV_GROUPS.map((g) => g.key));
    expect(keysOfTabset("unknown")).toBeNull();
  });
});

describe("personal order", () => {
  it("wins over the super admin's order, which wins over the catalogue", () => {
    const data = layout({
      overrides: { "rh.paie": { sort_order: 1, label_fr: "Salaires", label_ar: null, group_key: null } },
      personal: { "rh.conges": { sort_order: 0, group_key: null } },
    });
    const keys = resolveTabset(data, "rh").map((i) => i.key);
    expect(keys.slice(0, 2)).toEqual(["rh.conges", "rh.paie"]);
    expect(resolveTabset(data, "rh")[1].label).toBe("Salaires");
    const shown = applyTabs(data, "btn_rh_employees", [
      { id: "new", label: "Nouvel employé" },
      { id: "columns", label: "Colonnes" },
    ]);
    expect(shown.map((i) => i.id)).toEqual(["columns", "new"]);
    const mine = applyTabs(layout({ personal: { "btn_rh_employees.new": { sort_order: 1, group_key: null } } }), "btn_rh_employees", shown);
    expect(mine.map((i) => i.id)).toEqual(["new", "columns"]);
  });
});

describe("hiddenKeysForRoles", () => {
  const rows = [
    { role_id: "rh", item_key: "nav.finance" },
    { role_id: "rh", item_key: "nav.achats" },
    { role_id: "chef", item_key: "nav.finance" },
  ];

  it("hides an item only when every role of the user hides it", () => {
    expect(hiddenKeysForRoles(rows, ["rh"]).sort()).toEqual(["nav.achats", "nav.finance"]);
    expect(hiddenKeysForRoles(rows, ["rh", "chef"])).toEqual(["nav.finance"]);
    expect(hiddenKeysForRoles(rows, ["rh", "chef", "gerant"])).toEqual([]);
    expect(hiddenKeysForRoles(rows, [])).toEqual([]);
  });
});

describe("resolveTabset / applyTabs", () => {
  it("hides, orders and renames", () => {
    const data = layout({
      hidden: ["rh.conges"],
      overrides: { "rh.paie": { sort_order: 1, label_fr: "Salaires", label_ar: null, group_key: null } },
    });
    const items = resolveTabset(data, "rh");
    expect(items[0]).toMatchObject({ key: "rh.paie", label: "Salaires" });
    expect(items.some((i) => i.key === "rh.conges")).toBe(false);
  });

  it("never hides locked items and shows everything to the super admin", () => {
    const hidden = ["nav.home", "nav.parametres", "nav.finance"];
    expect(resolveTabset(layout({ hidden }), "nav").map((i) => i.key)).toEqual(
      expect.arrayContaining(["nav.home", "nav.parametres"]),
    );
    expect(resolveTabset({ ...layout({ hidden }), unrestricted: true }, "nav").some((i) => i.key === "nav.finance")).toBe(true);
  });

  it("keeps dynamic counters when a tab is renamed", () => {
    expect(relabel("Lots (3)", "Lots", "Séries")).toBe("Séries (3)");
    const data = layout({
      hidden: ["att_imports.politique"],
      overrides: { "att_imports.lots": { sort_order: 50, label_fr: "Séries", label_ar: null, group_key: null } },
    });
    const tabs = applyTabs(data, "att_imports", [
      { id: "lots", label: "Lots (3)" },
      { id: "validation", label: "À valider (1)" },
      { id: "politique", label: "Politique de validation" },
    ]);
    expect(tabs).toEqual([
      { id: "validation", label: "À valider (1)" },
      { id: "lots", label: "Séries (3)" },
    ]);
  });

  it("maps hyphenated tab ids to database keys", () => {
    const tabs = applyTabs(layout({ hidden: ["legal_watch.mots_cles"] }), "legal_watch", [
      { id: "textes", label: "Textes détectés" },
      { id: "mots-cles", label: "Mots-clés" },
    ]);
    expect(tabs.map((t) => t.id)).toEqual(["textes"]);
  });
});

describe("isPathBlocked", () => {
  it("blocks a hidden module and its sub-pages", () => {
    const data = layout({ hidden: ["nav.finance"] });
    expect(isPathBlocked(data, "/finance")).toBe(true);
    expect(isPathBlocked(data, "/finance/parametres")).toBe(true);
    expect(isPathBlocked(data, "/achats")).toBe(false);
  });

  it("uses the most specific RH tab", () => {
    const data = layout({ hidden: ["rh.paie"] });
    expect(isPathBlocked(data, "/rh/paie")).toBe(true);
    expect(isPathBlocked(data, "/rh/paie/bulletins")).toBe(true);
    expect(isPathBlocked(data, "/rh/paie/virements")).toBe(false);
  });

  it("does not block a route through an alias link", () => {
    expect(isPathBlocked(layout({ hidden: ["rh.simulateur"] }), "/simulateur")).toBe(false);
    expect(isPathBlocked(layout({ hidden: ["settings.utilisateurs"] }), "/parametres/utilisateurs")).toBe(false);
  });

  it("keeps home and settings open", () => {
    const data = layout({ hidden: ["nav.home", "nav.parametres", "settings.interface"] });
    expect(isPathBlocked(data, "/")).toBe(false);
    expect(isPathBlocked(data, "/parametres")).toBe(false);
    expect(isPathBlocked(data, "/parametres/interface")).toBe(false);
  });
});

describe("resolveNav", () => {
  it("moves, orders and renames items and groups, dropping empty groups", () => {
    const data = layout({
      hidden: ["nav.chantiers", "nav.activites"],
      overrides: {
        "nav.achats": { sort_order: null, label_fr: null, label_ar: null, group_key: "group.commercial" },
        "group.admin": { sort_order: 0, label_fr: "Système", label_ar: null, group_key: null },
      },
    });
    const nav = resolveNav(data);
    expect(nav[0]).toMatchObject({ key: "group.admin", titleFr: "Système" });
    expect(nav.some((g) => g.key === "group.sites")).toBe(false);
    expect(nav.find((g) => g.key === "group.commercial")?.items.map((i) => i.key)).toContain("nav.achats");
  });

  it("applies the user's own order and groups over the super admin's", () => {
    const data = layout({
      overrides: {
        "nav.finance": { sort_order: 5, label_fr: null, label_ar: null, group_key: "group.commercial" },
        "nav.achats": { sort_order: 1, label_fr: null, label_ar: null, group_key: null },
      },
      personal: {
        "nav.finance": { sort_order: 1, group_key: "group.admin" },
        "nav.achats": { sort_order: 2, group_key: "nope" },
        "group.admin": { sort_order: 0, group_key: null },
      },
    });
    expect(navGroupOf(data, "nav.finance")).toBe("group.admin");
    expect(navGroupOf(data, "nav.achats")).toBeNull();
    const nav = resolveNav(data);
    expect(nav[0].key).toBe("group.admin");
    expect(nav[0].items[0].key).toBe("nav.finance");
    expect(nav.find((g) => g.key === "group.commercial")?.items.map((i) => i.key) ?? []).not.toContain("nav.finance");
  });

  it("keeps empty groups only on request", () => {
    const ids = findTabset("nav")!.items.map((i) => i.id);
    const personal = Object.fromEntries(ids.map((id, i) => [itemKey("nav", id), { sort_order: i, group_key: "group.pilotage" }]));
    const data = layout({ personal });
    expect(resolveNav(data).map((g) => g.key)).toEqual(["group.pilotage"]);
    expect(resolveNav(data, { includeEmpty: true }).length).toBe(UI_NAV_GROUPS.length);
  });

  it("sends the RH entry to the first visible RH page when the dashboard is hidden", () => {
    const nav = resolveNav(layout({ hidden: ["rh.dashboard", "rh.employes"] }));
    const rh = nav.flatMap((g) => g.items).find((i) => i.key === "nav.rh");
    expect(rh).toMatchObject({ href: "/rh/contrats", activeHref: "/rh" });
  });
});

describe("resolveRhSections / activeItemKey", () => {
  it("files every RH tab under a declared section", () => {
    const sections = new Set(RH_SECTIONS.map((s) => s.key));
    for (const item of findTabset("rh")!.items) expect(sections.has(item.section ?? "")).toBe(true);
  });

  it("groups visible tabs, drops empty sections and honours a section override", () => {
    const data = layout({
      hidden: ["rh.documents", "rh.attestations"],
      overrides: { "rh.couts": { sort_order: null, label_fr: null, label_ar: null, group_key: "overview" } },
    });
    const sections = resolveRhSections(data);
    expect(sections.some((s) => s.key === "documents")).toBe(false);
    expect(sections.find((s) => s.key === "overview")?.items.map((i) => i.key)).toContain("rh.couts");
    expect(sections.find((s) => s.key === "payroll")?.items.map((i) => i.key)).not.toContain("rh.couts");
  });

  it("marks only the most specific tab active", () => {
    const items = resolveTabset(DEFAULT_LAYOUT, "rh");
    expect(activeItemKey(items, "/rh/paie/avances")).toBe("rh.avances");
    expect(activeItemKey(items, "/rh/paie/bulletins")).toBe("rh.paie");
    expect(activeItemKey(items, "/rh/presence/imports")).toBe("rh.presence_imports");
    expect(activeItemKey(items, "/rh")).toBe("rh.dashboard");
    expect(activeItemKey(items, "/finance")).toBeNull();
  });
});

describe("themeCss", () => {
  it("only inlines validated colours", () => {
    expect(themeCss({ brand_color: "#0f766e", sidebar_color: "red;}body{x", app_name: null, app_subtitle: null })).toBe(
      ":root,.dark{--color-brand:#0f766e;--color-brand-hover:color-mix(in srgb,#0f766e 85%,black);}" +
        ":root{--color-brand-muted:color-mix(in srgb,#0f766e 12%,white);}" +
        ".dark{--color-brand-muted:color-mix(in srgb,#0f766e 22%,#0b1224);}",
    );
  });
});

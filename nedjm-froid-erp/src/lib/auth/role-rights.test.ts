import { describe, expect, it } from "vitest";
import {
  NO_RIGHTS,
  RIGHTS_ITEM_KEYS,
  buildPayload,
  buildRightsTree,
  cloneState,
  closeNode,
  closedByRights,
  describeChanges,
  flatten,
  indexTree,
  isOpen,
  openNode,
  setAction,
  unseenKeys,
  type RoleRightsState,
} from "@/lib/auth/role-rights";
import { findItem } from "@/lib/ui/registry";

const screens = [
  { code: "hr_payroll", module: "hr", label_fr: "Paie" },
  { code: "hr_transfers", module: "rh", label_fr: "Virements des salaires" },
  { code: "rule_approval", module: "rh", label_fr: "Approbation des règles légales" },
  { code: "decision_payroll_generate", module: "decisions", label_fr: "Décision D4 · Génération de paie" },
  { code: "decision_payroll_reopen", module: "decisions", label_fr: "Décision D7 · Réouverture" },
  { code: "hr_letters", module: "rh", label_fr: "Attestations & courriers" },
];

const tree = buildRightsTree(screens);
const index = indexTree(tree);
const all = flatten(tree);
const none = new Set<string>();

function state(over: Partial<RoleRightsState> = {}): RoleRightsState {
  return {
    hidden: new Set(),
    perms: { hr_hub: { ...NO_RIGHTS, can_read: true } },
    sitesOnly: false,
    reviewed: new Set(),
    ...over,
  };
}

describe("rights tree", () => {
  it("uses each key once and only catalogue keys outside « Droits particuliers »", () => {
    const keys = all.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const n of all) {
      if (n.kind === "right") expect(n.key).toMatch(/^perm\./);
      else expect(findItem(n.key), n.key).toBeDefined();
    }
  });

  it("nests the payroll buttons under « Calcul de la paie » and lists the screens without a tab", () => {
    const paie = index.byKey.get("rh.paie")!;
    expect(paie.children.map((c) => c.key)).toContain("btn_rh_payroll_run.validate");
    expect(index.byKey.get("perm.rule_approval")?.parent).toBe("nav.rh");
    expect(index.byKey.get("perm.decision_payroll_generate")?.label).toBe("Décision D4");
    expect(index.byKey.has("perm.decision_payroll_reopen")).toBe(false);
    expect(index.byKey.has("perm.hr_letters")).toBe(false);
  });

  it("points every dependency to a node of the tree", () => {
    for (const n of all) for (const r of n.requires) expect(index.byKey.has(r), `${n.key} → ${r}`).toBe(true);
  });

  it("hides in the app what Droits par rôle shows closed for lack of « Voir »", () => {
    const closed = closedByRights(new Set(["hr_hub", "employees"]));
    expect(closed).toEqual(expect.arrayContaining(["rh.paie", "rh.virements", "rh_settings.legal", "rh.legal"]));
    expect(closed).not.toContain("nav.rh");
    expect(closed).not.toContain("rh.employes");
    const s = state({ perms: { hr_hub: { ...NO_RIGHTS, can_read: true }, employees: { ...NO_RIGHTS, can_read: true } } });
    for (const n of all.filter((n) => n.kind !== "right" && !n.locked)) {
      expect(closed.includes(n.key), n.key).toBe(!isOpen(n, s, none));
    }
  });

  it("treats keys added after the last review as new", () => {
    expect(unseenKeys(new Set())).toEqual([]);
    const seen = new Set([...RIGHTS_ITEM_KEYS].filter((k) => k !== "rh.qualite"));
    expect(unseenKeys(seen)).toEqual(["rh.qualite"]);
    const s = state();
    expect(isOpen(index.byKey.get("rh.qualite")!, s, seen)).toBe(false);
    openNode("rh.qualite", index, s, seen);
    expect(isOpen(index.byKey.get("rh.qualite")!, s, seen)).toBe(true);
    expect(buildPayload(state(), s).reviewed).toEqual(["rh.qualite"]);
  });
});

describe("opening and closing", () => {
  it("opens what a tab needs and gives read access to its screens", () => {
    const s = state({ hidden: new Set(["rh.paie", "rh.virements"]) });
    const notices = openNode("rh.virements", index, s, none);
    expect(s.hidden.has("rh.paie")).toBe(false);
    expect(s.perms.hr_transfers.can_read).toBe(true);
    expect(s.perms.hr_payroll.can_read).toBe(true);
    expect(notices.map((n) => n.tone)).toEqual(["warning", "info"]);
  });

  it("closes the content of a tab and what depends on it", () => {
    const s = state({ perms: { hr_hub: { ...NO_RIGHTS, can_read: true }, hr_payroll: { ...NO_RIGHTS, can_read: true }, hr_transfers: { ...NO_RIGHTS, can_read: true } } });
    closeNode("rh.paie", index, s, none);
    expect(s.hidden.has("rh.paie")).toBe(true);
    expect(s.hidden.has("btn_rh_payroll_run.validate")).toBe(true);
    expect(s.hidden.has("rh.virements")).toBe(true);
    expect(s.perms.hr_payroll.can_read).toBe(true);
  });

  it("closes a twin key with its tab", () => {
    const s = state();
    closeNode("rh_settings.legal", index, s, none);
    expect(s.hidden.has("rh.legal")).toBe(true);
  });

  it("revokes a particular right when it is closed", () => {
    const s = state({ perms: { hr_hub: { ...NO_RIGHTS, can_read: true }, rule_approval: { ...NO_RIGHTS, can_read: true, can_update: true } } });
    closeNode("perm.rule_approval", index, s, none);
    expect(s.perms.rule_approval).toEqual(NO_RIGHTS);
  });
});

describe("actions", () => {
  it("adds « Modifier » with « Supprimer » and removes « Supprimer » without « Modifier »", () => {
    const paie = index.byKey.get("rh.paie")!;
    const s = state({ perms: { hr_hub: { ...NO_RIGHTS, can_read: true }, hr_payroll: { ...NO_RIGHTS, can_read: true } } });
    setAction(paie, "can_delete", true, s);
    expect(s.perms.hr_payroll).toMatchObject({ can_read: true, can_update: true, can_delete: true });
    setAction(paie, "can_update", false, s);
    expect(s.perms.hr_payroll).toMatchObject({ can_update: false, can_delete: false });
  });

  it("describes the changes and flags the sensitive ones", () => {
    const before = state({ perms: { hr_hub: { ...NO_RIGHTS, can_read: true }, hr_payroll: { ...NO_RIGHTS, can_read: true } } });
    const after = cloneState(before);
    setAction(index.byKey.get("rh.paie")!, "can_export", true, after);
    openNode("rh.virements", index, after, none);
    after.sitesOnly = true;
    const changes = describeChanges(tree, index, before, after, none);
    expect(changes.find((c) => c.key === "scope")?.to).toBe("Ses chantiers seulement");
    expect(changes.find((c) => c.key === "rh.paie#actions")).toMatchObject({ to: "Voir · Exporter", sensitive: true });
    expect(changes.find((c) => c.key === "rh.virements")).toMatchObject({ from: "Fermé", to: "Ouvert", sensitive: true });
    const payload = buildPayload(before, after);
    expect(payload.sitesOnly).toBe(true);
    expect(payload.perms.map((p) => p.screen).sort()).toEqual(["hr_payroll", "hr_transfers"]);
  });
});

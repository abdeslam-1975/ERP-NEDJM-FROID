import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, type UiLayoutData } from "@/lib/ui/resolve";
import {
  SETTINGS_GROUPS,
  isSettingsPath,
  resolveSettingsGroups,
  settingsSectionAt,
} from "@/lib/ui/settings-center";

function layout(partial: Partial<UiLayoutData>): UiLayoutData {
  return { ...DEFAULT_LAYOUT, unrestricted: false, ...partial };
}

const ids = (groups: ReturnType<typeof resolveSettingsGroups>) => groups.flatMap((g) => g.sections.map((s) => s.id));
const agentRh = { isSuperAdmin: false, roleCodes: ["AGENT_RH"] };

describe("settings center", () => {
  it("gives every section its own link", () => {
    const all = SETTINGS_GROUPS.flatMap((g) => g.sections);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.href)).size).toBe(all.length);
  });

  it("recognises its pages and the section owning them", () => {
    expect(isSettingsPath("/parametres")).toBe(true);
    expect(isSettingsPath("/parametres/rh/fiche")).toBe(true);
    expect(isSettingsPath("/administration/audit")).toBe(true);
    expect(isSettingsPath("/rh/employes")).toBe(false);
    expect(isSettingsPath("/parametresx")).toBe(false);
    const sections = SETTINGS_GROUPS.flatMap((g) => g.sections);
    expect(settingsSectionAt(sections, "/parametres/rh")).toBe("rh");
    expect(settingsSectionAt(sections, "/parametres/rh/fiche")).toBe("rh_fiche");
    expect(settingsSectionAt(sections, "/parametres")).toBeNull();
  });

  it("shows a role only the sections it may open", () => {
    const groups = resolveSettingsGroups(layout({ hidden: ["nav.finance", "nav.achats"] }), agentRh);
    expect(groups.map((g) => g.key)).toEqual(["rh"]);
    expect(ids(groups)).not.toContain("rh_presence");
    expect(ids(resolveSettingsGroups(layout({}), { isSuperAdmin: false, roleCodes: ["ADMIN_RH"] }))).toEqual(
      expect.arrayContaining(["utilisateurs", "audit"]),
    );
    expect(ids(resolveSettingsGroups(layout({}), { isSuperAdmin: false, roleCodes: ["ADMIN_RH"] }))).not.toContain("roles");
  });

  it("follows the interface catalogue and lets the super admin see everything", () => {
    expect(ids(resolveSettingsGroups(layout({ hidden: ["rh.legal"] }), agentRh))).not.toContain("rh_cotisations");
    expect(ids(resolveSettingsGroups(layout({ hidden: ["nav.rh"] }), agentRh))).not.toContain("rh_fiche");
    const all = ids(resolveSettingsGroups(DEFAULT_LAYOUT, { isSuperAdmin: true, roleCodes: [] }));
    expect(all).toHaveLength(SETTINGS_GROUPS.flatMap((g) => g.sections).length);
  });
});

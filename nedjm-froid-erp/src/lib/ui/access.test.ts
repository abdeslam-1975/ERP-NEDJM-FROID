import { describe, expect, it } from "vitest";
import { ACCESS_KEYS, ACCESS_MODULES, hiddenKeysForAccess } from "@/lib/ui/registry";

describe("per-account access", () => {
  it("closes every module and tab when nothing is allowed (locked modules stay open)", () => {
    const hidden = new Set(hiddenKeysForAccess([]));
    expect(hidden.has("nav.rh")).toBe(true);
    expect(hidden.has("rh.paie")).toBe(true);
    expect(hidden.has("nav.home")).toBe(false);
    expect(hidden.has("nav.parametres")).toBe(false);
    expect(hidden.has("settings.permissions")).toBe(true);
  });

  it("shows only the chosen tabs of an open module", () => {
    const hidden = new Set(hiddenKeysForAccess(["nav.rh", "rh.employes", "rh.presence"]));
    expect(hidden.has("nav.rh")).toBe(false);
    expect(hidden.has("rh.employes")).toBe(false);
    expect(hidden.has("rh.paie")).toBe(true);
    expect(hidden.has("nav.finance")).toBe(true);
  });

  it("hides the tabs of a closed module even if they were ticked", () => {
    const hidden = new Set(hiddenKeysForAccess(["rh.employes"]));
    expect(hidden.has("rh.employes")).toBe(true);
  });

  it("lists the HR tabs under the HR module, without aliases nor locked items", () => {
    const rh = ACCESS_MODULES.find((m) => m.key === "nav.rh")!;
    const keys = rh.groups.flatMap((g) => g.tabs.map((t) => t.key));
    expect(keys).toContain("rh.paie");
    expect(keys).not.toContain("rh.simulateur");
    expect(ACCESS_KEYS.has("nav.home")).toBe(false);
    expect(ACCESS_KEYS.has("settings.interface")).toBe(false);
  });
});

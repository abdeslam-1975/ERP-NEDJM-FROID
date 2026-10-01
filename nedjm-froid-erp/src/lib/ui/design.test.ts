import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESIGN,
  DESIGN_OPTIONS,
  DESIGN_PRESETS,
  designCss,
  isDesignValue,
  parseDesign,
  parseUserPrefs,
} from "@/lib/ui/design";
import { themeCss } from "@/lib/ui/resolve";

describe("design settings", () => {
  it("every preset only uses known values", () => {
    for (const preset of DESIGN_PRESETS) {
      expect(preset.settings.preset).toBe(preset.id);
      for (const key of Object.keys(DESIGN_OPTIONS) as (keyof typeof DESIGN_OPTIONS)[]) {
        expect(isDesignValue(key, preset.settings[key])).toBe(true);
      }
      expect(preset.brand_color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("falls back to the preset, then to the default, for missing or unknown values", () => {
    expect(parseDesign(null)).toEqual(DEFAULT_DESIGN);
    const moderne = DESIGN_PRESETS.find((p) => p.id === "moderne")!.settings;
    expect(parseDesign({ preset: "moderne" })).toEqual(moderne);
    const parsed = parseDesign({ preset: "moderne", button_style: "neon;}body{display:none", radius: "sm", animations: "yes" });
    expect(parsed.button_style).toBe(moderne.button_style);
    expect(parsed.radius).toBe("sm");
    expect(parsed.animations).toBe(moderne.animations);
  });

  it("reads only valid personal preferences", () => {
    expect(parseUserPrefs({ mode: "dark", density: "compact" })).toEqual({ mode: "dark", density: "compact" });
    expect(parseUserPrefs({ mode: "neon", density: 3 })).toEqual({ mode: null, density: null });
    expect(parseUserPrefs(null)).toEqual({ mode: null, density: null });
  });
});

describe("designCss", () => {
  it("keeps the Tailwind default radius scale for the classic look", () => {
    const css = designCss(DEFAULT_DESIGN);
    expect(css).toContain("--radius-xl:0.75rem;");
    expect(css).toContain("--radius-2xl:1rem;");
    expect(css).toContain("--spacing:0.25rem;");
    expect(css).toContain("--btn-radius:var(--radius-xl);");
    expect(css.startsWith(":root{")).toBe(true);
  });

  it("maps every choice to CSS variables", () => {
    const css = designCss({
      ...DEFAULT_DESIGN,
      radius: "none",
      button_shape: "pill",
      button_style: "gradient",
      table_style: "striped",
      card_style: "glass",
      font_latin: "inter",
      font_arabic: "tajawal",
    });
    expect(css).toContain("--radius-xl:0rem;");
    expect(css).toContain("--btn-radius:9999px;");
    expect(css).toContain("--btn-bg:linear-gradient(");
    expect(css).toMatch(/--tbl-stripe:color-mix/);
    expect(css).toContain("--card-blur:14px;");
    expect(css).toContain("--app-font-sans:var(--font-inter),var(--font-tajawal),system-ui,sans-serif;");
    expect(css).toContain(".dark{");
  });

  it("lets the user's density win over the default one", () => {
    expect(designCss({ ...DEFAULT_DESIGN, density: "comfortable" }, { mode: null, density: "compact" })).toContain(
      "--spacing:0.225rem;",
    );
    expect(designCss({ ...DEFAULT_DESIGN, density: "comfortable" })).toContain("--spacing:0.275rem;");
  });

  it("switches transitions off when animations are disabled", () => {
    expect(designCss(DEFAULT_DESIGN)).not.toContain("transition-duration:0s");
    expect(designCss({ ...DEFAULT_DESIGN, animations: false })).toContain("transition-duration:0s!important");
  });

  it("can be scoped to a preview element", () => {
    const css = designCss({ ...DEFAULT_DESIGN, animations: false, card_style: "border" }, undefined, ".ui-preview");
    expect(css.startsWith(".ui-preview{")).toBe(true);
    expect(css).toContain(".dark .ui-preview,.ui-preview.dark{");
    expect(css).toContain(".ui-preview *,");
    expect(css).not.toContain(":root");
    const colours = themeCss({ brand_color: "#0f766e", sidebar_color: null, app_name: null, app_subtitle: null }, ".ui-preview");
    expect(colours).toContain(".ui-preview,.dark .ui-preview,.ui-preview.dark{--color-brand:#0f766e;");
    expect(colours).not.toContain(":root");
  });
});

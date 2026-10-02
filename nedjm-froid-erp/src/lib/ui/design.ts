/**
 * Look of the application: chosen by the super admin (sys_ui_theme) with a personal display mode and density
 * per user (sys_ui_user_prefs). Every value is checked against the lists below before it reaches the page, so
 * the generated CSS only ever contains known tokens and validated hex colours.
 */

export const DESIGN_OPTIONS = {
  preset: ["classique", "moderne", "minimal", "sombre"],
  radius: ["none", "sm", "md", "lg", "xl"],
  button_shape: ["square", "rounded", "pill"],
  button_style: ["solid", "soft", "outline", "gradient"],
  table_style: ["lines", "striped", "bordered", "minimal"],
  density: ["compact", "normal", "comfortable"],
  card_style: ["shadow", "border", "flat", "glass"],
  font_latin: ["geist", "source_sans", "inter", "ibm_plex", "system"],
  font_arabic: ["cairo", "tajawal", "ibm_plex_arabic", "noto_kufi"],
  default_mode: ["light", "dark", "system"],
} as const;

type Options = typeof DESIGN_OPTIONS;
export type PresetId = Options["preset"][number];
export type DisplayMode = Options["default_mode"][number];
export type Density = Options["density"][number];

export type DesignSettings = {
  preset: PresetId;
  radius: Options["radius"][number];
  button_shape: Options["button_shape"][number];
  button_style: Options["button_style"][number];
  table_style: Options["table_style"][number];
  density: Density;
  card_style: Options["card_style"][number];
  font_latin: Options["font_latin"][number];
  font_arabic: Options["font_arabic"][number];
  animations: boolean;
  default_mode: DisplayMode;
};

export type UserDisplayPrefs = { mode: DisplayMode | null; density: Density | null };

export const EMPTY_USER_PREFS: UserDisplayPrefs = { mode: null, density: null };

export type DesignPreset = {
  id: PresetId;
  labelFr: string;
  labelAr: string;
  descriptionFr: string;
  brand_color: string;
  sidebar_color: string;
  settings: DesignSettings;
};

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "classique",
    labelFr: "Classique",
    labelAr: "كلاسيكي",
    descriptionFr: "Proche de l'origine (bleu royal, coins arrondis), avec animations, police Geist, arabe Cairo et tableaux à lignes.",
    brand_color: "#3b6ef5",
    sidebar_color: "#1a2f8a",
    settings: {
      preset: "classique",
      radius: "lg",
      button_shape: "rounded",
      button_style: "solid",
      table_style: "lines",
      density: "normal",
      card_style: "shadow",
      font_latin: "geist",
      font_arabic: "cairo",
      animations: true,
      default_mode: "system",
    },
  },
  {
    id: "moderne",
    labelFr: "Moderne",
    labelAr: "عصري",
    descriptionFr: "Boutons pilule en dégradé, cartes vitrées, tableaux zébrés, police Inter.",
    brand_color: "#6d5efc",
    sidebar_color: "#111827",
    settings: {
      preset: "moderne",
      radius: "xl",
      button_shape: "pill",
      button_style: "gradient",
      table_style: "striped",
      density: "comfortable",
      card_style: "glass",
      font_latin: "inter",
      font_arabic: "ibm_plex_arabic",
      animations: true,
      default_mode: "system",
    },
  },
  {
    id: "minimal",
    labelFr: "Minimal",
    labelAr: "بسيط",
    descriptionFr: "Lignes fines, boutons contour, coins discrets, affichage compact.",
    brand_color: "#0f766e",
    sidebar_color: "#134e4a",
    settings: {
      preset: "minimal",
      radius: "sm",
      button_shape: "square",
      button_style: "outline",
      table_style: "minimal",
      density: "compact",
      card_style: "border",
      font_latin: "ibm_plex",
      font_arabic: "tajawal",
      animations: false,
      default_mode: "light",
    },
  },
  {
    id: "sombre",
    labelFr: "Sombre",
    labelAr: "داكن",
    descriptionFr: "Mode sombre par défaut, boutons doux, tableaux bordés.",
    brand_color: "#5b8aff",
    sidebar_color: "#0b1224",
    settings: {
      preset: "sombre",
      radius: "md",
      button_shape: "rounded",
      button_style: "soft",
      table_style: "bordered",
      density: "normal",
      card_style: "flat",
      font_latin: "inter",
      font_arabic: "noto_kufi",
      animations: true,
      default_mode: "dark",
    },
  },
];

export const DEFAULT_DESIGN: DesignSettings = DESIGN_PRESETS[0].settings;

export function findPreset(id: string | null | undefined): DesignPreset | undefined {
  return DESIGN_PRESETS.find((p) => p.id === id);
}

function pick<K extends keyof Options>(key: K, value: unknown): Options[K][number] | null {
  const list = DESIGN_OPTIONS[key] as readonly string[];
  return typeof value === "string" && list.includes(value) ? (value as Options[K][number]) : null;
}

const DESIGN_KEYS = [...(Object.keys(DESIGN_OPTIONS) as (keyof Options)[]), "animations"] as const;

/**
 * Valid values from a sys_ui_theme row; anything missing or unknown falls back to the preset, then the default.
 * null while no look was ever chosen: the application then keeps its original appearance, untouched.
 */
export function parseDesign(row: Record<string, unknown> | null | undefined): DesignSettings | null {
  if (!row || DESIGN_KEYS.every((key) => row[key] === null || row[key] === undefined)) return null;
  const base = findPreset(pick("preset", row.preset))?.settings ?? DEFAULT_DESIGN;
  return {
    preset: pick("preset", row.preset) ?? base.preset,
    radius: pick("radius", row.radius) ?? base.radius,
    button_shape: pick("button_shape", row.button_shape) ?? base.button_shape,
    button_style: pick("button_style", row.button_style) ?? base.button_style,
    table_style: pick("table_style", row.table_style) ?? base.table_style,
    density: pick("density", row.density) ?? base.density,
    card_style: pick("card_style", row.card_style) ?? base.card_style,
    font_latin: pick("font_latin", row.font_latin) ?? base.font_latin,
    font_arabic: pick("font_arabic", row.font_arabic) ?? base.font_arabic,
    animations: typeof row.animations === "boolean" ? row.animations : base.animations,
    default_mode: pick("default_mode", row.default_mode) ?? base.default_mode,
  };
}

export function parseUserPrefs(row: Record<string, unknown> | null | undefined): UserDisplayPrefs {
  return { mode: pick("default_mode", row?.mode), density: pick("density", row?.density) };
}

export function isDesignValue<K extends keyof Options>(key: K, value: unknown): value is Options[K][number] {
  return pick(key, value) !== null;
}

/* —— CSS generation —— */

const RADIUS_BASE: Record<DesignSettings["radius"], number> = { none: 0, sm: 0.25, md: 0.5, lg: 0.75, xl: 1 };

const SPACING: Record<Density, string> = { compact: "0.225rem", normal: "0.25rem", comfortable: "0.275rem" };

const FONT_LATIN: Record<DesignSettings["font_latin"], string> = {
  geist: "var(--font-geist)",
  source_sans: "var(--font-source-sans)",
  inter: "var(--font-inter)",
  ibm_plex: "var(--font-ibm-plex)",
  system: "ui-sans-serif",
};

const FONT_ARABIC: Record<DesignSettings["font_arabic"], string> = {
  cairo: "var(--font-cairo)",
  tajawal: "var(--font-tajawal)",
  ibm_plex_arabic: "var(--font-ibm-plex-arabic)",
  noto_kufi: "var(--font-noto-kufi)",
};

const BUTTON_RADIUS: Record<DesignSettings["button_shape"], string> = {
  square: "0.25rem",
  rounded: "var(--radius-xl)",
  pill: "9999px",
};

const BUTTON_VARS: Record<DesignSettings["button_style"], string> = {
  solid:
    "--btn-bg:var(--color-brand);--btn-fg:#fff;--btn-border:transparent;--btn-border-width:0px;--btn-hover-bg:var(--color-brand-hover);" +
    "--btn-shadow:0 1px 2px color-mix(in srgb,var(--color-brand) 25%,transparent);",
  soft:
    "--btn-bg:var(--color-brand-muted);--btn-fg:var(--color-brand);--btn-border:transparent;--btn-border-width:0px;" +
    "--btn-hover-bg:color-mix(in srgb,var(--color-brand) 20%,var(--surface));--btn-shadow:none;",
  outline:
    "--btn-bg:transparent;--btn-fg:var(--color-brand);--btn-border:var(--color-brand);--btn-border-width:1px;" +
    "--btn-hover-bg:var(--color-brand-muted);--btn-shadow:none;",
  gradient:
    "--btn-bg:linear-gradient(135deg,var(--color-brand),color-mix(in srgb,var(--color-brand) 55%,#c026d3));--btn-fg:#fff;" +
    "--btn-border:transparent;--btn-border-width:0px;--btn-hover-bg:linear-gradient(135deg,var(--color-brand-hover),color-mix(in srgb,var(--color-brand-hover) 55%,#a21caf));" +
    "--btn-shadow:0 6px 18px -8px color-mix(in srgb,var(--color-brand) 70%,transparent);",
};

const LINE = "1px solid color-mix(in oklab,var(--border) 75%,transparent)";

const TABLE_VARS: Record<DesignSettings["table_style"], string> = {
  lines: `--tbl-head-bg:color-mix(in oklab,var(--surface-muted) 88%,transparent);--tbl-row-border:${LINE};--tbl-cell-border:0 solid transparent;--tbl-stripe:transparent;`,
  striped: `--tbl-head-bg:color-mix(in oklab,var(--surface-muted) 92%,transparent);--tbl-row-border:0 solid transparent;--tbl-cell-border:0 solid transparent;--tbl-stripe:color-mix(in oklab,var(--surface-muted) 70%,transparent);`,
  bordered: `--tbl-head-bg:var(--surface-muted);--tbl-row-border:${LINE};--tbl-cell-border:${LINE};--tbl-stripe:transparent;`,
  minimal: `--tbl-head-bg:transparent;--tbl-row-border:0 solid transparent;--tbl-cell-border:0 solid transparent;--tbl-stripe:transparent;`,
};

const CARD_VARS: Record<DesignSettings["card_style"], { light: string; dark: string }> = {
  shadow: { light: "--card-bg:var(--surface);--card-border:color-mix(in oklab,var(--border) 80%,transparent);", dark: "" },
  border: {
    light: "--card-bg:var(--surface);--card-border:var(--border);--card-shadow:none;",
    dark: "--card-shadow:none;",
  },
  flat: {
    light: "--card-bg:var(--surface);--card-border:transparent;--card-shadow:none;",
    dark: "--card-shadow:none;",
  },
  glass: {
    light:
      "--card-bg:color-mix(in oklab,var(--surface) 72%,transparent);--card-border:color-mix(in oklab,white 55%,var(--border));" +
      "--card-shadow:0 1px 2px rgba(15,23,42,.04),0 18px 40px -24px rgba(15,23,42,.35);",
    dark: "--card-border:color-mix(in oklab,white 10%,var(--border));--card-shadow:0 18px 40px -24px rgba(0,0,0,.7);",
  },
};

/* Variables a chosen look sets; unset, every component falls back to its original appearance. */
const LOOK_VARS = [
  "--app-font-sans",
  "--btn-radius",
  "--btn-bg",
  "--btn-fg",
  "--btn-border",
  "--btn-border-width",
  "--btn-hover-bg",
  "--btn-shadow",
  "--tbl-head-bg",
  "--tbl-row-border",
  "--tbl-cell-border",
  "--tbl-stripe",
  "--card-bg",
  "--card-border",
];

const TAILWIND_RADIUS =
  "--radius-sm:0.25rem;--radius-md:0.375rem;--radius-lg:0.5rem;--radius-xl:0.75rem;--radius-2xl:1rem;--radius-3xl:1.5rem;";

function num(n: number): string {
  return `${Math.round(n * 1000) / 1000}rem`;
}

/** `:root` for the whole application, or a class selector to preview a look inside one element. */
export function scopeSelectors(scope: string): { light: string; dark: string; all: string } {
  return scope === ":root"
    ? { light: ":root", dark: ".dark", all: "*,*::before,*::after" }
    : { light: scope, dark: `.dark ${scope},${scope}.dark`, all: `${scope},${scope} *,${scope} *::before,${scope} *::after` };
}

function tableRules(scope: string): string {
  const t = scope === ":root" ? "" : `${scope} `;
  return (
    "@layer base{" +
    `${t}table{border-collapse:separate;border-spacing:0}` +
    `${t}thead tr{background:var(--tbl-head-bg)}` +
    `${t}tbody>tr>td{border-bottom:var(--tbl-row-border)}` +
    `${t}tbody>tr:last-child>td{border-bottom-width:0}` +
    `${t}tbody>tr:nth-child(even)>td{background-color:var(--tbl-stripe)}` +
    `${t}th:not(:last-child),${t}td:not(:last-child){border-inline-end:var(--tbl-cell-border)}` +
    `${t}thead th{border-bottom:var(--tbl-cell-border)}` +
    `${t}tbody>tr{transition:background-color 120ms ease}` +
    `${t}tbody>tr:hover>td{background-color:color-mix(in oklab,var(--color-brand-muted) 55%,transparent)}` +
    `@media print{${t}tbody>tr:hover>td{background-color:transparent}}` +
    "}"
  );
}

/**
 * Look (and the user's own density) as CSS. Only tokens from the closed lists above end up in the text.
 * Without a chosen look (null) nothing of the original appearance changes; only the user's density applies.
 */
export function designCss(
  design: DesignSettings | null,
  prefs: UserDisplayPrefs = EMPTY_USER_PREFS,
  scope = ":root",
): string {
  const sel = scopeSelectors(scope);
  const animate = scope === ":root" ? "" : `${scope} `;
  const noEnterExit = `${animate}.animate-in,${animate}.animate-out{animation:none!important}`;

  if (!design) {
    const reset = scope === ":root" ? "" : `${LOOK_VARS.map((v) => `${v}:initial;`).join("")}${TAILWIND_RADIUS}--spacing:0.25rem;`;
    const spacing = prefs.density ? `--spacing:${SPACING[prefs.density]};` : "";
    const root = reset + spacing;
    return (root ? `${sel.light}{${root}}` : "") + noEnterExit;
  }

  const f = RADIUS_BASE[design.radius] / 0.75;
  const density = prefs.density ?? design.density;
  const root = [
    `--radius:${num(RADIUS_BASE[design.radius])};`,
    `--radius-sm:${num(0.25 * f)};--radius-md:${num(0.375 * f)};--radius-lg:${num(0.5 * f)};`,
    `--radius-xl:${num(0.75 * f)};--radius-2xl:${num(1 * f)};--radius-3xl:${num(1.5 * f)};`,
    `--spacing:${SPACING[density]};`,
    `--app-font-sans:${FONT_LATIN[design.font_latin]},${FONT_ARABIC[design.font_arabic]},system-ui,sans-serif;`,
    `--btn-radius:${BUTTON_RADIUS[design.button_shape]};`,
    BUTTON_VARS[design.button_style],
    TABLE_VARS[design.table_style],
    CARD_VARS[design.card_style].light,
  ].join("");
  const rules = [`${sel.light}{${root}}`, tableRules(scope)];
  if (CARD_VARS[design.card_style].dark) rules.push(`${sel.dark}{${CARD_VARS[design.card_style].dark}}`);
  if (!design.animations) {
    rules.push(
      `${sel.all}{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}`,
      noEnterExit,
    );
  }
  return rules.join("");
}

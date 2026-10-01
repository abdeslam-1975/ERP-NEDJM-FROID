"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check, Moon, Palette, RotateCcw, Save, Sparkles, Sun } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { RhPanel, RhSectionTitle, RhTabs, rhInput } from "@/components/rh/rh-ui";
import { saveUiDesign } from "@/lib/actions/ui-control";
import {
  DESIGN_PRESETS,
  EMPTY_USER_PREFS,
  designCss,
  type DesignSettings,
} from "@/lib/ui/design";
import { EMPTY_THEME, isHexColor, themeCss, type UiTheme } from "@/lib/ui/resolve";
import { cn } from "@/lib/utils";

const DEFAULT_BRAND = "#3b6ef5";
const DEFAULT_SIDEBAR = "#1a2f8a";
const PREVIEW_SCOPE = ".ui-preview";

type Choice<V extends string> = { value: V; label: string; style?: CSSProperties; sample?: string };

const RADIUS: Choice<DesignSettings["radius"]>[] = [
  { value: "none", label: "Carrés" },
  { value: "sm", label: "Discrets" },
  { value: "md", label: "Moyens" },
  { value: "lg", label: "Arrondis" },
  { value: "xl", label: "Très arrondis" },
];
const BUTTON_SHAPE: Choice<DesignSettings["button_shape"]>[] = [
  { value: "square", label: "Carrés" },
  { value: "rounded", label: "Arrondis" },
  { value: "pill", label: "Pilule" },
];
const BUTTON_STYLE: Choice<DesignSettings["button_style"]>[] = [
  { value: "solid", label: "Plein" },
  { value: "soft", label: "Doux" },
  { value: "outline", label: "Contour" },
  { value: "gradient", label: "Dégradé" },
];
const TABLE_STYLE: Choice<DesignSettings["table_style"]>[] = [
  { value: "lines", label: "Lignes" },
  { value: "striped", label: "Zébrés" },
  { value: "bordered", label: "Bordés" },
  { value: "minimal", label: "Épurés" },
];
const DENSITY: Choice<DesignSettings["density"]>[] = [
  { value: "compact", label: "Compacte" },
  { value: "normal", label: "Normale" },
  { value: "comfortable", label: "Aérée" },
];
const CARD_STYLE: Choice<DesignSettings["card_style"]>[] = [
  { value: "shadow", label: "Ombre" },
  { value: "border", label: "Bordure" },
  { value: "flat", label: "Plat" },
  { value: "glass", label: "Verre" },
];
const FONT_LATIN: Choice<DesignSettings["font_latin"]>[] = [
  { value: "source_sans", label: "Source Sans", style: { fontFamily: "var(--font-source-sans)" }, sample: "Aa 123" },
  { value: "inter", label: "Inter", style: { fontFamily: "var(--font-inter)" }, sample: "Aa 123" },
  { value: "ibm_plex", label: "IBM Plex", style: { fontFamily: "var(--font-ibm-plex)" }, sample: "Aa 123" },
  { value: "system", label: "Système", style: { fontFamily: "ui-sans-serif, system-ui" }, sample: "Aa 123" },
];
const FONT_ARABIC: Choice<DesignSettings["font_arabic"]>[] = [
  { value: "cairo", label: "Cairo", style: { fontFamily: "var(--font-cairo)" }, sample: "نجم فرويد" },
  { value: "tajawal", label: "Tajawal", style: { fontFamily: "var(--font-tajawal)" }, sample: "نجم فرويد" },
  { value: "ibm_plex_arabic", label: "IBM Plex Arabic", style: { fontFamily: "var(--font-ibm-plex-arabic)" }, sample: "نجم فرويد" },
  { value: "noto_kufi", label: "Noto Kufi", style: { fontFamily: "var(--font-noto-kufi)" }, sample: "نجم فرويد" },
];
const MODES: Choice<DesignSettings["default_mode"]>[] = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Selon l'appareil" },
];

function sameSettings(a: DesignSettings, b: DesignSettings): boolean {
  return (Object.keys(a) as (keyof DesignSettings)[]).every((k) => k === "preset" || a[k] === b[k]);
}

export function AppearancePanel({
  initialTheme,
  initialDesign,
  designReady,
}: {
  initialTheme: UiTheme;
  initialDesign: DesignSettings;
  designReady: boolean;
}) {
  const router = useRouter();
  const [brand, setBrand] = useState<string | null>(initialTheme.brand_color);
  const [sidebar, setSidebar] = useState<string | null>(initialTheme.sidebar_color);
  const [appName, setAppName] = useState(initialTheme.app_name ?? "");
  const [appSubtitle, setAppSubtitle] = useState(initialTheme.app_subtitle ?? "");
  const [design, setDesign] = useState<DesignSettings>(initialDesign);
  const [previewDark, setPreviewDark] = useState(false);
  const [pending, startTransition] = useTransition();

  const theme: UiTheme = { brand_color: brand, sidebar_color: sidebar, app_name: appName, app_subtitle: appSubtitle };
  const preset = DESIGN_PRESETS.find((p) => p.id === design.preset);
  const custom = !preset || !sameSettings(preset.settings, design);
  const previewCss = useMemo(
    () =>
      designCss(design, EMPTY_USER_PREFS, PREVIEW_SCOPE) +
      themeCss({ brand_color: brand ?? DEFAULT_BRAND, sidebar_color: sidebar ?? DEFAULT_SIDEBAR, app_name: null, app_subtitle: null }, PREVIEW_SCOPE),
    [design, brand, sidebar],
  );

  function set<K extends keyof DesignSettings>(key: K, value: DesignSettings[K]) {
    setDesign((d) => ({ ...d, [key]: value }));
  }

  function applyPreset(id: string) {
    const p = DESIGN_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setDesign(p.settings);
    setBrand(p.brand_color);
    setSidebar(p.sidebar_color);
  }

  function submit(next: { theme: UiTheme; design: DesignSettings | null }, text: string) {
    startTransition(async () => {
      const res = await saveUiDesign({ ...next, designReady });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBrand(res.data.theme.brand_color);
      setSidebar(res.data.theme.sidebar_color);
      setAppName(res.data.theme.app_name ?? "");
      setAppSubtitle(res.data.theme.app_subtitle ?? "");
      setDesign(res.data.design);
      toast.success(text);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-5">
        {!designReady ? (
          <Alert tone="warning">
            Le style (boutons, tableaux, polices…) sera enregistrable après l&apos;application de la migration
            <code className="mx-1">20261013090000_ui_design</code>. En attendant, seuls les couleurs et le nom sont enregistrés.
          </Alert>
        ) : null}

        <RhPanel className="space-y-4">
          <RhSectionTitle>Thèmes prêts · سمات جاهزة</RhSectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {DESIGN_PRESETS.map((p) => {
              const active = design.preset === p.id && !custom;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={cn(
                    "group flex items-start gap-3 rounded-2xl border p-3 text-left transition hover:border-brand/60 hover:bg-brand-muted/40",
                    active ? "border-brand bg-brand-muted/50 ring-2 ring-brand/20" : "border-border/70",
                  )}
                >
                  <span className="flex h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-black/5">
                    <span className="w-5" style={{ backgroundColor: p.sidebar_color }} />
                    <span className="flex flex-1 items-center justify-center bg-white">
                      <span
                        className="h-3 w-7"
                        style={{
                          background:
                            p.settings.button_style === "gradient"
                              ? `linear-gradient(135deg, ${p.brand_color}, #c026d3)`
                              : p.settings.button_style === "outline"
                                ? "transparent"
                                : p.brand_color,
                          border: `1.5px solid ${p.brand_color}`,
                          borderRadius: p.settings.button_shape === "pill" ? 999 : p.settings.button_shape === "square" ? 2 : 5,
                          opacity: p.settings.button_style === "soft" ? 0.45 : 1,
                        }}
                      />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      {p.labelFr}
                      <span className="text-sm font-normal text-foreground/55" dir="rtl">
                        {p.labelAr}
                      </span>
                      {active ? <Check className="ms-auto size-4 text-brand" aria-hidden /> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-foreground/60">{p.descriptionFr}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {custom ? (
            <p className="flex items-center gap-1.5 text-xs text-foreground/60">
              <Sparkles className="size-3.5 text-brand" aria-hidden /> Style personnalisé (basé sur « {preset?.labelFr ?? "Classique"} »).
            </p>
          ) : null}
        </RhPanel>

        <RhPanel className="space-y-5">
          <RhSectionTitle>Formes et composants · الأشكال والعناصر</RhSectionTitle>
          <Segmented label="Coins des cartes et champs · الزوايا" value={design.radius} choices={RADIUS} onChange={(v) => set("radius", v)} />
          <Segmented label="Forme des boutons · شكل الأزرار" value={design.button_shape} choices={BUTTON_SHAPE} onChange={(v) => set("button_shape", v)} />
          <Segmented label="Style des boutons principaux · نمط الأزرار" value={design.button_style} choices={BUTTON_STYLE} onChange={(v) => set("button_style", v)} />
          <Segmented label="Tableaux · الجداول" value={design.table_style} choices={TABLE_STYLE} onChange={(v) => set("table_style", v)} />
          <Segmented label="Cartes et fenêtres · البطاقات والنوافذ" value={design.card_style} choices={CARD_STYLE} onChange={(v) => set("card_style", v)} />
          <Segmented label="Densité (par défaut) · الكثافة" value={design.density} choices={DENSITY} onChange={(v) => set("density", v)} />
        </RhPanel>

        <RhPanel className="space-y-5">
          <RhSectionTitle>Polices, mode et animations · الخطوط والوضع والحركة</RhSectionTitle>
          <Segmented label="Police latine · الخط اللاتيني" value={design.font_latin} choices={FONT_LATIN} onChange={(v) => set("font_latin", v)} />
          <Segmented label="Police arabe · الخط العربي" value={design.font_arabic} choices={FONT_ARABIC} onChange={(v) => set("font_arabic", v)} />
          <Segmented label="Mode par défaut · الوضع الافتراضي" value={design.default_mode} choices={MODES} onChange={(v) => set("default_mode", v)} />
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3">
            <span>
              <span className="block text-sm font-medium text-foreground">Animations et transitions · الحركات</span>
              <span className="block text-xs text-foreground/55">
                Désactivées automatiquement pour les personnes qui ont demandé « réduire les animations » sur leur appareil.
              </span>
            </span>
            <Switch checked={design.animations} onChange={(v) => set("animations", v)} label="Animations" />
          </label>
          <p className="text-xs text-foreground/55">
            Chaque utilisateur peut choisir son propre mode (clair / sombre) et sa densité depuis le bouton d&apos;affichage en haut de l&apos;écran.
          </p>
        </RhPanel>

        <RhPanel className="space-y-4">
          <RhSectionTitle>Couleurs et nom · الألوان والاسم</RhSectionTitle>
          <ColorField label="Couleur principale · اللون الرئيسي" value={brand} fallback={DEFAULT_BRAND} onChange={setBrand} />
          <ColorField label="Couleur du menu latéral · لون القائمة الجانبية" value={sidebar} fallback={DEFAULT_SIDEBAR} onChange={setSidebar} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground/75">
              Nom affiché en haut du menu · اسم البرنامج
              <input className={rhInput} value={appName} placeholder="NEDJM FROID" maxLength={40} onChange={(e) => setAppName(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-foreground/75">
              Sous-titre · العنوان الفرعي
              <input className={rhInput} value={appSubtitle} placeholder="ERP · نجم فرويد" maxLength={60} onChange={(e) => setAppSubtitle(e.target.value)} />
            </label>
          </div>
        </RhPanel>

        <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-surface/90 p-3 shadow-[var(--card-shadow)] backdrop-blur-md">
          <Button disabled={pending} onClick={() => submit({ theme, design }, "Apparence enregistrée. · تم حفظ المظهر.")}>
            <Save aria-hidden /> Enregistrer · حفظ
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => submit({ theme: EMPTY_THEME, design: null }, "Apparence par défaut rétablie. · تم استرجاع المظهر الأصلي.")}
          >
            <RotateCcw aria-hidden /> Rétablir par défaut · استرجاع الأصل
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => applyPreset("classique")}>
            <Palette aria-hidden /> Revenir au thème Classique (sans enregistrer)
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <RhPanel padded={false}>
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
            <p className="text-xs font-semibold tracking-[0.12em] text-foreground/55 uppercase">Aperçu en direct · معاينة</p>
            <Button variant="ghost" size="sm" onClick={() => setPreviewDark((v) => !v)}>
              {previewDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
              {previewDark ? "Clair" : "Sombre"}
            </Button>
          </div>
          <style>{previewCss}</style>
          <Preview dark={previewDark} appName={appName} appSubtitle={appSubtitle} />
        </RhPanel>
      </div>
    </div>
  );
}

function Preview({ dark, appName, appSubtitle }: { dark: boolean; appName: string; appSubtitle: string }) {
  const [tab, setTab] = useState("liste");
  return (
    <div className={cn("ui-preview flex bg-background font-sans text-foreground", dark && "dark")}>
      <div className="w-32 shrink-0 space-y-2 p-2.5 text-white" style={{ backgroundColor: "var(--sidebar)" }}>
        <div className="px-1">
          <p className="text-xs font-bold">{appName.trim() || "NEDJM FROID"}</p>
          <p className="text-[10px] opacity-70">{appSubtitle.trim() || "ERP · نجم فرويد"}</p>
        </div>
        <p className="rounded-lg bg-brand px-2 py-1.5 text-[11px] font-semibold">Ressources humaines</p>
        <p className="px-2 text-[11px] opacity-80">Finance</p>
        <p className="px-2 text-[11px] opacity-80">Achats</p>
      </div>
      <div className="min-w-0 flex-1 space-y-3 p-3">
        <RhTabs
          items={[
            { id: "liste", label: "Liste" },
            { id: "fiche", label: "Fiche" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Enregistrer</Button>
          <Button size="sm" variant="secondary">
            Annuler
          </Button>
          <Button size="sm" variant="ghost">
            Plus
          </Button>
        </div>
        <input className={cn(rhInput, "mt-0 h-9")} placeholder="Rechercher un employé…" readOnly />
        <div className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--card-shadow)]">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-2.5 py-2 text-left font-semibold text-foreground/55">Employé</th>
                <th className="px-2.5 py-2 text-left font-semibold text-foreground/55">Statut</th>
                <th className="px-2.5 py-2 text-right font-semibold text-foreground/55">Salaire</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Amine B.", "Actif", "85 000"],
                ["Sara K. · سارة", "Congé", "72 500"],
                ["Yacine M.", "Actif", "64 000"],
                ["Nour H.", "Sortie", "58 900"],
              ].map(([name, status, salary]) => (
                <tr key={name}>
                  <td className="px-2.5 py-2">{name}</td>
                  <td className="px-2.5 py-2">
                    <Badge tone={status === "Actif" ? "success" : status === "Congé" ? "warning" : "neutral"}>{status}</Badge>
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{salary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Alert tone="info" className="px-3 py-2 text-xs">
          Paie de septembre prête à valider.
        </Alert>
      </div>
    </div>
  );
}

function Segmented<V extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: V;
  choices: Choice<V>[];
  onChange: (value: V) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground/75">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {choices.map((c) => {
          const active = c.value === value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(c.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition",
                active
                  ? "border-brand bg-brand-muted font-semibold text-brand"
                  : "border-border/70 text-foreground/75 hover:border-brand/40 hover:bg-surface-muted",
              )}
            >
              {c.label}
              {c.sample ? (
                <span className="text-xs text-foreground/55" style={c.style}>
                  {c.sample}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-brand" : "bg-border",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground/75">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-surface"
          value={isHexColor(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <code className="text-xs text-foreground/60">{value ?? `${fallback} (par défaut)`}</code>
        {value ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Couleur par défaut
          </Button>
        ) : null}
      </div>
    </div>
  );
}
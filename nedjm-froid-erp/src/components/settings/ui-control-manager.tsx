"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhPanel, RhTabs, rhInput } from "@/components/rh/rh-ui";
import {
  resetTabsetLayout,
  saveTabsetLayout,
  saveUiTheme,
  setRoleItemsHidden,
  type UiControlData,
} from "@/lib/actions/ui-control";
import { NAV_GROUPS_TABSET, UI_LEVELS, UI_NAV_GROUPS, UI_TABSETS, findItem } from "@/lib/ui/registry";
import {
  EMPTY_THEME,
  isHexColor,
  resolveTabset,
  type UiLayoutData,
  type UiOverride,
  type UiTheme,
} from "@/lib/ui/resolve";

type Panel = "visibility" | "order" | "appearance";
type HiddenRow = { role_id: string; item_key: string };

const DEFAULT_BRAND = "#3b6ef5";
const DEFAULT_SIDEBAR = "#1a2f8a";

function catalogView(overrides: Record<string, UiOverride>): UiLayoutData {
  return { unrestricted: true, hidden: [], overrides, theme: EMPTY_THEME };
}

export function UiControlManager({ initial }: { initial: UiControlData }) {
  const [panel, setPanel] = useState<Panel>("visibility");
  const [hidden, setHidden] = useState<HiddenRow[]>(initial.hidden);
  const [overrides, setOverrides] = useState<Record<string, UiOverride>>(initial.overrides);

  return (
    <div className="space-y-5">
      <RhTabs
        items={[
          { id: "visibility", label: "Visibilité par rôle · الإظهار حسب الدور" },
          { id: "order", label: "Ordre et libellés · الترتيب والأسماء" },
          { id: "appearance", label: "Apparence · المظهر" },
        ]}
        value={panel}
        onChange={(id) => setPanel(id as Panel)}
      />
      {panel === "visibility" ? (
        <VisibilityPanel roles={initial.roles} hidden={hidden} setHidden={setHidden} overrides={overrides} />
      ) : panel === "order" ? (
        <OrderPanel overrides={overrides} setOverrides={setOverrides} />
      ) : (
        <AppearancePanel initial={initial.theme} />
      )}
    </div>
  );
}

function VisibilityPanel({
  roles,
  hidden,
  setHidden,
  overrides,
}: {
  roles: UiControlData["roles"];
  hidden: HiddenRow[];
  setHidden: (rows: HiddenRow[]) => void;
  overrides: Record<string, UiOverride>;
}) {
  const router = useRouter();
  const selectable = roles.filter((r) => r.code !== "SUPER_ADMIN");
  const [roleId, setRoleId] = useState(selectable[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const view = useMemo(() => catalogView(overrides), [overrides]);
  const hiddenSet = useMemo(
    () => new Set(hidden.filter((h) => h.role_id === roleId).map((h) => h.item_key)),
    [hidden, roleId],
  );

  function apply(keys: string[], hide: boolean) {
    if (!roleId || !keys.length) return;
    const previous = hidden;
    const others = hidden.filter((h) => !(h.role_id === roleId && keys.includes(h.item_key)));
    setHidden(hide ? [...others, ...keys.map((item_key) => ({ role_id: roleId, item_key }))] : others);
    setError(null);
    startTransition(async () => {
      const res = await setRoleItemsHidden({ role_id: roleId, item_keys: keys, hidden: hide });
      if (!res.ok) {
        setHidden(previous);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (!selectable.length) {
    return <RhAlert tone="info">Aucun rôle à configurer en dehors du SUPER_ADMIN.</RhAlert>;
  }

  return (
    <div className="space-y-5">
      <RhPanel className="flex flex-wrap items-end gap-4">
        <label className="min-w-64 text-sm font-medium text-foreground/75">
          Rôle · الدور
          <select className={rhInput} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {selectable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label_fr} ({r.code}){r.is_active ? "" : " — inactif"}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-sm text-foreground/60">
          {hiddenSet.size
            ? `${hiddenSet.size} élément(s) masqué(s) pour ce rôle.`
            : "Tout est affiché pour ce rôle."}{" "}
          Un utilisateur qui a plusieurs rôles voit un élément dès qu&apos;un de ses rôles l&apos;affiche.
        </p>
      </RhPanel>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}

      {UI_LEVELS.map((level) => (
        <section key={level.level} className="space-y-3">
          <h3 className="font-display text-lg font-semibold">
            {level.level}. {level.titleFr}
            <span className="ms-2 text-sm font-normal text-foreground/55" dir="rtl">
              {level.titleAr}
            </span>
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {UI_TABSETS.filter((t) => t.level === level.level).map((tabset) => {
              const items = resolveTabset(view, tabset.key, { includeHidden: true });
              const hideable = items.filter((i) => !i.locked).map((i) => i.key);
              return (
                <RhPanel key={tabset.key} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{tabset.titleFr}</p>
                      <p className="text-xs text-foreground/55">{tabset.whereFr}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => apply(hideable, false)}>
                        Tout afficher
                      </Button>
                      <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => apply(hideable, true)}>
                        Tout masquer
                      </Button>
                    </div>
                  </div>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {items.map((item) => {
                      const visible = item.locked || !hiddenSet.has(item.key);
                      return (
                        <li key={item.key}>
                          <label
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                              visible ? "text-foreground" : "text-foreground/45 line-through"
                            } ${item.locked ? "cursor-not-allowed" : "cursor-pointer hover:bg-surface-muted"}`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--color-brand)]"
                              checked={visible}
                              disabled={item.locked}
                              onChange={(e) => apply([item.key], !e.target.checked)}
                            />
                            <span className="min-w-0 truncate">{item.label}</span>
                            {item.locked ? <RhChip>toujours visible</RhChip> : null}
                            {item.alias ? <RhChip>lien</RhChip> : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </RhPanel>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

type DraftRow = {
  key: string;
  defaultFr: string;
  defaultAr: string;
  label_fr: string;
  label_ar: string;
  group_key: string;
  defaultGroup: string;
};

function draftRows(tabset: string, overrides: Record<string, UiOverride>): DraftRow[] {
  if (tabset === NAV_GROUPS_TABSET) {
    return UI_NAV_GROUPS.map((g, index) => ({ g, index }))
      .sort((a, b) => (overrides[a.g.key]?.sort_order ?? (a.index + 1) * 10) - (overrides[b.g.key]?.sort_order ?? (b.index + 1) * 10))
      .map(({ g }) => ({
        key: g.key,
        defaultFr: g.titleFr,
        defaultAr: g.titleAr,
        label_fr: overrides[g.key]?.label_fr ?? "",
        label_ar: overrides[g.key]?.label_ar ?? "",
        group_key: "",
        defaultGroup: "",
      }));
  }
  return resolveTabset(catalogView(overrides), tabset, { includeHidden: true }).map((item) => {
    const defaultGroup = findItem(item.key)?.item.group ?? "";
    return {
      key: item.key,
      defaultFr: findItem(item.key)?.item.labelFr ?? item.label,
      defaultAr: findItem(item.key)?.item.labelAr ?? "",
      label_fr: overrides[item.key]?.label_fr ?? "",
      label_ar: overrides[item.key]?.label_ar ?? "",
      group_key: overrides[item.key]?.group_key ?? defaultGroup,
      defaultGroup,
    };
  });
}

function OrderPanel({
  overrides,
  setOverrides,
}: {
  overrides: Record<string, UiOverride>;
  setOverrides: (next: Record<string, UiOverride>) => void;
}) {
  const [tabset, setTabset] = useState("nav");
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-4">
      <RhPanel>
        <label className="block max-w-xl text-sm font-medium text-foreground/75">
          Liste à organiser · القائمة
          <select className={rhInput} value={tabset} onChange={(e) => setTabset(e.target.value)}>
            <optgroup label="A. Menu latéral">
              <option value="nav">Menu latéral — modules</option>
              <option value={NAV_GROUPS_TABSET}>Menu latéral — groupes</option>
            </optgroup>
            {UI_LEVELS.filter((l) => l.level !== "A").map((level) => (
              <optgroup key={level.level} label={`${level.level}. ${level.titleFr}`}>
                {UI_TABSETS.filter((t) => t.level === level.level).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.titleFr} — {t.whereFr}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </RhPanel>
      <OrderEditor
        key={`${tabset}:${version}`}
        tabset={tabset}
        overrides={overrides}
        onSaved={(next) => setOverrides(next)}
        onReset={(next) => {
          setOverrides(next);
          setVersion((v) => v + 1);
        }}
      />
    </div>
  );
}

function OrderEditor({
  tabset,
  overrides,
  onSaved,
  onReset,
}: {
  tabset: string;
  overrides: Record<string, UiOverride>;
  onSaved: (next: Record<string, UiOverride>) => void;
  onReset: (next: Record<string, UiOverride>) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>(() => draftRows(tabset, overrides));
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const isNav = tabset === "nav";

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function patch(index: number, change: Partial<DraftRow>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveTabsetLayout({
        tabset,
        items: rows.map((r) => ({
          key: r.key,
          label_fr: r.label_fr,
          label_ar: r.label_ar,
          group_key: isNav ? r.group_key : null,
        })),
      });
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error });
        return;
      }
      const next = { ...overrides };
      rows.forEach((r, index) => {
        next[r.key] = {
          sort_order: (index + 1) * 10,
          label_fr: r.label_fr.trim() || null,
          label_ar: r.label_ar.trim() || null,
          group_key: isNav && r.group_key !== r.defaultGroup ? r.group_key : null,
        };
      });
      onSaved(next);
      setMessage({ tone: "success", text: "Enregistré. · تم الحفظ." });
      router.refresh();
    });
  }

  function reset() {
    setMessage(null);
    startTransition(async () => {
      const res = await resetTabsetLayout({ tabset });
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error });
        return;
      }
      const next = { ...overrides };
      for (const r of rows) delete next[r.key];
      onReset(next);
      router.refresh();
    });
  }

  return (
    <RhPanel className="space-y-3">
      {message ? <RhAlert tone={message.tone}>{message.text}</RhAlert> : null}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-surface-muted/40 p-2">
            <div className="flex flex-col">
              <button
                type="button"
                className="rounded px-2 text-foreground/60 hover:bg-surface disabled:opacity-30"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Monter"
              >
                ▲
              </button>
              <button
                type="button"
                className="rounded px-2 text-foreground/60 hover:bg-surface disabled:opacity-30"
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                aria-label="Descendre"
              >
                ▼
              </button>
            </div>
            <span className="w-6 text-center text-xs font-semibold text-foreground/45">{index + 1}</span>
            <input
              className={`${rhInput} mt-0 min-w-48 flex-1`}
              value={row.label_fr}
              placeholder={row.defaultFr}
              maxLength={80}
              onChange={(e) => patch(index, { label_fr: e.target.value })}
              aria-label={`Libellé français de ${row.defaultFr}`}
            />
            <input
              className={`${rhInput} mt-0 min-w-40 flex-1`}
              dir="rtl"
              value={row.label_ar}
              placeholder={row.defaultAr || "الاسم بالعربية"}
              maxLength={80}
              onChange={(e) => patch(index, { label_ar: e.target.value })}
              aria-label={`Libellé arabe de ${row.defaultFr}`}
            />
            {isNav ? (
              <select
                className={`${rhInput} mt-0 w-52`}
                value={row.group_key}
                onChange={(e) => patch(index, { group_key: e.target.value })}
                aria-label={`Groupe de ${row.defaultFr}`}
              >
                {UI_NAV_GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {overrides[g.key]?.label_fr ?? g.titleFr}
                  </option>
                ))}
              </select>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground/55">
        Laissez un libellé vide pour garder le nom d&apos;origine (affiché en gris). Les compteurs entre parenthèses restent
        affichés après un nouveau nom.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending}>
          Enregistrer · حفظ
        </Button>
        <Button variant="secondary" onClick={reset} disabled={pending}>
          Rétablir par défaut · استرجاع الأصل
        </Button>
      </div>
    </RhPanel>
  );
}

function AppearancePanel({ initial }: { initial: UiTheme }) {
  const router = useRouter();
  const [brand, setBrand] = useState<string | null>(initial.brand_color);
  const [sidebar, setSidebar] = useState<string | null>(initial.sidebar_color);
  const [appName, setAppName] = useState(initial.app_name ?? "");
  const [appSubtitle, setAppSubtitle] = useState(initial.app_subtitle ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const shownBrand = brand ?? DEFAULT_BRAND;
  const shownSidebar = sidebar ?? DEFAULT_SIDEBAR;

  function submit(theme: UiTheme, text: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await saveUiTheme(theme);
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error });
        return;
      }
      setBrand(res.data.brand_color);
      setSidebar(res.data.sidebar_color);
      setAppName(res.data.app_name ?? "");
      setAppSubtitle(res.data.app_subtitle ?? "");
      setMessage({ tone: "success", text });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <RhPanel className="space-y-4">
        {message ? <RhAlert tone={message.tone}>{message.text}</RhAlert> : null}
        <ColorField
          label="Couleur principale (boutons, onglets actifs) · اللون الرئيسي"
          value={brand}
          fallback={DEFAULT_BRAND}
          onChange={setBrand}
        />
        <ColorField
          label="Couleur du menu latéral · لون القائمة الجانبية"
          value={sidebar}
          fallback={DEFAULT_SIDEBAR}
          onChange={setSidebar}
        />
        <label className="block text-sm font-medium text-foreground/75">
          Nom affiché en haut du menu · اسم البرنامج
          <input className={rhInput} value={appName} placeholder="NEDJM FROID" maxLength={40} onChange={(e) => setAppName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-foreground/75">
          Sous-titre · العنوان الفرعي
          <input
            className={rhInput}
            value={appSubtitle}
            placeholder="ERP · نجم فرويد"
            maxLength={60}
            onChange={(e) => setAppSubtitle(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              submit(
                { brand_color: brand, sidebar_color: sidebar, app_name: appName, app_subtitle: appSubtitle },
                "Apparence enregistrée. · تم حفظ المظهر.",
              )
            }
          >
            Enregistrer · حفظ
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => submit(EMPTY_THEME, "Apparence par défaut rétablie. · تم استرجاع المظهر الأصلي.")}
          >
            Rétablir par défaut · استرجاع الأصل
          </Button>
        </div>
      </RhPanel>

      <RhPanel padded={false}>
        <p className="border-b border-border/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/55">
          Aperçu · معاينة
        </p>
        <div className="flex">
          <div className="w-40 space-y-3 p-3 text-white" style={{ backgroundColor: shownSidebar }}>
            <div>
              <p className="text-sm font-bold">{appName.trim() || "NEDJM FROID"}</p>
              <p className="text-[10px] opacity-70">{appSubtitle.trim() || "ERP · نجم فرويد"}</p>
            </div>
            <p className="rounded-lg px-2 py-1.5 text-xs font-semibold" style={{ backgroundColor: shownBrand }}>
              Module actif
            </p>
            <p className="px-2 text-xs opacity-80">Autre module</p>
          </div>
          <div className="flex-1 space-y-3 p-3">
            <span className="inline-block rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: shownBrand }}>
              Bouton
            </span>
            <p className="text-xs font-semibold" style={{ color: shownBrand }}>
              Lien
            </p>
          </div>
        </div>
      </RhPanel>
    </div>
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
          <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => onChange(null)}>
            Couleur par défaut
          </Button>
        ) : null}
      </div>
    </div>
  );
}

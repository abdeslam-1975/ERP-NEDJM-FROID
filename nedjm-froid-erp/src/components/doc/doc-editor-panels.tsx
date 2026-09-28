"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { simSelectClass } from "@/components/sim/sim-fields";
import { DOC_FORMATS, checkExpr } from "@/lib/doc/engine";
import { describeElement, rgbToHex } from "@/lib/doc/design-dom";
import type { DocTypeMeta } from "@/lib/doc/registry";
import type { DocTemplateRow } from "@/lib/actions/doc-templates";
import { foldSearch } from "@/lib/sim/core";

export const FONTS = [
  "Arial, Helvetica, sans-serif",
  "\"Times New Roman\", Times, serif",
  "Georgia, serif",
  "Tahoma, sans-serif",
  "Verdana, sans-serif",
  "Calibri, Carlito, sans-serif",
  "Cambria, Caladea, serif",
  "\"Courier New\", monospace",
  "Amiri, \"Traditional Arabic\", serif",
  "Cairo, Tahoma, sans-serif",
];

type StyleProp = { prop: string; label: string; kind: "text" | "select" | "color"; options?: string[]; hint?: string };

export const STYLE_PROPS: StyleProp[] = [
  { prop: "font-family", label: "Police", kind: "select", options: FONTS },
  { prop: "font-size", label: "Taille", kind: "text", hint: "12px, 3.5mm…" },
  { prop: "font-weight", label: "Graisse", kind: "select", options: ["400", "600", "700", "800"] },
  { prop: "font-style", label: "Style", kind: "select", options: ["normal", "italic"] },
  { prop: "text-decoration-line", label: "Soulignement", kind: "select", options: ["none", "underline", "line-through"] },
  { prop: "text-transform", label: "Casse", kind: "select", options: ["none", "uppercase", "capitalize", "lowercase"] },
  { prop: "color", label: "Couleur du texte", kind: "color" },
  { prop: "background-color", label: "Fond", kind: "color" },
  { prop: "text-align", label: "Alignement", kind: "select", options: ["left", "center", "right", "justify", "start", "end"] },
  { prop: "vertical-align", label: "Alignement vertical", kind: "select", options: ["top", "middle", "bottom", "baseline"] },
  { prop: "direction", label: "Sens", kind: "select", options: ["ltr", "rtl"] },
  { prop: "line-height", label: "Interligne", kind: "text", hint: "1.4, 18px…" },
  { prop: "letter-spacing", label: "Espacement lettres", kind: "text", hint: "0.5px" },
  { prop: "margin", label: "Marges externes", kind: "text", hint: "haut droite bas gauche : 2mm 0 3mm 0" },
  { prop: "padding", label: "Marges internes", kind: "text", hint: "1mm 2mm" },
  { prop: "border", label: "Bordure", kind: "text", hint: "1px solid #000" },
  { prop: "border-radius", label: "Arrondi", kind: "text", hint: "8px" },
  { prop: "width", label: "Largeur", kind: "text", hint: "100%, 24mm…" },
  { prop: "min-height", label: "Hauteur min.", kind: "text", hint: "28mm" },
  { prop: "display", label: "Affichage", kind: "select", options: ["block", "inline-block", "inline", "grid", "flex", "none"] },
];

export type SelInfo = {
  crumbs: { label: string; up: number }[];
  style: Record<string, { inline: string; computed: string }>;
  field: string;
  format: string;
  cond: string;
  each: string;
  cls: string;
  bare: boolean;
  inTable: boolean;
  canMerge: boolean;
  canSplit: boolean;
};

export function snapshotElement(el: HTMLElement): SelInfo {
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  const style: SelInfo["style"] = {};
  for (const p of STYLE_PROPS) {
    style[p.prop] = { inline: el.style.getPropertyValue(p.prop), computed: cs?.getPropertyValue(p.prop) ?? "" };
  }
  const crumbs: SelInfo["crumbs"] = [];
  let cur: Element | null = el;
  let up = 0;
  while (cur && cur.tagName !== "BODY") {
    crumbs.unshift({ label: describeElement(cur), up });
    cur = cur.parentElement;
    up += 1;
  }
  const cell = el.closest("td,th") as HTMLTableCellElement | null;
  return {
    crumbs,
    style,
    field: el.getAttribute("data-field") ?? "",
    format: el.getAttribute("data-format") ?? "",
    cond: el.getAttribute("data-if") ?? "",
    each: el.getAttribute("data-each") ?? "",
    cls: el.getAttribute("class") ?? "",
    bare: el.hasAttribute("data-bare"),
    inTable: Boolean(cell),
    canMerge: Boolean(cell?.nextElementSibling),
    canSplit: (cell?.colSpan ?? 1) > 1,
  };
}

const label = "block text-[11px] font-medium text-foreground/55";

export function StylePanel({
  sel,
  disabled,
  onStyle,
  onClear,
}: {
  sel: SelInfo | null;
  disabled: boolean;
  onStyle: (prop: string, value: string) => void;
  onClear: () => void;
}) {
  if (!sel) return <p className="px-1 py-6 text-center text-xs text-foreground/50">Cliquez sur un élément du document pour le mettre en forme.</p>;
  return (
    <div className="space-y-2">
      {STYLE_PROPS.map((p) => {
        const v = sel.style[p.prop] ?? { inline: "", computed: "" };
        return (
          <div key={p.prop}>
            <span className={label}>
              {p.label}
              {v.inline ? <span className="ml-1 text-brand">•</span> : null}
            </span>
            <div className="mt-0.5 flex items-center gap-1">
              {p.kind === "select" ? (
                <select
                  className={simSelectClass}
                  disabled={disabled}
                  value={v.inline}
                  onChange={(e) => onStyle(p.prop, e.target.value)}
                >
                  <option value="">Hérité ({v.computed.split(",")[0].replace(/"/g, "")})</option>
                  {p.options!.map((o) => (
                    <option key={o} value={o}>
                      {o.split(",")[0].replace(/"/g, "")}
                    </option>
                  ))}
                </select>
              ) : p.kind === "color" ? (
                <input
                  type="color"
                  disabled={disabled}
                  className="h-8 w-full cursor-pointer rounded-lg border border-border/80 bg-surface"
                  value={rgbToHex(v.inline || v.computed)}
                  onChange={(e) => onStyle(p.prop, e.target.value)}
                />
              ) : (
                <input
                  key={`${p.prop}-${v.inline}`}
                  className={simSelectClass}
                  disabled={disabled}
                  defaultValue={v.inline}
                  placeholder={v.computed || p.hint}
                  title={p.hint}
                  onBlur={(e) => e.target.value !== v.inline && onStyle(p.prop, e.target.value.trim())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              )}
              {v.inline ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="px-1 text-sm text-foreground/50 hover:text-red-600"
                  title="Retirer ce réglage"
                  onClick={() => onStyle(p.prop, "")}
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <Button variant="ghost" className="h-8 w-full text-xs" disabled={disabled} onClick={onClear}>
        Effacer toute la mise en forme de l’élément
      </Button>
    </div>
  );
}

export function FieldsPanel({
  meta,
  disabled,
  onInsert,
}: {
  meta: DocTypeMeta;
  disabled: boolean;
  onInsert: (path: string, format: string, label: string, within?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const tokens = foldSearch(query).split(/\s+/).filter(Boolean);
    const hits = meta.fields.filter((f) => {
      const text = foldSearch(`${f.label} ${f.group} ${f.path}`);
      return tokens.every((t) => text.includes(t));
    });
    const map = new Map<string, typeof hits>();
    for (const f of hits) map.set(f.group, [...(map.get(f.group) ?? []), f]);
    return [...map.entries()];
  }, [meta, query]);
  return (
    <div className="space-y-2">
      <input
        className={simSelectClass}
        placeholder="Chercher un champ (net, nom, date…)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="text-[11px] leading-snug text-foreground/50">
        Placez le curseur dans le document puis cliquez sur un champ : il s’insère avec sa valeur réelle et reste lié aux
        données.
      </p>
      {groups.map(([group, fields]) => (
        <div key={group}>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/45">{group}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {fields.map((f) => (
              <button
                key={`${f.within ?? ""}${f.path}`}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsert(f.path, f.format ?? "", f.label, f.within)}
                className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-900 hover:border-blue-400 disabled:opacity-50 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100"
                title={f.within ? `${f.path} — uniquement dans « ${f.within} »` : f.path}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!groups.length ? <p className="py-4 text-center text-xs text-foreground/50">Aucun champ.</p> : null}
    </div>
  );
}

export type AdvancedValues = { field: string; format: string; cond: string; each: string; cls: string; bare: boolean };

export function AdvancedPanel({
  sel,
  meta,
  disabled,
  css,
  onApply,
  onCss,
}: {
  sel: SelInfo | null;
  meta: DocTypeMeta;
  disabled: boolean;
  css: string;
  onApply: (values: AdvancedValues) => void;
  onCss: (css: string) => void;
}) {
  return (
    <div className="space-y-4">
      {sel ? <ElementProps key={sel.crumbs.map((c) => c.label).join(">") + sel.field + sel.cond + sel.each} sel={sel} meta={meta} disabled={disabled} onApply={onApply} /> : (
        <p className="text-xs text-foreground/50">Sélectionnez un élément pour lier un champ, une condition ou une répétition.</p>
      )}
      <CssEditor key={css} css={css} disabled={disabled} onApply={onCss} />
    </div>
  );
}

function ElementProps({
  sel,
  meta,
  disabled,
  onApply,
}: {
  sel: SelInfo;
  meta: DocTypeMeta;
  disabled: boolean;
  onApply: (values: AdvancedValues) => void;
}) {
  const [v, setV] = useState<AdvancedValues>({
    field: sel.field,
    format: sel.format,
    cond: sel.cond,
    each: sel.each,
    cls: sel.cls,
    bare: sel.bare,
  });
  const condError = useMemo(() => {
    if (!v.cond.trim()) return null;
    try {
      checkExpr(v.cond);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Condition invalide";
    }
  }, [v.cond]);
  return (
    <div className="space-y-2">
      <label className={label}>
        Champ affiché
        <input
          list="doc-field-paths"
          className={`${simSelectClass} mt-0.5`}
          value={v.field}
          disabled={disabled}
          placeholder="aucun (texte libre)"
          onChange={(e) => setV({ ...v, field: e.target.value })}
        />
        <datalist id="doc-field-paths">
          {meta.fields.map((f) => (
            <option key={`${f.within ?? ""}${f.path}`} value={f.path}>
              {f.label}
            </option>
          ))}
        </datalist>
      </label>
      <label className={label}>
        Format
        <select className={`${simSelectClass} mt-0.5`} value={v.format} disabled={disabled} onChange={(e) => setV({ ...v, format: e.target.value })}>
          {DOC_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Afficher seulement si
        <input
          className={`${simSelectClass} mt-0.5 font-mono`}
          value={v.cond}
          disabled={disabled}
          placeholder="ex. fos_amount > 0 || rates.fos_pct > 0"
          onChange={(e) => setV({ ...v, cond: e.target.value })}
        />
        {condError ? <span className="mt-0.5 block text-[11px] text-red-600">{condError}</span> : null}
      </label>
      <label className={label}>
        Répéter pour chaque
        <select className={`${simSelectClass} mt-0.5`} value={v.each} disabled={disabled} onChange={(e) => setV({ ...v, each: e.target.value })}>
          <option value="">— pas de répétition —</option>
          {v.each && ![meta.pageList, ...meta.lists.map((l) => l.path)].includes(v.each) ? <option value={v.each}>{v.each}</option> : null}
          <option value={meta.pageList}>Page imprimée ({meta.pageList})</option>
          {meta.lists.map((l) => (
            <option key={l.path} value={l.path}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Classe CSS
        <input className={`${simSelectClass} mt-0.5 font-mono`} value={v.cls} disabled={disabled} onChange={(e) => setV({ ...v, cls: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-xs text-foreground/70">
        <input type="checkbox" checked={v.bare} disabled={disabled} onChange={(e) => setV({ ...v, bare: e.target.checked })} />
        Imprimer le contenu sans l’élément (texte seul)
      </label>
      <Button className="h-8 w-full text-xs" disabled={disabled || Boolean(condError)} onClick={() => onApply(v)}>
        Appliquer à l’élément
      </Button>
      <p className="text-[11px] leading-snug text-foreground/45">
        Conditions : champs, nombres, &apos;texte&apos;, comparaisons (== != &gt; &lt; &gt;= &lt;=), ! (non), &amp;&amp; (et), || (ou).
      </p>
    </div>
  );
}

function CssEditor({ css, disabled, onApply }: { css: string; disabled: boolean; onApply: (css: string) => void }) {
  const [text, setText] = useState(css);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/45">Styles du document (CSS)</p>
      <textarea
        className="mt-1 h-56 w-full rounded-lg border border-border/80 bg-surface p-2 font-mono text-[11px] leading-snug outline-none focus:border-brand"
        spellCheck={false}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
      />
      <Button variant="secondary" className="mt-1 h-8 w-full text-xs" disabled={disabled || text === css} onClick={() => onApply(text)}>
        Appliquer les styles
      </Button>
    </div>
  );
}

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function VersionsPanel({
  history,
  draft,
  disabled,
  onRestore,
  onDiscard,
}: {
  history: DocTemplateRow[];
  draft: DocTemplateRow | null;
  disabled: boolean;
  onRestore: (row: DocTemplateRow) => void;
  onDiscard: () => void;
}) {
  return (
    <div className="space-y-2">
      {draft ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Brouillon enregistré le {when(draft.updated_at)}
          {draft.note ? ` — ${draft.note}` : ""}
          <Button variant="ghost" className="mt-1 h-7 w-full text-xs" disabled={disabled} onClick={onDiscard}>
            Abandonner le brouillon
          </Button>
        </div>
      ) : null}
      {history.map((row, i) => (
        <div key={row.id} className="rounded-lg border border-border/70 px-2.5 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">
              Version {row.version}
              {i === 0 ? <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">imprimée</span> : null}
            </span>
            <span className="text-foreground/50">{when(row.approved_at)}</span>
          </div>
          {row.note ? <p className="mt-0.5 text-foreground/60">{row.note}</p> : null}
          {i > 0 ? (
            <Button variant="ghost" className="mt-1 h-7 w-full text-xs" disabled={disabled} onClick={() => onRestore(row)}>
              Reprendre dans le brouillon
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

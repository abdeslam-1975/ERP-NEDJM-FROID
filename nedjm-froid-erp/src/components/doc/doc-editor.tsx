"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RhAlert } from "@/components/rh/rh-ui";
import { printHtml } from "@/components/rh/print-frame";
import { DocFrame } from "@/components/sim/doc-frame";
import {
  AdvancedPanel,
  FieldsPanel,
  FONTS,
  StylePanel,
  VersionsPanel,
  snapshotElement,
  type AdvancedValues,
  type SelInfo,
} from "@/components/doc/doc-editor-panels";
import {
  approveDocTemplate,
  discardDocTemplateDraft,
  getDocTemplateState,
  restoreDocTemplateVersion,
  saveDocTemplateDraft,
  type DocTemplateRow,
  type DocTemplateState,
} from "@/lib/actions/doc-templates";
import { escapeHtml, renderTemplate, type DocData } from "@/lib/doc/engine";
import {
  EDITOR_STYLE_ID,
  deleteColumn,
  deleteRow,
  duplicateElement,
  elementAt,
  elementPath,
  escapeAttr,
  insertColumn,
  insertRow,
  installEditorStyle,
  mergeRight,
  moveElement,
  removeElement,
  serializeDesign,
  splitCell,
  tableHtml,
  templateCss,
  withTemplateCss,
} from "@/lib/doc/design-dom";
import { DOC_TYPES, type DocTypeId } from "@/lib/doc/registry";

type Mode = "design" | "preview" | "source";
type Tab = "style" | "fields" | "advanced" | "versions";
type Flash = { tone: "success" | "danger" | "info"; text: string } | null;

const HISTORY_LIMIT = 80;
const SIZES = ["8px", "9px", "10px", "11px", "12px", "13px", "14px", "16px", "18px", "20px", "22px", "26px", "32px"];

function hasRange(doc: Document) {
  const s = doc.getSelection();
  return Boolean(s && s.rangeCount && !s.isCollapsed && s.anchorNode && doc.body.contains(s.anchorNode));
}

function hasCaret(doc: Document) {
  const s = doc.getSelection();
  return Boolean(s && s.rangeCount && s.anchorNode && doc.body.contains(s.anchorNode));
}

function blockOf(el: HTMLElement) {
  let cur: HTMLElement | null = el;
  const win = el.ownerDocument.defaultView;
  while (cur && cur.tagName !== "BODY" && win?.getComputedStyle(cur).display.startsWith("inline")) cur = cur.parentElement;
  return cur && cur.tagName !== "BODY" ? cur : el;
}

export function DocEditor({
  docType,
  data,
  pageWidth,
  onClose,
  onApproved,
}: {
  docType: DocTypeId;
  data: DocData;
  pageWidth: number;
  onClose: () => void;
  onApproved: () => void;
}) {
  const meta = DOC_TYPES[docType];
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef("");
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const liveRef = useRef(false);
  const selRef = useRef<HTMLElement | null>(null);
  const selPathRef = useRef<number[] | null>(null);
  const syncTimer = useRef<number | undefined>(undefined);

  const [tpl, setTpl] = useState<DocTemplateState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [savedHtml, setSavedHtml] = useState<string | null>(null);
  const [stack, setStack] = useState({ past: 0, future: 0 });
  const [renderKey, setRenderKey] = useState(0);
  const [mode, setMode] = useState<Mode>("design");
  const [tab, setTab] = useState<Tab>("style");
  const [sel, setSel] = useState<SelInfo | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const [tableSize, setTableSize] = useState({ rows: 3, cols: 3 });
  const [box, setBox] = useState({ width: pageWidth, height: 900 });
  const [pending, start] = useTransition();

  const canEdit = tpl?.canEdit ?? false;
  const printed = tpl?.approved?.html ?? "";
  const dirty = Boolean(tpl) && html !== (savedHtml ?? printed);
  const approvedAt = tpl?.approved?.approved_at;
  const staleDraft = Boolean(tpl?.draft && approvedAt && Date.parse(tpl.draft.updated_at) < Date.parse(approvedAt));

  useEffect(() => {
    let alive = true;
    getDocTemplateState(docType).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      const initial = r.data.draft?.html ?? r.data.approved?.html ?? "";
      htmlRef.current = initial;
      pastRef.current = [];
      futureRef.current = [];
      setTpl(r.data);
      setHtml(initial);
      setSavedHtml(r.data.draft?.html ?? null);
      setRenderKey((k) => k + 1);
    });
    return () => {
      alive = false;
    };
  }, [docType]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const commit = useCallback((next: string) => {
    if (next === htmlRef.current) return;
    pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), htmlRef.current];
    futureRef.current = [];
    htmlRef.current = next;
    setHtml(next);
    setStack({ past: pastRef.current.length, future: 0 });
  }, []);

  /** Pushes what was typed in the design view into the template. */
  const flush = useCallback(() => {
    window.clearTimeout(syncTimer.current);
    const doc = frameRef.current?.contentDocument;
    if (!liveRef.current || !doc?.getElementById(EDITOR_STYLE_ID)) return;
    commit(serializeDesign(doc));
  }, [commit]);

  const rebuild = useCallback(() => {
    liveRef.current = false;
    setRenderKey((k) => k + 1);
  }, []);

  const replace = useCallback(
    (next: string) => {
      flush();
      commit(next);
      rebuild();
    },
    [flush, commit, rebuild],
  );

  const select = useCallback((el: HTMLElement | null) => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll("[data-doc-sel]").forEach((n) => n.removeAttribute("data-doc-sel"));
    const target = el && el !== doc.body && doc.body?.contains(el) ? el : null;
    target?.setAttribute("data-doc-sel", "");
    selRef.current = target;
    selPathRef.current = elementPath(target);
    setSel(target ? snapshotElement(target) : null);
  }, []);

  const move = useCallback(
    (back: boolean) => {
      flush();
      const from = back ? pastRef.current : futureRef.current;
      const to = back ? futureRef.current : pastRef.current;
      const next = from.pop();
      if (next == null) return;
      to.push(htmlRef.current);
      htmlRef.current = next;
      setHtml(next);
      setStack({ past: pastRef.current.length, future: futureRef.current.length });
      rebuild();
    },
    [flush, rebuild],
  );

  useEffect(() => {
    if (mode !== "design" || !htmlRef.current) return;
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!frame || !doc || !win) return;
    const scroll = win.scrollY;
    doc.open();
    doc.write(renderTemplate(htmlRef.current, data, { design: true }));
    doc.close();
    installEditorStyle(doc);
    if (canEdit) {
      doc.body.setAttribute("contenteditable", "true");
      doc.body.setAttribute("spellcheck", "false");
      try {
        doc.execCommand("styleWithCSS", false, "true");
      } catch {
        // older engines: inline tags instead of styles
      }
    }
    win.scrollTo(0, scroll);
    const again = elementAt(doc, selPathRef.current);
    again?.setAttribute("data-doc-sel", "");
    selRef.current = again;
    liveRef.current = true;

    const absorb = () => {
      window.clearTimeout(syncTimer.current);
      if (liveRef.current && doc.getElementById(EDITOR_STYLE_ID)) commit(serializeDesign(doc));
    };
    const onInput = () => {
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(absorb, 350);
    };
    const pick = (node: Node | null | undefined) => {
      const el = node && (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement);
      if (!el || el === selRef.current) return;
      select((el.closest("[data-field]") as HTMLElement | null) ?? el);
    };
    const onSelection = () => pick(doc.getSelection()?.anchorNode);
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el) select((el.closest("[data-field]") as HTMLElement | null) ?? el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "y") {
        e.preventDefault();
        move(k === "z" && !e.shiftKey);
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      doc.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
    };
    doc.addEventListener("input", onInput);
    doc.addEventListener("selectionchange", onSelection);
    doc.addEventListener("click", onClick);
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("paste", onPaste);
    return () => {
      doc.removeEventListener("input", onInput);
      doc.removeEventListener("selectionchange", onSelection);
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("paste", onPaste);
      if (liveRef.current && doc.getElementById(EDITOR_STYLE_ID)) {
        const next = serializeDesign(doc);
        if (next !== htmlRef.current) window.setTimeout(() => commit(next), 0);
        htmlRef.current = next;
      }
      window.clearTimeout(syncTimer.current);
      liveRef.current = false;
    };
  }, [renderKey, data, mode, canEdit, commit, select, move]);

  /** Runs a DOM edit on the design view, then records it. */
  const edit = (fn: (doc: Document, win: Window, el: HTMLElement | null) => void | "rebuild") => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win || !liveRef.current || !canEdit || mode !== "design") return;
    const el = selRef.current?.isConnected ? selRef.current : null;
    const result = fn(doc, win, el);
    flush();
    if (result === "rebuild") rebuild();
    else setSel(selRef.current?.isConnected ? snapshotElement(selRef.current) : null);
  };

  const exec = (command: string, value?: string) =>
    edit((doc, win) => {
      win.focus();
      doc.execCommand(command, false, value);
    });

  const toggleStyle = (command: string, prop: string, on: string, off: string, isOn: (v: string) => boolean) =>
    edit((doc, win, el) => {
      if (hasRange(doc) || !el) {
        win.focus();
        doc.execCommand(command);
        return;
      }
      const current = win.getComputedStyle(el).getPropertyValue(prop);
      el.style.setProperty(prop, isOn(current) ? off : on);
    });

  const inlineStyle = (command: string, prop: string, value: string) =>
    edit((doc, win, el) => {
      if (hasRange(doc)) {
        win.focus();
        if (command === "fontSize") {
          doc.execCommand("fontSize", false, "7");
          doc.querySelectorAll('font[size="7"]').forEach((f) => {
            const span = doc.createElement("span");
            span.style.fontSize = value;
            span.append(...Array.from(f.childNodes));
            f.replaceWith(span);
          });
          doc.querySelectorAll<HTMLElement>('span[style*="xxx-large"]').forEach((s) => {
            s.style.fontSize = value;
          });
        } else {
          doc.execCommand(command, false, value);
        }
        return;
      }
      el?.style.setProperty(prop, value);
    });

  const blockStyle = (prop: string, value: string) =>
    edit((_doc, _win, el) => {
      if (el) blockOf(el).style.setProperty(prop, value);
    });

  const insertHtml = (markup: string, rebuildAfter = false) =>
    edit((doc, win, el) => {
      if (hasCaret(doc)) {
        win.focus();
        doc.execCommand("insertHTML", false, markup);
      } else if (el) {
        el.insertAdjacentHTML("afterend", markup);
      } else {
        (doc.querySelector(".sheet") ?? doc.body).insertAdjacentHTML("beforeend", markup);
      }
      return rebuildAfter ? "rebuild" : undefined;
    });

  const cellOp = (fn: (cell: HTMLTableCellElement) => void) =>
    edit((_doc, _win, el) => {
      const cell = el?.closest("td,th") as HTMLTableCellElement | null;
      if (cell) fn(cell);
    });

  const setStyle = (prop: string, value: string) =>
    edit((_doc, _win, el) => {
      if (!el) return;
      if (value) el.style.setProperty(prop, value);
      else el.style.removeProperty(prop);
      if (!el.getAttribute("style")) el.removeAttribute("style");
    });

  const applyAdvanced = (v: AdvancedValues) =>
    edit((_doc, _win, el) => {
      if (!el) return;
      const set = (name: string, value: string) => (value.trim() ? el.setAttribute(name, value.trim()) : el.removeAttribute(name));
      set("data-field", v.field);
      set("data-format", v.field ? v.format : "");
      set("data-if", v.cond);
      set("data-each", v.each);
      set("class", v.cls);
      if (v.bare) el.setAttribute("data-bare", "");
      else el.removeAttribute("data-bare");
      return "rebuild";
    });

  const insertField = (path: string, format: string, label: string, within?: string) => {
    const el = selRef.current;
    if (within && !el?.closest(`[data-each="${within}"]`)) {
      setFlash({ tone: "info", text: `« ${label} » n’a de valeur que dans l’élément répété pour « ${within} ».` });
    }
    insertHtml(
      `<span data-field="${escapeAttr(path)}"${format ? ` data-format="${escapeAttr(format)}"` : ""}>${escapeHtml(label)}</span>`,
      true,
    );
  };

  const run = (task: () => Promise<void>) =>
    start(async () => {
      setFlash(null);
      await task();
    });

  const saveDraft = () =>
    run(async () => {
      flush();
      const r = await saveDocTemplateDraft(docType, htmlRef.current);
      if (!r.ok) return setFlash({ tone: "danger", text: r.error });
      if (r.data.html !== htmlRef.current) replace(r.data.html);
      setSavedHtml(r.data.html);
      setTpl((t) => (t ? { ...t, draft: r.data } : t));
      setFlash({ tone: "success", text: "Brouillon enregistré. Il n’est pas encore utilisé pour les impressions." });
    });

  const approve = () =>
    run(async () => {
      flush();
      if (htmlRef.current !== savedHtml) {
        const s = await saveDocTemplateDraft(docType, htmlRef.current);
        if (!s.ok) return setFlash({ tone: "danger", text: s.error });
        if (s.data.html !== htmlRef.current) replace(s.data.html);
      }
      const r = await approveDocTemplate(docType, note);
      if (!r.ok) return setFlash({ tone: "danger", text: r.error });
      const st = await getDocTemplateState(docType);
      if (st.ok) setTpl(st.data);
      setSavedHtml(null);
      setNote("");
      setFlash({ tone: "success", text: `Version ${r.data.version} approuvée : elle est utilisée pour toutes les impressions.` });
      onApproved();
    });

  const restore = (row: DocTemplateRow) =>
    run(async () => {
      const r = await restoreDocTemplateVersion(docType, row.id);
      if (!r.ok) return setFlash({ tone: "danger", text: r.error });
      replace(r.data.html);
      setSavedHtml(r.data.html);
      setTpl((t) => (t ? { ...t, draft: r.data } : t));
      setFlash({ tone: "info", text: `Version ${row.version} reprise dans le brouillon : approuvez-la pour l’imprimer.` });
    });

  const discard = () =>
    run(async () => {
      if (!window.confirm("Abandonner le brouillon et revenir à la version imprimée ?")) return;
      const r = await discardDocTemplateDraft(docType);
      if (!r.ok) return setFlash({ tone: "danger", text: r.error });
      replace(printed);
      setSavedHtml(null);
      setTpl((t) => (t ? { ...t, draft: null } : t));
      setFlash({ tone: "info", text: `Brouillon abandonné : l’éditeur montre la version ${tpl?.approved?.version ?? ""} imprimée.` });
    });

  const switchMode = (next: Mode) => {
    flush();
    if (next === "source") setSource(htmlRef.current);
    if (next === "design") rebuild();
    setMode(next);
  };

  const close = () => {
    flush();
    if (htmlRef.current !== (savedHtml ?? printed) && !window.confirm("Des modifications ne sont pas enregistrées. Fermer quand même ?")) return;
    onClose();
  };

  const previewHtml = useMemo(() => (mode === "preview" && html ? renderTemplate(html, data) : ""), [mode, html, data]);
  const css = useMemo(() => (tab === "advanced" && html ? templateCss(html) : ""), [tab, html]);
  const locked = !canEdit || mode !== "design" || pending;
  const scale = Math.min(1, Math.max(0.35, (box.width - 8) / pageWidth));

  if (loadError) return <RhAlert tone="danger">{loadError}</RhAlert>;

  return (
    <div className="flex min-h-[40rem] flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-surface px-2.5 py-2">
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">
            Modèle · {meta.label} <span className="font-normal text-foreground/45">· {meta.labelAr}</span>
          </p>
          <p className="text-[11px] text-foreground/55">
            {tpl ? (
              <>
                Imprimé : version {tpl.approved?.version ?? "—"}
                {savedHtml ? " · brouillon enregistré" : ""}
                {dirty ? <span className="text-amber-600"> · modifications non enregistrées</span> : null}
              </>
            ) : (
              "Chargement du modèle…"
            )}
          </p>
        </div>
        <Segmented
          value={mode}
          onChange={switchMode}
          items={[
            ["design", "Édition"],
            ["preview", "Aperçu final"],
            ["source", "Code"],
          ]}
        />
        <Button variant="ghost" className="h-8 px-2.5 text-xs" disabled={!html} onClick={() => printHtml(renderTemplate(htmlRef.current, data))}>
          Imprimer l’essai
        </Button>
        {canEdit ? (
          <>
            <Button variant="secondary" className="h-8 px-2.5 text-xs" disabled={pending || !dirty} onClick={saveDraft}>
              Enregistrer le brouillon
            </Button>
            {tpl?.draft || dirty ? (
              <Button variant="ghost" className="h-8 px-2.5 text-xs text-red-700 dark:text-red-300" disabled={pending} onClick={discard}>
                Abandonner le brouillon
              </Button>
            ) : null}
            <input
              className="h-8 w-44 rounded-lg border border-border/80 bg-surface px-2 text-xs outline-none focus:border-brand"
              placeholder="Note de version (facultatif)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              className="h-8 px-2.5 text-xs"
              disabled={pending || (!dirty && !savedHtml)}
              onClick={() => {
                if (window.confirm("Approuver ce modèle ? Il sera utilisé immédiatement pour toutes les impressions.")) approve();
              }}
            >
              Approuver
            </Button>
          </>
        ) : null}
        <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={close}>
          Fermer
        </Button>
      </div>

      {flash ? <RhAlert tone={flash.tone}>{flash.text}</RhAlert> : null}
      {staleDraft ? (
        <RhAlert tone="warning">
          Ce brouillon date d’avant la version {tpl?.approved?.version} actuellement imprimée : l’approuver remplacerait
          cette version. Utilisez « Abandonner le brouillon » pour repartir de la version imprimée.
        </RhAlert>
      ) : null}
      {tpl && !canEdit ? (
        <RhAlert tone="info">Lecture seule : le droit « Paramètres RH — modifier » est nécessaire pour modifier les modèles.</RhAlert>
      ) : null}

      {mode === "design" ? (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-surface px-2 py-1.5">
          <Tool label="Annuler (Ctrl+Z)" disabled={!stack.past} onClick={() => move(true)}>↶</Tool>
          <Tool label="Rétablir (Ctrl+Y)" disabled={!stack.future} onClick={() => move(false)}>↷</Tool>
          <Sep />
          <select
            className="h-7 max-w-36 rounded-md border border-border/80 bg-surface px-1 text-xs"
            disabled={locked}
            value=""
            onChange={(e) => e.target.value && inlineStyle("fontName", "font-family", e.target.value)}
            aria-label="Police"
          >
            <option value="">Police…</option>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f.split(",")[0].replace(/"/g, "")}
              </option>
            ))}
          </select>
          <select
            className="h-7 w-20 rounded-md border border-border/80 bg-surface px-1 text-xs"
            disabled={locked}
            value=""
            onChange={(e) => e.target.value && inlineStyle("fontSize", "font-size", e.target.value)}
            aria-label="Taille"
          >
            <option value="">Taille…</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s.replace("px", "")}
              </option>
            ))}
          </select>
          <Tool label="Gras" disabled={locked} onClick={() => toggleStyle("bold", "font-weight", "700", "400", (v) => Number(v) >= 600)}>
            <b>G</b>
          </Tool>
          <Tool label="Italique" disabled={locked} onClick={() => toggleStyle("italic", "font-style", "italic", "normal", (v) => v === "italic")}>
            <i>I</i>
          </Tool>
          <Tool
            label="Souligné"
            disabled={locked}
            onClick={() => toggleStyle("underline", "text-decoration-line", "underline", "none", (v) => v.includes("underline"))}
          >
            <u>S</u>
          </Tool>
          <Tool
            label="Barré"
            disabled={locked}
            onClick={() => toggleStyle("strikeThrough", "text-decoration-line", "line-through", "none", (v) => v.includes("line-through"))}
          >
            <s>ab</s>
          </Tool>
          <ColorTool label="Couleur du texte" disabled={locked} onPick={(c) => inlineStyle("foreColor", "color", c)} glyph="A" />
          <ColorTool label="Surlignage / fond" disabled={locked} onPick={(c) => inlineStyle("hiliteColor", "background-color", c)} glyph="▇" />
          <Sep />
          <Tool label="Aligner à gauche" disabled={locked} onClick={() => blockStyle("text-align", "left")}>⯇</Tool>
          <Tool label="Centrer" disabled={locked} onClick={() => blockStyle("text-align", "center")}>≡</Tool>
          <Tool label="Aligner à droite" disabled={locked} onClick={() => blockStyle("text-align", "right")}>⯈</Tool>
          <Tool label="Justifier" disabled={locked} onClick={() => blockStyle("text-align", "justify")}>☰</Tool>
          <select
            className="h-7 w-24 rounded-md border border-border/80 bg-surface px-1 text-xs"
            disabled={locked}
            value=""
            onChange={(e) => e.target.value && blockStyle("line-height", e.target.value)}
            aria-label="Interligne"
          >
            <option value="">Interligne…</option>
            {["1", "1.15", "1.35", "1.5", "1.8", "2"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <Tool label="Liste à puces" disabled={locked} onClick={() => exec("insertUnorderedList")}>•≡</Tool>
          <Tool label="Liste numérotée" disabled={locked} onClick={() => exec("insertOrderedList")}>1≡</Tool>
          <Tool label="Effacer la mise en forme" disabled={locked} onClick={() => exec("removeFormat")}>⌫</Tool>
          <Sep />
          <Menu label="Insérer" disabled={locked}>
            <MenuItem onClick={() => insertHtml("<p><br></p>")}>Paragraphe</MenuItem>
            <div className="flex items-center gap-1 px-2 py-1 text-xs" onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                min={1}
                max={30}
                className="h-7 w-12 rounded border border-border/80 bg-surface px-1"
                value={tableSize.rows}
                onChange={(e) => setTableSize({ ...tableSize, rows: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Lignes"
              />
              ×
              <input
                type="number"
                min={1}
                max={12}
                className="h-7 w-12 rounded border border-border/80 bg-surface px-1"
                value={tableSize.cols}
                onChange={(e) => setTableSize({ ...tableSize, cols: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Colonnes"
              />
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-brand hover:bg-brand-muted"
                onClick={(e) => {
                  e.currentTarget.closest<HTMLElement>("[data-menu]")?.click();
                  insertHtml(tableHtml(tableSize.rows, tableSize.cols));
                }}
              >
                Tableau
              </button>
            </div>
            <MenuItem
              onClick={() => {
                const url = window.prompt("Adresse (URL) de l’image");
                if (url) insertHtml(`<img src="${escapeAttr(url)}" alt="" style="max-width: 100%;">`);
              }}
            >
              Image…
            </MenuItem>
            <MenuItem onClick={() => insertHtml('<hr style="border: 0; border-top: 1px solid #000;">')}>Ligne horizontale</MenuItem>
            <MenuItem onClick={() => insertHtml('<div style="break-after: page; page-break-after: always;"></div>')}>Saut de page</MenuItem>
          </Menu>
          <Menu label="Tableau" disabled={locked || !sel?.inTable}>
            <MenuItem onClick={() => cellOp((c) => insertRow(c, false))}>Ligne au-dessus</MenuItem>
            <MenuItem onClick={() => cellOp((c) => insertRow(c, true))}>Ligne en dessous</MenuItem>
            <MenuItem onClick={() => cellOp((c) => insertColumn(c, false))}>Colonne à gauche</MenuItem>
            <MenuItem onClick={() => cellOp((c) => insertColumn(c, true))}>Colonne à droite</MenuItem>
            <MenuItem disabled={!sel?.canMerge} onClick={() => cellOp(mergeRight)}>Fusionner avec la cellule de droite</MenuItem>
            <MenuItem disabled={!sel?.canSplit} onClick={() => cellOp(splitCell)}>Scinder la cellule</MenuItem>
            <MenuItem onClick={() => cellOp(deleteRow)}>Supprimer la ligne</MenuItem>
            <MenuItem onClick={() => cellOp(deleteColumn)}>Supprimer la colonne</MenuItem>
            <MenuItem onClick={() => cellOp((c) => c.closest("table")?.remove())}>Supprimer le tableau</MenuItem>
          </Menu>
          <Menu label="Élément" disabled={locked || !sel}>
            <MenuItem onClick={() => edit((_d, _w, el) => void (el && select(duplicateElement(el))))}>Dupliquer</MenuItem>
            <MenuItem onClick={() => edit((_d, _w, el) => void (el && moveElement(el, true)))}>Monter</MenuItem>
            <MenuItem onClick={() => edit((_d, _w, el) => void (el && moveElement(el, false)))}>Descendre</MenuItem>
            <MenuItem
              onClick={() =>
                edit((_d, _w, el) => {
                  if (!el) return;
                  removeElement(el);
                  selRef.current = null;
                  selPathRef.current = null;
                })
              }
            >
              Supprimer
            </MenuItem>
          </Menu>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-h-[34rem] flex-col gap-1">
          <div ref={wrapRef} className={`relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-slate-100 dark:bg-slate-900 ${mode === "design" ? "" : "hidden"}`}>
            <iframe
              ref={frameRef}
              title={`Édition · ${meta.label}`}
              className="absolute left-1/2 top-0 origin-top bg-white"
              style={{ width: pageWidth, height: box.height / scale, transform: `translateX(-50%) scale(${scale})` }}
            />
          </div>
          {mode === "preview" && previewHtml ? <DocFrame html={previewHtml} pageWidth={pageWidth} title={`Aperçu · ${meta.label}`} /> : null}
          {mode === "source" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <textarea
                className="min-h-[30rem] flex-1 rounded-2xl border border-border/70 bg-surface p-3 font-mono text-[11px] leading-snug outline-none focus:border-brand"
                spellCheck={false}
                value={source}
                readOnly={!canEdit}
                onChange={(e) => setSource(e.target.value)}
              />
              {canEdit ? (
                <Button
                  className="h-8 self-end px-3 text-xs"
                  disabled={source === html}
                  onClick={() => {
                    commit(source);
                    setMode("design");
                    rebuild();
                  }}
                >
                  Appliquer le code
                </Button>
              ) : null}
            </div>
          ) : null}
          {mode === "design" && sel ? (
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-foreground/55">
              {sel.crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                  {i ? "›" : null}
                  <button
                    type="button"
                    className={`rounded px-1 hover:bg-surface-muted ${c.up === 0 ? "font-semibold text-brand" : ""}`}
                    onClick={() => {
                      let el = selRef.current;
                      for (let n = 0; n < c.up && el; n += 1) el = el.parentElement;
                      select(el);
                    }}
                  >
                    {c.label}
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="flex min-h-0 flex-col gap-2 rounded-2xl border border-border/70 bg-surface p-2 lg:overflow-hidden">
          <Segmented
            value={tab}
            onChange={setTab}
            items={[
              ["style", "Style"],
              ["fields", "Champs"],
              ["advanced", "Avancé"],
              ["versions", "Versions"],
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {tab === "style" ? (
              <StylePanel
                sel={sel}
                disabled={locked}
                onStyle={setStyle}
                onClear={() =>
                  edit((_d, _w, el) => {
                    el?.removeAttribute("style");
                  })
                }
              />
            ) : tab === "fields" ? (
              <FieldsPanel meta={meta} disabled={locked} onInsert={insertField} />
            ) : tab === "advanced" ? (
              <AdvancedPanel
                sel={sel}
                meta={meta}
                disabled={locked}
                css={css}
                onApply={applyAdvanced}
                onCss={(next) => replace(withTemplateCss(htmlRef.current, next))}
              />
            ) : (
              <VersionsPanel history={tpl?.history ?? []} draft={tpl?.draft ?? null} disabled={!canEdit || pending} onRestore={restore} onDiscard={discard} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg border border-border/70 bg-surface-muted/60 p-0.5">
      {items.map(([id, text]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${value === id ? "bg-surface text-brand shadow-sm" : "text-foreground/60 hover:text-foreground"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Tool({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm text-foreground/80 hover:bg-surface-muted disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function ColorTool({ label, disabled, onPick, glyph }: { label: string; disabled?: boolean; onPick: (c: string) => void; glyph: string }) {
  return (
    <label title={label} className={`relative inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-sm hover:bg-surface-muted ${disabled ? "pointer-events-none opacity-35" : ""}`}>
      {glyph}
      <input
        type="color"
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
        disabled={disabled}
        onChange={(e) => onPick(e.target.value)}
      />
    </label>
  );
}

function Menu({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/80 hover:bg-surface-muted disabled:opacity-35"
      >
        {label} ▾
      </button>
      {open && !disabled ? (
        <div data-menu className="absolute left-0 top-full z-50 min-w-52 rounded-lg border border-border/70 bg-surface p-1 shadow-xl" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="block w-full rounded-md px-2 py-1 text-left text-xs hover:bg-surface-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}

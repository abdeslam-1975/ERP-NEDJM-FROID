"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const EDITOR_WIDTH = 256;
const MAX_SCALE = 1.4;
const GUTTER = 12;
const EDITABLE_CSS =
  "[data-sim-var]{cursor:pointer}[data-sim-var]:hover{outline:2px solid #1E4DB7;outline-offset:-2px}";

type Pick = { id: string; x: number; y: number };

/**
 * Document HTML written into an iframe, scaled to the column width, keeping its scroll on refresh.
 * Elements carrying `data-sim-var` open `renderEditor` over the document when clicked.
 */
export function DocFrame({
  html,
  pageWidth,
  title,
  editable,
  renderEditor,
  bare = false,
}: {
  html: string;
  pageWidth: number;
  title: string;
  editable?: (id: string) => boolean;
  renderEditor?: (id: string, close: () => void) => ReactNode;
  /** Drawn inside a card: no own border or rounded corners. */
  bare?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: pageWidth, height: 900 });
  const [pick, setPick] = useState<Pick | null>(null);
  const scale = Math.min(MAX_SCALE, Math.max(0.35, (box.width - 2 * GUTTER) / pageWidth));
  const latest = useRef({ editable, scale });
  useEffect(() => {
    latest.current = { editable, scale };
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const canEdit = Boolean(editable && renderEditor);
  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    const win = frame.contentWindow;
    const scroll = win?.scrollY ?? 0;
    doc.open();
    doc.write(html);
    doc.close();
    win?.scrollTo(0, scroll);
    if (!canEdit) return;

    const style = doc.createElement("style");
    style.textContent = EDITABLE_CSS;
    doc.head?.appendChild(style);
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element | null)?.closest?.("[data-sim-var]");
      const id = target?.getAttribute("data-sim-var");
      const wrap = wrapRef.current;
      if (!target || !id || !wrap || !latest.current.editable?.(id)) {
        setPick(null);
        return;
      }
      const r = target.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      const s = latest.current.scale;
      setPick({ id, x: f.left - w.left + r.left * s, y: f.top - w.top + r.bottom * s });
    };
    const onScroll = () => setPick(null);
    doc.addEventListener("click", onClick);
    win?.addEventListener("scroll", onScroll);
    return () => {
      doc.removeEventListener("click", onClick);
      win?.removeEventListener("scroll", onScroll);
    };
  }, [html, canEdit]);

  useEffect(() => {
    if (!pick) return;
    const onDown = (e: MouseEvent) => {
      if (!editorRef.current?.contains(e.target as Node)) setPick(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPick(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pick]);

  return (
    <div
      ref={wrapRef}
      className={`relative min-h-[32rem] flex-1 overflow-hidden bg-surface-muted ${bare ? "" : "rounded-2xl border border-border/70"}`}
    >
      <iframe
        ref={frameRef}
        title={title}
        className="absolute left-1/2 origin-top rounded-md bg-white shadow-[0_1px_3px_rgba(15,23,42,0.12),0_8px_24px_-12px_rgba(15,23,42,0.25)]"
        style={{
          top: GUTTER,
          width: pageWidth,
          height: (box.height - GUTTER) / scale,
          transform: `translateX(-50%) scale(${scale})`,
        }}
      />
      {pick && renderEditor ? (
        <div
          ref={editorRef}
          className="absolute z-20 rounded-xl border border-border/70 bg-surface p-2.5 shadow-xl"
          style={{
            width: EDITOR_WIDTH,
            left: Math.max(4, Math.min(pick.x, box.width - EDITOR_WIDTH - 4)),
            top: Math.max(4, Math.min(pick.y + 4, box.height - 150)),
          }}
        >
          {renderEditor(pick.id, () => setPick(null))}
        </div>
      ) : null}
    </div>
  );
}

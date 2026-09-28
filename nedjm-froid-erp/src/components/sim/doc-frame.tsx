"use client";

import { useEffect, useRef, useState } from "react";

/** Document HTML written into an iframe, scaled to the column width, keeping its scroll on refresh. */
export function DocFrame({ html, pageWidth, title }: { html: string; pageWidth: number; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [box, setBox] = useState({ width: pageWidth, height: 900 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    const scroll = frame.contentWindow?.scrollY ?? 0;
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow?.scrollTo(0, scroll);
  }, [html]);

  const scale = Math.min(1, Math.max(0.35, (box.width - 8) / pageWidth));
  return (
    <div
      ref={wrapRef}
      className="relative min-h-[32rem] flex-1 overflow-hidden rounded-2xl border border-border/70 bg-slate-100 dark:bg-slate-900"
    >
      <iframe
        ref={frameRef}
        title={title}
        className="absolute left-1/2 top-0 origin-top bg-white"
        style={{
          width: pageWidth,
          height: box.height / scale,
          transform: `translateX(-50%) scale(${scale})`,
        }}
      />
    </div>
  );
}

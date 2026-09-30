"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markNotificationsRead, type NotificationRow } from "@/lib/actions/decisions";

function dateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" });
}

export function NotificationBell({ initial }: { initial: NotificationRow[] }) {
  const [rows, setRows] = useState(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setRows(initial);
  }
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = rows.filter((r) => !r.read).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const ids = rows.filter((r) => !r.read).map((r) => r.id);
      setRows((prev) => prev.map((r) => ({ ...r, read: true })));
      void markNotificationsRead(ids);
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications (${unread} non lues)` : "Notifications"}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-foreground/70 shadow-[var(--card-shadow)] transition hover:text-brand"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9Zm4.3 13a2 2 0 0 0 3.4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <Link href="/decisions" className="text-xs font-semibold text-brand hover:underline" onClick={() => setOpen(false)}>
              Centre de décisions
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-foreground/55">Aucune notification.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {rows.map((n) => (
                <li key={n.id} className="border-b border-border/50 last:border-0">
                  <Link
                    href={n.link ?? "/decisions"}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 hover:bg-surface-muted/60"
                  >
                    <span className="block text-sm font-semibold text-foreground">{n.title}</span>
                    {n.body ? <span className="mt-0.5 block text-xs text-foreground/65">{n.body}</span> : null}
                    <span className="mt-0.5 block text-[11px] text-foreground/45">{dateTime(n.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useId, type ReactNode } from "react";
import { Dialog as DialogPrimitive, Tabs as TabsPrimitive } from "radix-ui";
import { motion } from "motion/react";
import { useUiTabs } from "@/components/layout/ui-layout-context";
import { cn } from "@/lib/utils";

/**
 * Large form window. Non-modal Radix dialog with its own backdrop: the older custom overlays opened from inside
 * a form stay clickable, and neither a click outside nor Escape closes the window (no unsaved input is lost).
 */
export function RhModal({
  title,
  subtitle,
  tabs,
  children,
  footer,
  onClose,
  wide = false,
  size,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** xl = fiche employé / large forms */
  size?: "md" | "lg" | "xl";
}) {
  const maxW =
    size === "xl" || (wide && !size)
      ? "sm:max-w-[min(100rem,98vw)]"
      : size === "lg" || wide
        ? "sm:max-w-5xl"
        : "sm:max-w-3xl";

  return (
    <DialogPrimitive.Root open modal={false} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/50 p-0 backdrop-blur-md animate-in fade-in-0 duration-200 sm:p-2 lg:p-3">
          <DialogPrimitive.Content
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            aria-describedby={undefined}
            className={cn(
              "flex h-[100dvh] w-full flex-col overflow-hidden border border-white/40 bg-surface shadow-[0_24px_80px_-20px_rgba(15,23,42,0.45)] ring-1 ring-black/5 outline-none animate-in fade-in-0 zoom-in-[0.98] duration-200 sm:h-[calc(100dvh-1rem)] sm:rounded-[calc(var(--radius-2xl)+0.15rem)] lg:h-[calc(100dvh-1.5rem)]",
              maxW,
            )}
          >
            <div className="h-1 w-full shrink-0 bg-gradient-to-r from-brand via-[#5b8aff] to-brand/40" />
            <div className="shrink-0 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface)_92%,white)_0%,var(--surface-muted)_100%)] px-4 pt-3 pb-2.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
                    {title}
                  </DialogPrimitive.Title>
                  {subtitle ? <div className="mt-1 text-sm text-foreground/55">{subtitle}</div> : null}
                </div>
                <DialogPrimitive.Close
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-surface/80 text-foreground/60 shadow-sm transition hover:bg-surface-muted hover:text-foreground"
                  aria-label="Fermer"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </DialogPrimitive.Close>
              </div>
              {tabs ? <div className="mt-3.5">{tabs}</div> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(1200px_400px_at_50%_-10%,color-mix(in_oklab,var(--color-brand-muted)_70%,transparent),transparent)] px-2 py-2 sm:px-4 sm:py-2.5">
              {children}
            </div>
            {footer ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/50 bg-surface/90 px-3 py-2 backdrop-blur-md sm:px-4">
                {footer}
              </div>
            ) : null}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Tab bar (Radix Tabs: arrow keys move between tabs) with a sliding active marker. */
export function RhTabs({
  items,
  value,
  onChange,
  uiKey,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  /** Tabset of the interface catalogue (src/lib/ui/registry.ts): hidden / ordered / renamed per role. */
  uiKey?: string;
}) {
  const shown = useUiTabs(uiKey, items, value, onChange);
  const markerId = useId();
  return (
    <TabsPrimitive.Root value={value} onValueChange={onChange} activationMode="manual">
      <TabsPrimitive.List className="flex flex-wrap gap-1 rounded-2xl border border-border/60 bg-surface-muted/60 p-1">
        {shown.map((item) => {
          const active = item.id === value;
          return (
            <TabsPrimitive.Trigger
              key={item.id}
              value={item.id}
              className={cn(
                "relative rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                active ? "text-white" : "text-foreground/65 hover:bg-surface hover:text-foreground",
              )}
            >
              {active ? (
                <motion.span
                  layoutId={markerId}
                  className="absolute inset-0 rounded-xl bg-brand shadow-sm shadow-brand/25"
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              ) : null}
              <span className="relative">{item.label}</span>
            </TabsPrimitive.Trigger>
          );
        })}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

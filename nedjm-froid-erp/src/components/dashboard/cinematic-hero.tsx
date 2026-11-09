"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, MapPin, Shield } from "lucide-react";
import { useAnimationsEnabled } from "@/components/layout/app-providers";
import type { DashboardScene } from "@/lib/dashboard/showcase";
import { cn } from "@/lib/utils";

const KPI_ICONS = [Shield, Building2, MapPin, BadgeCheck] as const;
const KPI_TINTS = ["bg-sky-500", "bg-brand", "bg-indigo-500", "bg-emerald-500"] as const;

export type DashboardKpi = { labelAr: string; label: string; value: string; hintAr?: string; hint: string };

export function CinematicHero({
  scenes,
  canEdit,
  kpis,
}: {
  scenes: DashboardScene[];
  canEdit: boolean;
  kpis: DashboardKpi[];
}) {
  const animations = useAnimationsEnabled();
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scene = scenes[index] ?? scenes[0];
  const playing = animations && !reduceMotion && scenes.length > 1;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!playing || !scene) return;
    let timer = 0;
    const wait = () => {
      if (document.hidden) {
        timer = window.setTimeout(wait, 1000);
        return;
      }
      timer = window.setTimeout(() => setIndex((current) => (current + 1) % scenes.length), scene.durationSeconds * 1000);
    };
    wait();
    return () => window.clearTimeout(timer);
  }, [playing, scene, scenes.length]);

  if (!scene) return null;

  const go = (step: number) => setIndex((current) => (current + step + scenes.length) % scenes.length);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <section className="relative isolate h-44 shrink-0 overflow-hidden rounded-[1.75rem] text-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.55)] sm:h-52">
        {scenes.map((item, itemIndex) => (
          <motion.img
            key={item.id}
            src={item.imageUrl}
            alt=""
            aria-hidden
            initial={false}
            animate={{ opacity: itemIndex === index ? 1 : 0 }}
            transition={{ duration: playing ? 0.8 : 0, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-[center_40%]",
              playing && itemIndex === index && "ui-hero-drift",
            )}
            fetchPriority={itemIndex === 0 ? "high" : "low"}
          />
        ))}
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,16,40,0.78),transparent_58%)]" />

        <div className="absolute bottom-4 left-4 z-10 max-w-[min(28rem,62%)] text-left">
          <p className="text-lg leading-tight font-semibold sm:text-xl">{scene.titleAr}</p>
          <p className="mt-0.5 text-sm leading-snug text-white/85">{scene.titleFr}</p>
        </div>

        {scenes.length > 1 ? (
          <div className="absolute right-4 bottom-4 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25"
              aria-label="المشهد السابق"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-2 backdrop-blur-md">
              {scenes.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.titleAr}
                  aria-current={itemIndex === index ? "true" : undefined}
                  onClick={() => setIndex(itemIndex)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    itemIndex === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25"
              aria-label="المشهد التالي"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
        {playing ? (
          <span
            key={scene.id}
            aria-hidden
            className="ui-hero-progress absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/80"
            style={{ animationDuration: `${scene.durationSeconds}s` }}
          />
        ) : null}
        {canEdit ? (
          <Link
            href="/parametres/accueil"
            className="absolute top-4 right-4 z-20 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-md hover:bg-white/25"
          >
            الصور
          </Link>
        ) : null}
      </section>

      <ul className="grid shrink-0 auto-cols-fr grid-flow-col gap-3">
        {scenes.map((item, itemIndex) => {
          const active = itemIndex === index;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`${item.titleAr} ${item.titleFr}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "group relative block h-[5.25rem] w-full overflow-hidden rounded-2xl text-center shadow-[var(--card-shadow)] ring-1 transition duration-300",
                  active ? "ring-2 ring-brand" : "ring-border/70 hover:ring-brand/40",
                )}
              >
                <img
                  src={item.imageUrl}
                  alt=""
                  className={cn("h-full w-full object-cover transition duration-500", active ? "scale-105" : "group-hover:scale-105")}
                />
                <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,16,40,0.78),rgba(6,16,40,0.05)_70%)]" />
                <span className="absolute right-8 bottom-1.5 left-2 truncate text-left text-[0.72rem] font-semibold text-white">
                  {item.titleAr}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid shrink-0 grid-cols-4 gap-3">
        {kpis.map((item, itemIndex) => {
          const Icon = KPI_ICONS[itemIndex] ?? Shield;
          const tint = KPI_TINTS[itemIndex] ?? "bg-brand";
          return (
            <article
              key={item.label}
              className="flex min-w-0 flex-col items-center justify-center rounded-2xl border border-border/70 bg-surface px-3 py-3 text-center shadow-[var(--card-shadow)]"
            >
              <motion.span
                className={cn("flex size-11 items-center justify-center rounded-2xl text-white shadow-[0_10px_18px_-12px_rgba(15,23,42,0.8)]", tint)}
                animate={playing ? { y: [0, -4, 0] } : { y: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: itemIndex * 0.15 }}
              >
                <Icon className="size-5" strokeWidth={1.8} aria-hidden />
              </motion.span>
              <p dir="rtl" className="mt-2 w-full truncate text-xs font-medium text-foreground/70">
                {item.labelAr}
              </p>
              <p className="mt-0.5 w-full truncate font-display text-sm font-semibold leading-tight text-foreground">{item.value}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

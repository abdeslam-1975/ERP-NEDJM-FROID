"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, DraftingCompass, Fan, HardHat, MapPin, Shield, Snowflake } from "lucide-react";
import { useAnimationsEnabled } from "@/components/layout/app-providers";
import type { DashboardScene } from "@/lib/dashboard/showcase";
import { cn } from "@/lib/utils";

const ACTIVITIES = [
  { icon: Snowflake, ar: "التبريد", fr: "Réfrigération" },
  { icon: Fan, ar: "التكييف", fr: "Climatisation" },
  { icon: DraftingCompass, ar: "الهندسة", fr: "Ingénierie" },
  { icon: HardHat, ar: "الإنجاز", fr: "Réalisation" },
] as const;

const KPI_ICONS = [Shield, Building2, MapPin, BadgeCheck] as const;

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
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-foreground">
          <span dir="rtl" className="block leading-tight">
            لوحة القيادة
          </span>
          <span className="block text-xs font-normal text-foreground/50">Tableau de bord</span>
        </h2>
        <p className="font-mono text-xs tracking-[0.18em] text-foreground/40">
          {String(index + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}
        </p>
      </div>

      <section className="relative isolate h-[22rem] overflow-hidden rounded-[1.75rem] text-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.55)] sm:h-[26rem]">
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
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(105deg,rgba(6,16,40,0.88)_0%,rgba(10,32,84,0.5)_38%,rgba(8,20,48,0.08)_68%)]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,16,40,0.55),transparent_42%)]" />

        <div className="relative flex h-full flex-col justify-end p-5 sm:p-8">
          <div className="max-w-xl rounded-3xl border border-white/15 bg-white/10 p-5 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.7)] backdrop-blur-md sm:p-6">
            <p className="text-xs font-medium tracking-[0.16em] text-white/70 uppercase">Nedjm Froid</p>
            <p dir="rtl" className="mt-1 w-fit text-sm text-white/80">
              نجم فرويد
            </p>
            <p dir="rtl" className="mt-3 text-lg leading-snug font-semibold sm:text-xl">
              {scene.titleAr}
            </p>
            <p className="mt-1 max-w-md text-sm leading-snug text-white/85">{scene.titleFr}</p>
            <p dir="rtl" className="mt-3 line-clamp-2 text-sm leading-relaxed text-white/75">
              {scene.captionAr}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {ACTIVITIES.map((activity) => (
                <li
                  key={activity.fr}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1"
                >
                  <activity.icon className="size-3.5 shrink-0 text-white" aria-hidden />
                  <span className="leading-none">
                    <span dir="rtl" className="block text-[0.7rem] font-medium">
                      {activity.ar}
                    </span>
                    <span className="block text-[0.65rem] text-white/70">{activity.fr}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {scenes.length > 1 ? (
          <div className="absolute right-4 bottom-4 z-20 flex items-center gap-2 sm:right-6 sm:bottom-6">
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
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((item, itemIndex) => {
          const Icon = KPI_ICONS[itemIndex] ?? Shield;
          return (
            <article
              key={item.label}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface px-3.5 py-3.5 shadow-[var(--card-shadow)]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p dir="rtl" className="truncate text-xs font-medium text-foreground">
                  {item.labelAr}
                </p>
                <p className="truncate text-[0.7rem] text-foreground/45">{item.label}</p>
                <p className="truncate font-display text-base font-semibold leading-tight text-foreground">{item.value}</p>
              </div>
            </article>
          );
        })}
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-foreground">
            <span className="flex items-center gap-2.5">
              <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
              <span dir="rtl">إنجازاتنا</span>
            </span>
            <span className="mt-0.5 block ps-3.5 text-sm font-normal text-foreground/50">Nos réalisations</span>
          </h3>
          {canEdit ? (
            <Link href="/parametres/accueil" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
              <span className="text-right">
                <span dir="rtl" className="block leading-tight">
                  عرض كل الإنجازات
                </span>
                <span className="block text-xs font-normal">Voir toutes les réalisations</span>
              </span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
                    "group relative block w-full overflow-hidden rounded-2xl text-left shadow-[var(--card-shadow)] ring-1 transition duration-300",
                    active ? "ring-2 ring-brand" : "ring-border/70 hover:-translate-y-0.5 hover:ring-brand/40",
                  )}
                >
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                  />
                  <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,16,40,0.82),rgba(6,16,40,0.05)_58%)]" />
                  <span className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                    <span dir="rtl" className="block truncate text-sm font-semibold">
                      {item.titleAr}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-white/75">{item.titleFr}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

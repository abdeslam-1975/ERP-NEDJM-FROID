"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { MotionConfig, motion } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DisplayMode } from "@/lib/ui/design";

/** Applies the user's saved display mode, or the application default on a device that never chose one. */
function ThemeSync({ userMode, defaultMode }: { userMode: DisplayMode | null; defaultMode: DisplayMode }) {
  const { setTheme } = useTheme();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (userMode) {
      setTheme(userMode);
      return;
    }
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("theme");
    } catch {
      stored = null;
    }
    if (!stored) setTheme(defaultMode);
  }, [userMode, defaultMode, setTheme]);
  return null;
}

export function AppProviders({
  animations,
  userMode,
  defaultMode,
  children,
}: {
  animations: boolean;
  userMode: DisplayMode | null;
  defaultMode: DisplayMode;
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion={animations ? "user" : "always"}>
      <TooltipProvider delayDuration={300}>
        <ThemeSync userMode={userMode} defaultMode={defaultMode} />
        {children}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}

/* Opacity only: a transform here would become the containing block of every fixed overlay of the page. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div key={pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

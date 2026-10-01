import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-foreground/70",
        brand: "bg-brand-muted text-brand",
        success: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
        warning: "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
        danger: "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-100",
        outline: "border border-border text-foreground/75",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

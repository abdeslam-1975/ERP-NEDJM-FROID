import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const alertVariants = cva(
  "relative flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        danger: "border-red-200/80 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
        success:
          "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100",
        warning:
          "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100",
        info: "border-sky-200/80 bg-sky-50 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

const ICONS = { danger: CircleAlert, success: CircleCheck, warning: TriangleAlert, info: Info } as const;

export function Alert({
  className,
  tone,
  icon = true,
  children,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants> & { icon?: boolean }) {
  const Icon = ICONS[tone ?? "info"];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)} {...props}>
      {icon ? <Icon aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

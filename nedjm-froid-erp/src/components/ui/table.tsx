import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/* Borders, stripes and header colour follow the table style chosen in Paramètres › Interface (globals.css). */

export function Table({ className, wrapperClassName, ...props }: ComponentProps<"table"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative w-full overflow-x-auto", wrapperClassName)}>
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, sticky, ...props }: ComponentProps<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      className={cn(sticky && "sticky top-0 z-10 [&>tr]:bg-[var(--surface-muted)] [&>tr]:shadow-[0_1px_0_var(--border)]", className)}
      {...props}
    />
  );
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return <tfoot className={cn("bg-surface-muted/60 font-semibold", className)} {...props} />;
}

export function TableRow(props: ComponentProps<"tr">) {
  return <tr {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 px-3.5 text-left align-middle text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/50 uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3.5 py-3 align-middle text-sm text-foreground/85", className)} {...props} />;
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption className={cn("mt-3 text-sm text-foreground/55", className)} {...props} />;
}

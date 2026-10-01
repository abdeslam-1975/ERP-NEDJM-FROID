import { cloneElement, isValidElement, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* Shape and primary colours come from the look chosen in Paramètres › Interface (--btn-* variables). */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--btn-radius)] border text-sm font-semibold transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--btn-border)] text-[var(--btn-fg)] shadow-[var(--btn-shadow)] [background:var(--btn-bg)] hover:[background:var(--btn-hover-bg)]",
        secondary: "border-border/80 bg-surface text-foreground shadow-sm hover:bg-brand-muted/70",
        outline: "border-brand/60 bg-transparent text-brand hover:bg-brand-muted",
        ghost: "border-transparent text-foreground/80 hover:bg-brand-muted hover:text-foreground",
        danger: "border-transparent bg-alert-critical text-white shadow-sm hover:opacity-90 focus-visible:ring-alert-critical/60",
        link: "h-auto border-transparent px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-6 text-base",
        icon: "size-10 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child (for example a Link) with the button look. */
    asChild?: boolean;
  };

export function Button({ variant, size, asChild = false, className, type, children, ...props }: ButtonProps) {
  if (asChild && isValidElement<{ className?: string }>(children)) {
    return cloneElement(children, {
      ...props,
      className: cn(buttonVariants({ variant, size }), children.props.className, className),
    });
  }
  return (
    <button type={type ?? "button"} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
}

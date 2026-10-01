import { cloneElement, isValidElement, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ui-btn / ui-btn-primary (globals.css): original look unless a look is chosen in Paramètres › Interface. */
export const buttonVariants = cva(
  "ui-btn inline-flex items-center justify-center text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&_.lucide:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "ui-btn-primary focus-visible:ring-brand",
        secondary: "border border-border/80 bg-surface text-foreground shadow-sm hover:bg-brand-muted/70",
        outline: "border border-brand/60 bg-transparent text-brand hover:bg-brand-muted",
        ghost: "text-foreground/80 hover:bg-brand-muted hover:text-foreground",
        danger: "bg-alert-critical text-white hover:opacity-90 focus-visible:ring-alert-critical",
        link: "h-auto px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 gap-2 px-6 text-base",
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

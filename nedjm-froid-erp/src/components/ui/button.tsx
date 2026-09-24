import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-sm shadow-brand/20 hover:bg-brand-hover focus-visible:ring-brand",
  secondary:
    "border border-border/80 bg-surface text-foreground shadow-sm hover:bg-brand-muted/70",
  ghost: "text-foreground/80 hover:bg-brand-muted hover:text-foreground",
  danger:
    "bg-alert-critical text-white hover:opacity-90 focus-visible:ring-alert-critical",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

const variants = {
  primary: "border-cyan-300/40 bg-cyan-400 text-slate-950 hover:bg-cyan-300",
  secondary: "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15",
  ghost: "border-transparent bg-transparent text-slate-300 hover:bg-white/10 hover:text-white",
  danger: "border-rose-300/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl shadow-[var(--shadow)]", className)}
      {...props}
    >
      {children}
    </div>
  );
}

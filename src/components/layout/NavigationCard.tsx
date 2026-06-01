import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

type NavigationCardProps = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  eyebrow?: string;
  actionLabel?: string;
};

export function NavigationCard({ href, title, description, icon, eyebrow, actionLabel = "열기" }: NavigationCardProps) {
  return (
    <Link href={href} className="group block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-muted)]">
      <Card className="flex h-full flex-col overflow-hidden p-5 transition duration-200 group-hover:-translate-y-1 group-hover:border-[var(--border-strong)] group-hover:bg-[color-mix(in_srgb,var(--card)_82%,var(--surface-muted))] group-hover:shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground)] transition group-hover:border-[var(--border-strong)] group-hover:bg-[var(--card)]">
            {icon}
          </div>
          {eyebrow ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--foreground-subtle)]">
              {eyebrow}
            </span>
          ) : null}
        </div>
        <h2 className="text-lg font-black tracking-tight text-[var(--foreground)]">{title}</h2>
        <p className="mt-2 min-h-[3rem] text-sm leading-6 text-[var(--foreground-muted)]">{description}</p>
        <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4 text-sm font-bold text-[var(--foreground)]">
          <span>{actionLabel}</span>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] transition group-hover:translate-x-0.5 group-hover:border-[var(--border-strong)] group-hover:bg-[var(--foreground)] group-hover:text-[var(--background)]">
            →
          </span>
        </div>
      </Card>
    </Link>
  );
}

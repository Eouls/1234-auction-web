import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

type NavigationCardProps = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
};

export function NavigationCard({ href, title, description, icon }: NavigationCardProps) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full p-6 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-xl text-[var(--accent-muted)]">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{description}</p>
      </Card>
    </Link>
  );
}

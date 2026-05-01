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
      <Card className="h-full p-6 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-slate-900">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-md border border-cyan-300/25 bg-cyan-400/10 text-xl text-cyan-200">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400 group-hover:text-slate-300">{description}</p>
      </Card>
    </Link>
  );
}

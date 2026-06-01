"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/home", label: "홈", paths: ["/home"] },
  { href: "/auctions/create", label: "경매 생성", paths: ["/auctions/create"] },
  { href: "/auctions/join", label: "경매 참가", paths: ["/auctions/join"] },
  { href: "/my-auctions", label: "나의 경매", paths: ["/my-auctions"] },
  { href: "/profile", label: "프로필", paths: ["/profile", "/profile/edit"] },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 text-sm text-[var(--foreground-muted)]">
      {navItems.map((item) => {
        const isActive = item.paths.some((path) => pathname === path);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-2 transition",
              isActive
                ? "border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)] shadow-sm shadow-[var(--shadow)]"
                : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

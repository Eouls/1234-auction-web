import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const navItems = [
  { href: "/home", label: "홈" },
  { href: "/auctions/create", label: "경매 생성" },
  { href: "/auctions/join", label: "경매 참가" },
  { href: "/my-auctions", label: "나의 경매" },
  { href: "/profile", label: "프로필" },
];

type AppShellProps = {
  children: ReactNode;
  allowIncompleteOnboarding?: boolean;
  activeHref?: string;
  contentClassName?: string;
};

export async function AppShell({
  children,
  activeHref,
  allowIncompleteOnboarding = false,
  contentClassName,
}: AppShellProps) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/auth/login");
  }

  if (!allowIncompleteOnboarding) {
    const existingUser = await prisma.user.findUnique({
      where: {
        authUserId: authUser.id,
      },
      select: {
        id: true,
      },
    });

    if (!existingUser) {
      redirect("/onboarding");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-muted)] text-[var(--foreground)]">
      <div className="fixed inset-0 -z-10 bg-[var(--page-muted)]" />
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <Link href="/home" className="text-lg font-black tracking-tight text-[var(--foreground)]">
            1234 <span className="text-[var(--accent-muted)]">Auction</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-2 text-sm text-[var(--foreground-muted)]">
              {navItems.map((item) => {
                const isActive = activeHref === item.href;

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
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main
        className={
          contentClassName
            ? cn("mx-auto w-full py-8", contentClassName)
            : "mx-auto w-full max-w-7xl px-4 py-8 md:px-6"
        }
      >
        {children}
      </main>
    </div>
  );
}

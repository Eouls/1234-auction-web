import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppNavigation } from "@/components/layout/AppNavigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type AppShellProps = {
  children: ReactNode;
  allowIncompleteOnboarding?: boolean;
  contentClassName?: string;
};

export async function AppShell({
  children,
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
            <AppNavigation />
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

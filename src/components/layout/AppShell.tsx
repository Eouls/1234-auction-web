import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
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
};

export async function AppShell({ children, allowIncompleteOnboarding = false }: AppShellProps) {
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_46%,#030712_100%)]" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <Link href="/home" className="text-lg font-black tracking-tight text-white">
            1234 <span className="text-cyan-300">Auction</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-2 text-sm text-slate-300">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}

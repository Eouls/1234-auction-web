import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/home", label: "홈" },
  { href: "/auctions/create", label: "경매 생성" },
  { href: "/auctions/join", label: "경매 참가" },
  { href: "/my-auctions", label: "나의 경매" },
  { href: "/profile", label: "프로필" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_46%,#030712_100%)]" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <Link href="/home" className="text-lg font-black tracking-tight text-white">
            1234 <span className="text-cyan-300">Auction</span>
          </Link>
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}

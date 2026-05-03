import Link from "next/link";
import { DiscordLoginButton } from "@/components/auth/DiscordLoginButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Card } from "@/components/ui";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-[var(--foreground)]">
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md p-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-[var(--accent-muted)]">1234 Discord Server</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-[var(--foreground)]">1234 Auction</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
            1234 디스코드 서버를 위한 리그오브레전드 내전 팀 경매 플랫폼
          </p>
        </div>
        <DiscordLoginButton />
        <p className="mt-4 text-center text-xs text-[var(--foreground-subtle)]">Discord OAuth를 통해 1234 Auction에 접속합니다.</p>
        <Link href="/" className="mt-6 block text-center text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
          처음 화면으로 이동
        </Link>
      </Card>
    </main>
  );
}

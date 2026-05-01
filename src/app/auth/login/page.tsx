import Link from "next/link";
import { DiscordLoginButton } from "@/components/auth/DiscordLoginButton";
import { Card } from "@/components/ui";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#020617,#111827_50%,#020617)]" />
      <Card className="w-full max-w-md p-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-cyan-300">1234 Discord Server</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white">1234 Auction</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            1234 디스코드 서버를 위한 리그오브레전드 내전 팀 경매 플랫폼
          </p>
        </div>
        <DiscordLoginButton />
        <p className="mt-4 text-center text-xs text-slate-500">Discord OAuth를 통해 1234 Auction에 접속합니다.</p>
        <Link href="/" className="mt-6 block text-center text-sm font-semibold text-cyan-300 hover:text-cyan-200">
          처음 화면으로 이동
        </Link>
      </Card>
    </main>
  );
}

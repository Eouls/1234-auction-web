import Link from "next/link";
import { Button, Card } from "@/components/ui";

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
        <Button className="w-full" size="lg" type="button">
          Discord로 로그인
        </Button>
        <p className="mt-4 text-center text-xs text-slate-500">OAuth 연동 전 UI 미리보기 화면입니다.</p>
        <Link href="/home" className="mt-6 block text-center text-sm font-semibold text-cyan-300 hover:text-cyan-200">
          임시로 홈으로 이동
        </Link>
      </Card>
    </main>
  );
}

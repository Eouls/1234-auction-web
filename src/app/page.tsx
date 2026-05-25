import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "1234 Auction",
  description: "디스코드 멤버들과 함께하는 실시간 LoL 내전 팀 경매 서비스",
};

const features = [
  {
    title: "실시간 팀 경매",
    description: "팀장이 포인트로 참가자를 입찰하고, 모든 화면에 입찰 상황이 즉시 반영됩니다.",
  },
  {
    title: "롤 계정 정보 확인",
    description: "현재 티어, 최고 티어, 모스트 챔피언을 경매 중 빠르게 참고할 수 있습니다.",
  },
  {
    title: "전체 채팅 / 팀 채팅",
    description: "공개 채팅과 팀 전용 채팅을 분리해 경매 진행 중 소통 흐름을 정리합니다.",
  },
  {
    title: "입찰 로그와 포인트 관리",
    description: "최신 입찰, 팀별 남은 포인트, 입찰 추가시간을 한 화면에서 확인합니다.",
  },
  {
    title: "경매 결과 정리",
    description: "경매가 끝나면 팀별 구성과 유찰 참가자를 compact한 결과판으로 확인합니다.",
  },
  {
    title: "낙찰가 통계",
    description: "유저별 평균 낙찰가와 최근 낙찰가를 저장해 다음 경매 판단에 활용합니다.",
  },
];

const steps = [
  "Discord로 로그인하고 프로필과 롤 계정을 등록합니다.",
  "방장이 경매방을 만들고 참가자와 팀장을 설정합니다.",
  "팀장들이 제한 포인트 안에서 실시간으로 입찰합니다.",
  "낙찰과 유찰 재경매를 거쳐 내전 팀 구성을 확정합니다.",
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/home");
  }

  return (
    <main className="min-h-screen bg-[var(--page-muted)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_90%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-6">
          <Link href="/" className="text-lg font-black tracking-tight text-[var(--foreground)]">
            1234 <span className="text-[var(--accent-muted)]">Auction</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/auth/login"
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--primary)] px-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-sm shadow-[var(--shadow)] transition hover:bg-[var(--primary-hover)]"
            >
              Discord 로그인
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:py-20">
        <div>
          <p className="text-sm font-bold text-[var(--accent-muted)]">League of Legends 내전 경매</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-tight text-[var(--foreground)] md:text-6xl">
            1234 Auction
          </h1>
          <p className="mt-5 max-w-2xl text-xl font-semibold leading-8 text-[var(--foreground)]">
            디스코드 멤버들과 함께하는 실시간 LoL 내전 팀 경매
          </p>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
            친구/디스코드 서버 멤버들이 League of Legends 내전 팀을 구성하기 위해 사용하는 실시간 경매 서비스입니다.
            방장이 경매방을 만들고 참가자를 등록하면, 팀장들이 포인트로 참가자를 입찰해 팀을 구성할 수 있습니다.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/login"
              className="inline-flex h-12 items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--primary)] px-5 text-base font-bold text-[var(--primary-foreground)] shadow-sm shadow-[var(--shadow)] transition hover:bg-[var(--primary-hover)]"
            >
              Discord로 시작하기
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex h-12 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] px-5 text-base font-bold text-[var(--secondary-foreground)] shadow-sm shadow-[var(--shadow)] transition hover:bg-[var(--surface-hover)]"
            >
              경매방 참가하기
            </Link>
          </div>
        </div>

        <AuctionPreview />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 md:px-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--accent-muted)]">주요 기능</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)]">내전 경매에 필요한 흐름을 한 곳에</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[var(--foreground-muted)]">
            로그인 이후 실제 경매 생성, 참가, 프로필, 경매방은 기존처럼 인증된 사용자만 접근할 수 있습니다.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="p-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-sm font-black text-[var(--foreground)]">
                {feature.title.slice(0, 1)}
              </div>
              <h3 className="text-base font-black text-[var(--foreground)]">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 md:px-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="p-6">
          <p className="text-sm font-bold text-[var(--accent-muted)]">사용 흐름</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)]">방 만들기부터 결과 확인까지</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
            내전 경매를 진행하는 사람이 헷갈리지 않도록 준비, 입찰, 결과 흐름을 분리했습니다.
          </p>
        </Card>
        <div className="grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => (
            <Card key={step} className="flex gap-4 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-sm font-black">
                {index + 1}
              </span>
              <p className="text-sm font-semibold leading-6 text-[var(--foreground)]">{step}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <Card className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--accent-muted)]">지금 바로 시작</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)]">다음 내전 팀 구성을 더 빠르게 정리해보세요.</h2>
          </div>
          <Link
            href="/auth/login"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--primary)] px-5 text-base font-bold text-[var(--primary-foreground)] shadow-sm shadow-[var(--shadow)] transition hover:bg-[var(--primary-hover)]"
          >
            Discord로 시작하기
          </Link>
        </Card>
      </section>
    </main>
  );
}

function AuctionPreview() {
  const teams = [
    { name: "이우진 팀", points: "765P", members: ["MID", "ADC", "TOP"] },
    { name: "기찬 팀", points: "820P", members: ["JGL", "SUP"] },
  ];

  return (
    <Card className="overflow-hidden p-4">
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <p className="text-xs font-bold text-[var(--foreground-subtle)]">Room YnQuTEk</p>
            <p className="mt-1 text-lg font-black text-[var(--foreground)]">금요일 1234 내전 경매</p>
          </div>
          <span className="rounded border border-[var(--border-strong)] px-2 py-1 text-xs font-bold">진행중</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.25fr]">
          <div className="space-y-3">
            {teams.map((team) => (
              <div key={team.name} className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-[var(--foreground)]">{team.name}</p>
                  <span className="text-xs font-bold text-[var(--foreground-muted)]">{team.points}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {team.members.map((member) => (
                    <div key={member} className="rounded border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-center">
                      <div className="mx-auto h-8 w-8 rounded-md bg-[var(--surface-hover)]" />
                      <p className="mt-1 text-[10px] font-bold text-[var(--foreground-muted)]">{member}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-[var(--border-strong)] bg-[var(--card)] p-4">
            <div className="flex gap-3">
              <div className="h-20 w-20 shrink-0 rounded-md bg-[var(--surface-hover)]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--foreground-subtle)]">현재 경매 대상</p>
                <p className="mt-1 text-xl font-black text-[var(--foreground)]">준준</p>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">최고 티어 Master · 모스트 이즈리얼</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <p className="text-xs text-[var(--foreground-subtle)]">현재 최고 입찰</p>
                <p className="mt-1 text-sm font-black">이우진 팀</p>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <p className="text-xs text-[var(--foreground-subtle)]">최고 입찰가</p>
                <p className="mt-1 text-lg font-black">235P</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {["+5", "+10", "+50", "입찰"].map((label) => (
                <span
                  key={label}
                  className="flex h-9 flex-1 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] text-xs font-bold"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

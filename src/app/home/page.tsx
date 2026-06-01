import type { SVGProps } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { NavigationCard } from "@/components/layout/NavigationCard";

const cards = [
  {
    href: "/auctions/create",
    title: "경매 생성",
    description: "팀 수, 포인트, 참가자를 정리하고 새 내전 경매방을 엽니다.",
    eyebrow: "Host",
    actionLabel: "새 경매 만들기",
    icon: <CreateAuctionIcon />,
  },
  {
    href: "/auctions/join",
    title: "경매 참가",
    description: "공유받은 방 코드로 내전 경매방에 빠르게 합류합니다.",
    eyebrow: "Join",
    actionLabel: "방 코드로 입장",
    icon: <JoinAuctionIcon />,
  },
  {
    href: "/my-auctions",
    title: "나의 경매",
    description: "참여 예정, 진행 중, 종료된 경매를 한곳에서 확인합니다.",
    eyebrow: "Rooms",
    actionLabel: "경매 목록 보기",
    icon: <MyAuctionsIcon />,
  },
  {
    href: "/profile",
    title: "프로필 설정",
    description: "롤 계정, 라인, 티어와 모스트 챔피언 정보를 관리합니다.",
    eyebrow: "Profile",
    actionLabel: "프로필 관리",
    icon: <ProfileSetupIcon />,
  },
];

const flowItems = ["방 생성", "팀장 설정", "실시간 입찰", "결과 확인"];

export default function HomePage() {
  return (
    <AppShell activeHref="/home">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl shadow-[var(--shadow)] md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <p className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--foreground-subtle)]">
              1234 Auction Dashboard
            </p>
            <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-[var(--foreground)] md:text-5xl">
              디스코드 멤버들과 내전 팀 경매를 빠르게 시작하세요
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
              팀장들이 포인트로 참가자를 입찰하고, 롤 계정 티어와 모스트 챔피언을 보며 팀을 구성하는 실시간 LoL 내전 경매 서비스입니다.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--foreground-subtle)]">오늘의 흐름</p>
            <div className="mt-4 grid gap-2">
              {flowItems.map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-md bg-[var(--card)] px-3 py-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border)] text-xs font-black text-[var(--foreground)]">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <NavigationCard key={card.href} {...card} />
        ))}
      </section>
    </AppShell>
  );
}

function CreateAuctionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9" fill="none" {...props}>
      <rect x="9" y="10" width="24" height="26" rx="5" stroke="currentColor" strokeWidth="2.5" />
      <path d="M15 17H27M15 24H25M15 31H21" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      <circle cx="34" cy="30" r="7" fill="var(--card)" stroke="currentColor" strokeWidth="2.5" />
      <path d="M34 26V34M30 30H38" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

function JoinAuctionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9" fill="none" {...props}>
      <path d="M10 14.5C10 12 12 10 14.5 10H30C32.2 10 34 11.8 34 14V34C34 36.2 32.2 38 30 38H14.5C12 38 10 36 10 33.5V14.5Z" stroke="currentColor" strokeWidth="2.5" />
      <path d="M24 24H39M33 18L39 24L33 30" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <path d="M17 18H22M17 30H22" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

function MyAuctionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9" fill="none" {...props}>
      <rect x="8" y="10" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <rect x="26" y="10" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <rect x="8" y="26" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <rect x="26" y="26" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <path d="M13 16H17M31 16H35M13 32H17M31 32H35" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

function ProfileSetupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9" fill="none" {...props}>
      <circle cx="20" cy="18" r="7" stroke="currentColor" strokeWidth="2.5" />
      <path d="M8 38C9.8 31.8 14 28.5 20 28.5C24.4 28.5 27.9 30.3 30.1 33.8" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      <path d="M34 20V28M30 24H38" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      <rect x="29" y="31" width="11" height="7" rx="2" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

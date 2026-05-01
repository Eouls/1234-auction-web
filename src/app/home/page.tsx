import { AppShell } from "@/components/layout/AppShell";
import { NavigationCard } from "@/components/layout/NavigationCard";
import { PageHeader } from "@/components/ui";

const cards = [
  { href: "/auctions/create", title: "경매 생성", description: "팀 수, 인원, 포인트를 설정하고 참가자를 등록합니다.", icon: "＋" },
  { href: "/auctions/join", title: "경매 참가", description: "방 코드로 내가 등록된 경매방에 입장합니다.", icon: "↗" },
  { href: "/my-auctions", title: "나의 경매", description: "참여 예정, 진행 중, 종료된 경매를 확인합니다.", icon: "▦" },
  { href: "/profile", title: "프로필 설정", description: "롤 계정, 라인, 자기소개 정보를 관리합니다.", icon: "◎" },
];

export default function HomePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Dashboard"
        title="내전 팀 경매를 빠르게 준비하세요"
        description="Discord OAuth, Supabase Realtime, Prisma 연결을 얹기 전 전체 서비스 흐름을 확인하는 UI 뼈대입니다."
      />
      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <NavigationCard key={card.href} {...card} />
        ))}
      </section>
    </AppShell>
  );
}

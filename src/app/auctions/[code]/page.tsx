import { AppShell } from "@/components/layout/AppShell";
import { ParticipantList } from "@/components/auction/ParticipantList";
import { TeamPanel } from "@/components/auction/TeamPanel";
import {
  Avatar,
  Button,
  Card,
  ChampionIconPlaceholder,
  Input,
  PageHeader,
  RoleBadge,
  SectionTitle,
} from "@/components/ui";
import { dummyAuction, dummyBidLogs, dummyChatMessages } from "@/constants/dummy-data";

type AuctionRoomPageProps = {
  params: Promise<{ code: string }>;
};

export default async function AuctionRoomPage({ params }: AuctionRoomPageProps) {
  const { code } = await params;
  const currentTarget = dummyAuction.participants[0].profile;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Room ${code}`}
        title={dummyAuction.title}
        description="왼쪽은 팀 현황, 가운데는 입찰, 오른쪽은 참가자와 채팅 영역입니다."
      />
      <div className="mt-8 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="space-y-4">
          <SectionTitle title="팀 현황" description="방장만 팀장을 선택할 수 있습니다." />
          <TeamPanel teams={dummyAuction.teams} />
        </aside>

        <section className="space-y-4">
          <Card className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row">
              <Avatar name={currentTarget.nickname} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-black text-white">{currentTarget.nickname}</h2>
                  <RoleBadge role={currentTarget.mainRole} />
                  <RoleBadge role={currentTarget.subRole} />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{currentTarget.bio}</p>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="롤 계정" value={`${currentTarget.lolAccounts[0]?.gameName} #${currentTarget.lolAccounts[0]?.tagLine}`} />
                  <Info label="현재 / 최고 티어" value={`${currentTarget.currentTier} / ${currentTarget.peakTier}`} />
                </div>
                <div className="mt-4 flex gap-2">
                  {currentTarget.favoriteChampions.map((champion) => (
                    <ChampionIconPlaceholder key={champion} name={champion} />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <Info label="타이머" value="00:24" strong />
              <Info label="현재 최고 입찰 팀" value="Team Red" strong />
              <Info label="현재 입찰 포인트" value="150P" strong />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {[5, 10, 50, 100].map((amount) => (
                <Button key={amount} type="button" variant="secondary">+{amount}</Button>
              ))}
              <Input className="w-32" placeholder="직접 입력" />
              <Button type="button">입찰</Button>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="입찰 로그" />
            <div className="space-y-2">
              {dummyBidLogs.map((log) => (
                <div
                  key={log.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    log.isFinal
                      ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border-white/10 bg-slate-950/60 text-slate-300"
                  }`}
                >
                  <span className="mr-2 text-xs text-slate-500">{log.createdAt}</span>
                  {log.message}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="p-4">
            <SectionTitle title="참가자 목록" />
            <ParticipantList participants={dummyAuction.participants} />
          </Card>
          <Card className="p-4">
            <div className="mb-4 flex rounded-md border border-white/10 bg-slate-950/70 p-1">
              <button className="flex-1 rounded bg-cyan-400 px-3 py-2 text-sm font-bold text-slate-950" type="button">전체 채팅</button>
              <button className="flex-1 rounded px-3 py-2 text-sm font-semibold text-slate-400" type="button">팀 채팅</button>
            </div>
            <p className="mb-3 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              팀 채팅은 낙찰된 팀원과 팀장만 사용할 수 있습니다.
            </p>
            <div className="space-y-2">
              {dummyChatMessages.map((chat) => (
                <div key={chat.id} className="rounded-md bg-slate-950/70 p-3 text-sm">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-200">{chat.authorName}</span>
                    <span className="text-slate-500">{chat.time}</span>
                  </div>
                  <p className="mt-1 text-slate-300">{chat.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input placeholder="메시지 입력" />
              <Button type="button" variant="secondary">전송</Button>
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={strong ? "mt-1 text-xl font-black text-cyan-200" : "mt-1 text-sm font-semibold text-slate-100"}>{value}</p>
    </div>
  );
}

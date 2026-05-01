import { AppShell } from "@/components/layout/AppShell";
import { Avatar, Card, ChampionIconPlaceholder, PageHeader } from "@/components/ui";
import { dummyAuction } from "@/constants/dummy-data";

type AuctionResultPageProps = {
  params: Promise<{ code: string }>;
};

export default async function AuctionResultPage({ params }: AuctionResultPageProps) {
  const { code } = await params;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Result ${code}`}
        title={`${dummyAuction.title} 결과`}
        description="팀장과 낙찰된 팀원을 팀별로 확인합니다."
      />
      <section className="mt-8 space-y-5">
        {dummyAuction.teams.map((team) => (
          <Card key={team.id} className="p-5">
            <div className="flex flex-col gap-2 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black text-white">{team.name}</h2>
                <p className="mt-1 text-sm text-slate-400">팀장 {team.captain.nickname}</p>
              </div>
              <p className="text-sm font-bold text-cyan-200">잔여 포인트 {team.remainingPoints}P</p>
            </div>
            <div className="mt-5 flex gap-4 overflow-x-auto pb-1">
              <MemberCard name={team.captain.nickname} account={team.captain.lolAccounts[0]?.gameName ?? "-"} point="팀장" champions={team.captain.favoriteChampions} />
              {team.members.map((member) => (
                <MemberCard
                  key={member.id}
                  name={member.profile.nickname}
                  account={`${member.profile.lolAccounts[0]?.gameName ?? "-"} #${member.profile.lolAccounts[0]?.tagLine ?? "-"}`}
                  point={`${member.soldPoint ?? 0}P`}
                  champions={member.profile.favoriteChampions}
                />
              ))}
            </div>
          </Card>
        ))}
      </section>
    </AppShell>
  );
}

function MemberCard({ name, account, point, champions }: { name: string; account: string; point: string; champions: string[] }) {
  return (
    <div className="w-52 shrink-0 rounded-lg border border-white/10 bg-slate-950/70 p-4">
      <Avatar name={name} size="lg" />
      <h3 className="mt-3 truncate font-bold text-white">{name}</h3>
      <p className="mt-1 truncate text-xs text-slate-500">{account}</p>
      <p className="mt-3 text-sm font-bold text-cyan-200">{point}</p>
      <div className="mt-3 flex gap-2">
        {champions.slice(0, 3).map((champion) => (
          <ChampionIconPlaceholder key={champion} name={champion} />
        ))}
      </div>
    </div>
  );
}

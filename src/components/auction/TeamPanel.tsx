import type { AuctionTeam } from "@/types/auction";
import { Avatar, Card } from "@/components/ui";

export function TeamPanel({ teams }: { teams: AuctionTeam[] }) {
  return (
    <div className="space-y-4">
      {teams.map((team) => (
        <Card key={team.id} className="p-4">
          <div className="flex items-center gap-3">
            <Avatar name={team.captain.nickname} />
            <div>
              <h3 className="font-bold text-white">{team.name}</h3>
              <p className="text-xs text-slate-400">팀장 {team.captain.nickname}</p>
            </div>
            <p className="ml-auto text-sm font-bold text-cyan-200">{team.remainingPoints}P</p>
          </div>
          <div className="mt-4 space-y-2">
            {team.members.length ? (
              team.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-md bg-slate-950/70 px-3 py-2 text-sm">
                  <span className="text-slate-200">{member.profile.nickname}</span>
                  <span className="text-slate-500">{member.soldPoint ?? 0}P</span>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-slate-950/70 px-3 py-2 text-sm text-slate-500">아직 낙찰된 팀원이 없습니다.</p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

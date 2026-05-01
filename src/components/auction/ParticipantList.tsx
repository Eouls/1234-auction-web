import type { AuctionParticipant } from "@/types/auction";
import { Avatar, RoleBadge } from "@/components/ui";

export function ParticipantList({ participants }: { participants: AuctionParticipant[] }) {
  return (
    <div className="space-y-2">
      {participants.map((participant) => (
        <div key={participant.id} className="flex items-center gap-3 rounded-md border border-white/10 bg-slate-950/60 p-3">
          <Avatar name={participant.profile.nickname} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{participant.profile.nickname}</p>
            <p className="truncate text-xs text-slate-500">
              {participant.profile.lolAccounts[0]?.gameName} #{participant.profile.lolAccounts[0]?.tagLine}
            </p>
          </div>
          <RoleBadge role={participant.profile.mainRole} />
        </div>
      ))}
    </div>
  );
}

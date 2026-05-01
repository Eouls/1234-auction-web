import type { UserProfile } from "@/types/auction";
import { Avatar, Card, ChampionIconPlaceholder, RoleBadge } from "@/components/ui";

export function ProfileSummary({ profile }: { profile: UserProfile }) {
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <Avatar name={profile.nickname} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{profile.nickname}</h2>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">
              {profile.useDiscordAvatar ? "디스코드 기본 이미지 사용" : "사용자 업로드 이미지"}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{profile.bio}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <RoleBadge role={profile.mainRole} />
            <RoleBadge role={profile.subRole} />
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Info label="현재 티어" value={profile.currentTier} />
        <Info label="최고 티어" value={profile.peakTier} />
        <div>
          <p className="text-xs font-semibold text-slate-500">모스트 챔피언</p>
          <div className="mt-2 flex gap-2">
            {profile.favoriteChampions.map((champion) => (
              <ChampionIconPlaceholder key={champion} name={champion} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6">
        <p className="text-xs font-semibold text-slate-500">롤 계정</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.lolAccounts.map((account) => (
            <span key={account.id} className="rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              {account.gameName} #{account.tagLine}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

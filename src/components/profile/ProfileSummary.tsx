import { Avatar, Card, ChampionIconPlaceholder, RoleBadge } from "@/components/ui";
import type { LolRole } from "@/types/auction";

type ProfileSummaryProps = {
  profile: {
    nickname: string;
    imageUrl?: string | null;
    usesDiscordAvatar: boolean;
    lolAccounts: Array<{
      id: string;
      gameName: string;
      tagLine: string;
    }>;
    mainRole: LolRole;
    subRole: LolRole;
    bio?: string | null;
    currentTier?: string | null;
    currentRank?: string | null;
    peakTier?: string | null;
    peakRank?: string | null;
    favoriteChampions: Array<{
      name: string | null;
      imageUrl?: string | null;
    }>;
  };
};

export function ProfileSummary({ profile }: ProfileSummaryProps) {
  const currentTier = [profile.currentTier, profile.currentRank].filter(Boolean).join(" ") || "정보 없음";
  const peakTier = [profile.peakTier, profile.peakRank].filter(Boolean).join(" ") || "정보 없음";
  const champions = profile.favoriteChampions.filter((champion) => champion.name);

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <Avatar name={profile.nickname} size="xl" src={profile.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{profile.nickname}</h2>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">
              {profile.usesDiscordAvatar ? "디스코드 기본 이미지 사용" : "사용자 업로드 이미지"}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {profile.bio?.trim() || "아직 자기소개가 없습니다."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <RoleBadge role={profile.mainRole} />
            <RoleBadge role={profile.subRole} />
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Info label="현재 티어" value={currentTier} />
        <Info label="최고 티어" value={peakTier} />
        <div>
          <p className="text-xs font-semibold text-slate-500">모스트 챔피언</p>
          <div className="mt-2 flex gap-2">
            {champions.length ? (
              champions.map((champion) => (
                <ChampionIconPlaceholder key={champion.name} name={champion.name ?? "정보 없음"} />
              ))
            ) : (
              <span className="text-sm text-slate-500">정보 없음</span>
            )}
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

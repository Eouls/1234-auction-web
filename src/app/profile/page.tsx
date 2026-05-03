import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileSummary } from "@/components/profile/ProfileSummary";
import { RiotStatsRefreshButton } from "@/components/profile/RiotStatsRefreshButton";
import { Button, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { filterValidChampionNames } from "@/lib/riot/champions";
import { createClient } from "@/lib/supabase/server";
import type { LolRole } from "@/types/auction";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/auth/login");
  }

  const user = await prisma.user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    include: {
      lolAccounts: {
        orderBy: {
          createdAt: "asc",
        },
      },
      lolStats: true,
    },
  });

  if (!user) {
    redirect("/onboarding");
  }

  const imageUrl = user.customProfileImageUrl ?? user.discordAvatarUrl;
  const validChampionNames = await filterValidChampionNames([
    user.lolStats?.mostChampion1,
    user.lolStats?.mostChampion2,
    user.lolStats?.mostChampion3,
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Profile"
        title="내 프로필"
        description="경매 카드에 표시될 라인, 티어, 계정 정보를 확인합니다."
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <RiotStatsRefreshButton />
            <Link href="/profile/edit">
              <Button type="button">프로필 수정</Button>
            </Link>
          </div>
        }
      />
      <div className="mt-8">
        <ProfileSummary
          profile={{
            nickname: user.nickname,
            imageUrl,
            usesDiscordAvatar: !user.customProfileImageUrl,
            lolAccounts: user.lolAccounts,
            mainRole: user.mainRole as LolRole,
            subRole: user.subRole as LolRole,
            bio: user.bio,
            currentTier: user.lolStats?.currentTier,
            currentRank: user.lolStats?.currentRank,
            peakTier: user.lolStats?.peakTier,
            peakRank: user.lolStats?.peakRank,
            favoriteChampions: [
              {
                name: validChampionNames[0],
                imageUrl: user.lolStats?.mostChampion1ImageUrl ?? null,
              },
              {
                name: validChampionNames[1],
                imageUrl: user.lolStats?.mostChampion2ImageUrl ?? null,
              },
              {
                name: validChampionNames[2],
                imageUrl: user.lolStats?.mostChampion3ImageUrl ?? null,
              },
            ],
          }}
        />
      </div>
    </AppShell>
  );
}

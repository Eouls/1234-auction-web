import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileSummary } from "@/components/profile/ProfileSummary";
import { Button, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
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

  return (
    <AppShell>
      <PageHeader
        eyebrow="Profile"
        title="내 프로필"
        description="경매 카드에 표시될 라인, 티어, 계정 정보를 확인합니다."
        action={
          <Link href="/profile/edit">
            <Button type="button">프로필 수정</Button>
          </Link>
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
                name: user.lolStats?.mostChampion1 ?? null,
                imageUrl: user.lolStats?.mostChampion1ImageUrl ?? null,
              },
              {
                name: user.lolStats?.mostChampion2 ?? null,
                imageUrl: user.lolStats?.mostChampion2ImageUrl ?? null,
              },
              {
                name: user.lolStats?.mostChampion3 ?? null,
                imageUrl: user.lolStats?.mostChampion3ImageUrl ?? null,
              },
            ],
          }}
        />
      </div>
    </AppShell>
  );
}

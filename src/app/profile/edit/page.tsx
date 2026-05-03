import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { LolRole } from "@/types/auction";

export default async function ProfileEditPage() {
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
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!user) {
    redirect("/onboarding");
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Profile"
        title="프로필 수정"
        description="닉네임, 롤 계정, 선호 라인, 자기소개와 프로필 이미지를 수정합니다."
      />
      <ProfileEditForm
        profile={{
          nickname: user.nickname,
          bio: user.bio,
          mainRole: user.mainRole as LolRole,
          subRole: user.subRole as LolRole,
          imageUrl: user.customProfileImageUrl ?? user.discordAvatarUrl,
          lolAccounts: user.lolAccounts,
        }}
      />
    </AppShell>
  );
}

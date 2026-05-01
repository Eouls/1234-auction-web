import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/auth/login");
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    redirect("/home");
  }

  return (
    <AppShell allowIncompleteOnboarding>
      <PageHeader
        eyebrow="Onboarding"
        title="추가 정보를 입력해주세요"
        description="서비스 닉네임, 롤 계정, 선호 라인을 등록하면 1234 Auction을 사용할 수 있습니다."
      />
      <OnboardingForm />
    </AppShell>
  );
}

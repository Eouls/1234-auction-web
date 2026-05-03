import { redirect } from "next/navigation";
import { AuctionCreateForm } from "@/components/auction/AuctionCreateForm";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function AuctionCreatePage() {
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
    select: {
      id: true,
    },
  });

  if (!user) {
    redirect("/onboarding");
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Create Auction"
        title="경매 생성"
        description="경매 설정과 참가자 명단을 구성하면 팀장 설정 전 READY 상태의 경매방이 생성됩니다."
      />
      <AuctionCreateForm />
    </AppShell>
  );
}

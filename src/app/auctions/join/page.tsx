import { AppShell } from "@/components/layout/AppShell";
import { AuctionJoinForm } from "@/components/auction/AuctionJoinForm";
import { PageHeader } from "@/components/ui";

export default function AuctionJoinPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Join Auction"
        title="경매 참가"
        description="방 코드로 경매방에 입장합니다."
      />
      <AuctionJoinForm />
    </AppShell>
  );
}

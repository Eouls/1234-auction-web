import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, Input, PageHeader } from "@/components/ui";

export default function AuctionJoinPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Join Auction"
        title="경매 참가"
        description="방 코드로 경매방에 입장합니다."
      />
      <Card className="mt-8 max-w-xl p-6">
        <label className="block text-sm font-semibold text-slate-300">
          방 코드
          <Input className="mt-2" defaultValue="" placeholder="예: w23EFgf" />
        </label>
        <p className="mt-3 text-sm text-slate-400">방장이 참가자로 등록한 사용자만 입장할 수 있습니다.</p>
        <Button type="button" className="mt-6">참가하기</Button>
      </Card>
    </AppShell>
  );
}

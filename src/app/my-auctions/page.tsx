import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui";
import { dummyAuctions } from "@/constants/dummy-data";

export default function MyAuctionsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="My Auctions"
        title="나의 경매"
        description="내가 참여자로 등록된 경매 목록입니다."
      />
      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {dummyAuctions.map((auction) => (
          <Card key={auction.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-white">{auction.title}</h2>
              <StatusBadge status={auction.status} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Info label="팀 수" value={`${auction.teamCount}`} />
              <Info label="팀당 인원" value={`${auction.membersPerTeam}`} />
              <Info label="참가자 수" value={`${auction.participantCount}`} />
              <Info label="방 코드" value={auction.code} />
            </dl>
            <Link href={auction.status === "ENDED" ? `/auctions/${auction.code}/result` : `/auctions/${auction.code}`} className="mt-5 block">
              <Button type="button" className="w-full" variant={auction.status === "ENDED" ? "secondary" : "primary"}>
                {auction.status === "ENDED" ? "결과 확인" : "입장하기"}
              </Button>
            </Link>
          </Card>
        ))}
      </section>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-950/60 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuctionStatus } from "@/generated/prisma/client";
import { AuctionDeleteButton } from "@/components/auction/AuctionDeleteButton";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { AuctionStatus as UiAuctionStatus } from "@/types/auction";

export default async function MyAuctionsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/auth/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    select: { id: true },
  });

  if (!currentUser) {
    redirect("/onboarding");
  }

  const auctions = await prisma.auction.findMany({
    where: {
      deletedAt: null,
      OR: [
        { ownerId: currentUser.id },
        {
          participants: {
            some: {
              userId: currentUser.id,
            },
          },
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          participants: true,
        },
      },
    },
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="My Auctions"
        title="나의 경매"
        description="내가 만들었거나 참가자로 등록된 경매 목록입니다."
      />
      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {auctions.map((auction) => {
          const isEnded = auction.status === AuctionStatus.FINISHED || auction.status === AuctionStatus.CANCELED;
          const canDelete = auction.ownerId === currentUser.id && auction.status !== AuctionStatus.RUNNING;

          return (
            <Card key={auction.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">{auction.title}</h2>
                  {auction.ownerId === currentUser.id ? (
                    <p className="mt-1 text-xs font-semibold text-cyan-200">방장</p>
                  ) : null}
                </div>
                <StatusBadge status={toUiStatus(auction.status)} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <Info label="팀 수" value={`${auction.teamCount}`} />
                <Info label="팀당 인원" value={`${auction.membersPerTeam}`} />
                <Info label="참가자 수" value={`${auction._count.participants}`} />
                <Info label="방 코드" value={auction.code} />
              </dl>
              <div className="mt-5 grid gap-2">
                <Link
                  className="block"
                  href={isEnded ? `/auctions/${auction.code}/result` : `/auctions/${auction.code}`}
                >
                  <Button className="w-full" type="button" variant={isEnded ? "secondary" : "primary"}>
                    {isEnded ? "결과 확인" : "입장하기"}
                  </Button>
                </Link>
                {canDelete ? <AuctionDeleteButton auctionCode={auction.code} auctionId={auction.id} /> : null}
              </div>
            </Card>
          );
        })}
      </section>
    </AppShell>
  );
}

function toUiStatus(status: AuctionStatus): UiAuctionStatus {
  if (status === AuctionStatus.FINISHED || status === AuctionStatus.CANCELED) return "ENDED";
  if (status === AuctionStatus.PAUSED) return "PAUSED";
  if (status === AuctionStatus.RUNNING) return "IN_PROGRESS";
  return "WAITING";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-950/60 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

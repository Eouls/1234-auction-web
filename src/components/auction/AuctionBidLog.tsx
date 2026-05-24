"use client";

import { useEffect, useRef } from "react";
import { Card, SectionTitle } from "@/components/ui";

type AuctionBidLogItem = {
  amount: number;
  bidderCaptainNickname: string;
  bidderTeamName: string;
  id: string;
  isCurrentBid: boolean;
  targetNickname: string;
};

type AuctionBidLogProps = {
  bids: AuctionBidLogItem[];
};

export function AuctionBidLog({ bids }: AuctionBidLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestBid = bids.length ? bids[bids.length - 1] : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      behavior: "smooth",
      top: scrollRef.current.scrollHeight,
    });
  }, [bids.length, latestBid?.id]);

  return (
    <Card className="p-4">
      <SectionTitle title="입찰 로그" />
      {bids.length ? (
        <div ref={scrollRef} className="max-h-[150px] space-y-2 overflow-y-auto pr-1">
          {bids.map((bid) => {
            const isLatestBid = bid.id === latestBid?.id;

            return (
              <div
                key={bid.id}
                className={`relative rounded-md border px-3 py-2 text-sm transition-colors ${
                  isLatestBid
                    ? "border-amber-300/60 bg-amber-400/10 pl-4 text-amber-100"
                    : bid.isCurrentBid
                      ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border-white/10 bg-slate-950/60 text-slate-300"
                }`}
              >
                {isLatestBid ? (
                  <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-amber-300" aria-hidden="true" />
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {isLatestBid ? (
                    <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-2 py-0.5 text-[10px] font-black text-amber-100">
                      최신
                    </span>
                  ) : null}
                  <span className="font-semibold text-white">{bid.bidderTeamName}</span>
                  <span className="text-slate-500">·</span>
                  <span>
                    {bid.targetNickname}님에게 <strong className="text-base font-black text-amber-100">{bid.amount.toLocaleString()}P</strong> 입찰
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">팀장 {bid.bidderCaptainNickname}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-500">
          아직 입찰 기록이 없습니다.
        </p>
      )}
    </Card>
  );
}

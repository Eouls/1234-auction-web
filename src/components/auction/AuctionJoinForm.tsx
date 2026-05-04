"use client";

import { useActionState } from "react";
import { joinAuction, type JoinAuctionState } from "@/app/auctions/join/actions";
import { Button, Card, Input } from "@/components/ui";

const initialState: JoinAuctionState = {};

export function AuctionJoinForm() {
  const [state, formAction, isPending] = useActionState(joinAuction, initialState);

  return (
    <Card className="mt-8 max-w-xl p-6">
      <form action={formAction}>
        <label className="block text-sm font-semibold text-slate-300">
          방 코드
          <Input
            autoComplete="off"
            className="mt-2"
            disabled={isPending}
            name="code"
            placeholder="예: w23EFgf"
          />
        </label>
        <p className="mt-3 text-sm text-slate-400">방장이 참가자로 등록한 사용자만 입장할 수 있습니다.</p>
        {state.error ? (
          <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {state.error}
          </p>
        ) : null}
        <Button className="mt-6" disabled={isPending} type="submit">
          {isPending ? "참가 중..." : "참가하기"}
        </Button>
      </form>
    </Card>
  );
}

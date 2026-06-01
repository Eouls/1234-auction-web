"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteAuction, type DeleteAuctionState } from "@/app/my-auctions/actions";
import { Button } from "@/components/ui";

type AuctionDeleteButtonProps = {
  auctionCode: string;
  auctionId: string;
};

const initialState: DeleteAuctionState = {};

export function AuctionDeleteButton({ auctionCode, auctionId }: AuctionDeleteButtonProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteAuction, initialState);

  useEffect(() => {
    if (!state.success) return;
    router.refresh();
  }, [router, state.success]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "이 경매방을 삭제하시겠습니까?\n삭제하면 나의 경매 목록에서 더 이상 보이지 않습니다.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="auctionId" value={auctionId} />
      <input type="hidden" name="auctionCode" value={auctionCode} />
      <Button className="w-full" type="submit" variant="danger" disabled={isPending}>
        {isPending ? "삭제 중..." : "삭제"}
      </Button>
      {state.error ? <p className="mt-2 text-xs text-[var(--danger)]">{state.error}</p> : null}
    </form>
  );
}

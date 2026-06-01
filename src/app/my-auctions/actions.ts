"use server";

import { revalidatePath } from "next/cache";
import { AuctionStatus } from "@/generated/prisma/client";
import { logAppError } from "@/lib/logging/app-log";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type DeleteAuctionState = {
  error?: string;
  success?: string;
};

export async function deleteAuction(
  _previousState: DeleteAuctionState,
  formData: FormData,
): Promise<DeleteAuctionState> {
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  if (!auctionId || !auctionCode) {
    return { error: "경매방 삭제에 필요한 정보가 부족합니다." };
  }

  try {
    const deletedAt = new Date();
    const auction = await prisma.$transaction(async (tx) => {
      const existingAuction = await tx.auction.findUnique({
        where: { id: auctionId },
        select: {
          code: true,
          deletedAt: true,
          id: true,
          ownerId: true,
          status: true,
        },
      });

      if (!existingAuction) throw new DeleteAuctionError("경매방을 찾을 수 없습니다.");
      if (existingAuction.ownerId !== currentUser.id) {
        throw new DeleteAuctionError("방장만 경매방을 삭제할 수 있습니다.");
      }
      if (existingAuction.deletedAt) {
        return existingAuction;
      }
      if (existingAuction.status === AuctionStatus.RUNNING) {
        throw new DeleteAuctionError("진행 중인 경매방은 삭제할 수 없습니다. 먼저 일시정지하거나 종료해주세요.");
      }

      return tx.auction.update({
        where: { id: existingAuction.id },
        data: {
          deletedAt,
          lastActivityAt: deletedAt,
        },
        select: {
          code: true,
          deletedAt: true,
          id: true,
          ownerId: true,
          status: true,
        },
      });
    });

    await logAppError({
      auctionId: auction.id,
      level: "INFO",
      message: "Auction deleted",
      metadata: {
        auctionCode: auction.code,
        deletedAt: auction.deletedAt?.toISOString() ?? deletedAt.toISOString(),
        deletedByUserId: currentUser.id,
        previousStatus: auction.status,
      },
      scope: "auction-delete",
      userId: currentUser.id,
    });
  } catch (error) {
    if (error instanceof DeleteAuctionError) {
      return { error: error.message };
    }

    console.error("[auction-delete] Failed to delete auction", error);
    return { error: "경매방 삭제에 실패했습니다." };
  }

  revalidatePath("/my-auctions");
  revalidatePath(`/auctions/${auctionCode}`);
  revalidatePath(`/auctions/${auctionCode}/result`);

  return { success: "경매방을 삭제했습니다." };
}

class DeleteAuctionError extends Error {}

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  return prisma.user.findUnique({
    where: { authUserId: authUser.id },
    select: { id: true },
  });
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

"use server";

import { redirect } from "next/navigation";
import { AuctionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type JoinAuctionState = {
  error?: string;
};

export async function joinAuction(
  _previousState: JoinAuctionState,
  formData: FormData,
): Promise<JoinAuctionState> {
  const code = stringValue(formData.get("code"));

  if (!code) {
    return { error: "방 코드를 입력해주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/auth/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    select: {
      id: true,
    },
  });

  if (!currentUser) {
    redirect("/onboarding");
  }

  const auction = await prisma.auction.findUnique({
    where: {
      code,
    },
    select: {
      code: true,
      deletedAt: true,
      id: true,
      status: true,
      participants: {
        where: {
          userId: currentUser.id,
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  if (!auction) {
    return { error: "존재하지 않는 경매방입니다." };
  }

  if (auction.deletedAt) {
    return { error: "삭제된 경매방입니다." };
  }

  if (auction.status === AuctionStatus.FINISHED || auction.status === AuctionStatus.CANCELED) {
    return { error: "이미 종료된 경매방입니다." };
  }

  if (auction.participants.length === 0) {
    return { error: "이 경매방의 참가자로 등록되어 있지 않습니다." };
  }

  redirect(`/auctions/${auction.code}`);
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

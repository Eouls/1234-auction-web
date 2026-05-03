"use server";

import { redirect } from "next/navigation";
import { AuctionStatus, ParticipantStatus, Prisma } from "@/generated/prisma/client";
import { generateAuctionCode } from "@/lib/auction/code";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { LolRole } from "@/types/auction";

type ParticipantPreview = {
  id: string;
  nickname: string;
  imageUrl: string | null;
  mainRole: LolRole | null;
  subRole: LolRole | null;
};

export type AddParticipantResult =
  | { ok: true; participant: ParticipantPreview }
  | { ok: false; error: string };

export type CreateAuctionFormState = {
  error?: string;
  fieldErrors?: {
    title?: string;
    teamCount?: string;
    membersPerTeam?: string;
    auctionSeconds?: string;
    extendSeconds?: string;
    startPoints?: string;
    participants?: string;
  };
};

export async function findParticipantByNickname(nickname: string): Promise<AddParticipantResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  const normalizedNickname = nickname.trim();

  if (!normalizedNickname) {
    return { ok: false, error: "닉네임을 입력해주세요." };
  }

  const user = await prisma.user.findUnique({
    where: {
      nickname: normalizedNickname,
    },
    select: {
      id: true,
      nickname: true,
      customProfileImageUrl: true,
      discordAvatarUrl: true,
      mainRole: true,
      subRole: true,
    },
  });

  if (!user) {
    return { ok: false, error: "존재하지 않는 닉네임입니다." };
  }

  return {
    ok: true,
    participant: {
      id: user.id,
      nickname: user.nickname,
      imageUrl: user.customProfileImageUrl ?? user.discordAvatarUrl,
      mainRole: user.mainRole as LolRole | null,
      subRole: user.subRole as LolRole | null,
    },
  };
}

export async function createAuction(
  _previousState: CreateAuctionFormState,
  formData: FormData,
): Promise<CreateAuctionFormState> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  const title = stringValue(formData.get("title"));
  const teamCount = numberValue(formData.get("teamCount"));
  const membersPerTeam = numberValue(formData.get("membersPerTeam"));
  const auctionSeconds = numberValue(formData.get("auctionSeconds"));
  const extendSeconds = numberValue(formData.get("extendSeconds"));
  const startPoints = numberValue(formData.get("startPoints"));
  const participantIds = formData.getAll("participantId").map(stringValue).filter(Boolean);

  const fieldErrors: NonNullable<CreateAuctionFormState["fieldErrors"]> = {};

  if (!title) {
    fieldErrors.title = "경매 제목을 입력해주세요.";
  }

  if (teamCount < 2) {
    fieldErrors.teamCount = "팀 수는 2 이상이어야 합니다.";
  }

  if (membersPerTeam < 1) {
    fieldErrors.membersPerTeam = "팀당 인원 수는 1 이상이어야 합니다.";
  }

  if (auctionSeconds < 5) {
    fieldErrors.auctionSeconds = "경매 시간은 5초 이상이어야 합니다.";
  }

  if (extendSeconds < 0) {
    fieldErrors.extendSeconds = "입찰 추가 시간은 0초 이상이어야 합니다.";
  }

  if (startPoints < 1) {
    fieldErrors.startPoints = "시작 포인트는 1 이상이어야 합니다.";
  }

  const requiredParticipantCount = teamCount * membersPerTeam;
  const uniqueParticipantIds = Array.from(new Set(participantIds));

  if (uniqueParticipantIds.length !== participantIds.length) {
    fieldErrors.participants = "중복 참가자가 포함되어 있습니다.";
  } else if (requiredParticipantCount > 0 && participantIds.length < requiredParticipantCount) {
    fieldErrors.participants = `참가자 수가 부족합니다. ${requiredParticipantCount}명이 필요합니다.`;
  } else if (requiredParticipantCount > 0 && participantIds.length > requiredParticipantCount) {
    fieldErrors.participants = `참가자 수가 초과되었습니다. ${requiredParticipantCount}명만 등록할 수 있습니다.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "입력값을 확인해주세요.",
      fieldErrors,
    };
  }

  const existingParticipants = await prisma.user.findMany({
    where: {
      id: {
        in: participantIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingParticipants.length !== participantIds.length) {
    return {
      error: "참가자 목록에 존재하지 않는 사용자가 포함되어 있습니다.",
      fieldErrors: {
        participants: "참가자를 다시 추가해주세요.",
      },
    };
  }

  let code: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateCode = generateAuctionCode();
    const existingAuction = await prisma.auction.findUnique({
      where: {
        code: candidateCode,
      },
      select: {
        id: true,
      },
    });

    if (!existingAuction) {
      code = candidateCode;
      break;
    }
  }

  if (!code) {
    return { error: "경매 코드를 생성하지 못했습니다. 다시 시도해주세요." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.create({
        data: {
          code,
          title,
          ownerId: currentUser.id,
          teamCount,
          membersPerTeam,
          auctionSeconds,
          extendSeconds,
          startPoints,
          status: AuctionStatus.READY,
        },
        select: {
          id: true,
        },
      });

      await tx.auctionTeam.createMany({
        data: Array.from({ length: teamCount }, (_, index) => ({
          auctionId: auction.id,
          name: `Team ${index + 1}`,
          pointsLeft: startPoints,
        })),
      });

      await tx.auctionParticipant.createMany({
        data: participantIds.map((participantId) => ({
          auctionId: auction.id,
          userId: participantId,
          status: ParticipantStatus.WAITING,
        })),
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[auction-create] Prisma error", {
        code: error.code,
        message: error.message,
      });
    } else {
      console.error("[auction-create] Unknown error", error);
    }

    return { error: "경매 생성에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }

  redirect(`/auctions/${code}`);
}

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    select: {
      id: true,
      nickname: true,
    },
  });
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: FormDataEntryValue | null) {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

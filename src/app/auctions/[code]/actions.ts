"use server";

import { revalidatePath } from "next/cache";
import { AuctionStatus, ChatType, ParticipantStatus } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type AuctionTeamSnapshot = {
  captainId: string | null;
  id: string;
  pointsLeft: number;
};

type AuctionParticipantSnapshot = {
  auctionOrder: number | null;
  createdAt: Date;
  id: string;
  lastSeenAt?: Date | null;
  status: ParticipantStatus;
  teamId: string | null;
  userId: string;
};

export type CaptainActionState = {
  error?: string;
  noop?: boolean;
  reason?: string;
  success?: string;
};

const editableAuctionStatuses = new Set<string>([AuctionStatus.DRAFT, AuctionStatus.READY]);
const CAPTAIN_PRESENCE_WINDOW_MS = 30 * 1000;

export type AuctionActionState = CaptainActionState;

export type ChatActionState = {
  error?: string;
  message?: ChatMessagePayload;
  success?: string;
};

export type ChatMessagePayload = {
  auctionId: string;
  createdAt: string;
  id: string;
  message: string;
  sender: {
    id: string;
    imageUrl: string | null;
    nickname: string;
  };
  senderId: string;
  teamId: string | null;
  type: ChatType;
};

export async function startAuction(
  _previousState: AuctionActionState,
  formData: FormData,
): Promise<AuctionActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));

  if (!currentUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: {
          participants: true,
          teams: {
            include: {
              captain: {
                select: {
                  nickname: true,
                },
              },
            },
          },
        },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.ownerId !== currentUser.id) throw new CaptainActionError("방장만 시작 가능합니다.");
      if (!editableAuctionStatuses.has(auction.status)) {
        throw new CaptainActionError("이미 진행 중이거나 종료된 경매입니다.");
      }
      if (auction.teams.some((team) => !team.captainId)) {
        throw new CaptainActionError("모든 팀장을 설정해야 시작 가능합니다.");
      }
      const missingCaptains = getMissingPresentCaptains({
        now: new Date(),
        participants: auction.participants,
        teams: auction.teams,
      });

      if (missingCaptains.length > 0) {
        throw new CaptainActionError(`${missingCaptains[0]} 팀의 팀장이 아직 입장하지 않았습니다.`);
      }

      const candidates = shuffleItems(
        auction.participants.filter(
        (participant) => participant.status === ParticipantStatus.WAITING,
        ),
      );
      const target = candidates[0] ?? null;

      if (!target) throw new CaptainActionError("경매 대상 참가자가 없습니다.");

      await Promise.all(
        candidates.map((participant, index) =>
          tx.auctionParticipant.update({
            where: { id: participant.id },
            data: {
              auctionOrder: index + 1,
              status: participant.id === target.id ? ParticipantStatus.BIDDING : ParticipantStatus.WAITING,
            },
          }),
        ),
      );

      await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: AuctionStatus.RUNNING,
          currentTargetParticipantId: target.id,
          currentBidId: null,
          currentRoundEndAt: new Date(Date.now() + auction.auctionSeconds * 1000),
        },
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-start] Failed", error);
    return { error: "경매 시작 실패" };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "경매를 시작했습니다." };
}

export async function placeBid(
  _previousState: AuctionActionState,
  formData: FormData,
): Promise<AuctionActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  const amount = numberValue(formData.get("bidAmount"));

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: { teams: true, participants: true },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.status !== AuctionStatus.RUNNING) throw new CaptainActionError("진행 중인 경매가 아닙니다.");
      if (!auction.currentTargetParticipantId || !auction.currentRoundEndAt) {
        throw new CaptainActionError("현재 경매 대상자가 없습니다.");
      }

      const now = new Date();
      if (auction.currentRoundEndAt.getTime() <= now.getTime()) {
        throw new CaptainActionError("경매 시간이 종료되어 입찰할 수 없습니다.");
      }

      const bidderTeam = auction.teams.find((team) => team.captainId === currentUser.id);
      if (!bidderTeam) throw new CaptainActionError("팀장만 입찰할 수 있습니다.");
      if (getTeamMemberCount(bidderTeam, auction.participants) >= auction.membersPerTeam) {
        throw new CaptainActionError("이미 팀 정원이 가득 찼습니다.");
      }

      const target = auction.participants.find(
        (participant) => participant.id === auction.currentTargetParticipantId,
      );
      if (!target) throw new CaptainActionError("현재 경매 대상자가 없습니다.");
      if (target.userId === currentUser.id || target.teamId === bidderTeam.id) {
        throw new CaptainActionError("자기 자신 또는 자기 팀 구성원에게 입찰할 수 없습니다.");
      }
      if (amount <= 0 || amount % 5 !== 0) throw new CaptainActionError("5의 배수만 입찰할 수 있습니다.");

      const currentBid = auction.currentBidId
        ? await tx.auctionBid.findUnique({ where: { id: auction.currentBidId } })
        : null;
      const currentAmount = currentBid?.amount ?? 0;

      if (currentBid?.bidderTeamId === bidderTeam.id) {
        throw new CaptainActionError("현재 최고 입찰 팀은 추가 입찰할 수 없습니다.");
      }
      if (amount <= currentAmount) throw new CaptainActionError("현재 입찰가보다 높아야 합니다.");
      if (amount > bidderTeam.pointsLeft) throw new CaptainActionError("포인트가 부족합니다.");

      const bid = await tx.auctionBid.create({
        data: {
          auctionId: auction.id,
          bidderTeamId: bidderTeam.id,
          bidderCaptainId: currentUser.id,
          targetParticipantId: target.id,
          amount,
        },
        select: { id: true },
      });

      const nextRoundEndAt = getCappedExtendedRoundEndAt({
        auctionSeconds: auction.auctionSeconds,
        currentRoundEndAt: auction.currentRoundEndAt,
        extendSeconds: auction.extendSeconds,
        now,
      });

      if (!nextRoundEndAt) {
        throw new CaptainActionError("경매 시간이 종료되어 입찰할 수 없습니다.");
      }

      await tx.auction.update({
        where: { id: auction.id },
        data: {
          currentBidId: bid.id,
          currentRoundEndAt: nextRoundEndAt,
        },
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-bid] Failed", error);
    return { error: "입찰에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: `${amount}P 입찰했습니다.` };
}

export async function finalizeRound(
  _previousState: AuctionActionState,
  formData: FormData,
): Promise<AuctionActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  const forceFinalize = stringValue(formData.get("forceFinalize")) === "true";

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: { teams: true, participants: true },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.ownerId !== currentUser.id) throw new CaptainActionError("방장만 라운드를 종료할 수 있습니다.");
      if (auction.status === AuctionStatus.FINISHED) {
        return { noop: true, reason: "AUCTION_ALREADY_FINISHED", success: "이미 종료된 경매입니다." };
      }
      if (auction.status !== AuctionStatus.RUNNING) throw new CaptainActionError("진행 중인 경매가 아닙니다.");
      if (!auction.currentTargetParticipantId) {
        return { noop: true, reason: "NO_CURRENT_TARGET", success: "처리할 라운드가 없습니다." };
      }
      if (!forceFinalize && auction.currentRoundEndAt && auction.currentRoundEndAt.getTime() > Date.now()) {
        return {
          error: "아직 라운드 시간이 종료되지 않았습니다.",
          reason: "ROUND_NOT_ENDED",
        };
      }

      const target = auction.participants.find(
        (participant) => participant.id === auction.currentTargetParticipantId,
      );
      if (!target) {
        return { noop: true, reason: "TARGET_NOT_FOUND", success: "처리할 라운드가 없습니다." };
      }
      if (target.status !== ParticipantStatus.BIDDING) {
        return { noop: true, reason: "ROUND_ALREADY_FINALIZED", success: "이미 처리된 라운드입니다." };
      }

      if (auction.currentBidId) {
        const bid = await tx.auctionBid.findUnique({ where: { id: auction.currentBidId } });
        if (!bid) throw new CaptainActionError("최고 입찰 정보를 찾을 수 없습니다.");

        const soldUpdate = await tx.auctionParticipant.updateMany({
          where: { id: target.id, status: ParticipantStatus.BIDDING },
          data: {
            status: ParticipantStatus.SOLD,
            teamId: bid.bidderTeamId,
            soldPrice: bid.amount,
          },
        });
        if (soldUpdate.count === 0) {
          return { noop: true, reason: "ROUND_ALREADY_FINALIZED", success: "이미 처리된 라운드입니다." };
        }
        await tx.auctionTeam.update({
          where: { id: bid.bidderTeamId },
          data: { pointsLeft: { decrement: bid.amount } },
        });
      } else {
        const retryAuctionOrder = getNextRetryAuctionOrder(auction.participants);
        const unsoldUpdate = await tx.auctionParticipant.updateMany({
          where: { id: target.id, status: ParticipantStatus.BIDDING },
          data: {
            auctionOrder: retryAuctionOrder,
            status: ParticipantStatus.UNSOLD,
            teamId: null,
            soldPrice: null,
          },
        });
        if (unsoldUpdate.count === 0) {
          return { noop: true, reason: "ROUND_ALREADY_FINALIZED", success: "이미 처리된 라운드입니다." };
        }
      }

      const autoAssignResult = await autoAssignRemainingParticipants(tx, {
        auctionId: auction.id,
        membersPerTeam: auction.membersPerTeam,
      });

      if (autoAssignResult.finished) {
        await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: AuctionStatus.FINISHED,
            currentTargetParticipantId: null,
            currentBidId: null,
            currentRoundEndAt: null,
          },
        });
        return { success: "라운드를 종료했습니다." };
      }

      const nextTarget = autoAssignResult.nextTarget;

      if (nextTarget) {
        await tx.auctionParticipant.update({
          where: { id: nextTarget.id },
          data: { status: ParticipantStatus.BIDDING },
        });
        await tx.auction.update({
          where: { id: auction.id },
          data: {
            currentTargetParticipantId: nextTarget.id,
            currentBidId: null,
            currentRoundEndAt: new Date(Date.now() + auction.auctionSeconds * 1000),
          },
        });
      } else {
        await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: AuctionStatus.FINISHED,
            currentTargetParticipantId: null,
            currentBidId: null,
            currentRoundEndAt: null,
          },
        });
      }

      return { success: "라운드를 종료했습니다." };
    });

    revalidatePath(`/auctions/${auctionCode}`);
    return result;
  } catch (error) {
    const debugContext = await getFinalizeDebugContext(auctionId, currentUser.id);

    if (error instanceof CaptainActionError) {
      console.error("[auction-finalize] Failed", {
        reason: error.message,
        auctionId,
        auctionCode,
        currentTargetParticipantId: debugContext.currentTargetParticipantId,
        currentRoundEndAt: debugContext.currentRoundEndAt,
        now: new Date().toISOString(),
        isOwner: debugContext.isOwner,
      });
      return { error: error.message, reason: "VALIDATION_ERROR" };
    }
    console.error("[auction-finalize] Failed", {
      reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      auctionId,
      auctionCode,
      currentTargetParticipantId: debugContext.currentTargetParticipantId,
      currentRoundEndAt: debugContext.currentRoundEndAt,
      now: new Date().toISOString(),
      isOwner: debugContext.isOwner,
      error,
    });
    return { error: "라운드 종료 처리 실패" };
  }
}

async function autoAssignRemainingParticipants(
  tx: Prisma.TransactionClient,
  {
    auctionId,
    membersPerTeam,
  }: {
    auctionId: string;
    membersPerTeam: number;
  },
) {
  const [teams, participants] = await Promise.all([
    tx.auctionTeam.findMany({ where: { auctionId } }),
    tx.auctionParticipant.findMany({ where: { auctionId }, orderBy: [{ auctionOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const openTeams = teams.filter((team) => getRemainingTeamSlots(team, participants, membersPerTeam) > 0);
  const assignableParticipants = participants.filter(
    (participant) =>
      isAssignableParticipantStatus(participant.status) &&
      !teams.some((team) => team.captainId === participant.userId),
  );

  if (assignableParticipants.length === 0 || openTeams.length === 0) {
    return { finished: true, nextTarget: null };
  }

  if (openTeams.length === 1) {
    const targetTeam = openTeams[0];
    const remainingSlots = getRemainingTeamSlots(targetTeam, participants, membersPerTeam);
    const participantsToAssign = assignableParticipants.slice(0, remainingSlots);

    if (participantsToAssign.length > 0) {
      await tx.auctionParticipant.updateMany({
        where: { id: { in: participantsToAssign.map((participant) => participant.id) } },
        data: {
          status: ParticipantStatus.SOLD,
          teamId: targetTeam.id,
          soldPrice: 0,
        },
      });
    }

    return { finished: true, nextTarget: null };
  }

  const nextTarget =
    assignableParticipants.find((participant) => participant.status === ParticipantStatus.WAITING) ??
    assignableParticipants.find((participant) => participant.status === ParticipantStatus.UNSOLD) ??
    null;

  return {
    finished: !nextTarget,
    nextTarget,
  };
}

function getNextRetryAuctionOrder(participants: AuctionParticipantSnapshot[]) {
  const maxAuctionOrder = participants.reduce(
    (maxOrder, participant) => Math.max(maxOrder, participant.auctionOrder ?? 0),
    0,
  );

  return maxAuctionOrder + 1;
}

function isAssignableParticipantStatus(status: ParticipantStatus) {
  return (
    status === ParticipantStatus.WAITING ||
    status === ParticipantStatus.BIDDING ||
    status === ParticipantStatus.UNSOLD
  );
}

function getTeamMemberCount(team: AuctionTeamSnapshot, participants: AuctionParticipantSnapshot[]) {
  const captainCount = team.captainId ? 1 : 0;
  const soldMemberCount = participants.filter(
    (participant) => participant.teamId === team.id && participant.status === ParticipantStatus.SOLD,
  ).length;

  return captainCount + soldMemberCount;
}

function getRemainingTeamSlots(
  team: AuctionTeamSnapshot,
  participants: AuctionParticipantSnapshot[],
  membersPerTeam: number,
) {
  return Math.max(0, membersPerTeam - getTeamMemberCount(team, participants));
}

export async function updateTeamCaptain(
  _previousState: CaptainActionState,
  formData: FormData,
): Promise<CaptainActionState> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
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
    return { error: "온보딩이 완료되지 않은 사용자입니다." };
  }

  const intent = stringValue(formData.get("intent"));
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  const teamId = stringValue(formData.get("teamId"));
  const captainUserId = stringValue(formData.get("captainUserId"));

  if (!auctionId || !auctionCode || !teamId) {
    return { error: "팀장 설정에 필요한 정보가 부족합니다." };
  }

  if (intent === "set" && !captainUserId) {
    return { error: "팀장으로 지정할 참가자를 선택해주세요." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: {
          id: auctionId,
        },
        include: {
          teams: true,
          participants: true,
        },
      });

      if (!auction) {
        throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      }

      if (auction.ownerId !== currentUser.id) {
        throw new CaptainActionError("방장만 팀장을 설정할 수 있습니다.");
      }

      if (!editableAuctionStatuses.has(auction.status)) {
        throw new CaptainActionError("경매 진행 중이거나 종료된 경매는 팀장 변경이 불가합니다.");
      }

      const team = auction.teams.find((auctionTeam) => auctionTeam.id === teamId);

      if (!team) {
        throw new CaptainActionError("경매에 속한 팀을 찾을 수 없습니다.");
      }

      const previousCaptainId = team.captainId;

      if (intent === "unset") {
        await tx.auctionTeam.update({
          where: {
            id: team.id,
          },
          data: {
            captainId: null,
          },
        });

        if (previousCaptainId) {
          await tx.auctionParticipant.updateMany({
            where: {
              auctionId,
              userId: previousCaptainId,
              status: ParticipantStatus.CAPTAIN,
            },
            data: {
              status: ParticipantStatus.WAITING,
            },
          });
        }

        return;
      }

      const participant = auction.participants.find(
        (auctionParticipant) => auctionParticipant.userId === captainUserId,
      );

      if (!participant) {
        throw new CaptainActionError("해당 경매의 참가자가 아닌 사용자입니다.");
      }

      const alreadyCaptainTeam = auction.teams.find(
        (auctionTeam) => auctionTeam.captainId === captainUserId && auctionTeam.id !== team.id,
      );

      if (alreadyCaptainTeam) {
        throw new CaptainActionError("이미 다른 팀의 팀장으로 선택된 사용자입니다.");
      }

      await tx.auctionTeam.update({
        where: {
          id: team.id,
        },
        data: {
          captainId: captainUserId,
        },
      });

      if (previousCaptainId && previousCaptainId !== captainUserId) {
        await tx.auctionParticipant.updateMany({
          where: {
            auctionId,
            userId: previousCaptainId,
            status: ParticipantStatus.CAPTAIN,
          },
          data: {
            status: ParticipantStatus.WAITING,
          },
        });
      }

      await tx.auctionParticipant.update({
        where: {
          id: participant.id,
        },
        data: {
          status: ParticipantStatus.CAPTAIN,
        },
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) {
      return { error: error.message };
    }

    console.error("[team-captain] Failed to update captain", error);
    return { error: "팀장 설정 실패" };
  }

  revalidatePath(`/auctions/${auctionCode}`);

  return {
    success: intent === "unset" ? "팀장을 해제했습니다." : "팀장을 설정했습니다.",
  };
}

export async function updateTeamPoints(
  _previousState: CaptainActionState,
  formData: FormData,
): Promise<CaptainActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  const teamId = stringValue(formData.get("teamId"));
  const pointsLeft = numberValue(formData.get("pointsLeft"));

  if (!currentUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  if (!auctionId || !auctionCode || !teamId) {
    return { error: "포인트 수정에 필요한 정보가 부족합니다." };
  }

  if (!Number.isInteger(pointsLeft) || pointsLeft < 0) {
    return { error: "포인트는 0 이상이어야 합니다." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: { teams: true },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.ownerId !== currentUser.id) {
        throw new CaptainActionError("방장만 포인트를 수정할 수 있습니다.");
      }
      if (!editableAuctionStatuses.has(auction.status)) {
        throw new CaptainActionError("경매 시작 후에는 포인트를 수정할 수 없습니다.");
      }
      if (!auction.teams.some((team) => team.id === teamId)) {
        throw new CaptainActionError("경매에 속한 팀을 찾을 수 없습니다.");
      }

      await tx.auctionTeam.update({
        where: { id: teamId },
        data: { pointsLeft },
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[team-points] Failed to update points", error);
    return { error: "포인트 수정에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "팀 포인트를 수정했습니다." };
}

export async function sendChatMessage(
  _previousState: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const message = stringValue(formData.get("message"));
  const type = stringValue(formData.get("type"));

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  if (!message) return { error: "메시지를 입력해주세요." };
  if (message.length > 500) return { error: "메시지는 500자 이하로 입력해주세요." };
  if (type !== ChatType.GLOBAL && type !== ChatType.TEAM) return { error: "지원하지 않는 채팅 타입입니다." };

  try {
    const createdMessage = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: { teams: true, participants: true },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (!canAccessAuction(auction, currentUser.id)) {
        throw new CaptainActionError("채팅 권한이 없습니다.");
      }

      const teamId = getUserTeamId(auction.teams, auction.participants, currentUser.id);

      if (type === ChatType.TEAM && !teamId) {
        throw new CaptainActionError("팀에 속한 사용자만 팀 채팅을 사용할 수 있습니다.");
      }

      const chatMessage = await tx.chatMessage.create({
        data: {
          auctionId: auction.id,
          senderId: currentUser.id,
          teamId: type === ChatType.TEAM ? teamId : null,
          type,
          message,
        },
        include: { sender: true },
      });

      return toChatMessagePayload(chatMessage);
    });

    return { message: createdMessage, success: "메시지를 보냈습니다." };
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-chat] Failed to send message", error);
    return { error: "메시지 전송에 실패했습니다." };
  }
}

export async function getChatMessageForAuction(
  auctionId: string,
  messageId: string,
): Promise<ChatActionState> {
  const currentUser = await getCurrentUser();

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  try {
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: { teams: true, participants: true },
    });

    if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
    if (!canAccessAuction(auction, currentUser.id)) {
      throw new CaptainActionError("채팅 권한이 없습니다.");
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { sender: true },
    });

    if (!message || message.auctionId !== auction.id) {
      throw new CaptainActionError("메시지를 찾을 수 없습니다.");
    }

    const teamId = getUserTeamId(auction.teams, auction.participants, currentUser.id);

    if (message.type === ChatType.TEAM && message.teamId !== teamId) {
      throw new CaptainActionError("팀 채팅 메시지를 볼 수 없습니다.");
    }

    return { message: toChatMessagePayload(message), success: "메시지를 불러왔습니다." };
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-chat] Failed to load realtime message", error);
    return { error: "메시지를 불러오지 못했습니다." };
  }
}

export async function recordAuctionRoomEntry(formData: FormData): Promise<ChatActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  try {
    const createdMessage = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: { teams: true, participants: true },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (!canAccessAuction(auction, currentUser.id)) {
        throw new CaptainActionError("채팅 권한이 없습니다.");
      }

      const user = await tx.user.findUnique({
        where: { id: currentUser.id },
        select: { nickname: true },
      });
      const entryMessage = `${user?.nickname ?? "사용자"}님이 입장하셨습니다.`;
      const recentEntryMessage = await tx.chatMessage.findFirst({
        where: {
          auctionId: auction.id,
          senderId: currentUser.id,
          type: ChatType.GLOBAL,
          message: entryMessage,
          createdAt: {
            gte: new Date(Date.now() - 60 * 1000),
          },
        },
        orderBy: { createdAt: "desc" },
        include: { sender: true },
      });

      if (recentEntryMessage) return toChatMessagePayload(recentEntryMessage);

      const chatMessage = await tx.chatMessage.create({
        data: {
          auctionId: auction.id,
          senderId: currentUser.id,
          teamId: null,
          type: ChatType.GLOBAL,
          message: entryMessage,
        },
        include: { sender: true },
      });

      return toChatMessagePayload(chatMessage);
    });

    revalidatePath(`/auctions/${auctionCode}`);
    return { message: createdMessage, success: "입장 메시지를 기록했습니다." };
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-chat-entry] Failed to record entry", error);
    return { error: "입장 메시지 기록에 실패했습니다." };
  }
}

export async function recordAuctionPresence(auctionId: string): Promise<AuctionActionState> {
  const currentUser = await getCurrentUser();

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  try {
    const participant = await prisma.auctionParticipant.findUnique({
      where: {
        auctionId_userId: {
          auctionId,
          userId: currentUser.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!participant) return { noop: true, success: "참가자가 아닌 사용자는 입장 상태를 기록하지 않습니다." };

    await prisma.auctionParticipant.update({
      where: {
        id: participant.id,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });

    return { success: "입장 상태를 갱신했습니다." };
  } catch (error) {
    console.error("[auction-presence] Failed to record presence", error);
    return { error: "입장 상태 갱신에 실패했습니다." };
  }
}

class CaptainActionError extends Error {}

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

async function getFinalizeDebugContext(auctionId: string, currentUserId: string) {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        ownerId: true,
        currentTargetParticipantId: true,
        currentRoundEndAt: true,
      },
    });

    return {
      currentTargetParticipantId: auction?.currentTargetParticipantId ?? null,
      currentRoundEndAt: auction?.currentRoundEndAt?.toISOString() ?? null,
      isOwner: auction ? auction.ownerId === currentUserId : false,
    };
  } catch (error) {
    console.error("[auction-finalize] Failed to load debug context", error);
    return {
      currentTargetParticipantId: null,
      currentRoundEndAt: null,
      isOwner: null,
    };
  }
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: FormDataEntryValue | null) {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCappedExtendedRoundEndAt({
  auctionSeconds,
  currentRoundEndAt,
  extendSeconds,
  now,
}: {
  auctionSeconds: number;
  currentRoundEndAt: Date;
  extendSeconds: number;
  now: Date;
}) {
  const currentRemainingMs = currentRoundEndAt.getTime() - now.getTime();
  if (currentRemainingMs <= 0) return null;

  const extendMs = Math.max(0, extendSeconds) * 1000;
  const extendedRemainingMs = currentRemainingMs + extendMs;
  const maxMs = auctionSeconds > 0 ? auctionSeconds * 1000 : extendedRemainingMs;
  const nextRemainingMs = Math.min(extendedRemainingMs, maxMs);

  return new Date(now.getTime() + nextRemainingMs);
}

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
  }

  return shuffled;
}

function canAccessAuction(
  auction: {
    ownerId: string;
    participants: Array<{ userId: string }>;
  },
  userId: string,
) {
  return auction.ownerId === userId || auction.participants.some((participant) => participant.userId === userId);
}

function getMissingPresentCaptains({
  now,
  participants,
  teams,
}: {
  now: Date;
  participants: Array<{ lastSeenAt?: Date | null; userId: string }>;
  teams: Array<{ captain?: { nickname: string } | null; captainId: string | null; name: string }>;
}) {
  return teams.flatMap((team) => {
    if (!team.captainId) return [team.name];

    const captainParticipant = participants.find((participant) => participant.userId === team.captainId);
    const isPresent =
      captainParticipant?.lastSeenAt &&
      now.getTime() - captainParticipant.lastSeenAt.getTime() <= CAPTAIN_PRESENCE_WINDOW_MS;

    return isPresent ? [] : [team.captain ? `${team.captain.nickname} 팀` : team.name];
  });
}

function getUserTeamId(
  teams: Array<{ captainId: string | null; id: string }>,
  participants: Array<{ status: ParticipantStatus; teamId: string | null; userId: string }>,
  userId: string,
) {
  const captainTeam = teams.find((team) => team.captainId === userId);
  if (captainTeam) return captainTeam.id;

  const soldParticipant = participants.find(
    (participant) => participant.userId === userId && participant.status === ParticipantStatus.SOLD && participant.teamId,
  );

  return soldParticipant?.teamId ?? null;
}

function toChatMessagePayload(message: {
  auctionId: string;
  createdAt: Date;
  id: string;
  message: string;
  sender: {
    customProfileImageUrl: string | null;
    discordAvatarUrl: string | null;
    id: string;
    nickname: string;
  };
  senderId: string;
  teamId: string | null;
  type: ChatType;
}): ChatMessagePayload {
  return {
    auctionId: message.auctionId,
    createdAt: message.createdAt.toISOString(),
    id: message.id,
    message: message.message,
    sender: {
      id: message.sender.id,
      imageUrl: message.sender.customProfileImageUrl ?? message.sender.discordAvatarUrl,
      nickname: message.sender.nickname,
    },
    senderId: message.senderId,
    teamId: message.teamId,
    type: message.type,
  };
}

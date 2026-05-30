"use server";

import { revalidatePath } from "next/cache";
import { AuctionStatus, ChatType, ParticipantStatus } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { errorToLogMetadata, logAppError } from "@/lib/logging/app-log";
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
const ACTIVE_CAPTAIN_WINDOW_MS = 45 * 1000;
const BID_GRACE_PERIOD_MS = 2000;
const PAUSE_REASON_INACTIVE_CAPTAINS = "INACTIVE_CAPTAINS";
const PAUSE_REASON_MANUAL = "MANUAL";

type AuctionRoundSnapshotPayload = {
  auction: {
    currentBidId: string | null;
    currentRoundEndAt: string | null;
    currentTargetParticipantId: string | null;
    lastActivityAt: string | null;
    pausedAt: string | null;
    pausedRemainingMs: number | null;
    pauseReason: string | null;
    status: AuctionStatus;
  };
  participants: Array<{
    auctionOrder: number | null;
    id: string;
    soldPrice: number | null;
    status: ParticipantStatus;
    teamId: string | null;
  }>;
  teams: Array<{
    captainId: string | null;
    id: string;
    pointsLeft: number;
  }>;
};

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

      const updatedAuction = await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: AuctionStatus.RUNNING,
          currentTargetParticipantId: target.id,
          currentBidId: null,
          currentRoundEndAt: new Date(Date.now() + auction.auctionSeconds * 1000),
          lastActivityAt: new Date(),
          pausedAt: null,
          pausedRemainingMs: null,
          pauseReason: null,
        },
      });
      await createRoundSnapshot(tx, updatedAuction.id, target.id);
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-start] Failed", error);
    await logAppError({
      auctionId,
      message: "Failed to start auction",
      metadata: {
        error: errorToLogMetadata(error),
      },
      scope: "auction-start",
      userId: currentUser.id,
    });
    return { error: "경매 시작 실패" };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "경매를 시작했습니다." };
}

export async function resumeAuction(
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
      if (auction.ownerId !== currentUser.id) throw new CaptainActionError("방장만 경매를 재개할 수 있습니다.");
      if (auction.status !== AuctionStatus.PAUSED) throw new CaptainActionError("일시중지된 경매가 아닙니다.");
      if (!auction.currentTargetParticipantId) throw new CaptainActionError("현재 경매 대상자가 없습니다.");

      const now = new Date();
      const captainPresence = getActiveCaptainPresence({
        now,
        participants: auction.participants,
        teams: auction.teams,
      });

      console.log("[auction-presence] active captains checked", {
        activeCaptainCount: captainPresence.activeCaptainCount,
        auctionId: auction.id,
        requiredActiveCaptainCount: captainPresence.requiredActiveCaptainCount,
      });

      if (!captainPresence.canRunAuction) {
        throw new CaptainActionError("입찰 가능한 팀장이 부족해 경매를 재개할 수 없습니다.");
      }

      const remainingMs = Math.max(
        auction.pausedRemainingMs ?? auction.auctionSeconds * 1000,
        1000,
      );
      const updatedAuction = await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: AuctionStatus.RUNNING,
          currentRoundEndAt: new Date(now.getTime() + remainingMs),
          lastActivityAt: now,
          pausedAt: null,
          pausedRemainingMs: null,
          pauseReason: null,
        },
      });

      console.log("[auction-pause] manual resume requested", {
        auctionId: auction.id,
        userId: currentUser.id,
      });
      console.log("[auction-pause] auction resumed", {
        auctionId: updatedAuction.id,
        currentRoundEndAt: updatedAuction.currentRoundEndAt?.toISOString() ?? null,
        remainingMs,
        status: updatedAuction.status,
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-pause] Failed to resume auction", error);
    await logAppError({
      auctionId,
      message: "Failed to resume auction",
      metadata: {
        error: errorToLogMetadata(error),
      },
      scope: "auction-pause",
      userId: currentUser.id,
    });
    return { error: "경매 재개에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "경매를 재개했습니다." };
}

export async function pauseAuction(
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
      console.log("[auction-pause] manual pause requested", {
        auctionId,
        userId: currentUser.id,
      });

      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.ownerId !== currentUser.id) throw new CaptainActionError("방장만 경매를 일시정지할 수 있습니다.");
      if (auction.status !== AuctionStatus.RUNNING) throw new CaptainActionError("진행 중인 경매만 일시정지할 수 있습니다.");
      if (!auction.currentTargetParticipantId) throw new CaptainActionError("현재 경매 대상자가 없습니다.");

      const now = new Date();
      const pausedRemainingMs = Math.max(
        auction.currentRoundEndAt ? auction.currentRoundEndAt.getTime() - now.getTime() : 0,
        0,
      );
      const updatedAuction = await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: AuctionStatus.PAUSED,
          currentRoundEndAt: null,
          pausedAt: now,
          pausedRemainingMs,
          pauseReason: PAUSE_REASON_MANUAL,
          lastActivityAt: now,
        },
      });

      console.log("[auction-pause] auction paused", {
        auctionId: updatedAuction.id,
        pauseReason: updatedAuction.pauseReason,
        pausedRemainingMs: updatedAuction.pausedRemainingMs,
        status: updatedAuction.status,
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-pause] Failed to pause auction", error);
    await logAppError({
      auctionId,
      message: "Failed to pause auction",
      metadata: {
        error: errorToLogMetadata(error),
      },
      scope: "auction-pause",
      userId: currentUser.id,
    });
    return { error: "경매 일시정지에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "경매를 일시정지했습니다." };
}

export async function placeBid(
  _previousState: AuctionActionState,
  formData: FormData,
): Promise<AuctionActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  const submittedTargetParticipantId = stringValue(formData.get("targetParticipantId"));
  const amount = numberValue(formData.get("bidAmount"));
  let bidDeniedMetadata: Record<string, unknown> | null = null;

  function denyBid(message: string, metadata: Record<string, unknown>): never {
    bidDeniedMetadata = {
      amount,
      auctionCode,
      gracePeriodMs: BID_GRACE_PERIOD_MS,
      submittedTargetParticipantId,
      ...metadata,
    };
    throw new CaptainActionError(message);
  }

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: { teams: true, participants: true },
      });

      if (!auction) {
        denyBid("경매방을 찾을 수 없습니다.", {
          auctionStatus: null,
          currentBidTeamId: null,
          currentTargetParticipantId: null,
          currentUserTeamId: null,
          reason: "AUCTION_NOT_FOUND",
          remainingMs: null,
        });
      }

      const bidderTeam = auction.teams.find((team) => team.captainId === currentUser.id) ?? null;
      const currentBid = auction.currentBidId
        ? await tx.auctionBid.findUnique({ where: { id: auction.currentBidId } })
        : null;
      const currentBidTeamId = currentBid?.bidderTeamId ?? null;
      const baseDeniedMetadata = {
        auctionStatus: auction.status,
        currentBidTeamId,
        currentTargetParticipantId: auction.currentTargetParticipantId,
        currentUserTeamId: bidderTeam?.id ?? null,
        remainingMs: auction.currentRoundEndAt ? auction.currentRoundEndAt.getTime() - Date.now() : null,
      };

      if (auction.status === AuctionStatus.PAUSED) {
        denyBid("경매가 일시정지되어 입찰할 수 없습니다.", {
          ...baseDeniedMetadata,
          reason: "AUCTION_PAUSED",
        });
      }

      if (auction.status !== AuctionStatus.RUNNING) {
        denyBid("진행 중인 경매가 아닙니다.", {
          ...baseDeniedMetadata,
          reason: "AUCTION_NOT_RUNNING",
        });
      }
      if (!auction.currentTargetParticipantId || !auction.currentRoundEndAt) {
        denyBid("현재 경매 대상자가 없습니다.", {
          ...baseDeniedMetadata,
          reason: "NO_CURRENT_TARGET",
        });
      }
      if (!submittedTargetParticipantId || submittedTargetParticipantId !== auction.currentTargetParticipantId) {
        denyBid("경매 대상이 변경되었습니다. 화면을 새로고침한 뒤 다시 시도해주세요.", {
          ...baseDeniedMetadata,
          reason: "TARGET_PARTICIPANT_MISMATCH",
        });
      }

      const now = new Date();
      const bidDeadline = new Date(auction.currentRoundEndAt.getTime() + BID_GRACE_PERIOD_MS);
      const remainingMs = auction.currentRoundEndAt.getTime() - now.getTime();
      const withinGracePeriod = now.getTime() <= bidDeadline.getTime();
      console.log("[auction-bid] grace period check", {
        bidDeadline: bidDeadline.toISOString(),
        currentRoundEndAt: auction.currentRoundEndAt.toISOString(),
        now: now.toISOString(),
        withinGracePeriod,
      });

      if (!withinGracePeriod) {
        denyBid("경매 시간이 종료되어 입찰할 수 없습니다.", {
          ...baseDeniedMetadata,
          reason: "BID_GRACE_PERIOD_EXPIRED",
          remainingMs,
        });
      }

      if (!bidderTeam) {
        denyBid("팀장만 입찰할 수 있습니다.", {
          ...baseDeniedMetadata,
          reason: "NOT_CAPTAIN",
        });
      }
      if (getTeamMemberCount(bidderTeam, auction.participants) >= auction.membersPerTeam) {
        denyBid("이미 팀 정원이 가득 찼습니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "TEAM_FULL",
        });
      }

      const target = auction.participants.find(
        (participant) => participant.id === auction.currentTargetParticipantId,
      );
      if (!target) {
        denyBid("현재 경매 대상자가 없습니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "TARGET_PARTICIPANT_NOT_FOUND",
        });
      }
      if (target.userId === currentUser.id || target.teamId === bidderTeam.id) {
        denyBid("자기 자신 또는 자기 팀 구성원에게 입찰할 수 없습니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "OWN_TARGET",
        });
      }
      if (amount <= 0 || amount % 5 !== 0) {
        denyBid("5의 배수만 입찰할 수 있습니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "INVALID_BID_AMOUNT",
        });
      }
      const currentAmount = currentBid?.amount ?? 0;

      if (currentBid?.bidderTeamId === bidderTeam.id) {
        denyBid("현재 최고 입찰 팀은 추가 입찰할 수 없습니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "CURRENT_HIGHEST_BIDDER_TEAM",
        });
      }
      if (amount <= currentAmount) {
        denyBid("현재 입찰가보다 높아야 합니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "BID_NOT_HIGHER_THAN_CURRENT",
        });
      }
      if (amount > bidderTeam.pointsLeft) {
        denyBid("포인트가 부족합니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "INSUFFICIENT_POINTS",
        });
      }

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
      console.log("[auction-bid] created bid", {
        amount,
        auctionId: auction.id,
        bidId: bid.id,
        bidderId: currentUser.id,
        teamId: bidderTeam.id,
        targetParticipantId: target.id,
      });

      const nextRoundEndAt = getCappedExtendedRoundEndAt({
        auctionSeconds: auction.auctionSeconds,
        currentRoundEndAt: auction.currentRoundEndAt,
        extendSeconds: auction.extendSeconds,
        gracePeriodMs: BID_GRACE_PERIOD_MS,
        now,
      });

      if (!nextRoundEndAt) {
        denyBid("경매 시간이 종료되어 입찰할 수 없습니다.", {
          ...baseDeniedMetadata,
          currentUserTeamId: bidderTeam.id,
          reason: "BID_EXTENSION_DENIED_AFTER_GRACE",
          remainingMs,
        });
      }

      await tx.auction.update({
        where: { id: auction.id },
        data: {
          currentBidId: bid.id,
          currentRoundEndAt: nextRoundEndAt,
          lastActivityAt: now,
        },
      });
      console.log("[auction-bid] updated auction", {
        auctionId: auction.id,
        currentBid: bid.id,
        currentBidTeamId: bidderTeam.id,
        currentRoundEndAt: nextRoundEndAt.toISOString(),
        currentTargetParticipantId: target.id,
      });
      console.log("[auction-bid] team points unchanged on bid", {
        auctionId: auction.id,
        pointsLeft: bidderTeam.pointsLeft,
        teamId: bidderTeam.id,
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) {
      await logAppError({
        auctionId,
        level: "WARN",
        message: "Bid denied",
        metadata: bidDeniedMetadata ?? {
          amount,
          auctionCode,
          gracePeriodMs: BID_GRACE_PERIOD_MS,
          reason: error.message,
          submittedTargetParticipantId,
        },
        scope: "auction-bid-denied",
        userId: currentUser.id,
      });
      return { error: error.message };
    }
    console.error("[auction-bid] Failed", error);
    await logAppError({
      auctionId,
      message: "Failed to place auction bid",
      metadata: {
        amount,
        error: errorToLogMetadata(error),
      },
      scope: "auction-bid",
      userId: currentUser.id,
    });
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
        console.log("[auction-finalize] updated participant", {
          auctionId: auction.id,
          participantId: target.id,
          status: ParticipantStatus.SOLD,
          teamId: bid.bidderTeamId,
        });
        await recordAuctionSoldStats(tx, {
          auctionId: auction.id,
          participantId: target.id,
          soldPrice: bid.amount,
          teamId: bid.bidderTeamId,
          userId: target.userId,
        });

        const updatedTeam = await tx.auctionTeam.update({
          where: { id: bid.bidderTeamId },
          data: { pointsLeft: { decrement: bid.amount } },
        });
        console.log("[auction-finalize] updated team", {
          auctionId: auction.id,
          pointsLeft: updatedTeam.pointsLeft,
          teamId: updatedTeam.id,
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
        console.log("[auction-finalize] updated participant", {
          auctionId: auction.id,
          auctionOrder: retryAuctionOrder,
          participantId: target.id,
          status: ParticipantStatus.UNSOLD,
        });
      }

      const autoAssignResult = await autoAssignRemainingParticipants(tx, {
        auctionId: auction.id,
        membersPerTeam: auction.membersPerTeam,
      });

      if (autoAssignResult.finished) {
        const updatedAuction = await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: AuctionStatus.FINISHED,
            currentTargetParticipantId: null,
            currentBidId: null,
            currentRoundEndAt: null,
            lastActivityAt: new Date(),
            pausedAt: null,
            pausedRemainingMs: null,
            pauseReason: null,
          },
        });
        console.log("[auction-finalize] updated auction", {
          auctionId: updatedAuction.id,
          currentBidId: updatedAuction.currentBidId,
          currentRoundEndAt: updatedAuction.currentRoundEndAt?.toISOString() ?? null,
          currentTargetParticipantId: updatedAuction.currentTargetParticipantId,
          status: updatedAuction.status,
        });
        return { success: "라운드를 종료했습니다." };
      }

      const nextTarget = autoAssignResult.nextTarget;

      if (nextTarget) {
        const updatedNextTarget = await tx.auctionParticipant.update({
          where: { id: nextTarget.id },
          data: { status: ParticipantStatus.BIDDING },
        });
        console.log("[auction-finalize] updated participant", {
          auctionId: auction.id,
          participantId: updatedNextTarget.id,
          status: updatedNextTarget.status,
        });

        const updatedAuction = await tx.auction.update({
          where: { id: auction.id },
          data: {
            currentTargetParticipantId: nextTarget.id,
            currentBidId: null,
            currentRoundEndAt: new Date(Date.now() + auction.auctionSeconds * 1000),
            lastActivityAt: new Date(),
            pausedAt: null,
            pausedRemainingMs: null,
            pauseReason: null,
          },
        });
        await createRoundSnapshot(tx, updatedAuction.id, nextTarget.id);
        console.log("[auction-finalize] updated auction", {
          auctionId: updatedAuction.id,
          currentBidId: updatedAuction.currentBidId,
          currentRoundEndAt: updatedAuction.currentRoundEndAt?.toISOString() ?? null,
          currentTargetParticipantId: updatedAuction.currentTargetParticipantId,
          status: updatedAuction.status,
        });
      } else {
        const updatedAuction = await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: AuctionStatus.FINISHED,
            currentTargetParticipantId: null,
            currentBidId: null,
            currentRoundEndAt: null,
            lastActivityAt: new Date(),
            pausedAt: null,
            pausedRemainingMs: null,
            pauseReason: null,
          },
        });
        console.log("[auction-finalize] updated auction", {
          auctionId: updatedAuction.id,
          currentBidId: updatedAuction.currentBidId,
          currentRoundEndAt: updatedAuction.currentRoundEndAt?.toISOString() ?? null,
          currentTargetParticipantId: updatedAuction.currentTargetParticipantId,
          status: updatedAuction.status,
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
      await logAppError({
        auctionId,
        level: "WARN",
        message: "Auction finalize validation failed",
        metadata: {
          debugContext,
          error: errorToLogMetadata(error),
          forceFinalize,
        },
        scope: "auction-finalize",
        userId: currentUser.id,
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
    await logAppError({
      auctionId,
      message: "Failed to finalize auction round",
      metadata: {
        debugContext,
        error: errorToLogMetadata(error),
        forceFinalize,
      },
      scope: "auction-finalize",
      userId: currentUser.id,
    });
    return { error: "라운드 종료 처리 실패" };
  }
}

export async function rollbackPreviousRound(
  _previousState: AuctionActionState,
  formData: FormData,
): Promise<AuctionActionState> {
  const currentUser = await getCurrentUser();
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  try {
    await prisma.$transaction(async (tx) => {
      console.log("[auction-rollback] rollback requested", {
        auctionId,
        userId: currentUser.id,
      });

      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        select: {
          auctionSeconds: true,
          currentTargetParticipantId: true,
          id: true,
          ownerId: true,
          status: true,
        },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.ownerId !== currentUser.id) throw new CaptainActionError("방장만 이전 경매로 되돌릴 수 있습니다.");
      if (auction.status !== AuctionStatus.RUNNING && auction.status !== AuctionStatus.PAUSED) {
        throw new CaptainActionError("진행 중이거나 일시중지된 경매만 되돌릴 수 있습니다.");
      }

      const snapshots = await tx.auctionRoundSnapshot.findMany({
        where: { auctionId: auction.id },
        orderBy: { roundNumber: "desc" },
        take: 5,
      });
      const snapshotToRestore = snapshots.find(
        (snapshot) => snapshot.targetParticipantId !== auction.currentTargetParticipantId,
      );

      if (!snapshotToRestore) {
        throw new CaptainActionError("되돌릴 이전 경매 라운드가 없습니다.");
      }

      const snapshot = parseRoundSnapshot(snapshotToRestore.snapshot);
      const targetParticipantId = snapshot.auction.currentTargetParticipantId ?? snapshotToRestore.targetParticipantId;

      if (!targetParticipantId) {
        throw new CaptainActionError("스냅샷에 경매 대상 정보가 없습니다.");
      }

      const deletedSoldRecords = await tx.auctionSoldRecord.findMany({
        where: {
          auctionId: auction.id,
          createdAt: {
            gte: snapshotToRestore.createdAt,
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });
      const affectedUserIds = [...new Set(deletedSoldRecords.map((record) => record.userId))];

      await tx.auctionSoldRecord.deleteMany({
        where: {
          auctionId: auction.id,
          createdAt: {
            gte: snapshotToRestore.createdAt,
          },
        },
      });

      await tx.auctionBid.deleteMany({
        where: {
          auctionId: auction.id,
          createdAt: {
            gte: snapshotToRestore.createdAt,
          },
        },
      });

      await Promise.all(
        snapshot.teams.map((team) =>
          tx.auctionTeam.update({
            where: { id: team.id },
            data: {
              captainId: team.captainId,
              pointsLeft: team.pointsLeft,
            },
          }),
        ),
      );

      await Promise.all(
        snapshot.participants.map((participant) =>
          tx.auctionParticipant.update({
            where: { id: participant.id },
            data: {
              auctionOrder: participant.auctionOrder,
              soldPrice: participant.soldPrice,
              status: participant.status,
              teamId: participant.teamId,
            },
          }),
        ),
      );

      const now = new Date();
      const updatedAuction = await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: AuctionStatus.RUNNING,
          currentTargetParticipantId: targetParticipantId,
          currentBidId: null,
          currentRoundEndAt: new Date(now.getTime() + auction.auctionSeconds * 1000),
          pausedAt: null,
          pausedRemainingMs: null,
          pauseReason: null,
          lastActivityAt: now,
        },
      });

      await tx.auctionRoundSnapshot.deleteMany({
        where: {
          auctionId: auction.id,
          roundNumber: {
            gt: snapshotToRestore.roundNumber,
          },
        },
      });

      await Promise.all(
        affectedUserIds.map((userId) => recalculateUserAuctionStats(tx, userId)),
      );

      console.log("[auction-rollback] rollback applied", {
        auctionId: updatedAuction.id,
        currentRoundEndAt: updatedAuction.currentRoundEndAt?.toISOString() ?? null,
        deletedBidCutoff: snapshotToRestore.createdAt.toISOString(),
        deletedSoldRecordCount: deletedSoldRecords.length,
        restoredRoundNumber: snapshotToRestore.roundNumber,
        targetParticipantId,
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    console.error("[auction-rollback] Failed", error);
    await logAppError({
      auctionId,
      message: "Failed to rollback auction round",
      metadata: {
        error: errorToLogMetadata(error),
      },
      scope: "auction-rollback",
      userId: currentUser.id,
    });
    return { error: "이전 경매로 되돌리기에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "이전 경매 라운드로 되돌렸습니다." };
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
      console.log("[auction-finalize] updated participant", {
        auctionId,
        participantIds: participantsToAssign.map((participant) => participant.id),
        status: ParticipantStatus.SOLD,
        teamId: targetTeam.id,
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

async function createRoundSnapshot(
  tx: Prisma.TransactionClient,
  auctionId: string,
  targetParticipantId: string | null,
) {
  const auction = await tx.auction.findUnique({
    where: { id: auctionId },
    include: {
      participants: true,
      teams: true,
    },
  });

  if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");

  const lastSnapshot = await tx.auctionRoundSnapshot.findFirst({
    where: { auctionId },
    orderBy: { roundNumber: "desc" },
    select: { roundNumber: true },
  });
  const roundNumber = (lastSnapshot?.roundNumber ?? 0) + 1;
  const snapshot: AuctionRoundSnapshotPayload = {
    auction: {
      currentBidId: auction.currentBidId,
      currentRoundEndAt: auction.currentRoundEndAt?.toISOString() ?? null,
      currentTargetParticipantId: auction.currentTargetParticipantId,
      lastActivityAt: auction.lastActivityAt?.toISOString() ?? null,
      pausedAt: auction.pausedAt?.toISOString() ?? null,
      pausedRemainingMs: auction.pausedRemainingMs,
      pauseReason: auction.pauseReason,
      status: auction.status,
    },
    participants: auction.participants.map((participant) => ({
      auctionOrder: participant.auctionOrder,
      id: participant.id,
      soldPrice: participant.soldPrice,
      status: participant.status,
      teamId: participant.teamId,
    })),
    teams: auction.teams.map((team) => ({
      captainId: team.captainId,
      id: team.id,
      pointsLeft: team.pointsLeft,
    })),
  };

  const createdSnapshot = await tx.auctionRoundSnapshot.create({
    data: {
      auctionId,
      roundNumber,
      targetParticipantId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  console.log("[auction-rollback] snapshot created", {
    auctionId,
    roundNumber: createdSnapshot.roundNumber,
    snapshotId: createdSnapshot.id,
    targetParticipantId,
  });

  return createdSnapshot;
}

async function recordAuctionSoldStats(
  tx: Prisma.TransactionClient,
  {
    auctionId,
    participantId,
    soldPrice,
    teamId,
    userId,
  }: {
    auctionId: string;
    participantId: string;
    soldPrice: number;
    teamId: string;
    userId: string;
  },
) {
  const soldAt = new Date();

  try {
    await tx.auctionSoldRecord.create({
      data: {
        auctionId,
        participantId,
        soldAt,
        soldPrice,
        teamId,
        userId,
      },
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      console.log("[auction-stats] sold record already exists, skip stats update", {
        auctionId,
        participantId,
        userId,
      });
      await logAppError({
        auctionId,
        level: "WARN",
        message: "Sold record already exists, skip stats update",
        metadata: {
          error: errorToLogMetadata(error),
          participantId,
          soldPrice,
          teamId,
        },
        scope: "auction-stats",
        userId,
      });
      return;
    }

    await logAppError({
      auctionId,
      message: "Failed to create auction sold record",
      metadata: {
        error: errorToLogMetadata(error),
        participantId,
        soldPrice,
        teamId,
      },
      scope: "auction-stats",
      userId,
    });
    throw error;
  }

  console.log("[auction-stats] sold record created", {
    auctionId,
    participantId,
    soldPrice,
    teamId,
    userId,
  });

  const currentStats = await tx.userAuctionStats.findUnique({
    where: { userId },
  });

  if (!currentStats) {
    const createdStats = await tx.userAuctionStats.create({
      data: {
        averageSoldPrice: soldPrice,
        lastSoldAt: soldAt,
        lastSoldAuctionId: auctionId,
        lastSoldPrice: soldPrice,
        soldCount: 1,
        totalSoldPrice: soldPrice,
        userId,
      },
    });

    console.log("[auction-stats] user auction stats updated", {
      averageSoldPrice: createdStats.averageSoldPrice,
      lastSoldPrice: createdStats.lastSoldPrice,
      soldCount: createdStats.soldCount,
      totalSoldPrice: createdStats.totalSoldPrice,
      userId,
    });
    return;
  }

  const nextSoldCount = currentStats.soldCount + 1;
  const nextTotalSoldPrice = currentStats.totalSoldPrice + soldPrice;
  const nextAverageSoldPrice = nextTotalSoldPrice / nextSoldCount;
  const updatedStats = await tx.userAuctionStats.update({
    where: { userId },
    data: {
      averageSoldPrice: nextAverageSoldPrice,
      lastSoldAt: soldAt,
      lastSoldAuctionId: auctionId,
      lastSoldPrice: soldPrice,
      soldCount: nextSoldCount,
      totalSoldPrice: nextTotalSoldPrice,
    },
  });

  console.log("[auction-stats] user auction stats updated", {
    averageSoldPrice: updatedStats.averageSoldPrice,
    lastSoldPrice: updatedStats.lastSoldPrice,
    soldCount: updatedStats.soldCount,
    totalSoldPrice: updatedStats.totalSoldPrice,
    userId,
  });
}

async function recalculateUserAuctionStats(tx: Prisma.TransactionClient, userId: string) {
  const records = await tx.auctionSoldRecord.findMany({
    where: { userId },
    orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
  });
  const soldCount = records.length;
  const totalSoldPrice = records.reduce((total, record) => total + record.soldPrice, 0);
  const averageSoldPrice = soldCount > 0 ? totalSoldPrice / soldCount : 0;
  const latestRecord = records[0] ?? null;

  const updatedStats = await tx.userAuctionStats.upsert({
    where: { userId },
    create: {
      averageSoldPrice,
      lastSoldAt: latestRecord?.soldAt ?? null,
      lastSoldAuctionId: latestRecord?.auctionId ?? null,
      lastSoldPrice: latestRecord?.soldPrice ?? null,
      soldCount,
      totalSoldPrice,
      userId,
    },
    update: {
      averageSoldPrice,
      lastSoldAt: latestRecord?.soldAt ?? null,
      lastSoldAuctionId: latestRecord?.auctionId ?? null,
      lastSoldPrice: latestRecord?.soldPrice ?? null,
      soldCount,
      totalSoldPrice,
    },
  });

  console.log("[auction-rollback] stats recalculated", {
    averageSoldPrice: updatedStats.averageSoldPrice,
    lastSoldPrice: updatedStats.lastSoldPrice,
    soldCount: updatedStats.soldCount,
    totalSoldPrice: updatedStats.totalSoldPrice,
    userId,
  });
}

function parseRoundSnapshot(snapshot: Prisma.JsonValue) {
  return snapshot as unknown as AuctionRoundSnapshotPayload;
}

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
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

export async function addAuctionParticipantBeforeStart({
  auctionCode,
  auctionId,
  nickname,
}: {
  auctionCode: string;
  auctionId: string;
  nickname: string;
}): Promise<CaptainActionState> {
  const currentUser = await getCurrentUser();
  const normalizedNickname = nickname.trim();

  if (!currentUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  if (!auctionId || !auctionCode) {
    return { error: "참가자 추가에 필요한 정보가 부족합니다." };
  }

  if (!normalizedNickname) {
    return { error: "추가할 참가자 닉네임을 입력해주세요." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: {
          participants: true,
        },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.ownerId !== currentUser.id) {
        throw new CaptainActionError("방장만 참가자를 추가할 수 있습니다.");
      }
      if (!editableAuctionStatuses.has(auction.status)) {
        throw new CaptainActionError("경매 시작 후에는 참가자를 추가할 수 없습니다.");
      }

      const maxParticipantCount = auction.teamCount * auction.membersPerTeam;
      if (auction.participants.length >= maxParticipantCount) {
        throw new CaptainActionError(`참가자 수가 초과되었습니다. ${maxParticipantCount}명까지만 등록할 수 있습니다.`);
      }

      const user = await tx.user.findUnique({
        where: { nickname: normalizedNickname },
        select: { id: true },
      });

      if (!user) {
        throw new CaptainActionError("해당 닉네임의 사용자를 찾을 수 없습니다.");
      }

      if (auction.participants.some((participant) => participant.userId === user.id)) {
        throw new CaptainActionError("이미 등록된 참가자입니다.");
      }

      const shouldAppendAuctionOrder = auction.participants.some((participant) => participant.auctionOrder !== null);
      const nextAuctionOrder = shouldAppendAuctionOrder
        ? Math.max(...auction.participants.map((participant) => participant.auctionOrder ?? 0), 0) + 1
        : null;

      await tx.auctionParticipant.create({
        data: {
          auctionId: auction.id,
          auctionOrder: nextAuctionOrder,
          status: ParticipantStatus.WAITING,
          userId: user.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };
    if (isPrismaUniqueConstraintError(error)) {
      return { error: "이미 등록된 참가자입니다." };
    }

    console.error("[auction-participant] Failed to add participant", error);
    return { error: "참가자 추가에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "참가자를 추가했습니다." };
}

export async function removeAuctionParticipantBeforeStart({
  auctionCode,
  auctionId,
  participantId,
}: {
  auctionCode: string;
  auctionId: string;
  participantId: string;
}): Promise<CaptainActionState> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  if (!auctionId || !auctionCode || !participantId) {
    return { error: "참가자 제거에 필요한 정보가 부족합니다." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: {
          participants: true,
          teams: true,
        },
      });

      if (!auction) throw new CaptainActionError("경매방을 찾을 수 없습니다.");
      if (auction.ownerId !== currentUser.id) {
        throw new CaptainActionError("방장만 참가자를 제거할 수 있습니다.");
      }
      if (!editableAuctionStatuses.has(auction.status)) {
        throw new CaptainActionError("경매 시작 후에는 참가자를 제거할 수 없습니다.");
      }

      const participant = auction.participants.find((auctionParticipant) => auctionParticipant.id === participantId);
      if (!participant) {
        throw new CaptainActionError("경매에 등록된 참가자를 찾을 수 없습니다.");
      }
      if (auction.currentTargetParticipantId === participant.id) {
        throw new CaptainActionError("현재 경매 대상자는 제거할 수 없습니다.");
      }
      if (participant.teamId || participant.soldPrice !== null || participant.status === ParticipantStatus.SOLD) {
        throw new CaptainActionError("이미 팀에 배정된 참가자는 제거할 수 없습니다.");
      }
      if (participant.status === ParticipantStatus.BIDDING) {
        throw new CaptainActionError("입찰 중인 참가자는 제거할 수 없습니다.");
      }

      await tx.auctionTeam.updateMany({
        where: {
          auctionId: auction.id,
          captainId: participant.userId,
        },
        data: {
          captainId: null,
        },
      });

      await tx.auctionParticipant.delete({
        where: {
          id: participant.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof CaptainActionError) return { error: error.message };

    console.error("[auction-participant] Failed to remove participant", error);
    return { error: "참가자 제거에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auctionCode}`);
  return { success: "참가자를 제거했습니다." };
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
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const participant = await tx.auctionParticipant.findUnique({
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

      if (!participant) return;

      await tx.auctionParticipant.update({
        where: {
          id: participant.id,
        },
        data: {
          lastSeenAt: now,
        },
      });

      console.log("[auction-presence] heartbeat", {
        auctionId,
        userId: currentUser.id,
      });

      await pauseAuctionIfCaptainsInactive(tx, auctionId, now);
    });

    return { success: "입장 상태를 갱신했습니다." };
  } catch (error) {
    console.error("[auction-presence] Failed to record presence", error);
    await logAppError({
      auctionId,
      message: "Failed to record auction presence or auto pause",
      metadata: {
        error: errorToLogMetadata(error),
      },
      scope: "auction-presence",
      userId: currentUser.id,
    });
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
    await logAppError({
      auctionId,
      message: "Failed to load finalize debug context",
      metadata: {
        error: errorToLogMetadata(error),
      },
      scope: "auction-finalize",
      userId: currentUserId,
    });
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
  gracePeriodMs,
  now,
}: {
  auctionSeconds: number;
  currentRoundEndAt: Date;
  extendSeconds: number;
  gracePeriodMs: number;
  now: Date;
}) {
  const currentRemainingMs = currentRoundEndAt.getTime() - now.getTime();
  if (currentRemainingMs < -gracePeriodMs) return null;

  const extendMs = Math.max(0, extendSeconds) * 1000;
  const extendedRemainingMs = currentRemainingMs + extendMs;
  const maxMs = auctionSeconds > 0 ? auctionSeconds * 1000 : extendedRemainingMs;
  const nextRemainingMs = Math.min(extendedRemainingMs, maxMs);
  if (nextRemainingMs <= 0) return currentRoundEndAt;

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

async function pauseAuctionIfCaptainsInactive(
  tx: Prisma.TransactionClient,
  auctionId: string,
  now: Date,
) {
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

  if (!auction || auction.status !== AuctionStatus.RUNNING) return;

  const captainPresence = getActiveCaptainPresence({
    now,
    participants: auction.participants,
    teams: auction.teams,
  });

  console.log("[auction-presence] active captains checked", {
    activeCaptainCount: captainPresence.activeCaptainCount,
    auctionId,
    requiredActiveCaptainCount: captainPresence.requiredActiveCaptainCount,
  });

  if (captainPresence.canRunAuction) return;

  const pausedRemainingMs = Math.max(
    auction.currentRoundEndAt ? auction.currentRoundEndAt.getTime() - now.getTime() : 0,
    0,
  );
  const updatedAuction = await tx.auction.update({
    where: { id: auction.id },
    data: {
      status: AuctionStatus.PAUSED,
      currentRoundEndAt: null,
      pausedAt: now,
      pausedRemainingMs,
      pauseReason: PAUSE_REASON_INACTIVE_CAPTAINS,
      lastActivityAt: now,
    },
  });

  console.log("[auction-pause] auction paused", {
    activeCaptainCount: captainPresence.activeCaptainCount,
    auctionId: updatedAuction.id,
    pausedAt: updatedAuction.pausedAt?.toISOString() ?? null,
    pausedRemainingMs: updatedAuction.pausedRemainingMs,
    pauseReason: updatedAuction.pauseReason,
    requiredActiveCaptainCount: captainPresence.requiredActiveCaptainCount,
    status: updatedAuction.status,
  });
}

function getActiveCaptainPresence({
  now,
  participants,
  teams,
}: {
  now: Date;
  participants: Array<{ lastSeenAt?: Date | null; userId: string }>;
  teams: Array<{ captain?: { nickname: string } | null; captainId: string | null; name: string }>;
}) {
  const captainTeams = teams.filter((team) => team.captainId);
  const requiredActiveCaptainCount = captainTeams.length <= 1 ? captainTeams.length : 2;
  const activeCaptainCount = captainTeams.filter((team) => {
    const captainParticipant = participants.find((participant) => participant.userId === team.captainId);

    return Boolean(
      captainParticipant?.lastSeenAt &&
        now.getTime() - captainParticipant.lastSeenAt.getTime() <= ACTIVE_CAPTAIN_WINDOW_MS,
    );
  }).length;

  return {
    activeCaptainCount,
    canRunAuction: activeCaptainCount >= requiredActiveCaptainCount,
    requiredActiveCaptainCount,
  };
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

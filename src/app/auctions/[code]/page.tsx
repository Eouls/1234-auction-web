import { notFound, redirect } from "next/navigation";
import { AuctionStatus, ParticipantStatus } from "@/generated/prisma/client";
import { AuctionBidLog } from "@/components/auction/AuctionBidLog";
import { AuctionChatPanel } from "@/components/auction/AuctionChatPanel";
import { AuctionOwnerControls, AuctionStartControl, BidControls } from "@/components/auction/AuctionControls";
import { AuctionParticipantGrid } from "@/components/auction/AuctionParticipantGrid";
import { AuctionParticipantManager } from "@/components/auction/AuctionParticipantManager";
import { CaptainSetupPanel } from "@/components/auction/CaptainSetupPanel";
import { AuctionPresenceHeartbeat } from "@/components/auction/AuctionPresenceHeartbeat";
import { AuctionRoomRealtime } from "@/components/auction/AuctionRoomRealtime";
import { AuctionStartAutoScroll } from "@/components/auction/AuctionStartAutoScroll";
import { AppShell } from "@/components/layout/AppShell";
import {
  Avatar,
  Card,
  ChampionIconPlaceholder,
  PageHeader,
  RoleBadge,
  SectionTitle,
  StatusBadge,
} from "@/components/ui";
import { errorToLogMetadata, logAppError } from "@/lib/logging/app-log";
import { prisma } from "@/lib/prisma";
import { resolveChampionIcons } from "@/lib/riot/champions";
import { createClient } from "@/lib/supabase/server";
import type { LolRole } from "@/types/auction";
import type { AuctionStatus as UiAuctionStatus } from "@/types/auction";

type AuctionRoomPageProps = {
  params: Promise<{ code: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CAPTAIN_PRESENCE_WINDOW_MS = 30 * 1000;

export default async function AuctionRoomPage({ params }: AuctionRoomPageProps) {
  const { code } = await params;
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
      customProfileImageUrl: true,
      discordAvatarUrl: true,
      id: true,
      nickname: true,
    },
  });

  if (!currentUser) {
    redirect("/onboarding");
  }

  const auction = await (async () => {
    try {
      return await prisma.auction.findUnique({
        where: {
          code,
        },
        include: {
          teams: {
            orderBy: {
              name: "asc",
            },
            include: {
              captain: true,
              members: {
                include: {
                  user: true,
                },
              },
            },
          },
          participants: {
            orderBy: {
              createdAt: "asc",
            },
            include: {
              user: {
                include: {
                  lolAccounts: {
                    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                  },
                  lolStats: true,
                  auctionStats: {
                    select: {
                      averageSoldPrice: true,
                      lastSoldPrice: true,
                      soldCount: true,
                    },
                  },
                },
              },
            },
          },
          bids: {
            orderBy: {
              createdAt: "asc",
            },
          },
          roundSnapshots: {
            orderBy: {
              roundNumber: "desc",
            },
            take: 5,
          },
          messages: {
            orderBy: {
              createdAt: "asc",
            },
            include: {
              sender: true,
            },
          },
        },
      });
    } catch (error) {
      console.error("[auction-page] Failed to load auction", error);
      await logAppError({
        message: "Failed to load auction room",
        metadata: {
          code,
          error: errorToLogMetadata(error),
        },
        scope: "auction-page",
        userId: currentUser.id,
      });
      throw error;
    }
  })();

  if (!auction) {
    notFound();
  }

  console.log("[auction-page] loaded auction", {
    auctionId: auction.id,
    currentBidId: auction.currentBidId,
    currentRoundEndAt: auction.currentRoundEndAt?.toISOString() ?? null,
    currentTargetParticipantId: auction.currentTargetParticipantId,
    status: auction.status,
  });

  const isOwner = auction.ownerId === currentUser.id;
  const currentParticipant = auction.participants.find(
    (participant) => participant.userId === currentUser.id,
  );
  const isParticipant = Boolean(currentParticipant);

  if (!isOwner && !isParticipant) {
    redirect("/my-auctions");
  }

  const currentTargetParticipant = auction.currentTargetParticipantId
    ? auction.participants.find((participant) => participant.id === auction.currentTargetParticipantId)
    : null;
  const currentTarget = currentTargetParticipant?.user;
  const currentBid = auction.currentBidId
    ? auction.bids.find((bid) => bid.id === auction.currentBidId) ?? null
    : null;
  const participantCount = auction.participants.length;
  const requiredParticipantCount = auction.teamCount * auction.membersPerTeam;
  const isCaptainEditable = auction.status === AuctionStatus.DRAFT || auction.status === AuctionStatus.READY;
  const allCaptainsSet = auction.teams.every((team) => Boolean(team.captainId));
  const captainUserIds = new Set(auction.teams.map((team) => team.captainId).filter(Boolean));
  const captainPresenceItems = getCaptainPresenceItems(auction.teams, auction.participants);
  const allCaptainsPresent = allCaptainsSet && captainPresenceItems.every((item) => item.isPresent);
  const isRunning = auction.status === AuctionStatus.RUNNING;
  const isPaused = auction.status === AuctionStatus.PAUSED;
  const isFinished = auction.status === AuctionStatus.FINISHED;
  const canRollbackPreviousRound = auction.roundSnapshots.some(
    (snapshot) => snapshot.targetParticipantId !== auction.currentTargetParticipantId,
  );
  const pauseDescription =
    auction.pauseReason === "MANUAL"
      ? "방장이 경매를 일시정지했습니다."
      : "입찰 가능한 팀장이 부족해 타이머와 입찰이 멈춘 상태입니다.";
  const currentUserCaptainTeam = auction.teams.find((team) => team.captainId === currentUser.id);
  const currentUserSoldParticipant = auction.participants.find(
    (participant) =>
      participant.userId === currentUser.id &&
      participant.status === ParticipantStatus.SOLD &&
      Boolean(participant.teamId),
  );
  const currentUserTeamId = currentUserCaptainTeam?.id ?? currentUserSoldParticipant?.teamId ?? null;
  const currentUserTeamMemberCount = currentUserCaptainTeam
    ? getTeamMemberCount(currentUserCaptainTeam, auction.participants)
    : 0;
  const isCurrentUserTeamFull = currentUserCaptainTeam
    ? currentUserTeamMemberCount >= auction.membersPerTeam
    : false;
  const canBid = Boolean(currentUserCaptainTeam && isRunning && currentTargetParticipant && !isCurrentUserTeamFull);
  const isCurrentBidderTeam = Boolean(currentBid && currentBid.bidderTeamId === currentUserCaptainTeam?.id);
  const sortedParticipants = [...auction.participants].sort((first, second) => {
    if (auction.status === AuctionStatus.DRAFT || auction.status === AuctionStatus.READY) {
      return first.createdAt.getTime() - second.createdAt.getTime();
    }

    const firstPriority = participantSortPriority(first.status, first.id === auction.currentTargetParticipantId);
    const secondPriority = participantSortPriority(second.status, second.id === auction.currentTargetParticipantId);

    if (firstPriority !== secondPriority) return firstPriority - secondPriority;

    const firstOrder = first.auctionOrder ?? Number.MAX_SAFE_INTEGER;
    const secondOrder = second.auctionOrder ?? Number.MAX_SAFE_INTEGER;

    if (firstOrder !== secondOrder) return firstOrder - secondOrder;
    return first.createdAt.getTime() - second.createdAt.getTime();
  });
  const currentTargetChampions = await resolveChampionIcons([
    currentTarget?.lolStats?.mostChampion1,
    currentTarget?.lolStats?.mostChampion2,
    currentTarget?.lolStats?.mostChampion3,
  ]);
  const participantChampionIconEntries = await Promise.all(
    sortedParticipants.map(async (participant) => [
      participant.id,
      await resolveChampionIcons([
        participant.user.lolStats?.mostChampion1,
        participant.user.lolStats?.mostChampion2,
        participant.user.lolStats?.mostChampion3,
      ]),
    ] as const),
  );
  const participantChampionIconMap = new Map(participantChampionIconEntries);
  const accessibleChatMessages = auction.messages
    .filter((message) => message.type === "GLOBAL" || message.teamId === currentUserTeamId)
    .map((message) => ({
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
    }));
  const bidLogItems = auction.bids.map((bid) => {
    const bidderTeam = auction.teams.find((team) => team.id === bid.bidderTeamId);
    const bidderCaptain = auction.participants.find((participant) => participant.userId === bid.bidderCaptainId)?.user;
    const target = auction.participants.find((participant) => participant.id === bid.targetParticipantId)?.user;

    return {
      amount: bid.amount,
      bidderCaptainNickname: bidderCaptain?.nickname ?? "팀장",
      bidderTeamName: getTeamDisplayName(bidderTeam) ?? "정보 없음",
      id: bid.id,
      isCurrentBid: bid.id === auction.currentBidId,
      targetNickname: target?.nickname ?? "대상자",
    };
  });

  return (
    <AppShell contentClassName="max-w-[1720px] px-4 lg:px-6 2xl:px-8">
      <AuctionPresenceHeartbeat
        auctionId={auction.id}
        enabled={!isFinished && auction.status !== AuctionStatus.CANCELED}
        isParticipant={isParticipant}
      />
      <AuctionRoomRealtime auctionId={auction.id} />
      <AuctionStartAutoScroll isAuctionRunning={isRunning} targetId="auction-main-panel" />
      <PageHeader
        eyebrow={`Room ${auction.code}`}
        title={auction.title}
        description="팀장을 설정한 뒤 경매를 시작할 수 있습니다. 입찰과 채팅은 다음 단계에서 연결합니다."
        action={<StatusBadge status={toUiStatus(auction.status)} />}
      />
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Info label="방 코드" value={auction.code} />
        <Info label="참가자" value={`${participantCount} / ${requiredParticipantCount}`} />
        <Info label="경매 시간" value={`${auction.auctionSeconds}초`} />
        <Info label="추가 시간" value={`${auction.extendSeconds}초`} />
      </div>
      <Card className="mt-6 flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className={allCaptainsPresent && !isPaused ? "text-sm font-semibold text-cyan-200" : "text-sm font-semibold text-amber-200"}>
            {isPaused
              ? "경매가 일시중지되었습니다"
              : allCaptainsPresent
                ? "경매 시작 준비 완료"
                : "팀장 입장 확인 후 경매를 시작할 수 있습니다"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isPaused
              ? pauseDescription
              : allCaptainsSet
                ? "각 팀장이 경매방에 입장해야 경매를 시작할 수 있습니다."
                : "모든 팀의 팀장을 먼저 설정해주세요."}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {captainPresenceItems.map((item) => (
              <div
                className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-slate-950/40 px-2.5 py-2"
                key={item.teamName}
              >
                <p className="min-w-0 truncate text-xs text-slate-300">
                  <span className="font-semibold text-white">{item.teamName}</span>
                  <span className="mx-1 text-slate-600">·</span>
                  {item.captainName}
                </p>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                    item.isPresent
                      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                  }`}
                >
                  {item.isPresent ? "입장 완료" : "입장 전"}
                </span>
              </div>
            ))}
          </div>
          {allCaptainsSet && !allCaptainsPresent ? (
            <p className="mt-2 text-xs text-amber-200">아직 입장하지 않은 팀장이 있습니다.</p>
          ) : null}
        </div>
        <AuctionStartControl
          auctionCode={auction.code}
          auctionId={auction.id}
          disabled={!allCaptainsSet || !allCaptainsPresent}
          isFinished={isFinished}
          isOwner={isOwner}
          isPaused={isPaused}
          isRunning={isRunning}
        />
      </Card>
      <div className="mt-8 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(560px,1fr)_420px] 2xl:grid-cols-[340px_minmax(620px,1fr)_480px]">
        <aside className="space-y-4 lg:col-span-2 xl:col-span-1">
          <SectionTitle title="팀 현황" description="방장만 팀장을 선택하거나 해제할 수 있습니다." />
          <CaptainSetupPanel
            auctionCode={auction.code}
            auctionId={auction.id}
            canManageCaptains={isOwner}
            isCaptainEditable={isCaptainEditable}
            participants={auction.participants.map((participant) => ({
              id: participant.id,
              userId: participant.userId,
              status: participant.status,
              user: {
                nickname: participant.user.nickname,
                imageUrl: participant.user.customProfileImageUrl ?? participant.user.discordAvatarUrl,
                mainRole: participant.user.mainRole as LolRole | null,
                subRole: participant.user.subRole as LolRole | null,
              },
            }))}
            teams={auction.teams.map((team) => ({
              id: team.id,
              name: team.name,
              captainId: team.captainId,
              pointsLeft: team.pointsLeft,
              isFull: getTeamMemberCount(team, auction.participants) >= auction.membersPerTeam,
              memberCount: getTeamMemberCount(team, auction.participants),
              membersPerTeam: auction.membersPerTeam,
              captain: team.captain
                ? {
                    nickname: team.captain.nickname,
                    imageUrl: team.captain.customProfileImageUrl ?? team.captain.discordAvatarUrl,
                  }
                : null,
              members: auction.participants
                .filter((participant) => participant.teamId === team.id && participant.status === ParticipantStatus.SOLD)
                .sort((first, second) => (first.auctionOrder ?? 9999) - (second.auctionOrder ?? 9999))
                .map((participant) => ({
                  id: participant.id,
                  nickname: participant.user.nickname,
                  imageUrl: participant.user.customProfileImageUrl ?? participant.user.discordAvatarUrl,
                  soldPrice: participant.soldPrice,
                })),
            }))}
          />
        </aside>

        <section id="auction-main-panel" className="scroll-mt-24 space-y-4">
          <Card className="p-6">
            {isPaused ? (
              <div className="rounded-md border border-amber-300/30 bg-amber-400/10 p-4">
                <h2 className="text-lg font-bold text-foreground">
                  경매가 일시중지되었습니다
                </h2>

                <p className="mt-2 text-sm leading-6 text-foreground">
                  {pauseDescription} 팀장이 다시 입장하면 방장이 경매를 재개할 수 있습니다.
                </p>

                <p className="mt-3 text-xs font-semibold text-muted-foreground">
                  저장된 남은 시간: {formatRemainingMs(auction.pausedRemainingMs)}
                  {currentTarget ? ` · 현재 대상: ${currentTarget.nickname}` : ""}
                </p>
              </div>
            ) : isRunning && currentTarget ? (
              currentTarget ? (
                <div className="flex flex-col gap-5 lg:flex-row">
                  <Avatar
                    name={currentTarget.nickname}
                    size="xl"
                    src={currentTarget.customProfileImageUrl ?? currentTarget.discordAvatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black text-white">{currentTarget.nickname}</h2>
                      {currentTarget.mainRole ? <RoleBadge role={currentTarget.mainRole as LolRole} /> : null}
                      {currentTarget.subRole ? <RoleBadge role={currentTarget.subRole as LolRole} /> : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {currentTarget.bio || "아직 자기소개가 없습니다."}
                    </p>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <Info
                        label="롤 계정"
                        value={
                          currentTarget.lolAccounts[0]
                            ? `${currentTarget.lolAccounts[0].gameName} #${currentTarget.lolAccounts[0].tagLine}`
                            : "정보 없음"
                        }
                      />
                      <Info
                        label="현재 / 최고 티어"
                        value={`${formatTier(
                          currentTarget.lolStats?.currentTier,
                          currentTarget.lolStats?.currentRank,
                        )} / ${formatTier(currentTarget.lolStats?.peakTier, currentTarget.lolStats?.peakRank)}`}
                      />
                    </div>
                    <AuctionSoldStatsSummary stats={currentTarget.auctionStats} />
                    <div className="mt-4 flex gap-2">
                      {[
                        currentTargetChampions[0],
                        currentTargetChampions[1],
                        currentTargetChampions[2],
                      ].some(Boolean) ? (
                        [
                          currentTargetChampions[0],
                          currentTargetChampions[1],
                          currentTargetChampions[2],
                        ]
                          .filter(Boolean)
                          .map((champion) => (
                            <ChampionIconPlaceholder
                              imageUrl={champion?.imageUrl}
                              key={champion?.name}
                              name={champion?.name ?? "정보 없음"}
                            />
                          ))
                      ) : (
                        <span className="text-sm text-slate-500">모스트 챔피언 정보 없음</span>
                      )}
                    </div>
                    {currentTarget.lolStats?.peakTier || currentTarget.lolStats?.mostChampion1 ? (
                      <p className="mt-3 text-xs text-slate-500">최고 티어 및 모스트 챔피언 출처: OP.GG</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">경매 대상 참가자를 준비 중입니다.</p>
              )
            ) : isFinished ? (
              <div className="rounded-md border border-cyan-300/20 bg-cyan-400/10 p-4">
                <h2 className="text-lg font-bold text-cyan-100">경매가 종료되었습니다</h2>
                <p className="mt-2 text-sm leading-6 text-cyan-100/80">결과 화면에서 팀별 낙찰 결과를 확인할 수 있습니다.</p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-300/20 bg-amber-400/10 p-4">
                <h2 className="text-lg font-bold text-amber-100">팀장 설정 후 경매를 시작할 수 있습니다</h2>
                <p className="mt-2 text-sm leading-6 text-amber-100/80">
                  왼쪽 팀 현황에서 각 팀의 팀장을 모두 선택해주세요. 실제 경매 시작과 입찰 로직은 다음 단계에서 연결합니다.
                </p>
              </div>
            )}
          </Card>

          <BidControls
            auctionCode={auction.code}
            auctionId={auction.id}
            canBid={canBid}
            currentBidAmount={currentBid?.amount ?? 0}
            currentBidTeamName={
              currentBid
                ? getTeamDisplayName(auction.teams.find((team) => team.id === currentBid.bidderTeamId)) ?? "정보 없음"
                : "입찰 전"
            }
            currentTargetParticipantId={auction.currentTargetParticipantId}
            currentRoundEndAt={auction.currentRoundEndAt?.toISOString() ?? null}
            hasTarget={Boolean(currentTargetParticipant)}
            isCurrentBidderTeam={isCurrentBidderTeam}
            isTeamFull={isCurrentUserTeamFull}
            isOwner={isOwner}
            isPaused={isPaused}
            isRunning={isRunning}
            pausedRemainingMs={auction.pausedRemainingMs}
          />

          <AuctionOwnerControls
            auctionCode={auction.code}
            auctionId={auction.id}
            canRollback={canRollbackPreviousRound}
            isOwner={isOwner}
            isPaused={isPaused}
            isRunning={isRunning}
          />

          <AuctionBidLog bids={bidLogItems} />

          <AuctionChatPanel
            auctionCode={auction.code}
            auctionId={auction.id}
            currentUser={{
              id: currentUser.id,
              imageUrl: currentUser.customProfileImageUrl ?? currentUser.discordAvatarUrl,
              nickname: currentUser.nickname,
            }}
            initialMessages={accessibleChatMessages}
            messageListClassName="h-64"
            mode="GLOBAL"
            teamId={currentUserTeamId}
            title="전체 채팅"
          />
        </section>

        <aside className="space-y-4">
          {isOwner ? (
            <AuctionParticipantManager
              auctionCode={auction.code}
              auctionId={auction.id}
              canManage={isOwner}
              isEditable={isCaptainEditable}
              maxParticipantCount={requiredParticipantCount}
              participants={sortedParticipants.map((participant) => ({
                id: participant.id,
                imageUrl: participant.user.customProfileImageUrl ?? participant.user.discordAvatarUrl,
                isCaptain: captainUserIds.has(participant.userId),
                mainRole: participant.user.mainRole as LolRole | null,
                nickname: participant.user.nickname,
                status: participant.status,
                subRole: participant.user.subRole as LolRole | null,
              }))}
            />
          ) : null}
          <Card className="p-3">
            <SectionTitle title="참가자 목록" />
            <AuctionParticipantGrid
              participants={sortedParticipants.map((participant) => {
                const isCurrentTarget = participant.id === auction.currentTargetParticipantId;
                const soldTeam = participant.teamId
                  ? auction.teams.find((team) => team.id === participant.teamId)
                  : null;
                const championIcons = participantChampionIconMap.get(participant.id) ?? [null, null, null];

                return {
                  auctionStats: participant.user.auctionStats,
                  champions: [championIcons[0] ?? null, championIcons[1] ?? null, championIcons[2] ?? null],
                  currentRank: participant.user.lolStats?.currentRank ?? null,
                  currentTier: participant.user.lolStats?.currentTier ?? null,
                  id: participant.id,
                  imageUrl: participant.user.customProfileImageUrl ?? participant.user.discordAvatarUrl,
                  isCurrentTarget,
                  lolAccount: participant.user.lolAccounts[0]
                    ? `${participant.user.lolAccounts[0].gameName} #${participant.user.lolAccounts[0].tagLine}`
                    : null,
                  mainRole: participant.user.mainRole as LolRole | null,
                  nickname: participant.user.nickname,
                  peakRank: participant.user.lolStats?.peakRank ?? null,
                  peakTier: participant.user.lolStats?.peakTier ?? null,
                  soldLabel: soldTeam
                    ? `${participant.soldPrice === 0 ? "자동배정" : "낙찰"} / ${getTeamDisplayName(soldTeam)}`
                    : null,
                  soldPrice: participant.soldPrice,
                  status: participant.status,
                  subRole: participant.user.subRole as LolRole | null,
                  tierBorderClass: getPeakTierBorderClass(participant.user.lolStats?.peakTier),
                };
              })}
            />
          </Card>
          <AuctionChatPanel
            auctionCode={auction.code}
            auctionId={auction.id}
            currentUser={{
              id: currentUser.id,
              imageUrl: currentUser.customProfileImageUrl ?? currentUser.discordAvatarUrl,
              nickname: currentUser.nickname,
            }}
            initialMessages={accessibleChatMessages}
            messageListClassName="h-60"
            mode="TEAM"
            recordEntry={false}
            teamId={currentUserTeamId}
            title="팀 채팅"
          />
        </aside>
      </div>
    </AppShell>
  );
}

function participantSortPriority(status: string, isCurrentTarget: boolean) {
  if (isCurrentTarget || status === ParticipantStatus.BIDDING) return 0;
  if (status === ParticipantStatus.WAITING) return 1;
  if (status === ParticipantStatus.SOLD || status === ParticipantStatus.UNSOLD) return 2;
  if (status === ParticipantStatus.CAPTAIN) return 3;
  return 4;
}

function getTeamMemberCount(
  team: { captainId: string | null; id: string },
  participants: Array<{ status: ParticipantStatus; teamId: string | null }>,
) {
  const captainCount = team.captainId ? 1 : 0;
  const soldMemberCount = participants.filter(
    (participant) => participant.teamId === team.id && participant.status === ParticipantStatus.SOLD,
  ).length;

  return captainCount + soldMemberCount;
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={strong ? "mt-1 text-xl font-black text-cyan-200" : "mt-1 text-sm font-semibold text-slate-100"}>
        {value}
      </p>
    </div>
  );
}

function AuctionSoldStatsSummary({
  stats,
}: {
  stats: {
    averageSoldPrice: number;
    lastSoldPrice: number | null;
    soldCount: number;
  } | null;
}) {
  if (!stats || stats.soldCount <= 0) {
    return (
      <div className="mt-4 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2">
        <p className="text-xs font-semibold text-slate-500">낙찰 기록 없음</p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
        <p className="text-xs text-slate-500">직전 낙찰가</p>
        <p className="mt-1 text-sm font-black text-slate-100">{formatPoint(stats.lastSoldPrice)}</p>
      </div>
      <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
        <p className="text-xs text-slate-500">평균 낙찰가</p>
        <p className="mt-1 text-sm font-black text-slate-100">{formatPoint(Math.round(stats.averageSoldPrice))}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{stats.soldCount.toLocaleString()}회 기준</p>
      </div>
    </div>
  );
}

function formatPoint(value?: number | null) {
  return typeof value === "number" ? `${value.toLocaleString()}P` : "기록 없음";
}

function formatTier(tier?: string | null, rank?: string | null) {
  return [tier, rank].filter(Boolean).join(" ") || "정보 없음";
}

function getPeakTierBorderClass(peakTier?: string | null) {
  const normalizedTier = peakTier?.trim().split(/\s+/)[0]?.toUpperCase();

  switch (normalizedTier) {
    case "CHALLENGER":
      return "border-[#4FD8FF]";
    case "GRANDMASTER":
      return "border-[#E74C5E]";
    case "MASTER":
      return "border-[#B15CFF]";
    case "DIAMOND":
      return "border-[#5DADEC]";
    case "EMERALD":
      return "border-[#2ECC71]";
    case "PLATINUM":
      return "border-[#4DB6AC]";
    case "GOLD":
      return "border-[#D6A93A]";
    case "SILVER":
      return "border-[#B8C0C8]";
    case "BRONZE":
      return "border-[#9A6A3A]";
    case "IRON":
      return "border-[#5A5F66]";
    case "UNRANKED":
    default:
      return "border-[var(--border)]";
  }
}

function toUiStatus(status: AuctionStatus): UiAuctionStatus {
  if (status === AuctionStatus.FINISHED || status === AuctionStatus.CANCELED) return "ENDED";
  if (status === AuctionStatus.PAUSED) return "PAUSED";
  if (status === AuctionStatus.RUNNING) return "IN_PROGRESS";
  return "WAITING";
}

function formatRemainingMs(value?: number | null) {
  if (typeof value !== "number") return "정보 없음";
  return `${Math.max(0, Math.ceil(value / 1000))}초`;
}

function getTeamDisplayName(team?: { captain?: { nickname: string } | null; name: string } | null) {
  if (!team) return null;
  return team.captain ? `${team.captain.nickname} 팀` : team.name;
}

function getCaptainPresenceItems(
  teams: Array<{ captain?: { nickname: string } | null; captainId: string | null; name: string }>,
  participants: Array<{ lastSeenAt: Date | null; userId: string }>,
) {
  const now = Date.now();

  return teams.map((team) => {
    const captainParticipant = team.captainId
      ? participants.find((participant) => participant.userId === team.captainId)
      : null;
    const isPresent = Boolean(
      captainParticipant?.lastSeenAt &&
        now - captainParticipant.lastSeenAt.getTime() <= CAPTAIN_PRESENCE_WINDOW_MS,
    );

    return {
      captainName: team.captain?.nickname ?? "팀장 미설정",
      isPresent,
      teamName: getTeamDisplayName(team) ?? team.name,
    };
  });
}

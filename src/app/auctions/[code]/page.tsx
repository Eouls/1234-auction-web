import { notFound, redirect } from "next/navigation";
import { AuctionStatus, ParticipantStatus } from "@/generated/prisma/client";
import { AuctionChatPanel } from "@/components/auction/AuctionChatPanel";
import { AuctionStartControl, BidControls } from "@/components/auction/AuctionControls";
import { CaptainSetupPanel } from "@/components/auction/CaptainSetupPanel";
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
import { prisma } from "@/lib/prisma";
import { filterValidChampionNames } from "@/lib/riot/champions";
import { createClient } from "@/lib/supabase/server";
import type { LolRole } from "@/types/auction";

type AuctionRoomPageProps = {
  params: Promise<{ code: string }>;
};

const participantStatusLabels: Record<string, string> = {
  WAITING: "대기",
  CAPTAIN: "팀장",
  SOLD: "낙찰됨",
  BIDDING: "경매중",
  UNSOLD: "유찰",
};

const participantStatusColors: Record<string, string> = {
  WAITING: "border-slate-300/20 bg-slate-400/10 text-slate-300",
  CAPTAIN: "border-cyan-300/40 bg-cyan-400/10 text-cyan-200",
  SOLD: "border-emerald-300/40 bg-emerald-400/10 text-emerald-200",
  BIDDING: "border-amber-300/40 bg-amber-400/10 text-amber-200",
  UNSOLD: "border-rose-300/40 bg-rose-400/10 text-rose-200",
};

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

  const auction = await prisma.auction.findUnique({
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
                orderBy: {
                  createdAt: "asc",
                },
              },
              lolStats: true,
            },
          },
        },
      },
      bids: {
        orderBy: {
          createdAt: "asc",
        },
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

  if (!auction) {
    notFound();
  }

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
  const isRunning = auction.status === AuctionStatus.RUNNING;
  const isFinished = auction.status === AuctionStatus.FINISHED;
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
  const currentTargetChampionNames = await filterValidChampionNames([
    currentTarget?.lolStats?.mostChampion1,
    currentTarget?.lolStats?.mostChampion2,
    currentTarget?.lolStats?.mostChampion3,
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Room ${auction.code}`}
        title={auction.title}
        description="팀장을 설정한 뒤 경매를 시작할 수 있습니다. 입찰과 채팅은 다음 단계에서 연결합니다."
        action={<StatusBadge status={auction.status === "READY" ? "WAITING" : "IN_PROGRESS"} />}
      />
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Info label="방 코드" value={auction.code} />
        <Info label="참가자" value={`${participantCount} / ${requiredParticipantCount}`} />
        <Info label="경매 시간" value={`${auction.auctionSeconds}초`} />
        <Info label="추가 시간" value={`${auction.extendSeconds}초`} />
      </div>
      <Card className="mt-6 flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className={allCaptainsSet ? "text-sm font-semibold text-cyan-200" : "text-sm font-semibold text-amber-200"}>
            {allCaptainsSet ? "경매 시작 준비 완료" : "모든 팀의 팀장을 설정해주세요"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isOwner ? "방장 권한으로 팀장을 설정할 수 있습니다." : "팀장 설정은 방장만 가능합니다."}
          </p>
        </div>
        <AuctionStartControl
          auctionCode={auction.code}
          auctionId={auction.id}
          disabled={!allCaptainsSet}
          isFinished={isFinished}
          isOwner={isOwner}
          isRunning={isRunning}
        />
      </Card>
      <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
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

        <section className="space-y-4">
          <Card className="p-6">
            {isRunning && currentTarget ? (
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
                    <div className="mt-4 flex gap-2">
                      {[
                        currentTargetChampionNames[0],
                        currentTargetChampionNames[1],
                        currentTargetChampionNames[2],
                      ].some(Boolean) ? (
                        [
                          currentTargetChampionNames[0],
                          currentTargetChampionNames[1],
                          currentTargetChampionNames[2],
                        ]
                          .filter(Boolean)
                          .map((champion) => (
                            <ChampionIconPlaceholder key={champion} name={champion ?? "정보 없음"} />
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
                ? auction.teams.find((team) => team.id === currentBid.bidderTeamId)?.name ?? "정보 없음"
                : "입찰 전"
            }
            currentTargetParticipantId={auction.currentTargetParticipantId}
            currentRoundEndAt={auction.currentRoundEndAt?.toISOString() ?? null}
            hasTarget={Boolean(currentTargetParticipant)}
            isCurrentBidderTeam={isCurrentBidderTeam}
            isTeamFull={isCurrentUserTeamFull}
            isOwner={isOwner}
            isRunning={isRunning}
          />

          <Card className="p-6">
            <SectionTitle title="입찰 로그" />
            {auction.bids.length ? (
              <div className="space-y-2">
                {auction.bids.map((bid) => {
                  const bidderTeam = auction.teams.find((team) => team.id === bid.bidderTeamId);
                  const bidderCaptain = auction.participants.find((participant) => participant.userId === bid.bidderCaptainId)?.user;
                  const target = auction.participants.find((participant) => participant.id === bid.targetParticipantId)?.user;
                  const isCurrentBid = bid.id === auction.currentBidId;

                  return (
                    <div
                      key={bid.id}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        isCurrentBid
                          ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                          : "border-white/10 bg-slate-950/60 text-slate-300"
                      }`}
                    >
                      {bidderCaptain?.nickname ?? "팀장"}님이 {target?.nickname ?? "대상자"}님에게 {bid.amount}P 입찰
                      <span className="ml-2 text-xs text-slate-500">{bidderTeam?.name}</span>
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
        </section>

        <aside className="space-y-4">
          <Card className="p-4">
            <SectionTitle title="참가자 목록" />
            <div className="space-y-2">
              {sortedParticipants.map((participant) => {
                const isCurrentTarget = participant.id === auction.currentTargetParticipantId;
                const soldTeam = participant.teamId
                  ? auction.teams.find((team) => team.id === participant.teamId)
                  : null;

                return (
                <div
                  key={participant.id}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                    isCurrentTarget
                      ? "border-amber-300/50 bg-amber-400/10"
                      : "border-white/10 bg-slate-950/60"
                  }`}
                >
                  <Avatar
                    name={participant.user.nickname}
                    size="sm"
                    src={participant.user.customProfileImageUrl ?? participant.user.discordAvatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{participant.user.nickname}</p>
                      {isCurrentTarget ? (
                        <span className="shrink-0 rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                          현재
                        </span>
                      ) : null}
                    </div>
                    {soldTeam ? (
                      <p className="mt-0.5 text-xs text-emerald-200">
                        {participant.soldPrice === 0 ? "자동배정" : "낙찰"} / {soldTeam.name}
                      </p>
                    ) : null}
                  </div>
                  {participant.user.mainRole ? <RoleBadge role={participant.user.mainRole as LolRole} /> : null}
                  <ParticipantStatusBadge status={participant.status} />
                </div>
                );
              })}
            </div>
          </Card>
          <AuctionChatPanel
            auctionCode={auction.code}
            auctionId={auction.id}
            currentUser={{
              id: currentUser.id,
              imageUrl: currentUser.customProfileImageUrl ?? currentUser.discordAvatarUrl,
              nickname: currentUser.nickname,
            }}
            initialMessages={auction.messages
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
              }))}
            teamId={currentUserTeamId}
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

function formatTier(tier?: string | null, rank?: string | null) {
  return [tier, rank].filter(Boolean).join(" ") || "정보 없음";
}

function ParticipantStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${
        participantStatusColors[status] ?? participantStatusColors.WAITING
      }`}
    >
      {participantStatusLabels[status] ?? status}
    </span>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuctionStatus, ParticipantStatus } from "@/generated/prisma/client";
import { AppShell } from "@/components/layout/AppShell";
import { InternalMatchRecorder } from "@/components/auction/InternalMatchRecorder";
import { Avatar, Button, Card, PageHeader, RoleBadge, SectionTitle } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { resolveChampionIcons } from "@/lib/riot/champions";
import { createClient } from "@/lib/supabase/server";
import type { LolRole } from "@/types/auction";

type AuctionResultPageProps = {
  params: Promise<{ code: string }>;
};

type ResultMember = {
  account: string;
  bioLabel: string;
  champions: Array<{
    imageUrl: string | null;
    name: string;
  }>;
  id: string;
  imageUrl: string | null;
  isCaptain: boolean;
  mainRole: LolRole | null;
  nickname: string;
  subRole: LolRole | null;
};

export default async function AuctionResultPage({ params }: AuctionResultPageProps) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/auth/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    select: { id: true },
  });

  if (!currentUser) {
    redirect("/onboarding");
  }

  const auction = await prisma.auction.findUnique({
    where: { code },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: {
          captain: {
            include: {
              lolAccounts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              lolStats: true,
            },
          },
        },
      },
      participants: {
        orderBy: [{ auctionOrder: "asc" }, { createdAt: "asc" }],
        include: {
          user: {
            include: {
              lolAccounts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              lolStats: true,
            },
          },
        },
      },
      internalMatches: {
        orderBy: [{ gameNumber: "desc" }, { createdAt: "desc" }],
        include: {
          teams: {
            orderBy: { side: "asc" },
          },
          players: {
            orderBy: { createdAt: "asc" },
            include: {
              auctionTeam: true,
              user: true,
            },
          },
        },
      },
    },
  });

  if (!auction) {
    notFound();
  }

  if (auction.deletedAt) {
    redirect("/my-auctions");
  }

  const isOwner = auction.ownerId === currentUser.id;
  const isParticipant = auction.participants.some((participant) => participant.userId === currentUser.id);

  if (!isOwner && !isParticipant) {
    redirect("/my-auctions");
  }

  const isFinished = auction.status === AuctionStatus.FINISHED;
  const unsoldParticipants = auction.participants.filter(
    (participant) => participant.status === ParticipantStatus.UNSOLD,
  );
  const resultTeams = await Promise.all(
    auction.teams.map(async (team) => {
      const captainMember = team.captain
        ? toResultMember(
            team.captain,
            "팀장",
            true,
            undefined,
            await getValidUserChampions(team.captain.lolStats),
          )
        : null;
      const soldParticipants = auction.participants
        .filter((participant) => participant.teamId === team.id && participant.status === ParticipantStatus.SOLD)
        .sort((first, second) => (first.auctionOrder ?? 9999) - (second.auctionOrder ?? 9999));
      const soldMembers = await Promise.all(
        soldParticipants.map(async (participant) =>
          toResultMember(
            participant.user,
            getPointLabel(participant.soldPrice),
            false,
            participant.id,
            await getValidUserChampions(participant.user.lolStats),
          ),
        ),
      );

      return {
        captainMember,
        memberCount: (captainMember ? 1 : 0) + soldMembers.length,
        soldMembers,
        team,
      };
    }),
  );
  const internalMatchPlayers = auction.internalMatches.flatMap((match) => match.players);
  const internalMatchChampionIcons = await resolveChampionIcons(
    internalMatchPlayers.map((player) => player.championName),
  );
  const internalMatchChampionNameByPlayerId = new Map(
    internalMatchPlayers.map((player, index) => [
      player.id,
      internalMatchChampionIcons[index]?.name ?? player.championName,
    ]),
  );

  return (
    <AppShell contentClassName="max-w-[1720px] px-4 lg:px-6 2xl:px-8">
      <PageHeader
        eyebrow={`Result ${auction.code}`}
        title={`${auction.title} 결과`}
        description="팀장과 낙찰된 팀원을 팀별로 확인합니다."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/auctions/${auction.code}`}>
              <Button type="button" variant="secondary">
                경매방
              </Button>
            </Link>
            <Link href="/home">
              <Button type="button" variant="ghost">
                홈
              </Button>
            </Link>
          </div>
        }
      />

      <Card className="mt-6 flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className={isFinished ? "text-sm font-semibold text-cyan-200" : "text-sm font-semibold text-amber-200"}>
            {isFinished ? "경매 종료" : "아직 경매가 종료되지 않았습니다"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isFinished ? "최종 팀 구성이 반영된 결과입니다." : "진행 중인 경매는 경매방에서 이어서 관리할 수 있습니다."}
          </p>
        </div>
        <button
          className="h-10 rounded-md border border-white/10 bg-white/10 px-3 text-sm font-semibold text-slate-300 opacity-70"
          type="button"
        >
          결과 요약 복사
        </button>
      </Card>

      <InternalMatchRecorder auctionCode={auction.code} auctionId={auction.id} />

      <section className="mt-6 space-y-4">
        {resultTeams.map(({ captainMember, memberCount, soldMembers, team }) => {
          const displayTeamName = team.captain ? `${team.captain.nickname} 팀` : team.name;

          return (
            <Card key={team.id} className="p-4">
              <div className="mb-3 flex flex-col gap-2 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-black text-white">{displayTeamName}</h2>
                    <span className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-xs font-bold text-cyan-100">
                      잔여 {team.pointsLeft}P
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    팀장 {team.captain?.nickname ?? "미설정"} · {memberCount}명
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {captainMember ? <MemberCard member={captainMember} /> : null}
                {soldMembers.map((member) => (
                  <MemberCard key={member.id} member={member} />
                ))}
              </div>
            </Card>
          );
        })}
      </section>

      {unsoldParticipants.length ? (
        <section className="mt-8">
          <SectionTitle title="유찰 참가자" description="낙찰되지 않고 경매가 종료된 참가자입니다." />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {unsoldParticipants.map((participant) => (
              <Card key={participant.id} className="p-3">
                <div className="flex items-center gap-2">
                  <Avatar
                    name={participant.user.nickname}
                    size="sm"
                    src={participant.user.customProfileImageUrl ?? participant.user.discordAvatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-white">{participant.user.nickname}</p>
                      <span className="shrink-0 rounded border border-rose-300/30 bg-rose-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">
                        유찰
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">{formatAccount(participant.user.lolAccounts[0])}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {participant.user.mainRole ? <RoleBadge role={participant.user.mainRole as LolRole} /> : null}
                    {participant.user.subRole ? <RoleBadge role={participant.user.subRole as LolRole} /> : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {auction.internalMatches.length ? (
        <section className="mt-8">
          <SectionTitle title="저장된 내전 기록" description="캡처 분석 후 확인 저장된 사용자 설정 경기 기록입니다." />
          <div className="mt-4 space-y-3">
            {auction.internalMatches.map((match) => (
              <Card key={match.id} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white">
                      {match.gameNumber}경기 / {match.winningSide} 승리
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Intl.DateTimeFormat("ko-KR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(match.playedAt)}
                      {` · ${match.sourceType}`}
                      {match.teams.length ? ` · ${match.teams.length}팀 / ${match.players.length}명` : ` · ${match.players.length}명`}
                    </p>
                  </div>
                  {match.screenshotUrl ? (
                    <a className="text-xs font-semibold text-cyan-200" href={match.screenshotUrl} rel="noreferrer" target="_blank">
                      스크린샷 보기
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {match.players.map((player) => (
                    <div className="rounded-md border border-white/10 bg-slate-950/50 px-3 py-2" key={player.id}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {player.user?.nickname ?? player.rawPlayerName ?? "미매칭 플레이어"}
                        </p>
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                            player.win
                              ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                              : "border-rose-300/30 bg-rose-400/10 text-rose-200"
                          }`}
                        >
                          {player.win ? "승" : "패"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {player.side}
                        {player.auctionTeam ? ` · ${player.auctionTeam.captainId ? `${player.auctionTeam.name}` : player.auctionTeam.name}` : ""}
                        {internalMatchChampionNameByPlayerId.get(player.id) ? ` · ${internalMatchChampionNameByPlayerId.get(player.id)}` : ""}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-300">
                        {player.kills ?? "-"} / {player.deaths ?? "-"} / {player.assists ?? "-"}
                        {player.cs !== null ? ` · CS ${player.cs}` : ""}
                        {player.damage !== null ? ` · 딜량 ${player.damage}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function MemberCard({ member }: { member: ResultMember }) {
  return (
    <div className="relative rounded-md border border-white/10 bg-slate-950/70 p-3">
      {member.isCaptain ? (
        <span className="absolute left-2 top-2 z-10 rounded bg-cyan-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
          팀장
        </span>
      ) : null}
      <div className="flex gap-3">
        <Avatar className="h-20 w-20 text-lg" name={member.nickname} src={member.imageUrl} />
        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="truncate text-sm font-bold text-white">{member.nickname}</h3>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{member.account}</p>
          <p className="mt-2 w-fit rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-xs font-bold text-cyan-100">
            {member.bioLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {member.mainRole ? <RoleBadge role={member.mainRole} /> : null}
            {member.subRole ? <RoleBadge role={member.subRole} /> : null}
          </div>
          {member.champions.length ? (
            <p className="mt-2 truncate text-[10px] text-slate-500">
              OP.GG · {member.champions.map((champion) => champion.name).join(" / ")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toResultMember(
  user: {
    customProfileImageUrl: string | null;
    discordAvatarUrl: string | null;
    id: string;
    lolAccounts: Array<{ gameName: string; tagLine: string }>;
    lolStats: {
      mostChampion1: string | null;
      mostChampion2: string | null;
      mostChampion3: string | null;
    } | null;
    mainRole: string | null;
    nickname: string;
    subRole: string | null;
  },
  bioLabel: string,
  isCaptain: boolean,
  participantId?: string,
  validChampions?: Array<{ imageUrl: string | null; name: string } | null>,
): ResultMember {
  return {
    account: formatAccount(user.lolAccounts[0]),
    bioLabel,
    champions: (validChampions ?? []).filter(Boolean) as Array<{ imageUrl: string | null; name: string }>,
    id: participantId ?? user.id,
    imageUrl: user.customProfileImageUrl ?? user.discordAvatarUrl,
    isCaptain,
    mainRole: user.mainRole as LolRole | null,
    nickname: user.nickname,
    subRole: user.subRole as LolRole | null,
  };
}

async function getValidUserChampions(
  lolStats: {
    mostChampion1: string | null;
    mostChampion2: string | null;
    mostChampion3: string | null;
  } | null,
) {
  return resolveChampionIcons([
    lolStats?.mostChampion1,
    lolStats?.mostChampion2,
    lolStats?.mostChampion3,
  ]);
}

function formatAccount(account: { gameName: string; tagLine: string } | undefined) {
  if (!account) return "롤 계정 정보 없음";
  return `${account.gameName} #${account.tagLine}`;
}

function getPointLabel(soldPrice: number | null) {
  if (soldPrice === 0) return "자동배정";
  if (typeof soldPrice === "number" && soldPrice > 0) return `${soldPrice}P`;
  return "-";
}

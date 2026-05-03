import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuctionStatus, ParticipantStatus } from "@/generated/prisma/client";
import { AppShell } from "@/components/layout/AppShell";
import {
  Avatar,
  Button,
  Card,
  ChampionIconPlaceholder,
  PageHeader,
  RoleBadge,
  SectionTitle,
} from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { filterValidChampionNames } from "@/lib/riot/champions";
import { createClient } from "@/lib/supabase/server";
import type { LolRole } from "@/types/auction";

type AuctionResultPageProps = {
  params: Promise<{ code: string }>;
};

type ResultMember = {
  account: string;
  bioLabel: string;
  champions: string[];
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
              lolAccounts: { orderBy: { createdAt: "asc" } },
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
              lolAccounts: { orderBy: { createdAt: "asc" } },
              lolStats: true,
            },
          },
        },
      },
    },
  });

  if (!auction) {
    notFound();
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
            await getValidUserChampionNames(team.captain.lolStats),
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
            await getValidUserChampionNames(participant.user.lolStats),
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

  return (
    <AppShell>
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

      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        {resultTeams.map(({ captainMember, memberCount, soldMembers, team }) => {
          return (
            <Card key={team.id} className="p-5">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-white">{team.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    팀장 {team.captain?.nickname ?? "미설정"} · {memberCount}명
                  </p>
                </div>
                <div className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-100">
                  잔여 {team.pointsLeft}P
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {unsoldParticipants.map((participant) => (
              <Card key={participant.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={participant.user.nickname}
                    size="sm"
                    src={participant.user.customProfileImageUrl ?? participant.user.discordAvatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{participant.user.nickname}</p>
                    <p className="truncate text-xs text-slate-500">{formatAccount(participant.user.lolAccounts[0])}</p>
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
    </AppShell>
  );
}

function MemberCard({ member }: { member: ResultMember }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/70 p-4">
      <div className="flex items-start gap-3">
        <Avatar name={member.nickname} size="lg" src={member.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-bold text-white">{member.nickname}</h3>
            {member.isCaptain ? (
              <span className="shrink-0 rounded bg-cyan-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                팀장
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{member.account}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {member.mainRole ? <RoleBadge role={member.mainRole} /> : null}
            {member.subRole ? <RoleBadge role={member.subRole} /> : null}
          </div>
        </div>
      </div>
      <p className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-100">
        {member.bioLabel}
      </p>
      <div className="mt-3 flex gap-2">
        {member.champions.length ? (
          member.champions.map((champion) => <ChampionIconPlaceholder key={champion} name={champion} />)
        ) : (
          <>
            <ChampionIconPlaceholder name="정보 없음" />
            <ChampionIconPlaceholder name="정보 없음" />
            <ChampionIconPlaceholder name="정보 없음" />
          </>
        )}
      </div>
      {member.champions.length ? <p className="mt-2 text-xs text-slate-500">Source: OP.GG</p> : null}
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
  validChampionNames?: Array<string | null>,
): ResultMember {
  return {
    account: formatAccount(user.lolAccounts[0]),
    bioLabel,
    champions: (validChampionNames ?? []).filter(Boolean) as string[],
    id: participantId ?? user.id,
    imageUrl: user.customProfileImageUrl ?? user.discordAvatarUrl,
    isCaptain,
    mainRole: user.mainRole as LolRole | null,
    nickname: user.nickname,
    subRole: user.subRole as LolRole | null,
  };
}

async function getValidUserChampionNames(
  lolStats: {
    mostChampion1: string | null;
    mostChampion2: string | null;
    mostChampion3: string | null;
  } | null,
) {
  return filterValidChampionNames([
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

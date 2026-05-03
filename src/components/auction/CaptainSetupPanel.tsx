"use client";

import { useActionState, useState } from "react";
import { updateTeamCaptain, updateTeamPoints, type CaptainActionState } from "@/app/auctions/[code]/actions";
import { Avatar, Button, Card, Input, RoleBadge } from "@/components/ui";
import type { LolRole } from "@/types/auction";

type CaptainSetupParticipant = {
  id: string;
  userId: string;
  status: string;
  user: {
    nickname: string;
    imageUrl: string | null;
    mainRole: LolRole | null;
    subRole: LolRole | null;
  };
};

type CaptainSetupTeam = {
  id: string;
  name: string;
  captainId: string | null;
  isFull: boolean;
  memberCount: number;
  membersPerTeam: number;
  pointsLeft: number;
  captain: {
    nickname: string;
    imageUrl: string | null;
  } | null;
  members: Array<{
    id: string;
    imageUrl: string | null;
    nickname: string;
    soldPrice: number | null;
  }>;
};

type CaptainSetupPanelProps = {
  auctionId: string;
  auctionCode: string;
  canManageCaptains: boolean;
  isCaptainEditable: boolean;
  teams: CaptainSetupTeam[];
  participants: CaptainSetupParticipant[];
};

const initialState: CaptainActionState = {};

export function CaptainSetupPanel({
  auctionId,
  auctionCode,
  canManageCaptains,
  isCaptainEditable,
  teams,
  participants,
}: CaptainSetupPanelProps) {
  const [state, formAction, isPending] = useActionState(updateTeamCaptain, initialState);
  const [pointsState, pointsAction, isPointsPending] = useActionState(updateTeamPoints, initialState);
  const [selectedCaptains, setSelectedCaptains] = useState<Record<string, string>>(() =>
    Object.fromEntries(teams.map((team) => [team.id, team.captainId ?? ""])),
  );

  const selectedCaptainIds = new Set(teams.map((team) => team.captainId).filter(Boolean));

  return (
    <div className="space-y-4">
      {state.error ? (
        <p className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          {state.success}
        </p>
      ) : null}
      {pointsState.error ? (
        <p className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {pointsState.error}
        </p>
      ) : null}
      {pointsState.success ? (
        <p className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          {pointsState.success}
        </p>
      ) : null}
      {teams.map((team) => (
        <Card key={team.id} className="p-5">
          <div className="flex items-center gap-3">
            <Avatar name={team.captain?.nickname ?? team.name} src={team.captain?.imageUrl} />
            <div>
              <h3 className="font-bold text-white">{team.name}</h3>
              <p className="text-xs text-slate-400">
                {team.memberCount} / {team.membersPerTeam}명
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm font-bold text-cyan-200">{team.pointsLeft}P</p>
              {team.isFull ? (
                <p className="mt-1 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                  정원 완료
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {team.captain ? (
              <TeamMemberPill imageUrl={team.captain.imageUrl} label="팀장" nickname={team.captain.nickname} />
            ) : (
              <div className="rounded-md border border-dashed border-white/10 bg-slate-950/40 p-3 text-center text-xs text-slate-500">
                팀장 미설정
              </div>
            )}
            {team.members.map((member) => (
              <TeamMemberPill
                imageUrl={member.imageUrl}
                key={member.id}
                label={formatMemberLabel(member.soldPrice)}
                nickname={member.nickname}
              />
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <form action={pointsAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input name="auctionId" type="hidden" value={auctionId} />
              <input name="auctionCode" type="hidden" value={auctionCode} />
              <input name="teamId" type="hidden" value={team.id} />
              <Input
                defaultValue={team.pointsLeft}
                disabled={!canManageCaptains || !isCaptainEditable || isPointsPending}
                min={0}
                name="pointsLeft"
                step={1}
                type="number"
              />
              <Button
                disabled={!canManageCaptains || !isCaptainEditable || isPointsPending}
                size="sm"
                type="submit"
                variant="secondary"
              >
                포인트 저장
              </Button>
            </form>
            <input name="auctionId" type="hidden" value={auctionId} />
            <input name="auctionCode" type="hidden" value={auctionCode} />
            <input name="teamId" type="hidden" value={team.id} />
            <select
              className="h-11 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canManageCaptains || !isCaptainEditable || isPending}
              name="captainUserId"
              onChange={(event) =>
                setSelectedCaptains((current) => ({ ...current, [team.id]: event.target.value }))
              }
              value={selectedCaptains[team.id] ?? ""}
            >
              <option value="">팀장 선택</option>
              {participants.map((participant) => {
                const isSelectedByOtherTeam =
                  selectedCaptainIds.has(participant.userId) && participant.userId !== team.captainId;

                return (
                  <option
                    disabled={isSelectedByOtherTeam}
                    key={participant.id}
                    value={participant.userId}
                  >
                    {participant.user.nickname}
                    {participant.user.mainRole ? ` / ${participant.user.mainRole}` : ""}
                    {isSelectedByOtherTeam ? " (다른 팀 팀장)" : ""}
                  </option>
                );
              })}
            </select>
            <div className="space-y-2">
              {participants
                .filter((participant) => participant.userId === selectedCaptains[team.id])
                .map((participant) => (
                  <div key={participant.id} className="flex items-center gap-2 rounded-md bg-slate-950/60 p-2">
                    <Avatar name={participant.user.nickname} size="sm" src={participant.user.imageUrl} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                      {participant.user.nickname}
                    </span>
                    {participant.user.mainRole ? <RoleBadge role={participant.user.mainRole} /> : null}
                    {participant.user.subRole ? <RoleBadge role={participant.user.subRole} /> : null}
                  </div>
                ))}
            </div>
            <div className="flex gap-2">
              <form action={formAction}>
                <input name="intent" type="hidden" value="set" />
                <input name="auctionId" type="hidden" value={auctionId} />
                <input name="auctionCode" type="hidden" value={auctionCode} />
                <input name="teamId" type="hidden" value={team.id} />
                <input name="captainUserId" type="hidden" value={selectedCaptains[team.id] ?? ""} />
                <Button
                  disabled={
                    !canManageCaptains ||
                    !isCaptainEditable ||
                    isPending ||
                    !selectedCaptains[team.id] ||
                    selectedCaptains[team.id] === team.captainId
                  }
                  size="sm"
                  type="submit"
                  variant="secondary"
                >
                  저장
                </Button>
              </form>
              <form action={formAction}>
                <input name="intent" type="hidden" value="unset" />
                <input name="auctionId" type="hidden" value={auctionId} />
                <input name="auctionCode" type="hidden" value={auctionCode} />
                <input name="teamId" type="hidden" value={team.id} />
                <Button
                  disabled={!canManageCaptains || !isCaptainEditable || isPending || !team.captainId}
                  size="sm"
                  type="submit"
                  variant="ghost"
                >
                  해제
                </Button>
              </form>
            </div>
          </div>
        </Card>
      ))}
      {!canManageCaptains ? (
        <p className="text-xs text-slate-500">방장만 팀장을 설정할 수 있습니다.</p>
      ) : null}
      {!isCaptainEditable ? (
        <p className="text-xs text-amber-200">진행 중이거나 종료된 경매는 팀장을 변경할 수 없습니다.</p>
      ) : null}
    </div>
  );
}

function TeamMemberPill({
  imageUrl,
  label,
  nickname,
}: {
  imageUrl: string | null;
  label?: string;
  nickname: string;
}) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center rounded-md border border-white/10 bg-slate-950/60 p-3 text-center">
      <Avatar name={nickname} size="sm" src={imageUrl} />
      <p className="mt-2 w-full truncate text-xs font-semibold text-white">{nickname}</p>
      {label ? <p className="mt-0.5 text-[10px] font-semibold text-cyan-200">{label}</p> : null}
    </div>
  );
}

function formatMemberLabel(soldPrice: number | null) {
  if (soldPrice === 0) return "자동배정";
  if (typeof soldPrice === "number" && soldPrice > 0) return `${soldPrice}P`;
  return undefined;
}

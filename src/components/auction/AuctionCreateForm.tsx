"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import {
  createAuction,
  findParticipantByNickname,
  type CreateAuctionFormState,
} from "@/app/auctions/create/actions";
import { Avatar, Button, Card, Input, RoleBadge, SectionTitle } from "@/components/ui";
import type { LolRole } from "@/types/auction";

type ParticipantPreview = {
  id: string;
  nickname: string;
  imageUrl: string | null;
  mainRole: LolRole | null;
  subRole: LolRole | null;
};

const initialState: CreateAuctionFormState = {};

export function AuctionCreateForm() {
  const [state, formAction, isCreating] = useActionState(createAuction, initialState);
  const [teamCount, setTeamCount] = useState("3");
  const [membersPerTeam, setMembersPerTeam] = useState("5");
  const [nickname, setNickname] = useState("");
  const [participants, setParticipants] = useState<ParticipantPreview[]>([]);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const pendingNicknameKeysRef = useRef(new Set<string>());
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  const requiredParticipantCount = useMemo(() => {
  const parsedTeamCount = Number(teamCount);
  const parsedMembersPerTeam = Number(membersPerTeam);

  if (!Number.isFinite(parsedTeamCount) || !Number.isFinite(parsedMembersPerTeam)) {
    return 0;
  }

  return Math.max(parsedTeamCount, 0) * Math.max(parsedMembersPerTeam, 0);
}, [membersPerTeam, teamCount]);

  async function addParticipant() {
    const normalizedNickname = nickname.trim();
    const nicknameKey = normalizedNickname.toLocaleLowerCase();
    setParticipantError(null);

    if (!normalizedNickname) {
      setParticipantError("닉네임을 입력해주세요.");
      focusNicknameInput();
      return;
    }

    if (pendingNicknameKeysRef.current.has(nicknameKey)) {
      setParticipantError("참가자를 추가하는 중입니다.");
      focusNicknameInput();
      return;
    }

    if (participants.length >= requiredParticipantCount) {
      setParticipantError(`참가자 수가 초과되었습니다. ${requiredParticipantCount}명만 등록할 수 있습니다.`);
      focusNicknameInput();
      return;
    }

    if (
      participants.some(
        (participant) => participant.nickname.toLocaleLowerCase() === nicknameKey,
      )
    ) {
      setParticipantError("이미 추가된 참가자입니다.");
      focusNicknameInput();
      return;
    }

    pendingNicknameKeysRef.current.add(nicknameKey);
    setIsAdding(true);

    try {
      const result = await findParticipantByNickname(normalizedNickname);

      if (!result.ok) {
        setParticipantError(result.error);
        return;
      }

      setParticipants((currentParticipants) => {
        if (currentParticipants.some((participant) => participant.id === result.participant.id)) {
          setParticipantError("이미 추가된 참가자입니다.");
          return currentParticipants;
        }

        if (currentParticipants.length >= requiredParticipantCount) {
          setParticipantError(`참가자 수가 초과되었습니다. ${requiredParticipantCount}명만 등록할 수 있습니다.`);
          return currentParticipants;
        }

        setNickname("");
        return [...currentParticipants, result.participant];
      });
    } finally {
      pendingNicknameKeysRef.current.delete(nicknameKey);
      setIsAdding(false);
      focusNicknameInput();
    }
  }

  function focusNicknameInput() {
    window.requestAnimationFrame(() => {
      nicknameInputRef.current?.focus();
    });
  }

  function removeParticipant(id: string) {
    setParticipants((currentParticipants) =>
      currentParticipants.filter((participant) => participant.id !== id),
    );
  }

  const participantCountMessage = `총 ${requiredParticipantCount}명이 필요합니다. 현재 ${participants.length}명이 추가되었습니다.`;
  const isParticipantCountValid = participants.length === requiredParticipantCount;

  return (
    <form action={formAction} className="mt-8 grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card className="p-6">
        <SectionTitle title="1단계: 경매 설정" />
        <div className="grid gap-4">
          <Field error={state.fieldErrors?.title} label="경매 제목">
            <Input defaultValue="" name="title" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={state.fieldErrors?.teamCount} label="총 팀 수">
              <Input
                min={2}
                name="teamCount"
                onChange={(event) => setTeamCount(event.target.value)}
                type="number"
                value={teamCount}
              />
            </Field>
            <Field error={state.fieldErrors?.membersPerTeam} label="팀당 인원 수">
              <Input
                min={1}
                name="membersPerTeam"
                onChange={(event) => setMembersPerTeam(event.target.value)}
                type="number"
                value={membersPerTeam}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={state.fieldErrors?.auctionSeconds} label="경매 시간(초)">
              <Input min={5} name="auctionSeconds" type="number" defaultValue={30} />
            </Field>
            <Field error={state.fieldErrors?.extendSeconds} label="입찰 추가 시간(초)">
              <Input min={0} name="extendSeconds" type="number" defaultValue={5} />
            </Field>
          </div>
          <Field error={state.fieldErrors?.startPoints} label="경매 시작 포인트">
            <Input min={1} name="startPoints" type="number" defaultValue={1000} />
          </Field>
        </div>
      </Card>
      <Card className="p-6">
        <SectionTitle title="2단계: 참가자 추가" description={participantCountMessage} />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            onChange={(event) => setNickname(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addParticipant();
              }
            }}
            placeholder="닉네임 정확히 입력"
            ref={nicknameInputRef}
            value={nickname}
          />
          <Button disabled={isAdding} onClick={() => void addParticipant()} type="button" variant="secondary">
            {isAdding ? "추가 중..." : "참가자 추가"}
          </Button>
        </div>
        {participantError ? <p className="mt-2 text-sm text-rose-300">{participantError}</p> : null}
        {state.fieldErrors?.participants ? (
          <p className="mt-2 text-sm text-rose-300">{state.fieldErrors.participants}</p>
        ) : null}
        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {participants.map((participant, index) => (
            <div
              key={participant.id}
              className="flex items-center gap-3 rounded-md border border-white/10 bg-slate-950/60 px-3 py-3 text-sm"
            >
              <Avatar name={participant.nickname} size="sm" src={participant.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-100">
                  {index + 1}. {participant.nickname}
                </p>
                <div className="mt-1 flex gap-1">
                  {participant.mainRole ? <RoleBadge role={participant.mainRole} /> : null}
                  {participant.subRole ? <RoleBadge role={participant.subRole} /> : null}
                </div>
              </div>
              <Button onClick={() => removeParticipant(participant.id)} size="sm" type="button" variant="ghost">
                삭제
              </Button>
              <input name="participantId" type="hidden" value={participant.id} />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className={isParticipantCountValid ? "text-sm text-cyan-200" : "text-sm text-slate-400"}>
            현재 {participants.length} / 필요 {requiredParticipantCount}
          </p>
          <Button disabled={isCreating} type="submit">
            {isCreating ? "생성 중..." : "생성하기"}
          </Button>
        </div>
        {state.error ? (
          <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {state.error}
          </p>
        ) : null}
      </Card>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-2 block text-xs text-rose-300">{error}</span> : null}
    </label>
  );
}

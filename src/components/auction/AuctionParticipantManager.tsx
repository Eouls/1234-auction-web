"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAuctionParticipantBeforeStart,
  removeAuctionParticipantBeforeStart,
} from "@/app/auctions/[code]/actions";
import { Avatar, Button, Input, RoleBadge } from "@/components/ui";
import type { LolRole } from "@/types/auction";

type ManageableParticipant = {
  id: string;
  imageUrl: string | null;
  isCaptain: boolean;
  mainRole: LolRole | null;
  nickname: string;
  status: string;
  subRole: LolRole | null;
};

type AuctionParticipantManagerProps = {
  auctionCode: string;
  auctionId: string;
  canManage: boolean;
  isEditable: boolean;
  maxParticipantCount: number;
  participants: ManageableParticipant[];
};

export function AuctionParticipantManager({
  auctionCode,
  auctionId,
  canManage,
  isEditable,
  maxParticipantCount,
  participants,
}: AuctionParticipantManagerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  if (!canManage) return null;

  const isFull = participants.length >= maxParticipantCount;

  function focusNicknameInput() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function handleAddParticipant() {
    const trimmedNickname = nickname.trim();
    setMessage(null);

    if (!isEditable) {
      setMessage({ text: "경매 시작 후에는 참가자를 추가할 수 없습니다.", type: "error" });
      return;
    }

    if (!trimmedNickname) {
      setMessage({ text: "추가할 참가자 닉네임을 입력해주세요.", type: "error" });
      focusNicknameInput();
      return;
    }

    if (isFull) {
      setMessage({ text: `참가자 수가 초과되었습니다. ${maxParticipantCount}명까지만 등록할 수 있습니다.`, type: "error" });
      focusNicknameInput();
      return;
    }

    if (participants.some((participant) => participant.nickname.toLocaleLowerCase() === trimmedNickname.toLocaleLowerCase())) {
      setMessage({ text: "이미 등록된 참가자입니다.", type: "error" });
      focusNicknameInput();
      return;
    }

    startTransition(async () => {
      const result = await addAuctionParticipantBeforeStart({
        auctionCode,
        auctionId,
        nickname: trimmedNickname,
      });

      if (result.error) {
        setMessage({ text: result.error, type: "error" });
        focusNicknameInput();
        return;
      }

      setNickname("");
      setMessage({ text: result.success ?? "참가자를 추가했습니다.", type: "success" });
      router.refresh();
      focusNicknameInput();
    });
  }

  function handleRemoveParticipant(participant: ManageableParticipant) {
    if (!isEditable) {
      setMessage({ text: "경매 시작 후에는 참가자를 제거할 수 없습니다.", type: "error" });
      return;
    }

    const confirmMessage = participant.isCaptain
      ? `${participant.nickname}님은 현재 팀장입니다. 제거하면 팀장 설정도 함께 해제됩니다. 제거할까요?`
      : `${participant.nickname}님을 참가자 목록에서 제거할까요?`;

    if (!window.confirm(confirmMessage)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await removeAuctionParticipantBeforeStart({
        auctionCode,
        auctionId,
        participantId: participant.id,
      });

      if (result.error) {
        setMessage({ text: result.error, type: "error" });
        return;
      }

      setMessage({ text: result.success ?? "참가자를 제거했습니다.", type: "success" });
      router.refresh();
    });
  }

  return (
    <>
      <Button className="h-8 px-2.5 text-xs" onClick={() => setIsOpen(true)} type="button" variant="secondary">
        참가자 관리
      </Button>

      {isOpen ? (
        <div
          aria-labelledby="participant-manager-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
          role="dialog"
        >
          <button
            aria-label="참가자 관리 닫기"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <div className="relative max-h-[min(720px,calc(100vh-48px))] w-full max-w-xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xl shadow-[var(--shadow)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--foreground)]" id="participant-manager-title">
                  참가자 관리
                </h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {isEditable
                    ? `경매 시작 전 참가자를 추가하거나 제거할 수 있습니다. 현재 ${participants.length}/${maxParticipantCount}명`
                    : "경매 시작 후에는 참가자를 수정할 수 없습니다."}
                </p>
              </div>
              <Button className="h-8 px-2 text-xs" onClick={() => setIsOpen(false)} type="button" variant="ghost">
                닫기
              </Button>
            </div>

            <div className="max-h-[calc(100vh-180px)] overflow-y-auto px-5 py-4">
              {isEditable ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    className="h-9 bg-[var(--background)] text-sm"
                    disabled={isPending || isFull}
                    onChange={(event) => setNickname(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddParticipant();
                      }
                    }}
                    placeholder="닉네임 정확히 입력"
                    ref={inputRef}
                    value={nickname}
                  />
                  <Button
                    className="h-9 whitespace-nowrap px-3 text-sm"
                    disabled={isPending || isFull}
                    onClick={handleAddParticipant}
                    type="button"
                    variant="secondary"
                  >
                    {isPending ? "처리 중..." : "추가"}
                  </Button>
                </div>
              ) : (
                <p className="rounded-md border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[var(--warning-soft)] px-3 py-2 text-sm font-semibold text-[var(--warning)]">
                  경매 시작 후에는 참가자를 수정할 수 없습니다.
                </p>
              )}

              {message ? (
                <p
                  className={`mt-2 rounded-md border px-2.5 py-2 text-xs ${
                    message.type === "error"
                      ? "border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[var(--danger-soft)] text-[var(--danger)]"
                      : "border-[color-mix(in_srgb,var(--success)_32%,transparent)] bg-[var(--success-soft)] text-[var(--success)]"
                  }`}
                >
                  {message.text}
                </p>
              ) : null}
              {isFull && isEditable ? (
                <p className="mt-2 text-xs text-[var(--warning)]">
                  팀 정원이 모두 채워져 참가자를 더 추가할 수 없습니다.
                </p>
              ) : null}

              <div className="mt-4 space-y-2">
                {participants.map((participant) => (
                  <div
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
                    key={participant.id}
                  >
                    <Avatar name={participant.nickname} size="sm" src={participant.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate font-semibold text-[var(--foreground)]">{participant.nickname}</p>
                        {participant.isCaptain ? (
                          <span className="shrink-0 rounded border border-[color-mix(in_srgb,var(--success)_32%,transparent)] bg-[var(--success-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--success)]">
                            팀장
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {participant.mainRole ? <RoleBadge role={participant.mainRole} /> : null}
                        {participant.subRole ? <RoleBadge role={participant.subRole} /> : null}
                      </div>
                    </div>
                    {isEditable ? (
                      <Button
                        className="h-8 px-2 text-xs"
                        disabled={isPending}
                        onClick={() => handleRemoveParticipant(participant)}
                        type="button"
                        variant="danger"
                      >
                        제거
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

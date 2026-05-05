"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finalizeRound,
  placeBid,
  startAuction,
  type AuctionActionState,
} from "@/app/auctions/[code]/actions";
import { Button, Card, Input } from "@/components/ui";

const initialState: AuctionActionState = {};

type AuctionStartControlProps = {
  auctionId: string;
  auctionCode: string;
  disabled: boolean;
  isOwner: boolean;
  isRunning: boolean;
  isFinished: boolean;
};

export function AuctionStartControl({
  auctionId,
  auctionCode,
  disabled,
  isOwner,
  isRunning,
  isFinished,
}: AuctionStartControlProps) {
  const [state, formAction, isPending] = useActionState(startAuction, initialState);

  if (isRunning) {
    return <span className="text-sm font-semibold text-cyan-200">경매 진행 중</span>;
  }

  if (isFinished) {
    return (
      <a
        className="inline-flex h-11 items-center justify-center rounded-md border border-white/10 bg-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/15"
        href={`/auctions/${auctionCode}/result`}
      >
        결과 확인
      </a>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-2 md:items-end">
      <input name="auctionId" type="hidden" value={auctionId} />
      <input name="auctionCode" type="hidden" value={auctionCode} />
      <Button disabled={disabled || !isOwner || isPending} type="submit" variant="secondary">
        {isPending ? "시작 중..." : "경매 시작"}
      </Button>
      {state.error ? <p className="text-xs text-rose-300">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-cyan-200">{state.success}</p> : null}
    </form>
  );
}

type BidControlProps = {
  auctionId: string;
  auctionCode: string;
  currentBidAmount: number;
  currentBidTeamName: string;
  currentTargetParticipantId: string | null;
  currentRoundEndAt: string | null;
  canBid: boolean;
  isCurrentBidderTeam: boolean;
  isTeamFull: boolean;
  isOwner: boolean;
  isRunning: boolean;
  hasTarget: boolean;
};

export function BidControls({
  auctionId,
  auctionCode,
  currentBidAmount,
  currentBidTeamName,
  currentTargetParticipantId,
  currentRoundEndAt,
  canBid,
  isCurrentBidderTeam,
  isTeamFull,
  isOwner,
  isRunning,
  hasTarget,
}: BidControlProps) {
  const router = useRouter();
  const [bidState, bidAction, isBidding] = useActionState(placeBid, initialState);
  const [finalizeState, finalizeAction, isFinalizing] = useActionState(finalizeRound, initialState);
  const [isAutoFinalizing, startAutoFinalizeTransition] = useTransition();
  const [directAmount, setDirectAmount] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const autoFinalizeKeysRef = useRef<Set<string>>(new Set());
  const endSoundPlayedKeysRef = useRef<Set<string>>(new Set());
  const isAutoFinalizingRef = useRef(false);
  const playedSecondKeysRef = useRef<Set<string>>(new Set());
  const roundKeyRef = useRef("");
  const soundRoundKeyRef = useRef("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setHasMounted(true);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!hasMounted) return;

    const updateRemainingSeconds = () => {
      setRemainingSeconds(getRemainingSeconds(currentRoundEndAt));
    };
    const initialTimer = window.setTimeout(updateRemainingSeconds, 0);
    const timer = window.setInterval(() => {
      updateRemainingSeconds();
    }, 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [currentRoundEndAt, hasMounted]);

  const isTimeOver = hasMounted ? remainingSeconds <= 0 : true;
  const bidDisabled = !canBid || isCurrentBidderTeam || !isRunning || !hasTarget || isTimeOver || isBidding;
  const directBidAmount = Number(directAmount);
  const roundKey = `${currentTargetParticipantId ?? "no-target"}:${currentRoundEndAt ?? "no-round"}`;
  const soundRoundKey = `${auctionId}:${currentTargetParticipantId ?? "no-target"}`;

  const presetAmounts = useMemo(
    () => [5, 10, 50, 100].map((increment) => currentBidAmount + increment),
    [currentBidAmount],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const storedValue = window.localStorage.getItem("auction-countdown-sound");
      if (storedValue === "off") setIsSoundEnabled(false);
      if (storedValue === "on") setIsSoundEnabled(true);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("auction-countdown-sound", isSoundEnabled ? "on" : "off");
  }, [isSoundEnabled]);

  useEffect(() => {
    if (!bidState.success) return;
    router.refresh();
  }, [bidState.success, router]);

  useEffect(() => {
    roundKeyRef.current = roundKey;
  }, [roundKey]);

  useEffect(() => {
    if (soundRoundKeyRef.current === soundRoundKey) return;

    soundRoundKeyRef.current = soundRoundKey;
    Array.from(endSoundPlayedKeysRef.current).forEach((key) => {
      if (key.startsWith(`${soundRoundKey}:`)) return;
      endSoundPlayedKeysRef.current.delete(key);
    });
    Array.from(playedSecondKeysRef.current).forEach((key) => {
      if (key.startsWith(`${soundRoundKey}:`)) return;
      playedSecondKeysRef.current.delete(key);
    });
  }, [soundRoundKey]);

  useEffect(() => {
    if (!hasMounted || !isSoundEnabled || !isRunning || !hasTarget || !currentTargetParticipantId || !currentRoundEndAt) return;

    if (remainingSeconds >= 1 && remainingSeconds <= 10) {
      const playedKey = `${soundRoundKey}:${remainingSeconds}`;
      if (playedSecondKeysRef.current.has(playedKey)) return;

      playedSecondKeysRef.current.add(playedKey);
      playCountdownSound("/sounds/countdown-beep.mp3");
      return;
    }

    if (remainingSeconds === 0) {
      const endSoundKey = `${soundRoundKey}:end`;
      if (endSoundPlayedKeysRef.current.has(endSoundKey)) return;

      endSoundPlayedKeysRef.current.add(endSoundKey);
      playCountdownSound("/sounds/countdown-end.mp3");
    }
  }, [
    currentRoundEndAt,
    currentTargetParticipantId,
    hasMounted,
    hasTarget,
    isRunning,
    isSoundEnabled,
    remainingSeconds,
    soundRoundKey,
  ]);

  useEffect(() => {
    if (!hasMounted || !isOwner || !isRunning || !hasTarget || !currentTargetParticipantId || !currentRoundEndAt) return;
    if (remainingSeconds > 0) return;
    if (isAutoFinalizingRef.current || autoFinalizeKeysRef.current.has(roundKey)) return;

    const finalizeRoundKey = roundKey;
    const endSoundKey = `${soundRoundKey}:end`;

    if (isSoundEnabled && !endSoundPlayedKeysRef.current.has(endSoundKey)) {
      endSoundPlayedKeysRef.current.add(endSoundKey);
      playCountdownSound("/sounds/countdown-end.mp3");
    }

    const timeout = window.setTimeout(() => {
      if (roundKeyRef.current !== finalizeRoundKey) return;
      if (isAutoFinalizingRef.current || autoFinalizeKeysRef.current.has(roundKey)) return;

      autoFinalizeKeysRef.current.add(roundKey);
      isAutoFinalizingRef.current = true;

      const formData = new FormData();
      formData.set("auctionId", auctionId);
      formData.set("auctionCode", auctionCode);

      startAutoFinalizeTransition(async () => {
        const result = await finalizeRound(initialState, formData);

        if (result.error && !result.noop && result.reason !== "ROUND_NOT_ENDED") {
          console.error("[auction-auto-finalize] Failed", {
            reason: result.reason ?? result.error,
            auctionId,
            auctionCode,
            currentTargetParticipantId,
            currentRoundEndAt,
            now: new Date().toISOString(),
            isOwner,
          });
        }

        isAutoFinalizingRef.current = false;
        router.refresh();
      });
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    auctionCode,
    auctionId,
    currentTargetParticipantId,
    currentRoundEndAt,
    hasMounted,
    hasTarget,
    isOwner,
    isRunning,
    isSoundEnabled,
    remainingSeconds,
    router,
    roundKey,
    soundRoundKey,
  ]);

  return (
    <Card className="p-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Info
          action={
            <button
              className="rounded border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
              onClick={() => setIsSoundEnabled((currentValue) => !currentValue)}
              type="button"
            >
              {isSoundEnabled ? "효과음 켜짐" : "효과음 꺼짐"}
            </button>
          }
          label="남은 시간"
          value={hasMounted && isRunning && hasTarget ? `${Math.max(remainingSeconds, 0)}초` : "-"}
          strong
        />
        <Info label="현재 최고 입찰 팀" value={currentBidTeamName} strong />
        <Info label="현재 최고 입찰가" value={`${currentBidAmount}P`} strong />
      </div>
      {isTimeOver && isRunning && hasTarget ? (
        <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          {isOwner ? "라운드 종료를 자동 처리하는 중입니다." : "라운드 종료 대기 중입니다."}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {presetAmounts.map((amount) => (
          <form action={bidAction} key={amount}>
            <input name="auctionId" type="hidden" value={auctionId} />
            <input name="auctionCode" type="hidden" value={auctionCode} />
            <input name="bidAmount" type="hidden" value={amount} />
            <Button disabled={bidDisabled} type="submit" variant="secondary">
              {amount - currentBidAmount > 0 ? `+${amount - currentBidAmount}` : amount} ({amount}P)
            </Button>
          </form>
        ))}
        <form action={bidAction} className="flex min-w-[190px] gap-2">
          <input name="auctionId" type="hidden" value={auctionId} />
          <input name="auctionCode" type="hidden" value={auctionCode} />
          <Input
            className="min-w-0 flex-1"
            disabled={bidDisabled}
            min={5}
            name="bidAmount"
            onChange={(event) => setDirectAmount(event.target.value)}
            placeholder="직접 입력"
            step={5}
            type="number"
            value={directAmount}
          />
          <Button className="min-w-14 whitespace-nowrap" disabled={bidDisabled || !directBidAmount} type="submit">
            입찰
          </Button>
        </form>
      </div>
      {!canBid && !isTeamFull ? <p className="mt-3 text-xs text-slate-500">팀장만 입찰할 수 있습니다.</p> : null}
      {isCurrentBidderTeam ? (
        <p className="mt-3 text-xs text-amber-200">현재 최고 입찰 팀은 추가 입찰할 수 없습니다.</p>
      ) : null}
      {isTeamFull ? <p className="mt-3 text-xs text-amber-200">팀 정원이 가득 찼습니다.</p> : null}
      {bidState.error ? <p className="mt-3 text-sm text-rose-300">{bidState.error}</p> : null}
      {bidState.success ? <p className="mt-3 text-sm text-cyan-200">{bidState.success}</p> : null}
      {isOwner && isRunning && hasTarget ? (
        <form action={finalizeAction} className="mt-4">
          <input name="auctionId" type="hidden" value={auctionId} />
          <input name="auctionCode" type="hidden" value={auctionCode} />
          <input name="forceFinalize" type="hidden" value="true" />
          <Button disabled={isFinalizing || isAutoFinalizing} type="submit" variant={isTimeOver ? "primary" : "secondary"}>
            {isTimeOver ? "라운드 종료 처리" : "라운드 강제 종료"}
          </Button>
        </form>
      ) : null}
      {finalizeState.error ? <p className="mt-3 text-sm text-rose-300">{finalizeState.error}</p> : null}
      {finalizeState.success ? <p className="mt-3 text-sm text-cyan-200">{finalizeState.success}</p> : null}
    </Card>
  );
}

function getRemainingSeconds(date: string | null) {
  if (!date) return 0;
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 1000));
}

function playCountdownSound(src: string) {
  const audio = new Audio(src);
  audio.currentTime = 0;
  audio.play().catch((error: unknown) => {
    console.warn("[auction-countdown-sound] play failed", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      src,
    });
  });
}

function Info({
  action,
  label,
  value,
  strong = false,
}: {
  action?: ReactNode;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">{label}</p>
        {action}
      </div>
      <p className={strong ? "mt-1 text-xl font-black text-cyan-200" : "mt-1 text-sm font-semibold text-slate-100"}>
        {value}
      </p>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finalizeRound,
  pauseAuction,
  placeBid,
  resumeAuction,
  rollbackPreviousRound,
  startAuction,
  type AuctionActionState,
} from "@/app/auctions/[code]/actions";
import { Button, Card, Input } from "@/components/ui";

const initialState: AuctionActionState = {};
const BID_GRACE_PERIOD_MS = 2000;
const FINALIZE_SETTLE_DELAY_MS = 1000;
const DEFAULT_SOUND_VOLUME = 0.4;
const END_SOUND_VOLUME_MULTIPLIER = 0.8;

type AuctionStartControlProps = {
  auctionId: string;
  auctionCode: string;
  disabled: boolean;
  isOwner: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isFinished: boolean;
};

export function AuctionStartControl({
  auctionId,
  auctionCode,
  disabled,
  isOwner,
  isRunning,
  isPaused,
  isFinished,
}: AuctionStartControlProps) {
  const [state, formAction, isPending] = useActionState(startAuction, initialState);

  if (isRunning) {
    return <span className="text-sm font-semibold text-cyan-200">경매 진행 중</span>;
  }

  if (isPaused) {
    return <span className="text-sm font-semibold text-amber-200">경매 일시중지</span>;
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

type AuctionOwnerControlsProps = {
  auctionCode: string;
  auctionId: string;
  canRollback: boolean;
  isOwner: boolean;
  isPaused: boolean;
  isRunning: boolean;
};

export function AuctionOwnerControls({
  auctionCode,
  auctionId,
  canRollback,
  isOwner,
  isPaused,
  isRunning,
}: AuctionOwnerControlsProps) {
  const router = useRouter();
  const [pauseState, pauseAction, isPausing] = useActionState(pauseAuction, initialState);
  const [resumeState, resumeAction, isResuming] = useActionState(resumeAuction, initialState);
  const [rollbackState, rollbackAction, isRollingBack] = useActionState(rollbackPreviousRound, initialState);

  useEffect(() => {
    if (!pauseState.success && !resumeState.success && !rollbackState.success) return;
    router.refresh();
  }, [pauseState.success, resumeState.success, rollbackState.success, router]);

  if (!isOwner || (!isRunning && !isPaused)) return null;

  return (
    <Card className="p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">방장 경매 제어</p>
          <p className="mt-1 text-xs text-slate-500">일시정지하거나 직전 라운드 상태로 되돌릴 수 있습니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isRunning ? (
            <form action={pauseAction}>
              <input name="auctionId" type="hidden" value={auctionId} />
              <input name="auctionCode" type="hidden" value={auctionCode} />
              <Button disabled={isPausing} size="sm" type="submit" variant="secondary">
                {isPausing ? "정지 중..." : "경매 일시정지"}
              </Button>
            </form>
          ) : null}
          {isPaused ? (
            <form action={resumeAction}>
              <input name="auctionId" type="hidden" value={auctionId} />
              <input name="auctionCode" type="hidden" value={auctionCode} />
              <Button disabled={isResuming} size="sm" type="submit" variant="secondary">
                {isResuming ? "재개 중..." : "경매 재개"}
              </Button>
            </form>
          ) : null}
          <form
            action={rollbackAction}
            onSubmit={(event) => {
              const confirmed = window.confirm(
                "직전 경매 라운드로 되돌릴까요? 해당 라운드 이후의 입찰/낙찰 상태가 되돌아갑니다.",
              );
              if (!confirmed) event.preventDefault();
            }}
          >
            <input name="auctionId" type="hidden" value={auctionId} />
            <input name="auctionCode" type="hidden" value={auctionCode} />
            <Button disabled={!canRollback || isRollingBack} size="sm" type="submit" variant="danger">
              {isRollingBack ? "되돌리는 중..." : "이전 경매로 되돌리기"}
            </Button>
          </form>
        </div>
      </div>
      {pauseState.error ? <p className="mt-2 text-xs text-rose-300">{pauseState.error}</p> : null}
      {resumeState.error ? <p className="mt-2 text-xs text-rose-300">{resumeState.error}</p> : null}
      {rollbackState.error ? <p className="mt-2 text-xs text-rose-300">{rollbackState.error}</p> : null}
      {pauseState.success ? <p className="mt-2 text-xs text-cyan-200">{pauseState.success}</p> : null}
      {resumeState.success ? <p className="mt-2 text-xs text-cyan-200">{resumeState.success}</p> : null}
      {rollbackState.success ? <p className="mt-2 text-xs text-cyan-200">{rollbackState.success}</p> : null}
    </Card>
  );
}

type BidControlProps = {
  auctionId: string;
  auctionCode: string;
  currentBidAmount: number;
  currentBidTeamId: string | null;
  currentBidTeamName: string;
  currentTargetParticipantId: string | null;
  currentRoundEndAt: string | null;
  canBid: boolean;
  currentUserTeamId: string | null;
  currentUserTeamPointsLeft: number | null;
  isCurrentBidderTeam: boolean;
  isTeamFull: boolean;
  isOwner: boolean;
  isPaused: boolean;
  isRunning: boolean;
  hasTarget: boolean;
  pausedRemainingMs: number | null;
};

export function BidControls({
  auctionId,
  auctionCode,
  currentBidAmount,
  currentBidTeamId,
  currentBidTeamName,
  currentTargetParticipantId,
  currentRoundEndAt,
  canBid,
  currentUserTeamId,
  currentUserTeamPointsLeft,
  isCurrentBidderTeam,
  isTeamFull,
  isOwner,
  isPaused,
  isRunning,
  hasTarget,
  pausedRemainingMs,
}: BidControlProps) {
  const router = useRouter();
  const [bidState, bidAction, isBidding] = useActionState(placeBid, initialState);
  const [finalizeState, finalizeAction, isFinalizing] = useActionState(finalizeRound, initialState);
  const [isAutoFinalizing, startAutoFinalizeTransition] = useTransition();
  const [directAmount, setDirectAmount] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(DEFAULT_SOUND_VOLUME);
  const [isSoundSettingsLoaded, setIsSoundSettingsLoaded] = useState(false);
  const autoFinalizeKeysRef = useRef<Set<string>>(new Set());
  const autoFinalizeInFlightKeyRef = useRef<string | null>(null);
  const endSoundPlayedKeysRef = useRef<Set<string>>(new Set());
  const playedSecondKeysRef = useRef<Set<string>>(new Set());
  const previousBidDisabledDebugSignatureRef = useRef<string | null>(null);
  const previousBidSignatureRef = useRef<string | null>(null);
  const roundKeyRef = useRef("");
  const soundCycleKeyRef = useRef("");
  const [isBidHighlightActive, setIsBidHighlightActive] = useState(false);

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

    const updateRemainingTime = () => {
      const nextRemainingMs = getRemainingMs(currentRoundEndAt);
      setRemainingMs(nextRemainingMs);
      setRemainingSeconds(Math.max(0, Math.ceil(nextRemainingMs / 1000)));
    };
    const initialTimer = window.setTimeout(updateRemainingTime, 0);
    const timer = window.setInterval(() => {
      updateRemainingTime();
    }, 250);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [currentRoundEndAt, hasMounted]);

  const isTimeOver = hasMounted ? remainingSeconds <= 0 : true;
  const isBidGraceExpired = hasMounted ? remainingMs < -BID_GRACE_PERIOD_MS : true;
  const isGracePeriodActive = isTimeOver && isRunning && hasTarget && !isBidGraceExpired;
  const baseBidDisabled = !canBid || isCurrentBidderTeam || !isRunning || !hasTarget || isBidGraceExpired || isBidding;
  const directBidAmount = Number(directAmount);
  const debugRemainingSeconds = Math.ceil(remainingMs / 1000);
  const hasEnoughPointsForDirectBid =
    typeof currentUserTeamPointsLeft === "number" && directBidAmount > 0
      ? directBidAmount <= currentUserTeamPointsLeft
      : true;
  const pausedRemainingSeconds =
    typeof pausedRemainingMs === "number" ? Math.max(0, Math.ceil(pausedRemainingMs / 1000)) : null;
  const remainingTimeLabel =
    hasMounted && isRunning && hasTarget
      ? `${Math.max(remainingSeconds, 0)}초`
      : isPaused && pausedRemainingSeconds !== null
        ? `${pausedRemainingSeconds}초`
        : "-";
  const roundKey = `${currentTargetParticipantId ?? "no-target"}:${currentRoundEndAt ?? "no-round"}`;
  const soundCycleKey = `${auctionId}:${currentTargetParticipantId ?? "no-target"}:${currentRoundEndAt ?? "no-round"}`;

  const presetAmounts = useMemo(
    () => [5, 10, 50, 100].map((increment) => currentBidAmount + increment),
    [currentBidAmount],
  );
  const disabledReasons = useMemo(() => {
    const reasons: string[] = [];

    if (!currentUserTeamId) reasons.push("not-captain");
    if (!canBid) reasons.push("cannot-bid");
    if (isCurrentBidderTeam) reasons.push("current-highest-bidder-team");
    if (!isRunning) reasons.push("not-running");
    if (isPaused) reasons.push("paused");
    if (!hasTarget) reasons.push("no-target");
    if (isTeamFull) reasons.push("team-full");
    if (isBidGraceExpired) reasons.push("grace-expired");
    if (isBidding) reasons.push("bidding-pending");

    return reasons;
  }, [
    canBid,
    currentUserTeamId,
    hasTarget,
    isBidGraceExpired,
    isBidding,
    isCurrentBidderTeam,
    isPaused,
    isRunning,
    isTeamFull,
  ]);

  useEffect(() => {
    const storedValue = window.localStorage.getItem("auction-countdown-sound");
    if (storedValue === "off") setIsSoundEnabled(false);
    if (storedValue === "on") setIsSoundEnabled(true);

    const storedVolume = parseStoredVolume(window.localStorage.getItem("auction-countdown-volume"));
    setSoundVolume(storedVolume);
    setIsSoundSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isSoundSettingsLoaded) return;
    window.localStorage.setItem("auction-countdown-sound", isSoundEnabled ? "on" : "off");
  }, [isSoundEnabled, isSoundSettingsLoaded]);

  useEffect(() => {
    if (!isSoundSettingsLoaded) return;
    const volume = clampVolume(soundVolume);
    window.localStorage.setItem("auction-countdown-volume", String(volume));
  }, [isSoundSettingsLoaded, soundVolume]);

  useEffect(() => {
    if (!bidState.success) return;
    console.log("[auction-bid-client] bid action success", {
      auctionId,
      message: bidState.success,
    });
    console.log("[auction-bid-client] router.refresh called", { auctionId });
    router.refresh();
  }, [auctionId, bidState.success, router]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const debugSignature = JSON.stringify({
      currentBidTeamId,
      currentUserTeamId,
      debugRemainingSeconds,
      disabledReasons,
      hasEnoughPointsForDirectBid,
      isCurrentBidderTeam,
    });
    if (previousBidDisabledDebugSignatureRef.current === debugSignature) return;
    previousBidDisabledDebugSignatureRef.current = debugSignature;

    console.log("[auction-bid-disabled]", {
      auctionId,
      currentBidTeamId,
      disabledReasons,
      hasEnoughPoints: hasEnoughPointsForDirectBid,
      isCaptain: Boolean(currentUserTeamId),
      isCurrentHighestBidder: isCurrentBidderTeam,
      isPaused,
      isRunning,
      isTeamFull,
      myTeamId: currentUserTeamId,
      remainingMs,
    });
  }, [
    auctionId,
    currentBidTeamId,
    currentUserTeamId,
    debugRemainingSeconds,
    disabledReasons,
    hasEnoughPointsForDirectBid,
    isCurrentBidderTeam,
    isPaused,
    isRunning,
    isTeamFull,
    remainingMs,
  ]);

  useEffect(() => {
    if (!hasMounted) return;

    const bidSignature = `${currentBidTeamName}:${currentBidAmount}`;
    if (previousBidSignatureRef.current === null) {
      previousBidSignatureRef.current = bidSignature;
      return;
    }

    if (previousBidSignatureRef.current === bidSignature) return;

    previousBidSignatureRef.current = bidSignature;
    if (currentBidAmount <= 0) return;

    setIsBidHighlightActive(true);
    const timeout = window.setTimeout(() => {
      setIsBidHighlightActive(false);
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [currentBidAmount, currentBidTeamName, hasMounted]);

  useEffect(() => {
    roundKeyRef.current = roundKey;
  }, [roundKey]);

  useEffect(() => {
    if (soundCycleKeyRef.current === soundCycleKey) return;

    soundCycleKeyRef.current = soundCycleKey;
    endSoundPlayedKeysRef.current.clear();
    playedSecondKeysRef.current.clear();
    console.log("[auction-countdown-sound] sound cycle reset", {
      auctionId,
      currentRoundEndAt,
      currentTargetParticipantId,
    });
  }, [auctionId, currentRoundEndAt, currentTargetParticipantId, soundCycleKey]);

  useEffect(() => {
    if (!hasMounted || !isRunning || !hasTarget || !currentTargetParticipantId || !currentRoundEndAt) return;
    if (!isSoundEnabled) {
      if (remainingSeconds >= 1 && remainingSeconds <= 10) {
        console.log("[auction-countdown-sound] skipped because sound disabled", {
          auctionId,
          remainingSeconds,
        });
      }
      return;
    }

    if (remainingSeconds >= 1 && remainingSeconds <= 10) {
      const playedKey = `${soundCycleKey}:${remainingSeconds}`;
      if (playedSecondKeysRef.current.has(playedKey)) return;

      playedSecondKeysRef.current.add(playedKey);
      console.log("[auction-countdown-sound] play beep", {
        auctionId,
        remainingSeconds,
      });
      playCountdownSound("/sounds/countdown-beep.mp3", soundVolume);
    }
  }, [
    auctionId,
    currentRoundEndAt,
    currentTargetParticipantId,
    hasMounted,
    hasTarget,
    isRunning,
    isSoundEnabled,
    remainingSeconds,
    soundCycleKey,
    soundVolume,
  ]);

  useEffect(() => {
    if (!hasMounted || !isRunning || !hasTarget || !currentTargetParticipantId || !currentRoundEndAt) return;

    const scheduledSoundCycleKey = soundCycleKey;
    const delayMs = Math.max(0, new Date(currentRoundEndAt).getTime() - Date.now());

    const timeout = window.setTimeout(() => {
      if (soundCycleKeyRef.current !== scheduledSoundCycleKey) {
        console.log("[auction-countdown-sound] skipped stale end sound", {
          auctionId,
          currentSoundCycleKey: soundCycleKeyRef.current,
          scheduledSoundCycleKey,
        });
        return;
      }

      if (!isSoundEnabled) {
        console.log("[auction-countdown-sound] skipped because sound disabled", {
          auctionId,
          remainingSeconds: 0,
        });
        return;
      }

      const endSoundKey = `${soundCycleKey}:end`;
      if (endSoundPlayedKeysRef.current.has(endSoundKey)) return;

      endSoundPlayedKeysRef.current.add(endSoundKey);
      console.log("[auction-countdown-sound] play end at zero", { auctionId, soundCycleKey });
      playCountdownSound("/sounds/countdown-end.mp3", soundVolume * END_SOUND_VOLUME_MULTIPLIER);
    }, delayMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    auctionId,
    currentRoundEndAt,
    currentTargetParticipantId,
    hasMounted,
    hasTarget,
    isRunning,
    isSoundEnabled,
    soundCycleKey,
    soundVolume,
  ]);

  useEffect(() => {
    if (!isGracePeriodActive) return;

    console.log("[auction-ui] grace period active", {
      auctionId,
    });
    console.log("[auction-ui] waiting message shown below controls", { auctionId });
  }, [auctionId, isGracePeriodActive]);

  useEffect(() => {
    if (!hasMounted || !isOwner || !isRunning || !hasTarget || !currentTargetParticipantId || !currentRoundEndAt) return;
    if (remainingSeconds > 0) return;
    if (autoFinalizeKeysRef.current.has(roundKey)) return;

    const finalizeRoundKey = roundKey;
    const finalizeDelayMs = Math.max(0, BID_GRACE_PERIOD_MS + FINALIZE_SETTLE_DELAY_MS + remainingMs);

    console.log("[auction-timer] zero reached", { auctionId, roundKey: finalizeRoundKey });
    console.log("[auction-timer] finalize scheduled", {
      auctionId,
      delayMs: finalizeDelayMs,
      gracePeriodMs: BID_GRACE_PERIOD_MS,
      roundKey: finalizeRoundKey,
      settleDelayMs: FINALIZE_SETTLE_DELAY_MS,
    });

    const timeout = window.setTimeout(() => {
      if (roundKeyRef.current !== finalizeRoundKey) {
        console.log("[auction-timer] finalize cancelled stale round", {
          auctionId,
          currentRoundKey: roundKeyRef.current,
          scheduledRoundKey: finalizeRoundKey,
        });
        return;
      }
      if (
        autoFinalizeInFlightKeyRef.current === finalizeRoundKey ||
        autoFinalizeKeysRef.current.has(finalizeRoundKey)
      ) {
        console.log("[auction-timer] finalize skipped because round extended", {
          auctionId,
          inFlightRoundKey: autoFinalizeInFlightKeyRef.current,
          roundKey: finalizeRoundKey,
        });
        return;
      }

      autoFinalizeKeysRef.current.add(finalizeRoundKey);
      autoFinalizeInFlightKeyRef.current = finalizeRoundKey;
      console.log("[auction-timer] finalize executing", { auctionId, roundKey: finalizeRoundKey });

      const formData = new FormData();
      formData.set("auctionId", auctionId);
      formData.set("auctionCode", auctionCode);
      formData.set("targetParticipantId", currentTargetParticipantId);
      formData.set("currentRoundEndAt", currentRoundEndAt);

      startAutoFinalizeTransition(async () => {
        const result = await finalizeRound(initialState, formData);

        if (result.error || result.noop) {
          autoFinalizeKeysRef.current.delete(finalizeRoundKey);
        }

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

        if (autoFinalizeInFlightKeyRef.current === finalizeRoundKey) {
          autoFinalizeInFlightKeyRef.current = null;
        }
        router.refresh();
      });
    }, finalizeDelayMs);

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
    remainingMs,
    remainingSeconds,
    router,
    roundKey,
  ]);

  return (
    <Card className="p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.8fr)]">
        <Info
          action={
            <SoundControl
              isEnabled={isSoundEnabled}
              onToggle={() => setIsSoundEnabled((currentValue) => !currentValue)}
              onVolumeChange={(nextVolume) => {
                const volume = clampVolume(nextVolume);
                setSoundVolume(volume);
                console.log("[auction-countdown-sound] volume changed", {
                  auctionId,
                  volume,
                });
              }}
              volume={soundVolume}
            />
          }
          label="남은 시간"
          value={remainingTimeLabel}
          strong
        />
        <CurrentBidSummary
          amount={currentBidAmount}
          isHighlightActive={isBidHighlightActive}
          isMyTeamHighest={isCurrentBidderTeam}
          teamName={currentBidTeamName}
        />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {presetAmounts.map((amount) => (
          <form action={bidAction} key={amount}>
            <input name="auctionId" type="hidden" value={auctionId} />
            <input name="auctionCode" type="hidden" value={auctionCode} />
            <input name="targetParticipantId" type="hidden" value={currentTargetParticipantId ?? ""} />
            <input name="bidAmount" type="hidden" value={amount} />
            <Button
              disabled={
                baseBidDisabled ||
                (typeof currentUserTeamPointsLeft === "number" && amount > currentUserTeamPointsLeft)
              }
              type="submit"
              variant="secondary"
            >
              {amount - currentBidAmount > 0 ? `+${amount - currentBidAmount}` : amount} ({amount}P)
            </Button>
          </form>
        ))}
        <form action={bidAction} className="flex min-w-[190px] gap-2">
          <input name="auctionId" type="hidden" value={auctionId} />
          <input name="auctionCode" type="hidden" value={auctionCode} />
          <input name="targetParticipantId" type="hidden" value={currentTargetParticipantId ?? ""} />
          <Input
            className="min-w-0 flex-1"
            disabled={baseBidDisabled}
            min={5}
            name="bidAmount"
            onChange={(event) => setDirectAmount(event.target.value)}
            placeholder="직접 입력"
            step={5}
            type="number"
            value={directAmount}
          />
          <Button
            className="min-w-14 whitespace-nowrap"
            disabled={baseBidDisabled || !directBidAmount || !hasEnoughPointsForDirectBid}
            type="submit"
          >
            입찰
          </Button>
        </form>
      </div>
      <div className="mt-3 min-h-[42px]">
        {isTimeOver && isRunning && hasTarget ? (
          <p className="rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            {isOwner ? "라운드 종료를 자동 처리하는 중입니다." : "라운드 종료 대기 중입니다."}
          </p>
        ) : null}
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
          <input name="targetParticipantId" type="hidden" value={currentTargetParticipantId ?? ""} />
          <input name="currentRoundEndAt" type="hidden" value={currentRoundEndAt ?? ""} />
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

function getRemainingMs(date: string | null) {
  if (!date) return 0;
  return new Date(date).getTime() - Date.now();
}

function playCountdownSound(src: string, volume: number) {
  const audio = new Audio(src);
  audio.currentTime = 0;
  audio.volume = clampVolume(volume);
  audio.play().catch((error: unknown) => {
    console.warn("[auction-countdown-sound] play failed", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      src,
    });
  });
}

function parseStoredVolume(value: string | null) {
  if (!value) return DEFAULT_SOUND_VOLUME;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return DEFAULT_SOUND_VOLUME;

  return clampVolume(parsedValue);
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SOUND_VOLUME;
  return Math.min(1, Math.max(0, value));
}

function SoundControl({
  isEnabled,
  onToggle,
  onVolumeChange,
  volume,
}: {
  isEnabled: boolean;
  onToggle: () => void;
  onVolumeChange: (volume: number) => void;
  volume: number;
}) {
  const displayVolume = Math.round(clampVolume(volume) * 100);

  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <button
        aria-label={isEnabled ? "효과음 끄기" : "효과음 켜기"}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
          isEnabled
            ? "border-white/15 bg-white/10 text-slate-100 hover:bg-white/15"
            : "border-white/10 bg-transparent text-slate-500 hover:bg-white/10 hover:text-slate-200"
        }`}
        onClick={onToggle}
        title={isEnabled ? "효과음 끄기" : "효과음 켜기"}
        type="button"
      >
        {isEnabled ? <VolumeIcon /> : <MutedVolumeIcon />}
      </button>
      <label className={`flex shrink-0 items-center gap-2 text-[11px] text-slate-500 ${isEnabled ? "" : "opacity-50"}`}>
        <span className="sr-only">효과음 볼륨</span>
        <input
          aria-label="효과음 볼륨"
          className="h-1.5 w-20 accent-[var(--accent)] disabled:cursor-not-allowed"
          disabled={!isEnabled}
          max={1}
          min={0}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          step={0.05}
          type="range"
          value={clampVolume(volume)}
        />
        <span className="w-8 text-right font-semibold text-slate-400">{displayVolume}%</span>
      </label>
    </div>
  );
}

function CurrentBidSummary({
  amount,
  isHighlightActive,
  isMyTeamHighest,
  teamName,
}: {
  amount: number;
  isHighlightActive: boolean;
  isMyTeamHighest: boolean;
  teamName: string;
}) {
  const hasBid = amount > 0;
  const statusLabel = !hasBid
    ? "아직 입찰 없음"
    : isMyTeamHighest
      ? "내 팀 최고 입찰 중"
      : `${teamName} 최고 입찰 중`;
  const toneClass = !hasBid
    ? "border-white/10 bg-slate-950/60"
    : isMyTeamHighest
      ? "border-emerald-300/40 bg-emerald-400/10"
      : "border-amber-300/50 bg-amber-400/10";

  return (
    <div
      className={`relative overflow-hidden rounded-md border p-4 transition-all duration-500 ${toneClass} ${
        isHighlightActive ? "shadow-lg shadow-amber-500/15 ring-2 ring-amber-300/60" : ""
      }`}
    >
      {hasBid ? (
        <div className="absolute inset-y-0 left-0 w-1 bg-amber-300/80" aria-hidden="true" />
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1 pl-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-slate-500">현재 최고 입찰</p>
            {isHighlightActive ? (
              <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-2 py-0.5 text-[10px] font-black text-amber-100">
                새 입찰
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-lg font-black text-white sm:text-xl">{hasBid ? teamName : "입찰 전"}</p>
          <p className={isMyTeamHighest ? "mt-1 text-xs font-semibold text-emerald-200" : "mt-1 text-xs font-semibold text-amber-200"}>
            {statusLabel}
          </p>
        </div>
        <div className="shrink-0 rounded-md border border-white/10 bg-slate-950/50 px-3 py-2 text-right sm:w-[150px]">
          <p className="text-[11px] font-semibold text-slate-500">최고 입찰가</p>
          <p className={hasBid ? "mt-1 text-2xl font-black text-amber-100" : "mt-1 text-2xl font-black text-slate-300"}>
            {amount.toLocaleString()}P
          </p>
        </div>
      </div>
    </div>
  );
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
      <div className="grid min-h-[58px] grid-cols-[minmax(80px,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-xs text-slate-500">{label}</p>
          <p className={strong ? "mt-1 whitespace-nowrap text-3xl font-black leading-none text-cyan-200" : "mt-1 whitespace-nowrap text-sm font-semibold text-slate-100"}>
            {value}
          </p>
        </div>
        {action ? <div className="min-w-[160px] justify-self-end">{action}</div> : null}
      </div>
    </div>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function MutedVolumeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="m17 9 4 4m0-4-4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

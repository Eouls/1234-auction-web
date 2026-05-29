"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, ChampionIconPlaceholder, RoleBadge } from "@/components/ui";
import type { LolRole } from "@/types/auction";

type ChampionIcon = {
  id: string;
  imageUrl: string | null;
  name: string;
} | null;

type ParticipantGridItem = {
  auctionStats: {
    averageSoldPrice: number;
    lastSoldPrice: number | null;
    soldCount: number;
  } | null;
  champions: [ChampionIcon, ChampionIcon, ChampionIcon];
  currentRank: string | null;
  currentTier: string | null;
  id: string;
  imageUrl: string | null;
  isCurrentTarget: boolean;
  lolAccount: string | null;
  mainRole: LolRole | null;
  nickname: string;
  peakRank: string | null;
  peakTier: string | null;
  soldLabel: string | null;
  soldPrice: number | null;
  status: string;
  subRole: LolRole | null;
  tierBorderClass: string;
};

type OverlayPosition = {
  left: number;
  top: number;
};

const participantStatusLabels: Record<string, string> = {
  WAITING: "대기중",
  CAPTAIN: "팀장",
  SOLD: "낙찰됨",
  BIDDING: "현재",
  UNSOLD: "재경매 대기",
};

const participantStatusColors: Record<string, string> = {
  WAITING: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-slate-300/20 dark:bg-slate-400/10 dark:text-slate-300",
  CAPTAIN: "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-300/40 dark:bg-cyan-400/10 dark:text-cyan-200",
  SOLD: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-400/10 dark:text-emerald-200",
  BIDDING: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-300/40 dark:bg-amber-400/10 dark:text-amber-200",
  UNSOLD: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-300/40 dark:bg-amber-400/10 dark:text-amber-200",
};

export function AuctionParticipantGrid({ participants }: { participants: ParticipantGridItem[] }) {
  const [activeOverlay, setActiveOverlay] = useState<{
    participant: ParticipantGridItem;
    position: OverlayPosition;
  } | null>(null);
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const hideOverlay = useCallback(() => {
    setIsOverlayVisible(false);

    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
    }

    hideTimeoutRef.current = window.setTimeout(() => {
      setActiveOverlay(null);
      hideTimeoutRef.current = null;
    }, 180);
  }, []);

  const showOverlay = useCallback((participant: ParticipantGridItem, element: HTMLElement) => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const rect = element.getBoundingClientRect();
    const overlayWidth = Math.min(320, window.innerWidth - 16);
    const gap = 12;
    const viewportPadding = 8;
    let left = rect.left - overlayWidth - gap;

    if (left < viewportPadding) {
      left = rect.right + gap;
    }

    const maxLeft = Math.max(viewportPadding, window.innerWidth - overlayWidth - viewportPadding);
    left = Math.min(Math.max(viewportPadding, left), maxLeft);

    const maxTop = Math.max(viewportPadding, window.innerHeight - 420 - viewportPadding);
    const top = Math.min(Math.max(viewportPadding, rect.top), maxTop);

    setActiveOverlay({
      participant,
      position: { left, top },
    });
    window.requestAnimationFrame(() => setIsOverlayVisible(true));
  }, []);

  return (
    <>
      <div className="grid max-h-[560px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
        {participants.map((participant) => {
          const currentTargetClass = participant.isCurrentTarget
            ? "shadow-sm ring-2 ring-amber-300/70 ring-offset-1 ring-offset-[var(--card)]"
            : "";
          const participantCardBackground = participant.isCurrentTarget
            ? "color-mix(in srgb, #fbbf24 12%, var(--card))"
            : "var(--card)";

          return (
            <button
              aria-label={`${participant.nickname} 상세 정보 보기`}
              className={`relative flex min-h-24 flex-col items-center justify-center rounded-md border-2 px-1.5 py-1.5 text-center transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--border-strong)] ${participant.tierBorderClass} ${currentTargetClass}`}
              data-current-target={participant.isCurrentTarget ? "true" : "false"}
              data-participant-card="true"
              key={participant.id}
              onBlur={hideOverlay}
              onClick={(event) => showOverlay(participant, event.currentTarget)}
              onFocus={(event) => showOverlay(participant, event.currentTarget)}
              onMouseEnter={(event) => showOverlay(participant, event.currentTarget)}
              onMouseLeave={hideOverlay}
              style={{ backgroundColor: participantCardBackground }}
              type="button"
            >
              <Avatar name={participant.nickname} size="sm" src={participant.imageUrl} />
              {participant.isCurrentTarget ? (
                <span className="absolute left-1 top-1 rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                  현재
                </span>
              ) : null}
              <p className="mt-1 w-full truncate text-[11px] font-bold text-[var(--foreground)]">
                {participant.nickname}
              </p>
              <div className="mt-1 flex max-w-full flex-wrap justify-center gap-0.5">
                {participant.mainRole ? <RoleBadge role={participant.mainRole} /> : null}
                <ParticipantStatusBadge compact isCurrentTarget={participant.isCurrentTarget} status={participant.status} />
              </div>
              {participant.soldLabel ? (
                <p className="mt-0.5 w-full truncate text-[10px] font-semibold text-emerald-700 dark:text-emerald-200">
                  {participant.soldLabel}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeOverlay ? (
        <ParticipantDetailOverlay
          participant={activeOverlay.participant}
          position={activeOverlay.position}
          visible={isOverlayVisible}
        />
      ) : null}
    </>
  );
}

function ParticipantDetailOverlay({
  participant,
  position,
  visible,
}: {
  participant: ParticipantGridItem;
  position: OverlayPosition;
  visible: boolean;
}) {
  return (
    <div
      className={`pointer-events-none fixed z-50 w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-[var(--border-strong)] bg-[var(--card)] p-4 text-left shadow-xl transition duration-200 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
      style={{
        left: position.left,
        top: position.top,
      }}
    >
      <div className="flex items-start gap-3">
        <Avatar name={participant.nickname} size="lg" src={participant.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-black text-[var(--foreground)]">{participant.nickname}</p>
              <p className="mt-1 truncate text-xs text-[var(--foreground-muted)]">
                {participant.lolAccount ?? "롤 계정 정보 없음"}
              </p>
            </div>
            <ParticipantStatusBadge isCurrentTarget={participant.isCurrentTarget} status={participant.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {participant.mainRole ? <RoleBadge role={participant.mainRole} /> : null}
            {participant.subRole ? <RoleBadge role={participant.subRole} /> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <DetailMetric label="현재 티어" value={formatTier(participant.currentTier, participant.currentRank)} />
        <DetailMetric label="최고 티어" value={formatTier(participant.peakTier, participant.peakRank)} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold text-[var(--foreground-muted)]">모스트 챔피언</p>
        <div className="mt-2 flex gap-2">
          {participant.champions.some(Boolean) ? (
            participant.champions.map((champion, index) =>
              champion?.imageUrl ? (
                <div className="min-w-0 text-center" key={champion.id}>
                  <img
                    alt={champion.name}
                    className="h-10 w-10 rounded-md border border-[var(--border)] object-cover"
                    src={champion.imageUrl}
                  />
                  <p className="mt-1 w-12 truncate text-[10px] text-[var(--foreground-muted)]">{champion.name}</p>
                </div>
              ) : (
                <ChampionIconPlaceholder key={`empty-${index}`} name="-" />
              ),
            )
          ) : (
            <span className="text-xs text-[var(--foreground-muted)]">모스트 챔피언 정보 없음</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <DetailMetric label="직전 낙찰가" value={formatPoint(participant.auctionStats?.lastSoldPrice)} />
        <DetailMetric
          helper={participant.auctionStats?.soldCount ? `${participant.auctionStats.soldCount.toLocaleString()}회 기준` : undefined}
          label="평균 낙찰가"
          value={
            participant.auctionStats?.soldCount
              ? formatPoint(Math.round(participant.auctionStats.averageSoldPrice))
              : "기록 없음"
          }
        />
      </div>
    </div>
  );
}

function DetailMetric({ helper, label, value }: { helper?: string; label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <p className="text-[11px] font-semibold text-[var(--foreground-muted)]">{label}</p>
      <p className="mt-1 text-sm font-black text-[var(--foreground)]">{value}</p>
      {helper ? <p className="mt-0.5 text-[10px] text-[var(--foreground-subtle)]">{helper}</p> : null}
    </div>
  );
}

function ParticipantStatusBadge({
  compact = false,
  isCurrentTarget = false,
  status,
}: {
  compact?: boolean;
  isCurrentTarget?: boolean;
  status: string;
}) {
  const displayStatus = isCurrentTarget ? "BIDDING" : status;

  return (
    <span
      className={`shrink-0 rounded-md border font-semibold ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
      } ${participantStatusColors[displayStatus] ?? participantStatusColors.WAITING}`}
    >
      {participantStatusLabels[displayStatus] ?? displayStatus}
    </span>
  );
}

function formatPoint(value?: number | null) {
  return typeof value === "number" ? `${value.toLocaleString()}P` : "기록 없음";
}

function formatTier(tier?: string | null, rank?: string | null) {
  return [tier, rank].filter(Boolean).join(" ") || "정보 없음";
}

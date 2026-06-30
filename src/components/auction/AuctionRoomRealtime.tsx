"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuctionRoomRealtimeProps = {
  auctionId: string;
  auctionStatus: string;
  currentBidTeamId: string | null;
  currentRoundEndAt: string | null;
  currentTargetParticipantId: string | null;
  currentUserTeamId: string | null;
  isCaptain: boolean;
};

const REFRESH_DEBOUNCE_MS = 400;
const FALLBACK_REFRESH_INTERVAL_MS = 7 * 1000;
const FOCUS_REFRESH_THROTTLE_MS = 2 * 1000;
const REALTIME_RESUBSCRIBE_DELAY_MS = 3 * 1000;

type RealtimeStatus = "CHANNEL_ERROR" | "CLOSED" | "SUBSCRIBED" | "TIMED_OUT" | string;

export function AuctionRoomRealtime({
  auctionId,
  auctionStatus,
  currentBidTeamId,
  currentRoundEndAt,
  currentTargetParticipantId,
  currentUserTeamId,
  isCaptain,
}: AuctionRoomRealtimeProps) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastFocusRefreshAtRef = useRef(0);
  const lastRealtimeStatusRef = useRef<RealtimeStatus | null>(null);
  const resubscribeTimeoutRef = useRef<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastRealtimeAt, setLastRealtimeAt] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("CONNECTING");
  const [resubscribeKey, setResubscribeKey] = useState(0);

  const channelName = `auction-room:${auctionId}`;
  const isAuctionLive = auctionStatus === "RUNNING" || auctionStatus === "PAUSED";
  const isRealtimeUnstable = realtimeStatus !== "SUBSCRIBED";

  useEffect(() => {
    let isActive = true;
    debugLog("[auction-realtime] component mounted", { auctionId });

    const supabase = createClient();

    function scheduleRefresh(reason: string) {
      if (refreshTimeoutRef.current !== null) {
        debugLog("[auction-sync] refresh already scheduled", { auctionId, reason });
        return;
      }

      debugLog("[auction-sync] fallback refresh", { auctionId, reason });
      setIsSyncing(true);

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        const refreshedAt = new Date().toISOString();
        setLastRefreshAt(refreshedAt);
        debugLog("[auction-realtime] router.refresh called", { auctionId, reason, refreshedAt });
        router.refresh();
        window.setTimeout(() => {
          if (isActive) setIsSyncing(false);
        }, 1500);
      }, REFRESH_DEBOUNCE_MS);
    }

    function scheduleResubscribe(status: RealtimeStatus) {
      if (resubscribeTimeoutRef.current !== null) return;

      resubscribeTimeoutRef.current = window.setTimeout(() => {
        resubscribeTimeoutRef.current = null;
        if (!isActive) return;
        debugLog("[auction-sync] realtime resubscribe requested", { auctionId, status });
        setResubscribeKey((currentValue) => currentValue + 1);
      }, REALTIME_RESUBSCRIBE_DELAY_MS);
    }

    const channel = supabase.channel(channelName);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isActive) return;

      debugLog("[auction-realtime] auth session", {
        hasSession: Boolean(session),
        hasUser: Boolean(session?.user),
        userId: session?.user?.id ?? null,
      });

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
        debugLog("[auction-realtime] realtime auth token applied", {
          auctionId,
          hasAccessToken: true,
        });
      }

      debugLog("[auction-realtime] subscribe start", { auctionId, channelName });

      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "Auction",
          },
          (payload) => {
            setLastRealtimeAt(new Date().toISOString());
            handleRealtimePayload(payload, auctionId, scheduleRefresh);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "AuctionBid",
          },
          (payload) => {
            const matchedAuctionId = getPayloadAuctionId(payload, "AuctionBid");
            const auctionIdMatches = matchedAuctionId === auctionId;
            debugLog("[auction-realtime] AuctionBid INSERT received", {
              auctionIdMatches,
              currentAuctionId: auctionId,
              eventType: payload.eventType,
              newAuctionId: payload.new?.auctionId ?? null,
              newAuction_id: payload.new?.auction_id ?? null,
              newKeys: Object.keys(payload.new ?? {}),
              matchedAuctionId,
              payloadNew: payload.new,
              schema: payload.schema,
              table: payload.table,
            });

            setLastRealtimeAt(new Date().toISOString());
            if (auctionIdMatches) scheduleRefresh("AuctionBid INSERT");
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "AuctionTeam",
          },
          (payload) => {
            setLastRealtimeAt(new Date().toISOString());
            handleRealtimePayload(payload, auctionId, scheduleRefresh);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "AuctionParticipant",
          },
          (payload) => {
            setLastRealtimeAt(new Date().toISOString());
            handleRealtimePayload(payload, auctionId, scheduleRefresh);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "ChatMessage",
          },
          (payload) => {
            setLastRealtimeAt(new Date().toISOString());
            handleRealtimePayload(payload, auctionId, scheduleRefresh);
          },
        )
        .subscribe((status, error) => {
          const previousStatus = lastRealtimeStatusRef.current;
          lastRealtimeStatusRef.current = status;
          setRealtimeStatus(status);
          debugLog("[auction-sync] realtime status changed", {
            auctionId,
            channelName,
            error: error
              ? {
                  message: error.message,
                  name: error.name,
                }
              : null,
            status,
          });

          if (status === "SUBSCRIBED") {
            debugLog("[auction-realtime] subscribed", { auctionId });
            if (previousStatus !== null) {
              scheduleRefresh("realtime-reconnected");
            }
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            scheduleRefresh(`realtime-${status.toLowerCase()}`);
            scheduleResubscribe(status);
          }
        });
    });

    return () => {
      isActive = false;
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (resubscribeTimeoutRef.current !== null) {
        window.clearTimeout(resubscribeTimeoutRef.current);
        resubscribeTimeoutRef.current = null;
      }

      debugLog("[auction-realtime] unsubscribed", { auctionId, channelName });

      supabase.removeChannel(channel);
    };
  }, [auctionId, channelName, resubscribeKey, router]);

  useEffect(() => {
    if (!isAuctionLive) return;

    const interval = window.setInterval(() => {
      debugLog("[auction-sync] fallback refresh", {
        auctionId,
        reason: "polling",
      });
      setIsSyncing(true);
      setLastRefreshAt(new Date().toISOString());
      router.refresh();
      window.setTimeout(() => setIsSyncing(false), 1500);
    }, FALLBACK_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [auctionId, isAuctionLive, router]);

  useEffect(() => {
    function refreshFromBrowserEvent(reason: "focus" | "visibilitychange") {
      if (document.visibilityState === "hidden") return;

      const now = Date.now();
      if (now - lastFocusRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      lastFocusRefreshAtRef.current = now;

      debugLog("[auction-sync] fallback refresh", {
        auctionId,
        reason,
      });
      setIsSyncing(true);
      setLastRefreshAt(new Date().toISOString());
      router.refresh();
      window.setTimeout(() => setIsSyncing(false), 1500);
    }

    function handleVisibilityChange() {
      refreshFromBrowserEvent("visibilitychange");
    }

    function handleFocus() {
      refreshFromBrowserEvent("focus");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [auctionId, router]);

  useEffect(() => {
    if (!isAuctionLive) return;
    if (!isRealtimeUnstable && !isSyncing) return;

    debugLog("[auction-sync] stale client detected", {
      auctionId,
      auctionStatus,
      currentRoundEndAt,
      currentTargetParticipantId,
      realtimeStatus,
    });
  }, [
    auctionId,
    auctionStatus,
    currentRoundEndAt,
    currentTargetParticipantId,
    isAuctionLive,
    isRealtimeUnstable,
    isSyncing,
    realtimeStatus,
  ]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("auction-sync-state", {
        detail: {
          auctionId,
          isRealtimeUnstable: isRealtimeUnstable && isSyncing,
          isSyncing,
          realtimeStatus,
        },
      }),
    );
  }, [auctionId, isRealtimeUnstable, isSyncing, realtimeStatus]);

  const debugPanel =
    process.env.NODE_ENV === "development" ? (
      <div className="fixed bottom-16 right-4 z-50 max-w-[min(360px,calc(100vw-2rem))] rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-[11px] leading-5 text-[var(--foreground-muted)] shadow-lg">
        <p className="font-bold text-[var(--foreground)]">auction sync debug</p>
        <p>realtimeStatus: {realtimeStatus}</p>
        <p>lastRealtimeAt: {lastRealtimeAt ?? "-"}</p>
        <p>lastRefreshAt: {lastRefreshAt ?? "-"}</p>
        <p>auctionStatus: {auctionStatus}</p>
        <p>currentRoundEndAt: {currentRoundEndAt ?? "-"}</p>
        <p>currentTargetParticipantId: {currentTargetParticipantId ?? "-"}</p>
        <p>currentBidTeamId: {currentBidTeamId ?? "-"}</p>
        <p>currentUserTeamId: {currentUserTeamId ?? "-"}</p>
        <p>isCaptain: {String(isCaptain)}</p>
      </div>
    ) : null;

  const shouldShowSyncNotice = isSyncing || isRealtimeUnstable;

  if (!shouldShowSyncNotice) return debugPanel;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-amber-300/40 bg-[var(--card)] px-3 py-2 text-xs font-medium text-[var(--foreground)] shadow-lg">
        {realtimeStatus === "SUBSCRIBED"
          ? "경매 상태 동기화 중..."
          : "실시간 연결이 불안정합니다. 상태를 다시 불러오는 중입니다."}
      </div>
      {debugPanel}
    </>
  );
}

type RealtimePayload = {
  eventType: string;
  errors?: unknown;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  schema: string;
  table: string;
};

function handleRealtimePayload(
  payload: RealtimePayload,
  auctionId: string,
  scheduleRefresh: (reason: string) => void,
) {
  const matchedAuctionId = getPayloadAuctionId(payload, payload.table);
  const auctionIdMatches = matchedAuctionId === auctionId;

  debugLog("[auction-realtime] event received", {
    auctionIdMatches,
    currentAuctionId: auctionId,
    eventType: payload.eventType,
    matchedAuctionId,
    newKeys: Object.keys(payload.new ?? {}),
    oldKeys: Object.keys(payload.old ?? {}),
    payloadErrors: payload.errors ?? null,
    table: payload.table,
  });

  if (payload.table === "Auction" && payload.eventType === "UPDATE") {
    debugLog("[auction-realtime] Auction UPDATE received", {
      auctionIdMatches,
      currentAuctionId: auctionId,
      newCurrentBidId: payload.new?.currentBidId ?? null,
      newCurrentRoundEndAt: payload.new?.currentRoundEndAt ?? null,
      newCurrentTargetParticipantId: payload.new?.currentTargetParticipantId ?? null,
      newId: payload.new?.id ?? null,
      newKeys: Object.keys(payload.new ?? {}),
      oldCurrentBidId: payload.old?.currentBidId ?? null,
      oldCurrentRoundEndAt: payload.old?.currentRoundEndAt ?? null,
      oldCurrentTargetParticipantId: payload.old?.currentTargetParticipantId ?? null,
      oldId: payload.old?.id ?? null,
      oldKeys: Object.keys(payload.old ?? {}),
      payloadErrors: payload.errors ?? null,
      payloadNew: payload.new,
      payloadOld: payload.old,
      table: payload.table,
    });
    if (auctionIdMatches) scheduleRefresh("Auction UPDATE fallback");
    return;
  }

  if (auctionIdMatches) {
    scheduleRefresh(`${payload.table} ${payload.eventType}`);
  }
}

function getPayloadAuctionId(payload: { new: Record<string, unknown>; old: Record<string, unknown> }, table: string) {
  if (table === "Auction") {
    return getFirstStringValue(
      payload.new.id,
      payload.old.id,
      payload.new.auctionId,
      payload.old.auctionId,
      payload.new.auction_id,
      payload.old.auction_id,
    );
  }

  return getFirstStringValue(
    payload.new.auctionId,
    payload.old.auctionId,
    payload.new.auction_id,
    payload.old.auction_id,
  );
}

function getFirstStringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") return value;
  }

  return null;
}

function debugLog(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.log(message, payload);
}

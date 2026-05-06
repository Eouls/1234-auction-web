"use client";

import { useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuctionRoomRealtimeProps = {
  auctionId: string;
};

const REFRESH_DEBOUNCE_MS = 400;

export function AuctionRoomRealtime({ auctionId }: AuctionRoomRealtimeProps) {
  const router = useRouter();
  const channelInstanceId = useId();
  const refreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let isActive = true;
    console.log("[auction-realtime] component mounted", { auctionId });

    const supabase = createClient();

    function scheduleRefresh(reason: string) {
      if (refreshTimeoutRef.current !== null) {
        console.log("[auction-realtime] refresh already scheduled", { auctionId, reason });
        return;
      }

      console.log("[auction-realtime] refresh scheduled", { auctionId, reason });

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        console.log("[auction-realtime] router.refresh called", { auctionId, reason });
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    }

    const channel = supabase.channel(`auction-room:${auctionId}:${channelInstanceId}`);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isActive) return;

      console.log("[auction-realtime] auth session", {
        hasSession: Boolean(session),
        hasUser: Boolean(session?.user),
        userId: session?.user?.id ?? null,
      });

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
        console.log("[auction-realtime] realtime auth token applied", {
          auctionId,
          hasAccessToken: true,
        });
      }

      console.log("[auction-realtime] subscribe start", { auctionId });

      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "Auction",
          },
          (payload) => handleRealtimePayload(payload, auctionId, scheduleRefresh),
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
            console.log("[auction-realtime] AuctionBid INSERT received", {
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

            scheduleRefresh("AuctionBid INSERT unfiltered debug");
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "AuctionTeam",
          },
          (payload) => handleRealtimePayload(payload, auctionId, scheduleRefresh),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "AuctionParticipant",
          },
          (payload) => handleRealtimePayload(payload, auctionId, scheduleRefresh),
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "ChatMessage",
          },
          (payload) => handleRealtimePayload(payload, auctionId, scheduleRefresh),
        )
        .subscribe((status, error) => {
          console.log("[auction-realtime] subscribe status", {
            auctionId,
            error: error
              ? {
                  message: error.message,
                  name: error.name,
                }
              : null,
            status,
          });

          if (status === "SUBSCRIBED") {
            console.log("[auction-realtime] subscribed", { auctionId });
          }
        });
    });

    return () => {
      isActive = false;
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      console.log("[auction-realtime] unsubscribed", { auctionId });

      supabase.removeChannel(channel);
    };
  }, [auctionId, channelInstanceId, router]);

  return null;
}

type RealtimePayload = {
  eventType: string;
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

  console.log("[auction-realtime] event received", {
    auctionIdMatches,
    currentAuctionId: auctionId,
    eventType: payload.eventType,
    matchedAuctionId,
    newKeys: Object.keys(payload.new ?? {}),
    oldKeys: Object.keys(payload.old ?? {}),
    table: payload.table,
  });

  if (payload.table === "Auction" && payload.eventType === "UPDATE") {
    console.log("[auction-realtime] Auction UPDATE received", {
      auctionIdMatches,
      currentAuctionId: auctionId,
      newCurrentBidId: payload.new?.currentBidId ?? null,
      newCurrentRoundEndAt: payload.new?.currentRoundEndAt ?? null,
      newCurrentTargetParticipantId: payload.new?.currentTargetParticipantId ?? null,
      newId: payload.new?.id ?? null,
      oldCurrentBidId: payload.old?.currentBidId ?? null,
      oldCurrentRoundEndAt: payload.old?.currentRoundEndAt ?? null,
      oldCurrentTargetParticipantId: payload.old?.currentTargetParticipantId ?? null,
      oldId: payload.old?.id ?? null,
    });
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

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
    console.log("[auction-realtime] component mounted", { auctionId });

    const supabase = createClient();

    function scheduleRefresh(table: string, eventType: string, source: string) {
      console.log("[auction-realtime] event received", {
        auctionId,
        eventType,
        source,
        table,
      });

      if (refreshTimeoutRef.current !== null) return;

      console.log("[auction-realtime] refresh scheduled", { auctionId });

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        console.log("[auction-realtime] router.refresh called", { auctionId });
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    }

    console.log("[auction-realtime] subscribe start", { auctionId });

    const channel = supabase
      .channel(`auction-room:${auctionId}:${channelInstanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Auction",
          filter: `id=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType, "Auction filtered"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AuctionBid",
          filter: `auctionId=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType, "AuctionBid filtered"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AuctionBid",
        },
        (payload) => {
          const payloadAuctionId = getPayloadAuctionId(payload);
          const auctionIdMatches = payloadAuctionId === auctionId;

          console.log("[auction-realtime] unfiltered AuctionBid event received", {
            auctionId,
            auctionIdMatches,
            eventType: payload.eventType,
            payloadAuctionId,
            table: payload.table,
          });

          if (auctionIdMatches) {
            scheduleRefresh(payload.table, payload.eventType, "AuctionBid unfiltered");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AuctionTeam",
          filter: `auctionId=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType, "AuctionTeam filtered"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AuctionParticipant",
          filter: `auctionId=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType, "AuctionParticipant filtered"),
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

    return () => {
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

function getPayloadAuctionId(payload: { new: Record<string, unknown>; old: Record<string, unknown> }) {
  const newAuctionId = payload.new.auctionId;
  if (typeof newAuctionId === "string") return newAuctionId;

  const oldAuctionId = payload.old.auctionId;
  return typeof oldAuctionId === "string" ? oldAuctionId : null;
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuctionRoomRealtimeProps = {
  auctionId: string;
};

const REFRESH_DEBOUNCE_MS = 400;
const isDevelopment = process.env.NODE_ENV !== "production";

export function AuctionRoomRealtime({ auctionId }: AuctionRoomRealtimeProps) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function scheduleRefresh(table: string, eventType: string) {
      if (isDevelopment) {
        console.log("[auction-realtime] event received", {
          auctionId,
          eventType,
          table,
        });
      }

      if (refreshTimeoutRef.current !== null) return;

      if (isDevelopment) {
        console.log("[auction-realtime] refresh scheduled", { auctionId });
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    }

    const channel = supabase
      .channel(`auction-room:${auctionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Auction",
          filter: `id=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AuctionBid",
          filter: `auctionId=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AuctionTeam",
          filter: `auctionId=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AuctionParticipant",
          filter: `auctionId=eq.${auctionId}`,
        },
        (payload) => scheduleRefresh(payload.table, payload.eventType),
      )
      .subscribe((status) => {
        if (!isDevelopment) return;
        if (status === "SUBSCRIBED") {
          console.log("[auction-realtime] subscribed", { auctionId });
        }
      });

    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      if (isDevelopment) {
        console.log("[auction-realtime] unsubscribed", { auctionId });
      }

      supabase.removeChannel(channel);
    };
  }, [auctionId, router]);

  return null;
}

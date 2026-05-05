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
      if (refreshTimeoutRef.current !== null) return;

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
            const payloadAuctionId = getPayloadAuctionId(payload, "AuctionBid");
            console.log("[auction-realtime] AuctionBid INSERT received", {
              currentAuctionId: auctionId,
              eventType: payload.eventType,
              newAuctionId: payload.new?.auctionId ?? null,
              newAuction_id: payload.new?.auction_id ?? null,
              newKeys: Object.keys(payload.new ?? {}),
              schema: payload.schema,
              table: payload.table,
            });

            if (payloadAuctionId === auctionId) {
              scheduleRefresh("AuctionBid INSERT");
            }
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
  const payloadAuctionId = getPayloadAuctionId(payload, payload.table);
  const oldAuctionId = getPayloadAuctionId({ ...payload, new: {}, old: payload.old }, payload.table);
  const auctionIdMatches = payloadAuctionId === auctionId || oldAuctionId === auctionId;

  console.log("[auction-realtime] event received", {
    currentAuctionId: auctionId,
    eventType: payload.eventType,
    newAuctionId: payloadAuctionId,
    newKeys: Object.keys(payload.new ?? {}),
    oldAuctionId,
    oldKeys: Object.keys(payload.old ?? {}),
    table: payload.table,
  });

  if (auctionIdMatches) {
    scheduleRefresh(`${payload.table} ${payload.eventType}`);
  }
}

function getPayloadAuctionId(payload: { new: Record<string, unknown>; old: Record<string, unknown> }, table: string) {
  if (table === "Auction") {
    const newId = payload.new.id;
    if (typeof newId === "string") return newId;

    const oldId = payload.old.id;
    return typeof oldId === "string" ? oldId : null;
  }

  const newAuctionId = payload.new.auctionId ?? payload.new.auction_id;
  if (typeof newAuctionId === "string") return newAuctionId;

  const oldAuctionId = payload.old.auctionId ?? payload.old.auction_id;
  return typeof oldAuctionId === "string" ? oldAuctionId : null;
}

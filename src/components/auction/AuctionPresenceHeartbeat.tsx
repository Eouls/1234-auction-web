"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { recordAuctionPresence } from "@/app/auctions/[code]/actions";

type AuctionPresenceHeartbeatProps = {
  auctionId: string;
  enabled: boolean;
  isParticipant: boolean;
};

const HEARTBEAT_INTERVAL_MS = 5 * 1000;
const REFRESH_INTERVAL_MS = 3 * 1000;

export function AuctionPresenceHeartbeat({
  auctionId,
  enabled,
  isParticipant,
}: AuctionPresenceHeartbeatProps) {
  const router = useRouter();
  const isRecordingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isParticipant) return;

    async function recordPresence() {
      if (isRecordingRef.current) return;
      isRecordingRef.current = true;

      try {
        await recordAuctionPresence(auctionId);
      } finally {
        isRecordingRef.current = false;
      }
    }

    recordPresence();
    const interval = window.setInterval(recordPresence, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [auctionId, enabled, isParticipant]);

  useEffect(() => {
    if (!enabled) return;

    router.refresh();
    const interval = window.setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, router]);

  return null;
}

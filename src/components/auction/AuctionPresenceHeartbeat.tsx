"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { recordAuctionPresence } from "@/app/auctions/[code]/actions";

type AuctionPresenceHeartbeatProps = {
  auctionId: string;
  enabled: boolean;
  isParticipant: boolean;
};

const HEARTBEAT_INTERVAL_MS = 10 * 1000;

export function AuctionPresenceHeartbeat({
  auctionId,
  enabled,
  isParticipant,
}: AuctionPresenceHeartbeatProps) {
  const router = useRouter();
  const isRecordingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    async function refreshPresence() {
      if (isRecordingRef.current) return;
      isRecordingRef.current = true;

      try {
        if (isParticipant) {
          await recordAuctionPresence(auctionId);
        }
        if (isMounted) router.refresh();
      } finally {
        isRecordingRef.current = false;
      }
    }

    refreshPresence();
    const interval = window.setInterval(refreshPresence, HEARTBEAT_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [auctionId, enabled, isParticipant, router]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";

type AuctionStartAutoScrollProps = {
  isAuctionRunning: boolean;
  targetId: string;
};

export function AuctionStartAutoScroll({ isAuctionRunning, targetId }: AuctionStartAutoScrollProps) {
  const hasAutoScrolledOnStartRef = useRef(false);

  useEffect(() => {
    if (!isAuctionRunning) {
      hasAutoScrolledOnStartRef.current = false;
      return;
    }

    if (hasAutoScrolledOnStartRef.current) return;
    if (isEditableElementFocused()) return;

    hasAutoScrolledOnStartRef.current = true;

    const timeout = window.setTimeout(() => {
      const targetElement = document.getElementById(targetId);
      if (!targetElement) return;

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (process.env.NODE_ENV !== "production") {
        console.log("[auction-scroll] auto scroll to main panel", { targetId });
      }

      targetElement.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }, 100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isAuctionRunning, targetId]);

  return null;
}

function isEditableElementFocused() {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;

  return activeElement instanceof HTMLElement && activeElement.isContentEditable;
}

import type { AuctionStatus, LolRole } from "@/types/auction";

export const LOL_ROLE_LABELS: Record<LolRole, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};

export const LOL_ROLE_COLORS: Record<LolRole, string> = {
  TOP: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
  JUNGLE: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
  MID: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
  ADC: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
  SUPPORT: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
};

export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  WAITING: "대기중",
  IN_PROGRESS: "진행중",
  ENDED: "종료",
};

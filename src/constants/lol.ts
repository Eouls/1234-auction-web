import type { AuctionStatus, LolRole } from "@/types/auction";

export const LOL_ROLE_LABELS: Record<LolRole, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};

export const LOL_ROLE_COLORS: Record<LolRole, string> = {
  TOP: "border-red-400/40 bg-red-500/10 text-red-200",
  JUNGLE: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  MID: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  ADC: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  SUPPORT: "border-violet-400/40 bg-violet-500/10 text-violet-200",
};

export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  WAITING: "대기중",
  IN_PROGRESS: "진행중",
  ENDED: "종료",
};

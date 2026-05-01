import type { AuctionStatus } from "@/types/auction";
import { AUCTION_STATUS_LABELS } from "@/constants/lol";
import { cn } from "@/lib/cn";

const colors: Record<AuctionStatus, string> = {
  WAITING: "border-amber-300/40 bg-amber-400/10 text-amber-200",
  IN_PROGRESS: "border-cyan-300/40 bg-cyan-400/10 text-cyan-200",
  ENDED: "border-slate-300/30 bg-slate-400/10 text-slate-300",
};

export function StatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold", colors[status])}>
      {AUCTION_STATUS_LABELS[status]}
    </span>
  );
}

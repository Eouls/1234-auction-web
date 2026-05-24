import type { AuctionStatus } from "@/types/auction";
import { AUCTION_STATUS_LABELS } from "@/constants/lol";
import { cn } from "@/lib/cn";

const colors: Record<AuctionStatus, string> = {
  WAITING: "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[var(--warning-soft)] text-[var(--warning)]",
  IN_PROGRESS: "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  PAUSED: "border-amber-300/40 bg-amber-400/10 text-amber-200",
  ENDED: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
};

export function StatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold", colors[status])}>
      {AUCTION_STATUS_LABELS[status]}
    </span>
  );
}

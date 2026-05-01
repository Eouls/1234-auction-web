import type { LolRole } from "@/types/auction";
import { LOL_ROLE_COLORS, LOL_ROLE_LABELS } from "@/constants/lol";
import { cn } from "@/lib/cn";

export function RoleBadge({ role }: { role: LolRole }) {
  return (
    <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold", LOL_ROLE_COLORS[role])}>
      {LOL_ROLE_LABELS[role]}
    </span>
  );
}

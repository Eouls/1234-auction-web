"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshRiotStats } from "@/app/profile/actions";
import { Button } from "@/components/ui";

export function RiotStatsRefreshButton() {
  const router = useRouter();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    setError(null);
    setMessage(null);
    setWarnings([]);

    startTransition(async () => {
      const result = await refreshRiotStats({ forceRefresh: true });

      if (result.error) {
        setError(result.error);
        setWarnings(
          result.failedAccounts?.map((account) => `${account.gameName} #${account.tagLine} ${account.reason}`) ?? [],
        );
        return;
      }

      setMessage(result.message ?? "전적을 새로고침했습니다.");
      setWarnings(result.warnings ?? []);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button disabled={isPending} onClick={handleRefresh} type="button" variant="secondary">
        {isPending ? "새로고침 중..." : "전적 새로고침"}
      </Button>
      {error ? <p className="max-w-xs text-xs text-rose-300">{error}</p> : null}
      {message ? <p className="max-w-xs text-xs text-cyan-200">{message}</p> : null}
      {warnings.length ? (
        <ul className="max-w-xs space-y-1 text-xs text-amber-200">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

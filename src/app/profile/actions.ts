"use server";

import { revalidatePath } from "next/cache";
import { fetchOpggProfileStats, type OpggProfileStatsResult } from "@/lib/opgg/profile";
import { validateChampionCandidates } from "@/lib/riot/champions";
import { fetchRiotAccountRank, RiotApiError } from "@/lib/riot/api";
import { pickHighestRank } from "@/lib/riot/rank";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type RefreshRiotStatsState = {
  error?: string;
  failedAccounts?: Array<{
    gameName: string;
    reason: string;
    tagLine: string;
  }>;
  message?: string;
  success?: boolean;
  warnings?: string[];
};

export async function refreshRiotStats({
  forceRefresh = false,
}: {
  forceRefresh?: boolean;
} = {}): Promise<RefreshRiotStatsState> {
  console.log("[profile-refresh] start refreshRiotStats", { forceRefresh });

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  const user = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    include: {
      lolAccounts: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      lolStats: true,
    },
  });

  if (!user) {
    return { error: "사용자 정보를 찾을 수 없습니다." };
  }

  if (!user.lolAccounts.length) {
    return { error: "등록된 롤 계정이 없습니다." };
  }

  try {
    const normalizedAccounts = user.lolAccounts.map((account) => ({
      id: account.id,
      gameName: account.gameName.trim(),
      originalGameName: account.gameName,
      originalTagLine: account.tagLine,
      puuid: account.puuid,
      tagLine: account.tagLine.trim().replace(/^#/, ""),
    }));
    const rankResults: Array<{ gameName: string; rank: string | null; tagLine: string; tier: string | null }> = [];
    const failedAccounts: NonNullable<RefreshRiotStatsState["failedAccounts"]> = [];
    console.log("[profile-actions] lol accounts refresh start", {
      accountCount: normalizedAccounts.length,
      forceRefresh,
    });

    for (const account of normalizedAccounts) {
      try {
        const result = await fetchRiotAccountRank({
          gameName: account.gameName,
          tagLine: account.tagLine,
          puuid: account.puuid,
        });

        if (
          !account.puuid ||
          account.puuid !== result.puuid ||
          account.originalGameName !== account.gameName ||
          account.originalTagLine !== account.tagLine
        ) {
          await prisma.lolAccount.update({
            where: { id: account.id },
            data: {
              puuid: result.puuid,
              gameName: account.gameName,
              tagLine: account.tagLine,
            },
          });
        }

        const accountRank = {
          gameName: account.gameName,
          tagLine: account.tagLine,
          tier: result.tier,
          rank: result.rank,
        };
        rankResults.push(accountRank);

        console.log("[profile-actions] solo queue rank result", {
          account: formatRiotAccountLabel(account),
          tier: accountRank.tier,
          rank: accountRank.rank,
        });
        if (result.ignoredFlexRank) {
          console.log("[profile-actions] flex queue ignored", {
            account: formatRiotAccountLabel(account),
            tier: result.ignoredFlexRank.tier,
            rank: result.ignoredFlexRank.rank,
          });
        }
        console.log("[profile-actions] account current rank result", {
          account: formatRiotAccountLabel(account),
          tier: accountRank.tier,
          rank: accountRank.rank,
        });
      } catch (error) {
        const accountError = getAccountRefreshError(error);
        failedAccounts.push({
          gameName: account.gameName,
          tagLine: account.tagLine,
          reason: accountError.reason,
        });

        if (accountError.isFatal) {
          if (!rankResults.length) throw error;
          break;
        }
      }
    }

    if (!rankResults.length) {
      return {
        error: failedAccounts.length
          ? "모든 롤 계정 전적 조회에 실패했습니다."
          : "전적 새로고침에 실패했습니다.",
        failedAccounts,
      };
    }

    const highestRank = pickHighestRank(rankResults);
    console.log("[profile-actions] selected highest current rank", {
      sourceAccount: highestRank ? formatRiotAccountLabel(highestRank) : null,
      tier: highestRank?.tier ?? null,
      rank: highestRank?.rank ?? null,
    });
    console.log("[profile-refresh] riot refresh completed", {
      failedAccountCount: failedAccounts.length,
      successfulAccountCount: rankResults.length,
    });
    const opggWarnings: string[] = [];
    console.log("[profile-refresh] start opgg refresh", {
      forceRefresh,
      accountCount: normalizedAccounts.length,
    });
    const opggUpdate = await getOpggStatsUpdate({
      existingStats: user.lolStats,
      forceRefresh,
      accounts: normalizedAccounts,
    });
    console.log("[profile-refresh] opgg refresh result", {
      hasData: Object.keys(opggUpdate.data).length > 0,
      status: opggUpdate.status,
      warning: opggUpdate.warning,
      peakSourceAccount: opggUpdate.peakSourceAccount,
    });
    const invalidExistingChampionCleanup = await getInvalidExistingChampionCleanup(user.lolStats);
    const userLolStatsPayload = {
      currentTier: highestRank?.tier ?? null,
      currentRank: highestRank?.rank ?? null,
      ...invalidExistingChampionCleanup,
      ...opggUpdate.data,
      refreshedAt: new Date(),
    };

    console.log("[profile-actions] UserLolStats update payload", {
      currentTier: userLolStatsPayload.currentTier,
      currentRank: userLolStatsPayload.currentRank,
      currentSourceAccount: highestRank ? formatRiotAccountLabel(highestRank) : null,
      peakTier: "peakTier" in userLolStatsPayload ? userLolStatsPayload.peakTier : user.lolStats?.peakTier ?? null,
      peakRank: "peakRank" in userLolStatsPayload ? userLolStatsPayload.peakRank : user.lolStats?.peakRank ?? null,
      peakSourceAccount: opggUpdate.peakSourceAccount,
      mostChampion1:
        "mostChampion1" in userLolStatsPayload ? userLolStatsPayload.mostChampion1 : user.lolStats?.mostChampion1 ?? null,
      mostChampion2:
        "mostChampion2" in userLolStatsPayload ? userLolStatsPayload.mostChampion2 : user.lolStats?.mostChampion2 ?? null,
      mostChampion3:
        "mostChampion3" in userLolStatsPayload ? userLolStatsPayload.mostChampion3 : user.lolStats?.mostChampion3 ?? null,
    });

    await prisma.userLolStats.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...userLolStatsPayload,
      },
      update: {
        ...userLolStatsPayload,
      },
    });

    revalidatePath("/profile");
    revalidatePath("/profile/edit");

    const warnings = failedAccounts.map(
      (account) => `${account.gameName} #${account.tagLine} ${account.reason}`,
    );
    if (opggUpdate.warning) opggWarnings.push(opggUpdate.warning);

    return {
      success: true,
      message: getRefreshMessage({ hasFailedAccounts: failedAccounts.length > 0, opggStatus: opggUpdate.status }),
      warnings: [...warnings, ...opggWarnings],
      failedAccounts,
    };
  } catch (error) {
    if (error instanceof RiotApiError) {
      return { error: error.message };
    }

    console.error("[riot-refresh] Failed to refresh riot stats", error);
    return { error: "전적 새로고침에 실패했습니다." };
  }
}

async function getOpggStatsUpdate({
  accounts,
  existingStats,
  forceRefresh,
}: {
  accounts: Array<{ gameName: string; tagLine: string }>;
  existingStats: {
    mostChampion1: string | null;
    peakRank: string | null;
    peakTier: string | null;
    refreshedAt: Date | null;
  } | null;
  forceRefresh: boolean;
}) {
  if (!forceRefresh && isOpggCacheValid(existingStats)) {
    console.log("[opgg-profile] using cached opgg stats");
    console.log("[opgg-profile] skip by cache", {
      refreshedAt: existingStats?.refreshedAt?.toISOString() ?? null,
      hasPeakTier: Boolean(existingStats?.peakTier),
      hasPeakRank: Boolean(existingStats?.peakRank),
      hasMostChampion: Boolean(existingStats?.mostChampion1),
      reason: "OP.GG 데이터가 모두 있고 12시간 이내 조회 기록이 있습니다.",
    });

    return {
      data: {},
      status: "cache" as const,
      warning: undefined,
      peakSourceAccount: null,
    };
  }

  if (forceRefresh) {
    console.log("[opgg-profile] cache ignored", {
      forceRefresh,
      refreshedAt: existingStats?.refreshedAt?.toISOString() ?? null,
      hasPeakTier: Boolean(existingStats?.peakTier),
      hasPeakRank: Boolean(existingStats?.peakRank),
      hasMostChampion: Boolean(existingStats?.mostChampion1),
    });
  }

  if (!accounts.length) {
    return {
      data: {},
      status: "failed" as const,
      warning: "OP.GG 정보를 조회하지 못했습니다.",
      peakSourceAccount: null,
    };
  }

  const peakCandidates: Array<{ gameName: string; rank: string | null; tagLine: string; tier: string | null }> = [];
  const warnings: string[] = [];
  const aggregatedMostChampionMap = new Map<
    string,
    Extract<OpggProfileStatsResult, { success: true }>["mostChampions"][number] & { firstSeenIndex: number }
  >();
  let successCount = 0;
  let mostChampionSuccessCount = 0;
  let mostChampionSeenIndex = 0;

  console.log("[opgg-profile] fetching fresh opgg stats", {
    accountCount: accounts.length,
    forceRefresh,
  });

  for (const account of accounts) {
    const accountLabel = formatRiotAccountLabel(account);
    const opggStats = await fetchOpggProfileStats(account.gameName, account.tagLine);

    if (!opggStats.success) {
      warnings.push(`${account.gameName} #${account.tagLine}: ${opggStats.warning}`);
      console.log("[profile-actions] account peak rank result", {
        account: accountLabel,
        success: false,
        warning: opggStats.warning,
      });
      continue;
    }

    successCount += 1;

    if (opggStats.peakTier) {
      peakCandidates.push({
        gameName: account.gameName,
        tagLine: account.tagLine,
        tier: opggStats.peakTier,
        rank: opggStats.peakRank ?? null,
      });
    }

    if (opggStats.mostChampions.length) {
      mostChampionSuccessCount += 1;

      for (const champion of opggStats.mostChampions) {
        const key = champion.name.toLowerCase();
        const existingChampion = aggregatedMostChampionMap.get(key);

        if (existingChampion) {
          existingChampion.games += champion.games;
          continue;
        }

        aggregatedMostChampionMap.set(key, {
          ...champion,
          firstSeenIndex: mostChampionSeenIndex,
        });
        mostChampionSeenIndex += 1;
      }
    }

    if (opggStats.warnings.length) {
      warnings.push(`${account.gameName} #${account.tagLine}: ${opggStats.warnings.join(" / ")}`);
    }

    console.log("[profile-actions] account most champions result", {
      account: accountLabel,
      championCount: opggStats.mostChampions.length,
      champions: opggStats.mostChampions.map((champion) => ({
        name: champion.name,
        games: champion.games,
      })),
    });
    console.log("[profile-actions] account peak rank result", {
      account: accountLabel,
      success: true,
      tier: opggStats.peakTier ?? null,
      rank: opggStats.peakRank ?? null,
      mostChampionCount: opggStats.mostChampions.length,
    });
  }

  const highestPeak = pickHighestRank(peakCandidates);
  console.log("[profile-actions] selected highest peak rank", {
    sourceAccount: highestPeak ? formatRiotAccountLabel(highestPeak) : null,
    tier: highestPeak?.tier ?? null,
    rank: highestPeak?.rank ?? null,
  });
  console.log("[opgg-profile] selected solo queue peak tier", {
    sourceAccount: highestPeak ? formatRiotAccountLabel(highestPeak) : null,
    tier: highestPeak?.tier ?? null,
    rank: highestPeak?.rank ?? null,
  });
  const aggregatedMostChampions = Array.from(aggregatedMostChampionMap.values())
    .sort(
      (first, second) =>
        second.games - first.games ||
        first.name.localeCompare(second.name) ||
        first.firstSeenIndex - second.firstSeenIndex,
    )
    .slice(0, 3);

  console.log("[profile-actions] aggregated most champions", {
    totalAccounts: accounts.length,
    successfulAccounts: mostChampionSuccessCount,
    champions: Array.from(aggregatedMostChampionMap.values())
      .sort(
        (first, second) =>
          second.games - first.games ||
          first.name.localeCompare(second.name) ||
          first.firstSeenIndex - second.firstSeenIndex,
      )
      .map((champion) => ({ name: champion.name, games: champion.games }))
      .slice(0, 20),
  });
  console.log("[profile-actions] selected aggregated most champions", {
    mostChampion1: aggregatedMostChampions[0]?.name ?? null,
    mostChampion2: aggregatedMostChampions[1]?.name ?? null,
    mostChampion3: aggregatedMostChampions[2]?.name ?? null,
  });

  if (!successCount) {
    return {
      data: {},
      status: "failed" as const,
      warning: warnings.join(" / ") || "OP.GG 정보를 조회하지 못했습니다.",
      peakSourceAccount: null,
    };
  }

  return {
    data: {
      ...(highestPeak?.tier
        ? {
            peakTier: highestPeak.tier,
            peakRank: highestPeak.rank,
          }
        : {}),
      ...(aggregatedMostChampions.length
        ? {
            mostChampion1: aggregatedMostChampions[0]?.name ?? null,
            mostChampion2: aggregatedMostChampions[1]?.name ?? null,
            mostChampion3: aggregatedMostChampions[2]?.name ?? null,
            mostChampion1ImageUrl: aggregatedMostChampions[0]?.imageUrl ?? null,
            mostChampion2ImageUrl: aggregatedMostChampions[1]?.imageUrl ?? null,
            mostChampion3ImageUrl: aggregatedMostChampions[2]?.imageUrl ?? null,
          }
        : {}),
    },
    status: "success" as const,
    warning: warnings.length ? warnings.join(" / ") : undefined,
    peakSourceAccount: highestPeak ? formatRiotAccountLabel(highestPeak) : null,
  };
}

async function getInvalidExistingChampionCleanup(
  stats: {
    mostChampion1: string | null;
    mostChampion2: string | null;
    mostChampion3: string | null;
  } | null,
) {
  if (!stats) return {};

  const existingChampions = [stats.mostChampion1, stats.mostChampion2, stats.mostChampion3];
  if (!existingChampions.some(Boolean)) return {};

  const { validChampions } = await validateChampionCandidates(
    existingChampions.filter(Boolean).map((name) => ({ name: name as string })),
  );
  const validNameSet = new Set(
    validChampions.flatMap((champion) => [champion.name.toLowerCase(), champion.englishName.toLowerCase(), champion.id.toLowerCase()]),
  );
  const cleanup: Record<string, null> = {};

  existingChampions.forEach((name, index) => {
    if (!name) return;
    if (validNameSet.has(name.toLowerCase())) return;

    const championNumber = index + 1;
    cleanup[`mostChampion${championNumber}`] = null;
    cleanup[`mostChampion${championNumber}ImageUrl`] = null;
  });

  return cleanup;
}

function isOpggCacheValid(
  stats: { mostChampion1: string | null; peakRank: string | null; peakTier: string | null; refreshedAt: Date | null } | null,
) {
  if (!stats?.refreshedAt) return false;
  if (!stats.peakTier || !stats.mostChampion1) return false;

  return Date.now() - stats.refreshedAt.getTime() < 12 * 60 * 60 * 1000;
}

function formatRiotAccountLabel(account: { gameName: string; tagLine: string }) {
  return `${account.gameName}#${account.tagLine}`;
}

function getRefreshMessage({
  hasFailedAccounts,
  opggStatus,
}: {
  hasFailedAccounts: boolean;
  opggStatus: "cache" | "failed" | "success";
}) {
  if (opggStatus === "failed") {
    return "현재 티어는 새로고침했습니다. OP.GG 정보는 조회하지 못했습니다.";
  }

  if (opggStatus === "cache") {
    return "현재 티어를 새로고침했습니다. OP.GG 정보는 최근 조회 기록을 사용했습니다.";
  }

  if (hasFailedAccounts) {
    return "전적을 새로고침했습니다. 단, 일부 계정은 조회하지 못했습니다.";
  }

  return "전적을 새로고침했습니다.";
}

function getAccountRefreshError(error: unknown) {
  if (error instanceof RiotApiError) {
    if (!error.status || error.status === 401 || error.status === 403 || error.status >= 500) {
      return { isFatal: true, reason: error.message };
    }

    if (error.status === 404) {
      return { isFatal: false, reason: "계정을 찾을 수 없습니다." };
    }

    if (error.status === 429) {
      return { isFatal: false, reason: "Riot API 요청 제한에 걸렸습니다." };
    }
  }

  return { isFatal: false, reason: "전적 조회 중 오류가 발생했습니다." };
}

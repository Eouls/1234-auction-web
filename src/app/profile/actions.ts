"use server";

import { revalidatePath } from "next/cache";
import { fetchOpggProfileStats } from "@/lib/opgg/profile";
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
    const rankResults = [];
    const failedAccounts: NonNullable<RefreshRiotStatsState["failedAccounts"]> = [];
    const successfulAccounts: Array<{ gameName: string; rank: string | null; tagLine: string; tier: string | null }> = [];

    for (const account of user.lolAccounts) {
      const normalizedAccount = {
        gameName: account.gameName.trim(),
        tagLine: account.tagLine.trim().replace(/^#/, ""),
      };

      try {
        const result = await fetchRiotAccountRank({
          gameName: normalizedAccount.gameName,
          tagLine: normalizedAccount.tagLine,
          puuid: account.puuid,
        });

        if (!account.puuid || account.puuid !== result.puuid || account.tagLine !== normalizedAccount.tagLine) {
          await prisma.lolAccount.update({
            where: { id: account.id },
            data: {
              puuid: result.puuid,
              gameName: normalizedAccount.gameName,
              tagLine: normalizedAccount.tagLine,
            },
          });
        }

        rankResults.push(result);
        successfulAccounts.push({
          gameName: normalizedAccount.gameName,
          tagLine: normalizedAccount.tagLine,
          tier: result.tier,
          rank: result.rank,
        });
      } catch (error) {
        const accountError = getAccountRefreshError(error);
        failedAccounts.push({
          gameName: normalizedAccount.gameName,
          tagLine: normalizedAccount.tagLine,
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
    console.log("[profile-refresh] riot refresh completed", {
      failedAccountCount: failedAccounts.length,
      successfulAccountCount: rankResults.length,
    });
    const opggWarnings: string[] = [];
    const selectedOpggAccount = pickHighestRank(successfulAccounts) ?? successfulAccounts[0] ?? null;
    console.log("[profile-refresh] start opgg refresh", {
      forceRefresh,
      hasSelectedAccount: Boolean(selectedOpggAccount),
    });
    const opggUpdate = await getOpggStatsUpdate({
      existingStats: user.lolStats,
      forceRefresh,
      selectedAccount: selectedOpggAccount,
    });
    console.log("[profile-refresh] opgg refresh result", {
      hasData: Object.keys(opggUpdate.data).length > 0,
      status: opggUpdate.status,
      warning: opggUpdate.warning,
    });
    const invalidExistingChampionCleanup = await getInvalidExistingChampionCleanup(user.lolStats);

    await prisma.userLolStats.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        currentTier: highestRank?.tier ?? null,
        currentRank: highestRank?.rank ?? null,
        ...invalidExistingChampionCleanup,
        ...opggUpdate.data,
        refreshedAt: new Date(),
      },
      update: {
        currentTier: highestRank?.tier ?? null,
        currentRank: highestRank?.rank ?? null,
        ...invalidExistingChampionCleanup,
        ...opggUpdate.data,
        refreshedAt: new Date(),
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
  existingStats,
  forceRefresh,
  selectedAccount,
}: {
  existingStats: {
    mostChampion1: string | null;
    peakRank: string | null;
    peakTier: string | null;
    refreshedAt: Date | null;
  } | null;
  forceRefresh: boolean;
  selectedAccount: { gameName: string; tagLine: string } | null;
}) {
  if (!forceRefresh && isOpggCacheValid(existingStats)) {
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

  if (!selectedAccount) {
    return {
      data: {},
      status: "failed" as const,
      warning: "OP.GG 정보를 조회하지 못했습니다.",
    };
  }

  const opggStats = await fetchOpggProfileStats(selectedAccount.gameName, selectedAccount.tagLine);

  if (!opggStats.success) {
    return {
      data: {},
      status: "failed" as const,
      warning: opggStats.warning,
    };
  }

  return {
    data: {
      ...(opggStats.peakTier
        ? {
            peakTier: opggStats.peakTier,
            peakRank: opggStats.peakRank,
          }
        : {}),
      ...(opggStats.mostChampions.length
        ? {
            mostChampion1: opggStats.mostChampions[0]?.name ?? null,
            mostChampion2: opggStats.mostChampions[1]?.name ?? null,
            mostChampion3: opggStats.mostChampions[2]?.name ?? null,
            mostChampion1ImageUrl: opggStats.mostChampions[0]?.imageUrl ?? null,
            mostChampion2ImageUrl: opggStats.mostChampions[1]?.imageUrl ?? null,
            mostChampion3ImageUrl: opggStats.mostChampions[2]?.imageUrl ?? null,
          }
        : {}),
    },
    status: "success" as const,
    warning: opggStats.warnings.length ? opggStats.warnings.join(" / ") : undefined,
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
  const validNameSet = new Set(validChampions.map((champion) => champion.name.toLowerCase()));
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
  if (!stats.peakTier || !stats.peakRank || !stats.mostChampion1) return false;

  return Date.now() - stats.refreshedAt.getTime() < 12 * 60 * 60 * 1000;
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

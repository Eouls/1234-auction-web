export type RiotRankEntry = {
  queueType: string;
  rank: string;
  tier: string;
};

const tierScores: Record<string, number> = {
  CHALLENGER: 10,
  GRANDMASTER: 9,
  MASTER: 8,
  DIAMOND: 7,
  EMERALD: 6,
  PLATINUM: 5,
  GOLD: 4,
  SILVER: 3,
  BRONZE: 2,
  IRON: 1,
  UNRANKED: 0,
};

const rankScores: Record<string, number> = {
  I: 4,
  II: 3,
  III: 2,
  IV: 1,
  V: 0,
};

export function pickPreferredRank(entries: RiotRankEntry[]) {
  return entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ?? null;
}

export function pickHighestRank<T extends { rank: string | null; tier: string | null }>(entries: T[]) {
  return entries.reduce<T | null>((highestEntry, entry) => {
    if (!entry.tier) return highestEntry;

    if (!highestEntry) return entry;

    return compareRank(entry, highestEntry) > 0 ? entry : highestEntry;
  }, null);
}

function compareRank(
  first: { rank: string | null; tier: string | null },
  second: { rank: string | null; tier: string | null },
) {
  const firstTierScore = tierScores[first.tier ?? "UNRANKED"] ?? 0;
  const secondTierScore = tierScores[second.tier ?? "UNRANKED"] ?? 0;

  if (firstTierScore !== secondTierScore) {
    return firstTierScore - secondTierScore;
  }

  return getRankScore(first.rank) - getRankScore(second.rank);
}

function getRankScore(rank: string | null) {
  if (!rank) return 0;

  return rankScores[rank] ?? 0;
}

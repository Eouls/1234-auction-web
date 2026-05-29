import { fetchFullSeasonPeakTierWithBrowser } from "@/lib/opgg/playwright-profile";
import { resolveChampionCandidate } from "@/lib/riot/champions";
import { pickHighestRank } from "@/lib/riot/rank";

export type OpggProfileStatsResult =
  | {
      mostChampions: Array<{ games: number; imageUrl: string | null; name: string }>;
      peakRank: string | null;
      peakTier: string | null;
      source: "OP.GG";
      success: true;
      warnings: string[];
    }
  | {
      success: false;
      warning: string;
    };

type SeasonTierCandidate = {
  rank: string | null;
  raw: string;
  tier: string | null;
};

type ParsedChampionCandidate = {
  games: number;
  nameCandidates: string[];
  rawName: string;
};

const opggSummonerBaseUrl = "https://op.gg/ko/lol/summoners/kr";
const peakWarning = "OP.GG 데이터 구조를 확인하지 못해 최고 티어를 가져오지 못했습니다.";
const mostChampionWarning = "OP.GG 데이터 구조를 확인하지 못해 모스트 챔피언을 가져오지 못했습니다.";

export async function fetchOpggProfileStats(
  gameName: string,
  tagLine: string,
): Promise<OpggProfileStatsResult> {
  const normalizedGameName = gameName.trim();
  const normalizedTagLine = tagLine.trim().replace(/^#/, "");
  const encodedSummoner = `${encodeURIComponent(normalizedGameName)}-${encodeURIComponent(normalizedTagLine)}`;
  const overviewUrl = `${opggSummonerBaseUrl}/${encodedSummoner}`;
  const championsUrl = `${overviewUrl}/champions`;

  try {
    const overviewHtml = await fetchOpggHtml({
      label: "overview",
      url: overviewUrl,
    });
    const championsHtml = await fetchOpggHtml({
      label: "champions",
      url: championsUrl,
    });

    console.info("[opgg-profile] HTML summary", {
      championsLength: championsHtml?.length ?? 0,
      overviewLength: overviewHtml?.length ?? 0,
      championsUrl,
      overviewUrl,
    });

    const overviewText = htmlToPlainText(overviewHtml ?? "");
    const championsText = htmlToPlainText(championsHtml ?? "");
    const peakTierSection = getPeakTierSection(overviewText);
    const soloRankTierSection = getSoloRankTierSection(overviewText);
    const championSection = getChampionStatsSection(championsText);
    const seasonTierCandidates = parseSeasonTierCandidates(soloRankTierSection.text);
    const staticPeak = pickHighestRank(seasonTierCandidates);
    const fullSeasonLookupEnabled = isFullSeasonLookupEnabled();
    console.log("[opgg-profile] ENABLE_OPGG_PLAYWRIGHT value", getSafePlaywrightEnvValue());
    console.log("[opgg-profile] full season lookup enabled", fullSeasonLookupEnabled);

    const browserPeak = fullSeasonLookupEnabled
      ? await fetchFullSeasonPeakTierWithBrowser({
          gameName: normalizedGameName,
          tagLine: normalizedTagLine,
        })
      : {
          success: false as const,
          warning: "ENABLE_OPGG_PLAYWRIGHT가 false로 설정되어 전체 시즌 조회를 건너뛰었습니다.",
        };

    if (!fullSeasonLookupEnabled) {
      console.log("[opgg-profile] full season lookup skipped reason", {
        reason: browserPeak.warning,
      });
    }

    const browserPeakCandidate =
      browserPeak.success && browserPeak.peakTier
        ? {
            raw: "PLAYWRIGHT_FULL_SEASON",
            tier: browserPeak.peakTier,
            rank: browserPeak.peakRank ?? null,
          }
        : null;
    const peakCandidates = [staticPeak, browserPeakCandidate].filter(
      (candidate): candidate is SeasonTierCandidate => Boolean(candidate),
    );
    const peak = pickHighestRank(peakCandidates);
    const championCandidates = parseChampionCandidates(championSection);
    const { invalidCandidates, validChampions } = await resolveMostChampionCandidates(championCandidates);
    const finalMostChampions = validChampions.slice(0, 3);
    const warnings = [];

    if (!peak?.tier) warnings.push(peakWarning);
    if (!finalMostChampions.length) warnings.push(mostChampionWarning);
    if (invalidCandidates.length) {
      warnings.push("OP.GG에서 잘못된 챔피언 후보를 감지하여 저장하지 않았습니다.");
    }

    console.log("[opgg-profile] overview text sample", overviewText.slice(0, 1000));
    console.log("[opgg-profile] champions text sample", championsText.slice(0, 1000));
    console.log("[opgg-profile] peak tier section sample", peakTierSection.slice(0, 5000));
    console.log("[opgg-profile] solo rank section found", {
      found: soloRankTierSection.found,
      length: soloRankTierSection.text.length,
      sample: soloRankTierSection.text.slice(0, 1000),
    });
    console.log("[opgg-profile] solo section indexes", {
      headerIndex: soloRankTierSection.headerIndex,
      soloStart: soloRankTierSection.soloStart,
      flexStart: soloRankTierSection.flexStart,
      closeIndex: soloRankTierSection.closeIndex,
      soloEnd: soloRankTierSection.soloEnd,
      soloSectionLength: soloRankTierSection.text.length,
    });
    console.log("[opgg-profile] solo section sample", soloRankTierSection.text.slice(0, 1000));
    console.log("[opgg-profile] flex rank section ignored", {
      found: soloRankTierSection.flexFound,
    });
    console.log("[opgg-profile] contains legacy seasons", {
      hasS9: overviewText.includes("S9"),
      hasDiamond3: overviewText.toLowerCase().includes("diamond 3"),
      hasS8: overviewText.includes("S8"),
      hasS5: overviewText.includes("S5"),
      reason:
        overviewText.includes("S9") || overviewText.includes("S8") || overviewText.includes("S5")
          ? "legacy season data is present in initial HTML"
          : "legacy season data is not present in initial HTML",
    });
    console.log("[opgg-profile] champion section sample", championSection.slice(0, 5000));
    console.log("[opgg-profile] season tier candidates", seasonTierCandidates);
    console.log("[opgg-profile] solo queue peak candidates", seasonTierCandidates);
    console.log("[opgg-profile] compare peak candidates", peakCandidates);
    console.log("[opgg-profile] selected peak", {
      tier: peak?.tier ?? null,
      rank: peak?.rank ?? null,
    });
    console.log("[opgg-profile] selected solo queue peak tier", {
      tier: peak?.tier ?? null,
      rank: peak?.rank ?? null,
    });
    if (browserPeak.success) {
      console.log("[opgg-profile] browser peak tier result", {
        peakTier: browserPeak.peakTier ?? null,
        peakRank: browserPeak.peakRank ?? null,
      });
    } else {
      console.log("[opgg-profile] fallback to static HTML peak tier", {
        warning: browserPeak.warning,
        fallbackPeakTier: staticPeak?.tier ?? null,
        fallbackPeakRank: staticPeak?.rank ?? null,
      });
    }
    console.log(
      "[opgg-profile] champion candidates",
      championCandidates.map((candidate) => ({
        rawName: candidate.rawName,
        games: candidate.games,
        nameCandidates: candidate.nameCandidates.slice(0, 4),
      })),
    );
    console.log(
      "[opgg-profile] valid champion candidates",
      validChampions.map((champion) => ({ name: champion.name, games: champion.games })),
    );
    console.log("[opgg-profile] final OP.GG parse result", {
      finalPeakTier: peak?.tier ?? null,
      finalPeakRank: peak?.rank ?? null,
      finalMostChampions: finalMostChampions.map((champion) => ({ name: champion.name, games: champion.games })),
    });

    if (!peak?.tier && !finalMostChampions.length) {
      return {
        success: false,
        warning: warnings.join(" / "),
      };
    }

    return {
      success: true,
      source: "OP.GG",
      peakTier: peak?.tier ?? null,
      peakRank: peak?.rank ?? null,
      mostChampions: finalMostChampions,
      warnings,
    };
  } catch (error) {
    console.warn("[opgg-profile] Failed to fetch profile pages", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      championsUrl,
      overviewUrl,
    });
    return { success: false, warning: "OP.GG 페이지 요청 실패" };
  }
}

function isFullSeasonLookupEnabled() {
  return process.env.ENABLE_OPGG_PLAYWRIGHT !== "false";
}

function getSafePlaywrightEnvValue() {
  const value = process.env.ENABLE_OPGG_PLAYWRIGHT;
  if (value === "true") return "true";
  if (value === "false") return "false";
  return "unset";
}

async function fetchOpggHtml({ label, url }: { label: "champions" | "overview"; url: string }) {
  console.info(`[opgg-profile] Request ${label} page`, { url });

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "1234-auction-web/1.0",
    },
  });

  console.info(`[opgg-profile] ${label} page response`, {
    status: response.status,
    url,
  });

  if (!response.ok) {
    console.warn(`[opgg-profile] ${label} page request failed`, {
      status: response.status,
      url,
    });
    return null;
  }

  const html = await response.text();
  console.info(`[opgg-profile] ${label} HTML received`, {
    hasHtml: html.length > 0,
    length: html.length,
    url,
  });

  return html;
}

function htmlToPlainText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseSeasonTierCandidates(text: string): SeasonTierCandidate[] {
  const seasonTierRegex =
    /\b(S20\d{2}(?:\s+S\d)?|S\d{1,2})\s+(challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron|챌린저|그랜드마스터|마스터|다이아몬드|에메랄드|플래티넘|골드|실버|브론즈|아이언)\s*([1-5]|I|II|III|IV|V)?\b/gi;
  const candidates: SeasonTierCandidate[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(seasonTierRegex)) {
    const tier = normalizeTier(match[2] ?? null);
    const rank = normalizeRank(match[3] ?? null);
    const raw = match[0].trim();
    const key = `${raw}:${tier}:${rank}`;

    if (!tier) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      raw,
      tier,
      rank,
    });
  }

  return candidates;
}

function parseChampionCandidates(text: string): ParsedChampionCandidate[] {
  const limitedSection = text.slice(0, 6000);
  const rankedChampionRegex = /(?:^|\s)([1-9]|1\d|20)\s+([가-힣A-Za-z][가-힣A-Za-z.'’\-\s]{1,40}?)(?=\s+(?:[1-9]|1\d|20)\s+|\s+\d+(?:\.\d+)?%|\s+\d+\s*(?:게임|승|패)|$)/g;
  const matches = Array.from(limitedSection.matchAll(rankedChampionRegex));
  const candidates: ParsedChampionCandidate[] = [];
  const seen = new Set<string>();

  matches.forEach((match, index) => {
    const rawName = cleanupChampionCandidate(match[2] ?? "");
    const nameCandidates = expandChampionNameCandidates(rawName);
    const nextMatchIndex = matches[index + 1]?.index ?? Math.min(limitedSection.length, (match.index ?? 0) + 500);
    const rowText = limitedSection.slice(match.index ?? 0, nextMatchIndex);
    const games = extractChampionGames(rowText);
    const uniqueNameCandidates = nameCandidates.filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueNameCandidates.length) {
      candidates.push({
        rawName,
        nameCandidates: uniqueNameCandidates,
        games,
      });
    }
  });

  return candidates;
}

async function resolveMostChampionCandidates(candidates: ParsedChampionCandidate[]) {
  const invalidCandidates: string[] = [];
  const validChampionMap = new Map<
    string,
    { firstIndex: number; games: number; imageUrl: string | null; name: string }
  >();

  for (const [index, candidate] of candidates.entries()) {
    let resolvedChampion: Awaited<ReturnType<typeof resolveChampionCandidate>> = null;

    for (const nameCandidate of candidate.nameCandidates) {
      resolvedChampion = await resolveChampionCandidate(nameCandidate);
      if (resolvedChampion) break;
    }

    if (!resolvedChampion) {
      invalidCandidates.push(candidate.rawName);
      continue;
    }

    const existingChampion = validChampionMap.get(resolvedChampion.id);
    if (existingChampion) {
      existingChampion.games += candidate.games;
      continue;
    }

    validChampionMap.set(resolvedChampion.id, {
      firstIndex: index,
      games: candidate.games,
      imageUrl: resolvedChampion.imageUrl,
      name: resolvedChampion.name,
    });
  }

  const validChampions = Array.from(validChampionMap.values())
    .sort((first, second) => second.games - first.games || first.firstIndex - second.firstIndex)
    .map((champion) => ({
      games: champion.games,
      imageUrl: champion.imageUrl,
      name: champion.name,
    }));

  return { validChampions, invalidCandidates };
}

function extractChampionGames(text: string) {
  const gamesMatch = /(\d+)\s*(?:게임|games?|matches?|판|전|회)\b/i.exec(text);
  if (gamesMatch?.[1]) return Number.parseInt(gamesMatch[1], 10) || 0;

  const winLossMatch = /(\d+)\s*(?:승|W)\s+(\d+)\s*(?:패|L)\b/i.exec(text);
  if (winLossMatch?.[1] && winLossMatch[2]) {
    return (Number.parseInt(winLossMatch[1], 10) || 0) + (Number.parseInt(winLossMatch[2], 10) || 0);
  }

  return 0;
}

function getPeakTierSection(text: string) {
  const startIndex = text.indexOf("최고 티어");
  if (startIndex < 0) return text;

  const section = text.slice(startIndex, startIndex + 12000);
  const endMarkers = ["솔로랭크", "최근 게임", "선호 포지션", "매치 히스토리", "챔피언"];
  const endIndex = endMarkers
    .map((marker) => section.indexOf(marker, 1000))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return endIndex ? section.slice(0, endIndex) : section;
}

function getSoloRankTierSection(text: string) {
  const soloMarkers = [
    "개인/2인 랭크 게임",
    "개인/2인 랭크",
    "솔로/듀오",
    "솔로 랭크",
    "솔로랭크",
    "Solo/Duo",
    "Ranked Solo/Duo",
  ];
  const flexMarkers = ["자유 랭크 게임", "자유 랭크", "Ranked Flex"];
  const closeMarkers = ["닫기", "Close"];
  const headerIndex = findSoloSeasonTableHeaderIndex(text, soloMarkers, flexMarkers);
  const fallbackHeaderIndex = headerIndex >= 0 ? headerIndex : findFirstSeasonPatternIndex(text);
  const soloStartIndex = headerIndex >= 0 ? findLastMarkerIndex(text, soloMarkers, headerIndex) : -1;
  const sectionStartIndex = soloStartIndex >= 0 ? soloStartIndex : fallbackHeaderIndex;
  const flexStartIndex =
    fallbackHeaderIndex >= 0 ? findFirstMarkerIndex(text, flexMarkers, { fromIndex: fallbackHeaderIndex }) : -1;
  const closeIndex =
    fallbackHeaderIndex >= 0 ? findFirstMarkerIndex(text, closeMarkers, { fromIndex: fallbackHeaderIndex }) : -1;
  const soloEnd = getNearestSectionEnd({
    fallbackEnd: sectionStartIndex >= 0 ? sectionStartIndex + 20_000 : -1,
    minIndex: fallbackHeaderIndex,
    indexes: [flexStartIndex, closeIndex],
  });

  if (sectionStartIndex < 0 || soloEnd <= sectionStartIndex) {
    return {
      found: false,
      flexFound: flexStartIndex >= 0,
      headerIndex,
      soloStart: soloStartIndex,
      flexStart: flexStartIndex,
      closeIndex,
      soloEnd: -1,
      text: "",
    };
  }

  return {
    found: soloStartIndex >= 0,
    flexFound: flexStartIndex > fallbackHeaderIndex,
    headerIndex,
    soloStart: soloStartIndex,
    flexStart: flexStartIndex,
    closeIndex,
    soloEnd,
    text: text.slice(sectionStartIndex, soloEnd),
  };
}

function findSoloSeasonTableHeaderIndex(text: string, soloMarkers: string[], flexMarkers: string[]) {
  const headerIndexes = Array.from(text.matchAll(/시즌\s*티어\s*LP|Season\s*Tier\s*LP/gi))
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);

  for (const headerIndex of headerIndexes) {
    const soloStartIndex = findLastMarkerIndex(text, soloMarkers, headerIndex);
    const previousFlexIndex = findLastMarkerIndex(text, flexMarkers, headerIndex);

    if (soloStartIndex >= 0 && soloStartIndex > previousFlexIndex) {
      return headerIndex;
    }
  }

  return headerIndexes[0] ?? -1;
}

function findFirstSeasonPatternIndex(text: string) {
  const match = /\b(?:S20\d{2}(?:\s+S\d)?|S\d{1,2})\b/i.exec(text);
  return match?.index ?? -1;
}

function getNearestSectionEnd({
  fallbackEnd,
  indexes,
  minIndex,
}: {
  fallbackEnd: number;
  indexes: number[];
  minIndex: number;
}) {
  const nearest = indexes.filter((index) => index > minIndex).sort((a, b) => a - b)[0];
  return nearest ?? fallbackEnd;
}

function findFirstMarkerIndex(
  text: string,
  markers: string[],
  { fromIndex = 0 }: { fromIndex?: number } = {},
) {
  return markers
    .map((marker) => text.indexOf(marker, fromIndex))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
}

function findLastMarkerIndex(text: string, markers: string[], beforeIndex: number) {
  return markers
    .map((marker) => text.lastIndexOf(marker, beforeIndex))
    .filter((index) => index >= 0)
    .sort((a, b) => b - a)[0] ?? -1;
}

function getChampionStatsSection(text: string) {
  const startIndex = findChampionStatsStartIndex(text);
  const section = text.slice(startIndex >= 0 ? startIndex : 0);
  const endMarkers = [
    "챔피언 숙련도",
    "함께 플레이한 소환사",
    "최근 플레이",
    "최근 20게임",
    "아레나",
    "광고",
    "OP.GG",
  ];
  const endIndex = endMarkers
    .map((marker) => section.indexOf(marker, 1000))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return endIndex ? section.slice(0, endIndex) : section.slice(0, 12000);
}

function findChampionStatsStartIndex(text: string) {
  const myChampionIndex = text.indexOf("내 챔피언");
  const allChampionIndex =
    myChampionIndex >= 0 ? text.indexOf("모든 챔피언", myChampionIndex) : text.indexOf("모든 챔피언");

  if (allChampionIndex >= 0) return allChampionIndex;
  if (myChampionIndex >= 0) return myChampionIndex;

  const seasonIndex = text.search(/시즌\s+20\d{2}/);
  if (seasonIndex >= 0) return seasonIndex;

  return text.indexOf("랭크");
}

function expandChampionNameCandidates(value: string) {
  const cleaned = cleanupChampionCandidate(value);
  if (!cleaned) return [];

  const words = cleaned.split(/\s+/).filter(Boolean);
  const candidates = [cleaned];

  for (let count = 1; count <= Math.min(words.length, 4); count += 1) {
    candidates.push(words.slice(0, count).join(" "));
  }

  return Array.from(new Set(candidates.filter((candidate) => candidate.length >= 2)));
}

function cleanupChampionCandidate(value: string) {
  return value
    .replace(/\b(?:승률|게임|승|패|KDA|CS|평점|티어|LP)\b/gi, " ")
    .replace(/\d+(?:\.\d+)?%?.*$/, "")
    .replace(/[|·•,:/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTier(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  const koreanTierMap: Record<string, string> = {
    챌린저: "CHALLENGER",
    그랜드마스터: "GRANDMASTER",
    마스터: "MASTER",
    다이아몬드: "DIAMOND",
    에메랄드: "EMERALD",
    플래티넘: "PLATINUM",
    골드: "GOLD",
    실버: "SILVER",
    브론즈: "BRONZE",
    아이언: "IRON",
  };
  const tier = koreanTierMap[value.trim()] ?? normalized;
  const validTiers = new Set([
    "CHALLENGER",
    "GRANDMASTER",
    "MASTER",
    "DIAMOND",
    "EMERALD",
    "PLATINUM",
    "GOLD",
    "SILVER",
    "BRONZE",
    "IRON",
    "UNRANKED",
  ]);

  if (!validTiers.has(tier)) return null;
  return tier === "UNRANKED" ? null : tier;
}

function normalizeRank(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  const numberRankMap: Record<string, string> = {
    "1": "I",
    "2": "II",
    "3": "III",
    "4": "IV",
    "5": "V",
  };
  const rank = numberRankMap[normalized] ?? normalized;

  return ["I", "II", "III", "IV", "V"].includes(rank) ? rank : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

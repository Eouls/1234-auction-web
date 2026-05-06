import type { Browser, BrowserContext, Page } from "playwright-core";

type SeasonTierCandidate = {
  rank: string | null;
  raw: string;
  tier: string | null;
};

type PlaywrightRuntime = "local-playwright" | "vercel-sparticuz";

export async function fetchFullSeasonPeakTierWithBrowser(params: {
  gameName: string;
  tagLine: string;
}): Promise<{
  peakRank?: string | null;
  peakTier?: string;
  success: boolean;
  warning?: string;
}> {
  const normalizedGameName = params.gameName.trim();
  const normalizedTagLine = params.tagLine.trim().replace(/^#/, "");
  const encodedSummoner = `${encodeURIComponent(normalizedGameName)}-${encodeURIComponent(normalizedTagLine)}`;
  const url = `https://op.gg/ko/lol/summoners/kr/${encodedSummoner}`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runFullSeasonLookupAttempt({ attempt, url });
    if (result.success) return result;

    if (attempt === 1 && isRetryablePlaywrightWarning(result.warning)) {
      console.warn("[opgg-profile] retry full season lookup", {
        attempt,
        warning: result.warning,
      });
      continue;
    }

    return result;
  }

  return {
    success: false,
    warning: "전체 시즌 펼침 조회에 실패해 기본 표시 데이터만 사용했습니다.",
  };
}

const blockedResourceTypes = new Set(["image", "media", "font"]);
const blockedUrlPatterns = [
  "analytics",
  "google-analytics",
  "googletagmanager",
  "doubleclick",
  "adservice",
  "facebook",
  "sentry",
  "hotjar",
  "clarity",
  "taboola",
  "criteo",
];

async function runFullSeasonLookupAttempt({
  attempt,
  url,
}: {
  attempt: number;
  url: string;
}): Promise<{
  peakRank?: string | null;
  peakTier?: string;
  success: boolean;
  warning?: string;
}> {
  try {
    console.log("[opgg-profile] use playwright full season lookup", { url });
    console.log("[opgg-profile] full season lookup start", { attempt, url });

    return await withBrowserPage(async ({ page }) => {
      await enableResourceBlocking(page);

      console.log("[opgg-profile] playwright goto start", { attempt, url });
      await page.goto(url, {
        timeout: 15_000,
        waitUntil: "domcontentloaded",
      });
      console.log("[opgg-profile] goto completed", { attempt, url });
      console.log("[opgg-profile] page goto completed", { attempt, url });

      const allSeasonsLocator =
        (await page
          .getByRole("button", { name: /모든\s*시즌\s*티어\s*보기/ })
          .first()
          .count()
          .catch(() => 0)) > 0
          ? page.getByRole("button", { name: /모든\s*시즌\s*티어\s*보기/ }).first()
          : page.getByText(/모든\s*시즌\s*티어\s*보기/).first();
      const hasAllSeasonsButton = (await allSeasonsLocator.count().catch(() => 0)) > 0;
      console.log("[opgg-profile] all seasons button found", hasAllSeasonsButton);

      if (!hasAllSeasonsButton) {
        console.warn("[opgg-profile] all seasons button not found", { url });
        return {
          success: false,
          warning: "전체 시즌 펼침 버튼을 찾지 못해 기본 표시 데이터만 사용했습니다.",
        };
      }

      try {
        await allSeasonsLocator.click({ timeout: 5_000 });
        console.log("[opgg-profile] clicked all seasons button");
      } catch (error) {
        console.warn("[opgg-profile] all seasons button click failed", {
          message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
          url,
        });
        return {
          success: false,
          warning: "전체 시즌 펼침 버튼 클릭에 실패해 기본 표시 데이터만 사용했습니다.",
        };
      }

      await page
        .waitForFunction(
          () => {
            const text = document.body.innerText;
            return text.includes("닫기") || text.includes("S9") || text.includes("S8") || text.includes("S7");
          },
          undefined,
          { timeout: 8_000 },
        )
        .catch(() => undefined);

      const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
      const soloRankTierSection = getSoloRankTierSection(bodyText);
      const candidates = parseSeasonTierCandidates(soloRankTierSection.text);
      const peak = pickHighestSeasonTier(candidates);

      console.log("[opgg-profile] body text sample after click", bodyText.slice(0, 1000));
      console.log("[opgg-profile] solo rank section found", {
        found: soloRankTierSection.found,
        length: soloRankTierSection.text.length,
        sample: soloRankTierSection.text.slice(0, 1000),
      });
      console.log("[opgg-profile] flex rank section ignored", {
        found: soloRankTierSection.flexFound,
      });
      console.log("[opgg-profile] playwright body text contains legacy seasons", {
        hasS9: bodyText.includes("S9"),
        hasDiamond3: bodyText.toLowerCase().includes("diamond 3"),
        hasS8: bodyText.includes("S8"),
        hasS7: bodyText.includes("S7"),
        sample: bodyText.slice(0, 1000),
      });
      console.log("[opgg-profile] full season tier candidates", candidates);
      console.log("[opgg-profile] solo queue peak candidates", candidates);
      console.log("[opgg-profile] compare peak candidates", candidates);
      console.log("[opgg-profile] selected peak", {
        tier: peak?.tier ?? null,
        rank: peak?.rank ?? null,
      });
      console.log("[opgg-profile] selected solo queue peak tier", {
        tier: peak?.tier ?? null,
        rank: peak?.rank ?? null,
      });
      console.log("[opgg-profile] final full peak tier", {
        finalPeakTier: peak?.tier ?? null,
        finalPeakRank: peak?.rank ?? null,
      });

      if (!peak?.tier) {
        return {
          success: false,
          warning: "전체 시즌 티어 후보를 찾지 못해 기본 표시 데이터만 사용했습니다.",
        };
      }

      return {
        success: true,
        peakTier: peak.tier,
        peakRank: peak.rank,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (isResourceFailureMessage(message)) {
      console.warn("[opgg-profile] full season lookup resource failure", {
        attempt,
        message,
        url,
      });
    }
    console.warn("[opgg-profile] playwright full season lookup failed", {
      attempt,
      message,
      url,
    });
    return {
      success: false,
      warning: isResourceFailureMessage(message)
        ? "OP.GG 전체 시즌 조회 중 브라우저 자원이 부족해 기본 표시 데이터만 사용했습니다."
        : "전체 시즌 펼침 조회에 실패해 기본 표시 데이터만 사용했습니다.",
    };
  }
}

async function withBrowserPage<T>(callback: ({ page }: { page: Page }) => Promise<T>) {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    const launchedBrowser = await launchBrowser();
    browser = launchedBrowser.browser;
    console.log(`[opgg-profile] playwright runtime: ${launchedBrowser.runtime}`);

    context = await browser.newContext({
      locale: "ko-KR",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });
    page = await context.newPage();

    return await callback({ page });
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function enableResourceBlocking(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const url = request.url().toLowerCase();

    if (blockedResourceTypes.has(resourceType) || blockedUrlPatterns.some((pattern) => url.includes(pattern))) {
      await route.abort().catch(() => undefined);
      return;
    }

    await route.continue().catch(() => undefined);
  });
  console.log("[opgg-profile] route blocking enabled", {
    blockedResourceTypes: Array.from(blockedResourceTypes),
  });
}

async function launchBrowser(): Promise<{ browser: Browser; runtime: PlaywrightRuntime }> {
  if (isVercelRuntime()) {
    const [{ chromium: playwrightChromium }, chromiumModule, { existsSync }, pathModule] = await Promise.all([
      import("playwright-core"),
      import("@sparticuz/chromium"),
      import("node:fs"),
      import("node:path"),
    ]);
    const chromium = chromiumModule.default;
    const binPath = pathModule.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");
    const hasBinPath = existsSync(binPath);

    console.log("[opgg-profile] sparticuz bin path exists", { hasBinPath });

    const executablePath = hasBinPath ? await chromium.executablePath(binPath) : await chromium.executablePath();

    console.log("[opgg-profile] chromium executable path resolved", {
      executablePath,
      runtime: "vercel-sparticuz",
    });

    return {
      runtime: "vercel-sparticuz",
      browser: await playwrightChromium.launch({
        args: getChromiumLaunchArgs(chromium.args),
        executablePath,
        headless: true,
      }),
    };
  }

  const { chromium } = await import("playwright");
  console.log("[opgg-profile] chromium executable path resolved", {
    executablePath: "local-playwright",
    runtime: "local-playwright",
  });

  return {
    runtime: "local-playwright",
    browser: await chromium.launch({ args: getChromiumLaunchArgs([]), headless: true }),
  };
}

function getChromiumLaunchArgs(baseArgs: string[]) {
  return Array.from(
    new Set([
      ...baseArgs,
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-extensions",
      "--mute-audio",
      "--hide-scrollbars",
    ]),
  );
}

function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

function isRetryablePlaywrightWarning(warning?: string) {
  return Boolean(warning && (warning.includes("브라우저 자원") || warning.includes("실패")));
}

function isResourceFailureMessage(message: string) {
  return message.includes("ERR_INSUFFICIENT_RESOURCES") || message.includes("Insufficient resources");
}

function getSoloRankTierSection(text: string) {
  const soloStartIndex = findFirstMarkerIndex(text, [
    "개인/2인 랭크 게임",
    "개인/2인 랭크",
    "솔로/듀오",
    "솔로 랭크",
    "솔로랭크",
    "Solo/Duo",
    "Ranked Solo/Duo",
  ]);
  const flexStartIndex = findFirstMarkerIndex(text, ["자유 랭크 게임", "자유 랭크", "Ranked Flex"], {
    fromIndex: soloStartIndex >= 0 ? soloStartIndex : 0,
  });

  if (soloStartIndex < 0) {
    return {
      found: false,
      flexFound: flexStartIndex >= 0,
      text: "",
    };
  }

  const endIndex = flexStartIndex > soloStartIndex ? flexStartIndex : soloStartIndex + 20_000;

  return {
    found: true,
    flexFound: flexStartIndex > soloStartIndex,
    text: text.slice(soloStartIndex, endIndex),
  };
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

    candidates.push({ raw, tier, rank });
  }

  return candidates;
}

function pickHighestSeasonTier<T extends { rank: string | null; tier: string | null }>(candidates: T[]) {
  return candidates.reduce<T | null>((highest, candidate) => {
    if (!candidate.tier) return highest;
    if (!highest) return candidate;
    return compareSeasonTier(candidate, highest) > 0 ? candidate : highest;
  }, null);
}

function compareSeasonTier(
  first: { rank: string | null; tier: string | null },
  second: { rank: string | null; tier: string | null },
) {
  const firstTierScore = tierScores[first.tier ?? "UNRANKED"] ?? 0;
  const secondTierScore = tierScores[second.tier ?? "UNRANKED"] ?? 0;

  if (firstTierScore !== secondTierScore) return firstTierScore - secondTierScore;

  return (rankScores[first.rank ?? "V"] ?? 0) - (rankScores[second.rank ?? "V"] ?? 0);
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

  return tier in tierScores && tier !== "UNRANKED" ? tier : null;
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

  return rank in rankScores ? rank : null;
}

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
  I: 5,
  II: 4,
  III: 3,
  IV: 2,
  V: 1,
};

import { findChampionAtTextEdge, resolveChampionCandidate } from "@/lib/riot/champions";

export type MatchScreenshotSide = "TEAM_1" | "TEAM_2";
export type MatchScreenshotResultText = "WIN" | "LOSS" | "UNKNOWN";
export type MatchScreenshotLayoutType = "PORTRAIT_AND_NAME" | "CHAMPION_NAME_AND_NAME" | "UNKNOWN";

export type MatchScreenshotRosterEntry = {
  auctionTeamId: string | null;
  lolAccounts: Array<{
    gameName: string;
    id: string;
    tagLine: string;
  }>;
  side: MatchScreenshotSide | null;
  userId: string;
  userNickname: string;
};

export type AnalyzeMatchScreenshotOptions = {
  roster?: MatchScreenshotRosterEntry[];
};

export type AnalyzeMatchScreenshotPlayer = {
  assists: number | null;
  championName: string | null;
  confidence: number;
  deaths: number | null;
  kills: number | null;
  matchedLolAccountId?: string | null;
  matchedLolAccountName?: string | null;
  matchedUserId?: string | null;
  matchedUserNickname?: string | null;
  rawPlayerName: string | null;
};

export type AnalyzeMatchScreenshotResult = {
  detectedLayoutType: MatchScreenshotLayoutType;
  screenResult: MatchScreenshotResultText;
  teams: Array<{
    players: AnalyzeMatchScreenshotPlayer[];
    side: MatchScreenshotSide;
  }>;
  warnings: string[];
};

type RosterMatch = {
  accountName: string | null;
  auctionTeamId: string | null;
  kind: "LOL_ACCOUNT" | "USER";
  lolAccountId: string | null;
  side: MatchScreenshotSide | null;
  userId: string;
  userNickname: string;
};

type ParsedOcrPlayer = AnalyzeMatchScreenshotPlayer & {
  inferredSide: MatchScreenshotSide | null;
  matchKind?: "FULL_LINE_LOL_ACCOUNT" | "FULL_LINE_USER" | "LINE_PAIR" | "CHAMPION_SPLIT" | "UNMATCHED";
  sourceIndex: number;
};

type KdaCandidate = {
  assists: number;
  deaths: number;
  index: number;
  kills: number;
  raw: string;
};

const KDA_REGEX = /\b(\d{1,2})\s*[\/／]\s*(\d{1,2})\s*[\/／]\s*(\d{1,2})\b/g;
const noisePatterns = [
  /^KDA(?:\s|$)/i,
  /^OP$/i,
  /slot/i,
  /상세\s*정보/i,
  /게임/i,
  /^상세\s*정보\s*보기$/,
  /^[12]\s*팀$/,
  /^team\s*[12]$/i,
  /^\d+$/,
  /^[^\p{L}\p{N}]+$/u,
];

export async function analyzeMatchScreenshot(
  image: File | Buffer,
  options: AnalyzeMatchScreenshotOptions = {},
): Promise<AnalyzeMatchScreenshotResult> {
  const warnings: string[] = [];

  try {
    const imageBuffer = await toBuffer(image);
    const preprocessedImage = await preprocessImage(imageBuffer);
    const ocrText = await recognizeText(preprocessedImage, warnings);
    const normalizedText = normalizeOcrText(ocrText);

    console.log("[internal-match-ocr] text sample", normalizedText.slice(0, 1000));

    if (!normalizedText) {
      return buildResult({
        players: [],
        screenResult: "UNKNOWN",
        warnings: [...warnings, "OCR에서 읽을 수 있는 텍스트를 찾지 못했습니다."],
      });
    }

    const rosterIndex = buildRosterIndex(options.roster ?? []);
    const screenResult = parseScreenResult(normalizedText);
    const { excludedTeamKdaCandidates, individualKdaCandidates } = extractKdaCandidates(normalizedText);
    const players = await parsePlayers(normalizedText, rosterIndex, individualKdaCandidates);
    const championCount = players.filter((player) => player.championName).length;

    console.log(
      "[internal-match-ocr] lol account match candidates",
      rosterIndex.accountMatches.slice(0, 20).map((match) => ({
        matchedLolAccountName: match.accountName,
        matchedUserNickname: match.userNickname,
        side: match.side,
      })),
    );
    console.log("[internal-match-ocr] individual kda candidates", individualKdaCandidates.slice(0, 20));
    console.log("[internal-match-ocr] excluded team kda candidates", excludedTeamKdaCandidates.slice(0, 20));
    logRows("full-line lol account matches", players.filter((player) => player.matchKind === "FULL_LINE_LOL_ACCOUNT"));
    logRows("line-pair player champion rows", players.filter((player) => player.matchKind === "LINE_PAIR"));
    logRows("champion split fallback rows", players.filter((player) => player.matchKind === "CHAMPION_SPLIT"));
    logRows("ambiguous champion-name lines", players.filter((player) => player.matchKind === "UNMATCHED" && !player.matchedUserId));
    logRows("final structured rows", players);
    logRows("matched lol account rows", players.filter((player) => player.matchedLolAccountId));

    if (screenResult === "UNKNOWN") {
      warnings.push("승리/패배 문구를 OCR에서 확실히 찾지 못했습니다.");
    }

    if (players.length === 0) {
      warnings.push("플레이어/KDA 후보를 OCR에서 찾지 못해 경매 결과 팀 구성을 기반으로 초안을 만듭니다.");
    }

    if (players.length > 0 && championCount === 0) {
      warnings.push("챔피언 이름을 확실하게 인식하지 못했습니다. 확인 화면에서 수정해주세요.");
    }

    return buildResult({
      players,
      screenResult,
      warnings,
    });
  } catch (error) {
    console.warn("[internal-match-ocr] OCR provider failed", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });

    return buildResult({
      players: [],
      screenResult: "UNKNOWN",
      warnings: ["Tesseract OCR 분석에 실패해 경매 결과 팀 구성을 기반으로 초안을 만들었습니다."],
    });
  }
}

async function toBuffer(image: File | Buffer) {
  if (Buffer.isBuffer(image)) return image;

  return Buffer.from(await image.arrayBuffer());
}

async function preprocessImage(image: Buffer) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;

  return sharp(image)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .linear(1.25, -12)
    .sharpen()
    .png()
    .toBuffer();
}

async function recognizeText(image: Buffer, warnings: string[]) {
  const { createWorker, PSM } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    worker = await createWorker("kor+eng", undefined, {
      logger: (message) => {
        if (message.status === "recognizing text" && message.progress === 1) {
          console.log("[internal-match-ocr] recognition completed");
        }
      },
    });
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.AUTO,
    });

    const result = await worker.recognize(image);
    return result.data.text ?? "";
  } catch (error) {
    console.warn("[internal-match-ocr] kor+eng recognition failed, retrying with eng", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    warnings.push("한국어+영어 OCR 실행에 실패해 영어 OCR로 한 번 더 시도했습니다.");
    await worker?.terminate().catch(() => undefined);

    worker = await createWorker("eng");
    const result = await worker.recognize(image);
    return result.data.text ?? "";
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " / ")
    .replace(/[·•]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseScreenResult(text: string): MatchScreenshotResultText {
  const labelWindow = text.slice(0, 600).toLowerCase();
  const hasExplicitWin = /\b(victory|win)\b/i.test(labelWindow) || labelWindow.includes("승리");
  const hasExplicitLoss = /\b(defeat|loss)\b/i.test(labelWindow) || labelWindow.includes("패배");

  if (hasExplicitWin && !hasExplicitLoss) return "WIN";
  if (!hasExplicitWin && hasExplicitLoss) return "LOSS";

  return "UNKNOWN";
}

function buildRosterIndex(roster: MatchScreenshotRosterEntry[]) {
  const accountMatches: Array<RosterMatch & { aliases: string[] }> = [];
  const userMatches: Array<RosterMatch & { aliases: string[] }> = [];

  roster.forEach((entry) => {
    entry.lolAccounts.forEach((account) => {
      const accountName = `${account.gameName}#${account.tagLine}`;
      const aliases = [
        account.gameName,
        accountName,
        `${account.gameName} #${account.tagLine}`,
        `${account.gameName} ${account.tagLine}`,
      ]
        .map(normalizeMatchText)
        .filter(Boolean);

      accountMatches.push({
        accountName,
        aliases,
        auctionTeamId: entry.auctionTeamId,
        kind: "LOL_ACCOUNT",
        lolAccountId: account.id,
        side: entry.side,
        userId: entry.userId,
        userNickname: entry.userNickname,
      });
    });

    userMatches.push({
      accountName: entry.lolAccounts[0] ? `${entry.lolAccounts[0].gameName}#${entry.lolAccounts[0].tagLine}` : null,
      aliases: [entry.userNickname].map(normalizeMatchText).filter(Boolean),
      auctionTeamId: entry.auctionTeamId,
      kind: "USER",
      lolAccountId: entry.lolAccounts[0]?.id ?? null,
      side: entry.side,
      userId: entry.userId,
      userNickname: entry.userNickname,
    });
  });

  accountMatches.sort((first, second) => longestAlias(second.aliases) - longestAlias(first.aliases));
  userMatches.sort((first, second) => longestAlias(second.aliases) - longestAlias(first.aliases));

  return { accountMatches, userMatches };
}

async function parsePlayers(
  text: string,
  rosterIndex: ReturnType<typeof buildRosterIndex>,
  kdaCandidates: KdaCandidate[],
): Promise<ParsedOcrPlayer[]> {
  const lines = text
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
  const rejectedNoiseLines: string[] = [];
  const filteredLines: string[] = [];
  const rows: ParsedOcrPlayer[] = [];
  const consumedIndexes = new Set<number>();
  const usedRowKeys = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    if (consumedIndexes.has(index)) continue;

    const line = lines[index];
    if (!line) continue;

    const fullAccountMatch = findFullLineMatch(line, rosterIndex.accountMatches);
    if (fullAccountMatch) {
      filteredLines.push(line);
      const nextChampion = await resolveNextLineChampion(lines[index + 1]);
      const shouldPairChampion = Boolean(nextChampion && !findFullLineMatch(lines[index + 1] ?? "", rosterIndex.accountMatches));
      pushRow(
        rows,
        usedRowKeys,
        {
          ...rowFromMatch({
            championName: shouldPairChampion ? (nextChampion?.name ?? null) : null,
            confidence: shouldPairChampion ? 0.9 : 0.86,
            line,
            match: fullAccountMatch,
            matchKind: shouldPairChampion ? "LINE_PAIR" : "FULL_LINE_LOL_ACCOUNT",
            sourceIndex: index,
          }),
        },
      );
      if (shouldPairChampion) consumedIndexes.add(index + 1);
      continue;
    }

    const fullUserMatch = findFullLineMatch(line, rosterIndex.userMatches);
    if (fullUserMatch) {
      filteredLines.push(line);
      const nextChampion = await resolveNextLineChampion(lines[index + 1]);
      const shouldPairChampion = Boolean(nextChampion);
      pushRow(
        rows,
        usedRowKeys,
        rowFromMatch({
          championName: shouldPairChampion ? (nextChampion?.name ?? null) : null,
          confidence: shouldPairChampion ? 0.78 : 0.7,
          line,
          match: fullUserMatch,
          matchKind: shouldPairChampion ? "LINE_PAIR" : "FULL_LINE_USER",
          sourceIndex: index,
        }),
      );
      if (shouldPairChampion) consumedIndexes.add(index + 1);
      continue;
    }

    const splitRow = await tryChampionSplitFallback(line, rosterIndex, index);
    if (splitRow) {
      filteredLines.push(line);
      pushRow(rows, usedRowKeys, splitRow);
      continue;
    }

    if (isNoiseLine(line, rosterIndex) || !looksLikePlayerNameCandidate(line)) {
      rejectedNoiseLines.push(line);
      continue;
    }

    rejectedNoiseLines.push(line);
  }

  console.log("[internal-match-ocr] filtered lines", filteredLines.slice(0, 20));
  console.log("[internal-match-ocr] rejected noise lines", rejectedNoiseLines.slice(0, 20));

  const finalRows = rows
    .filter((row) => row.matchedUserId || row.matchedLolAccountId)
    .slice(0, 10);

  assignKdaByOrder(finalRows, kdaCandidates);
  return finalRows;
}

function extractKdaCandidates(text: string): {
  excludedTeamKdaCandidates: KdaCandidate[];
  individualKdaCandidates: KdaCandidate[];
} {
  const candidates: KdaCandidate[] = [];

  for (const match of text.matchAll(KDA_REGEX)) {
    candidates.push({
      assists: Number(match[3]),
      deaths: Number(match[2]),
      index: match.index ?? 0,
      kills: Number(match[1]),
      raw: match[0],
    });
  }

  const plausibleCandidates = candidates.filter((candidate) => {
    if (candidate.deaths > 20 || candidate.assists > 40 || candidate.kills > 30) return false;
    return true;
  });
  const individualKdaCandidates = plausibleCandidates.length > 10
    ? plausibleCandidates.slice(-10)
    : plausibleCandidates;
  const individualKeys = new Set(individualKdaCandidates.map((candidate) => `${candidate.index}:${candidate.raw}`));
  const excludedTeamKdaCandidates = candidates.filter((candidate) => !individualKeys.has(`${candidate.index}:${candidate.raw}`));

  return {
    excludedTeamKdaCandidates,
    individualKdaCandidates,
  };
}

function assignKdaByOrder(rows: ParsedOcrPlayer[], kdaCandidates: KdaCandidate[]) {
  rows.forEach((row, index) => {
    const kda = kdaCandidates[index];
    if (!kda) return;

    row.kills = kda.kills;
    row.deaths = kda.deaths;
    row.assists = kda.assists;
    row.confidence = Math.min(0.98, Number((row.confidence + 0.08).toFixed(2)));
  });
}

async function tryChampionSplitFallback(
  line: string,
  rosterIndex: ReturnType<typeof buildRosterIndex>,
  sourceIndex: number,
): Promise<ParsedOcrPlayer | null> {
  const champion = await findChampionAtTextEdge(line);
  if (!champion) return null;

  const normalizedLine = normalizeMatchText(line);
  const championAlias = champion.matchedAlias;
  const possibleName = normalizedLine.endsWith(championAlias)
    ? normalizedLine.slice(0, -championAlias.length)
    : normalizedLine.startsWith(championAlias)
      ? normalizedLine.slice(championAlias.length)
      : "";
  if (!possibleName) return null;

  const accountMatch = findPartialAliasMatch(possibleName, rosterIndex.accountMatches);
  const userMatch = accountMatch ?? findPartialAliasMatch(possibleName, rosterIndex.userMatches);
  if (!userMatch) return null;

  return rowFromMatch({
    championName: champion.name,
    confidence: userMatch.kind === "LOL_ACCOUNT" ? 0.74 : 0.62,
    line: bestRawNameFromMatch(userMatch, line),
    match: userMatch,
    matchKind: "CHAMPION_SPLIT",
    sourceIndex,
  });
}

async function resolveNextLineChampion(line: string | undefined) {
  if (!line || looksLikeKda(line)) return null;
  return resolveChampionCandidate(line);
}

function rowFromMatch({
  championName,
  confidence,
  line,
  match,
  matchKind,
  sourceIndex,
}: {
  championName: string | null;
  confidence: number;
  line: string;
  match: RosterMatch;
  matchKind: ParsedOcrPlayer["matchKind"];
  sourceIndex: number;
}): ParsedOcrPlayer {
  return {
    assists: null,
    championName,
    confidence,
    deaths: null,
    inferredSide: match.side,
    kills: null,
    matchedLolAccountId: match.lolAccountId,
    matchedLolAccountName: match.accountName,
    matchedUserId: match.userId,
    matchedUserNickname: match.userNickname,
    matchKind,
    rawPlayerName: match.kind === "LOL_ACCOUNT" ? (match.accountName?.split("#")[0] ?? line) : line,
    sourceIndex,
  };
}

function findFullLineMatch(
  line: string,
  matches: Array<RosterMatch & { aliases: string[] }>,
): RosterMatch | null {
  const normalizedLine = normalizeMatchText(line);
  if (!normalizedLine) return null;

  return matches.find((match) => match.aliases.some((alias) => alias === normalizedLine)) ?? null;
}

function findPartialAliasMatch(
  normalizedValue: string,
  matches: Array<RosterMatch & { aliases: string[] }>,
): RosterMatch | null {
  if (!normalizedValue) return null;

  return (
    matches.find((match) =>
      match.aliases.some((alias) => {
        if (alias.length < 2) return false;
        if (alias === normalizedValue) return true;
        if (normalizedValue.length >= 3 && normalizedValue.includes(alias)) return true;
        return normalizedValue.length >= 4 && alias.includes(normalizedValue);
      }),
    ) ?? null
  );
}

function pushRow(rows: ParsedOcrPlayer[], usedRowKeys: Set<string>, row: ParsedOcrPlayer) {
  const key = row.matchedLolAccountId ? `account:${row.matchedLolAccountId}` : `raw:${normalizeMatchText(row.rawPlayerName ?? "")}`;
  if (usedRowKeys.has(key)) return;

  usedRowKeys.add(key);
  rows.push(row);
}

function bestRawNameFromMatch(match: RosterMatch, fallback: string) {
  return match.kind === "LOL_ACCOUNT" ? (match.accountName?.split("#")[0] ?? fallback) : fallback;
}

function cleanLine(line: string) {
  return line
    .replace(KDA_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseLine(line: string, rosterIndex: ReturnType<typeof buildRosterIndex>) {
  if (findFullLineMatch(line, rosterIndex.accountMatches) || findFullLineMatch(line, rosterIndex.userMatches)) return false;
  if (line.length <= 1) return true;
  if (noisePatterns.some((pattern) => pattern.test(line))) return true;
  if (!looksLikePlayerNameCandidate(line)) return true;

  return false;
}

function looksLikeKda(line: string) {
  return /\b\d{1,2}\s*[\/／]\s*\d{1,2}\s*[\/／]\s*\d{1,2}\b/.test(line);
}

function looksLikePlayerNameCandidate(line: string) {
  if (looksLikeKda(line)) return false;

  const compactLine = line.replace(/\s+/g, "");
  const lettersAndNumbers = Array.from(compactLine).filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
  const symbols = Array.from(compactLine).filter((char) => !/[\p{L}\p{N}]/u.test(char)).length;
  const symbolRatio = compactLine.length ? symbols / compactLine.length : 1;
  const koreanOrLatinLetters = Array.from(compactLine).filter((char) => /[\p{L}]/u.test(char)).length;

  if (lettersAndNumbers < 2) return false;
  if (koreanOrLatinLetters < 2) return false;
  if (symbolRatio > 0.25) return false;
  if (/[\/=%*\[\]{}<>©®]/.test(line)) return false;

  return true;
}

function buildResult(params: {
  players: ParsedOcrPlayer[];
  screenResult: MatchScreenshotResultText;
  warnings: string[];
}): AnalyzeMatchScreenshotResult {
  const teamOnePlayers: AnalyzeMatchScreenshotPlayer[] = [];
  const teamTwoPlayers: AnalyzeMatchScreenshotPlayer[] = [];
  const players = params.players.sort((first, second) => first.sourceIndex - second.sourceIndex);
  const championCount = players.filter((player) => player.championName).length;
  const rowsWithSide = players.filter((player) => player.inferredSide);
  const splitIndex = players.length > 0 ? Math.ceil(players.length / 2) : 0;

  players.forEach((player, index) => {
    const target =
      player.inferredSide === "TEAM_1"
        ? teamOnePlayers
        : player.inferredSide === "TEAM_2"
          ? teamTwoPlayers
          : rowsWithSide.length > 0
            ? index < splitIndex
              ? teamOnePlayers
              : teamTwoPlayers
            : index < splitIndex
              ? teamOnePlayers
              : teamTwoPlayers;
    const { inferredSide, matchKind, sourceIndex, ...publicPlayer } = player;
    void inferredSide;
    void matchKind;
    void sourceIndex;
    target.push(publicPlayer);
  });

  return {
    detectedLayoutType:
      players.length === 0 ? "UNKNOWN" : championCount >= Math.max(2, Math.floor(players.length / 3)) ? "CHAMPION_NAME_AND_NAME" : "PORTRAIT_AND_NAME",
    screenResult: params.screenResult,
    teams: [
      { side: "TEAM_1", players: teamOnePlayers },
      { side: "TEAM_2", players: teamTwoPlayers },
    ],
    warnings: params.warnings,
  };
}

function logRows(label: string, rows: ParsedOcrPlayer[]) {
  console.log(
    `[internal-match-ocr] ${label}`,
    rows.slice(0, 20).map((row) => ({
      confidence: row.confidence,
      matchedLolAccountName: row.matchedLolAccountName,
      matchedUserNickname: row.matchedUserNickname,
      rawPlayerName: row.rawPlayerName,
    })),
  );
}

function longestAlias(aliases: string[]) {
  return Math.max(0, ...aliases.map((alias) => alias.length));
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/\s/g, "").replace(/[#＃]/g, "").replace(/[^a-z0-9가-힣]/g, "");
}

"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ParticipantStatus } from "@/generated/prisma/client";
import {
  analyzeMatchScreenshot,
  type MatchScreenshotResultText,
  type MatchScreenshotRosterEntry,
  type MatchScreenshotSide,
} from "@/lib/match-records/analyze-screenshot";
import { prisma } from "@/lib/prisma";
import { getChampionOptions, type ChampionOption } from "@/lib/riot/champions";
import { createClient } from "@/lib/supabase/server";

export type InternalMatchUserOption = {
  account: string;
  auctionTeamId: string | null;
  id: string;
  label: string;
  lolAccountId: string | null;
  nickname: string;
  optionKey: string;
  side: MatchScreenshotSide | null;
};

export type InternalMatchPlayerDraft = {
  assists: number | null;
  auctionTeamId: string | null;
  championId: string | null;
  championImageUrl: string | null;
  championName: string | null;
  confidence: number | null;
  cs: number | null;
  damage: number | null;
  deaths: number | null;
  draftId: string;
  kills: number | null;
  matchedLolAccountName?: string | null;
  matchedUserNickname?: string | null;
  rawPlayerName: string | null;
  side: MatchScreenshotSide;
  userId: string | null;
  win: boolean;
};

export type InternalMatchDraft = {
  auctionCode: string;
  auctionId: string;
  championOptions: ChampionOption[];
  gameNumber: number;
  playedAt: string;
  screenResult: MatchScreenshotResultText;
  screenshotUrl: string | null;
  sourceType: "MANUAL" | "OCR";
  teams: Array<{
    auctionTeamId: string | null;
    players: InternalMatchPlayerDraft[];
    side: MatchScreenshotSide;
    teamName: string;
  }>;
  userOptions: InternalMatchUserOption[];
  warnings: string[];
  winningSide: MatchScreenshotSide;
};

export type AnalyzeInternalMatchState = {
  draft?: InternalMatchDraft;
  error?: string;
  success?: string;
};

export type SaveInternalMatchState = {
  error?: string;
  success?: string;
};

const screenshotBucket = "internal-match-screenshots";
const allowedScreenshotTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxScreenshotSize = 5 * 1024 * 1024;

export async function analyzeInternalMatchScreenshot(formData: FormData): Promise<AnalyzeInternalMatchState> {
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  const screenshot = formData.get("screenshot");

  if (!auctionId || !auctionCode) return { error: "경매 정보를 찾을 수 없습니다." };
  if (!(screenshot instanceof File) || screenshot.size === 0) {
    return { error: "분석할 스크린샷을 업로드해주세요." };
  }
  if (!allowedScreenshotTypes.has(screenshot.type)) {
    return { error: "jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다." };
  }
  if (screenshot.size > maxScreenshotSize) {
    return { error: "스크린샷은 최대 5MB까지 업로드할 수 있습니다." };
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  const auction = await getAuctionForMatchDraft(auctionId);
  if (!auction || auction.code !== auctionCode) return { error: "경매방을 찾을 수 없습니다." };
  if (!canManageMatchRecords(auction, currentUser.id)) return { error: "방장만 내전 기록을 등록할 수 있습니다." };

  const extension = screenshot.name.split(".").pop()?.toLowerCase() ?? "png";
  const safeExtension = extension === "jpeg" ? "jpg" : extension;
  const path = `${auction.id}/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;
  const { error: uploadError } = await supabase.storage.from(screenshotBucket).upload(path, screenshot, {
    contentType: screenshot.type,
    upsert: false,
  });

  if (uploadError) {
    console.error("[internal-match] screenshot upload failed", {
      message: uploadError.message,
      name: getErrorProperty(uploadError, "name"),
      statusCode: getErrorProperty(uploadError, "statusCode"),
    });
    return { error: "스크린샷 업로드에 실패했습니다. internal-match-screenshots bucket 설정을 확인해주세요." };
  }

  let result: AnalyzeInternalMatchState;

  try {
    const imageBuffer = Buffer.from(await screenshot.arrayBuffer());
    const analysis = await analyzeMatchScreenshot(imageBuffer, {
      roster: buildOcrRoster(auction),
    });
    const draft = await buildInternalMatchDraft({
      analysis,
      auction,
      auctionCode,
      screenshotUrl: null,
    });

    result = { draft, success: "스크린샷 분석 초안을 만들었습니다." };
  } catch (error) {
    console.error("[internal-match] screenshot analysis failed", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    result = { error: "스크린샷 분석에 실패했습니다." };
  }

  const removeError = await removeTemporaryScreenshot(supabase, path);
  if (removeError) {
    console.error("[internal-match] temporary screenshot delete failed", {
      message: removeError.message,
      name: getErrorProperty(removeError, "name"),
      path,
      statusCode: getErrorProperty(removeError, "statusCode"),
    });

    if (result.draft) {
      result.draft.warnings.push("분석용 임시 스크린샷 삭제에 실패했습니다. Storage DELETE 정책을 확인해주세요.");
    }
  }

  return result;
}

export async function createManualInternalMatchDraft(formData: FormData): Promise<AnalyzeInternalMatchState> {
  const auctionId = stringValue(formData.get("auctionId"));
  const auctionCode = stringValue(formData.get("auctionCode"));
  if (!auctionId || !auctionCode) return { error: "경매 정보를 찾을 수 없습니다." };

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  const auction = await getAuctionForMatchDraft(auctionId);
  if (!auction || auction.code !== auctionCode) return { error: "경매방을 찾을 수 없습니다." };
  if (!canManageMatchRecords(auction, currentUser.id)) return { error: "방장만 내전 기록을 등록할 수 있습니다." };

  const draft = await buildInternalMatchDraft({
    analysis: {
      detectedLayoutType: "UNKNOWN",
      screenResult: "UNKNOWN",
      teams: [],
      warnings: ["수동 입력 초안입니다. 승리 팀과 플레이어 기록을 직접 확인해주세요."],
    },
    auction,
    auctionCode,
    screenshotUrl: null,
    sourceType: "MANUAL",
  });

  return { draft, success: "수동 입력 초안을 만들었습니다." };
}

export async function saveInternalMatchDraft(payload: InternalMatchDraft): Promise<SaveInternalMatchState> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };

  const auction = await prisma.auction.findUnique({
    where: { id: payload.auctionId },
    include: {
      participants: true,
      teams: true,
    },
  });

  if (!auction || auction.code !== payload.auctionCode) return { error: "경매방을 찾을 수 없습니다." };
  if (!canManageMatchRecords(auction, currentUser.id)) return { error: "방장만 내전 기록을 저장할 수 있습니다." };
  if (payload.winningSide !== "TEAM_1" && payload.winningSide !== "TEAM_2") {
    return { error: "승리 팀을 선택해주세요." };
  }
  if (!Number.isInteger(payload.gameNumber) || payload.gameNumber < 1) {
    return { error: "경기 번호는 1 이상의 숫자여야 합니다." };
  }

  const participantUserIds = new Set(auction.participants.map((participant) => participant.userId));
  const teamIds = new Set(auction.teams.map((team) => team.id));
  const players = payload.teams.flatMap((team) => team.players);

  if (players.length === 0) return { error: "저장할 플레이어 정보가 없습니다." };

  const matchFingerprint = createMatchFingerprint({
    auctionId: auction.id,
    players,
    winningSide: payload.winningSide,
  });
  const duplicateMatch = await prisma.internalMatch.findFirst({
    where: {
      auctionId: auction.id,
      OR: [
        { gameNumber: payload.gameNumber },
        { matchFingerprint },
      ],
    },
    select: {
      gameNumber: true,
      matchFingerprint: true,
    },
  });

  if (duplicateMatch?.gameNumber === payload.gameNumber) {
    return { error: "이미 해당 경기 번호의 내전 기록이 저장되어 있습니다." };
  }
  if (duplicateMatch?.matchFingerprint === matchFingerprint) {
    return { error: "이미 같은 내용의 내전 기록이 저장되어 있습니다." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const match = await tx.internalMatch.create({
        data: {
          auctionId: auction.id,
          createdByUserId: currentUser.id,
          gameNumber: payload.gameNumber,
          matchFingerprint,
          sourceType: payload.sourceType === "MANUAL" ? "MANUAL" : "OCR",
          status: "CONFIRMED",
          screenshotUrl: payload.screenshotUrl,
          resultText: payload.screenResult,
          winningSide: payload.winningSide,
          playedAt: new Date(payload.playedAt),
        },
        select: { id: true },
      });

      const matchTeams = await Promise.all(
        payload.teams.map((team) =>
          tx.internalMatchTeam.create({
            data: {
              auctionTeamId: team.auctionTeamId && teamIds.has(team.auctionTeamId) ? team.auctionTeamId : null,
              internalMatchId: match.id,
              result: team.side === payload.winningSide ? "WIN" : "LOSE",
              side: team.side,
              teamName: nullableString(team.teamName),
            },
            select: {
              id: true,
              side: true,
            },
          }),
        ),
      );
      const matchTeamIdBySide = new Map(matchTeams.map((team) => [team.side, team.id]));

      await tx.internalMatchPlayer.createMany({
        data: players.map((player) => ({
          internalMatchId: match.id,
          internalMatchTeamId: matchTeamIdBySide.get(player.side) ?? null,
          userId: player.userId && participantUserIds.has(player.userId) ? player.userId : null,
          auctionTeamId: player.auctionTeamId && teamIds.has(player.auctionTeamId) ? player.auctionTeamId : null,
          side: player.side,
          rawPlayerName: nullableString(player.rawPlayerName),
          championName: nullableString(player.championName),
          championId: nullableString(player.championId),
          championImageUrl: nullableString(player.championImageUrl),
          kills: nullableInteger(player.kills),
          deaths: nullableInteger(player.deaths),
          assists: nullableInteger(player.assists),
          cs: nullableInteger(player.cs),
          damage: nullableInteger(player.damage),
          win: player.win,
          confidence: typeof player.confidence === "number" ? player.confidence : null,
        })),
      });
    });
  } catch (error) {
    console.error("[internal-match] failed to save", error);
    if (isUniqueConstraintError(error)) {
      return { error: "이미 같은 경기 번호 또는 같은 내용의 내전 기록이 저장되어 있습니다." };
    }
    return { error: "내전 기록 저장에 실패했습니다." };
  }

  revalidatePath(`/auctions/${auction.code}/result`);
  return { success: "내전 기록을 저장했습니다." };
}

async function buildInternalMatchDraft({
  analysis,
  auction,
  auctionCode,
  sourceType = "OCR",
  screenshotUrl,
}: {
  analysis: Awaited<ReturnType<typeof analyzeMatchScreenshot>>;
  auction: NonNullable<Awaited<ReturnType<typeof getAuctionForMatchDraft>>>;
  auctionCode: string;
  sourceType?: "MANUAL" | "OCR";
  screenshotUrl: string | null;
}): Promise<InternalMatchDraft> {
  const championOptions = await getChampionOptions();
  const championByName = new Map(
    championOptions.flatMap((champion) =>
      [champion.name, champion.englishName, champion.id]
        .filter(Boolean)
        .map((alias) => [normalizeMatchText(alias as string), champion] as const),
    ),
  );
  const userOptions = buildUserOptions(auction);
  const sideTeams = auction.teams.slice(0, 2).map((team, index) => ({
    side: (index === 0 ? "TEAM_1" : "TEAM_2") as MatchScreenshotSide,
    team,
  }));
  const winningSide = analysis.screenResult === "LOSS" ? "TEAM_2" : "TEAM_1";
  const warnings = [...analysis.warnings];

  const teams = sideTeams.map(({ side, team }) => {
    const analyzedPlayers = analysis.teams.find((analysisTeam) => analysisTeam.side === side)?.players ?? [];
    const fallbackPlayers = getTeamRosterPlayers(auction, team.id);
    const analyzedUserIds = new Set(analyzedPlayers.map((player) => player.matchedUserId).filter(Boolean));
    const sourcePlayers = [
      ...analyzedPlayers,
      ...fallbackPlayers
        .filter((player) => !analyzedUserIds.has(player.id))
        .map((player) => ({
          rawPlayerName: player.nickname,
          championName: null,
          kills: null,
          deaths: null,
          assists: null,
          confidence: 0.5,
        })),
    ];

    return {
      auctionTeamId: team.id,
      side,
      teamName: team.captain ? `${team.captain.nickname} 팀` : team.name,
      players: sourcePlayers.map((player) => {
        const analysisPlayer = player as Partial<(typeof analyzedPlayers)[number]>;
        const matchedUser =
          findUserOptionByAnalysisMatch(analysisPlayer, userOptions, side) ?? matchUserOption(player.rawPlayerName, userOptions, side);
        const champion = player.championName ? championByName.get(normalizeMatchText(player.championName)) : null;

        return {
          assists: player.assists,
          auctionTeamId: matchedUser?.auctionTeamId ?? team.id,
          championId: champion?.id ?? null,
          championImageUrl: champion?.imageUrl ?? null,
          championName: champion?.name ?? player.championName,
          confidence: player.confidence,
          cs: null,
          damage: null,
          deaths: player.deaths,
          draftId: crypto.randomUUID(),
          kills: player.kills,
          matchedLolAccountName: analysisPlayer.matchedLolAccountName ?? matchedUser?.account ?? null,
          matchedUserNickname: analysisPlayer.matchedUserNickname ?? matchedUser?.nickname ?? null,
          rawPlayerName: player.rawPlayerName,
          side,
          userId: matchedUser?.id ?? null,
          win: side === winningSide,
        };
      }),
    };
  });

  if (analysis.screenResult === "UNKNOWN") {
    warnings.push("승패를 인식하지 못했습니다. 저장 전 승리 팀을 확인해주세요.");
  }

  return {
    auctionCode,
    auctionId: auction.id,
    championOptions,
    gameNumber: getNextGameNumber(auction.internalMatches),
    playedAt: new Date().toISOString(),
    screenResult: analysis.screenResult,
    screenshotUrl,
    sourceType,
    teams,
    userOptions,
    warnings,
    winningSide,
  };
}

async function getAuctionForMatchDraft(auctionId: string) {
  return prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: {
          captain: {
            include: {
              lolAccounts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            },
          },
        },
      },
      participants: {
        orderBy: [{ auctionOrder: "asc" }, { createdAt: "asc" }],
        include: {
          user: {
            include: {
              lolAccounts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            },
          },
        },
      },
      internalMatches: {
        orderBy: [{ gameNumber: "asc" }, { createdAt: "asc" }],
        select: {
          gameNumber: true,
        },
      },
    },
  });
}

function getTeamRosterPlayers(
  auction: NonNullable<Awaited<ReturnType<typeof getAuctionForMatchDraft>>>,
  teamId: string,
) {
  const team = auction.teams.find((auctionTeam) => auctionTeam.id === teamId);
  const captain = team?.captain
    ? [{ id: team.captain.id, nickname: team.captain.nickname }]
    : [];
  const soldMembers = auction.participants
    .filter((participant) => participant.teamId === teamId && participant.status === ParticipantStatus.SOLD)
    .map((participant) => ({ id: participant.user.id, nickname: participant.user.nickname }));

  return [...captain, ...soldMembers];
}

function buildUserOptions(auction: NonNullable<Awaited<ReturnType<typeof getAuctionForMatchDraft>>>): InternalMatchUserOption[] {
  const options = new Map<string, InternalMatchUserOption>();
  const sideByTeamId = new Map(auction.teams.slice(0, 2).map((team, index) => [team.id, index === 0 ? "TEAM_1" : "TEAM_2"] as const));

  auction.teams.forEach((team) => {
    if (team.captain) {
      addUserAccountOptions(options, {
        auctionTeamId: team.id,
        lolAccounts: team.captain.lolAccounts,
        nickname: team.captain.nickname,
        side: sideByTeamId.get(team.id) ?? null,
        userId: team.captain.id,
      });
    }
  });

  auction.participants.forEach((participant) => {
    addUserAccountOptions(options, {
      auctionTeamId: participant.teamId,
      lolAccounts: participant.user.lolAccounts,
      nickname: participant.user.nickname,
      side: participant.teamId ? (sideByTeamId.get(participant.teamId) ?? null) : null,
      userId: participant.user.id,
    });
  });

  return Array.from(options.values()).sort(
    (first, second) => first.nickname.localeCompare(second.nickname) || first.account.localeCompare(second.account),
  );
}

function addUserAccountOptions(
  options: Map<string, InternalMatchUserOption>,
  data: {
    auctionTeamId: string | null;
    lolAccounts: Array<{ gameName: string; id: string; tagLine: string }>;
    nickname: string;
    side: MatchScreenshotSide | null;
    userId: string;
  },
) {
  if (data.lolAccounts.length === 0) {
    const optionKey = `${data.userId}:no-account`;
    options.set(optionKey, {
      account: "롤 계정 정보 없음",
      auctionTeamId: data.auctionTeamId,
      id: data.userId,
      label: `${data.nickname} · 롤 계정 정보 없음`,
      lolAccountId: null,
      nickname: data.nickname,
      optionKey,
      side: data.side,
    });
    return;
  }

  data.lolAccounts.forEach((account) => {
    const optionKey = `${data.userId}:${account.id}`;
    options.set(optionKey, {
      account: formatAccount(account),
      auctionTeamId: data.auctionTeamId,
      id: data.userId,
      label: `${data.nickname} · ${formatAccount(account)}`,
      lolAccountId: account.id,
      nickname: data.nickname,
      optionKey,
      side: data.side,
    });
  });
}

function buildOcrRoster(auction: NonNullable<Awaited<ReturnType<typeof getAuctionForMatchDraft>>>): MatchScreenshotRosterEntry[] {
  const sideByTeamId = new Map(auction.teams.slice(0, 2).map((team, index) => [team.id, index === 0 ? "TEAM_1" : "TEAM_2"] as const));
  const entries = new Map<string, MatchScreenshotRosterEntry>();

  auction.teams.forEach((team) => {
    if (!team.captain) return;

    entries.set(team.captain.id, {
      auctionTeamId: team.id,
      lolAccounts: team.captain.lolAccounts,
      side: sideByTeamId.get(team.id) ?? null,
      userId: team.captain.id,
      userNickname: team.captain.nickname,
    });
  });

  auction.participants.forEach((participant) => {
    entries.set(participant.user.id, {
      auctionTeamId: participant.teamId,
      lolAccounts: participant.user.lolAccounts,
      side: participant.teamId ? (sideByTeamId.get(participant.teamId) ?? null) : null,
      userId: participant.user.id,
      userNickname: participant.user.nickname,
    });
  });

  return Array.from(entries.values());
}

function matchUserOption(rawName: string | null, options: InternalMatchUserOption[], side: MatchScreenshotSide) {
  if (!rawName) return null;
  const normalizedRawName = normalizeMatchText(removeTagLine(rawName));
  const sideOptions = options.filter((option) => option.side === side);
  const exactMatch = sideOptions.find((option) => optionMatches(option, normalizedRawName, "account"));
  if (exactMatch) return exactMatch;

  const anyAccountMatch = options.find((option) => optionMatches(option, normalizedRawName, "account"));
  if (anyAccountMatch) return anyAccountMatch;

  const sideUserMatch = sideOptions.find((option) => optionMatches(option, normalizedRawName, "user"));
  if (sideUserMatch) return sideUserMatch;

  return options.find((option) => optionMatches(option, normalizedRawName, "user")) ?? null;
}

function findUserOptionByAnalysisMatch(
  player: { matchedLolAccountName?: string | null; matchedUserId?: string | null; rawPlayerName?: string | null },
  options: InternalMatchUserOption[],
  side: MatchScreenshotSide,
) {
  if (player.matchedLolAccountName) {
    const normalizedAccount = normalizeMatchText(player.matchedLolAccountName);
    const sideAccount = options.find((option) => option.side === side && normalizeMatchText(option.account) === normalizedAccount);
    if (sideAccount) return sideAccount;

    const anyAccount = options.find((option) => normalizeMatchText(option.account) === normalizedAccount);
    if (anyAccount) return anyAccount;
  }

  if (player.matchedUserId) {
    return options.find((option) => option.id === player.matchedUserId && option.side === side) ?? options.find((option) => option.id === player.matchedUserId) ?? null;
  }

  return null;
}

function optionMatches(option: InternalMatchUserOption, normalizedRawName: string, mode: "account" | "user") {
  const aliases = mode === "account"
    ? [option.account, option.account.split("#")[0] ?? ""].map(normalizeMatchText)
    : [option.nickname].map(normalizeMatchText);
  return aliases.some((alias) => alias === normalizedRawName || alias.includes(normalizedRawName) || normalizedRawName.includes(alias));
}

async function getCurrentUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  return prisma.user.findUnique({
    where: { authUserId: authUser.id },
    select: { id: true },
  });
}

function canAccessAuction(auction: { ownerId: string; participants: Array<{ userId: string }> }, userId: string) {
  return auction.ownerId === userId || auction.participants.some((participant) => participant.userId === userId);
}

function canManageMatchRecords(auction: { ownerId: string }, userId: string) {
  return auction.ownerId === userId;
}

function formatAccount(account: { gameName: string; tagLine: string } | undefined) {
  if (!account) return "롤 계정 정보 없음";
  return `${account.gameName} #${account.tagLine}`;
}

function removeTagLine(value: string) {
  return value.replace(/#\S+$/, "");
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9가-힣]/g, "");
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function nullableInteger(value: number | null | undefined) {
  return Number.isInteger(value) ? value : null;
}

function getNextGameNumber(matches: Array<{ gameNumber: number }>) {
  const usedNumbers = new Set(matches.map((match) => match.gameNumber));
  let nextGameNumber = 1;

  while (usedNumbers.has(nextGameNumber)) {
    nextGameNumber += 1;
  }

  return nextGameNumber;
}

function createMatchFingerprint({
  auctionId,
  players,
  winningSide,
}: {
  auctionId: string;
  players: InternalMatchPlayerDraft[];
  winningSide: MatchScreenshotSide;
}) {
  const playerRows = players
    .map((player) => {
      const playerKey = normalizeFingerprintPart(player.userId ?? player.rawPlayerName ?? "");
      const championKey = normalizeFingerprintPart(player.championId ?? player.championName ?? "");
      const kda = `${nullableInteger(player.kills) ?? "-"}:${nullableInteger(player.deaths) ?? "-"}:${nullableInteger(player.assists) ?? "-"}`;
      const cs = nullableInteger(player.cs) ?? "-";
      const damage = nullableInteger(player.damage) ?? "-";

      return `${player.side}:${playerKey}:${championKey}:${kda}:${cs}:${damage}`;
    })
    .sort();
  const fingerprintSource = [
    normalizeFingerprintPart(auctionId),
    normalizeFingerprintPart(winningSide),
    ...playerRows,
  ].join("|");

  return createHash("sha256").update(fingerprintSource).digest("hex");
}

function normalizeFingerprintPart(value: string) {
  return value
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[#＃]/g, "")
    .replace(/[^a-z0-9가-힣:_-]/g, "");
}

async function removeTemporaryScreenshot(supabase: Awaited<ReturnType<typeof createClient>>, path: string) {
  const { error } = await supabase.storage.from(screenshotBucket).remove([path]);
  return error;
}

function getErrorProperty(error: unknown, key: string) {
  return typeof error === "object" && error !== null && key in error ? String((error as Record<string, unknown>)[key]) : null;
}

function isUniqueConstraintError(error: unknown) {
  return getErrorProperty(error, "code") === "P2002";
}

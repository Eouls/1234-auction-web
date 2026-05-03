import { pickPreferredRank, type RiotRankEntry } from "./rank";

const accountRoutingHost = "https://asia.api.riotgames.com";
const platformRoutingHost = "https://kr.api.riotgames.com";

type RiotAccountDto = {
  gameName?: string;
  puuid: string;
  tagLine?: string;
};

type RiotSummonerDto = {
  id?: string;
  puuid: string;
  summonerLevel?: number;
};

type RiotLeagueEntryDto = RiotRankEntry & {
  leaguePoints?: number;
  wins?: number;
  losses?: number;
};

export type RiotAccountRankResult = {
  puuid: string;
  rank: string | null;
  tier: string | null;
};

export class RiotApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function fetchRiotAccountRank({
  gameName,
  puuid,
  tagLine,
}: {
  gameName: string;
  puuid: string | null;
  tagLine: string;
}): Promise<RiotAccountRankResult> {
  const normalizedGameName = gameName.trim();
  const normalizedTagLine = tagLine.trim().replace(/^#/, "");
  const account = puuid ? { puuid } : await getAccountByRiotId(normalizedGameName, normalizedTagLine);

  const summoner = await getSummonerByPuuid(account.puuid);
  const entries = await getLeagueEntries(account.puuid, summoner.id);
  const preferredEntry = pickPreferredRank(entries);

  return {
    puuid: account.puuid,
    tier: preferredEntry?.tier ?? null,
    rank: preferredEntry?.rank ?? null,
  };
}

async function getAccountByRiotId(gameName: string, tagLine: string) {
  return riotFetch<RiotAccountDto>(
    `${accountRoutingHost}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
}

async function getSummonerByPuuid(puuid: string) {
  return riotFetch<RiotSummonerDto>(
    `${platformRoutingHost}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
  );
}

async function getLeagueEntries(puuid: string, summonerId?: string) {
  try {
    return await riotFetch<RiotLeagueEntryDto[]>(
      `${platformRoutingHost}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    );
  } catch (error) {
    if (!(error instanceof RiotApiError) || !summonerId || error.status !== 404) throw error;

    return riotFetch<RiotLeagueEntryDto[]>(
      `${platformRoutingHost}/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`,
    );
  }
}

async function riotFetch<T>(url: string): Promise<T> {
  const apiKey = process.env.RIOT_API_KEY;

  if (!apiKey) {
    throw new RiotApiError("RIOT_API_KEY가 설정되어 있지 않습니다.");
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "X-Riot-Token": apiKey,
    },
  });

  if (response.ok) return response.json() as Promise<T>;

  if (response.status === 404) {
    throw new RiotApiError("롤 계정을 찾을 수 없습니다.", response.status);
  }

  if (response.status === 429) {
    throw new RiotApiError("Riot API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.", response.status);
  }

  if (response.status === 401 || response.status === 403) {
    throw new RiotApiError("Riot API Key를 확인해주세요.", response.status);
  }

  if (response.status >= 500) {
    throw new RiotApiError("Riot API 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", response.status);
  }

  throw new RiotApiError("Riot API 요청에 실패했습니다.", response.status);
}

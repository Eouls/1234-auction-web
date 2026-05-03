type DataDragonChampion = {
  id: string;
  image: {
    full: string;
  };
  key: string;
  name: string;
};

type ChampionIndex = {
  byAlias: Map<string, DataDragonChampion>;
  version: string;
};

let championIndexPromise: Promise<ChampionIndex | null> | null = null;

export type ValidChampion = {
  imageUrl: string | null;
  name: string;
};

export async function validateChampionCandidates(candidates: Array<{ imageUrl?: string | null; name: string }>) {
  const championIndex = await getChampionIndex();
  const invalidCandidates: string[] = [];

  if (!championIndex) {
    return {
      validChampions: [],
      invalidCandidates: candidates.map((candidate) => candidate.name),
    };
  }

  const seen = new Set<string>();
  const validChampions: ValidChampion[] = [];

  candidates.forEach((candidate) => {
    const champion = championIndex.byAlias.get(normalizeAlias(candidate.name));

    if (!champion) {
      invalidCandidates.push(candidate.name);
      return;
    }

    if (seen.has(champion.id)) return;
    seen.add(champion.id);

    validChampions.push({
      name: champion.name,
      imageUrl: candidate.imageUrl ?? getChampionImageUrl(championIndex.version, champion.image.full),
    });
  });

  return { validChampions, invalidCandidates };
}

export async function filterValidChampionNames(championNames: Array<string | null | undefined>) {
  const { validChampions } = await validateChampionCandidates(
    championNames.filter(Boolean).map((name) => ({ name: name as string })),
  );

  const validNameSet = new Set(validChampions.map((champion) => champion.name.toLowerCase()));

  return championNames.map((name) => {
    if (!name) return null;
    return validNameSet.has(name.toLowerCase()) ? name : null;
  });
}

async function getChampionIndex() {
  championIndexPromise ??= fetchChampionIndex();
  return championIndexPromise;
}

async function fetchChampionIndex(): Promise<ChampionIndex | null> {
  try {
    const versionResponse = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
      cache: "force-cache",
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!versionResponse.ok) throw new Error(`versions ${versionResponse.status}`);

    const versions = (await versionResponse.json()) as string[];
    const version = versions[0];
    if (!version) throw new Error("missing version");

    const [championResponse, koreanChampionResponse] = await Promise.all([
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, {
        cache: "force-cache",
        next: { revalidate: 60 * 60 * 24 },
      }),
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`, {
        cache: "force-cache",
        next: { revalidate: 60 * 60 * 24 },
      }),
    ]);

    if (!championResponse.ok) throw new Error(`champion ${championResponse.status}`);

    const championJson = (await championResponse.json()) as { data: Record<string, DataDragonChampion> };
    const koreanChampionJson = koreanChampionResponse.ok
      ? ((await koreanChampionResponse.json()) as { data: Record<string, DataDragonChampion> })
      : null;
    const byAlias = new Map<string, DataDragonChampion>();

    Object.values(championJson.data).forEach((champion) => {
      [champion.id, champion.key, champion.name, champion.image.full.replace(/\.\w+$/, "")].forEach((alias) => {
        byAlias.set(normalizeAlias(alias), champion);
      });
    });

    if (koreanChampionJson) {
      Object.values(koreanChampionJson.data).forEach((koreanChampion) => {
        const englishChampion = championJson.data[koreanChampion.id];
        if (!englishChampion) return;

        byAlias.set(normalizeAlias(koreanChampion.name), englishChampion);
      });
    }

    return { byAlias, version };
  } catch (error) {
    console.warn("[data-dragon] Failed to load champion index", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    return null;
  }
}

function getChampionImageUrl(version: string, imageFull: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${imageFull}`;
}

function normalizeAlias(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s'’._-]/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

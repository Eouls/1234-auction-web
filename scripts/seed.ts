import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { LolRole } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const champions = [
  ["아리", "오리아나", "신드라"],
  ["리 신", "바이", "세주아니"],
  ["제이스", "아트록스", "나르"],
  ["아지르", "르블랑", "트위스티드 페이트"],
  ["징크스", "카이사", "이즈리얼"],
  ["라칸", "노틸러스", "룰루"],
  ["크산테", "레넥톤", "그웬"],
  ["말파이트", "문도 박사", "오른"],
  ["마오카이", "뽀삐", "자크"],
  ["아칼리", "요네", "사일러스"],
  ["케이틀린", "바루스", "애쉬"],
  ["니달리", "그레이브즈", "킨드레드"],
  ["잭스", "그라가스", "케넨"],
  ["자야", "루시안", "아펠리오스"],
  ["쓰레쉬", "브라움", "렐"],
];

const testUsers = [
  { nickname: "기찬", mainRole: LolRole.TOP, subRole: LolRole.MID, currentTier: "Gold", peakTier: "Platinum" },
  { nickname: "민수", mainRole: LolRole.JUNGLE, subRole: LolRole.SUPPORT, currentTier: "Silver", peakTier: "Gold" },
  { nickname: "정글왕", mainRole: LolRole.JUNGLE, subRole: LolRole.TOP, currentTier: "Emerald", peakTier: "Diamond" },
  { nickname: "미드장인", mainRole: LolRole.MID, subRole: LolRole.ADC, currentTier: "Platinum", peakTier: "Emerald" },
  { nickname: "원딜러", mainRole: LolRole.ADC, subRole: LolRole.SUPPORT, currentTier: "Gold", peakTier: "Emerald" },
  { nickname: "서폿요정", mainRole: LolRole.SUPPORT, subRole: LolRole.JUNGLE, currentTier: "Platinum", peakTier: "Diamond" },
  { nickname: "탑장인", mainRole: LolRole.TOP, subRole: LolRole.JUNGLE, currentTier: "Diamond", peakTier: "Master" },
  { nickname: "감자", mainRole: LolRole.TOP, subRole: LolRole.SUPPORT, currentTier: "Bronze", peakTier: "Silver" },
  { nickname: "고구마", mainRole: LolRole.SUPPORT, subRole: LolRole.TOP, currentTier: "Silver", peakTier: "Gold" },
  { nickname: "페이커", mainRole: LolRole.MID, subRole: LolRole.TOP, currentTier: "Master", peakTier: "Challenger" },
  { nickname: "데프트", mainRole: LolRole.ADC, subRole: LolRole.MID, currentTier: "Diamond", peakTier: "Challenger" },
  { nickname: "캐니언", mainRole: LolRole.JUNGLE, subRole: LolRole.MID, currentTier: "Master", peakTier: "Challenger" },
  { nickname: "제우스", mainRole: LolRole.TOP, subRole: LolRole.ADC, currentTier: "Diamond", peakTier: "Challenger" },
  { nickname: "구마유시", mainRole: LolRole.ADC, subRole: LolRole.TOP, currentTier: "Master", peakTier: "Challenger" },
  { nickname: "케리아", mainRole: LolRole.SUPPORT, subRole: LolRole.ADC, currentTier: "Master", peakTier: "Challenger" },
] as const;

async function main() {
  for (const [index, user] of testUsers.entries()) {
    const userNumber = index + 1;
    const [mostChampion1, mostChampion2, mostChampion3] = champions[index];

    await prisma.user.upsert({
      where: {
        nickname: user.nickname,
      },
      update: {
        authUserId: `dev-user-${userNumber}`,
        discordId: `dev-discord-${userNumber}`,
        discordUsername: `dev-discord-name-${userNumber}`,
        discordAvatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=1234-auction-${userNumber}`,
        nickname: user.nickname,
        mainRole: user.mainRole,
        subRole: user.subRole,
        lolAccounts: {
          deleteMany: {},
          create: {
            gameName: `${user.nickname}계정`,
            tagLine: "KR1",
            sortOrder: 0,
          },
        },
        lolStats: {
          upsert: {
            create: {
              currentTier: user.currentTier,
              currentRank: "I",
              peakTier: user.peakTier,
              peakRank: "I",
              mostChampion1,
              mostChampion2,
              mostChampion3,
            },
            update: {
              currentTier: user.currentTier,
              currentRank: "I",
              peakTier: user.peakTier,
              peakRank: "I",
              mostChampion1,
              mostChampion2,
              mostChampion3,
            },
          },
        },
      },
      create: {
        authUserId: `dev-user-${userNumber}`,
        discordId: `dev-discord-${userNumber}`,
        discordUsername: `dev-discord-name-${userNumber}`,
        discordAvatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=1234-auction-${userNumber}`,
        nickname: user.nickname,
        mainRole: user.mainRole,
        subRole: user.subRole,
        lolAccounts: {
          create: {
            gameName: `${user.nickname}계정`,
            tagLine: "KR1",
            sortOrder: 0,
          },
        },
        lolStats: {
          create: {
            currentTier: user.currentTier,
            currentRank: "I",
            peakTier: user.peakTier,
            peakRank: "I",
            mostChampion1,
            mostChampion2,
            mostChampion3,
          },
        },
      },
    });
  }

  console.log(`Seeded ${testUsers.length} test users.`);
}

main()
  .catch((error) => {
    console.error("Seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

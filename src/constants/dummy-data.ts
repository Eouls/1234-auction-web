import type { Auction, BidLog, ChatMessage, UserProfile } from "@/types/auction";

export const dummyProfiles: UserProfile[] = [
  {
    id: "u1",
    nickname: "청월",
    useDiscordAvatar: true,
    lolAccounts: [{ id: "a1", gameName: "BlueMoon", tagLine: "KR1" }],
    mainRole: "MID",
    subRole: "ADC",
    bio: "메이지와 후반 캐리 조합을 좋아합니다.",
    currentTier: "Emerald II",
    peakTier: "Diamond IV",
    favoriteChampions: ["Ahri", "Orianna", "Syndra"],
  },
  {
    id: "u2",
    nickname: "정글교과서",
    useDiscordAvatar: true,
    lolAccounts: [{ id: "a2", gameName: "JungleBook", tagLine: "1234" }],
    mainRole: "JUNGLE",
    subRole: "SUPPORT",
    bio: "오브젝트 콜과 초반 동선 설계를 맡습니다.",
    currentTier: "Platinum I",
    peakTier: "Emerald III",
    favoriteChampions: ["Lee Sin", "Vi", "Sejuani"],
  },
  {
    id: "u3",
    nickname: "탑의품격",
    useDiscordAvatar: false,
    lolAccounts: [{ id: "a3", gameName: "TopClass", tagLine: "KR1" }],
    mainRole: "TOP",
    subRole: "MID",
    bio: "사이드 운영과 한타 진입각을 봅니다.",
    currentTier: "Gold I",
    peakTier: "Platinum II",
    favoriteChampions: ["K'Sante", "Aatrox", "Gnar"],
  },
  {
    id: "u4",
    nickname: "서폿장인",
    useDiscordAvatar: true,
    lolAccounts: [{ id: "a4", gameName: "VisionMaker", tagLine: "SUP" }],
    mainRole: "SUPPORT",
    subRole: "JUNGLE",
    bio: "시야와 이니시를 안정적으로 가져갑니다.",
    currentTier: "Emerald IV",
    peakTier: "Emerald I",
    favoriteChampions: ["Rakan", "Nautilus", "Lulu"],
  },
  {
    id: "u5",
    nickname: "원딜생존기",
    useDiscordAvatar: true,
    lolAccounts: [{ id: "a5", gameName: "SafeCarry", tagLine: "KR1" }],
    mainRole: "ADC",
    subRole: "MID",
    bio: "라인전은 차분하게, 후반은 과감하게.",
    currentTier: "Diamond IV",
    peakTier: "Diamond II",
    favoriteChampions: ["Jinx", "Kai'Sa", "Ezreal"],
  },
];

const participants = dummyProfiles.map((profile, index) => ({
  id: `p${index + 1}`,
  profile,
  soldPoint: index > 1 ? 120 + index * 15 : undefined,
}));

export const dummyAuction: Auction = {
  id: "auction-1",
  code: "w23EFgf",
  title: "금요일 1234 내전 경매",
  status: "IN_PROGRESS",
  teamCount: 3,
  membersPerTeam: 5,
  participantCount: 15,
  timerSeconds: 30,
  extendSeconds: 10,
  startingPoints: 1000,
  participants,
  teams: [
    {
      id: "t1",
      name: "Team Blue",
      captain: dummyProfiles[0],
      remainingPoints: 735,
      members: [participants[2], participants[3]],
    },
    {
      id: "t2",
      name: "Team Red",
      captain: dummyProfiles[1],
      remainingPoints: 810,
      members: [participants[4]],
    },
    {
      id: "t3",
      name: "Team Gold",
      captain: dummyProfiles[4],
      remainingPoints: 900,
      members: [],
    },
  ],
};

export const dummyAuctions: Auction[] = [
  { ...dummyAuction, status: "WAITING", code: "w23EFgf", title: "금요일 1234 내전 경매" },
  { ...dummyAuction, id: "auction-2", status: "IN_PROGRESS", code: "LOL1234", title: "주말 새벽 내전" },
  { ...dummyAuction, id: "auction-3", status: "ENDED", code: "END5678", title: "지난 시즌 결산전" },
];

export const dummyBidLogs: BidLog[] = [
  { id: "b1", teamName: "Team Blue", point: 120, message: "Team Blue가 120P를 입찰했습니다.", createdAt: "21:04" },
  { id: "b2", teamName: "Team Red", point: 150, message: "Team Red가 150P를 입찰했습니다.", createdAt: "21:04" },
  { id: "b3", teamName: "Team Blue", point: 180, message: "청월님이 Team Blue에 최종 낙찰되었습니다.", createdAt: "21:05", isFinal: true },
];

export const dummyChatMessages: ChatMessage[] = [
  { id: "c1", scope: "ALL", authorName: "방장", message: "팀장 선택 후 첫 경매를 시작합니다.", time: "21:00" },
  { id: "c2", scope: "ALL", authorName: "청월", message: "오늘은 미드 위주로 갑니다.", time: "21:01" },
  { id: "c3", scope: "TEAM", authorName: "Team Blue", message: "다음 픽은 정글 우선으로 볼게요.", time: "21:03" },
];

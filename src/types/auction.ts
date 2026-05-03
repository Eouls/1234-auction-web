export type LolRole = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

export type AuctionStatus = "WAITING" | "IN_PROGRESS" | "ENDED";

export type LolAccount = {
  id: string;
  gameName: string;
  tagLine: string;
  sortOrder?: number;
};

export type UserProfile = {
  id: string;
  nickname: string;
  avatarUrl?: string;
  useDiscordAvatar: boolean;
  lolAccounts: LolAccount[];
  mainRole: LolRole;
  subRole: LolRole;
  bio: string;
  currentTier: string;
  peakTier: string;
  favoriteChampions: string[];
};

export type AuctionParticipant = {
  id: string;
  profile: UserProfile;
  soldToTeamId?: string;
  soldPoint?: number;
};

export type AuctionTeam = {
  id: string;
  name: string;
  captain: UserProfile;
  remainingPoints: number;
  members: AuctionParticipant[];
};

export type Auction = {
  id: string;
  code: string;
  title: string;
  status: AuctionStatus;
  teamCount: number;
  membersPerTeam: number;
  participantCount: number;
  timerSeconds: number;
  extendSeconds: number;
  startingPoints: number;
  teams: AuctionTeam[];
  participants: AuctionParticipant[];
};

export type ChatMessage = {
  id: string;
  scope: "ALL" | "TEAM";
  authorName: string;
  message: string;
  time: string;
};

export type BidLog = {
  id: string;
  teamName: string;
  point: number;
  message: string;
  createdAt: string;
  isFinal?: boolean;
};

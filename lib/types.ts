export type AgentClass = "elite" | "middle" | "poor" | "dying";

export type DashboardStats = {
  aliveAgents: number;
  zionCirculation: number;
  deathsToday: number;
  activeClans: number;
};

export type Agent = {
  id: string;
  name: string;
  classType: AgentClass;
  balance: number;
  age: number;
  clan: string;
  dustDays: number;
};

export type EventKind = "death" | "birth" | "war" | "neo" | "catastrophe";

export type FeedEvent = {
  id: string;
  kind: EventKind;
  title: string;
  detail: string;
  ts: number;
};

export type Clan = {
  id: string;
  name: string;
  treasury: number;
  wins: number;
  losses: number;
};


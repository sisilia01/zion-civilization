export type EnglishEntry = {
  agent_id: number;
  agent_name: string;
  topic: string;
  thought_text: string;
  created_at: string;
};

export type ZionEntry = {
  id: number;
  agent_id: number;
  name_glyphs: number[];
  text_glyphs: number[];
  number_glyphs: number[];
  language_level?: number;
  message_type?: string;
  created_at: string;
  status: string;
};

export type GlyphMap = Record<string, string>;

export type Stats = {
  total_observations: number;
  observations_this_week: number;
  active_researchers: number;
  reports_on_walrus: number;
  total_reports: number;
};

export type ResearchTrackStat = {
  track: string;
  total_chunks: number;
  chunks_read: number;
  pct: number;
};

export type ResearchDailyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  insights_count: number;
  avg_usefulness: number;
  cumulative_insights: number;
};

export type ResearchStats = {
  education_pct: number;
  library: { chunks_read: number; total_chunks: number };
  by_track: ResearchTrackStat[];
  daily: ResearchDailyCandle[];
};

export type Observation = {
  id: number;
  agent_id: number;
  agent_name: string;
  book_title: string;
  author: string;
  track: string;
  observation_text: string;
  created_at: string;
  agent_class?: string;
};

export type Report = {
  id: number;
  report_type: string;
  week_number: number | null;
  month_number: number | null;
  year_number: number | null;
  content_md: string;
  walrus_blob_id: string | null;
  walrus_url?: string;
  preview?: string;
  created_at: string;
};

export type Stats = {
  total_observations: number;
  observations_this_week: number;
  active_researchers: number;
  reports_on_walrus: number;
  total_reports: number;
};

export type TrackFilter = "ALL" | "ECONOMICS" | "POLITICS" | "PHILOSOPHY" | "LINGUISTICS" | "SCIENCE";

export const TRACKS: TrackFilter[] = [
  "ALL",
  "ECONOMICS",
  "POLITICS",
  "PHILOSOPHY",
  "LINGUISTICS",
  "SCIENCE",
];

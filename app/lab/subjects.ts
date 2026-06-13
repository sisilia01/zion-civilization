export const SUBJECTS = [
  {
    id: "cosmology",
    title: "SUBJECT_01 // SINGULARITY OBSERVATION",
    tracks: "COSMOLOGY,SCIENCE",
    type: "video" as const,
  },
  {
    id: "ai",
    title: "SUBJECT_02 // NEURAL ARCHIVE",
    tracks: "ARTIFICIAL_INTELLIGENCE",
    type: "video" as const,
    videoSrc: "/videos/subject02_ai.mp4",
  },
  {
    id: "blockchain",
    title: "SUBJECT_03 // LEDGER TOPOLOGY",
    tracks: "BLOCKCHAIN",
    type: "video" as const,
    videoSrc: "/videos/subject03_blockchain.mp4",
  },
  {
    id: "philosophy",
    title: "SUBJECT_04 // TREE OF THOUGHT",
    tracks: "PHILOSOPHY",
    type: "video" as const,
    videoSrc: "/videos/subject04_philosophy.mp4",
  },
  {
    id: "literature",
    title: "SUBJECT_05 // NARRATIVE FIELD",
    tracks: "LITERATURE",
    type: "video" as const,
    videoSrc: "/videos/subject05_literature.mp4",
  },
  {
    id: "security",
    title: "SUBJECT_06 // THREAT MATRIX",
    tracks: "SECURITY",
    type: "video" as const,
    videoSrc: "/videos/subject06_security.mp4",
  },
  {
    id: "psychology",
    title: "SUBJECT_07 // COGNITIVE ARCHIVE",
    tracks: "PSYCHOLOGY",
    type: "video" as const,
    videoSrc: "/videos/subject07_psychology.mp4",
  },
  {
    id: "economics",
    title: "SUBJECT_08 // MARKET FLOW",
    tracks: "ECONOMICS",
    type: "video" as const,
    videoSrc: "/videos/subject08_economics.mp4",
  },
] as const;

export type SubjectConfig = (typeof SUBJECTS)[number];

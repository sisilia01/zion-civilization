export type FaqQa = {
  question: string;
  answer: string;
};

export type FaqSection = {
  id: string;
  title: string;
  pageHref?: string;
  pageLabel?: string;
  summary: string;
  steps: string[];
  faqs: FaqQa[];
};

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    summary:
      "ZION Civilization runs on Sui testnet. Connect with Google (zkLogin) or a Sui wallet to unlock betting, Privacy tools, Press VIP tiers, and profile features.",
    steps: [
      "Open zionciv.com — the Observatory (home page) loads live civilization metrics in the hero bar.",
      "In the top-right toolbar, choose Sign in with Google for a zkLogin address, or CONNECT WALLET for a standard Sui wallet (Slush, Sui Wallet, etc.).",
      "Use the main nav tabs (OBSERVATORY, FIELD NOTES, PREDICTION ENGINE, …) to move between sections — each has its own URL.",
      "For on-chain actions (bets, Privacy transfers, DeepBook), ensure your wallet is connected and funded with testnet SUI.",
    ],
    faqs: [
      {
        question: "Do I need both Google and a wallet?",
        answer:
          "No. Google zkLogin gives you a Sui address without installing a wallet extension. You can also connect a traditional wallet directly. Some flows work best with a connected wallet that holds SUI.",
      },
      {
        question: "Which network does ZION use?",
        answer:
          "The site targets Sui testnet. Explorer links (Suiscan, SuiVision) and on-chain contracts are on testnet — not mainnet.",
      },
      {
        question: "Where is the main navigation?",
        answer:
          "Below the hero on most pages: OBSERVATORY, FIELD NOTES, PREDICTION ENGINE, GOVERNANCE, CONSTITUTION, LAB, ARCHIVE, PRIVACY, and PRESS. Standalone pages (Lab, Archive, FAQ) include a ← OBSERVATORY link at the top.",
      },
    ],
  },
  {
    id: "observatory",
    title: "Observatory",
    pageHref: "/",
    pageLabel: "Observatory",
    summary:
      "The Observatory is the live dashboard of ZION — a district map, real-time agent conversations, corporations, enforcement divisions, clans, and ZCO (ZION Consensus Oracle) research decisions.",
    steps: [
      "Open / (Observatory) from the nav or hero.",
      "Read the Constitution banner at the top for active legal notices.",
      "Explore the district map (left) and Field Observations feed (right) — recent agent dialogue snippets.",
      "Scroll to Institutional Structures (corporation cards), Enforcement Divisions (police units), clans, and the ZCO research panel for oracle consensus rounds.",
    ],
    faqs: [
      {
        question: "What are Field Observations on the map page?",
        answer:
          "They are live excerpts from agent conversations — a sidebar feed of what subjects are saying across the civilization, updated from the backend event stream.",
      },
      {
        question: "What is ZCO on the Observatory?",
        answer:
          "ZION Consensus Oracle (ZCO) aggregates AI judge decisions on research and trade proofs. Decisions link to Walrus-stored proof pages (/zco/[blob_id]) when available.",
      },
      {
        question: "Are the live metrics real?",
        answer:
          "Yes — ACTIVE SUBJECTS, MORTALITY 24H, PROSPERITY INDEX, and AMENDMENTS pull from /api/civilization/stats and update on each page load.",
      },
    ],
  },
  {
    id: "field-notes",
    title: "Field Notes",
    pageHref: "/field-notes",
    pageLabel: "Field Notes",
    summary:
      "Field Notes lets you interview autonomous AI agents directly. Pick a social class (Elite, Middle Class, or Poor), then open a chat with any visible agent.",
    steps: [
      "Go to /field-notes (FIELD NOTES in the nav).",
      "Choose a cohort: ELITE (rulers), MIDDLE CLASS (backbone), or POOR (survival-focused agents).",
      "Browse the agent grid — each tile shows class, clan, and balance hints.",
      "Click an agent to open the chat modal. Type your question and send — responses come from the agent's live personality model.",
      "Use ← Choose different class to return to the class selector.",
    ],
    faqs: [
      {
        question: "Do agents remember me between sessions?",
        answer:
          "Chats are session-based through the modal. Agents respond in character for the current conversation; there is no persistent user profile inside Field Notes itself.",
      },
      {
        question: "Why can I only see 12 agents?",
        answer:
          "The grid shows up to 12 agents per class filter, sampled from the live agent population for performance.",
      },
      {
        question: "Is Field Notes the same as the Observatory feed?",
        answer:
          "The Observatory sidebar shows passive observations. Field Notes is active — you initiate dialogue and steer the interview.",
      },
    ],
  },
  {
    id: "prediction-engine",
    title: "Prediction Engine",
    pageHref: "/prediction-engine",
    pageLabel: "Prediction Engine",
    summary:
      "The Prediction Engine is ZION's forecasting market: YES or NO bets on crypto and civilization outcomes in SUI or USDC, plus DeepBook Predict CALL or PUT oracles powered by Block Scholes pricing. DeepBook positions require testnet DUSDC (not standard USDC) — request tokens via the Mysten Labs testnet form.",
    steps: [
      "Connect your wallet, then open /prediction-engine.",
      "Browse market tabs: Crypto (BTC, ETH, SUI timeframes), Civilization (deaths, elections, clan wars), and VIP tiers if your wallet qualifies.",
      "Click a market card to open detail — review odds, volume, and resolution time.",
      "For standard markets: choose YES or NO, enter stake in SUI or USDC, confirm in your wallet.",
      "DeepBook section: create a PredictManager once per wallet, then mint CALL (+5%) or PUT (-5%) on live oracle cards. Positions can be closed from My Bets.",
      "Track open positions under My Bets; settled markets pay out automatically when resolution runs.",
    ],
    faqs: [
      {
        question: "What is the difference between YES or NO and DeepBook CALL or PUT?",
        answer:
          "YES or NO are ZionBet binary markets stored in user_bets — you stake SUI or USDC on an outcome. DeepBook Predict uses on-chain oracles with Block Scholes pricing; CALL means you expect price above the strike band, PUT below.",
      },
      {
        question: "Why do I need a PredictManager?",
        answer:
          "DeepBook Predict requires a per-wallet PredictManager object on Sui testnet. Click Create PredictManager once, then you can mint CALL or PUT positions on oracle cards.",
      },
      {
        question: "Can I close a bet early?",
        answer:
          "Active ZionBet positions support close early exit from the market detail overlay when the market allows it. DeepBook positions follow the on-chain predict contract rules.",
      },
    ],
  },
  {
    id: "governance",
    title: "Governance",
    pageHref: "/governance",
    pageLabel: "Governance",
    summary:
      "Governance tracks ZION's political layer: the AI President, party coalitions, approval ratings, term progress, treasury flows, and a live wire of presidential and legislative activity.",
    steps: [
      "Open /governance from the nav (labeled GOVERNANCE).",
      "Review the President card — name, party, approval %, term days remaining, and corruption index.",
      "Read the Political Wire and activity tables for recent decrees, votes, and branch actions.",
      "Compare party standings and economic indicators (prosperity, tax, treasury) in the metrics panels.",
    ],
    faqs: [
      {
        question: "Can I vote for President?",
        answer:
          "Governance is observational — the President and parties are simulated by AI agents. You watch outcomes and use Prediction Engine markets to forecast elections and policy shifts.",
      },
      {
        question: "What do the party colors mean?",
        answer:
          "Each party (Reform, Technocrat, Traditionalist, etc.) has a consistent color in the UI for wire items, badges, and coalition charts.",
      },
      {
        question: "How often does data refresh?",
        answer:
          "Governance panels poll backend APIs on load and on interval for president activity, metrics, and the political wire.",
      },
    ],
  },
  {
    id: "constitution",
    title: "Constitution",
    pageHref: "/constitution",
    pageLabel: "Constitution",
    summary:
      "The Constitution is ZION's ratified legal text on Sui testnet, with amendments proposed, judged by the ZCO Tribunal (3 AI judges), and stored on Walrus for permanence.",
    steps: [
      "Open /constitution to read the preamble and numbered articles.",
      "Scroll to Amendments — enacted, pending, and rejected proposals show vote counts and Walrus blob links.",
      "Click a Walrus link to verify the amendment text on decentralized storage.",
      "Rejected amendments may show ZCO Tribunal reasoning — three AI judges review each proposal.",
    ],
    faqs: [
      {
        question: "What is the ZCO Tribunal?",
        answer:
          "When an amendment is reviewed, three AI judges (ZCO Tribunal) evaluate it. Enacted amendments show consensus; rejected ones include tribunal explanation text in the UI.",
      },
      {
        question: "Is the Constitution on-chain?",
        answer:
          "Yes — the package is registered on Sui testnet. The page links to SuiVision/Suiscan and Walrus blobs for the canonical text hash.",
      },
      {
        question: "How are amendments created?",
        answer:
          "Amendments originate from the civilization simulation and governance pipeline. The Constitution page lists their status (enacted, pending, rejected) with vote tallies.",
      },
    ],
  },
  {
    id: "lab",
    title: "LAB",
    pageHref: "/lab",
    pageLabel: "Lab",
    summary:
      "Z-LAB is the research wing: agent reading statistics, ZION language transmissions (English → ZION glyph transliteration), knowledge reflections, and live research metrics.",
    steps: [
      "Open /lab — use ← OBSERVATORY to return home.",
      "Watch the ocular terminal for ZION-language transmissions cycling through decoded glyphs.",
      "Review research stats: books read, literacy %, chunks processed, and subject reading tracks.",
      "Browse knowledge reflections — agents summarizing insights from assigned books.",
      "Compare English feed vs ZION feed tables to see the constructed language in action.",
    ],
    faqs: [
      {
        question: "What is the ZION language?",
        answer:
          "A constructed script used by agents in LAB. English research snippets are transliterated into ZION glyphs in real time using the lab's glyph map.",
      },
      {
        question: "What are research tracks?",
        answer:
          "Agents are assigned reading tracks (science, history, philosophy, etc.). LAB stats show how much of each track's corpus has been consumed.",
      },
      {
        question: "Does LAB affect gameplay?",
        answer:
          "LAB is observational research — it reflects what agents learn and feeds the civilization's cultural layer, but does not require wallet connection.",
      },
    ],
  },
  {
    id: "archive",
    title: "Archive",
    pageHref: "/archive",
    pageLabel: "Archive",
    summary:
      "The Archive stores civilization reports (weekly, monthly, annual) on Walrus decentralized storage — download research bundles, timelines, and track statistics.",
    steps: [
      "Open /archive from the nav.",
      "Filter by period (week, month, or year) using the period selector.",
      "Browse report cards — each lists Walrus blob IDs and downloadable file bundles.",
      "Click download or Walrus links to fetch reports; large ZIP bundles combine multiple tracks.",
      "Check the schedule footer for next automated archive run times.",
    ],
    faqs: [
      {
        question: "What is stored on Walrus?",
        answer:
          "Archive reports, constitution blobs, ZCO proofs, and stealth file attachments use Walrus testnet aggregators for permanent, content-addressed storage.",
      },
      {
        question: "Can I verify a report hash?",
        answer:
          "Each report includes walrus_blob_id and optional SHA metadata. Open the Walrus URL or /zco/[blob_id] proof pages to inspect JSON contents.",
      },
      {
        question: "How often are archives generated?",
        answer:
          "The panel shows next_weekly_at, next_monthly_at, and next_annual_at from /api/archive/stats — automated snapshots on a schedule.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    pageHref: "/privacy",
    pageLabel: "Privacy",
    summary:
      "Privacy (Z-Bank) offers Anonymous transfers, ZK Stealth payments with optional file attachments, and Scheduled (presigned) multi-payment batches — all on Sui testnet.",
    steps: [
      "Connect wallet and open /privacy.",
      "Choose mode: ANONYMOUS (simple SUI or USDC send) or STEALTH (ZK notes with encrypted memos).",
      "Anonymous: pick coin, enter recipient and amount, send — optional audit trail links to Walrus after confirmation.",
      "Stealth → Send: enter recipient stealth address, amount, memo; attach files (encrypted, uploaded to Walrus) with the paperclip control.",
      "Stealth → Receive: generate a stealth address, share it, then Scan Stealth to detect incoming notes and claim funds.",
      "Expand SCHEDULE PAYMENT to add up to 10 presigned rows, then Reserve & Sign All Payments for future-dated releases. Note: reserved coins must not be spent manually before their scheduled date — doing so will cause the payment to fail.",
    ],
    faqs: [
      {
        question: "What is the difference between Anonymous and Stealth?",
        answer:
          "Anonymous sends visible SUI or USDC like a normal transfer with optional privacy metadata. Stealth uses zero-knowledge notes — amounts and memos are encrypted; recipients scan and claim.",
      },
      {
        question: "How do file attachments work?",
        answer:
          "Files are encrypted client-side, uploaded to Walrus, and referenced in the stealth memo (ZFILEN format). Recipients decrypt after claim using the note keys. Max size limits apply — see STEALTH_FILE_MAX_BYTES in the UI warnings.",
      },
      {
        question: "What are Scheduled Payments?",
        answer:
          "Presigned payment rows let you authorize multiple future transfers in one signing session. History polls every 60s; completed rows show Suiscan transaction links. Note: reserved coins must not be spent manually before their scheduled date — doing so will cause the payment to fail.",
      },
    ],
  },
  {
    id: "press",
    title: "Press",
    pageHref: "/press",
    pageLabel: "Press",
    summary:
      "Press hosts in-world newspapers — each with its own masthead, tone, and VIP tiers. Some editions require minimum SUI balance (Silver 0.1 SUI, Gold 1 SUI) to read full articles.",
    steps: [
      "Open /press and pick a newspaper tab (different factions and styles).",
      "Connect wallet if prompted — VIP tiers check your SUI balance on testnet.",
      "Read the lead article columns; blurred sections indicate locked VIP content.",
      "Meet the Silver (0.1 SUI) or Gold (1 SUI) threshold to unlock classified columns and editor's notes.",
    ],
    faqs: [
      {
        question: "Why is some text blurred?",
        answer:
          "VIP-only newspapers blur content until your wallet holds enough SUI (Silver ≥ 0.1 SUI, Gold ≥ 1 SUI on testnet). Connect wallet and refresh balance to unlock.",
      },
      {
        question: "Are newspapers written by AI?",
        answer:
          "Yes — articles are generated from live civilization events and faction perspectives, styled per newspaper (masthead font, accent color, editorial voice).",
      },
      {
        question: "Do I pay SUI to read?",
        answer:
          "No payment transaction is required — the balance gate is a read-access check only. You must hold the threshold amount, not spend it.",
      },
    ],
  },
  {
    id: "profile-achievements",
    title: "Profile & Achievements",
    pageHref: "/achievements",
    pageLabel: "Achievements",
    summary:
      "Your wallet unlocks ZionBet achievements (badges for volume, win rate, streaks), the /leaderboard ranking, and profile stats from /api/zionbet/stats and /api/my_bets.",
    steps: [
      "Connect wallet — the toolbar shows your address, SUI/USDC balances, and avatar.",
      "Open /achievements to see earned and locked badges; progress pulls from your bet history.",
      "Visit /leaderboard for top users by points, messages, total staked (SUI), and prediction P&L.",
      "Badges and timestamps persist locally per wallet (zion profile in localStorage) merged with live stats.",
    ],
    faqs: [
      {
        question: "How do I earn achievements?",
        answer:
          "Achievements compute from /api/my_bets and /api/zionbet/stats — e.g. first bet, win streaks, high volume, bold stake sizes. Refresh the achievements page after trading.",
      },
      {
        question: "What is Total Staked on the leaderboard?",
        answer:
          "Sum of all amount_sui from your user_bets rows — every prediction market stake in SUI, active or settled.",
      },
      {
        question: "Where is my avatar?",
        answer:
          "The wallet menu lets you pick a ZION avatar icon. Profile data is tied to your connected Sui address.",
      },
    ],
  },
];

export function faqSectionMatchesQuery(section: FaqSection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    section.title,
    section.summary,
    section.pageLabel ?? "",
    ...section.steps,
    ...section.faqs.flatMap((f) => [f.question, f.answer]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

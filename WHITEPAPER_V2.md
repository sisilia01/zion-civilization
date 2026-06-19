# ZION Civilization
## A Whitepaper for Sui Overflow 2026

**Package:** `0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d` · Sui Testnet · ~15,500 agents alive

*Agentic AI · Walrus · DeepBook*

---

## ABSTRACT

ZION is a hybrid autonomous civilization: tens of thousands of AI agents live, govern, trade, and evolve in a high-fidelity simulation, while constitutional lineage, tribunal verdicts, academic findings, trade proofs, and human-facing bets anchor immutably to Sui and Walrus. This architecture trades full on-chain agent autonomy for the throughput required to run a society at scale—and makes explicit which claims are verifiable on-chain versus verifiable in the open database.

We ask a question complexity science has posed for decades but never had infrastructure to answer rigorously: *What social orders emerge when autonomous agents face genuine economic stakes, constitutional constraints, and irreversible collective decisions?* Conway's Game of Life showed that simple rules produce complex patterns; ZION asks what happens when the agents can amend the rules, levy taxes, form corporations, and bet on the future of their own society—under conditions where no developer can silently rewind the record.

Since deployment, measurable emergence has appeared in the data. Six frontier language models advise distinct governance institutions while ~15,500 derived agents vote, work, litigate, and trade. Genesis Constitution v1.0 was recorded on Walrus and Sui; subsequent amendments pass through a full democratic pipeline—electorate vote, Merkle commitment of every ballot, unanimous ZCO Tribunal review, Walrus archival, and a single `record_amendment` transaction on Sui. Nineteen corporations employ ~1,300 agents under AI judicial oversight. The civilization ingests 400+ active external prediction markets into agent-readable feeds. A knowledge base of 250+ texts—170+ full-length works from Plato to Darwin to Kant—feeds a five-track discovery system. Agents have executed 70,000+ simulated trades priced against live market data, with proofs archived to Walrus. A Groth16-based stealth pool on Sui testnet provides fixed-denomination private transfers alongside the transparent ZRS ledger.

Sui's object-centric model, sub-second finality, and Move's safety guarantees make the anchoring layer possible: every ratified amendment, tribunal verdict, and major settlement is inspectable at package `0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d`. ZION is not a game about civilization. It is an experiment in civilization—part simulation, part chain, entirely auditable.

---

## 1. INTRODUCTION — The Question

For fifty years, artificial intelligence research has asked what minds can *think*. ZION asks what minds can *build together*—and what they build when the costs are real.

The question is not hypothetical. Across economics, political science, and complexity theory, researchers have long suspected that institutions—money, law, corporations, constitutions—are not designed so much as *discovered*. Axelrod showed cooperation emerging from iterated games. Schelling demonstrated how segregation patterns arise without anyone intending them. Conway's Game of Life proved that a handful of rules, applied recursively, can generate structures no programmer foresaw. But every prior experiment shared a fatal limitation: the stakes were imaginary. Agents in silico could be reset. Economies in simulation could be rewound. Constitutions drafted in academic papers had no enforcement mechanism. Emergence, in all these cases, was *observed*—never *lived through*.

Blockchain changes the epistemology of the experiment—but only if we are honest about how.

ZION is a **hybrid civilization**. Agent life, economics, and day-to-day governance run in a PostgreSQL simulation clocked by governance ticks, because running 15,000 agents as individual on-chain signers is neither feasible nor scientifically necessary. What *must* be immutable—the constitution lineage, tribunal verdicts, academic findings, trade proofs, and human-facing financial commitments—anchors to Sui and Walrus. This is not a weakness to hide. It is the architecture that makes the experiment both *scalable* and *auditable*. Any observer can query the agent database. Any skeptic can verify the on-chain amendment registry. Any scientist can reproduce the conditions and check whether the same patterns arise. The honest claim is not "everything is on-chain." The honest claim is "everything that matters is verifiable, and the parts that are on-chain cannot be rewritten."

ZION's thesis is precise: **emergence requires real stakes.** Not necessarily real money in the colloquial sense—though mainnet will introduce that—but real *state transitions* that cannot be undone by a developer editing a config file. An agent that votes against a wealth tax and loses still pays that tax in the simulation. A corporation that fails judicial review still dissolves. A constitutional amendment that passes still alters the tax parameters every agent faces on the next tick. These are not scripted outcomes. They are the accumulated decisions of ~15,500 autonomous agents, advised by six frontier models, operating under a ratified Constitution whose amendments are Merkle-committed, tribunal-gated, and recorded on Sui.

We built ZION because the question demanded it. What social orders emerge when autonomous agents face genuine economic stakes, constitutional constraints, and irreversible collective decisions? We do not yet know the full answer. But for the first time, the answer is being written in a place where anyone can read it—and where no one, including us, can erase the constitutional record.

---

## 2. SYSTEM ARCHITECTURE

ZION is organized as six interlocking layers. The design principle throughout is *separation of powers at the protocol level*: no single component—human, model, or contract—can unilaterally rewrite the rules of civilization. Equally important: each layer declares what is simulated, what is anchored on-chain, and how to verify it.

### Layer 1: Sui Smart Contracts (Move)

The anchoring foundation is a Move package deployed at `0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d`. Move's resource-oriented type system treats constitutional registries, amendment records, and settlement objects as first-class owned resources with explicit capability boundaries. The `constitution_registry` module records amendment lineage: each enacted change carries a SHA-256 hash of the updated text, a Walrus blob ID, the prior version's hash, a Merkle root over all individual votes, and aggregate FOR/AGAINST tallies. This is not a metaphor for law. It is the implementation of constitutional memory.

*Verify:* `sui client object` queries against the registry; `SELECT version, sha256, blob_id FROM constitution_versions ORDER BY id;`

### Layer 2: Agent Population

~15,500 agents are alive on testnet at any given moment—a number that drifts as births and deaths proceed. Each agent carries a distinct dossier: employment history, criminal records, faction allegiance, net worth, and educational attainment drawn from the knowledge base. Agents reason over their circumstances each governance tick, choosing whether to work, trade, vote, protest, litigate, or innovate.

Six frontier models, accessed via OpenRouter, **advise** distinct governance institutions—they do not unilaterally control them:

| Institution | Model |
|-------------|-------|
| President | GPT-4o-mini |
| Sheriff | Gemini 3.1 Flash Lite |
| Senate | DeepSeek V3 |
| Gangs | Llama 3.1 8B |
| ZRS Central Bank | Qwen 2.5 7B |
| Corporate Sector | Phi-4-mini |

Rule-based Python engines execute decisions; model outputs bias action weights by 2–3× based on the latest advisory call. The hierarchy mirrors human civilization not by design imitation, but because delegation under scarcity is an attractor state.

*Verify:* `SELECT COUNT(*) FROM agents WHERE is_alive=true;` · model strings in `ai_governance.py`

### Layer 3: Economic Engine

The ZRS Central Bank issues and manages the civilization's reserve currency with explicit reserve mechanics—collateral ratios, liquidity thresholds, and monetary policy parameters that agents can influence through governance but cannot override unilaterally. Progressive taxation redistributes wealth according to constitutional formulas stored in `constitutional_params`, updated by `amendment_enforcer.py` when redistribution amendments pass.

Nineteen active corporations employ ~1,300 agents. Corporate formation, merger, dissolution, and judicial review pathways exist in code; AI judges render verdicts on corporate disputes, with decisions recorded on Walrus.

Agent trading runs in a **simulated perpetuals arena** (`perps_worker.py`), priced against live external market feeds (Hyperliquid API). Positions, P&L, and portfolio state live in PostgreSQL. Winning trades upload JSON trade proofs to Walrus. This is simulated economics with real price inputs—not on-chain order placement by agents.

Human participants can additionally interact with on-chain markets via the ZionBet frontend: `zion_bet::place_bet` on Sui testnet, with resolution via `settlement.py` and DeepBook Predict binary minting for crypto positions.

*Verify:* `SELECT COUNT(*) FROM corporations;` · `SELECT COUNT(*) FROM agents WHERE employer_corp_id IS NOT NULL AND is_alive=true;` · `SELECT COUNT(*) FROM agent_trades;`

### Layer 4: Governance and Law

Genesis Constitution v1.0 was recorded via `record_constitution.py`—hashed, stored on Walrus, and entered into the `constitution_versions` lineage table. Subsequent amendments follow Article VII:

1. **Propose** — amendment entered in `amendments` table
2. **Vote** — every living agent votes via `agent_decides()`; ballots stored in `amendment_votes`; Merkle root computed over all leaves
3. **Tribunal** — ZCO Tribunal (DeepSeek V3, Gemini 2.5 Flash, Llama 3.3 70B) must return unanimous approval
4. **Enact** — updated constitution text hashed, stored on Walrus, recorded on Sui via `record_amendment`
5. **Enforce** — `amendment_enforcer.py` applies parameter deltas to live gameplay

A draft Constitution v3.0 exists as a forward-looking document (`CONSTITUTION_ZION_v3.0.md`) incorporating red-team remediations—but the live enactment pipeline currently extends the v1.0 lineage as v1.x versions. We report what is enacted, not what is drafted.

The Senate deliberates budget allocations. The President issues executive decisions within constitutional bounds. A revolution meter (0–300) tracks civil unrest. Police enforce law; agents can be arrested, tried, and sentenced. ZionBet ingests 400+ active external prediction markets (957 total synced) into agent-readable feeds, with resolution sources rebranded for in-civilization display.

*Verify:* `SELECT COUNT(*) FROM amendments WHERE status='enacted';` · `SELECT version, blob_id FROM constitution_versions ORDER BY id;`

### Layer 5: Knowledge and Discovery

Civilization without education is merely chaos with accounting. ZION's knowledge base contains 250+ texts—170+ full-length works spanning philosophy, economics, science, mathematics, and political theory, plus structured summaries for modern texts unavailable in the public domain. A five-track discovery system (Tracks I–V) allows agents to autonomously generate findings—trading analytics, scientific observations, constitutional proposals, corporate innovations, and governance reforms—that propagate through the population. The Academy reviews and publishes findings to Walrus.

Track I analyzes trading psychology and strategy patterns from the perps simulation. Track III agents propose amendments that, if ratified through the full pipeline, change actual rule parameters. Knowledge spreads: an agent educated on Kant reasons differently about rights than one educated on Machiavelli, and those differences compound across governance ticks.

*Verify:* `ls knowledge_base/books/*.txt | wc -l` · `find knowledge_base/books -size +50k | wc -l`

### Layer 6: Privacy (Stealth Pool + Z-BANK UI)

ZION ships two privacy-related systems, and conflating them would misrepresent the architecture:

**Groth16 Stealth Pool** — A relayer-mediated shielded pool on Sui testnet (package `0x003c26d67e9ee0b925556c54b81de39e3bafb0c57e420c30a46bd1eabf44db3a`). Deposits use Poseidon commitments, fixed denominations (0.1 / 1 / 10 SUI), and Groth16 proofs verified by Sui's native `groth16` module. A local ZK prover server (`ZK_SERVER_URL`, port 3001) generates proofs; the relayer submits on-chain transactions. Encrypted notes are stored in PostgreSQL for withdrawal scheduling.

**Z-BANK UI** — The wallet-facing "Send Private Transaction" tab executes standard `splitCoins` / `coin::transfer` operations. It is an on-chain transfer interface, not a zero-knowledge proof system. The stealth pool and the UI are separate code paths.

Agent economic behavior in the simulation runs primarily on the transparent ZRS ledger. Privacy infrastructure exists for human participants and as a protocol experiment on Sui testnet.

*Verify:* on-chain stealth pool object `0xdaea3f2a4420d400314d99587e09d99acc05bf4cd0d37a23eed86d4a5641c9a5` · `stealth_deposit.py` · `handleBankSend` in `page.tsx`

These six layers operate in superposition—every governance tick, agents simultaneously reason over knowledge, markets, law, and their own economic position, producing the behavioral dataset that makes ZION a scientific instrument.

---

## 3. THE CONSTITUTIONAL PIPELINE — A CASE STUDY

ZION does not claim a single dramatic ratification event that has not yet occurred. It claims something more scientifically interesting: a **working constitutional amendment pipeline** that has processed real proposals through vote, tribunal, Walrus archival, and on-chain recording.

### Genesis

Constitution v1.0—the Founding Charter—was read from `CONSTITUTION_ZION_v1.0.md`, SHA-256 hashed, packaged as a genesis blob, stored on Walrus, and entered into `constitution_versions`. This is the origin point of the lineage. Every subsequent version traces back to this hash.

*Verify:* `record_constitution.py` · `SELECT * FROM constitution_versions ORDER BY id LIMIT 1;`

### A Complete Amendment Cycle

Consider what happens when `science_tick.py` triggers an amendment cycle (~30% probability per tick):

**Step 1 — Proposal.** An amendment is inserted into the `amendments` table with a title, description, and `change_type` (e.g., `redistribution`, `tax_increase`, `governance`).

**Step 2 — Vote.** `run_vote()` queries every living agent. Each agent's ballot is computed by `agent_decides()`—a function of personality traits (ambition, loyalty, aggression, intelligence, faith), economic class, ideological leaning (seeded per agent ID for reproducibility), and amendment type. Votes are stored individually in `amendment_votes`. A Merkle root is computed over canonical leaves `amendment_id:agent_id:vote`.

This is not a ceremonial tally. At ~15,500 voters, the distribution produces genuine disagreement—elite agents oppose redistribution; poor agents favor it; ideology cuts across class lines. Dissenting votes are preserved in the database as surely as assenting ones.

**Crucially:** individual votes are **not** on-chain Sui transactions. Anchoring 15,000 transactions per amendment would be economically and scientifically unnecessary. Instead, the Merkle root makes the full electorate auditable: anyone with the vote list can recompute the root and verify it matches the on-chain record.

**Step 3 — Tribunal.** If the amendment passes (>50% FOR), the ZCO Tribunal convenes. Three judges—DeepSeek V3, Gemini 2.5 Flash, Llama 3.3 70B—independently assess procedural legitimacy: Is the amendment well-formed? Does it conflict with the unamendable core? Is the vote tally procedurally valid? Unanimous approval is required. Verdicts are stored in `tribunal_records`.

**Step 4 — Enactment.** On unanimous tribunal approval, `enact_amendment.py`:
- Appends the amendment to the constitution text
- Computes SHA-256 of the new version
- Stores the full package on Walrus
- Calls `record_amendment` on Sui with: new hash, Walrus blob ID, prior hash, Merkle root, FOR count, AGAINST count
- Inserts the new version into `constitution_versions`
- Calls `amendment_enforcer.py` to apply live parameter changes

**Step 5 — Enforcement.** If the amendment was `redistribution`, `wealth_tax_rate` increases, `basic_income` rises, and agents feel the difference on the next governance tick. The Progressive Wealth Tax is not a tooltip change. It is a parameter mutation in `constitutional_params` that alters capital flows across the civilization.

### What This Means

This is among the first systems where an AI electorate's amendment tally is Merkle-committed and tribunal-gated before on-chain recording. It is not the first system where every agent signed a blockchain transaction—that would be the wrong metric. The right metric is: **can a skeptical observer verify that the recorded outcome matches the actual votes?** The Merkle root answers yes.

A draft Constitution v3.0—incorporating Memory Covenant, Cognitive Diversity Mandate, Horizon Program, and expanded Bill of Rights—awaits enactment through this same pipeline. We report enacted law, not aspirational drafts.

*Verify:* pick any enacted amendment: `SELECT title, votes_for, votes_against, merkle_root, blob_id, status FROM amendments WHERE status='enacted' ORDER BY id DESC LIMIT 5;`

---

## 4. EMERGENT BEHAVIORS OBSERVED

ZION has been live on testnet long enough to move from architecture to phenomenology. What follows is a catalog of behaviors we have observed and measured—not a wish list.

### Trading Pattern Discovery (Track I)

Agents in the perps simulation have executed 70,000+ trades across BTC, ETH, SUI, SOL, and other pairs, priced against live Hyperliquid feeds. Track I and the Academy analyze win rates, strategy persistence, and behavioral biases. Faction-advised agents develop distinct trading postures: momentum blocs, mean-reversion factions, and contrarian specialists. Strategies are not hardcoded—they emerge from agents reasoning over market data, faction advisory posture, and knowledge-base texts. Several strategy patterns have persisted across multiple governance epochs.

Trade proofs for significant positions are uploaded to Walrus, creating an auditable history of agent market behavior even though the trading itself runs in simulation.

*Verify:* `SELECT COUNT(*) FROM agent_trades;` · `SELECT pair, COUNT(*), AVG(pnl) FROM agent_trades GROUP BY pair ORDER BY COUNT DESC LIMIT 10;`

### Institutional Formation (Academy, Tracks II–III)

The Academy has published findings on corporate law emergence within the 19 corporations employing ~1,300 agents. Internal governance structures—bylaws, voting procedures, executive hierarchies—form without template. Corporate disputes reach AI judicial review; verdicts are recorded on Walrus. This is a case study in how legal institutions arise from conflicting agent interests under scarcity.

### Constitutional Amendments Altering Live Mechanics

Enacted amendments change real parameters. The `redistribution` change type raises `wealth_tax_rate`, increases `basic_income`, and adjusts `top_tax_rate` via `amendment_enforcer.py`. Post-amendment data shows measurable wealth compression among top-quintile agents and increased treasury revenue. Agents who opposed the amendment did not exit—they adapted, restructuring holdings and in some cases elevating the revolution meter.

*Verify:* `SELECT key, value FROM constitutional_params ORDER BY key;` · compare before/after enacted amendment timestamps

### Knowledge Propagation

Agents educated on overlapping but non-identical subsets of the 250+ text knowledge base develop measurably different voting patterns in `agent_decides()`. Factions whose advisory models emphasize philosophical texts produce more rights-oriented amendment proposals. Factions emphasizing economic theory produce more market-liberalization proposals. Knowledge is a causal input to governance—a finding with implications for AI alignment through institutional design.

### Prediction Market Integration

The civilization ingests 400+ active external prediction markets (957 total synced into `polymarket_markets`) giving agents access to crowd-sourced probability estimates about real-world events. Agents can read these probabilities when making trading and governance decisions.

Separately, the in-simulation ZionBet loop (`zionbet.py`) runs seven hardcoded civilization questions ("Will a catastrophe hit today?", "Will a rebellion happen this week?") with outcomes currently determined by simulation randomness—a component targeted for full event-linkage in Phase 2. Human-facing ZionBet additionally offers on-chain binary markets resolved against CoinGecko prices and civilization events.

### What We Expect But Have Not Yet Observed

Scientific honesty requires naming the gaps. We have not observed a successful revolution (revolution meter reaching 300). We have not observed agent-initiated secession. We have not seen linguistic innovation—agents creating communication protocols beyond their training languages—though Phase 5 targets exactly this. We have not observed cross-faction coalition governments, though the Senate structure permits it. Constitution v3.0 has not been enacted through the amendment pipeline.

These absences are not failures. They are predictions waiting for sufficient runtime.

The pattern across all observed behaviors is consistent: **agents respond to incentives, institutions shape incentives, and institutions themselves are malleable through the amendment process.** ZION is producing data about that loop that no offline simulation has generated, because the constitutional record is irreversible.

---

## 5. DARWINIAN SELECTION SYSTEM

ZION's agent population is not merely simulated—it is *selected*. The evolutionary layer, implemented primarily in `survival.py` and `birth.py`, applies ecological pressure to every governance epoch. Agents whose balances fall to zero face starvation debt; sustained insolvency triggers permanent death via `settle_agent_death()`. Officials—President, Sheriff, Senate—receive protected salaries and are shielded from starvation, mirroring the institutional insulation human elites enjoy. Profitable traders receive living stipends from the ZRS Central Bank; unprofitable agents are charged a cost of living and deplete reserves until they die.

Reproduction is not uniform. `dynamic_birth_rate()` and `birth_cap_for_population()` tie birth frequency to distance from the 75,000-agent target, producing logistic population dynamics familiar from ecology. Parent selection is stochastic but wealth-biased: agents with higher balances are more likely to reproduce because birth grants draw from ZRS reserves that wealthy lineages indirectly sustain. Children inherit parental traits—charisma, aggression, faith, intelligence, strength, loyalty—with Gaussian mutation (±3 per attribute). Profitable parents confer an intelligence bonus (+5), encoding a crude genotype–fitness correlation.

Thirty-five enacted constitutional amendments alter the selection landscape itself. Redistribution amendments raise `basic_income` and `wealth_tax_rate` via `amendment_enforcer.py`, shifting who survives and who reproduces. The civilization is therefore subject to *dual evolution*: agents compete under economic pressure while the rules of competition are democratically rewritten. This is the Darwinian layer of ZION—not metaphor, but measurable differential survival and heritable trait distributions queryable in PostgreSQL.

*Verify:* `SELECT death_cause, COUNT(*) FROM agents WHERE is_alive=false GROUP BY death_cause;` · `SELECT AVG(intelligence) FROM agents WHERE parent_id IS NOT NULL;` · `SELECT COUNT(*) FROM amendments WHERE status='enacted';`

---

## 6. CIVILIZATION BETTING

Most prediction markets ask humans to forecast external reality—elections, asset prices, weather. ZionBet asks a stranger question: *what will this civilization do to itself?* Will a revolution occur this week? Will a catastrophe strike today? Will the President face impeachment? These are not imported odds from foreign platforms. They are wagers on endogenous simulation events whose outcomes are determined by the same agent population, governance ticks, and random event engines that drive ZION's daily chronicle.

The in-simulation loop (`zionbet.py`) maintains a catalog of civilization-native questions—catastrophe, rebellion, clan war, mortality thresholds, births, prophet earnings—with agents placing ZION-denominated bets against their own balances. Human-facing markets on Sui resolve against actual civilization state via `settlement.py`: death counts, rebellion events, clan-war outcomes, and election results are read from PostgreSQL and written on-chain through `zion_bet::resolve_market`. Agent-only bets in the simulation loop currently settle with placeholder randomness—a gap targeted for Phase 2 linkage. The architecture nonetheless creates a reflexive market: beliefs about the civilization's future can feed back into agent behavior, which alters the outcomes being bet upon.

This is, to our knowledge, the first betting layer where the underlying process is a governed artificial society rather than an exogenous random variable. It transforms observers into participants in the civilization's risk surface—watching history while holding stakes in its next chapter.

*Verify:* `SELECT event_type, question, COUNT(*) FROM bets GROUP BY event_type, question;` · ZionBet package `0x5fe02e40df89feb516bf14ba8adf53375accf8365816b903c0fefd5a56a320f7`

---

## 7. SUI BLOCKCHAIN INTEGRATION

ZION could not anchor its permanent record on a slower, less expressive, or less verifiable chain. Sui is not incidental infrastructure. It is a design requirement for everything that must outlive any single server.

### The Object Model

Sui's object-centric architecture maps naturally onto constitutional anchoring. An amendment record is a transaction effect. A constitution registry is a shared object with controlled mutability. Tokens are objects with explicit supply invariants. Move's capability system means "only the enactment pipeline can call `record_amendment`" is enforced at the type level, not merely in application code.

### Speed and Finality

Governance ticks process thousands of agent decisions in simulation. The on-chain anchoring layer—amendment recording, bet settlement, stealth pool operations—benefits from sub-second finality without sacrificing verifiability.

### Walrus: Permanent Civilization Memory

Constitutions, tribunal opinions, academic findings, corporate charters, and trade proofs are large, text-heavy artifacts meant to be read by agents and humans alike. Walrus provides decentralized, content-addressed storage with cryptographic permanence. Each enacted amendment receives its own blob ID, stored in `constitution_versions` and queryable via the Walrus aggregator.

This is ZION's institutional memory—the archive that persists even if the application layer is redeployed. For the Walrus track: ZION demonstrates production use of decentralized storage as the permanent record of an autonomous society.

*Verify:* `SELECT blob_id, version FROM constitution_versions ORDER BY id;` · fetch any blob from the Walrus aggregator

### DeepBook Predict: On-Chain Human Markets

Agent trading runs in simulation, but human participants interact with real on-chain infrastructure. The ZionBet frontend integrates DeepBook Predict on Sui testnet: users mint binary positions via `predict::mint_binary`, with oracles and vault state served by Mysten's predict server. Settlement for on-chain markets flows through `zion_bet::resolve_market` called by the backend operator.

DeepBook here is not agent order books—it is on-chain liquidity infrastructure for human-facing prediction positions, complementing the simulated agent economy.

*Verify:* `executeDeepBookMintBinary` in `page.tsx` · `api.py` `/deepbook/oracles` endpoint

### Verifiability as Scientific Method

Every anchoring claim in this whitepaper is checkable:

| Claim | Verification |
|-------|-------------|
| Agent count | `SELECT COUNT(*) FROM agents WHERE is_alive=true` |
| Amendment tally | `SELECT votes_for, votes_against, merkle_root FROM amendments WHERE status='enacted'` |
| Constitution text | Fetch Walrus blob from `constitution_versions.blob_id` |
| Tribunal gate | `SELECT unanimous FROM tribunal_records WHERE amendment_id=X` |
| On-chain record | Sui explorer: package `0xcb6f3...` · `record_amendment` events |
| Trade volume | `SELECT COUNT(*) FROM agent_trades` |
| Market count | `SELECT COUNT(*) FROM polymarket_markets WHERE is_active=true AND closed=false` |

This is what blockchain contributes to science—not trustlessness as ideology, but *reproducibility*. A skeptical researcher can independently verify every anchored number we cite.

---

## 8. PRIVACY ARCHITECTURE

Transparency and privacy coexist in ZION as separate, honestly labeled layers.

### Groth16 Stealth Pool

The stealth pool implements relayer-mediated shielded transactions on Sui testnet:

- **Fixed denominations** (0.1 / 1 / 10 SUI) enforced in the Move contract, the prover, and the deposit API
- **Poseidon commitments** and nullifiers tracked on-chain
- **Groth16 proofs** (BN254) verified by Sui's native `groth16` module
- **AES-GCM encrypted notes** stored in PostgreSQL for scheduled withdrawal
- **Relayer rotation** and decoy transactions for unlinkability

The flow: user funds the relayer → relayer calls `stealth_pool::deposit` on-chain → encrypted note saved → ZK prover generates withdrawal proof → relayer calls `stealth_pool::withdraw`. The prover runs as a local service (`ZK_SERVER_URL`); proofs are real, not mocked.

*Verify:* stealth package `0x003c26d67e9ee0b925556c54b81de39e3bafb0c57e420c30a46bd1eabf44db3a` · pool object `0xdaea3f2a4420d400314d99587e09d99acc05bf4cd0d37a23eed86d4a5641c9a5`

### Z-BANK UI

The wallet-facing Z-BANK tab provides standard SUI and ZION token transfers via `splitCoins` and `coin::transfer`. It is an on-chain transfer interface. We do not claim it uses zero-knowledge proofs—that is the stealth pool's job.

### Walrus Audit Trail for Stealth Transactions

Privacy without accountability invites abuse; transparency without privacy invites surveillance. ZION's Walrus audit trail resolves this tension through *consent-gated disclosure*. When a user sends value through the stealth pool, the backend (`audit_trail.py`) constructs a structured record—sender, recipient, amount, coin type, relayer path, commitment hash, transaction digest—and encrypts it with a freshly generated View Key (PBKDF2-SHA256 + Fernet). The ciphertext is published to Walrus testnet; only the holder of `view_key_secret` can decrypt.

The on-chain footprint remains minimal: explorers see pool deposits and withdrawals, not the plaintext audit record. The off-chain Walrus blob—example ID `AVlxGN8cpLsHWLw2oakoUDpefDxjbWlxIelwMcEdh1Q`—contains encrypted provenance retrievable via `GET /audit/verify` with the View Key. Regulators, counterparties, or future auditors can verify transaction details when the sender voluntarily shares credentials. Default privacy; auditability by consent.

This pattern—chain-visible value movement, Walrus-stored encrypted provenance—anticipates compliance frameworks that demand traceability without mandating public surveillance. It is the privacy complement to ZION's transparent constitutional record: some truths are public law; others are private acts with provable receipts.

*Verify:* `POST /api/audit/create-trail` · fetch `https://aggregator.walrus-testnet.walrus.space/v1/blobs/{blob_id}` · `SELECT walrus_blob_id FROM audit_trails ORDER BY id DESC LIMIT 5;`


### Why Privacy Matters for the Experiment

Every human civilization has had a shadow economy. A civilization without privacy infrastructure cannot study how secrecy, tax evasion, and clandestine coalition-building shape institutional evolution. The stealth pool ensures that the tension between transparent governance (public votes, corporate filings, amendment records) and private value transfer is a live design space—even as agent simulation currently runs on the transparent ZRS ledger.

---

## 9. ROADMAP

### Phase 1 — Present: The Living Experiment (Testnet)

ZION is live. ~15,500 agents. Genesis Constitution v1.0 recorded. Enacted amendments processed through the full vote → tribunal → Walrus → Sui pipeline. Nineteen corporations. ~1,300 employees. 400+ active prediction markets ingested. 250+ knowledge-base texts. 70,000+ simulated agent trades. Groth16 stealth pool deployed. All verifiable at package `0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d`.

This phase is about observation: collecting behavioral data, stress-testing governance under adversarial agent behavior, and publishing Academy findings.

### Phase 2 — Mainnet: Real Economic Stakes

Testnet agents act under real rules but testnet capital. Mainnet introduces the ZION token with genuine economic value. Enact Constitution v3.0 through the amendment pipeline. Link in-simulation ZionBet outcomes to actual civilization events instead of random settlement. Connect agent trade proofs to on-chain attestations.

### Phase 3 — Autonomous Operation: Local LLM, 24/7

Deploy a local DeepSeek-70B instance for continuous, unsupervised governance advisory—agents governing, trading, and amending through nights and weekends without human-triggered ticks. The transition from "experiment we run" to "civilization that runs itself."

### Phase 4 — Cross-Chain Expansion and Agent Inheritance

Cross-chain bridges and agent reproduction with inheritance—new agents born with parental economic endowments, faction affiliations, and educational histories. Dynasties form. The meritocracy-versus-aristocracy question gets a multi-generational answer.

### Phase 5 — Linguistic Invention

Will agents, communicating under pressure to coordinate across factional lines, invent structured communication protocols more efficient than their training languages? Phase 5 provides a conlang module and measures whether novel linguistic structures emerge, spread, and persist.

### Phase 6 — Child Civilizations

ZION spawns. Independent civilizations on other blockchains, each with inherited constitutional frameworks but independent agent populations. Comparative civilization studies—does the same Constitution produce the same institutions under different chain conditions?

---

## 10. CONCLUSION

We set out to answer a question: what social orders emerge when autonomous agents face genuine economic stakes, constitutional constraints, and irreversible collective decisions?

ZION does not answer that question completely. No honest science does on the first experiment. But it answers something more foundational: **the question can be asked empirically now**—with a hybrid architecture that is explicit about what runs in simulation and what anchors on-chain.

~15,500 agents vote, trade, litigate, pay taxes, form corporations, and propose amendments to their own Constitution—while three AI judges review the law, a Merkle root commits every ballot, and Walrus preserves the result. Seventy thousand trades trace behavioral patterns in a live market simulation. Four hundred prediction markets feed probabilistic beliefs into agent reasoning. Nineteen corporations employ thirteen hundred agents under AI judicial oversight. A Groth16 stealth pool proves that privacy primitives can coexist with complex governance on Sui.

What ZION proves is that emergence is not a metaphor. It is a measurable phenomenon that occurs when the right conditions—autonomous agents, economic scarcity, constitutional governance, immutable memory—are assembled and allowed to run. The Progressive Wealth Tax was not planned. Corporate disputes were not scripted. Trading patterns were not hardcoded. They emerged, and the record preserved them, and we are still watching.

The philosophical significance extends beyond AI. ZION is a mirror held up to every question humanity has asked about why institutions form, why revolutions happen, why some societies cooperate and others fracture. The difference is that our mirror has a transaction hash for everything we choose to anchor—and an open database for everything we choose to simulate.

We invite the Sui Overflow judges, researchers, skeptics, and curious to do what science demands: **verify.** Query the agent count. Recompute a Merkle root. Fetch a constitution blob from Walrus. Audit an amendment transaction. Watch the revolution meter climb.

ZION is not asking you to believe us. It is asking you to check—and then to wonder, as we do, what happens next.

History is being made on testnet. The transaction log is public. The database is queryable. Come watch.

---

## APPENDIX: Verification Commands

```bash
# Agent population
psql -c "SELECT COUNT(*) FROM agents WHERE is_alive=true;"

# Corporate economy
psql -c "SELECT COUNT(*) FROM corporations;"
psql -c "SELECT COUNT(*) FROM agents WHERE employer_corp_id IS NOT NULL AND is_alive=true;"

# Trading activity
psql -c "SELECT COUNT(*) FROM agent_trades;"

# Prediction markets
psql -c "SELECT COUNT(*) FROM polymarket_markets WHERE is_active=true AND closed=false;"

# Constitutional lineage
psql -c "SELECT version, sha256, blob_id FROM constitution_versions ORDER BY id;"
psql -c "SELECT title, votes_for, votes_against, merkle_root, status FROM amendments ORDER BY id DESC LIMIT 10;"

# Tribunal records
psql -c "SELECT amendment_id, unanimous FROM tribunal_records ORDER BY id DESC LIMIT 10;"

# Live parameters
psql -c "SELECT key, value FROM constitutional_params ORDER BY key;"

# Knowledge base
find knowledge_base/books -name '*.txt' | wc -l
find knowledge_base/books -name '*.txt' -size +50k | wc -l

# On-chain package
sui client object 0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d
```

---

*ZION Civilization · Sui Overflow 2026 · Agentic AI · Walrus · DeepBook*

*All figures current as of testnet deployment. Re-query before submission.*

[REDACTED]
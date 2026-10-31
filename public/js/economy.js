// Game rules as pure data + functions. Imported by the browser and by the Worker,
// which replays the same formulas to sanity-check uploaded saves.
//
// Prestige layers, each resetting everything below it:
//   run (rows, sources, upgrades, columns)
//   → Re-platform   for 💡 Insights  (Architecture, Tech Radar)    from company rows
//   → Acquisition   for 📈 Equity    (Board)                       from civilization rows
//   → First Contact for 👽 Xenobytes (Xenotech, alien data types)  from universe rows
//   → Big Bang      for 🌀 Axioms    (permanent, after the finale)
//
// Balance rule of thumb (see tools/sim.js): each layer's currency must feed back into
// its own growth with an exponent well below 1, or runs snowball to Infinity.

const SAVE_VERSION = 1;
const COST_GROWTH = 1.15;

function pluralize(name) {
  if (name === "Everything Is Data") return name;
  if (/(x|sh|s)$/.test(name)) return `${name}es`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

// [id, name, emoji, base cost, base rows/s, flavor]. Costs ×13 and rates ×7 per tier.
export const PRODUCERS = [
  ["intern", "Spreadsheet Intern", "🧑‍💻", 15, 0.1, "Types rows into a CSV by hand. Occasionally saves it."],
  ["cron", "Cron Job", "⏰", 100, 1, "Runs every minute. Nobody remembers who wrote it."],
  ["script", "Python Script", "🐍", 1.1e3, 8, "requirements.txt not included."],
  ["postgres", "Postgres Box", "🐘", 1.2e4, 47, "The server under someone's desk that runs the company."],
  ["dag", "Airflow DAG", "🔀", 1.3e5, 260, "Green on Tuesdays. Mostly."],
  ["stream", "Event Stream", "🌊", 1.4e6, 1400, "Exactly-once delivery, at least once."],
  ["spark", "Spark Cluster", "⚡", 2e7, 7800, "Shuffles 4 TB to count to ten."],
  ["warehouse", "Data Warehouse", "🏛️", 3.3e8, 44e3, "Star schema. Snowflake schema. Galaxy schema."],
  ["lakehouse", "Lakehouse", "🏞️", 5.1e9, 260e3, "A lake that thinks it is a house."],
  ["datacenter", "Data Center", "🏢", 7.5e10, 1.6e6, "Forty thousand blinking lights, one of them important."],
  ["region", "Cloud Region", "☁️", 1e12, 1e7, "us-east-1 sends its regards."],
  ["qubits", "Qubit Farm", "⚛️", 1.4e13, 6.5e7, "Each qubit is 0, 1, and a support ticket. Kept at 15 millikelvin; morale is lower."],
  ["mesh", "Planetary Mesh", "🌐", 1.7e14, 4.3e8, "Every toaster on Earth is now a data product."],
  ["orbital", "Orbital Data Center", "🛰️", 2.1e15, 2.9e9, "Free cooling, terrible commute."],
  ["dyson", "Dyson Warehouse", "☀️", 2.6e16, 2e10, "Powered by a star. Still out of disk space."],
  // R&D Lab (Board), one per level.
  ["asteroid", "Asteroid Tape Library", "☄️", 3.4e17, 1.4e11, "Cold storage. Extremely cold storage."],
  ["matrioshka", "Matrioshka Mainframe", "🪆", 4.4e18, 1e12, "A computer around a computer around a star."],
  ["galaxylake", "Galactic Data Lake", "🌌", 5.7e19, 7e12, "Spiral-arm partitioning. Dark matter is just unindexed rows."],
  ["quantumfoam", "Quantum Foam Cache", "🫧", 7.4e20, 4.9e13, "Every cache hit and miss, at the same time."],
  ["multiverse", "Multiverse Replica", "🪞", 9.6e21, 3.4e14, "Eventually consistent across realities."],
  ["chrono", "Time-Travel Backfill", "⏳", 1.25e23, 2.4e15, "Loads tomorrow's data yesterday. SLAs have never looked better."],
  // Contact Protocol (Xenotech), one per level.
  ["embassy", "Alien Data Embassy", "👽", 1.6e24, 1.7e16, "They store everything in 7-valued booleans and refuse to explain."],
  ["hive", "Hive-Mind Database", "🐝", 2.1e25, 1.2e17, "Every bee is a row. Every row is a bee."],
  ["vibes", "Vibes Ingestion", "✨", 2.7e26, 8.2e17, "Feelings, finally queryable. 94% of them are 'meh'."],
  ["dreams", "Dream Lake", "💤", 3.5e27, 5.7e18, "Everyone's dreams, partitioned by REM cycle."],
  ["everything", "Everything Is Data", "🫠", 4.6e28, 4e19, "Your cat is a row. The Sun is a row. You are a row."],
].map(([id, name, icon, cost, rate, flavor], i) => ({ i, id, name, plural: pluralize(name), icon, cost, rate, flavor }));
export const BASE_PRODUCERS = 15;
export const RND_PRODUCERS = 6;
export const FINAL_PRODUCER = PRODUCERS.length - 1;

// Each producer gets ×2 upgrades unlocked at these owned counts.
const TIER_AT = [1, 10, 25, 50, 100, 150, 200, 250, 300, 400, 500];
/** The next owned count that unlocks a ×2 upgrade for producer i (null past the last). */
export const nextTierAt = (s, i) => TIER_AT.find((t) => t > s.prod[i]) ?? null;
const TIER_COST = [10, 50, 500, 5e4, 5e6, 5e8, 5e10, 5e12, 5e14, 5e16, 5e18];
// Every source eventually gets sold back to you as a product.
const LATE_TIERS = ["Enterprise Edition", "Fully Managed"];
const TIER_NAMES = {
  intern: ["Keyboard Shortcuts", "Freeze Panes", "VLOOKUP Mastery", "Pivot Tables", "Power Query", "Macros (Signed)", "Return Offer", "Promoted to Analyst", "Runs the Finance Model"],
  cron: ["crontab.guru", "flock(1)", "Log Rotation", "Timezone Awareness", "Retries With Jitter", "Cron Jobs for the Cron Jobs", "systemd timers", "Distributed Cron", "Leap-Second Proof"],
  script: ["Virtualenvs", "Type Hints", "Pandas", "Vectorized Ops", "Polars Rewrite", "Async Everything", "It Has Tests Now", "Packaged Properly", "No GIL"],
  postgres: ["Indexes", "VACUUM ANALYZE", "Connection Pooling", "Read Replicas", "Partitioning", "Fivetrain Connector", "Unplugged Nobody's Desk Fan", "Columnar Extension", "Postgres for Everything"],
  dag: ["Idempotent Tasks", "Sensors", "Backfills", "Dynamic Task Mapping", "dbd Models (Jinja Inside)", "SLA Misses Muted", "The DAG of DAGs", "Deferrable Operators", "Zero Zombie Tasks"],
  stream: ["Consumer Groups", "Compaction", "Airbite Sync", "Exactly-Once Semantics", "Tiered Storage", "Zero-Copy", "Stream-Table Duality", "Infinite Retention", "Rebalance-Free"],
  spark: ["Broadcast Joins", "Adaptive Query Execution", "Skew Hints", "Native Engine", "Spot Instances", "Dynamic Allocation", "Coalesced Shuffles", "No More OOMs", "Shuffle-less"],
  warehouse: ["Clustering Keys", "Result Cache", "Materialized Views", "Auto-Suspend", "Zero-Copy Clones", "Lookie Semantic Model", "Finance Stopped Asking", "Serverless Everything", "Infinite Concurrency"],
  lakehouse: ["Columnar Files", "Time Travel", "Z-Ordering", "Open Table Format", "Liquid Clustering", "Deletion Vectors", "Catalog Unification", "Small Files Solved", "Lake Without Swamp"],
  datacenter: ["Hot Aisle Containment", "Liquid Cooling", "Custom Silicon", "Rack-Scale Design", "Own Power Plant", "Underwater Pods", "Lights-Out Ops", "Fusion Reactor", "Room-Temp Superconductors"],
  region: ["Availability Zones", "Anycast", "Private Backbone", "Cross-Region Replication", "Active-Active", "Cell Architecture", "The Status Page Is Green", "Zero-Downtime Forever", "Regions All the Way Down"],
  qubits: ["Dilution Refrigerator", "Error Correction", "Logical Qubits", "Grover's Index Scan", "Shor's Hash Join", "Topological Qubits", "Quantum Supremacy (Marketing)", "Room-Temperature Qubits", "Qubit per Row"],
  mesh: ["Domain Ownership", "Data Products", "Federated Governance", "Self-Serve Platform", "Smart Dust", "Global Consensus", "Everyone Is a Data Engineer", "Planetary Schema Registry", "Gaia Pipeline"],
  orbital: ["Laser Links", "Radiation Hardening", "Solar Arrays", "Orbital Debris Dedup", "Lagrange Caching", "Space Elevator Uplink", "Interplanetary TCP", "Moon Base Backup", "Mars Region GA"],
  dyson: ["Swarm Control", "Stellar Cooling", "Photon Storage", "Matrioshka Layers", "Stellar Engines", "Galactic Sharding", "Second Star", "Binary System Replication", "Red Giant Migration"],
  asteroid: ["Robotic Librarians", "Comet Couriers", "Regolith Tapes", "Belt-Wide RAID", "Zero-G Defrag", "Mining Rights", "Kuiper Overflow", "Oort Cloud Archive", "Planet-Killer Backup"],
  matrioshka: ["Nested Shells", "Thermal Gradients", "Self-Simulation", "Recursive Indexes", "Shell Garbage Collection", "Stacked Compression", "Doll Inside a Doll", "Infinite Regress", "Smallest Doll Found"],
  galaxylake: ["Spiral Partitioning", "Black Hole Compaction", "Dark Matter Indexing", "Nebula Ingestion", "Wormhole Shortcuts", "Arm-Level Isolation", "Galactic Catalog", "Andromeda Merge", "Local Group Mesh"],
  quantumfoam: ["Superposition Reads", "Entangled Replicas", "Decoherence Shielding", "Planck-Scale Pages", "Probabilistic Joins", "Observer-Free Writes", "Collapse on Commit", "Many-Worlds Sharding", "Vacuum Energy Cooling"],
  multiverse: ["Reality Branches", "Cross-Verse Joins", "Paradox Resolution", "Alt-You Interns", "Universal Merge Keys", "Divergence Dedup", "Infinite Monkeys", "Mirror Universe Failover", "Omniverse Catalog"],
  chrono: ["Predictive Ingestion", "Causality Loops", "Grandfather-Safe Writes", "Retroactive SLAs", "Temporal Tables (Literal)", "Paradox-Free CDC", "Before-It-Happens Alerts", "Bootstrap Paradox Cache", "End of Time Partition"],
  embassy: ["Universal Translator", "Diplomatic Immunity", "Xeno-Unicode", "Tentacle-Friendly Keyboards", "Interspecies SLAs", "Hyperspace VPN", "First Contact Runbook", "Galactic GDPR", "They Like Our Memes"],
  hive: ["Queen Election (Raft)", "Pheromone Indexes", "Waggle-Dance Routing", "Swarm Sharding", "Honeycomb Storage", "Collective Commit", "Drone Workers", "Buzzword Compliance", "One Mind, Many Rows"],
  vibes: ["Sentiment Columns", "Vibe Checks", "Mood Partitions", "Feelings as a Service", "Emotional Backpressure", "Good Vibes Only", "Existential Dread Filter", "Main Character Energy", "Immaculate Vibes"],
  dreams: ["REM Connectors", "Lucid Ingestion", "Nightmare Quarantine", "Déjà Vu Dedup", "Shared Dreams", "Falling Dream Retries", "Naked-at-School Masking", "Dream Within a Dream", "Wake-Up Commit"],
  everything: ["Cats Normalized (3NF)", "The Sun Has a Primary Key", "Grandma as a Slowly Changing Dimension", "Weather Is a Join", "Gravity Is a Constraint", "Time Is a Partition", "Love Is a Foreign Key", "SELECT * FROM existence", "COMMIT;"],
};

export const UPGRADES = [];
for (const p of PRODUCERS) {
  TIER_AT.forEach((need, t) => {
    UPGRADES.push({
      id: `${p.id}_${t}`,
      name: TIER_NAMES[p.id][t] ?? `${p.name}: ${LATE_TIERS[t - TIER_NAMES[p.id].length]}`,
      icon: p.icon,
      cost: p.cost * TIER_COST[t],
      desc: `${p.plural} are twice as fast.`,
      kind: "producer",
      target: p.i,
      need: { producer: p.i, count: need },
    });
  });
}
// Synergies: each source boosts the next tier up, +1% per unit of the one below it.
const SYNERGY_NAMES = [
  "Interns Write the Crontabs", "Cron Triggers Scripts", "Scripts Feed Postgres", "Postgres Sensors for DAGs",
  "DAGs Publish Events", "Streams Into Spark", "Spark Loads the Warehouse", "Warehouse Unloads to the Lake",
  "Lakes Need Data Centers", "Data Centers Become Regions", "Regions Host Qubits", "Qubits Route the Mesh",
  "Mesh Uplink to Orbit", "Orbit Feeds the Sphere", "Sphere Spills to Asteroids", "Tapes Fill the Shells",
  "Shells Drain to Galaxies", "Galaxies Froth Quantum Foam", "Foam Forks Universes", "Universes Fund Time Travel",
  "Time Travel Invites Aliens", "Aliens Join the Hive", "The Hive Has Feelings", "Feelings Become Dreams",
  "Dreams Become Everything",
];
PRODUCERS.slice(1).forEach((p, k) => {
  const below = PRODUCERS[k];
  UPGRADES.push({
    id: `syn_${p.id}`,
    name: SYNERGY_NAMES[k],
    icon: "🔗",
    cost: p.cost * 1e3,
    desc: `${p.plural} +1% per ${below.name} owned.`,
    kind: "synergy",
    target: p.i,
    from: below.i,
    need: { producer: p.i, count: 15 },
  });
});
// Click upgrades: flat multipliers early, then a share of rows/s so clicking stays relevant.
const CLICK_UPGRADES = [
  ["click_0", "Mechanical Keyboard", 100, { mult: 2 }, "INSERT gives twice as much."],
  ["click_1", "Vim Keybindings", 500, { mult: 2 }, "INSERT gives twice as much. Exiting is a separate upgrade."],
  ["click_2", "Bulk INSERT", 1e4, { pct: 0.01 }, "INSERT also adds 1% of your rows/s."],
  ["click_3", "COPY FROM STDIN", 1e6, { pct: 0.01 }, "INSERT also adds another 1% of rows/s."],
  ["click_4", "Prepared Statements", 1e8, { pct: 0.01 }, "+1% of rows/s per INSERT."],
  ["click_5", "Batching Middleware", 1e10, { pct: 0.01 }, "+1% of rows/s per INSERT."],
  ["click_6", "AI Autocomplete", 1e13, { pct: 0.02 }, "+2% of rows/s per INSERT. It hallucinated a column but it's fine."],
  ["click_7", "Brain-Computer Interface", 1e17, { pct: 0.03 }, "+3% of rows/s per INSERT. Think it, store it."],
];
for (const [id, name, cost, eff, desc] of CLICK_UPGRADES) {
  UPGRADES.push({ id, name, icon: "⌨️", cost, desc, kind: "click", eff, need: { rows: cost / 4 } });
}
const GLOBAL_UPGRADES = [
  ["g_0", "Version Control", 5e4, 1.5, "Everything +50%. The repo is called final_v2."],
  ["g_1", "Code Review", 5e6, 1.5, "Everything +50%. LGTM."],
  ["g_2", "CI/CD", 5e8, 1.5, "Everything +50%. Deploys on Friday now."],
  ["g_3", "Columnar Storage", 5e10, 1.5, "Everything +50%."],
  ["g_4", "Query Optimizer", 5e12, 1.5, "Everything +50%."],
  ["g_5", "Vectorized Execution", 5e14, 1.5, "Everything +50%."],
  ["g_6", "GPU Acceleration", 5e16, 1.5, "Everything +50%. Gamers are upset."],
  ["g_7", "Quantum Indexes", 5e18, 1.5, "Everything +50%. The index is and isn't there."],
  ["g_8", "Sentient Query Planner", 5e20, 2, "Everything ×2. It asked for a raise."],
  ["g_9", "Self-Writing Pipelines", 5e23, 2, "Everything ×2. You review the PRs. Sometimes."],
  ["g_10", "Cosmic Query Engine", 5e26, 2, "Everything ×2. EXPLAIN takes a light-year."],
  ["g_11", "Universal Optimizer", 5e30, 3, "Everything ×3. It optimized you out of the loop."],
  ["g_12", "Alien Code Review", 5e34, 3, "Everything ×3. They left 4,000 comments, all of them nits."],
  ["g_13", "Ontological Indexing", 5e38, 3, "Everything ×3. Things are now sorted by how much they exist."],
];
for (const [id, name, cost, mult, desc] of GLOBAL_UPGRADES) {
  UPGRADES.push({ id, name, icon: "🛠️", cost, desc, kind: "global", mult, need: { rows: cost / 4 } });
}
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Columns: a separate, steeper sink that multiplies everything.
const COLUMN_BASE_COST = 1e3;
const COLUMN_GROWTH = 12;
const COLUMN_NAMES = [
  "id", "created_at", "updated_at", "user_id", "email", "status", "is_deleted", "metadata_json",
  "amount_cents", "currency", "country_code", "_etl_loaded_at", "source_system", "legacy_flag",
  "notes", "tmp_col", "tmp_col_2", "do_not_use", "final_final", "customer_id_v2", "hash_key",
  "valid_from", "valid_to", "is_current", "row_version", "partition_date", "embedding",
  "vibes", "col_29", "why_is_this_here",
];
// Past the hand-written ones, columns accrete the way they do in real schemas: a prefix
// someone meant to clean up, a base field, and a suffix from a migration. Deterministic
// in n, and never repeats within the first 30 × 10 × 8 generated names.
const COL_PREFIX = ["tmp_", "legacy_", "new_", "old_", "copy_of_", "unused_", "raw_", "backup_", "fixed_", "real_"];
const COL_BASE = ["customer_id", "amount", "status", "created_at", "email", "is_active", "metadata_json", "vibes", "region", "notes"];
const COL_SUFFIX = ["_v2", "_final", "_old", "_bak", "_new", "_DO_NOT_DROP", "_fix", "2"];
export function columnName(n) {
  if (n < COLUMN_NAMES.length) return COLUMN_NAMES[n];
  const k = n - COLUMN_NAMES.length;
  return COL_PREFIX[k % 10] + COL_BASE[Math.floor(k / 10 + k * 3) % 10] + COL_SUFFIX[Math.floor(k / 3) % 8];
}

// Level-priced purchases: cost = base × growth^level.
export const levelCost = (def, level) => Math.ceil(def.base * def.growth ** level);
function levelsCost(def, level) {
  let sum = 0;
  for (let l = 0; l < level; l++) sum += levelCost(def, l);
  return sum;
}

function fmtMult(x) {
  if (x < 1000) return String(Math.round(x * 100) / 100);
  const e = Math.floor(Math.log10(x));
  return `${(x / 10 ** e).toFixed(1)}e${e}`;
}

// ---- Layer 1: Re-platform → Insights ----------------------------------------

const INSIGHT_DIVISOR = 1e5;

// One-time purchases; `mult` multiplies everything.
export const ARCH = [
  { id: "observability", name: "Observability", cost: 2, desc: "Monty Carlo-grade alerting: incidents show up twice as often." },
  { id: "slo", name: "SLOs", cost: 5, desc: "Incident buffs last twice as long." },
  { id: "contracts", name: "Data Contracts", cost: 15, desc: "Each column gives +10% more (×1.25 → ×1.35)." },
  { id: "caching", name: "Caching Layer", cost: 30, desc: "Data Catalog entries give +2% each instead of +1%." },
  { id: "medallion", name: "Medallion Architecture", cost: 60, mult: 2, desc: "Bronze, silver, gold: everything ×2." },
  { id: "mesh", name: "Data Mesh", cost: 100, desc: "+5% to everything per Data Source type owned." },
  { id: "terraform", name: "terraform apply", cost: 150, desc: "Unlocks the source auto-buyer (toggle in Settings)." },
  { id: "featurestore", name: "Feature Store", cost: 200, desc: "INSERT ×10. Every click is now a feature." },
  { id: "eventsourcing", name: "Event Sourcing", cost: 250, desc: "Backfills are capped at 40% of your bank instead of 15%." },
  { id: "zeroetl", name: "Zero-ETL", cost: 400, desc: "INSERT also adds 5% of rows/s." },
  { id: "kappa", name: "Kappa Architecture", cost: 800, desc: "Source upgrades give ×2.25 instead of ×2." },
  { id: "selfheal", name: "Self-healing Pipelines", cost: 1500, desc: "Incidents resolve themselves after 3 seconds." },
  { id: "vectordb", name: "Vector Database", cost: 3000, mult: 3, desc: "Everything ×3. It was Postgres with an extension." },
  { id: "semantic", name: "Semantic Layer", cost: 4000, desc: "Insights give a third more production bonus (4% per point instead of 3%)." },
  { id: "agi", name: "Autonomous Data Platform", cost: 2e4, mult: 5, desc: "Everything ×5. You are now the intern." },
  { id: "federation", name: "Lakehouse Federation", cost: 1e5, mult: 4, desc: "Everything ×4. Query every lake from every other lake." },
  { id: "lineage", name: "Column-Level Lineage", cost: 1e6, mult: 10, desc: "Everything ×10. You finally know where the numbers come from." },
  { id: "agents", name: "Agentic Pipelines", cost: 1e8, mult: 10, desc: "Everything ×10. The agents file tickets for each other now." },
];
const ARCH_BY_ID = Object.fromEntries(ARCH.map((a) => [a.id, a]));

export const RADAR = [
  { id: "defaults", name: "Better Defaults", base: 2, growth: 3, max: 500, desc: (l) => `Everything ×1.25 per level (now ×${fmtMult(1.25 ** l)}).` },
  { id: "pairing", name: "Pair Programming", base: 1, growth: 1.7, max: 100, desc: (l) => `INSERT ×2 per level (now ×${fmtMult(2 ** l)}).` },
  { id: "golden", name: "Golden Images", base: 3, growth: 2.2, max: 12, desc: (l) => `Start every run with free sources: level L gives 10×L of the first source, 10×(L−1) of the second, and so on (now level ${l}).` },
  { id: "reserved", name: "Reserved Instances", base: 5, growth: 2, max: 12, desc: (l) => `Data Sources cost 4% less per level (now −${l * 4}%).` },
  { id: "literacy", name: "Data Literacy", base: 8, growth: 1.9, max: 500, desc: (l) => `+15% Insights from re-platforming per level (now +${l * 15}%).` },
  { id: "disks", name: "Bigger Disks", base: 2, growth: 1.8, max: 10, desc: (l) => `Offline cap +1h per level (now ${2 + l}h).` },
  { id: "chaos", name: "Chaos Engineering", base: 10, growth: 2, max: 10, desc: (l) => `Incident multipliers +25% per level (now +${l * 25}%).` },
  { id: "tribal", name: "Tribal Knowledge", base: 6, growth: 2, max: 10, desc: (l) => `Incidents show up 10% more often per level (now +${l * 10}%).` },
  { id: "wide", name: "Wide Tables", base: 20, growth: 2.5, max: 10, desc: (l) => `Each column +2% stronger per level (now +${l * 2}%).` },
  { id: "devex", name: "Developer Experience", base: 4, growth: 2, max: 8, desc: (l) => `Clicking builds "hands on keyboard" momentum that boosts production. +25% to its cap per level (cap now +${25 + l * 25}%).` },
];
const RADAR_BY_ID = Object.fromEntries(RADAR.map((r) => [r.id, r]));

// ---- Layer 2: Acquisition → Equity ------------------------------------------

const EQUITY_DIVISOR = 1e23;
// Knobs tools/sim.js varies through TWEAK (e.g. TWEAK='E.TUNING.equityPower = 0.2').
// Chosen with tools/sim.js (SUMMARY=1) against runaway feedback: Insights and Better
// Defaults compound, and doubling Equity every few minutes made acquisitions burst.
export const TUNING = {
  equityPower: 0.23, equityProdPower: 0.25, insightPower: 1 / 3, insightBonusPower: 1, offlineRate: 0.5,
  // Soft caps: full benefit up to the cap, then value ** softPower past it.
  insightSoftcap: 1000, insightSoftPower: 0.7, equitySoftcap: Infinity, equitySoftPower: 0.5,
  // Production multipliers from Equity, Xenobytes and Axioms (and Axioms' prestige-gain
  // boost), soft-capped in multiplier space: ×cap at full strength, then ** multSoftPower.
  equityMultCap: 100, xenoMultCap: 100, axiomMultCap: 1e3, axiomBoostCap: 100, multSoftPower: 0.5,
  // Completed challenges each prestige needs from the layer below (0 in sims comparing curves).
  gateNeed: 3,
};
/** Full value up to `cap`, then cap × (x / cap) ** power: strongly diminished past it. */
export const softcap = (x, cap, power) => (x <= cap ? x : cap * (x / cap) ** power);
const unsoftcap = (y, cap, power) => (y <= cap ? y : cap * (y / cap) ** (1 / power));

export const BOARD = [
  { id: "autoreplat", name: "Auto Re-platform", base: 1, growth: 1, max: 1, desc: () => "Re-platforms for you when it would multiply your Insights (threshold in Settings)." },
  { id: "gitops", name: "GitOps", base: 1, growth: 1, max: 1, desc: () => "The auto-buyer also buys upgrades and columns, and is available from the start." },
  { id: "handcuffs", name: "Golden Handcuffs", base: 40, growth: 1, max: 1, desc: () => "Keep Architecture through acquisitions." },
  { id: "rnd", name: "R&D Lab", base: 3, growth: 4, max: RND_PRODUCERS, desc: (l) => `Unlocks one new Data Source beyond the Dyson Warehouse per level (${l}/${RND_PRODUCERS}).` },
  { id: "synergy", name: "Synergy", base: 1, growth: 6, max: 300, desc: (l) => `Everything ×2 per level (now ×${fmtMult(2 ** l)}).` },
  { id: "ir", name: "Investor Relations", base: 2, growth: 12, max: 300, desc: (l) => `Insights from re-platforming ×2 per level (now ×${fmtMult(2 ** l)}).` },
  { id: "parachute", name: "Golden Parachute", base: 4, growth: 3, max: 10, desc: (l) => `Keep 10% of your Tech Radar levels per level through acquisitions (now ${l * 10}%).` },
  { id: "reit", name: "Data Center REIT", base: 3, growth: 4, max: 10, desc: (l) => `Columns cost 20% less per level, compounding (now −${Math.round((1 - 0.8 ** l) * 100)}%).` },
  { id: "unicorn", name: "Unicorn Status", base: 500, growth: 1, max: 1, desc: () => "Everything ×10. Valuation: vibes × 40." },
  { id: "memory", name: "Institutional Memory", base: 3, growth: 1, max: 1, desc: () => "Re-platform challenges you've completed stay completed through acquisitions, rewards included." },
  { id: "radarbot", name: "Radar Bot", base: 6, growth: 1, max: 1, desc: () => "Buys Architecture and Tech Radar levels for you, cheapest first (toggle in Settings → Game)." },
  { id: "colo", name: "Colocation Lease", base: 2, growth: 3, max: 5, desc: (l) => `Each new company starts ${l} environment${l === 1 ? "" : "s"} up the ladder instead of on localhost (${l}/5).` },
];
export const BOARD_BY_ID = Object.fromEntries(BOARD.map((b) => [b.id, b]));

// ---- Layer 3: First Contact → Xenobytes -------------------------------------

const XENO_DIVISOR = 1e36;

// Alien data types: each one is a new column type, making every column stronger.
const ALIEN_TYPES = ["QUBIT", "SEVEN_STATE_BOOL", "VIBE", "NULLER_THAN_NULL", "HYPERDATE", "TELEPATHIC_TEXT", "SCHRODINGER_FK"];

export const XENOTECH = [
  { id: "contact", name: "Contact Protocol", base: 1, growth: 4, max: 5, desc: (l) => `Unlocks one alien Data Source per level (${l}/5).` },
  { id: "types", name: "Alien Data Types", base: 1, growth: 3, max: ALIEN_TYPES.length, desc: (l) => `Adopt an alien column type: each column +5% stronger per type (${l ? ALIEN_TYPES.slice(0, l).join(", ") : "none yet"}).` },
  { id: "probes", name: "Probe Swarm", base: 2, growth: 1, max: 1, desc: () => "Keep the Board through First Contact." },
  { id: "hive", name: "Hive Automation", base: 1, growth: 1, max: 1, desc: () => "Acquisitions happen automatically when they would double your Equity." },
  { id: "translator", name: "Universal Translator", base: 1, growth: 10, max: 200, desc: (l) => `Equity from acquisitions ×2 per level (now ×${fmtMult(2 ** l)}).` },
  { id: "warp", name: "Warp Drive", base: 1, growth: 8, max: 200, desc: (l) => `Everything ×2 per level (now ×${fmtMult(2 ** l)}).` },
  { id: "abductions", name: "Abduction Insurance", base: 3, growth: 1, max: 1, desc: () => "A new incident: 🛸 Abduction, production ×77 for 10s." },
  { id: "boardbot", name: "Board Bot", base: 4, growth: 1, max: 1, desc: () => "Buys Board seats for you, cheapest first (toggle in Settings → Game)." },
  { id: "permaplatform", name: "Permanent Platform", base: 30, growth: 1, max: 1, desc: () => "Architecture and the Tech Radar are never reset: not by acquisitions, not by First Contact." },
  { id: "records", name: "Speedrun Records", base: 3, growth: 1, max: 1, desc: () => "Challenge best times survive every reset, so re-completing a challenge brings its speed bonus straight back." },
  { id: "archive", name: "Galactic Archive", base: 2, growth: 1, max: 1, desc: () => "Acquisition challenges you've completed stay completed through First Contact, rewards included." },
];
const XENOTECH_BY_ID = Object.fromEntries(XENOTECH.map((x) => [x.id, x]));

// ---- Challenges ---------------------------------------------------------------
// A challenge is a run under a restriction. Reach the goal (run rows) and the restriction
// lifts and its reward switches on, lasting until the layer above `layer` next resets:
// Re-platform challenges until the next Acquisition, Acquisition ones until First Contact,
// First Contact ones until the Big Bang.

export const CHALLENGES = [
  // layer "replat": unlocked at 10 Insights
  { id: "legacy", req: (s) => s.replat >= 2, reqText: "Re-platform 2 times.", layer: "replat", name: "Legacy Migration", goals: [1.5e5, 8e24, 4e38, 3e42], rule: { noColumns: true },
    restriction: "No columns. The schema is frozen; the DBA retired.", reward: "Each column +10% stronger." },
  { id: "budget", req: (s) => s.replat >= 3, reqText: "Re-platform 3 times.", layer: "replat", name: "Budget Freeze", goals: [1.5e4, 4e27, 1.5e43, 5e49], rule: { costMult: 100 },
    restriction: "Data Sources cost ×100.", reward: "Data Sources cost 25% less." },
  { id: "hiring", req: (s) => s.ins >= 25, reqText: "Have 25 Insights.", layer: "replat", name: "Hiring Freeze", goals: [1.5e4, 8e27, 3e43, 1e50], rule: { minTier: 3 },
    restriction: "No Interns, Cron Jobs or Python Scripts.", reward: "Everything ×5." },
  { id: "friday", req: (s) => s.incidents >= 10, reqText: "Resolve 10 incidents.", layer: "replat", name: "Friday Deploy", goals: [6e4, 4e24, 1e38, 1.5e44], rule: { noClick: true, noUpgrades: true, starter: [10, 5] },
    restriction: "No INSERT and no upgrades. Just vibes and hope.", reward: "Incidents are twice as strong and twice as frequent." },
  { id: "compliance", req: (s) => s.ins >= 50, reqText: "Have 50 Insights.", layer: "replat", name: "Compliance Audit", goals: [6e3, 2e26, 1e42, 2.5e48], rule: { prodDiv: 100 },
    restriction: "Production ÷100 while auditors watch.", reward: "Insights from re-platforming ×3." },
  { id: "monorepo", req: (s) => s.ins >= 100, reqText: "Have 100 Insights.", layer: "replat", name: "Monorepo", goals: [2e5, 8e24, 4e36, 6e43], rule: { noInsights: true },
    restriction: "Insights give no production bonus.", reward: "Insights give twice the production bonus." },
  { id: "keepupg", req: (s) => s.replat >= 10, reqText: "Re-platform 10 times.", layer: "replat", name: "Immutable Infrastructure", goals: [2e4, 6e24, 3e38, 2.5e42], rule: { costMult: 10, noColumns: true },
    restriction: "Data Sources cost ×10 and no columns.", reward: "Upgrades are kept when you re-platform." },
  { id: "keepcols", req: (s) => s.chalWins >= 2, reqText: "Complete 2 challenges.", layer: "replat", name: "Schema-on-Write", goals: [2e5, 4e23, 1.5e35, 6e38], rule: { maxTier: 6 },
    restriction: "Only the first 6 Data Sources.", reward: "Columns are kept when you re-platform." },
  { id: "keepsrc", req: (s) => s.chalWins >= 4, reqText: "Complete 4 challenges.", layer: "replat", name: "Long-Term Support", goals: [1.5e3, 8e26, 4e42, 2e49], rule: { noClick: true, prodDiv: 10, starter: [10, 5] },
    restriction: "No INSERT, and production ÷10.", reward: "10% of every Data Source is kept when you re-platform." },
  // layer "acq": unlocked after the first Acquisition
  { id: "takeover", req: (s) => s.acq >= 1, reqText: "Get acquired once.", layer: "acq", name: "Hostile Takeover", goals: [3e24, 1.5e40, 8e46], rule: { prodDiv: 1e4 },
    restriction: "Production ÷10,000. The new owners are 'reviewing costs'.", reward: "Equity from acquisitions ×3." },
  { id: "lockin", req: (s) => s.acq >= 2, reqText: "Get acquired 2 times.", layer: "acq", name: "Vendor Lock-in", goals: [2.5e24, 1.5e36, 4e39], rule: { maxTier: 8 },
    restriction: "Only the first 8 Data Sources.", reward: "Everything ×100." },
  { id: "busfactor", req: (s) => s.eq >= 20, reqText: "Have 20 Equity.", layer: "acq", name: "Bus Factor 1", goals: [6e27, 2.5e43, 8e49], rule: { noAuto: true, noClick: true, starter: [10, 5] },
    restriction: "No automation, no INSERT. One engineer, on holiday.", reward: "R&D Lab sources ×10." },
  { id: "zerotrust", req: (s) => s.acq >= 3, reqText: "Get acquired 3 times.", layer: "acq", name: "Zero Trust", goals: [5e24, 1.5e38, 2e44], rule: { noIncidents: true, noUpgrades: true },
    restriction: "No incidents and no upgrades.", reward: "Synergy upgrades give +3% per source instead of +1%." },
  { id: "keepradar", req: (s) => s.chalWins >= 8, reqText: "Complete 8 challenges.", layer: "acq", name: "Technical Debt", goals: [1.5e25, 5e40, 4e47], rule: { prodDiv: 1e3, costMult: 10 },
    restriction: "Production ÷1000 and Data Sources cost ×10.", reward: "The Tech Radar is kept when you get acquired." },
  { id: "keepins", req: (s) => s.eq >= 100, reqText: "Have 100 Equity.", layer: "acq", name: "Knowledge Transfer", goals: [2.5e26, 2e38, 1.5e42], rule: { noAuto: true, maxTier: 12 },
    restriction: "No automation, and only the first 12 Data Sources.", reward: "10% of your Insights are kept when you get acquired." },
  // layer "contact": unlocked after the first First Contact
  { id: "translation", req: (s) => s.contact >= 1, reqText: "Make First Contact.", layer: "contact", name: "Lost in Translation", goals: [5e42, 2.5e49], rule: { costMult: 1e6 },
    restriction: "Everything costs ×1,000,000. The aliens charge per syllable.", reward: "Xenobytes from contact ×3." },
  { id: "darkforest", req: (s) => s.contact >= 2, reqText: "Make First Contact 2 times.", layer: "contact", name: "Dark Forest", goals: [1e36, 8e42], rule: { prodDiv: 1e9 },
    restriction: "Production ÷1e9. Stay quiet, or they'll find you.", reward: "Warp Drive gives ×3 per level instead of ×2." },
  { id: "heatdeath", req: (s) => s.xeno >= 50, reqText: "Have 50 Xenobytes.", layer: "contact", name: "Heat Death Speedrun", goals: [2.5e34, 1.5e38], rule: { noColumns: true, noUpgrades: true },
    restriction: "No columns and no upgrades.", reward: "Alien Data Sources ×1000." },
  { id: "keepeq", req: (s) => s.chalWins >= 15, reqText: "Complete 15 challenges.", layer: "contact", name: "Cultural Exchange", goals: [4e38, 1.5e45], rule: { prodDiv: 1e6, noIncidents: true },
    restriction: "Production ÷1,000,000 and no incidents.", reward: "10% of your Equity is kept through First Contact." },
  { id: "keepcontact", req: (s) => s.xeno >= 500, reqText: "Have 500 Xenobytes.", layer: "contact", name: "Seed Vault", goals: [1.5e38, 1.5e44], rule: { noUpgrades: true, minTier: 5 },
    restriction: "No upgrades, and none of the first 5 Data Sources.", reward: "Architecture and the Tech Radar are kept through First Contact." },
  // layer "bang": unlocked after the first Big Bang; nothing resets these
  { id: "keepxeno", req: (s) => s.bangs >= 1, reqText: "Start a new universe.", layer: "bang", name: "Entropy Reversal", goals: [1.5e40], rule: { prodDiv: 1e12 },
    restriction: "Production ÷1e12.", reward: "Xenotech is kept through Big Bangs." },
  { id: "keepboard", req: (s) => s.bangs >= 2, reqText: "Start 2 new universes.", layer: "bang", name: "Recurring Revenue", goals: [5e41], rule: { noColumns: true, costMult: 1e6 },
    restriction: "No columns, and Data Sources cost ×1,000,000.", reward: "The Board is kept through Big Bangs." },
];
export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

// Tiers. A challenge has one tier per prestige layer from its own up to Big Bang: tier t
// opens once layer LAYER_ORDER[layer + t − 1] is unlocked and you've ever beaten tier t − 1.
// While you play a tier, prestige power from its unlock layer and every layer above is off,
// so the goals (c.goals[t − 1], fixed numbers) test the power you have below it. Tier I
// gives the named reward; each higher tier adds TIER_REWARD to production. A completion is
// stored under its key ("legacy", "legacy#2", …) and drops when the layer above its unlock
// layer resets.
export const LAYER_ORDER = ["replat", "acq", "contact", "bang"];
const layerIdx = (layer) => LAYER_ORDER.indexOf(layer);
export const TIER_REWARD = 3;
export const tierCount = (c) => LAYER_ORDER.length - layerIdx(c.layer);
export const tierKey = (c, t) => (t === 1 ? c.id : `${c.id}#${t}`);
/** { challenge, tier, layer (where the tier unlocks) } for a key, or null. */
export function parseTier(key) {
  const [id, t = "1"] = String(key ?? "").split("#");
  const c = CHALLENGE_BY_ID[id];
  const tier = Number(t);
  if (!c || !Number.isInteger(tier) || tier < 1 || tier > tierCount(c)) return null;
  return { challenge: c, tier, layer: LAYER_ORDER[layerIdx(c.layer) + tier - 1] };
}
export const tierGoal = (c, t) => c.goals[t - 1];
export const CHALLENGE_LAYERS = [
  { id: "replat", name: "Re-platform challenges", until: "next Acquisition", unlocked: (s) => s.ins >= 10 || s.acq + s.contact + s.bangs > 0, hint: "Unlocks at 10 Insights." },
  { id: "acq", name: "Acquisition challenges", until: "next First Contact", unlocked: (s) => s.acq + s.contact + s.bangs > 0, hint: "Unlocks after your first Acquisition." },
  { id: "contact", name: "First Contact challenges", until: "next Big Bang", unlocked: (s) => s.contact + s.bangs > 0, hint: "Unlocks after First Contact." },
  { id: "bang", name: "Big Bang challenges", until: "end of time (they're permanent)", unlocked: (s) => s.bangs > 0, hint: "Unlocks after your first Big Bang." },
];

// ---- Layer 4: Big Bang → Axioms ---------------------------------------------
// Only after owning Everything Is Data. Axioms are permanent and never spent.

const axiomsFor = (allRows) => Math.max(1, Math.floor(Math.log10(Math.max(1, allRows)) / 30));

// Environments: cosmetic eras. `at` is company rows (coRows); `needs` gates the late, absurd ones
// on actual progress so the scenery never runs ahead of the story.
export const ENVIRONMENTS = [
  // Thresholds follow playtime, not fixed 1000× steps: a company's rows explode right
  // before it's acquired (about 1e12 → 1e23 in 15 minutes of optimal play), and each new
  // company climbs faster. tools/sim.js prints when each one is reached. Ids are stored in saves (env_ achievements):
  // never rename one, only add.
  { at: 0, id: "localhost", name: "localhost", hue: 140, scene: "room", desc: "A laptop, a CSV, a dream." },
  { at: 1e5, id: "dev", name: "dev", hue: 185, scene: "office", desc: "There is now a second laptop." },
  { at: 1e7, id: "staging", name: "staging", hue: 38, scene: "office", desc: "Like prod, but nobody looks at it." },
  { at: 1e9, id: "prod", name: "prod", hue: 4, scene: "servers", desc: "Careful. People are watching." },
  { at: 1e11, id: "hybrid", name: "hybrid cloud", hue: 280, scene: "servers", desc: "Half on-prem, half in the cloud, all of it in a spreadsheet." },
  { at: 1e13, id: "multiregion", name: "multi-region", hue: 210, scene: "servers", desc: "Your data never sleeps, in three timezones." },
  { at: 1e24, id: "edge", name: "edge", hue: 22, scene: "servers", desc: "Your data now lives in vending machines and smart fridges." },
  { at: 1e25, id: "quantum", name: "quantum", hue: 255, scene: "quantum", desc: "Your data is now both there and not there. Auditors are confused." },
  { at: 1e26, id: "lunar", name: "lunar", hue: 200, scene: "space", desc: "The Moon: excellent cooling, terrible latency." },
  { at: 1e28, id: "planetary", name: "planetary", hue: 165, scene: "planet", desc: "Earth is one big partition key." },
  { at: 1e30, id: "orbital", name: "orbital", hue: 45, scene: "space", desc: "Low Earth orbit is mostly your racks now." },
  { at: 1e33, id: "dyson", name: "dyson swarm", hue: 30, scene: "space", desc: "The Sun is now a power supply with a support contract." },
  { at: 1e36, id: "interstellar", name: "interstellar", hue: 220, scene: "space", desc: "The nearest star has been asked to sign a DPA." },
  // After First Contact the alien eras replace the top of each company's climb.
  { at: 1e22, needs: (s) => s.contact > 0, id: "contact", name: "first contact", hue: 110, scene: "alien", desc: "They come in peace. They want your schema." },
  { at: 1e26, needs: (s) => s.contact > 0, id: "galactic", name: "galactic", hue: 270, scene: "alien", desc: "The galaxy runs on your schema. Andromeda wants a migration plan." },
  { at: 1e35, needs: (s) => s.contact > 0, id: "multiverse", name: "multiverse", hue: 300, scene: "alien", desc: "Every reality has a staging environment. Yours is prod." },
  { at: 0, needs: (s) => s.prod[FINAL_PRODUCER] > 0, id: "everything", name: "everything", hue: 330, scene: "everything", desc: "Everything is data now." },
];
// Per company: an acquisition (or bigger prestige) starts the new company back down the
// ladder. Colocation Lease (Board) sets a floor for the plain-rows environments.
export const envRows = (s) => s.coRows;
export const reachedEnv = (s, e) => {
  if (e.needs) return e.needs(s) && envRows(s) >= e.at;
  return envRows(s) >= e.at || ENVIRONMENTS.indexOf(e) <= boardLevel(s, "colo");
};
export function environmentFor(s) {
  let env = ENVIRONMENTS[0];
  for (const e of ENVIRONMENTS) if (reachedEnv(s, e)) env = e;
  return env;
}

/** The next environment on the ladder and how far along it you are (log scale), or null at
 *  the top. `rowsLeft` is null when rows alone won't get you there (it needs a prestige). */
export function nextEnvironment(s) {
  const cur = environmentFor(s);
  const next = ENVIRONMENTS.slice(ENVIRONMENTS.indexOf(cur) + 1).find((e) => !reachedEnv(s, e));
  if (!next) return null;
  if (next.needs && !next.needs(s)) return { env: next, rowsLeft: null, progress: 0 };
  const rows = envRows(s);
  const from = Math.max(1, cur.at);
  const progress = Math.min(1, Math.max(0, Math.log10(Math.max(1, rows) / from) / Math.log10(next.at / from)));
  return { env: next, rowsLeft: Math.max(0, next.at - rows), progress };
}

// Storage footprint: universe rows expressed in the hierarchy rows → tables → … → everything.
export const STORAGE_UNITS = [
  ["row", 1], ["table", 1e3], ["schema", 1e6], ["database", 1e9], ["cluster", 1e12],
  ["data center", 1e15], ["region", 1e18], ["planet", 1e21], ["star system", 1e24], ["galaxy", 1e27],
  ["universe", 1e33], ["multiverse", 1e42], ["everything", 1e60],
];

// Incidents: the golden-cookie equivalent.
const INCIDENTS = [
  { id: "frenzy", weight: 5, label: "🔥 PagerDuty alert", title: "Hotfix Frenzy", desc: "Production ×7 for 30s.", buff: { kind: "prod", mult: 7, secs: 30 } },
  { id: "backfill", weight: 4, label: "📦 Backfill request", title: "Backfill", desc: "Instant rows: 15 min of production (capped at a share of your bank).", lump: true },
  { id: "storm", weight: 2, label: "📈 Viral dashboard", title: "Traffic Spike", desc: "INSERT ×50 for 12s.", buff: { kind: "click", mult: 50, secs: 12 } },
  { id: "ddl", weight: 1, label: "🧬 Schema drift", title: "Lucky Migration", desc: "Production ×3 for 90s.", buff: { kind: "prod", mult: 3, secs: 90 } },
  { id: "blackfriday", weight: 1, label: "🛍️ Black Friday traffic", title: "Black Friday", desc: "Production ×15 for 15s. Marketing takes the credit.", buff: { kind: "prod", mult: 15, secs: 15 } },
  { id: "conference", weight: 2, label: "🎤 Your conference talk got accepted", title: "Conference Talk", desc: "INSERT ×30 for 15s while you're on stage.", buff: { kind: "click", mult: 30, secs: 15 } },
  { id: "sprint", weight: 2, label: "🧹 Tech-debt sprint approved", title: "Tech-Debt Sprint", desc: "Production ×2 for 45s. It was approved by accident.", buff: { kind: "prod", mult: 2, secs: 45 } },
  // A rescue: here the mistake is NOT clicking. Ignoring it loses 10% of the bank.
  { id: "droptable", weight: 2, rescue: true, label: "🧯 The intern dropped a table!", title: "Restore from Backup", desc: "Restored. The backup was from 2019, but it's something." },
  // A trap: clicking it is the mistake. Ignoring it until it expires passes the test.
  { id: "phish", weight: 2, trap: true, labels: ["🎁 Claim your free GPU credits!", "📧 URGENT: verify your password", "💰 You won a Snowfake licence!", "📦 Your package could not be delivered"],
    title: "Phishing Test", desc: "You clicked it. Mandatory security training: production ×0.5 for 60s.", buff: { kind: "prod", mult: 0.5, secs: 60 } },
  { id: "abduction", weight: 2, label: "🛸 Abduction", title: "Abduction", desc: "Production ×77 for 10s. They return the rows slightly probed.", buff: { kind: "prod", mult: 77, secs: 10 }, needs: (s) => (s.xeno_tech.abductions ?? 0) > 0 },
];

// Achievements: each gives +1% production (+2% with Caching Layer). Kept forever.
export const ACHIEVEMENTS = [];
const ROW_ACH = [
  [1e2, "SELECT 1"], [1e4, "Hello, Table"], [1e6, "A Million Rows"], [1e8, "Needs an Index"],
  [1e10, "Big Data (Technically)"], [1e12, "Trillion Row Club"], [1e15, "Petarow"], [1e18, "Exarow"],
  [1e21, "Zettarow"], [1e24, "Yottarow"], [1e27, "Out of Prefixes"], [1e30, "Heat Death Backlog"],
  [1e36, "Cross-Reality Joins"], [1e42, "Entropy Is a Table"], [1e50, "Beyond Storage"], [1e60, "Novemdecillion Rows"],
  [1e80, "More Rows Than Atoms"], [1e100, "Googol Table"],
];
for (const [n, name] of ROW_ACH) {
  ACHIEVEMENTS.push({ id: `rows_${Math.log10(n)}`, name, desc: `Ingest 1e${Math.log10(n)} rows in total.`, test: (s) => s.everRows >= n });
}
for (const p of PRODUCERS) {
  for (const n of [1, 50, 100, 200, 300]) {
    ACHIEVEMENTS.push({ id: `own_${p.id}_${n}`, name: `${p.name} ×${n}`, desc: `Own ${n} ${p.plural}.`, test: (s) => (s.prod[p.i] ?? 0) >= n });
  }
}
const COUNT_ACH = [
  ["clicks", "INSERT {n} times by hand.", [[100, "Clicky"], [1000, "Carpal Tunnel"], [10000, "Human Load Balancer"], [100000, "Is This a Bot?"]]],
  ["cols", "Have {n} columns.", [[5, "Wide Table"], [10, "Very Wide Table"], [20, "SELECT * Regret"], [30, "One Big Table"]]],
  ["incidents", "Resolve {n} incidents.", [[1, "First Page"], [10, "On Call"], [50, "Incident Commander"], [250, "Postmortem Author"]]],
  ["replat", "Re-platform {n} times.", [[1, "Rewrite It"], [5, "Rewrite It Again"], [25, "Serial Re-platformer"], [100, "Framework of the Week"]]],
  ["acq", "Get acquired {n} times.", [[1, "Acqui-hired"], [3, "Serial Founder"], [10, "Holding Company"], [25, "Conglomerate"]]],
  ["contact", "Make First Contact {n} times.", [[1, "We Are Not Alone"], [3, "Frequent Flyer"], [10, "Galactic Liaison"]]],
  ["bangs", "Start {n} new universes.", [[1, "Let There Be Rows"], [3, "Cosmic Recurrence"], [10, "Universe Factory"]]],
];
for (const [key, desc, list] of COUNT_ACH) {
  for (const [n, name] of list) {
    ACHIEVEMENTS.push({ id: `${key}_${n}`, name, desc: desc.replace("{n}", n), test: (s) => s[key] >= n });
  }
}
for (const [n, name] of [[1, "Challenge Accepted"], [5, "Overachiever"], [13, "Did Them All"], [50, "Glutton for Punishment"]]) {
  ACHIEVEMENTS.push({ id: `chal_${n}`, name, desc: `Complete ${n} challenges.`, test: (s) => s.chalWins >= n });
}
for (const e of ENVIRONMENTS.slice(1)) {
  ACHIEVEMENTS.push({ id: `env_${e.id}`, name: `Welcome to ${e.name}`, desc: `Reach the ${e.name} environment.`, test: (s) => reachedEnv(s, e) });
}
const STAT_ACH = [
  ["combo_20", "Flow State", "Hit a ×20 INSERT combo.", (s) => s.stats.bestCombo >= 20],
  ["speed_replat", "Speedrunner", "Re-platform within 5 minutes of starting a run.", (s) => s.stats.fastestReplat > 0 && s.stats.fastestReplat <= 300e3],
  ["speed_acq", "Blitzscaling", "Get acquired within an hour of starting a company.", (s) => s.stats.fastestAcq > 0 && s.stats.fastestAcq <= 3600e3],
  ["night_shift", "Night Shift", "Come back to at least 8 hours of offline progress.", (s) => s.stats.longestAway >= 8 * 3600e3],
  ["full_stack", "Full Stack", "Own every base Data Source at once.", (s) => s.prod.slice(0, BASE_PRODUCERS).every((c) => c > 0)],
  ["no_hands", "Look Ma, No Hands", "Reach 1e9 rows in a run without clicking INSERT.", (s) => s.runRows >= 1e9 && s.stats.runClicks === 0],
  ["online_24h", "Touch Grass", "Play for 24 hours in total.", (s) => s.stats.onlineMs >= 24 * 3600e3],
  ["rate_1e30", "Firehose", "Reach 1e30 rows/s.", (s) => s.stats.bestRate >= 1e30],
  ["rescue_1", "Backup Hero", "Restore a table the intern dropped.", (s) => s.stats.rescues >= 1],
  ["rescue_10", "Disaster Recovery Plan", "Restore 10 dropped tables. Maybe revoke the intern's access.", (s) => s.stats.rescues >= 10],
  ["phish_5", "Security Champion", "Pass 5 phishing tests by not clicking.", (s) => s.stats.phishPassed >= 5],
  ["momentum_max", "In the Zone", "Fill the hands-on-keyboard bar completely.", (s) => s.stats.maxMomentum >= 0.99],
  ["okr_1", "Objectives and Key Results", "Hit your first OKR.", (s) => s.stats.okrs >= 1],
  ["okr_25", "Exceeds Expectations", "Hit 25 OKRs.", (s) => s.stats.okrs >= 25],
  ["okr_100", "Promoted to Principal", "Hit 100 OKRs. Your reward is more OKRs.", (s) => s.stats.okrs >= 100],
  ["quarters_10", "Fiscal Veteran", "Survive 10 quarters.", (s) => s.stats.quarters >= 10],
  ["requests_10", "Stakeholder Whisperer", "Answer 10 stakeholder requests.", (s) => s.stats.requests >= 10],
  ["meetings_25", "Calendar Tetris", "Sit through 25 meetings.", (s) => s.stats.meetings >= 25],
  ["upgrades_150", "Model Sprawl", "Own 150 upgrades at once.", (s) => s.upg.length >= 150],
  ["catalog_100", "Data Catalog Curator", "Collect 100 Data Catalog entries.", (s) => s.ach.length >= 100],
  ["sold_1", "Decommissioned", "Sell a Data Source. Somebody's dashboard still depended on it.", (s) => s.stats.sold >= 1],
  ["sold_1000", "Cost Optimization Initiative", "Sell 1,000 Data Sources in total. Finance sends a cake.", (s) => s.stats.sold >= 1000],
  ["sell_100", "Restructuring", "Sell 100 of one Data Source at once.", (s) => s.stats.bestSell >= 100],
  ["gravity", "Data Gravity", "Produce so much that data gravity kicks in.", (s) => s.stats.bestRate > GRAVITY_AT],
];
for (const [id, name, desc, test] of STAT_ACH) ACHIEVEMENTS.push({ id, name, desc, test });
ACHIEVEMENTS.push(
  { id: "named", name: "Incorporated", desc: "Give your company a name.", test: (s) => s.company.length > 0 },
  { id: "clickme", name: "Click Me", desc: "Click this achievement.", test: (s) => s.secrets.includes("clickme") },
);
// Secret achievements: name and description stay hidden until earned. Most are triggered by
// the client (recorded in s.secrets); a couple are derived from the save itself.
export const SECRETS = [
  ["bobby", "Little Bobby Tables", "Name your company with a SQL injection.", (s) => /drop\s+table|';|--/i.test(s.company)],
  ["selfname", "Recursion", "Name your company after the game.", (s) => /rows\s*to\s*riches/i.test(s.company)],
  ["konami", "Cheat Code", "↑ ↑ ↓ ↓ ← → ← → B A.", null],
  ["nightowl", "3 AM Deploy", "Play at 3 AM. Go to bed.", null],
  ["rageclick", "Rage Click", "Press INSERT 20 times while it's disabled.", null],
  ["inboxzero", "Inbox Zero", "Read every email (at least 10 of them).", null],
  ["readdocs", "Read the Docs", "Open every Help section. Nobody does this.", null],
  ["answer", "The Answer", "Sell your way down to exactly 42 of something.", null],
  ["phished", "Gone Phishing", "Click a phishing test. IT has scheduled your training.", null],
];
for (const [id, name, desc, derived] of SECRETS) {
  ACHIEVEMENTS.push({ id: `secret_${id}`, name, desc, secret: true, test: derived ?? ((s) => s.secrets.includes(id)) });
}
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

const COUNTERS = ["rows", "runRows", "coRows", "civRows", "allRows", "everRows", "ins", "insSpent", "eq", "eqSpent", "eqFree", "xeno", "xenoSpent"];
const INT_COUNTERS = ["cols", "clicks", "incidents", "replat", "acq", "contact", "bangs", "axioms"];

export function newState(now = Date.now()) {
  return {
    v: SAVE_VERSION,
    rows: 0, runRows: 0, coRows: 0, civRows: 0, allRows: 0, everRows: 0,
    prod: PRODUCERS.map(() => 0),
    upg: [], cols: 0,
    ins: 0, insSpent: 0, arch: [], radar: {}, freeIns: { arch: [], radar: {} },
    eq: 0, eqSpent: 0, eqFree: 0, board: {},
    xeno: 0, xenoSpent: 0, xeno_tech: {},
    axioms: 0, finale: false,
    chal: null, chalDone: [], chalEver: [], chalWins: 0, chalBest: {},
    momentum: 0,
    okr: null, // quarterly OKRs: { quarter, endsAt (online ms), items: [{ kind, label, base, target, done }] }
    inbox: [],
    company: "", secrets: [],
    // Carried over for free by retention rewards; the server subtracts these from "spent".
    kept: { upg: [], cols: 0, prod: [] }, insCarry: 0, eqCarry: 0, xenoFree: 0,
    stats: { upgBought: 0, colsBought: 0, sold: 0, bestSell: 0, momentumSecs: 0, rescues: 0, phishPassed: 0, okrs: 0, quarters: 0, requests: 0, meetings: 0, maxMomentum: 0, bestRate: 0, bestClick: 0, bestCombo: 0, fastestReplat: 0, fastestAcq: 0, longestAway: 0, onlineMs: 0, runClicks: 0, companyStartedAt: now },
    ach: [], clicks: 0, incidents: 0, replat: 0, acq: 0, contact: 0, bangs: 0,
    startedAt: now, runStartedAt: now, lastTick: now,
    buffs: [],
    settings: {
      sci: false, buy: 1, autoReplatAt: 2,
      // Auto-buyer, per category (Settings → Game → Automation).
      autoSources: false, autoStrategy: "value", autoSkip: [],
      autoUpgrades: false, upgStrategy: "cheapest", autoColumns: false,
      // Prestige shop bots, once owned (Radar Bot, Board Bot, 1 Axiom).
      autoRadar: true, autoBoard: true, autoXeno: true,
    },
  };
}

function normalizeLevels(raw, defs) {
  const out = {};
  for (const d of defs) {
    const l = Math.floor(Number(raw?.[d.id]) || 0);
    if (l > 0) out[d.id] = Math.min(l, d.max);
  }
  return out;
}

// Fills in fields added after a save was written, and drops junk.
export function normalize(raw, now = Date.now()) {
  const base = newState(now);
  if (!raw || typeof raw !== "object") return base;
  const s = { ...base, ...raw, settings: { ...base.settings, ...(raw.settings ?? {}) } };
  const num = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);
  for (const k of [...COUNTERS, ...INT_COUNTERS]) s[k] = num(s[k]);
  for (const k of INT_COUNTERS) s[k] = Math.floor(s[k]);
  // Older saves lack the outer layers: everything so far belongs to one company.
  for (const k of ["coRows", "civRows", "everRows"]) if (raw[k] === undefined) s[k] = s.allRows;
  s.prod = PRODUCERS.map((_, i) => Math.floor(num(raw.prod?.[i])));
  s.upg = [...new Set(Array.isArray(s.upg) ? s.upg : [])].filter((id) => UPGRADE_BY_ID[id]);
  s.arch = [...new Set(Array.isArray(s.arch) ? s.arch : [])].filter((id) => ARCH_BY_ID[id]);
  s.radar = normalizeLevels(raw.radar, RADAR);
  s.board = normalizeLevels(raw.board, BOARD);
  s.xeno_tech = normalizeLevels(raw.xeno_tech, XENOTECH);
  s.ach = [...new Set(Array.isArray(s.ach) ? s.ach : [])].filter((id) => ACH_BY_ID[id]);
  s.chalDone = [...new Set(Array.isArray(raw.chalDone) ? raw.chalDone : [])].filter((k) => parseTier(k));
  // Older saves didn't track tiers ever beaten; what's completed now certainly was.
  s.chalEver = [...new Set([...(Array.isArray(raw.chalEver) ? raw.chalEver : []), ...s.chalDone])].filter((k) => parseTier(k));
  s.chalBest = {};
  for (const [k, ms] of Object.entries(raw.chalBest ?? {})) if (parseTier(k) && Number.isFinite(ms) && ms > 0) s.chalBest[k] = Math.min(ms, CHALLENGE_LIMIT_MS);
  // What an acquisition carried over for free; bounded by what the Board and rewards allow.
  const keepAll = s.chalDone.includes("keepradar") || s.chalDone.includes("keepcontact") || s.xeno_tech.permaplatform;
  const keep = keepAll ? 1 : 0.1 * (s.board.parachute ?? 0);
  s.freeIns = {
    arch: s.board.handcuffs || s.chalDone.includes("keepcontact") || s.xeno_tech.permaplatform ? (Array.isArray(raw.freeIns?.arch) ? raw.freeIns.arch : []).filter((id) => s.arch.includes(id)) : [],
    radar: Object.fromEntries(
      RADAR.map((r) => [r.id, Math.min(Math.floor(Number(raw.freeIns?.radar?.[r.id]) || 0), Math.floor(r.max * keep), s.radar[r.id] ?? 0)]).filter(([, l]) => l > 0),
    ),
  };
  // A Board kept by Probe Swarm (or Recurring Revenue) is free; otherwise nothing is.
  s.eqFree = s.xeno_tech.probes || s.chalDone.includes("keepboard") || s.axioms >= 10 ? Math.min(s.eqFree, spentOnEquity(s)) : 0;
  s.xenoFree = s.chalDone.includes("keepxeno") ? Math.min(num(raw.xenoFree), spentOnXeno(s)) : 0;
  const k = raw.kept ?? {};
  s.kept = {
    upg: s.chalDone.includes("keepupg") ? (Array.isArray(k.upg) ? k.upg : []).filter((id) => s.upg.includes(id)) : [],
    cols: s.chalDone.includes("keepcols") ? Math.min(Math.floor(num(k.cols)), s.cols) : 0,
    prod: s.chalDone.includes("keepsrc") ? PRODUCERS.map((_, i) => Math.min(Math.floor(num(k.prod?.[i])), s.prod[i])) : [],
  };
  s.insCarry = s.chalDone.includes("keepins") ? num(raw.insCarry) : 0;
  s.eqCarry = s.chalDone.includes("keepeq") ? num(raw.eqCarry) : 0;
  s.buffs = Array.isArray(s.buffs) ? s.buffs.filter((b) => b && b.until > now && Number.isFinite(b.mult)) : [];
  for (const k of ["startedAt", "runStartedAt", "lastTick"]) s[k] = Number.isFinite(s[k]) ? s[k] : now;
  s.settings.autoReplatAt = Math.max(1.1, Number(s.settings.autoReplatAt) || 2);
  // Saves from before the split had a single "auto" switch for everything.
  if (raw.settings?.autoSources === undefined && raw.settings?.auto) Object.assign(s.settings, { autoSources: true, autoUpgrades: true, autoColumns: true });
  s.settings.autoSkip = (Array.isArray(s.settings.autoSkip) ? s.settings.autoSkip : []).filter((id) => PRODUCERS.some((p) => p.id === id));
  s.finale = !!s.finale;
  s.chal = parseTier(raw.chal) ? raw.chal : null;
  s.chalWins = Math.floor(num(raw.chalWins));
  s.momentum = Math.min(1, num(raw.momentum));
  const okr = raw.okr;
  s.okr =
    okr && typeof okr === "object" && Array.isArray(okr.items)
      ? {
          quarter: Math.floor(num(okr.quarter)),
          endsAt: num(okr.endsAt),
          items: okr.items.slice(0, 3).map((x) => ({ kind: String(x.kind).slice(0, 20), label: String(x.label).slice(0, 120), base: num(x.base), target: num(x.target), i: Math.floor(num(x.i)), done: !!x.done })),
        }
      : null;
  s.company = cleanCompany(raw.company);
  const secretIds = new Set(["clickme", ...SECRETS.map(([id]) => id)]);
  s.secrets = [...new Set(Array.isArray(raw.secrets) ? raw.secrets : [])].filter((id) => secretIds.has(id));
  // Inbox: [{id, at, read}] (flavor only; ids are validated by the client's INBOX list).
  s.inbox = (Array.isArray(raw.inbox) ? raw.inbox : []).filter((m) => m && typeof m.id === "string" && m.id.length < 40).slice(-200).map((m) => ({ id: m.id, at: Number(m.at) || now, read: !!m.read }));
  s.stats = { ...base.stats };
  for (const k of Object.keys(base.stats)) if (Number.isFinite(raw.stats?.[k]) && raw.stats[k] >= 0) s.stats[k] = raw.stats[k];
  s.v = SAVE_VERSION;
  return s;
}

const has = (list, id) => list.includes(id);
/** Company names: printable characters only, 32 at most. Escaped again wherever it's rendered. */
export const cleanCompany = (name) => (typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32) : "");
// Challenges switch off prestige power from the tier's unlock layer upwards: Insights,
// Architecture and the Tech Radar (re-platform), the Board and Equity (acquisition),
// Xenotech and Xenobytes (First Contact), Axioms (Big Bang). Challenge rewards stay on. So a
// challenge's static goal stays a real challenge however much currency you've piled up.
// Everything from the active tier's unlock layer upwards is off.
const offFrom = (s) => {
  const t = parseTier(s.chal);
  return t ? layerIdx(t.layer) : Infinity;
};
export const layerOff = (s, layer) => layerIdx(layer) >= offFrom(s);
export const radarLevel = (s, id) => (layerOff(s, "replat") ? 0 : (s.radar[id] ?? 0));
export const boardLevel = (s, id) => (layerOff(s, "acq") ? 0 : (s.board[id] ?? 0));
export const xenoLevel = (s, id) => (layerOff(s, "contact") ? 0 : (s.xeno_tech[id] ?? 0));
export const archOn = (s, id) => !layerOff(s, "replat") && s.arch.includes(id);
/** The active challenge's rule set ({} outside challenges). */
export const rule = (s) => parseTier(s.chal)?.challenge.rule ?? {};
/** A challenge reward in effect. Rewards stay on inside challenges: only prestige upgrades
 *  and currencies are switched off. */
export const won = (s, key) => s.chalDone.includes(key);
export const automationAllowed = (s) => !rule(s).noAuto;
export const incidentsAllowed = (s) => !rule(s).noIncidents;
export const clickAllowed = (s) => !rule(s).noClick;
const challengeLayerUnlocked = (s, layer) => CHALLENGE_LAYERS.find((l) => l.id === layer).unlocked(s);
/** Both the tier and the challenge's own requirement must be met. Completed ones stay listed. */
export const challengeUnlocked = (s, c) => challengeLayerUnlocked(s, c.layer) && c.req(s);
export const tierUnlocked = (s, c, t) =>
  t === 1 ? challengeUnlocked(s, c) : t <= tierCount(c) && challengeLayerUnlocked(s, LAYER_ORDER[layerIdx(c.layer) + t - 1]) && s.chalEver.includes(tierKey(c, t - 1));

// ---- costs -------------------------------------------------------------------

const costMultiplier = (s) => (1 - 0.04 * radarLevel(s, "reserved")) * (won(s, "budget") ? 0.75 : 1) * (rule(s).costMult ?? 1);

/** All six post-Dyson sources unlocked: required for alien sources and for First Contact. */
export const rndComplete = (s) => boardLevel(s, "rnd") >= RND_PRODUCERS;

export function producerUnlocked(s, i) {
  const r = rule(s);
  if ((r.minTier && i < r.minTier) || (r.maxTier && i >= r.maxTier)) return false;
  if (i < BASE_PRODUCERS) return true;
  if (i < BASE_PRODUCERS + RND_PRODUCERS) return i < BASE_PRODUCERS + boardLevel(s, "rnd");
  // The ladder never has holes: alien sources need the whole R&D tier first.
  return rndComplete(s) && i < BASE_PRODUCERS + RND_PRODUCERS + xenoLevel(s, "contact");
}

/** Price of buying n more of producer i. */
export function producerCost(s, i, n = 1) {
  const p = PRODUCERS[i];
  const owned = s.prod[i];
  return (p.cost * costMultiplier(s) * COST_GROWTH ** owned * (COST_GROWTH ** n - 1)) / (COST_GROWTH - 1);
}

export function maxAffordable(s, i, budget = s.rows) {
  if (!producerUnlocked(s, i)) return 0;
  const p = PRODUCERS[i];
  const first = p.cost * costMultiplier(s) * COST_GROWTH ** s.prod[i];
  if (budget < first) return 0;
  return Math.floor(Math.log((budget * (COST_GROWTH - 1)) / first + 1) / Math.log(COST_GROWTH));
}

const columnDiscount = (s) => 0.8 ** boardLevel(s, "reit");
export const columnCost = (n, s) => COLUMN_BASE_COST * COLUMN_GROWTH ** n * (s ? columnDiscount(s) : 1);
export const columnStep = (s) => (archOn(s, "contracts") ? 1.35 : 1.25) + 0.02 * radarLevel(s, "wide") + 0.05 * xenoLevel(s, "types") + (won(s, "legacy") ? 0.1 : 0);
export const columnMult = (s) => columnStep(s) ** s.cols;
/** Column type shown in the DDL: alien types take over the newest columns. */
export function alienTypeFor(s, n) {
  const t = xenoLevel(s, "types");
  return n >= s.cols - t ? ALIEN_TYPES[s.cols - 1 - n] : null;
}

// ---- production --------------------------------------------------------------

/** Production bonus from Insights (0.5 = +50%): full up to 1,000 Insights, soft-capped past that. */
export const insightBonus = (s) => softcap(s.ins ** TUNING.insightBonusPower, TUNING.insightSoftcap, TUNING.insightSoftPower) * insightPct(s);
export const insightPct = (s) => (rule(s).noInsights ? 0 : (archOn(s, "semantic") ? 0.04 : 0.03) * (won(s, "monorepo") ? 2 : 1));

export function producerMultiplier(s, i) {
  const step = archOn(s, "kappa") ? 2.25 : 2;
  let m = 1;
  for (const id of s.upg) {
    const u = UPGRADE_BY_ID[id];
    if (u.target !== i) continue;
    if (u.kind === "producer") m *= step;
    else if (u.kind === "synergy") m *= 1 + (won(s, "zerotrust") ? 0.03 : 0.01) * s.prod[u.from];
  }
  if (won(s, "busfactor") && i >= BASE_PRODUCERS && i < BASE_PRODUCERS + RND_PRODUCERS) m *= 10;
  if (won(s, "heatdeath") && i >= BASE_PRODUCERS + RND_PRODUCERS) m *= 1000;
  return m;
}

export const equityProdMult = (s) => softcap((1 + s.eq) ** TUNING.equityProdPower, TUNING.equityMultCap, TUNING.multSoftPower);
export const xenoProdMult = (s) => softcap((1 + s.xeno) ** 0.25, TUNING.xenoMultCap, TUNING.multSoftPower);
export const axiomProdMult = (s) => softcap(3 ** s.axioms, TUNING.axiomMultCap, TUNING.multSoftPower);

export function globalMultiplier(s) {
  let m = columnMult(s);
  for (const id of s.upg) {
    const u = UPGRADE_BY_ID[id];
    if (u.kind === "global") m *= u.mult;
  }
  if (!layerOff(s, "replat")) for (const id of s.arch) m *= ARCH_BY_ID[id].mult ?? 1;
  if (!layerOff(s, "replat")) m *= 1 + insightBonus(s);
  m *= 1 + (archOn(s, "caching") ? 0.02 : 0.01) * s.ach.length;
  m *= 1.25 ** radarLevel(s, "defaults");
  if (!layerOff(s, "acq")) m *= equityProdMult(s);
  m *= 2 ** boardLevel(s, "synergy");
  if (boardLevel(s, "unicorn")) m *= 10;
  if (!layerOff(s, "contact")) m *= xenoProdMult(s);
  m *= (won(s, "darkforest") ? 3 : 2) ** xenoLevel(s, "warp");
  if (won(s, "hiring")) m *= 5;
  if (won(s, "lockin")) m *= 100;
  m *= challengeMultiplier(s);
  m /= rule(s).prodDiv ?? 1;
  if (!layerOff(s, "bang")) m *= axiomProdMult(s);
  if (archOn(s, "mesh")) m *= 1 + 0.05 * s.prod.filter((c) => c > 0).length;
  // Doubles top out near 1.8e308; keep headroom so rates and costs never hit Infinity.
  return Math.min(m, MULT_CAP);
}

/** Rows/s for one producer type, before temporary buffs. */
export const producerRate = (s, i, gm = globalMultiplier(s)) => PRODUCERS[i].rate * s.prod[i] * producerMultiplier(s, i) * gm;

/** Rows/s before temporary buffs. */
// Data Gravity: past GRAVITY_AT rows/s, production counts with diminishing returns (a
// power softcap). Rows grow exponentially otherwise, which would race through every
// later threshold; this keeps the mid and late game long while the opening is untouched.
export const GRAVITY_AT = 1e15;
export const GRAVITY_POWER = 0.6;
export const gravity = (r) => (r <= GRAVITY_AT ? r : GRAVITY_AT * (r / GRAVITY_AT) ** GRAVITY_POWER);

/** Production before softcap, for display ("raw" vs effective). */
export function rawRate(s) {
  const gm = globalMultiplier(s);
  let r = 0;
  for (let i = 0; i < PRODUCERS.length; i++) if (s.prod[i]) r += producerRate(s, i, gm);
  return r;
}

export const baseRate = (s) => gravity(rawRate(s));

function buffMult(s, kind, now) {
  let m = 1;
  for (const b of s.buffs) if (b.kind === kind && b.until > now) m *= b.mult;
  return m;
}

// Momentum: clicking INSERT builds "hands on keyboard" (0..1), which decays with a 3s
// half-life and multiplies production by up to 1 + momentumCap.
const MOMENTUM_DECAY = Math.LN2 / 3;
const MOMENTUM_PER_CLICK = 0.04;
export const momentumCap = (s) => 0.25 + 0.25 * radarLevel(s, "devex");
export const momentumMult = (s) => 1 + momentumCap(s) * s.momentum;
export const addMomentum = (s) => (s.momentum = Math.min(1, s.momentum + MOMENTUM_PER_CLICK));

export const rate = (s, now = Date.now()) => baseRate(s) * buffMult(s, "prod", now) * momentumMult(s);

export function clickValue(s, now = Date.now()) {
  if (rule(s).noClick) return 0;
  let mult = 2 ** radarLevel(s, "pairing") * (archOn(s, "featurestore") ? 10 : 1);
  let pct = archOn(s, "zeroetl") ? 0.05 : 0;
  for (const id of s.upg) {
    const u = UPGRADE_BY_ID[id];
    if (u.kind !== "click") continue;
    if (u.eff.mult) mult *= u.eff.mult;
    if (u.eff.pct) pct += u.eff.pct;
  }
  return (mult + pct * rate(s, now)) * buffMult(s, "click", now);
}

export const incidentMult = (s) => (1 + 0.25 * radarLevel(s, "chaos")) * (won(s, "friday") ? 2 : 1);
/** Average seconds between incidents. */
export const incidentEvery = (s) => (105 / (archOn(s, "observability") ? 2 : 1) / (won(s, "friday") ? 2 : 1)) / (1 + 0.1 * radarLevel(s, "tribal"));
export const backfillCap = (s) => (archOn(s, "eventsourcing") ? 0.4 : 0.15);
export const incidentsFor = (s) => INCIDENTS.filter((x) => !x.needs || x.needs(s));

export function upgradeUnlocked(s, u) {
  if (u.need.producer !== undefined) return s.prod[u.need.producer] >= u.need.count;
  return s.runRows >= u.need.rows;
}

export const offlineCapSecs = (s) => (2 + radarLevel(s, "disks")) * 3600;
/** Seconds of production credited for `secs` away: full speed for the first minute, then TUNING.offlineRate. */
export const offlineCredit = (secs) => Math.min(secs, 60) + Math.max(0, secs - 60) * TUNING.offlineRate;

const MULT_CAP = 1e200;

// Past this the universe overflows (doubles end near 1.8e308): Big Bang is the way out.
const ROW_CAP = 1e300;

export function earn(s, amount) {
  if (!(amount > 0)) return;
  amount = Math.min(amount, Math.max(0, ROW_CAP - s.allRows));
  s.rows += amount;
  s.runRows += amount;
  s.coRows += amount;
  s.civRows += amount;
  s.allRows += amount;
  s.everRows = Math.min(ROW_CAP, s.everRows + amount);
  if (s.prod[FINAL_PRODUCER] > 0) s.finale = true;
}

/** Advances the simulation; returns rows earned. Buffs expire mid-step, so integrate piecewise. */
export function tick(s, now) {
  const from = s.lastTick;
  if (now <= from) return 0;
  const cuts = [...new Set(s.buffs.map((b) => b.until).filter((t) => t > from && t < now))].sort((a, b) => a - b);
  let t = from;
  let gained = 0;
  const base = baseRate(s);
  const cap = momentumCap(s);
  for (const end of [...cuts, now]) {
    // ∫ (1 + cap·m·e^(−λx)) dx over the segment, then decay m to the segment's end.
    const secs = (end - t) / 1000;
    const decay = Math.exp(-MOMENTUM_DECAY * secs);
    gained += base * buffMult(s, "prod", t) * (secs + (cap * s.momentum * (1 - decay)) / MOMENTUM_DECAY);
    s.momentum *= decay;
    t = end;
  }
  earn(s, gained);
  s.buffs = s.buffs.filter((b) => b.until > now);
  s.lastTick = now;
  return gained;
}

// ---- purchases ---------------------------------------------------------------

export function buyProducer(s, i, n) {
  if (n <= 0 || !producerUnlocked(s, i)) return false;
  const c = producerCost(s, i, n);
  if (c > s.rows) return false;
  s.rows -= c;
  s.prod[i] += n;
  return true;
}

// Selling: half the price of the units sold back. Free units (Golden Images, retention
// rewards) can't be sold, so a refund never exceeds what the run actually spent; that keeps
// implausible()'s "spent more than earned" and "bank exceeds run total" checks valid.
export const SELL_REFUND = 0.5;
const freeUnits = (s, i) => Math.max(starterProducers(s)[i], s.kept.prod[i] ?? 0);
export const sellable = (s, i) => Math.max(0, s.prod[i] - freeUnits(s, i));
/** Rows back for selling the last n units of producer i. */
export function sellValue(s, i, n = 1) {
  n = Math.min(n, sellable(s, i));
  if (n <= 0) return 0;
  return SELL_REFUND * producerCost({ ...s, prod: s.prod.map((c, k) => (k === i ? c - n : c)) }, i, n);
}

export function sellProducer(s, i, n) {
  n = Math.min(n, sellable(s, i));
  if (n <= 0) return false;
  s.rows += sellValue(s, i, n);
  s.prod[i] -= n;
  s.stats.sold += n;
  s.stats.bestSell = Math.max(s.stats.bestSell, n);
  return true;
}

export function buyUpgrade(s, id) {
  if (rule(s).noUpgrades) return false;
  const u = UPGRADE_BY_ID[id];
  if (!u || has(s.upg, id) || !upgradeUnlocked(s, u) || s.rows < u.cost) return false;
  s.rows -= u.cost;
  s.upg.push(id);
  s.stats.upgBought++;
  return true;
}

export function buyColumn(s) {
  if (rule(s).noColumns) return false;
  const c = columnCost(s.cols, s);
  if (s.rows < c) return false;
  s.rows -= c;
  s.cols += 1;
  s.stats.colsBought++;
  return true;
}

export function buyArch(s, id) {
  const a = ARCH_BY_ID[id];
  if (!a || has(s.arch, id) || s.ins - s.insSpent < a.cost) return false;
  s.insSpent += a.cost;
  s.arch.push(id);
  return true;
}

// Levelled shops share one shape: [defs, levels key, currency key, spent key].
export const SHOPS = {
  radar: [RADAR_BY_ID, "radar", "ins", "insSpent"],
  board: [BOARD_BY_ID, "board", "eq", "eqSpent"],
  xeno: [XENOTECH_BY_ID, "xeno_tech", "xeno", "xenoSpent"],
};

export function buyLevel(s, shop, id) {
  const [defs, key, cur, spent] = SHOPS[shop];
  const d = defs[id];
  const l = s[key][id] ?? 0;
  if (!d || l >= d.max) return false;
  const c = levelCost(d, l);
  if (s[cur] - s[spent] < c) return false;
  s[spent] += c;
  s[key][id] = l + 1;
  return true;
}

// Axiom milestones: Big Bang automation and permanence, by Axioms owned.
export const AXIOM_MILESTONES = [
  { at: 1, id: "xenobot", text: "Xenotech buys itself, cheapest first (toggle in Settings → Game)." },
  { at: 10, id: "boardstays", text: "The Board is never reset: not by First Contact, not by a Big Bang." },
];
export const axiomMilestone = (s, id) => s.axioms >= AXIOM_MILESTONES.find((m) => m.id === id).at && !layerOff(s, "bang");

/** Prestige auto-buyers (Radar Bot, Board Bot, Axiom milestone): cheapest first, per shop. */
export function autoBuyShops(s) {
  let bought = 0;
  const shop = (on, options) => {
    if (!on) return;
    for (let guard = 0; guard < 1000; guard++) {
      const opts = options().sort((a, b) => a.cost - b.cost);
      if (!opts.length || !opts[0].buy()) return;
      bought++;
    }
  };
  shop(boardLevel(s, "radarbot") && s.settings.autoRadar, () => [
    ...ARCH.filter((a) => !s.arch.includes(a.id)).map((a) => ({ cost: a.cost, buy: () => buyArch(s, a.id) })),
    ...RADAR.filter((r) => (s.radar[r.id] ?? 0) < r.max).map((r) => ({ cost: levelCost(r, s.radar[r.id] ?? 0), buy: () => buyLevel(s, "radar", r.id) })),
  ]);
  shop(xenoLevel(s, "boardbot") && s.settings.autoBoard, () =>
    BOARD.filter((b) => (s.board[b.id] ?? 0) < b.max).map((b) => ({ cost: levelCost(b, s.board[b.id] ?? 0), buy: () => buyLevel(s, "board", b.id) })),
  );
  shop(axiomMilestone(s, "xenobot") && s.settings.autoXeno, () =>
    XENOTECH.filter((x) => (s.xeno_tech[x.id] ?? 0) < x.max).map((x) => ({ cost: levelCost(x, s.xeno_tech[x.id] ?? 0), buy: () => buyLevel(s, "xeno", x.id) })),
  );
  return bought;
}

// ---- prestige ----------------------------------------------------------------

const axiomBoost = (s) => softcap(1.5 ** s.axioms, TUNING.axiomBoostCap, TUNING.multSoftPower);

const insightMult = (s) => (1 + 0.15 * radarLevel(s, "literacy")) * 2 ** boardLevel(s, "ir") * axiomBoost(s) * (won(s, "compliance") ? 3 : 1);
// The epsilon keeps exact powers exact: 1e6 ** (1 / 3) is 99.999…, not 100.
const insightsFor = (s) => Math.floor((Math.max(0, s.coRows) / INSIGHT_DIVISOR) ** TUNING.insightPower * insightMult(s) + 1e-9);
export const pendingInsights = (s) => Math.max(0, insightsFor(s) + s.insCarry - s.ins);
export const nextInsightAt = (s) => ((insightsFor(s) + 1) / insightMult(s)) ** (1 / TUNING.insightPower) * INSIGHT_DIVISOR;

const equityMult = (s) => 2 ** xenoLevel(s, "translator") * axiomBoost(s) * (won(s, "takeover") ? 3 : 1);
const equityFor = (s) => Math.floor(softcap((Math.max(0, s.civRows) / EQUITY_DIVISOR) ** TUNING.equityPower * equityMult(s), TUNING.equitySoftcap, TUNING.equitySoftPower) + 1e-9);
export const pendingEquity = (s) => Math.max(0, equityFor(s) + s.eqCarry - s.eq);
export const nextEquityAt = (s) => (unsoftcap(equityFor(s) + 1, TUNING.equitySoftcap, TUNING.equitySoftPower) / equityMult(s)) ** (1 / TUNING.equityPower) * EQUITY_DIVISOR;

const xenoMult = (s) => axiomBoost(s) * (won(s, "translation") ? 3 : 1);
const xenoFor = (s) => Math.floor((Math.max(0, s.allRows) / XENO_DIVISOR) ** 0.2 * xenoMult(s));
export const pendingXeno = (s) => (rndComplete(s) ? Math.max(0, xenoFor(s) - s.xeno) : 0);
export const nextXenoAt = (s) => ((xenoFor(s) + 1) / xenoMult(s)) ** 5 * XENO_DIVISOR;

/** The finale (owning Everything Is Data once) unlocks the Big Bang for the rest of the universe. */
export const canBigBang = (s) => !!s.finale || s.prod[FINAL_PRODUCER] > 0;
export const pendingAxioms = (s) => (canBigBang(s) ? axiomsFor(s.allRows) : 0);

/** Free sources at the start of a run: Golden Images gives 10 per level of the first sources. */
function starterProducers(s) {
  const l = radarLevel(s, "golden");
  // No-INSERT challenges hand you a starter kit, or the run could never earn a row.
  const kit = rule(s).starter ?? [];
  return PRODUCERS.map((_, k) => Math.max(k < l ? 10 * (l - k) : 0, kit[k] ?? 0));
}

function resetRun(s, now) {
  s.kept = { upg: [], cols: 0, prod: [] };
  s.chal = null;
  s.stats.runClicks = 0;
  s.rows = 0;
  s.runRows = 0;
  s.prod = starterProducers(s);
  s.upg = [];
  s.cols = 0;
  s.buffs = [];
  s.runStartedAt = now;
}

function resetCompany(s, now, { keepArch = false, keepRadar = false } = {}) {
  s.coRows = 0;
  s.insCarry = won(s, "keepins") ? Math.floor(s.ins * 0.1) : 0;
  s.ins = s.insCarry;
  s.insSpent = 0;
  const perma = !!s.xeno_tech.permaplatform;
  if (!keepArch && !perma && !boardLevel(s, "handcuffs")) s.arch = [];
  const keep = keepRadar || perma || won(s, "keepradar") ? 1 : 0.1 * boardLevel(s, "parachute");
  const radar = {};
  for (const [id, l] of Object.entries(s.radar)) if (Math.floor(l * keep) > 0) radar[id] = Math.floor(l * keep);
  s.radar = radar;
  // Kept architecture and radar are free in the new company.
  s.freeIns = { arch: [...s.arch], radar: { ...radar } };
  resetRun(s, now);
}

function resetCivilization(s, now, keepBoard = false) {
  s.civRows = 0;
  s.eqCarry = won(s, "keepeq") ? Math.floor(s.eq * 0.1) : 0;
  s.eq = s.eqCarry;
  s.eqSpent = 0;
  const board = keepBoard || xenoLevel(s, "probes") > 0 || axiomMilestone(s, "boardstays");
  if (!board) s.board = {};
  s.eqFree = board ? spentOnEquity(s) : 0;
  // Seed Vault or Permanent Platform keeps architecture and radar; resetCompany marks them free.
  const vault = won(s, "keepcontact") || !!s.xeno_tech.permaplatform;
  if (!vault) {
    s.arch = [];
    s.radar = {};
  }
  resetCompany(s, now, { keepArch: vault, keepRadar: vault });
}

export function replatform(s, now = Date.now()) {
  const gain = pendingInsights(s);
  if (gain < 1) return 0;
  const took = now - s.runStartedAt;
  if (took > 0 && (!s.stats.fastestReplat || took < s.stats.fastestReplat)) s.stats.fastestReplat = took;
  s.ins += gain;
  s.replat += 1;
  // Retention rewards: what survives the rewrite, and is free in the next run.
  const keepUpg = won(s, "keepupg") ? [...s.upg] : [];
  const keepCols = won(s, "keepcols") ? s.cols : 0;
  const keepProd = won(s, "keepsrc") ? s.prod.map((c) => Math.floor(c * 0.1)) : [];
  resetRun(s, now);
  if (keepProd.length) s.prod = s.prod.map((c, i) => Math.max(c, keepProd[i]));
  s.upg = keepUpg;
  s.cols = keepCols;
  s.kept = { upg: keepUpg, cols: keepCols, prod: keepProd };
  return gain;
}

// Prestige gates: each layer needs completed challenges from the layer below, so challenges
// can't be skipped. Completions of a layer are dropped by the next prestige up unless an
// upgrade keeps them (Institutional Memory, Galactic Archive).
export const GATE_NEED = TUNING.gateNeed;
export const GATE_LAYER = { acq: "replat", contact: "acq", bang: "contact" };
export const gateHave = (s, layer) => s.chalDone.filter((k) => !k.includes("#") && CHALLENGE_BY_ID[k].layer === GATE_LAYER[layer]).length;
export const gateOpen = (s, layer) => !GATE_LAYER[layer] || gateHave(s, layer) >= TUNING.gateNeed;

function dropRewards(s, layers) {
  const dropped = (key) => layers.includes(parseTier(key).layer);
  s.chalDone = s.chalDone.filter((id) => !dropped(id));
  // Speedrun Records (Xenotech) keeps best times; otherwise they go with the completion.
  if (!s.xeno_tech.records) for (const id of Object.keys(s.chalBest)) if (dropped(id)) delete s.chalBest[id];
}

export function acquire(s, now = Date.now()) {
  const gain = pendingEquity(s);
  if (gain < 1 || !gateOpen(s, "acq")) return 0;
  const took = now - s.stats.companyStartedAt;
  if (took > 0 && (!s.stats.fastestAcq || took < s.stats.fastestAcq)) s.stats.fastestAcq = took;
  s.stats.companyStartedAt = now;
  if (!s.board.memory) dropRewards(s, ["replat"]);
  s.eq += gain;
  s.acq += 1;
  resetCompany(s, now);
  return gain;
}

export function firstContact(s, now = Date.now()) {
  const gain = pendingXeno(s);
  if (gain < 1 || !gateOpen(s, "contact")) return 0;
  dropRewards(s, [...(s.board.memory ? [] : ["replat"]), ...(s.xeno_tech.archive ? [] : ["acq"])]);
  s.stats.companyStartedAt = now;
  s.xeno += gain;
  s.contact += 1;
  resetCivilization(s, now);
  return gain;
}

export function bigBang(s, now = Date.now()) {
  const gain = pendingAxioms(s);
  if (gain < 1 || !gateOpen(s, "bang")) return 0;
  const keepXeno = won(s, "keepxeno");
  const keepBoard = won(s, "keepboard") || axiomMilestone(s, "boardstays");
  dropRewards(s, ["replat", "acq", "contact"]);
  s.stats.companyStartedAt = now;
  s.axioms += gain;
  s.bangs += 1;
  s.finale = false;
  s.allRows = 0;
  s.xeno = 0;
  s.xenoSpent = 0;
  if (!keepXeno) s.xeno_tech = {};
  s.xenoFree = keepXeno ? spentOnXeno(s) : 0;
  if (!keepBoard) s.board = {};
  resetCivilization(s, now, keepBoard);
  s.settings.env = undefined;
  s.settings.finaleSeen = false;
  return gain;
}

/** Starts a challenge: banks pending Insights like a re-platform, then a fresh run under its rule. */
export function startChallenge(s, id, now = Date.now(), tier = 1) {
  const c = CHALLENGE_BY_ID[id];
  // Completed ones can be replayed to beat your best time.
  if (!c || !tierUnlocked(s, c, tier)) return false;
  if (pendingInsights(s) >= 1) replatform(s, now);
  resetRun(s, now);
  s.chal = tierKey(c, tier);
  // Starter sources are granted with the challenge's rules in force: Golden Images is a
  // Tech Radar item (off in re-platform challenges), and locked tiers get none.
  s.prod = starterProducers(s).map((n, i) => (producerUnlocked(s, i) ? n : 0));
  return true;
}

export const abandonChallenge = (s) => (s.chal = null);

// Every challenge has the same hard time limit; running out fails it. Finishing early earns
// a speed bonus on top of the reward: production ×(2 − best/limit), so ×2 for an instant
// finish and ×1.5 at half the limit. Best times are kept per challenge (see dropRewards).
export const CHALLENGE_LIMIT_MS = 60 * 60e3;
export const challengeElapsed = (s, now = Date.now()) => Math.max(0, now - s.runStartedAt);
export const speedBonus = (s, key) => (s.chalBest[key] ? 2 - Math.min(1, s.chalBest[key] / CHALLENGE_LIMIT_MS) : 1);
/** Speed bonuses of every completion in effect, times TIER_REWARD per higher tier. */
const challengeMultiplier = (s) =>
  s.chalDone.reduce((m, key) => (won(s, key) ? m * speedBonus(s, key) * (key.includes("#") ? TIER_REWARD : 1) : m), 1);

/** Completes the active challenge if its goal is met: returns { challenge, ms, record }.
 *  Fails it once the time limit has passed: returns { challenge, failed: true }. */
export function checkChallenge(s, now = Date.now()) {
  const t = parseTier(s.chal);
  if (!t) return null;
  const { challenge: c, tier } = t;
  const key = s.chal;
  const ms = challengeElapsed(s, now);
  if (s.runRows < tierGoal(c, tier)) {
    if (ms <= CHALLENGE_LIMIT_MS) return null;
    s.chal = null;
    return { challenge: c, tier, key, failed: true };
  }
  s.chal = null;
  if (!s.chalDone.includes(key)) {
    s.chalDone.push(key);
    s.chalWins += 1;
  }
  if (!s.chalEver.includes(key)) s.chalEver.push(key);
  const record = !s.chalBest[key] || ms < s.chalBest[key];
  if (record) s.chalBest[key] = Math.max(1, ms);
  return { challenge: c, tier, key, ms, record };
}

/** Newly earned achievement ids (also records them on s). */
export function checkAchievements(s) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!has(s.ach, a.id) && a.test(s)) {
      s.ach.push(a.id);
      fresh.push(a);
    }
  }
  return fresh;
}

// ---- Server-side plausibility ----------------------------------------------
// A client-side game can always be edited, so the server cannot prove a save is honest.
// What it can do is reject saves that are impossible: spending more than was earned,
// prestige currency the formulas never grant, or more rows than the best possible rate
// allows in the time since the last accepted save.

const MAX_CLICKS_PER_SEC = 20;

/** Worst case: a frenzy, a lucky migration and an abduction stacking, plus backfills. */
// Worst case stacking: frenzy ×7, lucky migration ×3, Black Friday ×15, sprint ×2, an OKR or
// all-hands bonus ×3 on top of an OKR ×2, a stakeholder choice ×3, abductions ×77, plus backfills and momentum.
const maxBuff = (s) => 7 * 3 * 15 * 2 * 6 * 3 * (xenoLevel(s, "abductions") ? 77 : 1) * incidentMult(s) ** 3 * 1.5 * (1 + momentumCap(s));

function spentOnRun(s) {
  const starter = starterProducers(s);
  const free = starter.map((n, i) => Math.min(s.prod[i], Math.max(n, s.kept.prod[i] ?? 0)));
  const disc = costMultiplier(s);
  let spent = 0;
  PRODUCERS.forEach((p, i) => {
    if (s.prod[i] > free[i]) spent += (p.cost * disc * (COST_GROWTH ** s.prod[i] - COST_GROWTH ** free[i])) / (COST_GROWTH - 1);
  });
  for (const id of s.upg) if (!s.kept.upg.includes(id)) spent += UPGRADE_BY_ID[id].cost;
  const cols = (n) => ((COLUMN_BASE_COST * (COLUMN_GROWTH ** n - 1)) / (COLUMN_GROWTH - 1)) * columnDiscount(s);
  spent += cols(s.cols) - cols(Math.min(s.kept.cols, s.cols));
  return spent;
}

/** Insights spent on what the save owns, minus what an acquisition carried over for free. */
export function spentOnInsights(s) {
  const free = s.freeIns ?? { arch: [], radar: {} };
  let sum = 0;
  for (const id of s.arch) if (!free.arch?.includes(id)) sum += ARCH_BY_ID[id].cost;
  for (const r of RADAR) {
    const l = s.radar[r.id] ?? 0;
    const f = Math.min(l, Math.floor(Number(free.radar?.[r.id]) || 0));
    sum += levelsCost(r, l) - levelsCost(r, f);
  }
  return sum;
}

const spentOnEquity = (s) => BOARD.reduce((sum, b) => sum + levelsCost(b, s.board[b.id] ?? 0), 0);
const spentOnXeno = (s) => XENOTECH.reduce((sum, x) => sum + levelsCost(x, s.xeno_tech[x.id] ?? 0), 0);

/**
 * Checks `next` against the last accepted save. Returns null when plausible, else a reason.
 * `elapsedSecs` is measured by the server clock, never the client's.
 */
export function implausible(prev, next, elapsedSecs) {
  const eps = 1e-6;
  const tol = (x) => x * (1 + 1e-4) + 1;
  if (next.rows > tol(next.runRows)) return "bank exceeds run total";
  const nest = [next.runRows, next.coRows, next.civRows, next.allRows, next.everRows];
  if (nest.some((v, k) => k && nest[k - 1] > tol(v))) return "row totals do not nest";
  if (spentOnRun(next) > tol(next.runRows - next.rows)) return "spent more than earned";
  if (next.prod.some((c, i) => c > 0 && !producerUnlocked(next, i))) return "source not unlocked";
  if (next.ins > insightsFor(next) + next.insCarry) return "too many insights";
  if (spentOnInsights(next) > tol(next.insSpent) || next.insSpent > tol(next.ins)) return "insight spending does not add up";
  if (next.eq > equityFor(next) + next.eqCarry) return "too much equity";
  if (spentOnEquity(next) - next.eqFree > tol(next.eqSpent) || next.eqSpent > tol(next.eq)) return "equity spending does not add up";
  if (next.xeno > xenoFor(next)) return "too many xenobytes";
  if (spentOnXeno(next) - next.xenoFree > tol(next.xenoSpent) || next.xenoSpent > tol(next.xeno)) return "xenobyte spending does not add up";
  if (next.axioms > Math.log10(next.everRows + 1)) return "too many axioms";
  if (next.finale && !next.xeno_tech.contact) return "finale without contact";
  // First upload: measure against an empty save, over the time the caller allows.
  prev ??= newState(0);
  if (next.everRows + 1 < prev.everRows * (1 - eps)) return null; // older save; caller decides
  const best = Math.max(baseRate(prev) * maxBuff(prev), baseRate(next) * maxBuff(next));
  const clicks = MAX_CLICKS_PER_SEC * Math.max(clickValue({ ...prev, buffs: [] }), clickValue({ ...next, buffs: [] }));
  // ×100 on clicks: a traffic-spike incident (×50) during a full combo (×2), times Chaos Engineering.
  const allowed = (best + clicks * 100 * incidentMult(next)) * Math.max(elapsedSecs, 1) + 1e4;
  if (next.everRows - prev.everRows > allowed) return "rows grew faster than possible";
  return null;
}

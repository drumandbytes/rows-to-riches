// Leaderboard names: generated, never typed, so there's nothing to moderate. Three words
// (data adjective, plain adjective, animal) give ~1.2M names; the server accepts only
// combinations of these lists and keeps every name unique.

export const ADJECTIVES = [
  "Idempotent", "Eventually Consistent", "Denormalized", "Partitioned", "Sharded", "Nullable", "Immutable",
  "Columnar", "Vectorized", "Serverless", "Stateless", "Atomic", "Durable", "Isolated", "Lazy", "Eager",
  "Cached", "Indexed", "Compressed", "Deduplicated", "Late-Arriving", "Slowly Changing", "Orphaned",
  "Recursive", "Materialized", "Upserted", "Backfilled", "Throttled", "Async", "Batched", "Streaming",
  "Federated", "Replicated", "Snapshotted", "Vacuumed", "Unindexed", "Lossless", "Schemaless", "Orchestrated",
  "Containerized", "Normalized", "Hashed", "Salted", "Encrypted", "Versioned", "Tombstoned", "Soft-Deleted",
  "Append-Only", "Write-Ahead", "Read-Only", "Highly Available", "Fault-Tolerant", "Load-Balanced",
  "Autoscaled", "Rate-Limited", "Paginated", "Cursor-Based", "Zero-Copy", "Lock-Free", "Thread-Safe",
  "Deterministic", "Probabilistic", "Approximate", "Sampled", "Aggregated", "Pivoted", "Unpivoted",
  "Exploded", "Flattened", "Nested", "Typed", "Untyped", "Casted", "Coalesced", "Windowed", "Ranked",
  "Bucketed", "Clustered", "Z-Ordered", "Bloom-Filtered", "Checksummed", "Signed", "Committed", "Rolled-Back",
  "Merged", "Rebased", "Cherry-Picked", "Forked", "Deprecated", "Legacy", "Greenfield", "Bespoke",
  "Hand-Rolled", "Open-Source", "Self-Hosted", "Multi-Tenant", "Cross-Region", "Edge-Cached", "On-Call",
  "Paged", "Escalated", "Triaged", "Postmortemed", "Blameless", "Agile", "Synergized", "Data-Driven",
  "Event-Sourced", "Microservice", "Monolithic", "Quantum", "Interstellar",
];

// One word each: validName splits on the last two spaces.
export const MOODS = [
  "Grumpy", "Sleepy", "Cheerful", "Anxious", "Brave", "Curious", "Dapper", "Earnest", "Fluffy", "Gentle",
  "Hasty", "Jolly", "Keen", "Lucky", "Mellow", "Nimble", "Plucky", "Quiet", "Restless", "Sneaky",
  "Tidy", "Upbeat", "Valiant", "Witty", "Zealous", "Bashful", "Bouncy", "Clumsy", "Dizzy", "Fearless",
  "Fuzzy", "Giddy", "Humble", "Jumpy", "Loyal", "Moody", "Noisy", "Patient", "Proud", "Quirky",
  "Rowdy", "Shy", "Spooky", "Stubborn", "Thrifty", "Wobbly", "Zippy", "Amber", "Azure", "Beige",
  "Coral", "Crimson", "Emerald", "Golden", "Indigo", "Ivory", "Jade", "Lilac", "Magenta", "Maroon",
  "Mint", "Ochre", "Olive", "Plum", "Ruby", "Rusty", "Saffron", "Scarlet", "Silver", "Teal",
  "Violet", "Tiny", "Mighty", "Gigantic", "Pocket", "Midnight", "Sunny", "Stormy", "Frosty", "Misty",
  "Cosmic", "Velvet", "Electric", "Neon", "Retro", "Vintage", "Turbo", "Caffeinated", "Overworked", "Underpaid",
  "Remote", "Hybrid", "Offsite", "Promoted", "Reorged", "Onboarded", "Certified", "Senior", "Junior", "Principal",
];

export const NOUNS = [
  "Walrus", "Otter", "Capybara", "Pangolin", "Narwhal", "Axolotl", "Heron", "Badger", "Lemur", "Platypus",
  "Wombat", "Ibex", "Manatee", "Quokka", "Tapir", "Okapi", "Marmot", "Puffin", "Gecko", "Yak", "Llama",
  "Ferret", "Hedgehog", "Koala", "Meerkat", "Octopus", "Pelican", "Raccoon", "Salamander", "Toucan",
  "Vole", "Weasel", "Alpaca", "Beaver", "Chinchilla", "Dugong", "Elk", "Flamingo", "Gibbon", "Hamster",
  "Armadillo", "Bison", "Cassowary", "Dingo", "Echidna", "Fennec", "Gazelle", "Hornbill", "Iguana", "Jackal",
  "Kakapo", "Lynx", "Mongoose", "Newt", "Ocelot", "Penguin", "Quail", "Reindeer", "Sloth", "Tortoise",
  "Uakari", "Vulture", "Wolverine", "Xerus", "Zebu", "Aardvark", "Bandicoot", "Caracal", "Dormouse", "Eland",
  "Falcon", "Gopher", "Hyena", "Impala", "Jerboa", "Kiwi", "Loris", "Macaw", "Nightjar", "Opossum",
  "Porcupine", "Quetzal", "Roadrunner", "Seahorse", "Tarsier", "Urchin", "Viper", "Wallaby", "Yapok",
  "Zorilla", "Albatross", "Binturong", "Coati", "Dik-Dik", "Ermine", "Firefly", "Gharial", "Hippo",
  "Jellyfish", "Kinkajou", "Lobster", "Mantis", "Numbat", "Orca", "Pika", "Raven", "Stoat", "Tamarin",
  "Wren", "Yeti",
];

const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
export const randomName = (rnd = Math.random) => `${pick(ADJECTIVES, rnd)} ${pick(MOODS, rnd)} ${pick(NOUNS, rnd)}`;

export function validName(name) {
  if (typeof name !== "string" || name.length > 64) return false;
  const words = name.split(" ");
  const [mood, noun] = words.slice(-2);
  return MOODS.includes(mood) && NOUNS.includes(noun) && ADJECTIVES.includes(words.slice(0, -2).join(" "));
}

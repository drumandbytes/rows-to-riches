// Leaderboard names: generated, never typed, so there's nothing to moderate. The server
// accepts only combinations of these two lists.

export const ADJECTIVES = [
  "Idempotent", "Eventually Consistent", "Denormalized", "Partitioned", "Sharded", "Nullable", "Immutable",
  "Columnar", "Vectorized", "Serverless", "Stateless", "Atomic", "Durable", "Isolated", "Lazy", "Eager",
  "Cached", "Indexed", "Compressed", "Deduplicated", "Late-Arriving", "Slowly Changing", "Orphaned",
  "Recursive", "Materialized", "Upserted", "Backfilled", "Throttled", "Async", "Batched", "Streaming",
  "Federated", "Replicated", "Snapshotted", "Vacuumed", "Unindexed", "Lossless", "Schemaless", "Orchestrated",
  "Containerized",
];

export const NOUNS = [
  "Walrus", "Otter", "Capybara", "Pangolin", "Narwhal", "Axolotl", "Heron", "Badger", "Lemur", "Platypus",
  "Wombat", "Ibex", "Manatee", "Quokka", "Tapir", "Okapi", "Marmot", "Puffin", "Gecko", "Yak", "Llama",
  "Ferret", "Hedgehog", "Koala", "Meerkat", "Octopus", "Pelican", "Raccoon", "Salamander", "Toucan",
  "Vole", "Weasel", "Alpaca", "Beaver", "Chinchilla", "Dugong", "Elk", "Flamingo", "Gibbon", "Hamster",
];

export const randomName = (rnd = Math.random) => `${ADJECTIVES[Math.floor(rnd() * ADJECTIVES.length)]} ${NOUNS[Math.floor(rnd() * NOUNS.length)]}`;

export function validName(name) {
  if (typeof name !== "string") return false;
  const noun = NOUNS.find((n) => name.endsWith(` ${n}`));
  return !!noun && ADJECTIVES.includes(name.slice(0, -noun.length - 1));
}

// The "What's new" card: the changelog section of the running version. Loaded when it's first shown.

export function createWhatsNew({ esc, toast, modal }) {
  const RELEASE_INTROS = [
    (v) => `IT has deployed v${v}. Nobody was consulted.`,
    (v) => `v${v} is live. The change advisory board approved it retroactively.`,
    (v) => `A new release, v${v}, went out on a Friday afternoon. Here's what changed.`,
  ];

  /** The changelog section for one version, as plain bullet texts ([] if it isn't there). */
  async function releaseNotes(version) {
    try {
      const res = await fetch("/CHANGELOG.md", { cache: "no-store" });
      if (!res.ok) return [];
      const md = await res.text();
      const start = md.search(new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}\\]?`, "m"));
      if (start < 0) return [];
      const section = md.slice(start).split(/\n## /)[0];
      const notes = [...section.matchAll(/^\* (.+)$/gm)].map((m) => m[1].replace(/\s*\(\[[0-9a-f]{7}\]\([^)]*\)\)$/, "").replace(/\*\*/g, ""));
      // A PR whose title equals its branch commit's message is listed twice (merge commit + commit).
      return [...new Set(notes)];
    } catch {
      return []; // offline, or a local build without a changelog
    }
  }

  // A changelog line as HTML: escaped, with release-please's links to this repo's PRs made
  // clickable (any other link stays text).
  const noteHtml = (note) =>
    esc(note).replace(/\[([^\]]+)\]\((https:\/\/github\.com\/drumandbytes\/rows-to-riches\/)issues\/(\d+)\)/g, (_, label, repo, n) => `<a href="${repo}pull/${n}" target="_blank" rel="noopener">${label}</a>`);

  async function showWhatsNew(version, { quiet = false } = {}) {
    const notes = await releaseNotes(version);
    if (!notes.length) return quiet || toast("No release notes for this version yet.");
    const intro = RELEASE_INTROS[Math.floor(Math.random() * RELEASE_INTROS.length)](version);
    modal(`<h2>📰 What's new</h2><p class="muted">${esc(intro)}</p><ul class="whats-new">${notes.map((n) => `<li>${noteHtml(n)}</li>`).join("")}</ul>`, [["Nice", "primary"]]);
  }

  return { show: showWhatsNew };
}

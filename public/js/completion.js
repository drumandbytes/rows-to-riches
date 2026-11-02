// The finale: the Congratulations card and the Catalog Everything confirmation. Loaded when first needed.

export function createCompletion({ E, state, fmtDuration, confetti, audio, modal, toast, $, grantSecret, track, afterPurchase, selectTab }) {
  const COMPLETION_TEXTS = [
    (t) => `<p>The universe, all matter and antimatter, is now cataloged, modelled, and has a dashboard.</p><p>Nobody has opened the dashboard.</p><p><b>Time to insight: ${t}.</b> Leadership would like it in less next quarter.</p>`,
    (t) => `<p><b>Everything is data. Data is everything.</b></p><p>Every particle has a primary key. Dark matter turned out to be an unindexed table.</p><p>The board congratulates you and has scheduled a meeting to discuss what's next. The meeting has no agenda.</p><p><b>Completed in ${t}.</b></p>`,
    (t) => `<p>All matter and antimatter is now modelled, governed and visible on one dashboard. Your Snowfake bill for this quarter is the universe.</p><p><b>Completed in ${t}.</b> Share it, or keep going. Somewhere, a stakeholder already has a follow-up question.</p>`,
  ];

  function showCompletion(ms) {
    const t = fmtDuration(ms / 1000);
    const first = !state().completions;
    confetti(200);
    audio.sfx("prestige");
    const share = `I cataloged the entire universe in Rows to Riches${first ? ` in ${t}` : ""}. It has a dashboard now. https://rowstoriches.drumandbytes.dev/`;
    modal(
      `<h2>🎉 Congratulations</h2>${COMPLETION_TEXTS[Math.floor(Math.random() * COMPLETION_TEXTS.length)](t)}
       <p class="muted">${first ? "This was your first playthrough; that time is your record." : `Playthrough #${state().completions + 1}.`} You can <b>Catalog Everything</b> now to start a stronger New Game+, or keep playing: Big Bangs keep scaling (Prestige → Big Bang).</p>
       <div class="row-buttons"><button type="button" id="share-completion">📤 Share</button></div>`,
      [
        ["Keep playing", "", () => {
          grantSecret("keepplaying");
        }],
        ["Catalog Everything", "primary", confirmCatalog],
      ],
    );
    $("share-completion").onclick = async (e) => {
      try {
        if (navigator.share) await navigator.share({ title: "Rows to Riches", text: share });
        else {
          await navigator.clipboard.writeText(share);
          e.currentTarget.textContent = "✅ Copied";
        }
      } catch {
        /* cancelled */
      }
    };
  }

  function confirmCatalog() {
    modal(
      `<h2>🗂️ Catalog Everything?</h2><p>Everything resets: rows, sources, every prestige layer, Axioms and Big Bangs. You start over with New Game+: production ×${E.NG_PROD ** (state().completions + 1)} and prestige gains ×${(E.NG_GAIN ** (state().completions + 1)).toFixed(2)} for the whole playthrough.</p><p class="muted">Achievements, the Data Catalog, lifetime stats and your company name stay.</p>`,
      [["Cancel"], ["Catalog Everything", "primary", () => {
        if (!E.catalogEverything(state(), Date.now())) return;
        track("catalog", state());
        toast(`🗂️ <b>Everything cataloged.</b> New Game+ ${state().completions}. Back to one CSV on localhost.`);
        afterPurchase();
        selectTab("sources");
      }]],
    );
  }

  return { show: showCompletion, confirmCatalog };
}

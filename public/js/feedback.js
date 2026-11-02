// The feedback form (Settings → Help). Loaded the first time it's opened.

export function createFeedback({ E, state, version, prefs, modal, toast, esc, $ }) {
  function feedbackContext() {
    return {
      v: version,
      env: E.environmentFor(state()).id,
      device: matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop",
      notation: prefs.notation,
      replat: state().replat,
      acq: state().acq,
      contact: state().contact,
      bangs: state().bangs,
      log10Rows: Math.round(state().everRows.add(1).log10() * 10) / 10,
      playHours: Math.round((state().stats.onlineMs / 3.6e6) * 10) / 10,
    };
  }

  function open() {
    const ctx = feedbackContext();
    modal(
      `<h2>💬 Send feedback</h2>
       <div class="feedback">
         <label class="field">Type <select id="fb-category"><option value="bug">🐛 Bug</option><option value="idea">💡 Idea</option><option value="balance">⚖️ Balance</option><option value="other">💬 Other</option></select></label>
         <textarea id="fb-message" maxlength="2000" placeholder="What happened, what would make it better, or what made you laugh…"></textarea>
         <input type="email" id="fb-contact" placeholder="Email, if you'd like a reply (optional)" />
         <input type="text" id="fb-website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
         <p class="muted">Sent along: version ${esc(ctx.v)}, ${esc(ctx.env)}, ${esc(ctx.device)}, ${ctx.replat} re-platforms, ${ctx.acq} acquisitions, ~${ctx.playHours}h played. Nothing that identifies you unless you add an email.</p>
         <p class="muted" id="fb-status"></p>
       </div>`,
      [["Cancel"], ["Send", "primary"]],
    );
    // Dialog buttons submit (and close) by default; Send stays open until the server accepts.
    const send = [...document.querySelectorAll("#modal button")].find((b) => b.textContent === "Send");
    send.type = "button";
    send.addEventListener("click", () => sendFeedback(send));
    setTimeout(() => $("fb-message").focus());
  }

  async function sendFeedback(btn) {
    const message = $("fb-message").value.trim();
    if (message.length < 5) {
      $("fb-status").textContent = "Please write a little more.";
      return;
    }
    btn.disabled = true;
    $("fb-status").textContent = "Sending…";
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: $("fb-category").value, message, contact: $("fb-contact").value, website: $("fb-website").value, context: feedbackContext() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      $("modal").close();
      toast("💬 Thanks! Your feedback was sent. A ticket has been created and assigned to nobody.");
    } catch (err) {
      $("fb-status").textContent = err instanceof Error ? err.message : "Couldn't send. Are you offline?";
      btn.disabled = false;
    }
  }

  return { open };
}

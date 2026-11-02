// The first-run walkthrough: its steps. Loaded for fresh saves and when it's replayed.
import { createTour } from "./tour.js";

export function createWalkthrough({ $, state, selectTab, lb, setPref }) {
  const tabButton = (name) => document.querySelector(`.tabs button[data-tab="${name}"]`);
  return createTour(
    [
      { title: "Welcome to the data team", text: "You <i>are</i> the data team. Your job: rows. Lots of rows. This short tour shows the basics; you can replay it any time from Settings → Help.", next: "Show me around" },
      { title: "Press INSERT", text: "Every press adds rows. Press quickly to build a combo (Space works too). Try it a few times.", target: () => $("insert"), until: () => state().clicks >= 5 },
      {
        title: "Hire your first Data Source",
        text: "A Spreadsheet Intern types rows for you every second, even while the game is closed. Keep pressing INSERT until you can afford one, then buy it.",
        target: () => $("sources").querySelector("li[data-i]"),
        enter: () => selectTab("sources"),
        until: () => state().prod[0] >= 1,
      },
      { title: "Rows and rows per second", text: "Your bank, and how much your sources make per second. Buy more sources, and better ones, to grow it. ×10 and max buy in bulk; <b>sell</b> sells sources back for half.", target: () => document.querySelector(".counter") },
      { title: "Upgrades", text: "Owning more of a source unlocks upgrades: ×2 production, synergies between neighbouring sources, a stronger INSERT. A dot on the tab means you can afford one.", target: () => tabButton("upgrades") },
      { title: "Schema", text: "Columns multiply <i>everything</i>. They're expensive, and worth it.", target: () => tabButton("schema") },
      { title: "Prestige", text: "Growth eventually slows. Then you re-platform: start over with Insights that make everything faster. There are four layers of this, and it gets weird.", target: () => tabButton("prestige") },
      { title: "Inbox and incidents", text: "Vendors email you here. Alerts also pop up on screen: click them for bonuses. Except phishing tests. Never click those.", target: () => $("inbox-btn") },
      {
        // Getters: whether the server has leaderboards is only known once lb.init() answers.
        get title() {
          return lb.available ? "Leaderboards" : "Stats";
        },
        get text() {
          return lb.available
            ? `Want to compare? Join the leaderboards: fastest Catalog Everything, most rows, Big Bangs and Catalogs. You'd show up under a generated name, nothing else.<br><label class="toggle"><input type="checkbox" id="tour-lb" ${state().lb.optIn ? "checked" : ""}/> Join the leaderboards</label><span class="muted">Change your mind any time under Stats.</span>`
            : "Your stats and the Data Catalog live here. Every catalog entry is +1% production.";
        },
        target: () => tabButton("stats"),
      },
      { title: "That's it", text: "Name your company, change number formats, music and motion under Settings. Help explains every system in detail. Good luck out there.", target: () => tabButton("settings") },
    ],
    { onEnd: () => setPref("tourDone", true) },
  );
}

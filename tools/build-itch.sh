#!/usr/bin/env bash
# Builds rows-to-riches-itch.zip for itch.io's browser hosting: the game served from a subpath,
# so root-absolute asset paths become relative. /api/* calls (sync, leaderboards, feedback)
# have no server there, so tools/itch-shim.js fails them like an offline player's and the
# cloud-save, feedback, stats and install UI is hidden or reworded; the full site has them.
set -euo pipefail
cd "$(dirname "$0")/.."

site=https://rowstoriches.drumandbytes.dev
out=dist-itch
rm -rf "$out" rows-to-riches-itch.zip
mkdir "$out"
cp -R public/style.css public/js public/fonts public/icon.svg "$out/"

sed -E \
  -e '/rel="(manifest|apple-touch-icon)"|rel="icon" href="\/favicon.ico"|llms\.txt/d' \
  -e "s#(href|src)=\"/(how-to-play|privacy)/#\\1=\"$site/\\2/#g" \
  -e 's#(href|src)="/#\1="./#g' \
  -e 's#<h3>Cloud save</h3>#<h3 hidden>Cloud save</h3>#' \
  -e 's#<div id="cloud"></div>#<div id="cloud" hidden></div>#' \
  -e 's#(<button type="button" data-feedback="1")#\1 hidden#g' \
  -e 's#(<label class="toggle"><input type="checkbox" id="opt-stats" />)#<label class="toggle" hidden><input type="checkbox" id="opt-stats" />#' \
  -e 's#<p class="muted" id="stats-note">#<p class="muted" id="stats-note" hidden>#' \
  -e 's#<p>Progress lives in this browser\. To play on several devices.*</p></details>#<p>Progress lives in this browser. To move it to another device, use Settings → Save → Export save, then Import save there. Cloud saves with an account code are on the full site: <a href="'"$site"'/?ref=rows-to-riches-itch" target="_blank" rel="noopener noreferrer">rowstoriches.drumandbytes.dev</a>.</p></details>#' \
  -e 's#^( *)<p class="muted">No ads and no cookies\. Cloud save stores.*</p>$#\1<p class="muted">No ads, no cookies and no accounts. This itch.io version sends nothing anywhere: your save stays in this browser. Gameplay stats, cloud saves, leaderboards and notifications are only on the full site.</p>#' \
  -e 's#^( *)<p class="muted">Everything loads from this site, which runs on Cloudflare.*</p>$#\1<p class="muted">Everything is bundled in this page: no Google Fonts, CDNs or trackers.</p>#' \
  -e 's#Found a bug or have an idea\? Tell me\.#Found a bug or have an idea? Comment on this itch.io page.#' \
  public/index.html |
  awk 'FNR == NR { shim = shim $0 "\n"; next } /<summary>Install as an app<\/summary>/ { skip = 1 } skip { if (/<\/details>/) skip = 0; next } !privacy && /<h3>Privacy<\/h3>/ { sub(/<h3>/, "<h3 hidden>"); privacy = 1 } /<script type="module"/ { printf "    <script>\n%s    </script>\n", shim } { print }' tools/itch-shim.js - > "$out/index.html"
sed -i.bak -E 's#url\("/fonts#url("fonts#g' "$out/style.css" && rm "$out/style.css.bak"
# The game un-hides some of these itself (e.g. the Global Privacy Control note), so hide by CSS.
echo '#gpc-note, #stats-note, #lb, #push-wrap, #install-wrap { display: none !important; }' >> "$out/style.css"

(cd "$out" && zip -qr ../rows-to-riches-itch.zip .)
echo "rows-to-riches-itch.zip: $(du -h rows-to-riches-itch.zip | cut -f1)"

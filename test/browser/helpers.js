import { chromium, webkit } from "playwright-core";
import { serve } from "../../tools/serve.js";

/** Serves public/ on `port`, opens a browser, runs fn(browser, server) and always cleans up. ENGINE=webkit runs Safari's engine. */
export async function withBrowser(port, fn) {
  const server = await serve(port);
  const browser = process.env.ENGINE === "webkit" ? await webkit.launch() : await chromium.launch(process.env.CHROMIUM ? {} : { channel: "chrome" });
  try {
    return await fn(browser, server);
  } finally {
    await browser.close();
    server.close();
  }
}

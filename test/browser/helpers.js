import { chromium } from "playwright-core";
import { serve } from "../../tools/serve.js";

/** Serves public/ on `port`, opens a browser, runs fn(browser) and always cleans up. */
export async function withBrowser(port, fn) {
  const server = await serve(port);
  const browser = await chromium.launch(process.env.CHROMIUM ? {} : { channel: "chrome" });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
    server.close();
  }
}

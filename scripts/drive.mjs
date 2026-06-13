#!/usr/bin/env node
// Drive the running Calyflow dev app in headless Chromium and screenshot a page.
//
// This is the project-local stand-in for the generic `chromium-cli` helper: it
// launches Playwright's Chromium, handles single-workspace sign-in, navigates to
// a path, writes a screenshot, and reports any console errors.
//
// Usage:
//   node scripts/drive.mjs <path> [outfile]
//
//   <path>     route to open, e.g. /workflows  (default: /)
//   [outfile]  screenshot destination          (default: /tmp/calyflow-<slug>.png)
//
// Env:
//   BASE_URL   app origin                       (default: http://localhost:3000)
//   DRIVE_EMAIL  sign-in email; falls back to the first ADMIN_EMAILS entry in
//                .env.local. Only used when SINGLE_WORKSPACE=true (Clerk mode has
//                no headless login — start the server with SINGLE_WORKSPACE=true).
//   FULL_PAGE  "1" to capture the full scrollable page instead of the viewport.
//
// Prereqs: the dev server must already be running (see the run-app skill).

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

function envFromLocal(key) {
  try {
    const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const path = process.argv[2] || "/";
const slug = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
const outfile = process.argv[3] || `/tmp/calyflow-${slug}.png`;
const base = process.env.BASE_URL || "http://localhost:3000";
const singleWorkspace = envFromLocal("SINGLE_WORKSPACE") === "true";
const email =
  process.env.DRIVE_EMAIL || (envFromLocal("ADMIN_EMAILS") || "").split(",")[0].trim();

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 1100 } })
).newPage();

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  if (singleWorkspace) {
    if (!email) throw new Error("No DRIVE_EMAIL and no ADMIN_EMAILS in .env.local");
    await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', email);
    await page.click('button:has-text("Continue")');
    await page
      .waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 })
      .catch(() => {});
  }

  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: outfile, fullPage: process.env.FULL_PAGE === "1" });

  console.log(`final URL:  ${page.url()}`);
  console.log(`screenshot: ${outfile}`);
  console.log(`console errors: ${errors.length ? "\n - " + errors.slice(0, 10).join("\n - ") : "none"}`);
  if (page.url().includes("/sign-in") && path !== "/sign-in") {
    console.log("\nNOTE: landed on /sign-in — the page is protected and no session was established.");
    console.log("Start the dev server with SINGLE_WORKSPACE=true to drive protected pages headlessly.");
    process.exitCode = 2;
  }
} finally {
  await browser.close();
}

/**
 * Uploads the Sourcing Plan harness (the prompt/IP) to the private
 * `system-config` Storage bucket. Run once per environment — the harness is
 * deliberately NOT committed to the repo, so it lives in a file outside the git
 * tree (e.g. ./secrets/sourcing-plan-harness.md, which is .gitignored).
 *
 * Usage:
 *   node scripts/upload-harness.mjs ./secrets/sourcing-plan-harness.md
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local for
 * local runs, or the real environment in CI/prod).
 */
import { config } from "dotenv";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BUCKET = "system-config";
const OBJECT_KEY = "sourcing-plan/harness.md";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/upload-harness.mjs <path-to-harness.md>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

let body;
try {
  body = readFileSync(path);
} catch (err) {
  console.error(`Could not read ${path}:`, err.message);
  process.exit(1);
}
if (body.length === 0) {
  console.error(`${path} is empty — nothing to upload.`);
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// The bucket is created by migration 0026; create it here too so the script
// works against a fresh DB before migrations, idempotently.
await db.storage.createBucket(BUCKET, { public: false }).catch(() => {});

const { error } = await db.storage
  .from(BUCKET)
  .upload(OBJECT_KEY, body, { contentType: "text/markdown", upsert: true });
if (error) {
  console.error("Upload failed:", error.message);
  process.exit(1);
}

console.log(
  `Uploaded ${body.length} bytes → ${BUCKET}/${OBJECT_KEY}. ` +
    "The Sourcing Plan page will use it on the next generation.",
);

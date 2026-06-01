/**
 * Apply the prompt_cache.title migration via Supabase REST (requires service role).
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-title-migration.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or DATABASE_URL).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function applyViaSupabaseRpc(url, serviceKey, sql) {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.ok) return true;

  const body = await res.text();
  if (body.includes("Could not find the function") || body.includes("PGRST202")) {
    return false;
  }

  throw new Error(`Migration failed (${res.status}): ${body}`);
}

async function verifyColumn(url, publishableKey) {
  const res = await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/prompt_cache?select=title&limit=1`,
    {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
    }
  );

  if (res.ok) return true;

  const body = await res.text();
  if (body.includes("title") && body.includes("does not exist")) {
    return false;
  }

  throw new Error(`Verify failed (${res.status}): ${body}`);
}

async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const publishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  const sql = readFileSync(
    join(__dirname, "../supabase/migrations/20260525000000_add_prompt_cache_title.sql"),
    "utf8"
  ).trim();

  const exists = await verifyColumn(supabaseUrl, publishableKey);
  if (exists) {
    console.log("Column prompt_cache.title already exists.");
    return;
  }

  if (!serviceKey) {
    console.error(
      "Column missing. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and re-run,\n" +
        "or apply manually in Supabase SQL editor:\n\n" +
        sql
    );
    process.exit(1);
  }

  const applied = await applyViaSupabaseRpc(supabaseUrl, serviceKey, sql);
  if (!applied) {
    console.error(
      "Could not apply via RPC. Run this SQL in the Supabase SQL editor:\n\n" +
        sql
    );
    process.exit(1);
  }

  const verified = await verifyColumn(supabaseUrl, publishableKey);
  if (!verified) {
    throw new Error("Migration reported success but title column is still missing.");
  }

  console.log("Applied migration: prompt_cache.title");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

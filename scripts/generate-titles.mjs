/**
 * Generate titles for all untitled prompts in prompt_cache and store in Supabase.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-titles.mjs
 *   node --env-file=.env.local scripts/generate-titles.mjs --limit 50 --dry-run
 *   node --env-file=.env.local scripts/generate-titles.mjs --concurrency 20
 *
 * Requires: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

const OPENAI_BASE = "https://api.openai.com/v1";
const MODEL = "gpt-4o-mini";
const PROMPT_LIMIT = 600;
const PAGE_SIZE = 1000;
const DEFAULT_CONCURRENCY = 10;

// Keep in sync with lib/prompt-cache-title.ts TITLE_SYSTEM_PROMPT
const SYSTEM_PROMPT =
  "Generate a concise 5–10 word title describing what this prompt is about. " +
  "Write it as a noun phrase — do NOT start with a verb or gerund like 'Building', 'Creating', 'Setting up', 'Implementing', etc. " +
  "Describe what the output IS, not what is being done. " +
  "Return only the title — no quotes, no trailing punctuation.";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    concurrency: DEFAULT_CONCURRENCY,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg.startsWith("--concurrency=")) {
      options.concurrency = parseInt(arg.slice("--concurrency=".length), 10);
      continue;
    }

    if (arg === "--concurrency") {
      options.concurrency = parseInt(argv[i + 1] ?? "", 10);
      i += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.slice("--limit=".length), 10);
      continue;
    }

    if (arg === "--limit") {
      options.limit = parseInt(argv[i + 1] ?? "", 10);
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node --env-file=.env.local scripts/generate-titles.mjs [options]

Options:
  --dry-run            Generate titles but do not write to Supabase
  --concurrency N      Parallel OpenRouter calls (default: ${DEFAULT_CONCURRENCY})
  --limit N            Cap total rows processed (for testing)
  --force              Include rows that already have a title
  --help, -h           Show this help`);
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }

  if (options.limit != null && (!Number.isFinite(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }

  return options;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function supabaseHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function fetchUntitledPage(supabaseUrl, supabaseKey, { afterId, pageSize, force }) {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/prompt_cache`);
  url.searchParams.set("select", "id,owner,repo,prompt");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", String(pageSize));

  if (afterId != null) {
    url.searchParams.set("id", `gt.${afterId}`);
  }

  if (!force) {
    url.searchParams.set("title", "is.null");
  }

  const res = await fetch(url, {
    headers: supabaseHeaders(supabaseKey),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase fetch failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function generateTitle(openAiKey, promptText) {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 40,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: promptText.slice(0, PROMPT_LIMIT),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const title = json.choices?.[0]?.message?.content?.trim() ?? null;

  if (!title) {
    throw new Error("OpenRouter returned an empty title.");
  }

  return title;
}

async function updateTitle(supabaseUrl, serviceKey, id, title) {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/prompt_cache`);
  url.searchParams.set("id", `eq.${id}`);

  const res = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(serviceKey, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase update failed (${res.status}): ${body}`);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker()
  );

  await Promise.all(workers);
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = requireEnv("OPENAI_API_KEY");

  const summary = {
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  let afterId = null;
  let totalTarget = options.limit ?? null;

  console.log(
    `Generating titles with ${MODEL}` +
      (options.dryRun ? " (dry run)" : "") +
      (options.force ? " (force)" : "") +
      `, concurrency ${options.concurrency}…`
  );

  if (totalTarget != null) {
    console.log(`Processing up to ${totalTarget} row(s).\n`);
  } else {
    console.log("Processing all untitled rows.\n");
  }

  while (true) {
    const remaining =
      totalTarget != null ? Math.max(0, totalTarget - summary.processed) : PAGE_SIZE;
    if (totalTarget != null && remaining === 0) {
      break;
    }

    const pageSize =
      totalTarget != null ? Math.min(PAGE_SIZE, remaining) : PAGE_SIZE;

    const rows = await fetchUntitledPage(supabaseUrl, supabaseKey, {
      afterId,
      pageSize,
      force: options.force,
    });

    if (!rows.length) {
      break;
    }

    await mapWithConcurrency(rows, options.concurrency, async (row) => {
      const label = `${row.owner}/${row.repo} (#${row.id})`;

      try {
        const title = await generateTitle(openAiKey, row.prompt);

        if (options.dryRun) {
          summary.processed += 1;
          console.log(`[${summary.processed}/${totalTarget ?? "?"}] ${label} → "${title}" (dry run)`);
          return;
        }

        await updateTitle(supabaseUrl, serviceKey, row.id, title);
        summary.processed += 1;
        summary.updated += 1;
        console.log(`[${summary.processed}/${totalTarget ?? "?"}] ${label} → "${title}"`);
      } catch (err) {
        summary.processed += 1;
        summary.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${summary.processed}/${totalTarget ?? "?"}] ${label} FAILED: ${message}`);
      }
    });

    afterId = rows[rows.length - 1].id;

    if (rows.length < pageSize) {
      break;
    }
  }

  console.log("\nDone.");
  console.log(`  Processed: ${summary.processed}`);
  console.log(`  Updated:   ${summary.updated}`);
  console.log(`  Failed:    ${summary.failed}`);

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

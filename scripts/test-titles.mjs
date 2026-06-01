/**
 * Multi-model title generation comparison script.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-titles.mjs
 *   node --env-file=.env.local scripts/test-titles.mjs --limit 10
 *   node --env-file=.env.local scripts/test-titles.mjs --limit 10 --json
 *   node --env-file=.env.local scripts/test-titles.mjs --limit 10 --output title-test.json
 *
 * Requires: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OPENROUTER_API_KEY
 */

import { writeFileSync } from "node:fs";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const PROMPT_LIMIT = 600;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 50;

const SYSTEM_PROMPT =
  "Generate a concise 5–10 word title describing what this prompt is about in a non-technical, but short descriptive pharse of the to be output. " +
  "Return only the title — no quotes, no trailing punctuation.";

const MODELS = [
  { id: "openai/gpt-4o", label: "gpt-4o" },
  { id: "openai/gpt-4o-mini", label: "gpt-4o-mini" },
  { id: "anthropic/claude-haiku-4.5", label: "claude-haiku" },
  { id: "google/gemini-2.5-flash", label: "gemini-flash" },
];

function parseArgs(argv) {
  const options = {
    limit: DEFAULT_LIMIT,
    json: false,
    output: null,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--quiet") {
      options.quiet = true;
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

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      options.output = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node --env-file=.env.local scripts/test-titles.mjs [options]

Options:
  --limit N        Number of prompts to test (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})
  --json           Print JSON to stdout instead of the table
  --output, -o F   Write JSON results to a file
  --quiet          Suppress table/progress (useful with --output)
  --help, -h       Show this help`);
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  options.limit = Math.min(MAX_LIMIT, Math.max(1, options.limit));
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

function preview(text, max = 120) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max).trimEnd()}…`;
}

function padEnd(str, len) {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

async function fetchPrompts(supabaseUrl, supabaseKey, limit) {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/prompt_cache`);
  url.searchParams.set("select", "owner,repo,prompt,views");
  url.searchParams.set("order", "cached_at.desc");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase fetch failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function generateTitle(openRouterKey, model, promptText) {
  const started = Date.now();
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
      ...(process.env.OPENROUTER_HTTP_REFERER
        ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
        : {}),
      ...(process.env.OPENROUTER_APP_TITLE
        ? { "X-Title": process.env.OPENROUTER_APP_TITLE }
        : {}),
    },
    body: JSON.stringify({
      model,
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

  const elapsed = Date.now() - started;

  if (!res.ok) {
    const body = await res.text();
    return { title: null, error: `${res.status}: ${body.slice(0, 120)}`, elapsedMs: elapsed };
  }

  const json = await res.json();
  const title = json.choices?.[0]?.message?.content?.trim() ?? null;
  return {
    title,
    error: title ? null : "empty response",
    elapsedMs: elapsed,
  };
}

function printTable(promptResults) {
  for (const entry of promptResults) {
    const header = `${entry.owner} / ${entry.repo}`;
    console.log(`━━━ ${header} ${"━".repeat(Math.max(0, 60 - header.length))}`);
    console.log(`Prompt preview: "${entry.promptPreview}"`);
    console.log(`Views: ${entry.views}\n`);

    const labelWidth = Math.max(
      ...entry.models.map((result) => result.label.length),
      12
    );

    for (const result of entry.models) {
      const display = result.error ? `[ERROR] ${result.error}` : result.title;
      console.log(
        `  ${padEnd(result.label, labelWidth)} →  ${display}  (${result.elapsedMs}ms)`
      );
    }
    console.log("");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");
  const openRouterKey = requireEnv("OPENROUTER_API_KEY");

  if (!options.quiet && !options.json) {
    console.log(`Fetching ${options.limit} prompts…\n`);
  }

  const prompts = await fetchPrompts(supabaseUrl, supabaseKey, options.limit);

  if (!prompts.length) {
    console.error("No prompts found in prompt_cache.");
    process.exit(1);
  }

  const promptResults = [];

  for (const row of prompts) {
    const modelResults = await Promise.all(
      MODELS.map(async ({ id, label }) => {
        const result = await generateTitle(openRouterKey, id, row.prompt);
        return {
          model: id,
          label,
          title: result.title,
          error: result.error,
          elapsedMs: result.elapsedMs,
        };
      })
    );

    promptResults.push({
      owner: row.owner,
      repo: row.repo,
      views: row.views ?? 0,
      promptPreview: preview(row.prompt),
      promptExcerpt: row.prompt.slice(0, PROMPT_LIMIT),
      models: modelResults,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    limit: options.limit,
    systemPrompt: SYSTEM_PROMPT,
    models: MODELS.map(({ id, label }) => ({ id, label })),
    results: promptResults,
  };

  if (options.output) {
    writeFileSync(options.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    if (!options.quiet && !options.json) {
      console.log(`Wrote ${options.output}\n`);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (!options.quiet) {
    printTable(promptResults);
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

import type { SupabaseClient } from "@supabase/supabase-js";

export const TITLE_MODEL = "gpt-4o-mini";
const OPENAI_BASE = "https://api.openai.com/v1";
const PROMPT_LIMIT = 600;

export const TITLE_SYSTEM_PROMPT =
  "Generate a concise 5–10 word title describing what this prompt is about. " +
  "Write it as a noun phrase — do NOT start with a verb or gerund like 'Building', 'Creating', 'Setting up', 'Implementing', etc. " +
  "Describe what the output IS, not what is being done. " +
  "Return only the title — no quotes, no trailing punctuation.";

export type TitleInput = {
  owner: string;
  repo: string;
  prompt: string;
};

type PromptRow = {
  id: number;
  owner: string;
  repo: string;
  prompt: string;
};

export function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

export function sanitizeTitle(raw: string): string {
  let title = raw.trim();
  title = title.replace(/^["'`]+|["'`]+$/g, "").trim();
  title = title.replace(/[.!?,:;]+$/g, "").trim();
  return title;
}

export async function generateTitle(prompt: string): Promise<string | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TITLE_MODEL,
      temperature: 0.3,
      max_tokens: 40,
      messages: [
        { role: "system", content: TITLE_SYSTEM_PROMPT },
        {
          role: "user",
          content: prompt.slice(0, PROMPT_LIMIT),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(
      "[prompt-cache-title] OpenRouter failed:",
      res.status,
      body.slice(0, 200)
    );
    return null;
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  const title = sanitizeTitle(raw);
  return title.length > 0 ? title : null;
}

export async function updatePromptTitle(
  supabase: SupabaseClient,
  input: TitleInput
): Promise<void> {
  const title = await generateTitle(input.prompt);
  if (!title) return;

  const { error } = await supabase
    .from("prompt_cache")
    .update({ title })
    .eq("owner", input.owner)
    .eq("repo", input.repo);

  if (error) {
    throw new Error(error.message);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function backfillPromptTitles(
  supabase: SupabaseClient,
  options: {
    concurrency?: number;
    maxRows?: number;
  } = {}
): Promise<{
  processed: number;
  remaining: number;
  done: boolean;
  titles: Array<{
    owner: string;
    repo: string;
    title: string | null;
  }>;
}> {
  const concurrency = options.concurrency ?? 5;
  const maxRows = options.maxRows ?? 50;

  const { count: remainingBefore, error: countError } = await supabase
    .from("prompt_cache")
    .select("id", { count: "exact", head: true })
    .is("title", null);

  if (countError) {
    throw new Error(countError.message);
  }

  const remainingStart = remainingBefore ?? 0;
  if (remainingStart === 0) {
    return { processed: 0, remaining: 0, done: true, titles: [] };
  }

  const { data: rows, error: fetchError } = await supabase
    .from("prompt_cache")
    .select("id, owner, repo, prompt")
    .is("title", null)
    .order("id", { ascending: true })
    .limit(maxRows);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const pending = (rows ?? []) as PromptRow[];
  if (pending.length === 0) {
    return { processed: 0, remaining: 0, done: true, titles: [] };
  }

  const titles = await mapWithConcurrency(pending, concurrency, async (row) => {
    let title: string | null = null;
    try {
      title = await generateTitle(row.prompt);
      if (title) {
        const { error: updateError } = await supabase
          .from("prompt_cache")
          .update({ title })
          .eq("id", row.id);

        if (updateError) {
          console.error(
            `[prompt-cache-title] update ${row.owner}/${row.repo}:`,
            updateError.message
          );
          title = null;
        }
      }
    } catch (error) {
      console.error(
        `[prompt-cache-title] generate ${row.owner}/${row.repo}:`,
        error instanceof Error ? error.message : error
      );
    }

    return { owner: row.owner, repo: row.repo, title };
  });

  const processed = titles.filter((entry) => entry.title).length;
  const remaining = Math.max(0, remainingStart - pending.length);

  return {
    processed,
    remaining,
    done: remaining === 0,
    titles,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  embedPromptEntry,
  embedTexts,
  embeddingText,
  type EmbeddingInput,
} from "@/lib/embeddings";

type PromptRow = {
  id: number;
  owner: string;
  repo: string;
  prompt: string;
};

export async function updatePromptEmbedding(
  supabase: SupabaseClient,
  input: EmbeddingInput
): Promise<void> {
  const embedding = await embedPromptEntry(input);
  const { error } = await supabase
    .from("prompt_cache")
    .update({ embedding })
    .eq("owner", input.owner)
    .eq("repo", input.repo);

  if (error) {
    throw new Error(error.message);
  }
}

export async function backfillPromptEmbeddings(
  supabase: SupabaseClient,
  options: {
    batchSize?: number;
    maxRows?: number;
    delayMs?: number;
  } = {}
): Promise<{
  processed: number;
  remaining: number;
  done: boolean;
}> {
  const batchSize = options.batchSize ?? 100;
  const maxRows = options.maxRows ?? 500;
  const delayMs = options.delayMs ?? 1500;

  const { count: remainingBefore, error: countError } = await supabase
    .from("prompt_cache")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  if (countError) {
    throw new Error(countError.message);
  }

  const remainingStart = remainingBefore ?? 0;
  if (remainingStart === 0) {
    return { processed: 0, remaining: 0, done: true };
  }

  const { data: rows, error: fetchError } = await supabase
    .from("prompt_cache")
    .select("id, owner, repo, prompt")
    .is("embedding", null)
    .order("id", { ascending: true })
    .limit(maxRows);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const pending = (rows ?? []) as PromptRow[];
  if (pending.length === 0) {
    return { processed: 0, remaining: 0, done: true };
  }

  let processed = 0;

  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize);
    const texts = chunk.map((row) =>
      embeddingText({
        owner: row.owner,
        repo: row.repo,
        prompt: row.prompt,
      })
    );

    const embeddings = await embedTexts(texts);

    for (let j = 0; j < chunk.length; j += 1) {
      const row = chunk[j];
      const embedding = embeddings[j];
      if (!row || !embedding) continue;

      const { error: updateError } = await supabase
        .from("prompt_cache")
        .update({ embedding })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
      processed += 1;
    }

    const hasMoreInChunk = i + batchSize < pending.length;
    if (hasMoreInChunk) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const remaining = Math.max(0, remainingStart - processed);
  return {
    processed,
    remaining,
    done: remaining === 0,
  };
}

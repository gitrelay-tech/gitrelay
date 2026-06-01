import { NextRequest, NextResponse } from "next/server";
import { embedText, getOpenAiApiKey } from "@/lib/embeddings";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 24;
const VIEW_BOOST = 0.4;
const TRENDING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type SortOption = "trending" | "newest" | "oldest";

type PromptEntry = {
  id: number;
  owner: string;
  repo: string;
  prompt: string;
  cached_at: string;
  views: number;
  title?: string | null;
  relevance_score?: number;
};

/** Whitespace-split tokens: AND across tokens; each token may match owner, repo, or prompt. */
function searchWords(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/u)
    .map((w) => w.trim())
    .filter(Boolean);
}

type FtsStrategy = "fts-plain" | "fts-or" | "ilike-and" | "ilike-or";

async function runFallbackSearch(
  search: string,
  sort: SortOption,
  from: number,
  limit: number
): Promise<{ data: PromptEntry[]; total: number; strategy: FtsStrategy | "browse" }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Database unavailable.");
  }

  const words = searchWords(search);

  const runQuery = (strategy?: FtsStrategy) => {
    let query = supabase
      .from("prompt_cache")
      .select("id, owner, repo, prompt, cached_at, views, title", {
        count: "exact",
      });

    if (words.length > 0 && strategy) {
      switch (strategy) {
        case "fts-plain":
          query = query.textSearch("search_vector", search, {
            type: "plain",
            config: "english",
          });
          break;
        case "fts-or":
          query = query.textSearch("search_vector", words.join(" OR "), {
            type: "websearch",
            config: "english",
          });
          break;
        case "ilike-and":
          for (const word of words) {
            query = query.or(
              `owner.ilike.%${word}%,repo.ilike.%${word}%,prompt.ilike.%${word}%`
            );
          }
          break;
        case "ilike-or": {
          const clauses = words.flatMap((w) => [
            `owner.ilike.%${w}%`,
            `repo.ilike.%${w}%`,
            `prompt.ilike.%${w}%`,
          ]);
          query = query.or(clauses.join(","));
          break;
        }
      }
    }

    switch (sort) {
      case "oldest":
        query = query.order("cached_at", { ascending: true });
        break;
      case "newest":
        query = query.order("cached_at", { ascending: false });
        break;
      case "trending":
      default:
        query = query
          .gte(
            "cached_at",
            new Date(Date.now() - TRENDING_WINDOW_MS).toISOString()
          )
          .order("views", { ascending: false })
          .order("cached_at", { ascending: false });
        break;
    }

    if (words.length > 0) {
      query = query.order("views", { ascending: false });
    }

    return query.range(from, from + limit - 1);
  };

  let strategy: FtsStrategy = words.length > 0 ? "fts-plain" : "fts-plain";
  let res = await runQuery(words.length > 0 ? "fts-plain" : undefined);

  if (res.error) {
    throw new Error(res.error.message);
  }

  if ((res.count ?? 0) === 0 && words.length > 1) {
    strategy = "fts-or";
    res = await runQuery("fts-or");
    if (res.error) {
      throw new Error(res.error.message);
    }
  }

  if ((res.count ?? 0) === 0 && words.length > 0) {
    strategy = "ilike-and";
    res = await runQuery("ilike-and");
    if (res.error) {
      throw new Error(res.error.message);
    }
  }

  if ((res.count ?? 0) === 0 && words.length > 1) {
    strategy = "ilike-or";
    res = await runQuery("ilike-or");
    if (res.error) {
      throw new Error(res.error.message);
    }
  }

  return {
    data: (res.data ?? []) as PromptEntry[],
    total: res.count ?? 0,
    strategy: words.length > 0 ? strategy : "browse",
  };
}

async function runHybridSearch(
  search: string,
  page: number,
  limit: number
): Promise<{ data: PromptEntry[]; total: number; strategy: "hybrid" }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Database unavailable.");
  }

  const queryEmbed = await embedText(search);
  const offset = page * limit;

  const [searchRes, countRes] = await Promise.all([
    supabase.rpc("hybrid_search", {
      query_text: search,
      query_embed: queryEmbed,
      match_count: limit,
      result_offset: offset,
    }),
    supabase.rpc("hybrid_search_count", {
      query_text: search,
      query_embed: queryEmbed,
    }),
  ]);

  if (searchRes.error) {
    throw new Error(searchRes.error.message);
  }
  if (countRes.error) {
    throw new Error(countRes.error.message);
  }

  const rows = (searchRes.data ?? []) as PromptEntry[];

  const ids = rows.map((row) => row.id).filter(Boolean);
  let titleById = new Map<number, string | null>();
  if (ids.length > 0) {
    const { data: titleRows } = await supabase
      .from("prompt_cache")
      .select("id, title")
      .in("id", ids);
    titleById = new Map(
      (titleRows ?? []).map((row) => [row.id as number, row.title as string | null])
    );
  }

  const rowsWithTitles = rows.map((row) => ({
    ...row,
    title: titleById.get(row.id) ?? row.title ?? null,
  }));

  const boostedRows = rowsWithTitles.map((row) => ({
    ...row,
    relevance_score:
      (row.relevance_score ?? 0) *
      (1 + Math.log10((row.views ?? 0) + 1) * VIEW_BOOST),
  }));
  const maxScore = boostedRows.reduce(
    (max, row) => Math.max(max, row.relevance_score ?? 0),
    0
  );

  const data =
    maxScore > 0
      ? boostedRows.map((row) => ({
          ...row,
          relevance_score: (row.relevance_score ?? 0) / maxScore,
        }))
      : boostedRows;

  return {
    data,
    total: typeof countRes.data === "number" ? countRes.data : data.length,
    strategy: "hybrid",
  };
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search")?.trim() ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as SortOption;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? String(LIMIT), 10)));
  const from = page * limit;

  try {
    if (search) {
      if (getOpenAiApiKey()) {
        try {
          const hybrid = await runHybridSearch(search, page, limit);
          if (hybrid.total > 0 || hybrid.data.length > 0) {
            return NextResponse.json(hybrid);
          }
        } catch (hybridError) {
          console.error(
            "[library] hybrid search failed, falling back to FTS:",
            hybridError instanceof Error ? hybridError.message : hybridError
          );
        }
      }

      const fallback = await runFallbackSearch(search, sort, from, limit);
      return NextResponse.json({
        data: fallback.data,
        total: fallback.total,
        strategy: fallback.strategy,
      });
    }

    const browse = await runFallbackSearch("", sort, from, limit);
    return NextResponse.json({
      data: browse.data,
      total: browse.total,
      strategy: "browse" as const,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

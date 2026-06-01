import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  GITREVERSE_HISTORY_MAX,
  type HistoryEntry,
  historySlotOf,
  isHistoryEntry,
} from "@/lib/user-history";

export const runtime = "nodejs";

async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      ),
    };
  }

  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    return {
      error: NextResponse.json(
        {
          error: "supabase_not_configured",
          message: "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing",
        },
        { status: 503 }
      ),
    };
  }

  const supabaseAuth = createClient(url, publishableKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(token);

  if (userError || !user?.id) {
    return {
      error: NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      ),
    };
  }

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { user, userClient };
}

function rowToEntry(row: {
  owner: string;
  repo: string;
  history_slot: string;
  visited_at: string;
  prompt_preview: string | null;
  last_generation_type: string | null;
  last_manual_focus: string | null;
}): HistoryEntry {
  const entry: HistoryEntry = {
    owner: row.owner,
    repo: row.repo,
    historySlot: row.history_slot,
    visitedAt: row.visited_at,
  };
  if (row.prompt_preview) entry.promptPreview = row.prompt_preview;
  if (
    row.last_generation_type === "quick" ||
    row.last_generation_type === "deep" ||
    row.last_generation_type === "manual"
  ) {
    entry.lastGenerationType = row.last_generation_type;
  }
  if (row.last_manual_focus) entry.lastManualFocus = row.last_manual_focus;
  return entry;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUser(req);
  if ("error" in auth && auth.error) return auth.error;
  const { user, userClient } = auth;

  const { data, error } = await userClient
    .from("user_prompt_history")
    .select(
      "owner, repo, history_slot, visited_at, prompt_preview, last_generation_type, last_manual_focus"
    )
    .eq("user_id", user.id)
    .order("visited_at", { ascending: false })
    .limit(GITREVERSE_HISTORY_MAX);

  if (error) {
    console.error("[user-history] GET:", error.message);
    return NextResponse.json(
      { error: "Failed to load history" },
      { status: 500 }
    );
  }

  const entries = (data ?? []).map(rowToEntry);
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUser(req);
  if ("error" in auth && auth.error) return auth.error;
  const { user, userClient } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isHistoryEntry(body)) {
    return NextResponse.json({ error: "Invalid history entry" }, { status: 400 });
  }

  const entry = body as HistoryEntry;
  const owner = entry.owner.trim();
  const repo = entry.repo.trim();
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo required" }, { status: 400 });
  }

  const slot = historySlotOf(entry);
  const visitedAt = entry.visitedAt?.trim() || new Date().toISOString();

  const { error } = await userClient.from("user_prompt_history").upsert(
    {
      user_id: user.id,
      owner,
      repo,
      history_slot: slot,
      prompt_preview: entry.promptPreview?.trim() || null,
      last_generation_type: entry.lastGenerationType ?? null,
      last_manual_focus: entry.lastManualFocus?.trim() || null,
      visited_at: visitedAt,
    },
    { onConflict: "user_id,owner,repo,history_slot" }
  );

  if (error) {
    console.error("[user-history] POST:", error.message);
    return NextResponse.json(
      { error: "Failed to save history" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
